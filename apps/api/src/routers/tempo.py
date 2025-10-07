"""TEMPO calendar endpoints"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timedelta, UTC
from typing import List
from ..models import User, TempoDay
from ..models.database import get_db
from ..schemas import APIResponse, ErrorDetail
from ..middleware import get_current_user, require_permission
from ..services.rte import rte_service

router = APIRouter(prefix="/tempo", tags=["TEMPO Calendar"])


@router.get("/days", response_model=APIResponse)
async def get_tempo_days(
    start_date: str | None = None,
    end_date: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """
    Get TEMPO calendar days from cache (public endpoint)

    Args:
        start_date: Optional start date (YYYY-MM-DD)
        end_date: Optional end date (YYYY-MM-DD)
    """
    try:
        # Parse dates if provided
        start_dt = None
        end_dt = None

        if start_date:
            start_dt = datetime.fromisoformat(start_date).replace(tzinfo=UTC)
        if end_date:
            end_dt = datetime.fromisoformat(end_date).replace(tzinfo=UTC)

        # Get data from cache
        tempo_days = await rte_service.get_tempo_days(db, start_dt, end_dt)

        return APIResponse(
            success=True,
            data=[
                {
                    "date": day.id,  # Use id (YYYY-MM-DD format) instead of date timestamp
                    "color": day.color.value,
                    "updated_at": day.updated_at.isoformat() if day.updated_at else None,
                    "rte_updated_date": day.rte_updated_date.isoformat() if day.rte_updated_date else None,
                }
                for day in tempo_days
            ],
        )

    except ValueError as e:
        return APIResponse(success=False, error=ErrorDetail(code="INVALID_DATE", message=f"Invalid date format: {e}"))
    except Exception as e:
        print(f"[TEMPO ERROR] {str(e)}")
        return APIResponse(success=False, error=ErrorDetail(code="SERVER_ERROR", message=str(e)))


@router.get("/today", response_model=APIResponse)
async def get_today_tempo(db: AsyncSession = Depends(get_db)) -> APIResponse:
    """Get today's TEMPO color (public endpoint)"""
    try:
        today = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
        tempo_day = await rte_service.get_tempo_day(db, today)

        if not tempo_day:
            return APIResponse(
                success=False, error=ErrorDetail(code="NOT_FOUND", message="TEMPO data not available for today")
            )

        return APIResponse(
            success=True,
            data={
                "date": tempo_day.id,  # Use id (YYYY-MM-DD format) instead of date timestamp
                "color": tempo_day.color.value,
                "updated_at": tempo_day.updated_at.isoformat() if tempo_day.updated_at else None,
                "rte_updated_date": tempo_day.rte_updated_date.isoformat() if tempo_day.rte_updated_date else None,
            },
        )

    except Exception as e:
        print(f"[TEMPO ERROR] {str(e)}")
        return APIResponse(success=False, error=ErrorDetail(code="SERVER_ERROR", message=str(e)))


@router.get("/week", response_model=APIResponse)
async def get_week_tempo(db: AsyncSession = Depends(get_db)) -> APIResponse:
    """Get last 7 days + tomorrow TEMPO colors from cache (public endpoint)"""
    try:
        # Get last 7 days + tomorrow (including today and historical data)
        today = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
        start_date = today - timedelta(days=6)  # 6 days ago + today = 7 days
        end_date = today + timedelta(days=1)  # Include tomorrow if available

        tempo_days = await rte_service.get_tempo_days(db, start_date, end_date)

        return APIResponse(
            success=True,
            data=[
                {
                    "date": day.id,  # Use id (YYYY-MM-DD format) instead of date timestamp
                    "color": day.color.value,
                    "updated_at": day.updated_at.isoformat() if day.updated_at else None,
                    "rte_updated_date": day.rte_updated_date.isoformat() if day.rte_updated_date else None,
                }
                for day in tempo_days
            ],
        )

    except Exception as e:
        print(f"[TEMPO ERROR] {str(e)}")
        return APIResponse(success=False, error=ErrorDetail(code="SERVER_ERROR", message=str(e)))


@router.post("/refresh", response_model=APIResponse)
async def refresh_tempo_cache(
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> APIResponse:
    """
    Manually refresh TEMPO cache from RTE API (authenticated endpoint)

    RTE API limitation: only today's color + tomorrow's color (available after 6am)
    """
    try:
        print(f"[TEMPO] Refreshing cache (user: {current_user.email})")
        updated_count = await rte_service.update_tempo_cache(db)

        return APIResponse(
            success=True, data={"message": f"Successfully refreshed {updated_count} TEMPO days", "updated_count": updated_count}
        )

    except Exception as e:
        error_msg = str(e)
        print(f"[TEMPO REFRESH ERROR] {error_msg}")
        import traceback
        traceback.print_exc()

        # Provide user-friendly error message for RTE API errors
        if "400 Bad Request" in error_msg and "end_date" in error_msg:
            error_msg = "Les données TEMPO ne sont pas disponibles pour ces dates. L'API RTE ne fournit que des données historiques et quelques jours futurs."
        elif "400 Bad Request" in error_msg:
            error_msg = "Erreur lors de la récupération des données RTE. Veuillez réessayer plus tard."

        return APIResponse(success=False, error=ErrorDetail(code="RTE_API_ERROR", message=error_msg))


@router.delete("/clear-old", response_model=APIResponse)
async def clear_old_tempo_data(
    days_to_keep: int = 30, current_user: User = Depends(require_permission('tempo')), db: AsyncSession = Depends(get_db)
) -> APIResponse:
    """
    Clear old TEMPO data from cache (requires tempo permission)

    Args:
        days_to_keep: Keep data from last N days (default: 30, min: 7)
    """

    # Minimum 7 days
    days_to_keep = max(days_to_keep, 7)

    try:
        print(f"[TEMPO] Clearing data older than {days_to_keep} days (admin: {current_user.email})")
        deleted_count = await rte_service.clear_old_data(db, days_to_keep)

        return APIResponse(
            success=True, data={"message": f"Successfully deleted {deleted_count} old TEMPO records", "count": deleted_count}
        )

    except Exception as e:
        print(f"[TEMPO CLEAR ERROR] {str(e)}")
        return APIResponse(success=False, error=ErrorDetail(code="SERVER_ERROR", message=str(e)))
