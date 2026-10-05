"""Background scheduler for periodic tasks"""
import asyncio
import logging
from datetime import datetime, UTC, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.database import async_session_maker
from ..models.refresh_tracker import RefreshTracker
from .edf_zen_flex import edf_zen_flex_service
from .rte import rte_service

logger = logging.getLogger(__name__)


async def should_refresh(db: AsyncSession, cache_type: str, min_interval_minutes: int) -> bool:
    """Check if cache should be refreshed based on last refresh time"""
    result = await db.execute(
        select(RefreshTracker).where(RefreshTracker.cache_type == cache_type)
    )
    tracker = result.scalar_one_or_none()

    if not tracker:
        return True  # Never refreshed

    time_since_refresh = datetime.now(UTC) - tracker.last_refresh
    return bool(time_since_refresh > timedelta(minutes=min_interval_minutes))


async def update_refresh_time(db: AsyncSession, cache_type: str) -> None:
    """Update the last refresh time for a cache type"""
    result = await db.execute(
        select(RefreshTracker).where(RefreshTracker.cache_type == cache_type)
    )
    tracker = result.scalar_one_or_none()

    if tracker:
        tracker.last_refresh = datetime.now(UTC)  # type: ignore[assignment]
    else:
        new_tracker = RefreshTracker(cache_type=cache_type, last_refresh=datetime.now(UTC))
        db.add(new_tracker)

    await db.commit()


async def refresh_tempo_cache_task() -> None:
    """Refresh TEMPO cache from RTE API (runs every 10 minutes)"""
    while True:
        try:
            async with async_session_maker() as db:
                # Check if we should refresh (minimum 10 minutes between refreshes)
                if await should_refresh(db, 'tempo', 10):
                    logger.info(f"[SCHEDULER] {datetime.now(UTC).isoformat()} - Starting TEMPO cache refresh...")

                    # RTE API limitation: only today + tomorrow (after 6am)
                    updated_count = await rte_service.update_tempo_cache(db)
                    logger.info(f"[SCHEDULER] Successfully refreshed {updated_count} TEMPO days")

                    # Update last refresh time
                    await update_refresh_time(db, 'tempo')
                else:
                    logger.warning("[SCHEDULER] Skipping TEMPO refresh - last refresh too recent")

        except Exception as e:
            logger.error(f"[SCHEDULER ERROR] Failed to refresh TEMPO cache: {e}")
            import traceback
            traceback.print_exc()

        # Wait 10 minutes before next check
        await asyncio.sleep(600)


async def refresh_ecowatt_cache_task() -> None:
    """Refresh EcoWatt cache from RTE API (runs every hour)"""
    while True:
        try:
            async with async_session_maker() as db:
                # Check if we should refresh (minimum 60 minutes between refreshes)
                if await should_refresh(db, 'ecowatt', 60):
                    logger.info(f"[SCHEDULER] {datetime.now(UTC).isoformat()} - Starting EcoWatt cache refresh...")

                    updated_count = await rte_service.update_ecowatt_cache(db)
                    logger.info(f"[SCHEDULER] Successfully refreshed {updated_count} EcoWatt signals")

                    # Update last refresh time
                    await update_refresh_time(db, 'ecowatt')
                else:
                    logger.debug("[SCHEDULER] Skipping EcoWatt refresh - last refresh too recent")

        except Exception as e:
            logger.error(f"[SCHEDULER ERROR] Failed to refresh EcoWatt cache: {e}")
            import traceback
            traceback.print_exc()

        # Wait 1 hour before next check
        await asyncio.sleep(3600)


async def refresh_tempo_forecast_cache_task() -> None:
    """Refresh TEMPO forecast cache from RTE API (runs every 4 hours)

    Les prévisions Tempo utilisent les API RTE Consumption et Generation Forecast.
    On rafraîchit le cache toutes les 4 heures (RTE met à jour les prévisions vers 11h et 19h30).
    """
    import json
    from datetime import date

    from sqlalchemy import func

    from ..models import TempoDay
    from .cache import cache_service
    from .tempo_forecast import tempo_forecast_service

    while True:
        try:
            async with async_session_maker() as db:
                # Check if we should refresh (minimum 4 hours between refreshes)
                if await should_refresh(db, 'tempo_forecast', 240):
                    logger.info(f"[SCHEDULER] {datetime.now(UTC).isoformat()} - Starting TEMPO forecast refresh...")

                    # Récupérer les statistiques de la saison
                    current_date = date.today()
                    if current_date.month >= 9:
                        season_start = datetime(current_date.year, 9, 1, tzinfo=UTC)
                    else:
                        season_start = datetime(current_date.year - 1, 9, 1, tzinfo=UTC)

                    # Compter les jours Tempo de la saison
                    result = await db.execute(
                        select(TempoDay.color, func.count(TempoDay.id))
                        .where(TempoDay.date >= season_start.date())
                        .group_by(TempoDay.color)
                    )
                    color_counts = {row[0]: row[1] for row in result.fetchall()}
                    blue_used = color_counts.get("BLUE", 0)
                    white_used = color_counts.get("WHITE", 0)
                    red_used = color_counts.get("RED", 0)

                    # Générer les prévisions pour 8 jours
                    forecasts = await tempo_forecast_service.get_forecasts(
                        days_ahead=8,
                        blue_used=blue_used,
                        white_used=white_used,
                        red_used=red_used,
                        reference_date=current_date,
                    )

                    # Construire les données de cache
                    response_data = {
                        "season": f"{season_start.year}/{season_start.year + 1}",
                        "season_stats": {
                            "blue_used": blue_used,
                            "blue_remaining": 300 - blue_used,
                            "white_used": white_used,
                            "white_remaining": 43 - white_used,
                            "red_used": red_used,
                            "red_remaining": 22 - red_used,
                        },
                        "forecasts": [
                            {
                                "date": f.date,
                                "day_in_season": f.day_in_season,
                                "probability_blue": f.probability_blue,
                                "probability_white": f.probability_white,
                                "probability_red": f.probability_red,
                                "most_likely": f.most_likely,
                                "confidence": f.confidence,
                                "threshold_white_red": f.threshold_white_red,
                                "threshold_red": f.threshold_red,
                                "normalized_consumption": f.normalized_consumption,
                                "forecast_type": f.forecast_type,
                                "factors": f.factors,
                            }
                            for f in forecasts
                        ],
                        "algorithm_info": {
                            "description": "Algorithme basé sur les seuils RTE officiels",
                            "params_blanc_rouge": {"A": 4.0, "B": 0.015, "C": 0.026},
                            "params_rouge": {"A": 3.15, "B": 0.01, "C": 0.031},
                            "formula_blanc_rouge": "Seuil = A - B × JourTempo - C × StockRestant(Blanc+Rouge)",
                            "formula_rouge": "Seuil = A' - B' × JourTempo - C' × StockRestant(Rouge)",
                        },
                        "cached_at": datetime.now(UTC).isoformat(),
                        "cache_ttl_hours": 4,
                    }

                    # Sauvegarder dans le cache (clé pour 8 jours)
                    cache_key = f"tempo:forecast:{current_date.isoformat()}:8"
                    await cache_service.set_raw(cache_key, json.dumps(response_data), ttl=4 * 3600)

                    logger.info(f"[SCHEDULER] Successfully refreshed TEMPO forecast cache ({len(forecasts)} days)")

                    # Update last refresh time
                    await update_refresh_time(db, 'tempo_forecast')
                else:
                    logger.debug("[SCHEDULER] Skipping TEMPO forecast refresh - last refresh too recent")

        except Exception as e:
            logger.error(f"[SCHEDULER ERROR] Failed to refresh TEMPO forecast cache: {e}")
            import traceback
            traceback.print_exc()

        # Wait 4 hours before next check
        await asyncio.sleep(4 * 3600)


async def refresh_consumption_france_cache_task() -> None:
    """Refresh Consumption France cache from RTE API (runs every 15 minutes)

    Les données de consommation nationale sont mises à jour toutes les 15 minutes.
    """
    while True:
        try:
            async with async_session_maker() as db:
                # Check if we should refresh (minimum 15 minutes between refreshes)
                if await should_refresh(db, 'consumption_france', 15):
                    logger.info(f"[SCHEDULER] {datetime.now(UTC).isoformat()} - Starting Consumption France cache refresh...")

                    updated_count = await rte_service.update_consumption_france_cache(db)
                    logger.info(f"[SCHEDULER] Successfully refreshed {updated_count} Consumption France records")

                    # Update last refresh time
                    await update_refresh_time(db, 'consumption_france')
                else:
                    logger.debug("[SCHEDULER] Skipping Consumption France refresh - last refresh too recent")

        except Exception as e:
            logger.error(f"[SCHEDULER ERROR] Failed to refresh Consumption France cache: {e}")
            import traceback
            traceback.print_exc()

        # Wait 15 minutes before next check
        await asyncio.sleep(900)


async def refresh_generation_forecast_cache_task() -> None:
    """Refresh Generation Forecast cache from RTE API (runs every 30 minutes)

    Les prévisions de production renouvelable sont mises à jour régulièrement.
    """
    while True:
        try:
            async with async_session_maker() as db:
                # Check if we should refresh (minimum 30 minutes between refreshes)
                if await should_refresh(db, 'generation_forecast', 30):
                    logger.info(f"[SCHEDULER] {datetime.now(UTC).isoformat()} - Starting Generation Forecast cache refresh...")

                    updated_count = await rte_service.update_generation_forecast_cache(db)
                    logger.info(f"[SCHEDULER] Successfully refreshed {updated_count} Generation Forecast records")

                    # Update last refresh time
                    await update_refresh_time(db, 'generation_forecast')
                else:
                    logger.debug("[SCHEDULER] Skipping Generation Forecast refresh - last refresh too recent")

        except Exception as e:
            logger.error(f"[SCHEDULER ERROR] Failed to refresh Generation Forecast cache: {e}")
            import traceback
            traceback.print_exc()

        # Wait 30 minutes before next check
        await asyncio.sleep(1800)


async def refresh_zen_flex_cache_task() -> None:
    """Rafraîchit le calendrier EDF Zen Flex (toutes les 10 minutes, rattrapage de l'historique par lots)"""
    while True:
        try:
            async with async_session_maker() as db:
                if await should_refresh(db, 'zen_flex', 10):
                    result = await edf_zen_flex_service.update_zen_flex_cache(db)
                    logger.info(
                        f"[SCHEDULER] Zen Flex : {result['updated']} jours mis à jour, {result['backfilled']} rattrapés"
                    )
                    await update_refresh_time(db, 'zen_flex')
        except Exception as e:
            logger.error(f"[SCHEDULER ERROR] Failed to refresh Zen Flex cache: {e}")

        await asyncio.sleep(600)


def start_background_tasks() -> None:
    """Start all background tasks"""
    asyncio.create_task(refresh_tempo_cache_task())
    asyncio.create_task(refresh_ecowatt_cache_task())
    asyncio.create_task(refresh_tempo_forecast_cache_task())
    asyncio.create_task(refresh_consumption_france_cache_task())
    asyncio.create_task(refresh_generation_forecast_cache_task())
    asyncio.create_task(refresh_zen_flex_cache_task())
    logger.info("[SCHEDULER] Background tasks started (Tempo, EcoWatt, Tempo Forecast, Consumption France, Generation Forecast, Zen Flex)")
