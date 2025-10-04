"""
Add price_updated_at column to energy_offers table
"""
import asyncio
import sys
sys.path.insert(0, '/app')

from sqlalchemy import text
from src.models.database import async_session_maker


async def migrate():
    async with async_session_maker() as session:
        async with session.begin():
            # Add price_updated_at column
            await session.execute(text('''
                ALTER TABLE energy_offers
                ADD COLUMN IF NOT EXISTS price_updated_at TIMESTAMP WITH TIME ZONE
            '''))

            print("✅ Migration completed: Added price_updated_at column to energy_offers")


if __name__ == "__main__":
    asyncio.run(migrate())
