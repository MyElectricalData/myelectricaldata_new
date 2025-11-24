import asyncio
import logging
from datetime import UTC, datetime, timedelta
from typing import Any, Optional

import httpx

from ..config import settings

logger = logging.getLogger(__name__)


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

    def _parse_iso8601_duration_to_minutes(self, duration: str) -> int:
        """
        Parse ISO 8601 duration format to minutes.

        Examples:
            PT5M -> 5
            PT10M -> 10
            PT15M -> 15
            PT30M -> 30
            PT60M -> 60
            PT1H -> 60
        """
        import re

        # Match PTxxM or PTxxH format
        match = re.match(r'PT(\d+)([HM])', duration)
        if not match:
            logger.warning(f"[ENEDIS] Could not parse duration '{duration}', defaulting to 30 minutes")
            return 30

        value = int(match.group(1))
        unit = match.group(2)

        if unit == 'H':
            return value * 60
        else:  # unit == 'M'
            return value

    def _shift_timestamps_to_interval_start(self, response: dict[str, Any]) -> dict[str, Any]:
        """
        Shift timestamps from interval END to interval START.

        Enedis API returns timestamps representing the END of each measurement interval.
        For better UX and to avoid confusion with midnight timestamps, we shift all timestamps
        backwards by the interval_length to represent the START of each interval.

        Example with 30min intervals:
            API returns:  2025-11-22 00:30:00 (end of 00:00-00:30 interval)
            We transform: 2025-11-22 00:00:00 (start of 00:00-00:30 interval)

        This also fixes the midnight edge case where:
            API returns:  2025-11-23 00:00:00 (end of 23:30-00:00 interval of day 22)
            We transform: 2025-11-22 23:30:00 (start of that interval, correctly on day 22)
        """
        if "meter_reading" not in response:
            return response

        meter_reading = response["meter_reading"]

        # Get interval readings
        interval_reading = meter_reading.get("interval_reading", [])
        if not interval_reading:
            return response

        shifted_count = 0

        # Shift each timestamp backwards by its individual interval_length
        for reading in interval_reading:
            if "date" not in reading or "interval_length" not in reading:
                continue

            original_date = reading["date"]
            interval_length_iso = reading["interval_length"]

            # Parse ISO 8601 duration to minutes
            interval_minutes = self._parse_iso8601_duration_to_minutes(interval_length_iso)

            # Parse datetime (handle both formats: "YYYY-MM-DD HH:MM:SS" and "YYYY-MM-DDTHH:MM:SS")
            try:
                if "T" in original_date:
                    dt = datetime.fromisoformat(original_date.replace("Z", "+00:00"))
                else:
                    dt = datetime.strptime(original_date, "%Y-%m-%d %H:%M:%S")

                # Shift backwards by interval_length
                shifted_dt = dt - timedelta(minutes=interval_minutes)

                # Format back to original format
                if "T" in original_date:
                    reading["date"] = shifted_dt.strftime("%Y-%m-%dT%H:%M:%S")
                else:
                    reading["date"] = shifted_dt.strftime("%Y-%m-%d %H:%M:%S")

                shifted_count += 1

            except Exception as e:
                logger.warning(f"[ENEDIS] Failed to shift timestamp '{original_date}': {e}")
                continue

        if shifted_count > 0:
            logger.info(f"[ENEDIS] Shifted {shifted_count} timestamps from interval END → START")

        return response

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
            "Host": parsed.netloc,
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
            logger.debug("=" * 80)
            logger.debug(f"[ENEDIS API REQUEST] {method} {url}")
            logger.debug("[ENEDIS API REQUEST] Headers:")
            if headers:
                for key, value in headers.items():
                    if key.lower() == "authorization":
                        # Mask token but show format
                        if value.startswith("Bearer "):
                            logger.debug(f"  {key}: Bearer {value[7:27]}...")
                        elif value.startswith("Basic "):
                            logger.debug(f"  {key}: Basic {value[6:26]}...")
                        else:
                            logger.debug(f"  {key}: {value[:20]}...")
                    else:
                        logger.debug(f"  {key}: {value}")
            else:
                logger.debug("  (no headers)")

            if params:
                logger.debug(f"[ENEDIS API REQUEST] Query params: {params}")

            if data:
                logger.debug(f"[ENEDIS API REQUEST] Body data: {data}")
            logger.debug("=" * 80)

        client = await self.get_client()
        try:
            response = await client.request(method=method, url=url, headers=headers, data=data, params=params)

            if settings.DEBUG:
                logger.debug(f"[ENEDIS API RESPONSE] Status: {response.status_code}")

            response.raise_for_status()
            response_json = response.json()

            if settings.DEBUG:
                logger.debug(
                    f"[ENEDIS API RESPONSE] Success - keys: {list(response_json.keys()) if isinstance(response_json, dict) else 'not a dict'}"
                )
                logger.debug("=" * 80)

            return response_json
        except httpx.HTTPStatusError as e:
            if settings.DEBUG:
                logger.error(f"[ENEDIS API ERROR] HTTP {e.response.status_code}")
                logger.debug(f"[ENEDIS API ERROR] Response headers: {dict(e.response.headers)}")
                logger.debug(f"[ENEDIS API ERROR] Response body: {e.response.text}")
                logger.debug("=" * 80)

            # Parse JSON error from Enedis (e.g., ADAM-ERR0123)
            try:
                error_json = e.response.json()
                if "error" in error_json:
                    # Return the error JSON so the router can handle it
                    # Special case for ADAM-ERR0123 (data older than meter activation)
                    if error_json.get("error") == "ADAM-ERR0123":
                        logger.warning("[ENEDIS] Data requested is anterior to meter activation date")
                        return error_json  # Return error as dict for router to handle
                    # For other errors, raise exception
                    error_msg = f"{error_json.get('error')}: {error_json.get('error_description', 'Unknown error')}"
                    raise ValueError(error_msg) from e
            except (KeyError, TypeError):
                # Failed to parse JSON, continue with original exception
                pass

            raise
        except Exception as e:
            if settings.DEBUG:
                logger.error(f"[ENEDIS API ERROR] {type(e).__name__}: {str(e)}")
                logger.info("=" * 80)
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

        logger.info("[ENEDIS] ===== REQUETE TOKEN EXCHANGE =====")
        logger.info(f"[ENEDIS] URL: {url}")
        logger.debug(f"[ENEDIS] client_id: {self.client_id}")
        logger.info(f"[ENEDIS] client_secret: {self.client_secret[:10]}...")
        logger.info(f"[ENEDIS] redirect_uri: {redirect_uri}")
        logger.info(f"[ENEDIS] code: {code[:20]}...")
        logger.info("=" * 60)

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
            "Host": parsed.netloc,
        }

        data = {"grant_type": "client_credentials"}

        logger.info(f"[ENEDIS] Getting client credentials token from {url}")
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

        response = await self._make_request("GET", url, headers=headers, params=params)

        # Shift timestamps from interval END to interval START
        response = self._shift_timestamps_to_interval_start(response)

        return response

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

        response = await self._make_request("GET", url, headers=headers, params=params)

        # Shift timestamps from interval END to interval START
        response = self._shift_timestamps_to_interval_start(response)

        return response

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
