"""Offres aux prix saisis à la main (mode client)

Pour un contrat dont les prix ne sont pas dans la base des offres (grille souscrite avant la grille
actuelle, offre locale…), l'utilisateur saisit lui-même son abonnement et ses prix du kWh. L'offre est
rangée sous un fournisseur réservé, à identifiant fixe : elle apparaît dans le choix de l'offre du PDL
comme les autres, et la page Consommation (€), le simulateur et les exports l'utilisent sans changement.

La synchro avec la passerelle est un miroir (elle supprime ce qui n'existe pas à distance) : elle ignore
ce fournisseur et ses offres.
"""

from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.energy_provider import EnergyOffer, EnergyProvider

CUSTOM_PROVIDER_ID = "custom-offers"
CUSTOM_PROVIDER_NAME = "Mes prix (saisie manuelle)"

# Types d'offre proposés à la saisie : prix unique ou heures creuses / pleines
CUSTOM_OFFER_TYPES = ("BASE", "HC_HP")


def is_custom_provider(provider_id: str | None) -> bool:
    return provider_id == CUSTOM_PROVIDER_ID


async def ensure_custom_provider(db: AsyncSession) -> EnergyProvider:
    """Fournisseur réservé aux offres saisies, créé au premier besoin"""
    provider = await db.get(EnergyProvider, CUSTOM_PROVIDER_ID)
    if provider is None:
        provider = EnergyProvider(id=CUSTOM_PROVIDER_ID, name=CUSTOM_PROVIDER_NAME, is_active=True)
        db.add(provider)
        await db.flush()
    return provider


async def get_custom_offer(db: AsyncSession, offer_id: str) -> EnergyOffer | None:
    """Offre saisie à la main, None si elle n'existe pas ou vient de la passerelle"""
    result = await db.execute(
        select(EnergyOffer).where(EnergyOffer.id == offer_id, EnergyOffer.provider_id == CUSTOM_PROVIDER_ID)
    )
    return result.scalar_one_or_none()


def apply_custom_prices(
    offer: EnergyOffer,
    *,
    name: str,
    offer_type: str,
    power_kva: int | None,
    subscription_price: Decimal,
    base_price: Decimal | None,
    hc_price: Decimal | None,
    hp_price: Decimal | None,
) -> None:
    """Écrit les prix saisis ; les prix sans objet pour le type d'offre sont effacés"""
    offer.name = name
    offer.offer_type = offer_type
    offer.power_kva = power_kva
    offer.subscription_price = subscription_price
    offer.base_price = base_price if offer_type == "BASE" else None
    offer.hc_price = hc_price if offer_type == "HC_HP" else None
    offer.hp_price = hp_price if offer_type == "HC_HP" else None
    offer.is_active = True
    offer.valid_to = None
    offer.price_updated_at = datetime.now(UTC)
