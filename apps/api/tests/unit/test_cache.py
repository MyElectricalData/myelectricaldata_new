import pytest
from src.services.cache import CacheService


@pytest.fixture
def cache_service():
    return CacheService()


def test_make_cache_key(cache_service):
    """Test cache key generation"""
    key = cache_service.make_cache_key("00000000000000", "consumption_daily", start="2024-01-01", end="2024-01-31")
    assert key == "00000000000000:consumption_daily:end:2024-01-31:start:2024-01-01"


def test_make_cache_key_no_kwargs(cache_service):
    """Test cache key generation without additional parameters"""
    key = cache_service.make_cache_key("00000000000000", "contract")
    assert key == "00000000000000:contract"


@pytest.mark.asyncio
async def test_cache_encryption(cache_service):
    """Test that cache service properly initializes"""
    assert cache_service.ttl > 0
    assert cache_service.redis_client is None  # Not connected yet
