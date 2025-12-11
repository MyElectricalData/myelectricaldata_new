"""VictoriaMetrics Exporter - Push metrics to VictoriaMetrics."""

import time
from typing import Any, Dict, Optional

import httpx
from pydantic import Field

from .base import BaseExporter, ExporterConfig, ExporterStatus


class VictoriaMetricsConfig(ExporterConfig):
    """VictoriaMetrics exporter configuration."""

    # Push configuration
    url: str = Field(
        default="http://victoriametrics:8428/api/v1/import/prometheus",
        description="VictoriaMetrics push endpoint",
    )
    interval: int = Field(default=60, ge=10, description="Push interval in seconds")
    username: str = Field(default="", description="Auth username")
    password: str = Field(default="", description="Auth password")
    headers: Dict[str, str] = Field(default_factory=dict, description="Custom headers")

    # Labels
    labels: Dict[str, str] = Field(default_factory=dict, description="Custom labels")


class VictoriaMetricsExporter(BaseExporter):
    """VictoriaMetrics push exporter.

    Pushes metrics directly to VictoriaMetrics using the Prometheus import API.
    """

    name = "victoriametrics"
    description = "Export push vers VictoriaMetrics"
    version = "1.0.0"

    def __init__(self, config: Dict[str, Any]):
        super().__init__(config)
        self._client: Optional[httpx.AsyncClient] = None
        self._pending_metrics: list = []

    def _validate_config(self, config: Dict[str, Any]) -> VictoriaMetricsConfig:
        return VictoriaMetricsConfig(**config)

    async def connect(self) -> bool:
        """Initialize HTTP client."""
        try:
            self._status = ExporterStatus.CONNECTING

            auth = None
            if self._config.username and self._config.password:
                auth = (self._config.username, self._config.password)

            self._client = httpx.AsyncClient(
                timeout=30.0,
                auth=auth,
                headers=self._config.headers,
            )

            self._status = ExporterStatus.CONNECTED
            self.logger.info(f"VictoriaMetrics exporter ready: {self._config.url}")
            return True

        except Exception as e:
            self._status = ExporterStatus.ERROR
            self._last_error = str(e)
            raise ConnectionError(f"Cannot initialize client: {e}") from e

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
        """Push consumption metrics to VictoriaMetrics."""
        if not self.is_connected:
            raise RuntimeError("Not connected")

        metrics = self._build_consumption_metrics(pdl, data, metadata)
        await self._push_metrics(metrics)

        return True

    async def export_production(
        self,
        pdl: str,
        data: Dict[str, Any],
        metadata: Optional[Dict[str, Any]] = None,
    ) -> bool:
        """Push production metrics to VictoriaMetrics."""
        if not self.is_connected:
            raise RuntimeError("Not connected")

        metrics = self._build_production_metrics(pdl, data, metadata)
        await self._push_metrics(metrics)

        return True

    def _build_labels(self, pdl: str, extra: Optional[Dict[str, str]] = None) -> str:
        """Build label string for Prometheus format."""
        labels = {"pdl": pdl}
        labels.update(self._config.labels)
        if extra:
            labels.update(extra)

        label_parts = [f'{k}="{v}"' for k, v in labels.items()]
        return "{" + ",".join(label_parts) + "}"

    def _build_consumption_metrics(
        self,
        pdl: str,
        data: Dict[str, Any],
        metadata: Optional[Dict[str, Any]],
    ) -> list:
        """Build consumption metrics in Prometheus format."""
        metrics = []
        labels = self._build_labels(pdl)
        timestamp = int(time.time() * 1000)  # milliseconds

        if "daily" in data:
            metrics.append(f"myelectricaldata_consumption_daily_kwh{labels} {data['daily']} {timestamp}")

        if "hc" in data and data["hc"] is not None:
            metrics.append(f"myelectricaldata_consumption_hc_kwh{labels} {data['hc']} {timestamp}")

        if "hp" in data and data["hp"] is not None:
            metrics.append(f"myelectricaldata_consumption_hp_kwh{labels} {data['hp']} {timestamp}")

        if "max_power" in data and data["max_power"] is not None:
            metrics.append(f"myelectricaldata_max_power_kva{labels} {data['max_power']} {timestamp}")

        # Sync status
        metrics.append(f"myelectricaldata_sync_status{labels} 1 {timestamp}")
        metrics.append(f"myelectricaldata_last_sync_timestamp{labels} {time.time()} {timestamp}")

        return metrics

    def _build_production_metrics(
        self,
        pdl: str,
        data: Dict[str, Any],
        metadata: Optional[Dict[str, Any]],
    ) -> list:
        """Build production metrics in Prometheus format."""
        metrics = []
        labels = self._build_labels(pdl)
        timestamp = int(time.time() * 1000)

        if "daily" in data:
            metrics.append(f"myelectricaldata_production_daily_kwh{labels} {data['daily']} {timestamp}")

        return metrics

    async def _push_metrics(self, metrics: list) -> None:
        """Push metrics to VictoriaMetrics."""
        if not metrics:
            return

        payload = "\n".join(metrics)

        response = await self._client.post(
            self._config.url,
            content=payload,
            headers={"Content-Type": "text/plain"},
        )

        if response.status_code >= 400:
            raise RuntimeError(f"Push failed: {response.status_code} - {response.text}")

        self.logger.debug(f"Pushed {len(metrics)} metrics")

    async def test_connection(self) -> Dict[str, Any]:
        """Test connection to VictoriaMetrics."""
        start = time.time()

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                # Try to ping the health endpoint
                health_url = self._config.url.replace("/api/v1/import/prometheus", "/health")
                response = await client.get(health_url)

                latency = (time.time() - start) * 1000

                if response.status_code < 400:
                    return {
                        "success": True,
                        "latency_ms": round(latency, 2),
                        "message": "VictoriaMetrics is healthy",
                        "details": {"url": self._config.url},
                    }
                else:
                    return {
                        "success": False,
                        "latency_ms": round(latency, 2),
                        "message": f"Health check failed: {response.status_code}",
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
                    "title": "URL endpoint",
                    "default": "http://victoriametrics:8428/api/v1/import/prometheus",
                    "format": "uri",
                },
                "interval": {
                    "type": "integer",
                    "title": "Intervalle (secondes)",
                    "default": 60,
                    "minimum": 10,
                },
                "username": {"type": "string", "title": "Utilisateur"},
                "password": {"type": "string", "title": "Mot de passe", "format": "password"},
                "labels": {
                    "type": "object",
                    "title": "Labels personnalisés",
                    "additionalProperties": {"type": "string"},
                },
            },
            "required": ["url"],
        }
