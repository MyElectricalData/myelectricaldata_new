"""
Migration: Add power_kva column to energy_offers table
"""
import asyncio
import sys
sys.path.insert(0, '/app')

from sqlalchemy import text
from src.models.database import async_session_maker


async def migrate():
    """Add power_kva column to energy_offers"""
    async with async_session_maker() as session:
        async with session.begin():
            # Add power_kva column
            await session.execute(text('''
                ALTER TABLE energy_offers
                ADD COLUMN IF NOT EXISTS power_kva INTEGER
            '''))

            print("✅ Added power_kva column to energy_offers table")


async def rollback():
    """Remove power_kva column from energy_offers"""
    async with async_session_maker() as session:
        async with session.begin():
            await session.execute(text('''
                ALTER TABLE energy_offers
                DROP COLUMN IF EXISTS power_kva
            '''))

            print("✅ Removed power_kva column from energy_offers table")


if __name__ == "__main__":
    print("Running migration: add_power_kva_to_offers")
    asyncio.run(migrate())
    print("Migration completed successfully!")
