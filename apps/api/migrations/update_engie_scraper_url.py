"""
Migration: Update Engie scraper URL from PDF to HelloWatt

This migration updates the Engie provider's scraper_urls to use HelloWatt
comparison site instead of the old PDF URL.
"""
import asyncio
from sqlalchemy import text
from src.models.database import get_db


async def migrate():
    """Update Engie scraper_urls to use HelloWatt"""
    async for db in get_db():
        try:
            # Update Engie scraper_urls to HelloWatt
            result = await db.execute(text("""
                UPDATE energy_providers
                SET scraper_urls = '["https://www.hellowatt.fr/fournisseurs/engie/tarif-prix-kwh-engie"]'::json
                WHERE name = 'Engie';
            """))

            await db.commit()
            print("✅ Migration completed successfully")
            print("   - Updated Engie scraper_urls to HelloWatt")
            print(f"   - Rows affected: {result.rowcount}")

        except Exception as e:
            await db.rollback()
            print(f"❌ Migration failed: {e}")
            raise
        finally:
            break


if __name__ == "__main__":
    asyncio.run(migrate())
