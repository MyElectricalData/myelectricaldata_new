from fastapi import APIRouter, Depends, Request, HTTPException, Path, Query
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from datetime import datetime, UTC
import logging
import json
import asyncio
from typing import Optional, List
from ..models import User, PDL, EnergyProvider, EnergyOffer
from ..models.database import get_db
from ..middleware import require_admin, require_permission, get_current_user
from ..schemas import APIResponse
from ..services import rate_limiter, cache_service
from ..services.price_update_service import PriceUpdateService
from ..config import settings
import redis.asyncio as redis

logger = logging.getLogger(__name__)

# Mutex pour bloquer les synchronisations simultanées de fournisseurs
_scraper_lock = asyncio.Lock()
_scraper_status: dict = {
    "running": False,
    "provider": None,
    "started_at": None,
    "current_step": None,
    "steps": [],
    "progress": 0
}

# Cache pour les offres scrapées (évite de re-scraper entre preview et refresh)
# TTL de 5 minutes - les offres scrapées sont réutilisées si le refresh est fait rapidement
SCRAPED_OFFERS_CACHE_TTL = 300  # 5 minutes


async def _get_redis_client():
    """Get Redis client"""
    return await redis.from_url(settings.REDIS_URL, encoding="utf-8", decode_responses=True)


async def _cache_scraped_offers(provider: str, offers: List[dict]) -> None:
    """Cache les offres scrapées pour éviter un double scraping"""
    try:
        client = await _get_redis_client()
        cache_key = f"scraped_offers:{provider}"
        await client.setex(cache_key, SCRAPED_OFFERS_CACHE_TTL, json.dumps(offers))
        await client.close()
        logger.info(f"Cached {len(offers)} scraped offers for {provider} (TTL: {SCRAPED_OFFERS_CACHE_TTL}s)")
    except Exception as e:
        logger.error(f"Failed to cache offers for {provider}: {e}")


async def _get_cached_offers(provider: str) -> List[dict] | None:
    """Récupère les offres scrapées du cache si disponibles"""
    try:
        client = await _get_redis_client()
        cache_key = f"scraped_offers:{provider}"
        cached = await client.get(cache_key)
        await client.close()
        if cached:
            offers = json.loads(cached)
            logger.info(f"Found {len(offers)} cached offers for {provider}")
            return offers
    except Exception as e:
        logger.error(f"Failed to get cached offers for {provider}: {e}")
    return None


async def _clear_cached_offers(provider: str) -> None:
    """Supprime les offres scrapées du cache après utilisation"""
    try:
        client = await _get_redis_client()
        cache_key = f"scraped_offers:{provider}"
        await client.delete(cache_key)
        await client.close()
        logger.info(f"Cleared cached offers for {provider}")
    except Exception as e:
        logger.error(f"Failed to clear cached offers for {provider}: {e}")


def _update_scraper_progress(step: str, progress: int):
    """Update scraper progress status"""
    global _scraper_status
    _scraper_status["current_step"] = step
    _scraper_status["progress"] = progress
    if step not in _scraper_status["steps"]:
        _scraper_status["steps"].append(step)

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
    """Clear ALL cached data for a user: consumption, production, daily, reading types (admin only)"""

    # Check if user exists
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        return APIResponse(success=False, error={"code": "USER_NOT_FOUND", "message": "User not found"})

    # Get all PDLs for this user
    pdl_result = await db.execute(select(PDL).where(PDL.user_id == user_id))
    pdls = pdl_result.scalars().all()

    deleted_count = 0
    if cache_service.redis_client:
        for pdl in pdls:
            # Clear ALL cache types for each PDL
            patterns = [
                f"consumption:detail:{pdl.usage_point_id}:*",
                f"consumption:daily:{pdl.usage_point_id}:*",
                f"consumption:reading_type:{pdl.usage_point_id}",
                f"production:detail:{pdl.usage_point_id}:*",
                f"production:daily:{pdl.usage_point_id}:*",
                f"production:reading_type:{pdl.usage_point_id}",
            ]
            for pattern in patterns:
                count = await cache_service.delete_pattern(pattern)
                deleted_count += count

    return APIResponse(
        success=True,
        data={
            "message": f"Cache global vidé pour {user.email}",
            "user_id": user_id,
            "pdl_count": len(pdls),
            "deleted_keys": deleted_count
        }
    )


@router.delete("/users/{user_id}/clear-blacklist", response_model=APIResponse)
async def clear_user_blacklist(
    user_id: str = Path(..., description="User ID (UUID)", openapi_examples={"user_uuid": {"summary": "User UUID", "value": "550e8400-e29b-41d4-a716-446655440000"}}),
    current_user: User = Depends(require_permission('users')),
    db: AsyncSession = Depends(get_db)
) -> APIResponse:
    """Clear all blacklisted dates for a user (admin only)"""

    # Check if user exists
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        return APIResponse(success=False, error={"code": "USER_NOT_FOUND", "message": "User not found"})

    # Get all PDLs for this user
    pdl_result = await db.execute(select(PDL).where(PDL.user_id == user_id))
    pdls = pdl_result.scalars().all()

    deleted_count = 0
    if cache_service.redis_client:
        for pdl in pdls:
            # Clear blacklist and fail counters for each PDL
            # Pattern: enedis:blacklist:{usage_point_id}:* and enedis:fail:{usage_point_id}:*
            patterns = [
                f"enedis:blacklist:{pdl.usage_point_id}:*",
                f"enedis:fail:{pdl.usage_point_id}:*",
            ]
            for pattern in patterns:
                count = await cache_service.delete_pattern(pattern)
                deleted_count += count

    return APIResponse(
        success=True,
        data={
            "message": f"Blacklist vidée pour {user.email}",
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


@router.delete("/cache/clear-all", response_model=APIResponse)
async def clear_all_cache(
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
) -> APIResponse:
    """Clear ALL cached data (consumption + production) for all PDLs (admin only)"""

    # Get all PDLs
    pdl_result = await db.execute(select(PDL))
    pdls = pdl_result.scalars().all()

    deleted_count = 0
    if cache_service.redis_client:
        # Delete all cache keys (consumption + production)
        patterns = [
            "consumption:detail:*",
            "consumption:daily:*",
            "consumption:yearly:*",
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
            "message": f"All cache cleared (consumption + production)",
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


@router.get("/logs", response_model=APIResponse)
async def get_logs(
    level: Optional[str] = Query(None, description="Filter by log level (info, warning, error, critical, debug)"),
    limit: int = Query(100, ge=1, le=1000, description="Maximum number of logs to retrieve"),
    offset: int = Query(0, ge=0, description="Number of logs to skip"),
    current_user: User = Depends(require_permission('logs'))
) -> APIResponse:
    """Get application logs from Redis (requires logs permission)"""

    if not cache_service.redis_client:
        return APIResponse(
            success=False,
            error={"code": "REDIS_NOT_AVAILABLE", "message": "Redis is not available"}
        )

    try:
        logs = []

        # Determine patterns to search based on level filter
        if level:
            patterns = [f"logs:{level.lower()}:*"]
        else:
            # Search all log levels
            patterns = [
                "logs:debug:*",
                "logs:info:*",
                "logs:warning:*",
                "logs:error:*",
                "logs:critical:*"
            ]

        # Collect all matching keys
        all_keys = []
        for pattern in patterns:
            async for key in cache_service.redis_client.scan_iter(match=pattern):
                all_keys.append(key)

        # Sort keys by timestamp (descending - newest first)
        # Keys format: logs:level:timestamp_ms
        all_keys.sort(reverse=True, key=lambda k: int(k.decode('utf-8').split(':')[-1]))

        # Apply offset and limit
        selected_keys = all_keys[offset:offset + limit]

        # Retrieve log entries
        for key in selected_keys:
            value = await cache_service.redis_client.get(key)
            if value:
                try:
                    log_entry = json.loads(value)
                    logs.append(log_entry)
                except json.JSONDecodeError:
                    logger.warning(f"Failed to decode log entry: {key}")

        return APIResponse(
            success=True,
            data={
                "logs": logs,
                "total": len(all_keys),
                "count": len(logs),
                "offset": offset,
                "limit": limit
            }
        )

    except Exception as e:
        logger.error(f"Error retrieving logs from Redis: {e}")
        return APIResponse(
            success=False,
            error={"code": "LOG_RETRIEVAL_ERROR", "message": str(e)}
        )


@router.delete("/logs/clear", response_model=APIResponse)
async def clear_logs(
    level: Optional[str] = Query(None, description="Clear logs of specific level only (info, warning, error, critical, debug)"),
    current_user: User = Depends(require_permission('logs.delete'))
) -> APIResponse:
    """Clear application logs from Redis (requires logs.delete permission)"""

    if not cache_service.redis_client:
        return APIResponse(
            success=False,
            error={"code": "REDIS_NOT_AVAILABLE", "message": "Redis is not available"}
        )

    try:
        deleted_count = 0

        # Determine patterns to delete based on level filter
        if level:
            patterns = [f"logs:{level.lower()}:*"]
        else:
            # Delete all log levels
            patterns = [
                "logs:debug:*",
                "logs:info:*",
                "logs:warning:*",
                "logs:error:*",
                "logs:critical:*"
            ]

        # Delete all matching keys
        for pattern in patterns:
            count = await cache_service.delete_pattern(pattern)
            deleted_count += count

        return APIResponse(
            success=True,
            data={
                "message": f"Logs cleared{' for level ' + level if level else ''}",
                "deleted_count": deleted_count
            }
        )

    except Exception as e:
        logger.error(f"Error clearing logs from Redis: {e}")
        return APIResponse(
            success=False,
            error={"code": "LOG_CLEAR_ERROR", "message": str(e)}
        )


# Energy Provider Offers Management

@router.get("/offers/sync-status", response_model=APIResponse)
async def get_sync_status(
    current_user: User = Depends(require_permission('offers')),
) -> APIResponse:
    """
    Get the current synchronization status for energy provider offers

    Returns whether a sync is running, which provider is being synced, and when it started.
    Requires 'offers' permission.

    Returns:
        APIResponse with sync status information
    """
    return APIResponse(
        success=True,
        data={
            "sync_in_progress": _scraper_lock.locked(),
            "provider": _scraper_status["provider"],
            "started_at": _scraper_status["started_at"],
            "current_step": _scraper_status["current_step"],
            "steps": _scraper_status["steps"],
            "progress": _scraper_status["progress"]
        }
    )


@router.get("/offers/preview", response_model=APIResponse)
async def preview_offers_update(
    provider: Optional[str] = Query(None, description="Provider name (EDF, Enercoop, TotalEnergies). If not specified, all providers will be previewed."),
    current_user: User = Depends(require_permission('offers')),
    db: AsyncSession = Depends(get_db)
) -> APIResponse:
    """
    Preview energy provider offers update WITHOUT saving to database (DRY RUN)

    This endpoint scrapes the latest tariffs from provider websites and compares them
    with current database offers, showing what would be created, updated, or deactivated.
    Requires 'offers' permission.

    Args:
        provider: Optional provider name to preview. If None, all providers are previewed.

    Returns:
        APIResponse with preview comparison between current and scraped offers
    """
    global _scraper_status

    # Vérifier si une synchronisation est déjà en cours
    if _scraper_lock.locked():
        return APIResponse(
            success=False,
            error={
                "code": "SYNC_IN_PROGRESS",
                "message": f"Une synchronisation est déjà en cours pour le fournisseur '{_scraper_status['provider']}' depuis {_scraper_status['started_at']}"
            }
        )

    async with _scraper_lock:
        try:
            _scraper_status = {
                "running": True,
                "provider": provider or "all",
                "started_at": datetime.now(UTC).isoformat(),
                "current_step": "Initialisation",
                "steps": ["Initialisation"],
                "progress": 5
            }

            service = PriceUpdateService(db)

            if provider:
                # Preview single provider
                if provider not in PriceUpdateService.SCRAPERS:
                    return APIResponse(
                        success=False,
                        error={
                            "code": "INVALID_PROVIDER",
                            "message": f"Unknown provider: {provider}. Available: {', '.join(PriceUpdateService.SCRAPERS.keys())}"
                        }
                    )

                _update_scraper_progress(f"Téléchargement des tarifs {provider}", 20)
                preview_result = await service.preview_provider_update(provider)
                _update_scraper_progress("Analyse des changements", 80)

                if not preview_result.get("success"):
                    return APIResponse(
                        success=False,
                        error={
                            "code": "PREVIEW_FAILED",
                            "message": preview_result.get("error", "Unknown error")
                        }
                    )

                # Cache scraped offers for later refresh (avoids re-scraping)
                if preview_result.get("scraped_offers"):
                    await _cache_scraped_offers(provider, preview_result["scraped_offers"])

                return APIResponse(
                    success=True,
                    data={
                        "preview": {
                            provider: {
                                "offers_to_create": preview_result["offers_to_create"],
                                "offers_to_update": preview_result["offers_to_update"],
                                "offers_to_deactivate": preview_result["offers_to_deactivate"],
                                "used_fallback": preview_result.get("used_fallback", False),
                                "fallback_reason": preview_result.get("fallback_reason"),
                                "summary": {
                                    "total_offers": preview_result["summary"]["total_scraped"],
                                    "new": preview_result["summary"]["new"],
                                    "updated": preview_result["summary"]["updated"],
                                    "deactivated": preview_result["summary"]["deactivated"],
                                }
                            }
                        },
                        "timestamp": datetime.now(UTC).isoformat()
                    }
                )
            else:
                # Preview all providers
                preview_results = {}
                providers_list = list(PriceUpdateService.SCRAPERS.keys())
                total_providers = len(providers_list)

                for idx, provider_name in enumerate(providers_list):
                    progress = 10 + int((idx / total_providers) * 80)
                    _update_scraper_progress(f"Téléchargement {provider_name} ({idx + 1}/{total_providers})", progress)

                    try:
                        preview_result = await service.preview_provider_update(provider_name)

                        if preview_result.get("success"):
                            preview_results[provider_name] = {
                                "offers_to_create": preview_result["offers_to_create"],
                                "offers_to_update": preview_result["offers_to_update"],
                                "offers_to_deactivate": preview_result["offers_to_deactivate"],
                                "summary": {
                                    "total_offers": preview_result["summary"]["total_scraped"],
                                    "new": preview_result["summary"]["new"],
                                    "updated": preview_result["summary"]["updated"],
                                    "deactivated": preview_result["summary"]["deactivated"],
                                }
                            }
                        else:
                            preview_results[provider_name] = {
                                "error": preview_result.get("error", "Unknown error"),
                                "offers_to_create": [],
                                "offers_to_update": [],
                                "offers_to_deactivate": [],
                                "summary": {
                                    "total_offers": 0,
                                    "new": 0,
                                    "updated": 0,
                                    "deactivated": 0,
                                }
                            }
                    except Exception as e:
                        logger.error(f"Error previewing {provider_name}: {e}", exc_info=True)
                        preview_results[provider_name] = {
                            "error": str(e),
                            "offers_to_create": [],
                            "offers_to_update": [],
                            "offers_to_deactivate": [],
                            "summary": {
                                "total_offers": 0,
                                "new": 0,
                                "updated": 0,
                                "deactivated": 0,
                            }
                        }

                return APIResponse(
                    success=True,
                    data={
                        "preview": preview_results,
                        "timestamp": datetime.now(UTC).isoformat()
                    }
                )

        except Exception as e:
            logger.error(f"Error previewing offers: {e}", exc_info=True)
            return APIResponse(
                success=False,
                error={
                    "code": "PREVIEW_ERROR",
                    "message": str(e)
                }
            )
        finally:
            _scraper_status = {"running": False, "provider": None, "started_at": None, "current_step": None, "steps": [], "progress": 0}


@router.post("/offers/refresh", response_model=APIResponse)
async def refresh_offers(
    provider: Optional[str] = Query(None, description="Provider name (EDF, Enercoop, TotalEnergies). If not specified, all providers will be updated."),
    current_user: User = Depends(require_permission('offers')),
    db: AsyncSession = Depends(get_db)
) -> APIResponse:
    """
    Refresh energy provider offers from external sources

    This endpoint scrapes the latest tariffs from provider websites and updates the database.
    Requires 'offers' permission.

    Args:
        provider: Optional provider name to update. If None, all providers are updated.

    Returns:
        APIResponse with update results
    """
    global _scraper_status

    # Vérifier si une synchronisation est déjà en cours
    if _scraper_lock.locked():
        return APIResponse(
            success=False,
            error={
                "code": "SYNC_IN_PROGRESS",
                "message": f"Une synchronisation est déjà en cours pour le fournisseur '{_scraper_status['provider']}' depuis {_scraper_status['started_at']}"
            }
        )

    async with _scraper_lock:
        try:
            _scraper_status = {
                "running": True,
                "provider": provider or "all",
                "started_at": datetime.now(UTC).isoformat(),
                "current_step": "Initialisation",
                "steps": ["Initialisation"],
                "progress": 5
            }

            service = PriceUpdateService(db)

            if provider:
                # Update single provider
                if provider not in PriceUpdateService.SCRAPERS:
                    return APIResponse(
                        success=False,
                        error={
                            "code": "INVALID_PROVIDER",
                            "message": f"Unknown provider: {provider}. Available: {', '.join(PriceUpdateService.SCRAPERS.keys())}"
                        }
                    )

                # Check for cached offers from preview (avoids re-scraping)
                cached_offers = await _get_cached_offers(provider)

                if cached_offers:
                    # Continue from where preview left off (80%)
                    # Preview: 0% → 20% (download) → 80% (analysis done)
                    # Refresh with cache: 80% → 90% (DB update) → 100% (done)
                    _update_scraper_progress(f"Utilisation des données en cache pour {provider}", 82)
                else:
                    _update_scraper_progress(f"Téléchargement des tarifs {provider}", 20)

                result = await service.update_provider(provider, cached_offers=cached_offers)

                # Progress depends on whether we used cache
                _update_scraper_progress("Mise à jour de la base de données", 90 if cached_offers else 80)

                # Clear cache after use
                if cached_offers:
                    await _clear_cached_offers(provider)

                if not result.get("success"):
                    return APIResponse(
                        success=False,
                        error={
                            "code": "UPDATE_FAILED",
                            "message": result.get("error", "Unknown error")
                        }
                    )

                _update_scraper_progress("Terminé", 100)
                return APIResponse(
                    success=True,
                    data={
                        "message": f"Successfully updated {provider}" + (" (from cache)" if cached_offers else ""),
                        "result": result,
                        "used_cache": cached_offers is not None
                    }
                )
            else:
                # Update all providers
                _update_scraper_progress("Mise à jour de tous les fournisseurs", 10)
                results = await service.update_all_providers()

                successful = sum(1 for r in results.values() if r.get("success"))
                failed = len(results) - successful

                total_created = sum(r.get("offers_created", 0) for r in results.values() if r.get("success"))
                total_updated = sum(r.get("offers_updated", 0) for r in results.values() if r.get("success"))

                return APIResponse(
                    success=True,
                    data={
                        "message": f"Updated {successful} providers ({failed} failed)",
                        "providers_updated": successful,
                        "providers_failed": failed,
                        "total_offers_created": total_created,
                        "total_offers_updated": total_updated,
                        "results": results
                    }
                )

        except Exception as e:
            logger.error(f"Error refreshing offers: {e}", exc_info=True)
            return APIResponse(
                success=False,
                error={
                    "code": "REFRESH_ERROR",
                    "message": str(e)
                }
            )
        finally:
            _scraper_status = {"running": False, "provider": None, "started_at": None, "current_step": None, "steps": [], "progress": 0}


@router.delete("/offers/purge", response_model=APIResponse)
async def purge_provider_offers(
    provider: str = Query(..., description="Provider name to purge (EDF, Enercoop, TotalEnergies)"),
    current_user: User = Depends(require_permission('offers.delete')),
    db: AsyncSession = Depends(get_db)
) -> APIResponse:
    """
    Delete all offers for a specific provider (requires offers.delete permission)

    Args:
        provider: Provider name whose offers should be deleted

    Returns:
        APIResponse with count of deleted offers
    """
    try:
        # Get provider
        provider_result = await db.execute(
            select(EnergyProvider).where(EnergyProvider.name == provider)
        )
        provider_obj = provider_result.scalar_one_or_none()

        if not provider_obj:
            return APIResponse(
                success=False,
                error={"code": "PROVIDER_NOT_FOUND", "message": f"Provider not found: {provider}"}
            )

        # Count offers to be deleted
        count_result = await db.execute(
            select(func.count()).select_from(EnergyOffer).where(
                EnergyOffer.provider_id == provider_obj.id
            )
        )
        offers_count = count_result.scalar()

        if offers_count == 0:
            return APIResponse(
                success=True,
                data={
                    "message": f"No offers found for {provider}",
                    "deleted_count": 0
                }
            )

        # Delete all offers for this provider
        delete_result = await db.execute(
            select(EnergyOffer).where(EnergyOffer.provider_id == provider_obj.id)
        )
        offers_to_delete = delete_result.scalars().all()

        for offer in offers_to_delete:
            await db.delete(offer)

        await db.commit()

        logger.info(f"[ADMIN] User {current_user.email} purged {offers_count} offers from provider {provider}")

        return APIResponse(
            success=True,
            data={
                "message": f"Successfully deleted all offers from {provider}",
                "deleted_count": offers_count
            }
        )

    except Exception as e:
        await db.rollback()
        logger.error(f"Error purging provider offers: {e}", exc_info=True)
        return APIResponse(
            success=False,
            error={
                "code": "PURGE_ERROR",
                "message": str(e)
            }
        )


@router.get("/offers", response_model=APIResponse)
async def list_offers(
    provider: Optional[str] = Query(None, description="Filter by provider name"),
    active_only: bool = Query(True, description="Show only active offers"),
    current_user: User = Depends(require_permission('offers')),
    db: AsyncSession = Depends(get_db)
) -> APIResponse:
    """
    List all energy offers

    Args:
        provider: Optional provider name filter
        active_only: If True, only return active offers

    Returns:
        APIResponse with list of offers
    """
    try:
        query = select(EnergyOffer)

        if provider:
            # Get provider ID
            provider_result = await db.execute(
                select(EnergyProvider).where(EnergyProvider.name == provider)
            )
            provider_obj = provider_result.scalar_one_or_none()

            if not provider_obj:
                return APIResponse(
                    success=False,
                    error={"code": "PROVIDER_NOT_FOUND", "message": f"Provider not found: {provider}"}
                )

            query = query.where(EnergyOffer.provider_id == provider_obj.id)

        if active_only:
            query = query.where(EnergyOffer.is_active == True)  # noqa: E712

        query = query.order_by(EnergyOffer.name)

        result = await db.execute(query)
        offers = result.scalars().all()

        # Get provider names
        provider_ids = {offer.provider_id for offer in offers}
        provider_result = await db.execute(
            select(EnergyProvider).where(EnergyProvider.id.in_(provider_ids))
        )
        providers = {p.id: p.name for p in provider_result.scalars().all()}

        offers_data = []
        for offer in offers:
            offers_data.append({
                "id": offer.id,
                "provider": providers.get(offer.provider_id),
                "name": offer.name,
                "offer_type": offer.offer_type,
                "description": offer.description,
                "subscription_price": offer.subscription_price,
                "base_price": offer.base_price,
                "hc_price": offer.hc_price,
                "hp_price": offer.hp_price,
                "power_kva": offer.power_kva,
                "is_active": offer.is_active,
                "price_updated_at": offer.price_updated_at.isoformat() if offer.price_updated_at else None,
                "valid_from": offer.valid_from.isoformat() if offer.valid_from else None,
                "valid_to": offer.valid_to.isoformat() if offer.valid_to else None,
            })

        return APIResponse(
            success=True,
            data={
                "offers": offers_data,
                "total": len(offers_data)
            }
        )

    except Exception as e:
        logger.error(f"Error listing offers: {e}", exc_info=True)
        return APIResponse(
            success=False,
            error={"code": "LIST_ERROR", "message": str(e)}
        )


@router.get("/scrapers", response_model=APIResponse)
async def list_available_scrapers(
    current_user: User = Depends(require_permission('offers'))
) -> APIResponse:
    """
    List all available scrapers (providers with scraping support)

    Returns:
        APIResponse with list of scraper names
    """
    try:
        scraper_names = list(PriceUpdateService.SCRAPERS.keys())

        return APIResponse(
            success=True,
            data={
                "scrapers": scraper_names,
                "total": len(scraper_names)
            }
        )

    except Exception as e:
        logger.error(f"Error listing scrapers: {e}", exc_info=True)
        return APIResponse(
            success=False,
            error={"code": "LIST_ERROR", "message": str(e)}
        )


@router.get("/providers", response_model=APIResponse)
async def list_providers(
    current_user: User = Depends(require_permission('offers')),
    db: AsyncSession = Depends(get_db)
) -> APIResponse:
    """
    List all energy providers

    Automatically creates missing providers from scrapers with default values.

    Returns:
        APIResponse with list of providers
    """
    try:
        # First, ensure all scrapers have corresponding providers in DB
        service = PriceUpdateService(db)
        existing_result = await db.execute(select(EnergyProvider.name))
        existing_names = {row[0] for row in existing_result.fetchall()}

        # Create missing providers and update existing ones with defaults
        for scraper_name in PriceUpdateService.SCRAPERS.keys():
            if scraper_name not in existing_names:
                logger.info(f"Auto-creating missing provider: {scraper_name}")
            # Call for ALL scrapers to also update existing providers with missing URLs
            await service._get_or_create_provider(scraper_name)

        await db.commit()

        # Now fetch all providers
        result = await db.execute(
            select(EnergyProvider).order_by(EnergyProvider.name)
        )
        providers = result.scalars().all()

        providers_data = []

        for provider in providers:
            # Count active offers
            offers_result = await db.execute(
                select(func.count()).select_from(EnergyOffer).where(
                    and_(
                        EnergyOffer.provider_id == provider.id,
                        EnergyOffer.is_active == True  # noqa: E712
                    )
                )
            )
            offers_count = offers_result.scalar()

            # Check if this provider has a scraper
            has_scraper = provider.name in PriceUpdateService.SCRAPERS

            # Get default URLs if provider has none
            scraper_urls = provider.scraper_urls
            if not scraper_urls and has_scraper:
                scraper_urls = PriceUpdateService.get_default_scraper_urls(provider.name)

            providers_data.append({
                "id": provider.id,
                "name": provider.name,
                "logo_url": provider.logo_url,
                "website": provider.website,
                "is_active": provider.is_active,
                "active_offers_count": offers_count,
                "has_scraper": has_scraper,
                "scraper_urls": scraper_urls,
                "created_at": provider.created_at.isoformat(),
                "updated_at": provider.updated_at.isoformat(),
            })

        # Sort by name
        providers_data.sort(key=lambda x: x["name"])

        return APIResponse(
            success=True,
            data={
                "providers": providers_data,
                "total": len(providers_data)
            }
        )

    except Exception as e:
        logger.error(f"Error listing providers: {e}", exc_info=True)
        return APIResponse(
            success=False,
            error={"code": "LIST_ERROR", "message": str(e)}
        )
