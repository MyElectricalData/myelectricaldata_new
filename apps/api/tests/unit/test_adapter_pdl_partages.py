"""Adaptateur passerelle et PDL partagés (MED-112) : X-Impersonate-User-Id pour les seuls appels
Enedis d'un PDL partagé, lecture de /admin/shared-pdls, quota reconnu en impersonation aussi."""

import httpx
import pytest

from src.adapters.myelectricaldata import MyElectricalDataAdapter, RateLimitExceededError

OWN = "11111111111111"
SHARED = "17167149025362"
OWNER = "owner-uuid-1"
OK = {"success": True, "data": {"grandeur": [{"points": []}]}}


@pytest.fixture
def gateway(monkeypatch):
    """Adaptateur branché sur une fausse passerelle qui garde chaque requête reçue."""
    seen: list[httpx.Request] = []
    replies: dict[str, dict] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json=replies.get(request.url.path, OK))

    adapter = MyElectricalDataAdapter()
    adapter.client_secret = "secret"
    adapter.base_url = "https://gw.test/api"
    adapter._client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    adapter.set_shared_owners({SHARED: OWNER})
    return adapter, seen, replies


@pytest.mark.asyncio
async def test_pdl_partage_appele_en_impersonation(gateway):
    adapter, seen, _ = gateway
    await adapter.get_consumption_daily(SHARED, "2026-01-01", "2026-01-31")
    await adapter.get_production_detail(SHARED, "2026-01-01", "2026-01-07")
    await adapter.get_consumption_max_power(SHARED, "2026-01-01", "2026-01-31")
    await adapter.get_contract(SHARED)
    await adapter.get_address(SHARED)

    assert len(seen) == 5
    assert all(r.headers.get("X-Impersonate-User-Id") == OWNER for r in seen)


@pytest.mark.asyncio
async def test_pdl_propre_jamais_en_impersonation(gateway):
    adapter, seen, _ = gateway
    await adapter.get_consumption_daily(OWN, "2026-01-01", "2026-01-31")
    await adapter.get_contract(OWN)
    await adapter.get_usage_points()

    assert seen and all("X-Impersonate-User-Id" not in r.headers for r in seen)


@pytest.mark.asyncio
async def test_contribution_jamais_au_nom_du_proprietaire(gateway):
    adapter, seen, _ = gateway
    await adapter._make_request("POST", f"/contribute/{SHARED}", json_data={})
    assert "X-Impersonate-User-Id" not in seen[-1].headers


@pytest.mark.asyncio
async def test_retrait_de_la_selection(gateway):
    adapter, seen, _ = gateway
    adapter.set_shared_owners({})
    await adapter.get_consumption_daily(SHARED, "2026-01-01", "2026-01-31")
    assert "X-Impersonate-User-Id" not in seen[-1].headers


@pytest.mark.asyncio
async def test_liste_des_pdl_partages(gateway):
    adapter, seen, replies = gateway
    replies["/api/admin/shared-pdls"] = {
        "success": True,
        "data": {"pdls": [{"usage_point_id": SHARED, "owner_id": OWNER, "owner_email": "o@x.fr"}], "total": 1, "users_count": 1},
    }
    pdls = await adapter.get_shared_pdls()
    assert [(p["usage_point_id"], p["owner_id"]) for p in pdls] == [(SHARED, OWNER)]
    assert "X-Impersonate-User-Id" not in seen[-1].headers


@pytest.mark.asyncio
async def test_liste_vide_si_reponse_inattendue(gateway):
    adapter, _, replies = gateway
    replies["/api/admin/shared-pdls"] = {"success": False, "error": {"code": "X"}}
    assert await adapter.get_shared_pdls() == []


@pytest.mark.asyncio
async def test_quota_reconnu_en_impersonation(gateway):
    adapter, seen, replies = gateway
    replies[f"/api/enedis/consumption/daily/{SHARED}"] = {
        "success": False, "error": {"code": "RATE_LIMIT_EXCEEDED", "message": "Quota journalier atteint"},
    }
    with pytest.raises(RateLimitExceededError):
        await adapter.get_consumption_daily(SHARED, "2026-01-01", "2026-01-31")
    assert seen[-1].headers.get("X-Impersonate-User-Id") == OWNER
