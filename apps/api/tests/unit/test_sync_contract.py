"""Synchro du contrat en mode client : enveloppe {success, data} de la passerelle (MED-21)

Relevé en vérification de MED-10 sur une image antérieure à c455cdb (MED-14) : contract_data
restait sans plages. Garde-fou de non-régression.
"""

from unittest.mock import AsyncMock, MagicMock

from src.models.client_mode import ContractData
from src.services.sync import SyncService

PRM = "99999999999991"


def make_service(response: dict, existing: ContractData | None = None) -> tuple[SyncService, MagicMock]:
    db = MagicMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = existing
    db.execute = AsyncMock(return_value=result)
    db.commit = AsyncMock()
    service = SyncService.__new__(SyncService)
    service.db = db
    service.adapter = MagicMock()
    service.adapter.get_contract = AsyncMock(return_value=response)
    return service, db


def contract(enedis_fixture) -> dict:
    return {
        "situation_contrat": enedis_fixture("situation_contrat_consommateur"),
        "synthese_contrat": enedis_fixture("synth_contrat_consommateur"),
        "comptage": {"relais": {"plageHeuresCreuses": "HC (22H00-06H00)"}},
    }


async def test_sync_contract_unwraps_gateway_envelope(enedis_fixture) -> None:
    service, db = make_service({"success": True, "data": contract(enedis_fixture)})

    await service._sync_contract(PRM)

    [created] = [call.args[0] for call in db.add.call_args_list]
    assert isinstance(created, ContractData)
    assert created.offpeak_hours
    assert created.subscribed_power
    assert created.raw_data == contract(enedis_fixture)


async def test_sync_contract_updates_existing_row(enedis_fixture) -> None:
    existing = ContractData(usage_point_id=PRM, offpeak_hours=None, subscribed_power=None)
    service, db = make_service({"success": True, "data": contract(enedis_fixture)}, existing)

    await service._sync_contract(PRM)

    db.add.assert_not_called()
    assert existing.offpeak_hours
    assert existing.subscribed_power


async def test_sync_contract_keeps_db_values_on_unreadable_answer() -> None:
    existing = ContractData(usage_point_id=PRM, offpeak_hours={"ranges": ["22:00-06:00"]}, subscribed_power=6)
    service, db = make_service({"success": False, "error": {"code": "ADAM-ERR0123"}}, existing)

    await service._sync_contract(PRM)

    assert existing.offpeak_hours == {"ranges": ["22:00-06:00"]}
    assert existing.subscribed_power == 6
