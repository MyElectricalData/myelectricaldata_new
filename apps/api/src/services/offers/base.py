"""
Classe abstraite de base pour les calculateurs d'offres tarifaires.

Chaque type d'offre (BASE, HC_HP, TEMPO, EJP, etc.) doit hériter de cette classe
et implémenter la méthode calculate().
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, date
from decimal import Decimal
from typing import ClassVar


@dataclass
class ConsumptionPoint:
    """Point de consommation individuel (une mesure)."""

    timestamp: datetime
    value_wh: int  # Consommation en Wh
    interval_minutes: int = 30  # Durée de l'intervalle (30 min par défaut pour Linky)

    @property
    def value_kwh(self) -> Decimal:
        """Consommation en kWh."""
        return Decimal(self.value_wh) / Decimal(1000)


@dataclass
class ConsumptionData:
    """Données de consommation pour le calcul."""

    points: list[ConsumptionPoint]  # Points de consommation détaillés
    start_date: date
    end_date: date

    # Optionnel: horaires HC personnalisés (si différents de ceux de l'offre)
    hc_schedules: dict[str, str] | None = None  # {"monday": "22:00-06:00", ...}

    @property
    def total_kwh(self) -> Decimal:
        """Consommation totale en kWh."""
        return sum((p.value_kwh for p in self.points), Decimal(0))

    @property
    def days_count(self) -> int:
        """Nombre de jours dans la période."""
        return (self.end_date - self.start_date).days + 1


@dataclass
class PeriodDetail:
    """Détail de consommation/coût pour une période spécifique."""

    name: str  # Ex: "Heures Creuses", "Jour Bleu HC", "Normal"
    code: str  # Ex: "hc", "tempo_blue_hc", "ejp_normal"
    consumption_kwh: Decimal
    unit_price: Decimal  # €/kWh
    cost_euros: Decimal
    color: str | None = None  # Couleur pour l'affichage (ex: "#3B82F6")
    percentage: Decimal = Decimal(0)  # % de la consommation totale


@dataclass
class CalculationResult:
    """Résultat complet d'un calcul tarifaire."""

    # Totaux
    total_kwh: Decimal
    total_cost_euros: Decimal  # Coût énergie uniquement
    subscription_cost_euros: Decimal  # Coût abonnement sur la période
    total_with_subscription: Decimal  # Total incluant l'abonnement

    # Détail par période
    periods: list[PeriodDetail]

    # Méta-données
    offer_type: str  # Code du type d'offre (BASE, HC_HP, etc.)
    offer_name: str  # Nom de l'offre
    calculation_date: datetime = field(default_factory=datetime.now)
    days_count: int = 0

    # Prix moyens
    @property
    def average_price_kwh(self) -> Decimal:
        """Prix moyen du kWh sur la période."""
        if self.total_kwh == 0:
            return Decimal(0)
        return self.total_cost_euros / self.total_kwh

    @property
    def daily_average_kwh(self) -> Decimal:
        """Consommation moyenne quotidienne."""
        if self.days_count == 0:
            return Decimal(0)
        return self.total_kwh / Decimal(self.days_count)

    @property
    def daily_average_cost(self) -> Decimal:
        """Coût moyen quotidien (avec abonnement)."""
        if self.days_count == 0:
            return Decimal(0)
        return self.total_with_subscription / Decimal(self.days_count)


class BaseOfferCalculator(ABC):
    """
    Classe abstraite pour les calculateurs d'offres tarifaires.

    Chaque type d'offre doit:
    1. Définir les attributs de classe (code, name, description, etc.)
    2. Implémenter la méthode calculate()
    3. S'enregistrer automatiquement via le décorateur @register_offer
    """

    # Attributs de classe à définir dans chaque sous-classe
    code: ClassVar[str]  # Ex: "BASE", "HC_HP", "TEMPO"
    name: ClassVar[str]  # Ex: "Base", "Heures Creuses / Heures Pleines"
    description: ClassVar[str]  # Description pour l'utilisateur
    icon: ClassVar[str]  # Icône Lucide (ex: "zap", "clock")
    color: ClassVar[str]  # Couleur principale (hex)

    # Champs de prix requis et optionnels
    required_price_fields: ClassVar[list[str]]
    optional_price_fields: ClassVar[list[str]] = []

    # Ordre d'affichage dans les listes
    display_order: ClassVar[int] = 0

    @classmethod
    def get_metadata(cls) -> dict:
        """Retourne les métadonnées du type d'offre pour l'API."""
        return {
            "code": cls.code,
            "name": cls.name,
            "description": cls.description,
            "icon": cls.icon,
            "color": cls.color,
            "required_price_fields": cls.required_price_fields,
            "optional_price_fields": cls.optional_price_fields,
            "display_order": cls.display_order,
        }

    @abstractmethod
    def calculate(
        self,
        consumption: ConsumptionData,
        prices: dict[str, Decimal],
        subscription_monthly: Decimal,
        hc_schedules: dict[str, str] | None = None,
    ) -> CalculationResult:
        """
        Calcule le coût de la consommation selon ce type d'offre.

        Args:
            consumption: Données de consommation (points détaillés)
            prices: Dictionnaire des prix (ex: {"base_price": 0.1952} ou {"hc_price": 0.1635, "hp_price": 0.2081})
            subscription_monthly: Prix de l'abonnement mensuel en €
            hc_schedules: Horaires HC personnalisés (optionnel)

        Returns:
            CalculationResult avec le détail des coûts
        """
        pass

    def _calculate_subscription(self, days_count: int, monthly_price: Decimal) -> Decimal:
        """Calcule le coût de l'abonnement au prorata du nombre de jours."""
        # 30.44 = nombre moyen de jours par mois
        daily_rate = monthly_price / Decimal("30.44")
        return daily_rate * Decimal(days_count)

    def _calculate_period_percentage(self, period_kwh: Decimal, total_kwh: Decimal) -> Decimal:
        """Calcule le pourcentage d'une période par rapport au total."""
        if total_kwh == 0:
            return Decimal(0)
        return (period_kwh / total_kwh * Decimal(100)).quantize(Decimal("0.1"))
