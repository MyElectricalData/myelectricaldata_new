"""Home Assistant Exporter via MQTT Discovery

Full-featured Home Assistant exporter using MQTT Discovery for proper entity registration.
This allows entities to have unique_id, device grouping, and full HA UI management.

Compatible with the original MyElectricalData entity structure:
- Topics: myelectricaldata_rte/, myelectricaldata_edf/, myelectricaldata_consumption/, etc.
- Devices: RTE Tempo, EDF Tempo, RTE EcoWatt, Linky {pdl}

Entities created:
- RTE Tempo device:
  - sensor.myelectricaldata_tempo_today (today's color)
  - sensor.myelectricaldata_tempo_tomorrow (tomorrow's color)
- EDF Tempo device:
  - sensor.myelectricaldata_tempo_info (contract info)
  - sensor.myelectricaldata_tempo_days_{blue,white,red} (days count per color)
  - sensor.myelectricaldata_tempo_price_{blue_hp,blue_hc,white_hp,white_hc,red_hp,red_hc}
- RTE EcoWatt device:
  - sensor.myelectricaldata_ecowatt_j0 (today)
  - sensor.myelectricaldata_ecowatt_j1 (tomorrow)
  - sensor.myelectricaldata_ecowatt_j2 (day after tomorrow)
- Linky {pdl} device:
  - sensor.myelectricaldata_linky_{pdl}_consumption
  - sensor.myelectricaldata_linky_{pdl}_production
  - sensor.myelectricaldata_linky_{pdl}_consumption_history (31 last days as attributes)
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import ssl
from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Any

import aiomqtt
import websockets
from sqlalchemy import String, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from .base import BaseExporter
from .tariff import DEFAULT_OFFPEAK_RANGES, is_offpeak, is_offpeak_slot, tariff_profile

logger = logging.getLogger(__name__)

# Coût du panneau Énergie : mois d'hiver de l'offre SEASONAL (cf. offers/seasonal.py) et
# offres dont le samedi et le dimanche ont leur propre prix (*_price_weekend)
SEASONAL_WINTER_MONTHS = frozenset({11, 12, 1, 2, 3})
WEEKEND_PRICE_OPTIONS = frozenset({"HC_WEEKEND", "WEEKEND", "BASE_WEEKEND"})


def _day_price(offer: Any, tariff_tag: str, day: date) -> float | None:
    """Prix du kWh d'une série base / hc / hp pour un jour donné (hors Tempo)

    - SEASONAL : prix d'hiver (novembre-mars) ou d'été (avril-octobre)
    - HC_WEEKEND, WEEKEND, BASE_WEEKEND : prix week-end le samedi et le dimanche, sinon (ou
      s'il n'est pas renseigné) prix de semaine
    - autres offres : prix unique de la série
    """
    option = (offer.offer_type or "").strip().upper()
    if option == "SEASONAL":
        season = "winter" if day.month in SEASONAL_WINTER_MONTHS else "summer"
        price = getattr(offer, f"{tariff_tag}_price_{season}", None)
    else:
        price = getattr(offer, f"{tariff_tag}_price", None)
        if option in WEEKEND_PRICE_OPTIONS and day.weekday() >= 5:
            price = getattr(offer, f"{tariff_tag}_price_weekend", None) or price
    return float(price) if price else None


# Tempo quotas per season (EDF contract limits)
TEMPO_QUOTAS = {
    "BLUE": 300,   # 300 jours/an
    "WHITE": 43,   # 43 jours/an
    "RED": 22,     # 22 jours/an
}

# EDF Tempo prices (EUR/kWh) - Tarifs réglementés 2024
# Format: {color}_{period} where period is HP (heures pleines) or HC (heures creuses)
TEMPO_PRICES = {
    "blue_hc": 0.1296,   # Jour Bleu HC
    "blue_hp": 0.1609,   # Jour Bleu HP
    "white_hc": 0.1486,  # Jour Blanc HC
    "white_hp": 0.1894,  # Jour Blanc HP
    "red_hc": 0.1568,    # Jour Rouge HC
    "red_hp": 0.7562,    # Jour Rouge HP
}

# Tempo price display names
TEMPO_PRICE_NAMES = {
    "blue_hc": "Blue HC",
    "blue_hp": "Blue HP",
    "white_hc": "White HC",
    "white_hp": "White HP",
    "red_hc": "Red HC",
    "red_hp": "Red HP",
}

# Software version for device info
SOFTWARE_VERSION = "1.8.0"


class HomeAssistantExporter(BaseExporter):
    """Home Assistant exporter using MQTT Discovery

    Configuration:
        mqtt_broker: MQTT broker hostname
        mqtt_port: MQTT broker port (default: 1883)
        mqtt_username: MQTT username (optional)
        mqtt_password: MQTT password (optional)
        mqtt_use_tls: Use TLS for MQTT connection (default: False)
        entity_prefix: Entity ID prefix (default: myelectricaldata)
        discovery_prefix: HA discovery topic prefix (default: homeassistant)

    Creates entities with proper unique_id and device grouping under "MyElectricalData".
    """

    def _validate_config(self) -> None:
        """Validate Home Assistant MQTT configuration"""
        if not self.config.get("mqtt_broker"):
            raise ValueError("MQTT broker hostname is required")

        self.broker = self.config["mqtt_broker"]
        self.port = self.config.get("mqtt_port", 1883)
        self.username = self.config.get("mqtt_username")
        self.password = self.config.get("mqtt_password")
        self.use_tls = self.config.get("mqtt_use_tls", False)
        self.prefix = self.config.get("entity_prefix", "myelectricaldata")
        self.discovery_prefix = self.config.get("discovery_prefix", "homeassistant")

    def _get_device_rte_tempo(self) -> dict[str, Any]:
        """Get device info for RTE Tempo

        Original MyElectricalData device structure:
        - identifiers: "rte_tempo"
        - name: "RTE Tempo"
        - model: "RTE"
        """
        return {
            "identifiers": ["rte_tempo"],
            "name": "RTE Tempo",
            "manufacturer": "MyElectricalData",
            "model": "RTE",
            "sw_version": SOFTWARE_VERSION,
        }

    def _get_device_edf_tempo(self) -> dict[str, Any]:
        """Get device info for EDF Tempo (prices and days count)

        Original MyElectricalData device structure:
        - identifiers: "edf_tempo"
        - name: "EDF Tempo"
        - model: "EDF"
        """
        return {
            "identifiers": ["edf_tempo"],
            "name": "EDF Tempo",
            "manufacturer": "MyElectricalData",
            "model": "EDF",
            "sw_version": SOFTWARE_VERSION,
        }

    def _get_device_rte_ecowatt(self) -> dict[str, Any]:
        """Get device info for RTE EcoWatt

        Original MyElectricalData device structure:
        - identifiers: "rte_ecowatt"
        - name: "RTE EcoWatt"
        - model: "RTE"
        """
        return {
            "identifiers": ["rte_ecowatt"],
            "name": "RTE EcoWatt",
            "manufacturer": "MyElectricalData",
            "model": "RTE",
            "sw_version": SOFTWARE_VERSION,
        }

    def _get_device_linky(self, pdl: str) -> dict[str, Any]:
        """Get device info for a Linky meter (per PDL)

        Original MyElectricalData device structure:
        - identifiers: "{pdl}"
        - name: "Linky {pdl}"
        - model: "linky {pdl}"

        Args:
            pdl: The usage point ID (PDL number)
        """
        return {
            "identifiers": [pdl],
            "name": f"Linky {pdl}",
            "manufacturer": "MyElectricalData",
            "model": f"linky {pdl}",
            "sw_version": SOFTWARE_VERSION,
        }

    # Legacy compatibility
    def _get_device_info(self, pdl: str | None = None) -> dict[str, Any]:
        """Legacy method - use specific device methods instead"""
        if pdl:
            return self._get_device_linky(pdl)
        else:
            # Default to RTE Tempo for global sensors
            return self._get_device_rte_tempo()

    async def _get_mqtt_client(self) -> aiomqtt.Client:
        """Create and return an MQTT client

        Returns:
            Configured aiomqtt.Client instance
        """
        tls_context = None
        if self.use_tls:
            tls_context = ssl.create_default_context()

        return aiomqtt.Client(
            hostname=self.broker,
            port=self.port,
            username=self.username,
            password=self.password,
            tls_context=tls_context,
        )

    async def test_connection(self) -> bool:
        """Test connection to MQTT broker

        Returns:
            True if connection successful

        Raises:
            Exception if connection fails
        """
        async with await self._get_mqtt_client() as client:
            # Publish a test message
            await client.publish(
                f"{self.prefix}/status",
                payload="online",
                retain=True,
            )
            logger.info(f"[HA-MQTT] Connected to MQTT broker: {self.broker}:{self.port}")
            return True

    async def export_consumption(
        self,
        usage_point_id: str,
        data: list[dict[str, Any]],
        granularity: str,
    ) -> int:
        """Export consumption data to Home Assistant via MQTT Discovery

        Args:
            usage_point_id: PDL number
            data: List of consumption records
            granularity: 'daily' or 'detailed'

        Returns:
            Number of records exported
        """
        if not data:
            return 0

        total_kwh = sum(r.get("value", 0) for r in data) / 1000
        latest = data[-1] if data else None

        unique_id = f"{self.prefix}_{usage_point_id}_consumption_{granularity}"
        state_topic = f"{self.prefix}/{usage_point_id}/consumption/{granularity}"

        # Discovery config
        discovery_config = {
            "unique_id": unique_id,
            "name": f"Consommation {usage_point_id} ({granularity})",
            "state_topic": state_topic,
            "unit_of_measurement": "kWh",
            "device_class": "energy",
            "state_class": "total_increasing",
            "value_template": "{{ value_json.value }}",
            "json_attributes_topic": state_topic,
            "device": self._get_device_info(usage_point_id),
        }

        # State payload
        state_payload = {
            "value": round(total_kwh, 2),
            "usage_point_id": usage_point_id,
            "granularity": granularity,
            "records_count": len(data),
            "last_update": latest.get("date") if latest else None,
        }

        async with await self._get_mqtt_client() as client:
            # Publish discovery config
            # Format: homeassistant/sensor/{node_id}/{object_id}/config
            object_id = f"{usage_point_id}_consumption_{granularity}"
            await client.publish(
                f"{self.discovery_prefix}/sensor/{self.prefix}/{object_id}/config",
                payload=json.dumps(discovery_config),
                retain=True,
            )
            # Publish state
            await client.publish(
                state_topic,
                payload=json.dumps(state_payload),
                retain=True,
            )

        logger.info(f"[HA-MQTT] Exported consumption for {usage_point_id}: {len(data)} records, {total_kwh:.2f} kWh")
        return len(data)

    async def export_production(
        self,
        usage_point_id: str,
        data: list[dict[str, Any]],
        granularity: str,
    ) -> int:
        """Export production data to Home Assistant via MQTT Discovery

        Args:
            usage_point_id: PDL number
            data: List of production records
            granularity: 'daily' or 'detailed'

        Returns:
            Number of records exported
        """
        if not data:
            return 0

        total_kwh = sum(r.get("value", 0) for r in data) / 1000
        latest = data[-1] if data else None

        unique_id = f"{self.prefix}_{usage_point_id}_production_{granularity}"
        state_topic = f"{self.prefix}/{usage_point_id}/production/{granularity}"

        discovery_config = {
            "unique_id": unique_id,
            "name": f"Production {usage_point_id} ({granularity})",
            "state_topic": state_topic,
            "unit_of_measurement": "kWh",
            "device_class": "energy",
            "state_class": "total_increasing",
            "value_template": "{{ value_json.value }}",
            "json_attributes_topic": state_topic,
            "device": self._get_device_info(usage_point_id),
        }

        state_payload = {
            "value": round(total_kwh, 2),
            "usage_point_id": usage_point_id,
            "granularity": granularity,
            "records_count": len(data),
            "last_update": latest.get("date") if latest else None,
        }

        async with await self._get_mqtt_client() as client:
            # Format: homeassistant/sensor/{node_id}/{object_id}/config
            object_id = f"{usage_point_id}_production_{granularity}"
            await client.publish(
                f"{self.discovery_prefix}/sensor/{self.prefix}/{object_id}/config",
                payload=json.dumps(discovery_config),
                retain=True,
            )
            await client.publish(
                state_topic,
                payload=json.dumps(state_payload),
                retain=True,
            )

        logger.info(f"[HA-MQTT] Exported production for {usage_point_id}: {len(data)} records, {total_kwh:.2f} kWh")
        return len(data)

    # =========================================================================
    # FULL EXPORT METHOD
    # =========================================================================

    async def run_full_export(
        self,
        db: AsyncSession,
        usage_point_ids: list[str],
        run_mqtt: bool = True,
        run_energy: bool = True,
    ) -> dict[str, Any]:
        """Run full Home Assistant export via MQTT Discovery

        This method exports comprehensive data:
        - Consumption/Production statistics (daily, monthly, yearly)
        - Tempo information (colors, remaining days)
        - EcoWatt signals

        All entities are created with unique_id and grouped under device "MyElectricalData".

        Args:
            db: Database session
            usage_point_ids: List of PDL numbers to export
            run_mqtt: Exécuter la partie MQTT Discovery (pour le scheduler)
            run_energy: Exécuter la partie Energy Dashboard (pour le scheduler)

        Returns:
            Export results summary
        """
        from ..statistics import StatisticsService
        stats = StatisticsService(db)

        # Flags de la config (préférences utilisateur) combinés avec les flags d'appel (contrôle scheduler)
        mqtt_enabled = self.config.get("mqtt_enabled", True) and run_mqtt
        energy_enabled = self.config.get("energy_enabled", True) and run_energy

        results = {
            "consumption": 0,
            "production": 0,
            "linky_card": 0,
            "tempo": 0,
            "ecowatt": 0,
            "errors": [],
        }

        if mqtt_enabled:
            async with await self._get_mqtt_client() as client:
                # Publish online status
                await client.publish(
                    f"{self.prefix}/status",
                    payload="online",
                    retain=True,
                )

                # Global exports (not PDL-specific)
                try:
                    count = await self._export_tempo(client, db)
                    results["tempo"] = count
                except Exception as e:
                    logger.error(f"[HA-MQTT] Tempo export failed: {e}")
                    results["errors"].append(f"tempo: {str(e)}")

                try:
                    count = await self._export_ecowatt(client, db)
                    results["ecowatt"] = count
                except Exception as e:
                    logger.error(f"[HA-MQTT] EcoWatt export failed: {e}")
                    results["errors"].append(f"ecowatt: {str(e)}")

                # Per-PDL exports (content-card-linky compatible)
                for pdl in usage_point_ids:
                    try:
                        # Sensor principal compatible content-card-linky (consommation)
                        count = await self._export_linky_card_stats(
                            client, stats, db, pdl, "consumption"
                        )
                        results["consumption"] += count
                        results["linky_card"] += count

                        # Capteurs HP/HC (contrats à heures creuses)
                        results["consumption"] += await self._export_hp_hc_sensors(client, db, pdl)

                        # Sensor production (si applicable)
                        count = await self._export_linky_card_stats(
                            client, stats, db, pdl, "production"
                        )
                        results["production"] += count
                        results["linky_card"] += count

                    except Exception as e:
                        logger.error(f"[HA-MQTT] Export failed for PDL {pdl}: {e}")
                        results["errors"].append(f"{pdl}: {str(e)}")

        if mqtt_enabled:
            logger.info(f"[HA-MQTT] Full export completed: {results}")

        # Import automatique vers le Energy Dashboard si activé et configuré
        if energy_enabled and self._has_websocket_config():
            try:
                # Lire les paramètres ED depuis la config
                ed_sync_delay = self.config.get("sync_delay_ms", 500)
                ed_chunk_size = self.config.get("chunk_size", 2000)
                ed_incremental = self.config.get("incremental_import", True)
                logger.info(f"[HA-WS] Lancement de l'import vers Energy Dashboard (incremental={ed_incremental}, chunk={ed_chunk_size}, delay={ed_sync_delay}ms)")
                ws_results = await self.import_statistics(
                    db, usage_point_ids,
                    clear_first=not ed_incremental,
                    sync_delay_ms=ed_sync_delay,
                    chunk_size=ed_chunk_size,
                    incremental=ed_incremental,
                )
                results["energy_dashboard"] = ws_results
                if ws_results.get("success"):
                    logger.info(
                        f"[HA-WS] Import Energy Dashboard réussi: "
                        f"{ws_results.get('consumption', 0)} conso, "
                        f"{ws_results.get('cost', 0)} coût, "
                        f"{ws_results.get('production', 0)} prod"
                    )
                else:
                    logger.warning(f"[HA-WS] Import Energy Dashboard échoué: {ws_results.get('message')}")
                    results["errors"].append(f"energy_dashboard: {ws_results.get('message')}")
            except Exception as e:
                logger.error(f"[HA-WS] Import Energy Dashboard échoué: {e}")
                results["errors"].append(f"energy_dashboard: {str(e)}")

        return results

    async def run_full_export_with_progress(
        self,
        db: AsyncSession,
        usage_point_ids: list[str],
        progress_callback,
        run_mqtt: bool = True,
        run_energy: bool = True,
    ) -> dict[str, Any]:
        """Run full export avec callback de progression pour chaque étape

        Étapes :
        1. Connexion MQTT
        2. Export Tempo
        3. Export EcoWatt
        4. Export par PDL (consommation + production)
        5. Import Energy Dashboard (si WebSocket configuré)

        Args:
            db: Database session
            usage_point_ids: List of PDL numbers
            progress_callback: async callable(event: dict) pour signaler la progression
            run_mqtt: Exécuter la partie MQTT Discovery (pour le scheduler)
            run_energy: Exécuter la partie Energy Dashboard (pour le scheduler)
        """
        from ..statistics import StatisticsService
        stats = StatisticsService(db)

        # Flags de la config (préférences utilisateur) combinés avec les flags d'appel (contrôle scheduler)
        mqtt_enabled = self.config.get("mqtt_enabled", True) and run_mqtt
        energy_enabled = self.config.get("energy_enabled", True) and run_energy
        has_ws = energy_enabled and self._has_websocket_config()

        # Calcul du nombre total d'étapes
        mqtt_steps = (3 + len(usage_point_ids)) if mqtt_enabled else 0
        energy_step = 1 if has_ws else 0
        total_steps = mqtt_steps + energy_step
        if total_steps == 0:
            total_steps = 1  # Éviter division par zéro
        current_step = 0

        results = {
            "consumption": 0,
            "production": 0,
            "linky_card": 0,
            "tempo": 0,
            "ecowatt": 0,
            "errors": [],
        }

        async def emit(message: str, status: str = "running"):
            nonlocal current_step
            current_step += 1
            percent = min(int(current_step / total_steps * 100), 100)
            await progress_callback({
                "event_type": "progress",
                "step": current_step,
                "total_steps": total_steps,
                "percent": percent,
                "message": message,
                "status": status,
                **{k: v for k, v in results.items() if k != "errors"},
            })

        # Partie MQTT Discovery
        if mqtt_enabled:
            await emit("Connexion au broker MQTT...")

            async with await self._get_mqtt_client() as client:
                await client.publish(f"{self.prefix}/status", payload="online", retain=True)

                # Tempo
                try:
                    count = await self._export_tempo(client, db)
                    results["tempo"] = count
                    await emit(f"Tempo exporté ({count} entités)")
                except Exception as e:
                    logger.error(f"[HA-MQTT] Tempo export failed: {e}")
                    results["errors"].append(f"tempo: {str(e)}")
                    await emit(f"Tempo : erreur ({e})", "warning")

                # EcoWatt
                try:
                    count = await self._export_ecowatt(client, db)
                    results["ecowatt"] = count
                    await emit(f"EcoWatt exporté ({count} entités)")
                except Exception as e:
                    logger.error(f"[HA-MQTT] EcoWatt export failed: {e}")
                    results["errors"].append(f"ecowatt: {str(e)}")
                    await emit(f"EcoWatt : erreur ({e})", "warning")

                # Par PDL
                for pdl in usage_point_ids:
                    try:
                        count_c = await self._export_linky_card_stats(client, stats, db, pdl, "consumption")
                        results["consumption"] += count_c
                        results["linky_card"] += count_c
                        count_hp_hc = await self._export_hp_hc_sensors(client, db, pdl)
                        results["consumption"] += count_hp_hc
                        count_c += count_hp_hc

                        count_p = await self._export_linky_card_stats(client, stats, db, pdl, "production")
                        results["production"] += count_p
                        results["linky_card"] += count_p

                        await emit(f"PDL {pdl} exporté ({count_c} conso, {count_p} prod)")
                    except Exception as e:
                        logger.error(f"[HA-MQTT] Export failed for PDL {pdl}: {e}")
                        results["errors"].append(f"{pdl}: {str(e)}")
                        await emit(f"PDL {pdl} : erreur ({e})", "warning")

        # Partie Energy Dashboard (avec progression granulaire)
        if has_ws:
            try:
                await emit("Import vers Energy Dashboard...")

                # Relayer les événements de progression ED vers le callback principal
                async def ed_progress_callback(event: dict) -> None:
                    await progress_callback({
                        "event_type": "energy_dashboard_progress",
                        "step": event.get("step", 0),
                        "total_steps": event.get("total_steps", 0),
                        "percent": event.get("percent", 0),
                        "message": event.get("message", ""),
                        "ed_consumption": event.get("consumption", 0),
                        "ed_cost": event.get("cost", 0),
                        "ed_production": event.get("production", 0),
                    })

                # Lire les paramètres ED depuis la config
                ed_sync_delay = self.config.get("sync_delay_ms", 500)
                ed_chunk_size = self.config.get("chunk_size", 2000)
                ed_incremental = self.config.get("incremental_import", True)

                ws_results = await self.import_statistics_with_progress(
                    db, usage_point_ids,
                    clear_first=not ed_incremental,
                    progress_callback=ed_progress_callback,
                    sync_delay_ms=ed_sync_delay,
                    chunk_size=ed_chunk_size,
                    incremental=ed_incremental,
                )
                results["energy_dashboard"] = ws_results
                if ws_results.get("success"):
                    logger.info("[HA-WS] Import Energy Dashboard réussi")
                else:
                    results["errors"].append(f"energy_dashboard: {ws_results.get('message')}")
            except Exception as e:
                logger.error(f"[HA-WS] Import Energy Dashboard échoué: {e}")
                results["errors"].append(f"energy_dashboard: {str(e)}")

        logger.info(f"[HA-MQTT] Full export with progress completed: {results}")
        return results

    async def _publish_sensor_old_format(
        self,
        client: aiomqtt.Client,
        topic: str,
        name: str,
        unique_id: str,
        device: dict[str, Any],
        state: Any,
        attributes: dict[str, Any] | None = None,
        unit: str | None = None,
        device_class: str | None = None,
        state_class: str | None = None,
        icon: str | None = None,
    ) -> None:
        """Publish a sensor via MQTT Discovery using old MyElectricalData format

        Original format from MyElectricalData:
        - Discovery config: {discovery_prefix}/sensor/{topic}/config
        - State topic: {discovery_prefix}/sensor/{topic}/state
        - Attributes topic: {discovery_prefix}/sensor/{topic}/attributes

        Args:
            client: MQTT client
            topic: Topic path (e.g., "myelectricaldata_rte/tempo_today")
            name: Display name for the entity
            unique_id: Unique ID for the entity (e.g., "myelectricaldata_tempo_today")
            device: Device info dict
            state: Current state value
            attributes: Additional attributes (optional)
            unit: Unit of measurement (optional)
            device_class: HA device class (optional)
            state_class: HA state class (optional)
            icon: MDI icon (optional)
        """
        # Base paths
        config_topic = f"{self.discovery_prefix}/sensor/{topic}/config"
        state_topic = f"{self.discovery_prefix}/sensor/{topic}/state"
        attributes_topic = f"{self.discovery_prefix}/sensor/{topic}/attributes"

        # Build discovery config
        discovery_config: dict[str, Any] = {
            "name": name,
            "uniq_id": unique_id,
            # entity_id suggéré à la première découverte (sinon HA le dérive du nom de l'appareil,
            # ex. sensor.linky_<pdl>_consumption) ; sans effet sur une entité déjà enregistrée.
            # default_entity_id pour HA >= 2025.10, object_id pour les versions antérieures
            # (déprécié puis retiré en 2026.4, ignoré sans avertissement quand les deux sont présents)
            "default_entity_id": f"sensor.{unique_id}",
            "object_id": unique_id,
            "stat_t": state_topic,
            "json_attr_t": attributes_topic,
            "device": device,
        }

        if unit:
            discovery_config["unit_of_meas"] = unit
        if device_class:
            discovery_config["dev_cla"] = device_class
        if state_class:
            discovery_config["stat_cla"] = state_class
        if icon:
            discovery_config["ic"] = icon

        # Publish discovery config (retained)
        await client.publish(
            config_topic,
            payload=json.dumps(discovery_config),
            retain=True,
        )

        # Préfixe personnalisé : vider la copie que les versions précédentes retenaient sous
        # "homeassistant/" (message vide retenu = suppression). Ne jamais le faire avec le préfixe
        # par défaut, ce serait la config qu'on vient de publier.
        if self.discovery_prefix != "homeassistant":
            await client.publish(f"homeassistant/sensor/{topic}/config", payload=b"", retain=True)

        # Publish state (retained) - simple value, not JSON
        state_str = str(state) if state is not None else ""
        await client.publish(
            state_topic,
            payload=state_str,
            retain=True,
        )

        # Publish attributes (retained) - JSON object
        if attributes:
            await client.publish(
                attributes_topic,
                payload=json.dumps(attributes),
                retain=True,
            )

    # Keep the old method for compatibility but marked as deprecated
    async def _publish_sensor(
        self,
        client: aiomqtt.Client,
        unique_id: str,
        name: str,
        state_topic: str,
        state: Any,
        attributes: dict[str, Any],
        device: dict[str, Any],
        unit: str | None = None,
        device_class: str | None = None,
        state_class: str | None = None,
        icon: str | None = None,
        entity_category: str | None = None,
    ) -> None:
        """Publish a sensor via MQTT Discovery (legacy method, use _publish_sensor_old_format)"""
        # Build discovery config
        discovery_config: dict[str, Any] = {
            "unique_id": unique_id,
            "name": name,
            "state_topic": state_topic,
            "value_template": "{{ value_json.state }}",
            "json_attributes_topic": state_topic,
            "device": device,
        }

        if unit:
            discovery_config["unit_of_measurement"] = unit
        if device_class:
            discovery_config["device_class"] = device_class
        if state_class:
            discovery_config["state_class"] = state_class
        if icon:
            discovery_config["icon"] = icon
        if entity_category:
            discovery_config["entity_category"] = entity_category

        # Build state payload
        state_payload = {
            "state": state,
            **attributes,
        }

        # Publish discovery config (retained)
        object_id = unique_id.replace(f"{self.prefix}_", "", 1) if unique_id.startswith(f"{self.prefix}_") else unique_id
        await client.publish(
            f"{self.discovery_prefix}/sensor/{self.prefix}/{object_id}/config",
            payload=json.dumps(discovery_config),
            retain=True,
        )

        # Publish state (retained)
        await client.publish(
            state_topic,
            payload=json.dumps(state_payload),
            retain=True,
        )

    async def _publish_binary_sensor(
        self,
        client: aiomqtt.Client,
        unique_id: str,
        name: str,
        state_topic: str,
        is_on: bool,
        attributes: dict[str, Any],
        device: dict[str, Any],
        device_class: str | None = None,
        icon: str | None = None,
    ) -> None:
        """Publish a binary sensor via MQTT Discovery

        Args:
            client: MQTT client
            unique_id: Unique ID for the entity
            name: Display name
            state_topic: Topic for state updates
            is_on: Whether the binary sensor is on
            attributes: Additional attributes
            device: Device info dict
            device_class: HA device class (optional)
            icon: MDI icon (optional)
        """
        discovery_config: dict[str, Any] = {
            "unique_id": unique_id,
            "name": name,
            "state_topic": state_topic,
            "value_template": "{{ value_json.state }}",
            "payload_on": "ON",
            "payload_off": "OFF",
            "json_attributes_topic": state_topic,
            "device": device,
        }

        if device_class:
            discovery_config["device_class"] = device_class
        if icon:
            discovery_config["icon"] = icon

        state_payload = {
            "state": "ON" if is_on else "OFF",
            **attributes,
        }

        # Format: homeassistant/binary_sensor/{node_id}/{object_id}/config
        object_id = unique_id.replace(f"{self.prefix}_", "", 1) if unique_id.startswith(f"{self.prefix}_") else unique_id
        await client.publish(
            f"{self.discovery_prefix}/binary_sensor/{self.prefix}/{object_id}/config",
            payload=json.dumps(discovery_config),
            retain=True,
        )

        await client.publish(
            state_topic,
            payload=json.dumps(state_payload),
            retain=True,
        )

    # =========================================================================
    # CONSUMPTION/PRODUCTION STATISTICS
    # =========================================================================

    async def _export_consumption_stats(
        self,
        client: aiomqtt.Client,
        stats: Any,
        pdl: str,
    ) -> int:
        """Export consumption statistics for a PDL via MQTT Discovery (old format)

        Creates entities under Linky {pdl} device:
        - sensor.myelectricaldata_linky_{pdl}_consumption (daily value with history in attributes)
        - sensor.myelectricaldata_linky_{pdl}_consumption_last7day (last 7 days total)
        - sensor.myelectricaldata_linky_{pdl}_consumption_last14day (last 14 days total)
        - sensor.myelectricaldata_linky_{pdl}_consumption_last30day (last 30 days total)
        """
        today = date.today()
        yesterday = today - timedelta(days=1)
        count = 0
        device = self._get_device_linky(pdl)

        # Get yesterday's consumption (most recent complete day)
        yesterday_wh = await stats.get_day_total(pdl, yesterday, "consumption")
        yesterday_kwh = round(yesterday_wh / 1000, 2)

        # Get last N days history for attributes
        history = {}
        for i in range(1, 32):  # Last 31 days
            day = today - timedelta(days=i)
            day_wh = await stats.get_day_total(pdl, day, "consumption")
            history[day.isoformat()] = round(day_wh / 1000, 2)

        # Main consumption sensor with history in attributes
        await self._publish_sensor_old_format(
            client,
            topic=f"myelectricaldata_consumption/{pdl}",
            name="consumption",
            unique_id=f"myelectricaldata_linky_{pdl}_consumption",
            device=device,
            state=yesterday_kwh,
            attributes={
                "pdl": pdl,
                "date": yesterday.isoformat(),
                "value_wh": yesterday_wh,
                "history": history,
                "last_updated": datetime.now().isoformat(),
            },
            unit="kWh",
            device_class="energy",
            state_class="total",
            icon="mdi:lightning-bolt",
        )
        count += 1

        # Last N days aggregates
        for days_count in [7, 14, 30]:
            total_kwh = 0.0
            for i in range(1, days_count + 1):
                day = today - timedelta(days=i)
                day_wh = await stats.get_day_total(pdl, day, "consumption")
                total_kwh += day_wh / 1000

            await self._publish_sensor_old_format(
                client,
                topic=f"myelectricaldata_consumption_last_{days_count}_day/{pdl}",
                name=f"consumption last{days_count}day",
                unique_id=f"myelectricaldata_linky_{pdl}_consumption_last{days_count}day",
                device=device,
                state=round(total_kwh, 2),
                attributes={
                    "pdl": pdl,
                    "days": days_count,
                    "start_date": (today - timedelta(days=days_count)).isoformat(),
                    "end_date": yesterday.isoformat(),
                },
                unit="kWh",
                device_class="energy",
                state_class="total",
                icon="mdi:chart-line",
            )
            count += 1

        logger.debug(f"[HA-MQTT] Exported consumption stats for {pdl}: {count} sensors")
        return count

    async def _export_hp_hc_sensors(
        self,
        client: aiomqtt.Client,
        db: AsyncSession,
        pdl: str,
    ) -> int:
        """Publie les 8 capteurs HP/HC d'un PDL via MQTT Discovery

        sensor.myelectricaldata_linky_{pdl}_consumption_{yesterday,this_week,this_month,this_year}_{hp,hc}
        Rien pour un contrat BASE ou sans donnée détaillée (cf. BaseExporter._get_hp_hc_summary).
        """
        hp_hc = await self._get_hp_hc_summary(db, pdl, date.today())
        if not hp_hc:
            return 0

        device = self._get_device_linky(pdl)
        for key, value_kwh in hp_hc.items():
            sensor_key = key.removesuffix("_kwh")
            await self._publish_sensor_old_format(
                client,
                topic=f"myelectricaldata_consumption_{sensor_key}/{pdl}",
                name=f"consumption {sensor_key.replace('_', ' ')}",
                unique_id=f"myelectricaldata_linky_{pdl}_consumption_{sensor_key}",
                device=device,
                state=value_kwh,
                attributes={"pdl": pdl, "last_updated": datetime.now().isoformat()},
                unit="kWh",
                device_class="energy",
                state_class="total",
                icon="mdi:weather-night" if sensor_key.endswith("_hc") else "mdi:white-balance-sunny",
            )
        return len(hp_hc)

    async def _export_production_stats(
        self,
        client: aiomqtt.Client,
        stats: Any,
        pdl: str,
    ) -> int:
        """Export production statistics for a PDL via MQTT Discovery (old format)

        Creates entities under Linky {pdl} device:
        - sensor.myelectricaldata_linky_{pdl}_production (daily value with history in attributes)
        - sensor.myelectricaldata_linky_{pdl}_production_last7day (last 7 days total)
        - sensor.myelectricaldata_linky_{pdl}_production_last14day (last 14 days total)
        - sensor.myelectricaldata_linky_{pdl}_production_last30day (last 30 days total)
        """
        today = date.today()
        yesterday = today - timedelta(days=1)
        count = 0
        device = self._get_device_linky(pdl)

        # Check if PDL has production data
        from ...models.pdl import PDL
        result = await stats.db.execute(
            select(PDL.has_production).where(PDL.usage_point_id == pdl)
        )
        has_production = result.scalar_one_or_none()

        if not has_production:
            logger.debug(f"[HA-MQTT] PDL {pdl} has no production, skipping")
            return 0

        # Get yesterday's production (most recent complete day)
        yesterday_wh = await stats.get_day_total(pdl, yesterday, "production")
        yesterday_kwh = round(yesterday_wh / 1000, 2)

        # Get last N days history for attributes
        history = {}
        for i in range(1, 32):  # Last 31 days
            day = today - timedelta(days=i)
            day_wh = await stats.get_day_total(pdl, day, "production")
            history[day.isoformat()] = round(day_wh / 1000, 2)

        # Main production sensor with history in attributes
        await self._publish_sensor_old_format(
            client,
            topic=f"myelectricaldata_production/{pdl}",
            name="production",
            unique_id=f"myelectricaldata_linky_{pdl}_production",
            device=device,
            state=yesterday_kwh,
            attributes={
                "pdl": pdl,
                "date": yesterday.isoformat(),
                "value_wh": yesterday_wh,
                "history": history,
                "last_updated": datetime.now().isoformat(),
            },
            unit="kWh",
            device_class="energy",
            state_class="total",
            icon="mdi:solar-power",
        )
        count += 1

        # Last N days aggregates
        for days_count in [7, 14, 30]:
            total_kwh = 0.0
            for i in range(1, days_count + 1):
                day = today - timedelta(days=i)
                day_wh = await stats.get_day_total(pdl, day, "production")
                total_kwh += day_wh / 1000

            await self._publish_sensor_old_format(
                client,
                topic=f"myelectricaldata_production_last_{days_count}_day/{pdl}",
                name=f"production last{days_count}day",
                unique_id=f"myelectricaldata_linky_{pdl}_production_last{days_count}day",
                device=device,
                state=round(total_kwh, 2),
                attributes={
                    "pdl": pdl,
                    "days": days_count,
                    "start_date": (today - timedelta(days=days_count)).isoformat(),
                    "end_date": yesterday.isoformat(),
                },
                unit="kWh",
                device_class="energy",
                state_class="total",
                icon="mdi:solar-power-variant",
            )
            count += 1

        logger.debug(f"[HA-MQTT] Exported production stats for {pdl}: {count} sensors")
        return count

    # =========================================================================
    # CONTENT-CARD-LINKY EXPORT
    # =========================================================================

    @staticmethod
    def _safe_evolution(current: float, previous: float) -> float:
        """Calcule le pourcentage d'évolution, retourne 0 si previous est 0"""
        if previous == 0:
            return 0.0
        return round((current - previous) / previous * 100, 1)

    async def _export_linky_card_stats(
        self,
        client: aiomqtt.Client,
        stats: Any,
        db: AsyncSession,
        pdl: str,
        direction: str = "consumption",
    ) -> int:
        """Export un sensor compatible content-card-linky via MQTT Discovery

        Crée un sensor unique par PDL avec ~35 attributs :
        statistiques comparatives, historique journalier, HP/HC, coûts,
        puissance max, couleurs Tempo.

        Args:
            client: Client MQTT connecté
            stats: StatisticsService
            db: Session DB
            pdl: Numéro de PDL
            direction: 'consumption' ou 'production'

        Returns:
            Nombre de sensors publiés (1 si OK, 0 si erreur)
        """
        from ...models.pdl import PDL
        from ...models.tempo_day import TempoDay

        # Pour la production, vérifier que le PDL en a
        if direction == "production":
            result = await db.execute(
                select(PDL.has_production).where(PDL.usage_point_id == pdl)
            )
            has_production = result.scalar_one_or_none()
            if not has_production:
                logger.debug(f"[HA-MQTT] PDL {pdl} has no production, skipping linky-card")
                return 0

        # Les données Enedis sont disponibles au mieux à J-1
        # On requête jusqu'à hier, puis on identifie le dernier jour avec des données
        today = date.today()
        max_date = today - timedelta(days=1)  # J-1 au mieux

        # Configuration
        nb_days = self.config.get("linky_card_days", 31)

        # Récupérer les prix depuis l'offre sélectionnée du PDL
        from ...models.energy_provider import EnergyOffer
        offer_result = await db.execute(
            select(EnergyOffer.offer_type, EnergyOffer.base_price, EnergyOffer.hc_price, EnergyOffer.hp_price)
            .join(PDL, PDL.selected_offer_id == EnergyOffer.id)
            .where(PDL.usage_point_id == pdl)
        )
        offer_row = offer_result.first()

        if not offer_row:
            # Fallback : chercher le Tarif Bleu correspondant au contrat du PDL
            pdl_info = await db.execute(
                select(PDL.pricing_option, PDL.subscribed_power)
                .where(PDL.usage_point_id == pdl)
            )
            pdl_row = pdl_info.first()
            if pdl_row and pdl_row.pricing_option:
                pricing_option = pdl_row.pricing_option
                power_kva = pdl_row.subscribed_power
                # Chercher une offre Tarif Bleu qui matche le type et la puissance
                fallback_query = (
                    select(EnergyOffer.offer_type, EnergyOffer.base_price, EnergyOffer.hc_price, EnergyOffer.hp_price)
                    .where(EnergyOffer.name == "Tarif Bleu")
                    .where(EnergyOffer.offer_type == pricing_option)
                )
                if power_kva:
                    fallback_query = fallback_query.where(EnergyOffer.power_kva == power_kva)
                fallback_query = fallback_query.limit(1)
                fallback_result = await db.execute(fallback_query)
                offer_row = fallback_result.first()

        if offer_row:
            offer_type = offer_row.offer_type
            kwh_price = float(offer_row.base_price or 0)
            kwh_price_hc = float(offer_row.hc_price or 0)
            kwh_price_hp = float(offer_row.hp_price or 0)
            # Pour les offres BASE, utiliser base_price comme prix unique
            if offer_type == "BASE" and kwh_price > 0:
                kwh_price_hc = kwh_price
                kwh_price_hp = kwh_price
        else:
            # Fallback sur la config d'export
            kwh_price = self.config.get("kwh_price", 0.0)
            kwh_price_hc = self.config.get("kwh_price_hc", 0.0)
            kwh_price_hp = self.config.get("kwh_price_hp", 0.0)

        device = self._get_device_linky(pdl)
        oldest_date = today - timedelta(days=nb_days)

        # Récupérer les infos contrat (plages HC, puissance souscrite, week-end creux)
        tariff_info, offpeak_ranges, subscribed_power_kva = await self._get_pdl_contract_info(db, pdl)
        weekend_offpeak = tariff_info.weekend_offpeak

        # =====================================================================
        # BATCH QUERIES (minimiser les allers-retours DB)
        # =====================================================================

        # 1. Totaux journaliers pour les N derniers jours (jusqu'à J-1 max)
        daily_totals = await stats.get_daily_totals_range(
            pdl, oldest_date, max_date, direction
        )

        # 2. Données détaillées 30min (pour HP/HC + puissance max)
        detailed_records = await stats.get_detailed_range(
            pdl, oldest_date, max_date, direction
        )

        # 3. Couleurs Tempo pour les N derniers jours
        tempo_colors: dict[str, str] = {}
        result = await db.execute(
            select(TempoDay.id, TempoDay.color)
            .where(TempoDay.id >= oldest_date.isoformat())
            .where(TempoDay.id <= max_date.isoformat())
        )
        for row in result.all():
            tempo_colors[row[0]] = row[1].value

        # Identifier le dernier jour avec des données disponibles
        if daily_totals:
            yesterday = max(daily_totals.keys())
        else:
            yesterday = max_date
        day_before = yesterday - timedelta(days=1)

        # =====================================================================
        # CALCUL HP/HC ET PUISSANCE MAX PAR JOUR (en mémoire)
        # =====================================================================

        # Grouper les données détaillées par jour
        detailed_by_day: dict[date, list[tuple[str | None, int]]] = defaultdict(list)
        for d, interval_start, value in detailed_records:
            detailed_by_day[d].append((interval_start, value))

        has_detailed = len(detailed_records) > 0
        # HP/HC seulement pour un contrat à heures creuses : des plages Enedis peuvent rester
        # en base après un passage en BASE (cf. routers/pdl.py)
        has_offpeak = tariff_info.family != "BASE" and (len(offpeak_ranges) > 0 or weekend_offpeak)

        # Calculer HP/HC et max power pour chaque jour
        daily_hp: dict[date, int] = {}   # Wh
        daily_hc: dict[date, int] = {}   # Wh
        daily_mp: dict[date, float] = {}  # kW
        daily_mp_time: dict[date, str | None] = {}
        daily_mp_over: dict[date, bool] = {}

        for day_date, intervals in detailed_by_day.items():
            hp_wh = 0
            hc_wh = 0
            max_power_kw = 0.0
            max_time: str | None = None

            for interval_start, value in intervals:
                # Les valeurs DETAILED sont en W (puissance moyenne sur 30min)
                # Énergie sur 30min = W / 2 pour obtenir des Wh
                wh = value / 2

                # HP/HC
                if has_offpeak and is_offpeak_slot(day_date, interval_start, offpeak_ranges, weekend_offpeak):
                    hc_wh += wh
                else:
                    hp_wh += wh

                # Puissance max (W → kW)
                power_kw = value / 1000
                if power_kw > max_power_kw:
                    max_power_kw = power_kw
                    max_time = interval_start

            daily_hp[day_date] = int(hp_wh)
            daily_hc[day_date] = int(hc_wh)
            daily_mp[day_date] = round(max_power_kw, 2)
            daily_mp_time[day_date] = max_time
            daily_mp_over[day_date] = (
                max_power_kw > subscribed_power_kva
                if subscribed_power_kva
                else False
            )

        # =====================================================================
        # ATTRIBUTS "HIER" (= dernier jour avec des données)
        # =====================================================================

        yesterday_wh = daily_totals.get(yesterday, 0)
        yesterday_kwh = round(yesterday_wh / 1000, 2)
        day2_wh = daily_totals.get(day_before, 0)
        day2_kwh = round(day2_wh / 1000, 2)
        yesterday_evolution = self._safe_evolution(yesterday_kwh, day2_kwh)

        # HP/HC d'hier
        if has_detailed and has_offpeak and yesterday in daily_hp:
            yesterday_hp_kwh = round(daily_hp[yesterday] / 1000, 2)
            yesterday_hc_kwh = round(daily_hc[yesterday] / 1000, 2)
        else:
            yesterday_hp_kwh = -1
            yesterday_hc_kwh = -1

        # Coût journalier (HC*prix_HC + HP*prix_HP si dispo, sinon total*prix_base)
        if yesterday_hc_kwh != -1 and yesterday_hp_kwh != -1 and (kwh_price_hc > 0 or kwh_price_hp > 0):
            daily_cost = round(yesterday_hc_kwh * kwh_price_hc + yesterday_hp_kwh * kwh_price_hp, 2)
        elif kwh_price > 0:
            daily_cost = round(yesterday_kwh * kwh_price, 2)
        else:
            daily_cost = 0

        # =====================================================================
        # ATTRIBUTS "SEMAINE"
        # =====================================================================

        # Semaine courante : lundi → hier
        monday = today - timedelta(days=today.weekday())
        current_week_wh = await stats.get_date_range_total(
            pdl, monday, yesterday, direction
        )
        current_week_kwh = round(current_week_wh / 1000, 2)

        # Semaine dernière : lundi-1 → dimanche-1
        prev_monday = monday - timedelta(days=7)
        prev_sunday = monday - timedelta(days=1)
        last_week_wh = await stats.get_date_range_total(
            pdl, prev_monday, prev_sunday, direction
        )
        last_week_kwh = round(last_week_wh / 1000, 2)

        current_week_evolution = self._safe_evolution(current_week_kwh, last_week_kwh)

        # =====================================================================
        # ATTRIBUTS "MOIS COURANT"
        # =====================================================================

        first_of_month = date(today.year, today.month, 1)
        current_month_wh = await stats.get_date_range_total(
            pdl, first_of_month, yesterday, direction
        )
        current_month_kwh = round(current_month_wh / 1000, 2)

        # Même mois A-1
        current_month_ly_wh = await stats.get_month_total(
            pdl, today.year - 1, today.month, direction
        )
        current_month_ly_kwh = round(current_month_ly_wh / 1000, 2)

        current_month_evolution = self._safe_evolution(
            current_month_kwh, current_month_ly_kwh
        )

        # =====================================================================
        # ATTRIBUTS "MOIS PRECEDENT"
        # =====================================================================

        if today.month == 1:
            prev_month, prev_month_year = 12, today.year - 1
        else:
            prev_month, prev_month_year = today.month - 1, today.year

        last_month_wh = await stats.get_month_total(
            pdl, prev_month_year, prev_month, direction
        )
        last_month_kwh = round(last_month_wh / 1000, 2)

        last_month_ly_wh = await stats.get_month_total(
            pdl, prev_month_year - 1, prev_month, direction
        )
        last_month_ly_kwh = round(last_month_ly_wh / 1000, 2)

        monthly_evolution = self._safe_evolution(last_month_kwh, last_month_ly_kwh)

        # =====================================================================
        # ATTRIBUTS "ANNEE"
        # =====================================================================

        first_of_year = date(today.year, 1, 1)
        current_year_wh = await stats.get_date_range_total(
            pdl, first_of_year, yesterday, direction
        )
        current_year_kwh = round(current_year_wh / 1000, 2)

        # Même période A-1
        first_of_year_ly = date(today.year - 1, 1, 1)
        yesterday_ly = date(today.year - 1, yesterday.month, min(yesterday.day, 28))
        current_year_ly_wh = await stats.get_date_range_total(
            pdl, first_of_year_ly, yesterday_ly, direction
        )
        current_year_ly_kwh = round(current_year_ly_wh / 1000, 2)

        yearly_evolution = self._safe_evolution(current_year_kwh, current_year_ly_kwh)

        # =====================================================================
        # PEAK/OFFPEAK PERCENT (année courante)
        # =====================================================================

        if has_detailed and has_offpeak:
            hp_year_wh, hc_year_wh = await stats.get_hp_hc_year_total(
                pdl, today.year, offpeak_ranges, direction, weekend_offpeak
            )
            total_year_hp_hc = hp_year_wh + hc_year_wh
            peak_offpeak_percent = (
                round(hp_year_wh / total_year_hp_hc * 100, 1)
                if total_year_hp_hc > 0
                else 0
            )
        else:
            peak_offpeak_percent = -1

        # =====================================================================
        # HISTORIQUE JOURNALIER (daily, dailyweek, dailyweek_*)
        # =====================================================================

        # Construire les listes pour les N derniers jours
        # daily : array, oldest first, -1 si manquant
        # dailyweek* : comma-separated, newest first, -1 si manquant
        daily_array = []  # oldest first
        dates_newest_first = []  # pour dailyweek*
        costs_newest = []
        hc_newest = []
        hp_newest = []
        cost_hc_newest = []
        cost_hp_newest = []
        mp_newest = []
        mp_over_newest = []
        mp_time_newest = []
        tempo_newest = []

        # Boucler du plus ancien au dernier jour avec données (yesterday)
        # pour ne pas inclure de jours sans données en fin de liste
        history_start = yesterday - timedelta(days=nb_days - 1)
        current_day = history_start
        while current_day <= yesterday:
            day = current_day
            current_day += timedelta(days=1)
            day_wh = daily_totals.get(day)

            if day_wh is not None:
                day_kwh = round(day_wh / 1000, 2)
                daily_array.append(day_kwh)
            else:
                day_kwh = -1
                daily_array.append(-1)

            # Les listes newest-first sont construites en ajoutant au début
            dates_newest_first.append(f"{day.isoformat()}T00:00:00")

            # HP/HC par jour
            if has_detailed and has_offpeak and day in daily_hp:
                hp_kwh = round(daily_hp[day] / 1000, 2)
                hc_kwh = round(daily_hc[day] / 1000, 2)
                hc_newest.append(str(hc_kwh))
                hp_newest.append(str(hp_kwh))
                # Coûts HP/HC
                if kwh_price_hc > 0:
                    cost_hc_newest.append(str(round(hc_kwh * kwh_price_hc, 2)))
                else:
                    cost_hc_newest.append("-1")
                if kwh_price_hp > 0:
                    cost_hp_newest.append(str(round(hp_kwh * kwh_price_hp, 2)))
                else:
                    cost_hp_newest.append("-1")
                # Coût total du jour (HC*prix_HC + HP*prix_HP)
                if kwh_price_hc > 0 or kwh_price_hp > 0:
                    day_cost = round(hc_kwh * kwh_price_hc + hp_kwh * kwh_price_hp, 2)
                    costs_newest.append(str(day_cost))
                elif kwh_price > 0:
                    costs_newest.append(str(round(day_kwh * kwh_price, 2)))
                else:
                    costs_newest.append("-1")
            else:
                hc_newest.append("-1")
                hp_newest.append("-1")
                cost_hc_newest.append("-1")
                cost_hp_newest.append("-1")
                # Coût total avec prix base (fallback sans données détaillées)
                if day_kwh != -1 and kwh_price > 0:
                    costs_newest.append(str(round(day_kwh * kwh_price, 2)))
                else:
                    costs_newest.append("-1")

            # Puissance max
            if has_detailed and day in daily_mp:
                mp_newest.append(str(daily_mp[day]))
                mp_over_newest.append(str(daily_mp_over[day]).lower())
                if daily_mp_time[day]:
                    mp_time_newest.append(
                        f"{day.isoformat()}T{daily_mp_time[day]}:00"
                    )
                else:
                    mp_time_newest.append("-1")
            else:
                mp_newest.append("-1")
                mp_over_newest.append("-1")
                mp_time_newest.append("-1")

            # Couleur Tempo
            tempo_color = tempo_colors.get(day.isoformat(), None)
            tempo_newest.append(tempo_color if tempo_color else "-1")

        # Inverser les listes newest-first (on a construit oldest-first)
        dates_newest_first.reverse()
        costs_newest.reverse()
        hc_newest.reverse()
        hp_newest.reverse()
        cost_hc_newest.reverse()
        cost_hp_newest.reverse()
        mp_newest.reverse()
        mp_over_newest.reverse()
        mp_time_newest.reverse()
        tempo_newest.reverse()

        # =====================================================================
        # CONSTRUCTION DES ATTRIBUTS
        # =====================================================================

        type_compteur = "consommation" if direction == "consumption" else "production"

        linky_attributes: dict[str, Any] = {
            # Meta
            "typeCompteur": type_compteur,
            "serviceEnedis": "myElectricalData",
            "unit_of_measurement": "kWh",
            "friendly_name": f"Linky {pdl}",
            # Hier
            "yesterday": yesterday_kwh,
            "day_2": day2_kwh,
            "yesterday_evolution": yesterday_evolution,
            "yesterday_HC": yesterday_hc_kwh,
            "yesterday_HP": yesterday_hp_kwh,
            "daily_cost": daily_cost,
            # Semaine
            "current_week": current_week_kwh,
            "last_week": last_week_kwh,
            "current_week_evolution": current_week_evolution,
            # Mois courant
            "current_month": current_month_kwh,
            "current_month_last_year": current_month_ly_kwh,
            "current_month_evolution": current_month_evolution,
            # Mois précédent
            "last_month": last_month_kwh,
            "last_month_last_year": last_month_ly_kwh,
            "monthly_evolution": monthly_evolution,
            # Année
            "current_year": current_year_kwh,
            "current_year_last_year": current_year_ly_kwh,
            "yearly_evolution": yearly_evolution,
            # HP/HC
            "peak_offpeak_percent": peak_offpeak_percent,
            # Historique journalier (newest-first, comme dailyweek)
            "daily": list(reversed(daily_array)),
            "dailyweek": ",".join(dates_newest_first),
            "dailyweek_cost": ",".join(costs_newest),
            "dailyweek_costHC": ",".join(cost_hc_newest),
            "dailyweek_costHP": ",".join(cost_hp_newest),
            "dailyweek_HC": ",".join(hc_newest),
            "dailyweek_HP": ",".join(hp_newest),
            "dailyweek_MP": ",".join(mp_newest),
            "dailyweek_MP_over": ",".join(mp_over_newest),
            "dailyweek_MP_time": ",".join(mp_time_newest),
            "dailyweek_Tempo": ",".join(tempo_newest),
            # Erreur / version
            "errorLastCall": "",
            "versionUpdateAvailable": False,
            "versionGit": "",
        }

        # =====================================================================
        # PUBLICATION MQTT
        # =====================================================================

        topic_dir = "consumption" if direction == "consumption" else "production"
        await self._publish_sensor_old_format(
            client,
            topic=f"myelectricaldata_{topic_dir}/{pdl}",
            name=topic_dir,
            unique_id=f"myelectricaldata_linky_{pdl}_{topic_dir}",
            device=device,
            state=yesterday_kwh,
            attributes=linky_attributes,
            unit="kWh",
            device_class="energy",
            state_class="total",
            icon="mdi:lightning-bolt" if direction == "consumption" else "mdi:solar-power",
        )

        logger.info(
            f"[HA-MQTT] Exported linky-card {direction} for {pdl}: "
            f"yesterday={yesterday_kwh}kWh, {nb_days} days history"
        )
        return 1

    # =========================================================================
    # TEMPO EXPORT (Old MyElectricalData format)
    # =========================================================================

    async def _export_tempo(self, client: aiomqtt.Client, db: AsyncSession) -> int:
        """Export Tempo information via MQTT Discovery (old MyElectricalData format)

        Creates entities under two devices:

        RTE Tempo device (myelectricaldata_rte/):
        - sensor.myelectricaldata_tempo_today
        - sensor.myelectricaldata_tempo_tomorrow

        EDF Tempo device (myelectricaldata_edf/):
        - sensor.myelectricaldata_tempo_info
        - sensor.myelectricaldata_tempo_days_blue
        - sensor.myelectricaldata_tempo_days_white
        - sensor.myelectricaldata_tempo_days_red
        - sensor.myelectricaldata_tempo_price_blue_hp
        - sensor.myelectricaldata_tempo_price_blue_hc
        - sensor.myelectricaldata_tempo_price_white_hp
        - sensor.myelectricaldata_tempo_price_white_hc
        - sensor.myelectricaldata_tempo_price_red_hp
        - sensor.myelectricaldata_tempo_price_red_hc
        """
        from ...models.tempo_day import TempoDay, TempoColor

        today = date.today()
        tomorrow = today + timedelta(days=1)
        count = 0

        device_rte = self._get_device_rte_tempo()
        device_edf = self._get_device_edf_tempo()

        today_str = today.isoformat()
        tomorrow_str = tomorrow.isoformat()

        # =====================================================================
        # RTE TEMPO: Today's and Tomorrow's color
        # =====================================================================

        # Today's color
        result = await db.execute(
            select(TempoDay).where(TempoDay.id == today_str)
        )
        today_tempo = result.scalar_one_or_none()
        today_color = today_tempo.color.value if today_tempo else "Inconnu"

        await self._publish_sensor_old_format(
            client,
            topic="myelectricaldata_rte/tempo_today",
            name="Today",
            unique_id="myelectricaldata_tempo_today",
            device=device_rte,
            state=today_color,
            attributes={
                "date": today_str,
                "color_fr": self._get_tempo_color_fr(today_color),
            },
            icon=self._get_tempo_icon(today_color),
        )
        count += 1

        # Tomorrow's color
        result = await db.execute(
            select(TempoDay).where(TempoDay.id == tomorrow_str)
        )
        tomorrow_tempo = result.scalar_one_or_none()
        tomorrow_color = tomorrow_tempo.color.value if tomorrow_tempo else "Inconnu"

        await self._publish_sensor_old_format(
            client,
            topic="myelectricaldata_rte/tempo_tomorrow",
            name="Tomorrow",
            unique_id="myelectricaldata_tempo_tomorrow",
            device=device_rte,
            state=tomorrow_color,
            attributes={
                "date": tomorrow_str,
                "color_fr": self._get_tempo_color_fr(tomorrow_color),
            },
            icon=self._get_tempo_icon(tomorrow_color),
        )
        count += 1

        # =====================================================================
        # EDF TEMPO: Days count per color
        # =====================================================================

        # Tempo season: Sept 1 to Aug 31
        if today.month >= 9:
            season_start = date(today.year, 9, 1)
            season_end = date(today.year + 1, 8, 31)
        else:
            season_start = date(today.year - 1, 9, 1)
            season_end = date(today.year, 8, 31)

        season_start_str = season_start.isoformat()
        season_end_str = season_end.isoformat()

        # Days count per color (consumed + remaining)
        days_data: dict[str, dict[str, int]] = {}

        for color in TempoColor:
            color_name = color.value.lower()

            # Count used days this season (before today)
            result = await db.execute(
                select(func.count(TempoDay.id))
                .where(TempoDay.id >= season_start_str)
                .where(TempoDay.id < today_str)
                .where(cast(TempoDay.color, String) == color.value)
            )
            used = result.scalar() or 0

            # Count remaining days (including today until season end)
            result = await db.execute(
                select(func.count(TempoDay.id))
                .where(TempoDay.id >= today_str)
                .where(TempoDay.id <= season_end_str)
                .where(cast(TempoDay.color, String) == color.value)
            )
            remaining = result.scalar() or 0

            quota = TEMPO_QUOTAS.get(color.value, 0)

            days_data[color_name] = {
                "used": used,
                "remaining": remaining,
                "quota": quota,
            }

            # Publish days_{color} sensor
            await self._publish_sensor_old_format(
                client,
                topic=f"myelectricaldata_edf/tempo_days_{color_name}",
                name=f"Days {color.value.capitalize()}",
                unique_id=f"myelectricaldata_tempo_days_{color_name}",
                device=device_edf,
                state=used,
                attributes={
                    "used": used,
                    "remaining": remaining,
                    "quota": quota,
                    "season_start": season_start_str,
                    "season_end": season_end_str,
                },
                unit="jours",
                icon=self._get_tempo_icon(color.value),
            )
            count += 1

        # =====================================================================
        # EDF TEMPO: Info sensor (contract summary)
        # =====================================================================

        await self._publish_sensor_old_format(
            client,
            topic="myelectricaldata_edf/tempo_info",
            name="Tempo Info",
            unique_id="myelectricaldata_tempo_info",
            device=device_edf,
            state=today_color,
            attributes={
                "today": today_color,
                "tomorrow": tomorrow_color,
                "season_start": season_start_str,
                "season_end": season_end_str,
                # Jours restants pour content-card-linky (quota - used)
                "days_blue": days_data.get("blue", {}).get("quota", 0) - days_data.get("blue", {}).get("used", 0),
                "days_white": days_data.get("white", {}).get("quota", 0) - days_data.get("white", {}).get("used", 0),
                "days_red": days_data.get("red", {}).get("quota", 0) - days_data.get("red", {}).get("used", 0),
                # Détails complets pour usage avancé
                "days_blue_detail": days_data.get("blue", {}),
                "days_white_detail": days_data.get("white", {}),
                "days_red_detail": days_data.get("red", {}),
            },
            icon="mdi:information",
        )
        count += 1

        # =====================================================================
        # EDF TEMPO: Price sensors
        # =====================================================================

        for price_key, price_value in TEMPO_PRICES.items():
            price_name = TEMPO_PRICE_NAMES.get(price_key, price_key)

            await self._publish_sensor_old_format(
                client,
                topic=f"myelectricaldata_edf/tempo_price_{price_key}",
                name=f"Price {price_name}",
                unique_id=f"myelectricaldata_tempo_price_{price_key}",
                device=device_edf,
                state=price_value,
                attributes={
                    "price_type": price_key,
                    "name": price_name,
                },
                unit="EUR/kWh",
                icon="mdi:currency-eur",
            )
            count += 1

        logger.debug(f"[HA-MQTT] Exported Tempo: {count} sensors")
        return count

    def _get_tempo_color_fr(self, color: str) -> str:
        """Get French name for Tempo color"""
        names = {
            "BLUE": "Bleu",
            "WHITE": "Blanc",
            "RED": "Rouge",
            "UNKNOWN": "Inconnu",
            "Inconnu": "Inconnu",
        }
        return names.get(color, "Inconnu")

    def _get_tempo_icon(self, color: str) -> str:
        """Get MDI icon for Tempo color"""
        icons = {
            "BLUE": "mdi:calendar-check",
            "WHITE": "mdi:calendar-alert",
            "RED": "mdi:calendar-remove",
            "UNKNOWN": "mdi:calendar-question",
            "Inconnu": "mdi:calendar-question",
        }
        return icons.get(color, "mdi:calendar")

    # =========================================================================
    # ECOWATT EXPORT (Old MyElectricalData format)
    # =========================================================================

    async def _export_ecowatt(self, client: aiomqtt.Client, db: AsyncSession) -> int:
        """Export EcoWatt information via MQTT Discovery (old MyElectricalData format)

        Creates entities under RTE EcoWatt device:
        - sensor.myelectricaldata_ecowatt_j0 (today)
        - sensor.myelectricaldata_ecowatt_j1 (tomorrow)
        - sensor.myelectricaldata_ecowatt_j2 (day after tomorrow)
        """
        from ...models.ecowatt import EcoWatt

        today = date.today()
        now = datetime.now()
        current_hour = now.hour
        count = 0

        device = self._get_device_rte_ecowatt()

        # Day names for j0, j1, j2 (lowercase for consistency with entity_id convention)
        days = [
            ("j0", today, "Aujourd'hui"),
            ("j1", today + timedelta(days=1), "Demain"),
            ("j2", today + timedelta(days=2), "Après-demain"),
        ]

        for day_name, day_date, day_label in days:
            # Get EcoWatt data for this day
            result = await db.execute(
                select(EcoWatt)
                .where(func.date(EcoWatt.periode) == day_date)
                .order_by(EcoWatt.generation_datetime.desc())
                .limit(1)
            )
            ecowatt = result.scalar_one_or_none()

            if ecowatt:
                # Overall day value
                day_value = ecowatt.dvalue
                message = ecowatt.message or ""

                # For today, also include current hour value
                hour_values = ecowatt.values or []
                current_hour_value = None
                if day_name == "j0" and current_hour < len(hour_values):
                    current_hour_value = hour_values[current_hour]

                # Build forecast dict for content-card-linky
                # Format attendu : {"0h 00min": 1, "1h 00min": 0, ..., "23h 00min": 1}
                forecast = {}
                for i, val in enumerate(hour_values):
                    forecast[f"{i}h 00min"] = val if val is not None else "Pas de valeur"

                # Build attributes with hourly breakdown
                attributes = {
                    "date": day_date.isoformat(),
                    "day_label": day_label,
                    "message": message,
                    "level_name": self._get_ecowatt_level_name(day_value),
                    "forecast": forecast,
                    "hourly_values": hour_values,
                }
                if current_hour_value is not None:
                    attributes["current_hour"] = current_hour
                    attributes["current_hour_value"] = current_hour_value

                # Use day_value as state (1=Normal, 2=Tendu, 3=Critique)
                await self._publish_sensor_old_format(
                    client,
                    topic=f"myelectricaldata_rte/ecowatt_{day_name}",
                    name=day_name,
                    unique_id=f"myelectricaldata_ecowatt_{day_name}",
                    device=device,
                    state=day_value,
                    attributes=attributes,
                    icon=self._get_ecowatt_icon(day_value),
                )
                count += 1
            else:
                # No data available for this day
                await self._publish_sensor_old_format(
                    client,
                    topic=f"myelectricaldata_rte/ecowatt_{day_name}",
                    name=day_name,
                    unique_id=f"myelectricaldata_ecowatt_{day_name}",
                    device=device,
                    state="unknown",
                    attributes={
                        "date": day_date.isoformat(),
                        "day_label": day_label,
                        "message": "Données non disponibles",
                    },
                    icon="mdi:help-circle",
                )
                count += 1

        logger.debug(f"[HA-MQTT] Exported EcoWatt: {count} sensors")
        return count

    def _get_ecowatt_icon(self, level: int) -> str:
        """Get MDI icon for EcoWatt level"""
        icons = {
            1: "mdi:check-circle",
            2: "mdi:alert",
            3: "mdi:alert-octagon",
        }
        return icons.get(level, "mdi:help-circle")

    def _get_ecowatt_level_name(self, level: int) -> str:
        """Get human-readable name for EcoWatt level"""
        names = {
            1: "Normal",
            2: "Tendu",
            3: "Critique",
        }
        return names.get(level, "Inconnu")

    # =========================================================================
    # READ METRICS
    # =========================================================================

    async def read_metrics(self, usage_point_ids: list[str] | None = None) -> dict[str, Any]:
        """Read metrics from Home Assistant via MQTT retained messages

        Subscribes to the state topics and reads retained messages to get
        the current state of all exported entities.

        Args:
            usage_point_ids: Optional list of PDL numbers to filter

        Returns:
            Dict with metrics organized by entity type
        """
        import asyncio

        metrics: list[dict[str, Any]] = []
        errors: list[str] = []
        # Mapping topic_base → unique_id (rempli par les messages config)
        topic_to_unique_id: dict[str, str] = {}

        try:
            # Topics à lire - on s'abonne aux topics HA Discovery
            # Format: {discovery_prefix}/sensor/{topic_path}/state
            # Les topics publiés sont:
            #   - homeassistant/sensor/myelectricaldata_rte/tempo_today/state
            #   - homeassistant/sensor/myelectricaldata_edf/tempo_days_blue/state
            #   - homeassistant/sensor/myelectricaldata_consumption/{pdl}/state
            #   etc.
            topics_to_read = [
                f"{self.discovery_prefix}/sensor/myelectricaldata_rte/#",
                f"{self.discovery_prefix}/sensor/myelectricaldata_edf/#",
                f"{self.discovery_prefix}/sensor/myelectricaldata_consumption/#",
                f"{self.discovery_prefix}/sensor/myelectricaldata_consumption_last_7_day/#",
                f"{self.discovery_prefix}/sensor/myelectricaldata_consumption_last_14_day/#",
                f"{self.discovery_prefix}/sensor/myelectricaldata_consumption_last_30_day/#",
                f"{self.discovery_prefix}/sensor/myelectricaldata_production/#",
                f"{self.discovery_prefix}/sensor/myelectricaldata_production_last_7_day/#",
                f"{self.discovery_prefix}/sensor/myelectricaldata_production_last_14_day/#",
                f"{self.discovery_prefix}/sensor/myelectricaldata_production_last_30_day/#",
                # Fallback pour le préfixe personnalisé
                f"{self.discovery_prefix}/sensor/{self.prefix}/#",
            ]

            # Compteur pour détecter quand on a fini de recevoir les messages retained
            last_message_time = asyncio.get_event_loop().time()
            idle_timeout = 0.5  # 500ms sans nouveau message = on a tout reçu

            # Collecter tous les messages bruts d'abord
            raw_messages: list[tuple[str, Any, str, str | None]] = []  # (topic, value, msg_type, pdl)

            async with await self._get_mqtt_client() as client:
                # S'abonner aux topics d'état
                for topic_pattern in topics_to_read:
                    await client.subscribe(topic_pattern)

                # Attendre les messages retenus avec un timeout global de 5 secondes
                try:
                    async with asyncio.timeout(5.0):
                        async for message in client.messages:
                            current_time = asyncio.get_event_loop().time()
                            last_message_time = current_time

                            topic = str(message.topic)
                            try:
                                payload = message.payload.decode("utf-8")
                                # Ignorer les payloads vides (messages de suppression)
                                if not payload:
                                    continue

                                # Déterminer le type de message (config, state, attributes)
                                topic_parts = topic.split("/")
                                msg_type = topic_parts[-1] if topic_parts else "unknown"

                                # Parser comme JSON si possible
                                try:
                                    value = json.loads(payload)
                                except json.JSONDecodeError:
                                    # Le state est souvent une valeur simple (pas JSON)
                                    value = payload

                                # Extraire le PDL du topic si présent
                                pdl = None
                                for part in topic_parts:
                                    if part.isdigit() and len(part) == 14:
                                        pdl = part
                                        break

                                # Filtrer par PDL si demandé
                                if usage_point_ids and pdl and pdl not in usage_point_ids:
                                    continue

                                raw_messages.append((topic, value, msg_type, pdl))

                            except Exception as e:
                                errors.append(f"Erreur parsing {topic}: {str(e)}")

                            # Vérifier si on est en idle (pas de nouveau message depuis idle_timeout)
                            await asyncio.sleep(0.01)  # Petit délai pour permettre d'autres messages
                            if asyncio.get_event_loop().time() - last_message_time > idle_timeout:
                                break

                except asyncio.TimeoutError:
                    # Timeout global atteint - c'est normal si le broker met du temps
                    pass

            # Phase 1 : Traiter les messages config pour construire le mapping topic_base → unique_id
            for topic, value, msg_type, pdl in raw_messages:
                if msg_type == "config" and isinstance(value, dict):
                    topic_parts = topic.split("/")
                    topic_base = "/".join(topic_parts[:-1]) if len(topic_parts) > 1 else topic
                    unique_id = value.get("uniq_id") or value.get("unique_id")
                    if unique_id:
                        topic_to_unique_id[topic_base] = unique_id

            # Phase 2 : Traiter tous les messages avec le mapping complet
            for topic, value, msg_type, pdl in raw_messages:
                topic_parts = topic.split("/")
                topic_base = "/".join(topic_parts[:-1]) if len(topic_parts) > 1 else topic

                # Construire le nom de l'entité à partir du topic (fallback)
                # Format: homeassistant/sensor/myelectricaldata_rte/tempo_today/state
                # On veut: myelectricaldata_rte_tempo_today (avec underscore, pas slash)
                entity_path = "_".join(topic_parts[2:-1]) if len(topic_parts) > 3 else topic.replace("/", "_")

                if msg_type == "config":
                    # Message de découverte - contient les métadonnées
                    if isinstance(value, dict):
                        entity_name = value.get("name", entity_path)
                        unique_id = value.get("uniq_id") or value.get("unique_id", entity_path)
                        unit = value.get("unit_of_meas") or value.get("unit_of_measurement")
                        device_class = value.get("dev_cla") or value.get("device_class")
                        icon = value.get("ic") or value.get("icon")
                        device = value.get("device", {})

                        category = self._categorize_ha_topic(topic)

                        metrics.append({
                            "entity": unique_id,
                            "name": entity_name,
                            "topic": topic,
                            "msg_type": "config",
                            "category": category,
                            "pdl": pdl,
                            "unit": unit,
                            "device_class": device_class,
                            "icon": icon,
                            "device": device.get("name") if device else None,
                            "raw_config": value,
                        })
                elif msg_type == "state":
                    # Message d'état - valeur actuelle
                    # Utiliser le unique_id si on l'a trouvé via le config
                    entity_id = topic_to_unique_id.get(topic_base, entity_path)
                    category = self._categorize_ha_topic(topic)

                    metrics.append({
                        "entity": entity_id,
                        "topic": topic,
                        "msg_type": "state",
                        "category": category,
                        "pdl": pdl,
                        "state": value,
                    })
                elif msg_type == "attributes":
                    # Attributs additionnels
                    # Utiliser le unique_id si on l'a trouvé via le config
                    entity_id = topic_to_unique_id.get(topic_base, entity_path)
                    category = self._categorize_ha_topic(topic)

                    metrics.append({
                        "entity": entity_id,
                        "topic": topic,
                        "msg_type": "attributes",
                        "category": category,
                        "pdl": pdl,
                        "attributes": value if isinstance(value, dict) else {"value": value},
                    })

            logger.info(f"[HA-MQTT] Read {len(metrics)} entity states")

            return {
                "success": True,
                "message": f"{len(metrics)} entités lues depuis Home Assistant",
                "metrics": metrics,
                "errors": errors,
                "broker": f"{self.broker}:{self.port}",
                "entity_prefix": self.prefix,
            }

        except Exception as e:
            error_msg = str(e)
            logger.error(f"[HA-MQTT] Failed to read metrics: {e}")

            # Message d'erreur plus explicite selon le type d'erreur
            if "timed out" in error_msg.lower() or "timeout" in error_msg.lower():
                user_message = (
                    f"Impossible de se connecter au broker MQTT ({self.broker}:{self.port}). "
                    "Vérifiez que le broker est accessible depuis le conteneur Docker."
                )
            elif "connection refused" in error_msg.lower():
                user_message = f"Connexion refusée par le broker MQTT ({self.broker}:{self.port})"
            elif "authentication" in error_msg.lower() or "not authorized" in error_msg.lower():
                user_message = "Authentification MQTT échouée. Vérifiez le nom d'utilisateur et le mot de passe."
            else:
                user_message = f"Erreur de lecture: {error_msg}"

            return {
                "success": False,
                "message": user_message,
                "metrics": [],
                "errors": [error_msg],
                "broker": f"{self.broker}:{self.port}",
                "entity_prefix": self.prefix,
            }

    def _categorize_ha_topic(self, topic: str) -> str:
        """Categorize a Home Assistant topic

        New format topics (old MyElectricalData structure):
        - {discovery_prefix}/sensor/myelectricaldata_rte/tempo_today/state
        - {discovery_prefix}/sensor/myelectricaldata_rte/tempo_tomorrow/state
        - {discovery_prefix}/sensor/myelectricaldata_rte/ecowatt_j0/state
        - {discovery_prefix}/sensor/myelectricaldata_edf/tempo_days_blue/state
        - {discovery_prefix}/sensor/myelectricaldata_edf/tempo_price_blue_hp/state
        - {discovery_prefix}/sensor/myelectricaldata_consumption/{pdl}/state
        - {discovery_prefix}/sensor/myelectricaldata_production/{pdl}/state
        """
        topic_lower = topic.lower()

        # RTE Tempo sensors
        if "myelectricaldata_rte/tempo_today" in topic_lower:
            return "Tempo Aujourd'hui"
        elif "myelectricaldata_rte/tempo_tomorrow" in topic_lower:
            return "Tempo Demain"

        # RTE EcoWatt sensors
        elif "myelectricaldata_rte/ecowatt_j0" in topic_lower:
            return "EcoWatt Aujourd'hui"
        elif "myelectricaldata_rte/ecowatt_j1" in topic_lower:
            return "EcoWatt Demain"
        elif "myelectricaldata_rte/ecowatt_j2" in topic_lower:
            return "EcoWatt J+2"

        # EDF Tempo sensors
        elif "myelectricaldata_edf/tempo_days_" in topic_lower:
            if "blue" in topic_lower:
                return "Tempo Jours Bleus"
            elif "white" in topic_lower:
                return "Tempo Jours Blancs"
            elif "red" in topic_lower:
                return "Tempo Jours Rouges"
            return "Tempo Jours"
        elif "myelectricaldata_edf/tempo_price_" in topic_lower:
            return "Tempo Prix"
        elif "myelectricaldata_edf/tempo_info" in topic_lower:
            return "Tempo Info"

        # Consumption sensors
        elif "myelectricaldata_consumption_last_" in topic_lower:
            if "7" in topic_lower:
                return "Conso 7 derniers jours"
            elif "14" in topic_lower:
                return "Conso 14 derniers jours"
            elif "30" in topic_lower:
                return "Conso 30 derniers jours"
            return "Conso Période"
        elif "myelectricaldata_consumption/" in topic_lower:
            return "Conso Journalière"

        # Production sensors
        elif "myelectricaldata_production_last_" in topic_lower:
            if "7" in topic_lower:
                return "Prod 7 derniers jours"
            elif "14" in topic_lower:
                return "Prod 14 derniers jours"
            elif "30" in topic_lower:
                return "Prod 30 derniers jours"
            return "Prod Période"
        elif "myelectricaldata_production/" in topic_lower:
            return "Prod Journalière"

        # Legacy format fallback
        parts = topic_lower.split("/")

        # Données globales Tempo (pas liées à un PDL)
        # Ex: myelectricaldata/tempo/today, myelectricaldata/tempo/tomorrow
        if "/tempo/" in topic_lower and not any(p.isdigit() and len(p) == 14 for p in parts):
            if "today" in topic_lower:
                return "Tempo Aujourd'hui"
            elif "tomorrow" in topic_lower:
                return "Tempo Demain"
            elif "remaining" in topic_lower or "days" in topic_lower:
                return "Tempo Jours Restants"
            elif "price" in topic_lower:
                return "Tempo Prix"
            else:
                return "Tempo"

        # Données globales EcoWatt
        if "/ecowatt/" in topic_lower:
            if "current" in topic_lower or "/j0/" in topic_lower:
                return "EcoWatt Aujourd'hui"
            elif "next" in topic_lower or "/j1/" in topic_lower:
                return "EcoWatt Demain"
            elif "/j2/" in topic_lower:
                return "EcoWatt J+2"
            elif "alert" in topic_lower:
                return "Alerte EcoWatt"
            else:
                return "EcoWatt"

        # Consommation par PDL
        if "/consumption/" in topic_lower:
            # Détecter le type de statistique
            if "/annual/" in topic_lower:
                # Sous-catégories par couleur Tempo ou base
                if "/tempo/" in topic_lower:
                    # Extraire la couleur du topic
                    if "blue" in topic_lower:
                        return "Conso Annuelle Tempo Bleu"
                    elif "white" in topic_lower:
                        return "Conso Annuelle Tempo Blanc"
                    elif "red" in topic_lower:
                        return "Conso Annuelle Tempo Rouge"
                    else:
                        return "Conso Annuelle Tempo"
                elif "/base/" in topic_lower or "/hc/" in topic_lower or "/hp/" in topic_lower:
                    return "Conso Annuelle Base"
                else:
                    return "Conso Annuelle"
            elif "/linear/" in topic_lower:
                if "/tempo/" in topic_lower:
                    if "blue" in topic_lower:
                        return "Conso Linéaire Tempo Bleu"
                    elif "white" in topic_lower:
                        return "Conso Linéaire Tempo Blanc"
                    elif "red" in topic_lower:
                        return "Conso Linéaire Tempo Rouge"
                    else:
                        return "Conso Linéaire Tempo"
                else:
                    return "Conso Linéaire"
            elif "/daily/" in topic_lower or "yesterday" in topic_lower:
                return "Conso Journalière"
            elif "/monthly/" in topic_lower:
                return "Conso Mensuelle"
            elif "/current/" in topic_lower or "/today/" in topic_lower:
                return "Conso Aujourd'hui"
            else:
                return "Consommation"

        # Production par PDL
        if "/production/" in topic_lower:
            if "/annual/" in topic_lower:
                return "Prod Annuelle"
            elif "/linear/" in topic_lower:
                return "Prod Linéaire"
            elif "/daily/" in topic_lower or "yesterday" in topic_lower:
                return "Prod Journalière"
            elif "/monthly/" in topic_lower:
                return "Prod Mensuelle"
            elif "/current/" in topic_lower or "/today/" in topic_lower:
                return "Prod Aujourd'hui"
            else:
                return "Production"

        # Statut du compteur
        if "/status" in topic_lower:
            return "Statut Compteur"

        # Contrat
        if "/contract" in topic_lower:
            return "Contrat"

        # Adresse
        if "/address" in topic_lower:
            return "Adresse"

        return "Autre"

    def _build_entity_name(self, topic: str) -> str:
        """Build a human-readable entity name from topic"""
        # Remove prefix and clean up
        parts = topic.replace(self.prefix, "").strip("/").split("/")

        # Build name from parts
        name_parts = []
        for part in parts:
            # Skip PDL in name (will be shown separately)
            if part.isdigit() and len(part) == 14:
                continue
            # Capitalize and replace underscores
            name_parts.append(part.replace("_", " ").title())

        return " - ".join(name_parts) if name_parts else topic

    # =========================================================================
    # HOME ASSISTANT WEBSOCKET API
    # =========================================================================

    def _has_websocket_config(self) -> bool:
        """Check if WebSocket configuration is available"""
        return bool(self.config.get("ha_url") and self.config.get("ha_token"))

    def _get_ws_url(self) -> str:
        """Get WebSocket URL from HA URL

        Converts http(s)://host:port to ws(s)://host:port/api/websocket
        """
        ha_url = self.config.get("ha_url", "").rstrip("/")
        if ha_url.startswith("https://"):
            return ha_url.replace("https://", "wss://") + "/api/websocket"
        else:
            return ha_url.replace("http://", "ws://") + "/api/websocket"

    def _ws_connect(self) -> websockets.connect:
        """Créer une connexion WebSocket avec des timeouts adaptés aux opérations longues

        Désactive les pings automatiques car HA peut mettre du temps à répondre
        lors des opérations lourdes (clear_statistics, import_statistics).
        """
        ws_url = self._get_ws_url()
        return websockets.connect(
            ws_url,
            ping_interval=None,  # Désactiver les pings auto (HA ne répond pas pendant les imports lourds)
            ping_timeout=None,
            close_timeout=30,
            open_timeout=30,
        )

    async def _ws_send_and_receive(
        self,
        ws: websockets.WebSocketClientProtocol,
        message: dict[str, Any],
        msg_id: int,
        timeout: int = 300,
    ) -> dict[str, Any]:
        """Send a WebSocket message and wait for response

        Args:
            ws: WebSocket connection
            message: Message to send (without id)
            msg_id: Message ID to use
            timeout: Timeout en secondes (défaut: 300s = 5 min)

        Returns:
            Response message
        """
        message["id"] = msg_id
        await ws.send(json.dumps(message))

        # Wait for response with matching ID (avec timeout)
        try:
            async with asyncio.timeout(timeout):
                while True:
                    response = json.loads(await ws.recv())
                    if response.get("id") == msg_id:
                        return response
        except TimeoutError:
            logger.error(f"[HA-WS] Timeout ({timeout}s) waiting for response to msg_id={msg_id}, type={message.get('type')}")
            return {"success": False, "error": {"message": f"Timeout après {timeout}s"}}

    async def _import_stats_in_chunks(
        self,
        ws: websockets.WebSocketClientProtocol,
        stats: list[dict[str, Any]],
        metadata: dict[str, Any],
        msg_id_start: int,
        chunk_size: int = 2000,
        sync_delay_ms: int = 500,
        chunk_callback: Any = None,
    ) -> tuple[int, int, list[str]]:
        """Import statistics in chunks to avoid WebSocket timeouts

        Args:
            ws: WebSocket connection
            stats: List of statistics to import (can be empty to just create the entity)
            metadata: Metadata for the statistic (has_mean, has_sum, statistic_id, name, source, unit)
            msg_id_start: Starting message ID
            chunk_size: Number of records per chunk (default 500 = ~20 days of hourly data)
            sync_delay_ms: Delay in milliseconds between chunks to let HA ingest data (default 10s)
            chunk_callback: Optional async callback(imported_count, total_stats) appelé après chaque chunk

        Returns:
            Tuple of (total_imported, next_msg_id, errors)
        """
        total_imported = 0
        errors: list[str] = []
        msg_id = msg_id_start

        # Si stats est vide, envoyer quand même pour créer l'entité dans HA
        if not stats:
            response = await self._ws_send_and_receive(
                ws,
                {
                    "type": "recorder/import_statistics",
                    "metadata": metadata,
                    "stats": [],
                },
                msg_id=msg_id,
            )
            msg_id += 1

            if response.get("success", True):
                logger.debug(f"[HA-WS] Created empty statistic for {metadata.get('statistic_id')}")
            else:
                error = response.get("error", {}).get("message", "Unknown error")
                errors.append(f"{metadata.get('statistic_id')} (empty): {error}")
                logger.warning(f"[HA-WS] Failed to create empty statistic: {error}")

            # Délai même pour les stats vides si demandé
            if sync_delay_ms > 0:
                await asyncio.sleep(sync_delay_ms / 1000)

            return 0, msg_id, errors

        # Split stats into chunks
        for i in range(0, len(stats), chunk_size):
            chunk = stats[i:i + chunk_size]

            response = await self._ws_send_and_receive(
                ws,
                {
                    "type": "recorder/import_statistics",
                    "metadata": metadata,
                    "stats": chunk,
                },
                msg_id=msg_id,
            )
            msg_id += 1

            if response.get("success", True):
                total_imported += len(chunk)
                logger.info(
                    f"[HA-WS] Imported chunk {i//chunk_size + 1}: "
                    f"{len(chunk)} stats for {metadata.get('statistic_id')}"
                )
                # Notifier la progression par chunk
                if chunk_callback:
                    await chunk_callback(total_imported, len(stats))
            else:
                error = response.get("error", {}).get("message", "Unknown error")
                errors.append(f"{metadata.get('statistic_id')} chunk {i//chunk_size + 1}: {error}")
                logger.error(f"[HA-WS] Chunk import failed for {metadata.get('statistic_id')}: {error}")

            # Délai entre les chunks pour laisser HA ingérer les données
            if sync_delay_ms > 0:
                await asyncio.sleep(sync_delay_ms / 1000)

        return total_imported, msg_id, errors

    async def list_statistics(self, prefix: str = "myelectricaldata") -> dict[str, Any]:
        """List all statistics IDs in Home Assistant matching prefix

        Uses WebSocket API: recorder/list_statistic_ids

        Args:
            prefix: Filter statistics by this prefix

        Returns:
            Dict with list of statistic_ids
        """
        if not self._has_websocket_config():
            return {
                "success": False,
                "message": "Configuration WebSocket manquante (ha_url, ha_token)",
                "statistic_ids": [],
            }

        token = self.config.get("ha_token")

        try:
            async with self._ws_connect() as ws:
                # Wait for auth_required
                auth_req = json.loads(await ws.recv())
                if auth_req.get("type") != "auth_required":
                    return {"success": False, "message": "Unexpected HA response", "statistic_ids": []}

                # Authenticate
                await ws.send(json.dumps({"type": "auth", "access_token": token}))
                auth_result = json.loads(await ws.recv())

                if auth_result.get("type") != "auth_ok":
                    return {
                        "success": False,
                        "message": f"Authentification échouée: {auth_result.get('message', 'Unknown error')}",
                        "statistic_ids": [],
                    }

                # List statistic IDs
                response = await self._ws_send_and_receive(
                    ws,
                    {"type": "recorder/list_statistic_ids"},
                    msg_id=1,
                )

                if not response.get("success", True):
                    return {
                        "success": False,
                        "message": response.get("error", {}).get("message", "Unknown error"),
                        "statistic_ids": [],
                    }

                # Filter by prefix
                all_stats = response.get("result", [])
                filtered = [
                    s for s in all_stats
                    if s.get("statistic_id", "").startswith(f"{prefix}:")
                ]

                logger.info(f"[HA-WS] Found {len(filtered)} statistics with prefix '{prefix}'")

                return {
                    "success": True,
                    "message": f"{len(filtered)} statistiques trouvées",
                    "statistic_ids": [s.get("statistic_id") for s in filtered],
                    "details": filtered,
                }

        except Exception as e:
            logger.error(f"[HA-WS] Failed to list statistics: {e}")
            return {
                "success": False,
                "message": f"Erreur de connexion: {str(e)}",
                "statistic_ids": [],
            }

    async def get_last_statistic_dates(self) -> dict[str, Any]:
        """Get the last recorded date for each statistic ID

        Uses WebSocket API: recorder/statistics_during_period to get recent stats
        and determine the last timestamp for each statistic.

        Returns:
            Dict with:
            - success: bool
            - message: str
            - last_dates: Dict[statistic_id, datetime] - Last recorded date per stat
            - oldest_date: datetime | None - The oldest "last date" (for incremental sync)
        """
        from datetime import datetime, timedelta
        from zoneinfo import ZoneInfo

        if not self._has_websocket_config():
            return {
                "success": False,
                "message": "Configuration WebSocket manquante (ha_url, ha_token)",
                "last_dates": {},
                "oldest_date": None,
            }

        prefix = self.config.get("statistic_id_prefix", "myelectricaldata")

        # First, list all statistics with our prefix
        list_result = await self.list_statistics(prefix)
        if not list_result.get("success"):
            return {
                "success": False,
                "message": list_result.get("message", "Failed to list statistics"),
                "last_dates": {},
                "oldest_date": None,
            }

        statistic_ids = list_result.get("statistic_ids", [])
        if not statistic_ids:
            return {
                "success": True,
                "message": "Aucune statistique existante - import complet requis",
                "last_dates": {},
                "oldest_date": None,
            }

        token = self.config.get("ha_token")

        try:
            async with self._ws_connect() as ws:
                # Auth
                auth_req = json.loads(await ws.recv())
                if auth_req.get("type") != "auth_required":
                    return {"success": False, "message": "Unexpected HA response", "last_dates": {}, "oldest_date": None}

                await ws.send(json.dumps({"type": "auth", "access_token": token}))
                auth_result = json.loads(await ws.recv())

                if auth_result.get("type") != "auth_ok":
                    return {
                        "success": False,
                        "message": f"Authentification échouée: {auth_result.get('message', 'Unknown error')}",
                        "last_dates": {},
                        "oldest_date": None,
                    }

                # Query statistics for the last 30 days to find the most recent entry
                # We use a wide range to ensure we catch the latest data
                tz_paris = ZoneInfo("Europe/Paris")
                now = datetime.now(tz_paris)
                start_time = (now - timedelta(days=30)).isoformat()

                response = await self._ws_send_and_receive(
                    ws,
                    {
                        "type": "recorder/statistics_during_period",
                        "start_time": start_time,
                        "statistic_ids": statistic_ids,
                        "period": "hour",  # Get hourly data for precision
                    },
                    msg_id=1,
                )

                if not response.get("success", True):
                    return {
                        "success": False,
                        "message": response.get("error", {}).get("message", "Unknown error"),
                        "last_dates": {},
                        "oldest_date": None,
                    }

                # Extract last date for each statistic
                result_data = response.get("result", {})
                last_dates: dict[str, datetime] = {}

                for stat_id, entries in result_data.items():
                    if entries and isinstance(entries, list):
                        # Entries are sorted by time, last entry is most recent
                        last_entry = entries[-1]
                        # The "start" field contains the timestamp
                        start_ts = last_entry.get("start")
                        if start_ts:
                            # Parse ISO format timestamp
                            if isinstance(start_ts, (int, float)):
                                # HA retourne les timestamps en secondes,
                                # mais détecte les ms si la valeur est trop grande (> an 3000)
                                ts = start_ts / 1000 if start_ts > 32503680000 else start_ts
                                last_dates[stat_id] = datetime.fromtimestamp(ts, tz=tz_paris)
                            else:
                                # ISO format string
                                try:
                                    last_dates[stat_id] = datetime.fromisoformat(str(start_ts).replace("Z", "+00:00"))
                                except ValueError:
                                    logger.warning(f"[HA-WS] Could not parse timestamp for {stat_id}: {start_ts}")

                # Find the oldest "last date" - this is where we need to start the incremental import
                oldest_date = min(last_dates.values()) if last_dates else None

                logger.info(
                    f"[HA-WS] Found last dates for {len(last_dates)}/{len(statistic_ids)} statistics. "
                    f"Oldest: {oldest_date.isoformat() if oldest_date else 'None'}"
                )

                return {
                    "success": True,
                    "message": f"Dernières dates récupérées pour {len(last_dates)} statistiques",
                    "last_dates": {k: v.isoformat() for k, v in last_dates.items()},
                    "oldest_date": oldest_date.isoformat() if oldest_date else None,
                }

        except Exception as e:
            logger.error(f"[HA-WS] Failed to get last statistic dates: {e}")
            return {
                "success": False,
                "message": f"Erreur: {str(e)}",
                "last_dates": {},
                "oldest_date": None,
            }

    async def clear_statistics(self, statistic_ids: list[str] | None = None) -> dict[str, Any]:
        """Clear statistics from Home Assistant

        Uses WebSocket API: recorder/clear_statistics

        Args:
            statistic_ids: List of statistic IDs to clear (None = all with prefix)

        Returns:
            Dict with operation result
        """
        if not self._has_websocket_config():
            return {
                "success": False,
                "message": "Configuration WebSocket manquante (ha_url, ha_token)",
            }

        prefix = self.config.get("statistic_id_prefix", "myelectricaldata")

        # If no specific IDs provided, get all with prefix
        if statistic_ids is None:
            list_result = await self.list_statistics(prefix)
            if not list_result.get("success"):
                return list_result
            statistic_ids = list_result.get("statistic_ids", [])

        if not statistic_ids:
            return {
                "success": True,
                "message": "Aucune statistique à supprimer",
                "cleared_count": 0,
            }

        token = self.config.get("ha_token")

        try:
            async with self._ws_connect() as ws:
                # Auth
                auth_req = json.loads(await ws.recv())
                if auth_req.get("type") != "auth_required":
                    return {"success": False, "message": "Unexpected HA response"}

                await ws.send(json.dumps({"type": "auth", "access_token": token}))
                auth_result = json.loads(await ws.recv())

                if auth_result.get("type") != "auth_ok":
                    return {
                        "success": False,
                        "message": f"Authentification échouée: {auth_result.get('message', 'Unknown error')}",
                    }

                # Clear statistics
                response = await self._ws_send_and_receive(
                    ws,
                    {
                        "type": "recorder/clear_statistics",
                        "statistic_ids": statistic_ids,
                    },
                    msg_id=1,
                )

                if not response.get("success", True):
                    return {
                        "success": False,
                        "message": response.get("error", {}).get("message", "Unknown error"),
                    }

                logger.info(f"[HA-WS] Cleared {len(statistic_ids)} statistics")

                return {
                    "success": True,
                    "message": f"{len(statistic_ids)} statistiques supprimées",
                    "cleared_count": len(statistic_ids),
                    "statistic_ids": statistic_ids,
                }

        except Exception as e:
            logger.error(f"[HA-WS] Failed to clear statistics: {e}")
            return {
                "success": False,
                "message": f"Erreur: {str(e)}",
            }

    async def import_statistics(
        self,
        db: AsyncSession,
        usage_point_ids: list[str],
        clear_first: bool = True,
        sync_delay_ms: int = 500,
        chunk_size: int = 2000,
        incremental: bool = False,
    ) -> dict[str, Any]:
        """Import consumption/production statistics to Home Assistant Energy Dashboard

        Uses WebSocket API: recorder/import_statistics

        Args:
            db: Database session
            usage_point_ids: List of PDL numbers
            clear_first: Clear existing statistics before import (ignored if incremental=True)
            sync_delay_ms: Delay in ms between imports to let HA ingest data (default 10s)
            chunk_size: Number of records per chunk (default 500)
            incremental: If True, only import new data since last import (faster)

        Returns:
            Dict with import results
        """
        if not self._has_websocket_config():
            return {
                "success": False,
                "message": "Configuration WebSocket manquante (ha_url, ha_token)",
            }

        prefix = self.config.get("statistic_id_prefix", "myelectricaldata")

        # For incremental mode, get the last imported date
        since_date: datetime | None = None
        if incremental:
            last_dates_result = await self.get_last_statistic_dates()
            if last_dates_result.get("success") and last_dates_result.get("oldest_date"):
                from datetime import datetime
                oldest_date_str = last_dates_result["oldest_date"]
                since_date = datetime.fromisoformat(oldest_date_str)
                logger.info(f"[HA-WS] Incremental mode: importing data since {since_date}")
            else:
                # No existing data, fall back to full import
                logger.info("[HA-WS] No existing statistics found, performing full import")
                incremental = False

        # Optionally clear existing statistics (disabled for incremental mode)
        if clear_first and not incremental:
            clear_result = await self.clear_statistics()
            if not clear_result.get("success"):
                logger.warning(f"[HA-WS] Failed to clear statistics: {clear_result.get('message')}")

        token = self.config.get("ha_token")

        results = {
            "consumption": 0,
            "production": 0,
            "cost": 0,
            "errors": [],
        }

        try:
            async with self._ws_connect() as ws:
                # Auth
                auth_req = json.loads(await ws.recv())
                if auth_req.get("type") != "auth_required":
                    return {"success": False, "message": "Unexpected HA response", **results}

                await ws.send(json.dumps({"type": "auth", "access_token": token}))
                auth_result = json.loads(await ws.recv())

                if auth_result.get("type") != "auth_ok":
                    return {
                        "success": False,
                        "message": f"Authentification échouée: {auth_result.get('message', 'Unknown error')}",
                        **results,
                    }

                msg_id = 1

                # Mapping for human-readable tariff names
                tariff_names = {
                    "base": "BASE",
                    "hc": "Heures Creuses",
                    "hp": "Heures Pleines",
                    "blue_hc": "TEMPO Bleu HC",
                    "blue_hp": "TEMPO Bleu HP",
                    "white_hc": "TEMPO Blanc HC",
                    "white_hp": "TEMPO Blanc HP",
                    "red_hc": "TEMPO Rouge HC",
                    "red_hp": "TEMPO Rouge HP",
                }

                # Import statistics for each PDL
                mode_str = "incremental" if incremental else "full"
                logger.info(f"[HA-WS] Processing {len(usage_point_ids)} PDLs ({mode_str} mode): {usage_point_ids}")
                for pdl in usage_point_ids:
                    # Get consumption data by tariff
                    logger.info(f"[HA-WS] Getting consumption data for PDL {pdl}" + (f" (since {since_date})" if since_date else ""))
                    consumption_by_tariff = await self._get_consumption_statistics_by_tariff(db, pdl, since_date)
                    logger.info(f"[HA-WS] Got {len(consumption_by_tariff)} tariff buckets for {pdl}: {list(consumption_by_tariff.keys())}")

                    for tariff_tag, stats in consumption_by_tariff.items():
                        # Import même si stats est vide pour créer l'entité dans HA
                        # Build statistic_id: myelectricaldata:consumption_{pdl}_{tariff}
                        statistic_id = f"{prefix}:consumption_{pdl}_{tariff_tag}"
                        tariff_name = tariff_names.get(tariff_tag, tariff_tag.upper())

                        # Import in chunks to avoid WebSocket timeout
                        imported, msg_id, chunk_errors = await self._import_stats_in_chunks(
                            ws,
                            stats,
                            {
                                "has_mean": False,
                                "has_sum": True,
                                "statistic_id": statistic_id,
                                "name": f"Consommation {pdl} {tariff_name}",
                                "source": prefix,
                                "unit_of_measurement": "kWh",
                            },
                            msg_id_start=msg_id,
                            chunk_size=chunk_size,
                            sync_delay_ms=sync_delay_ms,
                        )
                        results["consumption"] += imported
                        results["errors"].extend(chunk_errors)
                        if imported > 0:
                            logger.debug(f"[HA-WS] Imported {imported} consumption stats for {pdl} {tariff_tag}")

                    # Get cost data from consumption and energy offer prices
                    logger.info(f"[HA-WS] Calculating costs for PDL {pdl}")
                    cost_by_tariff = await self._get_cost_statistics_by_tariff(db, pdl, consumption_by_tariff)

                    for tariff_tag, cost_stats in cost_by_tariff.items():
                        # Import même si cost_stats est vide pour créer l'entité dans HA
                        # Build statistic_id: myelectricaldata:cost_{pdl}_{tariff}
                        statistic_id = f"{prefix}:cost_{pdl}_{tariff_tag}"
                        tariff_name = tariff_names.get(tariff_tag, tariff_tag.upper())

                        # Import in chunks to avoid WebSocket timeout
                        imported, msg_id, chunk_errors = await self._import_stats_in_chunks(
                            ws,
                            cost_stats,
                            {
                                "has_mean": False,
                                "has_sum": True,
                                "statistic_id": statistic_id,
                                "name": f"Coût {pdl} {tariff_name}",
                                "source": prefix,
                                "unit_of_measurement": "EUR",
                            },
                            msg_id_start=msg_id,
                            chunk_size=chunk_size,
                            sync_delay_ms=sync_delay_ms,
                        )
                        results["cost"] += imported
                        results["errors"].extend(chunk_errors)
                        if imported > 0:
                            logger.debug(f"[HA-WS] Imported {imported} cost stats for {pdl} {tariff_tag}")

                    # Get production data (production has no tariff distinction)
                    # Import même si vide pour créer l'entité dans HA
                    production_stats = await self._get_production_statistics(db, pdl, since_date)
                    statistic_id = f"{prefix}:production_{pdl}"

                    # Import in chunks to avoid WebSocket timeout
                    imported, msg_id, chunk_errors = await self._import_stats_in_chunks(
                        ws,
                        production_stats,
                        {
                            "has_mean": False,
                            "has_sum": True,
                            "statistic_id": statistic_id,
                            "name": f"Production {pdl}",
                            "source": prefix,
                            "unit_of_measurement": "kWh",
                        },
                        msg_id_start=msg_id,
                        chunk_size=chunk_size,
                        sync_delay_ms=sync_delay_ms,
                    )
                    results["production"] += imported
                    results["errors"].extend(chunk_errors)
                    if imported > 0:
                        logger.debug(f"[HA-WS] Imported {imported} production stats for {pdl}")

                logger.info(f"[HA-WS] Import completed: {results['consumption']} consumption, {results['cost']} cost, {results['production']} production")

                return {
                    "success": True,
                    "message": f"Import terminé: {results['consumption']} conso, {results['cost']} coût, {results['production']} prod",
                    **results,
                }

        except Exception as e:
            logger.error(f"[HA-WS] Failed to import statistics: {e}")
            return {
                "success": False,
                "message": f"Erreur: {str(e)}",
                **results,
            }

    async def import_statistics_with_progress(
        self,
        db: AsyncSession,
        usage_point_ids: list[str],
        clear_first: bool = True,
        progress_callback: Any = None,
        sync_delay_ms: int = 500,
        chunk_size: int = 2000,
        incremental: bool = False,
    ) -> dict[str, Any]:
        """Import statistics with progress callback for SSE streaming

        Same as import_statistics but calls progress_callback at each step.

        Args:
            db: Database session
            usage_point_ids: List of PDL numbers
            clear_first: Clear existing statistics before import (ignored if incremental=True)
            progress_callback: Async callback(event_dict) called at each step
            sync_delay_ms: Delay in ms between imports to let HA ingest data (default 10s)
            chunk_size: Number of statistics records per WebSocket message (default 500)
            incremental: If True, only import new data since last import (faster)

        Returns:
            Dict with import results
        """
        if not self._has_websocket_config():
            return {
                "success": False,
                "message": "Configuration WebSocket manquante (ha_url, ha_token)",
            }

        prefix = self.config.get("statistic_id_prefix", "myelectricaldata")

        # Helper pour envoyer les événements de progression
        async def emit_progress(
            step: int,
            total_steps: int,
            message: str,
            consumption: int = 0,
            cost: int = 0,
            production: int = 0,
        ) -> None:
            if progress_callback:
                await progress_callback({
                    "event_type": "progress",
                    "step": step,
                    "total_steps": total_steps,
                    "percent": round(step * 100 / total_steps) if total_steps > 0 else 0,
                    "message": message,
                    "consumption": consumption,
                    "cost": cost,
                    "production": production,
                })

        # For incremental mode, get the last imported date
        since_date: datetime | None = None
        if incremental:
            last_dates_result = await self.get_last_statistic_dates()
            if last_dates_result.get("success") and last_dates_result.get("oldest_date"):
                from datetime import datetime as dt
                oldest_date_str = last_dates_result["oldest_date"]
                since_date = dt.fromisoformat(oldest_date_str)
                logger.info(f"[HA-WS] Incremental mode: importing data since {since_date}")
            else:
                # No existing data, fall back to full import
                logger.info("[HA-WS] No existing statistics found, performing full import")
                incremental = False

        # Le total d'étapes est recalculé dynamiquement après chargement des tarifs
        num_pdls = len(usage_point_ids)
        # Estimation initiale : 2 (clear+auth) + 4 par PDL (lecture conso + 2 tarifs + calcul coût + 2 coûts + prod)
        total_steps = 2 + (num_pdls * 7)
        current_step = 0

        # Step 1: Clear si demandé (disabled for incremental mode)
        if clear_first and not incremental:
            await emit_progress(current_step, total_steps, "Suppression des anciennes statistiques...")
            clear_result = await self.clear_statistics()
            if not clear_result.get("success"):
                logger.warning(f"[HA-WS] Failed to clear statistics: {clear_result.get('message')}")
        elif incremental:
            await emit_progress(current_step, total_steps, f"Mode incrémental: import depuis {since_date.date() if since_date else 'N/A'}...")
        current_step += 1

        token = self.config.get("ha_token")

        results: dict[str, Any] = {
            "consumption": 0,
            "production": 0,
            "cost": 0,
            "errors": [],
        }

        try:
            async with self._ws_connect() as ws:
                # Step 2: Auth
                await emit_progress(current_step, total_steps, "Connexion à Home Assistant...")
                auth_req = json.loads(await ws.recv())
                if auth_req.get("type") != "auth_required":
                    return {"success": False, "message": "Unexpected HA response", **results}

                await ws.send(json.dumps({"type": "auth", "access_token": token}))
                auth_result = json.loads(await ws.recv())

                if auth_result.get("type") != "auth_ok":
                    return {
                        "success": False,
                        "message": f"Authentification échouée: {auth_result.get('message', 'Unknown error')}",
                        **results,
                    }
                current_step += 1

                msg_id = 2

                # Noms des tarifs pour l'affichage
                tariff_names = {
                    "base": "Base",
                    "hc": "Heures Creuses",
                    "hp": "Heures Pleines",
                    "blue_hc": "Bleu HC",
                    "blue_hp": "Bleu HP",
                    "white_hc": "Blanc HC",
                    "white_hp": "Blanc HP",
                    "red_hc": "Rouge HC",
                    "red_hp": "Rouge HP",
                }

                for pdl_idx, pdl in enumerate(usage_point_ids):
                    # Callback de progression par chunk : affiche le nb importé / total en temps réel
                    async def make_chunk_cb(category: str, label: str):
                        base = results[category]
                        async def cb(imported_in_tariff: int, total_in_tariff: int):
                            # Afficher le compteur temporaire (base + en cours)
                            tmp = dict(results)
                            tmp[category] = base + imported_in_tariff
                            await emit_progress(
                                current_step, total_steps,
                                f"{label} ({imported_in_tariff}/{total_in_tariff})",
                                tmp["consumption"], tmp["cost"], tmp["production"]
                            )
                        return cb

                    # Étape: Lecture des données de consommation
                    await emit_progress(
                        current_step, total_steps,
                        f"PDL {pdl_idx + 1}/{num_pdls}: Lecture consommation...",
                        results["consumption"], results["cost"], results["production"]
                    )
                    consumption_by_tariff = await self._get_consumption_statistics_by_tariff(db, pdl, since_date)
                    current_step += 1

                    # Recalculer total_steps pour ce PDL maintenant qu'on connaît le nb de tarifs
                    # Pour ce PDL : N tarifs conso + 1 calcul coût + N tarifs coût + 1 prod = 2N + 2
                    n_tariffs = len(consumption_by_tariff)
                    # Ajuster l'estimation (on avait compté 7, on met le vrai chiffre)
                    total_steps += (2 * n_tariffs + 2) - 7  # Différence entre réel et estimé

                    # Import consommation par tarif
                    for tariff_tag, stats in consumption_by_tariff.items():
                        tariff_name = tariff_names.get(tariff_tag, tariff_tag.upper())
                        current_message = f"PDL {pdl_idx + 1}/{num_pdls}: Import conso {tariff_name}..."
                        await emit_progress(
                            current_step, total_steps,
                            current_message,
                            results["consumption"], results["cost"], results["production"]
                        )

                        chunk_cb = await make_chunk_cb("consumption", current_message)
                        statistic_id = f"{prefix}:consumption_{pdl}_{tariff_tag}"
                        imported, msg_id, chunk_errors = await self._import_stats_in_chunks(
                            ws,
                            stats,
                            {
                                "has_mean": False,
                                "has_sum": True,
                                "statistic_id": statistic_id,
                                "name": f"Consommation {pdl} {tariff_name}",
                                "source": prefix,
                                "unit_of_measurement": "kWh",
                            },
                            msg_id_start=msg_id,
                            chunk_size=chunk_size,
                            sync_delay_ms=sync_delay_ms,
                            chunk_callback=chunk_cb,
                        )
                        results["consumption"] += imported
                        results["errors"].extend(chunk_errors)
                        current_step += 1

                    # Calcul et import des coûts
                    await emit_progress(
                        current_step, total_steps,
                        f"PDL {pdl_idx + 1}/{num_pdls}: Calcul des coûts...",
                        results["consumption"], results["cost"], results["production"]
                    )
                    cost_by_tariff = await self._get_cost_statistics_by_tariff(db, pdl, consumption_by_tariff)
                    current_step += 1

                    for tariff_tag, cost_stats in cost_by_tariff.items():
                        tariff_name = tariff_names.get(tariff_tag, tariff_tag.upper())
                        current_message = f"PDL {pdl_idx + 1}/{num_pdls}: Import coût {tariff_name}..."
                        await emit_progress(
                            current_step, total_steps,
                            current_message,
                            results["consumption"], results["cost"], results["production"]
                        )

                        chunk_cb = await make_chunk_cb("cost", current_message)
                        statistic_id = f"{prefix}:cost_{pdl}_{tariff_tag}"
                        imported, msg_id, chunk_errors = await self._import_stats_in_chunks(
                            ws,
                            cost_stats,
                            {
                                "has_mean": False,
                                "has_sum": True,
                                "statistic_id": statistic_id,
                                "name": f"Coût {pdl} {tariff_name}",
                                "source": prefix,
                                "unit_of_measurement": "EUR",
                            },
                            msg_id_start=msg_id,
                            chunk_size=chunk_size,
                            sync_delay_ms=sync_delay_ms,
                            chunk_callback=chunk_cb,
                        )
                        results["cost"] += imported
                        results["errors"].extend(chunk_errors)
                        current_step += 1

                    # Production
                    current_message = f"PDL {pdl_idx + 1}/{num_pdls}: Import production..."
                    await emit_progress(
                        current_step, total_steps,
                        current_message,
                        results["consumption"], results["cost"], results["production"]
                    )
                    production_stats = await self._get_production_statistics(db, pdl, since_date)
                    chunk_cb = await make_chunk_cb("production", current_message)
                    statistic_id = f"{prefix}:production_{pdl}"
                    imported, msg_id, chunk_errors = await self._import_stats_in_chunks(
                        ws,
                        production_stats,
                        {
                            "has_mean": False,
                            "has_sum": True,
                            "statistic_id": statistic_id,
                            "name": f"Production {pdl}",
                            "source": prefix,
                            "unit_of_measurement": "kWh",
                        },
                        msg_id_start=msg_id,
                        chunk_size=chunk_size,
                        sync_delay_ms=sync_delay_ms,
                        chunk_callback=chunk_cb,
                    )
                    results["production"] += imported
                    results["errors"].extend(chunk_errors)
                    current_step += 1

                logger.info(f"[HA-WS] Import completed: {results['consumption']} consumption, {results['cost']} cost, {results['production']} production")

                return {
                    "success": True,
                    "message": f"Import terminé: {results['consumption']} conso, {results['cost']} coût, {results['production']} prod",
                    **results,
                }

        except Exception as e:
            logger.error(f"[HA-WS] Failed to import statistics with progress: {e}")
            return {
                "success": False,
                "message": f"Erreur: {str(e)}",
                **results,
            }

    async def _get_consumption_statistics_by_tariff(
        self,
        db: AsyncSession,
        pdl: str,
        since_date: datetime | None = None,
    ) -> dict[str, list[dict[str, Any]]]:
        """Get consumption statistics grouped by tariff type for Energy Dashboard

        Returns statistics in the format expected by recorder/import_statistics,
        separated by tariff (BASE, HC, HP, or TEMPO colors).

        Based on the original MyElectricalData implementation:
        https://github.com/MyElectricalData/myelectricaldata_import/blob/main/src/models/export_home_assistant_ws.py

        Args:
            db: Database session
            pdl: Usage point ID
            since_date: Only include records after this date (for incremental import)

        Returns:
            Dict of tariff_tag -> list of statistics records
            Example: {"base": [...], "hc": [...], "hp": [...]}
            or for TEMPO: {"blue_hc": [...], "blue_hp": [...], "white_hc": [...], ...}
        """
        from datetime import timedelta
        from zoneinfo import ZoneInfo

        from ...models.client_mode import ConsumptionData, DataGranularity
        from ...models.tempo_day import TempoColor, TempoDay

        tz_paris = ZoneInfo("Europe/Paris")

        # 1. Profil tarifaire et plages HC (PDL.pricing_option prioritaire, cf. _get_pdl_contract_info)
        profile, contract_ranges, _ = await self._get_pdl_contract_info(db, pdl)
        # Aucune plage connue : 22h-6h
        parsed_offpeak = contract_ranges or DEFAULT_OFFPEAK_RANGES
        logger.info(
            f"[HA-WS] PDL {pdl}: tariff={profile}, offpeak_ranges={contract_ranges}, since_date={since_date}"
        )

        # 2. Try to get detailed data (30-min) first, fallback to daily
        # Apply since_date filter if provided (for incremental import)
        detailed_query = (
            select(ConsumptionData)
            .where(ConsumptionData.usage_point_id == pdl)
            .where(ConsumptionData.granularity == DataGranularity.DETAILED)
        )
        if since_date:
            detailed_query = detailed_query.where(ConsumptionData.date >= since_date.date())
        detailed_query = detailed_query.order_by(ConsumptionData.date, ConsumptionData.interval_start)

        detailed_result = await db.execute(detailed_query)
        detailed_records = detailed_result.scalars().all()

        if detailed_records:
            records = detailed_records
            use_detailed = True
            logger.info(f"[HA-WS] Using {len(records)} detailed records for {pdl}" + (f" (since {since_date.date()})" if since_date else ""))
        else:
            # Fallback to daily
            daily_query = (
                select(ConsumptionData)
                .where(ConsumptionData.usage_point_id == pdl)
                .where(ConsumptionData.granularity == DataGranularity.DAILY)
            )
            if since_date:
                daily_query = daily_query.where(ConsumptionData.date >= since_date.date())
            daily_query = daily_query.order_by(ConsumptionData.date)

            daily_result = await db.execute(daily_query)
            records = daily_result.scalars().all()
            use_detailed = False
            logger.info(f"[HA-WS] Using {len(records)} daily records for {pdl}" + (f" (since {since_date.date()})" if since_date else ""))

        if not records:
            logger.info(f"[HA-WS] No records found for {pdl}")
            return {}

        # 3. For TEMPO, load the color calendar
        tempo_colors: dict[str, TempoColor] = {}
        if profile.family == "TEMPO":
            tempo_result = await db.execute(select(TempoDay))
            for day in tempo_result.scalars().all():
                # Store by date string YYYY-MM-DD
                day_str = day.date.strftime("%Y-%m-%d") if hasattr(day.date, 'strftime') else str(day.date)[:10]
                tempo_colors[day_str] = day.color

        # 4. Initialize stats buckets based on pricing option
        stats_by_tariff: dict[str, list[dict[str, Any]]] = {}
        cumulative_by_tariff: dict[str, float] = {}

        if profile.family == "TEMPO":
            # 6 buckets: blue_hc, blue_hp, white_hc, white_hp, red_hc, red_hp
            for color in ["blue", "white", "red"]:
                for period in ["hc", "hp"]:
                    key = f"{color}_{period}"
                    stats_by_tariff[key] = []
                    cumulative_by_tariff[key] = 0.0
        elif profile.family == "HC_HP":
            # 2 buckets: hc, hp
            stats_by_tariff["hc"] = []
            stats_by_tariff["hp"] = []
            cumulative_by_tariff["hc"] = 0.0
            cumulative_by_tariff["hp"] = 0.0
        else:
            # BASE: 1 bucket
            stats_by_tariff["base"] = []
            cumulative_by_tariff["base"] = 0.0

        # 6. Helper to convert W → Wh based on interval_length
        def convert_w_to_wh(value_w: int, raw_data: dict | None) -> float:
            """Convert Watts to Watt-hours based on interval_length

            For detailed data, values are in W (average power over interval).
            Formula: Wh = W / (60 / interval_minutes)
            - PT10M → Wh = W / 6
            - PT15M → Wh = W / 4
            - PT30M → Wh = W / 2 (default)
            - PT60M → Wh = W / 1

            For daily data, values are already in Wh.
            """
            if not raw_data:
                # Default to PT30M for detailed data without raw_data
                return value_w / 2 if use_detailed else float(value_w)

            interval_length = raw_data.get("p") or raw_data.get("interval_length", "PT30M")

            # Parse interval_length (e.g., "PT30M" → 30)
            match = re.match(r"PT(\d+)M", interval_length)
            if match:
                interval_minutes = int(match.group(1))
                # Wh = W / (60 / interval_minutes)
                return value_w / (60 / interval_minutes)

            # For daily data (PT1D or unknown), value is already in Wh
            return float(value_w)

        # 7. Process each record
        # Home Assistant requires hourly data (timestamps at XX:00:00)
        # For detailed (30-min) data, we aggregate by hour
        # Key: (tariff_tag, date, hour) -> value_kwh
        hourly_aggregation: dict[tuple[str, Any, int], float] = {}

        for record in records:
            # Convert W → Wh using interval_length from raw_data
            value_wh = convert_w_to_wh(record.value, record.raw_data) if record.value else 0
            value_kwh = value_wh / 1000

            # Parse time
            if use_detailed and record.interval_start:
                # Parse interval_start (e.g., "14:30")
                hour, minute = map(int, record.interval_start.split(":")[:2])
            else:
                # Daily data: split into 24 hourly entries
                hour, minute = 0, 0

            # Determine tariff tag: TEMPO by hour, HC/HP by the exact start of the slot
            # (contract ranges can start on the half hour, e.g. 22:30-06:30)
            if profile.family == "TEMPO":
                # TEMPO logic: 6h-22h = HP, 22h-6h = HC
                # For data between 00:00 and 06:00, the color is from the previous day
                if 6 <= hour < 22:
                    period = "hp"
                    tempo_date = record.date
                else:
                    period = "hc"
                    # Between 00:00 and 06:00, color is from previous day
                    if hour < 6:
                        tempo_date = record.date - timedelta(days=1)
                    else:
                        tempo_date = record.date

                date_str = tempo_date.strftime("%Y-%m-%d")
                color = tempo_colors.get(date_str, TempoColor.BLUE)
                color_name = color.value.lower() if hasattr(color, 'value') else str(color).lower()
                tariff_tag = f"{color_name}_{period}"

            elif profile.family == "HC_HP":
                # HC/HP: use off-peak hours from contract (weekend fully off-peak for weekend offers)
                if is_offpeak(record.date, hour, minute, parsed_offpeak, profile.weekend_offpeak):
                    tariff_tag = "hc"
                else:
                    tariff_tag = "hp"
            else:
                # BASE
                tariff_tag = "base"

            # Aggregate by hour
            if use_detailed:
                # Aggregate 30-min slots into hourly
                key = (tariff_tag, record.date, hour)
                hourly_aggregation[key] = hourly_aggregation.get(key, 0) + value_kwh
            else:
                # Daily data: create 24 hourly entries with value/24 each
                # This provides granularity for tariff-based separation
                hourly_value = value_kwh / 24
                for h in range(24):
                    # Re-determine tariff for each hour
                    if profile.family == "TEMPO":
                        if 6 <= h < 22:
                            h_period = "hp"
                            h_tempo_date = record.date
                        else:
                            h_period = "hc"
                            if h < 6:
                                h_tempo_date = record.date - timedelta(days=1)
                            else:
                                h_tempo_date = record.date
                        h_date_str = h_tempo_date.strftime("%Y-%m-%d")
                        h_color = tempo_colors.get(h_date_str, TempoColor.BLUE)
                        h_color_name = h_color.value.lower() if hasattr(h_color, 'value') else str(h_color).lower()
                        h_tariff_tag = f"{h_color_name}_{h_period}"
                    elif profile.family == "HC_HP":
                        h_tariff_tag = "hc" if is_offpeak(record.date, h, 0, parsed_offpeak, profile.weekend_offpeak) else "hp"
                    else:
                        h_tariff_tag = "base"

                    key = (h_tariff_tag, record.date, h)
                    hourly_aggregation[key] = hourly_aggregation.get(key, 0) + hourly_value

        # 7. Build final statistics from hourly aggregation
        # Sort by (date, hour) to maintain chronological order
        sorted_keys = sorted(hourly_aggregation.keys(), key=lambda k: (k[1], k[2]))

        for tariff_tag, record_date, hour in sorted_keys:
            value_kwh = hourly_aggregation[(tariff_tag, record_date, hour)]

            # Build datetime at the start of the hour
            start_dt = datetime.combine(record_date, datetime.min.time().replace(hour=hour, minute=0, second=0))
            start_dt = start_dt.replace(tzinfo=tz_paris)

            # Ensure bucket exists (safety)
            if tariff_tag not in stats_by_tariff:
                stats_by_tariff[tariff_tag] = []
                cumulative_by_tariff[tariff_tag] = 0.0

            # Update cumulative and add stat
            cumulative_by_tariff[tariff_tag] += value_kwh

            stats_by_tariff[tariff_tag].append({
                "start": start_dt.isoformat(),
                "state": round(value_kwh, 3),
                "sum": round(cumulative_by_tariff[tariff_tag], 3),
            })

        # Log summary
        for tag, stats in stats_by_tariff.items():
            if stats:
                logger.debug(f"[HA-WS] {pdl} {tag}: {len(stats)} records, total={cumulative_by_tariff[tag]:.2f} kWh")

        return stats_by_tariff

    async def _get_cost_statistics_by_tariff(
        self,
        db: AsyncSession,
        pdl: str,
        consumption_by_tariff: dict[str, list[dict[str, Any]]],
    ) -> dict[str, list[dict[str, Any]]]:
        """Calculate cost statistics from consumption data and energy offer prices

        Uses the PDL's selected_offer to get the tariff prices, then multiplies
        consumption by price for each tariff bucket.

        Args:
            db: Database session
            pdl: Usage point ID
            consumption_by_tariff: Consumption stats from _get_consumption_statistics_by_tariff()

        Returns:
            Dict of tariff_tag -> list of cost statistics in EUR
            Example: {"blue_hc": [{start, state, sum}, ...], ...}
        """

        from ...models.energy_provider import EnergyOffer
        from ...models.pdl import PDL

        # Get PDL with selected offer
        pdl_result = await db.execute(
            select(PDL).where(PDL.usage_point_id == pdl)
        )
        pdl_record = pdl_result.scalar_one_or_none()

        if not pdl_record or not pdl_record.selected_offer_id:
            logger.warning(f"[HA-WS] PDL {pdl} has no selected_offer_id, cannot calculate costs")
            return {}

        # Get the energy offer
        offer_result = await db.execute(
            select(EnergyOffer).where(EnergyOffer.id == pdl_record.selected_offer_id)
        )
        offer = offer_result.scalar_one_or_none()

        if not offer:
            logger.warning(f"[HA-WS] Energy offer {pdl_record.selected_offer_id} not found")
            return {}

        # Prix du kWh par série et par jour (Decimal → float). Tempo : prix fixe par couleur ;
        # autres offres : prix pouvant dépendre de la saison ou du week-end (cf. _day_price)
        family = tariff_profile(offer.offer_type).family

        if family == "TEMPO":
            tempo_prices = {
                tag: float(value)
                for tag in ("blue_hc", "blue_hp", "white_hc", "white_hp", "red_hc", "red_hp")
                if (value := getattr(offer, f"tempo_{tag}"))
            }

            def price_of(tariff_tag: str, day: date) -> float | None:
                return tempo_prices.get(tariff_tag)
        else:
            tags = ("hc", "hp") if family == "HC_HP" else ("base",)

            def price_of(tariff_tag: str, day: date) -> float | None:
                return _day_price(offer, tariff_tag, day) if tariff_tag in tags else None

        # Calculate cost for each tariff bucket
        cost_by_tariff: dict[str, list[dict[str, Any]]] = {}

        for tariff_tag, consumption_stats in consumption_by_tariff.items():
            # stat["start"] est l'heure locale (Europe/Paris) : ses 10 premiers caractères donnent le jour
            day_prices = [price_of(tariff_tag, date.fromisoformat(stat["start"][:10])) for stat in consumption_stats]
            if not day_prices or None in day_prices:
                logger.debug(f"[HA-WS] No price for tariff {tariff_tag}, skipping cost calculation")
                continue

            cost_stats = []
            cumulative_cost = 0.0

            for stat, price_per_kwh in zip(consumption_stats, day_prices, strict=True):
                # stat has: start, state (kWh for this period), sum (cumulative kWh)
                consumption_kwh = stat["state"]
                cost_eur = consumption_kwh * price_per_kwh
                cumulative_cost += cost_eur

                cost_stats.append({
                    "start": stat["start"],
                    "state": round(cost_eur, 4),  # Cost in EUR for this hour
                    "sum": round(cumulative_cost, 4),  # Cumulative cost
                })

            cost_by_tariff[tariff_tag] = cost_stats
            logger.debug(f"[HA-WS] {pdl} cost {tariff_tag}: {len(cost_stats)} records, total={cumulative_cost:.2f} EUR")

        if consumption_by_tariff and not cost_by_tariff:
            logger.warning(f"[HA-WS] No prices found in offer '{offer.name}' ({offer.offer_type})")
        else:
            logger.info(f"[HA-WS] Costs from offer '{offer.name}' ({offer.offer_type}): {sorted(cost_by_tariff)}")

        return cost_by_tariff

    async def _get_production_statistics(
        self,
        db: AsyncSession,
        pdl: str,
        since_date: datetime | None = None,
    ) -> list[dict[str, Any]]:
        """Get production statistics for Energy Dashboard

        Returns statistics in the format expected by recorder/import_statistics.
        Uses detailed (30-min) data if available, otherwise falls back to daily.

        Args:
            db: Database session
            pdl: Usage point ID
            since_date: Only include records after this date (for incremental import)

        Returns:
            List of statistics records [{start, state, sum}, ...]
        """
        from zoneinfo import ZoneInfo

        from ...models.client_mode import ProductionData, DataGranularity

        tz_paris = ZoneInfo("Europe/Paris")

        # Try detailed data first
        try:
            detailed_query = (
                select(ProductionData)
                .where(ProductionData.usage_point_id == pdl)
                .where(ProductionData.granularity == DataGranularity.DETAILED)
            )
            if since_date:
                detailed_query = detailed_query.where(ProductionData.date >= since_date.date())
            detailed_query = detailed_query.order_by(ProductionData.date, ProductionData.interval_start)

            detailed_result = await db.execute(detailed_query)
            detailed_records = detailed_result.scalars().all()

            if detailed_records:
                records = detailed_records
                use_detailed = True
                logger.debug(f"[HA-WS] Using {len(records)} detailed production records for {pdl}" + (f" (since {since_date.date()})" if since_date else ""))
            else:
                # Fallback to daily
                daily_query = (
                    select(ProductionData)
                    .where(ProductionData.usage_point_id == pdl)
                    .where(ProductionData.granularity == DataGranularity.DAILY)
                )
                if since_date:
                    daily_query = daily_query.where(ProductionData.date >= since_date.date())
                daily_query = daily_query.order_by(ProductionData.date)

                daily_result = await db.execute(daily_query)
                records = daily_result.scalars().all()
                use_detailed = False
                logger.debug(f"[HA-WS] Using {len(records)} daily production records for {pdl}" + (f" (since {since_date.date()})" if since_date else ""))
        except Exception:
            return []

        if not records:
            return []

        # Helper to convert W → Wh based on interval_length
        def convert_w_to_wh(value_w: int, raw_data: dict | None) -> float:
            """Convert Watts to Watt-hours based on interval_length

            For detailed data, values are in W (average power over interval).
            Formula: Wh = W / (60 / interval_minutes)
            - PT10M → Wh = W / 6
            - PT15M → Wh = W / 4
            - PT30M → Wh = W / 2 (default)
            - PT60M → Wh = W / 1

            For daily data, values are already in Wh.
            """
            if not raw_data:
                # Default to PT30M for detailed data without raw_data
                return value_w / 2 if use_detailed else float(value_w)

            interval_length = raw_data.get("p") or raw_data.get("interval_length", "PT30M")

            # Parse interval_length (e.g., "PT30M" → 30)
            match = re.match(r"PT(\d+)M", interval_length)
            if match:
                interval_minutes = int(match.group(1))
                # Wh = W / (60 / interval_minutes)
                return value_w / (60 / interval_minutes)

            # For daily data (PT1D or unknown), value is already in Wh
            return float(value_w)

        # Build statistics with cumulative sum
        # Home Assistant requires hourly data (timestamps at XX:00:00)
        # For detailed (30-min) data, aggregate by hour
        # Key: (date, hour) -> value_kwh
        hourly_aggregation: dict[tuple[Any, int], float] = {}

        for record in records:
            # Convert W → Wh using interval_length from raw_data
            value_wh = convert_w_to_wh(record.value, record.raw_data) if record.value else 0
            value_kwh = value_wh / 1000

            if use_detailed and record.interval_start:
                hour, _ = map(int, record.interval_start.split(":"))
                key = (record.date, hour)
                hourly_aggregation[key] = hourly_aggregation.get(key, 0) + value_kwh
            else:
                # Daily data: split into 24 hourly entries
                hourly_value = value_kwh / 24
                for h in range(24):
                    key = (record.date, h)
                    hourly_aggregation[key] = hourly_aggregation.get(key, 0) + hourly_value

        # Build final statistics sorted by time
        stats = []
        cumulative_kwh = 0.0
        sorted_keys = sorted(hourly_aggregation.keys(), key=lambda k: (k[0], k[1]))

        for record_date, hour in sorted_keys:
            value_kwh = hourly_aggregation[(record_date, hour)]
            cumulative_kwh += value_kwh

            # Build datetime at the start of the hour
            start_dt = datetime.combine(record_date, datetime.min.time().replace(hour=hour, minute=0, second=0))
            start_dt = start_dt.replace(tzinfo=tz_paris)

            stats.append({
                "start": start_dt.isoformat(),
                "state": round(value_kwh, 3),
                "sum": round(cumulative_kwh, 3),
            })

        return stats
