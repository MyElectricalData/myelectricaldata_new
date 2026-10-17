"""Tests unitaires pour l'export de la puissance maximale quotidienne (Pmax) vers Home Assistant."""

from datetime import date, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.services.statistics import StatisticsService
from src.services.exporters.home_assistant import HomeAssistantExporter

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

        pdl_result = MagicMock()
        pdl_result.scalar_one_or_none.return_value = 6
        db.execute.return_value = pdl_result

        yesterday = date.today() - timedelta(days=1)
        stats.get_max_power_history.return_value = {
            yesterday: {"va": 6510, "kva": 6.51, "time": "12:50"}
        }

        exporter = HomeAssistantExporter(
            config={"mqtt_enabled": True, "mqtt_broker": "localhost", "prefix": "myelectricaldata"}
        )

        with patch.object(exporter, "_publish_sensor_old_format", new_callable=AsyncMock) as mock_pub_sensor, \
             patch.object(exporter, "_publish_binary_sensor", new_callable=AsyncMock) as mock_pub_binary:

            count = await exporter._export_max_power_sensor(client, stats, db, PRM)

            assert count == 2  # 1 sensor + 1 binary sensor
            mock_pub_sensor.assert_called_once()
            call_kwargs = mock_pub_sensor.call_args.kwargs
            assert call_kwargs["name"] == "max power"
            assert call_kwargs["state"] == 6510
            assert call_kwargs["unit"] == "VA"
            assert call_kwargs["device_class"] == "apparent_power"
            assert call_kwargs["attributes"]["is_over_subscribed"] is True
            assert call_kwargs["attributes"]["value_kva"] == 6.51

            mock_pub_binary.assert_called_once()
            bin_call_kwargs = mock_pub_binary.call_args.kwargs
            assert bin_call_kwargs["name"] == "max power over subscribed"
            assert bin_call_kwargs["is_on"] is True
            assert bin_call_kwargs["device_class"] == "problem"
