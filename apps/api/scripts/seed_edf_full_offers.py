"""
Seed EDF Tarif Bleu offers with all power levels
Based on official EDF pricing document
"""
import asyncio
import sys
sys.path.insert(0, '/app')

from datetime import datetime, timezone
from sqlalchemy import select
from src.models.database import async_session_maker
from src.models import EnergyProvider, EnergyOffer

# Date de mise à jour des tarifs EDF (1er août 2025)
PRICE_UPDATE_DATE = datetime(2025, 8, 1, 0, 0, 0, tzinfo=timezone.utc)


async def seed():
    async with async_session_maker() as session:
        # Get EDF provider
        result = await session.execute(select(EnergyProvider).where(EnergyProvider.name == 'EDF'))
        provider = result.scalar_one_or_none()

        if not provider:
            print("EDF provider not found! Run seed_edf_offers.py first")
            return

        print(f"Found EDF provider: {provider.id}")

        # Delete existing EDF offers to avoid duplicates
        result = await session.execute(
            select(EnergyOffer).where(EnergyOffer.provider_id == provider.id)
        )
        existing_offers = result.scalars().all()
        for offer in existing_offers:
            await session.delete(offer)
        print(f"Deleted {len(existing_offers)} existing EDF offers")

        # BASE offers (Option Base TTC)
        base_offers = [
            # kVA, Abonnement €/mois, Prix kWh
            (3, 11.73, 0.1952),
            (6, 15.47, 0.1952),
            (9, 19.39, 0.1952),
            (12, 23.32, 0.1952),
            (15, 27.06, 0.1952),
            (18, 30.76, 0.1952),
            (24, 38.79, 0.1952),
            (30, 46.44, 0.1952),
            (36, 54.29, 0.1952),
        ]

        for kva, subscription, base_price in base_offers:
            offer = EnergyOffer(
                provider_id=provider.id,
                name=f"Tarif Bleu - BASE {kva} kVA",
                offer_type="BASE",
                subscription_price=subscription,
                base_price=base_price,
                price_updated_at=PRICE_UPDATE_DATE,
            )
            session.add(offer)
            print(f"Created: Tarif Bleu - BASE {kva} kVA")

        # HC/HP offers (Option Heures Creuses TTC)
        hchp_offers = [
            # kVA, Abonnement €/mois, HP €/kWh, HC €/kWh
            (6, 15.74, 0.2081, 0.1635),
            (9, 19.81, 0.2081, 0.1635),
            (12, 23.76, 0.2081, 0.1635),
            (15, 27.49, 0.2081, 0.1635),
            (18, 31.34, 0.2081, 0.1635),
            (24, 39.47, 0.2081, 0.1635),
            (30, 47.02, 0.2081, 0.1635),
            (36, 54.61, 0.2081, 0.1635),
        ]

        for kva, subscription, hp_price, hc_price in hchp_offers:
            offer = EnergyOffer(
                provider_id=provider.id,
                name=f"Tarif Bleu - HC/HP {kva} kVA",
                offer_type="HC_HP",
                subscription_price=subscription,
                hp_price=hp_price,
                hc_price=hc_price,
                price_updated_at=PRICE_UPDATE_DATE,
            )
            session.add(offer)
            print(f"Created: Tarif Bleu - HC/HP {kva} kVA")

        # TEMPO offers (Option Tempo TTC)
        tempo_offers = [
            # kVA, Abonnement €/mois, Bleu HC, Bleu HP, Blanc HC, Blanc HP, Rouge HC, Rouge HP
            (6, 15.50, 0.1232, 0.1494, 0.1391, 0.1730, 0.1460, 0.6468),
            (9, 19.49, 0.1232, 0.1494, 0.1391, 0.1730, 0.1460, 0.6468),
            (12, 23.38, 0.1232, 0.1494, 0.1391, 0.1730, 0.1460, 0.6468),
            (15, 27.01, 0.1232, 0.1494, 0.1391, 0.1730, 0.1460, 0.6468),
            (18, 30.79, 0.1232, 0.1494, 0.1391, 0.1730, 0.1460, 0.6468),
            (30, 46.31, 0.1232, 0.1494, 0.1391, 0.1730, 0.1460, 0.6468),
            (36, 54.43, 0.1232, 0.1494, 0.1391, 0.1730, 0.1460, 0.6468),
        ]

        for kva, subscription, blue_hc, blue_hp, white_hc, white_hp, red_hc, red_hp in tempo_offers:
            offer = EnergyOffer(
                provider_id=provider.id,
                name=f"Tarif Bleu - TEMPO {kva} kVA",
                offer_type="TEMPO",
                subscription_price=subscription,
                tempo_blue_hc=blue_hc,
                tempo_blue_hp=blue_hp,
                tempo_white_hc=white_hc,
                tempo_white_hp=white_hp,
                tempo_red_hc=red_hc,
                tempo_red_hp=red_hp,
                price_updated_at=PRICE_UPDATE_DATE,
            )
            session.add(offer)
            print(f"Created: Tarif Bleu - TEMPO {kva} kVA")

        await session.commit()
        print(f"\n✅ Successfully created {len(base_offers) + len(hchp_offers) + len(tempo_offers)} EDF offers")


if __name__ == "__main__":
    asyncio.run(seed())
