"""Migration c3d4e5f6g7h8 : nettoyage complet des noms d'offres (MED-22).

`b2c3d4e5f6g7` est déjà appliquée en prod (révision relevée le 2026-10-05) mais ne traitait
que "Tarif Bleu" et "Tempo" : 1060 offres actives sur 1091 gardaient "- N kVA". Le
nettoyage complet vit donc dans une NOUVELLE migration, testée ici sur un Postgres jetable
lancé avec les binaires locaux (initdb / pg_ctl). Les noms viennent des motifs relevés en prod.
"""
import importlib.util
import os
import shutil
import socket
import subprocess
import tempfile
from datetime import UTC, datetime
from pathlib import Path

import pytest
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.operations import Operations
from alembic.script import ScriptDirectory
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

API_DIR = Path(__file__).resolve().parents[2]
VERSIONS = API_DIR / "alembic" / "versions"
REVISION = "c3d4e5f6g7h8"


def _pg_bin(name: str) -> str | None:
    for candidate in (shutil.which(name), f"/opt/homebrew/opt/postgresql@14/bin/{name}"):
        if candidate and os.path.exists(candidate):
            return candidate
    return None


def _load_migration():
    path = next(VERSIONS.glob("*_clean_offer_names_v2.py"), None)
    assert path is not None, "migration *_clean_offer_names_v2.py absente"
    spec = importlib.util.spec_from_file_location("clean_offer_names_v2", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_revision_chainee_apres_b2c3():
    module = _load_migration()
    assert module.revision == REVISION
    assert module.down_revision == "b2c3d4e5f6g7"


def test_tete_alembic_unique():
    script = ScriptDirectory.from_config(Config(str(API_DIR / "alembic.ini")))
    assert script.get_heads() == [REVISION]


@pytest.fixture(scope="module")
def pg_url(tmp_path_factory):
    initdb, pg_ctl = _pg_bin("initdb"), _pg_bin("pg_ctl")
    if not (initdb and pg_ctl):
        pytest.skip("binaires PostgreSQL (initdb, pg_ctl) absents")
    data = tmp_path_factory.mktemp("pgdata")
    # chemin court : un socket Unix est limité à ~103 caractères sur macOS
    sock = Path(tempfile.mkdtemp(prefix="pg", dir="/tmp"))
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
    subprocess.run([initdb, "-D", str(data), "-U", "postgres", "-A", "trust", "-E", "UTF8"],
                   check=True, capture_output=True)
    try:
        subprocess.run([pg_ctl, "-D", str(data), "-w", "-l", str(data / "log"), "-o",
                        f"-p {port} -k {sock} -c listen_addresses=127.0.0.1", "start"],
                       check=True, capture_output=True)
        yield f"postgresql+asyncpg://postgres@127.0.0.1:{port}/postgres"
    finally:
        subprocess.run([pg_ctl, "-D", str(data), "-m", "immediate", "stop"], capture_output=True)
        shutil.rmtree(sock, ignore_errors=True)


# (nom en base, offer_type, nom attendu)
CAS = [
    ("Classique - 6 kVA", "BASE", "Classique"),
    ("Week-end - 6 kVA", "HC_NUIT_WEEKEND", "Week-end"),
    ("Électricité Prix ECO -5% - 6 kVA", "BASE", "Électricité Prix ECO -5%"),
    ("Électricité verte 100% locale - 6 kVA", "BASE", "Électricité verte 100% locale"),
    ("FlexiWatt 2 saisons + Pointe Mobile - 6 kVA", "SEASONAL", "FlexiWatt 2 saisons + Pointe Mobile"),
    ("Fixe - 6 kVA", "BASE", "Fixe"),
    ("EJP - 6 kVA", "EJP", "EJP"),
    ("Tarif Bleu - BASE 6 kVA", "BASE", "Tarif Bleu"),
    ("Tarif Bleu - HC/HP 6 kVA", "HC_HP", "Tarif Bleu"),
    ("Zen Fixe - Option Base - 6 kVA", "BASE", "Zen Fixe"),
    ("Zen Online - Option Heures Creuses - 6 kVA", "HC_HP", "Zen Online"),
    ("Zen Week-End - Option Week-End - 6 kVA", "BASE_WEEKEND", "Zen Week-End"),
    # "Option Flex" reste : l'export Home Assistant (MED-21) reconnaît Zen Flex servie en SEASONAL à ce nom
    ("Zen Week-End - Option Flex - 6 kVA", "SEASONAL", "Zen Week-End - Option Flex"),
    ("Zen Week-End - Option Heures Creuses + WE - 6 kVA", "HC_WEEKEND", "Zen Week-End"),
    ("Zen Week-End Plus - Option WE + jour choisi - 6 kVA", "BASE_WEEKEND", "Zen Week-End Plus"),
    ("Zen Week-End Plus - Option Heures Creuses + WE + jour choisi - 6 kVA", "HC_WEEKEND", "Zen Week-End Plus"),
    # formes produites par l'ancien scraper EDF (puissance sans tiret)
    ("Zen Week-End - Option Week-End 6 kVA", "BASE_WEEKEND", "Zen Week-End"),
    ("Zen Week-End - HC/HP + WE 6 kVA", "HC_WEEKEND", "Zen Week-End"),
    ("Zen Week-End - Option Flex 6 kVA", "ZEN_FLEX", "Zen Week-End - Option Flex"),
    # déjà propres : inchangés
    ("Tarif Bleu", "TEMPO", "Tarif Bleu"),
    ("Tempo", "TEMPO", "Tempo"),
    ("Octopus Go", "HC_HP", "Octopus Go"),
]

SCHEMA = """
CREATE TABLE energy_offers (
    id varchar(36) PRIMARY KEY,
    provider_id varchar(36) NOT NULL,
    name varchar(255) NOT NULL,
    offer_type varchar(50) NOT NULL,
    power_kva integer,
    is_active boolean NOT NULL DEFAULT true,
    valid_from timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
)
"""


async def _run(url, statements, migrate_times=1):
    module = _load_migration()

    def _upgrade(sync_conn):
        with Operations.context(MigrationContext.configure(sync_conn)):
            module.upgrade()

    engine = create_async_engine(url)
    try:
        async with engine.begin() as conn:
            await conn.execute(text("DROP TABLE IF EXISTS energy_offers"))
            await conn.execute(text(SCHEMA))
            for stmt, params in statements:
                await conn.execute(text(stmt), params)
            for _ in range(migrate_times):
                await conn.run_sync(_upgrade)
            rows = await conn.execute(text(
                "SELECT id, name, offer_type, power_kva, is_active FROM energy_offers ORDER BY id"))
            return rows.all()
    finally:
        await engine.dispose()


INSERT = ("INSERT INTO energy_offers (id, provider_id, name, offer_type, power_kva, valid_from) "
          "VALUES (:id, :p, :name, :t, :kva, :vf)")


def _cas_inserts():
    return [(INSERT, {"id": f"{i:03d}", "p": f"prov{i:03d}", "name": n, "t": t, "kva": 6, "vf": None})
            for i, (n, t, _) in enumerate(CAS)]


@pytest.mark.asyncio
async def test_noms_nettoyes(pg_url):
    rows = await _run(pg_url, _cas_inserts())
    obtenus = {r.id: r.name for r in rows}
    erreurs = [(n, obtenus[f"{i:03d}"], attendu) for i, (n, _, attendu) in enumerate(CAS)
               if obtenus[f"{i:03d}"] != attendu]
    assert erreurs == []


@pytest.mark.asyncio
async def test_idempotente(pg_url):
    une = await _run(pg_url, _cas_inserts(), migrate_times=1)
    deux = await _run(pg_url, _cas_inserts(), migrate_times=2)
    assert une == deux


@pytest.mark.asyncio
async def test_doublons_desactives_garde_le_plus_recent(pg_url):
    rows = await _run(pg_url, [
        (INSERT, {"id": "old", "p": "edf", "name": "Tarif Bleu", "t": "BASE", "kva": 9,
                  "vf": datetime(2025, 2, 1, tzinfo=UTC)}),
        (INSERT, {"id": "new", "p": "edf", "name": "Tarif Bleu - 9 kVA", "t": "BASE", "kva": 9,
                  "vf": datetime(2026, 2, 1, tzinfo=UTC)}),
        # même nom, autre puissance : ce n'est pas un doublon
        (INSERT, {"id": "p12", "p": "edf", "name": "Tarif Bleu - 12 kVA", "t": "BASE", "kva": 12,
                  "vf": datetime(2026, 2, 1, tzinfo=UTC)}),
    ])
    actives = {r.id for r in rows if r.is_active}
    assert actives == {"new", "p12"}
    assert {r.name for r in rows} == {"Tarif Bleu"}


@pytest.mark.asyncio
async def test_puissance_seulement_dans_le_nom_recopiee(pg_url):
    rows = await _run(pg_url, [
        (INSERT, {"id": "nul", "p": "ohm", "name": "Classique - 9 kVA", "t": "BASE", "kva": None, "vf": None}),
        (INSERT, {"id": "ok", "p": "ohm", "name": "Classique - 9 kVA", "t": "HC_HP", "kva": 12, "vf": None}),
    ])
    assert {(r.id, r.name, r.power_kva) for r in rows} == {("nul", "Classique", 9), ("ok", "Classique", 12)}
