"""
Migration: Add pricing_option column to pdls table

This migration adds a pricing_option VARCHAR(50) column to the pdls table
to store the user's tariff type (BASE, HC_HP, TEMPO, EJP, HC_WEEKEND).
"""
import asyncio
import sys
sys.path.insert(0, '/app')

from sqlalchemy import text
from src.models.database import async_session_maker


async def migrate():
    """Add pricing_option column to pdls table"""
    async with async_session_maker() as session:
        async with session.begin():
            # Add pricing_option column
            await session.execute(text('''
                ALTER TABLE pdls
                ADD COLUMN IF NOT EXISTS pricing_option VARCHAR(50) DEFAULT NULL
            '''))

            print("✅ Added pricing_option column to pdls table")


async def rollback():
    """Remove pricing_option column from pdls table"""
    async with async_session_maker() as session:
        async with session.begin():
            await session.execute(text('''
                ALTER TABLE pdls
                DROP COLUMN IF EXISTS pricing_option
            '''))

            print("✅ Removed pricing_option column from pdls table")


if __name__ == "__main__":
    print("Running migration: add_pricing_option_to_pdls")
    asyncio.run(migrate())
    print("Migration completed successfully!")
