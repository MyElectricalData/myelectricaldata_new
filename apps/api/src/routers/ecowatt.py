"""
EcoWatt API endpoints
"""

from datetime import datetime, date, timedelta, UTC
from typing import List, Optional, Any
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
import logging

from ..models.database import get_db
from ..middleware import get_current_user, require_action
from ..models import User
from ..models.ecowatt import EcoWatt, EcoWattResponse
from ..schemas import APIResponse
from ..services import rate_limiter, cache_service
from ..services.rte import rte_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ecowatt", tags=["EcoWatt"])

# Throttling configuration
ECOWATT_REFRESH_COOLDOWN = 900  # 15 minutes in seconds


@router.get("/current", response_model=Optional[EcoWattResponse])
async def get_current_ecowatt(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Optional[EcoWattResponse]:
    """
    Get current EcoWatt signal for today

    Public endpoint - requires authentication only
    """
    # Check rate limit
    route = request.scope.get("route")
    endpoint_path = route.path if route else request.url.path
    is_allowed, current_count, limit = await rate_limiter.increment_and_check(
        current_user.id, False, current_user.is_admin, endpoint_path
    )
    if not is_allowed:
        raise HTTPException(status_code=429, detail=f"Rate limit exceeded: {current_count}/{limit} requests today")

    # Query database for today's signal
    today = date.today()
    query = select(EcoWatt).where(
        and_(
            EcoWatt.periode >= today,
            EcoWatt.periode < today + timedelta(days=1)
        )
    ).order_by(EcoWatt.generation_datetime.desc())

    result = await db.execute(query)
    ecowatt = result.scalar_one_or_none()

    if ecowatt:
        return EcoWattResponse.from_orm(ecowatt)

    return None


@router.get("/forecast", response_model=APIResponse)
async def get_ecowatt_forecast(
    request: Request,
    days: int = Query(
        default=4,
        ge=1,
        le=7,
        description="Number of days to forecast (1-7)",
        openapi_examples={
            "week": {"summary": "Full week", "description": "7 days forecast", "value": 7},
            "default": {"summary": "4 days", "description": "Default 4 days forecast", "value": 4},
            "tomorrow": {"summary": "Tomorrow only", "description": "Next day only", "value": 1}
        }
    ),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """
    Get EcoWatt forecast for the next N days (max 7)

    Public endpoint - requires authentication only
    """
    # Check rate limit
    route = request.scope.get("route")
    endpoint_path = route.path if route else request.url.path
    is_allowed, current_count, limit = await rate_limiter.increment_and_check(
        current_user.id, False, current_user.is_admin, endpoint_path
    )
    if not is_allowed:
        raise HTTPException(status_code=429, detail=f"Rate limit exceeded: {current_count}/{limit} requests today")

    # Query database for forecast
    today = date.today()
    end_date = today + timedelta(days=days)

    query = select(EcoWatt).where(
        and_(
            EcoWatt.periode >= today,
            EcoWatt.periode < end_date
        )
    ).order_by(EcoWatt.periode)

    result = await db.execute(query)
    ecowatt_data = result.scalars().all()

    data = [EcoWattResponse.from_orm(item) for item in ecowatt_data] if ecowatt_data else []

    return APIResponse(success=True, data=data)


@router.get("/history", response_model=List[EcoWattResponse])
async def get_ecowatt_history(
    request: Request,
    start_date: date = Query(
        ...,
        description="Start date for history (YYYY-MM-DD)",
        openapi_examples={
            "current_year": {"summary": "Start of 2024", "value": "2024-01-01"},
            "last_month": {"summary": "Last month start", "value": "2024-09-01"}
        }
    ),
    end_date: date = Query(
        ...,
        description="End date for history (YYYY-MM-DD)",
        openapi_examples={
            "current_year": {"summary": "End of 2024", "value": "2024-12-31"},
            "last_month": {"summary": "Last month end", "value": "2024-09-30"}
        }
    ),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[EcoWattResponse]:
    """
    Get historical EcoWatt data between two dates

    Public endpoint - requires authentication only
    """
    # Check rate limit
    route = request.scope.get("route")
    endpoint_path = route.path if route else request.url.path
    is_allowed, current_count, limit = await rate_limiter.increment_and_check(
        current_user.id, False, current_user.is_admin, endpoint_path
    )
    if not is_allowed:
        raise HTTPException(status_code=429, detail=f"Rate limit exceeded: {current_count}/{limit} requests today")

    # Limit the date range to prevent too much data
    if (end_date - start_date).days > 365:
        raise HTTPException(
            status_code=400,
            detail="Date range cannot exceed 365 days"
        )

    # Query database
    query = select(EcoWatt).where(
        and_(
            EcoWatt.periode >= start_date,
            EcoWatt.periode <= end_date
        )
    ).order_by(EcoWatt.periode)

    result = await db.execute(query)
    ecowatt_data = result.scalars().all()

    return [EcoWattResponse.from_orm(item) for item in ecowatt_data]


@router.get("/statistics")
async def get_ecowatt_statistics(
    request: Request,
    year: int = Query(
        default=datetime.now().year,
        description="Year for statistics",
        openapi_examples={
            "current_year": {"summary": "2024", "value": 2024},
            "previous_year": {"summary": "2023", "value": 2023},
            "2022": {"summary": "2022", "value": 2022}
        }
    ),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """
    Get EcoWatt statistics for a given year

    Public endpoint - requires authentication only
    """
    # Check rate limit
    route = request.scope.get("route")
    endpoint_path = route.path if route else request.url.path
    is_allowed, current_count, limit = await rate_limiter.increment_and_check(
        current_user.id, False, current_user.is_admin, endpoint_path
    )
    if not is_allowed:
        raise HTTPException(status_code=429, detail=f"Rate limit exceeded: {current_count}/{limit} requests today")

    # Query database for the year's data
    start_date = date(year, 1, 1)
    end_date = date(year, 12, 31)

    query = select(EcoWatt).where(
        and_(
            EcoWatt.periode >= start_date,
            EcoWatt.periode <= end_date
        )
    )

    result = await db.execute(query)
    ecowatt_data = result.scalars().all()

    if not ecowatt_data:
        return {
            "year": year,
            "total_days": 0,
            "green_days": 0,
            "orange_days": 0,
            "red_days": 0,
            "percentage_green": 0,
            "percentage_orange": 0,
            "percentage_red": 0,
        }

    # Calculate statistics
    total_days = len(ecowatt_data)
    green_days = sum(1 for d in ecowatt_data if d.dvalue == 1)
    orange_days = sum(1 for d in ecowatt_data if d.dvalue == 2)
    red_days = sum(1 for d in ecowatt_data if d.dvalue == 3)

    statistics = {
        "year": year,
        "total_days": total_days,
        "green_days": green_days,
        "orange_days": orange_days,
        "red_days": red_days,
        "percentage_green": round((green_days / total_days) * 100, 2) if total_days > 0 else 0,
        "percentage_orange": round((orange_days / total_days) * 100, 2) if total_days > 0 else 0,
        "percentage_red": round((red_days / total_days) * 100, 2) if total_days > 0 else 0,
    }

    return statistics


@router.get("/refresh/status")
async def get_refresh_status(
    current_user: User = Depends(require_action("ecowatt", "refresh")),
) -> dict[str, Any]:
    """
    Get EcoWatt refresh cooldown status

    Required permission: admin.ecowatt.refresh
    """
    cache_key = "ecowatt:last_refresh"

    try:
        if not cache_service.redis_client:
            return {
                "success": True,
                "can_refresh": True,
                "message": "Redis not available, no cooldown enforced"
            }

        last_refresh = await cache_service.redis_client.get(cache_key)

        if not last_refresh:
            return {
                "success": True,
                "can_refresh": True,
                "message": "No previous refresh found"
            }

        last_refresh_time = datetime.fromisoformat(
            last_refresh.decode() if isinstance(last_refresh, bytes) else last_refresh
        )
        time_since_refresh = (datetime.now(UTC) - last_refresh_time).total_seconds()
        time_remaining = ECOWATT_REFRESH_COOLDOWN - time_since_refresh

        if time_remaining > 0:
            minutes_remaining = int(time_remaining / 60)
            seconds_remaining = int(time_remaining % 60)
            return {
                "success": True,
                "can_refresh": False,
                "cooldown_active": True,
                "last_refresh": last_refresh_time.isoformat(),
                "time_remaining_seconds": int(time_remaining),
                "time_remaining_formatted": f"{minutes_remaining}m {seconds_remaining}s",
                "message": f"Cooldown actif. Prochaine actualisation possible dans {minutes_remaining}m {seconds_remaining}s"
            }
        else:
            return {
                "success": True,
                "can_refresh": True,
                "cooldown_active": False,
                "last_refresh": last_refresh_time.isoformat(),
                "message": "Actualisation disponible"
            }

    except Exception as e:
        logger.error(f"Error checking refresh status: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to check refresh status: {str(e)}"
        )


@router.post("/refresh", response_model=APIResponse)
async def refresh_ecowatt_cache(
    current_user: User = Depends(require_action("ecowatt", "refresh")),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """
    Manually refresh EcoWatt cache from RTE API

    Required permission: admin.ecowatt.refresh

    Throttling: Max 1 call every 15 minutes (strict enforcement to prevent API ban)
    """
    cache_key = "ecowatt:last_refresh"

    try:
        # Check last refresh time (strict enforcement, no force option)
        if cache_service.redis_client:
            last_refresh = await cache_service.redis_client.get(cache_key)

            if last_refresh:
                last_refresh_time = datetime.fromisoformat(last_refresh.decode() if isinstance(last_refresh, bytes) else last_refresh)
                time_since_refresh = (datetime.now(UTC) - last_refresh_time).total_seconds()
                time_remaining = ECOWATT_REFRESH_COOLDOWN - time_since_refresh

                if time_remaining > 0:
                    minutes_remaining = int(time_remaining / 60)
                    seconds_remaining = int(time_remaining % 60)
                    raise HTTPException(
                        status_code=429,
                        detail=f"Cooldown actif. Prochaine actualisation possible dans {minutes_remaining}m {seconds_remaining}s."
                    )

        # Perform refresh
        logger.info(f"[ECOWATT] Refreshing cache (user: {current_user.email})")
        updated_count = await rte_service.update_ecowatt_cache(db)

        # Update last refresh timestamp
        if cache_service.redis_client:
            await cache_service.redis_client.set(
                cache_key,
                datetime.now(UTC).isoformat(),
                ex=ECOWATT_REFRESH_COOLDOWN * 2  # Keep for 30 minutes
            )

        data = {
            "message": f"Successfully refreshed {updated_count} EcoWatt signals",
            "updated_count": updated_count
        }

        return APIResponse(success=True, data=data)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error refreshing EcoWatt cache: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to refresh EcoWatt cache: {str(e)}"
        )