"""Export Home Assistant : attributs au format V1 lus par content-card-linky (#190)

La carte découpe les clés de `forecast` pour en faire les classes CSS `ecowatt-00` à `ecowatt-23`
(largeur de chaque case horaire) et affiche `days_*` de `tempo_info` tels quels.
"""

from datetime import date, datetime
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.services.exporters import home_assistant
from src.services.exporters.home_assistant import HomeAssistantExporter

NOW = datetime(2026, 10, 28, 8, 0)
TODAY = NOW.date()


class FrozenDate(date):
    @classmethod
    def today(cls) -> date:
        return TODAY


class FrozenDatetime(datetime):
    @classmethod
    def now(cls, tz=None) -> datetime:  # type: ignore[override]
        return NOW


@pytest.fixture(autouse=True)
def frozen_clock(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(home_assistant, "date", FrozenDate)
    monkeypatch.setattr(home_assistant, "datetime", FrozenDatetime)


class Result:
    def __init__(self, one: Any = None):
        self._one = one

    def scalar_one_or_none(self) -> Any:
        return self._one


async def _export_ecowatt(values: list[Any]) -> dict[str, dict]:
    exporter = HomeAssistantExporter({"mqtt_broker": "mqtt.local"})
    published: dict[str, dict] = {}

    async def capture(client, *, topic, state=None, attributes=None, **kwargs):
        published[topic] = {"state": state, "attributes": attributes or {}}

    exporter._publish_sensor_old_format = capture
    signal = SimpleNamespace(dvalue=2, message="Système électrique tendu", values=values)
    db = MagicMock()
    db.execute = AsyncMock(return_value=Result(one=signal))

    await exporter._export_ecowatt(MagicMock(), db)
    return published


async def test_ecowatt_forecast_cles_format_v1():
    values: list[Any] = [1] * 24
    values[8], values[19] = 2, 3
    values[23] = None
    attributes = (await _export_ecowatt(values))["myelectricaldata_rte/ecowatt_j0"]["attributes"]

    forecast = attributes["forecast"]
    assert list(forecast) == [f"{hour:02d} h" for hour in range(24)]
    assert (forecast["00 h"], forecast["08 h"], forecast["19 h"]) == (1, 2, 3)
    assert forecast["23 h"] == "Pas de valeur"
    # Même découpage que la carte : `ecowatt-00` à `ecowatt-23`
    assert {key.replace("h", "").replace("min", "").strip() for key in forecast} == {
        f"{hour:02d}" for hour in range(24)
    }
    # Valeurs brutes toujours publiées pour les autres usages
    assert attributes["hourly_values"] == values
    assert attributes["current_hour_value"] == 2


def test_tempo_days_text_format_v1():
    assert HomeAssistantExporter._tempo_days_text({"remaining": 288, "quota": 300}) == "288 / 300"
    assert HomeAssistantExporter._tempo_days_text({}) == "0 / 0"
