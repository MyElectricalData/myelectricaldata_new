"""
Calculateur pour l'offre tarifaire SEASONAL (2 saisons).

4 tarifs selon :
- La saison : Été (avril-octobre) ou Hiver (novembre-mars)
- L'heure : Heures Creuses (HC) ou Heures Pleines (HP)

Option "Jour de Pointe" disponible avec un tarif spécial.
Exemple : Enercoop Flexi WATT - 2 saisons.
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
from .hc_hp import parse_time_range, is_in_hc_period, WEEKDAY_NAMES, DEFAULT_HC_SCHEDULES


# Mois d'hiver (novembre à mars inclus)
WINTER_MONTHS = {11, 12, 1, 2, 3}


class SeasonalCalculator(BaseOfferCalculator):
    """Calculateur pour l'offre saisonnière (Été/Hiver × HC/HP)."""

    code: ClassVar[str] = "SEASONAL"
    name: ClassVar[str] = "Saisonnier (2 saisons)"
    description: ClassVar[str] = (
        "Tarifs différenciés été/hiver avec HC/HP. "
        "Hiver (nov-mars) plus cher, été (avr-oct) moins cher. "
        "Option jour de pointe disponible"
    )
    icon: ClassVar[str] = "sun"
    color: ClassVar[str] = "#06B6D4"  # cyan

    required_price_fields: ClassVar[list[str]] = [
        "hc_price_winter",
        "hp_price_winter",
        "hc_price_summer",
        "hp_price_summer",
    ]
    optional_price_fields: ClassVar[list[str]] = ["peak_day_price", "hc_schedules"]

    display_order: ClassVar[int] = 5

    def __init__(self, peak_days: set[date] | None = None):
        """
        Args:
            peak_days: Ensemble des jours de pointe (optionnel).
                      Si défini avec peak_day_price, ces jours utilisent le tarif pointe.
        """
        self.peak_days = peak_days or set()

    def calculate(
        self,
        consumption: ConsumptionData,
        prices: dict[str, Decimal],
        subscription_monthly: Decimal,
        hc_schedules: dict[str, str] | None = None,
    ) -> CalculationResult:
        """
        Calcule le coût avec tarification saisonnière.

        Args:
            consumption: Données de consommation
            prices: {
                "hc_price_winter": X, "hp_price_winter": Y,
                "hc_price_summer": Z, "hp_price_summer": W,
                "peak_day_price": P (optionnel)
            }
            subscription_monthly: Abonnement mensuel
            hc_schedules: Horaires HC personnalisés
        """
        # Récupérer les 4 prix principaux
        hc_winter = Decimal(str(prices.get("hc_price_winter", 0)))
        hp_winter = Decimal(str(prices.get("hp_price_winter", 0)))
        hc_summer = Decimal(str(prices.get("hc_price_summer", 0)))
        hp_summer = Decimal(str(prices.get("hp_price_summer", 0)))
        peak_price = prices.get("peak_day_price")

        if peak_price is not None:
            peak_price = Decimal(str(peak_price))

        # Horaires HC
        schedules = hc_schedules or consumption.hc_schedules or DEFAULT_HC_SCHEDULES

        # Accumulateurs pour les 4-5 périodes
        totals = {
            "winter_hc": {"kwh": Decimal(0), "cost": Decimal(0), "price": hc_winter},
            "winter_hp": {"kwh": Decimal(0), "cost": Decimal(0), "price": hp_winter},
            "summer_hc": {"kwh": Decimal(0), "cost": Decimal(0), "price": hc_summer},
            "summer_hp": {"kwh": Decimal(0), "cost": Decimal(0), "price": hp_summer},
            "peak": {"kwh": Decimal(0), "cost": Decimal(0), "price": peak_price or Decimal(0)},
        }

        for point in consumption.points:
            point_date = point.timestamp.date()
            weekday_name = WEEKDAY_NAMES[point.timestamp.weekday()]

            # Vérifier si c'est un jour de pointe
            if peak_price and point_date in self.peak_days:
                kwh = point.value_kwh
                totals["peak"]["kwh"] += kwh
                totals["peak"]["cost"] += kwh * peak_price
                continue

            # Déterminer la saison
            is_winter = point_date.month in WINTER_MONTHS

            # Déterminer HC ou HP
            day_schedule = schedules.get(weekday_name, "22:30-06:30")
            hc_start, hc_end = parse_time_range(day_schedule)
            is_hc = is_in_hc_period(point.timestamp.time(), hc_start, hc_end)

            # Clé de période
            season = "winter" if is_winter else "summer"
            period = "hc" if is_hc else "hp"
            period_key = f"{season}_{period}"

            kwh = point.value_kwh
            totals[period_key]["kwh"] += kwh
            totals[period_key]["cost"] += kwh * totals[period_key]["price"]

        # Calculer les totaux
        total_kwh = sum(t["kwh"] for t in totals.values())
        total_cost = sum(t["cost"] for t in totals.values())
        subscription_cost = self._calculate_subscription(
            consumption.days_count, subscription_monthly
        )

        # Construire les périodes
        periods = []

        period_configs = [
            ("winter_hc", "Hiver HC", "#0EA5E9"),  # sky blue
            ("winter_hp", "Hiver HP", "#0369A1"),  # darker blue
            ("summer_hc", "Été HC", "#34D399"),  # emerald
            ("summer_hp", "Été HP", "#059669"),  # darker emerald
            ("peak", "Jour de Pointe", "#EF4444"),  # red
        ]

        for key, name, color in period_configs:
            data = totals[key]
            if data["kwh"] > 0:
                periods.append(
                    PeriodDetail(
                        name=name,
                        code=f"seasonal_{key}",
                        consumption_kwh=data["kwh"],
                        unit_price=data["price"],
                        cost_euros=data["cost"],
                        color=color,
                        percentage=self._calculate_period_percentage(data["kwh"], total_kwh),
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

    def set_peak_days(self, days: set[date]) -> None:
        """Met à jour l'ensemble des jours de pointe."""
        self.peak_days = days
