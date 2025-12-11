"""Prometheus Exporter - Metrics endpoint for scraping."""

import time
from typing import Any, Dict, Optional

from prometheus_client import CollectorRegistry, Gauge, generate_latest, CONTENT_TYPE_LATEST
from pydantic import Field

from .base import BaseExporter, ExporterConfig, ExporterStatus


class PrometheusConfig(ExporterConfig):
    """Prometheus exporter configuration."""

    port: int = Field(default=9090, ge=1, le=65535, description="Metrics port")
    path: str = Field(default="/metrics", description="Metrics endpoint path")
    labels: Dict[str, str] = Field(default_factory=dict, description="Custom labels")


class PrometheusExporter(BaseExporter):
    """Prometheus metrics exporter.

    Exposes metrics in Prometheus format for scraping by Prometheus,
    VictoriaMetrics, or other compatible systems.
    """

    name = "prometheus"
    description = "Exposition métriques Prometheus"
    version = "1.0.0"

    def __init__(self, config: Dict[str, Any]):
        super().__init__(config)
        self._registry = CollectorRegistry()
        self._metrics: Dict[str, Gauge] = {}
        self._setup_metrics()

    def _validate_config(self, config: Dict[str, Any]) -> PrometheusConfig:
        return PrometheusConfig(**config)

    def _setup_metrics(self) -> None:
        """Setup Prometheus metrics."""
        label_names = ["pdl"] + list(self._config.labels.keys())

        # Consumption metrics
        self._metrics["consumption_daily"] = Gauge(
            "myelectricaldata_consumption_daily_kwh",
            "Daily consumption in kWh",
            label_names,
            registry=self._registry,
        )

        self._metrics["consumption_hc"] = Gauge(
            "myelectricaldata_consumption_hc_kwh",
            "Off-peak consumption in kWh",
            label_names,
            registry=self._registry,
        )

        self._metrics["consumption_hp"] = Gauge(
            "myelectricaldata_consumption_hp_kwh",
            "Peak consumption in kWh",
            label_names,
            registry=self._registry,
        )

        self._metrics["max_power"] = Gauge(
            "myelectricaldata_max_power_kva",
            "Maximum power in kVA",
            label_names,
            registry=self._registry,
        )

        # Production metrics
        self._metrics["production_daily"] = Gauge(
            "myelectricaldata_production_daily_kwh",
            "Daily production in kWh",
            label_names,
            registry=self._registry,
        )

        # Status metrics
        self._metrics["sync_status"] = Gauge(
            "myelectricaldata_sync_status",
            "Sync status (1=ok, 0=error)",
            label_names,
            registry=self._registry,
        )

        self._metrics["last_sync_timestamp"] = Gauge(
            "myelectricaldata_last_sync_timestamp",
            "Last sync timestamp",
            label_names,
            registry=self._registry,
        )

    def _get_labels(self, pdl: str) -> Dict[str, str]:
        """Get label values for a PDL."""
        labels = {"pdl": pdl}
        labels.update(self._config.labels)
        return labels

    async def connect(self) -> bool:
        """Mark as connected (metrics are served by the web app)."""
        self._status = ExporterStatus.CONNECTED
        self.logger.info(f"Prometheus metrics ready on port {self._config.port}")
        return True

    async def disconnect(self) -> None:
        """Mark as disconnected."""
        self._status = ExporterStatus.DISCONNECTED

    async def export_consumption(
        self,
        pdl: str,
        data: Dict[str, Any],
        metadata: Optional[Dict[str, Any]] = None,
    ) -> bool:
        """Update consumption metrics."""
        labels = self._get_labels(pdl)
        label_values = tuple(labels.values())

        if "daily" in data:
            self._metrics["consumption_daily"].labels(*label_values).set(data["daily"])

        if "hc" in data and data["hc"] is not None:
            self._metrics["consumption_hc"].labels(*label_values).set(data["hc"])

        if "hp" in data and data["hp"] is not None:
            self._metrics["consumption_hp"].labels(*label_values).set(data["hp"])

        if "max_power" in data and data["max_power"] is not None:
            self._metrics["max_power"].labels(*label_values).set(data["max_power"])

        # Update sync timestamp
        self._metrics["last_sync_timestamp"].labels(*label_values).set(time.time())
        self._metrics["sync_status"].labels(*label_values).set(1)

        return True

    async def export_production(
        self,
        pdl: str,
        data: Dict[str, Any],
        metadata: Optional[Dict[str, Any]] = None,
    ) -> bool:
        """Update production metrics."""
        labels = self._get_labels(pdl)
        label_values = tuple(labels.values())

        if "daily" in data:
            self._metrics["production_daily"].labels(*label_values).set(data["daily"])

        return True

    async def test_connection(self) -> Dict[str, Any]:
        """Test that metrics are being generated."""
        try:
            output = generate_latest(self._registry)
            return {
                "success": True,
                "latency_ms": 0,
                "message": f"Metrics endpoint ready on :{self._config.port}{self._config.path}",
                "details": {
                    "port": self._config.port,
                    "path": self._config.path,
                    "metrics_count": len(self._metrics),
                },
            }
        except Exception as e:
            return {
                "success": False,
                "latency_ms": 0,
                "message": f"Error generating metrics: {str(e)}",
                "details": {"error": str(e)},
            }

    def get_config_schema(self) -> Dict[str, Any]:
        """Return JSON Schema for configuration UI."""
        return {
            "type": "object",
            "properties": {
                "enabled": {"type": "boolean", "title": "Activer", "default": False},
                "port": {
                    "type": "integer",
                    "title": "Port",
                    "default": 9090,
                    "minimum": 1,
                    "maximum": 65535,
                },
                "path": {"type": "string", "title": "Chemin", "default": "/metrics"},
                "labels": {
                    "type": "object",
                    "title": "Labels personnalisés",
                    "additionalProperties": {"type": "string"},
                },
            },
        }

    def get_metrics(self) -> bytes:
        """Generate metrics output for the endpoint.

        Returns:
            Prometheus metrics in text format.
        """
        return generate_latest(self._registry)

    @property
    def content_type(self) -> str:
        """Get the content type for metrics response."""
        return CONTENT_TYPE_LATEST

    @property
    def registry(self) -> CollectorRegistry:
        """Get the metrics registry."""
        return self._registry
