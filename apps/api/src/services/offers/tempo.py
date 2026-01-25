"""
Calculateur pour l'offre tarifaire TEMPO.

6 tarifs selon :
- Le jour : Bleu (300 jours/an), Blanc (43 jours), Rouge (22 jours)
- L'heure : Heures Creuses (HC) ou Heures Pleines (HP)

Les jours Rouge sont les plus chers et signalés la veille.
Idéal pour les consommateurs pouvant reporter leur consommation.
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


# Couleurs Tempo pour l'affichage
TEMPO_COLORS = {
    "blue": "#3B82F6",    # Bleu
    "white": "#F3F4F6",   # Blanc (gris clair pour visibilité)
    "red": "#EF4444",     # Rouge
}


class TempoCalculator(BaseOfferCalculator):
    """Calculateur pour l'offre TEMPO (6 tarifs jour/heure)."""

    code: ClassVar[str] = "TEMPO"
    name: ClassVar[str] = "Tempo"
    description: ClassVar[str] = (
        "6 tarifs selon le jour (Bleu, Blanc, Rouge) et l'heure (HC/HP). "
        "300 jours Bleus, 43 Blancs, 22 Rouges par an"
    )
    icon: ClassVar[str] = "palette"
    color: ClassVar[str] = "#8B5CF6"  # purple

    required_price_fields: ClassVar[list[str]] = [
        "tempo_blue_hc",
        "tempo_blue_hp",
        "tempo_white_hc",
        "tempo_white_hp",
        "tempo_red_hc",
        "tempo_red_hp",
    ]
    optional_price_fields: ClassVar[list[str]] = ["hc_schedules"]

    display_order: ClassVar[int] = 3

    def __init__(self, tempo_calendar: dict[date, str] | None = None):
        """
        Args:
            tempo_calendar: Dictionnaire date -> couleur ("BLUE", "WHITE", "RED").
                           Si None, utilise une estimation basée sur les statistiques.
        """
        self.tempo_calendar = tempo_calendar or {}

    def calculate(
        self,
        consumption: ConsumptionData,
        prices: dict[str, Decimal],
        subscription_monthly: Decimal,
        hc_schedules: dict[str, str] | None = None,
    ) -> CalculationResult:
        """
        Calcule le coût avec tarification TEMPO (6 tarifs).

        Args:
            consumption: Données de consommation
            prices: {
                "tempo_blue_hc": X, "tempo_blue_hp": Y,
                "tempo_white_hc": Z, "tempo_white_hp": W,
                "tempo_red_hc": A, "tempo_red_hp": B
            }
            subscription_monthly: Abonnement mensuel
            hc_schedules: Horaires HC personnalisés
        """
        # Récupérer les 6 prix
        blue_hc = Decimal(str(prices.get("tempo_blue_hc", 0)))
        blue_hp = Decimal(str(prices.get("tempo_blue_hp", 0)))
        white_hc = Decimal(str(prices.get("tempo_white_hc", 0)))
        white_hp = Decimal(str(prices.get("tempo_white_hp", 0)))
        red_hc = Decimal(str(prices.get("tempo_red_hc", 0)))
        red_hp = Decimal(str(prices.get("tempo_red_hp", 0)))

        # Horaires HC
        schedules = hc_schedules or consumption.hc_schedules or DEFAULT_HC_SCHEDULES

        # Accumulateurs pour les 6 périodes
        totals = {
            "blue_hc": {"kwh": Decimal(0), "cost": Decimal(0), "price": blue_hc},
            "blue_hp": {"kwh": Decimal(0), "cost": Decimal(0), "price": blue_hp},
            "white_hc": {"kwh": Decimal(0), "cost": Decimal(0), "price": white_hc},
            "white_hp": {"kwh": Decimal(0), "cost": Decimal(0), "price": white_hp},
            "red_hc": {"kwh": Decimal(0), "cost": Decimal(0), "price": red_hc},
            "red_hp": {"kwh": Decimal(0), "cost": Decimal(0), "price": red_hp},
        }

        for point in consumption.points:
            point_date = point.timestamp.date()
            weekday_name = WEEKDAY_NAMES[point.timestamp.weekday()]

            # Déterminer la couleur du jour
            day_color = self._get_day_color(point_date)

            # Déterminer HC ou HP
            day_schedule = schedules.get(weekday_name, "22:30-06:30")
            hc_start, hc_end = parse_time_range(day_schedule)
            is_hc = is_in_hc_period(point.timestamp.time(), hc_start, hc_end)

            # Clé de période
            period_key = f"{day_color}_{'hc' if is_hc else 'hp'}"

            kwh = point.value_kwh
            totals[period_key]["kwh"] += kwh
            totals[period_key]["cost"] += kwh * totals[period_key]["price"]

        # Calculer les totaux
        total_kwh = sum(t["kwh"] for t in totals.values())
        total_cost = sum(t["cost"] for t in totals.values())
        subscription_cost = self._calculate_subscription(
            consumption.days_count, subscription_monthly
        )

        # Construire les périodes (seulement celles avec consommation)
        periods = []

        period_configs = [
            ("blue_hc", "Jour Bleu HC", TEMPO_COLORS["blue"]),
            ("blue_hp", "Jour Bleu HP", "#60A5FA"),  # blue plus clair pour HP
            ("white_hc", "Jour Blanc HC", "#D1D5DB"),  # gris
            ("white_hp", "Jour Blanc HP", "#9CA3AF"),  # gris plus foncé
            ("red_hc", "Jour Rouge HC", "#FCA5A5"),  # rouge clair
            ("red_hp", "Jour Rouge HP", TEMPO_COLORS["red"]),
        ]

        for key, name, color in period_configs:
            data = totals[key]
            if data["kwh"] > 0:
                periods.append(
                    PeriodDetail(
                        name=name,
                        code=f"tempo_{key}",
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

    def _get_day_color(self, day: date) -> str:
        """
        Retourne la couleur Tempo du jour.

        Utilise le calendrier fourni, sinon fait une estimation statistique.
        """
        if day in self.tempo_calendar:
            return self.tempo_calendar[day].lower()

        # Estimation basée sur les statistiques annuelles
        # 300 jours Bleus, 43 Blancs, 22 Rouges
        # Probabilités: Bleu 82%, Blanc 12%, Rouge 6%

        # Utiliser le jour de l'année comme seed pour cohérence
        day_of_year = day.timetuple().tm_yday

        # Les jours Rouges sont généralement en hiver (nov-mars)
        # et les jours Blancs principalement en hiver aussi
        month = day.month

        if month in [12, 1, 2]:  # Hiver fort
            # Plus de chance de Rouge/Blanc
            if day_of_year % 15 == 0:  # ~24 jours/an -> Rouge
                return "red"
            elif day_of_year % 8 == 0:  # ~45 jours/an -> Blanc
                return "white"
        elif month in [11, 3]:  # Mi-saison froide
            if day_of_year % 20 == 0:
                return "white"

        return "blue"

    def set_tempo_calendar(self, calendar: dict[date, str]) -> None:
        """Met à jour le calendrier Tempo avec les vraies couleurs."""
        self.tempo_calendar = calendar
