"""
Calculateur pour l'offre tarifaire EJP (Effacement Jour de Pointe).

2 tarifs :
- Normal (342 jours/an) : tarif avantageux
- Pointe Mobile (22 jours/an) : tarif très élevé

Les jours de Pointe Mobile sont signalés la veille par EDF.
Cette offre n'est plus commercialisée depuis 1998 mais reste active
pour les clients existants.
"""

from datetime import date
from decimal import Decimal
from typing import ClassVar

from .base import (
    BaseOfferCalculator,
    ConsumptionData,
    CalculationResult,
    PeriodDetail,
)


class EjpCalculator(BaseOfferCalculator):
    """Calculateur pour l'offre EJP (Effacement Jour de Pointe)."""

    code: ClassVar[str] = "EJP"
    name: ClassVar[str] = "EJP (Effacement Jour de Pointe)"
    description: ClassVar[str] = (
        "2 tarifs : Normal (342 jours) et Pointe Mobile (22 jours, très cher). "
        "Offre fermée aux nouveaux clients"
    )
    icon: ClassVar[str] = "alert-triangle"
    color: ClassVar[str] = "#F59E0B"  # amber

    required_price_fields: ClassVar[list[str]] = ["ejp_normal", "ejp_peak"]
    optional_price_fields: ClassVar[list[str]] = []

    display_order: ClassVar[int] = 4

    def __init__(self, ejp_calendar: dict[date, bool] | None = None):
        """
        Args:
            ejp_calendar: Dictionnaire date -> is_peak_day (True si jour de pointe).
                         Si None, utilise une estimation.
        """
        self.ejp_calendar = ejp_calendar or {}

    def calculate(
        self,
        consumption: ConsumptionData,
        prices: dict[str, Decimal],
        subscription_monthly: Decimal,
        hc_schedules: dict[str, str] | None = None,
    ) -> CalculationResult:
        """
        Calcule le coût avec tarification EJP.

        Args:
            consumption: Données de consommation
            prices: {"ejp_normal": X, "ejp_peak": Y}
            subscription_monthly: Abonnement mensuel
            hc_schedules: Non utilisé pour EJP
        """
        normal_price = Decimal(str(prices.get("ejp_normal", 0)))
        peak_price = Decimal(str(prices.get("ejp_peak", 0)))

        normal_kwh = Decimal(0)
        peak_kwh = Decimal(0)
        normal_cost = Decimal(0)
        peak_cost = Decimal(0)

        for point in consumption.points:
            point_date = point.timestamp.date()
            is_peak = self._is_peak_day(point_date)

            kwh = point.value_kwh

            if is_peak:
                peak_kwh += kwh
                peak_cost += kwh * peak_price
            else:
                normal_kwh += kwh
                normal_cost += kwh * normal_price

        total_kwh = normal_kwh + peak_kwh
        total_cost = normal_cost + peak_cost
        subscription_cost = self._calculate_subscription(
            consumption.days_count, subscription_monthly
        )

        periods = [
            PeriodDetail(
                name="Jours Normaux",
                code="ejp_normal",
                consumption_kwh=normal_kwh,
                unit_price=normal_price,
                cost_euros=normal_cost,
                color="#10B981",  # green
                percentage=self._calculate_period_percentage(normal_kwh, total_kwh),
            ),
        ]

        if peak_kwh > 0:
            periods.append(
                PeriodDetail(
                    name="Jours de Pointe Mobile",
                    code="ejp_peak",
                    consumption_kwh=peak_kwh,
                    unit_price=peak_price,
                    cost_euros=peak_cost,
                    color="#EF4444",  # red
                    percentage=self._calculate_period_percentage(peak_kwh, total_kwh),
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

    def _is_peak_day(self, day: date) -> bool:
        """
        Détermine si un jour est un jour de Pointe Mobile.

        Utilise le calendrier fourni, sinon fait une estimation.
        22 jours EJP par an, généralement entre nov et mars, hors week-ends.
        """
        if day in self.ejp_calendar:
            return self.ejp_calendar[day]

        # Estimation basée sur les caractéristiques EJP
        # - 22 jours par an
        # - Entre 1er novembre et 31 mars
        # - Jamais le week-end
        # - Jamais les jours fériés

        month = day.month
        weekday = day.weekday()

        # Pas de jour EJP hors période hivernale (avril à octobre)
        if month in [4, 5, 6, 7, 8, 9, 10]:
            return False

        # Pas de jour EJP le week-end
        if weekday >= 5:
            return False

        # Estimation : ~22 jours sur 5 mois * 22 jours ouvrés/mois ≈ 110 jours
        # Probabilité ≈ 20%
        # Utiliser le jour de l'année comme pseudo-random cohérent
        day_of_year = day.timetuple().tm_yday
        return day_of_year % 5 == 0  # ~20% des jours

    def set_ejp_calendar(self, calendar: dict[date, bool]) -> None:
        """Met à jour le calendrier EJP avec les vrais jours de pointe."""
        self.ejp_calendar = calendar
