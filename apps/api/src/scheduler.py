"""Scheduler for Client Mode

Runs background tasks (Europe/Paris, ~20 gateway calls a day):
- Sync PDL data at startup, every 30 min from 6h to 9h30, then 12h and 18h
- Run scheduled exports after each sync, and every minute when due
- Sync Tempo every hour from 7h to 23h, only while tomorrow's color is unknown
- Sync EcoWatt at 12h15 (friday) and 17h (daily) if J+3 is incomplete

Uses APScheduler for task scheduling.
"""

import asyncio
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

    Syncs PDL data when Enedis publishes (morning) and runs scheduled exports after each sync.
    """

    def __init__(self) -> None:
        self._scheduler: Optional["AsyncIOScheduler"] = None
        self._running = False
        # Une seule sync PDL à la fois : la sync du démarrage peut encore tourner au cron suivant
        self._sync_lock = asyncio.Lock()

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

        # Sync PDL : au démarrage, puis quand Enedis publie J-1 (matin), puis 2 contrôles en journée
        self._scheduler.add_job(
            self._run_sync,
            id="sync_all_startup",
            name="Sync all PDLs (startup)",
            replace_existing=True,
            next_run_time=datetime.now(UTC),
        )
        self._scheduler.add_job(
            self._run_sync,
            trigger=CronTrigger(hour="6-9", minute="*/30"),
            id="sync_all_morning",
            name="Sync all PDLs (6h-9h30 every 30 min)",
            replace_existing=True,
        )
        self._scheduler.add_job(
            self._run_sync,
            trigger=CronTrigger(hour="12,18", minute=0),
            id="sync_all_daytime",
            name="Sync all PDLs (12h, 18h)",
            replace_existing=True,
        )

        # Add export scheduler job - runs every minute to check for due exports
        self._scheduler.add_job(
            self._run_scheduled_exports,
            trigger=IntervalTrigger(minutes=1),
            id="run_scheduled_exports",
            name="Check and run scheduled exports",
            replace_existing=True,
        )

        # Add Tempo sync job - every hour from 7h to 23h, only while tomorrow's color is unknown
        # (RTE publie vers 10h40) + run immédiat au démarrage pour remplir l'historique si absent
        self._scheduler.add_job(
            self._run_tempo_sync,
            trigger=CronTrigger(minute=0, hour="7-23"),
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

        # Zen Flex : J+1 publié par EDF en cours de journée, même rythme que Tempo
        self._scheduler.add_job(
            self._run_zen_flex_sync,
            trigger=CronTrigger(minute="*/15", hour="6-23"),
            id="sync_zen_flex",
            name="Sync Zen Flex calendar from gateway",
            replace_existing=True,
            next_run_time=datetime.now(UTC),  # Run au démarrage
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
        # 3. Fallback at 8h30 and 20h30 if J+3 data is incomplete (and at startup)
        self._scheduler.add_job(
            self._run_ecowatt_sync_if_incomplete,
            trigger=CronTrigger(hour="8,20", minute=30),
            id="sync_ecowatt_fallback",
            name="Sync EcoWatt if incomplete (8h30, 20h30)",
            replace_existing=True,
            next_run_time=datetime.now(UTC),  # Run au démarrage
        )

        # Add Consumption France sync job - 8h, 14h, 20h
        # (au démarrage seulement si la dernière sync a plus de 6 h : redémarrages répétés)
        self._scheduler.add_job(
            self._run_consumption_france_sync,
            trigger=CronTrigger(hour="8,14,20", minute=0),
            id="sync_consumption_france",
            name="Sync Consumption France from gateway (8h, 14h, 20h)",
            replace_existing=True,
        )
        self._scheduler.add_job(
            self._run_consumption_france_sync,
            id="sync_consumption_france_startup",
            name="Sync Consumption France (startup)",
            replace_existing=True,
            next_run_time=datetime.now(UTC),
            kwargs={"min_interval": timedelta(hours=6)},
        )

        # Add Generation Forecast sync job - 9h, 21h (au démarrage si plus de 12 h)
        self._scheduler.add_job(
            self._run_generation_forecast_sync,
            trigger=CronTrigger(hour="9,21", minute=0),
            id="sync_generation_forecast",
            name="Sync Generation Forecast from gateway (9h, 21h)",
            replace_existing=True,
        )
        self._scheduler.add_job(
            self._run_generation_forecast_sync,
            id="sync_generation_forecast_startup",
            name="Sync Generation Forecast (startup)",
            replace_existing=True,
            next_run_time=datetime.now(UTC),
            kwargs={"min_interval": timedelta(hours=12)},
        )

        self._scheduler.start()
        self._running = True

        logger.info(
            "[SCHEDULER] Started (~20 gateway calls a day). PDL: startup, 6h-9h30 every 30 min, 12h, 18h. "
            "Tempo: hourly 7h-23h while tomorrow is unknown. EcoWatt: 17h, Friday 12h15, fallback 8h30/20h30. "
            "France: 8h/14h/20h. Forecast: 9h/21h."
        )

    def stop(self) -> None:
        """Stop the scheduler"""
        if self._scheduler and self._running:
            self._scheduler.shutdown(wait=False)
            self._running = False
            logger.info("[SCHEDULER] Stopped")

    async def _run_sync(self) -> None:
        """Run sync job, then the scheduled exports (fresh data, even after a partial sync)"""
        if self._sync_lock.locked():
            logger.info("[SCHEDULER] Sync already running, skipping this run")
            return
        async with self._sync_lock:
            await self._run_sync_locked()

    async def _run_sync_locked(self) -> None:
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

        await self._run_scheduled_exports(force=True)

    async def _run_scheduled_exports(self, force: bool = False) -> None:
        """Vérifie les exports planifiés et les exécute

        Gère deux planifications indépendantes pour Home Assistant :
        - MQTT Discovery : export_interval_minutes (colonne DB) + next_export_at (colonne DB)
        - Energy Dashboard : energy_interval_minutes (JSON config) + next_energy_export_at (JSON config)

        Pour les autres types (VictoriaMetrics, MQTT), seul export_interval_minutes est utilisé.
        force=True (après une sync) lance tous les exports planifiés sans attendre leur échéance ;
        les exports manuels (sans intervalle) ne sont jamais lancés par le scheduler.
        """
        try:
            from sqlalchemy import select

            from .models.client_mode import ExportConfig, ExportType
            from .models.database import async_session_maker

            now = datetime.now(UTC)

            async with async_session_maker() as db:
                # Récupérer toutes les configs activées
                stmt = select(ExportConfig).where(
                    ExportConfig.is_enabled.is_(True),
                )
                result = await db.execute(stmt)
                configs = result.scalars().all()

                for config in configs:
                    # --- Planification MQTT (colonne DB) ---
                    mqtt_interval = config.export_interval_minutes
                    if mqtt_interval and mqtt_interval > 0:
                        if force or not config.next_export_at or config.next_export_at <= now:
                            logger.info(f"[SCHEDULER] MQTT export due: {config.name}")
                            try:
                                await self._run_export(db, config, run_mqtt=True, run_energy=False)
                                config.next_export_at = now + timedelta(minutes=mqtt_interval)
                                await db.commit()
                            except Exception as e:
                                logger.error(f"[SCHEDULER] MQTT export failed for {config.name}: {e}")
                                config.last_export_status = "failed"
                                config.last_export_error = str(e)[:500]
                                config.next_export_at = now + timedelta(minutes=mqtt_interval)
                                await db.commit()

                    # --- Planification Energy Dashboard (JSON config, HA uniquement) ---
                    if config.export_type == ExportType.HOME_ASSISTANT:
                        cfg = config.config or {}
                        energy_interval = cfg.get("energy_interval_minutes")
                        if energy_interval and energy_interval > 0:
                            next_energy_str = cfg.get("next_energy_export_at")
                            next_energy_at = None
                            if next_energy_str:
                                try:
                                    next_energy_at = datetime.fromisoformat(next_energy_str)
                                except (ValueError, TypeError):
                                    pass

                            if force or not next_energy_at or next_energy_at <= now:
                                logger.info(f"[SCHEDULER] Energy Dashboard export due: {config.name}")
                                try:
                                    await self._run_export(db, config, run_mqtt=False, run_energy=True)
                                    # Stocker next_energy_export_at dans le JSON config
                                    updated_config = dict(config.config)
                                    updated_config["next_energy_export_at"] = (now + timedelta(minutes=energy_interval)).isoformat()
                                    config.config = updated_config
                                    await db.commit()
                                except Exception as e:
                                    logger.error(f"[SCHEDULER] Energy Dashboard export failed for {config.name}: {e}")
                                    updated_config = dict(config.config)
                                    updated_config["next_energy_export_at"] = (now + timedelta(minutes=energy_interval)).isoformat()
                                    config.config = updated_config
                                    await db.commit()

        except Exception as e:
            logger.error(f"[SCHEDULER] Scheduled exports check failed: {e}")

    async def _run_export(
        self,
        db: "AsyncSession",
        config: "ExportConfig",
        run_mqtt: bool = True,
        run_energy: bool = True,
    ) -> None:
        """Exécute un export selon les flags demandés

        Pour Home Assistant, MQTT et Energy Dashboard sont indépendants :
        - run_mqtt=True : exécute MQTT Discovery (si mqtt_enabled dans config)
        - run_energy=True : exécute Energy Dashboard (si energy_enabled dans config)

        Args:
            db: Database session (AsyncSession)
            config: Export configuration (ExportConfig)
            run_mqtt: Exécuter la partie MQTT Discovery
            run_energy: Exécuter la partie Energy Dashboard
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

        logger.info(f"[SCHEDULER] Running export: {config.name} ({config.export_type.value}) [mqtt={run_mqtt}, energy={run_energy}]")

        # Get PDLs to export
        usage_point_ids = config.usage_point_ids
        if not usage_point_ids:
            # Get all PDLs with data
            stmt = select(ConsumptionData.usage_point_id).distinct()
            result = await db.execute(stmt)
            usage_point_ids = [row[0] for row in result.all()]

        total_exported = 0
        errors: list[str] = []

        # Home Assistant : délègue à run_full_export avec les flags
        if config.export_type == ExportType.HOME_ASSISTANT:
            exporter = HomeAssistantExporter(config.config)
            try:
                ha_results = await exporter.run_full_export(
                    db, usage_point_ids,
                    run_mqtt=run_mqtt,
                    run_energy=run_energy,
                )
                total_exported += (
                    ha_results.get("consumption", 0)
                    + ha_results.get("production", 0)
                    + ha_results.get("tempo", 0)
                    + ha_results.get("ecowatt", 0)
                )
                if ha_results.get("errors"):
                    errors.extend(ha_results["errors"])
            except Exception as e:
                logger.error(f"[SCHEDULER] Home Assistant export failed: {e}")
                errors.append(str(e))

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

    async def _run_zen_flex_sync(self) -> None:
        """Synchro Zen Flex si demain est inconnu ou si l'historique local a des trous"""
        try:
            from sqlalchemy import func, select

            from .models.database import async_session_maker
            from .models.zen_flex_day import ZenFlexDay
            from .services.edf_zen_flex import OFFER_START, paris_today
            from .services.sync import SyncService

            async with async_session_maker() as db:
                today = paris_today()
                tomorrow = today + timedelta(days=1)
                known = (await db.execute(
                    select(func.count()).select_from(ZenFlexDay).where(ZenFlexDay.date.between(OFFER_START, today))
                )).scalar() or 0
                tomorrow_known = (await db.execute(
                    select(ZenFlexDay.id).where(ZenFlexDay.date == tomorrow)
                )).scalar_one_or_none()

                if tomorrow_known and known >= (today - OFFER_START).days + 1:
                    logger.debug("[SCHEDULER] Zen Flex à jour, pas de synchro")
                    return

                sync_result = await SyncService(db).sync_zen_flex()
                if sync_result.get("errors"):
                    logger.warning(f"[SCHEDULER] Zen Flex sync completed with errors: {sync_result['errors']}")
                else:
                    logger.info(
                        f"[SCHEDULER] Zen Flex sync completed: "
                        f"{sync_result.get('created', 0)} created, {sync_result.get('updated', 0)} updated"
                    )

        except Exception as e:
            logger.error(f"[SCHEDULER] Zen Flex sync failed: {e}", exc_info=True)

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
                # EcoWatt.periode est un DateTime sans fuseau : bornes UTC naïves (asyncpg refuse le mélange)
                today = datetime.now(UTC).replace(tzinfo=None, hour=0, minute=0, second=0, microsecond=0)
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


    async def _run_consumption_france_sync(self, min_interval: timedelta | None = None) -> None:
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
                sync_result = await sync_service.sync_consumption_france(min_interval=min_interval)

                if sync_result.get("errors"):
                    logger.warning(f"[SCHEDULER] Consumption France sync completed with errors: {sync_result['errors']}")
                else:
                    logger.info(
                        f"[SCHEDULER] Consumption France sync completed: "
                        f"{sync_result.get('created', 0)} created, {sync_result.get('updated', 0)} updated"
                    )

        except Exception as e:
            logger.error(f"[SCHEDULER] Consumption France sync failed: {e}")

    async def _run_generation_forecast_sync(self, min_interval: timedelta | None = None) -> None:
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
                sync_result = await sync_service.sync_generation_forecast(min_interval=min_interval)

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
