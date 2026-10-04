"""EnedisAdapter sur Data Connect 2026, modes legacy | new | auto (MED-14).

`_make_request` est remplacé par un faux qui route sur le chemin appelé : on vérifie
l'URL et les paramètres envoyés, et ce que l'adapter rend à partir des réponses capturées.
"""

from typing import Any

import httpx
import pytest

from src.adapters.enedis import EnedisAdapter

PRM = "99999999999991"
TOKEN = "jeton"
M = "/mesure_synchrone_auto/v2"


class FakeEnedis:
    """Remplace EnedisAdapter._make_request : chemin → réponse (dict) ou code HTTP d'erreur (int)."""

    def __init__(self, routes: dict[str, Any]):
        self.routes = routes
        self.calls: list[dict[str, Any]] = []

    async def __call__(self, method, url, headers=None, data=None, params=None, json=None):
        path = url.split("enedis.fr", 1)[1]
        self.calls.append({"method": method, "path": path, "params": params, "json": json})
        response = self.routes.get(path)
        if response is None or isinstance(response, int):
            status = response or 404
            request = httpx.Request(method, url)
            raise httpx.HTTPStatusError(str(status), request=request, response=httpx.Response(status, request=request))
        return response

    def paths(self) -> list[str]:
        return [call["path"] for call in self.calls]


def make_adapter(mode: str, routes: dict[str, Any]) -> tuple[EnedisAdapter, FakeEnedis]:
    adapter = EnedisAdapter()
    adapter.base_url = "https://gw.ext.prod.api.enedis.fr"
    adapter.api_mode = mode
    fake = FakeEnedis(routes)
    adapter._make_request = fake  # type: ignore[method-assign]
    return adapter, fake


class TestModeNew:
    async def test_consommation_quotidienne(self, enedis_fixture):
        body = enedis_fixture("mesure_consommation_quotidienne")
        adapter, fake = make_adapter("new", {f"{M}/consommation_quotidienne": body})

        result = await adapter.get_consumption_daily(PRM, "2026-09-29", "2026-10-01", TOKEN)

        assert result == body
        assert fake.calls[0]["params"] == {"pointId": PRM, "dateDebut": "2026-09-29", "dateFin": "2026-10-01"}

    async def test_courbe_de_charge_decalee_au_debut_d_intervalle(self, enedis_fixture):
        adapter, _ = make_adapter(
            "new", {f"{M}/courbe_de_charge_consommation": enedis_fixture("mesure_courbe_de_charge_consommation")}
        )

        result = await adapter.get_consumption_detail(PRM, "2026-09-29", "2026-10-01", TOKEN)

        points = result["grandeur"][0]["points"]
        assert points[0]["d"] == "2026-09-29 00:00:00"
        assert points[-1]["d"] == "2026-09-30 23:30:00"

    async def test_puissance_max_parametres_obligatoires(self, enedis_fixture):
        adapter, fake = make_adapter(
            "new", {f"{M}/puissance_conso_max_quotidienne": enedis_fixture("mesure_puissance_conso_max_quotidienne")}
        )

        result = await adapter.get_max_power(PRM, "2026-09-29", "2026-10-01", TOKEN)

        assert result["grandeur"][0]["unite"] == "VA"
        assert fake.calls[0]["params"]["mesuresPas"] == "P1D"
        assert fake.calls[0]["params"]["grandeurPhysique"] == "PMA"

    async def test_production(self, enedis_fixture):
        adapter, fake = make_adapter(
            "new",
            {
                f"{M}/production_quotidienne": enedis_fixture("mesure_production_quotidienne"),
                f"{M}/courbe_de_charge_production": enedis_fixture("mesure_courbe_de_charge_production"),
            },
        )

        daily = await adapter.get_production_daily(PRM, "2026-09-29", "2026-10-01", TOKEN)
        detail = await adapter.get_production_detail(PRM, "2026-09-29", "2026-10-01", TOKEN)

        assert daily["grandeur"][0]["grandeurMetier"] == "PROD"
        assert detail["grandeur"][0]["points"][0]["d"] == "2026-09-29 00:00:00"
        assert fake.paths() == [f"{M}/production_quotidienne", f"{M}/courbe_de_charge_production"]

    async def test_adam_err0123_rendue_telle_quelle(self, enedis_fixture):
        erreur = enedis_fixture("erreur_adam_err0123")
        adapter, _ = make_adapter("new", {f"{M}/production_quotidienne": erreur})

        assert await adapter.get_production_daily(PRM, "2026-09-29", "2026-10-01", TOKEN) == erreur

    async def test_pas_de_repli_v5_en_mode_new(self):
        adapter, fake = make_adapter("new", {f"{M}/consommation_quotidienne": 500})

        with pytest.raises(httpx.HTTPStatusError):
            await adapter.get_consumption_daily(PRM, "2026-09-29", "2026-10-01", TOKEN)
        assert fake.paths() == [f"{M}/consommation_quotidienne"]

    async def test_contrat_agrege_prm_dans_le_chemin(self, enedis_fixture):
        situation = enedis_fixture("situation_contrat_consommateur")
        synthese = enedis_fixture("synth_contrat_consommateur")
        adapter, fake = make_adapter(
            "new",
            {
                f"/situation_contrat_auto/v1/{PRM}": situation,
                f"/synth_contrat_auto/v1/{PRM}": synthese,
                f"/comptage_auto/v1/{PRM}": 403,  # non souscrit pour l'app MED au 04/10/2026
            },
        )

        result = await adapter.get_contract(PRM, TOKEN)

        assert result == {"situation_contrat": situation, "synthese_contrat": synthese, "comptage": None}
        assert all(call["params"] in (None, {}) for call in fake.calls)

    async def test_adresse(self, enedis_fixture):
        adresse = enedis_fixture("donnees_generales")
        adapter, _ = make_adapter("new", {f"/donnees_generales_auto/v1/{PRM}": adresse})

        assert await adapter.get_address(PRM, TOKEN) == adresse


class TestModeAuto:
    async def test_api_2026_prioritaire(self, enedis_fixture):
        body = enedis_fixture("mesure_consommation_quotidienne")
        adapter, fake = make_adapter("auto", {f"{M}/consommation_quotidienne": body})

        assert await adapter.get_consumption_daily(PRM, "2026-09-29", "2026-10-01", TOKEN) == body
        assert fake.paths() == [f"{M}/consommation_quotidienne"]

    async def test_repli_v5_converti_au_format_2026(self, enedis_fixture):
        adapter, fake = make_adapter(
            "auto",
            {
                f"{M}/courbe_de_charge_consommation": 500,
                "/metering_data_clc/v5/consumption_load_curve": enedis_fixture("v5_consumption_load_curve"),
            },
        )

        result = await adapter.get_consumption_detail(PRM, "2026-09-29", "2026-10-01", TOKEN)

        expected = await make_adapter(
            "new", {f"{M}/courbe_de_charge_consommation": enedis_fixture("mesure_courbe_de_charge_consommation")}
        )[0].get_consumption_detail(PRM, "2026-09-29", "2026-10-01", TOKEN)
        assert fake.paths() == [f"{M}/courbe_de_charge_consommation", "/metering_data_clc/v5/consumption_load_curve"]
        assert [(p["v"], p["d"]) for p in result["grandeur"][0]["points"]] == [
            (p["v"], p["d"]) for p in expected["grandeur"][0]["points"]
        ]


V5_CONTRAT = {
    "customer": {
        "usage_points": [
            {
                "contracts": {
                    "segment": "C5",
                    "subscribed_power": "6 kVA",
                    "last_activation_date": "2018-08-31+02:00",
                    "distribution_tariff": "BTINFCU4",
                    "offpeak_hours": "HC (22H00-6H00)",
                    "contract_status": "SERVC",
                    "contract_type": "Contrat GRD-F",
                }
            }
        ]
    }
}


class TestContratModeAuto:
    async def test_heures_creuses_relayees_par_la_v5_si_comptage_indisponible(self, enedis_fixture):
        situation = enedis_fixture("situation_contrat_consommateur")
        adapter, fake = make_adapter(
            "auto",
            {
                f"/situation_contrat_auto/v1/{PRM}": situation,
                f"/synth_contrat_auto/v1/{PRM}": enedis_fixture("synth_contrat_consommateur"),
                f"/comptage_auto/v1/{PRM}": 403,
                "/customers_upc/v5/usage_points/contracts": V5_CONTRAT,
            },
        )

        result = await adapter.get_contract(PRM, TOKEN)

        assert result["situation_contrat"] == situation
        assert result["comptage"] == {"relais": {"plageHeuresCreuses": "HC (22H00-6H00)"}}
        assert fake.paths()[-1] == "/customers_upc/v5/usage_points/contracts"

    async def test_contrat_v5_converti_en_mode_legacy(self):
        adapter, _ = make_adapter("legacy", {"/customers_upc/v5/usage_points/contracts": V5_CONTRAT})

        result = await adapter.get_contract(PRM, TOKEN)

        assert result["situation_contrat"][0]["subscribed_power"] == {"value": "6", "unit": "kVA"}
        assert result["synthese_contrat"] == {"consumption_last_activation_date": "2018-08-31+02:00"}
        assert result["comptage"] == {"relais": {"plageHeuresCreuses": "HC (22H00-6H00)"}}


class TestModeLegacy:
    async def test_v5_seule_mais_format_2026(self, enedis_fixture):
        adapter, fake = make_adapter(
            "legacy", {"/metering_data_clc/v5/consumption_load_curve": enedis_fixture("v5_consumption_load_curve")}
        )

        result = await adapter.get_consumption_detail(PRM, "2026-09-29", "2026-10-01", TOKEN)

        assert fake.paths() == ["/metering_data_clc/v5/consumption_load_curve"]
        assert result["grandeur"][0]["points"][0]["d"] == "2026-09-29 00:00:00"


class TestConsentement:
    async def test_autorisation_id_echangee_contre_les_prm(self):
        services = {
            "nbTotalServices": 3,
            "serviceSouscrit": [
                {"pointId": PRM, "etatCode": "ACTIF", "soutirage": True, "injection": False},
                {"pointId": PRM, "etatCode": "ACTIF", "soutirage": False, "injection": True},
                {"pointId": "99999999999992", "etatCode": "TERMINE", "soutirage": True, "injection": False},
            ],
        }
        adapter, fake = make_adapter("new", {"/subscribed_services/v1": services})

        prms = await adapter.get_usage_points_from_authorization(123456789, TOKEN)

        assert prms == [PRM]
        assert fake.calls[0]["method"] == "POST"
        assert fake.calls[0]["json"] == {"autorisationId": 123456789, "comptage": False}
