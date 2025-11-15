from datetime import datetime, UTC, timedelta
from fastapi import APIRouter, Depends, Query, HTTPException, status, Request, Path
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from ..models import User, Token, PDL
from ..models.database import get_db
from ..schemas import APIResponse, ErrorDetail, CacheDeleteResponse
from ..middleware import get_current_user
from ..adapters import enedis_adapter
from ..adapters.demo_adapter import demo_adapter
from ..services import cache_service, rate_limiter
import logging


logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/enedis",
    tags=["Enedis Data"],
    responses={
        401: {"description": "Unauthorized - Invalid or missing authentication"},
        403: {"description": "Forbidden - PDL does not belong to user"},
        429: {"description": "Rate limit exceeded"},
    },
)


async def get_adapter_for_user(user: User):
    """
    Get the appropriate adapter (demo or enedis) based on user.
    Returns (adapter, is_demo) tuple.
    """
    is_demo = await demo_adapter.is_demo_user(user.email)
    if is_demo:
        logger.info(f"[DEMO MODE] Using demo adapter for user {user.email}")
        return demo_adapter, True
    return enedis_adapter, False


async def verify_pdl_ownership(usage_point_id: str, user: User, db: AsyncSession) -> bool:
    """Verify that the PDL belongs to the current user"""
    result = await db.execute(
        select(PDL).where(PDL.user_id == user.id, PDL.usage_point_id == usage_point_id)
    )
    pdl = result.scalar_one_or_none()
    return pdl is not None


def adjust_date_range(start: str, end: str) -> tuple[str, str]:
    """
    Adjust date range to ensure it's valid for Enedis API:
    1. Cap end date to today if it's in the future
    2. If start == end, move start to 1 day before
    Returns (adjusted_start, adjusted_end) as strings (YYYY-MM-DD).
    """
    try:
        start_date = datetime.strptime(start, "%Y-%m-%d")
        end_date = datetime.strptime(end, "%Y-%m-%d")
        today = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0, tzinfo=None)

        # 1. Cap end date to today if it's in the future
        if end_date > today:
            logger.info(f"[DATE ADJUST] End date {end} is in the future, capping to today {today.strftime('%Y-%m-%d')}")
            end_date = today

        # 2. If start == end, move start to 1 day before
        if start_date >= end_date:
            adjusted_start = end_date - timedelta(days=1)
            logger.info(f"[DATE ADJUST] Start date {start} is >= end date {end_date.strftime('%Y-%m-%d')}, moving start to 1 day before: {adjusted_start.strftime('%Y-%m-%d')}")
            start_date = adjusted_start

        return start_date.strftime("%Y-%m-%d"), end_date.strftime("%Y-%m-%d")
    except ValueError:
        # If date format is invalid, return as-is (will be caught by validate_date_range)
        return start, end


def validate_date_range(start: str, end: str, max_years: int, endpoint_type: str) -> tuple[bool, APIResponse | None]:
    """
    Validate that the date range is not too old.
    - /daily endpoint: max 3 years
    - /detail endpoint: max 2 years
    Returns (is_valid, error_response_or_none)
    """
    try:
        start_date = datetime.strptime(start, "%Y-%m-%d")
        end_date = datetime.strptime(end, "%Y-%m-%d")
        now = datetime.now(UTC).replace(tzinfo=None)

        # Check if start date is too old - use replace to subtract years correctly (handles leap years)
        oldest_allowed = now.replace(year=now.year - max_years, hour=0, minute=0, second=0, microsecond=0)

        if start_date < oldest_allowed:
            error_response = APIResponse(
                success=False,
                error=ErrorDetail(
                    code="DATE_TOO_OLD",
                    message=f"Start date is too old. {endpoint_type} endpoint only supports data up to {max_years} years old. Oldest allowed date: {oldest_allowed.strftime('%Y-%m-%d')}"
                )
            )
            return False, error_response

        # Check if dates are in correct order
        if start_date > end_date:
            error_response = APIResponse(
                success=False,
                error=ErrorDetail(
                    code="INVALID_DATE_RANGE",
                    message="Start date must be before or equal to end date"
                )
            )
            return False, error_response

        return True, None
    except ValueError as e:
        error_response = APIResponse(
            success=False,
            error=ErrorDetail(
                code="INVALID_DATE_FORMAT",
                message=f"Invalid date format. Expected YYYY-MM-DD. Error: {str(e)}"
            )
        )
        return False, error_response


async def check_rate_limit(user_id: str, use_cache: bool, is_admin: bool = False, endpoint: str = None) -> tuple[bool, APIResponse | None]:
    """
    Check rate limit for user. Returns (is_allowed, error_response_or_none)
    """
    is_allowed, current_count, limit = await rate_limiter.increment_and_check(user_id, use_cache, is_admin, endpoint)
    if not is_allowed:
        error_response = APIResponse(
            success=False,
            error=ErrorDetail(
                code="RATE_LIMIT_EXCEEDED",
                message=f"Daily rate limit exceeded ({current_count}/{limit}). {'Use cache to increase limit.' if not use_cache else 'Try again tomorrow.'}"
            )
        )
        return False, error_response
    return True, None


async def get_valid_token(usage_point_id: str, user: User, db: AsyncSession) -> str | None:
    """Get valid Client Credentials token for Enedis API. Returns access_token string."""
    # Skip token validation for demo users
    if await demo_adapter.is_demo_user(user.email):
        logger.info(f"[DEMO MODE] Skipping token validation for demo user {user.email}")
        # Still verify PDL ownership
        if not await verify_pdl_ownership(usage_point_id, user, db):
            return None
        return "demo_token"  # Return dummy token for demo users

    # First, verify PDL ownership
    if not await verify_pdl_ownership(usage_point_id, user, db):
        return None

    # Get global client credentials token (stored with user_id=None, usage_point_id='__global__')
    result = await db.execute(
        select(Token).where(Token.user_id == None, Token.usage_point_id == "__global__").limit(1)
    )
    token = result.scalar_one_or_none()

    # Check if token exists and is expired
    now_utc = datetime.now(UTC)
    token_expired = False

    if token:
        token_expires = token.expires_at.replace(tzinfo=UTC) if token.expires_at.tzinfo is None else token.expires_at
        token_expired = token_expires <= now_utc

    # If no token exists or token is expired, get new client credentials token
    if not token or token_expired:
        try:
            from datetime import timedelta
            from sqlalchemy.exc import IntegrityError

            # Get new client credentials token
            token_data = await enedis_adapter.get_client_credentials_token()
            expires_in = token_data.get("expires_in", 3600)
            access_token = token_data["access_token"]
            expires_at = datetime.now(UTC) + timedelta(seconds=expires_in)

            if token:
                # Update existing token
                token.access_token = access_token
                token.refresh_token = None
                token.token_type = "Bearer"
                token.expires_at = expires_at
                token.scope = token_data.get("scope")
                await db.commit()
                await db.refresh(token)
            else:
                # Create new global token
                token = Token(
                    user_id=None,  # Global token, not user-specific
                    usage_point_id="__global__",
                    access_token=access_token,
                    refresh_token=None,
                    token_type="Bearer",
                    expires_at=expires_at,
                    scope=token_data.get("scope"),
                )
                db.add(token)

                try:
                    await db.commit()
                    await db.refresh(token)
                except IntegrityError:
                    # Race condition: another request created the token
                    await db.rollback()
                    # Re-fetch the token that was just created by the other request
                    result = await db.execute(
                        select(Token).where(Token.user_id == None, Token.usage_point_id == "__global__").limit(1)
                    )
                    token = result.scalar_one_or_none()
                    if not token:
                        logger.error(f"[TOKEN ERROR] Failed to fetch token after race condition")
                        return None
        except Exception as e:
            logger.error(f"[TOKEN ERROR] Failed to get client credentials token: {str(e)}")
            import traceback
            traceback.print_exc()
            return None

    return token.access_token


# Metering endpoints
@router.get("/consumption/daily/{usage_point_id}", response_model=APIResponse)
async def get_consumption_daily(
    request: Request,
    usage_point_id: str = Path(
        ...,
        description="Point de livraison (14 chiffres). 💡 **Astuce**: Utilisez d'abord `GET /pdl/` pour lister vos PDL disponibles.",
        openapi_examples={
            "standard_pdl": {
                "summary": "PDL Standard",
                "description": "Un identifiant PDL typique à 14 chiffres",
                "value": "12345678901234"
            },
            "test_pdl": {
                "summary": "PDL Test",
                "description": "PDL de test pour le développement",
                "value": "00000000000000"
            }
        }
    ),
    start: str = Query(
        ...,
        description="Start date (YYYY-MM-DD)",
        openapi_examples={
            "current_year": {
                "summary": "Start of 2024",
                "value": "2024-01-01"
            },
            "recent_month": {
                "summary": "Start of current month",
                "value": "2024-10-01"
            }
        }
    ),
    end: str = Query(
        ...,
        description="End date (YYYY-MM-DD)",
        openapi_examples={
            "current_year": {
                "summary": "End of 2024",
                "value": "2024-12-31"
            },
            "recent_month": {
                "summary": "End of current month",
                "value": "2024-10-31"
            }
        }
    ),
    use_cache: bool = Query(
        False,
        description="Use cached data if available",
        openapi_examples={
            "with_cache": {
                "summary": "Use cache",
                "description": "Retrieve from cache if available (recommended)",
                "value": True
            },
            "without_cache": {
                "summary": "Fresh data",
                "description": "Fetch fresh data from Enedis API",
                "value": False
            }
        }
    ),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Get daily consumption data (max 3 years history)"""

    # Adjust date range: cap end date to today and ensure start is before end
    start, end = adjust_date_range(start, end)

    # Check if date range is within allowed period (3 years for daily endpoint)
    is_valid, error_response = validate_date_range(start, end, max_years=3, endpoint_type="Daily")
    dates_too_old = not is_valid and error_response.error.code == "DATE_TOO_OLD"

    # If dates are too old, we can only serve from cache
    if dates_too_old:
        # Try to serve from cache only
        cache_key = f"consumption:daily:{usage_point_id}:{start}:{end}"
        cached_data = await cache_service.get(cache_key, current_user.client_secret)

        if cached_data:
            logger.info(f"[CACHE] Serving old data from cache for {usage_point_id} ({start} to {end})")
            return APIResponse(success=True, data=cached_data)
        else:
            # No cache available for old data
            return error_response

    # Check if user is demo - skip token validation for demo users
    _, is_demo = await get_adapter_for_user(current_user)
    access_token = None

    if not is_demo:
        access_token = await get_valid_token(usage_point_id, current_user, db)
        if not access_token:
            return APIResponse(
                success=False,
                error=ErrorDetail(
                    code="ACCESS_DENIED",
                    message="Access denied: PDL not found or no valid token. Please verify PDL ownership and consent."
                )
            )

    # Check rate limit - use route path template instead of actual path
    endpoint_path = request.scope.get("route").path if request.scope.get("route") else request.url.path
    is_allowed, error_response = await check_rate_limit(current_user.id, use_cache, current_user.is_admin, endpoint_path)
    if not is_allowed:
        return error_response

    # New granular cache system: check cache day by day
    from datetime import datetime, timedelta

    all_readings = []
    missing_dates = []

    if use_cache:
        # Generate list of dates to check
        start_date = datetime.strptime(start, "%Y-%m-%d")
        end_date = datetime.strptime(end, "%Y-%m-%d")
        current_date = start_date

        while current_date <= end_date:
            date_str = current_date.strftime("%Y-%m-%d")
            cache_key = f"consumption:daily:{usage_point_id}:{date_str}"
            cached_reading = await cache_service.get(cache_key, current_user.client_secret)

            if cached_reading:
                all_readings.append(cached_reading)
                logger.info(f"[CACHE HIT] Daily data for {usage_point_id} on {date_str}")
            else:
                missing_dates.append(date_str)
                logger.info(f"[CACHE MISS] Daily data for {usage_point_id} on {date_str}")

            current_date += timedelta(days=1)

        # If we have all data from cache, return it
        if not missing_dates:
            logger.info(f"[CACHE] All daily data served from cache for {usage_point_id} ({start} to {end})")
            # Get reading_type from cache or default
            reading_type_cache_key = f"consumption:reading_type:{usage_point_id}"
            reading_type = await cache_service.get(reading_type_cache_key, current_user.client_secret)
            if not reading_type:
                reading_type = {"unit": "W", "measurement_kind": "power"}
            return APIResponse(success=True, data={"meter_reading": {"interval_reading": all_readings, "reading_type": reading_type}})
    else:
        # Not using cache, need to fetch all dates
        start_date = datetime.strptime(start, "%Y-%m-%d")
        end_date = datetime.strptime(end, "%Y-%m-%d")
        current_date = start_date
        while current_date <= end_date:
            missing_dates.append(current_date.strftime("%Y-%m-%d"))
            current_date += timedelta(days=1)

    # Fetch missing data from Enedis only if there are missing dates
    reading_type = None
    if missing_dates:
        # Group missing dates into continuous ranges to minimize API calls
        date_ranges = []
        if missing_dates:
            missing_dates.sort()
            range_start = missing_dates[0]
            range_end = missing_dates[0]

            for i in range(1, len(missing_dates)):
                prev_date = datetime.strptime(missing_dates[i-1], "%Y-%m-%d")
                curr_date = datetime.strptime(missing_dates[i], "%Y-%m-%d")

                # Check if dates are consecutive (1 day apart)
                if (curr_date - prev_date).days == 1:
                    range_end = missing_dates[i]
                else:
                    # Save current range and start new one
                    date_ranges.append((range_start, range_end))
                    range_start = missing_dates[i]
                    range_end = missing_dates[i]

            # Add the last range
            date_ranges.append((range_start, range_end))

        logger.info(f"[API CALL] Fetching {len(missing_dates)} missing dates in {len(date_ranges)} API call(s)")

        # Fetch each range from Enedis
        api_errors = []
        for range_start, range_end in date_ranges:
            try:
                # Enedis API requires minimum 2 days range
                # If range is a single day, extend to previous day
                start_date_obj = datetime.strptime(range_start, "%Y-%m-%d")
                end_date_obj = datetime.strptime(range_end, "%Y-%m-%d")

                if start_date_obj == end_date_obj:
                    # Single day request, extend to include previous day
                    adjusted_start = (start_date_obj - timedelta(days=1)).strftime("%Y-%m-%d")
                    logger.info(f"[API CALL] Single day detected, extending range: {adjusted_start} to {range_end}")
                    api_start = adjusted_start
                    api_end = range_end
                else:
                    api_start = range_start
                    api_end = range_end

                logger.info(f"[API CALL] Fetching data from {api_start} to {api_end}")

                # Use appropriate adapter based on user type
                adapter, is_demo = await get_adapter_for_user(current_user)
                if is_demo:
                    # Demo adapter uses client_secret instead of access_token
                    data = await adapter.get_consumption_daily(usage_point_id, api_start, api_end, current_user.client_secret)
                else:
                    data = await adapter.get_consumption_daily(usage_point_id, api_start, api_end, access_token)

                # Extract readings and reading_type from response
                fetched_readings = []
                if isinstance(data, dict):
                    if "meter_reading" in data:
                        if "interval_reading" in data["meter_reading"]:
                            fetched_readings = data["meter_reading"]["interval_reading"]
                        if "reading_type" in data["meter_reading"]:
                            reading_type = data["meter_reading"]["reading_type"]
                    elif "interval_reading" in data:
                        fetched_readings = data["interval_reading"]

                # Cache each reading individually by date and add to all_readings
                # Only include readings that were originally requested (in missing_dates)
                if use_cache and fetched_readings:
                    for reading in fetched_readings:
                        date_str = reading.get("date", "")[:10]  # Extract YYYY-MM-DD
                        if date_str:
                            cache_key = f"consumption:daily:{usage_point_id}:{date_str}"
                            await cache_service.set(cache_key, reading, current_user.client_secret)
                            logger.info(f"[CACHE SET] Daily data for {usage_point_id} on {date_str}")

                            # Only add to all_readings if it was actually requested
                            if date_str in missing_dates:
                                all_readings.append(reading)
                            else:
                                logger.info(f"[CACHE ONLY] Data for {date_str} cached but not added to response (wasn't requested)")
                else:
                    # Not using cache, just add to all_readings (filter by missing_dates)
                    for reading in fetched_readings:
                        date_str = reading.get("date", "")[:10]
                        if date_str in missing_dates:
                            all_readings.append(reading)

            except Exception as e:
                error_msg = f"Failed to fetch {range_start} to {range_end}: {str(e)}"
                logger.warning(f"[API ERROR] {error_msg}")
                api_errors.append(error_msg)
                # Continue with next range instead of failing completely

        # Cache reading_type if present
        if reading_type and use_cache:
            reading_type_cache_key = f"consumption:reading_type:{usage_point_id}"
            await cache_service.set(reading_type_cache_key, reading_type, current_user.client_secret)
            logger.info(f"[CACHE SET] Reading type for {usage_point_id}: unit={reading_type.get('unit')}, interval={reading_type.get('interval_length')}")

        # If all API calls failed and we have no cached data, return error
        if api_errors and not all_readings:
            return APIResponse(success=False, error=ErrorDetail(code="ENEDIS_ERROR", message="; ".join(api_errors)))

    # Get reading_type from cache if not fetched from API
    if not reading_type and use_cache:
        reading_type_cache_key = f"consumption:reading_type:{usage_point_id}"
        reading_type = await cache_service.get(reading_type_cache_key, current_user.client_secret)

    # Use default reading_type if not found
    if not reading_type:
        reading_type = {"unit": "W", "measurement_kind": "power"}

    # Sort readings by date to ensure chronological order
    all_readings.sort(key=lambda x: x.get("date", ""))

    return APIResponse(success=True, data={"meter_reading": {"interval_reading": all_readings, "reading_type": reading_type}})


@router.get("/consumption/detail/{usage_point_id}", response_model=APIResponse)
async def get_consumption_detail(
    request: Request,
    usage_point_id: str = Path(
        ...,
        description="Point de livraison (14 chiffres). 💡 **Astuce**: Utilisez d'abord `GET /pdl/` pour lister vos PDL disponibles.",
        openapi_examples={
            "standard_pdl": {"summary": "Standard PDL", "value": "12345678901234"},
            "test_pdl": {"summary": "Test PDL", "value": "00000000000000"}
        }
    ),
    start: str = Query(
        ...,
        description="Start date (YYYY-MM-DD)",
        openapi_examples={
            "current_year": {"summary": "Start of 2024", "value": "2024-01-01"},
            "recent_week": {"summary": "Week start", "value": "2024-10-01"}
        }
    ),
    end: str = Query(
        ...,
        description="End date (YYYY-MM-DD)",
        openapi_examples={
            "current_year": {"summary": "End of 2024", "value": "2024-12-31"},
            "recent_week": {"summary": "Week end", "value": "2024-10-07"}
        }
    ),
    use_cache: bool = Query(
        False,
        description="Use cached data if available",
        openapi_examples={
            "with_cache": {"summary": "Use cache", "value": True},
            "without_cache": {"summary": "Fresh data", "value": False}
        }
    ),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Get detailed consumption data (load curve) (max 2 years history)

    New cache strategy: Data is cached per individual day instead of per date range.
    This allows cache reuse across different date ranges.
    """

    # Adjust date range: cap end date to today and ensure start is before end
    start, end = adjust_date_range(start, end)

    # Check if date range is within allowed period (2 years for detail endpoint)
    is_valid, error_response = validate_date_range(start, end, max_years=2, endpoint_type="Detail")
    dates_too_old = not is_valid and error_response.error.code == "DATE_TOO_OLD"

    # Generate list of all dates in range
    start_date = datetime.strptime(start, "%Y-%m-%d")
    end_date = datetime.strptime(end, "%Y-%m-%d")
    date_list = []
    current_date = start_date
    while current_date <= end_date:
        date_list.append(current_date.strftime("%Y-%m-%d"))
        current_date += timedelta(days=1)

    access_token = await get_valid_token(usage_point_id, current_user, db)
    if not access_token:
        return APIResponse(
            success=False,
            error=ErrorDetail(
                code="ACCESS_DENIED",
                message="Access denied: PDL not found or no valid token. Please verify PDL ownership and consent."
            )
        )

    # Check rate limit - use route path template instead of actual path
    endpoint_path = request.scope.get("route").path if request.scope.get("route") else request.url.path

    # NEW: Check cache for each timestamp (ultra-granular cache check)
    cached_readings = []
    missing_dates = []

    if use_cache:
        # For each day, check all possible timestamps (48 readings per day at 30-min intervals)
        for date_str in date_list:
            day_complete = True
            day_readings = []

            # Generate all 48 timestamps for this day (00:00, 00:30, 01:00, ..., 23:30)
            for hour in range(24):
                for minute in [0, 30]:
                    timestamp = f"{date_str}T{hour:02d}:{minute:02d}"
                    cache_key = f"consumption:detail:{usage_point_id}:{timestamp}"
                    cached_reading = await cache_service.get(cache_key, current_user.client_secret)

                    if cached_reading:
                        day_readings.append(cached_reading)
                    else:
                        day_complete = False

            if day_complete and len(day_readings) > 0:
                cached_readings.extend(day_readings)
                logger.info(f"[CACHE HIT] {usage_point_id} - {date_str} (all {len(day_readings)} readings)")
            else:
                # Add partial readings we found
                if day_readings:
                    cached_readings.extend(day_readings)
                    logger.info(f"[CACHE PARTIAL] {usage_point_id} - {date_str} ({len(day_readings)}/48 readings)")
                else:
                    logger.info(f"[CACHE MISS] {usage_point_id} - {date_str}")
                missing_dates.append(date_str)
    else:
        missing_dates = date_list

    # If we need to fetch missing dates
    all_readings = []
    if missing_dates:
        # Only check rate limit if we need to fetch from Enedis
        is_allowed, error_response = await check_rate_limit(current_user.id, use_cache, current_user.is_admin, endpoint_path)
        if not is_allowed:
            # If rate limited and we have some cached data, return what we have
            if cached_readings and dates_too_old:
                logger.warning(f"[RATE LIMITED] Returning partial cached data for {usage_point_id}")
                return APIResponse(success=True, data={"meter_reading": {"interval_reading": cached_readings}})
            return error_response

        # Group consecutive missing dates into ranges to minimize API calls
        date_ranges = []
        if missing_dates:
            range_start = missing_dates[0]
            range_end = missing_dates[0]

            for i in range(1, len(missing_dates)):
                current = datetime.strptime(missing_dates[i], "%Y-%m-%d")
                prev = datetime.strptime(missing_dates[i-1], "%Y-%m-%d")

                if (current - prev).days == 1:
                    # Consecutive day, extend range
                    range_end = missing_dates[i]
                else:
                    # Gap found, save current range and start new one
                    date_ranges.append((range_start, range_end))
                    range_start = missing_dates[i]
                    range_end = missing_dates[i]

            # Add last range
            date_ranges.append((range_start, range_end))

        # Fetch each range from Enedis
        for range_start, range_end in date_ranges:
            try:
                # Enedis API doesn't accept start=end, so add 1 day minimum
                if range_start == range_end:
                    range_end_date = datetime.strptime(range_end, "%Y-%m-%d")
                    range_end_date += timedelta(days=1)
                    range_end = range_end_date.strftime("%Y-%m-%d")
                    logger.info(f"[FETCH] {usage_point_id} - {range_start} to {range_end} (extended by 1 day to avoid start=end)")
                else:
                    logger.info(f"[FETCH] {usage_point_id} - {range_start} to {range_end}")

                # Use appropriate adapter based on user type
                adapter, is_demo = await get_adapter_for_user(current_user)
                if is_demo:
                    data = await adapter.get_consumption_detail(usage_point_id, range_start, range_end, current_user.client_secret)
                else:
                    data = await adapter.get_consumption_detail(usage_point_id, range_start, range_end, access_token)

                # Check for Enedis error ADAM-ERR0123 (data older than meter activation)
                if isinstance(data, dict) and "error" in data and data["error"] == "ADAM-ERR0123":
                    logger.warning(f"[ENEDIS ERROR] {usage_point_id} - {range_start} to {range_end}: Data anterior to meter activation date")

                    # Save the oldest available date in PDL to avoid future requests
                    from datetime import datetime as dt
                    oldest_date = dt.strptime(range_start, "%Y-%m-%d").date()

                    # Get the PDL and update the oldest_available_data_date
                    pdl_query = await db.execute(
                        select(PDL).where(PDL.usage_point_id == usage_point_id, PDL.user_id == current_user.id)
                    )
                    pdl = pdl_query.scalar_one_or_none()

                    if pdl:
                        pdl.oldest_available_data_date = oldest_date
                        await db.commit()
                        logger.info(f"[PDL UPDATE] Set oldest_available_data_date to {oldest_date} for PDL {usage_point_id}")

                    # Return error to stop further fetching
                    return APIResponse(
                        success=False,
                        error=ErrorDetail(
                            code="ADAM-ERR0123",
                            message=f"The requested period ({range_start}) cannot be anterior to the meter's last activation date"
                        )
                    )

                # Extract readings
                readings = []
                if isinstance(data, dict):
                    if "meter_reading" in data and "interval_reading" in data["meter_reading"]:
                        readings = data["meter_reading"]["interval_reading"]
                    elif "interval_reading" in data:
                        readings = data["interval_reading"]

                # NEW: Cache each reading individually by timestamp (ultra-granular cache)
                if use_cache and readings:
                    for reading in readings:
                        # Get full timestamp: "2025-10-08T20:00:00" or "2025-10-08 20:00:00"
                        timestamp = reading.get("date", "")
                        if timestamp:
                            # Normalize timestamp format (replace space with T)
                            timestamp = timestamp.replace(" ", "T")
                            # Remove seconds if present for consistent key format
                            if len(timestamp) > 16:
                                timestamp = timestamp[:16]  # Keep only YYYY-MM-DDTHH:MM

                            cache_key = f"consumption:detail:{usage_point_id}:{timestamp}"
                            await cache_service.set(cache_key, reading, current_user.client_secret)

                    logger.info(f"[CACHE SET] {usage_point_id} - {range_start} to {range_end} ({len(readings)} individual readings cached)")

                all_readings.extend(readings)

            except Exception as e:
                logger.error(f"[ERROR] Failed to fetch {usage_point_id} {range_start}-{range_end}: {e}")
                # Continue with other ranges even if one fails

    # Combine cached readings with newly fetched readings
    all_readings.extend(cached_readings)

    if not all_readings:
        return APIResponse(success=False, error=ErrorDetail(code="NO_DATA", message="No consumption data available for this period"))

    # Return aggregated result
    return APIResponse(success=True, data={"meter_reading": {"interval_reading": all_readings}})


@router.get("/power/{usage_point_id}", response_model=APIResponse)
async def get_max_power(
    request: Request,
    usage_point_id: str = Path(..., description="Point de livraison (14 chiffres). 💡 **Astuce**: Utilisez d'abord `GET /pdl/` pour lister vos PDL disponibles.", openapi_examples={"standard_pdl": {"summary": "Standard PDL", "value": "12345678901234"}, "test_pdl": {"summary": "Test PDL", "value": "00000000000000"}}),
    start: str = Query(..., description="Start date (YYYY-MM-DD)", openapi_examples={"current_year": {"summary": "Start of 2024", "value": "2024-01-01"}, "recent_month": {"summary": "Month start", "value": "2024-10-01"}}),
    end: str = Query(..., description="End date (YYYY-MM-DD)", openapi_examples={"current_year": {"summary": "End of 2024", "value": "2024-12-31"}, "recent_month": {"summary": "Month end", "value": "2024-10-31"}}),
    use_cache: bool = Query(False, description="Use cached data if available", openapi_examples={"with_cache": {"summary": "Use cache", "value": True}, "without_cache": {"summary": "Fresh data", "value": False}}),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Get maximum power data"""
    access_token = await get_valid_token(usage_point_id, current_user, db)
    if not access_token:
        return APIResponse(
            success=False, error=ErrorDetail(code="ACCESS_DENIED", message="Access denied: PDL not found or no valid token. Please verify PDL ownership and consent.")
        )

    # Check rate limit - use route path template instead of actual path
    endpoint_path = request.scope.get("route").path if request.scope.get("route") else request.url.path
    is_allowed, error_response = await check_rate_limit(current_user.id, use_cache, current_user.is_admin, endpoint_path)
    if not is_allowed:
        return error_response

    # Check cache
    if use_cache:
        cache_key = cache_service.make_cache_key(usage_point_id, "power", start=start, end=end)
        cached_data = await cache_service.get(cache_key, current_user.client_secret)
        if cached_data:
            return APIResponse(success=True, data=cached_data)

    try:
        # Use appropriate adapter based on user type
        adapter, is_demo = await get_adapter_for_user(current_user)
        if is_demo:
            data = await adapter.get_max_power(usage_point_id, start, end, current_user.client_secret)
        else:
            data = await adapter.get_max_power(usage_point_id, start, end, access_token)

        # Cache result
        if use_cache:
            await cache_service.set(cache_key, data, current_user.client_secret)

        return APIResponse(success=True, data=data)
    except Exception as e:
        return APIResponse(success=False, error=ErrorDetail(code="ENEDIS_ERROR", message=str(e)))


@router.get("/production/daily/{usage_point_id}", response_model=APIResponse)
async def get_production_daily(
    request: Request,
    usage_point_id: str = Path(..., description="Point de livraison (14 chiffres). 💡 **Astuce**: Utilisez d'abord `GET /pdl/` pour lister vos PDL disponibles.", openapi_examples={"standard_pdl": {"summary": "Standard PDL", "value": "12345678901234"}, "test_pdl": {"summary": "Test PDL", "value": "00000000000000"}}),
    start: str = Query(..., description="Start date (YYYY-MM-DD)", openapi_examples={"current_year": {"summary": "Start of 2024", "value": "2024-01-01"}, "recent_month": {"summary": "Month start", "value": "2024-10-01"}}),
    end: str = Query(..., description="End date (YYYY-MM-DD)", openapi_examples={"current_year": {"summary": "End of 2024", "value": "2024-12-31"}, "recent_month": {"summary": "Month end", "value": "2024-10-31"}}),
    use_cache: bool = Query(False, description="Use cached data if available", openapi_examples={"with_cache": {"summary": "Use cache", "value": True}, "without_cache": {"summary": "Fresh data", "value": False}}),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Get daily production data"""
    access_token = await get_valid_token(usage_point_id, current_user, db)
    if not access_token:
        return APIResponse(
            success=False, error=ErrorDetail(code="ACCESS_DENIED", message="Access denied: PDL not found or no valid token. Please verify PDL ownership and consent.")
        )

    # Check rate limit - use route path template instead of actual path
    endpoint_path = request.scope.get("route").path if request.scope.get("route") else request.url.path
    is_allowed, error_response = await check_rate_limit(current_user.id, use_cache, current_user.is_admin, endpoint_path)
    if not is_allowed:
        return error_response

    # Check cache
    if use_cache:
        cache_key = cache_service.make_cache_key(usage_point_id, "production_daily", start=start, end=end)
        cached_data = await cache_service.get(cache_key, current_user.client_secret)
        if cached_data:
            return APIResponse(success=True, data=cached_data)

    try:
        # Use appropriate adapter based on user type
        adapter, is_demo = await get_adapter_for_user(current_user)
        if is_demo:
            data = await adapter.get_production_daily(usage_point_id, start, end, current_user.client_secret)
        else:
            data = await adapter.get_production_daily(usage_point_id, start, end, access_token)

        # Cache result
        if use_cache:
            await cache_service.set(cache_key, data, current_user.client_secret)

        return APIResponse(success=True, data=data)
    except Exception as e:
        return APIResponse(success=False, error=ErrorDetail(code="ENEDIS_ERROR", message=str(e)))


@router.get("/production/detail/{usage_point_id}", response_model=APIResponse)
async def get_production_detail(
    request: Request,
    usage_point_id: str = Path(..., description="Point de livraison (14 chiffres). 💡 **Astuce**: Utilisez d'abord `GET /pdl/` pour lister vos PDL disponibles.", openapi_examples={"standard_pdl": {"summary": "Standard PDL", "value": "12345678901234"}, "test_pdl": {"summary": "Test PDL", "value": "00000000000000"}}),
    start: str = Query(..., description="Start date (YYYY-MM-DD)", openapi_examples={"current_year": {"summary": "Start of 2024", "value": "2024-01-01"}, "recent_week": {"summary": "Week start", "value": "2024-10-01"}}),
    end: str = Query(..., description="End date (YYYY-MM-DD)", openapi_examples={"current_year": {"summary": "End of 2024", "value": "2024-12-31"}, "recent_week": {"summary": "Week end", "value": "2024-10-07"}}),
    use_cache: bool = Query(False, description="Use cached data if available", openapi_examples={"with_cache": {"summary": "Use cache", "value": True}, "without_cache": {"summary": "Fresh data", "value": False}}),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Get detailed production data"""
    access_token = await get_valid_token(usage_point_id, current_user, db)
    if not access_token:
        return APIResponse(
            success=False, error=ErrorDetail(code="ACCESS_DENIED", message="Access denied: PDL not found or no valid token. Please verify PDL ownership and consent.")
        )

    # Check rate limit - use route path template instead of actual path
    endpoint_path = request.scope.get("route").path if request.scope.get("route") else request.url.path
    is_allowed, error_response = await check_rate_limit(current_user.id, use_cache, current_user.is_admin, endpoint_path)
    if not is_allowed:
        return error_response

    # Check cache
    if use_cache:
        cache_key = cache_service.make_cache_key(usage_point_id, "production_detail", start=start, end=end)
        cached_data = await cache_service.get(cache_key, current_user.client_secret)
        if cached_data:
            return APIResponse(success=True, data=cached_data)

    try:
        # Use appropriate adapter based on user type
        adapter, is_demo = await get_adapter_for_user(current_user)
        if is_demo:
            data = await adapter.get_production_detail(usage_point_id, start, end, current_user.client_secret)
        else:
            data = await adapter.get_production_detail(usage_point_id, start, end, access_token)

        # Cache result
        if use_cache:
            await cache_service.set(cache_key, data, current_user.client_secret)

        return APIResponse(success=True, data=data)
    except Exception as e:
        return APIResponse(success=False, error=ErrorDetail(code="ENEDIS_ERROR", message=str(e)))


# Customer data endpoints
@router.get("/contract/{usage_point_id}", response_model=APIResponse)
async def get_contract(
    request: Request,
    usage_point_id: str = Path(..., description="Point de livraison (14 chiffres). 💡 **Astuce**: Utilisez d'abord `GET /pdl/` pour lister vos PDL disponibles.", openapi_examples={"standard_pdl": {"summary": "Standard PDL", "value": "12345678901234"}, "test_pdl": {"summary": "Test PDL", "value": "00000000000000"}}),
    use_cache: bool = Query(False, description="Use cached data if available", openapi_examples={"with_cache": {"summary": "Use cache", "value": True}, "without_cache": {"summary": "Fresh data", "value": False}}),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Get contract data"""
    access_token = await get_valid_token(usage_point_id, current_user, db)
    if not access_token:
        return APIResponse(
            success=False, error=ErrorDetail(code="ACCESS_DENIED", message="Access denied: PDL not found or no valid token. Please verify PDL ownership and consent.")
        )

    # Check rate limit - use route path template instead of actual path
    endpoint_path = request.scope.get("route").path if request.scope.get("route") else request.url.path
    is_allowed, error_response = await check_rate_limit(current_user.id, use_cache, current_user.is_admin, endpoint_path)
    if not is_allowed:
        return error_response

    # Check cache
    if use_cache:
        cache_key = cache_service.make_cache_key(usage_point_id, "contract")
        cached_data = await cache_service.get(cache_key, current_user.client_secret)
        if cached_data:
            return APIResponse(success=True, data=cached_data)

    try:
        logger.info(f"[ENEDIS CONTRACT] Fetching contract for usage_point_id: {usage_point_id}")
        logger.info(f"[ENEDIS CONTRACT] Using cache: {use_cache}")

        # Use appropriate adapter based on user type
        adapter, is_demo = await get_adapter_for_user(current_user)
        if is_demo:
            data = await adapter.get_contract(usage_point_id, current_user.client_secret)
        else:
            data = await adapter.get_contract(usage_point_id, access_token)

        logger.info(f"[ENEDIS CONTRACT] Successfully fetched contract data")

        # Cache result
        if use_cache:
            await cache_service.set(cache_key, data, current_user.client_secret)

        return APIResponse(success=True, data=data)
    except Exception as e:
        logger.error(f"[ENEDIS CONTRACT ERROR] Error fetching contract: {type(e).__name__}: {str(e)}")
        import traceback
        traceback.print_exc()
        return APIResponse(success=False, error=ErrorDetail(code="ENEDIS_ERROR", message=str(e)))


@router.get("/address/{usage_point_id}", response_model=APIResponse)
async def get_address(
    request: Request,
    usage_point_id: str = Path(..., description="Point de livraison (14 chiffres). 💡 **Astuce**: Utilisez d'abord `GET /pdl/` pour lister vos PDL disponibles.", openapi_examples={"standard_pdl": {"summary": "Standard PDL", "value": "12345678901234"}, "test_pdl": {"summary": "Test PDL", "value": "00000000000000"}}),
    use_cache: bool = Query(False, description="Use cached data if available", openapi_examples={"with_cache": {"summary": "Use cache", "value": True}, "without_cache": {"summary": "Fresh data", "value": False}}),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Get address data"""
    access_token = await get_valid_token(usage_point_id, current_user, db)
    if not access_token:
        return APIResponse(
            success=False, error=ErrorDetail(code="ACCESS_DENIED", message="Access denied: PDL not found or no valid token. Please verify PDL ownership and consent.")
        )

    # Check rate limit - use route path template instead of actual path
    endpoint_path = request.scope.get("route").path if request.scope.get("route") else request.url.path
    is_allowed, error_response = await check_rate_limit(current_user.id, use_cache, current_user.is_admin, endpoint_path)
    if not is_allowed:
        return error_response

    # Check cache
    if use_cache:
        cache_key = cache_service.make_cache_key(usage_point_id, "address")
        cached_data = await cache_service.get(cache_key, current_user.client_secret)
        if cached_data:
            return APIResponse(success=True, data=cached_data)

    try:
        # Use appropriate adapter based on user type
        adapter, is_demo = await get_adapter_for_user(current_user)
        if is_demo:
            data = await adapter.get_address(usage_point_id, current_user.client_secret)
        else:
            data = await adapter.get_address(usage_point_id, access_token)

        # Cache result
        if use_cache:
            await cache_service.set(cache_key, data, current_user.client_secret)

        return APIResponse(success=True, data=data)
    except Exception as e:
        return APIResponse(success=False, error=ErrorDetail(code="ENEDIS_ERROR", message=str(e)))


@router.get("/customer/{usage_point_id}", response_model=APIResponse)
async def get_customer(
    request: Request,
    usage_point_id: str = Path(..., description="Point de livraison (14 chiffres). 💡 **Astuce**: Utilisez d'abord `GET /pdl/` pour lister vos PDL disponibles.", openapi_examples={"standard_pdl": {"summary": "Standard PDL", "value": "12345678901234"}, "test_pdl": {"summary": "Test PDL", "value": "00000000000000"}}),
    use_cache: bool = Query(False, description="Use cached data if available", openapi_examples={"with_cache": {"summary": "Use cache", "value": True}, "without_cache": {"summary": "Fresh data", "value": False}}),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Get customer identity data"""
    access_token = await get_valid_token(usage_point_id, current_user, db)
    if not access_token:
        return APIResponse(
            success=False, error=ErrorDetail(code="ACCESS_DENIED", message="Access denied: PDL not found or no valid token. Please verify PDL ownership and consent.")
        )

    # Check rate limit - use route path template instead of actual path
    endpoint_path = request.scope.get("route").path if request.scope.get("route") else request.url.path
    is_allowed, error_response = await check_rate_limit(current_user.id, use_cache, current_user.is_admin, endpoint_path)
    if not is_allowed:
        return error_response

    # Check cache
    if use_cache:
        cache_key = cache_service.make_cache_key(usage_point_id, "customer")
        cached_data = await cache_service.get(cache_key, current_user.client_secret)
        if cached_data:
            return APIResponse(success=True, data=cached_data)

    try:
        # Use appropriate adapter based on user type
        adapter, is_demo = await get_adapter_for_user(current_user)
        if is_demo:
            data = await adapter.get_customer(usage_point_id, current_user.client_secret)
        else:
            data = await adapter.get_customer(usage_point_id, access_token)

        # Cache result
        if use_cache:
            await cache_service.set(cache_key, data, current_user.client_secret)

        return APIResponse(success=True, data=data)
    except Exception as e:
        return APIResponse(success=False, error=ErrorDetail(code="ENEDIS_ERROR", message=str(e)))


@router.get("/contact/{usage_point_id}", response_model=APIResponse)
async def get_contact(
    request: Request,
    usage_point_id: str = Path(..., description="Point de livraison (14 chiffres). 💡 **Astuce**: Utilisez d'abord `GET /pdl/` pour lister vos PDL disponibles.", openapi_examples={"standard_pdl": {"summary": "Standard PDL", "value": "12345678901234"}, "test_pdl": {"summary": "Test PDL", "value": "00000000000000"}}),
    use_cache: bool = Query(False, description="Use cached data if available", openapi_examples={"with_cache": {"summary": "Use cache", "value": True}, "without_cache": {"summary": "Fresh data", "value": False}}),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Get customer contact data"""
    access_token = await get_valid_token(usage_point_id, current_user, db)
    if not access_token:
        return APIResponse(
            success=False, error=ErrorDetail(code="ACCESS_DENIED", message="Access denied: PDL not found or no valid token. Please verify PDL ownership and consent.")
        )

    # Check rate limit - use route path template instead of actual path
    endpoint_path = request.scope.get("route").path if request.scope.get("route") else request.url.path
    is_allowed, error_response = await check_rate_limit(current_user.id, use_cache, current_user.is_admin, endpoint_path)
    if not is_allowed:
        return error_response

    # Check cache
    if use_cache:
        cache_key = cache_service.make_cache_key(usage_point_id, "contact")
        cached_data = await cache_service.get(cache_key, current_user.client_secret)
        if cached_data:
            return APIResponse(success=True, data=cached_data)

    try:
        # Use appropriate adapter based on user type
        adapter, is_demo = await get_adapter_for_user(current_user)
        if is_demo:
            data = await adapter.get_contact(usage_point_id, current_user.client_secret)
        else:
            data = await adapter.get_contact(usage_point_id, access_token)

        # Cache result
        if use_cache:
            await cache_service.set(cache_key, data, current_user.client_secret)

        return APIResponse(success=True, data=data)
    except Exception as e:
        return APIResponse(success=False, error=ErrorDetail(code="ENEDIS_ERROR", message=str(e)))


# Cache management
@router.delete("/cache/{usage_point_id}", response_model=APIResponse)
async def delete_cache(
    usage_point_id: str = Path(..., description="Point de livraison (14 chiffres). 💡 **Astuce**: Utilisez d'abord `GET /pdl/` pour lister vos PDL disponibles.", openapi_examples={"standard_pdl": {"summary": "Standard PDL", "value": "12345678901234"}, "test_pdl": {"summary": "Test PDL", "value": "00000000000000"}}),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> APIResponse:
    """Delete all cached data for a usage point"""
    # Verify PDL ownership
    if not await verify_pdl_ownership(usage_point_id, current_user, db):
        return APIResponse(
            success=False,
            error=ErrorDetail(
                code="ACCESS_DENIED",
                message="Access denied: You do not own this PDL."
            )
        )

    # Delete all consumption cache keys for this PDL
    # Cache keys format: consumption:detail:{usage_point_id}:{date}
    pattern = f"consumption:*:{usage_point_id}:*"
    deleted_keys = await cache_service.delete_pattern(pattern)

    response = CacheDeleteResponse(
        success=True, deleted_keys=deleted_keys, message=f"Deleted {deleted_keys} cached entries"
    )

    return APIResponse(success=True, data=response.model_dump())
