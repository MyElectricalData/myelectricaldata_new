"""Tests unitaires de la gestion du quota Enedis / rate limiting (HTTP 429) et de la résilience métadonnées.

Couvre l'issue #115 :
- Réponse 429 lors de la synchronisation de l'énergie ou des métadonnées
- Détection et suspension de la synchro jusqu'après minuit UTC
- Résilience de l'adresse et du contrat face à des réponses vides / None
- Statut global 'success: False' lorsqu'un rate limit ou une erreur survient
"""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import httpx

from src.adapters.myelectricaldata import MyElectricalDataAdapter, RateLimitExceededError
from src.models.client_mode import AddressData, ContractData, ConsumptionData, DataGranularity, SyncStatus, SyncStatusType
from src.services.sync import SyncService, _next_midnight_utc

PRM = "12345678901234"


def make_service() -> tuple[SyncService, MagicMock]:
    db = MagicMock()
    exec_result = MagicMock()
    exec_result.scalar.return_value = "NULLS NOT DISTINCT"
    exec_result.scalar_one_or_none.return_value = None
    exec_result.fetchall.return_value = []
    db.execute = AsyncMock(return_value=exec_result)
    db.commit = AsyncMock()
    db.rollback = AsyncMock()
    db.refresh = AsyncMock()
    db.add = MagicMock()

    service = SyncService.__new__(SyncService)
    service.db = db
    service.adapter = MagicMock()
    return service, db



def test_next_midnight_utc_is_in_future() -> None:
    midnight = _next_midnight_utc()
    now = datetime.now(UTC)
    assert midnight > now
    assert midnight.hour == 0
    assert midnight.minute == 0
    assert midnight.second == 0


@pytest.mark.asyncio
async def test_adapter_make_request_raises_rate_limit_exceeded_error_on_429() -> None:
    adapter = MyElectricalDataAdapter()
    adapter.client_secret = "test-secret"
    mock_client = AsyncMock()
    mock_response = MagicMock()
    mock_response.status_code = 429
    mock_response.text = '{"detail": "Rate limit exceeded: 50/50 requests today"}'
    mock_response.json.return_value = {"detail": "Rate limit exceeded: 50/50 requests today"}
    mock_response.headers = {"Retry-After": "3600"}
    error = httpx.HTTPStatusError("Too Many Requests", request=MagicMock(), response=mock_response)
    mock_response.raise_for_status.side_effect = error
    mock_client.request = AsyncMock(return_value=mock_response)
    adapter.get_client = AsyncMock(return_value=mock_client)

    with pytest.raises(RateLimitExceededError) as exc_info:
        await adapter._make_request("GET", "/test")

    assert "Rate limit exceeded (HTTP 429)" in str(exc_info.value)
    assert exc_info.value.retry_after == 3600


@pytest.mark.asyncio
async def test_sync_address_handles_none_and_unreadable_gracefully() -> None:
    service, db = make_service()
    # Cas où la passerelle renvoie None ou data: None
    service.adapter.get_address = AsyncMock(return_value={"success": True, "data": None})

    # Ne doit pas lever de TypeError: argument of type 'NoneType' is not iterable
    await service._sync_address(PRM)
    db.add.assert_not_called()


@pytest.mark.asyncio
async def test_sync_energy_data_stops_and_sets_midnight_on_rate_limit() -> None:
    service, db = make_service()

    sync_status = SyncStatus(
        usage_point_id=PRM,
        data_type="consumption",
        granularity=DataGranularity.DAILY,
        status=SyncStatusType.RUNNING,
    )
    service._get_or_create_sync_status = AsyncMock(return_value=sync_status)
    service._find_missing_ranges = AsyncMock(return_value=[(datetime(2026, 1, 1).date(), datetime(2026, 1, 3).date())])

    async def mock_fetch(*args, **kwargs):
        raise RateLimitExceededError("Rate limit exceeded: 50/50 requests today")

    synced = await service._sync_energy_data(
        usage_point_id=PRM,
        data_type="consumption",
        granularity=DataGranularity.DAILY,
        max_days=30,
        fetch_func=mock_fetch,
        model_class=ConsumptionData,
    )

    assert synced == 0
    assert sync_status.status == SyncStatusType.FAILED
    assert "Quota journalier atteint" in sync_status.error_message or "Rate limit" in sync_status.error_message
    assert sync_status.next_sync_at is not None
    assert sync_status.next_sync_at > datetime.now(UTC)


@pytest.mark.asyncio
async def test_sync_all_reports_success_false_when_pdl_rate_limited() -> None:
    service, db = make_service()
    service.adapter.get_usage_points = AsyncMock(return_value={"usage_points": [{"usage_point_id": PRM}]})

    service.sync_pdl = AsyncMock(return_value={
        "usage_point_id": PRM,
        "contract": "success",
        "address": "success",
        "consumption_daily": "rate_limited: Rate limit exceeded (HTTP 429)",
        "consumption_detail": "skipped (rate limited)",
        "max_power": "skipped (rate limited)",
        "production_daily": "skipped (no production)",
        "production_detail": "skipped (no production)",
    })

    results = await service.sync_all()

    assert results["success"] is False
    assert len(results["errors"]) == 1
    assert results["errors"][0]["pdl"] == PRM
    assert "rate_limited" in results["errors"][0]["error"]
