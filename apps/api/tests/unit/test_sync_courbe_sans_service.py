"""Courbe de charge non souscrite chez Enedis (ADAM-ERR0191) : pas de boucle sur l'historique

Cas d'un PDL de production en revente totale (CRAE) : Enedis ne fournit que l'index quotidien et répond
ADAM-ERR0191 à chaque semaine de courbe de charge. Sans mémorisation, la synchro redemandait les ~104
semaines des deux dernières années à chaque passage et épuisait le quota de la passerelle (1000/jour).
"""

from datetime import UTC, date, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.models.client_mode import DataGranularity, ProductionData, SyncStatus, SyncStatusType
from src.services.sync import NO_SERVICE_MARKER, SyncService, _no_service_before

PRM = "12345678901234"
TODAY = date.today()

NO_SERVICE = {
    "success": False,
    "data": None,
    "error": {
        "code": "ENEDIS_ERROR",
        "message": "ADAM-ERR0191: La demande ne peut aboutir : aucun service souscrit ACCES à la donnée "
        "pour la période demandée.",
    },
}


def make_service(sync_status: SyncStatus) -> SyncService:
    service = SyncService.__new__(SyncService)
    service.db = MagicMock()
    service.db.commit = AsyncMock()
    service.db.rollback = AsyncMock()
    service.adapter = MagicMock()
    service._get_or_create_sync_status = AsyncMock(return_value=sync_status)
    service._sync_start = AsyncMock(side_effect=lambda _pdl, _type, start, _end: start)
    service._upsert_energy_records = AsyncMock()
    service._parse_meter_reading = MagicMock(return_value=[])

    # Base locale vide : toute la fenêtre demandée est manquante
    async def missing(_model, _pdl, start, end, _gran, _force=None):
        return [(start, end)] if start < end else []

    service._find_missing_ranges = AsyncMock(side_effect=missing)
    return service


def detailed_status() -> SyncStatus:
    return SyncStatus(
        usage_point_id=PRM, data_type="production", granularity=DataGranularity.DETAILED,
        status=SyncStatusType.PENDING, error_count=0, total_records=0,
    )


async def run(service: SyncService, fetch) -> int:
    return await service._sync_energy_data(
        usage_point_id=PRM, data_type="production", granularity=DataGranularity.DETAILED,
        max_days=730, fetch_func=fetch, model_class=ProductionData,
    )


@pytest.mark.asyncio
async def test_aucune_courbe_une_seule_requete_puis_plus_rien() -> None:
    status = detailed_status()
    service = make_service(status)
    fetch = AsyncMock(return_value=NO_SERVICE)

    await run(service, fetch)

    # La semaine la plus récente est demandée en premier, puis la synchro s'arrête
    assert fetch.await_count == 1
    assert fetch.await_args.args[2] == TODAY.isoformat()
    assert status.error_message == f"{NO_SERVICE_MARKER}{TODAY.isoformat()}"
    assert status.status == SyncStatusType.SUCCESS

    # Passage suivant : plus aucune requête pendant 7 jours
    fetch.reset_mock()
    await run(service, fetch)
    assert fetch.await_count == 0


@pytest.mark.asyncio
async def test_courbe_souscrite_recemment_seules_les_semaines_recentes() -> None:
    status = detailed_status()
    service = make_service(status)
    subscribed = TODAY - timedelta(days=20)

    async def fetch(_pdl, start, _end):
        return NO_SERVICE if date.fromisoformat(start) < subscribed else {"success": True, "data": {}}

    fetch_mock = AsyncMock(side_effect=fetch)
    await run(service, fetch_mock)

    # 3 semaines récentes demandées, la 4e (avant la souscription) arrête la remontée
    assert fetch_mock.await_count == 4
    marker_date = date.fromisoformat(status.error_message[len(NO_SERVICE_MARKER):][:10])
    assert TODAY - timedelta(days=28) < marker_date <= subscribed + timedelta(days=7)

    # Passage suivant : seules les semaines après la date mémorisée restent demandables
    fetch_mock.reset_mock()
    await run(service, fetch_mock)
    assert all(date.fromisoformat(call.args[1]) >= marker_date for call in fetch_mock.await_args_list)


@pytest.mark.asyncio
async def test_nouvel_essai_apres_sept_jours() -> None:
    status = detailed_status()
    status.error_message = f"{NO_SERVICE_MARKER}{TODAY.isoformat()}"
    status.last_error_at = datetime.now(UTC) - timedelta(days=8)
    service = make_service(status)
    fetch = AsyncMock(return_value=NO_SERVICE)

    await run(service, fetch)

    # La collecte a peut-être été activée chez Enedis : on redemande (une semaine suffit à le savoir)
    assert fetch.await_count == 1
    assert datetime.now(UTC) - status.last_error_at < timedelta(minutes=1)


@pytest.mark.asyncio
async def test_quotidien_non_concerne() -> None:
    status = SyncStatus(
        usage_point_id=PRM, data_type="production", granularity=DataGranularity.DAILY,
        status=SyncStatusType.PENDING, error_count=0, total_records=0,
    )
    service = make_service(status)
    service._daily_upsert_is_effective = AsyncMock(return_value=False)
    fetch = AsyncMock(return_value=NO_SERVICE)

    await service._sync_energy_data(
        usage_point_id=PRM, data_type="production", granularity=DataGranularity.DAILY,
        max_days=30, fetch_func=fetch, model_class=ProductionData,
    )

    assert fetch.await_count == 1  # 30 jours = un seul appel, comportement inchangé
    assert status.error_message is None


def test_marqueur_ignore_sans_date_de_constatation() -> None:
    status = detailed_status()
    status.error_message = f"{NO_SERVICE_MARKER}{TODAY.isoformat()}"
    assert _no_service_before(status, datetime.now(UTC)) is None
    status.last_error_at = datetime.now(UTC)
    assert _no_service_before(status, datetime.now(UTC)) == TODAY
