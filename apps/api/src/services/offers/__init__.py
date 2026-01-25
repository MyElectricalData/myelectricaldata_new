"""
Module de calcul tarifaire pour les offres d'énergie.

Ce module fournit des calculateurs pour chaque type d'offre (BASE, HC_HP, TEMPO, EJP, etc.)
avec auto-discovery pour le frontend.

Utilisation:
    from services.offers import OfferRegistry, get_calculator

    # Obtenir tous les types d'offres disponibles
    offer_types = OfferRegistry.get_all_types()

    # Obtenir un calculateur pour un type spécifique
    calculator = get_calculator("TEMPO")
    result = calculator.calculate(consumption_data, offer_prices)
"""

from .base import BaseOfferCalculator, ConsumptionData, CalculationResult, PeriodDetail
from .registry import OfferRegistry, get_calculator, get_all_offer_types
from .base_offer import BaseCalculator
from .hc_hp import HcHpCalculator
from .tempo import TempoCalculator
from .ejp import EjpCalculator
from .seasonal import SeasonalCalculator
from .hc_nuit_weekend import HcNuitWeekendCalculator
from .weekend import WeekendCalculator

__all__ = [
    # Classes de base
    "BaseOfferCalculator",
    "ConsumptionData",
    "CalculationResult",
    "PeriodDetail",
    # Calculateurs concrets
    "BaseCalculator",
    "HcHpCalculator",
    "TempoCalculator",
    "EjpCalculator",
    "SeasonalCalculator",
    "HcNuitWeekendCalculator",
    "WeekendCalculator",
    # Registry et helpers
    "OfferRegistry",
    "get_calculator",
    "get_all_offer_types",
]
