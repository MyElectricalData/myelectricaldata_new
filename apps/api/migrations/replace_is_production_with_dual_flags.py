"""
Migration: Replace is_production with has_consumption and has_production
"""
import asyncio
import sys
sys.path.insert(0, '/app')

from sqlalchemy import text
from src.models.database import async_session_maker


async def migrate():
    """Replace is_production with has_consumption and has_production"""
    async with async_session_maker() as session:
        async with session.begin():
            # Add new columns
            await session.execute(text('''
                ALTER TABLE pdls
                ADD COLUMN IF NOT EXISTS has_consumption BOOLEAN NOT NULL DEFAULT TRUE
            '''))

            await session.execute(text('''
                ALTER TABLE pdls
                ADD COLUMN IF NOT EXISTS has_production BOOLEAN NOT NULL DEFAULT FALSE
            '''))

            print("✅ Added has_consumption and has_production columns")

            # Migrate existing data
            await session.execute(text('''
                UPDATE pdls
                SET has_consumption = CASE WHEN is_production = TRUE THEN FALSE ELSE TRUE END,
                    has_production = is_production
                WHERE is_production IS NOT NULL
            '''))

            print("✅ Migrated existing data")

            # Drop old column
            await session.execute(text('''
                ALTER TABLE pdls
                DROP COLUMN IF EXISTS is_production
            '''))

            print("✅ Dropped is_production column")


async def rollback():
    """Rollback to single is_production column"""
    async with async_session_maker() as session:
        async with session.begin():
            # Add back is_production
            await session.execute(text('''
                ALTER TABLE pdls
                ADD COLUMN IF NOT EXISTS is_production BOOLEAN NOT NULL DEFAULT FALSE
            '''))

            # Migrate data back
            await session.execute(text('''
                UPDATE pdls
                SET is_production = has_production
            '''))

            # Drop new columns
            await session.execute(text('''
                ALTER TABLE pdls
                DROP COLUMN IF EXISTS has_consumption,
                DROP COLUMN IF EXISTS has_production
            '''))

            print("✅ Rollback completed")


if __name__ == "__main__":
    print("Running migration: replace_is_production_with_dual_flags")
    asyncio.run(migrate())
    print("Migration completed successfully!")
