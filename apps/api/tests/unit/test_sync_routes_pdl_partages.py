"""Routes /sync/shared-pdls (MED-112) : une erreur de l'adaptateur ne doit pas se faire passer pour
« PDL déjà au compte » (409) ou « non partagé » (404)."""

from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import BackgroundTasks, HTTPException

from src.routers import sync as sync_router
from src.services.sync import SharedPdlAlreadyOwnedError, SharedPdlNotFoundError, SyncService

PDL_ID = "17167149025362"


@pytest.fixture(autouse=True)
def local_user(monkeypatch):
    monkeypatch.setattr(sync_router, "get_or_create_local_user", AsyncMock(return_value=MagicMock(id="local-user")))


async def select_with(monkeypatch, error: Exception) -> HTTPException:
    monkeypatch.setattr(SyncService, "select_shared_pdl", AsyncMock(side_effect=error))
    with pytest.raises(HTTPException) as caught:
        await sync_router.select_shared_pdl(PDL_ID, BackgroundTasks(), MagicMock())
    return caught.value


@pytest.mark.asyncio
async def test_pdl_deja_au_compte_donne_409(monkeypatch):
    assert (await select_with(monkeypatch, SharedPdlAlreadyOwnedError(PDL_ID))).status_code == 409


@pytest.mark.asyncio
async def test_pdl_non_partage_donne_404(monkeypatch):
    assert (await select_with(monkeypatch, SharedPdlNotFoundError(PDL_ID))).status_code == 404


@pytest.mark.asyncio
@pytest.mark.parametrize("error", [ValueError("MED_CLIENT_SECRET absent"), KeyError("data")])
async def test_autres_erreurs_ne_sont_pas_mappees_en_409_ni_404(monkeypatch, error):
    status = (await select_with(monkeypatch, error)).status_code
    assert status not in (404, 409)
