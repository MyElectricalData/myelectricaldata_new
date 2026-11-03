"""Import de l'historique de l'ancien client local myelectricaldata_import (« V1 ») dans le client V2 (MED-60).

La V1 garde tout dans un SQLite `/data/cache.db` (ou une base PostgreSQL via `storage_uri`),
au schéma Alembic `e990284249e4` dans toutes ses versions publiées (0.x). Des images non
publiées en portent d'autres (`d4f21c9a8b6e`, issue #164) : c'est le schéma réellement lu
(`V1_COLUMNS`) qui décide, une autre révision aux colonnes conformes s'importe et le bilan
la signale. La V2 ne
resynchronise que 1095 jours de journalier et 730 jours de courbe de charge : sans import,
l'historique plus ancien est perdu.

Les lignes produites sont celles qu'écrirait la synchro V2 (points Data Connect 2026 dans
`raw_data`, valeurs en chaînes, courbe de charge en W horodatée au début d'intervalle), avec
`source = "myelectricaldata_v1"`. L'écriture se fait en `ON CONFLICT DO NOTHING` : une donnée
déjà présente en V2 fait toujours foi, et l'import peut être rejoué.
"""
from __future__ import annotations

import logging
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time, timedelta
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import bindparam, func, inspect, select, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from ..models.client_mode import ConsumptionData, DataGranularity, MaxPowerData, ProductionData, SyncStatus
from ..models.pdl import PDL
from .sync import MAX_DAILY_DAYS, MAX_DETAILED_DAYS
from .upsert import dialect_insert, is_sqlite, sqlite_index_exists

logger = logging.getLogger(__name__)

V1_ALEMBIC_HEAD = "e990284249e4"
SOURCE = "myelectricaldata_v1"
PARIS = ZoneInfo("Europe/Paris")
# ~8 colonnes par ligne : reste loin des 32 767 paramètres d'une requête PostgreSQL
BATCH_SIZE = 2000
DIRECTIONS = ("consumption", "production")
# Tables et colonnes que l'import lit : seules elles décident d'accepter une base V1, quelle que soit sa révision
V1_COLUMNS: dict[str, tuple[str, ...]] = {
    "usage_points": ("usage_point_id",),
    **{f"{d}_daily": ("usage_point_id", "date", "value", "blacklist", "fail_count") for d in DIRECTIONS},
    **{f"{d}_detail": ("usage_point_id", "date", "value", "interval") for d in DIRECTIONS},
    "consumption_daily_max_power": ("usage_point_id", "date", "event_date", "value", "blacklist", "fail_count"),
}


class V1SchemaError(Exception):
    """La base source n'est pas un cache.db V1 au schéma connu."""


class TargetDatabaseError(Exception):
    """La base du client V2 ne garantit pas l'unicité des lignes journalières (PostgreSQL < 15, index SQLite absent)."""


async def _check_target(db: AsyncSession) -> None:
    """Refuse PostgreSQL < 15 : sans NULLS NOT DISTINCT (migration 20260223), une ligne journalière
    (`interval_start` NULL) n'entre jamais en conflit, et l'import la doublerait en silence.
    Sous SQLite, ce sont les index partiels des lignes quotidiennes qui jouent ce rôle (MED-65)."""
    if is_sqlite(db):
        for table in ("consumption_data", "production_data"):
            if not await sqlite_index_exists(db, f"uq_{table}_daily"):
                raise TargetDatabaseError(
                    f"Base SQLite sans l'index uq_{table}_daily : les journées déjà présentes seraient doublées "
                    "(redémarrer le client pour compléter le schéma)"
                )
        return
    version = int((await db.execute(text("SHOW server_version_num"))).scalar_one())
    if version < 150000:
        raise TargetDatabaseError(
            f"PostgreSQL {version // 10000} : l'import V1 demande PostgreSQL 15 ou plus pour la base du client "
            "(sans quoi les journées déjà présentes seraient doublées)"
        )


@dataclass
class V1Records:
    """Lignes V2 tirées d'une base V1, et décompte des lignes écartées par motif."""

    revision: str | None = None
    usage_points: list[str] = field(default_factory=list)
    consumption: list[dict[str, Any]] = field(default_factory=list)
    production: list[dict[str, Any]] = field(default_factory=list)
    max_power: list[dict[str, Any]] = field(default_factory=list)
    skipped: dict[str, int] = field(default_factory=dict)


@dataclass
class ImportReport:
    dry_run: bool
    v1_revision: str | None = None
    inserted: dict[str, int] = field(default_factory=dict)
    present: dict[str, int] = field(default_factory=dict)
    unknown_pdls: list[str] = field(default_factory=list)
    skipped: dict[str, int] = field(default_factory=dict)


def to_source_url(source: str) -> str:
    """Chemin d'un cache.db ou URL PostgreSQL V1 (`storage_uri`) → URL SQLAlchemy async."""
    if "://" not in source:
        return f"sqlite+aiosqlite:///{Path(source).absolute()}"
    scheme, rest = source.split("://", 1)
    if scheme in ("postgresql", "postgres", "postgresql+psycopg2"):
        return f"postgresql+asyncpg://{rest}"
    if scheme in ("postgresql+asyncpg", "sqlite+aiosqlite"):
        return source
    if scheme == "sqlite":
        return f"sqlite+aiosqlite://{rest}"
    raise ValueError(f"Base V1 non prise en charge : {scheme} (cache.db SQLite ou PostgreSQL)")


def _engine_url(url: str) -> str:
    """SQLite ouvert en lecture seule : le cache.db n'est jamais modifié (souvent monté en :ro)."""
    if not url.startswith("sqlite"):
        return url
    path = Path(url.split(":///", 1)[1])
    if not path.is_file():
        raise FileNotFoundError(f"cache.db V1 introuvable : {path}")
    return f"sqlite+aiosqlite:///file:{path}?mode=ro&uri=true"


def _missing_columns(sync_conn: Any) -> list[str]:
    """Tables (`production_detail`) et colonnes (`consumption_daily.fail_count`) de `V1_COLUMNS` absentes
    de la base V1. L'inspecteur SQLAlchemy lit le schéma sous SQLite comme sous PostgreSQL ; les colonnes
    en plus (measure_type, name…) ne sont pas lues, donc jamais un motif de refus."""
    inspector = inspect(sync_conn)
    tables = set(inspector.get_table_names())
    missing = []
    for table, columns in V1_COLUMNS.items():
        if table not in tables:
            missing.append(table)
            continue
        present = {column["name"] for column in inspector.get_columns(table)}
        missing.extend(f"{table}.{column}" for column in columns if column not in present)
    return missing


def _as_datetime(value: Any) -> datetime:
    """DateTime V1 : objet (PostgreSQL) ou texte `2020-01-05 00:00:00.000000` (SQLite), naïf en heure de Paris."""
    if isinstance(value, datetime):
        return value.replace(tzinfo=None)
    return datetime.fromisoformat(str(value))


def _day_minutes(day: date) -> int:
    """Durée murale d'une journée à Paris : 1380 au passage à l'heure d'été, 1440 sinon.

    Le jour du retour à l'heure d'hiver dure 1500 minutes, mais la V1 indexe ses points par
    horodatage naïf : l'heure répétée n'y existe qu'une fois, la journée y compte 1440 minutes.
    """
    start = datetime.combine(day, time.min, PARIS).astimezone(UTC)
    end = datetime.combine(day + timedelta(days=1), time.min, PARIS).astimezone(UTC)
    return min(int((end - start).total_seconds() // 60), 24 * 60)


def _skip_reason(
    direction: str, value: int | None, blacklist: int, fail_count: int, *, resyncable: bool = False
) -> str | None:
    """Motif d'écart d'une ligne journalière V1, ou None pour la garder.

    Un jour sans donnée Enedis laisse en V1 une ligne à 0 (`daily_fail_increment`), dès la
    première tentative et donc avec `fail_count = 0` : un 0 de consommation est un échec (un
    Linky consomme toujours en veille), un 0 de production peut être une vraie journée nulle
    comme ce fantôme. Dans la fenêtre que la V2 resynchronise (`resyncable`), on le lui laisse :
    elle ramènera la vraie valeur ; au-delà, on le garde, c'est tout ce qu'il reste.
    """
    if blacklist:
        return "blacklist"
    if fail_count:
        return "echec"
    if not value and direction == "consumption":
        return "zero_consommation"
    if not value and direction == "max_power":
        return "puissance_nulle"
    if not value and resyncable:
        return "zero_production_resync"
    return None


def _daily_record(usage_point_id: str, when: datetime, value: int) -> dict[str, Any]:
    day = when.date()
    return {
        "usage_point_id": usage_point_id,
        "date": day,
        "granularity": DataGranularity.DAILY,
        "interval_start": None,
        "value": int(value),
        "source": SOURCE,
        "raw_data": {"v": str(value), "d": day.isoformat()},
    }


def _detail_records(rows: list[Any], skipped: Counter[str], today: date) -> list[dict[str, Any]]:
    """Courbe de charge V1 (W moyen, horodatée au début d'intervalle), journée par journée.

    La synchro V2 tient une date pour présente dès une ligne (`_find_missing_ranges`) : une
    journée partielle importée ne serait jamais complétée depuis la passerelle. Dans la fenêtre
    qu'elle resynchronise (`MAX_DETAILED_DAYS`), on écarte donc la journée incomplète ; plus
    ancienne, la passerelle ne la rendra plus, on garde ce que la V1 en a.
    """
    by_day: dict[tuple[str, date], dict[datetime, Any]] = defaultdict(dict)
    for row in rows:
        if int(row.interval) <= 0:
            # ligne d'échec V1 (`detail_fail_increment`) : value=0, interval=0 à minuit
            skipped["echec"] += 1
            continue
        start = _as_datetime(row.date)
        by_day[(row.usage_point_id, start.date())][start] = row

    resync_start = today - timedelta(days=MAX_DETAILED_DAYS)
    records = []
    for (usage_point_id, day), points in by_day.items():
        if day >= resync_start and sum(int(row.interval) for row in points.values()) < _day_minutes(day):
            skipped["journee_incomplete"] += 1
            continue
        for start in sorted(points):
            row = points[start]
            records.append({
                "usage_point_id": usage_point_id,
                "date": day,
                "granularity": DataGranularity.DETAILED,
                "interval_start": start.strftime("%H:%M"),
                "value": int(row.value),
                "source": SOURCE,
                "raw_data": {"v": str(row.value), "d": start.strftime("%Y-%m-%d %H:%M:%S"), "p": f"PT{int(row.interval)}M"},
            })
    return records


def _max_power_record(row: Any) -> dict[str, Any]:
    day = _as_datetime(row.date).date()
    event = _as_datetime(row.event_date) if row.event_date else None
    return {
        "usage_point_id": row.usage_point_id,
        "date": day,
        "interval_start": event.strftime("%H:%M") if event else None,
        "value": int(row.value),
        "source": SOURCE,
        "raw_data": {"v": str(row.value), "d": event.strftime("%Y-%m-%d %H:%M:%S") if event else day.isoformat()},
    }


async def load_v1(url: str, pdls: list[str] | None = None, *, today: date | None = None) -> V1Records:
    """Lit une base V1 (lecture seule) et la convertit en lignes V2, sans rien écrire.

    `today` borne les fenêtres que la synchro V2 couvre encore (`[today - N jours, today[`).
    """
    today = today or date.today()
    daily_resync_start = today - timedelta(days=MAX_DAILY_DAYS)
    engine = create_async_engine(_engine_url(url))
    try:
        async with engine.connect() as conn:
            try:
                revision = (await conn.execute(text("SELECT version_num FROM alembic_version"))).scalar()
            except DBAPIError as e:
                raise V1SchemaError(f"Pas une base myelectricaldata_import (table alembic_version absente) : {e}") from e
            if revision is None:
                raise V1SchemaError("Pas une base myelectricaldata_import (table alembic_version vide, jamais migrée)")
            missing = await conn.run_sync(_missing_columns)
            if missing:
                raise V1SchemaError(
                    f"Base V1 en révision {revision} incompatible avec l'import, il y manque : {', '.join(missing)}. "
                    f"Démarrez une dernière fois le client V1 0.x à jour (révision {V1_ALEMBIC_HEAD}) pour migrer son cache.db"
                )

            usage_points = [r[0] for r in await conn.execute(text("SELECT usage_point_id FROM usage_points ORDER BY 1"))]
            if pdls is not None:
                usage_points = [p for p in usage_points if p in set(pdls)]
            records = V1Records(revision=revision, usage_points=usage_points)
            if not usage_points:
                return records

            def query(sql: str):
                stmt = text(sql + " WHERE usage_point_id IN :pdls ORDER BY usage_point_id, date")
                return conn.execute(stmt.bindparams(bindparam("pdls", expanding=True)), {"pdls": usage_points})

            skipped: Counter[str] = Counter()
            for direction in DIRECTIONS:
                target = records.consumption if direction == "consumption" else records.production
                for row in await query(f"SELECT usage_point_id, date, value, blacklist, fail_count FROM {direction}_daily"):
                    when = _as_datetime(row.date)
                    reason = _skip_reason(direction, row.value, row.blacklist, row.fail_count,
                                          resyncable=when.date() >= daily_resync_start)
                    if reason:
                        skipped[reason] += 1
                    else:
                        target.append(_daily_record(row.usage_point_id, when, row.value))
                detail = await query(f"SELECT usage_point_id, date, value, interval FROM {direction}_detail")
                target.extend(_detail_records(list(detail), skipped, today))

            for row in await query(
                "SELECT usage_point_id, date, event_date, value, blacklist, fail_count FROM consumption_daily_max_power"
            ):
                reason = _skip_reason("max_power", row.value, row.blacklist, row.fail_count)
                if reason:
                    skipped[reason] += 1
                else:
                    records.max_power.append(_max_power_record(row))

            records.skipped = dict(skipped)
            return records
    finally:
        await engine.dispose()


async def _detail_days(db: AsyncSession, model: type, pdls: set[str]) -> set[tuple[str, date]]:
    """Journées de courbe de charge déjà en V2 : elles font foi en entier, quel que soit leur pas.

    La contrainte unique ne voit que l'heure de début : une journée V2 au pas de 30 min et la
    même journée V1 au pas de 10 min se superposeraient (3 fois l'énergie à l'export).
    """
    rows = await db.execute(
        select(model.usage_point_id, model.date).distinct()
        .where(model.granularity == DataGranularity.DETAILED, model.usage_point_id.in_(list(pdls)))
    )
    return {(usage_point_id, day) for usage_point_id, day in rows}


def _covered(row: dict[str, Any], days: set[tuple[str, date]]) -> bool:
    return row.get("granularity") == DataGranularity.DETAILED and (row["usage_point_id"], row["date"]) in days


async def _insert(db: AsyncSession, model: type, rows: list[dict[str, Any]]) -> int:
    """INSERT … ON CONFLICT DO NOTHING par lots ; renvoie le nombre de lignes réellement ajoutées."""
    inserted = 0
    for i in range(0, len(rows), BATCH_SIZE):
        stmt = dialect_insert(db, model).values(rows[i:i + BATCH_SIZE])
        # DO NOTHING sans cible couvre toutes les unicités : contrainte uq_<table>, mais aussi l'index partiel
        # des lignes quotidiennes (SQLite, ou PostgreSQL migré depuis une version < 15 puis monté en 15+)
        stmt = stmt.on_conflict_do_nothing()
        result = await db.execute(stmt.returning(model.id))
        inserted += len(result.all())
    return inserted


# Statuts de synchro dont l'import élargit les bornes : (modèle, data_type, granularité) comme la synchro
SYNC_BOUNDS = (
    (ConsumptionData, "consumption", DataGranularity.DAILY),
    (ConsumptionData, "consumption", DataGranularity.DETAILED),
    (ProductionData, "production", DataGranularity.DAILY),
    (ProductionData, "production", DataGranularity.DETAILED),
    (MaxPowerData, "max_power", DataGranularity.DAILY),
)


async def _widen_sync_bounds(db: AsyncSession, pdls: set[str]) -> None:
    """Élargit oldest/newest_data_date des statuts de synchro aux données présentes en base (MED-64).

    Le front borne l'historique demandé par oldest_data_date : sans cela, les années V1 n'apparaîtraient
    qu'après la synchro suivante. Seules les bornes bougent, l'état de synchro reste celui de la V2.
    """
    for model, data_type, granularity in SYNC_BOUNDS:
        query = select(model.usage_point_id, func.min(model.date), func.max(model.date)).where(
            model.usage_point_id.in_(pdls)
        )
        if model is not MaxPowerData:
            query = query.where(model.granularity == granularity)
        rows = (await db.execute(query.group_by(model.usage_point_id))).all()
        for usage_point_id, oldest, newest in rows:
            status = (await db.execute(select(SyncStatus).where(
                SyncStatus.usage_point_id == usage_point_id,
                SyncStatus.data_type == data_type,
                SyncStatus.granularity == granularity,
            ))).scalar_one_or_none()
            if status is None:
                db.add(SyncStatus(usage_point_id=usage_point_id, data_type=data_type, granularity=granularity,
                                  oldest_data_date=oldest, newest_data_date=newest))
                continue
            status.oldest_data_date = min(filter(None, (status.oldest_data_date, oldest)))
            status.newest_data_date = max(filter(None, (status.newest_data_date, newest)))


async def run_import(
    url: str, db: AsyncSession, *, pdls: list[str] | None = None, dry_run: bool = False, today: date | None = None
) -> ImportReport:
    """Importe une base V1 dans la base du client V2 ; `dry_run` compte puis annule tout."""
    await _check_target(db)
    records = await load_v1(url, pdls, today=today)
    known = set((await db.execute(
        select(PDL.usage_point_id).where(PDL.usage_point_id.in_(records.usage_points))
    )).scalars())
    report = ImportReport(
        dry_run=dry_run,
        v1_revision=records.revision,
        unknown_pdls=[p for p in records.usage_points if p not in known],
        skipped=records.skipped,
    )

    targets = [
        (ConsumptionData, records.consumption),
        (ProductionData, records.production),
        (MaxPowerData, records.max_power),
    ]
    try:
        for model, rows in targets:
            rows = [r for r in rows if r["usage_point_id"] in known]
            days = await _detail_days(db, model, known) if model is not MaxPowerData else set()
            inserted = await _insert(db, model, [r for r in rows if not _covered(r, days)])
            report.inserted[model.__tablename__] = inserted
            report.present[model.__tablename__] = len(rows) - inserted
        if not dry_run and known:
            await _widen_sync_bounds(db, known)
    except Exception:
        await db.rollback()
        raise

    if dry_run:
        await db.rollback()
    else:
        await db.commit()
    logger.info(f"[IMPORT V1] {'(à blanc) ' if dry_run else ''}ajoutées={report.inserted} déjà présentes={report.present}")
    return report
