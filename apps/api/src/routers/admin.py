from fastapi import APIRouter, Depends, Request, HTTPException, Path
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from datetime import datetime, UTC
import logging
from ..models import User, PDL
from ..models.database import get_db
from ..middleware import require_admin, require_permission, get_current_user
from ..schemas import APIResponse
from ..services import rate_limiter, cache_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["Admin"])


@router.get("/users", response_model=APIResponse)
async def list_users(
    current_user: User = Depends(require_permission('users')),
    db: AsyncSession = Depends(get_db)
) -> APIResponse:
    """List all users with their statistics (requires users permission)"""

    # Get all users with their role
    result = await db.execute(
        select(User).options(selectinload(User.role)).order_by(User.created_at.desc())
    )
    users = result.scalars().all()

    users_data = []
    for user in users:
        # Get PDL count
        pdl_result = await db.execute(
            select(func.count()).select_from(PDL).where(PDL.user_id == user.id)
        )
        pdl_count = pdl_result.scalar()

        # Get usage stats
        usage_stats = await rate_limiter.get_usage_stats(user.id)

        users_data.append({
            "id": user.id,
            "email": user.email,
            "client_id": user.client_id,
            "is_active": user.is_active,
            "email_verified": user.email_verified,
            "debug_mode": user.debug_mode,
            "created_at": user.created_at.isoformat(),
            "pdl_count": pdl_count,
            "usage_stats": usage_stats,
            "role": {
                "id": user.role.id if user.role else None,
                "name": user.role.name if user.role else "visitor",
                "display_name": user.role.display_name if user.role else "Visiteur",
            } if user.role else {"id": None, "name": "visitor", "display_name": "Visiteur"}
        })

    return APIResponse(success=True, data={"users": users_data, "total": len(users_data)})


@router.post("/users/{user_id}/reset-quota", response_model=APIResponse)
async def reset_user_quota(
    user_id: str = Path(..., description="User ID (UUID)", openapi_examples={"user_uuid": {"summary": "User UUID", "value": "550e8400-e29b-41d4-a716-446655440000"}}),
    current_user: User = Depends(require_permission('users')),
    db: AsyncSession = Depends(get_db)
) -> APIResponse:
    """Reset a user's daily quota (admin only)"""

    # Check if user exists
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        return APIResponse(success=False, error={"code": "USER_NOT_FOUND", "message": "User not found"})

    # Reset quota by deleting Redis keys
    today = datetime.now(UTC).strftime("%Y-%m-%d")
    cached_key = f"rate_limit:{user_id}:cached:{today}"
    no_cache_key = f"rate_limit:{user_id}:no_cache:{today}"

    if cache_service.redis_client:
        await cache_service.redis_client.delete(cached_key, no_cache_key)

    return APIResponse(
        success=True,
        data={"message": f"Quota reset for user {user.email}", "user_id": user_id}
    )


@router.delete("/users/{user_id}/clear-cache", response_model=APIResponse)
async def clear_user_cache(
    user_id: str = Path(..., description="User ID (UUID)", openapi_examples={"user_uuid": {"summary": "User UUID", "value": "550e8400-e29b-41d4-a716-446655440000"}}),
    current_user: User = Depends(require_permission('users')),
    db: AsyncSession = Depends(get_db)
) -> APIResponse:
    """Clear all cached consumption data for a user (admin only)"""

    # Check if user exists
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        return APIResponse(success=False, error={"code": "USER_NOT_FOUND", "message": "User not found"})

    # Clear all cache keys for this user (consumption data)
    # Pattern: consumption:detail:{usage_point_id}:*
    # We need to get all PDLs for this user first
    pdl_result = await db.execute(select(PDL).where(PDL.user_id == user_id))
    pdls = pdl_result.scalars().all()

    deleted_count = 0
    if cache_service.redis_client:
        for pdl in pdls:
            pattern = f"consumption:detail:{pdl.usage_point_id}:*"
            count = await cache_service.delete_pattern(pattern)
            deleted_count += count

    return APIResponse(
        success=True,
        data={
            "message": f"Cache cleared for user {user.email}",
            "user_id": user_id,
            "pdl_count": len(pdls),
            "deleted_keys": deleted_count
        }
    )


@router.delete("/cache/consumption/clear-all", response_model=APIResponse)
async def clear_all_consumption_cache(
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
) -> APIResponse:
    """Clear ALL cached consumption data for all PDLs (admin only)"""

    # Get all PDLs
    pdl_result = await db.execute(select(PDL))
    pdls = pdl_result.scalars().all()

    deleted_count = 0
    if cache_service.redis_client:
        # Delete all consumption cache keys
        patterns = [
            "consumption:detail:*",
            "consumption:daily:*",
            "consumption:yearly:*"
        ]

        for pattern in patterns:
            count = await cache_service.delete_pattern(pattern)
            deleted_count += count
            logger.info(f"[CACHE] Deleted {count} keys matching pattern {pattern}")

    return APIResponse(
        success=True,
        data={
            "message": f"All consumption cache cleared",
            "total_pdls": len(pdls),
            "deleted_keys": deleted_count
        }
    )


@router.delete("/cache/production/clear-all", response_model=APIResponse)
async def clear_all_production_cache(
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
) -> APIResponse:
    """Clear ALL cached production data for all PDLs (admin only)"""

    # Get all PDLs
    pdl_result = await db.execute(select(PDL))
    pdls = pdl_result.scalars().all()

    deleted_count = 0
    if cache_service.redis_client:
        # Delete all production cache keys
        patterns = [
            "production:detail:*",
            "production:daily:*",
            "production:yearly:*"
        ]

        for pattern in patterns:
            count = await cache_service.delete_pattern(pattern)
            deleted_count += count
            logger.info(f"[CACHE] Deleted {count} keys matching pattern {pattern}")

    return APIResponse(
        success=True,
        data={
            "message": f"All production cache cleared",
            "total_pdls": len(pdls),
            "deleted_keys": deleted_count
        }
    )


@router.get("/users/stats", response_model=APIResponse)
async def get_user_stats(
    current_user: User = Depends(require_permission('users')),
    db: AsyncSession = Depends(get_db)
) -> APIResponse:
    """Get user statistics (requires users permission)"""

    # Total users
    total_result = await db.execute(select(func.count()).select_from(User))
    total_users = total_result.scalar()

    # Active users
    active_result = await db.execute(
        select(func.count()).select_from(User).where(User.is_active == True)
    )
    active_users = active_result.scalar()

    # Verified users
    verified_result = await db.execute(
        select(func.count()).select_from(User).where(User.email_verified == True)
    )
    verified_users = verified_result.scalar()

    # Admin count (users with admin role)
    from ..models import Role
    admin_result = await db.execute(
        select(func.count()).select_from(User).join(Role).where(Role.name == 'admin')
    )
    admin_count = admin_result.scalar()

    # Users created this month
    from datetime import datetime, UTC
    now = datetime.now(UTC)
    first_day = datetime(now.year, now.month, 1, tzinfo=UTC)
    month_result = await db.execute(
        select(func.count()).select_from(User).where(User.created_at >= first_day)
    )
    users_this_month = month_result.scalar()

    return APIResponse(
        success=True,
        data={
            "total_users": total_users,
            "active_users": active_users,
            "verified_users": verified_users,
            "admin_count": admin_count,
            "users_this_month": users_this_month
        }
    )


@router.post("/users", response_model=APIResponse)
async def create_user(
    request: dict,
    current_user: User = Depends(require_permission('users.edit')),
    db: AsyncSession = Depends(get_db)
) -> APIResponse:
    """Create a new user (requires users.edit permission)"""
    from ..models import Role
    import secrets

    email = request.get('email')
    role_id = request.get('role_id')

    if not email:
        return APIResponse(success=False, error={"code": "MISSING_EMAIL", "message": "Email is required"})

    # Check if user already exists
    existing_result = await db.execute(select(User).where(User.email == email))
    if existing_result.scalar_one_or_none():
        return APIResponse(success=False, error={"code": "USER_EXISTS", "message": "User already exists"})

    # Create user
    new_user = User(
        email=email,
        client_id=secrets.token_urlsafe(32),
        client_secret=secrets.token_urlsafe(64),
        is_active=False,  # Will be activated when email is verified
        email_verified=False,
        debug_mode=False
    )

    # Set role if provided
    if role_id:
        role_result = await db.execute(select(Role).where(Role.id == role_id))
        role = role_result.scalar_one_or_none()
        if role:
            new_user.role_id = role_id

    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)

    # TODO: Send activation email

    return APIResponse(
        success=True,
        data={
            "message": f"User created: {email}",
            "user_id": new_user.id
        }
    )


@router.post("/users/{user_id}/toggle-status", response_model=APIResponse)
async def toggle_user_status(
    user_id: str = Path(..., description="User ID (UUID)"),
    current_user: User = Depends(require_permission('users.edit')),
    db: AsyncSession = Depends(get_db)
) -> APIResponse:
    """Toggle user active status (requires users.edit permission)"""

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        return APIResponse(success=False, error={"code": "USER_NOT_FOUND", "message": "User not found"})

    # Toggle status
    user.is_active = not user.is_active
    await db.commit()

    return APIResponse(
        success=True,
        data={
            "message": f"User {'activated' if user.is_active else 'deactivated'}",
            "user_id": user_id,
            "is_active": user.is_active
        }
    )


@router.delete("/users/{user_id}", response_model=APIResponse)
async def delete_user(
    user_id: str = Path(..., description="User ID (UUID)"),
    current_user: User = Depends(require_permission('users.delete')),
    db: AsyncSession = Depends(get_db)
) -> APIResponse:
    """Delete a user (requires users.delete permission)"""

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        return APIResponse(success=False, error={"code": "USER_NOT_FOUND", "message": "User not found"})

    # Prevent deleting yourself
    if user.id == current_user.id:
        return APIResponse(success=False, error={"code": "CANNOT_DELETE_SELF", "message": "Cannot delete your own account"})

    # Delete user (cascades will handle PDLs, etc.)
    await db.delete(user)
    await db.commit()

    return APIResponse(
        success=True,
        data={
            "message": f"User deleted: {user.email}",
            "user_id": user_id
        }
    )


@router.post("/users/{user_id}/reset-password", response_model=APIResponse)
async def reset_user_password(
    user_id: str = Path(..., description="User ID (UUID)"),
    current_user: User = Depends(require_permission('users.edit')),
    db: AsyncSession = Depends(get_db)
) -> APIResponse:
    """Reset a user's password (requires users.edit permission)"""

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        return APIResponse(success=False, error={"code": "USER_NOT_FOUND", "message": "User not found"})

    # TODO: Send password reset email

    return APIResponse(
        success=True,
        data={
            "message": f"Password reset email sent to {user.email}",
            "user_id": user_id
        }
    )


@router.post("/users/{user_id}/toggle-debug", response_model=APIResponse)
async def toggle_user_debug_mode(
    user_id: str = Path(..., description="User ID (UUID)", openapi_examples={"user_uuid": {"summary": "User UUID", "value": "550e8400-e29b-41d4-a716-446655440000"}}),
    current_user: User = Depends(require_permission('users')),
    db: AsyncSession = Depends(get_db)
) -> APIResponse:
    """Toggle debug mode for a user (admin only)"""

    # Check if user exists
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        return APIResponse(success=False, error={"code": "USER_NOT_FOUND", "message": "User not found"})

    # Toggle debug mode
    user.debug_mode = not user.debug_mode
    await db.commit()

    return APIResponse(
        success=True,
        data={
            "message": f"Debug mode {'activated' if user.debug_mode else 'deactivated'} for user {user.email}",
            "user_id": user_id,
            "debug_mode": user.debug_mode
        }
    )


@router.get("/stats", response_model=APIResponse)
async def get_global_stats(
    current_user: User = Depends(require_permission('admin_dashboard')),
    db: AsyncSession = Depends(get_db)
) -> APIResponse:
    """Get global platform statistics (requires admin_dashboard permission)"""

    # Total users
    user_count_result = await db.execute(select(func.count()).select_from(User))
    total_users = user_count_result.scalar()

    # Active users (email verified)
    active_users_result = await db.execute(
        select(func.count()).select_from(User).where(User.email_verified == True)
    )
    active_users = active_users_result.scalar()

    # Total PDLs
    pdl_count_result = await db.execute(select(func.count()).select_from(PDL))
    total_pdls = pdl_count_result.scalar()

    # Define all API endpoints
    all_endpoints = [
        "/ping",
        "/",
        "/consent",
        "/accounts/signup",
        "/accounts/login",
        "/accounts/verify-email",
        "/accounts/resend-verification",
        "/accounts/forgot-password",
        "/accounts/reset-password",
        "/accounts/token",
        "/accounts/me",
        "/accounts/update-password",
        "/accounts/regenerate-secret",
        "/pdl/",
        "/pdl/{pdl_id}",
        "/pdl/{pdl_id}/name",
        "/pdl/{pdl_id}/subscribed-power",
        "/pdl/{pdl_id}/offpeak-hours",
        "/oauth/authorize",
        "/oauth/verify-state",
        "/consumption/detail",
        "/consumption/daily",
        "/consumption/max-power",
        "/production/detail",
        "/production/daily",
        "/addresses",
        "/contract",
        "/admin/users",
        "/admin/users/{user_id}/reset-quota",
        "/admin/users/{user_id}/clear-cache",
        "/admin/stats",
        "/admin/tempo",
        "/admin/tempo/refresh",
        "/admin/contributions",
        "/admin/contributions/{contribution_id}",
        "/admin/contributions/{contribution_id}/approve",
        "/admin/contributions/{contribution_id}/reject",
        "/admin/energy-offers",
        "/admin/energy-offers/{offer_id}",
        "/admin/roles",
        "/admin/roles/{role_id}",
        "/admin/users/{user_id}/role",
        "/energy-offers/",
        "/energy-offers/{offer_id}",
        "/energy-offers/contribute",
        "/tempo/calendar",
        "/tempo/current",
        "/tempo/next",
        "/roles/",
    ]

    # Calculate total API calls today
    today = datetime.now(UTC).strftime("%Y-%m-%d")
    total_cached_calls = 0
    total_no_cache_calls = 0
    endpoint_stats = {}
    user_stats = {}  # Track calls per user

    # Initialize all endpoints with 0
    for endpoint in all_endpoints:
        endpoint_stats[endpoint] = {"cached": 0, "no_cache": 0, "total": 0}

    if cache_service.redis_client:
        # Get all rate limit keys for today
        pattern = f"rate_limit:*:*:*:{today}"
        async for key in cache_service.redis_client.scan_iter(match=pattern):
            value = await cache_service.redis_client.get(key)
            if value:
                count = int(value)
                # Extract from key: rate_limit:user_id:endpoint:cache_type:date
                key_str = key.decode('utf-8') if isinstance(key, bytes) else key
                parts = key_str.split(':')
                if len(parts) >= 5:
                    user_id = parts[1]
                    endpoint = parts[2]
                    cache_type = parts[3]  # "cached" or "no_cache"

                    # Track per-endpoint stats
                    if endpoint not in endpoint_stats:
                        endpoint_stats[endpoint] = {"cached": 0, "no_cache": 0, "total": 0}

                    if cache_type == "cached":
                        total_cached_calls += count
                        endpoint_stats[endpoint]["cached"] += count
                    else:
                        total_no_cache_calls += count
                        endpoint_stats[endpoint]["no_cache"] += count

                    endpoint_stats[endpoint]["total"] += count

                    # Track per-user stats
                    if user_id not in user_stats:
                        user_stats[user_id] = {"cached": 0, "no_cache": 0, "total": 0}

                    if cache_type == "cached":
                        user_stats[user_id]["cached"] += count
                    else:
                        user_stats[user_id]["no_cache"] += count

                    user_stats[user_id]["total"] += count

    # Get top 20 users by total calls
    top_users = []
    if user_stats:
        # Get user details from DB
        sorted_user_ids = sorted(user_stats.items(), key=lambda x: x[1]["total"], reverse=True)[:20]

        for user_id, stats in sorted_user_ids:
            user_result = await db.execute(
                select(User).options(selectinload(User.role)).where(User.id == user_id)
            )
            user = user_result.scalar_one_or_none()

            if user:
                top_users.append({
                    "user_id": user.id,
                    "email": user.email,
                    "role": {
                        "name": user.role.name if user.role else "visitor",
                        "display_name": user.role.display_name if user.role else "Visiteur"
                    },
                    "cached_calls": stats["cached"],
                    "no_cache_calls": stats["no_cache"],
                    "total_calls": stats["total"]
                })

    return APIResponse(
        success=True,
        data={
            "total_users": total_users,
            "active_users": active_users,
            "total_pdls": total_pdls,
            "today_api_calls": {
                "cached": total_cached_calls,
                "no_cache": total_no_cache_calls,
                "total": total_cached_calls + total_no_cache_calls
            },
            "endpoint_stats": endpoint_stats,
            "top_users": top_users,
            "date": today
        }
    )


@router.post("/cache/ecowatt/refresh", response_model=APIResponse)
async def refresh_ecowatt_cache(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Refresh EcoWatt cache with latest data from RTE
    """
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")

    # Check rate limit
    endpoint_path = request.scope.get("route").path if request.scope.get("route") else request.url.path
    is_allowed, current_count, limit = await rate_limiter.increment_and_check(
        current_user.id, False, current_user.is_admin, endpoint_path
    )
    if not is_allowed:
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded: {current_count}/{limit} requests today"
        )

    # Import here to avoid circular import
    from ..services.rte import rte_service

    try:
        # Update EcoWatt cache
        updated_count = await rte_service.update_ecowatt_cache(db)

        return APIResponse(
            success=True,
            data={"count": updated_count},
            message=f"Cache EcoWatt mis à jour avec {updated_count} signaux"
        )
    except Exception as e:
        logger.error(f"Error refreshing EcoWatt cache: {e}")
        raise HTTPException(status_code=500, detail=str(e))
