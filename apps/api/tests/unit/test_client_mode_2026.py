"""Mode client : lecture de la passerelle au format Data Connect 2026, et v5 pendant la transition (MED-14)."""

from datetime import date
from unittest.mock import MagicMock

from src.models.client_mode import DataGranularity
from src.routers.enedis_client import extract_readings_from_response
from src.services.local_data import LocalDataService, format_daily_response, format_detail_response
from src.services.sync import SyncService

PRM = "99999999999991"


def envelope(data):
    return {"success": True, "data": data}


def sync_service() -> SyncService:
    service = SyncService.__new__(SyncService)  # sans adapter réseau ni base
    service.db = MagicMock()
    return service


class TestParseMeterReading:
    def test_courbe_2026(self, enedis_fixture):
        records = sync_service()._parse_meter_reading(
            envelope(enedis_fixture("mesure_courbe_de_charge_consommation")), PRM, DataGranularity.DETAILED
        )

        assert len(records) == 96
        assert records[0]["date"] == date(2026, 9, 29)
        assert records[0]["interval_start"] == "00:30"
        assert records[0]["value"] == 4078
        assert records[0]["raw_data"]["p"] == "PT30M"

    def test_passerelle_encore_en_v5(self, enedis_fixture):
        records = sync_service()._parse_meter_reading(
            envelope(enedis_fixture("v5_consumption_load_curve")), PRM, DataGranularity.DETAILED
        )

        assert len(records) == 96
        assert records[0]["value"] == 4078

    def test_quotidien_2026(self, enedis_fixture):
        records = sync_service()._parse_meter_reading(
            envelope(enedis_fixture("mesure_consommation_quotidienne")), PRM, DataGranularity.DAILY
        )

        assert [(r["date"], r["value"], r["interval_start"]) for r in records] == [
            (date(2026, 9, 29), 33495, None),
            (date(2026, 9, 30), 38022, None),
        ]


def test_lectures_de_la_passerelle_en_points_2026(enedis_fixture):
    v5 = envelope(enedis_fixture("v5_consumption_load_curve"))
    nouveau = envelope(enedis_fixture("mesure_courbe_de_charge_consommation"))

    assert extract_readings_from_response(v5)[0]["v"] == "4078"
    assert extract_readings_from_response(nouveau)[0] == {
        "v": "4078",
        "d": "2026-09-29 00:30:00",
        "p": "PT30M",
        "n": "B",
        "iv": "0",
        "ec": "0",
    }


def test_reponses_locales_au_format_2026():
    daily = format_daily_response(PRM, "2026-09-29", "2026-09-30", [{"v": "33495", "d": "2026-09-29"}], True, "PROD")
    detail = format_detail_response(PRM, "2026-09-29", "2026-09-30", [{"v": "4078", "d": "2026-09-29 00:00:00"}])

    assert daily["grandeur"][0]["grandeurMetier"] == "PROD"
    assert daily["grandeur"][0]["unite"] == "Wh"
    assert daily["_from_local_cache"] is True
    assert detail["grandeur"][0]["unite"] == "W"
    assert detail["grandeur"][0]["grandeurMetier"] == "CONS"


class TestExtractionContratAdresse:
    def test_contrat_2026(self, enedis_fixture):
        contrat = {
            "situation_contrat": enedis_fixture("situation_contrat_autoconsommation"),
            "synthese_contrat": enedis_fixture("synth_contrat_autoconsommation"),
            "comptage": {"relais": {"plageHeuresCreuses": "HC (22H00-6H00)"}},
        }

        info = LocalDataService(MagicMock())._extract_contract_from_response(envelope(contrat), PRM)

        assert info == {"subscribed_power": 12, "offpeak_hours": {"ranges": ["22:00-06:00"]}, "segment": "C5"}

    def test_contrat_v5_d_une_ancienne_passerelle(self):
        v5 = {"customer": {"usage_points": [{"contracts": {"subscribed_power": "6 kVA", "segment": "C5"}}]}}

        info = LocalDataService(MagicMock())._extract_contract_from_response(envelope(v5), PRM)

        assert info["subscribed_power"] == 6

    def test_adresse_2026(self):
        adresse = {"address": {"number_street_name": "1 RUE X", "postal_code_city": "75001 PARIS", "insee_code": "75101"}}

        info = LocalDataService(MagicMock())._extract_address_from_response(envelope(adresse), PRM)

        assert info["postal_code"] == "75001"
        assert info["city"] == "PARIS"
