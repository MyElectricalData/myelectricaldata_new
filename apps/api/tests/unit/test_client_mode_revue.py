"""Mode client : corrections de la revue MED-14 (heures creuses conservées, contrat v5 en base)."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

from src.adapters.enedis_format import contract_v5_to_2026, v5_to_2026
from src.services.local_data import LocalDataService

PRM = "99999999999991"


def db_returning(row):
    db = MagicMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = row
    db.execute = AsyncMock(return_value=result)
    db.commit = AsyncMock()
    return db


def contract_row(**kwargs):
    base = dict(subscribed_power=12, offpeak_hours={"ranges": ["22:00-06:00"]}, segment="C5", raw_data=None, updated_at=None)
    return SimpleNamespace(**{**base, **kwargs})


async def test_save_contract_sans_comptage_garde_les_heures_creuses(enedis_fixture):
    row = contract_row()
    service = LocalDataService(db_returning(row))
    contrat = {
        "situation_contrat": enedis_fixture("situation_contrat_consommateur"),
        "synthese_contrat": {},
        "comptage": None,
    }

    await service.save_contract(PRM, {"success": True, "data": contrat})

    assert row.offpeak_hours == {"ranges": ["22:00-06:00"]}
    assert row.subscribed_power == 12


async def test_get_contract_reinjecte_les_heures_creuses_en_base(enedis_fixture):
    raw = {"situation_contrat": enedis_fixture("situation_contrat_consommateur"), "synthese_contrat": {}, "comptage": None}
    service = LocalDataService(db_returning(contract_row(raw_data=raw)))

    data = await service.get_contract(PRM)

    assert data["comptage"] == {"relais": {"plageHeuresCreuses": "HC (22H00-06H00)"}}


async def test_get_contract_raw_data_v5_converti():
    raw = {"customer": {"usage_points": [{"contracts": {"subscribed_power": "6 kVA", "distribution_tariff": "BTINFMU4", "last_activation_date": "2018-08-31+02:00"}}]}}
    service = LocalDataService(db_returning(contract_row(raw_data=raw)))

    data = await service.get_contract(PRM)

    assert data["situation_contrat"][0]["distribution_tariff"] == "BTINFMU4"
    assert data["synthese_contrat"]["consumption_last_activation_date"] == "2018-08-31+02:00"


def test_enveloppe_d_erreur_sans_typeerror():
    assert v5_to_2026(None, grandeur_metier="CONS", grandeur_physique="EA") is None
    assert contract_v5_to_2026(None) is None
