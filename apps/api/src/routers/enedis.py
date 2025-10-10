from datetime import datetime, UTC
from fastapi import APIRouter, Depends, Query, HTTPException, status, Request, Path
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from ..models import User, Token, PDL
from ..models.database import get_db
from ..schemas import APIResponse, ErrorDetail, CacheDeleteResponse
from ..middleware import get_current_user
from ..adapters import enedis_adapter
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


async def verify_pdl_ownership(usage_point_id: str, user: User, db: AsyncSession) -> bool:
    """Verify that the PDL belongs to the current user"""
    result = await db.execute(
        select(PDL).where(PDL.user_id == user.id, PDL.usage_point_id == usage_point_id)
    )
    pdl = result.scalar_one_or_none()
    return pdl is not None


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
    """Get daily consumption data"""
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

    # Check cache
    if use_cache:
        cache_key = cache_service.make_cache_key(usage_point_id, "consumption_daily", start=start, end=end)
        cached_data = await cache_service.get(cache_key, current_user.client_secret)
        if cached_data:
            return APIResponse(success=True, data=cached_data)

    try:
        data = await enedis_adapter.get_consumption_daily(usage_point_id, start, end, access_token)

        # Cache result
        if use_cache:
            await cache_service.set(cache_key, data, current_user.client_secret)

        return APIResponse(success=True, data=data)
    except Exception as e:
        return APIResponse(success=False, error=ErrorDetail(code="ENEDIS_ERROR", message=str(e)))


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
    """Get detailed consumption data (load curve)"""
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

    # Check cache
    if use_cache:
        cache_key = cache_service.make_cache_key(usage_point_id, "consumption_detail", start=start, end=end)
        cached_data = await cache_service.get(cache_key, current_user.client_secret)
        if cached_data:
            return APIResponse(success=True, data=cached_data)

    try:
        data = await enedis_adapter.get_consumption_detail(usage_point_id, start, end, access_token)

        # Cache result
        if use_cache:
            await cache_service.set(cache_key, data, current_user.client_secret)

        return APIResponse(success=True, data=data)
    except Exception as e:
        return APIResponse(success=False, error=ErrorDetail(code="ENEDIS_ERROR", message=str(e)))


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
        data = await enedis_adapter.get_max_power(usage_point_id, start, end, access_token)

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
        data = await enedis_adapter.get_production_daily(usage_point_id, start, end, access_token)

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
        data = await enedis_adapter.get_production_detail(usage_point_id, start, end, access_token)

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

        data = await enedis_adapter.get_contract(usage_point_id, access_token)

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
        data = await enedis_adapter.get_address(usage_point_id, access_token)

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
        data = await enedis_adapter.get_customer(usage_point_id, access_token)

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
        data = await enedis_adapter.get_contact(usage_point_id, access_token)

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

    pattern = f"{usage_point_id}:*"
    deleted_keys = await cache_service.delete_pattern(pattern)

    response = CacheDeleteResponse(
        success=True, deleted_keys=deleted_keys, message=f"Deleted {deleted_keys} cached entries"
    )

    return APIResponse(success=True, data=response.model_dump())
