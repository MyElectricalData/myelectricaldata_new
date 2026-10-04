"""Tests de la logique tarifaire partagée des exporters (issue #113 : export HP/HC)"""

from datetime import date
from types import SimpleNamespace

import pytest

from src.services.exporters.tariff import (
    DEFAULT_OFFPEAK_RANGES,
    TariffProfile,
    interval_wh,
    is_offpeak,
    is_offpeak_slot,
    parse_offpeak_ranges,
    split_hp_hc_wh,
    summarize_hp_hc_kwh,
    tariff_profile,
)

MONDAY = date(2026, 9, 28)
SATURDAY = date(2026, 10, 3)
SUNDAY = date(2026, 10, 4)

NIGHT = [(22 * 60, 6 * 60)]  # 22:00 - 06:00
NIGHT_HALF = [(22 * 60 + 30, 6 * 60 + 30)]  # 22:30 - 06:30


def rec(day: date, start: str | None, value_w: int, raw_data: dict | None = None) -> SimpleNamespace:
    return SimpleNamespace(date=day, interval_start=start, value=value_w, raw_data=raw_data)


# =============================================================================
# tariff_profile
# =============================================================================


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        (None, TariffProfile("BASE")),
        ("", TariffProfile("BASE")),
        ("BASE", TariffProfile("BASE")),
        ("base", TariffProfile("BASE")),
        ("BASE_WEEKEND", TariffProfile("BASE")),
        ("INCONNUE", TariffProfile("BASE")),
        # Cause racine de l'issue #113 : la valeur canonique est HC_HP
        ("HC_HP", TariffProfile("HC_HP")),
        ("hc_hp", TariffProfile("HC_HP")),
        ("HC/HP", TariffProfile("HC_HP")),
        ("HCHP", TariffProfile("HC_HP")),
        ("EJP", TariffProfile("HC_HP")),
        ("SEASONAL", TariffProfile("HC_HP")),
        ("ZEN_FLEX", TariffProfile("HC_HP")),
        ("HC_WEEKEND", TariffProfile("HC_HP", weekend_offpeak=True)),
        ("HC_NUIT_WEEKEND", TariffProfile("HC_HP", weekend_offpeak=True)),
        ("TEMPO", TariffProfile("TEMPO")),
        ("tempo", TariffProfile("TEMPO")),
    ],
)
def test_tariff_profile(raw: str | None, expected: TariffProfile) -> None:
    assert tariff_profile(raw) == expected


# =============================================================================
# parse_offpeak_ranges
# =============================================================================


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        (None, []),
        ({}, []),
        ("", []),
        ({"foo": "bar"}, []),
        # Format normalisé écrit par routers/pdl.py et services/sync.py
        ({"ranges": ["22:00-06:00"]}, [(1320, 360)]),
        ({"ranges": ["02:30-06:30", "13:00-15:00"]}, [(150, 390), (780, 900)]),
        # Brut Enedis
        ({"default": "HC (22H00-6H00)"}, [(1320, 360)]),
        ({"default": "HC (2H30-6H30;13H00-15H00;21H30-23H30)"}, [(150, 390), (780, 900), (1290, 1410)]),
        ("HC (22H00-6H00)", [(1320, 360)]),
        # Ancien format : toutes les plages, pas seulement la première
        ([{"start": "22:00", "end": "06:00"}, {"start": "12:00", "end": "14:00"}], [(1320, 360), (720, 840)]),
        (["22:30-06:30"], [(1350, 390)]),
    ],
)
def test_parse_offpeak_ranges(raw: object, expected: list[tuple[int, int]]) -> None:
    assert parse_offpeak_ranges(raw) == expected


def test_default_offpeak_ranges_is_night() -> None:
    assert DEFAULT_OFFPEAK_RANGES == [(1320, 360)]


# =============================================================================
# is_offpeak
# =============================================================================


@pytest.mark.parametrize(
    ("hour", "minute", "ranges", "expected"),
    [
        (23, 0, NIGHT, True),
        (5, 30, NIGHT, True),
        (22, 0, NIGHT, True),
        (6, 0, NIGHT, False),
        (21, 30, NIGHT, False),
        (12, 0, NIGHT, False),
        # Plages à la demi-heure : la minute compte
        (22, 0, NIGHT_HALF, False),
        (22, 30, NIGHT_HALF, True),
        (6, 0, NIGHT_HALF, True),
        (6, 30, NIGHT_HALF, False),
        # Plage de journée
        (14, 0, [(780, 900)], True),
        (15, 0, [(780, 900)], False),
        # Aucune plage : jamais creux (le repli 22h-6h est le choix de l'appelant)
        (23, 0, [], False),
    ],
)
def test_is_offpeak_weekday(hour: int, minute: int, ranges: list[tuple[int, int]], expected: bool) -> None:
    assert is_offpeak(MONDAY, hour, minute, ranges) is expected


@pytest.mark.parametrize("day", [SATURDAY, SUNDAY])
def test_is_offpeak_weekend_offer(day: date) -> None:
    assert is_offpeak(day, 12, 0, NIGHT, weekend_offpeak=True) is True


def test_is_offpeak_weekend_offer_uses_ranges_on_weekdays() -> None:
    assert is_offpeak(MONDAY, 12, 0, NIGHT, weekend_offpeak=True) is False


def test_is_offpeak_weekend_without_weekend_offer() -> None:
    assert is_offpeak(SATURDAY, 12, 0, NIGHT) is False


@pytest.mark.parametrize(
    ("interval_start", "expected"),
    [("23:00", True), ("22:30:00", True), ("12:00", False), (None, None), ("", None), ("xx:yy", None)],
)
def test_is_offpeak_slot(interval_start: str | None, expected: bool | None) -> None:
    assert is_offpeak_slot(MONDAY, interval_start, NIGHT) is expected


# =============================================================================
# interval_wh
# =============================================================================


@pytest.mark.parametrize(
    ("value_w", "raw_data", "expected"),
    [
        (1000, None, 500.0),
        (1000, {}, 500.0),
        (1000, {"interval_length": "PT30M"}, 500.0),
        (1000, {"interval_length": "PT15M"}, 250.0),
        (1000, {"interval_length": "PT60M"}, 1000.0),
        (600, {"interval_length": "PT10M"}, 100.0),
    ],
)
def test_interval_wh(value_w: int, raw_data: dict | None, expected: float) -> None:
    assert interval_wh(value_w, raw_data) == pytest.approx(expected)


# =============================================================================
# split_hp_hc_wh
# =============================================================================


def test_split_hp_hc_wh() -> None:
    records = [
        rec(MONDAY, "23:00", 1000),  # HC : 500 Wh
        rec(MONDAY, "12:00", 2000),  # HP : 1000 Wh
        rec(MONDAY, "06:00", 400),  # HP (borne de fin exclue) : 200 Wh
        rec(MONDAY, None, 99999),  # journalier : non ventilable, ignoré
    ]
    assert split_hp_hc_wh(records, NIGHT) == {"hp": pytest.approx(1200.0), "hc": pytest.approx(500.0)}


def test_split_hp_hc_wh_weekend_offer() -> None:
    records = [rec(SATURDAY, "12:00", 2000), rec(MONDAY, "12:00", 2000)]
    assert split_hp_hc_wh(records, NIGHT, weekend_offpeak=True) == {
        "hp": pytest.approx(1000.0),
        "hc": pytest.approx(1000.0),
    }


def test_split_hp_hc_wh_empty() -> None:
    assert split_hp_hc_wh([], NIGHT) == {"hp": 0.0, "hc": 0.0}


# =============================================================================
# summarize_hp_hc_kwh (payload MQTT)
# =============================================================================


def test_summarize_hp_hc_kwh() -> None:
    today = date(2026, 10, 7)  # mercredi : hier = mardi 6, semaine depuis lundi 5
    records = [
        rec(date(2026, 10, 6), "23:00", 1000),  # HC 0,5 kWh : hier, semaine, mois, année
        rec(date(2026, 10, 6), "12:00", 2000),  # HP 1,0 kWh : hier, semaine, mois, année
        rec(date(2026, 10, 5), "12:00", 4000),  # HP 2,0 kWh : semaine, mois, année
        rec(date(2026, 10, 2), "02:00", 600),  # HC 0,3 kWh : mois, année
        rec(date(2026, 3, 10), "12:00", 8000),  # HP 4,0 kWh : année
        rec(date(2025, 12, 31), "12:00", 8000),  # année précédente : exclu
    ]
    assert summarize_hp_hc_kwh(records, today, NIGHT) == {
        "yesterday_hp_kwh": 1.0,
        "yesterday_hc_kwh": 0.5,
        "this_week_hp_kwh": 3.0,
        "this_week_hc_kwh": 0.5,
        "this_month_hp_kwh": 3.0,
        "this_month_hc_kwh": 0.8,
        "this_year_hp_kwh": 7.0,
        "this_year_hc_kwh": 0.8,
    }
