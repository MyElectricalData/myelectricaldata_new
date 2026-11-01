"""Client local sur SQLite, en parité avec PostgreSQL (MED-65).

Le client local doit tourner sur un simple fichier SQLite (installation « basique », sans service
PostgreSQL) avec le même comportement que sur PostgreSQL : schéma complet au premier démarrage,
upserts idempotents (lignes quotidiennes à `interval_start` NULL comprises), dates relues avec
leur fuseau, import V1.

Les tests de parité tournent sur les deux dialectes. PostgreSQL est fourni par `TEST_POSTGRES_URL`
(ex. un `docker run postgres:16-alpine`), sinon ces cas sont ignorés.

⚠️ La base PostgreSQL visée est VIDÉE à chaque test (drop_all du schéma V2) : jamais une base réelle.
"""
import asyncio
import os
import sqlite3
import subprocess
import sys
import uuid
from collections.abc import AsyncIterator
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest
import sqlalchemy as sa
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from src.models import Base
from src.models.client_mode import (
    ConsumptionData,
    DataGranularity,
    MaxPowerData,
    ProductionData,
    SyncStatus,
)
from src.models.refresh_tracker import RefreshTracker
from src.services import sync
from src.services.import_v1 import run_import, to_source_url
from src.services.local_data import LocalDataService
from src.services.sync import SyncService
from tests.v1_cache import V1Cache

API_DIR = Path(__file__).resolve().parents[2]
PDL = "12345678901234"
DAILY_INDEXES = {"uq_consumption_data_daily", "uq_production_data_daily"}


# --- Bases ------------------------------------------------------------------------------------


@pytest.fixture(params=["sqlite", "postgresql"])
def db_url(request, tmp_path) -> str:
    if request.param == "sqlite":
        return f"sqlite+aiosqlite:///{tmp_path / 'client.db'}"
    url = os.environ.get("TEST_POSTGRES_URL")
    if not url:
        pytest.skip("TEST_POSTGRES_URL absent : parité PostgreSQL non vérifiée")
    return url


@pytest.fixture
async def session(db_url) -> AsyncIterator[AsyncSession]:
    """Schéma V2 complet tel que les modèles le déclarent, un compte et le PDL `PDL`."""
    engine = create_async_engine(db_url)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
        user_id = str(uuid.uuid4())
        await conn.execute(
            text("INSERT INTO users (id, email, hashed_password, client_id, client_secret, is_active, is_admin, "
                 "email_verified, debug_mode, admin_data_sharing) "
                 "VALUES (:id, 'client@example.org', 'x', :cid, 'x', true, false, true, false, false)"),
            {"id": user_id, "cid": f"cid-{user_id}"},
        )
        await conn.execute(
            text("INSERT INTO pdls (id, usage_point_id, user_id, has_consumption, has_production, is_active) "
                 "VALUES (:id, :pdl, :user_id, true, true, true)"),
            {"id": str(uuid.uuid4()), "pdl": PDL, "user_id": user_id},
        )
    async with async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)() as db:
        yield db
    await engine.dispose()


def _sync_service(db: AsyncSession, monkeypatch) -> SyncService:
    monkeypatch.setattr(sync, "_daily_upsert_effective", None)  # cache par process, relu par dialecte
    service = SyncService.__new__(SyncService)
    service.db = db
    service.adapter = MagicMock()
    return service


def _energy(day: date, value: int, interval_start: str | None = None) -> dict:
    return {
        "usage_point_id": PDL,
        "date": day,
        "granularity": DataGranularity.DETAILED if interval_start else DataGranularity.DAILY,
        "interval_start": interval_start,
        "value": value,
        "source": "myelectricaldata",
        "raw_data": {"v": str(value)},
    }


async def _count(db: AsyncSession, model: type) -> int:
    return (await db.execute(select(func.count()).select_from(model))).scalar_one()


# --- Amorçage du schéma (entrypoint.sh : alembic upgrade head) --------------------------------


def _alembic_upgrade(url: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=API_DIR, env={**os.environ, "DATABASE_URL": url}, capture_output=True, text=True, timeout=120,
    )


def _head() -> str:
    head = ScriptDirectory.from_config(Config(str(API_DIR / "alembic.ini"))).get_current_head()
    assert head
    return head


def test_amorcage_sqlite_cree_tout_le_schema(tmp_path):
    """Premier démarrage sur un fichier absent, dans un dossier absent : schéma complet, tête Alembic posée."""
    path = tmp_path / "data" / "myelectricaldata.db"
    result = _alembic_upgrade(f"sqlite+aiosqlite:///{path}")
    assert result.returncode == 0, result.stderr[-2000:]

    with sqlite3.connect(path) as conn:
        tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
        indexes = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type = 'index'")}
        version = conn.execute("SELECT version_num FROM alembic_version").fetchall()
    assert set(Base.metadata.tables) <= tables
    assert DAILY_INDEXES <= indexes
    assert version == [(_head(),)]


def test_amorcage_sqlite_rejouable(tmp_path):
    """Chaque redémarrage rejoue `alembic upgrade head` : sans effet sur une base déjà à jour."""
    url = f"sqlite+aiosqlite:///{tmp_path / 'client.db'}"
    assert _alembic_upgrade(url).returncode == 0
    with sqlite3.connect(tmp_path / "client.db") as conn:
        conn.execute("INSERT INTO tempo_days (id, date, color) VALUES ('2026-01-05', '2026-01-05', 'RED')")
    result = _alembic_upgrade(url)
    assert result.returncode == 0, result.stderr[-2000:]
    with sqlite3.connect(tmp_path / "client.db") as conn:
        assert conn.execute("SELECT count(*) FROM tempo_days").fetchone() == (1,)
        assert conn.execute("SELECT version_num FROM alembic_version").fetchall() == [(_head(),)]


def test_amorcage_sqlite_interrompu_reprend(tmp_path):
    """Premier démarrage tué entre la création d'alembic_version et la pose de la tête (table vide, tables
    du schéma incomplètes) : le redémarrage doit amorcer de nouveau, pas rejouer les révisions
    PostgreSQL sur les tables déjà créées (revue Codex)."""
    url = f"sqlite+aiosqlite:///{tmp_path / 'client.db'}"
    assert _alembic_upgrade(url).returncode == 0
    with sqlite3.connect(tmp_path / "client.db") as conn:
        conn.execute("INSERT INTO tempo_days (id, date, color) VALUES ('2026-01-05', '2026-01-05', 'RED')")
        conn.execute("DELETE FROM alembic_version")
        conn.execute("DROP TABLE zen_flex_days")

    result = _alembic_upgrade(url)
    assert result.returncode == 0, result.stderr[-2000:]
    with sqlite3.connect(tmp_path / "client.db") as conn:
        assert conn.execute("SELECT version_num FROM alembic_version").fetchall() == [(_head(),)]
        assert conn.execute("SELECT count(*) FROM tempo_days").fetchone() == (1,)
        assert conn.execute("SELECT count(*) FROM zen_flex_days").fetchone() == (0,)


# --- Moteur ------------------------------------------------------------------------------------


async def test_moteur_sqlite_pragmas(tmp_path):
    """Réglages de chaque connexion : WAL, attente sur verrou, clés étrangères actives."""
    from src.models.database import make_engine

    engine = make_engine(f"sqlite+aiosqlite:///{tmp_path / 'data' / 'client.db'}")
    try:
        async with engine.connect() as conn:
            assert (await conn.execute(text("PRAGMA journal_mode"))).scalar() == "wal"
            assert (await conn.execute(text("PRAGMA foreign_keys"))).scalar() == 1
            assert (await conn.execute(text("PRAGMA busy_timeout"))).scalar() >= 5000
    finally:
        await engine.dispose()


async def test_moteur_sqlite_ecritures_concurrentes(tmp_path):
    """Scheduler et API écrivent en même temps : le second écrivain attend la fin de la transaction du
    premier au lieu d'échouer sur « database is locked », et les deux écritures restent."""
    from src.models.database import make_engine

    engine = make_engine(f"sqlite+aiosqlite:///{tmp_path / 'client.db'}")
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        async def write(day: str, hold: float) -> None:
            async with engine.begin() as conn:  # verrou d'écriture tenu jusqu'au commit
                await conn.execute(text("INSERT INTO tempo_days (id, date, color) VALUES (:d, :d, 'RED')"), {"d": day})
                await asyncio.sleep(hold)

        await asyncio.gather(write("2026-01-05", 1.0), write("2026-01-06", 0))

        async with engine.connect() as conn:
            assert (await conn.execute(text("SELECT count(*) FROM tempo_days"))).scalar() == 2
    finally:
        await engine.dispose()


# --- Upserts (parité SQLite / PostgreSQL) ------------------------------------------------------


@pytest.mark.parametrize("model", [ConsumptionData, ProductionData])
async def test_upsert_quotidien_sans_doublon(session, monkeypatch, model):
    """Ligne quotidienne (interval_start NULL) redemandée : mise à jour, jamais une seconde ligne."""
    service = _sync_service(session, monkeypatch)
    await service._upsert_energy_records([_energy(date(2026, 1, 5), 12000)], model)
    await service._upsert_energy_records([_energy(date(2026, 1, 5), 12500)], model)

    rows = (await session.execute(select(model.value))).scalars().all()
    assert rows == [12500]


async def test_upsert_detaille_sans_doublon(session, monkeypatch):
    service = _sync_service(session, monkeypatch)
    day = date(2026, 1, 5)
    await service._upsert_energy_records([_energy(day, 300, "00:00"), _energy(day, 310, "00:30")], ConsumptionData)
    await service._upsert_energy_records([_energy(day, 320, "00:30"), _energy(day, 330, "01:00")], ConsumptionData)

    rows = (await session.execute(
        select(ConsumptionData.interval_start, ConsumptionData.value).order_by(ConsumptionData.interval_start)
    )).all()
    assert [tuple(r) for r in rows] == [("00:00", 300), ("00:30", 320), ("01:00", 330)]


async def test_quotidien_et_detaille_cohabitent(session, monkeypatch):
    """Le même jour en quotidien et en courbe de charge : deux granularités, deux jeux de lignes."""
    service = _sync_service(session, monkeypatch)
    day = date(2026, 1, 5)
    await service._upsert_energy_records([_energy(day, 12000)], ConsumptionData)
    await service._upsert_energy_records([_energy(day, 300, "00:00")], ConsumptionData)
    await service._upsert_energy_records([_energy(day, 12100)], ConsumptionData)

    assert await _count(session, ConsumptionData) == 2


async def test_rafraichissement_force_actif(session, monkeypatch):
    """Le rafraîchissement de J-2/J-1 suppose un upsert quotidien effectif, sur les deux bases."""
    service = _sync_service(session, monkeypatch)
    assert await service._daily_upsert_is_effective() is True


async def test_upsert_puissance_max(session):
    service = LocalDataService(session)
    record = {"usage_point_id": PDL, "date": date(2026, 1, 5), "interval_start": "18:42",
              "value": 6100, "source": "myelectricaldata", "raw_data": None}
    await service.save_max_power([record])
    await service.save_max_power([{**record, "interval_start": "19:10", "value": 6400}])

    rows = (await session.execute(select(MaxPowerData.interval_start, MaxPowerData.value))).all()
    assert [tuple(r) for r in rows] == [("19:10", 6400)]


# --- Détection des jours manquants (#192) -------------------------------------------------------
# `select(func.distinct(col))` n'est pas typé par SQLAlchemy : sous SQLite la date revenait en chaîne,
# jamais égale à une `date` (tout redemandé à chaque synchro) et non comparable à `force_refresh_from`
# (TypeError dès que le dernier passage a plus de 6 h : journalier et Pmax plus synchronisés).


async def _seed_days(db: AsyncSession, model: type, days: list[date], granularity=DataGranularity.DAILY) -> None:
    for day in days:
        row = {"usage_point_id": PDL, "date": day, "value": 1000, "source": "myelectricaldata", "raw_data": None}
        if model is MaxPowerData:
            row["interval_start"] = "18:42"
        else:
            row["granularity"] = granularity
        db.add(model(**row))
    await db.commit()


def _days(first: date, count: int) -> list[date]:
    return [first + timedelta(days=i) for i in range(count)]


async def test_trous_synchro_relit_des_dates(session, monkeypatch):
    """Les jours déjà en base ne sont pas redemandés : la date relue est une `date`, pas une chaîne."""
    await _seed_days(session, ConsumptionData, _days(date(2026, 1, 5), 5))  # 5 au 9 janvier
    service = _sync_service(session, monkeypatch)

    ranges = await service._find_missing_ranges(
        ConsumptionData, PDL, date(2026, 1, 5), date(2026, 1, 12), DataGranularity.DAILY
    )
    assert ranges == [(date(2026, 1, 10), date(2026, 1, 12))]


async def test_trous_synchro_rafraichissement_force(session, monkeypatch):
    """`force_refresh_from` se compare aux dates relues : redemande J-2/J-1, sans TypeError (#192)."""
    await _seed_days(session, ConsumptionData, _days(date(2026, 1, 5), 7))  # 5 au 11 janvier
    service = _sync_service(session, monkeypatch)

    ranges = await service._find_missing_ranges(
        ConsumptionData, PDL, date(2026, 1, 5), date(2026, 1, 12), DataGranularity.DAILY,
        force_refresh_from=date(2026, 1, 10),
    )
    assert ranges == [(date(2026, 1, 10), date(2026, 1, 12))]


async def test_trous_lecture_locale_relit_des_dates(session):
    """Même requête côté lectures de l'interface (LocalDataService) : les jours en base ne sont pas redemandés."""
    await _seed_days(session, ConsumptionData, _days(date(2026, 1, 5), 5))
    await _seed_days(session, ConsumptionData, [date(2026, 1, 10)], DataGranularity.DETAILED)

    service = LocalDataService(session)
    daily = await service._find_missing_ranges(
        ConsumptionData, PDL, date(2026, 1, 5), date(2026, 1, 12), DataGranularity.DAILY
    )
    detailed = await service._find_missing_ranges(
        ConsumptionData, PDL, date(2026, 1, 5), date(2026, 1, 12), DataGranularity.DETAILED
    )
    assert daily == [(date(2026, 1, 10), date(2026, 1, 12))]
    assert detailed == [(date(2026, 1, 5), date(2026, 1, 10)), (date(2026, 1, 11), date(2026, 1, 12))]


async def _vieux_passage(db: AsyncSession, data_type: str) -> None:
    """Dernier passage vieux de 7 h : la synchro redemande J-2/J-1 (DAILY_REFRESH_INTERVAL = 6 h)."""
    db.add(SyncStatus(
        usage_point_id=PDL, data_type=data_type, granularity=DataGranularity.DAILY,
        last_sync_at=datetime.now(UTC) - timedelta(hours=7),
    ))
    await db.commit()


async def test_synchro_journaliere_apres_6h_redemande_j2_j1(session, monkeypatch):
    """Journalier déjà rempli, dernier passage > 6 h : seule la fenêtre J-2/J-1 est redemandée (#192)."""
    today = date.today()
    first = today - timedelta(days=sync.MAX_DAILY_DAYS)
    await _seed_days(session, ConsumptionData, _days(first, sync.MAX_DAILY_DAYS))  # jusqu'à J-1 inclus
    await _vieux_passage(session, "consumption")
    service = _sync_service(session, monkeypatch)
    service.adapter.get_consumption_daily = AsyncMock(return_value={"success": True, "data": None})

    await service._sync_consumption_daily(PDL)

    service.adapter.get_consumption_daily.assert_awaited_once_with(
        PDL, (today - timedelta(days=2)).isoformat(), today.isoformat()
    )


async def test_synchro_pmax_apres_6h_redemande_j2_j1(session, monkeypatch):
    """Même cas pour la puissance max, qui lit ses dates par une requête distincte (#192)."""
    today = date.today()
    first = today - timedelta(days=sync.MAX_DAILY_DAYS)
    await _seed_days(session, MaxPowerData, _days(first, sync.MAX_DAILY_DAYS))
    await _vieux_passage(session, "max_power")
    service = _sync_service(session, monkeypatch)
    service.adapter.get_consumption_max_power = AsyncMock(return_value={"success": True, "data": None})

    await service._sync_consumption_max_power(PDL)

    service.adapter.get_consumption_max_power.assert_awaited_once_with(
        PDL, (today - timedelta(days=2)).isoformat(), today.isoformat()
    )


# --- Dates et identifiants ---------------------------------------------------------------------


def test_aucune_colonne_date_sans_fuseau_relu():
    """SQLite rend des datetimes naïfs : toute colonne à fuseau passe par un type qui le restaure."""
    nues = [
        f"{table.name}.{column.name}"
        for table in Base.metadata.sorted_tables
        for column in table.columns
        if type(column.type) is sa.DateTime and column.type.timezone
    ]
    assert nues == []


async def test_dates_relues_avec_fuseau(session):
    instant = datetime(2026, 1, 5, 6, 30, tzinfo=UTC)
    session.add(SyncStatus(usage_point_id=PDL, data_type="consumption",
                           granularity=DataGranularity.DAILY, last_sync_at=instant))
    await session.commit()
    session.expunge_all()

    status = (await session.execute(select(SyncStatus))).scalar_one()
    assert status.last_sync_at == instant
    assert status.last_sync_at.tzinfo is not None
    assert status.created_at.tzinfo is not None  # server_default de la base
    assert datetime.now(UTC) - status.last_sync_at > timedelta(0)  # comparable, sans TypeError


async def test_refresh_tracker_uuid(session):
    session.add(RefreshTracker(cache_type="tempo", last_refresh=datetime(2026, 1, 5, tzinfo=UTC)))
    await session.commit()
    session.expunge_all()

    tracker = (await session.execute(select(RefreshTracker))).scalar_one()
    assert isinstance(tracker.id, uuid.UUID)
    assert tracker.last_refresh.tzinfo is not None


# --- Import V1 ---------------------------------------------------------------------------------


async def test_import_v1(session, tmp_path):
    v1 = str(V1Cache(tmp_path / "cache.db").usage_point(PDL)
             .daily(PDL, date(2020, 1, 5), 12000).daily(PDL, date(2020, 1, 6), 13000)
             .detail_day(PDL, date(2020, 1, 5))
             .max_power(PDL, date(2020, 1, 5), 6100, datetime(2020, 1, 5, 18, 42))
             .close())

    report = await run_import(to_source_url(v1), session)
    assert report.inserted == {"consumption_data": 2 + 48, "production_data": 0, "max_power_data": 1}

    again = await run_import(to_source_url(v1), session)
    assert again.inserted == {"consumption_data": 0, "production_data": 0, "max_power_data": 0}
    assert await _count(session, ConsumptionData) == 50


async def test_import_v1_elargit_les_bornes_de_synchro(session, tmp_path):
    """MED-64 : le front borne l'historique par oldest_data_date, juste dès l'import, sur les deux dialectes."""
    v1 = str(V1Cache(tmp_path / "cache.db").usage_point(PDL)
             .daily(PDL, date(2019, 3, 1), 12000).daily(PDL, date(2020, 1, 6), 13000)
             .detail_day(PDL, date(2019, 3, 2))
             .max_power(PDL, date(2019, 3, 1), 6100, datetime(2019, 3, 1, 18, 42))
             .close())

    await run_import(to_source_url(v1), session)
    await session.commit()

    rows = (await session.execute(select(SyncStatus).where(SyncStatus.usage_point_id == PDL))).scalars().all()
    bounds = {(r.data_type, r.granularity): (r.oldest_data_date, r.newest_data_date) for r in rows}
    assert bounds[("consumption", DataGranularity.DAILY)] == (date(2019, 3, 1), date(2020, 1, 6))
    assert bounds[("consumption", DataGranularity.DETAILED)] == (date(2019, 3, 2), date(2019, 3, 2))
    assert bounds[("max_power", DataGranularity.DAILY)] == (date(2019, 3, 1), date(2019, 3, 1))
