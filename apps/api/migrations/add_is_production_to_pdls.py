"""
Migration: Add is_production column to pdls table
"""
import asyncio
import sys
sys.path.insert(0, '/app')

from sqlalchemy import text
from src.models.database import async_session_maker


async def migrate():
    """Add is_production column to pdls"""
    async with async_session_maker() as session:
        async with session.begin():
            # Add is_production column
            await session.execute(text('''
                ALTER TABLE pdls
                ADD COLUMN IF NOT EXISTS is_production BOOLEAN NOT NULL DEFAULT FALSE
            '''))

            print("✅ Added is_production column to pdls table")


async def rollback():
    """Remove is_production column from pdls"""
    async with async_session_maker() as session:
        async with session.begin():
            await session.execute(text('''
                ALTER TABLE pdls
                DROP COLUMN IF EXISTS is_production
            '''))

            print("✅ Removed is_production column from pdls table")


if __name__ == "__main__":
    print("Running migration: add_is_production_to_pdls")
    asyncio.run(migrate())
    print("Migration completed successfully!")
