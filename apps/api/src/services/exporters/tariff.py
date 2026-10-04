"""Logique tarifaire partagée par les exporters (HP/HC, plages heures creuses)

Point unique pour :
- ramener une option tarifaire (PDL.pricing_option, EnergyOffer.offer_type) à une famille
  d'export : BASE (1 série), HC_HP (2 séries hp/hc) ou TEMPO (6 séries couleur x période) ;
- lire les plages heures creuses quel que soit leur format de stockage ;
- ventiler des relevés détaillés (30 min) entre heures pleines et heures creuses.

Formats de offpeak_hours rencontrés en base :
- {"ranges": ["22:00-06:00", "12:00-14:00"]}       (routers/pdl.py, services/sync.py)
- {"default": "HC (22H00-6H00)"}                  (brut Enedis)
- {"default": "HC (2H30-6H30;13H00-15H00)"}       (brut Enedis multi-plages)
- [{"start": "22:00", "end": "06:00"}, ...]       (ancien format)
- ["22:00-06:00", ...]                            (liste de chaînes)
"""

from __future__ import annotations

import logging
import re
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any, Literal, Protocol

logger = logging.getLogger(__name__)

TariffFamily = Literal["BASE", "HC_HP", "TEMPO"]

# Plage par défaut quand le contrat ne fournit aucune plage : 22h00 - 6h00
DEFAULT_OFFPEAK_RANGES: list[tuple[int, int]] = [(22 * 60, 6 * 60)]


@dataclass(frozen=True)
class TariffProfile:
    """Famille d'export d'une option tarifaire

    family: BASE, HC_HP ou TEMPO
    weekend_offpeak: True si le samedi et le dimanche sont entièrement en heures creuses
    """

    family: TariffFamily
    weekend_offpeak: bool = False


class DetailedRecord(Protocol):
    """Relevé détaillé (compatible ConsumptionData) : puissance moyenne en W sur l'intervalle"""

    date: date
    interval_start: str | None
    value: int
    raw_data: dict[str, Any] | None


# Listes fermées : une option inconnue retombe en BASE plutôt que d'être devinée
# (BASE_WEEKEND contient WEEKEND mais reste une offre à prix unique ; HC_WEEKEND et WEEKEND
# ont des heures pleines le week-end, à un prix différent : HC/HP simple)
_HC_HP_OPTIONS = frozenset(
    {"HC_HP", "HC/HP", "HCHP", "EJP", "SEASONAL", "ZEN_FLEX", "HC_WEEKEND", "WEEKEND"}
)
_WEEKEND_OFFPEAK_OPTIONS = frozenset({"HC_NUIT_WEEKEND"})
_BASE_OPTIONS = frozenset({"", "BASE", "BASE_WEEKEND"})


def tariff_profile(pricing_option: str | None) -> TariffProfile:
    """Ramène une option tarifaire à sa famille d'export

    - TEMPO : 6 séries couleur x période
    - HC_HP, HC/HP, HCHP, EJP, SEASONAL, ZEN_FLEX, HC_WEEKEND, WEEKEND : 2 séries hp/hc
    - HC_NUIT_WEEKEND : 2 séries hp/hc, samedi et dimanche entièrement creux
    - tout le reste (BASE, BASE_WEEKEND, None, inconnu) : 1 série base (inconnu : warning)
    """
    option = (pricing_option or "").strip().upper()
    if "TEMPO" in option:  # même règle que l'ancien export Energy ("TEMPO" in pricing_option)
        return TariffProfile("TEMPO")
    if option in _WEEKEND_OFFPEAK_OPTIONS:
        return TariffProfile("HC_HP", weekend_offpeak=True)
    if option in _HC_HP_OPTIONS:
        return TariffProfile("HC_HP")
    if option not in _BASE_OPTIONS:
        logger.warning(f"[TARIFF] Option tarifaire non reconnue {pricing_option!r} : export en BASE (une seule série)")
    return TariffProfile("BASE")


# "22:00-06:00", "22H00-6H00", "2h30 - 6h30", "22H-6H" : une plage par correspondance
_RANGE_RE = re.compile(r"(\d{1,2})\s*[hH:]\s*(\d{2})?\s*-\s*(\d{1,2})\s*[hH:]\s*(\d{2})?")
_INTERVAL_RE = re.compile(r"PT(\d+)([MH])")
_DEFAULT_INTERVAL_MINUTES = 30


def _minutes(hours: str, minutes: str | None) -> int | None:
    h, m = int(hours), int(minutes or 0)
    if h > 24 or m > 59 or (h == 24 and m != 0):
        return None
    return h * 60 + m


def _ranges_from_text(text: str) -> list[tuple[int, int]]:
    result = []
    for match in _RANGE_RE.finditer(text):
        start = _minutes(match.group(1), match.group(2))
        end = _minutes(match.group(3), match.group(4))
        if start is not None and end is not None:
            result.append((start, end))
    return result


def parse_offpeak_ranges(raw: Any) -> list[tuple[int, int]]:
    """Convertit offpeak_hours (tout format stocké) en plages (début, fin) en minutes depuis minuit

    Une plage dont le début est après la fin passe minuit (22:00-06:00).
    Format illisible : liste vide (l'appelant choisit son repli, ex. DEFAULT_OFFPEAK_RANGES).
    """
    if not raw:
        return []
    if isinstance(raw, str):
        return _ranges_from_text(raw)
    if isinstance(raw, dict):
        if "start" in raw and "end" in raw:
            return _ranges_from_text(f"{raw['start']}-{raw['end']}")
        # {"ranges": [...]} d'abord ; vide ou absent : brut Enedis ({"default": "HC (...)"})
        # ou plages par jour, on lit alors toutes les autres valeurs
        ranges = parse_offpeak_ranges(raw.get("ranges"))
        if ranges:
            return ranges
        return parse_offpeak_ranges([v for k, v in raw.items() if k != "ranges"])
    if isinstance(raw, list):
        result: list[tuple[int, int]] = []
        for item in raw:
            for r in parse_offpeak_ranges(item):
                if r not in result:
                    result.append(r)
        return result
    return []


def is_offpeak(
    day: date,
    hour: int,
    minute: int,
    ranges: list[tuple[int, int]],
    weekend_offpeak: bool = False,
) -> bool:
    """Indique si l'instant (day, hour:minute) tombe en heures creuses

    Début de plage inclus, fin exclue. Aucune plage : jamais creux, sauf le week-end
    pour une offre weekend_offpeak.
    """
    if weekend_offpeak and day.weekday() >= 5:
        return True
    t = hour * 60 + minute
    for start, end in ranges:
        if start > end:
            if t >= start or t < end:
                return True
        elif start <= t < end:
            return True
    return False


def interval_wh(value_w: int | float, raw_data: dict[str, Any] | None) -> float:
    """Convertit une puissance moyenne (W) en énergie (Wh) selon interval_length (PT30M par défaut)"""
    minutes = _DEFAULT_INTERVAL_MINUTES
    if raw_data:
        match = _INTERVAL_RE.fullmatch(str(raw_data.get("interval_length", "")))
        if match and int(match.group(1)) > 0:
            minutes = int(match.group(1)) * (60 if match.group(2) == "H" else 1)
    return value_w * minutes / 60


def is_offpeak_slot(
    day: date,
    interval_start: str | None,
    ranges: list[tuple[int, int]],
    weekend_offpeak: bool = False,
) -> bool | None:
    """is_offpeak pour un créneau détaillé "HH:MM" ; None si l'heure est absente ou illisible"""
    if not interval_start:
        return None
    parts = interval_start.split(":")
    try:
        hour, minute = int(parts[0]), int(parts[1]) if len(parts) > 1 else 0
    except ValueError:
        return None
    return is_offpeak(day, hour, minute, ranges, weekend_offpeak)


def _record_period(record: DetailedRecord, ranges: list[tuple[int, int]], weekend_offpeak: bool) -> str | None:
    """'hp' ou 'hc' pour un relevé détaillé, None s'il n'est pas ventilable"""
    offpeak = is_offpeak_slot(record.date, record.interval_start, ranges, weekend_offpeak)
    if offpeak is None:
        return None
    return "hc" if offpeak else "hp"


def split_hp_hc_wh(
    records: Iterable[DetailedRecord],
    ranges: list[tuple[int, int]],
    weekend_offpeak: bool = False,
) -> dict[str, float]:
    """Ventile des relevés détaillés en {"hp": Wh, "hc": Wh} (relevés sans interval_start ignorés)"""
    totals = {"hp": 0.0, "hc": 0.0}
    for record in records:
        period = _record_period(record, ranges, weekend_offpeak)
        if period and record.value:
            totals[period] += interval_wh(record.value, record.raw_data)
    return totals


def hp_hc_window_start(today: date) -> date:
    """Premier jour de données nécessaire à summarize_hp_hc_kwh

    Le 1er janvier ne suffit pas : début janvier, la semaine (depuis lundi) et hier sont en décembre.
    """
    return min(today.replace(month=1, day=1), today - timedelta(days=today.weekday()), today - timedelta(days=1))


def summarize_hp_hc_kwh(
    records: Iterable[DetailedRecord],
    today: date,
    ranges: list[tuple[int, int]],
    weekend_offpeak: bool = False,
) -> dict[str, float]:
    """Totaux HP/HC en kWh (arrondis à 2 décimales) pour hier, la semaine, le mois et l'année en cours

    Clés : {yesterday,this_week,this_month,this_year}_{hp,hc}_kwh
    """
    yesterday = today - timedelta(days=1)
    starts = {
        "this_week": today - timedelta(days=today.weekday()),
        "this_month": today.replace(day=1),
        "this_year": today.replace(month=1, day=1),
    }
    wh = {f"{p}_{t}": 0.0 for p in ("yesterday", *starts) for t in ("hp", "hc")}

    for record in records:
        period = _record_period(record, ranges, weekend_offpeak)
        if not period or not record.value or record.date > today:
            continue
        value = interval_wh(record.value, record.raw_data)
        if record.date == yesterday:
            wh[f"yesterday_{period}"] += value
        for name, start in starts.items():
            if record.date >= start:
                wh[f"{name}_{period}"] += value

    return {f"{key}_kwh": round(value / 1000, 2) for key, value in wh.items()}
