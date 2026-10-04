"""MyElectricalData API Adapter

This adapter connects to the MyElectricalData API (v2.myelectricaldata.fr)
instead of Enedis directly. It's used in CLIENT_MODE for local installations.

The API provides:
- Consumption data (daily and detailed)
- Production data (daily and detailed)
- Contract and address information
- Tempo calendar
- EcoWatt data
- Contribution features
"""

import asyncio
import logging
from datetime import datetime
from typing import Any, Optional, cast

import httpx

from ..config import APP_VERSION, settings

logger = logging.getLogger(__name__)


class MyElectricalDataAdapter:
    """Adapter for MyElectricalData API (v2.myelectricaldata.fr)

    Used in CLIENT_MODE to fetch data from the central MyElectricalData server
    instead of connecting directly to Enedis.
    """

    def __init__(self) -> None:
        self.base_url = settings.MED_API_URL.rstrip("/")
        self.client_id = settings.MED_CLIENT_ID
        self.client_secret = settings.MED_CLIENT_SECRET
        self._client: Optional[httpx.AsyncClient] = None
        self._access_token: Optional[str] = None
        self._token_expires_at: Optional[datetime] = None
        self._lock = asyncio.Lock()

    async def get_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client"""
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=60.0)
        return self._client

    async def close(self) -> None:
        """Close HTTP client"""
        if self._client:
            await self._client.aclose()
            self._client = None

    async def _ensure_authenticated(self) -> str:
        """Get authentication token

        The MyElectricalData API accepts the client_secret directly as a Bearer token,
        so we don't need an OAuth2 token exchange flow.
        """
        # Use client_secret directly as Bearer token
        if not self.client_secret:
            raise ValueError("MED_CLIENT_SECRET is required for authentication")
        return self.client_secret

    def _get_headers(self, access_token: str) -> dict[str, str]:
        """Get common headers for API requests"""
        return {
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": f"MyElectricalData-Client/{APP_VERSION}",
            # Sans cet en-tête, la passerelle sert le format v5 des clients <= 1.22.0
            "X-MED-Format": "2026",
        }

    async def _make_request(
        self,
        method: str,
        endpoint: str,
        params: Optional[dict[str, Any]] = None,
        json_data: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        """Make authenticated request to MyElectricalData API"""
        access_token = await self._ensure_authenticated()
        headers = self._get_headers(access_token)

        url = f"{self.base_url}{endpoint}"

        if settings.DEBUG:
            logger.debug(f"[MED] {method} {url}")
            if params:
                logger.debug(f"[MED] Params: {params}")

        client = await self.get_client()

        try:
            response = await client.request(
                method=method,
                url=url,
                headers=headers,
                params=params,
                json=json_data,
            )

            if settings.DEBUG:
                logger.debug(f"[MED] Response: {response.status_code}")

            response.raise_for_status()
            return cast(dict[str, Any], response.json())

        except httpx.HTTPStatusError as e:
            logger.error(f"[MED] API error: {e.response.status_code}")
            logger.error(f"[MED] Response: {e.response.text}")

            # Try to parse error response
            try:
                error_data = e.response.json()
                if "error" in error_data:
                    raise ValueError(
                        f"{error_data.get('error')}: {error_data.get('error_description', '')}"
                    ) from e
            except (KeyError, TypeError):
                pass

            raise
        except Exception as e:
            logger.error(f"[MED] Request error: {e}")
            raise

    # =========================================================================
    # PDL / Usage Points
    # =========================================================================

    async def get_usage_points(self) -> dict[str, Any]:
        """Get list of usage points (PDL) linked to the account"""
        response = await self._make_request("GET", "/pdl")
        # The API returns {"success": true, "data": [...]}
        # We need to extract the data and wrap it in {"usage_points": [...]}
        if response.get("success") and isinstance(response.get("data"), list):
            return {"usage_points": response["data"]}
        return {"usage_points": []}

    # =========================================================================
    # Consumption Data
    # =========================================================================

    async def get_consumption_daily(
        self, usage_point_id: str, start: str, end: str
    ) -> dict[str, Any]:
        """Get daily consumption data

        Args:
            usage_point_id: 14-digit PDL number
            start: Start date (YYYY-MM-DD)
            end: End date (YYYY-MM-DD)

        Returns:
            Réponse Data Connect 2026 (grandeur[].points[]) dans l enveloppe {success, data}
        """
        return await self._make_request(
            "GET",
            f"/enedis/consumption/daily/{usage_point_id}",
            params={"start": start, "end": end},
        )

    async def get_consumption_detail(
        self, usage_point_id: str, start: str, end: str
    ) -> dict[str, Any]:
        """Get detailed consumption data (30-min intervals)

        Args:
            usage_point_id: 14-digit PDL number
            start: Start date (YYYY-MM-DD)
            end: End date (YYYY-MM-DD)

        Returns:
            Réponse Data Connect 2026 (grandeur[].points[]) dans l enveloppe {success, data}
        """
        return await self._make_request(
            "GET",
            f"/enedis/consumption/detail/{usage_point_id}",
            params={"start": start, "end": end},
        )

    async def get_consumption_max_power(
        self, usage_point_id: str, start: str, end: str
    ) -> dict[str, Any]:
        """Get daily maximum power data

        Args:
            usage_point_id: 14-digit PDL number
            start: Start date (YYYY-MM-DD)
            end: End date (YYYY-MM-DD)
        """
        return await self._make_request(
            "GET",
            f"/enedis/power/{usage_point_id}",
            params={"start": start, "end": end},
        )

    # =========================================================================
    # Production Data
    # =========================================================================

    async def get_production_daily(
        self, usage_point_id: str, start: str, end: str
    ) -> dict[str, Any]:
        """Get daily production data

        Args:
            usage_point_id: 14-digit PDL number
            start: Start date (YYYY-MM-DD)
            end: End date (YYYY-MM-DD)
        """
        return await self._make_request(
            "GET",
            f"/enedis/production/daily/{usage_point_id}",
            params={"start": start, "end": end},
        )

    async def get_production_detail(
        self, usage_point_id: str, start: str, end: str
    ) -> dict[str, Any]:
        """Get detailed production data (30-min intervals)

        Args:
            usage_point_id: 14-digit PDL number
            start: Start date (YYYY-MM-DD)
            end: End date (YYYY-MM-DD)
        """
        return await self._make_request(
            "GET",
            f"/enedis/production/detail/{usage_point_id}",
            params={"start": start, "end": end},
        )

    # =========================================================================
    # Contract & Address
    # =========================================================================

    async def get_contract(self, usage_point_id: str) -> dict[str, Any]:
        """Get contract information for a PDL"""
        return await self._make_request("GET", f"/enedis/contract/{usage_point_id}")

    async def get_address(self, usage_point_id: str) -> dict[str, Any]:
        """Get address information for a PDL"""
        return await self._make_request("GET", f"/enedis/address/{usage_point_id}")

    # =========================================================================
    # Tempo Calendar
    # =========================================================================

    async def get_tempo_calendar(
        self, start: Optional[str] = None, end: Optional[str] = None
    ) -> dict[str, Any]:
        """Get Tempo calendar data

        Args:
            start: Start date (YYYY-MM-DD), defaults to start of current season
            end: End date (YYYY-MM-DD), defaults to end of current season
        """
        params = {}
        if start:
            params["start"] = start
        if end:
            params["end"] = end

        return await self._make_request("GET", "/tempo/days", params=params or None)

    async def get_tempo_remaining(self) -> dict[str, Any]:
        """Get remaining Tempo days for current season"""
        return await self._make_request("GET", "/tempo/remaining")

    async def get_tempo_forecast(
        self, days: int = 6, force_refresh: bool = False
    ) -> dict[str, Any]:
        """Get Tempo forecast from the gateway

        The gateway has access to RTE APIs and can provide
        Tempo predictions for the next days.

        Args:
            days: Number of days to forecast (1-6)
            force_refresh: If True, bypass gateway cache

        Returns:
            Dict with forecast data including probabilities per day
        """
        params: dict[str, Any] = {"days": days}
        if force_refresh:
            params["force_refresh"] = "true"
        return await self._make_request("GET", "/tempo/forecast", params=params)

    # =========================================================================
    # EcoWatt
    # =========================================================================

    async def get_ecowatt(self) -> dict[str, Any]:
        """Get current EcoWatt signals"""
        return await self._make_request("GET", "/ecowatt")

    async def get_ecowatt_forecast(self) -> dict[str, Any]:
        """Get EcoWatt forecast for next days"""
        return await self._make_request("GET", "/ecowatt/forecast")

    # =========================================================================
    # Contribution
    # =========================================================================

    async def submit_contribution(
        self,
        usage_point_id: str,
        offer_data: dict[str, Any],
    ) -> dict[str, Any]:
        """Submit energy offer contribution

        Args:
            usage_point_id: 14-digit PDL number
            offer_data: Energy offer details to contribute
        """
        return await self._make_request(
            "POST",
            f"/contribute/{usage_point_id}",
            json_data=offer_data,
        )

    # =========================================================================
    # Account Info
    # =========================================================================

    async def get_account_info(self) -> dict[str, Any]:
        """Get account information"""
        return await self._make_request("GET", "/account")

    async def get_sync_status(self) -> dict[str, Any]:
        """Get sync status for all PDLs"""
        return await self._make_request("GET", "/sync/status")

    # =========================================================================
    # Energy Providers & Offers
    # =========================================================================

    async def get_energy_providers(self) -> dict[str, Any]:
        """Get list of energy providers from the gateway

        Returns:
            Dict with success status and list of providers
        """
        return await self._make_request("GET", "/energy/providers")

    async def get_energy_offers(self, provider_id: Optional[str] = None) -> dict[str, Any]:
        """Get list of energy offers from the gateway

        Args:
            provider_id: Optional provider ID to filter offers

        Returns:
            Dict with success status and list of offers
        """
        params = {}
        if provider_id:
            params["provider_id"] = provider_id
        return await self._make_request("GET", "/energy/offers", params=params or None)

    # =========================================================================
    # Consumption France (national data)
    # =========================================================================

    async def get_consumption_france(
        self,
        consumption_type: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
    ) -> dict[str, Any]:
        """Get French national consumption data from the gateway

        Args:
            consumption_type: Optional type filter (REALISED, ID, D-1, D-2)
            start_date: Start date (YYYY-MM-DD or ISO 8601)
            end_date: End date (YYYY-MM-DD or ISO 8601)

        Returns:
            Dict with consumption data
        """
        params: dict[str, str] = {}
        if consumption_type:
            params["type"] = consumption_type
        if start_date:
            params["start_date"] = start_date
        if end_date:
            params["end_date"] = end_date
        return await self._make_request("GET", "/consumption-france", params=params or None)

    async def get_consumption_france_current(self) -> dict[str, Any]:
        """Get current French national consumption from the gateway

        Returns:
            Dict with current consumption value
        """
        return await self._make_request("GET", "/consumption-france/current")

    # =========================================================================
    # Generation Forecast (renewable production)
    # =========================================================================

    async def get_generation_forecast(
        self,
        production_type: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
    ) -> dict[str, Any]:
        """Get French renewable generation forecast from the gateway

        Args:
            production_type: Optional type filter (SOLAR, WIND_ONSHORE, WIND_OFFSHORE)
            start_date: Start date (YYYY-MM-DD or ISO 8601)
            end_date: End date (YYYY-MM-DD or ISO 8601)

        Returns:
            Dict with generation forecast data
        """
        params: dict[str, str] = {}
        if production_type:
            params["production_type"] = production_type
        if start_date:
            params["start_date"] = start_date
        if end_date:
            params["end_date"] = end_date
        return await self._make_request("GET", "/generation-forecast", params=params or None)

    async def get_generation_forecast_mix(self) -> dict[str, Any]:
        """Get French renewable energy mix (solar + wind) from the gateway

        Returns:
            Dict with combined renewable production data
        """
        return await self._make_request("GET", "/generation-forecast/mix")


# Singleton instance (only used when CLIENT_MODE is enabled)
myelectricaldata_adapter: Optional[MyElectricalDataAdapter] = None


def get_med_adapter() -> MyElectricalDataAdapter:
    """Get or create MyElectricalData adapter instance"""
    global myelectricaldata_adapter
    if myelectricaldata_adapter is None:
        myelectricaldata_adapter = MyElectricalDataAdapter()
    return myelectricaldata_adapter
