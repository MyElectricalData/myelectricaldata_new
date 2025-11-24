"""
Migration to initialize energy providers

Creates the 3 main energy providers:
- EDF
- Enercoop
- TotalEnergies

Run this before running the price refresh endpoint.
"""

import asyncio
import sys
from pathlib import Path

# Add parent directory to path
sys.path.append(str(Path(__file__).parent.parent))

from sqlalchemy import select
from src.models.database import get_db_session
from src.models import EnergyProvider


async def init_energy_providers():
    """Initialize energy providers"""
    async for db in get_db_session():
        try:
            print("Initializing energy providers...")

            providers_data = [
                {
                    "name": "EDF",
                    "logo_url": None,
                    "website": "https://particulier.edf.fr",
                    "is_active": True,
                },
                {
                    "name": "Enercoop",
                    "logo_url": None,
                    "website": "https://www.enercoop.fr",
                    "is_active": True,
                },
                {
                    "name": "TotalEnergies",
                    "logo_url": None,
                    "website": "https://totalenergies.fr/particuliers/electricite-gaz",
                    "is_active": True,
                },
            ]

            created_count = 0
            existing_count = 0

            for provider_data in providers_data:
                # Check if provider exists
                result = await db.execute(
                    select(EnergyProvider).where(EnergyProvider.name == provider_data["name"])
                )
                existing_provider = result.scalar_one_or_none()

                if not existing_provider:
                    provider = EnergyProvider(**provider_data)
                    db.add(provider)
                    created_count += 1
                    print(f"  ✓ Created: {provider_data['name']}")
                else:
                    # Update existing provider
                    for key, value in provider_data.items():
                        setattr(existing_provider, key, value)
                    existing_count += 1
                    print(f"  - Exists: {provider_data['name']} (updated)")

            await db.commit()

            print(f"\n✅ Energy providers initialized!")
            print(f"  Created: {created_count}")
            print(f"  Updated: {existing_count}")
            print(f"\nNext step: Run the price refresh endpoint to populate offers:")
            print("  POST /api/admin/offers/refresh")

        except Exception as e:
            await db.rollback()
            print(f"\n❌ Error: {str(e)}")
            import traceback
            traceback.print_exc()
            raise
        finally:
            await db.close()
            break


if __name__ == "__main__":
    asyncio.run(init_energy_providers())
