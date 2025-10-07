"""
Import EDF Vert Électrique Régional offers
Applicable au 15 septembre 2025
"""
import asyncio
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent))

from sqlalchemy import select
from models.database import async_session_maker
from models.energy_provider import EnergyProvider, EnergyOffer
from datetime import datetime, UTC
import uuid


async def import_offers():
    """Import EDF Vert Électrique Régional offers"""
    async with async_session_maker() as session:
        async with session.begin():
            # Get or create EDF provider
            result = await session.execute(
                select(EnergyProvider).where(EnergyProvider.name == "EDF")
            )
            provider = result.scalar_one_or_none()

            if not provider:
                provider = EnergyProvider(
                    id=str(uuid.uuid4()),
                    name="EDF",
                    website="https://www.edf.fr",
                    is_active=True
                )
                session.add(provider)
                await session.flush()
                print(f"✅ Created provider: EDF")

            # Option BASE (TTC)
            base_offers = [
                {"power": 6, "subscription": 15.47, "price": 18.96},
                {"power": 9, "subscription": 19.39, "price": 19.04},
                {"power": 12, "subscription": 23.32, "price": 19.04},
                {"power": 15, "subscription": 27.06, "price": 19.04},
                {"power": 18, "subscription": 30.76, "price": 19.04},
                {"power": 24, "subscription": 38.79, "price": 19.04},
                {"power": 30, "subscription": 46.44, "price": 19.04},
                {"power": 36, "subscription": 54.29, "price": 19.04},
            ]

            # Option Heures Creuses (TTC)
            hchp_offers = [
                {"power": 6, "subscription": 15.74, "hc": 15.05, "hp": 20.95},
                {"power": 9, "subscription": 19.81, "hc": 15.05, "hp": 20.95},
                {"power": 12, "subscription": 23.76, "hc": 15.05, "hp": 20.95},
                {"power": 15, "subscription": 27.49, "hc": 15.05, "hp": 20.95},
                {"power": 18, "subscription": 31.34, "hc": 15.05, "hp": 20.95},
                {"power": 24, "subscription": 39.47, "hc": 15.05, "hp": 20.95},
                {"power": 30, "subscription": 47.02, "hc": 15.05, "hp": 20.95},
                {"power": 36, "subscription": 54.61, "hc": 15.05, "hp": 20.95},
            ]

            created_count = 0

            # Create BASE offers
            for data in base_offers:
                offer = EnergyOffer(
                    id=str(uuid.uuid4()),
                    provider_id=provider.id,
                    name=f"Vert Électrique Régional - BASE {data['power']} kVA",
                    offer_type="BASE",
                    description="Offre d'électricité verte régionale",
                    subscription_price=data["subscription"],
                    base_price=data["price"] / 100,  # Convert cents to euros
                    power_kva=data["power"],
                    price_updated_at=datetime(2025, 9, 15, tzinfo=UTC),
                    is_active=True,
                )
                session.add(offer)
                created_count += 1
                print(f"✅ Created: {offer.name}")

            # Create HC/HP offers
            for data in hchp_offers:
                offer = EnergyOffer(
                    id=str(uuid.uuid4()),
                    provider_id=provider.id,
                    name=f"Vert Électrique Régional - HC/HP {data['power']} kVA",
                    offer_type="HC_HP",
                    description="Offre d'électricité verte régionale avec heures creuses",
                    subscription_price=data["subscription"],
                    hc_price=data["hc"] / 100,  # Convert cents to euros
                    hp_price=data["hp"] / 100,  # Convert cents to euros
                    power_kva=data["power"],
                    price_updated_at=datetime(2025, 9, 15, tzinfo=UTC),
                    is_active=True,
                )
                session.add(offer)
                created_count += 1
                print(f"✅ Created: {offer.name}")

            await session.commit()
            print(f"\n✅ Successfully imported {created_count} Vert Électrique Régional offers")


if __name__ == "__main__":
    print("Importing EDF Vert Électrique Régional offers...")
    asyncio.run(import_offers())
