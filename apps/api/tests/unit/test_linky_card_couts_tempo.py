"""Carte Linky (linky-card) : coûts par jour d'une offre Tempo

L'offre Tempo n'a ni hc_price ni hp_price mais 6 prix (couleur × HC/HP) : dailyweek_cost, dailyweek_costHC
et dailyweek_costHP restaient à -1 et daily_cost à 0. Chaque demi-heure est maintenant comptée au prix
de la couleur de son jour Tempo (de 6 h à 6 h le lendemain).
"""

from datetime import date, timedelta
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.services.exporters.home_assistant import HomeAssistantExporter
from src.services.exporters.tariff import tariff_profile

PDL = "12345678901234"
PRICES = {"blue_hc": 0.1, "blue_hp": 0.2, "white_hc": 0.3, "white_hp": 0.4, "red_hc": 0.5, "red_hp": 0.6}
YESTERDAY = date.today() - timedelta(days=1)
DAY_BEFORE = YESTERDAY - timedelta(days=1)


class Stats:
    """StatisticsService factice : 2 jours de données, 1 kWh de 4 h à 5 h (HC) et 1 kWh de 10 h à 11 h (HP)"""

    def __init__(self) -> None:
        self.get_daily_totals_range = AsyncMock(return_value={DAY_BEFORE: 2000, YESTERDAY: 2000})
        records = []
        for day in (DAY_BEFORE, YESTERDAY):
            # Demi-heures de 1000 W, soit 0,5 kWh chacune
            records += [(day, "04:00", 1000), (day, "04:30", 1000), (day, "10:00", 1000), (day, "10:30", 1000)]
        self.get_detailed_range = AsyncMock(return_value=records)
        self.get_hp_hc_year_total = AsyncMock(return_value=(2000, 2000))

    def __getattr__(self, name: str) -> Any:
        return AsyncMock(return_value=0)


def make_exporter(colors: dict[date, str]) -> tuple[HomeAssistantExporter, dict[str, Any]]:
    exporter = HomeAssistantExporter.__new__(HomeAssistantExporter)
    exporter.config = {}
    exporter.prefix = "myelectricaldata"
    exporter.discovery_prefix = "homeassistant"
    exporter.entity_language = "fr"
    # HC de 22 h à 6 h (minutes depuis minuit)
    exporter._get_pdl_contract_info = AsyncMock(return_value=(tariff_profile("TEMPO"), [(1320, 360)], 9))
    exporter._get_pdl_prices = AsyncMock(return_value=dict(PRICES))
    published: dict[str, Any] = {}

    async def publish(client, **kwargs):
        published.update(kwargs.get("attributes") or {})

    exporter._publish_sensor_old_format = AsyncMock(side_effect=publish)

    offer = MagicMock()
    offer.first.return_value = SimpleNamespace(offer_type="TEMPO", base_price=None, hc_price=None, hp_price=None)
    tempo = MagicMock()
    tempo.all.return_value = [(d.isoformat(), SimpleNamespace(value=c)) for d, c in colors.items()]
    exporter._db = SimpleNamespace(execute=AsyncMock(side_effect=[offer, tempo]))
    return exporter, published


@pytest.mark.asyncio
async def test_couts_tempo_par_couleur_et_jour_tempo() -> None:
    # Avant-hier rouge, hier bleu ; la veille d'avant-hier blanche (de 0 h à 6 h d'avant-hier)
    colors = {DAY_BEFORE - timedelta(days=1): "WHITE", DAY_BEFORE: "RED", YESTERDAY: "BLUE"}
    exporter, attrs = make_exporter(colors)

    await exporter._export_linky_card_stats(MagicMock(), Stats(), exporter._db, PDL)

    cost = attrs["dailyweek_cost"].split(",")
    cost_hc = attrs["dailyweek_costHC"].split(",")
    cost_hp = attrs["dailyweek_costHP"].split(",")
    # Hier (le plus récent en premier) : HC de 4 h au prix rouge (jour Tempo d'avant-hier), HP de 10 h au prix bleu
    assert (cost_hc[0], cost_hp[0], cost[0]) == ("0.5", "0.2", "0.7")
    # Avant-hier : HC de 4 h au prix blanc (veille), HP de 10 h au prix rouge
    assert (cost_hc[1], cost_hp[1], cost[1]) == ("0.3", "0.6", "0.9")
    assert attrs["daily_cost"] == 0.7
    assert attrs["yesterday_HC"] == 1.0 and attrs["yesterday_HP"] == 1.0


@pytest.mark.asyncio
async def test_couleur_inconnue_cout_a_moins_un() -> None:
    # Couleur de la veille d'avant-hier inconnue : le coût d'avant-hier n'est pas calculable
    colors = {DAY_BEFORE: "RED", YESTERDAY: "BLUE"}
    exporter, attrs = make_exporter(colors)

    await exporter._export_linky_card_stats(MagicMock(), Stats(), exporter._db, PDL)

    assert attrs["dailyweek_cost"].split(",")[:2] == ["0.7", "-1"]
    assert attrs["dailyweek_HC"].split(",")[:2] == ["1.0", "1.0"]  # l'énergie HC/HP reste publiée
