"""Sync Router for Client Mode

Endpoints to trigger and monitor data synchronization.
Only available when CLIENT_MODE is enabled.
"""

import logging
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.database import get_db, async_session_maker
from ..services.sync import SyncService

from ..services.client_auth import get_or_create_local_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sync", tags=["sync"])


@router.post("/pdl-list")
async def sync_pdl_list(
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Sync PDL list from remote MyElectricalData gateway

    This endpoint fetches the list of PDLs from the remote gateway
    and creates/updates them in the local database.

    Returns:
        Dict with list of synced PDLs
    """
    logger.info("[API] PDL list sync triggered")

    # Get local user
    local_user = await get_or_create_local_user(db)

    # Sync PDL list
    sync_service = SyncService(db)
    synced_pdls = await sync_service.sync_pdl_list(local_user.id)

    return {
        "success": True,
        "data": synced_pdls,
        "message": f"Synced {len(synced_pdls)} PDLs from remote gateway",
    }


@router.post("/trigger")
async def trigger_sync(
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Trigger a full sync of all PDLs

    This endpoint starts a background sync job that fetches data from
    MyElectricalData API and stores it in the local PostgreSQL database.

    Returns:
        Dict with sync job status
    """
    logger.info("[API] Sync triggered manually")

    async def run_sync() -> None:
        # Create a NEW database session for background task
        # The request's session is closed when the HTTP response is sent
        async with async_session_maker() as background_db:
            sync_service = SyncService(background_db)
            await sync_service.sync_all()

    background_tasks.add_task(run_sync)

    return {
        "status": "started",
        "message": "Sync job started in background. Check /sync/status for progress.",
    }


@router.post("/trigger/{usage_point_id}")
async def trigger_sync_pdl(
    usage_point_id: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Trigger sync for a specific PDL

    Args:
        usage_point_id: 14-digit PDL number

    Returns:
        Dict with sync job status
    """
    if len(usage_point_id) != 14 or not usage_point_id.isdigit():
        raise HTTPException(
            status_code=400,
            detail="Invalid usage_point_id. Must be 14 digits.",
        )

    logger.info(f"[API] Sync triggered for PDL {usage_point_id}")

    async def run_sync() -> None:
        # Create a NEW database session for background task
        # The request's session is closed when the HTTP response is sent
        async with async_session_maker() as background_db:
            sync_service = SyncService(background_db)
            await sync_service.sync_pdl(usage_point_id)

    background_tasks.add_task(run_sync)

    return {
        "status": "started",
        "usage_point_id": usage_point_id,
        "message": f"Sync job started for PDL {usage_point_id}. Check /sync/status for progress.",
    }


@router.get("/status")
async def get_sync_status(
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Get sync status for all PDLs

    Returns:
        Dict with sync status for each PDL and data type
    """
    sync_service = SyncService(db)
    statuses = await sync_service.get_sync_status_all()

    return {
        "pdls": statuses,
        "count": len(statuses),
    }


@router.get("/status/{usage_point_id}")
async def get_sync_status_pdl(
    usage_point_id: str,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Get sync status for a specific PDL

    Args:
        usage_point_id: 14-digit PDL number

    Returns:
        Dict with sync status for the PDL
    """
    sync_service = SyncService(db)
    statuses = await sync_service.get_sync_status_all()

    for status in statuses:
        if status["usage_point_id"] == usage_point_id:
            return status

    raise HTTPException(
        status_code=404,
        detail=f"No sync status found for PDL {usage_point_id}",
    )


# =========================================================================
# Energy Providers & Offers Sync
# =========================================================================


@router.post("/energy-offers")
async def sync_energy_offers(
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Sync energy providers and offers from remote MyElectricalData gateway

    This endpoint starts a background sync job that fetches providers and offers
    from the central MyElectricalData server and stores them locally.

    Returns:
        Dict with sync job status
    """
    logger.info("[API] Energy offers sync triggered")

    async def run_sync() -> None:
        async with async_session_maker() as background_db:
            sync_service = SyncService(background_db)
            await sync_service.sync_all_energy_data()

    background_tasks.add_task(run_sync)

    return {
        "status": "started",
        "message": "Energy offers sync job started in background.",
    }


@router.post("/energy-offers/now")
async def sync_energy_offers_now(
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Sync energy providers and offers immediately (blocking)

    This endpoint performs a synchronous sync and returns the results.
    Use this for initial setup or when you need immediate feedback.

    Returns:
        Dict with sync results
    """
    logger.info("[API] Energy offers sync triggered (immediate)")

    sync_service = SyncService(db)
    result = await sync_service.sync_all_energy_data()

    return {
        "success": result.get("success", False),
        "data": result,
        "message": "Energy offers sync completed.",
    }


# =========================================================================
# EcoWatt Sync
# =========================================================================


@router.post("/ecowatt")
async def sync_ecowatt(
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Sync EcoWatt data from remote MyElectricalData gateway

    This endpoint starts a background sync job that fetches EcoWatt signals
    from the central MyElectricalData server and stores them locally.

    Returns:
        Dict with sync job status
    """
    logger.info("[API] EcoWatt sync triggered")

    async def run_sync() -> None:
        async with async_session_maker() as background_db:
            sync_service = SyncService(background_db)
            await sync_service.sync_ecowatt()

    background_tasks.add_task(run_sync)

    return {
        "status": "started",
        "message": "EcoWatt sync job started in background.",
    }


@router.post("/ecowatt/now")
async def sync_ecowatt_now(
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Sync EcoWatt data immediately (blocking)

    This endpoint performs a synchronous sync and returns the results.
    Use this for initial setup or when you need immediate feedback.

    Returns:
        Dict with sync results
    """
    logger.info("[API] EcoWatt sync triggered (immediate)")

    sync_service = SyncService(db)
    result = await sync_service.sync_ecowatt()

    success = len(result.get("errors", [])) == 0

    return {
        "success": success,
        "data": result,
        "message": f"EcoWatt sync completed: {result.get('created', 0)} created, {result.get('updated', 0)} updated.",
    }


# =========================================================================
# Tempo Sync
# =========================================================================


@router.post("/tempo")
async def sync_tempo(
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Sync Tempo calendar data from remote MyElectricalData gateway

    This endpoint starts a background sync job that fetches Tempo calendar
    from the central MyElectricalData server and stores it locally.

    Returns:
        Dict with sync job status
    """
    logger.info("[API] Tempo sync triggered")

    async def run_sync() -> None:
        async with async_session_maker() as background_db:
            sync_service = SyncService(background_db)
            await sync_service.sync_tempo()

    background_tasks.add_task(run_sync)

    return {
        "status": "started",
        "message": "Tempo sync job started in background.",
    }


@router.post("/tempo/now")
async def sync_tempo_now(
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Sync Tempo calendar data immediately (blocking)

    This endpoint performs a synchronous sync and returns the results.
    Use this for initial setup or when you need immediate feedback.

    Returns:
        Dict with sync results
    """
    logger.info("[API] Tempo sync triggered (immediate)")

    sync_service = SyncService(db)
    result = await sync_service.sync_tempo()

    success = len(result.get("errors", [])) == 0

    return {
        "success": success,
        "data": result,
        "message": f"Tempo sync completed: {result.get('created', 0)} created, {result.get('updated', 0)} updated.",
    }


@router.get("/tempo/status")
async def get_tempo_sync_status(
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Get Tempo sync status (last sync time with gateway)

    Returns:
        Dict with last sync timestamp and record count
    """
    from sqlalchemy import select, func
    from ..models.tempo_day import TempoDay

    sync_service = SyncService(db)

    # Get the last sync time with gateway (not RTE update time)
    last_sync = await sync_service.get_sync_tracker("tempo_client")

    # Get record count
    count_result = await db.execute(
        select(func.count(TempoDay.id))
    )
    count = count_result.scalar() or 0

    return {
        "success": True,
        "data": {
            "last_sync_at": last_sync.isoformat() if last_sync else None,
            "record_count": count,
        },
    }


# =========================================================================
# Zen Flex Sync (calendrier EDF Zen Week-End Option Flex)
# =========================================================================


@router.post("/zen-flex/now")
async def sync_zen_flex_now(
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Synchronise le calendrier Zen Flex depuis la passerelle (bloquant)"""
    logger.info("[API] Zen Flex sync triggered (immediate)")

    result = await SyncService(db).sync_zen_flex()

    return {
        "success": not result.get("errors"),
        "data": result,
        "message": f"Zen Flex sync completed: {result.get('created', 0)} created, {result.get('updated', 0)} updated.",
    }


@router.get("/zen-flex/status")
async def get_zen_flex_sync_status(
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Dernière synchro Zen Flex avec la passerelle et nombre de jours connus"""
    from sqlalchemy import func, select

    from ..models.zen_flex_day import ZenFlexDay

    last_sync = await SyncService(db).get_sync_tracker("zen_flex_client")
    count = (await db.execute(select(func.count(ZenFlexDay.id)))).scalar() or 0

    return {
        "success": True,
        "data": {
            "last_sync_at": last_sync.isoformat() if last_sync else None,
            "record_count": count,
        },
    }


@router.get("/ecowatt/status")
async def get_ecowatt_sync_status(
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Get EcoWatt sync status (last sync time with gateway)

    Returns:
        Dict with last sync timestamp and record count
    """
    from sqlalchemy import select, func
    from ..models.ecowatt import EcoWatt

    sync_service = SyncService(db)

    # Get the last sync time with gateway (not RTE update time)
    last_sync = await sync_service.get_sync_tracker("ecowatt_client")

    # Get record count
    count_result = await db.execute(
        select(func.count(EcoWatt.id))
    )
    count = count_result.scalar() or 0

    return {
        "success": True,
        "data": {
            "last_sync_at": last_sync.isoformat() if last_sync else None,
            "record_count": count,
        },
    }


# =========================================================================
# Consumption France Sync
# =========================================================================


@router.post("/consumption-france")
async def sync_consumption_france(
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Sync French national consumption data from remote MyElectricalData gateway

    This endpoint starts a background sync job that fetches French national
    consumption data from the central MyElectricalData server and stores it locally.

    Returns:
        Dict with sync job status
    """
    logger.info("[API] Consumption France sync triggered")

    async def run_sync() -> None:
        async with async_session_maker() as background_db:
            sync_service = SyncService(background_db)
            await sync_service.sync_consumption_france()

    background_tasks.add_task(run_sync)

    return {
        "status": "started",
        "message": "Consumption France sync job started in background.",
    }


@router.post("/consumption-france/now")
async def sync_consumption_france_now(
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Sync French national consumption data immediately (blocking)

    This endpoint performs a synchronous sync and returns the results.
    Use this for initial setup or when you need immediate feedback.

    Returns:
        Dict with sync results
    """
    logger.info("[API] Consumption France sync triggered (immediate)")

    sync_service = SyncService(db)
    result = await sync_service.sync_consumption_france()

    success = len(result.get("errors", [])) == 0

    return {
        "success": success,
        "data": result,
        "message": f"Consumption France sync completed: {result.get('created', 0)} created, {result.get('updated', 0)} updated.",
    }


@router.get("/consumption-france/status")
async def get_consumption_france_sync_status(
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Get Consumption France sync status (last sync time with gateway)

    Returns:
        Dict with last sync timestamp and record count
    """
    from sqlalchemy import select, func
    from ..models.consumption_france import ConsumptionFrance

    sync_service = SyncService(db)

    # Get the last sync time with gateway
    last_sync = await sync_service.get_sync_tracker("consumption_france_client")

    # Get record count
    count_result = await db.execute(
        select(func.count(ConsumptionFrance.id))
    )
    count = count_result.scalar() or 0

    return {
        "success": True,
        "data": {
            "last_sync_at": last_sync.isoformat() if last_sync else None,
            "record_count": count,
        },
    }


# =========================================================================
# Generation Forecast Sync
# =========================================================================


@router.post("/generation-forecast")
async def sync_generation_forecast(
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Sync renewable generation forecast data from remote MyElectricalData gateway

    This endpoint starts a background sync job that fetches solar and wind
    generation forecasts from the central MyElectricalData server and stores them locally.

    Returns:
        Dict with sync job status
    """
    logger.info("[API] Generation Forecast sync triggered")

    async def run_sync() -> None:
        async with async_session_maker() as background_db:
            sync_service = SyncService(background_db)
            await sync_service.sync_generation_forecast()

    background_tasks.add_task(run_sync)

    return {
        "status": "started",
        "message": "Generation Forecast sync job started in background.",
    }


@router.post("/generation-forecast/now")
async def sync_generation_forecast_now(
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Sync renewable generation forecast data immediately (blocking)

    This endpoint performs a synchronous sync and returns the results.
    Use this for initial setup or when you need immediate feedback.

    Returns:
        Dict with sync results
    """
    logger.info("[API] Generation Forecast sync triggered (immediate)")

    sync_service = SyncService(db)
    result = await sync_service.sync_generation_forecast()

    success = len(result.get("errors", [])) == 0

    return {
        "success": success,
        "data": result,
        "message": f"Generation Forecast sync completed: {result.get('created', 0)} created, {result.get('updated', 0)} updated.",
    }


@router.get("/generation-forecast/status")
async def get_generation_forecast_sync_status(
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Get Generation Forecast sync status (last sync time with gateway)

    Returns:
        Dict with last sync timestamp and record count
    """
    from sqlalchemy import select, func
    from ..models.generation_forecast import GenerationForecast

    sync_service = SyncService(db)

    # Get the last sync time with gateway
    last_sync = await sync_service.get_sync_tracker("generation_forecast_client")

    # Get record count
    count_result = await db.execute(
        select(func.count(GenerationForecast.id))
    )
    count = count_result.scalar() or 0

    return {
        "success": True,
        "data": {
            "last_sync_at": last_sync.isoformat() if last_sync else None,
            "record_count": count,
        },
    }
