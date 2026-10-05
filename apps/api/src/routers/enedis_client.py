"""Enedis-like router for Client Mode

This router provides the same endpoints as the server mode's enedis router,
but uses a "local-first" strategy:
1. Check PostgreSQL for cached data
2. Identify missing date ranges
3. Only fetch missing data from MyElectricalData gateway
4. Combine and return results

This dramatically reduces API calls to the gateway while ensuring
the frontend can use the same API calls in both modes.
"""

import logging
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, Path, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..adapters.myelectricaldata import get_med_adapter
from ..middleware import get_current_user
from ..models import PDL, User
from ..models.database import get_db
from ..schemas import APIResponse, ErrorDetail
from ..adapters.enedis_format import address_v5_to_2026, build_measure, contract_v5_to_2026, extract_points, v5_to_2026
from ..services.local_data import (
    LocalDataService,
    format_daily_response,
    format_detail_response,
    parse_max_power_points,
)

logger = logging.getLogger(__name__)

# Bloc détaillé vide ou en erreur : pas de nouvel appel avant 12 h (périodes antérieures à la mise
# en service, PDL sans production). Les blocs récents, où Enedis publie encore, ne sont jamais mis
# en attente. Mémoire du process : perdue au redémarrage, propre à chaque worker.
DETAIL_CHUNK_BACKOFF = timedelta(hours=12)
DETAIL_CHUNK_RECENT_DAYS = 2
_detail_chunk_backoff: dict[str, datetime] = {}


def _chunk_in_backoff(key: str) -> bool:
    until = _detail_chunk_backoff.get(key)
    return until is not None and until > datetime.now()


def _backoff_chunk(key: str, chunk_end: date) -> None:
    if chunk_end <= date.today() - timedelta(days=DETAIL_CHUNK_RECENT_DAYS):
        _detail_chunk_backoff[key] = datetime.now() + DETAIL_CHUNK_BACKOFF

router = APIRouter(
    prefix="/enedis",
    tags=["Enedis Data (via Gateway)"],
    responses={
        401: {"description": "Unauthorized - Invalid or missing authentication"},
        403: {"description": "Forbidden - PDL does not belong to user"},
    },
)


async def verify_pdl_ownership(usage_point_id: str, user: User, db: AsyncSession) -> bool:
    """Verify that the PDL belongs to the current user and is active"""
    result = await db.execute(
        select(PDL).where(
            PDL.user_id == user.id,
            PDL.usage_point_id == usage_point_id,
            PDL.is_active == True  # noqa: E712
        )
    )
    pdl = result.scalar_one_or_none()
    return pdl is not None


def extract_gateway_data(response: dict) -> dict:
    """Extract data from gateway response.

    The gateway returns {"success": true, "data": {...}, ...}
    We need to extract just the inner "data" part to avoid double wrapping.
    """
    if isinstance(response, dict) and "data" in response:
        return response["data"]
    return response


def parse_date(date_str: str) -> date:
    """Parse date string to date object."""
    return datetime.strptime(date_str, "%Y-%m-%d").date()


def extract_readings_from_response(response: dict) -> list[dict]:
    """Points de mesure (format Data Connect 2026) d'une réponse de la passerelle.

    Accepte aussi une passerelle encore en v5 (meter_reading) : les lectures sont converties.
    """
    if not response:
        return []
    return extract_points(extract_gateway_data(response))


# =========================================================================
# Contract & Address
# =========================================================================


@router.get("/contract/{usage_point_id}", response_model=APIResponse)
async def get_contract(
    usage_point_id: str = Path(..., description="Point de livraison (14 chiffres)"),
    use_cache: bool = Query(True, description="Use cached data if available"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Get contract data - local-first strategy.

    1. Check local PostgreSQL cache
    2. If not found or use_cache=False, fetch from gateway
    3. Save to local cache for future requests
    """
    # Verify PDL ownership
    if not await verify_pdl_ownership(usage_point_id, current_user, db):
        return APIResponse(
            success=False,
            error=ErrorDetail(
                code="ACCESS_DENIED",
                message="Access denied: PDL not found or does not belong to you.",
            ),
        )

    local_service = LocalDataService(db)

    # Try local cache first
    if use_cache:
        cached_data = await local_service.get_contract(usage_point_id)
        if cached_data:
            logger.info(f"[{usage_point_id}] Contract served from local cache")
            return APIResponse(success=True, data=cached_data)

    # Fetch from gateway
    try:
        adapter = get_med_adapter()
        response = await adapter.get_contract(usage_point_id)
        data = contract_v5_to_2026(extract_gateway_data(response))

        # Save to local cache
        await local_service.save_contract(usage_point_id, data)
        logger.info(f"[{usage_point_id}] Contract fetched from gateway and cached")

        return APIResponse(success=True, data=data)
    except Exception as e:
        logger.error(f"[{usage_point_id}] Error fetching contract: {e}")
        return APIResponse(
            success=False,
            error=ErrorDetail(code="GATEWAY_ERROR", message=str(e)),
        )


@router.get("/address/{usage_point_id}", response_model=APIResponse)
async def get_address(
    usage_point_id: str = Path(..., description="Point de livraison (14 chiffres)"),
    use_cache: bool = Query(True, description="Use cached data if available"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Get address data - local-first strategy.

    1. Check local PostgreSQL cache
    2. If not found or use_cache=False, fetch from gateway
    3. Save to local cache for future requests
    """
    # Verify PDL ownership
    if not await verify_pdl_ownership(usage_point_id, current_user, db):
        return APIResponse(
            success=False,
            error=ErrorDetail(
                code="ACCESS_DENIED",
                message="Access denied: PDL not found or does not belong to you.",
            ),
        )

    local_service = LocalDataService(db)

    # Try local cache first
    if use_cache:
        cached_data = await local_service.get_address(usage_point_id)
        if cached_data:
            logger.info(f"[{usage_point_id}] Address served from local cache")
            return APIResponse(success=True, data=cached_data)

    # Fetch from gateway
    try:
        adapter = get_med_adapter()
        response = await adapter.get_address(usage_point_id)
        data = address_v5_to_2026(extract_gateway_data(response))

        # Save to local cache
        await local_service.save_address(usage_point_id, data)
        logger.info(f"[{usage_point_id}] Address fetched from gateway and cached")

        return APIResponse(success=True, data=data)
    except Exception as e:
        logger.error(f"[{usage_point_id}] Error fetching address: {e}")
        return APIResponse(
            success=False,
            error=ErrorDetail(code="GATEWAY_ERROR", message=str(e)),
        )


# =========================================================================
# Consumption Data
# =========================================================================


@router.get("/consumption/daily/{usage_point_id}", response_model=APIResponse)
async def get_consumption_daily(
    usage_point_id: str = Path(..., description="Point de livraison (14 chiffres)"),
    start: str = Query(..., description="Date de début (YYYY-MM-DD)"),
    end: str = Query(..., description="Date de fin (YYYY-MM-DD)"),
    use_cache: bool = Query(True, description="Use local cache and only fetch missing data"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Get daily consumption data - local-first strategy.

    1. Check local PostgreSQL for cached data in requested range
    2. Identify missing date ranges
    3. Only fetch missing data from gateway
    4. Combine and return all data
    """
    # Verify PDL ownership
    if not await verify_pdl_ownership(usage_point_id, current_user, db):
        return APIResponse(
            success=False,
            error=ErrorDetail(
                code="ACCESS_DENIED",
                message="Access denied: PDL not found or does not belong to you.",
            ),
        )

    try:
        start_date = parse_date(start)
        end_date = parse_date(end)
    except ValueError as e:
        return APIResponse(
            success=False,
            error=ErrorDetail(code="INVALID_DATE", message=str(e)),
        )

    local_service = LocalDataService(db)
    all_readings: list[dict] = []

    if use_cache:
        # Get local data and find missing ranges
        local_data, missing_ranges = await local_service.get_consumption_daily(
            usage_point_id, start_date, end_date
        )
        all_readings.extend(local_data)

        # If no missing ranges, return local data only
        if not missing_ranges:
            logger.info(
                f"[{usage_point_id}] Daily consumption fully served from local cache "
                f"({len(local_data)} records)"
            )
            return APIResponse(
                success=True,
                data=format_daily_response(usage_point_id, start, end, all_readings, from_cache=True),
            )

        # Fetch only missing ranges from gateway
        adapter = get_med_adapter()
        for range_start, range_end in missing_ranges:
            try:
                response = await adapter.get_consumption_daily(
                    usage_point_id,
                    range_start.isoformat(),
                    range_end.isoformat(),
                )
                gateway_readings = extract_readings_from_response(response)
                all_readings.extend(gateway_readings)
                logger.info(
                    f"[{usage_point_id}] Fetched {len(gateway_readings)} records from gateway "
                    f"for range {range_start} to {range_end}"
                )
            except Exception as e:
                logger.warning(
                    f"[{usage_point_id}] Failed to fetch {range_start} to {range_end}: {e}"
                )

        # Sort by date
        all_readings.sort(key=lambda x: x.get("d", ""))

        return APIResponse(
            success=True,
            data=format_daily_response(usage_point_id, start, end, all_readings, from_cache=False),
        )

    else:
        # Force fetch from gateway (no cache)
        try:
            adapter = get_med_adapter()
            response = await adapter.get_consumption_daily(usage_point_id, start, end)
            data = v5_to_2026(extract_gateway_data(response), grandeur_metier="CONS", grandeur_physique="EA", pas="P1D")
            logger.info(f"[{usage_point_id}] Daily consumption fetched from gateway (cache disabled)")
            return APIResponse(success=True, data=data)
        except Exception as e:
            logger.error(f"[{usage_point_id}] Error fetching daily consumption: {e}")
            return APIResponse(
                success=False,
                error=ErrorDetail(code="GATEWAY_ERROR", message=str(e)),
            )


@router.get("/consumption/detail/{usage_point_id}", response_model=APIResponse)
async def get_consumption_detail(
    usage_point_id: str = Path(..., description="Point de livraison (14 chiffres)"),
    start: str = Query(..., description="Date de début (YYYY-MM-DD)"),
    end: str = Query(..., description="Date de fin (YYYY-MM-DD)"),
    use_cache: bool = Query(True, description="Use local cache and only fetch missing data"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Get detailed consumption data (30-min intervals) - local-first strategy.

    1. Check local PostgreSQL for cached data in requested range
    2. Identify missing date ranges
    3. Only fetch missing data from gateway
    4. Combine and return all data
    """
    # Verify PDL ownership
    if not await verify_pdl_ownership(usage_point_id, current_user, db):
        return APIResponse(
            success=False,
            error=ErrorDetail(
                code="ACCESS_DENIED",
                message="Access denied: PDL not found or does not belong to you.",
            ),
        )

    try:
        start_date = parse_date(start)
        end_date = parse_date(end)
    except ValueError as e:
        return APIResponse(
            success=False,
            error=ErrorDetail(code="INVALID_DATE", message=str(e)),
        )

    local_service = LocalDataService(db)
    all_readings: list[dict] = []

    if use_cache:
        # Get local data and find missing ranges
        local_data, missing_ranges = await local_service.get_consumption_detail(
            usage_point_id, start_date, end_date
        )
        all_readings.extend(local_data)

        # If no missing ranges, return local data only
        if not missing_ranges:
            logger.info(
                f"[{usage_point_id}] Detailed consumption fully served from local cache "
                f"({len(local_data)} records)"
            )
            return APIResponse(
                success=True,
                data=format_detail_response(usage_point_id, start, end, all_readings, from_cache=True),
            )

        # Fetch only missing ranges from gateway
        adapter = get_med_adapter()
        for range_start, range_end in missing_ranges:
            try:
                response = await adapter.get_consumption_detail(
                    usage_point_id,
                    range_start.isoformat(),
                    range_end.isoformat(),
                )
                gateway_readings = extract_readings_from_response(response)
                all_readings.extend(gateway_readings)
                logger.info(
                    f"[{usage_point_id}] Fetched {len(gateway_readings)} detail records from gateway "
                    f"for range {range_start} to {range_end}"
                )
            except Exception as e:
                logger.warning(
                    f"[{usage_point_id}] Failed to fetch detail {range_start} to {range_end}: {e}"
                )

        # Sort by date
        all_readings.sort(key=lambda x: x.get("d", ""))

        return APIResponse(
            success=True,
            data=format_detail_response(usage_point_id, start, end, all_readings, from_cache=False),
        )

    else:
        # Force fetch from gateway (no cache)
        try:
            adapter = get_med_adapter()
            response = await adapter.get_consumption_detail(usage_point_id, start, end)
            data = v5_to_2026(extract_gateway_data(response), grandeur_metier="CONS", grandeur_physique="PA")
            logger.info(f"[{usage_point_id}] Detailed consumption fetched from gateway (cache disabled)")
            return APIResponse(success=True, data=data)
        except Exception as e:
            logger.error(f"[{usage_point_id}] Error fetching detailed consumption: {e}")
            return APIResponse(
                success=False,
                error=ErrorDetail(code="GATEWAY_ERROR", message=str(e)),
            )


async def _max_power_data(
    db: AsyncSession, usage_point_id: str, start: str, end: str, use_cache: bool
) -> dict:
    """Puissance max quotidienne : base locale d'abord, passerelle pour les seuls jours manquants."""
    adapter = get_med_adapter()
    if not use_cache:
        response = await adapter.get_consumption_max_power(usage_point_id, start, end)
        return v5_to_2026(extract_gateway_data(response), grandeur_metier="CONS", grandeur_physique="PMA", pas="P1D")

    start_date, end_date = parse_date(start), parse_date(end)
    local_service = LocalDataService(db)
    points, missing_ranges = await local_service.get_max_power(usage_point_id, start_date, end_date)

    if missing_ranges:
        for range_start, range_end in missing_ranges:
            try:
                response = await adapter.get_consumption_max_power(
                    usage_point_id, range_start.isoformat(), range_end.isoformat()
                )
                await local_service.save_max_power(parse_max_power_points(response, usage_point_id))
            except Exception as e:
                logger.warning(f"[{usage_point_id}] Max power {range_start} - {range_end} échoué: {e}")
        points, _ = await local_service.get_max_power(usage_point_id, start_date, end_date)

    return build_measure(
        usage_point_id, start, end, points,
        grandeur_metier="CONS", grandeur_physique="PMA", unite="VA", pas="P1D",
    )


@router.get("/consumption/max_power/{usage_point_id}", response_model=APIResponse)
async def get_max_power(
    usage_point_id: str = Path(..., description="Point de livraison (14 chiffres)"),
    start: str = Query(..., description="Date de début (YYYY-MM-DD)"),
    end: str = Query(..., description="Date de fin (YYYY-MM-DD)"),
    use_cache: bool = Query(True, description="Use local cache and only fetch missing days"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Get daily maximum power data via MyElectricalData gateway"""
    # Verify PDL ownership
    if not await verify_pdl_ownership(usage_point_id, current_user, db):
        return APIResponse(
            success=False,
            error=ErrorDetail(
                code="ACCESS_DENIED",
                message="Access denied: PDL not found or does not belong to you.",
            ),
        )

    try:
        data = await _max_power_data(db, usage_point_id, start, end, use_cache)
        return APIResponse(success=True, data=data)
    except Exception as e:
        logger.error(f"[{usage_point_id}] Error fetching max power: {e}")
        return APIResponse(
            success=False,
            error=ErrorDetail(code="GATEWAY_ERROR", message=str(e)),
        )


# =========================================================================
# Production Data
# =========================================================================


@router.get("/production/daily/{usage_point_id}", response_model=APIResponse)
async def get_production_daily(
    usage_point_id: str = Path(..., description="Point de livraison (14 chiffres)"),
    start: str = Query(..., description="Date de début (YYYY-MM-DD)"),
    end: str = Query(..., description="Date de fin (YYYY-MM-DD)"),
    use_cache: bool = Query(True, description="Use local cache and only fetch missing data"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Get daily production data - local-first strategy.

    1. Check local PostgreSQL for cached data in requested range
    2. Identify missing date ranges
    3. Only fetch missing data from gateway
    4. Combine and return all data
    """
    # Verify PDL ownership
    if not await verify_pdl_ownership(usage_point_id, current_user, db):
        return APIResponse(
            success=False,
            error=ErrorDetail(
                code="ACCESS_DENIED",
                message="Access denied: PDL not found or does not belong to you.",
            ),
        )

    try:
        start_date = parse_date(start)
        end_date = parse_date(end)
    except ValueError as e:
        return APIResponse(
            success=False,
            error=ErrorDetail(code="INVALID_DATE", message=str(e)),
        )

    local_service = LocalDataService(db)
    all_readings: list[dict] = []

    if use_cache:
        # Get local data and find missing ranges
        local_data, missing_ranges = await local_service.get_production_daily(
            usage_point_id, start_date, end_date
        )
        all_readings.extend(local_data)

        # If no missing ranges, return local data only
        if not missing_ranges:
            logger.info(
                f"[{usage_point_id}] Daily production fully served from local cache "
                f"({len(local_data)} records)"
            )
            return APIResponse(
                success=True,
                data=format_daily_response(usage_point_id, start, end, all_readings, from_cache=True, grandeur_metier="PROD"),
            )

        # Fetch only missing ranges from gateway
        adapter = get_med_adapter()
        for range_start, range_end in missing_ranges:
            try:
                response = await adapter.get_production_daily(
                    usage_point_id,
                    range_start.isoformat(),
                    range_end.isoformat(),
                )
                gateway_readings = extract_readings_from_response(response)
                all_readings.extend(gateway_readings)
                logger.info(
                    f"[{usage_point_id}] Fetched {len(gateway_readings)} production records from gateway "
                    f"for range {range_start} to {range_end}"
                )
            except Exception as e:
                logger.warning(
                    f"[{usage_point_id}] Failed to fetch production {range_start} to {range_end}: {e}"
                )

        # Sort by date
        all_readings.sort(key=lambda x: x.get("d", ""))

        return APIResponse(
            success=True,
            data=format_daily_response(usage_point_id, start, end, all_readings, from_cache=False, grandeur_metier="PROD"),
        )

    else:
        # Force fetch from gateway (no cache)
        try:
            adapter = get_med_adapter()
            response = await adapter.get_production_daily(usage_point_id, start, end)
            data = v5_to_2026(extract_gateway_data(response), grandeur_metier="PROD", grandeur_physique="EA", pas="P1D")
            logger.info(f"[{usage_point_id}] Daily production fetched from gateway (cache disabled)")
            return APIResponse(success=True, data=data)
        except Exception as e:
            logger.error(f"[{usage_point_id}] Error fetching daily production: {e}")
            return APIResponse(
                success=False,
                error=ErrorDetail(code="GATEWAY_ERROR", message=str(e)),
            )


@router.get("/production/detail/{usage_point_id}", response_model=APIResponse)
async def get_production_detail(
    usage_point_id: str = Path(..., description="Point de livraison (14 chiffres)"),
    start: str = Query(..., description="Date de début (YYYY-MM-DD)"),
    end: str = Query(..., description="Date de fin (YYYY-MM-DD)"),
    use_cache: bool = Query(True, description="Use local cache and only fetch missing data"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Get detailed production data (30-min intervals) - local-first strategy.

    1. Check local PostgreSQL for cached data in requested range
    2. Identify missing date ranges
    3. Only fetch missing data from gateway
    4. Combine and return all data
    """
    # Verify PDL ownership
    if not await verify_pdl_ownership(usage_point_id, current_user, db):
        return APIResponse(
            success=False,
            error=ErrorDetail(
                code="ACCESS_DENIED",
                message="Access denied: PDL not found or does not belong to you.",
            ),
        )

    try:
        start_date = parse_date(start)
        end_date = parse_date(end)
    except ValueError as e:
        return APIResponse(
            success=False,
            error=ErrorDetail(code="INVALID_DATE", message=str(e)),
        )

    local_service = LocalDataService(db)
    all_readings: list[dict] = []

    if use_cache:
        # Get local data and find missing ranges
        local_data, missing_ranges = await local_service.get_production_detail(
            usage_point_id, start_date, end_date
        )
        all_readings.extend(local_data)

        # If no missing ranges, return local data only
        if not missing_ranges:
            logger.info(
                f"[{usage_point_id}] Detailed production fully served from local cache "
                f"({len(local_data)} records)"
            )
            return APIResponse(
                success=True,
                data=format_detail_response(usage_point_id, start, end, all_readings, from_cache=True, grandeur_metier="PROD"),
            )

        # Fetch only missing ranges from gateway
        adapter = get_med_adapter()
        for range_start, range_end in missing_ranges:
            try:
                response = await adapter.get_production_detail(
                    usage_point_id,
                    range_start.isoformat(),
                    range_end.isoformat(),
                )
                gateway_readings = extract_readings_from_response(response)
                all_readings.extend(gateway_readings)
                logger.info(
                    f"[{usage_point_id}] Fetched {len(gateway_readings)} production detail records "
                    f"from gateway for range {range_start} to {range_end}"
                )
            except Exception as e:
                logger.warning(
                    f"[{usage_point_id}] Failed to fetch production detail {range_start} to {range_end}: {e}"
                )

        # Sort by date
        all_readings.sort(key=lambda x: x.get("d", ""))

        return APIResponse(
            success=True,
            data=format_detail_response(usage_point_id, start, end, all_readings, from_cache=False, grandeur_metier="PROD"),
        )

    else:
        # Force fetch from gateway (no cache)
        try:
            adapter = get_med_adapter()
            response = await adapter.get_production_detail(usage_point_id, start, end)
            data = v5_to_2026(extract_gateway_data(response), grandeur_metier="PROD", grandeur_physique="PA")
            logger.info(f"[{usage_point_id}] Detailed production fetched from gateway (cache disabled)")
            return APIResponse(success=True, data=data)
        except Exception as e:
            logger.error(f"[{usage_point_id}] Error fetching detailed production: {e}")
            return APIResponse(
                success=False,
                error=ErrorDetail(code="GATEWAY_ERROR", message=str(e)),
            )


# =========================================================================
# Power (Max Power) - Alias for frontend compatibility
# =========================================================================


@router.get("/power/{usage_point_id}", response_model=APIResponse)
async def get_power(
    usage_point_id: str = Path(..., description="Point de livraison (14 chiffres)"),
    start: str = Query(..., description="Date de début (YYYY-MM-DD)"),
    end: str = Query(..., description="Date de fin (YYYY-MM-DD)"),
    use_cache: bool = Query(True, description="Use local cache and only fetch missing days"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Get daily maximum power data via MyElectricalData gateway"""
    # Verify PDL ownership
    if not await verify_pdl_ownership(usage_point_id, current_user, db):
        return APIResponse(
            success=False,
            error=ErrorDetail(
                code="ACCESS_DENIED",
                message="Access denied: PDL not found or does not belong to you.",
            ),
        )

    try:
        data = await _max_power_data(db, usage_point_id, start, end, use_cache)
        return APIResponse(success=True, data=data)
    except Exception as e:
        logger.error(f"[{usage_point_id}] Error fetching max power: {e}")
        return APIResponse(
            success=False,
            error=ErrorDetail(code="GATEWAY_ERROR", message=str(e)),
        )


# =========================================================================
# Batch Endpoints - Fetch data in chunks (7 days for detailed data)
# =========================================================================


@router.get("/consumption/detail/batch/{usage_point_id}", response_model=APIResponse)
async def get_consumption_detail_batch(
    usage_point_id: str = Path(..., description="Point de livraison (14 chiffres)"),
    start: str = Query(..., description="Date de début (YYYY-MM-DD)"),
    end: str = Query(..., description="Date de fin (YYYY-MM-DD)"),
    use_cache: bool = Query(True, description="Utiliser le cache local et ne fetcher que les données manquantes"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Get detailed consumption data in batch (handles long date ranges)

    Stratégie local-first : consulte la base locale, identifie les trous,
    et ne fetch que les plages manquantes depuis la passerelle.
    """
    # Verify PDL ownership
    if not await verify_pdl_ownership(usage_point_id, current_user, db):
        return APIResponse(
            success=False,
            error=ErrorDetail(
                code="ACCESS_DENIED",
                message="Access denied: PDL not found or does not belong to you.",
            ),
        )

    try:
        start_date = parse_date(start)
        end_date = parse_date(end)
    except ValueError as e:
        return APIResponse(
            success=False,
            error=ErrorDetail(code="INVALID_DATE", message=str(e)),
        )

    try:
        local_service = LocalDataService(db)
        all_readings: list[dict] = []

        if use_cache:
            # Récupérer les données locales et les plages manquantes
            local_data, missing_ranges = await local_service.get_consumption_detail(
                usage_point_id, start_date, end_date
            )
            all_readings.extend(local_data)

            if not missing_ranges:
                logger.info(
                    f"[{usage_point_id}] Batch detail consumption servi depuis le cache local "
                    f"({len(local_data)} enregistrements)"
                )
                return APIResponse(
                    success=True,
                    data=format_detail_response(usage_point_id, start, end, all_readings, from_cache=True),
                )

            # Fetcher uniquement les plages manquantes en chunks de 7 jours
            adapter = get_med_adapter()
            for range_start, range_end in missing_ranges:
                current_start = range_start
                while current_start < range_end:
                    chunk_end = min(current_start + timedelta(days=7), range_end)
                    backoff_key = f"consumption:{usage_point_id}:{current_start}:{chunk_end}"
                    if _chunk_in_backoff(backoff_key):
                        current_start = chunk_end
                        continue
                    try:
                        response = await adapter.get_consumption_detail(
                            usage_point_id,
                            current_start.isoformat(),
                            chunk_end.isoformat(),
                        )
                        gateway_readings = extract_readings_from_response(response)
                        if not gateway_readings:
                            _backoff_chunk(backoff_key, chunk_end)
                        all_readings.extend(gateway_readings)
                    except Exception as chunk_error:
                        _backoff_chunk(backoff_key, chunk_end)
                        logger.warning(
                            f"[{usage_point_id}] Chunk {current_start} - {chunk_end} échoué: {chunk_error}"
                        )
                    current_start = chunk_end

            logger.info(
                f"[{usage_point_id}] Batch detail consumption: {len(local_data)} local + "
                f"{len(all_readings) - len(local_data)} gateway ({len(missing_ranges)} plages manquantes)"
            )

        else:
            # Force fetch sans cache
            adapter = get_med_adapter()
            current_start = start_date
            while current_start < end_date:
                chunk_end = min(current_start + timedelta(days=7), end_date)
                try:
                    response = await adapter.get_consumption_detail(
                        usage_point_id,
                        current_start.isoformat(),
                        chunk_end.isoformat(),
                    )
                    gateway_readings = extract_readings_from_response(response)
                    all_readings.extend(gateway_readings)
                except Exception as chunk_error:
                    logger.warning(
                        f"[{usage_point_id}] Chunk {current_start} - {chunk_end} échoué: {chunk_error}"
                    )
                current_start = chunk_end

        # Trier par date
        all_readings.sort(key=lambda x: x.get("d", ""))

        return APIResponse(
            success=True,
            data=format_detail_response(usage_point_id, start, end, all_readings, from_cache=False),
        )

    except Exception as e:
        logger.error(f"[{usage_point_id}] Erreur batch consumption detail: {e}")
        return APIResponse(
            success=False,
            error=ErrorDetail(code="GATEWAY_ERROR", message=str(e)),
        )


@router.get("/production/detail/batch/{usage_point_id}", response_model=APIResponse)
async def get_production_detail_batch(
    usage_point_id: str = Path(..., description="Point de livraison (14 chiffres)"),
    start: str = Query(..., description="Date de début (YYYY-MM-DD)"),
    end: str = Query(..., description="Date de fin (YYYY-MM-DD)"),
    use_cache: bool = Query(True, description="Utiliser le cache local et ne fetcher que les données manquantes"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Get detailed production data in batch (handles long date ranges)

    Stratégie local-first : consulte la base locale, identifie les trous,
    et ne fetch que les plages manquantes depuis la passerelle.
    """
    # Verify PDL ownership
    if not await verify_pdl_ownership(usage_point_id, current_user, db):
        return APIResponse(
            success=False,
            error=ErrorDetail(
                code="ACCESS_DENIED",
                message="Access denied: PDL not found or does not belong to you.",
            ),
        )

    try:
        start_date = parse_date(start)
        end_date = parse_date(end)
    except ValueError as e:
        return APIResponse(
            success=False,
            error=ErrorDetail(code="INVALID_DATE", message=str(e)),
        )

    try:
        local_service = LocalDataService(db)
        all_readings: list[dict] = []

        if use_cache:
            # Récupérer les données locales et les plages manquantes
            local_data, missing_ranges = await local_service.get_production_detail(
                usage_point_id, start_date, end_date
            )
            all_readings.extend(local_data)

            if not missing_ranges:
                logger.info(
                    f"[{usage_point_id}] Batch detail production servi depuis le cache local "
                    f"({len(local_data)} enregistrements)"
                )
                return APIResponse(
                    success=True,
                    data=format_detail_response(usage_point_id, start, end, all_readings, from_cache=True, grandeur_metier="PROD"),
                )

            # Fetcher uniquement les plages manquantes en chunks de 7 jours
            adapter = get_med_adapter()
            for range_start, range_end in missing_ranges:
                current_start = range_start
                while current_start < range_end:
                    chunk_end = min(current_start + timedelta(days=7), range_end)
                    backoff_key = f"production:{usage_point_id}:{current_start}:{chunk_end}"
                    if _chunk_in_backoff(backoff_key):
                        current_start = chunk_end
                        continue
                    try:
                        response = await adapter.get_production_detail(
                            usage_point_id,
                            current_start.isoformat(),
                            chunk_end.isoformat(),
                        )
                        gateway_readings = extract_readings_from_response(response)
                        if not gateway_readings:
                            _backoff_chunk(backoff_key, chunk_end)
                        all_readings.extend(gateway_readings)
                    except Exception as chunk_error:
                        _backoff_chunk(backoff_key, chunk_end)
                        logger.warning(
                            f"[{usage_point_id}] Chunk {current_start} - {chunk_end} échoué: {chunk_error}"
                        )
                    current_start = chunk_end

            logger.info(
                f"[{usage_point_id}] Batch detail production: {len(local_data)} local + "
                f"{len(all_readings) - len(local_data)} gateway ({len(missing_ranges)} plages manquantes)"
            )

        else:
            # Force fetch sans cache
            adapter = get_med_adapter()
            current_start = start_date
            while current_start < end_date:
                chunk_end = min(current_start + timedelta(days=7), end_date)
                try:
                    response = await adapter.get_production_detail(
                        usage_point_id,
                        current_start.isoformat(),
                        chunk_end.isoformat(),
                    )
                    gateway_readings = extract_readings_from_response(response)
                    all_readings.extend(gateway_readings)
                except Exception as chunk_error:
                    logger.warning(
                        f"[{usage_point_id}] Chunk {current_start} - {chunk_end} échoué: {chunk_error}"
                    )
                current_start = chunk_end

        # Trier par date
        all_readings.sort(key=lambda x: x.get("d", ""))

        return APIResponse(
            success=True,
            data=format_detail_response(usage_point_id, start, end, all_readings, from_cache=False, grandeur_metier="PROD"),
        )

    except Exception as e:
        logger.error(f"[{usage_point_id}] Erreur batch production detail: {e}")
        return APIResponse(
            success=False,
            error=ErrorDetail(code="GATEWAY_ERROR", message=str(e)),
        )
