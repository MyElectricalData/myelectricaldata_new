import pytest
import asyncio
from datetime import datetime, UTC
from src.adapters.enedis import RateLimiter


@pytest.mark.asyncio
async def test_rate_limiter_basic():
    """Test basic rate limiting"""
    limiter = RateLimiter(max_calls=3, time_frame=1.0)

    # Make 3 calls quickly
    for _ in range(3):
        await limiter.acquire()

    # The 4th call should be delayed
    start = datetime.now(UTC)
    await limiter.acquire()
    elapsed = (datetime.now(UTC) - start).total_seconds()

    # Should have waited approximately 1 second
    assert elapsed >= 0.9


@pytest.mark.asyncio
async def test_rate_limiter_time_window():
    """Test that rate limiter respects time window"""
    limiter = RateLimiter(max_calls=2, time_frame=0.5)

    # Make 2 calls
    await limiter.acquire()
    await limiter.acquire()

    # Wait for time window to expire
    await asyncio.sleep(0.6)

    # Should be able to make another call immediately
    start = datetime.now(UTC)
    await limiter.acquire()
    elapsed = (datetime.now(UTC) - start).total_seconds()

    # Should not have waited
    assert elapsed < 0.1
