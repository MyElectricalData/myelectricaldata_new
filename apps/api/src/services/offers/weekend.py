"""
Calculateur pour l'offre tarifaire WEEKEND (Semaine/Week-end × HC/HP).

4 tarifs selon :
- Le jour : Semaine (lun-ven) ou Week-end (sam-dim)
- L'heure : Heures Creuses (HC) ou Heures Pleines (HP)

Exemple : EDF Zen Week-End.
"""

from decimal import Decimal
from typing import ClassVar

from .base import (
    BaseOfferCalculator,
    ConsumptionData,
    CalculationResult,
    PeriodDetail,
)
from .hc_hp import parse_time_range, is_in_hc_period, WEEKDAY_NAMES, DEFAULT_HC_SCHEDULES


class WeekendCalculator(BaseOfferCalculator):
    """Calculateur pour l'offre Week-end (Semaine/Week-end × HC/HP)."""

    code: ClassVar[str] = "WEEKEND"
    name: ClassVar[str] = "Week-end"
    description: ClassVar[str] = (
        "4 tarifs : Semaine HC/HP + Week-end HC/HP. "
        "Tarifs réduits le week-end. "
        "Idéal pour consommateurs actifs le week-end"
    )
    icon: ClassVar[str] = "calendar"
    color: ClassVar[str] = "#8B5CF6"  # purple

    required_price_fields: ClassVar[list[str]] = [
        "hc_price_weekday",
        "hp_price_weekday",
        "hc_price_weekend",
        "hp_price_weekend",
    ]
    optional_price_fields: ClassVar[list[str]] = ["hc_schedules"]

    display_order: ClassVar[int] = 7

    def calculate(
        self,
        consumption: ConsumptionData,
        prices: dict[str, Decimal],
        subscription_monthly: Decimal,
        hc_schedules: dict[str, str] | None = None,
    ) -> CalculationResult:
        """
        Calcule le coût avec tarification Week-end (4 tarifs).

        Args:
            consumption: Données de consommation
            prices: {
                "hc_price_weekday": X, "hp_price_weekday": Y,
                "hc_price_weekend": Z, "hp_price_weekend": W
            }
            subscription_monthly: Abonnement mensuel
            hc_schedules: Horaires HC personnalisés
        """
        # Récupérer les 4 prix
        hc_weekday = Decimal(str(prices.get("hc_price_weekday", 0)))
        hp_weekday = Decimal(str(prices.get("hp_price_weekday", 0)))
        hc_weekend = Decimal(str(prices.get("hc_price_weekend", 0)))
        hp_weekend = Decimal(str(prices.get("hp_price_weekend", 0)))

        # Horaires HC
        schedules = hc_schedules or consumption.hc_schedules or DEFAULT_HC_SCHEDULES

        # Accumulateurs pour les 4 périodes
        totals = {
            "weekday_hc": {"kwh": Decimal(0), "cost": Decimal(0), "price": hc_weekday},
            "weekday_hp": {"kwh": Decimal(0), "cost": Decimal(0), "price": hp_weekday},
            "weekend_hc": {"kwh": Decimal(0), "cost": Decimal(0), "price": hc_weekend},
            "weekend_hp": {"kwh": Decimal(0), "cost": Decimal(0), "price": hp_weekend},
        }

        for point in consumption.points:
            weekday_name = WEEKDAY_NAMES[point.timestamp.weekday()]
            is_weekend = point.timestamp.weekday() >= 5  # samedi = 5, dimanche = 6

            # Récupérer la plage HC pour ce jour
            day_schedule = schedules.get(weekday_name, "22:30-06:30")
            hc_start, hc_end = parse_time_range(day_schedule)

            # Déterminer HC ou HP
            is_hc = is_in_hc_period(point.timestamp.time(), hc_start, hc_end)

            # Clé de période
            day_type = "weekend" if is_weekend else "weekday"
            period = "hc" if is_hc else "hp"
            period_key = f"{day_type}_{period}"

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
            ("weekday_hc", "Semaine HC", "#A78BFA"),  # violet clair
            ("weekday_hp", "Semaine HP", "#7C3AED"),  # violet
            ("weekend_hc", "Week-end HC", "#C4B5FD"),  # lavande
            ("weekend_hp", "Week-end HP", "#8B5CF6"),  # purple
        ]

        for key, name, color in period_configs:
            data = totals[key]
            if data["kwh"] > 0:
                periods.append(
                    PeriodDetail(
                        name=name,
                        code=f"weekend_{key}",
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
