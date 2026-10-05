"""Mode client : correctifs repris de la PR #110 (jrozelle), portés sur Data Connect 2026 (MED-17).

Contrat de dates retenu : la borne de fin est EXCLUE partout (Data Connect 2026 : « dateFin, fin exclue »).
La PR passait `local_data` en borne incluse alors que le front envoie `today` : on garde l'exclusion.
"""

from datetime import UTC, date, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

from sqlalchemy.dialects import postgresql
from sqlalchemy.schema import CreateTable

from src.models.client_mode import ConsumptionData, DataGranularity, ProductionData
from src.services.exporters.home_assistant import HomeAssistantExporter
from src.routers import enedis_client
from src.services.local_data import LocalDataService, _missing_ranges, parse_max_power_points
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


async def test_sync_demande_la_veille_avec_une_fin_exclue_a_aujourd_hui(monkeypatch):
    """Base vide : la dernière plage demandée à la passerelle se termine (exclue) à aujourd'hui."""
    monkeypatch.setattr("src.services.sync._daily_upsert_effective", True)
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
    """Une ligne par jour et par PDL (colonnes NOT NULL : NULLS NOT DISTINCT sans objet)."""
    from src.models.client_mode import MaxPowerData

    assert "CONSTRAINT uq_max_power_data UNIQUE (usage_point_id, date)" in _ddl(MaxPowerData)


async def test_sync_max_power_demande_la_veille_sans_aller_jusqu_a_demain():
    """Enedis refusait une fin à demain (commit 45a8c66 de la PR) : fin exclue à aujourd'hui, J-1 inclus."""
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
    assert max(date.fromisoformat(c.args[2]) for c in calls) == TODAY


def test_parse_max_power_garde_l_heure_reelle_du_pic(enedis_fixture):
    reponse = {"success": True, "data": enedis_fixture("mesure_puissance_conso_max_quotidienne")}

    records = parse_max_power_points(reponse, PRM)

    assert [(r["date"], r["interval_start"], r["value"]) for r in records] == [
        (date(2026, 9, 29), "13:03", 4680),
        (date(2026, 9, 30), "12:50", 6510),
    ]


# --- Regroupement des trous et fenêtre de rafraîchissement ------------------------------------


def test_missing_ranges_regroupe_les_trous_fin_exclue():
    d = date(2026, 10, 1)
    present = {d + timedelta(days=i) for i in (0, 1, 4)}

    assert _missing_ranges(d, d + timedelta(days=6), present) == [
        (d + timedelta(days=2), d + timedelta(days=4)),
        (d + timedelta(days=5), d + timedelta(days=6)),
    ]


def test_missing_ranges_redemande_la_fenetre_forcee():
    d = date(2026, 10, 1)
    present = {d + timedelta(days=i) for i in range(5)}

    assert _missing_ranges(d, d + timedelta(days=5), present, force_refresh_from=d + timedelta(days=3)) == [
        (d + timedelta(days=3), d + timedelta(days=5)),
    ]


def test_fenetre_forcee_seulement_apres_six_heures():
    service = sync_service(MagicMock())
    recent = SimpleNamespace(last_sync_at=datetime.now(UTC) - timedelta(hours=1))
    ancien = SimpleNamespace(last_sync_at=datetime.now(UTC) - timedelta(hours=7))
    start = TODAY - timedelta(days=30)

    assert service._force_refresh_from(recent, start, TODAY) is None
    assert service._force_refresh_from(ancien, start, TODAY) == TODAY - timedelta(days=2)


# --- Statistiques : repli sur les mesures détaillées, selon le pas réel ----------------------


async def test_get_day_total_replie_sur_le_detail_au_pas_30_minutes():
    detail = [
        SimpleNamespace(value=1000, interval_start="00:00", raw_data={"p": "PT30M"}),
        SimpleNamespace(value=3000, interval_start="00:30", raw_data={"p": "PT30M"}),
    ]
    stats = StatisticsService(db_with(FakeResult(scalar=None), FakeResult(rows=detail)))

    assert await stats.get_day_total(PRM, YESTERDAY, "consumption") == 2000


async def test_get_day_total_replie_sur_le_detail_au_pas_10_minutes():
    """La PR supposait W/2 (pas de 30 min) : faux pour un compteur au pas de 10 minutes."""
    detail = [
        SimpleNamespace(value=600, interval_start=f"00:{m:02d}", raw_data={"p": "PT10M"})
        for m in range(0, 60, 10)
    ]
    stats = StatisticsService(db_with(FakeResult(scalar=None), FakeResult(rows=detail)))

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


# --- Route puissance max : base locale d'abord ------------------------------------------------


async def test_max_power_servi_depuis_la_base_ne_sollicite_pas_la_passerelle(monkeypatch):
    service = MagicMock()
    service.get_max_power = AsyncMock(return_value=([{"v": "6510", "d": "2026-09-30 12:50:00"}], []))
    adapter = MagicMock(get_consumption_max_power=AsyncMock())
    monkeypatch.setattr(enedis_client, "LocalDataService", lambda db: service)
    monkeypatch.setattr(enedis_client, "get_med_adapter", lambda: adapter)

    data = await enedis_client._max_power_data(MagicMock(), PRM, "2026-09-30", "2026-10-01", use_cache=True)

    adapter.get_consumption_max_power.assert_not_awaited()
    grandeur = data["grandeur"][0]
    assert (grandeur["grandeurPhysique"], grandeur["unite"]) == ("PMA", "VA")
    assert grandeur["points"] == [{"v": "6510", "d": "2026-09-30 12:50:00"}]


async def test_max_power_complete_les_jours_manquants_puis_relit_la_base(monkeypatch, enedis_fixture):
    service = MagicMock()
    service.get_max_power = AsyncMock(side_effect=[
        ([], [(date(2026, 9, 29), date(2026, 10, 1))]),
        ([{"v": "4680", "d": "2026-09-29 13:03:00"}, {"v": "6510", "d": "2026-09-30 12:50:00"}], []),
    ])
    service.save_max_power = AsyncMock()
    reponse = {"success": True, "data": enedis_fixture("mesure_puissance_conso_max_quotidienne")}
    adapter = MagicMock(get_consumption_max_power=AsyncMock(return_value=reponse))
    monkeypatch.setattr(enedis_client, "LocalDataService", lambda db: service)
    monkeypatch.setattr(enedis_client, "get_med_adapter", lambda: adapter)

    data = await enedis_client._max_power_data(MagicMock(), PRM, "2026-09-29", "2026-10-01", use_cache=True)

    adapter.get_consumption_max_power.assert_awaited_once_with(PRM, "2026-09-29", "2026-10-01")
    assert [r["value"] for r in service.save_max_power.await_args.args[0]] == [4680, 6510]
    assert len(data["grandeur"][0]["points"]) == 2


# --- Lots détaillés vides : mise en attente des seuls blocs anciens --------------------------


def test_bloc_detaille_ancien_vide_mis_en_attente(monkeypatch):
    monkeypatch.setattr(enedis_client, "_detail_chunk_backoff", {})

    enedis_client._backoff_chunk("ancien", TODAY - timedelta(days=30))
    enedis_client._backoff_chunk("recent", TODAY)

    assert enedis_client._chunk_in_backoff("ancien")
    assert not enedis_client._chunk_in_backoff("recent")


# --- Adapter passerelle : cache serveur jour par jour (quota Enedis épargné) -----------------


async def test_adapter_demande_le_cache_serveur_pour_les_mesures():
    from src.adapters.myelectricaldata import MyElectricalDataAdapter

    adapter = MyElectricalDataAdapter.__new__(MyElectricalDataAdapter)
    adapter._make_request = AsyncMock(return_value={})
    for method in ("get_consumption_daily", "get_consumption_detail", "get_consumption_max_power",
                   "get_production_daily", "get_production_detail"):
        await getattr(adapter, method)(PRM, "2026-09-01", "2026-10-01")

    assert all(call.kwargs["params"]["use_cache"] == "true" for call in adapter._make_request.await_args_list)
    assert adapter._make_request.await_count == 5


# --- Lot 3 : hôtes acceptés, planning du scheduler, saut au démarrage --------------------------


def test_allowed_hosts_par_mode():
    from src.config.settings import Settings

    assert Settings(SERVER_MODE=False, SECRET_KEY="x").allowed_hosts == ["*"]
    serveur = Settings(SERVER_MODE=True, SECRET_KEY="x").allowed_hosts
    assert "*.myelectricaldata.fr" in serveur and "*" not in serveur
    assert Settings(SERVER_MODE=False, SECRET_KEY="x", ALLOWED_HOSTS="med.maison.lan, 192.168.1.10").allowed_hosts == [
        "med.maison.lan",
        "192.168.1.10",
    ]


def test_scheduler_planning_garde_les_syncs_au_demarrage(monkeypatch):
    from src import scheduler as scheduler_module

    jobs: dict[str, dict] = {}

    class FakeScheduler:
        def add_job(self, func, trigger=None, **kwargs):
            jobs[kwargs["id"]] = {"trigger": str(trigger), **kwargs}

        def start(self):
            pass

    monkeypatch.setattr(scheduler_module, "AsyncIOScheduler", FakeScheduler)
    monkeypatch.setattr(scheduler_module.settings, "SERVER_MODE", False)

    scheduler_module.SyncScheduler().start()

    demarrage = {job_id for job_id, job in jobs.items() if job.get("next_run_time")}
    assert {"sync_all_startup", "sync_tempo_startup", "sync_ecowatt_fallback",
            "sync_consumption_france_startup", "sync_generation_forecast_startup"} <= demarrage
    assert "hour='6-9', minute='*/30'" in jobs["sync_all_morning"]["trigger"]
    assert jobs["sync_consumption_france_startup"]["kwargs"] == {"min_interval": timedelta(hours=6)}
    assert "interval" not in jobs["sync_tempo"]["trigger"]


async def test_sync_lance_les_exports_planifies_sans_attendre_l_echeance(monkeypatch):
    from src import scheduler as scheduler_module

    sched = scheduler_module.SyncScheduler()
    monkeypatch.setattr("src.services.sync.SyncService.sync_all", AsyncMock(return_value={"success": True}))
    sched._run_scheduled_exports = AsyncMock()

    await sched._run_sync()

    sched._run_scheduled_exports.assert_awaited_once_with(force=True)


async def test_sync_france_ignoree_au_demarrage_si_recente():
    service = sync_service(MagicMock())
    service.get_sync_tracker = AsyncMock(return_value=datetime.now(UTC) - timedelta(hours=1))
    service._update_sync_tracker = AsyncMock()

    result = await service.sync_consumption_france(min_interval=timedelta(hours=6))

    assert result["skipped"] is True
    service._update_sync_tracker.assert_not_awaited()


# --- Corrections de la revue -------------------------------------------------------------------


async def _forced_window(monkeypatch, constraint_def: str):
    monkeypatch.setattr("src.services.sync._daily_upsert_effective", None)
    present = {TODAY - timedelta(days=i) for i in range(1, 31)}  # base complète sur 30 jours
    db = db_with(FakeResult(scalar=constraint_def), FakeResult(rows=sorted(present)))
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
        usage_point_id=PRM, data_type="consumption", granularity=DataGranularity.DAILY,
        max_days=30, fetch_func=fetch, model_class=ConsumptionData,
    )
    return [(c.args[1], c.args[2]) for c in fetch.await_args_list]


async def test_rafraichissement_force_avec_nulls_not_distinct(monkeypatch):
    calls = await _forced_window(
        monkeypatch, "UNIQUE NULLS NOT DISTINCT (usage_point_id, date, granularity, interval_start)"
    )

    assert calls == [((TODAY - timedelta(days=2)).isoformat(), TODAY.isoformat())]


async def test_pas_de_rafraichissement_force_sous_postgresql_14(monkeypatch):
    """Sans NULLS NOT DISTINCT, redemander J-2/J-1 les insérerait une seconde fois (totaux doublés)."""
    calls = await _forced_window(monkeypatch, "UNIQUE (usage_point_id, date, granularity, interval_start)")

    assert calls == []


async def test_une_seule_sync_a_la_fois():
    import asyncio

    from src import scheduler as scheduler_module

    sched = scheduler_module.SyncScheduler()
    started, release = asyncio.Event(), asyncio.Event()
    runs = 0

    async def lente():
        nonlocal runs
        runs += 1
        started.set()
        await release.wait()

    sched._run_sync_locked = lente
    premiere = asyncio.create_task(sched._run_sync())
    await started.wait()
    await sched._run_sync()  # cron suivant pendant la sync du démarrage : sauté
    release.set()
    await premiere

    assert runs == 1


async def test_adapter_transmet_use_cache_false():
    from src.adapters.myelectricaldata import MyElectricalDataAdapter

    adapter = MyElectricalDataAdapter.__new__(MyElectricalDataAdapter)
    adapter._make_request = AsyncMock(return_value={})

    await adapter.get_consumption_max_power(PRM, "2026-09-01", "2026-10-01", use_cache=False)

    assert adapter._make_request.await_args.kwargs["params"]["use_cache"] == "false"


def test_attente_expiree_purgee(monkeypatch):
    monkeypatch.setattr(enedis_client, "_detail_chunk_backoff", {"bloc": datetime.now() - timedelta(minutes=1)})

    assert not enedis_client._chunk_in_backoff("bloc")
    assert enedis_client._detail_chunk_backoff == {}


# --- Lot 4 : préfixe des entités Home Assistant --------------------------------------------------


def test_prefixe_entite_invalide_refuse():
    import pytest

    for invalide in ("med v2", "med/v2", "med#", "med+", ""):
        with pytest.raises(ValueError):
            HomeAssistantExporter({"mqtt_broker": "mqtt.local", "entity_prefix": invalide})


def test_categorie_suit_le_prefixe_et_reconnait_hp_hc():
    exporter = HomeAssistantExporter({"mqtt_broker": "mqtt.local", "entity_prefix": "med_v2"})

    assert exporter._categorize_ha_topic("homeassistant/sensor/med_v2_rte/tempo_today/state") == "Tempo Aujourd'hui"
    assert exporter._categorize_ha_topic(f"homeassistant/sensor/med_v2_consumption/{PRM}/state") == "Conso Journalière"
    assert exporter._categorize_ha_topic(
        f"homeassistant/sensor/med_v2_consumption_this_month_hc/{PRM}/state"
    ) == "Conso HC"
    assert exporter._categorize_ha_topic(
        f"homeassistant/sensor/med_v2_consumption_yesterday_hp/{PRM}/state"
    ) == "Conso HP"
