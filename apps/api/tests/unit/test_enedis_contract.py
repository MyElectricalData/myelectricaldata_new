"""Parseur unique du contrat Data Connect 2026 (MED-14).

Remplace les 3 copies du parsing v5 (routers/pdl.py ×2, routers/oauth.py). Entrée :
l'objet agrégé rendu par EnedisAdapter.get_contract, soit
{"situation_contrat": [...], "synthese_contrat": {...}, "comptage": {...} | None}.
"""

from datetime import date

from src.services.enedis_contract import apply_contract_to_pdl, parse_address, parse_contract, parse_offpeak_hours


def _contrat(enedis_fixture, profil: str, comptage=None) -> dict:
    return {
        "situation_contrat": enedis_fixture(f"situation_contrat_{profil}"),
        "synthese_contrat": enedis_fixture(f"synth_contrat_{profil}"),
        "comptage": comptage,
    }


def test_consommateur(enedis_fixture):
    parsed = parse_contract(_contrat(enedis_fixture, "consommateur"))

    assert parsed["subscribed_power"] == 12
    assert parsed["activation_date"] == date(2018, 8, 31)
    assert parsed["segment"] == "C5"
    assert "heures creuses" in parsed["distribution_tariff"]
    assert parsed["has_production"] is False


def test_autoconsommation_retient_le_contrat_de_soutirage(enedis_fixture):
    """Deux contrats : GRD-F (soutirage, C5, 12 kVA) et GRD-A (injection, P4, sans puissance)."""
    parsed = parse_contract(_contrat(enedis_fixture, "autoconsommation"))

    assert parsed["subscribed_power"] == 12
    assert parsed["segment"] == "C5"
    assert parsed["activation_date"] == date(2014, 1, 22)
    assert parsed["production_activation_date"] == date(2024, 7, 31)
    assert parsed["has_production"] is True


def test_sans_comptage_pas_d_heures_creuses(enedis_fixture):
    """comptage_auto non souscrit (403) : le contrat reste exploitable, sans plages HC."""
    parsed = parse_contract(_contrat(enedis_fixture, "consommateur", comptage=None))

    assert parsed["offpeak_hours"] is None


def test_heures_creuses_lues_dans_le_relais():
    comptage = {"relais": {"plageHeuresCreuses": "HC (22H00-6H00)"}}

    assert parse_offpeak_hours(comptage) == {"ranges": ["22:00-06:00"]}


def test_heures_creuses_plusieurs_plages():
    comptage = {"relais": {"plageHeuresCreuses": "HC (2H00-7H00;12h30-14h00)"}}

    assert parse_offpeak_hours(comptage) == {"ranges": ["02:00-07:00", "12:30-14:00"]}


def test_heures_creuses_format_inconnu_conserve():
    """plageHeuresCreuses est une chaîne libre sans exemple au Swagger : ne rien perdre."""
    comptage = {"relais": {"plageHeuresCreuses": "format inattendu"}}

    assert parse_offpeak_hours(comptage) == {"default": "format inattendu"}


def test_heures_creuses_format_dict_herite():
    comptage = {"relais": {"plageHeuresCreuses": {"hiver": "HC (22H00-6H00)", "ete": "23h00-07h00"}}}

    assert parse_offpeak_hours(comptage) == {"ranges": ["22:00-06:00", "23:00-07:00"]}


class FakePDL:
    subscribed_power = 9
    offpeak_hours = {"ranges": ["01:00-07:00"]}
    activation_date = None


def test_apply_contract_ne_perd_pas_les_heures_creuses_en_base(enedis_fixture):
    """comptage indisponible : la puissance est mise à jour, les plages HC en base sont gardées."""
    pdl = FakePDL()

    apply_contract_to_pdl(pdl, _contrat(enedis_fixture, "consommateur", comptage=None))

    assert pdl.subscribed_power == 12
    assert pdl.offpeak_hours == {"ranges": ["01:00-07:00"]}
    assert pdl.activation_date == date(2018, 8, 31)


def test_adresse_code_postal_et_ville_separes():
    response = {"address": {"number_street_name": "1 RUE X", "postal_code_city": "59199 BRUILLE ST AMAND", "insee_code": "59110"}}

    assert parse_address(response) == {
        "street": "1 RUE X",
        "postal_code": "59199",
        "city": "BRUILLE ST AMAND",
        "insee_code": "59110",
        "country": "France",
    }
