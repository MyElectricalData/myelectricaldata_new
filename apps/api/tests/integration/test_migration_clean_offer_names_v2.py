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


@pytest.fixture(scope="module", params=["postgresql", "sqlite"])
def db_url(request, tmp_path_factory):
    """La migration tourne sur le serveur (PostgreSQL) et sur les clients locaux (SQLite par défaut)."""
    if request.param == "sqlite":
        yield f"sqlite+aiosqlite:///{tmp_path_factory.mktemp('sqlite') / 'client.db'}"
        return
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
    # clé de groupe du front (nom##période) envoyée comme nom, vue en prod le 2026-10-05
    ("Tarif Bleu##2026-02-06##active - 3 kVA", "HC_HP", "Tarif Bleu"),
    ("Tempo##2026-02-06##active - 24 kVA", "TEMPO", "Tempo"),
    ("Zen Fixe##2025-02-01##2025-12-31 - Option Base - 6 kVA", "BASE", "Zen Fixe"),
    # déjà propres : inchangés
    ("Tarif Bleu", "TEMPO", "Tarif Bleu"),
    ("Tempo", "TEMPO", "Tempo"),
    ("Octopus Go", "HC_HP", "Octopus Go"),
]

SCHEMA = [
    """
    CREATE TABLE energy_offers (
        id varchar(36) PRIMARY KEY,
        provider_id varchar(36) NOT NULL,
        name varchar(255) NOT NULL,
        offer_type varchar(50) NOT NULL,
        power_kva integer,
        is_active boolean NOT NULL DEFAULT true,
        valid_from timestamptz,
        valid_to timestamptz,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
    """,
    # tables qui référencent une offre (FK ON DELETE SET NULL en vrai)
    "CREATE TABLE pdls (id varchar(36) PRIMARY KEY, selected_offer_id varchar(36))",
    "CREATE TABLE offer_contributions (id varchar(36) PRIMARY KEY, existing_offer_id varchar(36), status varchar(50) NOT NULL)",
]


async def _run(url, statements, migrate_times=1, with_refs=False):
    module = _load_migration()

    def _upgrade(sync_conn):
        with Operations.context(MigrationContext.configure(sync_conn)):
            module.upgrade()

    engine = create_async_engine(url)
    try:
        async with engine.begin() as conn:
            for table in ("energy_offers", "pdls", "offer_contributions"):
                await conn.execute(text(f"DROP TABLE IF EXISTS {table}"))
            for ddl in SCHEMA:
                await conn.execute(text(ddl))
            for stmt, params in statements:
                await conn.execute(text(stmt), params)
            for _ in range(migrate_times):
                await conn.run_sync(_upgrade)
            rows = await conn.execute(text(
                "SELECT id, name, offer_type, power_kva, is_active FROM energy_offers ORDER BY id"))
            if not with_refs:
                return rows.all()
            refs = {r.id: r.selected_offer_id for r in (await conn.execute(text("SELECT * FROM pdls")))}
            refs |= {r.id: r.existing_offer_id for r in (await conn.execute(text("SELECT * FROM offer_contributions")))}
            return rows.all(), refs
    finally:
        await engine.dispose()


INSERT = ("INSERT INTO energy_offers (id, provider_id, name, offer_type, power_kva, valid_from, valid_to) "
          "VALUES (:id, :p, :name, :t, :kva, :vf, :vt)")


def _cas_inserts():
    return [(INSERT, {"id": f"{i:03d}", "p": f"prov{i:03d}", "name": n, "t": t, "kva": 6, "vf": None, "vt": None})
            for i, (n, t, _) in enumerate(CAS)]


@pytest.mark.asyncio
async def test_noms_nettoyes(db_url):
    rows = await _run(db_url, _cas_inserts())
    obtenus = {r.id: r.name for r in rows}
    erreurs = [(n, obtenus[f"{i:03d}"], attendu) for i, (n, _, attendu) in enumerate(CAS)
               if obtenus[f"{i:03d}"] != attendu]
    assert erreurs == []


@pytest.mark.asyncio
async def test_idempotente(db_url):
    une = await _run(db_url, _cas_inserts(), migrate_times=1)
    deux = await _run(db_url, _cas_inserts(), migrate_times=2)
    assert une == deux


@pytest.mark.asyncio
async def test_doublons_desactives_garde_le_plus_recent(db_url):
    rows = await _run(db_url, [
        (INSERT, {"id": "old", "p": "edf", "name": "Tarif Bleu", "t": "BASE", "kva": 9,
                  "vf": datetime(2025, 2, 1, tzinfo=UTC), "vt": None}),
        (INSERT, {"id": "new", "p": "edf", "name": "Tarif Bleu - 9 kVA", "t": "BASE", "kva": 9,
                  "vf": datetime(2026, 2, 1, tzinfo=UTC), "vt": None}),
        # même nom, autre puissance : ce n'est pas un doublon
        (INSERT, {"id": "p12", "p": "edf", "name": "Tarif Bleu - 12 kVA", "t": "BASE", "kva": 12,
                  "vf": datetime(2026, 2, 1, tzinfo=UTC), "vt": None}),
    ])
    actives = {r.id for r in rows if r.is_active}
    assert actives == {"new", "p12"}
    assert {r.name for r in rows} == {"Tarif Bleu"}


@pytest.mark.asyncio
async def test_puissance_seulement_dans_le_nom_recopiee(db_url):
    rows = await _run(db_url, [
        (INSERT, {"id": "nul", "p": "ohm", "name": "Classique - 9 kVA", "t": "BASE", "kva": None, "vf": None, "vt": None}),
        (INSERT, {"id": "ok", "p": "ohm", "name": "Classique - 9 kVA", "t": "HC_HP", "kva": 12, "vf": None, "vt": None}),
    ])
    assert {(r.id, r.name, r.power_kva) for r in rows} == {("nul", "Classique", 9), ("ok", "Classique", 12)}


@pytest.mark.asyncio
async def test_grille_expiree_n_evince_pas_l_offre_courante(db_url):
    """Dans l'app, l'historique reste is_active avec un valid_to : seule une offre courante est dédoublonnée."""
    rows = await _run(db_url, [
        (INSERT, {"id": "cur", "p": "ohm", "name": "Classique", "t": "BASE", "kva": 6, "vf": None, "vt": None}),
        (INSERT, {"id": "exp", "p": "ohm", "name": "Classique - 6 kVA", "t": "BASE", "kva": 6,
                  "vf": datetime(2025, 6, 1, tzinfo=UTC), "vt": datetime(2025, 8, 1, tzinfo=UTC)}),
    ])
    assert {r.id: r.is_active for r in rows} == {"cur": True, "exp": True}


@pytest.mark.asyncio
async def test_references_repointees_vers_l_offre_gardee(db_url):
    rows, refs = await _run(db_url, [
        (INSERT, {"id": "old", "p": "edf", "name": "Tarif Bleu", "t": "BASE", "kva": 6, "vf": None, "vt": None}),
        (INSERT, {"id": "new", "p": "edf", "name": "Tarif Bleu - 6 kVA", "t": "BASE", "kva": 6,
                  "vf": datetime(2026, 7, 31, tzinfo=UTC), "vt": None}),
        ("INSERT INTO pdls VALUES ('pdl1', 'old')", {}),
        ("INSERT INTO offer_contributions VALUES ('c_pending', 'old', 'pending'), ('c_done', 'old', 'approved')", {}),
    ], with_refs=True)
    assert {r.id: r.is_active for r in rows} == {"old": False, "new": True}
    # le PDL et la contribution en attente suivent l'offre gardée ; l'historique approuvé ne bouge pas
    assert refs == {"pdl1": "new", "c_pending": "new", "c_done": "old"}


@pytest.mark.asyncio
async def test_puissance_recopiee_quelle_que_soit_la_casse(db_url):
    rows = await _run(db_url, [
        (INSERT, {"id": "k", "p": "ohm", "name": "Classique - 9 KVA", "t": "BASE", "kva": None, "vf": None, "vt": None}),
    ])
    assert [(r.name, r.power_kva) for r in rows] == [("Classique", 9)]


@pytest.mark.asyncio
async def test_nom_jamais_vide(db_url):
    """Comme clean_offer_name : si tout le nom est un suffixe, il est laissé tel quel."""
    rows = await _run(db_url, [
        (INSERT, {"id": "a", "p": "x", "name": "- BASE", "t": "BASE", "kva": 6, "vf": None, "vt": None}),
        (INSERT, {"id": "b", "p": "y", "name": "6 kVA", "t": "BASE", "kva": 6, "vf": None, "vt": None}),
    ])
    assert {r.id: r.name for r in rows} == {"a": "- BASE", "b": "6 kVA"}
