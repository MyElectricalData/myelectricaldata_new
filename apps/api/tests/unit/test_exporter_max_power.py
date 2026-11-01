"""Tests unitaires pour l'export de la puissance maximale quotidienne (Pmax) vers Home Assistant."""

from datetime import date, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.services.statistics import StatisticsService
from src.services.exporters.home_assistant import HomeAssistantExporter
from src.services.exporters.mqtt import MQTTExporter
from src.services.exporters.tariff import TariffProfile

PRM = "99999999999991"


class TestStatisticsMaxPower:
    @pytest.mark.asyncio
    async def test_get_max_power_day_from_table(self):
        db = AsyncMock()
        stats = StatisticsService(db)

        mock_result = MagicMock()
        mock_result.first.return_value = (5820, "19:42")
        db.execute.return_value = mock_result

        kva, interval_start = await stats.get_max_power_day(PRM, date(2026, 10, 1), "consumption")
        assert kva == 5.82
        assert interval_start == "19:42"

    @pytest.mark.asyncio
    async def test_get_max_power_history(self):
        db = AsyncMock()
        stats = StatisticsService(db)

        row1 = MagicMock()
        row1.date = date(2026, 9, 29)
        row1.value = 4680
        row1.interval_start = "13:03"

        row2 = MagicMock()
        row2.date = date(2026, 9, 30)
        row2.value = 6510
        row2.interval_start = "12:50"

        mock_scalars = MagicMock()
        mock_scalars.all.return_value = [row1, row2]
        mock_result = MagicMock()
        mock_result.scalars.return_value = mock_scalars
        db.execute.return_value = mock_result

        history = await stats.get_max_power_history(PRM, date(2026, 9, 29), date(2026, 9, 30))
        assert len(history) == 2
        assert history[date(2026, 9, 29)]["va"] == 4680
        assert history[date(2026, 9, 29)]["kva"] == 4.68
        assert history[date(2026, 9, 29)]["time"] == "13:03"
        assert history[date(2026, 9, 30)]["va"] == 6510
        assert history[date(2026, 9, 30)]["kva"] == 6.51


class TestHomeAssistantMaxPowerSensor:
    @pytest.mark.asyncio
    async def test_export_max_power_sensor_publishes_mqtt(self):
        client = AsyncMock()
        stats = AsyncMock()
        db = AsyncMock()

        yesterday = date.today() - timedelta(days=1)
        stats.get_max_power_history.return_value = {
            yesterday: {"va": 6510, "kva": 6.51, "time": "12:50"}
        }

        exporter = HomeAssistantExporter(
            config={"mqtt_enabled": True, "mqtt_broker": "localhost", "prefix": "myelectricaldata"}
        )

        with patch.object(exporter, "_get_pdl_contract_info", AsyncMock(return_value=(TariffProfile("BASE"), [], 6))), \
             patch.object(exporter, "_publish_sensor_old_format", new_callable=AsyncMock) as mock_pub_sensor, \
             patch.object(exporter, "_publish_binary_sensor", new_callable=AsyncMock) as mock_pub_binary:

            count = await exporter._export_max_power_sensor(client, stats, db, PRM)

            assert count == 2  # 1 sensor + 1 binary sensor
            mock_pub_sensor.assert_called_once()
            call_kwargs = mock_pub_sensor.call_args.kwargs
            assert call_kwargs["name"] == exporter._entity_name("max_power")
            assert call_kwargs["state"] == 6510
            assert call_kwargs["unit"] == "VA"
            assert call_kwargs["device_class"] == "apparent_power"
            assert call_kwargs["attributes"]["is_over_subscribed"] is True
            assert call_kwargs["attributes"]["value_kva"] == 6.51

            mock_pub_binary.assert_called_once()
            bin_call_kwargs = mock_pub_binary.call_args.kwargs
            assert bin_call_kwargs["name"] == exporter._entity_name("max_power_over")
            assert bin_call_kwargs["is_on"] is True
            assert bin_call_kwargs["device_class"] == "problem"


class TestSubscribedPowerFromContract:
    """La puissance souscrite vient du contrat Enedis synchronisé (ContractData), comme le reste des
    exporters, et non du champ du PDL qui peut être périmé (revue Codex MED-100)"""

    @staticmethod
    def contract_db() -> AsyncMock:
        """Fausse session : 6 kVA au contrat, 9 kVA sur le PDL ; profil du contrat lu par la vraie méthode"""
        db = AsyncMock()

        async def execute(query):
            sql = str(query).lower()
            res = MagicMock()
            if "contract_data" in sql:
                res.first.return_value = SimpleNamespace(subscribed_power=6, pricing_option="BASE", offpeak_hours=None)
            else:
                res.first.return_value = SimpleNamespace(
                    subscribed_power=9, pricing_option="BASE", offpeak_hours=None, selected_offer_id=None,
                )
            return res

        db.execute = AsyncMock(side_effect=execute)
        return db

    @staticmethod
    def history() -> dict:
        return {date.today() - timedelta(days=1): {"va": 7000, "kva": 7.0, "time": "19:00"}}

    @pytest.mark.asyncio
    async def test_home_assistant_binary_sensor_on_above_contract_power(self):
        exporter = HomeAssistantExporter(config={"mqtt_broker": "localhost", "prefix": "myelectricaldata"})
        stats = AsyncMock()
        stats.get_max_power_history.return_value = self.history()
        db = self.contract_db()

        with patch.object(exporter, "_publish_sensor_old_format", new_callable=AsyncMock) as pub, \
             patch.object(exporter, "_publish_binary_sensor", new_callable=AsyncMock) as pub_bin:
            await exporter._export_max_power_sensor(AsyncMock(), stats, db, PRM)

        assert (await exporter._get_pdl_contract_info(db, PRM))[2] == 6
        assert pub.call_args.kwargs["attributes"]["is_over_subscribed"] is True
        assert pub_bin.call_args.kwargs["is_on"] is True

    @pytest.mark.asyncio
    async def test_mqtt_max_power_over_contract_power(self):
        exporter = MQTTExporter({"broker": "localhost"})
        db = self.contract_db()

        with patch("src.services.statistics.StatisticsService.get_max_power_history", AsyncMock(return_value=self.history())):
            payload = await exporter._get_max_power_stats(db, PRM)

        assert payload is not None
        assert payload["subscribed_power_kva"] == 6
        assert payload["is_over_subscribed"] is True
        assert payload["load_ratio_percent"] == 116.7
