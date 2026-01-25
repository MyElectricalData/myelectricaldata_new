"""
Calculateur pour l'offre tarifaire Nuit & Week-end.

2 tarifs selon :
- Heures Creuses (HC) : 23h-6h en semaine + TOUT le week-end
- Heures Pleines (HP) : 6h-23h en semaine uniquement

Idéal pour :
- Véhicules électriques (recharge nocturne ou week-end)
- Ballons d'eau chaude
- Consommateurs absents la semaine

Exemple : Enercoop Flexi WATT - Nuit & Week-end.
"""

from decimal import Decimal
from typing import ClassVar

from .base import (
    BaseOfferCalculator,
    ConsumptionData,
    CalculationResult,
    PeriodDetail,
)


class HcNuitWeekendCalculator(BaseOfferCalculator):
    """Calculateur pour l'offre Nuit & Week-end (HC nuit + week-end complet)."""

    code: ClassVar[str] = "HC_NUIT_WEEKEND"
    name: ClassVar[str] = "Nuit & Week-end"
    description: ClassVar[str] = (
        "HC : 23h-6h en semaine + tout le week-end. "
        "HP : 6h-23h en semaine uniquement. "
        "Idéal pour véhicules électriques"
    )
    icon: ClassVar[str] = "moon"
    color: ClassVar[str] = "#6366F1"  # indigo

    required_price_fields: ClassVar[list[str]] = ["hc_price", "hp_price"]
    optional_price_fields: ClassVar[list[str]] = []

    display_order: ClassVar[int] = 6

    # Horaires fixes pour cette offre
    # Semaine : HC de 23h à 6h, HP de 6h à 23h
    # Week-end : tout en HC
    HC_START_HOUR = 23
    HC_END_HOUR = 6

    def calculate(
        self,
        consumption: ConsumptionData,
        prices: dict[str, Decimal],
        subscription_monthly: Decimal,
        hc_schedules: dict[str, str] | None = None,  # Ignoré pour cette offre
    ) -> CalculationResult:
        """
        Calcule le coût avec tarification Nuit & Week-end.

        Les horaires sont fixes pour cette offre :
        - Semaine (lun-ven) : HC de 23h à 6h, HP de 6h à 23h
        - Week-end (sam-dim) : tout en HC

        Args:
            consumption: Données de consommation
            prices: {"hc_price": X, "hp_price": Y}
            subscription_monthly: Abonnement mensuel
            hc_schedules: Ignoré (horaires fixes pour cette offre)
        """
        hc_price = Decimal(str(prices.get("hc_price", 0)))
        hp_price = Decimal(str(prices.get("hp_price", 0)))

        hc_kwh = Decimal(0)
        hp_kwh = Decimal(0)
        hc_cost = Decimal(0)
        hp_cost = Decimal(0)

        # Compteurs détaillés pour les sous-périodes
        hc_nuit_kwh = Decimal(0)
        hc_weekend_kwh = Decimal(0)

        for point in consumption.points:
            weekday = point.timestamp.weekday()
            hour = point.timestamp.hour
            is_weekend = weekday >= 5  # samedi = 5, dimanche = 6

            kwh = point.value_kwh

            if is_weekend:
                # Week-end : tout en HC
                hc_kwh += kwh
                hc_cost += kwh * hc_price
                hc_weekend_kwh += kwh
            else:
                # Semaine : HC de 23h à 6h, HP de 6h à 23h
                # Note: 23h = heure 23, 6h = heure 6
                # HC si heure >= 23 OU heure < 6
                is_hc = hour >= self.HC_START_HOUR or hour < self.HC_END_HOUR

                if is_hc:
                    hc_kwh += kwh
                    hc_cost += kwh * hc_price
                    hc_nuit_kwh += kwh
                else:
                    hp_kwh += kwh
                    hp_cost += kwh * hp_price

        total_kwh = hc_kwh + hp_kwh
        total_cost = hc_cost + hp_cost
        subscription_cost = self._calculate_subscription(
            consumption.days_count, subscription_monthly
        )

        # Construire les périodes avec détail
        periods = []

        # Période HC avec détail (nuit + week-end)
        if hc_kwh > 0:
            # Si on a les deux sous-types, les afficher séparément
            if hc_nuit_kwh > 0 and hc_weekend_kwh > 0:
                periods.append(
                    PeriodDetail(
                        name="HC Nuit (sem. 23h-6h)",
                        code="hc_nuit",
                        consumption_kwh=hc_nuit_kwh,
                        unit_price=hc_price,
                        cost_euros=hc_nuit_kwh * hc_price,
                        color="#818CF8",  # indigo clair
                        percentage=self._calculate_period_percentage(hc_nuit_kwh, total_kwh),
                    )
                )
                periods.append(
                    PeriodDetail(
                        name="HC Week-end (24h)",
                        code="hc_weekend",
                        consumption_kwh=hc_weekend_kwh,
                        unit_price=hc_price,
                        cost_euros=hc_weekend_kwh * hc_price,
                        color="#6366F1",  # indigo
                        percentage=self._calculate_period_percentage(hc_weekend_kwh, total_kwh),
                    )
                )
            else:
                # Sinon, une seule période HC
                periods.append(
                    PeriodDetail(
                        name="Heures Creuses",
                        code="hc",
                        consumption_kwh=hc_kwh,
                        unit_price=hc_price,
                        cost_euros=hc_cost,
                        color="#6366F1",  # indigo
                        percentage=self._calculate_period_percentage(hc_kwh, total_kwh),
                    )
                )

        # Période HP
        if hp_kwh > 0:
            periods.append(
                PeriodDetail(
                    name="HP Semaine (6h-23h)",
                    code="hp",
                    consumption_kwh=hp_kwh,
                    unit_price=hp_price,
                    cost_euros=hp_cost,
                    color="#F59E0B",  # amber
                    percentage=self._calculate_period_percentage(hp_kwh, total_kwh),
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
