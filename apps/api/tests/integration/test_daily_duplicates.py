"""Régressions MED-103 : doublons quotidiens lorsque NULL reste distinct dans UNIQUE.

Les lectures reproduisent ce schéma sur SQLite en retirant l'index partiel journalier.
Les écritures PostgreSQL utilisent TEST_POSTGRES_URL, sinon elles sont ignorées.
La base PostgreSQL fournie est VIDÉE à chaque test, comme dans test_client_sqlite.py.
"""

import asyncio
import os
import uuid
from collections.abc import AsyncIterator
from datetime import UTC, date, datetime, timedelta
from unittest.mock import MagicMock

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from src.models import Base
from src.models.client_mode import ConsumptionData, DataGranularity, ProductionData
from src.services import sync
from src.services.import_v1 import _insert
from src.services.local_data import LocalDataService
from src.services.sync import SyncService

PDL = "12345678901234"
START = date(2026, 1, 5)
ENERGY_MODELS = [ConsumptionData, ProductionData]
DAILY_READERS = [
    pytest.param(ConsumptionData, "get_consumption_daily", id="consumption"),
    pytest.param(ProductionData, "get_production_daily", id="production"),
]


@pytest.fixture(params=["sqlite", "postgresql"])
def db_url(request, tmp_path) -> str:
    if request.param == "sqlite":
        return f"sqlite+aiosqlite:///{tmp_path / 'daily_duplicates.db'}"
    url = os.environ.get("TEST_POSTGRES_URL")
    if not url:
        pytest.skip("TEST_POSTGRES_URL absent : écritures PostgreSQL non vérifiées")
    return url


def _create_schema(sync_conn) -> None:
    """create_all, avec NULLS NOT DISTINCT retiré des modèles sur un PostgreSQL < 15 (syntaxe absente)."""
    legacy = sync_conn.dialect.name == "postgresql" and sync_conn.dialect.server_version_info < (15,)
    flipped = []
    if legacy:
        for model in ENERGY_MODELS:
            for constraint in model.__table__.constraints:
                options = getattr(constraint, "dialect_options", {}).get("postgresql")
                if options is not None and options.get("nulls_not_distinct"):
                    options["nulls_not_distinct"] = None  # False émettrait « NULLS DISTINCT », absent aussi en PG < 15
                    flipped.append(options)
    try:
        Base.metadata.create_all(sync_conn)
    finally:
        for options in flipped:
            options["nulls_not_distinct"] = True


@pytest.fixture
async def session(db_url: str) -> AsyncIterator[AsyncSession]:
    """Schéma complet, un utilisateur et son PDL, sur une base dédiée au test."""
    engine = create_async_engine(db_url)
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
            await conn.run_sync(_create_schema)
            user_id = str(uuid.uuid4())
            await conn.execute(
                text(
                    "INSERT INTO users (id, email, hashed_password, client_id, client_secret, is_active, is_admin, "
                    "email_verified, debug_mode, admin_data_sharing) "
                    "VALUES (:id, 'client@example.org', 'x', :cid, 'x', true, false, true, false, false)"
                ),
                {"id": user_id, "cid": f"cid-{user_id}"},
            )
            await conn.execute(
                text(
                    "INSERT INTO pdls (id, usage_point_id, user_id, has_consumption, has_production, is_active) "
                    "VALUES (:id, :pdl, :user_id, true, true, true)"
                ),
                {"id": str(uuid.uuid4()), "pdl": PDL, "user_id": user_id},
            )
        async with async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)() as db:
            yield db
    finally:
        await engine.dispose()


def _sync_service(db: AsyncSession, monkeypatch) -> SyncService:
    monkeypatch.setattr(sync, "_daily_upsert_effective", None)
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


@pytest.mark.parametrize("db_url", ["sqlite"], indirect=True)
@pytest.mark.parametrize("model,reader", DAILY_READERS)
async def test_lecture_quotidienne_dedoublonne(session, model, reader):
    """Deux copies identiques de trois journées ne doivent pas doubler le total."""
    await session.execute(text(f"DROP INDEX uq_{model.__tablename__}_daily"))
    values = {START + timedelta(days=offset): value for offset, value in [(0, 12000), (2, 10000), (3, 14000)]}
    for day, value in values.items():
        for _ in range(2):
            session.add(model(id=str(uuid.uuid4()), **_energy(day, value)))
    await session.commit()

    points, missing = await getattr(LocalDataService(session), reader)(PDL, START, START + timedelta(days=4))

    assert missing == [(START + timedelta(days=1), START + timedelta(days=2))]
    total = sum(int(point["v"]) for point in points)
    assert total == sum(values.values()), f"Total journalier doublé : {total} Wh pour {len(points)} points"
    assert len(points) == 3
    assert points == [{"d": day.isoformat(), "v": str(value)} for day, value in values.items()]


@pytest.mark.parametrize("db_url", ["sqlite"], indirect=True)
@pytest.mark.parametrize("model,reader", DAILY_READERS)
async def test_lecture_quotidienne_garde_derniere_mise_a_jour(session, model, reader):
    """La valeur dépend de updated_at, même si elle diminue ou arrive avant l'ancienne."""
    await session.execute(text(f"DROP INDEX uq_{model.__tablename__}_daily"))
    older = datetime(2026, 2, 1, 10, tzinfo=UTC)
    newer = older + timedelta(hours=1)
    values = {START + timedelta(days=offset): value for offset, value in [(0, 11000), (2, 9000), (3, 13000)]}
    for index, (day, value) in enumerate(values.items()):
        versions = [(newer, value), (older, value + 1000)]
        if index % 2:
            versions.reverse()
        for updated_at, version_value in versions:
            session.add(
                model(
                    id=str(uuid.uuid4()),
                    **_energy(day, version_value),
                    created_at=older,
                    updated_at=updated_at,
                )
            )
    await session.commit()

    points, missing = await getattr(LocalDataService(session), reader)(PDL, START, START + timedelta(days=4))

    assert missing == [(START + timedelta(days=1), START + timedelta(days=2))]
    assert len(points) == 3, f"Une seule version attendue par jour, {len(points)} points renvoyés"
    assert points == [{"d": day.isoformat(), "v": str(value)} for day, value in values.items()]
    assert sum(int(point["v"]) for point in points) == sum(values.values())


async def _use_postgres_plain_unique(db: AsyncSession) -> None:
    """Simuler le schéma PostgreSQL < 15, même sur un serveur plus récent."""
    await db.execute(text("ALTER TABLE consumption_data DROP CONSTRAINT uq_consumption_data"))
    await db.execute(
        text(
            "ALTER TABLE consumption_data ADD CONSTRAINT uq_consumption_data "
            "UNIQUE (usage_point_id, date, granularity, interval_start)"
        )
    )
    await db.execute(text("DROP INDEX IF EXISTS uq_consumption_data_daily"))
    await db.commit()


async def _assert_five_daily_rows(db: AsyncSession, model: type) -> None:
    filters = (
        model.usage_point_id == PDL,
        model.granularity == DataGranularity.DAILY,
        model.interval_start.is_(None),
    )
    count = (await db.execute(select(func.count()).select_from(model).where(*filters))).scalar_one()
    duplicates = (
        await db.execute(
            select(model.date, model.interval_start, func.count())
            .where(*filters)
            .group_by(model.date, model.interval_start)
            .having(func.count() > 1)
        )
    ).all()
    assert count == 5, f"5 journées attendues, {count} lignes stockées ; clés dupliquées : {duplicates}"
    assert duplicates == []


@pytest.mark.parametrize("db_url", ["postgresql"], indirect=True)
async def test_upserts_quotidiens_postgresql_concurrents_sans_doublon(session, monkeypatch):
    await _use_postgres_plain_unique(session)
    engine = session.bind
    assert engine is not None
    # Les connexions sont acquises avant gather : aucune session ni connexion partagée.
    async with engine.connect() as first_conn, engine.connect() as second_conn:
        async with AsyncSession(bind=first_conn) as first_db, AsyncSession(bind=second_conn) as second_db:
            first_service = _sync_service(first_db, monkeypatch)
            second_service = _sync_service(second_db, monkeypatch)
            await asyncio.gather(
                first_service._upsert_energy_records(
                    [_energy(START + timedelta(days=i), 12000 + i) for i in range(5)], ConsumptionData
                ),
                second_service._upsert_energy_records(
                    [_energy(START + timedelta(days=i), 12000 + i) for i in range(5)], ConsumptionData
                ),
            )

    await _assert_five_daily_rows(session, ConsumptionData)


@pytest.mark.parametrize("db_url", ["postgresql"], indirect=True)
async def test_upserts_quotidiens_postgresql_successifs_actualisent_sans_doublon(session, monkeypatch):
    await _use_postgres_plain_unique(session)
    service = _sync_service(session, monkeypatch)
    await service._upsert_energy_records(
        [_energy(START + timedelta(days=i), 12000 + i) for i in range(5)], ConsumptionData
    )
    await service._upsert_energy_records(
        [_energy(START + timedelta(days=i), 12500 + i) for i in range(5)], ConsumptionData
    )

    await _assert_five_daily_rows(session, ConsumptionData)
    rows = (
        await session.execute(select(ConsumptionData.date, ConsumptionData.value).order_by(ConsumptionData.date))
    ).all()
    assert [tuple(row) for row in rows] == [(START + timedelta(days=i), 12500 + i) for i in range(5)]


@pytest.mark.parametrize("db_url", ["postgresql"], indirect=True)
async def test_import_v1_postgresql_migre_ignore_une_journee_deja_presente(session):
    """Contrainte simple + index partiel (base migrée depuis PG < 15) : DO NOTHING absorbe l'index partiel."""
    await _use_postgres_plain_unique(session)
    await session.execute(
        text(
            "CREATE UNIQUE INDEX uq_consumption_data_daily "
            "ON consumption_data (usage_point_id, date, granularity) WHERE interval_start IS NULL"
        )
    )
    await session.commit()
    rows = [{**_energy(START + timedelta(days=i), 12000 + i), "id": str(uuid.uuid4())} for i in range(3)]
    assert await _insert(session, ConsumptionData, rows) == 3
    again = [{**row, "id": str(uuid.uuid4()), "value": 99999} for row in rows]
    assert await _insert(session, ConsumptionData, again) == 0
    await session.commit()

    values = (await session.execute(select(ConsumptionData.value).order_by(ConsumptionData.date))).scalars().all()
    assert values == [12000, 12001, 12002]


@pytest.mark.parametrize("db_url", ["sqlite"], indirect=True)
@pytest.mark.parametrize("model", ENERGY_MODELS)
async def test_controle_sqlite_index_quotidien_sans_doublon(session, monkeypatch, model):
    """Avec l'index partiel intact, cinq journées rejouées restent cinq lignes."""
    service = _sync_service(session, monkeypatch)
    await service._upsert_energy_records([_energy(START + timedelta(days=i), 12000 + i) for i in range(5)], model)
    await service._upsert_energy_records([_energy(START + timedelta(days=i), 12500 + i) for i in range(5)], model)

    await _assert_five_daily_rows(session, model)
    rows = (await session.execute(select(model.date, model.value).order_by(model.date))).all()
    assert [tuple(row) for row in rows] == [(START + timedelta(days=i), 12500 + i) for i in range(5)]


@pytest.mark.parametrize("db_url", ["sqlite"], indirect=True)
@pytest.mark.parametrize("model", ENERGY_MODELS)
async def test_controle_sqlite_detaille_sans_doublon(session, monkeypatch, model):
    """Les intervalles renseignés sont uniques, même sans index partiel journalier."""
    await session.execute(text(f"DROP INDEX uq_{model.__tablename__}_daily"))
    await session.commit()
    service = _sync_service(session, monkeypatch)
    for base_value in (300, 350):
        await service._upsert_energy_records(
            [
                _energy(START + timedelta(days=i), base_value + i + slot, interval)
                for i in range(5)
                for slot, interval in enumerate(("00:00", "00:30"))
            ],
            model,
        )

    count = (await session.execute(select(func.count()).select_from(model))).scalar_one()
    assert count == 10
    rows = (
        await session.execute(
            select(model.date, model.interval_start, model.value).order_by(model.date, model.interval_start)
        )
    ).all()
    assert [tuple(row) for row in rows] == [
        (START + timedelta(days=i), interval, 350 + i + slot)
        for i in range(5)
        for slot, interval in enumerate(("00:00", "00:30"))
    ]



def _bound_service(db: AsyncSession) -> SyncService:
    """Service sur `db`, sans relire le mode quotidien déjà mis en cache par le process."""
    service = SyncService.__new__(SyncService)
    service.db = db
    service.adapter = MagicMock()
    return service


@pytest.mark.parametrize("db_url", ["postgresql"], indirect=True)
async def test_upserts_quotidiens_postgresql_index_partiel_sans_doublon(session, monkeypatch):
    """PostgreSQL < 15 migré (b8d1f3a5c7e9) : ON CONFLICT vise l'index partiel uq_<table>_daily."""
    await _use_postgres_plain_unique(session)
    await session.execute(
        text(
            "CREATE UNIQUE INDEX uq_consumption_data_daily ON consumption_data "
            "(usage_point_id, date, granularity) WHERE interval_start IS NULL"
        )
    )
    await session.commit()
    service = _sync_service(session, monkeypatch)
    assert await service._daily_upsert_mode() == "index"

    engine = session.bind
    assert engine is not None
    async with engine.connect() as first_conn, engine.connect() as second_conn:
        async with AsyncSession(bind=first_conn) as first_db, AsyncSession(bind=second_conn) as second_db:
            await asyncio.gather(
                _bound_service(first_db)._upsert_energy_records(
                    [_energy(START + timedelta(days=i), 12000 + i) for i in range(5)], ConsumptionData
                ),
                _bound_service(second_db)._upsert_energy_records(
                    [_energy(START + timedelta(days=i), 12500 + i) for i in range(5)], ConsumptionData
                ),
            )
    # Lot mixte : quotidiennes sur l'index partiel, détaillées sur la contrainte uq_consumption_data
    await service._upsert_energy_records(
        [_energy(START + timedelta(days=i), 13000 + i, interval) for i in range(5) for interval in (None, "00:00")],
        ConsumptionData,
    )

    await _assert_five_daily_rows(session, ConsumptionData)
    daily = (
        await session.execute(
            select(ConsumptionData.value)
            .where(ConsumptionData.interval_start.is_(None))
            .order_by(ConsumptionData.date)
        )
    ).scalars().all()
    assert daily == [13000 + i for i in range(5)]
    detailed = (
        await session.execute(
            select(func.count()).select_from(ConsumptionData).where(ConsumptionData.interval_start.is_not(None))
        )
    ).scalar_one()
    assert detailed == 5
