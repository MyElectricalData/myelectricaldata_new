"""
Generation Forecast endpoints - Prévisions de production par filière

Supports both server mode (direct RTE API) and client mode (via gateway).
"""

import logging
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..middleware import require_action
from ..models import User
from ..models.database import get_db
from ..schemas import APIResponse, ErrorDetail
from ..services.rte import rte_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/generation-forecast", tags=["Generation Forecast"])


@router.get("", response_model=APIResponse)
@router.get("/", response_model=APIResponse, include_in_schema=False)
async def get_generation_forecast(
    production_type: str | None = Query(
        None,
        description="Type de production (SOLAR, WIND)",
        openapi_examples={
            "solar": {"summary": "Production solaire", "value": "SOLAR"},
            "wind": {"summary": "Production éolienne", "value": "WIND"},
        },
    ),
    forecast_type: str | None = Query(
        None,
        description="Type de prévision (D-3, D-2, D-1, ID, CURRENT)",
        openapi_examples={
            "d-1": {"summary": "Prévision J-1 (référence)", "value": "D-1"},
            "intraday": {"summary": "Prévision intraday", "value": "ID"},
            "current": {"summary": "Dernière prévision", "value": "CURRENT"},
        },
    ),
    start_date: str | None = Query(
        None,
        description="Date de début (YYYY-MM-DD ou ISO 8601)",
        openapi_examples={
            "today": {"summary": "Aujourd'hui", "value": "2024-01-15"},
        },
    ),
    end_date: str | None = Query(
        None,
        description="Date de fin (YYYY-MM-DD ou ISO 8601)",
        openapi_examples={
            "in_3_days": {"summary": "Dans 3 jours", "value": "2024-01-18"},
        },
    ),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """
    Récupérer les prévisions de production électrique par filière.

    Types de production :
    - **SOLAR** : Production solaire
    - **WIND** : Production éolienne (onshore + offshore agrégée)

    Types de prévision :
    - **D-3** : Prévision à J-3
    - **D-2** : Prévision à J-2
    - **D-1** : Prévision J-1 (référence, disponible vers 18h)
    - **ID** : Prévision intraday (mise à jour chaque heure)
    - **CURRENT** : Dernière prévision disponible

    Les données sont en MW.
    """
    try:
        # Parser les dates si fournies
        start_dt = None
        end_dt = None

        if start_date:
            start_dt = datetime.fromisoformat(start_date.replace("Z", "+00:00"))
            if start_dt.tzinfo is None:
                start_dt = start_dt.replace(tzinfo=UTC)

        if end_date:
            end_dt = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
            if end_dt.tzinfo is None:
                end_dt = end_dt.replace(tzinfo=UTC)

        # Par défaut : aujourd'hui + 3 jours
        if not start_dt:
            start_dt = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
        if not end_dt:
            end_dt = start_dt + timedelta(days=3)

        # Récupérer les données depuis le cache
        forecast_data = await rte_service.get_generation_forecast(
            db,
            production_type=production_type,
            forecast_type=forecast_type,
            start_date=start_dt,
            end_date=end_dt,
        )

        # Grouper par production_type et forecast_type
        data_grouped: dict[str, dict[str, list]] = {}
        for record in forecast_data:
            if record.production_type not in data_grouped:
                data_grouped[record.production_type] = {}
            if record.forecast_type not in data_grouped[record.production_type]:
                data_grouped[record.production_type][record.forecast_type] = []

            data_grouped[record.production_type][record.forecast_type].append(
                {
                    "start_date": record.start_date.isoformat() if record.start_date else None,
                    "end_date": record.end_date.isoformat() if record.end_date else None,
                    "value": record.value,
                    "updated_date": record.updated_date.isoformat() if record.updated_date else None,
                }
            )

        # Formatter la réponse
        forecasts = []
        for prod_type, forecast_types in data_grouped.items():
            for fc_type, values in forecast_types.items():
                forecasts.append(
                    {
                        "production_type": prod_type,
                        "forecast_type": fc_type,
                        "values": values,
                    }
                )

        return APIResponse(
            success=True,
            data={
                "forecasts": forecasts,
                "period": {
                    "start": start_dt.isoformat(),
                    "end": end_dt.isoformat(),
                },
            },
        )

    except ValueError as e:
        return APIResponse(success=False, error=ErrorDetail(code="INVALID_DATE", message=f"Format de date invalide: {e}"))
    except Exception as e:
        logger.error(f"[GENERATION FORECAST ERROR] {str(e)}")
        return APIResponse(success=False, error=ErrorDetail(code="SERVER_ERROR", message=str(e)))


@router.get("/solar", response_model=APIResponse)
async def get_solar_forecast(
    days: int = Query(
        3,
        ge=1,
        le=7,
        description="Nombre de jours de prévision (1-7)",
    ),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """
    Récupérer les prévisions de production solaire.

    Raccourci pour obtenir uniquement les prévisions solaires.
    """
    try:
        now = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
        end_dt = now + timedelta(days=days)

        forecast_data = await rte_service.get_generation_forecast(
            db,
            production_type="SOLAR",
            start_date=now,
            end_date=end_dt,
        )

        # Grouper par forecast_type
        data_by_type: dict[str, list] = {}
        for record in forecast_data:
            if record.forecast_type not in data_by_type:
                data_by_type[record.forecast_type] = []
            data_by_type[record.forecast_type].append(
                {
                    "start_date": record.start_date.isoformat() if record.start_date else None,
                    "end_date": record.end_date.isoformat() if record.end_date else None,
                    "value": record.value,
                    "updated_date": record.updated_date.isoformat() if record.updated_date else None,
                }
            )

        return APIResponse(
            success=True,
            data={
                "production_type": "SOLAR",
                "forecasts": [
                    {
                        "forecast_type": fc_type,
                        "values": values,
                    }
                    for fc_type, values in data_by_type.items()
                ],
                "period": {
                    "start": now.isoformat(),
                    "end": end_dt.isoformat(),
                },
            },
        )

    except Exception as e:
        logger.error(f"[GENERATION FORECAST SOLAR ERROR] {str(e)}")
        return APIResponse(success=False, error=ErrorDetail(code="SERVER_ERROR", message=str(e)))


@router.get("/wind", response_model=APIResponse)
async def get_wind_forecast(
    days: int = Query(
        3,
        ge=1,
        le=7,
        description="Nombre de jours de prévision (1-7)",
    ),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """
    Récupérer les prévisions de production éolienne.

    Raccourci pour obtenir uniquement les prévisions éoliennes.
    """
    try:
        now = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
        end_dt = now + timedelta(days=days)

        forecast_data = await rte_service.get_generation_forecast(
            db,
            production_type="WIND",
            start_date=now,
            end_date=end_dt,
        )

        # Grouper par forecast_type
        data_by_type: dict[str, list] = {}
        for record in forecast_data:
            if record.forecast_type not in data_by_type:
                data_by_type[record.forecast_type] = []
            data_by_type[record.forecast_type].append(
                {
                    "start_date": record.start_date.isoformat() if record.start_date else None,
                    "end_date": record.end_date.isoformat() if record.end_date else None,
                    "value": record.value,
                    "updated_date": record.updated_date.isoformat() if record.updated_date else None,
                }
            )

        return APIResponse(
            success=True,
            data={
                "production_type": "WIND",
                "forecasts": [
                    {
                        "forecast_type": fc_type,
                        "values": values,
                    }
                    for fc_type, values in data_by_type.items()
                ],
                "period": {
                    "start": now.isoformat(),
                    "end": end_dt.isoformat(),
                },
            },
        )

    except Exception as e:
        logger.error(f"[GENERATION FORECAST WIND ERROR] {str(e)}")
        return APIResponse(success=False, error=ErrorDetail(code="SERVER_ERROR", message=str(e)))


@router.get("/mix", response_model=APIResponse)
async def get_renewable_mix(
    forecast_type: str = Query(
        "ID",
        description="Type de prévision (ID, D-1)",
        openapi_examples={
            "intraday": {"summary": "Prévision intraday (défaut)", "value": "ID"},
            "d-1": {"summary": "Prévision J-1", "value": "D-1"},
        },
    ),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """
    Récupérer le mix renouvelable prévu (solaire + éolien).

    Retourne les prévisions combinées pour la veille, aujourd'hui et demain.
    Par défaut, utilise les prévisions intraday (ID) qui sont mises à jour chaque heure.
    """
    try:
        now = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
        start_dt = now - timedelta(days=1)  # Inclure la veille
        end_dt = now + timedelta(days=2)

        # Récupérer solaire et éolien avec le type de prévision demandé
        solar_data = await rte_service.get_generation_forecast(
            db,
            production_type="SOLAR",
            forecast_type=forecast_type,
            start_date=start_dt,
            end_date=end_dt,
        )

        wind_data = await rte_service.get_generation_forecast(
            db,
            production_type="WIND",
            forecast_type=forecast_type,
            start_date=start_dt,
            end_date=end_dt,
        )

        # Créer un dictionnaire par timestamp pour combiner
        solar_by_time = {r.start_date: r.value for r in solar_data}
        wind_by_time = {r.start_date: r.value for r in wind_data}

        # Combiner les données
        all_times = sorted(set(solar_by_time.keys()) | set(wind_by_time.keys()))
        mix_data = []
        for t in all_times:
            solar_value = solar_by_time.get(t, 0)
            wind_value = wind_by_time.get(t, 0)
            mix_data.append(
                {
                    "start_date": t.isoformat() if t else None,
                    "solar": solar_value,
                    "wind": wind_value,
                    "total_renewable": solar_value + wind_value,
                }
            )

        return APIResponse(
            success=True,
            data={
                "forecast_type": forecast_type,
                "mix": mix_data,
                "period": {
                    "start": start_dt.isoformat(),
                    "end": end_dt.isoformat(),
                },
            },
        )

    except Exception as e:
        logger.error(f"[GENERATION FORECAST MIX ERROR] {str(e)}")
        return APIResponse(success=False, error=ErrorDetail(code="SERVER_ERROR", message=str(e)))


@router.post("/refresh", response_model=APIResponse)
async def refresh_generation_forecast_cache(
    production_type: str | None = Query(
        None,
        description="Type de production à actualiser (SOLAR, WIND, ou tous si non spécifié)",
    ),
    current_user: User = Depends(require_action("generation_forecast", "refresh")),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """
    Actualiser manuellement le cache de prévisions de production.

    In server mode: fetches from RTE API
    In client mode: fetches from MyElectricalData gateway

    Permission requise : admin.generation_forecast.refresh
    """
    try:
        logger.info(f"[GENERATION FORECAST] Refreshing cache (user: {current_user.email}, type: {production_type or 'ALL'}, mode: {'CLIENT' if settings.CLIENT_MODE else 'SERVER'})")

        if settings.CLIENT_MODE:
            # Client mode: sync from gateway
            from ..services.sync import SyncService
            sync_service = SyncService(db)
            result = await sync_service.sync_generation_forecast()
            updated_count = result.get("created", 0) + result.get("updated", 0)
        else:
            # Server mode: fetch from RTE API
            updated_count = await rte_service.update_generation_forecast_cache(db, production_type=production_type)

        return APIResponse(
            success=True,
            data={
                "message": f"Cache actualisé avec succès : {updated_count} enregistrements",
                "updated_count": updated_count,
                "production_type": production_type or "ALL",
            },
        )

    except Exception as e:
        error_msg = str(e)
        logger.error(f"[GENERATION FORECAST REFRESH ERROR] {error_msg}")
        return APIResponse(success=False, error=ErrorDetail(code="RTE_API_ERROR", message=error_msg))
