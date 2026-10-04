"""Mode client : correctifs repris de la PR #110 (jrozelle), portés sur Data Connect 2026 (MED-17).

Contrat de dates retenu : la borne de fin est EXCLUE partout (Data Connect 2026 : « dateFin, fin exclue »).
La PR passait `local_data` en borne incluse alors que le front envoie `today` : on garde l'exclusion.
"""

from datetime import date, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

from sqlalchemy.dialects import postgresql
from sqlalchemy.schema import CreateTable

from src.models.client_mode import ConsumptionData, DataGranularity, ProductionData
from src.services.exporters.home_assistant import HomeAssistantExporter
from src.services.local_data import LocalDataService
from src.services.statistics import StatisticsService
from src.services.sync import SyncService

PRM = "99999999999991"
TODAY = date.today()
YESTERDAY = TODAY - timedelta(days=1)


class FakeResult:
    """Résultat SQLAlchemy minimal : scalar(), scalars().all(), fetchall()"""

    def __init__(self, scalar=None, rows=None):
        self._scalar = scalar
        self._rows = rows or []

    def scalar(self):
        return self._scalar

    def scalars(self):
        return SimpleNamespace(all=lambda: list(self._rows))

    def fetchall(self):
        return [(row,) for row in self._rows]

    def all(self):
        return list(self._rows)


def db_with(*results):
    db = MagicMock()
    db.execute = AsyncMock(side_effect=list(results))
    db.commit = AsyncMock()
    db.rollback = AsyncMock()
    return db


def sync_service(db):
    service = SyncService.__new__(SyncService)
    service.db = db
    service.adapter = MagicMock()
    return service


# --- Off-by-one de la sync : la veille (J-1) doit être demandée -----------------------------


async def test_sync_demande_la_veille_avec_une_fin_exclue_a_aujourd_hui():
    """Base vide : la dernière plage demandée à la passerelle se termine (exclue) à aujourd'hui."""
    db = db_with(FakeResult(rows=[]))
    service = sync_service(db)
    service._get_or_create_sync_status = AsyncMock(
        return_value=SimpleNamespace(
            status=None, last_sync_at=None, error_message=None, error_count=0,
            records_synced_last_run=0, total_records=0, oldest_data_date=None,
            newest_data_date=None, next_sync_at=None, last_error_at=None,
        )
    )
    fetch = AsyncMock(return_value={"success": True, "data": None})

    await service._sync_energy_data(
        usage_point_id=PRM,
        data_type="consumption",
        granularity=DataGranularity.DAILY,
        max_days=30,
        fetch_func=fetch,
        model_class=ConsumptionData,
    )

    ends = [date.fromisoformat(call.args[2]) for call in fetch.await_args_list]
    assert max(ends) == TODAY


async def test_local_data_fin_exclue_aujourd_hui_ne_demande_que_la_veille():
    """Garde-fou contre le `<=` de la PR : avec end=today (exclu), seul J-1 manque, jamais aujourd'hui."""
    start = TODAY - timedelta(days=5)
    present = [start + timedelta(days=i) for i in range(4)]  # J-5 .. J-2
    service = LocalDataService(db_with(FakeResult(rows=present)))

    ranges = await service._find_missing_ranges(
        model=ConsumptionData,
        usage_point_id=PRM,
        start_date=start,
        end_date=TODAY,
        granularity=DataGranularity.DAILY,
    )

    assert ranges == [(YESTERDAY, TODAY)]


# --- NULLS NOT DISTINCT : l'upsert des mesures quotidiennes (interval_start NULL) -----------


def _ddl(model) -> str:
    return str(CreateTable(model.__table__).compile(dialect=postgresql.dialect()))


def test_contrainte_unique_conso_nulls_not_distinct():
    assert "NULLS NOT DISTINCT" in _ddl(ConsumptionData)


def test_contrainte_unique_prod_nulls_not_distinct():
    assert "NULLS NOT DISTINCT" in _ddl(ProductionData)


# --- Puissance max quotidienne ---------------------------------------------------------------


def test_modele_max_power_contrainte_unique():
    from src.models.client_mode import MaxPowerData

    ddl = _ddl(MaxPowerData)
    assert "uq_max_power_data" in ddl
    assert "NULLS NOT DISTINCT" in ddl


async def test_sync_max_power_ne_demande_jamais_au_dela_de_la_veille():
    """Enedis refuse une fin >= aujourd'hui sur la puissance max (constat de la PR, à confirmer en live)."""
    db = MagicMock()
    db.execute = AsyncMock(return_value=FakeResult(rows=[], scalar=None))
    db.commit = AsyncMock()
    db.rollback = AsyncMock()
    service = sync_service(db)
    service.adapter.get_consumption_max_power = AsyncMock(return_value={"success": True, "data": None})
    service._get_or_create_sync_status = AsyncMock(
        return_value=SimpleNamespace(
            status=None, last_sync_at=None, error_message=None, error_count=0,
            records_synced_last_run=0, total_records=0, oldest_data_date=None,
            newest_data_date=None, next_sync_at=None, last_error_at=None,
        )
    )

    await service._sync_consumption_max_power(PRM)

    calls = service.adapter.get_consumption_max_power.await_args_list
    assert calls, "la sync max power doit interroger la passerelle quand la base est vide"
    assert max(date.fromisoformat(c.args[2]) for c in calls) <= YESTERDAY


# --- Statistiques : repli sur les mesures détaillées, selon le pas réel ----------------------


async def test_get_day_total_replie_sur_le_detail_au_pas_30_minutes():
    detail = [
        SimpleNamespace(value=1000, interval_start="00:00", raw_data={"p": "PT30M"}),
        SimpleNamespace(value=3000, interval_start="00:30", raw_data={"p": "PT30M"}),
    ]
    stats = StatisticsService(db_with(FakeResult(scalar=0), FakeResult(rows=detail)))

    assert await stats.get_day_total(PRM, YESTERDAY, "consumption") == 2000


async def test_get_day_total_replie_sur_le_detail_au_pas_10_minutes():
    """La PR supposait W/2 (pas de 30 min) : faux pour un compteur au pas de 10 minutes."""
    detail = [
        SimpleNamespace(value=600, interval_start=f"00:{m:02d}", raw_data={"p": "PT10M"})
        for m in range(0, 60, 10)
    ]
    stats = StatisticsService(db_with(FakeResult(scalar=0), FakeResult(rows=detail)))

    assert await stats.get_day_total(PRM, YESTERDAY, "consumption") == 600


async def test_get_day_total_garde_le_quotidien_quand_il_existe():
    stats = StatisticsService(db_with(FakeResult(scalar=12345)))

    assert await stats.get_day_total(PRM, YESTERDAY, "consumption") == 12345


# --- Export Home Assistant : topics préfixés (v1 et v2 cohabitent) ---------------------------


async def test_export_ha_respecte_le_prefixe_configure():
    exporter = HomeAssistantExporter({"mqtt_broker": "mqtt.local", "entity_prefix": "med_v2"})
    client = MagicMock()
    client.publish = AsyncMock()
    stats = MagicMock()
    stats.get_day_total = AsyncMock(return_value=1000)

    await exporter._export_consumption_stats(client, stats, PRM)

    topics = [call.args[0] for call in client.publish.await_args_list]
    assert topics
    assert not [t for t in topics if "myelectricaldata_" in t], topics
    assert all("med_v2" in t for t in topics), topics
