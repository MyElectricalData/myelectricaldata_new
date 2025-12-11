"""Main API endpoints for consumption, production, and status."""

import logging
from datetime import date, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel

from ...database import Repository

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["api"])


# Dependency to get repository
def get_repository(request: Request) -> Repository:
    """Get repository from app state."""
    return request.app.state.repository


def get_sync_service(request: Request):
    """Get sync service from app state."""
    return request.app.state.sync_service


def get_scheduler(request: Request):
    """Get scheduler from app state."""
    return request.app.state.scheduler


# Response models
class PDLResponse(BaseModel):
    usage_point_id: str
    name: Optional[str] = None
    address: Optional[str] = None
    postal_code: Optional[str] = None
    city: Optional[str] = None
    subscribed_power: Optional[str] = None
    tariff_option: Optional[str] = None
    has_production: bool = False
    linked_production_usage_point_id: Optional[str] = None


class ConsumptionDataResponse(BaseModel):
    date: date
    daily_kwh: float
    hc_kwh: Optional[float] = None
    hp_kwh: Optional[float] = None
    max_power_kva: Optional[float] = None


class ProductionDataResponse(BaseModel):
    date: date
    daily_kwh: float


class StatusResponse(BaseModel):
    status: str
    pdl_count: int
    last_sync: Optional[str] = None
    database: str
    integrations: Dict[str, bool]


# Endpoints
@router.get("/status", response_model=StatusResponse)
async def get_status(
    request: Request,
    repository: Repository = Depends(get_repository),
) -> StatusResponse:
    """Get system status."""
    pdls = await repository.get_all_pdls()
    settings = request.app.state.settings
    exporter_manager = request.app.state.exporter_manager

    # Get last sync from scheduler
    scheduler = request.app.state.scheduler
    scheduler_status = scheduler.get_status()

    # Get database type from URL
    db_url = settings.database.url
    if "sqlite" in db_url:
        db_type = "sqlite"
    elif "postgresql" in db_url:
        db_type = "postgresql"
    elif "mysql" in db_url:
        db_type = "mysql"
    else:
        db_type = "unknown"

    # Get enabled integrations
    integrations = {}
    for exp in exporter_manager.list():
        integrations[exp["name"]] = exp["enabled"]

    return StatusResponse(
        status="ok",
        pdl_count=len(pdls),
        last_sync=scheduler_status.get("last_sync"),
        database=db_type,
        integrations=integrations,
    )


@router.get("/pdl", response_model=List[PDLResponse])
async def list_pdls(
    repository: Repository = Depends(get_repository),
) -> List[PDLResponse]:
    """List all PDLs."""
    pdls = await repository.get_all_pdls()
    return [
        PDLResponse(
            usage_point_id=pdl.usage_point_id,
            name=pdl.name,
            address=pdl.address,
            postal_code=pdl.postal_code,
            city=pdl.city,
            subscribed_power=pdl.subscribed_power,
            tariff_option=pdl.tariff_option,
            has_production=pdl.has_production,
            linked_production_usage_point_id=pdl.linked_production_usage_point_id,
        )
        for pdl in pdls
    ]


@router.get("/pdl/{usage_point_id}", response_model=PDLResponse)
async def get_pdl(
    usage_point_id: str,
    repository: Repository = Depends(get_repository),
) -> PDLResponse:
    """Get PDL details."""
    pdl = await repository.get_pdl(usage_point_id)
    if not pdl:
        raise HTTPException(status_code=404, detail="PDL not found")

    return PDLResponse(
        usage_point_id=pdl.usage_point_id,
        name=pdl.name,
        address=pdl.address,
        postal_code=pdl.postal_code,
        city=pdl.city,
        subscribed_power=pdl.subscribed_power,
        tariff_option=pdl.tariff_option,
        has_production=pdl.has_production,
        linked_production_usage_point_id=pdl.linked_production_usage_point_id,
    )


@router.get("/consumption/daily", response_model=List[ConsumptionDataResponse])
async def get_consumption_daily(
    pdl: Optional[str] = Query(None, description="PDL identifier"),
    start: Optional[date] = Query(None, description="Start date"),
    end: Optional[date] = Query(None, description="End date"),
    repository: Repository = Depends(get_repository),
) -> List[ConsumptionDataResponse]:
    """Get daily consumption data."""
    # Default to first PDL if not specified
    if not pdl:
        pdls = await repository.get_all_pdls()
        if not pdls:
            raise HTTPException(status_code=404, detail="No PDLs found")
        pdl = pdls[0].usage_point_id

    # Default date range
    if not end:
        end = date.today() - timedelta(days=1)
    if not start:
        start = end - timedelta(days=7)

    data = await repository.get_consumption(pdl, start, end)

    return [
        ConsumptionDataResponse(
            date=item.date,
            daily_kwh=item.daily_kwh,
            hc_kwh=item.hc_kwh,
            hp_kwh=item.hp_kwh,
            max_power_kva=item.max_power_kva,
        )
        for item in data
    ]


@router.get("/consumption/{usage_point_id}/daily", response_model=List[ConsumptionDataResponse])
async def get_pdl_consumption_daily(
    usage_point_id: str,
    start: Optional[date] = Query(None, description="Start date"),
    end: Optional[date] = Query(None, description="End date"),
    repository: Repository = Depends(get_repository),
) -> List[ConsumptionDataResponse]:
    """Get daily consumption data for a specific PDL."""
    # Default date range
    if not end:
        end = date.today() - timedelta(days=1)
    if not start:
        start = end - timedelta(days=7)

    data = await repository.get_consumption(usage_point_id, start, end)

    return [
        ConsumptionDataResponse(
            date=item.date,
            daily_kwh=item.daily_kwh,
            hc_kwh=item.hc_kwh,
            hp_kwh=item.hp_kwh,
            max_power_kva=item.max_power_kva,
        )
        for item in data
    ]


@router.get("/production/daily", response_model=List[ProductionDataResponse])
async def get_production_daily(
    pdl: Optional[str] = Query(None, description="PDL identifier"),
    start: Optional[date] = Query(None, description="Start date"),
    end: Optional[date] = Query(None, description="End date"),
    repository: Repository = Depends(get_repository),
) -> List[ProductionDataResponse]:
    """Get daily production data."""
    # Default to first PDL with production if not specified
    if not pdl:
        pdls = await repository.get_all_pdls()
        pdls_with_production = [p for p in pdls if p.has_production]
        if not pdls_with_production:
            raise HTTPException(status_code=404, detail="No PDLs with production found")
        pdl = pdls_with_production[0].usage_point_id

    # Default date range
    if not end:
        end = date.today() - timedelta(days=1)
    if not start:
        start = end - timedelta(days=7)

    data = await repository.get_production(pdl, start, end)

    return [
        ProductionDataResponse(
            date=item.date,
            daily_kwh=item.daily_kwh,
        )
        for item in data
    ]


@router.get("/production/{usage_point_id}/daily", response_model=List[ProductionDataResponse])
async def get_pdl_production_daily(
    usage_point_id: str,
    start: Optional[date] = Query(None, description="Start date"),
    end: Optional[date] = Query(None, description="End date"),
    repository: Repository = Depends(get_repository),
) -> List[ProductionDataResponse]:
    """Get daily production data for a specific PDL."""
    # Default date range
    if not end:
        end = date.today() - timedelta(days=1)
    if not start:
        start = end - timedelta(days=7)

    data = await repository.get_production(usage_point_id, start, end)

    return [
        ProductionDataResponse(
            date=item.date,
            daily_kwh=item.daily_kwh,
        )
        for item in data
    ]


@router.post("/sync")
async def trigger_sync(
    request: Request,
) -> Dict[str, Any]:
    """Trigger a manual synchronization."""
    sync_service = request.app.state.sync_service
    result = await sync_service.sync_all()
    return result


@router.get("/scheduler/status")
async def get_scheduler_status(
    request: Request,
) -> Dict[str, Any]:
    """Get scheduler status."""
    scheduler = request.app.state.scheduler
    return scheduler.get_status()


@router.post("/config/reload")
async def reload_config(
    request: Request,
) -> Dict[str, Any]:
    """Reload configuration."""
    from ...config import reload_settings

    new_settings = reload_settings()
    request.app.state.settings = new_settings

    return {"success": True, "message": "Configuration reloaded"}


# ===== Tempo proxy routes (from gateway) =====


@router.get("/tempo/today")
async def get_tempo_today(request: Request) -> Dict[str, Any]:
    """Get today's TEMPO color (proxy to gateway)."""
    gateway = request.app.state.gateway
    try:
        data = await gateway.request("GET", "/api/tempo/today")
        return data
    except Exception as e:
        logger.error(f"Error fetching tempo today: {e}")
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/tempo/days")
async def get_tempo_days(
    request: Request,
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
) -> List[Dict[str, Any]]:
    """Get TEMPO days (proxy to gateway)."""
    gateway = request.app.state.gateway
    try:
        params = {}
        if start_date:
            params["start_date"] = start_date
        if end_date:
            params["end_date"] = end_date
        data = await gateway.request("GET", "/api/tempo/days", params=params)
        # Return the data array directly
        if isinstance(data, dict) and "data" in data:
            return data["data"]
        return data if isinstance(data, list) else []
    except Exception as e:
        logger.error(f"Error fetching tempo days: {e}")
        raise HTTPException(status_code=502, detail=str(e))


# ===== EcoWatt proxy routes (from gateway) =====


@router.get("/ecowatt/current")
async def get_ecowatt_current(request: Request) -> Dict[str, Any]:
    """Get current EcoWatt signal (proxy to gateway)."""
    gateway = request.app.state.gateway
    try:
        data = await gateway.request("GET", "/api/ecowatt/current")
        # Return the data directly if it's in a wrapper
        if isinstance(data, dict) and "data" in data:
            return data["data"]
        return data
    except Exception as e:
        logger.error(f"Error fetching ecowatt current: {e}")
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/ecowatt/forecast")
async def get_ecowatt_forecast(
    request: Request,
    days: int = Query(4, ge=1, le=7),
) -> List[Dict[str, Any]]:
    """Get EcoWatt forecast (proxy to gateway)."""
    gateway = request.app.state.gateway
    try:
        data = await gateway.request("GET", f"/api/ecowatt/forecast?days={days}")
        # Return the data array directly
        if isinstance(data, dict) and "data" in data:
            return data["data"]
        return data if isinstance(data, list) else []
    except Exception as e:
        logger.error(f"Error fetching ecowatt forecast: {e}")
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/ecowatt/statistics")
async def get_ecowatt_statistics(
    request: Request,
    year: Optional[int] = Query(None),
) -> Dict[str, Any]:
    """Get EcoWatt statistics (proxy to gateway)."""
    gateway = request.app.state.gateway
    try:
        params = f"?year={year}" if year else ""
        data = await gateway.request("GET", f"/api/ecowatt/statistics{params}")
        # Return the data directly if it's in a wrapper
        if isinstance(data, dict) and "data" in data:
            return data["data"]
        return data
    except Exception as e:
        logger.error(f"Error fetching ecowatt statistics: {e}")
        raise HTTPException(status_code=502, detail=str(e))
