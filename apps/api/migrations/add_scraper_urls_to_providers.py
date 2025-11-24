"""
Migration: Add scraper_urls field to energy_providers table

This migration adds a JSON field to store the list of URLs used by the scraper
for each energy provider.
"""
import asyncio
from sqlalchemy import text
from src.models.database import get_db


async def migrate():
    """Add scraper_urls column to energy_providers table"""
    async for db in get_db():
        try:
            # Add the scraper_urls column
            await db.execute(text("""
                ALTER TABLE energy_providers
                ADD COLUMN IF NOT EXISTS scraper_urls JSON;
            """))

            # Initialize scraper_urls for existing providers
            await db.execute(text("""
                UPDATE energy_providers
                SET scraper_urls = CASE
                    WHEN name = 'EDF' THEN '["https://particulier.edf.fr/content/dam/2-Actifs/Documents/Offres/Grille_prix_Tarif_Bleu.pdf", "https://particulier.edf.fr/content/dam/2-Actifs/Documents/Offres/grille-prix-zen-week-end.pdf"]'::json
                    WHEN name = 'Enercoop' THEN '["https://www.enercoop.fr/nos-offres/particuliers/"]'::json
                    WHEN name = 'TotalEnergies' THEN '["https://totalenergies.fr/particuliers/electricite-gaz/offres/electricite"]'::json
                    ELSE NULL
                END
                WHERE scraper_urls IS NULL;
            """))

            await db.commit()
            print("✅ Migration completed successfully")
            print("   - Added scraper_urls column to energy_providers")
            print("   - Initialized URLs for EDF, Enercoop, and TotalEnergies")

        except Exception as e:
            await db.rollback()
            print(f"❌ Migration failed: {e}")
            raise
        finally:
            break


if __name__ == "__main__":
    asyncio.run(migrate())
