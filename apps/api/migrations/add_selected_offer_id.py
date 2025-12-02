"""
Migration: Add selected_offer_id column to pdls table

This migration adds a selected_offer_id column to the pdls table
to allow users to select an energy offer for their PDL.
"""
import asyncio
import sys
sys.path.insert(0, '/app')

from sqlalchemy import text
from src.models.database import async_session_maker


async def migrate():
    """Add selected_offer_id column to pdls table"""
    async with async_session_maker() as session:
        async with session.begin():
            # Add selected_offer_id column
            await session.execute(text('''
                ALTER TABLE pdls
                ADD COLUMN IF NOT EXISTS selected_offer_id VARCHAR(36)
            '''))

            # Add foreign key constraint to energy_offers table
            await session.execute(text('''
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1
                        FROM pg_constraint
                        WHERE conname = 'fk_pdls_selected_offer_id'
                    ) THEN
                        ALTER TABLE pdls
                        ADD CONSTRAINT fk_pdls_selected_offer_id
                        FOREIGN KEY (selected_offer_id) REFERENCES energy_offers(id)
                        ON DELETE SET NULL;
                    END IF;
                END $$;
            '''))

            print("Added selected_offer_id column to pdls table")


async def rollback():
    """Remove selected_offer_id column from pdls table"""
    async with async_session_maker() as session:
        async with session.begin():
            # Drop foreign key constraint first
            await session.execute(text('''
                ALTER TABLE pdls
                DROP CONSTRAINT IF EXISTS fk_pdls_selected_offer_id
            '''))

            # Drop the column
            await session.execute(text('''
                ALTER TABLE pdls
                DROP COLUMN IF EXISTS selected_offer_id
            '''))

            print("Removed selected_offer_id column from pdls table")


if __name__ == "__main__":
    print("Running migration: add_selected_offer_id")
    asyncio.run(migrate())
    print("Migration completed successfully!")
