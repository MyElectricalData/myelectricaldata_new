"""MED-115 : aucun repli v5 pour un refus HTTP d'accès ou de quota en mode auto."""

from typing import Any

import httpx
import pytest

from src.adapters.enedis import EnedisAdapter


PRM = "99999999999991"
CHEMINS = pytest.mark.parametrize(
    "methode, chemin_2026, chemin_v5",
    [
        (
            "get_consumption_detail",
            "/mesure_synchrone_auto/v2/courbe_de_charge_consommation",
            "/metering_data_clc/v5/consumption_load_curve",
        ),
        (
            "get_production_detail",
            "/mesure_synchrone_auto/v2/courbe_de_charge_production",
            "/metering_data_plc/v5/production_load_curve",
        ),
    ],
    ids=["conso", "prod"],
)


def make_adapter(mode: str, routes: dict[str, Any]) -> tuple[EnedisAdapter, list[str]]:
    """Remplacer toutes les requêtes HTTP par des réponses ou exceptions locales, en traçant les chemins."""
    adapter = EnedisAdapter()
    adapter.base_url = "https://gw.ext.prod.api.enedis.fr"
    adapter.api_mode = mode
    chemins: list[str] = []

    async def fausse_requete(method, url, **kwargs):
        chemin = url.split("enedis.fr", 1)[1]
        chemins.append(chemin)
        reponse = routes[chemin]
        if isinstance(reponse, Exception):
            raise reponse
        return reponse

    adapter._make_request = fausse_requete
    return adapter, chemins


def mesure_v5() -> dict[str, Any]:
    """Fournir une vraie mesure v5 convertible, pour que le repli puisse réussir s'il est tenté."""
    return {
        "meter_reading": {
            "usage_point_id": PRM,
            "start": "2026-09-29",
            "end": "2026-10-01",
            "reading_type": {"unit": "W", "interval_length": "PT30M"},
            "interval_reading": [{"value": "300", "date": "2026-09-29 00:30:00"}],
        }
    }


@CHEMINS
@pytest.mark.parametrize("statut", [401, 403, 429, 404])
async def test_auto_releve_le_refus_http_identique_sans_appeler_la_v5(methode, chemin_2026, chemin_v5, statut):
    """Un 401, 403, 429 ou 404 est relevé tel quel et ne consomme aucun appel v5."""
    requete = httpx.Request("GET", f"https://gw.ext.prod.api.enedis.fr{chemin_2026}")
    erreur = httpx.HTTPStatusError(
        f"Refus HTTP {statut}", request=requete, response=httpx.Response(statut, request=requete)
    )
    adapter, chemins = make_adapter("auto", {chemin_2026: erreur, chemin_v5: mesure_v5()})
    erreur_relevee = None

    try:
        await getattr(adapter, methode)(PRM, "2026-09-29", "2026-10-01", "jeton")
    except httpx.HTTPStatusError as exc:
        erreur_relevee = exc

    assert chemins == [chemin_2026], "Le refus HTTP ne doit pas déclencher de repli v5"
    assert erreur_relevee is erreur, "L'exception HTTP d'origine doit être relevée telle quelle"


@CHEMINS
@pytest.mark.parametrize("panne", ["500", "transport"])
async def test_auto_erreur_serveur_ou_transport_replie_sur_la_v5(methode, chemin_2026, chemin_v5, panne):
    """Une erreur HTTP 500 ou de transport conserve le repli v5 et rend ses mesures converties."""
    requete = httpx.Request("GET", f"https://gw.ext.prod.api.enedis.fr{chemin_2026}")
    erreur = (
        httpx.HTTPStatusError("500", request=requete, response=httpx.Response(500, request=requete))
        if panne == "500"
        else httpx.TransportError("Connexion interrompue", request=requete)
    )
    adapter, chemins = make_adapter("auto", {chemin_2026: erreur, chemin_v5: mesure_v5()})

    resultat = await getattr(adapter, methode)(PRM, "2026-09-29", "2026-10-01", "jeton")

    assert chemins == [chemin_2026, chemin_v5]
    assert resultat["grandeur"][0]["points"][0]["v"] == "300"
