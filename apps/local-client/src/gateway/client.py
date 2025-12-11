"""Gateway API client for communicating with MyElectricalData API."""

import logging
from datetime import date, timedelta
from typing import Any, Dict, List, Optional

import httpx

from .schemas import (
    ConsumptionResponse,
    DetailedConsumptionResponse,
    DetailedProductionResponse,
    MaxPowerResponse,
    PDLInfoResponse,
    ProductionResponse,
    StatusResponse,
)

logger = logging.getLogger(__name__)


class GatewayError(Exception):
    """Exception raised for gateway API errors."""

    def __init__(self, message: str, status_code: Optional[int] = None):
        super().__init__(message)
        self.status_code = status_code


class GatewayClient:
    """Async client for communicating with the MyElectricalData gateway API.

    Uses client credentials (client_id/client_secret) for authentication.
    """

    def __init__(
        self,
        gateway_url: str,
        client_id: str,
        client_secret: str,
        timeout: float = 30.0,
    ):
        """Initialize the gateway client.

        Args:
            gateway_url: Base URL of the gateway API.
            client_id: API client ID.
            client_secret: API client secret.
            timeout: Request timeout in seconds.
        """
        self.gateway_url = gateway_url.rstrip("/")
        self.client_id = client_id
        self.client_secret = client_secret
        self.timeout = timeout
        self._client: Optional[httpx.AsyncClient] = None
        self._token: Optional[str] = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create the HTTP client."""
        if self._client is None:
            self._client = httpx.AsyncClient(
                base_url=self.gateway_url,
                timeout=self.timeout,
                headers={"Content-Type": "application/json"},
            )
        return self._client

    async def close(self) -> None:
        """Close the HTTP client."""
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    async def _authenticate(self) -> str:
        """Authenticate with the gateway and get access token.

        Returns:
            Access token string.

        Raises:
            GatewayError: If authentication fails.
        """
        client = await self._get_client()

        try:
            response = await client.post(
                "/api/accounts/token",
                data={
                    "grant_type": "client_credentials",
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )

            if response.status_code != 200:
                raise GatewayError(
                    f"Authentication failed: {response.text}",
                    status_code=response.status_code,
                )

            data = response.json()
            self._token = data["access_token"]
            return self._token

        except httpx.RequestError as e:
            raise GatewayError(f"Authentication request failed: {e}") from e

    async def _get_auth_headers(self) -> Dict[str, str]:
        """Get authentication headers.

        Returns:
            Headers dictionary with Authorization.
        """
        if self._token is None:
            await self._authenticate()
        return {"Authorization": f"Bearer {self._token}"}

    async def _request(
        self,
        method: str,
        path: str,
        params: Optional[Dict[str, Any]] = None,
        json_data: Optional[Dict[str, Any]] = None,
        retry_auth: bool = True,
    ) -> Dict[str, Any]:
        """Make an authenticated request to the gateway.

        Args:
            method: HTTP method.
            path: API path.
            params: Query parameters.
            json_data: JSON body data.
            retry_auth: Whether to retry on auth failure.

        Returns:
            JSON response data.

        Raises:
            GatewayError: If the request fails.
        """
        client = await self._get_client()
        headers = await self._get_auth_headers()

        try:
            response = await client.request(
                method,
                path,
                params=params,
                json=json_data,
                headers=headers,
            )

            # Handle token expiration
            if response.status_code == 401 and retry_auth:
                self._token = None
                return await self._request(method, path, params, json_data, retry_auth=False)

            if response.status_code >= 400:
                raise GatewayError(
                    f"API request failed: {response.text}",
                    status_code=response.status_code,
                )

            return response.json()

        except httpx.RequestError as e:
            raise GatewayError(f"Request failed: {e}") from e

    # Public request method for proxy routes
    async def request(
        self,
        method: str,
        path: str,
        params: Optional[Dict[str, Any]] = None,
        json_data: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Make an authenticated request to the gateway (public method for proxying).

        Args:
            method: HTTP method.
            path: API path.
            params: Query parameters.
            json_data: JSON body data.

        Returns:
            JSON response data.

        Raises:
            GatewayError: If the request fails.
        """
        return await self._request(method, path, params, json_data)

    # PDL Operations
    async def get_pdls(self) -> List[PDLInfoResponse]:
        """Get all PDLs associated with the account.

        Returns:
            List of PDL information.
        """
        data = await self._request("GET", "/api/pdl/")
        # Backend returns {"success": true, "data": [...]}
        pdl_list = data.get("data", []) if isinstance(data.get("data"), list) else []
        return [PDLInfoResponse(**pdl) for pdl in pdl_list]

    async def get_pdl_info(self, usage_point_id: str) -> PDLInfoResponse:
        """Get information for a specific PDL.

        Args:
            usage_point_id: PDL identifier (UUID).

        Returns:
            PDL information.
        """
        data = await self._request("GET", f"/api/pdl/{usage_point_id}")
        # Backend returns {"success": true, "data": {...}}
        pdl_data = data.get("data", data)
        return PDLInfoResponse(**pdl_data)

    # Consumption Operations
    async def get_consumption_daily_raw(
        self,
        usage_point_id: str,
        start_date: date,
        end_date: date,
    ) -> Dict[str, Any]:
        """Get daily consumption data in raw Enedis format.

        Args:
            usage_point_id: PDL identifier.
            start_date: Start date.
            end_date: End date.

        Returns:
            Raw Enedis response with meter_reading data.
        """
        data = await self._request(
            "GET",
            f"/api/enedis/consumption/daily/{usage_point_id}",
            params={
                "start": start_date.isoformat(),
                "end": end_date.isoformat(),
            },
        )
        # Backend returns {"success": true, "data": {"meter_reading": {...}}}
        return data.get("data", data)

    async def get_consumption_daily(
        self,
        usage_point_id: str,
        start_date: date,
        end_date: date,
    ) -> ConsumptionResponse:
        """Get daily consumption data transformed to local format.

        Args:
            usage_point_id: PDL identifier.
            start_date: Start date.
            end_date: End date.

        Returns:
            Consumption response with daily data.
        """
        response_data = await self.get_consumption_daily_raw(usage_point_id, start_date, end_date)

        # Transform Enedis format to local format
        interval_readings = []
        if isinstance(response_data, dict):
            meter_reading = response_data.get("meter_reading", {})
            interval_readings = meter_reading.get("interval_reading", [])

        # Convert to ConsumptionDailyData format
        from datetime import datetime as dt
        consumption_data = []
        for reading in interval_readings:
            date_str = str(reading.get("date", ""))[:10]  # YYYY-MM-DD
            try:
                reading_date = dt.strptime(date_str, "%Y-%m-%d").date()
                # Value is in Wh as string, convert to kWh float
                value_wh = float(reading.get("value", 0))
                consumption_data.append({
                    "date": reading_date,
                    "value": value_wh / 1000,  # Wh to kWh
                    "hc": float(reading.get("hc", 0) or 0) / 1000 if reading.get("hc") else None,
                    "hp": float(reading.get("hp", 0) or 0) / 1000 if reading.get("hp") else None,
                })
            except (ValueError, TypeError):
                continue

        return ConsumptionResponse(
            usage_point_id=usage_point_id,
            start=start_date,
            end=end_date,
            unit="kWh",
            data=consumption_data,
        )

    async def get_consumption_detailed_raw(
        self,
        usage_point_id: str,
        target_date: date,
    ) -> Dict[str, Any]:
        """Get detailed (30-min) consumption data in raw Enedis format.

        Args:
            usage_point_id: PDL identifier.
            target_date: Target date.

        Returns:
            Raw Enedis response with meter_reading data.
        """
        data = await self._request(
            "GET",
            f"/api/enedis/consumption/detail/{usage_point_id}",
            params={"date": target_date.isoformat()},
        )
        return data.get("data", data)

    async def get_consumption_detailed(
        self,
        usage_point_id: str,
        target_date: date,
    ) -> DetailedConsumptionResponse:
        """Get detailed (30-min) consumption data for a day.

        Args:
            usage_point_id: PDL identifier.
            target_date: Target date.

        Returns:
            Detailed consumption response.
        """
        response_data = await self.get_consumption_detailed_raw(usage_point_id, target_date)

        # Transform Enedis format to local format
        interval_readings = []
        if isinstance(response_data, dict):
            meter_reading = response_data.get("meter_reading", {})
            interval_readings = meter_reading.get("interval_reading", [])

        # Convert to DetailedDataPoint format
        from datetime import datetime as dt
        detailed_data = []
        for reading in interval_readings:
            timestamp_str = str(reading.get("date", ""))
            try:
                timestamp = dt.fromisoformat(timestamp_str.replace("Z", "+00:00"))
                value_wh = float(reading.get("value", 0))
                detailed_data.append({
                    "timestamp": timestamp,
                    "value": value_wh / 1000,  # Wh to kWh
                })
            except (ValueError, TypeError):
                continue

        return DetailedConsumptionResponse(
            usage_point_id=usage_point_id,
            date=target_date,
            interval="30min",
            data=detailed_data,
        )

    async def get_max_power_raw(
        self,
        usage_point_id: str,
        start_date: date,
        end_date: date,
    ) -> Dict[str, Any]:
        """Get max power data in raw Enedis format.

        Args:
            usage_point_id: PDL identifier.
            start_date: Start date.
            end_date: End date.

        Returns:
            Raw Enedis response with meter_reading data.
        """
        data = await self._request(
            "GET",
            f"/api/enedis/power/{usage_point_id}",
            params={
                "start": start_date.isoformat(),
                "end": end_date.isoformat(),
            },
        )
        return data.get("data", data)

    async def get_max_power(
        self,
        usage_point_id: str,
        start_date: date,
        end_date: date,
    ) -> MaxPowerResponse:
        """Get max power data.

        Args:
            usage_point_id: PDL identifier.
            start_date: Start date.
            end_date: End date.

        Returns:
            Max power response.
        """
        response_data = await self.get_max_power_raw(usage_point_id, start_date, end_date)

        # Transform Enedis format to local format
        interval_readings = []
        if isinstance(response_data, dict):
            meter_reading = response_data.get("meter_reading", {})
            interval_readings = meter_reading.get("interval_reading", [])

        # Convert to MaxPowerData format
        from datetime import datetime as dt
        power_data = []
        for reading in interval_readings:
            date_str = str(reading.get("date", ""))[:10]  # YYYY-MM-DD
            try:
                reading_date = dt.strptime(date_str, "%Y-%m-%d").date()
                # Max power is in W, convert to kVA (approximating 1 VA = 1 W)
                value_w = float(reading.get("value", 0))
                power_data.append({
                    "date": reading_date,
                    "value": value_w / 1000,  # W to kVA
                })
            except (ValueError, TypeError):
                continue

        return MaxPowerResponse(
            usage_point_id=usage_point_id,
            start=start_date,
            end=end_date,
            unit="kVA",
            data=power_data,
        )

    # Production Operations
    async def get_production_daily_raw(
        self,
        usage_point_id: str,
        start_date: date,
        end_date: date,
    ) -> Dict[str, Any]:
        """Get daily production data in raw Enedis format.

        Args:
            usage_point_id: PDL identifier.
            start_date: Start date.
            end_date: End date.

        Returns:
            Raw Enedis response with meter_reading data.
        """
        data = await self._request(
            "GET",
            f"/api/enedis/production/daily/{usage_point_id}",
            params={
                "start": start_date.isoformat(),
                "end": end_date.isoformat(),
            },
        )
        return data.get("data", data)

    async def get_production_daily(
        self,
        usage_point_id: str,
        start_date: date,
        end_date: date,
    ) -> ProductionResponse:
        """Get daily production data.

        Args:
            usage_point_id: PDL identifier.
            start_date: Start date.
            end_date: End date.

        Returns:
            Production response with daily data.
        """
        response_data = await self.get_production_daily_raw(usage_point_id, start_date, end_date)

        # Transform Enedis format to local format
        interval_readings = []
        if isinstance(response_data, dict):
            meter_reading = response_data.get("meter_reading", {})
            interval_readings = meter_reading.get("interval_reading", [])

        # Convert to ProductionDailyData format
        from datetime import datetime as dt
        production_data = []
        for reading in interval_readings:
            date_str = str(reading.get("date", ""))[:10]  # YYYY-MM-DD
            try:
                reading_date = dt.strptime(date_str, "%Y-%m-%d").date()
                value_wh = float(reading.get("value", 0))
                production_data.append({
                    "date": reading_date,
                    "value": value_wh / 1000,  # Wh to kWh
                })
            except (ValueError, TypeError):
                continue

        return ProductionResponse(
            usage_point_id=usage_point_id,
            start=start_date,
            end=end_date,
            unit="kWh",
            data=production_data,
        )

    async def get_production_detailed_raw(
        self,
        usage_point_id: str,
        target_date: date,
    ) -> Dict[str, Any]:
        """Get detailed (30-min) production data in raw Enedis format.

        Args:
            usage_point_id: PDL identifier.
            target_date: Target date.

        Returns:
            Raw Enedis response with meter_reading data.
        """
        data = await self._request(
            "GET",
            f"/api/enedis/production/detail/{usage_point_id}",
            params={"date": target_date.isoformat()},
        )
        return data.get("data", data)

    async def get_production_detailed(
        self,
        usage_point_id: str,
        target_date: date,
    ) -> DetailedProductionResponse:
        """Get detailed (30-min) production data for a day.

        Args:
            usage_point_id: PDL identifier.
            target_date: Target date.

        Returns:
            Detailed production response.
        """
        response_data = await self.get_production_detailed_raw(usage_point_id, target_date)

        # Transform Enedis format to local format
        interval_readings = []
        if isinstance(response_data, dict):
            meter_reading = response_data.get("meter_reading", {})
            interval_readings = meter_reading.get("interval_reading", [])

        # Convert to DetailedDataPoint format
        from datetime import datetime as dt
        detailed_data = []
        for reading in interval_readings:
            timestamp_str = str(reading.get("date", ""))
            try:
                timestamp = dt.fromisoformat(timestamp_str.replace("Z", "+00:00"))
                value_wh = float(reading.get("value", 0))
                detailed_data.append({
                    "timestamp": timestamp,
                    "value": value_wh / 1000,  # Wh to kWh
                })
            except (ValueError, TypeError):
                continue

        return DetailedProductionResponse(
            usage_point_id=usage_point_id,
            date=target_date,
            interval="30min",
            data=detailed_data,
        )

    # Status
    async def get_status(self) -> StatusResponse:
        """Get gateway status.

        Returns:
            Status response.
        """
        # Use the ping endpoint for health check
        client = await self._get_client()
        try:
            response = await client.get("/api/ping")
            if response.status_code == 200:
                # Get PDL count from the PDL endpoint
                pdls = await self.get_pdls()
                return StatusResponse(status="ok", pdl_count=len(pdls))
            else:
                return StatusResponse(status="error", pdl_count=0)
        except Exception:
            return StatusResponse(status="error", pdl_count=0)

    async def test_connection(self) -> Dict[str, Any]:
        """Test connection to the gateway.

        Returns:
            Test result with success status and details.
        """
        try:
            await self._authenticate()
            status = await self.get_status()
            return {
                "success": True,
                "message": "Connection successful",
                "details": {
                    "gateway_url": self.gateway_url,
                    "status": status.status,
                    "pdl_count": status.pdl_count,
                },
            }
        except GatewayError as e:
            return {
                "success": False,
                "message": str(e),
                "details": {
                    "gateway_url": self.gateway_url,
                    "status_code": e.status_code,
                },
            }
        except Exception as e:
            return {
                "success": False,
                "message": str(e),
                "details": {"gateway_url": self.gateway_url},
            }
