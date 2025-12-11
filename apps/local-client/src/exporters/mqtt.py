"""MQTT Exporter - Generic MQTT publication."""

import json
import time
from typing import Any, Dict, Optional

import aiomqtt
from pydantic import Field

from .base import BaseExporter, ExporterConfig, ExporterStatus


class MQTTConfig(ExporterConfig):
    """MQTT exporter configuration."""

    # Connection
    host: str = Field(default="localhost", description="MQTT broker host")
    port: int = Field(default=1883, ge=1, le=65535, description="MQTT broker port")
    username: str = Field(default="", description="MQTT username")
    password: str = Field(default="", description="MQTT password")

    # TLS
    tls: bool = Field(default=False, description="Enable TLS/SSL")
    ca_cert: str = Field(default="", description="CA certificate path")

    # Topics
    topic_prefix: str = Field(default="myelectricaldata", description="Topic prefix")

    # Options
    qos: int = Field(default=1, ge=0, le=2, description="QoS level")
    retain: bool = Field(default=True, description="Retain messages")
    format: str = Field(default="json", pattern="^(json|simple)$", description="Message format")


class MQTTExporter(BaseExporter):
    """Generic MQTT exporter.

    Publishes consumption and production data to configurable topics.
    """

    name = "mqtt"
    description = "Publication vers broker MQTT"
    version = "1.0.0"

    def __init__(self, config: Dict[str, Any]):
        super().__init__(config)
        self._client: Optional[aiomqtt.Client] = None

    def _validate_config(self, config: Dict[str, Any]) -> MQTTConfig:
        return MQTTConfig(**config)

    async def connect(self) -> bool:
        """Connect to MQTT broker."""
        try:
            self._status = ExporterStatus.CONNECTING
            self.logger.info(f"Connecting to {self._config.host}:{self._config.port}")

            self._client = aiomqtt.Client(
                hostname=self._config.host,
                port=self._config.port,
                username=self._config.username or None,
                password=self._config.password or None,
            )

            await self._client.__aenter__()
            self._status = ExporterStatus.CONNECTED
            self.logger.info("Connected to MQTT broker")
            return True

        except Exception as e:
            self._status = ExporterStatus.ERROR
            self._last_error = str(e)
            self.logger.error(f"Connection error: {e}")
            raise ConnectionError(f"Cannot connect to MQTT: {e}") from e

    async def disconnect(self) -> None:
        """Disconnect from MQTT broker."""
        if self._client:
            try:
                await self._client.__aexit__(None, None, None)
            except Exception as e:
                self.logger.warning(f"Disconnect error: {e}")
            finally:
                self._client = None
                self._status = ExporterStatus.DISCONNECTED

    async def export_consumption(
        self,
        pdl: str,
        data: Dict[str, Any],
        metadata: Optional[Dict[str, Any]] = None,
    ) -> bool:
        """Export consumption data via MQTT."""
        if not self.is_connected:
            raise RuntimeError("Not connected to MQTT broker")

        topics_data = self._build_consumption_topics(pdl, data, metadata)

        for topic, payload in topics_data.items():
            await self._publish(topic, payload)

        return True

    async def export_production(
        self,
        pdl: str,
        data: Dict[str, Any],
        metadata: Optional[Dict[str, Any]] = None,
    ) -> bool:
        """Export production data via MQTT."""
        if not self.is_connected:
            raise RuntimeError("Not connected to MQTT broker")

        topic = f"{self._config.topic_prefix}/{pdl}/production/daily"
        payload = self._format_payload(data, metadata)
        await self._publish(topic, payload)

        return True

    async def test_connection(self) -> Dict[str, Any]:
        """Test MQTT connection."""
        start = time.time()

        try:
            async with aiomqtt.Client(
                hostname=self._config.host,
                port=self._config.port,
                username=self._config.username or None,
                password=self._config.password or None,
            ):
                latency = (time.time() - start) * 1000
                return {
                    "success": True,
                    "latency_ms": round(latency, 2),
                    "message": f"Connected to {self._config.host}:{self._config.port}",
                    "details": {
                        "broker": self._config.host,
                        "port": self._config.port,
                    },
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
                "host": {"type": "string", "title": "Hôte", "default": "localhost"},
                "port": {
                    "type": "integer",
                    "title": "Port",
                    "default": 1883,
                    "minimum": 1,
                    "maximum": 65535,
                },
                "username": {"type": "string", "title": "Utilisateur"},
                "password": {"type": "string", "title": "Mot de passe", "format": "password"},
                "tls": {"type": "boolean", "title": "TLS/SSL", "default": False},
                "topic_prefix": {
                    "type": "string",
                    "title": "Préfixe des topics",
                    "default": "myelectricaldata",
                },
                "qos": {"type": "integer", "title": "QoS", "enum": [0, 1, 2], "default": 1},
                "retain": {"type": "boolean", "title": "Retain", "default": True},
                "format": {
                    "type": "string",
                    "title": "Format",
                    "enum": ["json", "simple"],
                    "default": "json",
                },
            },
            "required": ["host", "port"],
        }

    def _build_consumption_topics(
        self,
        pdl: str,
        data: Dict[str, Any],
        metadata: Optional[Dict[str, Any]],
    ) -> Dict[str, str]:
        """Build topics and payloads for consumption data."""
        prefix = f"{self._config.topic_prefix}/{pdl}/consumption"

        topics = {}

        # Main topic
        topics[f"{prefix}/daily"] = self._format_payload({"value": data.get("daily", 0), **data}, metadata)

        # HC/HP topics if available
        if "hc" in data:
            topics[f"{prefix}/hc"] = self._format_payload({"value": data["hc"]}, metadata)
        if "hp" in data:
            topics[f"{prefix}/hp"] = self._format_payload({"value": data["hp"]}, metadata)

        return topics

    def _format_payload(self, data: Dict[str, Any], metadata: Optional[Dict[str, Any]]) -> str:
        """Format payload according to configured format."""
        if self._config.format == "simple":
            return str(data.get("value", 0))

        # JSON format
        payload = {**data}
        if metadata:
            payload.update(metadata)
        return json.dumps(payload)

    async def _publish(self, topic: str, payload: str) -> None:
        """Publish a message to a topic."""
        await self._client.publish(
            topic,
            payload=payload,
            qos=self._config.qos,
            retain=self._config.retain,
        )
        self.logger.debug(f"Published to {topic}: {payload[:100]}...")
