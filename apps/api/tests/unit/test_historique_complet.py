"""Mode client : tout l'historique local est servi, la passerelle n'est sollicitée que dans sa fenêtre (MED-64).

La base locale garde plus de 3 ans (import V1, MED-60), alors qu'Enedis ne sert que 36 mois de
journalier et 24 mois de courbe de charge : la passerelle répond DATE_TOO_OLD au-delà. Les routes
du client lisent donc la base sans borne, mais ne comblent les trous via la passerelle que dans la
fenêtre de la synchro (MAX_DAILY_DAYS, MAX_DETAILED_DAYS).
"""

from datetime import date, timedelta
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.routers import enedis_client
from src.services.sync import MAX_DAILY_DAYS, MAX_DETAILED_DAYS

PRM = "99999999999991"
TODAY = date.today()
DAILY_WINDOW = TODAY - timedelta(days=MAX_DAILY_DAYS)
DETAIL_WINDOW = TODAY - timedelta(days=MAX_DETAILED_DAYS)
ANCIEN = date(2019, 3, 1)
EMPTY = {"success": True, "data": {}}


@pytest.fixture
def service(monkeypatch):
    service = MagicMock()
    monkeypatch.setattr(enedis_client, "LocalDataService", lambda db: service)
    monkeypatch.setattr(enedis_client, "verify_pdl_ownership", AsyncMock(return_value=True))
    monkeypatch.setattr(enedis_client, "_detail_chunk_backoff", {})
    # Mise en service inconnue : seule la fenêtre de la passerelle borne les plages (borne de la PR #189)
    monkeypatch.setattr(enedis_client, "get_activation_date", AsyncMock(return_value=None))
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


def _calls(mock: AsyncMock) -> list[tuple[str, str]]:
    return [(c.args[1], c.args[2]) for c in mock.await_args_list]


def _missing(window: date) -> list[tuple[date, date]]:
    """Un trou ancien, un trou à cheval sur la fenêtre, un trou récent (fin exclue)."""
    return [
        (ANCIEN, ANCIEN + timedelta(days=30)),
        (window - timedelta(days=10), window + timedelta(days=10)),
        (TODAY - timedelta(days=5), TODAY),
    ]


def _expected(window: date) -> list[tuple[str, str]]:
    return [
        (window.isoformat(), (window + timedelta(days=10)).isoformat()),
        ((TODAY - timedelta(days=5)).isoformat(), TODAY.isoformat()),
    ]


@pytest.mark.parametrize(
    ("route", "local", "gateway"),
    [
        (enedis_client.get_consumption_daily, "get_consumption_daily", "get_consumption_daily"),
        (enedis_client.get_production_daily, "get_production_daily", "get_production_daily"),
    ],
)
async def test_journalier_lit_tout_l_historique_et_borne_la_passerelle(service, adapter, route, local, gateway):
    ancien = {"v": "12000", "d": ANCIEN.isoformat()}
    setattr(service, local, AsyncMock(return_value=([ancien], _missing(DAILY_WINDOW))))

    response = await route(
        usage_point_id=PRM, start=ANCIEN.isoformat(), end=TODAY.isoformat(),
        use_cache=True, current_user=MagicMock(), db=MagicMock(),
    )

    assert response.success
    assert _calls(getattr(adapter, gateway)) == _expected(DAILY_WINDOW)
    assert ancien in response.data["grandeur"][0]["points"]


async def test_journalier_entierement_hors_fenetre_ne_sollicite_pas_la_passerelle(service, adapter):
    service.get_consumption_daily = AsyncMock(return_value=([], [(ANCIEN, ANCIEN + timedelta(days=30))]))

    response = await enedis_client.get_consumption_daily(
        usage_point_id=PRM, start=ANCIEN.isoformat(), end=(ANCIEN + timedelta(days=30)).isoformat(),
        use_cache=True, current_user=MagicMock(), db=MagicMock(),
    )

    assert response.success
    adapter.get_consumption_daily.assert_not_awaited()


@pytest.mark.parametrize(
    ("route", "local", "gateway"),
    [
        (enedis_client.get_consumption_detail_batch, "get_consumption_detail", "get_consumption_detail"),
        (enedis_client.get_production_detail_batch, "get_production_detail", "get_production_detail"),
    ],
)
async def test_courbe_de_charge_lit_tout_l_historique_et_borne_la_passerelle(service, adapter, route, local, gateway):
    ancien = {"v": "1000", "d": f"{ANCIEN.isoformat()} 00:00:00"}
    setattr(service, local, AsyncMock(return_value=([ancien], _missing(DETAIL_WINDOW))))

    response = await route(
        usage_point_id=PRM, start=ANCIEN.isoformat(), end=TODAY.isoformat(),
        use_cache=True, current_user=MagicMock(), db=MagicMock(),
    )

    assert response.success
    # Chunks de 7 jours : seuls ceux de la fenêtre de 730 jours partent vers la passerelle
    calls = _calls(getattr(adapter, gateway))
    assert calls, "les trous récents doivent être comblés"
    assert min(start for start, _ in calls) == DETAIL_WINDOW.isoformat()
    assert ancien in response.data["grandeur"][0]["points"]


async def test_puissance_max_borne_la_passerelle_a_la_fenetre_du_journalier(service, adapter):
    service.get_max_power = AsyncMock(side_effect=[
        ([], _missing(DAILY_WINDOW)),
        ([{"v": "6100", "d": f"{ANCIEN.isoformat()} 18:42:00"}], []),
    ])
    service.save_max_power = AsyncMock()

    data = await enedis_client._max_power_data(MagicMock(), PRM, ANCIEN.isoformat(), TODAY.isoformat(), use_cache=True)

    assert _calls(adapter.get_consumption_max_power) == _expected(DAILY_WINDOW)
    assert data["grandeur"][0]["points"] == [{"v": "6100", "d": f"{ANCIEN.isoformat()} 18:42:00"}]
