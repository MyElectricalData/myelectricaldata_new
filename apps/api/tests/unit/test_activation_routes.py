"""Mode client : les 7 lectures de l'interface ne demandent rien à la passerelle avant la mise en service (#188).

test_sync_debut_contrat.py teste _after_activation seul ; ici chaque route est appelée avec une date de
mise en service au milieu de la fenêtre Enedis, et seule la date du bon type (consommation ou production)
est connue : une route non câblée, ou câblée sur le mauvais type, redemande les semaines d'avant.
"""

from datetime import date, timedelta
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.routers import enedis_client

PRM = "99999999999991"
TODAY = date.today()
ACTIVATION = TODAY - timedelta(days=20)
ANCIEN = date(2019, 3, 1)
EMPTY = {"success": True, "data": {}}

# Un trou hors fenêtre, un trou à cheval sur la mise en service, un trou récent (fin exclue)
MISSING = [
    (ANCIEN, ANCIEN + timedelta(days=30)),
    (TODAY - timedelta(days=30), TODAY - timedelta(days=10)),
    (TODAY - timedelta(days=5), TODAY),
]


def _activation_for(data_type: str) -> AsyncMock:
    return AsyncMock(side_effect=lambda db, prm, kind: ACTIVATION if kind == data_type else None)


@pytest.fixture
def service(monkeypatch):
    service = MagicMock()
    monkeypatch.setattr(enedis_client, "LocalDataService", lambda db: service)
    monkeypatch.setattr(enedis_client, "verify_pdl_ownership", AsyncMock(return_value=True))
    monkeypatch.setattr(enedis_client, "_detail_chunk_backoff", {})
    return service


@pytest.fixture
def adapter(monkeypatch):
    adapter = MagicMock(
        get_consumption_daily=AsyncMock(return_value=EMPTY),
        get_production_daily=AsyncMock(return_value=EMPTY),
        get_consumption_detail=AsyncMock(return_value=EMPTY),
        get_production_detail=AsyncMock(return_value=EMPTY),
        get_consumption_max_power=AsyncMock(return_value=EMPTY),
    )
    monkeypatch.setattr(enedis_client, "get_med_adapter", lambda: adapter)
    return adapter


def _starts(mock: AsyncMock) -> list[str]:
    return [c.args[1] for c in mock.await_args_list]


@pytest.mark.parametrize(
    ("route", "local", "gateway", "data_type"),
    [
        (enedis_client.get_consumption_daily, "get_consumption_daily", "get_consumption_daily", "consumption"),
        (enedis_client.get_production_daily, "get_production_daily", "get_production_daily", "production"),
        (enedis_client.get_consumption_detail, "get_consumption_detail", "get_consumption_detail", "consumption"),
        (enedis_client.get_production_detail, "get_production_detail", "get_production_detail", "production"),
        (enedis_client.get_consumption_detail_batch, "get_consumption_detail", "get_consumption_detail", "consumption"),
        (enedis_client.get_production_detail_batch, "get_production_detail", "get_production_detail", "production"),
    ],
)
async def test_route_ne_demande_rien_avant_la_mise_en_service(
    monkeypatch, service, adapter, route, local, gateway, data_type
):
    monkeypatch.setattr(enedis_client, "get_activation_date", _activation_for(data_type))
    setattr(service, local, AsyncMock(return_value=([], MISSING)))

    response = await route(
        usage_point_id=PRM, start=ANCIEN.isoformat(), end=TODAY.isoformat(),
        use_cache=True, current_user=MagicMock(), db=MagicMock(),
    )

    assert response.success
    starts = _starts(getattr(adapter, gateway))
    assert starts, "les trous postérieurs à la mise en service doivent être comblés"
    assert min(starts) == ACTIVATION.isoformat()


async def test_puissance_max_ne_demande_rien_avant_la_mise_en_service(monkeypatch, service, adapter):
    monkeypatch.setattr(enedis_client, "get_activation_date", _activation_for("consumption"))
    service.get_max_power = AsyncMock(side_effect=[([], MISSING), ([], [])])
    service.save_max_power = AsyncMock()

    await enedis_client._max_power_data(MagicMock(), PRM, ANCIEN.isoformat(), TODAY.isoformat(), use_cache=True)

    assert _starts(adapter.get_consumption_max_power) == [
        ACTIVATION.isoformat(),
        (TODAY - timedelta(days=5)).isoformat(),
    ]
