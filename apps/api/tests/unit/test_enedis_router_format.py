"""Routers serveur : réponses reconstruites au format 2026 et cache v5 hérité (MED-14)."""

from src.routers.enedis import _load_curve, _normalize_cached

PRM = "99999999999991"


def test_load_curve_trie_et_convertit_les_points_du_cache():
    points = [
        {"v": "2848", "d": "2026-09-29 00:30:00", "p": "PT30M"},
        {"value": "4078", "date": "2026-09-29 00:00:00", "interval_length": "PT30M"},  # lecture v5 en cache
    ]

    response = _load_curve(PRM, "2026-09-29", "2026-09-30", points, "PROD")

    grandeur = response["grandeur"][0]
    assert grandeur["grandeurMetier"] == "PROD"
    assert grandeur["unite"] == "W"
    assert [p["d"] for p in grandeur["points"]] == ["2026-09-29 00:00:00", "2026-09-29 00:30:00"]
    assert grandeur["points"][0] == {"v": "4078", "d": "2026-09-29 00:00:00", "p": "PT30M"}


def test_reponse_v5_en_cache_convertie(enedis_fixture):
    v5 = enedis_fixture("v5_consumption_load_curve")

    converted = _normalize_cached("production_detail", v5)

    assert converted["grandeur"][0]["grandeurMetier"] == "PROD"
    assert len(converted["grandeur"][0]["points"]) == 96


def test_reponse_2026_en_cache_inchangee(enedis_fixture):
    contrat = {
        "situation_contrat": enedis_fixture("situation_contrat_consommateur"),
        "synthese_contrat": enedis_fixture("synth_contrat_consommateur"),
        "comptage": None,
    }
    situation = enedis_fixture("situation_contrat_consommateur")

    assert _normalize_cached("contract", contrat) == contrat
    assert _normalize_cached("customer", situation) == situation
    assert _normalize_cached("address", enedis_fixture("donnees_generales")) == enedis_fixture("donnees_generales")
