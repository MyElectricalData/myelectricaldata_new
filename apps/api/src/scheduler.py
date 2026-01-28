"""Scheduler for Client Mode

Runs background tasks:
- Sync data from MyElectricalData API every 30 minutes
- Run exports after each sync
- Sync Tempo every 15 min (6h-23h) if tomorrow's color is unknown
- Sync EcoWatt at 12h15 (friday) and 17h (daily) if J+3 is incomplete

Uses APScheduler for task scheduling.
"""

import logging
from datetime import datetime, UTC, timedelta
from typing import Optional, TYPE_CHECKING

from .config import settings

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession
    from .models.client_mode import ExportConfig

logger = logging.getLogger(__name__)

# Try to import apscheduler
try:
    from apscheduler.schedulers.asyncio import AsyncIOScheduler
    from apscheduler.triggers.interval import IntervalTrigger
    from apscheduler.triggers.cron import CronTrigger

    APSCHEDULER_AVAILABLE = True
except ImportError:
    APSCHEDULER_AVAILABLE = False
    logger.warning("[SCHEDULER] APScheduler not installed. Automatic sync disabled.")


class SyncScheduler:
    """Scheduler for automatic data synchronization

    Runs sync every 30 minutes to fetch new data from MyElectricalData API.
    """

    def __init__(self) -> None:
        self._scheduler: Optional["AsyncIOScheduler"] = None
        self._running = False

    def start(self) -> None:
        """Start the scheduler

        Only starts if:
        - CLIENT_MODE is enabled
        - APScheduler is available
        """
        if not settings.CLIENT_MODE:
            logger.info("[SCHEDULER] Not starting scheduler (CLIENT_MODE is False)")
            return

        if not APSCHEDULER_AVAILABLE:
            logger.error("[SCHEDULER] APScheduler not installed. Install with: pip install apscheduler")
            return

        if self._running:
            logger.warning("[SCHEDULER] Scheduler already running")
            return

        self._scheduler = AsyncIOScheduler()

        # Add sync job - runs every 30 minutes
        self._scheduler.add_job(
            self._run_sync,
            trigger=IntervalTrigger(minutes=30),
            id="sync_all",
            name="Sync all PDLs from MyElectricalData API",
            replace_existing=True,
            next_run_time=datetime.now(UTC),  # Run immediately on start
        )

        # Add export scheduler job - runs every minute to check for due exports
        self._scheduler.add_job(
            self._run_scheduled_exports,
            trigger=IntervalTrigger(minutes=1),
            id="run_scheduled_exports",
            name="Check and run scheduled exports",
            replace_existing=True,
        )

        # Add Tempo sync job - runs every 15 minutes from 6h to 23h
        # + run immédiat au démarrage pour remplir l'historique si absent
        self._scheduler.add_job(
            self._run_tempo_sync,
            trigger=CronTrigger(minute="*/15", hour="6-23"),
            id="sync_tempo",
            name="Sync Tempo calendar from gateway",
            replace_existing=True,
        )
        # Sync initiale Tempo au démarrage (indépendante du cron)
        self._scheduler.add_job(
            self._run_tempo_sync,
            id="sync_tempo_startup",
            name="Sync Tempo calendar (startup)",
            replace_existing=True,
            next_run_time=datetime.now(UTC),
        )

        # Add EcoWatt sync jobs
        # 1. Daily at 17h00 - RTE updates J+3 around 17h
        self._scheduler.add_job(
            self._run_ecowatt_sync,
            trigger=CronTrigger(hour=17, minute=0),
            id="sync_ecowatt_daily",
            name="Sync EcoWatt daily at 17h",
            replace_existing=True,
        )
        # 2. Friday at 12h15 - RTE updates earlier on Fridays
        self._scheduler.add_job(
            self._run_ecowatt_sync,
            trigger=CronTrigger(day_of_week="fri", hour=12, minute=15),
            id="sync_ecowatt_friday",
            name="Sync EcoWatt Friday at 12h15",
            replace_existing=True,
        )
        # 3. Check every hour if J+3 data is complete (fallback)
        self._scheduler.add_job(
            self._run_ecowatt_sync_if_incomplete,
            trigger=IntervalTrigger(hours=1),
            id="sync_ecowatt_fallback",
            name="Sync EcoWatt if incomplete",
            replace_existing=True,
            next_run_time=datetime.now(UTC),  # Run au démarrage
        )

        # Add Consumption France sync job - runs every 15 minutes
        # RTE data is updated every 15 minutes for realised consumption
        self._scheduler.add_job(
            self._run_consumption_france_sync,
            trigger=IntervalTrigger(minutes=15),
            id="sync_consumption_france",
            name="Sync Consumption France from gateway",
            replace_existing=True,
            next_run_time=datetime.now(UTC),  # Run au démarrage
        )

        # Add Generation Forecast sync job - runs every 30 minutes
        # Renewable forecasts are updated less frequently
        self._scheduler.add_job(
            self._run_generation_forecast_sync,
            trigger=IntervalTrigger(minutes=30),
            id="sync_generation_forecast",
            name="Sync Generation Forecast from gateway",
            replace_existing=True,
            next_run_time=datetime.now(UTC),  # Run au démarrage
        )

        self._scheduler.start()
        self._running = True

        logger.info("[SCHEDULER] Started. Data sync every 30min, Tempo every 15min (6h-23h), EcoWatt at 17h/12h15(fri), France data every 15-30min.")

    def stop(self) -> None:
        """Stop the scheduler"""
        if self._scheduler and self._running:
            self._scheduler.shutdown(wait=False)
            self._running = False
            logger.info("[SCHEDULER] Stopped")

    async def _run_sync(self) -> None:
        """Run sync job"""
        logger.info("[SCHEDULER] Starting scheduled sync...")

        try:
            # Import here to avoid circular imports
            from .models.database import async_session_maker
            from .services.sync import SyncService

            async with async_session_maker() as db:
                sync_service = SyncService(db)
                result = await sync_service.sync_all()

                if result.get("success"):
                    logger.info("[SCHEDULER] Sync completed successfully")
                else:
                    errors = result.get("errors", [])
                    logger.warning(f"[SCHEDULER] Sync completed with {len(errors)} errors")

        except Exception as e:
            logger.error(f"[SCHEDULER] Sync failed: {e}")

    async def _run_scheduled_exports(self) -> None:
        """Check for exports that are due and run them

        Each export config has its own interval (export_interval_minutes).
        This job runs every minute to check which exports are due.
        """
        try:
            from sqlalchemy import select

            from .models.client_mode import ExportConfig
            from .models.database import async_session_maker

            now = datetime.now(UTC)

            async with async_session_maker() as db:
                # Get enabled exports that have a schedule and are due
                stmt = select(ExportConfig).where(
                    ExportConfig.is_enabled.is_(True),
                    ExportConfig.export_interval_minutes.isnot(None),
                    ExportConfig.export_interval_minutes > 0,
                )
                result = await db.execute(stmt)
                configs = result.scalars().all()

                for config in configs:
                    # Check if export is due
                    if config.next_export_at and config.next_export_at > now:
                        continue  # Not yet due

                    # Export is due (or first run)
                    logger.info(f"[SCHEDULER] Running scheduled export: {config.name}")

                    # export_interval_minutes is guaranteed non-None by the query filter
                    interval = config.export_interval_minutes or 60  # Fallback should never be used

                    try:
                        # Run export
                        await self._run_export(db, config)

                        # Schedule next run
                        config.next_export_at = now + timedelta(minutes=interval)
                        await db.commit()

                    except Exception as e:
                        logger.error(f"[SCHEDULER] Export failed for {config.name}: {e}")
                        config.last_export_status = "failed"
                        config.last_export_error = str(e)[:500]
                        # Still schedule next run to avoid being stuck
                        config.next_export_at = now + timedelta(minutes=interval)
                        await db.commit()

        except Exception as e:
            logger.error(f"[SCHEDULER] Scheduled exports check failed: {e}")

    async def _run_export(self, db: "AsyncSession", config: "ExportConfig") -> None:
        """Run a single export configuration

        For Home Assistant:
        - MQTT Discovery: Exports sensors (Tempo, EcoWatt, Linky stats) via run_full_export()
        - WebSocket API: Imports statistics for Energy Dashboard via import_statistics()

        Args:
            db: Database session (AsyncSession)
            config: Export configuration (ExportConfig)
        """
        from sqlalchemy import select

        from .models.client_mode import (
            ConsumptionData,
            ProductionData,
            DataGranularity,
            ExportType,
        )
        from .services.exporters import (
            HomeAssistantExporter,
            VictoriaMetricsExporter,
        )

        logger.info(f"[SCHEDULER] Running export: {config.name} ({config.export_type.value})")

        # Get PDLs to export
        usage_point_ids = config.usage_point_ids
        if not usage_point_ids:
            # Get all PDLs with data
            stmt = select(ConsumptionData.usage_point_id).distinct()
            result = await db.execute(stmt)
            usage_point_ids = [row[0] for row in result.all()]

        total_exported = 0
        errors: list[str] = []

        # Home Assistant specific handling
        if config.export_type == ExportType.HOME_ASSISTANT:
            exporter = HomeAssistantExporter(config.config)

            # 1. MQTT Discovery: Export sensors (Tempo, EcoWatt, Linky stats)
            has_mqtt = bool(config.config.get("mqtt_broker"))
            if has_mqtt:
                try:
                    logger.info(f"[SCHEDULER] Running MQTT Discovery export for {config.name}")
                    mqtt_result = await exporter.run_full_export(db, usage_point_ids)
                    mqtt_count = mqtt_result.get("consumption", 0) + mqtt_result.get("production", 0) + mqtt_result.get("tempo", 0) + mqtt_result.get("ecowatt", 0)
                    total_exported += mqtt_count
                    if mqtt_result.get("errors"):
                        errors.extend(mqtt_result["errors"])
                    logger.info(f"[SCHEDULER] MQTT Discovery: {mqtt_count} sensors exported")
                except Exception as e:
                    logger.error(f"[SCHEDULER] MQTT Discovery export failed: {e}")
                    errors.append(f"MQTT Discovery: {str(e)}")

            # 2. WebSocket API: Import statistics for Energy Dashboard
            # Utilise le mode incrémental pour importer uniquement les nouvelles données
            has_websocket = bool(config.config.get("ha_url") and config.config.get("ha_token"))
            if has_websocket:
                try:
                    logger.info(f"[SCHEDULER] Running HA Statistics incremental import for {config.name}")
                    # Mode incrémental: importe uniquement les données depuis le dernier import
                    ws_result = await exporter.import_statistics(
                        db,
                        usage_point_ids,
                        clear_first=False,  # Ne pas supprimer en mode incrémental
                        incremental=True,   # Mode différentiel
                    )
                    ws_count = ws_result.get("consumption", 0) + ws_result.get("production", 0)
                    total_exported += ws_count
                    if ws_result.get("errors"):
                        errors.extend(ws_result["errors"])
                    logger.info(f"[SCHEDULER] HA Statistics: {ws_count} records imported (incremental)")
                except Exception as e:
                    logger.error(f"[SCHEDULER] HA Statistics import failed: {e}")
                    errors.append(f"HA Statistics: {str(e)}")

        # VictoriaMetrics handling
        elif config.export_type == ExportType.VICTORIAMETRICS:
            vm_exporter = VictoriaMetricsExporter(config.config)

            for pdl in usage_point_ids:
                # Export consumption daily
                if config.export_consumption:
                    cons_daily_stmt = select(ConsumptionData).where(
                        ConsumptionData.usage_point_id == pdl,
                        ConsumptionData.granularity == DataGranularity.DAILY,
                    )
                    cons_daily_result = await db.execute(cons_daily_stmt)
                    data = [
                        {"date": r.date.isoformat(), "value": r.value}
                        for r in cons_daily_result.scalars().all()
                    ]
                    if data:
                        count = await vm_exporter.export_consumption(pdl, data, "daily")
                        total_exported += count

                # Export consumption detailed (if enabled)
                if config.export_consumption and config.export_detailed:
                    cons_detail_stmt = select(ConsumptionData).where(
                        ConsumptionData.usage_point_id == pdl,
                        ConsumptionData.granularity == DataGranularity.DETAILED,
                    )
                    cons_detail_result = await db.execute(cons_detail_stmt)
                    data = [
                        {
                            "date": f"{r.date.isoformat()}T{r.interval_start}:00" if r.interval_start else r.date.isoformat(),
                            "value": r.value,
                        }
                        for r in cons_detail_result.scalars().all()
                    ]
                    if data:
                        count = await vm_exporter.export_consumption(pdl, data, "detailed")
                        total_exported += count

                # Export production daily
                if config.export_production:
                    prod_daily_stmt = select(ProductionData).where(
                        ProductionData.usage_point_id == pdl,
                        ProductionData.granularity == DataGranularity.DAILY,
                    )
                    prod_daily_result = await db.execute(prod_daily_stmt)
                    data = [
                        {"date": r.date.isoformat(), "value": r.value}
                        for r in prod_daily_result.scalars().all()
                    ]
                    if data:
                        count = await vm_exporter.export_production(pdl, data, "daily")
                        total_exported += count

                # Export production detailed (if enabled)
                if config.export_production and config.export_detailed:
                    prod_detail_stmt = select(ProductionData).where(
                        ProductionData.usage_point_id == pdl,
                        ProductionData.granularity == DataGranularity.DETAILED,
                    )
                    prod_detail_result = await db.execute(prod_detail_stmt)
                    data = [
                        {
                            "date": f"{r.date.isoformat()}T{r.interval_start}:00" if r.interval_start else r.date.isoformat(),
                            "value": r.value,
                        }
                        for r in prod_detail_result.scalars().all()
                    ]
                    if data:
                        count = await vm_exporter.export_production(pdl, data, "detailed")
                        total_exported += count
        else:
            raise ValueError(f"Unknown export type: {config.export_type}")

        # Update config status
        config.last_export_at = datetime.now(UTC)
        config.last_export_status = "success" if not errors else "partial"
        config.last_export_error = "; ".join(errors[:3]) if errors else None  # Limit to first 3 errors
        config.export_count += 1
        await db.commit()

        logger.info(f"[SCHEDULER] Export {config.name} completed: {total_exported} records")

    async def _run_tempo_sync(self) -> None:
        """Run Tempo sync job

        Sync si :
        - La table est vide (première exécution → sync historique complet)
        - La couleur de demain n'est pas encore connue
        """
        logger.debug("[SCHEDULER] Checking if Tempo sync is needed...")

        try:
            from sqlalchemy import select, func

            from .models.database import async_session_maker
            from .models.tempo_day import TempoDay
            from .services.sync import SyncService

            async with async_session_maker() as db:
                # Vérifier si la table est vide (sync initiale nécessaire)
                count_result = await db.execute(select(func.count()).select_from(TempoDay))
                total_days = count_result.scalar() or 0

                if total_days == 0:
                    logger.info("[SCHEDULER] Table Tempo vide, sync initiale depuis la passerelle...")
                    sync_service = SyncService(db)
                    sync_result = await sync_service.sync_tempo()
                    created = sync_result.get('created', 0)
                    updated = sync_result.get('updated', 0)
                    if sync_result.get("errors"):
                        logger.warning(f"[SCHEDULER] Tempo sync initiale avec erreurs: {sync_result['errors']}")
                    else:
                        logger.info(f"[SCHEDULER] Tempo sync initiale: {created} créés, {updated} mis à jour")
                    return

                # Check if tomorrow's color is already known
                tomorrow = (datetime.now(UTC) + timedelta(days=1)).strftime("%Y-%m-%d")

                result = await db.execute(
                    select(TempoDay).where(TempoDay.id == tomorrow)
                )
                tomorrow_day = result.scalar_one_or_none()

                if tomorrow_day and tomorrow_day.color:
                    logger.debug(f"[SCHEDULER] Tomorrow's Tempo color already known: {tomorrow_day.color.value}")
                    return

                # Tomorrow's color is not known, sync from gateway
                logger.info("[SCHEDULER] Tomorrow's Tempo color unknown, syncing from gateway...")
                sync_service = SyncService(db)
                sync_result = await sync_service.sync_tempo()

                if sync_result.get("errors"):
                    logger.warning(f"[SCHEDULER] Tempo sync completed with errors: {sync_result['errors']}")
                else:
                    logger.info(
                        f"[SCHEDULER] Tempo sync completed: "
                        f"{sync_result.get('created', 0)} created, {sync_result.get('updated', 0)} updated"
                    )

        except Exception as e:
            logger.error(f"[SCHEDULER] Tempo sync failed: {e}")

    async def _run_ecowatt_sync(self) -> None:
        """Run EcoWatt sync job (unconditional)

        Called at specific times when RTE publishes new data:
        - Daily at 17h00
        - Friday at 12h15
        """
        logger.info("[SCHEDULER] Running scheduled EcoWatt sync...")

        try:
            from .models.database import async_session_maker
            from .services.sync import SyncService

            async with async_session_maker() as db:
                sync_service = SyncService(db)
                sync_result = await sync_service.sync_ecowatt()

                if sync_result.get("errors"):
                    logger.warning(f"[SCHEDULER] EcoWatt sync completed with errors: {sync_result['errors']}")
                else:
                    logger.info(
                        f"[SCHEDULER] EcoWatt sync completed: "
                        f"{sync_result.get('created', 0)} created, {sync_result.get('updated', 0)} updated"
                    )

        except Exception as e:
            logger.error(f"[SCHEDULER] EcoWatt sync failed: {e}")

    async def _run_ecowatt_sync_if_incomplete(self) -> None:
        """Run EcoWatt sync only if J+3 data is incomplete

        This is a fallback check that runs every hour to ensure we have
        complete data up to J+3 (current day + 3 future days).

        EcoWatt signals for J+3 are initialized as green by default,
        but real values are published:
        - At ~17h every day
        - At ~12h15 on Fridays
        """
        logger.debug("[SCHEDULER] Checking if EcoWatt J+3 data is complete...")

        try:
            from sqlalchemy import select

            from .models.database import async_session_maker
            from .models.ecowatt import EcoWatt
            from .services.sync import SyncService

            async with async_session_maker() as db:
                # Check if we have data for today through J+3
                today = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
                dates_needed = [today + timedelta(days=i) for i in range(4)]  # J, J+1, J+2, J+3

                # Query existing data
                existing_result = await db.execute(
                    select(EcoWatt.periode).where(
                        EcoWatt.periode >= today,
                        EcoWatt.periode < today + timedelta(days=4)
                    )
                )
                existing_dates = {row[0].replace(tzinfo=None).date() for row in existing_result.all()}
                needed_dates = {d.date() for d in dates_needed}

                missing_dates = needed_dates - existing_dates

                if not missing_dates:
                    logger.debug("[SCHEDULER] EcoWatt data complete for J to J+3")
                    return

                # Missing data, sync from gateway
                logger.info(f"[SCHEDULER] EcoWatt missing data for: {sorted(missing_dates)}, syncing...")
                sync_service = SyncService(db)
                sync_result = await sync_service.sync_ecowatt()

                if sync_result.get("errors"):
                    logger.warning(f"[SCHEDULER] EcoWatt sync completed with errors: {sync_result['errors']}")
                else:
                    logger.info(
                        f"[SCHEDULER] EcoWatt sync completed: "
                        f"{sync_result.get('created', 0)} created, {sync_result.get('updated', 0)} updated"
                    )

        except Exception as e:
            logger.error(f"[SCHEDULER] EcoWatt fallback sync failed: {e}")


    async def _run_consumption_france_sync(self) -> None:
        """Run Consumption France sync job

        Syncs national consumption data from the gateway.
        Data is updated every 15 minutes by RTE.
        """
        logger.debug("[SCHEDULER] Running Consumption France sync...")

        try:
            from .models.database import async_session_maker
            from .services.sync import SyncService

            async with async_session_maker() as db:
                sync_service = SyncService(db)
                sync_result = await sync_service.sync_consumption_france()

                if sync_result.get("errors"):
                    logger.warning(f"[SCHEDULER] Consumption France sync completed with errors: {sync_result['errors']}")
                else:
                    logger.info(
                        f"[SCHEDULER] Consumption France sync completed: "
                        f"{sync_result.get('created', 0)} created, {sync_result.get('updated', 0)} updated"
                    )

        except Exception as e:
            logger.error(f"[SCHEDULER] Consumption France sync failed: {e}")

    async def _run_generation_forecast_sync(self) -> None:
        """Run Generation Forecast sync job

        Syncs renewable generation forecasts from the gateway.
        Data is updated less frequently than consumption data.
        """
        logger.debug("[SCHEDULER] Running Generation Forecast sync...")

        try:
            from .models.database import async_session_maker
            from .services.sync import SyncService

            async with async_session_maker() as db:
                sync_service = SyncService(db)
                sync_result = await sync_service.sync_generation_forecast()

                if sync_result.get("errors"):
                    logger.warning(f"[SCHEDULER] Generation Forecast sync completed with errors: {sync_result['errors']}")
                else:
                    logger.info(
                        f"[SCHEDULER] Generation Forecast sync completed: "
                        f"{sync_result.get('created', 0)} created, {sync_result.get('updated', 0)} updated"
                    )

        except Exception as e:
            logger.error(f"[SCHEDULER] Generation Forecast sync failed: {e}")


# Global scheduler instance
scheduler = SyncScheduler()
