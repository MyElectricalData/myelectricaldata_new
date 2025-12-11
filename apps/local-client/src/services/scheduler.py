"""Scheduler service for periodic synchronization."""

import logging
from datetime import datetime
from typing import Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from ..config import Settings
from .sync import SyncService

logger = logging.getLogger(__name__)


class SchedulerService:
    """Service for scheduling periodic synchronization tasks.

    Manages:
    - Regular sync intervals
    - Daily full sync at specified time
    - Manual sync triggers
    """

    def __init__(self, settings: Settings, sync_service: SyncService):
        """Initialize the scheduler.

        Args:
            settings: Application settings.
            sync_service: Sync service instance.
        """
        self.settings = settings
        self.sync_service = sync_service
        self._scheduler: Optional[AsyncIOScheduler] = None
        self._last_sync: Optional[datetime] = None
        self._next_sync: Optional[datetime] = None

    async def start(self) -> None:
        """Start the scheduler."""
        self._scheduler = AsyncIOScheduler()

        # Regular sync interval
        interval_seconds = self.settings.sync.interval
        self._scheduler.add_job(
            self._run_sync,
            IntervalTrigger(seconds=interval_seconds),
            id="regular_sync",
            name="Regular synchronization",
            replace_existing=True,
        )
        logger.info(f"Scheduled regular sync every {interval_seconds} seconds")

        # Daily full sync
        full_sync_time = self.settings.sync.full_sync_time
        try:
            hour, minute = map(int, full_sync_time.split(":"))
            self._scheduler.add_job(
                self._run_full_sync,
                CronTrigger(hour=hour, minute=minute),
                id="full_sync",
                name="Daily full synchronization",
                replace_existing=True,
            )
            logger.info(f"Scheduled daily full sync at {full_sync_time}")
        except ValueError:
            logger.warning(f"Invalid full_sync_time format: {full_sync_time}")

        self._scheduler.start()
        logger.info("Scheduler started")

        # Run initial sync
        await self._run_sync()

    async def stop(self) -> None:
        """Stop the scheduler."""
        if self._scheduler:
            self._scheduler.shutdown(wait=False)
            self._scheduler = None
            logger.info("Scheduler stopped")

    async def _run_sync(self) -> None:
        """Run a regular synchronization."""
        logger.info("Running scheduled sync")
        self._last_sync = datetime.now()

        try:
            await self.sync_service.sync_all()
        except Exception as e:
            logger.error(f"Scheduled sync failed: {e}")

        self._update_next_sync()

    async def _run_full_sync(self) -> None:
        """Run a full synchronization (with extended date range)."""
        logger.info("Running daily full sync")

        # Temporarily extend days_back for full sync
        original_days_back = self.settings.sync.days_back
        try:
            # For full sync, get more historical data
            self.settings.sync.days_back = 365
            await self.sync_service.sync_all()
        except Exception as e:
            logger.error(f"Full sync failed: {e}")
        finally:
            self.settings.sync.days_back = original_days_back

    def _update_next_sync(self) -> None:
        """Update the next sync time."""
        if self._scheduler:
            job = self._scheduler.get_job("regular_sync")
            if job and job.next_run_time:
                self._next_sync = job.next_run_time

    async def trigger_sync(self) -> None:
        """Manually trigger a synchronization."""
        logger.info("Manual sync triggered")
        await self._run_sync()

    def get_status(self) -> dict:
        """Get scheduler status.

        Returns:
            Status dictionary with last/next sync times.
        """
        jobs = []
        if self._scheduler:
            for job in self._scheduler.get_jobs():
                jobs.append({
                    "id": job.id,
                    "name": job.name,
                    "next_run": job.next_run_time.isoformat() if job.next_run_time else None,
                })

        return {
            "running": self._scheduler is not None and self._scheduler.running,
            "last_sync": self._last_sync.isoformat() if self._last_sync else None,
            "next_sync": self._next_sync.isoformat() if self._next_sync else None,
            "jobs": jobs,
        }
