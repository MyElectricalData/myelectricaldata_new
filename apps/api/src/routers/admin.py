from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, UTC
from ..models import User, PDL
from ..models.database import get_db
from ..middleware import require_admin
from ..schemas import APIResponse
from ..services import rate_limiter, cache_service

router = APIRouter(prefix="/admin", tags=["Admin"])


@router.get("/users", response_model=APIResponse)
async def list_users(
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
) -> APIResponse:
    """List all users with their statistics (admin only)"""

    # Get all users
    result = await db.execute(
        select(User).order_by(User.created_at.desc())
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
            "created_at": user.created_at.isoformat(),
            "pdl_count": pdl_count,
            "usage_stats": usage_stats
        })

    return APIResponse(success=True, data={"users": users_data, "total": len(users_data)})


@router.post("/users/{user_id}/reset-quota", response_model=APIResponse)
async def reset_user_quota(
    user_id: str,
    admin_user: User = Depends(require_admin),
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


@router.get("/stats", response_model=APIResponse)
async def get_global_stats(
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
) -> APIResponse:
    """Get global platform statistics (admin only)"""

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

    # Calculate total API calls today
    today = datetime.now(UTC).strftime("%Y-%m-%d")
    total_cached_calls = 0
    total_no_cache_calls = 0

    if cache_service.redis_client:
        # Get all rate limit keys for today
        pattern = f"rate_limit:*:*:{today}"
        async for key in cache_service.redis_client.scan_iter(match=pattern):
            value = await cache_service.redis_client.get(key)
            if value:
                count = int(value)
                if b'cached' in key:
                    total_cached_calls += count
                else:
                    total_no_cache_calls += count

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
            "date": today
        }
    )
