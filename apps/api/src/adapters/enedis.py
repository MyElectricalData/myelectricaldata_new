import asyncio
from datetime import datetime, UTC
from typing import Any, Optional
import httpx
from ..config import settings


class RateLimiter:
    """Rate limiter for Enedis API calls (5 req/sec)"""

    def __init__(self, max_calls: int = 5, time_frame: float = 1.0):
        self.max_calls = max_calls
        self.time_frame = time_frame
        self.calls: list[float] = []
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        """Wait if necessary to respect rate limit"""
        async with self._lock:
            now = datetime.now(UTC).timestamp()

            # Remove calls outside the time frame
            self.calls = [call for call in self.calls if now - call < self.time_frame]

            if len(self.calls) >= self.max_calls:
                # Wait until the oldest call is outside the time frame
                sleep_time = self.time_frame - (now - self.calls[0])
                if sleep_time > 0:
                    await asyncio.sleep(sleep_time)
                    # Refresh calls list after sleeping
                    now = datetime.now(UTC).timestamp()
                    self.calls = [call for call in self.calls if now - call < self.time_frame]

            self.calls.append(now)


class EnedisAdapter:
    """Adapter for Enedis API with rate limiting"""

    def __init__(self) -> None:
        self.base_url = settings.enedis_base_url
        self.client_id = settings.ENEDIS_CLIENT_ID
        self.client_secret = settings.ENEDIS_CLIENT_SECRET
        self.rate_limiter = RateLimiter(max_calls=settings.ENEDIS_RATE_LIMIT)
        self._client: Optional[httpx.AsyncClient] = None

    async def get_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client"""
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=30.0)
        return self._client

    async def close(self) -> None:
        """Close HTTP client"""
        if self._client:
            await self._client.aclose()
            self._client = None

    def _get_headers(self, access_token: str) -> dict[str, str]:
        """Get common headers for Enedis API requests including required Host header"""
        from urllib.parse import urlparse
        parsed = urlparse(self.base_url)

        return {
            "Authorization": f"Bearer {access_token}",
            "accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": "software",
            "Host": parsed.netloc
        }

    async def _make_request(
        self,
        method: str,
        url: str,
        headers: Optional[dict[str, str]] = None,
        data: Optional[dict[str, Any]] = None,
        params: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        """Make rate-limited request to Enedis API"""
        from ..config import settings

        await self.rate_limiter.acquire()

        if settings.DEBUG:
            print("=" * 80)
            print(f"[ENEDIS API REQUEST] {method} {url}")
            print(f"[ENEDIS API REQUEST] Headers:")
            if headers:
                for key, value in headers.items():
                    if key.lower() == "authorization":
                        # Mask token but show format
                        if value.startswith("Bearer "):
                            print(f"  {key}: Bearer {value[7:27]}...")
                        elif value.startswith("Basic "):
                            print(f"  {key}: Basic {value[6:26]}...")
                        else:
                            print(f"  {key}: {value[:20]}...")
                    else:
                        print(f"  {key}: {value}")
            else:
                print("  (no headers)")

            if params:
                print(f"[ENEDIS API REQUEST] Query params: {params}")

            if data:
                print(f"[ENEDIS API REQUEST] Body data: {data}")
            print("=" * 80)

        client = await self.get_client()
        try:
            response = await client.request(method=method, url=url, headers=headers, data=data, params=params)

            if settings.DEBUG:
                print(f"[ENEDIS API RESPONSE] Status: {response.status_code}")

            response.raise_for_status()
            response_json = response.json()

            if settings.DEBUG:
                print(f"[ENEDIS API RESPONSE] Success - keys: {list(response_json.keys()) if isinstance(response_json, dict) else 'not a dict'}")
                print("=" * 80)

            return response_json
        except httpx.HTTPStatusError as e:
            if settings.DEBUG:
                print(f"[ENEDIS API ERROR] HTTP {e.response.status_code}")
                print(f"[ENEDIS API ERROR] Response headers: {dict(e.response.headers)}")
                print(f"[ENEDIS API ERROR] Response body: {e.response.text}")
                print("=" * 80)
            raise
        except Exception as e:
            if settings.DEBUG:
                print(f"[ENEDIS API ERROR] {type(e).__name__}: {str(e)}")
                print("=" * 80)
            raise

    async def exchange_authorization_code(self, code: str, redirect_uri: str) -> dict[str, Any]:
        """Exchange authorization code for access token"""
        url = f"{self.base_url}/oauth2/v3/token"

        headers = {"Content-Type": "application/x-www-form-urlencoded"}

        data = {
            "grant_type": "authorization_code",
            "code": code,
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "redirect_uri": redirect_uri,
        }

        print(f"[ENEDIS] ===== REQUETE TOKEN EXCHANGE =====")
        print(f"[ENEDIS] URL: {url}")
        print(f"[ENEDIS] client_id: {self.client_id}")
        print(f"[ENEDIS] client_secret: {self.client_secret[:10]}...")
        print(f"[ENEDIS] redirect_uri: {redirect_uri}")
        print(f"[ENEDIS] code: {code[:20]}...")
        print("=" * 60)

        return await self._make_request("POST", url, headers=headers, data=data)

    async def get_client_credentials_token(self) -> dict[str, Any]:
        """Get access token using client credentials flow (machine-to-machine)"""
        import base64

        url = f"{self.base_url}/oauth2/v3/token"

        # Create Basic Auth header
        credentials = f"{self.client_id}:{self.client_secret}"
        encoded_credentials = base64.b64encode(credentials.encode()).decode()

        from urllib.parse import urlparse
        parsed = urlparse(self.base_url)

        headers = {
            "Content-Type": "application/x-www-form-urlencoded",
            "Authorization": f"Basic {encoded_credentials}",
            "Host": parsed.netloc
        }

        data = {
            "grant_type": "client_credentials"
        }

        print(f"[ENEDIS] Getting client credentials token from {url}")
        return await self._make_request("POST", url, headers=headers, data=data)

    async def refresh_access_token(self, refresh_token: str) -> dict[str, Any]:
        """Refresh access token"""
        url = f"{self.base_url}/oauth2/v3/token"

        headers = {"Content-Type": "application/x-www-form-urlencoded"}

        data = {
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
            "client_id": self.client_id,
            "client_secret": self.client_secret,
        }

        return await self._make_request("POST", url, headers=headers, data=data)

    async def get_usage_points(self, access_token: str) -> dict[str, Any]:
        """Get list of usage points (PDL) for authenticated user"""
        url = f"{self.base_url}/customers_upc/v5/usage_points"

        headers = {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}

        return await self._make_request("GET", url, headers=headers)

    async def get_consumption_daily(
        self, usage_point_id: str, start: str, end: str, access_token: str
    ) -> dict[str, Any]:
        """Get daily consumption data"""
        url = f"{self.base_url}/metering_data_dc/v5/daily_consumption"
        headers = self._get_headers(access_token)
        params = {"usage_point_id": usage_point_id, "start": start, "end": end}

        return await self._make_request("GET", url, headers=headers, params=params)

    async def get_consumption_detail(
        self, usage_point_id: str, start: str, end: str, access_token: str
    ) -> dict[str, Any]:
        """Get detailed consumption data (load curve)"""
        url = f"{self.base_url}/metering_data_clc/v5/consumption_load_curve"
        headers = self._get_headers(access_token)
        params = {"usage_point_id": usage_point_id, "start": start, "end": end}

        return await self._make_request("GET", url, headers=headers, params=params)

    async def get_max_power(self, usage_point_id: str, start: str, end: str, access_token: str) -> dict[str, Any]:
        """Get maximum power data"""
        url = f"{self.base_url}/metering_data_dcmp/v5/daily_consumption_max_power"
        headers = self._get_headers(access_token)
        params = {"usage_point_id": usage_point_id, "start": start, "end": end}

        return await self._make_request("GET", url, headers=headers, params=params)

    async def get_production_daily(
        self, usage_point_id: str, start: str, end: str, access_token: str
    ) -> dict[str, Any]:
        """Get daily production data"""
        url = f"{self.base_url}/metering_data_dp/v5/daily_production"
        headers = self._get_headers(access_token)
        params = {"usage_point_id": usage_point_id, "start": start, "end": end}

        return await self._make_request("GET", url, headers=headers, params=params)

    async def get_production_detail(
        self, usage_point_id: str, start: str, end: str, access_token: str
    ) -> dict[str, Any]:
        """Get detailed production data"""
        url = f"{self.base_url}/metering_data_plc/v5/production_load_curve"
        headers = self._get_headers(access_token)
        params = {"usage_point_id": usage_point_id, "start": start, "end": end}

        return await self._make_request("GET", url, headers=headers, params=params)

    async def get_contract(self, usage_point_id: str, access_token: str) -> dict[str, Any]:
        """Get contract data"""
        url = f"{self.base_url}/customers_upc/v5/usage_points/contracts"
        headers = self._get_headers(access_token)
        params = {"usage_point_id": usage_point_id}

        return await self._make_request("GET", url, headers=headers, params=params)

    async def get_address(self, usage_point_id: str, access_token: str) -> dict[str, Any]:
        """Get address data"""
        url = f"{self.base_url}/customers_upa/v5/usage_points/addresses"
        headers = self._get_headers(access_token)
        params = {"usage_point_id": usage_point_id}

        return await self._make_request("GET", url, headers=headers, params=params)

    async def get_customer(self, usage_point_id: str, access_token: str) -> dict[str, Any]:
        """Get customer identity data"""
        url = f"{self.base_url}/customers_i/v5/identity"
        headers = self._get_headers(access_token)
        params = {"usage_point_id": usage_point_id}

        return await self._make_request("GET", url, headers=headers, params=params)

    async def get_contact(self, usage_point_id: str, access_token: str) -> dict[str, Any]:
        """Get customer contact data"""
        url = f"{self.base_url}/customers_cd/v5/contact_data"
        headers = self._get_headers(access_token)
        params = {"usage_point_id": usage_point_id}

        return await self._make_request("GET", url, headers=headers, params=params)


enedis_adapter = EnedisAdapter()
