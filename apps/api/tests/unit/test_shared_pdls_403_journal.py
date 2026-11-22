"""Compte ordinaire et /admin/shared-pdls (MED-112) : le 403 attendu n'est pas journalisé en ERROR.

La passerelle ne partage des PDL qu'avec ses comptes admin : pour tous les autres, le 403 est le cas
normal. Il reste levé (l'écran de choix l'affiche), mais noté en INFO au lieu de trois lignes
ERROR / WARNING qui font croire à une panne de la passerelle.
"""

import logging
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from fastapi import HTTPException

from src.adapters.myelectricaldata import MyElectricalDataAdapter
from src.routers import sync as sync_router


def _adapter(status: int) -> MyElectricalDataAdapter:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(status, json={"detail": "Access denied: users permission required"})

    adapter = MyElectricalDataAdapter()
    adapter.client_secret = "secret"
    adapter.base_url = "https://gw.test/api"
    adapter._client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    adapter._ensure_authenticated = AsyncMock(return_value="token")  # type: ignore[method-assign]
    return adapter


@pytest.mark.parametrize("status", [401, 403])
async def test_refus_des_partages_leve_sans_erreur_journalisee(caplog, status):
    adapter = _adapter(status)
    with caplog.at_level(logging.INFO, logger="src.adapters.myelectricaldata"):
        with pytest.raises(httpx.HTTPStatusError):
            await adapter.get_shared_pdls()

    assert not [r for r in caplog.records if r.levelno >= logging.WARNING]
    assert any(f"HTTP {status}" in r.getMessage() for r in caplog.records)


async def test_autre_erreur_toujours_en_error(caplog):
    """Une vraie panne (500) sur un autre appel reste une ERROR."""
    adapter = _adapter(500)
    with caplog.at_level(logging.INFO, logger="src.adapters.myelectricaldata"):
        with pytest.raises(httpx.HTTPStatusError):
            await adapter.get_usage_points()

    assert any(r.levelno == logging.ERROR for r in caplog.records)


def _status_error(status: int) -> httpx.HTTPStatusError:
    request = httpx.Request("GET", "https://gw.test/api/admin/shared-pdls")
    return httpx.HTTPStatusError("refus", request=request, response=httpx.Response(status, request=request))


async def test_route_compte_non_admin_en_info(caplog):
    with patch.object(sync_router.SyncService, "list_shared_choices", AsyncMock(side_effect=_status_error(403))):
        with caplog.at_level(logging.INFO, logger="src.routers.sync"):
            with pytest.raises(HTTPException) as exc:
                await sync_router.list_shared_pdls(db=None)  # type: ignore[arg-type]

    assert exc.value.status_code == 403
    assert not [r for r in caplog.records if r.levelno >= logging.WARNING]
    assert any("non administrateur" in r.getMessage() for r in caplog.records)


async def test_route_passerelle_injoignable_toujours_signalee(caplog):
    with patch.object(sync_router.SyncService, "list_shared_choices", AsyncMock(side_effect=_status_error(502))):
        with caplog.at_level(logging.INFO, logger="src.routers.sync"):
            with pytest.raises(HTTPException) as exc:
                await sync_router.list_shared_pdls(db=None)  # type: ignore[arg-type]

    assert exc.value.status_code == 502
    assert any(r.levelno == logging.WARNING for r in caplog.records)
