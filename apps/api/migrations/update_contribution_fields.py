"""
Update offer_contributions: make screenshot_url nullable and add power_kva
"""
import asyncio
import sys
sys.path.insert(0, '/app')

from sqlalchemy import text
from src.models.database import async_session_maker


async def migrate():
    async with async_session_maker() as session:
        async with session.begin():
            # Make screenshot_url nullable
            await session.execute(text('''
                ALTER TABLE offer_contributions
                ALTER COLUMN screenshot_url DROP NOT NULL
            '''))

            # Add power_kva column
            await session.execute(text('''
                ALTER TABLE offer_contributions
                ADD COLUMN IF NOT EXISTS power_kva INTEGER
            '''))

            print("✅ Migration completed: Updated screenshot_url to nullable and added power_kva column")


if __name__ == "__main__":
    asyncio.run(migrate())
