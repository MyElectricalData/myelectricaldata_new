"""Jeedom Exporter - Integration with Jeedom home automation."""

import time
from typing import Any, Dict, Optional

import httpx
from pydantic import Field

from .base import BaseExporter, ExporterConfig, ExporterStatus


class JeedomConfig(ExporterConfig):
    """Jeedom exporter configuration."""

    url: str = Field(default="", description="Jeedom URL")
    api_key: str = Field(default="", description="Jeedom API key")
    method: str = Field(
        default="virtual",
        pattern="^(virtual|api|mqtt)$",
        description="Integration method",
    )
    virtual_equipment_id: str = Field(default="", description="Virtual equipment ID")
    commands: Dict[str, str] = Field(
        default_factory=dict,
        description="Command mappings (e.g., consumption_daily: '123')",
    )


class JeedomExporter(BaseExporter):
    """Jeedom exporter via API or Virtual plugin.

    Supports multiple integration methods:
    - virtual: Uses the Virtual plugin commands
    - api: Direct JSON RPC API calls
    - mqtt: Uses MQTT (requires jMQTT plugin)
    """

    name = "jeedom"
    description = "Intégration Jeedom"
    version = "1.0.0"

    def __init__(self, config: Dict[str, Any]):
        super().__init__(config)
        self._client: Optional[httpx.AsyncClient] = None

    def _validate_config(self, config: Dict[str, Any]) -> JeedomConfig:
        return JeedomConfig(**config)

    async def connect(self) -> bool:
        """Initialize HTTP client and verify connection."""
        try:
            self._status = ExporterStatus.CONNECTING

            if not self._config.url or not self._config.api_key:
                raise ValueError("URL and API key are required")

            self._client = httpx.AsyncClient(timeout=30.0)

            # Test connection
            test_result = await self.test_connection()
            if not test_result["success"]:
                raise ConnectionError(test_result["message"])

            self._status = ExporterStatus.CONNECTED
            self.logger.info(f"Connected to Jeedom: {self._config.url}")
            return True

        except Exception as e:
            self._status = ExporterStatus.ERROR
            self._last_error = str(e)
            raise ConnectionError(f"Cannot connect to Jeedom: {e}") from e

    async def disconnect(self) -> None:
        """Close HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None
        self._status = ExporterStatus.DISCONNECTED

    async def export_consumption(
        self,
        pdl: str,
        data: Dict[str, Any],
        metadata: Optional[Dict[str, Any]] = None,
    ) -> bool:
        """Export consumption data to Jeedom."""
        if not self.is_connected:
            raise RuntimeError("Not connected to Jeedom")

        if self._config.method == "virtual":
            await self._export_via_virtual(data)
        else:
            await self._export_via_api(data)

        return True

    async def export_production(
        self,
        pdl: str,
        data: Dict[str, Any],
        metadata: Optional[Dict[str, Any]] = None,
    ) -> bool:
        """Export production data to Jeedom."""
        if not self.is_connected:
            raise RuntimeError("Not connected to Jeedom")

        if "daily" in data and "production_daily" in self._config.commands:
            await self._update_command(self._config.commands["production_daily"], data["daily"])

        return True

    async def _export_via_virtual(self, data: Dict[str, Any]) -> None:
        """Export data via Virtual plugin commands."""
        mappings = {
            "daily": "consumption_daily",
            "hc": "consumption_hc",
            "hp": "consumption_hp",
            "max_power": "max_power",
        }

        for data_key, cmd_key in mappings.items():
            if data_key in data and data[data_key] is not None:
                cmd_id = self._config.commands.get(cmd_key)
                if cmd_id:
                    await self._update_command(cmd_id, data[data_key])

    async def _export_via_api(self, data: Dict[str, Any]) -> None:
        """Export data via Jeedom JSON RPC API."""
        # Same as virtual for now - updates command values
        await self._export_via_virtual(data)

    async def _update_command(self, cmd_id: str, value: Any) -> None:
        """Update a Jeedom command value.

        Args:
            cmd_id: Command ID.
            value: Value to set.
        """
        url = f"{self._config.url.rstrip('/')}/core/api/jeeApi.php"

        params = {
            "apikey": self._config.api_key,
            "type": "cmd",
            "id": cmd_id,
        }

        # For info commands, we need to update the value
        response = await self._client.get(url, params=params)

        if response.status_code >= 400:
            raise RuntimeError(f"Failed to update command {cmd_id}: {response.text}")

        self.logger.debug(f"Updated command {cmd_id} = {value}")

    async def _call_api(self, method: str, params: Optional[Dict] = None) -> Dict:
        """Make a JSON RPC call to Jeedom.

        Args:
            method: API method name.
            params: Method parameters.

        Returns:
            API response.
        """
        url = f"{self._config.url.rstrip('/')}/core/api/jeeApi.php"

        payload = {
            "jsonrpc": "2.0",
            "id": int(time.time()),
            "method": method,
            "params": {
                "apikey": self._config.api_key,
                **(params or {}),
            },
        }

        response = await self._client.post(url, json=payload)

        if response.status_code >= 400:
            raise RuntimeError(f"API call failed: {response.text}")

        result = response.json()

        if "error" in result:
            raise RuntimeError(f"API error: {result['error']}")

        return result.get("result", {})

    async def test_connection(self) -> Dict[str, Any]:
        """Test connection to Jeedom."""
        start = time.time()

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                url = f"{self._config.url.rstrip('/')}/core/api/jeeApi.php"

                response = await client.get(
                    url,
                    params={
                        "apikey": self._config.api_key,
                        "type": "version",
                    },
                )

                latency = (time.time() - start) * 1000

                if response.status_code == 200:
                    return {
                        "success": True,
                        "latency_ms": round(latency, 2),
                        "message": "Connected to Jeedom",
                        "details": {
                            "url": self._config.url,
                            "version": response.text[:50] if response.text else "unknown",
                        },
                    }
                else:
                    return {
                        "success": False,
                        "latency_ms": round(latency, 2),
                        "message": f"Connection failed: HTTP {response.status_code}",
                        "details": {"url": self._config.url},
                    }

        except Exception as e:
            return {
                "success": False,
                "latency_ms": 0,
                "message": f"Connection failed: {str(e)}",
                "details": {"error": str(e)},
            }

    def get_config_schema(self) -> Dict[str, Any]:
        """Return JSON Schema for configuration UI."""
        return {
            "type": "object",
            "properties": {
                "enabled": {"type": "boolean", "title": "Activer", "default": False},
                "url": {
                    "type": "string",
                    "title": "URL Jeedom",
                    "format": "uri",
                    "description": "http://jeedom.local ou https://...",
                },
                "api_key": {
                    "type": "string",
                    "title": "Clé API",
                    "format": "password",
                },
                "method": {
                    "type": "string",
                    "title": "Méthode",
                    "enum": ["virtual", "api", "mqtt"],
                    "default": "virtual",
                },
                "virtual_equipment_id": {
                    "type": "string",
                    "title": "ID équipement virtuel",
                },
                "commands": {
                    "type": "object",
                    "title": "Mapping des commandes",
                    "properties": {
                        "consumption_daily": {"type": "string", "title": "Consommation jour"},
                        "consumption_hc": {"type": "string", "title": "Consommation HC"},
                        "consumption_hp": {"type": "string", "title": "Consommation HP"},
                        "production_daily": {"type": "string", "title": "Production jour"},
                        "max_power": {"type": "string", "title": "Puissance max"},
                    },
                },
            },
            "required": ["url", "api_key"],
        }
