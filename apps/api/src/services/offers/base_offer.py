"""
Calculateur pour l'offre tarifaire BASE.

Tarif unique : prix du kWh identique à toute heure.
C'est l'offre la plus simple, idéale pour les consommateurs
avec une consommation régulière tout au long de la journée.
"""

from decimal import Decimal
from typing import ClassVar

from .base import (
    BaseOfferCalculator,
    ConsumptionData,
    CalculationResult,
    PeriodDetail,
)


class BaseCalculator(BaseOfferCalculator):
    """Calculateur pour l'offre tarifaire BASE (tarif unique)."""

    code: ClassVar[str] = "BASE"
    name: ClassVar[str] = "Base"
    description: ClassVar[str] = "Tarif unique, prix du kWh identique à toute heure"
    icon: ClassVar[str] = "zap"
    color: ClassVar[str] = "#3B82F6"  # blue

    required_price_fields: ClassVar[list[str]] = ["base_price"]
    optional_price_fields: ClassVar[list[str]] = ["base_price_weekend"]

    display_order: ClassVar[int] = 1

    def calculate(
        self,
        consumption: ConsumptionData,
        prices: dict[str, Decimal],
        subscription_monthly: Decimal,
        hc_schedules: dict[str, str] | None = None,
    ) -> CalculationResult:
        """
        Calcule le coût avec un tarif unique.

        Pour BASE, tous les kWh sont au même prix, sauf si base_price_weekend
        est défini (tarif différencié le week-end).
        """
        base_price = Decimal(str(prices.get("base_price", 0)))
        weekend_price = prices.get("base_price_weekend")

        if weekend_price is not None:
            weekend_price = Decimal(str(weekend_price))
            return self._calculate_with_weekend(
                consumption, base_price, weekend_price, subscription_monthly
            )

        # Calcul simple : tout au même tarif
        total_kwh = consumption.total_kwh
        total_cost = total_kwh * base_price
        subscription_cost = self._calculate_subscription(
            consumption.days_count, subscription_monthly
        )

        period = PeriodDetail(
            name="Consommation",
            code="base",
            consumption_kwh=total_kwh,
            unit_price=base_price,
            cost_euros=total_cost,
            color=self.color,
            percentage=Decimal(100),
        )

        return CalculationResult(
            total_kwh=total_kwh,
            total_cost_euros=total_cost,
            subscription_cost_euros=subscription_cost,
            total_with_subscription=total_cost + subscription_cost,
            periods=[period],
            offer_type=self.code,
            offer_name=self.name,
            days_count=consumption.days_count,
        )

    def _calculate_with_weekend(
        self,
        consumption: ConsumptionData,
        base_price: Decimal,
        weekend_price: Decimal,
        subscription_monthly: Decimal,
    ) -> CalculationResult:
        """Calcul avec tarif différencié le week-end."""
        weekday_kwh = Decimal(0)
        weekend_kwh = Decimal(0)

        for point in consumption.points:
            # samedi = 5, dimanche = 6
            if point.timestamp.weekday() >= 5:
                weekend_kwh += point.value_kwh
            else:
                weekday_kwh += point.value_kwh

        weekday_cost = weekday_kwh * base_price
        weekend_cost = weekend_kwh * weekend_price
        total_kwh = weekday_kwh + weekend_kwh
        total_cost = weekday_cost + weekend_cost
        subscription_cost = self._calculate_subscription(
            consumption.days_count, subscription_monthly
        )

        periods = [
            PeriodDetail(
                name="Semaine",
                code="base_weekday",
                consumption_kwh=weekday_kwh,
                unit_price=base_price,
                cost_euros=weekday_cost,
                color="#3B82F6",  # blue
                percentage=self._calculate_period_percentage(weekday_kwh, total_kwh),
            ),
            PeriodDetail(
                name="Week-end",
                code="base_weekend",
                consumption_kwh=weekend_kwh,
                unit_price=weekend_price,
                cost_euros=weekend_cost,
                color="#8B5CF6",  # purple
                percentage=self._calculate_period_percentage(weekend_kwh, total_kwh),
            ),
        ]

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
