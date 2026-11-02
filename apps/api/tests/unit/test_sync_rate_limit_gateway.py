"""Quota de la passerelle tel qu'elle le renvoie réellement (issue #115, revue de la PR #137).

Sur /api/enedis/*, la passerelle ne répond pas 429 : `check_rate_limit` (routers/enedis.py)
renvoie un HTTP 200 dont le corps porte `success: false` et le code RATE_LIMIT_EXCEEDED.
Et un quota atteint sur un type de données doit arrêter la synchro du PDL entier,
pas seulement la boucle de ce type.
"""

from datetime import date
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.adapters.myelectricaldata import MyElectricalDataAdapter, RateLimitExceededError
from src.models.client_mode import SyncStatus, SyncStatusType
from src.services.sync import SyncService

PRM = "12345678901234"

# Corps exact de check_rate_limit (routers/enedis.py), servi en HTTP 200
QUOTA_BODY = {
    "success": False,
    "data": None,
    "error": {
        "code": "RATE_LIMIT_EXCEEDED",
        "message": "Daily rate limit exceeded (50/50). Use cache to increase limit.",
    },
}


def make_adapter(status_code: int, body: dict) -> MyElectricalDataAdapter:
    adapter = MyElectricalDataAdapter()
    adapter._ensure_authenticated = AsyncMock(return_value="token")
    response = MagicMock()
    response.status_code = status_code
    response.json.return_value = body
    response.raise_for_status = MagicMock()
    client = AsyncMock()
    client.request = AsyncMock(return_value=response)
    adapter.get_client = AsyncMock(return_value=client)
    return adapter


@pytest.mark.asyncio
async def test_adapter_detects_quota_served_as_http_200() -> None:
    adapter = make_adapter(200, QUOTA_BODY)

    with pytest.raises(RateLimitExceededError):
        await adapter._make_request("GET", f"/enedis/consumption/daily/{PRM}")


@pytest.mark.asyncio
async def test_adapter_keeps_other_gateway_errors_as_responses() -> None:
    """Un refus qui n'est pas un quota (PDL inconnu…) reste une réponse, sans exception."""
    body = {"success": False, "data": None, "error": {"code": "PDL_NOT_FOUND", "message": "x"}}
    adapter = make_adapter(200, body)

    assert await adapter._make_request("GET", f"/enedis/consumption/daily/{PRM}") == body


@pytest.mark.asyncio
async def test_adapter_keeps_partial_cached_data_served_at_quota() -> None:
    """PARTIAL_DATA porte le cache partiel servi au quota : à enregistrer, pas à jeter."""
    body = {
        "success": True,
        "data": {"interval_reading": []},
        "error": {"code": "PARTIAL_DATA", "message": "Rate limit exceeded. Returning cached data only."},
    }
    adapter = make_adapter(200, body)

    assert await adapter._make_request("GET", f"/enedis/consumption/detail/{PRM}") == body


@pytest.mark.asyncio
async def test_sync_pdl_stops_every_data_type_after_first_quota() -> None:
    db = MagicMock()
    exec_result = MagicMock()
    exec_result.scalar_one_or_none.return_value = None  # PDL absent : actif par défaut, sans production
    exec_result.fetchall.return_value = []
    db.execute = AsyncMock(return_value=exec_result)
    db.commit = AsyncMock()
    db.rollback = AsyncMock()
    db.refresh = AsyncMock()

    service = SyncService.__new__(SyncService)
    service.db = db
    service.adapter = MagicMock()
    service._should_refresh_metadata = AsyncMock(return_value=False)
    service._daily_upsert_is_effective = AsyncMock(return_value=False)
    service._find_missing_ranges = AsyncMock(return_value=[(date(2026, 1, 1), date(2026, 1, 3))])
    service._get_or_create_sync_status = AsyncMock(
        side_effect=lambda upid, dtype, gran: SyncStatus(
            usage_point_id=upid, data_type=dtype, granularity=gran, status=SyncStatusType.PENDING
        )
    )
    service.adapter.get_consumption_daily = AsyncMock(side_effect=RateLimitExceededError("quota"))
    service.adapter.get_consumption_detail = AsyncMock(return_value={"success": True, "data": None})
    service.adapter.get_consumption_max_power = AsyncMock(return_value={"success": True, "data": None})

    result = await service.sync_pdl(PRM)

    assert result["consumption_daily"].startswith("rate_limited")
    service.adapter.get_consumption_detail.assert_not_called()
    service.adapter.get_consumption_max_power.assert_not_called()
    assert result["consumption_detail"] == "skipped (rate limited)"
    assert result["max_power"] == "skipped (rate limited)"


def make_sync_all_service(usage_point_ids: list[str]) -> SyncService:
    service = SyncService.__new__(SyncService)
    service.db = MagicMock()
    service.adapter = MagicMock()
    service.adapter.get_usage_points = AsyncMock(
        return_value={"usage_points": [{"usage_point_id": upid} for upid in usage_point_ids]}
    )
    # base simulée sans méthodes async : le volet PDL partagés (MED-112) est testé à part
    service._sync_all_shared = AsyncMock()
    return service


@pytest.mark.asyncio
async def test_sync_all_skips_remaining_pdls_once_account_quota_is_reached() -> None:
    """Le quota de la passerelle est compté par compte : inutile d'essayer les PDL suivants."""
    service = make_sync_all_service([PRM, "98765432109876"])
    service.sync_pdl = AsyncMock(
        return_value={"usage_point_id": PRM, "consumption_daily": "rate_limited: quota"}
    )

    results = await service.sync_all()

    service.sync_pdl.assert_awaited_once_with(PRM)
    assert results["success"] is False
    assert results["pdls"]["98765432109876"] == {"skipped": "rate limited"}


@pytest.mark.asyncio
async def test_sync_all_waits_for_midnight_utc_after_quota() -> None:
    """Le passage suivant du planificateur ne rappelle pas la passerelle avant minuit UTC."""
    service = make_sync_all_service([PRM])
    service.sync_pdl = AsyncMock(
        return_value={"usage_point_id": PRM, "contract": "rate_limited: quota"}
    )
    await service.sync_all()
    service.sync_pdl.reset_mock()
    service.adapter.get_usage_points.reset_mock()

    results = await service.sync_all()

    service.adapter.get_usage_points.assert_not_called()
    service.sync_pdl.assert_not_called()
    assert results["success"] is False
    assert "minuit UTC" in results["errors"][0]["error"]
