"""Generic MQTT Exporter

Exports electricity data to any MQTT broker with configurable topic structure.
Unlike the Home Assistant exporter, this uses simple topic-based publishing
without the HA-specific discovery protocol.

Topic structure:
    {topic_prefix}/{pdl}/consumption/daily
    {topic_prefix}/{pdl}/consumption/detailed
    {topic_prefix}/{pdl}/consumption/stats   (+ {yesterday,this_week,this_month,this_year}_{hp,hc}_kwh
                                              pour un contrat à heures creuses avec données détaillées)
    {topic_prefix}/{pdl}/production/daily
    {topic_prefix}/tempo/today
    {topic_prefix}/tempo/tomorrow
    {topic_prefix}/ecowatt/today
"""

from __future__ import annotations

import json
import logging
import ssl
from datetime import date, datetime, timedelta
from typing import Any

import aiomqtt
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from .base import BaseExporter

logger = logging.getLogger(__name__)

# Tempo quotas per season (EDF contract limits)
TEMPO_QUOTAS = {
    "BLUE": 300,
    "WHITE": 43,
    "RED": 22,
}


def _color_name(color: Any) -> str:
    """Couleur Tempo en texte (TempoColor.BLUE → "BLUE"), sérialisable en JSON"""
    return str(getattr(color, "value", color))


class MQTTExporter(BaseExporter):
    """Generic MQTT exporter with configurable topics

    Configuration:
        broker: MQTT broker hostname
        port: MQTT broker port (default: 1883)
        username: MQTT username (optional)
        password: MQTT password (optional)
        use_tls: Use TLS for MQTT connection (default: False)
        topic_prefix: Topic prefix (default: myelectricaldata)
        qos: Quality of Service level (default: 0)
        retain: Retain messages on broker (default: True)
    """

    def _validate_config(self) -> None:
        """Validate MQTT configuration"""
        if not self.config.get("broker"):
            raise ValueError("MQTT broker hostname is required")

        self.broker = self.config["broker"]
        self.port = self.config.get("port", 1883)
        self.username = self.config.get("username")
        self.password = self.config.get("password")
        self.use_tls = self.config.get("use_tls", False)
        self.topic_prefix = self.config.get("topic_prefix", "myelectricaldata")
        self.qos = self.config.get("qos", 0)
        self.retain = self.config.get("retain", True)

    async def _get_mqtt_client(self) -> aiomqtt.Client:
        """Create and return an MQTT client"""
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
                f"{self.topic_prefix}/status",
                payload=json.dumps({"status": "online", "timestamp": datetime.now().isoformat()}),
                qos=self.qos,
                retain=self.retain,
            )
            logger.info(f"[MQTT] Connected to broker: {self.broker}:{self.port}")
            return True

    async def export_consumption(
        self,
        usage_point_id: str,
        data: list[dict[str, Any]],
        granularity: str,
    ) -> int:
        """Export consumption data

        Args:
            usage_point_id: PDL number
            data: List of consumption records
            granularity: 'daily' or 'detailed'

        Returns:
            Number of records exported
        """
        if not data:
            return 0

        topic = f"{self.topic_prefix}/{usage_point_id}/consumption/{granularity}"
        payload = json.dumps({
            "pdl": usage_point_id,
            "granularity": granularity,
            "records": len(data),
            "data": data,
            "timestamp": datetime.now().isoformat(),
        })

        async with await self._get_mqtt_client() as client:
            await client.publish(topic, payload=payload, qos=self.qos, retain=self.retain)

        logger.info(f"[MQTT] Published {len(data)} {granularity} consumption records for {usage_point_id}")
        return len(data)

    async def export_production(
        self,
        usage_point_id: str,
        data: list[dict[str, Any]],
        granularity: str,
    ) -> int:
        """Export production data

        Args:
            usage_point_id: PDL number
            data: List of production records
            granularity: 'daily' or 'detailed'

        Returns:
            Number of records exported
        """
        if not data:
            return 0

        topic = f"{self.topic_prefix}/{usage_point_id}/production/{granularity}"
        payload = json.dumps({
            "pdl": usage_point_id,
            "granularity": granularity,
            "records": len(data),
            "data": data,
            "timestamp": datetime.now().isoformat(),
        })

        async with await self._get_mqtt_client() as client:
            await client.publish(topic, payload=payload, qos=self.qos, retain=self.retain)

        logger.info(f"[MQTT] Published {len(data)} {granularity} production records for {usage_point_id}")
        return len(data)

    async def run_full_export(
        self,
        db: AsyncSession,
        usage_point_ids: list[str],
    ) -> dict[str, Any]:
        """Run a full export with all data types

        This exports:
        - Consumption statistics (daily, monthly, yearly totals)
        - Production statistics (if available)
        - Tempo information
        - EcoWatt signals

        Args:
            db: Database session
            usage_point_ids: List of PDL numbers to export

        Returns:
            Export results with counts
        """
        results = {
            "consumption": 0,
            "production": 0,
            "tempo": 0,
            "ecowatt": 0,
            "errors": [],
        }

        async with await self._get_mqtt_client() as client:
            # Export consumption/production for each PDL
            for pdl in usage_point_ids:
                try:
                    # Export consumption stats
                    stats = await self._get_consumption_stats(db, pdl)
                    if stats:
                        topic = f"{self.topic_prefix}/{pdl}/consumption/stats"
                        await client.publish(
                            topic,
                            payload=json.dumps(stats),
                            qos=self.qos,
                            retain=self.retain,
                        )
                        results["consumption"] += 1

                    # Export production stats
                    prod_stats = await self._get_production_stats(db, pdl)
                    if prod_stats:
                        topic = f"{self.topic_prefix}/{pdl}/production/stats"
                        await client.publish(
                            topic,
                            payload=json.dumps(prod_stats),
                            qos=self.qos,
                            retain=self.retain,
                        )
                        results["production"] += 1

                except Exception as e:
                    logger.error(f"[MQTT] Error exporting PDL {pdl}: {e}")
                    results["errors"].append(f"PDL {pdl}: {str(e)}")

            # Export Tempo data
            try:
                tempo_data = await self._get_tempo_data(db)
                if tempo_data:
                    # Today
                    await client.publish(
                        f"{self.topic_prefix}/tempo/today",
                        payload=json.dumps(tempo_data.get("today", {})),
                        qos=self.qos,
                        retain=self.retain,
                    )
                    # Tomorrow
                    await client.publish(
                        f"{self.topic_prefix}/tempo/tomorrow",
                        payload=json.dumps(tempo_data.get("tomorrow", {})),
                        qos=self.qos,
                        retain=self.retain,
                    )
                    # Remaining days
                    await client.publish(
                        f"{self.topic_prefix}/tempo/remaining",
                        payload=json.dumps(tempo_data.get("remaining", {})),
                        qos=self.qos,
                        retain=self.retain,
                    )
                    results["tempo"] += 1
            except Exception as e:
                logger.error(f"[MQTT] Error exporting Tempo: {e}")
                results["errors"].append(f"Tempo: {str(e)}")

            # Export EcoWatt data
            try:
                ecowatt_data = await self._get_ecowatt_data(db)
                if ecowatt_data:
                    await client.publish(
                        f"{self.topic_prefix}/ecowatt/today",
                        payload=json.dumps(ecowatt_data),
                        qos=self.qos,
                        retain=self.retain,
                    )
                    results["ecowatt"] += 1
            except Exception as e:
                logger.error(f"[MQTT] Error exporting EcoWatt: {e}")
                results["errors"].append(f"EcoWatt: {str(e)}")

            # Update status
            await client.publish(
                f"{self.topic_prefix}/status",
                payload=json.dumps({
                    "status": "online",
                    "last_export": datetime.now().isoformat(),
                    "pdls_exported": len(usage_point_ids),
                }),
                qos=self.qos,
                retain=self.retain,
            )

        return results

    async def _get_consumption_stats(self, db: AsyncSession, pdl: str) -> dict[str, Any] | None:
        """Get consumption statistics for a PDL"""
        from ...models.client_mode import ConsumptionData, DataGranularity

        today = date.today()
        year_start = date(today.year, 1, 1)
        month_start = date(today.year, today.month, 1)
        week_start = today - timedelta(days=today.weekday())
        yesterday = today - timedelta(days=1)

        stats = {"pdl": pdl, "timestamp": datetime.now().isoformat()}

        # Yesterday consumption
        stmt = select(func.sum(ConsumptionData.value)).where(
            ConsumptionData.usage_point_id == pdl,
            ConsumptionData.date == yesterday,
            ConsumptionData.granularity == DataGranularity.DAILY,
        )
        result = await db.execute(stmt)
        yesterday_wh = result.scalar()
        stats["yesterday_kwh"] = round(yesterday_wh / 1000, 2) if yesterday_wh else 0

        # This month
        stmt = select(func.sum(ConsumptionData.value)).where(
            ConsumptionData.usage_point_id == pdl,
            ConsumptionData.date >= month_start,
            ConsumptionData.granularity == DataGranularity.DAILY,
        )
        result = await db.execute(stmt)
        month_wh = result.scalar()
        stats["this_month_kwh"] = round(month_wh / 1000, 2) if month_wh else 0

        # This year
        stmt = select(func.sum(ConsumptionData.value)).where(
            ConsumptionData.usage_point_id == pdl,
            ConsumptionData.date >= year_start,
            ConsumptionData.granularity == DataGranularity.DAILY,
        )
        result = await db.execute(stmt)
        year_wh = result.scalar()
        stats["this_year_kwh"] = round(year_wh / 1000, 2) if year_wh else 0

        # This week
        stmt = select(func.sum(ConsumptionData.value)).where(
            ConsumptionData.usage_point_id == pdl,
            ConsumptionData.date >= week_start,
            ConsumptionData.granularity == DataGranularity.DAILY,
        )
        result = await db.execute(stmt)
        week_wh = result.scalar()
        stats["this_week_kwh"] = round(week_wh / 1000, 2) if week_wh else 0

        # HP/HC : contrats à heures creuses, à partir des données détaillées (30 min)
        hp_hc = await self._get_hp_hc_summary(db, pdl, today)
        if hp_hc:
            stats.update(hp_hc)

        return stats if any(v for k, v in stats.items() if k.endswith("_kwh")) else None

    async def _get_production_stats(self, db: AsyncSession, pdl: str) -> dict[str, Any] | None:
        """Get production statistics for a PDL"""
        from ...models.client_mode import DataGranularity, ProductionData

        today = date.today()
        year_start = date(today.year, 1, 1)
        month_start = date(today.year, today.month, 1)
        yesterday = today - timedelta(days=1)

        stats = {"pdl": pdl, "timestamp": datetime.now().isoformat()}

        # Yesterday production
        stmt = select(func.sum(ProductionData.value)).where(
            ProductionData.usage_point_id == pdl,
            ProductionData.date == yesterday,
            ProductionData.granularity == DataGranularity.DAILY,
        )
        result = await db.execute(stmt)
        yesterday_wh = result.scalar()
        if not yesterday_wh:
            return None  # No production data
        stats["yesterday_kwh"] = round(yesterday_wh / 1000, 2)

        # This month
        stmt = select(func.sum(ProductionData.value)).where(
            ProductionData.usage_point_id == pdl,
            ProductionData.date >= month_start,
            ProductionData.granularity == DataGranularity.DAILY,
        )
        result = await db.execute(stmt)
        month_wh = result.scalar()
        stats["this_month_kwh"] = round(month_wh / 1000, 2) if month_wh else 0

        # This year
        stmt = select(func.sum(ProductionData.value)).where(
            ProductionData.usage_point_id == pdl,
            ProductionData.date >= year_start,
            ProductionData.granularity == DataGranularity.DAILY,
        )
        result = await db.execute(stmt)
        year_wh = result.scalar()
        stats["this_year_kwh"] = round(year_wh / 1000, 2) if year_wh else 0

        return stats

    async def _get_tempo_data(self, db: AsyncSession) -> dict[str, Any] | None:
        """Get Tempo data"""
        from ...models.tempo_day import TempoDay

        today = date.today()
        tomorrow = today + timedelta(days=1)

        # TempoDay.id est la date au format YYYY-MM-DD (même clé que l'exporteur Home Assistant)
        # Get today's color
        stmt = select(TempoDay).where(TempoDay.id == today.isoformat())
        result = await db.execute(stmt)
        today_row = result.scalar_one_or_none()

        # Get tomorrow's color
        stmt = select(TempoDay).where(TempoDay.id == tomorrow.isoformat())
        result = await db.execute(stmt)
        tomorrow_row = result.scalar_one_or_none()

        if not today_row and not tomorrow_row:
            return None

        # Calculate remaining days for current season
        # Tempo season: Sept 1 to Aug 31
        month = today.month
        season_start = date(today.year if month >= 9 else today.year - 1, 9, 1)
        season_end = date(today.year + 1 if month >= 9 else today.year, 8, 31)

        # Count used days by color
        stmt = select(TempoDay.color, func.count(TempoDay.id)).where(
            TempoDay.id >= season_start.isoformat(),
            TempoDay.id <= today.isoformat(),
        ).group_by(TempoDay.color)
        result = await db.execute(stmt)
        used = {_color_name(row[0]): row[1] for row in result.all()}

        remaining = {
            "blue": TEMPO_QUOTAS["BLUE"] - used.get("BLUE", 0),
            "white": TEMPO_QUOTAS["WHITE"] - used.get("WHITE", 0),
            "red": TEMPO_QUOTAS["RED"] - used.get("RED", 0),
        }

        return {
            "today": {
                "color": _color_name(today_row.color) if today_row else "UNKNOWN",
                "date": today.isoformat(),
            },
            "tomorrow": {
                "color": _color_name(tomorrow_row.color) if tomorrow_row else "UNKNOWN",
                "date": tomorrow.isoformat(),
            },
            "remaining": remaining,
            "season": f"{season_start.year}/{season_end.year}",
        }

    async def _get_ecowatt_data(self, db: AsyncSession) -> dict[str, Any] | None:
        """Get EcoWatt data"""
        from ...models.ecowatt import EcoWatt

        today = date.today()
        now = datetime.now()

        # Get today's signal (un signal par jour, `periode` = minuit du jour prévu)
        stmt = (
            select(EcoWatt)
            .where(func.date(EcoWatt.periode) == today)
            .order_by(EcoWatt.generation_datetime.desc())
            .limit(1)
        )
        result = await db.execute(stmt)
        signal = result.scalar_one_or_none()

        if not signal:
            return None

        # Parse hourly values if available (24 valeurs, index = heure)
        hourly_values = signal.values or []
        current_level = signal.dvalue
        current_hour = now.hour

        # Get current hour level if available
        if hourly_values and len(hourly_values) > current_hour:
            current_level = hourly_values[current_hour]

        # Get next hour level
        next_hour_level = None
        if hourly_values and len(hourly_values) > current_hour + 1:
            next_hour_level = hourly_values[current_hour + 1]

        return {
            "date": today.isoformat(),
            "level": current_level,
            "level_label": {1: "Vert", 2: "Orange", 3: "Rouge"}.get(current_level, "Inconnu"),
            "next_hour_level": next_hour_level,
            "message": signal.message,
            "timestamp": datetime.now().isoformat(),
        }

    async def read_metrics(self, usage_point_ids: list[str] | None = None) -> dict[str, Any]:
        """Read metrics from MQTT broker

        Note: MQTT doesn't support reading back messages unless they are retained.
        This connects to the broker and subscribes to topics to read retained messages.

        Args:
            usage_point_ids: Optional list of PDL numbers to filter

        Returns:
            Dict with metrics read from broker
        """
        metrics: list[dict[str, Any]] = []
        errors: list[str] = []

        try:
            # Topics to subscribe to
            topics = [
                f"{self.topic_prefix}/+/consumption/+",
                f"{self.topic_prefix}/+/production/+",
                f"{self.topic_prefix}/tempo/#",
                f"{self.topic_prefix}/ecowatt/#",
                f"{self.topic_prefix}/status",
            ]

            async with await self._get_mqtt_client() as client:
                # Subscribe to all topics
                for topic in topics:
                    await client.subscribe(topic, qos=self.qos)

                # Read retained messages (wait up to 2 seconds)
                import asyncio
                try:
                    async with asyncio.timeout(2.0):
                        async for message in client.messages:
                            topic_str = str(message.topic)
                            try:
                                payload = json.loads(message.payload.decode())
                            except Exception:
                                payload = message.payload.decode()

                            # Determine category from topic
                            category = "Autre"
                            pdl = None
                            if "/consumption/" in topic_str:
                                category = "Consommation"
                                parts = topic_str.split("/")
                                if len(parts) >= 2:
                                    pdl = parts[1]
                            elif "/production/" in topic_str:
                                category = "Production"
                                parts = topic_str.split("/")
                                if len(parts) >= 2:
                                    pdl = parts[1]
                            elif "/tempo" in topic_str:
                                category = "Tempo"
                            elif "/ecowatt" in topic_str:
                                category = "EcoWatt"
                            elif "/status" in topic_str:
                                category = "Statut"

                            # Filter by PDL if specified
                            if usage_point_ids and pdl and pdl not in usage_point_ids:
                                continue

                            metrics.append({
                                "category": category,
                                "topic": topic_str,
                                "value": payload,
                                "pdl": pdl,
                                "retained": True,
                            })
                except asyncio.TimeoutError:
                    pass  # Expected - we just want to read retained messages

            return {
                "success": True,
                "message": f"Lu {len(metrics)} message(s) depuis le broker",
                "metrics": metrics,
                "errors": errors,
                "broker": f"{self.broker}:{self.port}",
                "topic_prefix": self.topic_prefix,
            }

        except Exception as e:
            logger.error(f"[MQTT] Failed to read metrics: {e}")
            return {
                "success": False,
                "message": f"Erreur de connexion: {str(e)}",
                "metrics": [],
                "errors": [str(e)],
                "broker": f"{self.broker}:{self.port}",
            }
