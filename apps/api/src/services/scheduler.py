"""Background scheduler for periodic tasks"""
import asyncio
from datetime import datetime, UTC, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from ..models.database import async_session_maker
from ..models.refresh_tracker import RefreshTracker
from .rte import rte_service


async def should_refresh(db: AsyncSession, cache_type: str, min_interval_minutes: int) -> bool:
    """Check if cache should be refreshed based on last refresh time"""
    tracker = await db.execute(
        select(RefreshTracker).where(RefreshTracker.cache_type == cache_type)
    )
    tracker = tracker.scalar_one_or_none()

    if not tracker:
        return True  # Never refreshed

    time_since_refresh = datetime.now(UTC) - tracker.last_refresh
    return time_since_refresh > timedelta(minutes=min_interval_minutes)


async def update_refresh_time(db: AsyncSession, cache_type: str):
    """Update the last refresh time for a cache type"""
    tracker = await db.execute(
        select(RefreshTracker).where(RefreshTracker.cache_type == cache_type)
    )
    tracker = tracker.scalar_one_or_none()

    if tracker:
        tracker.last_refresh = datetime.now(UTC)
    else:
        tracker = RefreshTracker(cache_type=cache_type, last_refresh=datetime.now(UTC))
        db.add(tracker)

    await db.commit()


async def refresh_tempo_cache_task():
    """Refresh TEMPO cache from RTE API (runs every 10 minutes)"""
    while True:
        try:
            async with async_session_maker() as db:
                # Check if we should refresh (minimum 10 minutes between refreshes)
                if await should_refresh(db, 'tempo', 10):
                    print(f"[SCHEDULER] {datetime.now(UTC).isoformat()} - Starting TEMPO cache refresh...")

                    # RTE API limitation: only today + tomorrow (after 6am)
                    updated_count = await rte_service.update_tempo_cache(db)
                    print(f"[SCHEDULER] Successfully refreshed {updated_count} TEMPO days")

                    # Update last refresh time
                    await update_refresh_time(db, 'tempo')
                else:
                    print(f"[SCHEDULER] Skipping TEMPO refresh - last refresh too recent")

        except Exception as e:
            print(f"[SCHEDULER ERROR] Failed to refresh TEMPO cache: {e}")
            import traceback
            traceback.print_exc()

        # Wait 10 minutes before next check
        await asyncio.sleep(600)


async def refresh_ecowatt_cache_task():
    """Refresh EcoWatt cache from RTE API (runs every hour)"""
    while True:
        try:
            async with async_session_maker() as db:
                # Check if we should refresh (minimum 60 minutes between refreshes)
                if await should_refresh(db, 'ecowatt', 60):
                    print(f"[SCHEDULER] {datetime.now(UTC).isoformat()} - Starting EcoWatt cache refresh...")

                    updated_count = await rte_service.update_ecowatt_cache(db)
                    print(f"[SCHEDULER] Successfully refreshed {updated_count} EcoWatt signals")

                    # Update last refresh time
                    await update_refresh_time(db, 'ecowatt')
                else:
                    print(f"[SCHEDULER] Skipping EcoWatt refresh - last refresh too recent")

        except Exception as e:
            print(f"[SCHEDULER ERROR] Failed to refresh EcoWatt cache: {e}")
            import traceback
            traceback.print_exc()

        # Wait 1 hour before next check
        await asyncio.sleep(3600)


def start_background_tasks():
    """Start all background tasks"""
    asyncio.create_task(refresh_tempo_cache_task())
    asyncio.create_task(refresh_ecowatt_cache_task())
    print("[SCHEDULER] Background tasks started")
