from datetime import datetime, UTC, timedelta
from typing import cast, Optional
from fastapi import APIRouter, Depends, Query, Request, Path
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from ..models import User, Token, PDL
from ..models.database import get_db
from ..schemas import APIResponse, ErrorDetail, CacheDeleteResponse
from ..middleware import get_current_user, get_impersonation_context, get_encryption_key
from ..adapters import enedis_adapter
from ..adapters.demo_adapter import demo_adapter
from ..services import cache_service, rate_limiter
import logging


logger = logging.getLogger(__name__)

# Helper function for conditional logging based on user debug mode
def log_if_debug(user: User, level: str, message: str, pdl: str | None = None) -> None:
    """Log only if user has debug_mode enabled. Always uses WARNING level for easy filtering."""
    if user and user.debug_mode:
        if pdl:
            logger.warning(f"[{pdl}] {message}")
        else:
            logger.warning(message)

# Helper function to add PDL prefix to log messages
def log_with_pdl(level: str, pdl: str, message: str) -> None:
    """Add PDL prefix to log message: [XXXXXXXXXXXXXX] message"""
    prefixed_message = f"[{pdl}] {message}"
    if level == "info":
        logger.info(prefixed_message)
    elif level == "warning":
        logger.warning(prefixed_message)
    elif level == "error":
        logger.error(prefixed_message)
    elif level == "debug":
        logger.debug(prefixed_message)

# Blacklist helpers for failed dates
async def increment_date_fail_count(usage_point_id: str, date: str) -> int:
    """
    Increment fail counter for a specific date.
    Returns the new fail count.
    """
    key = f"enedis:fail:{usage_point_id}:{date}"
    redis_client = cache_service.redis_client

    if not redis_client:
        return 0

    # Increment counter
    count = await redis_client.incr(key)

    # Set expiry to 24 hours on first increment
    if count == 1:
        await redis_client.expire(key, 86400)  # 24 hours

    return cast(int, count)

async def is_date_blacklisted(usage_point_id: str, date: str) -> bool:
    """
    Check if a date is blacklisted (> 5 fails).
    """
    key = f"enedis:blacklist:{usage_point_id}:{date}"
    redis_client = cache_service.redis_client

    if not redis_client:
        return False

    result = await redis_client.get(key)
    return result is not None

async def blacklist_date(usage_point_id: str, date: str) -> None:
    """
    Blacklist a date for 24 hours.
    """
    key = f"enedis:blacklist:{usage_point_id}:{date}"
    redis_client = cache_service.redis_client

    if not redis_client:
        return

    await redis_client.setex(key, 86400, "1")  # 24 hours
    log_with_pdl("warning", usage_point_id, f"[BLACKLIST] Date {date} blacklisted after 5+ failures")

router = APIRouter(
    prefix="/enedis",
    tags=["Enedis Data"],
    responses={
        401: {"description": "Unauthorized - Invalid or missing authentication"},
        403: {"description": "Forbidden - PDL does not belong to user"},
        429: {"description": "Rate limit exceeded"},
    },
)


async def get_adapter_for_user(user: User) -> tuple:
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


async def get_pdl_with_owner(
    usage_point_id: str,
    current_user: User,
    impersonated_user: User | None,
    db: AsyncSession
) -> tuple[PDL | None, User | None]:
    """
    Get PDL and its owner, supporting admin impersonation.

    Returns (pdl, owner) tuple where:
    - pdl: The PDL if found and accessible
    - owner: The user who owns the PDL (for getting client_secret)

    Access is granted if:
    1. PDL belongs to current_user, OR
    2. PDL belongs to impersonated_user (admin impersonation with data sharing enabled)
    """
    # First, try current user's PDL
    result = await db.execute(
        select(PDL).where(PDL.user_id == current_user.id, PDL.usage_point_id == usage_point_id)
    )
    pdl = result.scalar_one_or_none()
    if pdl:
        return pdl, current_user

    # If impersonating, try impersonated user's PDL
    if impersonated_user:
        result = await db.execute(
            select(PDL).where(PDL.user_id == impersonated_user.id, PDL.usage_point_id == usage_point_id)
        )
        pdl = result.scalar_one_or_none()
        if pdl:
            logger.info(f"[IMPERSONATION] Admin {current_user.email} accessing PDL {usage_point_id} of user {impersonated_user.email}")
            return pdl, impersonated_user

    return None, None


def adjust_date_range(start: str, end: str) -> tuple[str, str]:
    """
    Adjust date range to ensure it's valid for Enedis API:
    1. Cap end date to yesterday (J-1) since Enedis only provides data up to J-1
    2. If start == end, move start to 1 day before
    Returns (adjusted_start, adjusted_end) as strings (YYYY-MM-DD).
    """
    try:
        start_date = datetime.strptime(start, "%Y-%m-%d")
        end_date = datetime.strptime(end, "%Y-%m-%d")

        # Use Paris timezone for "today" calculation since Enedis blocks at midnight Paris time
        from zoneinfo import ZoneInfo
        paris_tz = ZoneInfo("Europe/Paris")
        today_paris = datetime.now(paris_tz).replace(hour=0, minute=0, second=0, microsecond=0)
        today = today_paris.replace(tzinfo=None)
        # Enedis data is only available up to yesterday (J-1)
        yesterday = today - timedelta(days=1)

        # 1. Cap end date to yesterday if it's after yesterday (including today)
        if end_date > yesterday:
            logger.info(f"[DATE ADJUST] End date {end} is after yesterday (J-1), capping to {yesterday.strftime('%Y-%m-%d')}")
            end_date = yesterday

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
    - /daily endpoint: max 3 years from yesterday (J-1)
    - /detail endpoint: max 2 years from yesterday (J-1)
    Returns (is_valid, error_response_or_none)

    Note: We use yesterday as reference because Enedis data is only available up to J-1
    """
    try:
        start_date = datetime.strptime(start, "%Y-%m-%d")
        end_date = datetime.strptime(end, "%Y-%m-%d")

        # Use TODAY as reference for max historical limit (today - max_years)
        # Calculate using Paris timezone since Enedis blocks data at midnight Paris time
        from zoneinfo import ZoneInfo
        paris_tz = ZoneInfo("Europe/Paris")
        today_paris = datetime.now(paris_tz).replace(hour=0, minute=0, second=0, microsecond=0)
        today = today_paris.replace(tzinfo=None)

        # Check if start date is too old - calculate from TODAY (not yesterday)
        oldest_allowed = today.replace(year=today.year - max_years)

        if start_date < oldest_allowed:
            error_response = APIResponse(
                success=False,
                error=ErrorDetail(
                    code="DATE_TOO_OLD",
                    message=f"Start date is too old. {endpoint_type} endpoint only supports data up to {max_years} years back. Oldest allowed date: {oldest_allowed.strftime('%Y-%m-%d')}"
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


async def check_rate_limit(user_id: str, use_cache: bool, is_admin: bool = False, endpoint: str | None = None) -> tuple[bool, APIResponse | None]:
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


class TokenError:
    """Classe pour distinguer les types d'erreur de token"""
    PDL_NOT_FOUND = "PDL_NOT_FOUND"
    ENEDIS_UNAVAILABLE = "ENEDIS_UNAVAILABLE"

    def __init__(self, error_type: str) -> None:
        self.error_type = error_type

    def __eq__(self, other: object) -> bool:
        if isinstance(other, str):
            return self.error_type == other
        if isinstance(other, TokenError):
            return self.error_type == other.error_type
        return False


def make_token_error_response(error: TokenError) -> APIResponse:
    """Génère une réponse d'erreur appropriée selon le type d'erreur de token"""
    if error.error_type == TokenError.ENEDIS_UNAVAILABLE:
        return APIResponse(
            success=False,
            error=ErrorDetail(
                code="ENEDIS_UNAVAILABLE",
                message="L'API Enedis est temporairement indisponible. Veuillez réessayer dans quelques minutes."
            )
        )
    else:  # PDL_NOT_FOUND
        return APIResponse(
            success=False,
            error=ErrorDetail(
                code="ACCESS_DENIED",
                message="Accès refusé : PDL introuvable ou non associé à votre compte. Vérifiez que le PDL existe et que le consentement Enedis est valide."
            )
        )


async def get_valid_token(usage_point_id: str, user: User, db: AsyncSession) -> str | TokenError:
    """Get valid Client Credentials token for Enedis API. Returns access_token string or TokenError."""
    # Skip token validation for demo users
    if await demo_adapter.is_demo_user(user.email):
        logger.info(f"[DEMO MODE] Skipping token validation for demo user {user.email}")
        # Still verify PDL ownership
        if not await verify_pdl_ownership(usage_point_id, user, db):
            return TokenError(TokenError.PDL_NOT_FOUND)
        return "demo_token"  # Return dummy token for demo users

    # First, verify PDL ownership
    if not await verify_pdl_ownership(usage_point_id, user, db):
        return TokenError(TokenError.PDL_NOT_FOUND)

    # Get global client credentials token (stored with user_id=None, usage_point_id='__global__')
    result = await db.execute(
        select(Token).where(Token.user_id.is_(None), Token.usage_point_id == "__global__").limit(1)
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
                        select(Token).where(Token.user_id.is_(None), Token.usage_point_id == "__global__").limit(1)
                    )
                    token = result.scalar_one_or_none()
                    if not token:
                        logger.error("[TOKEN ERROR] Failed to fetch token after race condition")
                        return TokenError(TokenError.ENEDIS_UNAVAILABLE)
        except Exception as e:
            logger.error(f"[TOKEN ERROR] Failed to get client credentials token: {str(e)}")
            import traceback
            traceback.print_exc()
            return TokenError(TokenError.ENEDIS_UNAVAILABLE)

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
    impersonated_user: Optional[User] = Depends(get_impersonation_context),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Get daily consumption data (max 3 years history)"""

    # Get the encryption key (impersonated user's key if admin is viewing shared data)
    encryption_key = get_encryption_key(current_user, impersonated_user)
    # Get the effective user for PDL ownership check
    effective_user = impersonated_user or current_user

    # Adjust date range: cap end date to today and ensure start is before end
    start, end = adjust_date_range(start, end)

    # Check if date range is within allowed period (3 years for daily endpoint)
    is_valid, error_response = validate_date_range(start, end, max_years=3, endpoint_type="Daily")
    dates_too_old = not is_valid and error_response is not None and error_response.error is not None and error_response.error.code == "DATE_TOO_OLD"

    # If dates are too old, we can only serve from cache
    if dates_too_old and error_response:
        # Try to serve from cache only
        cache_key = f"consumption:daily:{usage_point_id}:{start}:{end}"
        cached_data = await cache_service.get(cache_key, encryption_key)

        if cached_data:
            log_with_pdl("info", usage_point_id, f"[CACHE] Serving old data from cache for ({start} to {end})")
            return APIResponse(success=True, data=cached_data)
        else:
            # No cache available for old data
            return error_response

    # Check if user is demo - skip token validation for demo users
    _, is_demo = await get_adapter_for_user(effective_user)
    access_token = None

    if not is_demo:
        token_result = await get_valid_token(usage_point_id, effective_user, db)
        if isinstance(token_result, str):
            access_token = token_result
        else:
            return make_token_error_response(token_result)

    # Check rate limit - use route path template instead of actual path
    route = request.scope.get("route")
    endpoint_path = route.path if route else request.url.path
    is_allowed, error_response = await check_rate_limit(current_user.id, use_cache, current_user.is_admin, endpoint_path)
    if not is_allowed:
        assert error_response is not None
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
            cached_reading = await cache_service.get(cache_key, encryption_key)

            if cached_reading:
                all_readings.append(cached_reading)
                log_if_debug(effective_user, "debug", f"[CACHE HIT] Daily data for on {date_str}", pdl=usage_point_id)
            else:
                missing_dates.append(date_str)
                log_if_debug(effective_user, "debug", f"[CACHE MISS] Daily data for on {date_str}", pdl=usage_point_id)

            current_date += timedelta(days=1)

        # If we have all data from cache, return it
        if not missing_dates:
            log_if_debug(effective_user, "info", f"[CACHE] All daily data served from cache for ({start} to {end})", pdl=usage_point_id)
            # Get reading_type from cache or default
            reading_type_cache_key = f"consumption:reading_type:{usage_point_id}"
            reading_type = await cache_service.get(reading_type_cache_key, encryption_key)
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

        log_if_debug(effective_user, "info", f"[API CALL] Fetching {len(missing_dates)} missing dates in {len(date_ranges)} API call(s)", pdl=usage_point_id)

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
                    log_if_debug(effective_user, "info", f"[API CALL] Single day detected, extending range: {adjusted_start} to {range_end}", pdl=usage_point_id)
                    api_start = adjusted_start
                    api_end = range_end
                else:
                    api_start = range_start
                    api_end = range_end

                log_if_debug(effective_user, "info", f"[API CALL] Fetching data from {api_start} to {api_end}", pdl=usage_point_id)

                # Use appropriate adapter based on user type
                adapter, is_demo = await get_adapter_for_user(effective_user)
                if is_demo:
                    # Demo adapter uses client_secret instead of access_token
                    data = await adapter.get_consumption_daily(usage_point_id, api_start, api_end, encryption_key)
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
                            await cache_service.set(cache_key, reading, encryption_key)
                            log_if_debug(effective_user, "debug", f"[CACHE SET] Daily data for on {date_str}", pdl=usage_point_id)

                            # Only add to all_readings if it was actually requested
                            if date_str in missing_dates:
                                all_readings.append(reading)
                            else:
                                log_if_debug(effective_user, "debug", f"[CACHE ONLY] Data for {date_str} cached but not added to response (wasn't requested)", pdl=usage_point_id)
                else:
                    # Not using cache, just add to all_readings (filter by missing_dates)
                    for reading in fetched_readings:
                        date_str = reading.get("date", "")[:10]
                        if date_str in missing_dates:
                            all_readings.append(reading)

            except Exception as e:
                error_msg = f"Failed to fetch {range_start} to {range_end}: {str(e)}"
                log_with_pdl("warning", usage_point_id, f"[API ERROR] {error_msg}")
                api_errors.append(error_msg)
                # Continue with next range instead of failing completely

        # Cache reading_type if present
        if reading_type and use_cache:
            reading_type_cache_key = f"consumption:reading_type:{usage_point_id}"
            await cache_service.set(reading_type_cache_key, reading_type, encryption_key)
            log_if_debug(effective_user, "debug", f"[CACHE SET] Reading type for: unit={reading_type.get('unit')}, interval={reading_type.get('interval_length')}", pdl=usage_point_id)

        # If all API calls failed and we have no cached data, return error
        if api_errors and not all_readings:
            return APIResponse(success=False, error=ErrorDetail(code="ENEDIS_ERROR", message="; ".join(api_errors)))

    # Get reading_type from cache if not fetched from API
    if not reading_type and use_cache:
        reading_type_cache_key = f"consumption:reading_type:{usage_point_id}"
        reading_type = await cache_service.get(reading_type_cache_key, encryption_key)

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
    impersonated_user: Optional[User] = Depends(get_impersonation_context),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Get detailed consumption data (load curve) (max 2 years history)

    New cache strategy: Data is cached per individual day instead of per date range.
    This allows cache reuse across different date ranges.
    """
    # Get encryption key and effective user for impersonation support
    encryption_key = get_encryption_key(current_user, impersonated_user)
    effective_user = impersonated_user or current_user

    # Adjust date range: cap end date to today and ensure start is before end
    start, end = adjust_date_range(start, end)

    # Check if date range is within allowed period (2 years for detail endpoint)
    is_valid, error_response = validate_date_range(start, end, max_years=2, endpoint_type="Detail")
    dates_too_old = not is_valid and error_response is not None and error_response.error is not None and error_response.error.code == "DATE_TOO_OLD"

    # Generate list of all dates in range
    start_date = datetime.strptime(start, "%Y-%m-%d")
    end_date = datetime.strptime(end, "%Y-%m-%d")
    date_list = []
    current_date = start_date
    while current_date <= end_date:
        date_list.append(current_date.strftime("%Y-%m-%d"))
        current_date += timedelta(days=1)

    token_result = await get_valid_token(usage_point_id, effective_user, db)
    if isinstance(token_result, str):
        access_token = token_result
    else:
        return make_token_error_response(token_result)

    # Check rate limit - use route path template instead of actual path
    route = request.scope.get("route")
    endpoint_path = route.path if route else request.url.path

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
                    cached_reading = await cache_service.get(cache_key, encryption_key)

                    if cached_reading:
                        day_readings.append(cached_reading)
                    else:
                        day_complete = False

            if day_complete and len(day_readings) > 0:
                cached_readings.extend(day_readings)
                log_if_debug(effective_user, "debug", f"[CACHE HIT] {date_str} (all {len(day_readings)} readings)", pdl=usage_point_id)
            else:
                # Add partial readings we found
                if day_readings:
                    cached_readings.extend(day_readings)
                    log_if_debug(effective_user, "debug", f"[CACHE PARTIAL] {date_str} ({len(day_readings)}/48 readings)", pdl=usage_point_id)
                else:
                    log_if_debug(effective_user, "debug", f"[CACHE MISS] {date_str}", pdl=usage_point_id)
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
                log_with_pdl("warning", usage_point_id, "[RATE LIMITED] Returning partial cached data")
                return APIResponse(success=True, data={"meter_reading": {"interval_reading": cached_readings}})
            assert error_response is not None
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
                    log_with_pdl("info", usage_point_id, f"[FETCH] {range_start} to {range_end} (extended by 1 day to avoid start=end)")
                else:
                    log_with_pdl("info", usage_point_id, f"[FETCH] {range_start} to {range_end}")

                # Use appropriate adapter based on user type
                adapter, is_demo = await get_adapter_for_user(effective_user)
                if is_demo:
                    data = await adapter.get_consumption_detail(usage_point_id, range_start, range_end, encryption_key)
                else:
                    data = await adapter.get_consumption_detail(usage_point_id, range_start, range_end, access_token)

                # Check for Enedis error ADAM-ERR0123 (data older than meter activation)
                if isinstance(data, dict) and "error" in data and data["error"] == "ADAM-ERR0123":
                    log_with_pdl("warning", usage_point_id, f"[ENEDIS ERROR] {range_start} to {range_end}: Data anterior to meter activation date")

                    # Save the oldest available date in PDL to avoid future requests
                    from datetime import datetime as dt
                    oldest_date = dt.strptime(range_start, "%Y-%m-%d").date()

                    # Get the PDL and update the oldest_available_data_date
                    pdl_query = await db.execute(
                        select(PDL).where(PDL.usage_point_id == usage_point_id, PDL.user_id == effective_user.id)
                    )
                    pdl = pdl_query.scalar_one_or_none()

                    if pdl:
                        pdl.oldest_available_data_date = oldest_date
                        await db.commit()
                        log_with_pdl("info", usage_point_id, f"[PDL UPDATE] Set oldest_available_data_date to {oldest_date}")

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
                            await cache_service.set(cache_key, reading, encryption_key)

                    log_with_pdl("info", usage_point_id, f"[CACHE SET] {range_start} to {range_end} ({len(readings)} individual readings cached)")

                all_readings.extend(readings)

            except Exception as e:
                log_with_pdl("error", usage_point_id, f"[ERROR] Failed to fetch {range_start}-{range_end}: {e}")
                # Continue with other ranges even if one fails

    # Combine cached readings with newly fetched readings
    all_readings.extend(cached_readings)

    if not all_readings:
        return APIResponse(success=False, error=ErrorDetail(code="NO_DATA", message="No consumption data available for this period"))

    # Return aggregated result
    return APIResponse(success=True, data={"meter_reading": {"interval_reading": all_readings}})


@router.get("/consumption/detail/batch/{usage_point_id}", response_model=APIResponse)
async def get_consumption_detail_batch(
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
        description="Start date (YYYY-MM-DD) - Can be up to 2 years in the past",
        openapi_examples={
            "two_years": {"summary": "2 years back", "value": "2023-01-01"},
            "recent_month": {"summary": "Recent month", "value": "2024-10-01"}
        }
    ),
    end: str = Query(
        ...,
        description="End date (YYYY-MM-DD)",
        openapi_examples={
            "today": {"summary": "Today", "value": "2024-12-31"},
            "recent_month": {"summary": "Month end", "value": "2024-10-31"}
        }
    ),
    use_cache: bool = Query(
        True,
        description="Use cached data if available (recommended for batch requests)",
        openapi_examples={
            "with_cache": {"summary": "Use cache", "value": True},
            "without_cache": {"summary": "Fresh data", "value": False}
        }
    ),
    current_user: User = Depends(get_current_user),
    impersonated_user: Optional[User] = Depends(get_impersonation_context),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """
    Get detailed consumption data (load curve) for a large date range (max 2 years).

    This endpoint automatically splits large date ranges into weekly chunks (7 days max per Enedis API call)
    and returns all data aggregated. This eliminates the need for the frontend to make multiple requests.

    Features:
    - Automatic chunking into 7-day periods (Enedis API limit)
    - Granular day-by-day caching
    - ADAM-ERR0123 error handling with progressive retry
    - Returns all data in a single response
    """
    # Get encryption key and effective user for impersonation support
    encryption_key = get_encryption_key(current_user, impersonated_user)
    effective_user = impersonated_user or current_user

    # Adjust date range: cap end date to yesterday (J-1) and ensure start is before end
    start, end = adjust_date_range(start, end)

    # IMPORTANT: Enforce 2-year limit from TODAY (not yesterday)
    # Use Paris timezone since Enedis blocks data at midnight Paris time
    from zoneinfo import ZoneInfo
    paris_tz = ZoneInfo("Europe/Paris")
    today_paris = datetime.now(paris_tz).replace(hour=0, minute=0, second=0, microsecond=0)
    # Convert to naive datetime for comparison (remove timezone info)
    today = today_paris.replace(tzinfo=None)
    yesterday = today - timedelta(days=1)
    # Oldest allowed = today - 2 years (exact)
    oldest_allowed = today.replace(year=today.year - 2)

    logger.info(f"[BATCH DATE LIMIT] Today Paris: {today_paris.strftime('%Y-%m-%d %H:%M:%S %Z')}, Yesterday: {yesterday.strftime('%Y-%m-%d')}, Oldest allowed (today - 2 years): {oldest_allowed.strftime('%Y-%m-%d')}")

    # Cap start date to oldest_allowed (2 years from yesterday)
    start_date_obj = datetime.strptime(start, "%Y-%m-%d")
    if start_date_obj < oldest_allowed:
        start = oldest_allowed.strftime("%Y-%m-%d")
        log_with_pdl("warning", usage_point_id, f"[BATCH] Start date adjusted from {start_date_obj.strftime('%Y-%m-%d')} to {start} (2-year limit)")

    # Cap end date to yesterday
    end_date_obj = datetime.strptime(end, "%Y-%m-%d")
    if end_date_obj > yesterday:
        end = yesterday.strftime("%Y-%m-%d")
        log_with_pdl("warning", usage_point_id, f"[BATCH] End date adjusted from {end_date_obj.strftime('%Y-%m-%d')} to {end} (data only available up to J-1)")

    # Enforce maximum 729 days (today - 2 years to yesterday)
    # This prevents excessive date ranges
    start_date_obj = datetime.strptime(start, "%Y-%m-%d")
    end_date_obj = datetime.strptime(end, "%Y-%m-%d")
    date_range_days = (end_date_obj - start_date_obj).days + 1

    if date_range_days > 729:
        # Adjust start date to be exactly 729 days before end date
        start_date_obj = end_date_obj - timedelta(days=728)  # 728 days + end day = 729 total
        start = start_date_obj.strftime("%Y-%m-%d")
        log_with_pdl("warning", usage_point_id, f"[BATCH] Date range exceeded 729 days, adjusted start to {start} (729 days from {end})")

    # Check if date range is within allowed period (2 years for detail endpoint)
    is_valid, error_response = validate_date_range(start, end, max_years=2, endpoint_type="Detail (Batch)")
    if not is_valid:
        assert error_response is not None
        return error_response

    # Get adapter for user (demo or real)
    adapter, is_demo = await get_adapter_for_user(effective_user)

    # Get valid token
    access_token = None
    if not is_demo:
        token_result = await get_valid_token(usage_point_id, effective_user, db)
        if isinstance(token_result, str):
            access_token = token_result
        else:
            return make_token_error_response(token_result)

    # Generate list of all dates in range
    start_date = datetime.strptime(start, "%Y-%m-%d")
    end_date = datetime.strptime(end, "%Y-%m-%d")
    all_dates = []
    current_date = start_date
    while current_date <= end_date:
        all_dates.append(current_date.strftime("%Y-%m-%d"))
        current_date += timedelta(days=1)

    log_if_debug(effective_user, "info", f"[BATCH] Requested {len(all_dates)} days from {start} to {end}", pdl=usage_point_id)

    # Check cache for each day using OPTIMIZED per-day cache keys
    # OLD format (slow): consumption:detail:{pdl}:{date}T{hour}:{minute} = single reading (312 queries/day)
    # NEW format (fast): consumption:detail:daily:{pdl}:{date} = all readings for day (1 query/day)
    cached_readings = []
    missing_dates = []
    cache_hit_count = 0
    cache_miss_count = 0
    cache_partial_count = 0

    if use_cache:
        for date_str in all_dates:
            # Try NEW per-day cache format first (fast: 1 query per day)
            daily_cache_key = f"consumption:detail:daily:{usage_point_id}:{date_str}"
            daily_cached = await cache_service.get(daily_cache_key, encryption_key)

            if daily_cached and isinstance(daily_cached, dict) and "readings" in daily_cached:
                day_readings = daily_cached["readings"]
                expected_count = daily_cached.get("expected_count", 48)
                min_required = int(expected_count * 0.9)

                if len(day_readings) >= min_required:
                    cached_readings.extend(day_readings)
                    cache_hit_count += 1
                elif len(day_readings) > 0:
                    cached_readings.extend(day_readings)
                    cache_partial_count += 1
                    missing_dates.append(date_str)
                else:
                    cache_miss_count += 1
                    missing_dates.append(date_str)
            else:
                # Cache miss with new format
                cache_miss_count += 1
                missing_dates.append(date_str)
    else:
        missing_dates = all_dates

    # Filter out dates that are too old (> 2 years from yesterday)
    # This can happen if cache contains old data from before the 2-year limit was enforced
    # Reuse the oldest_allowed variable calculated at the beginning of the function (line 797)
    original_missing_count = len(missing_dates)
    missing_dates = [d for d in missing_dates if datetime.strptime(d, "%Y-%m-%d") >= oldest_allowed]

    if original_missing_count > len(missing_dates):
        log_with_pdl("warning", usage_point_id, f"[BATCH] Filtered out {original_missing_count - len(missing_dates)} dates that are too old (> 2 years from yesterday: {oldest_allowed.strftime('%Y-%m-%d')})")

    # Filter out blacklisted dates (dates that have failed > 5 times)
    blacklisted_dates = []
    if missing_dates:
        non_blacklisted_dates = []
        for date in missing_dates:
            if await is_date_blacklisted(usage_point_id, date):
                blacklisted_dates.append(date)
            else:
                non_blacklisted_dates.append(date)

        missing_dates = non_blacklisted_dates

    # Log cache summary report with clear formatting
    log_if_debug(effective_user, "info", "[BATCH CACHE REPORT] ═══════════════════════════════════════════════════════════", pdl=usage_point_id)
    log_if_debug(effective_user, "info", f"[BATCH CACHE REPORT] Period: {start} → {end} ({len(all_dates)} days)", pdl=usage_point_id)
    log_if_debug(effective_user, "info", "[BATCH CACHE REPORT] ───────────────────────────────────────────────────────────", pdl=usage_point_id)
    log_if_debug(effective_user, "info", f"[BATCH CACHE REPORT] ✓ CACHE HIT:     {cache_hit_count:4d} days ({cache_hit_count*100//len(all_dates) if len(all_dates) > 0 else 0:3d}%)", pdl=usage_point_id)
    log_if_debug(effective_user, "info", f"[BATCH CACHE REPORT] ◐ CACHE PARTIAL: {cache_partial_count:4d} days ({cache_partial_count*100//len(all_dates) if len(all_dates) > 0 else 0:3d}%)", pdl=usage_point_id)
    log_if_debug(effective_user, "info", f"[BATCH CACHE REPORT] ✗ CACHE MISS:    {cache_miss_count:4d} days ({cache_miss_count*100//len(all_dates) if len(all_dates) > 0 else 0:3d}%)", pdl=usage_point_id)
    log_if_debug(effective_user, "info", f"[BATCH CACHE REPORT] ⊗ BLACKLISTED:   {len(blacklisted_dates):4d} days ({len(blacklisted_dates)*100//len(all_dates) if len(all_dates) > 0 else 0:3d}%)", pdl=usage_point_id)
    log_if_debug(effective_user, "info", "[BATCH CACHE REPORT] ───────────────────────────────────────────────────────────", pdl=usage_point_id)
    log_if_debug(effective_user, "info", f"[BATCH CACHE REPORT] → TO FETCH:      {len(missing_dates):4d} days (after filtering blacklisted)", pdl=usage_point_id)

    if blacklisted_dates:
        log_if_debug(effective_user, "info", "[BATCH CACHE REPORT] ───────────────────────────────────────────────────────────", pdl=usage_point_id)
        if len(blacklisted_dates) <= 10:
            log_if_debug(effective_user, "info", f"[BATCH CACHE REPORT] Blacklisted dates: {', '.join(blacklisted_dates)}", pdl=usage_point_id)
        else:
            log_if_debug(effective_user, "info", f"[BATCH CACHE REPORT] Blacklisted dates (first 5): {', '.join(blacklisted_dates[:5])}", pdl=usage_point_id)
            log_if_debug(effective_user, "info", f"[BATCH CACHE REPORT] Blacklisted dates (last 5):  {', '.join(blacklisted_dates[-5:])}", pdl=usage_point_id)

    log_if_debug(effective_user, "info", "[BATCH CACHE REPORT] ═══════════════════════════════════════════════════════════", pdl=usage_point_id)

    # Debug: Log first and last missing dates
    if missing_dates:
        log_if_debug(effective_user, "info", f"[BATCH DEBUG] First missing: {missing_dates[0]}, Last missing: {missing_dates[-1]}, Total: {len(missing_dates)}", pdl=usage_point_id)

    # If we have all data from cache, return it immediately
    if not missing_dates:
        log_if_debug(effective_user, "info", "[BATCH] All data served from cache", pdl=usage_point_id)
        return APIResponse(success=True, data={"meter_reading": {"interval_reading": cached_readings}})

    # Check rate limit only if we need to fetch from Enedis
    route = request.scope.get("route")
    endpoint_path = route.path if route else request.url.path
    is_allowed, error_response = await check_rate_limit(current_user.id, use_cache, current_user.is_admin, endpoint_path)
    if not is_allowed:
        # If rate limited and we have some cached data, return what we have
        if cached_readings:
            log_with_pdl("warning", usage_point_id, "[BATCH RATE LIMITED] Returning partial cached data")
            return APIResponse(
                success=True,
                data={"meter_reading": {"interval_reading": cached_readings}},
                error=ErrorDetail(code="PARTIAL_DATA", message="Rate limit exceeded. Returning cached data only.")
            )
        assert error_response is not None
        return error_response

    # Split missing dates into weekly chunks (max 7 days per Enedis API call)
    # IMPORTANT: Group only CONSECUTIVE dates together
    week_chunks = []
    i = 0
    while i < len(missing_dates):
        chunk_start = missing_dates[i]
        chunk_dates = [missing_dates[i]]

        # Find consecutive dates (up to 7 days)
        j = i + 1
        while j < len(missing_dates) and len(chunk_dates) < 7:
            prev_date = datetime.strptime(missing_dates[j-1], "%Y-%m-%d")
            curr_date = datetime.strptime(missing_dates[j], "%Y-%m-%d")

            # Check if dates are consecutive (difference of 1 day)
            if (curr_date - prev_date).days == 1:
                chunk_dates.append(missing_dates[j])
                j += 1
            else:
                # Not consecutive, start a new chunk
                break

        chunk_end = chunk_dates[-1]
        week_chunks.append((chunk_start, chunk_end))
        i = j  # Move to next non-consecutive date

    total_chunks = len(week_chunks)
    log_if_debug(effective_user, "info", f"[BATCH] Split into {total_chunks} chunks from {len(missing_dates)} missing dates", pdl=usage_point_id)

    # Fetch each chunk from Enedis with retry logic for ADAM-ERR0123
    all_readings = []
    fetched_count = 0
    error_encountered = False

    for chunk_idx, (chunk_start, chunk_end) in enumerate(week_chunks):
        try:
            # Target end date for this chunk
            chunk_end_date = datetime.strptime(chunk_end, "%Y-%m-%d")

            # Calculate chunk size for logging
            chunk_start_date = datetime.strptime(chunk_start, "%Y-%m-%d")
            chunk_size = (chunk_end_date - chunk_start_date).days + 1
            log_if_debug(effective_user, "info", f"[BATCH FETCH {chunk_idx+1}/{len(week_chunks)}] {chunk_start} to {chunk_end} ({chunk_size} days)", pdl=usage_point_id)

            # Fetch with retry logic for ADAM-ERR0123
            current_start = datetime.strptime(chunk_start, "%Y-%m-%d")
            retry_count = 0
            max_retries = 7
            chunk_data = None

            while current_start <= chunk_end_date and retry_count < max_retries:
                current_start_str = current_start.strftime("%Y-%m-%d")

                # IMPORTANT: Calculate fetch_end for each attempt
                # Add 1 day to get the 23:30 reading of the last day, but respect 7-day Enedis limit
                days_in_period = (chunk_end_date - current_start).days
                if days_in_period > 6:  # More than 7 days (0-6 = 7 days)
                    # Limit to 7 days from current_start
                    fetch_end_date = current_start + timedelta(days=7)
                else:
                    # Use chunk_end + 1 day to get last 23:30 reading
                    fetch_end_date = chunk_end_date + timedelta(days=1)

                # CRITICAL: Never request data beyond today (Enedis returns J-1 data when end=today)
                # We use TODAY (not yesterday) as the cap because Enedis API requires end > start
                # and returns data up to J-1 of the end date
                if fetch_end_date > today:
                    fetch_end_date = today

                fetch_end = fetch_end_date.strftime("%Y-%m-%d")

                # CRITICAL: Enedis requires at least 2 days (start != end)
                # If we would skip, extend start backwards to ensure we have a valid range
                if current_start_str == fetch_end:
                    # Extend start 1 day backwards to get a 2-day range
                    extended_start = current_start - timedelta(days=1)
                    current_start_str = extended_start.strftime("%Y-%m-%d")
                    log_with_pdl("info", usage_point_id, f"[BATCH EXTEND] Extended start from {current_start.strftime('%Y-%m-%d')} to {current_start_str} to ensure min 2-day range")

                try:
                    if is_demo:
                        chunk_data = await adapter.get_consumption_detail(usage_point_id, current_start_str, fetch_end, encryption_key)
                    else:
                        chunk_data = await adapter.get_consumption_detail(usage_point_id, current_start_str, fetch_end, access_token)

                    # Check for errors that should trigger immediate blacklist
                    if isinstance(chunk_data, dict) and "error" in chunk_data:
                        error_code = chunk_data.get("error", "")

                        # no_data_found: Blacklist the entire week immediately
                        if error_code == "no_data_found":
                            log_with_pdl("warning", usage_point_id, f"[BATCH BLACKLIST] no_data_found for {current_start_str} to {fetch_end}, blacklisting entire period")

                            # Blacklist all dates in the requested range
                            current_date = datetime.strptime(current_start_str, "%Y-%m-%d")
                            end_date = datetime.strptime(fetch_end, "%Y-%m-%d")
                            while current_date < end_date:
                                date_str = current_date.strftime("%Y-%m-%d")
                                await blacklist_date(usage_point_id, date_str)
                                current_date += timedelta(days=1)

                            # Skip this entire chunk
                            break

                        # ADAM-ERR0123: Retry with next day
                        elif error_code == "ADAM-ERR0123":
                            log_with_pdl("warning", usage_point_id, f"[BATCH RETRY] ADAM-ERR0123 for {current_start_str}, trying next day...")

                            # Increment fail counter for this date
                            fail_count = await increment_date_fail_count(usage_point_id, current_start_str)
                            log_if_debug(effective_user, "debug", f"[BATCH FAIL COUNT] {current_start_str} now has {fail_count} failures", pdl=usage_point_id)

                            # Blacklist if > 5 failures
                            if fail_count > 5:
                                await blacklist_date(usage_point_id, current_start_str)

                            current_start += timedelta(days=1)
                            retry_count += 1
                            continue

                    # Success! Break out of retry loop
                    break

                except Exception as e:
                    error_msg = str(e)
                    log_with_pdl("error", usage_point_id, f"[BATCH ERROR] Failed to fetch {current_start_str} to {fetch_end}: {e}")

                    # Check if this is a no_data_found error - blacklist entire period immediately
                    if "no_data_found" in error_msg:
                        log_with_pdl("warning", usage_point_id, f"[BATCH BLACKLIST] no_data_found for {current_start_str} to {fetch_end}, blacklisting entire period")

                        # Blacklist all dates in the requested range
                        current_date = datetime.strptime(current_start_str, "%Y-%m-%d")
                        end_date = datetime.strptime(fetch_end, "%Y-%m-%d")
                        while current_date < end_date:
                            date_str = current_date.strftime("%Y-%m-%d")
                            await blacklist_date(usage_point_id, date_str)
                            current_date += timedelta(days=1)

                        # Skip this entire chunk
                        break

                    # For other errors: increment fail counter and retry
                    fail_count = await increment_date_fail_count(usage_point_id, current_start_str)
                    log_if_debug(effective_user, "debug", f"[BATCH FAIL COUNT] {current_start_str} now has {fail_count} failures", pdl=usage_point_id)

                    # Blacklist if > 5 failures
                    if fail_count > 5:
                        await blacklist_date(usage_point_id, current_start_str)

                    # Try next day
                    current_start += timedelta(days=1)
                    retry_count += 1

            # If we exhausted all retries, log and continue to next chunk
            if retry_count >= max_retries:
                log_with_pdl("warning", usage_point_id, f"[BATCH SKIP] Skipped chunk {chunk_start} to {chunk_end} after {retry_count} retries")
                error_encountered = True
                continue

            # Extract readings from chunk_data
            readings = []
            if isinstance(chunk_data, dict):
                if "meter_reading" in chunk_data and "interval_reading" in chunk_data["meter_reading"]:
                    readings = chunk_data["meter_reading"]["interval_reading"]
                elif "interval_reading" in chunk_data:
                    readings = chunk_data["interval_reading"]

            # Cache readings grouped by day (OPTIMIZED: 1 cache entry per day instead of per timestamp)
            if use_cache and readings:
                # Group readings by date
                readings_by_date: dict[str, list] = {}
                interval_length = "PT30M"  # Default

                for reading in readings:
                    timestamp = reading.get("date", "")
                    if timestamp:
                        # Extract date part (YYYY-MM-DD)
                        date_part = timestamp.replace("T", " ").split(" ")[0]
                        if date_part not in readings_by_date:
                            readings_by_date[date_part] = []
                        readings_by_date[date_part].append(reading)

                        # Detect interval length from first reading
                        if "interval_length" in reading:
                            interval_length = reading["interval_length"]

                # Determine expected count based on interval
                expected_count = 48  # Default PT30M
                if interval_length == "PT10M":
                    expected_count = 144
                elif interval_length == "PT15M":
                    expected_count = 96
                elif interval_length == "PT30M":
                    expected_count = 48
                elif interval_length == "PT60M":
                    expected_count = 24

                # Store each day's readings as a single cache entry
                for date_str, day_readings in readings_by_date.items():
                    daily_cache_key = f"consumption:detail:daily:{usage_point_id}:{date_str}"
                    cache_data = {
                        "readings": day_readings,
                        "expected_count": expected_count,
                        "interval_length": interval_length,
                        "count": len(day_readings)
                    }
                    await cache_service.set(daily_cache_key, cache_data, encryption_key)

                log_if_debug(effective_user, "debug", f"[BATCH CACHE SET] {chunk_start} to {chunk_end} ({len(readings)} readings in {len(readings_by_date)} days)", pdl=usage_point_id)

            all_readings.extend(readings)
            fetched_count += 1

        except Exception as e:
            log_with_pdl("error", usage_point_id, f"[BATCH ERROR] Failed chunk {chunk_start} to {chunk_end}: {e}")
            error_encountered = True
            # Continue with next chunk

    # Combine cached readings with newly fetched readings
    all_readings.extend(cached_readings)

    # Sort by timestamp
    all_readings.sort(key=lambda x: x.get("date", ""))

    log_if_debug(effective_user, "info", f"[BATCH COMPLETE] Total readings: {len(all_readings)}, Fetched chunks: {fetched_count}/{len(week_chunks)}", pdl=usage_point_id)

    if not all_readings:
        return APIResponse(
            success=False,
            error=ErrorDetail(
                code="NO_DATA",
                message="No consumption data available for this period. This may be before the meter activation date."
            )
        )

    # Return success with optional warning if some chunks failed
    response_data = {"meter_reading": {"interval_reading": all_readings}}

    if error_encountered:
        return APIResponse(
            success=True,
            data=response_data,
            error=ErrorDetail(
                code="PARTIAL_DATA",
                message=f"Some data could not be fetched (possibly before activation date). Returning {len(all_readings)} readings."
            )
        )

    return APIResponse(success=True, data=response_data)


@router.get("/power/{usage_point_id}", response_model=APIResponse)
async def get_max_power(
    request: Request,
    usage_point_id: str = Path(..., description="Point de livraison (14 chiffres). 💡 **Astuce**: Utilisez d'abord `GET /pdl/` pour lister vos PDL disponibles.", openapi_examples={"standard_pdl": {"summary": "Standard PDL", "value": "12345678901234"}, "test_pdl": {"summary": "Test PDL", "value": "00000000000000"}}),
    start: str = Query(..., description="Start date (YYYY-MM-DD)", openapi_examples={"current_year": {"summary": "Start of 2024", "value": "2024-01-01"}, "recent_month": {"summary": "Month start", "value": "2024-10-01"}}),
    end: str = Query(..., description="End date (YYYY-MM-DD)", openapi_examples={"current_year": {"summary": "End of 2024", "value": "2024-12-31"}, "recent_month": {"summary": "Month end", "value": "2024-10-31"}}),
    use_cache: bool = Query(False, description="Use cached data if available", openapi_examples={"with_cache": {"summary": "Use cache", "value": True}, "without_cache": {"summary": "Fresh data", "value": False}}),
    current_user: User = Depends(get_current_user),
    impersonated_user: Optional[User] = Depends(get_impersonation_context),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Get maximum power data"""
    # Get encryption key and effective user for impersonation support
    encryption_key = get_encryption_key(current_user, impersonated_user)
    effective_user = impersonated_user or current_user

    token_result = await get_valid_token(usage_point_id, effective_user, db)
    if isinstance(token_result, str):
        access_token = token_result
    else:
        return make_token_error_response(token_result)

    # Check rate limit - use route path template instead of actual path
    route = request.scope.get("route")
    endpoint_path = route.path if route else request.url.path
    is_allowed, error_response = await check_rate_limit(current_user.id, use_cache, current_user.is_admin, endpoint_path)
    if not is_allowed:
        assert error_response is not None
        return error_response

    # Check cache
    if use_cache:
        cache_key = cache_service.make_cache_key(usage_point_id, "power", start=start, end=end)
        cached_data = await cache_service.get(cache_key, encryption_key)
        if cached_data:
            return APIResponse(success=True, data=cached_data)

    try:
        # Use appropriate adapter based on user type
        adapter, is_demo = await get_adapter_for_user(effective_user)
        if is_demo:
            data = await adapter.get_max_power(usage_point_id, start, end, encryption_key)
        else:
            data = await adapter.get_max_power(usage_point_id, start, end, access_token)

        # Cache result
        if use_cache:
            await cache_service.set(cache_key, data, encryption_key)

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
    impersonated_user: Optional[User] = Depends(get_impersonation_context),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Get daily production data"""
    # Get encryption key and effective user for impersonation support
    encryption_key = get_encryption_key(current_user, impersonated_user)
    effective_user = impersonated_user or current_user

    token_result = await get_valid_token(usage_point_id, effective_user, db)
    if isinstance(token_result, str):
        access_token = token_result
    else:
        return make_token_error_response(token_result)

    # Check rate limit - use route path template instead of actual path
    route = request.scope.get("route")
    endpoint_path = route.path if route else request.url.path
    is_allowed, error_response = await check_rate_limit(current_user.id, use_cache, current_user.is_admin, endpoint_path)
    if not is_allowed:
        assert error_response is not None
        return error_response

    # Check cache
    if use_cache:
        cache_key = cache_service.make_cache_key(usage_point_id, "production_daily", start=start, end=end)
        cached_data = await cache_service.get(cache_key, encryption_key)
        if cached_data:
            return APIResponse(success=True, data=cached_data)

    try:
        # Use appropriate adapter based on user type
        adapter, is_demo = await get_adapter_for_user(effective_user)
        if is_demo:
            data = await adapter.get_production_daily(usage_point_id, start, end, encryption_key)
        else:
            data = await adapter.get_production_daily(usage_point_id, start, end, access_token)

        # Cache result
        if use_cache:
            await cache_service.set(cache_key, data, encryption_key)

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
    impersonated_user: Optional[User] = Depends(get_impersonation_context),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Get detailed production data"""
    # Get encryption key and effective user for impersonation support
    encryption_key = get_encryption_key(current_user, impersonated_user)
    effective_user = impersonated_user or current_user

    token_result = await get_valid_token(usage_point_id, effective_user, db)
    if isinstance(token_result, str):
        access_token = token_result
    else:
        return make_token_error_response(token_result)

    # Check rate limit - use route path template instead of actual path
    route = request.scope.get("route")
    endpoint_path = route.path if route else request.url.path
    is_allowed, error_response = await check_rate_limit(current_user.id, use_cache, current_user.is_admin, endpoint_path)
    if not is_allowed:
        assert error_response is not None
        return error_response

    # Check cache
    if use_cache:
        cache_key = cache_service.make_cache_key(usage_point_id, "production_detail", start=start, end=end)
        cached_data = await cache_service.get(cache_key, encryption_key)
        if cached_data:
            return APIResponse(success=True, data=cached_data)

    try:
        # Use appropriate adapter based on user type
        adapter, is_demo = await get_adapter_for_user(effective_user)
        if is_demo:
            data = await adapter.get_production_detail(usage_point_id, start, end, encryption_key)
        else:
            data = await adapter.get_production_detail(usage_point_id, start, end, access_token)

        # Cache result
        if use_cache:
            await cache_service.set(cache_key, data, encryption_key)

        return APIResponse(success=True, data=data)
    except Exception as e:
        return APIResponse(success=False, error=ErrorDetail(code="ENEDIS_ERROR", message=str(e)))


@router.get("/production/detail/batch/{usage_point_id}", response_model=APIResponse)
async def get_production_detail_batch(
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
        description="Start date (YYYY-MM-DD) - Can be up to 2 years in the past",
        openapi_examples={
            "two_years": {"summary": "2 years back", "value": "2023-01-01"},
            "recent_month": {"summary": "Recent month", "value": "2024-10-01"}
        }
    ),
    end: str = Query(
        ...,
        description="End date (YYYY-MM-DD)",
        openapi_examples={
            "today": {"summary": "Today", "value": "2024-12-31"},
            "recent_month": {"summary": "Month end", "value": "2024-10-31"}
        }
    ),
    use_cache: bool = Query(
        True,
        description="Use cached data if available (recommended for batch requests)",
        openapi_examples={
            "with_cache": {"summary": "Use cache", "value": True},
            "without_cache": {"summary": "Fresh data", "value": False}
        }
    ),
    current_user: User = Depends(get_current_user),
    impersonated_user: Optional[User] = Depends(get_impersonation_context),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """
    Get detailed production data (load curve) for a large date range (max 2 years).

    This endpoint automatically splits large date ranges into weekly chunks (7 days max per Enedis API call)
    and returns all data aggregated. This eliminates the need for the frontend to make multiple requests.

    Features:
    - Automatic chunking into 7-day periods (Enedis API limit)
    - Granular day-by-day caching
    - ADAM-ERR0123 error handling with progressive retry
    - Returns all data in a single response
    """
    # Get encryption key and effective user for impersonation support
    encryption_key = get_encryption_key(current_user, impersonated_user)
    effective_user = impersonated_user or current_user

    # Adjust date range: cap end date to yesterday (J-1) and ensure start is before end
    start, end = adjust_date_range(start, end)

    # IMPORTANT: Enforce 2-year limit from TODAY (not yesterday)
    # Use Paris timezone since Enedis blocks data at midnight Paris time
    from zoneinfo import ZoneInfo
    paris_tz = ZoneInfo("Europe/Paris")
    today_paris = datetime.now(paris_tz).replace(hour=0, minute=0, second=0, microsecond=0)
    # Convert to naive datetime for comparison (remove timezone info)
    today = today_paris.replace(tzinfo=None)
    yesterday = today - timedelta(days=1)
    # Oldest allowed = today - 2 years (exact)
    oldest_allowed = today.replace(year=today.year - 2)

    logger.info(f"[BATCH PRODUCTION DATE LIMIT] Today Paris: {today_paris.strftime('%Y-%m-%d %H:%M:%S %Z')}, Yesterday: {yesterday.strftime('%Y-%m-%d')}, Oldest allowed (today - 2 years): {oldest_allowed.strftime('%Y-%m-%d')}")

    # Cap start date to oldest_allowed (2 years from yesterday)
    start_date_obj = datetime.strptime(start, "%Y-%m-%d")
    if start_date_obj < oldest_allowed:
        start = oldest_allowed.strftime("%Y-%m-%d")
        log_with_pdl("warning", usage_point_id, f"[BATCH PRODUCTION] Start date adjusted from {start_date_obj.strftime('%Y-%m-%d')} to {start} (2-year limit)")

    # Cap end date to yesterday
    end_date_obj = datetime.strptime(end, "%Y-%m-%d")
    if end_date_obj > yesterday:
        end = yesterday.strftime("%Y-%m-%d")
        log_with_pdl("warning", usage_point_id, f"[BATCH PRODUCTION] End date adjusted from {end_date_obj.strftime('%Y-%m-%d')} to {end} (data only available up to J-1)")

    # Enforce maximum 729 days (today - 2 years to yesterday)
    # This prevents excessive date ranges
    start_date_obj = datetime.strptime(start, "%Y-%m-%d")
    end_date_obj = datetime.strptime(end, "%Y-%m-%d")
    date_range_days = (end_date_obj - start_date_obj).days + 1

    if date_range_days > 729:
        # Adjust start date to be exactly 729 days before end date
        start_date_obj = end_date_obj - timedelta(days=728)  # 728 days + end day = 729 total
        start = start_date_obj.strftime("%Y-%m-%d")
        log_with_pdl("warning", usage_point_id, f"[BATCH PRODUCTION] Date range exceeded 729 days, adjusted start to {start} (729 days from {end})")

    # Check if date range is within allowed period (2 years for detail endpoint)
    is_valid, error_response = validate_date_range(start, end, max_years=2, endpoint_type="Production Detail (Batch)")
    if not is_valid:
        assert error_response is not None
        return error_response

    # Get adapter for user (demo or real) - use effective_user for impersonation
    adapter, is_demo = await get_adapter_for_user(effective_user)

    # Get valid token
    access_token = None
    if not is_demo:
        token_result = await get_valid_token(usage_point_id, effective_user, db)
        if isinstance(token_result, str):
            access_token = token_result
        else:
            return make_token_error_response(token_result)

    # Generate list of all dates in range
    start_date = datetime.strptime(start, "%Y-%m-%d")
    end_date = datetime.strptime(end, "%Y-%m-%d")
    all_dates = []
    current_date = start_date
    while current_date <= end_date:
        all_dates.append(current_date.strftime("%Y-%m-%d"))
        current_date += timedelta(days=1)

    log_if_debug(effective_user, "info", f"[BATCH PRODUCTION] Requested {len(all_dates)} days from {start} to {end}", pdl=usage_point_id)

    # Check cache for each day using OPTIMIZED per-day cache keys
    # OLD format (slow): production:detail:{pdl}:{date}T{hour}:{minute} = single reading (312 queries/day)
    # NEW format (fast): production:detail:daily:{pdl}:{date} = all readings for day (1 query/day)
    cached_readings = []
    missing_dates = []
    cache_hit_count = 0
    cache_miss_count = 0
    cache_partial_count = 0

    if use_cache:
        for date_str in all_dates:
            # Try NEW per-day cache format first (fast: 1 query per day)
            daily_cache_key = f"production:detail:daily:{usage_point_id}:{date_str}"
            daily_cached = await cache_service.get(daily_cache_key, encryption_key)

            if daily_cached and isinstance(daily_cached, dict) and "readings" in daily_cached:
                day_readings = daily_cached["readings"]
                expected_count = daily_cached.get("expected_count", 48)
                min_required = int(expected_count * 0.9)

                if len(day_readings) >= min_required:
                    cached_readings.extend(day_readings)
                    cache_hit_count += 1
                elif len(day_readings) > 0:
                    cached_readings.extend(day_readings)
                    cache_partial_count += 1
                    missing_dates.append(date_str)
                else:
                    cache_miss_count += 1
                    missing_dates.append(date_str)
            else:
                # Cache miss with new format
                cache_miss_count += 1
                missing_dates.append(date_str)
    else:
        missing_dates = all_dates

    # Filter out dates that are too old (> 2 years from yesterday)
    # This can happen if cache contains old data from before the 2-year limit was enforced
    # Reuse the oldest_allowed variable calculated at the beginning of the function
    original_missing_count = len(missing_dates)
    missing_dates = [d for d in missing_dates if datetime.strptime(d, "%Y-%m-%d") >= oldest_allowed]

    if original_missing_count > len(missing_dates):
        log_with_pdl("warning", usage_point_id, f"[BATCH PRODUCTION] Filtered out {original_missing_count - len(missing_dates)} dates that are too old (> 2 years from yesterday: {oldest_allowed.strftime('%Y-%m-%d')})")

    # Filter out blacklisted dates (dates that have failed > 5 times)
    blacklisted_dates = []
    if missing_dates:
        non_blacklisted_dates = []
        for date in missing_dates:
            if await is_date_blacklisted(usage_point_id, date):
                blacklisted_dates.append(date)
            else:
                non_blacklisted_dates.append(date)

        missing_dates = non_blacklisted_dates

    # Log cache summary report with clear formatting
    log_if_debug(effective_user, "info", "[BATCH PRODUCTION CACHE REPORT] ═══════════════════════════════════════════════════════════", pdl=usage_point_id)
    log_if_debug(effective_user, "info", f"[BATCH PRODUCTION CACHE REPORT] Period: {start} → {end} ({len(all_dates)} days)", pdl=usage_point_id)
    log_if_debug(effective_user, "info", "[BATCH PRODUCTION CACHE REPORT] ───────────────────────────────────────────────────────────", pdl=usage_point_id)
    log_if_debug(effective_user, "info", f"[BATCH PRODUCTION CACHE REPORT] ✓ CACHE HIT:     {cache_hit_count:4d} days ({cache_hit_count*100//len(all_dates) if len(all_dates) > 0 else 0:3d}%)", pdl=usage_point_id)
    log_if_debug(effective_user, "info", f"[BATCH PRODUCTION CACHE REPORT] ◐ CACHE PARTIAL: {cache_partial_count:4d} days ({cache_partial_count*100//len(all_dates) if len(all_dates) > 0 else 0:3d}%)", pdl=usage_point_id)
    log_if_debug(effective_user, "info", f"[BATCH PRODUCTION CACHE REPORT] ✗ CACHE MISS:    {cache_miss_count:4d} days ({cache_miss_count*100//len(all_dates) if len(all_dates) > 0 else 0:3d}%)", pdl=usage_point_id)
    log_if_debug(effective_user, "info", f"[BATCH PRODUCTION CACHE REPORT] ⊗ BLACKLISTED:   {len(blacklisted_dates):4d} days ({len(blacklisted_dates)*100//len(all_dates) if len(all_dates) > 0 else 0:3d}%)", pdl=usage_point_id)
    log_if_debug(effective_user, "info", "[BATCH PRODUCTION CACHE REPORT] ───────────────────────────────────────────────────────────", pdl=usage_point_id)
    log_if_debug(effective_user, "info", f"[BATCH PRODUCTION CACHE REPORT] → TO FETCH:      {len(missing_dates):4d} days (after filtering blacklisted)", pdl=usage_point_id)

    if blacklisted_dates:
        log_if_debug(effective_user, "info", "[BATCH PRODUCTION CACHE REPORT] ───────────────────────────────────────────────────────────", pdl=usage_point_id)
        if len(blacklisted_dates) <= 10:
            log_if_debug(effective_user, "info", f"[BATCH PRODUCTION CACHE REPORT] Blacklisted dates: {', '.join(blacklisted_dates)}", pdl=usage_point_id)
        else:
            log_if_debug(effective_user, "info", f"[BATCH PRODUCTION CACHE REPORT] Blacklisted dates (first 5): {', '.join(blacklisted_dates[:5])}", pdl=usage_point_id)
            log_if_debug(effective_user, "info", f"[BATCH PRODUCTION CACHE REPORT] Blacklisted dates (last 5):  {', '.join(blacklisted_dates[-5:])}", pdl=usage_point_id)

    log_if_debug(effective_user, "info", "[BATCH PRODUCTION CACHE REPORT] ═══════════════════════════════════════════════════════════", pdl=usage_point_id) # Empty line with PDL for better readability

    # If we have all data from cache, return it immediately
    if not missing_dates:
        log_if_debug(effective_user, "info", "[BATCH PRODUCTION] All data served from cache", pdl=usage_point_id)
        return APIResponse(success=True, data={"meter_reading": {"interval_reading": cached_readings}})

    # Check rate limit only if we need to fetch from Enedis
    route = request.scope.get("route")
    endpoint_path = route.path if route else request.url.path
    is_allowed, error_response = await check_rate_limit(current_user.id, use_cache, current_user.is_admin, endpoint_path)
    if not is_allowed:
        # If rate limited and we have some cached data, return what we have
        if cached_readings:
            log_with_pdl("warning", usage_point_id, "[BATCH PRODUCTION RATE LIMITED] Returning partial cached data")
            return APIResponse(
                success=True,
                data={"meter_reading": {"interval_reading": cached_readings}},
                error=ErrorDetail(code="PARTIAL_DATA", message="Rate limit exceeded. Returning cached data only.")
            )
        assert error_response is not None
        return error_response

    # Split missing dates into weekly chunks (max 7 days per Enedis API call)
    # IMPORTANT: Group only CONSECUTIVE dates together
    week_chunks = []
    i = 0
    while i < len(missing_dates):
        chunk_start = missing_dates[i]
        chunk_dates = [missing_dates[i]]

        # Find consecutive dates (up to 7 days)
        j = i + 1
        while j < len(missing_dates) and len(chunk_dates) < 7:
            prev_date = datetime.strptime(missing_dates[j-1], "%Y-%m-%d")
            curr_date = datetime.strptime(missing_dates[j], "%Y-%m-%d")

            # Check if dates are consecutive (difference of 1 day)
            if (curr_date - prev_date).days == 1:
                chunk_dates.append(missing_dates[j])
                j += 1
            else:
                # Not consecutive, start a new chunk
                break

        chunk_end = chunk_dates[-1]
        week_chunks.append((chunk_start, chunk_end))
        i = j  # Move to next non-consecutive date

    total_chunks = len(week_chunks)
    log_if_debug(effective_user, "info", f"[BATCH PRODUCTION] Split into {total_chunks} chunks from {len(missing_dates)} missing dates", pdl=usage_point_id)

    # Fetch each chunk from Enedis with retry logic for ADAM-ERR0123
    all_readings = []
    fetched_count = 0
    error_encountered = False

    for chunk_idx, (chunk_start, chunk_end) in enumerate(week_chunks):
        try:
            # Target end date for this chunk
            chunk_end_date = datetime.strptime(chunk_end, "%Y-%m-%d")

            # Calculate chunk size for logging
            chunk_start_date = datetime.strptime(chunk_start, "%Y-%m-%d")
            chunk_size = (chunk_end_date - chunk_start_date).days + 1
            log_if_debug(effective_user, "info", f"[BATCH PRODUCTION FETCH {chunk_idx+1}/{len(week_chunks)}] {chunk_start} to {chunk_end} ({chunk_size} days)", pdl=usage_point_id)

            # Fetch with retry logic for ADAM-ERR0123
            current_start = datetime.strptime(chunk_start, "%Y-%m-%d")
            retry_count = 0
            max_retries = 7
            chunk_data = None

            while current_start <= chunk_end_date and retry_count < max_retries:
                current_start_str = current_start.strftime("%Y-%m-%d")

                # IMPORTANT: Calculate fetch_end for each attempt
                # Add 1 day to get the 23:30 reading of the last day, but respect 7-day Enedis limit
                days_in_period = (chunk_end_date - current_start).days
                if days_in_period > 6:  # More than 7 days (0-6 = 7 days)
                    # Limit to 7 days from current_start
                    fetch_end_date = current_start + timedelta(days=7)
                else:
                    # Use chunk_end + 1 day to get last 23:30 reading
                    fetch_end_date = chunk_end_date + timedelta(days=1)

                # CRITICAL: Never request data beyond today (Enedis returns J-1 data when end=today)
                # We use TODAY (not yesterday) as the cap because Enedis API requires end > start
                # and returns data up to J-1 of the end date
                if fetch_end_date > today:
                    fetch_end_date = today

                fetch_end = fetch_end_date.strftime("%Y-%m-%d")

                # CRITICAL: Enedis requires at least 2 days (start != end)
                # If we would skip, extend start backwards to ensure we have a valid range
                if current_start_str == fetch_end:
                    # Extend start 1 day backwards to get a 2-day range
                    extended_start = current_start - timedelta(days=1)
                    current_start_str = extended_start.strftime("%Y-%m-%d")
                    log_with_pdl("info", usage_point_id, f"[BATCH PRODUCTION EXTEND] Extended start from {current_start.strftime('%Y-%m-%d')} to {current_start_str} to ensure min 2-day range")

                try:
                    if is_demo:
                        chunk_data = await adapter.get_production_detail(usage_point_id, current_start_str, fetch_end, encryption_key)
                    else:
                        chunk_data = await adapter.get_production_detail(usage_point_id, current_start_str, fetch_end, access_token)

                    # Check for errors that should trigger immediate blacklist
                    if isinstance(chunk_data, dict) and "error" in chunk_data:
                        error_code = chunk_data.get("error", "")

                        # no_data_found: Blacklist the entire week immediately
                        if error_code == "no_data_found":
                            log_with_pdl("warning", usage_point_id, f"[BATCH PRODUCTION BLACKLIST] no_data_found for {current_start_str} to {fetch_end}, blacklisting entire period")

                            # Blacklist all dates in the requested range
                            current_date = datetime.strptime(current_start_str, "%Y-%m-%d")
                            end_date = datetime.strptime(fetch_end, "%Y-%m-%d")
                            while current_date < end_date:
                                date_str = current_date.strftime("%Y-%m-%d")
                                await blacklist_date(usage_point_id, date_str)
                                current_date += timedelta(days=1)

                            # Skip this entire chunk
                            break

                        # ADAM-ERR0123: Retry with next day
                        elif error_code == "ADAM-ERR0123":
                            log_with_pdl("warning", usage_point_id, f"[BATCH PRODUCTION RETRY] ADAM-ERR0123 for {current_start_str}, trying next day...")

                            # Increment fail counter for this date
                            fail_count = await increment_date_fail_count(usage_point_id, current_start_str)
                            log_if_debug(effective_user, "debug", f"[BATCH PRODUCTION FAIL COUNT] {current_start_str} now has {fail_count} failures", pdl=usage_point_id)

                            # Blacklist if > 5 failures
                            if fail_count > 5:
                                await blacklist_date(usage_point_id, current_start_str)

                            current_start += timedelta(days=1)
                            retry_count += 1
                            continue

                    # Success! Break out of retry loop
                    break

                except Exception as e:
                    error_msg = str(e)
                    log_with_pdl("error", usage_point_id, f"[BATCH PRODUCTION ERROR] Failed to fetch {current_start_str} to {fetch_end}: {e}")

                    # Check if this is a no_data_found error - blacklist entire period immediately
                    if "no_data_found" in error_msg:
                        log_with_pdl("warning", usage_point_id, f"[BATCH PRODUCTION BLACKLIST] no_data_found for {current_start_str} to {fetch_end}, blacklisting entire period")

                        # Blacklist all dates in the requested range
                        current_date = datetime.strptime(current_start_str, "%Y-%m-%d")
                        end_date = datetime.strptime(fetch_end, "%Y-%m-%d")
                        while current_date < end_date:
                            date_str = current_date.strftime("%Y-%m-%d")
                            await blacklist_date(usage_point_id, date_str)
                            current_date += timedelta(days=1)

                        # Skip this entire chunk
                        break

                    # For other errors: increment fail counter and retry
                    fail_count = await increment_date_fail_count(usage_point_id, current_start_str)
                    log_if_debug(effective_user, "debug", f"[BATCH PRODUCTION FAIL COUNT] {current_start_str} now has {fail_count} failures", pdl=usage_point_id)

                    # Blacklist if > 5 failures
                    if fail_count > 5:
                        await blacklist_date(usage_point_id, current_start_str)

                    # Try next day
                    current_start += timedelta(days=1)
                    retry_count += 1

            # If we exhausted all retries, log and continue to next chunk
            if retry_count >= max_retries:
                log_with_pdl("warning", usage_point_id, f"[BATCH PRODUCTION SKIP] Skipped chunk {chunk_start} to {chunk_end} after {retry_count} retries")
                error_encountered = True
                continue

            # Extract readings from chunk_data
            readings = []
            if isinstance(chunk_data, dict):
                if "meter_reading" in chunk_data and "interval_reading" in chunk_data["meter_reading"]:
                    readings = chunk_data["meter_reading"]["interval_reading"]
                elif "interval_reading" in chunk_data:
                    readings = chunk_data["interval_reading"]

            # Cache readings grouped by day (OPTIMIZED: 1 cache entry per day instead of per timestamp)
            if use_cache and readings:
                # Group readings by date
                readings_by_date: dict[str, list] = {}
                interval_length = "PT30M"  # Default

                for reading in readings:
                    timestamp = reading.get("date", "")
                    if timestamp:
                        # Extract date part (YYYY-MM-DD)
                        date_part = timestamp.replace("T", " ").split(" ")[0]
                        if date_part not in readings_by_date:
                            readings_by_date[date_part] = []
                        readings_by_date[date_part].append(reading)

                        # Detect interval length from first reading
                        if "interval_length" in reading:
                            interval_length = reading["interval_length"]

                # Determine expected count based on interval
                expected_count = 48  # Default PT30M
                if interval_length == "PT10M":
                    expected_count = 144
                elif interval_length == "PT15M":
                    expected_count = 96
                elif interval_length == "PT30M":
                    expected_count = 48
                elif interval_length == "PT60M":
                    expected_count = 24

                # Store each day's readings as a single cache entry
                for date_str, day_readings in readings_by_date.items():
                    daily_cache_key = f"production:detail:daily:{usage_point_id}:{date_str}"
                    cache_data = {
                        "readings": day_readings,
                        "expected_count": expected_count,
                        "interval_length": interval_length,
                        "count": len(day_readings)
                    }
                    await cache_service.set(daily_cache_key, cache_data, encryption_key)

                log_if_debug(effective_user, "debug", f"[BATCH PRODUCTION CACHE SET] {chunk_start} to {chunk_end} ({len(readings)} readings in {len(readings_by_date)} days)", pdl=usage_point_id)

            all_readings.extend(readings)
            fetched_count += 1

        except Exception as e:
            log_with_pdl("error", usage_point_id, f"[BATCH PRODUCTION ERROR] Failed chunk {chunk_start} to {chunk_end}: {e}")
            error_encountered = True
            # Continue with next chunk

    # Combine cached readings with newly fetched readings
    all_readings.extend(cached_readings)

    # Sort by timestamp
    all_readings.sort(key=lambda x: x.get("date", ""))

    log_if_debug(effective_user, "info", f"[BATCH PRODUCTION COMPLETE] Total readings: {len(all_readings)}, Fetched chunks: {fetched_count}/{len(week_chunks)}", pdl=usage_point_id)

    if not all_readings:
        return APIResponse(
            success=False,
            error=ErrorDetail(
                code="NO_DATA",
                message="No production data available for this period. This may be before the meter activation date."
            )
        )

    # Return success with optional warning if some chunks failed
    response_data = {"meter_reading": {"interval_reading": all_readings}}

    if error_encountered:
        return APIResponse(
            success=True,
            data=response_data,
            error=ErrorDetail(
                code="PARTIAL_DATA",
                message=f"Some data could not be fetched (possibly before activation date). Returning {len(all_readings)} readings."
            )
        )

    return APIResponse(success=True, data=response_data)


# Customer data endpoints
@router.get("/contract/{usage_point_id}", response_model=APIResponse)
async def get_contract(
    request: Request,
    usage_point_id: str = Path(..., description="Point de livraison (14 chiffres). 💡 **Astuce**: Utilisez d'abord `GET /pdl/` pour lister vos PDL disponibles.", openapi_examples={"standard_pdl": {"summary": "Standard PDL", "value": "12345678901234"}, "test_pdl": {"summary": "Test PDL", "value": "00000000000000"}}),
    use_cache: bool = Query(False, description="Use cached data if available", openapi_examples={"with_cache": {"summary": "Use cache", "value": True}, "without_cache": {"summary": "Fresh data", "value": False}}),
    current_user: User = Depends(get_current_user),
    impersonated_user: Optional[User] = Depends(get_impersonation_context),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Get contract data"""
    # Get encryption key and effective user for impersonation support
    encryption_key = get_encryption_key(current_user, impersonated_user)
    effective_user = impersonated_user or current_user

    token_result = await get_valid_token(usage_point_id, effective_user, db)
    if isinstance(token_result, str):
        access_token = token_result
    else:
        return make_token_error_response(token_result)

    # Check rate limit - use route path template instead of actual path
    route = request.scope.get("route")
    endpoint_path = route.path if route else request.url.path
    is_allowed, error_response = await check_rate_limit(current_user.id, use_cache, current_user.is_admin, endpoint_path)
    if not is_allowed:
        assert error_response is not None
        return error_response

    # Check cache
    if use_cache:
        cache_key = cache_service.make_cache_key(usage_point_id, "contract")
        cached_data = await cache_service.get(cache_key, encryption_key)
        if cached_data:
            return APIResponse(success=True, data=cached_data)

    try:
        log_with_pdl("info", usage_point_id, f"[ENEDIS CONTRACT] Fetching contract (use_cache={use_cache})")

        # Use appropriate adapter based on user type
        adapter, is_demo = await get_adapter_for_user(effective_user)
        if is_demo:
            data = await adapter.get_contract(usage_point_id, encryption_key)
        else:
            data = await adapter.get_contract(usage_point_id, access_token)

        log_with_pdl("info", usage_point_id, "[ENEDIS CONTRACT] Successfully fetched contract data")

        # Cache result
        if use_cache:
            await cache_service.set(cache_key, data, encryption_key)

        return APIResponse(success=True, data=data)
    except Exception as e:
        log_with_pdl("error", usage_point_id, f"[ENEDIS CONTRACT ERROR] Error fetching contract: {type(e).__name__}: {str(e)}")
        import traceback
        traceback.print_exc()
        return APIResponse(success=False, error=ErrorDetail(code="ENEDIS_ERROR", message=str(e)))


@router.get("/address/{usage_point_id}", response_model=APIResponse)
async def get_address(
    request: Request,
    usage_point_id: str = Path(..., description="Point de livraison (14 chiffres). 💡 **Astuce**: Utilisez d'abord `GET /pdl/` pour lister vos PDL disponibles.", openapi_examples={"standard_pdl": {"summary": "Standard PDL", "value": "12345678901234"}, "test_pdl": {"summary": "Test PDL", "value": "00000000000000"}}),
    use_cache: bool = Query(False, description="Use cached data if available", openapi_examples={"with_cache": {"summary": "Use cache", "value": True}, "without_cache": {"summary": "Fresh data", "value": False}}),
    current_user: User = Depends(get_current_user),
    impersonated_user: Optional[User] = Depends(get_impersonation_context),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Get address data"""
    # Get encryption key and effective user for impersonation support
    encryption_key = get_encryption_key(current_user, impersonated_user)
    effective_user = impersonated_user or current_user

    token_result = await get_valid_token(usage_point_id, effective_user, db)
    if isinstance(token_result, str):
        access_token = token_result
    else:
        return make_token_error_response(token_result)

    # Check rate limit - use route path template instead of actual path
    route = request.scope.get("route")
    endpoint_path = route.path if route else request.url.path
    is_allowed, error_response = await check_rate_limit(current_user.id, use_cache, current_user.is_admin, endpoint_path)
    if not is_allowed:
        assert error_response is not None
        return error_response

    # Check cache
    if use_cache:
        cache_key = cache_service.make_cache_key(usage_point_id, "address")
        cached_data = await cache_service.get(cache_key, encryption_key)
        if cached_data:
            return APIResponse(success=True, data=cached_data)

    try:
        # Use appropriate adapter based on user type
        adapter, is_demo = await get_adapter_for_user(effective_user)
        if is_demo:
            data = await adapter.get_address(usage_point_id, encryption_key)
        else:
            data = await adapter.get_address(usage_point_id, access_token)

        # Cache result
        if use_cache:
            await cache_service.set(cache_key, data, encryption_key)

        return APIResponse(success=True, data=data)
    except Exception as e:
        return APIResponse(success=False, error=ErrorDetail(code="ENEDIS_ERROR", message=str(e)))


@router.get("/customer/{usage_point_id}", response_model=APIResponse)
async def get_customer(
    request: Request,
    usage_point_id: str = Path(..., description="Point de livraison (14 chiffres). 💡 **Astuce**: Utilisez d'abord `GET /pdl/` pour lister vos PDL disponibles.", openapi_examples={"standard_pdl": {"summary": "Standard PDL", "value": "12345678901234"}, "test_pdl": {"summary": "Test PDL", "value": "00000000000000"}}),
    use_cache: bool = Query(False, description="Use cached data if available", openapi_examples={"with_cache": {"summary": "Use cache", "value": True}, "without_cache": {"summary": "Fresh data", "value": False}}),
    current_user: User = Depends(get_current_user),
    impersonated_user: Optional[User] = Depends(get_impersonation_context),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Get customer identity data"""
    # Get encryption key and effective user for impersonation support
    encryption_key = get_encryption_key(current_user, impersonated_user)
    effective_user = impersonated_user or current_user

    token_result = await get_valid_token(usage_point_id, effective_user, db)
    if isinstance(token_result, str):
        access_token = token_result
    else:
        return make_token_error_response(token_result)

    # Check rate limit - use route path template instead of actual path
    route = request.scope.get("route")
    endpoint_path = route.path if route else request.url.path
    is_allowed, error_response = await check_rate_limit(current_user.id, use_cache, current_user.is_admin, endpoint_path)
    if not is_allowed:
        assert error_response is not None
        return error_response

    # Check cache
    if use_cache:
        cache_key = cache_service.make_cache_key(usage_point_id, "customer")
        cached_data = await cache_service.get(cache_key, encryption_key)
        if cached_data:
            return APIResponse(success=True, data=cached_data)

    try:
        # Use appropriate adapter based on user type
        adapter, is_demo = await get_adapter_for_user(effective_user)
        if is_demo:
            data = await adapter.get_customer(usage_point_id, encryption_key)
        else:
            data = await adapter.get_customer(usage_point_id, access_token)

        # Cache result
        if use_cache:
            await cache_service.set(cache_key, data, encryption_key)

        return APIResponse(success=True, data=data)
    except Exception as e:
        return APIResponse(success=False, error=ErrorDetail(code="ENEDIS_ERROR", message=str(e)))


@router.get("/contact/{usage_point_id}", response_model=APIResponse)
async def get_contact(
    request: Request,
    usage_point_id: str = Path(..., description="Point de livraison (14 chiffres). 💡 **Astuce**: Utilisez d'abord `GET /pdl/` pour lister vos PDL disponibles.", openapi_examples={"standard_pdl": {"summary": "Standard PDL", "value": "12345678901234"}, "test_pdl": {"summary": "Test PDL", "value": "00000000000000"}}),
    use_cache: bool = Query(False, description="Use cached data if available", openapi_examples={"with_cache": {"summary": "Use cache", "value": True}, "without_cache": {"summary": "Fresh data", "value": False}}),
    current_user: User = Depends(get_current_user),
    impersonated_user: Optional[User] = Depends(get_impersonation_context),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Get customer contact data"""
    # Get encryption key and effective user for impersonation support
    encryption_key = get_encryption_key(current_user, impersonated_user)
    effective_user = impersonated_user or current_user

    token_result = await get_valid_token(usage_point_id, effective_user, db)
    if isinstance(token_result, str):
        access_token = token_result
    else:
        return make_token_error_response(token_result)

    # Check rate limit - use route path template instead of actual path
    route = request.scope.get("route")
    endpoint_path = route.path if route else request.url.path
    is_allowed, error_response = await check_rate_limit(current_user.id, use_cache, current_user.is_admin, endpoint_path)
    if not is_allowed:
        assert error_response is not None
        return error_response

    # Check cache
    if use_cache:
        cache_key = cache_service.make_cache_key(usage_point_id, "contact")
        cached_data = await cache_service.get(cache_key, encryption_key)
        if cached_data:
            return APIResponse(success=True, data=cached_data)

    try:
        # Use appropriate adapter based on user type
        adapter, is_demo = await get_adapter_for_user(effective_user)
        if is_demo:
            data = await adapter.get_contact(usage_point_id, encryption_key)
        else:
            data = await adapter.get_contact(usage_point_id, access_token)

        # Cache result
        if use_cache:
            await cache_service.set(cache_key, data, encryption_key)

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
