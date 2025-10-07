"""
Migration: Extract power_kva from offer names
"""
import asyncio
import sys
import re
sys.path.insert(0, '/app')

from sqlalchemy import select, text
from src.models.database import async_session_maker
from src.models.energy_provider import EnergyOffer


async def migrate():
    """Extract power_kva from offer names and update the column"""
    async with async_session_maker() as session:
        async with session.begin():
            # Get all offers
            result = await session.execute(select(EnergyOffer))
            offers = result.scalars().all()

            updated_count = 0
            patterns = [
                r'(\d+)\s*kVA',  # Match "3 kVA", "6 kVA", etc.
                r'(\d+)\s*kva',  # Match "3 kva" (lowercase)
            ]

            for offer in offers:
                if offer.power_kva is None and offer.name:
                    # Try to extract power from name
                    for pattern in patterns:
                        match = re.search(pattern, offer.name, re.IGNORECASE)
                        if match:
                            power = int(match.group(1))
                            # Validate that it's a standard power value
                            if power in [3, 6, 9, 12, 15, 18, 24, 30, 36]:
                                offer.power_kva = power
                                updated_count += 1
                                print(f"✅ Updated '{offer.name}' -> {power} kVA")
                                break

            await session.commit()
            print(f"\n✅ Migration completed: Updated {updated_count} offers with power_kva")


if __name__ == "__main__":
    asyncio.run(migrate())
