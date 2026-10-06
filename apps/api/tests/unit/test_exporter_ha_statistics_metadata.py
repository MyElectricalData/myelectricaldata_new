"""Métadonnées de recorder/import_statistics : mean_type et unit_class (HA 2025.11+)."""

from src.services.exporters.home_assistant import _ha_version_at_least, _with_statistics_metadata

BASE = {
    "has_mean": False,
    "has_sum": True,
    "statistic_id": "myelectricaldata:consumption_00000000000000_blue_hc",
    "name": "Consommation",
    "source": "myelectricaldata",
    "unit_of_measurement": "kWh",
}


def test_energie_recoit_mean_type_et_unit_class() -> None:
    md = _with_statistics_metadata(BASE, "2026.9.4")
    assert md["mean_type"] == 0
    assert md["unit_class"] == "energy"
    assert "mean_type" not in BASE  # les métadonnées d'origine ne sont pas modifiées


def test_cout_sans_classe_d_unite() -> None:
    md = _with_statistics_metadata({**BASE, "unit_of_measurement": "EUR"}, "2026.9.4")
    assert md["mean_type"] == 0
    assert md["unit_class"] is None


def test_ancienne_version_inchangee() -> None:
    assert _with_statistics_metadata(BASE, "2025.10.4") is BASE


def test_valeurs_existantes_conservees() -> None:
    md = _with_statistics_metadata({**BASE, "mean_type": 1, "unit_class": "power"}, "2026.11.0")
    assert md["mean_type"] == 1
    assert md["unit_class"] == "power"


def test_versions_de_developpement_et_inconnues() -> None:
    assert _ha_version_at_least("2025.11.0b3", 2025, 11)
    assert _ha_version_at_least("2025.11.0.dev20251001", 2025, 11)
    assert _ha_version_at_least(None, 2025, 11)
    assert not _ha_version_at_least("2024.12.1", 2025, 11)
