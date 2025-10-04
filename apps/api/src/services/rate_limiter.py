"""Rate limiter service for tracking user API usage"""
from datetime import datetime, timedelta, UTC
from typing import Tuple
from .cache import cache_service
from ..config import settings


class RateLimiterService:
    """Service to track and limit user API calls per day"""

    def _get_daily_key(self, user_id: str, cache_used: bool) -> str:
        """Generate Redis key for daily counter"""
        today = datetime.now(UTC).strftime("%Y-%m-%d")
        cache_type = "cached" if cache_used else "no_cache"
        return f"rate_limit:{user_id}:{cache_type}:{today}"

    async def increment_and_check(self, user_id: str, cache_used: bool, is_admin: bool = False) -> Tuple[bool, int, int]:
        """
        Increment counter and check if limit is reached

        Returns:
            (is_allowed, current_count, limit)
        """
        # Admins have unlimited API calls
        if is_admin:
            return True, 0, 999999

        key = self._get_daily_key(user_id, cache_used)
        limit = settings.USER_DAILY_LIMIT_WITH_CACHE if cache_used else settings.USER_DAILY_LIMIT_NO_CACHE

        if not cache_service.redis_client:
            return True, 0, limit

        # Get current count directly from Redis (no encryption needed for counters)
        current = await cache_service.redis_client.get(key)
        current_count = int(current) if current else 0

        # Check if limit exceeded
        if current_count >= limit:
            return False, current_count, limit

        # Increment counter
        new_count = current_count + 1

        # Set with TTL until end of day
        now = datetime.now(UTC)
        end_of_day = datetime.combine(now.date() + timedelta(days=1), datetime.min.time(), tzinfo=UTC)
        ttl_seconds = int((end_of_day - now).total_seconds())

        await cache_service.redis_client.setex(key, ttl_seconds, str(new_count))

        return True, new_count, limit

    async def get_usage_stats(self, user_id: str) -> dict:
        """Get current usage statistics for a user"""
        # Get both counters
        cached_key = self._get_daily_key(user_id, cache_used=True)
        no_cache_key = self._get_daily_key(user_id, cache_used=False)

        if not cache_service.redis_client:
            return {
                "cached_requests": 0,
                "no_cache_requests": 0,
                "cached_limit": settings.USER_DAILY_LIMIT_WITH_CACHE,
                "no_cache_limit": settings.USER_DAILY_LIMIT_NO_CACHE,
                "date": datetime.now(UTC).strftime("%Y-%m-%d"),
            }

        # Get counts directly from Redis (no encryption needed)
        cached_count = await cache_service.redis_client.get(cached_key)
        no_cache_count = await cache_service.redis_client.get(no_cache_key)

        return {
            "cached_requests": int(cached_count) if cached_count else 0,
            "no_cache_requests": int(no_cache_count) if no_cache_count else 0,
            "cached_limit": settings.USER_DAILY_LIMIT_WITH_CACHE,
            "no_cache_limit": settings.USER_DAILY_LIMIT_NO_CACHE,
            "date": datetime.now(UTC).strftime("%Y-%m-%d"),
        }


rate_limiter = RateLimiterService()
