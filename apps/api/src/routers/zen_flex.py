"""Calendrier EDF Zen Flex : jours Éco, Sobriété et Bonus (MED-27)"""

import logging
from datetime import date, timedelta
from typing import cast

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..middleware import require_action
from ..models import User
from ..models.database import get_db
from ..models.zen_flex_day import ZenFlexDay
from ..schemas import APIResponse, ErrorDetail
from ..services.edf_zen_flex import OFFER_START, edf_zen_flex_service, paris_today

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/zen-flex", tags=["Zen Flex Calendar"])


def _serialize(day: ZenFlexDay) -> dict:
    return {
        "date": day.id,
        "day_type": day.day_type.value,
        "updated_at": day.updated_at.isoformat() if day.updated_at else None,
    }


@router.get("/days", response_model=APIResponse)
async def get_zen_flex_days(
    start: str | None = Query(None, description="Date de début incluse (YYYY-MM-DD), défaut : lancement de l'offre"),
    end: str | None = Query(None, description="Date de fin incluse (YYYY-MM-DD), défaut : demain"),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """
    Calendrier Zen Flex (public, utilisé par la synchro du mode client)

    Un jour absent est inconnu (pas encore publié ou pas encore rattrapé), jamais Éco par défaut.
    """
    try:
        start_day = date.fromisoformat(start) if start else OFFER_START
        end_day = date.fromisoformat(end) if end else paris_today() + timedelta(days=1)
    except ValueError as e:
        return APIResponse(success=False, error=ErrorDetail(code="INVALID_DATE", message=f"Format de date invalide : {e}"))

    days = await edf_zen_flex_service.get_days(db, start_day, end_day)
    return APIResponse(success=True, data=[_serialize(day) for day in days])


@router.get("/today", response_model=APIResponse)
async def get_zen_flex_today(db: AsyncSession = Depends(get_db)) -> APIResponse:
    """Type du jour et du lendemain (null si inconnu)"""
    today = paris_today()
    tomorrow = today + timedelta(days=1)
    days = await edf_zen_flex_service.get_days(db, today, tomorrow)
    known: dict[date, str] = {cast(date, day.date): day.day_type.value for day in days}
    return APIResponse(
        success=True,
        data={
            "today": {"date": today.isoformat(), "day_type": known.get(today)},
            "tomorrow": {"date": tomorrow.isoformat(), "day_type": known.get(tomorrow)},
        },
    )


@router.post("/refresh", response_model=APIResponse)
async def refresh_zen_flex(
    current_user: User = Depends(require_action("zen_flex", "refresh")), db: AsyncSession = Depends(get_db)
) -> APIResponse:
    """
    Rafraîchit le calendrier Zen Flex

    Mode serveur : EDF (aujourd'hui, demain et un lot de rattrapage de l'historique)
    Mode client : passerelle MyElectricalData

    Permission requise : admin.zen_flex.refresh
    """
    logger.info(f"[ZEN_FLEX] Rafraîchissement manuel (user: {current_user.email}, mode: {'CLIENT' if settings.CLIENT_MODE else 'SERVER'})")
    if settings.CLIENT_MODE:
        from ..services.sync import SyncService

        result = await SyncService(db).sync_zen_flex()
    else:
        result = await edf_zen_flex_service.update_zen_flex_cache(db)

    if result.get("errors"):
        # Les jours lus avant l'erreur sont enregistrés : les compteurs le disent
        counts = ", ".join(f"{key}={result[key]}" for key in ("updated", "backfilled", "created") if key in result)
        message = f"{'; '.join(result['errors'])[:450]} ({counts})"
        return APIResponse(success=False, error=ErrorDetail(code="ZEN_FLEX_SOURCE_ERROR", message=message))
    return APIResponse(success=True, data=result)
