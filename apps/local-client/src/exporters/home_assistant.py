"""Home Assistant Exporter - MQTT Discovery integration."""

import json
import time
from typing import Any, Dict, Optional

import aiomqtt
from pydantic import Field

from .base import BaseExporter, ExporterConfig, ExporterStatus


class HomeAssistantConfig(ExporterConfig):
    """Home Assistant exporter configuration."""

    # MQTT Discovery
    discovery: bool = Field(default=True, description="Enable MQTT Discovery")
    discovery_prefix: str = Field(default="homeassistant", description="Discovery prefix")
    entity_prefix: str = Field(default="myelectricaldata", description="Entity prefix")

    # Features
    energy_dashboard: bool = Field(default=True, description="Enable Energy Dashboard compatibility")
    statistics: bool = Field(default=True, description="Enable long-term statistics")

    # MQTT Connection
    mqtt_host: str = Field(default="localhost", description="MQTT broker host")
    mqtt_port: int = Field(default=1883, ge=1, le=65535, description="MQTT broker port")
    mqtt_username: str = Field(default="", description="MQTT username")
    mqtt_password: str = Field(default="", description="MQTT password")


class HomeAssistantExporter(BaseExporter):
    """Home Assistant exporter via MQTT Discovery.

    Creates sensors automatically in Home Assistant with:
    - Energy Dashboard compatibility
    - Long-term statistics support
    - Device grouping by PDL
    """

    name = "home_assistant"
    description = "Intégration Home Assistant via MQTT Discovery"
    version = "1.0.0"

    def __init__(self, config: Dict[str, Any]):
        super().__init__(config)
        self._client: Optional[aiomqtt.Client] = None
        self._discovered_pdls: set = set()

    def _validate_config(self, config: Dict[str, Any]) -> HomeAssistantConfig:
        return HomeAssistantConfig(**config)

    async def connect(self) -> bool:
        """Connect to MQTT broker."""
        try:
            self._status = ExporterStatus.CONNECTING
            self.logger.info(f"Connecting to {self._config.mqtt_host}:{self._config.mqtt_port}")

            self._client = aiomqtt.Client(
                hostname=self._config.mqtt_host,
                port=self._config.mqtt_port,
                username=self._config.mqtt_username or None,
                password=self._config.mqtt_password or None,
            )

            await self._client.__aenter__()
            self._status = ExporterStatus.CONNECTED
            self.logger.info("Connected to MQTT broker for Home Assistant")
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
                self._discovered_pdls.clear()

    async def export_consumption(
        self,
        pdl: str,
        data: Dict[str, Any],
        metadata: Optional[Dict[str, Any]] = None,
    ) -> bool:
        """Export consumption data to Home Assistant."""
        if not self.is_connected:
            raise RuntimeError("Not connected to MQTT broker")

        # Register discovery if needed
        if self._config.discovery and pdl not in self._discovered_pdls:
            await self._publish_discovery(pdl, has_production=False)
            self._discovered_pdls.add(pdl)

        # Publish state
        await self._publish_consumption_state(pdl, data, metadata)

        return True

    async def export_production(
        self,
        pdl: str,
        data: Dict[str, Any],
        metadata: Optional[Dict[str, Any]] = None,
    ) -> bool:
        """Export production data to Home Assistant."""
        if not self.is_connected:
            raise RuntimeError("Not connected to MQTT broker")

        # Publish state
        await self._publish_production_state(pdl, data, metadata)

        return True

    async def _publish_discovery(self, pdl: str, has_production: bool = False) -> None:
        """Publish MQTT Discovery configuration for a PDL."""
        device_info = {
            "identifiers": [f"med_{pdl}"],
            "name": f"Linky {pdl}",
            "manufacturer": "Enedis",
            "model": "Compteur Linky",
            "sw_version": "1.0",
        }

        # Consumption daily sensor
        await self._publish_sensor_discovery(
            pdl=pdl,
            sensor_type="consumption_daily",
            name="Consommation journalière",
            unit="kWh",
            device_class="energy",
            state_class="total_increasing" if self._config.energy_dashboard else "measurement",
            device_info=device_info,
        )

        # HC sensor
        await self._publish_sensor_discovery(
            pdl=pdl,
            sensor_type="consumption_hc",
            name="Consommation Heures Creuses",
            unit="kWh",
            device_class="energy",
            state_class="total_increasing" if self._config.energy_dashboard else "measurement",
            device_info=device_info,
        )

        # HP sensor
        await self._publish_sensor_discovery(
            pdl=pdl,
            sensor_type="consumption_hp",
            name="Consommation Heures Pleines",
            unit="kWh",
            device_class="energy",
            state_class="total_increasing" if self._config.energy_dashboard else "measurement",
            device_info=device_info,
        )

        # Max power sensor
        await self._publish_sensor_discovery(
            pdl=pdl,
            sensor_type="max_power",
            name="Puissance maximale",
            unit="kVA",
            device_class="apparent_power",
            state_class="measurement",
            device_info=device_info,
        )

        if has_production:
            await self._publish_sensor_discovery(
                pdl=pdl,
                sensor_type="production_daily",
                name="Production journalière",
                unit="kWh",
                device_class="energy",
                state_class="total_increasing" if self._config.energy_dashboard else "measurement",
                device_info=device_info,
            )

        self.logger.info(f"Published discovery for PDL {pdl}")

    async def _publish_sensor_discovery(
        self,
        pdl: str,
        sensor_type: str,
        name: str,
        unit: str,
        device_class: str,
        state_class: str,
        device_info: Dict[str, Any],
    ) -> None:
        """Publish discovery config for a single sensor."""
        unique_id = f"med_{pdl}_{sensor_type}"
        object_id = f"{self._config.entity_prefix}_{pdl}_{sensor_type}"

        config = {
            "name": name,
            "unique_id": unique_id,
            "object_id": object_id,
            "state_topic": f"{self._config.entity_prefix}/{pdl}/{sensor_type}/state",
            "unit_of_measurement": unit,
            "device_class": device_class,
            "state_class": state_class,
            "device": device_info,
        }

        if self._config.statistics:
            config["force_update"] = True

        topic = f"{self._config.discovery_prefix}/sensor/{unique_id}/config"
        await self._client.publish(topic, payload=json.dumps(config), qos=1, retain=True)

    async def _publish_consumption_state(
        self,
        pdl: str,
        data: Dict[str, Any],
        metadata: Optional[Dict[str, Any]],
    ) -> None:
        """Publish consumption state values."""
        base_topic = f"{self._config.entity_prefix}/{pdl}"

        # Daily consumption
        if "daily" in data:
            await self._client.publish(
                f"{base_topic}/consumption_daily/state",
                payload=str(data["daily"]),
                qos=1,
                retain=True,
            )

        # HC
        if "hc" in data and data["hc"] is not None:
            await self._client.publish(
                f"{base_topic}/consumption_hc/state",
                payload=str(data["hc"]),
                qos=1,
                retain=True,
            )

        # HP
        if "hp" in data and data["hp"] is not None:
            await self._client.publish(
                f"{base_topic}/consumption_hp/state",
                payload=str(data["hp"]),
                qos=1,
                retain=True,
            )

        # Max power
        if "max_power" in data and data["max_power"] is not None:
            await self._client.publish(
                f"{base_topic}/max_power/state",
                payload=str(data["max_power"]),
                qos=1,
                retain=True,
            )

    async def _publish_production_state(
        self,
        pdl: str,
        data: Dict[str, Any],
        metadata: Optional[Dict[str, Any]],
    ) -> None:
        """Publish production state values."""
        base_topic = f"{self._config.entity_prefix}/{pdl}"

        if "daily" in data:
            await self._client.publish(
                f"{base_topic}/production_daily/state",
                payload=str(data["daily"]),
                qos=1,
                retain=True,
            )

    async def test_connection(self) -> Dict[str, Any]:
        """Test MQTT connection."""
        start = time.time()

        try:
            async with aiomqtt.Client(
                hostname=self._config.mqtt_host,
                port=self._config.mqtt_port,
                username=self._config.mqtt_username or None,
                password=self._config.mqtt_password or None,
            ):
                latency = (time.time() - start) * 1000
                return {
                    "success": True,
                    "latency_ms": round(latency, 2),
                    "message": f"Connected to {self._config.mqtt_host}:{self._config.mqtt_port}",
                    "details": {
                        "broker": self._config.mqtt_host,
                        "port": self._config.mqtt_port,
                        "discovery_prefix": self._config.discovery_prefix,
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
                "discovery": {"type": "boolean", "title": "MQTT Discovery", "default": True},
                "discovery_prefix": {
                    "type": "string",
                    "title": "Préfixe Discovery",
                    "default": "homeassistant",
                },
                "entity_prefix": {
                    "type": "string",
                    "title": "Préfixe entités",
                    "default": "myelectricaldata",
                },
                "energy_dashboard": {
                    "type": "boolean",
                    "title": "Energy Dashboard",
                    "default": True,
                    "description": "Compatibilité avec le Energy Dashboard",
                },
                "statistics": {
                    "type": "boolean",
                    "title": "Statistiques long terme",
                    "default": True,
                },
                "mqtt_host": {"type": "string", "title": "Hôte MQTT", "default": "localhost"},
                "mqtt_port": {
                    "type": "integer",
                    "title": "Port MQTT",
                    "default": 1883,
                    "minimum": 1,
                    "maximum": 65535,
                },
                "mqtt_username": {"type": "string", "title": "Utilisateur MQTT"},
                "mqtt_password": {
                    "type": "string",
                    "title": "Mot de passe MQTT",
                    "format": "password",
                },
            },
            "required": ["mqtt_host", "mqtt_port"],
        }
