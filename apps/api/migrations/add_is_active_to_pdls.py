"""
Migration: Add is_active column to pdls table

This migration adds an is_active boolean column to the pdls table
to allow users to activate/deactivate their PDLs.
"""
import asyncio
import sys
sys.path.insert(0, '/app')

from sqlalchemy import text
from src.models.database import async_session_maker


async def migrate():
    """Add is_active column to pdls table"""
    async with async_session_maker() as session:
        async with session.begin():
            # Add is_active column
            await session.execute(text('''
                ALTER TABLE pdls
                ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE
            '''))

            print("✅ Added is_active column to pdls table")


async def rollback():
    """Remove is_active column from pdls table"""
    async with async_session_maker() as session:
        async with session.begin():
            await session.execute(text('''
                ALTER TABLE pdls
                DROP COLUMN IF EXISTS is_active
            '''))

            print("✅ Removed is_active column from pdls table")


if __name__ == "__main__":
    print("Running migration: add_is_active_to_pdls")
    asyncio.run(migrate())
    print("Migration completed successfully!")
