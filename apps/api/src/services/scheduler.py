"""Background scheduler for periodic tasks"""
import asyncio
from datetime import datetime, UTC
from sqlalchemy.ext.asyncio import AsyncSession
from ..models.database import async_session_maker
from .rte import rte_service


async def refresh_tempo_cache_task():
    """Refresh TEMPO cache from RTE API (runs daily)"""
    while True:
        try:
            print(f"[SCHEDULER] {datetime.now(UTC).isoformat()} - Starting TEMPO cache refresh...")

            async with async_session_maker() as db:
                # RTE API limitation: only today + tomorrow (after 6am)
                updated_count = await rte_service.update_tempo_cache(db)
                print(f"[SCHEDULER] Successfully refreshed {updated_count} TEMPO days")

                # Don't clean old data - keep all historical TEMPO records
                # deleted_count = await rte_service.clear_old_data(db, days_to_keep=1825)
                # print(f"[SCHEDULER] Cleaned {deleted_count} old TEMPO records")

        except Exception as e:
            print(f"[SCHEDULER ERROR] Failed to refresh TEMPO cache: {e}")
            import traceback
            traceback.print_exc()

        # Wait 24 hours before next refresh
        await asyncio.sleep(86400)


def start_background_tasks():
    """Start all background tasks"""
    asyncio.create_task(refresh_tempo_cache_task())
    print("[SCHEDULER] Background tasks started")
