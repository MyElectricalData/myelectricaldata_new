"""
Add price_sheet_url and screenshot_url columns to offer_contributions table
"""
import asyncio
import sys
sys.path.insert(0, '/app')

from sqlalchemy import text
from src.models.database import async_session_maker


async def migrate():
    async with async_session_maker() as session:
        async with session.begin():
            # Add price_sheet_url column
            await session.execute(text('''
                ALTER TABLE offer_contributions
                ADD COLUMN IF NOT EXISTS price_sheet_url VARCHAR(1024) NOT NULL DEFAULT ''
            '''))

            # Add screenshot_url column
            await session.execute(text('''
                ALTER TABLE offer_contributions
                ADD COLUMN IF NOT EXISTS screenshot_url VARCHAR(1024) NOT NULL DEFAULT ''
            '''))

            print("✅ Migration completed: Added price_sheet_url and screenshot_url columns to offer_contributions")


if __name__ == "__main__":
    asyncio.run(migrate())
