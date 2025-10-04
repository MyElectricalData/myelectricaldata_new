"""
Script to seed EDF Tarif Bleu offers into the database
Based on EDF pricing as of February 2024
"""
import asyncio
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from sqlalchemy import select
from src.models.database import AsyncSessionLocal
from src.models import EnergyProvider, EnergyOffer


async def seed_edf_offers():
    """Seed EDF provider and Tarif Bleu offers"""
    async with AsyncSessionLocal() as session:
        try:
            # Check if EDF provider already exists
            result = await session.execute(
                select(EnergyProvider).where(EnergyProvider.name == "EDF")
            )
            provider = result.scalar_one_or_none()

            if not provider:
                # Create EDF provider
                provider = EnergyProvider(
                    name="EDF",
                    website="https://particulier.edf.fr",
                    logo_url="https://www.edf.fr/themes/custom/edf/favicon.ico"
                )
                session.add(provider)
                await session.flush()
                print(f"✓ Created EDF provider (ID: {provider.id})")
            else:
                print(f"✓ EDF provider already exists (ID: {provider.id})")

            # EDF Tarif Bleu offers - Prices as of February 2024
            # Source: https://particulier.edf.fr/fr/accueil/gestion-contrat/options/prix.html

            offers = [
                {
                    "name": "Tarif Bleu - BASE 3 kVA",
                    "offer_type": "BASE",
                    "description": "Tarif réglementé EDF - Option Base - Puissance 3 kVA",
                    "subscription_price": 9.47,  # €/mois
                    "base_price": 0.2516,  # €/kWh
                },
                {
                    "name": "Tarif Bleu - BASE 6 kVA",
                    "offer_type": "BASE",
                    "description": "Tarif réglementé EDF - Option Base - Puissance 6 kVA",
                    "subscription_price": 12.60,  # €/mois
                    "base_price": 0.2516,  # €/kWh
                },
                {
                    "name": "Tarif Bleu - BASE 9 kVA",
                    "offer_type": "BASE",
                    "description": "Tarif réglementé EDF - Option Base - Puissance 9 kVA",
                    "subscription_price": 15.89,  # €/mois
                    "base_price": 0.2516,  # €/kWh
                },
                {
                    "name": "Tarif Bleu - HC/HP 6 kVA",
                    "offer_type": "HC_HP",
                    "description": "Tarif réglementé EDF - Option Heures Creuses/Heures Pleines - Puissance 6 kVA",
                    "subscription_price": 13.39,  # €/mois
                    "hc_price": 0.2068,  # €/kWh Heures Creuses
                    "hp_price": 0.2700,  # €/kWh Heures Pleines
                    "hc_schedules": {
                        "lundi": "22:00-06:00",
                        "mardi": "22:00-06:00",
                        "mercredi": "22:00-06:00",
                        "jeudi": "22:00-06:00",
                        "vendredi": "22:00-06:00",
                        "samedi": "22:00-06:00",
                        "dimanche": "22:00-06:00"
                    }
                },
                {
                    "name": "Tarif Bleu - HC/HP 9 kVA",
                    "offer_type": "HC_HP",
                    "description": "Tarif réglementé EDF - Option Heures Creuses/Heures Pleines - Puissance 9 kVA",
                    "subscription_price": 16.99,  # €/mois
                    "hc_price": 0.2068,  # €/kWh Heures Creuses
                    "hp_price": 0.2700,  # €/kWh Heures Pleines
                    "hc_schedules": {
                        "lundi": "22:00-06:00",
                        "mardi": "22:00-06:00",
                        "mercredi": "22:00-06:00",
                        "jeudi": "22:00-06:00",
                        "vendredi": "22:00-06:00",
                        "samedi": "22:00-06:00",
                        "dimanche": "22:00-06:00"
                    }
                },
                {
                    "name": "Tarif Bleu - HC/HP 12 kVA",
                    "offer_type": "HC_HP",
                    "description": "Tarif réglementé EDF - Option Heures Creuses/Heures Pleines - Puissance 12 kVA",
                    "subscription_price": 20.61,  # €/mois
                    "hc_price": 0.2068,  # €/kWh Heures Creuses
                    "hp_price": 0.2700,  # €/kWh Heures Pleines
                    "hc_schedules": {
                        "lundi": "22:00-06:00",
                        "mardi": "22:00-06:00",
                        "mercredi": "22:00-06:00",
                        "jeudi": "22:00-06:00",
                        "vendredi": "22:00-06:00",
                        "samedi": "22:00-06:00",
                        "dimanche": "22:00-06:00"
                    }
                },
                {
                    "name": "Tarif Bleu - TEMPO 9 kVA",
                    "offer_type": "TEMPO",
                    "description": "Tarif réglementé EDF - Option Tempo - Puissance 9 kVA",
                    "subscription_price": 12.96,  # €/mois
                    "tempo_blue_hc": 0.1296,   # €/kWh Jours Bleus HC
                    "tempo_blue_hp": 0.1609,   # €/kWh Jours Bleus HP
                    "tempo_white_hc": 0.1486,  # €/kWh Jours Blancs HC
                    "tempo_white_hp": 0.1894,  # €/kWh Jours Blancs HP
                    "tempo_red_hc": 0.1568,    # €/kWh Jours Rouges HC
                    "tempo_red_hp": 0.7562,    # €/kWh Jours Rouges HP
                },
                {
                    "name": "Tarif Bleu - TEMPO 12 kVA",
                    "offer_type": "TEMPO",
                    "description": "Tarif réglementé EDF - Option Tempo - Puissance 12 kVA",
                    "subscription_price": 16.06,  # €/mois
                    "tempo_blue_hc": 0.1296,   # €/kWh Jours Bleus HC
                    "tempo_blue_hp": 0.1609,   # €/kWh Jours Bleus HP
                    "tempo_white_hc": 0.1486,  # €/kWh Jours Blancs HC
                    "tempo_white_hp": 0.1894,  # €/kWh Jours Blancs HP
                    "tempo_red_hc": 0.1568,    # €/kWh Jours Rouges HC
                    "tempo_red_hp": 0.7562,    # €/kWh Jours Rouges HP
                },
            ]

            created_count = 0
            updated_count = 0

            for offer_data in offers:
                # Check if offer already exists
                result = await session.execute(
                    select(EnergyOffer).where(
                        EnergyOffer.provider_id == provider.id,
                        EnergyOffer.name == offer_data["name"]
                    )
                )
                existing_offer = result.scalar_one_or_none()

                if existing_offer:
                    # Update existing offer
                    existing_offer.offer_type = offer_data["offer_type"]
                    existing_offer.description = offer_data.get("description")
                    existing_offer.subscription_price = offer_data["subscription_price"]
                    existing_offer.base_price = offer_data.get("base_price")
                    existing_offer.hc_price = offer_data.get("hc_price")
                    existing_offer.hp_price = offer_data.get("hp_price")
                    existing_offer.tempo_blue_hc = offer_data.get("tempo_blue_hc")
                    existing_offer.tempo_blue_hp = offer_data.get("tempo_blue_hp")
                    existing_offer.tempo_white_hc = offer_data.get("tempo_white_hc")
                    existing_offer.tempo_white_hp = offer_data.get("tempo_white_hp")
                    existing_offer.tempo_red_hc = offer_data.get("tempo_red_hc")
                    existing_offer.tempo_red_hp = offer_data.get("tempo_red_hp")
                    existing_offer.hc_schedules = offer_data.get("hc_schedules")
                    updated_count += 1
                    print(f"↻ Updated: {offer_data['name']}")
                else:
                    # Create new offer
                    new_offer = EnergyOffer(
                        provider_id=provider.id,
                        name=offer_data["name"],
                        offer_type=offer_data["offer_type"],
                        description=offer_data.get("description"),
                        subscription_price=offer_data["subscription_price"],
                        base_price=offer_data.get("base_price"),
                        hc_price=offer_data.get("hc_price"),
                        hp_price=offer_data.get("hp_price"),
                        tempo_blue_hc=offer_data.get("tempo_blue_hc"),
                        tempo_blue_hp=offer_data.get("tempo_blue_hp"),
                        tempo_white_hc=offer_data.get("tempo_white_hc"),
                        tempo_white_hp=offer_data.get("tempo_white_hp"),
                        tempo_red_hc=offer_data.get("tempo_red_hc"),
                        tempo_red_hp=offer_data.get("tempo_red_hp"),
                        hc_schedules=offer_data.get("hc_schedules"),
                    )
                    session.add(new_offer)
                    created_count += 1
                    print(f"✓ Created: {offer_data['name']}")

            await session.commit()

            print("\n" + "="*60)
            print(f"✓ Seeding completed successfully!")
            print(f"  - Created: {created_count} offers")
            print(f"  - Updated: {updated_count} offers")
            print("="*60)

        except Exception as e:
            await session.rollback()
            print(f"\n✗ Error during seeding: {str(e)}")
            import traceback
            traceback.print_exc()
            raise


if __name__ == "__main__":
    print("="*60)
    print("Seeding EDF Tarif Bleu offers...")
    print("="*60 + "\n")
    asyncio.run(seed_edf_offers())
