"""
Calculateur pour l'offre tarifaire Heures Creuses / Heures Pleines.

Deux tarifs selon l'heure :
- Heures Creuses (HC) : généralement la nuit, tarif réduit
- Heures Pleines (HP) : le reste du temps, tarif normal

Les plages horaires HC varient selon les contrats (généralement 8h réparties sur 24h).
"""

from datetime import time
from decimal import Decimal
from typing import ClassVar

from .base import (
    BaseOfferCalculator,
    ConsumptionData,
    CalculationResult,
    PeriodDetail,
)


# Horaires HC par défaut (EDF standard)
DEFAULT_HC_SCHEDULES = {
    "monday": "22:30-06:30",
    "tuesday": "22:30-06:30",
    "wednesday": "22:30-06:30",
    "thursday": "22:30-06:30",
    "friday": "22:30-06:30",
    "saturday": "22:30-06:30",
    "sunday": "22:30-06:30",
}

WEEKDAY_NAMES = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


def parse_time_range(time_range: str) -> tuple[time, time]:
    """
    Parse une plage horaire "HH:MM-HH:MM" en tuple (start, end).

    Ex: "22:30-06:30" -> (time(22, 30), time(6, 30))
    """
    start_str, end_str = time_range.split("-")
    start_h, start_m = map(int, start_str.split(":"))
    end_h, end_m = map(int, end_str.split(":"))
    return time(start_h, start_m), time(end_h, end_m)


def is_in_hc_period(timestamp_time: time, hc_start: time, hc_end: time) -> bool:
    """
    Vérifie si une heure est dans la période HC.

    Gère le cas où la période traverse minuit (ex: 22:30 -> 06:30).
    """
    if hc_start <= hc_end:
        # Période simple (ex: 02:00-08:00)
        return hc_start <= timestamp_time < hc_end
    else:
        # Période traversant minuit (ex: 22:30-06:30)
        return timestamp_time >= hc_start or timestamp_time < hc_end


class HcHpCalculator(BaseOfferCalculator):
    """Calculateur pour l'offre Heures Creuses / Heures Pleines."""

    code: ClassVar[str] = "HC_HP"
    name: ClassVar[str] = "Heures Creuses / Heures Pleines"
    description: ClassVar[str] = (
        "Deux tarifs selon l'heure : Heures Creuses (nuit) moins chères, "
        "Heures Pleines (jour) plus chères"
    )
    icon: ClassVar[str] = "clock"
    color: ClassVar[str] = "#10B981"  # green

    required_price_fields: ClassVar[list[str]] = ["hc_price", "hp_price"]
    optional_price_fields: ClassVar[list[str]] = [
        "hc_schedules",
        "hc_price_weekend",
        "hp_price_weekend",
    ]

    display_order: ClassVar[int] = 2

    def calculate(
        self,
        consumption: ConsumptionData,
        prices: dict[str, Decimal],
        subscription_monthly: Decimal,
        hc_schedules: dict[str, str] | None = None,
    ) -> CalculationResult:
        """
        Calcule le coût avec tarification HC/HP.

        Args:
            consumption: Données de consommation
            prices: {"hc_price": X, "hp_price": Y, ...}
            subscription_monthly: Abonnement mensuel
            hc_schedules: Horaires HC personnalisés ou None pour défaut
        """
        hc_price = Decimal(str(prices.get("hc_price", 0)))
        hp_price = Decimal(str(prices.get("hp_price", 0)))

        # Utiliser les horaires personnalisés ou ceux de la consommation ou défaut
        schedules = hc_schedules or consumption.hc_schedules or DEFAULT_HC_SCHEDULES

        # Tarifs week-end (optionnels)
        hc_price_weekend = prices.get("hc_price_weekend")
        hp_price_weekend = prices.get("hp_price_weekend")

        hc_kwh = Decimal(0)
        hp_kwh = Decimal(0)
        hc_cost = Decimal(0)
        hp_cost = Decimal(0)

        # Si tarifs week-end différenciés
        hc_kwh_weekend = Decimal(0)
        hp_kwh_weekend = Decimal(0)
        hc_cost_weekend = Decimal(0)
        hp_cost_weekend = Decimal(0)

        for point in consumption.points:
            weekday_name = WEEKDAY_NAMES[point.timestamp.weekday()]
            is_weekend = point.timestamp.weekday() >= 5

            # Récupérer la plage HC pour ce jour
            day_schedule = schedules.get(weekday_name, "22:30-06:30")
            hc_start, hc_end = parse_time_range(day_schedule)

            # Déterminer si c'est HC ou HP
            point_time = point.timestamp.time()
            is_hc = is_in_hc_period(point_time, hc_start, hc_end)

            kwh = point.value_kwh

            if is_weekend and (hc_price_weekend is not None or hp_price_weekend is not None):
                # Tarification week-end
                hc_wknd = Decimal(str(hc_price_weekend)) if hc_price_weekend else hc_price
                hp_wknd = Decimal(str(hp_price_weekend)) if hp_price_weekend else hp_price

                if is_hc:
                    hc_kwh_weekend += kwh
                    hc_cost_weekend += kwh * hc_wknd
                else:
                    hp_kwh_weekend += kwh
                    hp_cost_weekend += kwh * hp_wknd
            else:
                # Tarification standard
                if is_hc:
                    hc_kwh += kwh
                    hc_cost += kwh * hc_price
                else:
                    hp_kwh += kwh
                    hp_cost += kwh * hp_price

        # Totaux
        total_kwh = hc_kwh + hp_kwh + hc_kwh_weekend + hp_kwh_weekend
        total_cost = hc_cost + hp_cost + hc_cost_weekend + hp_cost_weekend
        subscription_cost = self._calculate_subscription(
            consumption.days_count, subscription_monthly
        )

        # Construire les périodes
        periods = []

        if hc_kwh > 0 or (hc_kwh_weekend == 0 and hp_kwh_weekend == 0):
            periods.append(
                PeriodDetail(
                    name="Heures Creuses",
                    code="hc",
                    consumption_kwh=hc_kwh,
                    unit_price=hc_price,
                    cost_euros=hc_cost,
                    color="#10B981",  # green
                    percentage=self._calculate_period_percentage(hc_kwh, total_kwh),
                )
            )

        if hp_kwh > 0 or (hc_kwh_weekend == 0 and hp_kwh_weekend == 0):
            periods.append(
                PeriodDetail(
                    name="Heures Pleines",
                    code="hp",
                    consumption_kwh=hp_kwh,
                    unit_price=hp_price,
                    cost_euros=hp_cost,
                    color="#F59E0B",  # amber
                    percentage=self._calculate_period_percentage(hp_kwh, total_kwh),
                )
            )

        # Périodes week-end si différenciées
        if hc_kwh_weekend > 0:
            hc_wknd_price = Decimal(str(hc_price_weekend)) if hc_price_weekend else hc_price
            periods.append(
                PeriodDetail(
                    name="HC Week-end",
                    code="hc_weekend",
                    consumption_kwh=hc_kwh_weekend,
                    unit_price=hc_wknd_price,
                    cost_euros=hc_cost_weekend,
                    color="#34D399",  # emerald
                    percentage=self._calculate_period_percentage(hc_kwh_weekend, total_kwh),
                )
            )

        if hp_kwh_weekend > 0:
            hp_wknd_price = Decimal(str(hp_price_weekend)) if hp_price_weekend else hp_price
            periods.append(
                PeriodDetail(
                    name="HP Week-end",
                    code="hp_weekend",
                    consumption_kwh=hp_kwh_weekend,
                    unit_price=hp_wknd_price,
                    cost_euros=hp_cost_weekend,
                    color="#FBBF24",  # yellow
                    percentage=self._calculate_period_percentage(hp_kwh_weekend, total_kwh),
                )
            )

        return CalculationResult(
            total_kwh=total_kwh,
            total_cost_euros=total_cost,
            subscription_cost_euros=subscription_cost,
            total_with_subscription=total_cost + subscription_cost,
            periods=periods,
            offer_type=self.code,
            offer_name=self.name,
            days_count=consumption.days_count,
        )
