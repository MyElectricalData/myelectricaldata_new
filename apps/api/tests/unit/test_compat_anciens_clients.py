"""Compatibilité des conteneurs locaux <= 1.22.0 avec la passerelle 2.x (MED-12).

Un client 1.22.0 lit les réponses de la passerelle au format v5 :
    - mesures : data.meter_reading.interval_reading[].{value, date}
    - contrat : data.customer.usage_points[].{usage_point.usage_point_id, contracts.{subscribed_power, offpeak_hours, ...}}
    - adresse : data.customer.usage_points[].usage_point.usage_point_addresses.{street, postal_code, city, ...}
Face à une réponse 2026, il enregistre 0 donnée sans erreur. La passerelle sert donc
le v5 à tout appelant qui n'envoie pas l'en-tête `X-MED-Format: 2026`.
"""

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from src.adapters.enedis_format import extract_points, v5_to_2026
from src.routers.format_negotiation import FORMAT_HEADER, legacy_v5
from src.schemas import APIResponse
from src.services.enedis_legacy import address_2026_to_v5, contract_2026_to_v5, measure_2026_to_v5

PRM = "99999999999991"


class TestMesure2026VersV5:
    def test_lectures_v5_identiques_aux_points_2026(self, enedis_fixture):
        cdc = enedis_fixture("mesure_courbe_de_charge_consommation")

        v5 = measure_2026_to_v5(cdc)

        readings = v5["meter_reading"]["interval_reading"]
        points = cdc["grandeur"][0]["points"]
        assert len(readings) == len(points) == 96
        assert readings[0] == {"value": "4078", "date": "2026-09-29 00:30:00", "interval_length": "PT30M", "measure_type": "B"}
        assert v5["meter_reading"]["usage_point_id"] == PRM
        assert v5["meter_reading"]["start"] == "2026-09-29"
        assert v5["meter_reading"]["end"] == "2026-10-01"
        assert v5["meter_reading"]["reading_type"]["unit"] == "W"

    def test_aller_retour_sans_perte(self, enedis_fixture):
        for name, metier, physique in [
            ("mesure_consommation_quotidienne", "CONS", "EA"),
            ("mesure_production_quotidienne", "PROD", "EA"),
            ("mesure_puissance_conso_max_quotidienne", "CONS", "PMA"),
            ("mesure_courbe_de_charge_production", "PROD", "PA"),
        ]:
            mesure = enedis_fixture(name)

            retour = v5_to_2026(measure_2026_to_v5(mesure), grandeur_metier=metier, grandeur_physique=physique)

            assert extract_points(retour) == [
                {k: p[k] for k in ("v", "d", "p", "n") if k in p} for p in mesure["grandeur"][0]["points"]
            ], name

    def test_reponse_sans_mesure_rendue_telle_quelle(self, enedis_fixture):
        erreur = enedis_fixture("erreur_adam_err0123")

        assert measure_2026_to_v5(erreur) == erreur
        assert measure_2026_to_v5(None) is None


class TestContrat2026VersV5:
    def test_champs_lus_par_le_client_1_22(self, enedis_fixture):
        contrat = {
            "situation_contrat": enedis_fixture("situation_contrat_consommateur"),
            "synthese_contrat": enedis_fixture("synth_contrat_consommateur"),
            "comptage": {"relais": {"plageHeuresCreuses": "HC (22H00-6H00)"}},
        }

        v5 = contract_2026_to_v5(contrat, PRM)

        usage_point = v5["customer"]["usage_points"][0]
        assert usage_point["usage_point"]["usage_point_id"] == PRM
        contracts = usage_point["contracts"]
        assert contracts["subscribed_power"] == "12 kVA"
        assert contracts["offpeak_hours"] == "HC (22H00-6H00)"
        assert contracts["distribution_tariff"].startswith("Tarif BT<=36kVA")
        assert contracts["segment"] == "C5"
        assert contracts["last_activation_date"] == "2018-08-31"

    def test_autoconsommation_garde_le_contrat_de_soutirage(self, enedis_fixture):
        contrat = {
            "situation_contrat": enedis_fixture("situation_contrat_autoconsommation"),
            "synthese_contrat": enedis_fixture("synth_contrat_autoconsommation"),
            "comptage": None,
        }

        contracts = contract_2026_to_v5(contrat, PRM)["customer"]["usage_points"][0]["contracts"]

        assert contracts["subscribed_power"].endswith(" kVA")
        assert "offpeak_hours" not in contracts

    def test_plages_hc_heritees_en_dict(self):
        contrat = {
            "situation_contrat": [{"subscribed_power": {"value": "6", "unit": "kVA"}}],
            "synthese_contrat": {},
            "comptage": {"relais": {"plageHeuresCreuses": {"default": "HC (22H00-6H00)"}}},
        }

        contracts = contract_2026_to_v5(contrat, PRM)["customer"]["usage_points"][0]["contracts"]

        assert contracts["offpeak_hours"] == {"default": "HC (22H00-6H00)"}

    def test_reponse_inconnue_rendue_telle_quelle(self):
        assert contract_2026_to_v5({"foo": 1}, PRM) == {"foo": 1}


class TestAdresse2026VersV5:
    def test_champs_lus_par_le_client_1_22(self):
        adresse = {"address": {"number_street_name": "1 RUE DU FOUR", "postal_code_city": "59199 BRUILLE ST AMAND", "insee_code": "59112"}}

        v5 = address_2026_to_v5(adresse, PRM)

        usage_point = v5["customer"]["usage_points"][0]["usage_point"]
        assert usage_point["usage_point_id"] == PRM
        assert usage_point["usage_point_addresses"] == {
            "street": "1 RUE DU FOUR",
            "postal_code": "59199",
            "city": "BRUILLE ST AMAND",
            "insee_code": "59112",
            "country": "France",
        }


def _app() -> FastAPI:
    app = FastAPI()

    @app.get("/mesure/{usage_point_id}", response_model=APIResponse)
    @legacy_v5("measure")
    async def mesure(request: Request, usage_point_id: str) -> APIResponse:
        return APIResponse(success=True, data={"idPrm": usage_point_id, "grandeur": [{"unite": "Wh", "points": [{"v": "1", "d": "2026-10-01"}]}]})

    @app.get("/erreur/{usage_point_id}", response_model=APIResponse)
    @legacy_v5("measure")
    async def erreur(request: Request, usage_point_id: str) -> APIResponse:
        return APIResponse(success=False, error={"code": "NO_DATA", "message": "rien"})

    return app


class TestNegociationDeFormat:
    def test_sans_en_tete_v5_et_deprecation(self):
        response = TestClient(_app()).get(f"/mesure/{PRM}")

        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        assert body["data"]["meter_reading"]["interval_reading"] == [{"value": "1", "date": "2026-10-01"}]
        assert response.headers["Deprecation"] == "true"

    def test_avec_en_tete_2026_sans_deprecation(self):
        response = TestClient(_app()).get(f"/mesure/{PRM}", headers={FORMAT_HEADER: "2026"})

        assert response.json()["data"]["grandeur"][0]["points"] == [{"v": "1", "d": "2026-10-01"}]
        assert "Deprecation" not in response.headers

    def test_erreur_inchangee(self):
        body = TestClient(_app()).get(f"/erreur/{PRM}").json()

        assert body["success"] is False
        assert body["error"]["code"] == "NO_DATA"


def test_le_client_2x_demande_le_2026_et_annonce_sa_version():
    from src.adapters.myelectricaldata import MyElectricalDataAdapter
    from src.config import APP_VERSION

    headers = MyElectricalDataAdapter()._get_headers("jeton")

    assert headers[FORMAT_HEADER] == "2026"
    assert headers["User-Agent"] == f"MyElectricalData-Client/{APP_VERSION}"
