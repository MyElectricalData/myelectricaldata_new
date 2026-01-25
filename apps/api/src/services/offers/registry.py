"""
Registre d'auto-discovery pour les calculateurs d'offres tarifaires.

Ce module permet au frontend de découvrir automatiquement tous les types
d'offres disponibles sans configuration manuelle.

Utilisation:
    from services.offers import OfferRegistry, get_calculator

    # Lister tous les types disponibles
    types = OfferRegistry.get_all_types()

    # Obtenir un calculateur
    calc = get_calculator("TEMPO")
    result = calc.calculate(consumption, prices, subscription)
"""

from typing import Type
import logging

from .base import BaseOfferCalculator

logger = logging.getLogger(__name__)


class OfferRegistry:
    """
    Registre centralisé des calculateurs d'offres.

    Utilise l'auto-discovery basé sur les sous-classes de BaseOfferCalculator.
    """

    _calculators: dict[str, Type[BaseOfferCalculator]] = {}
    _instances: dict[str, BaseOfferCalculator] = {}
    _initialized: bool = False

    @classmethod
    def _discover(cls) -> None:
        """
        Découvre automatiquement tous les calculateurs disponibles.

        Parcourt toutes les sous-classes de BaseOfferCalculator et les enregistre.
        """
        if cls._initialized:
            return

        # Import des modules pour s'assurer que les classes sont chargées
        from . import base_offer, hc_hp, tempo, ejp  # noqa: F401

        # Parcourir toutes les sous-classes de BaseOfferCalculator
        def get_all_subclasses(klass: Type) -> list[Type]:
            subclasses = []
            for subclass in klass.__subclasses__():
                subclasses.append(subclass)
                subclasses.extend(get_all_subclasses(subclass))
            return subclasses

        for calculator_class in get_all_subclasses(BaseOfferCalculator):
            # Vérifier que la classe a un code défini (pas abstraite)
            if hasattr(calculator_class, "code") and calculator_class.code:
                code = calculator_class.code
                cls._calculators[code] = calculator_class
                logger.debug(f"[OFFERS] Registered calculator: {code}")

        cls._initialized = True
        logger.info(f"[OFFERS] Discovered {len(cls._calculators)} offer types: {list(cls._calculators.keys())}")

    @classmethod
    def register(cls, calculator_class: Type[BaseOfferCalculator]) -> Type[BaseOfferCalculator]:
        """
        Décorateur pour enregistrer manuellement un calculateur.

        Usage:
            @OfferRegistry.register
            class MyCalculator(BaseOfferCalculator):
                ...
        """
        if hasattr(calculator_class, "code") and calculator_class.code:
            cls._calculators[calculator_class.code] = calculator_class
            logger.info(f"[OFFERS] Manually registered: {calculator_class.code}")
        return calculator_class

    @classmethod
    def get_calculator_class(cls, code: str) -> Type[BaseOfferCalculator] | None:
        """Retourne la classe de calculateur pour un code donné."""
        cls._discover()
        return cls._calculators.get(code)

    @classmethod
    def get_calculator(cls, code: str, **kwargs) -> BaseOfferCalculator | None:
        """
        Retourne une instance de calculateur pour un code donné.

        Les instances sont mises en cache (singleton par défaut).
        Utiliser kwargs pour passer des arguments spécifiques (ex: tempo_calendar).
        """
        cls._discover()

        # Si des kwargs sont fournis, créer une nouvelle instance
        if kwargs:
            calculator_class = cls._calculators.get(code)
            if calculator_class:
                return calculator_class(**kwargs)
            return None

        # Sinon, utiliser le cache
        if code not in cls._instances:
            calculator_class = cls._calculators.get(code)
            if calculator_class:
                cls._instances[code] = calculator_class()
            else:
                return None

        return cls._instances[code]

    @classmethod
    def get_all_types(cls) -> list[dict]:
        """
        Retourne les métadonnées de tous les types d'offres disponibles.

        Format de retour (trié par display_order):
        [
            {
                "code": "BASE",
                "name": "Base",
                "description": "...",
                "icon": "zap",
                "color": "#3B82F6",
                "required_price_fields": ["base_price"],
                "optional_price_fields": [...],
                "display_order": 1
            },
            ...
        ]
        """
        cls._discover()

        types = []
        for code, calculator_class in cls._calculators.items():
            types.append(calculator_class.get_metadata())

        # Trier par display_order
        types.sort(key=lambda x: x.get("display_order", 999))

        return types

    @classmethod
    def get_codes(cls) -> list[str]:
        """Retourne la liste des codes de tous les types d'offres."""
        cls._discover()
        return list(cls._calculators.keys())

    @classmethod
    def is_valid_code(cls, code: str) -> bool:
        """Vérifie si un code de type d'offre est valide."""
        cls._discover()
        return code in cls._calculators


# Fonctions helper pour un accès plus simple
def get_calculator(code: str, **kwargs) -> BaseOfferCalculator | None:
    """Raccourci pour OfferRegistry.get_calculator()."""
    return OfferRegistry.get_calculator(code, **kwargs)


def get_all_offer_types() -> list[dict]:
    """Raccourci pour OfferRegistry.get_all_types()."""
    return OfferRegistry.get_all_types()
