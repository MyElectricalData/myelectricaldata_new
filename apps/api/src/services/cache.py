import json
import redis.asyncio as redis
from typing import Any, Optional
from cryptography.fernet import Fernet
from ..config import settings


class CacheService:
    def __init__(self) -> None:
        self.redis_client: Optional[redis.Redis] = None
        self.ttl = settings.CACHE_TTL_SECONDS

    async def connect(self) -> None:
        """Connect to Redis"""
        self.redis_client = await redis.from_url(settings.REDIS_URL, encoding="utf-8", decode_responses=False)

    async def disconnect(self) -> None:
        """Disconnect from Redis"""
        if self.redis_client:
            await self.redis_client.close()

    def _get_cipher(self, encryption_key: str) -> Fernet:
        """Get Fernet cipher with user's client_secret as key"""
        # Derive a valid Fernet key from client_secret
        from base64 import urlsafe_b64encode
        from hashlib import sha256

        key = urlsafe_b64encode(sha256(encryption_key.encode()).digest())
        return Fernet(key)

    async def get(self, key: str, encryption_key: str) -> Optional[dict[str, Any]]:
        """Get cached value and decrypt it"""
        if not self.redis_client:
            return None

        try:
            encrypted_data = await self.redis_client.get(key)
            if not encrypted_data:
                return None

            cipher = self._get_cipher(encryption_key)
            decrypted_data = cipher.decrypt(encrypted_data)
            return json.loads(decrypted_data.decode())
        except Exception:
            return None

    async def set(self, key: str, value: dict[str, Any], encryption_key: str, ttl: Optional[int] = None) -> bool:
        """Encrypt and cache value"""
        if not self.redis_client:
            return False

        try:
            cipher = self._get_cipher(encryption_key)
            json_data = json.dumps(value).encode()
            encrypted_data = cipher.encrypt(json_data)

            cache_ttl = ttl if ttl is not None else self.ttl
            await self.redis_client.setex(key, cache_ttl, encrypted_data)
            return True
        except Exception:
            return False

    async def delete(self, key: str) -> bool:
        """Delete cached value"""
        if not self.redis_client:
            return False

        try:
            await self.redis_client.delete(key)
            return True
        except Exception:
            return False

    async def delete_pattern(self, pattern: str) -> int:
        """Delete all keys matching pattern"""
        if not self.redis_client:
            return 0

        try:
            keys = []
            async for key in self.redis_client.scan_iter(match=pattern):
                keys.append(key)

            if keys:
                return await self.redis_client.delete(*keys)
            return 0
        except Exception:
            return 0

    def make_cache_key(self, usage_point_id: str, endpoint: str, **kwargs: Any) -> str:
        """Generate cache key"""
        parts = [usage_point_id, endpoint]
        for key, value in sorted(kwargs.items()):
            parts.append(f"{key}:{value}")
        return ":".join(parts)


cache_service = CacheService()
