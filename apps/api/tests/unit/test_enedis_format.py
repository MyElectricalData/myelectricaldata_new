"""Format Data Connect 2026 : décalage des horodatages et conversion v5 → 2026 (MED-14).

Les fixtures viennent d'une capture prod du 04/10/2026 : la même courbe de charge
interrogée en v5 et en 2026 sur le même PRM et la même période (96 points identiques).
"""

import copy

from src.adapters.enedis_format import (
    as_point,
    build_measure,
    extract_points,
    measure_unit,
    shift_points_to_interval_start,
    v5_to_2026,
)


class TestShiftPointsToIntervalStart:
    def test_decale_chaque_point_de_son_pas(self, enedis_fixture):
        cdc = enedis_fixture("mesure_courbe_de_charge_consommation")

        shifted = shift_points_to_interval_start(cdc)

        points = shifted["grandeur"][0]["points"]
        # Enedis horodate la FIN de l'intervalle : 00:30 couvre 00:00-00:30
        assert points[0]["d"] == "2026-09-29 00:00:00"
        # Le point de minuit (fin de 23:30-00:00) revient sur la veille
        assert points[-1]["d"] == "2026-09-30 23:30:00"
        assert points[0]["v"] == cdc["grandeur"][0]["points"][0]["v"]
        assert points[0]["p"] == "PT30M"

    def test_ne_touche_pas_les_points_sans_pas(self, enedis_fixture):
        quotidien = enedis_fixture("mesure_consommation_quotidienne")
        before = copy.deepcopy(quotidien)

        assert shift_points_to_interval_start(quotidien) == before


class TestV5To2026:
    def test_courbe_v5_convertie_egale_la_reponse_2026(self, enedis_fixture):
        v5 = enedis_fixture("v5_consumption_load_curve")
        expected = enedis_fixture("mesure_courbe_de_charge_consommation")

        converted = v5_to_2026(v5, grandeur_metier="CONS", grandeur_physique="PA")

        assert converted["idPrm"] == expected["idPrm"]
        assert converted["periode"] == expected["periode"]
        assert converted["etapeMetier"] == "BRUT"
        grandeur = converted["grandeur"][0]
        assert grandeur["grandeurMetier"] == "CONS"
        assert grandeur["grandeurPhysique"] == "PA"
        assert grandeur["unite"] == "W"
        assert [(p["v"], p["d"], p["p"]) for p in grandeur["points"]] == [
            (p["v"], p["d"], p["p"]) for p in expected["grandeur"][0]["points"]
        ]

    def test_quotidien_v5_porte_le_pas_p1d(self):
        v5 = {
            "meter_reading": {
                "usage_point_id": "99999999999991",
                "start": "2026-09-29",
                "end": "2026-10-01",
                "quality": "BRUT",
                "reading_type": {"unit": "Wh", "measurement_kind": "energy", "aggregate": "sum"},
                "interval_reading": [
                    {"value": "33495", "date": "2026-09-29"},
                    {"value": "38022", "date": "2026-09-30"},
                ],
            }
        }

        converted = v5_to_2026(v5, grandeur_metier="CONS", grandeur_physique="EA", pas="P1D")

        assert converted["pas"] == "P1D"
        assert converted["grandeur"][0]["unite"] == "Wh"
        assert converted["grandeur"][0]["points"] == [
            {"v": "33495", "d": "2026-09-29"},
            {"v": "38022", "d": "2026-09-30"},
        ]

    def test_erreur_v5_relayee_telle_quelle(self, enedis_fixture):
        erreur = enedis_fixture("erreur_adam_err0123")

        assert v5_to_2026(erreur, grandeur_metier="PROD", grandeur_physique="EA") == erreur


class TestHelpersDeCache:
    """Le cache Redis (24 h) contient encore des lectures v5 au déploiement : elles sont
    converties à la lecture plutôt qu'invalidées (pas de rafale d'appels Enedis)."""

    def test_as_point_accepte_v5_et_2026(self):
        v5 = {"value": "4078", "date": "2026-09-29 00:00:00", "interval_length": "PT30M", "measure_type": "B"}
        point = {"v": "4078", "d": "2026-09-29 00:00:00", "p": "PT30M", "n": "B"}

        assert as_point(v5) == point
        assert as_point(point) == point

    def test_extract_points_2026_v5_et_vide(self, enedis_fixture):
        cdc = enedis_fixture("mesure_courbe_de_charge_consommation")
        v5 = enedis_fixture("v5_consumption_load_curve")

        assert extract_points(cdc) == cdc["grandeur"][0]["points"]
        assert extract_points(v5)[0] == {"v": "4078", "d": "2026-09-29 00:30:00", "p": "PT30M", "n": "B"}
        assert extract_points({"error": "ADAM-ERR0123"}) == []

    def test_build_measure_reconstruit_une_reponse_2026(self):
        points = [{"v": "33495", "d": "2026-09-29"}]

        response = build_measure(
            "99999999999991", "2026-09-29", "2026-09-30", points, grandeur_metier="CONS", grandeur_physique="EA", unite="Wh"
        )

        assert response["idPrm"] == "99999999999991"
        assert response["periode"] == {"dateDebut": "2026-09-29", "dateFin": "2026-09-30"}
        assert response["grandeur"][0] == {
            "grandeurMetier": "CONS",
            "grandeurPhysique": "EA",
            "unite": "Wh",
            "points": points,
            "calendrier": [],
        }

    def test_unite_lue_dans_2026_ou_v5(self, enedis_fixture):
        assert measure_unit(enedis_fixture("mesure_consommation_quotidienne")) == "Wh"
        assert measure_unit(enedis_fixture("v5_consumption_load_curve")) == "W"
        assert measure_unit({}) is None
