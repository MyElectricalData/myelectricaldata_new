from datetime import datetime, UTC
from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from ..models import User, Token, PDL
from ..models.database import get_db
from ..schemas import APIResponse, ErrorDetail, CacheDeleteResponse
from ..middleware import get_current_user
from ..adapters import enedis_adapter
from ..services import cache_service, rate_limiter

router = APIRouter(prefix="/enedis", tags=["Enedis Data"])


async def verify_pdl_ownership(usage_point_id: str, user: User, db: AsyncSession) -> bool:
    """Verify that the PDL belongs to the current user"""
    result = await db.execute(
        select(PDL).where(PDL.user_id == user.id, PDL.usage_point_id == usage_point_id)
    )
    pdl = result.scalar_one_or_none()
    return pdl is not None


async def check_rate_limit(user_id: str, use_cache: bool, is_admin: bool = False) -> tuple[bool, APIResponse | None]:
    """
    Check rate limit for user. Returns (is_allowed, error_response_or_none)
    """
    is_allowed, current_count, limit = await rate_limiter.increment_and_check(user_id, use_cache, is_admin)
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
                        print(f"[TOKEN ERROR] Failed to fetch token after race condition")
                        return None
        except Exception as e:
            print(f"[TOKEN ERROR] Failed to get client credentials token: {str(e)}")
            import traceback
            traceback.print_exc()
            return None

    return token.access_token


# Metering endpoints
@router.get("/consumption/daily/{usage_point_id}", response_model=APIResponse)
async def get_consumption_daily(
    usage_point_id: str,
    start: str = Query(..., description="Start date (YYYY-MM-DD)"),
    end: str = Query(..., description="End date (YYYY-MM-DD)"),
    use_cache: bool = Query(False, description="Use cached data if available"),
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

    # Check rate limit
    is_allowed, error_response = await check_rate_limit(current_user.id, use_cache, current_user.is_admin)
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
    usage_point_id: str,
    start: str = Query(..., description="Start date (YYYY-MM-DD)"),
    end: str = Query(..., description="End date (YYYY-MM-DD)"),
    use_cache: bool = Query(False, description="Use cached data if available"),
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

    # Check rate limit
    is_allowed, error_response = await check_rate_limit(current_user.id, use_cache, current_user.is_admin)
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
    usage_point_id: str,
    start: str = Query(..., description="Start date (YYYY-MM-DD)"),
    end: str = Query(..., description="End date (YYYY-MM-DD)"),
    use_cache: bool = Query(False, description="Use cached data if available"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Get maximum power data"""
    access_token = await get_valid_token(usage_point_id, current_user, db)
    if not access_token:
        return APIResponse(
            success=False, error=ErrorDetail(code="ACCESS_DENIED", message="Access denied: PDL not found or no valid token. Please verify PDL ownership and consent.")
        )

    # Check rate limit
    is_allowed, error_response = await check_rate_limit(current_user.id, use_cache, current_user.is_admin)
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
    usage_point_id: str,
    start: str = Query(..., description="Start date (YYYY-MM-DD)"),
    end: str = Query(..., description="End date (YYYY-MM-DD)"),
    use_cache: bool = Query(False, description="Use cached data if available"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Get daily production data"""
    access_token = await get_valid_token(usage_point_id, current_user, db)
    if not access_token:
        return APIResponse(
            success=False, error=ErrorDetail(code="ACCESS_DENIED", message="Access denied: PDL not found or no valid token. Please verify PDL ownership and consent.")
        )

    # Check rate limit
    is_allowed, error_response = await check_rate_limit(current_user.id, use_cache, current_user.is_admin)
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
    usage_point_id: str,
    start: str = Query(..., description="Start date (YYYY-MM-DD)"),
    end: str = Query(..., description="End date (YYYY-MM-DD)"),
    use_cache: bool = Query(False, description="Use cached data if available"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Get detailed production data"""
    access_token = await get_valid_token(usage_point_id, current_user, db)
    if not access_token:
        return APIResponse(
            success=False, error=ErrorDetail(code="ACCESS_DENIED", message="Access denied: PDL not found or no valid token. Please verify PDL ownership and consent.")
        )

    # Check rate limit
    is_allowed, error_response = await check_rate_limit(current_user.id, use_cache, current_user.is_admin)
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
    usage_point_id: str,
    use_cache: bool = Query(False, description="Use cached data if available"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Get contract data"""
    access_token = await get_valid_token(usage_point_id, current_user, db)
    if not access_token:
        return APIResponse(
            success=False, error=ErrorDetail(code="ACCESS_DENIED", message="Access denied: PDL not found or no valid token. Please verify PDL ownership and consent.")
        )

    # Check rate limit
    is_allowed, error_response = await check_rate_limit(current_user.id, use_cache, current_user.is_admin)
    if not is_allowed:
        return error_response

    # Check cache
    if use_cache:
        cache_key = cache_service.make_cache_key(usage_point_id, "contract")
        cached_data = await cache_service.get(cache_key, current_user.client_secret)
        if cached_data:
            return APIResponse(success=True, data=cached_data)

    try:
        print(f"[ENEDIS CONTRACT] Fetching contract for usage_point_id: {usage_point_id}")
        print(f"[ENEDIS CONTRACT] Using cache: {use_cache}")

        data = await enedis_adapter.get_contract(usage_point_id, access_token)

        print(f"[ENEDIS CONTRACT] Successfully fetched contract data")

        # Cache result
        if use_cache:
            await cache_service.set(cache_key, data, current_user.client_secret)

        return APIResponse(success=True, data=data)
    except Exception as e:
        print(f"[ENEDIS CONTRACT ERROR] Error fetching contract: {type(e).__name__}: {str(e)}")
        import traceback
        traceback.print_exc()
        return APIResponse(success=False, error=ErrorDetail(code="ENEDIS_ERROR", message=str(e)))


@router.get("/address/{usage_point_id}", response_model=APIResponse)
async def get_address(
    usage_point_id: str,
    use_cache: bool = Query(False, description="Use cached data if available"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Get address data"""
    access_token = await get_valid_token(usage_point_id, current_user, db)
    if not access_token:
        return APIResponse(
            success=False, error=ErrorDetail(code="ACCESS_DENIED", message="Access denied: PDL not found or no valid token. Please verify PDL ownership and consent.")
        )

    # Check rate limit
    is_allowed, error_response = await check_rate_limit(current_user.id, use_cache, current_user.is_admin)
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
    usage_point_id: str,
    use_cache: bool = Query(False, description="Use cached data if available"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Get customer identity data"""
    access_token = await get_valid_token(usage_point_id, current_user, db)
    if not access_token:
        return APIResponse(
            success=False, error=ErrorDetail(code="ACCESS_DENIED", message="Access denied: PDL not found or no valid token. Please verify PDL ownership and consent.")
        )

    # Check rate limit
    is_allowed, error_response = await check_rate_limit(current_user.id, use_cache, current_user.is_admin)
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
    usage_point_id: str,
    use_cache: bool = Query(False, description="Use cached data if available"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> APIResponse:
    """Get customer contact data"""
    access_token = await get_valid_token(usage_point_id, current_user, db)
    if not access_token:
        return APIResponse(
            success=False, error=ErrorDetail(code="ACCESS_DENIED", message="Access denied: PDL not found or no valid token. Please verify PDL ownership and consent.")
        )

    # Check rate limit
    is_allowed, error_response = await check_rate_limit(current_user.id, use_cache, current_user.is_admin)
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
    usage_point_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
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
