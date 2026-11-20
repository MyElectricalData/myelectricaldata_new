"""Consentement qui renvoie un PDL déjà lié au même compte (#206).

Enedis ne consent qu'un PDL à la fois, mais l'autorisation peut aussi renvoyer les PDL déjà
liés, et un renouvellement renvoie le PDL lui-même. Un PDL déjà lié à CE compte est conservé
et les autres sont créés ; un PDL d'un autre compte reste refusé.
"""

from types import SimpleNamespace
from unittest.mock import AsyncMock
from urllib.parse import parse_qs, urlparse

import httpx
from fastapi import FastAPI

from src.models import PDL
from src.models.database import get_db
from src.routers import enedis as enedis_router
from src.routers import oauth

PDL_A = "11111111111111"
PDL_B = "22222222222222"


class FakeDb:
    """Base minimale : PDL existants par usage_point_id, PDL ajoutés mémorisés."""

    def __init__(self, existing: dict[str, str]) -> None:
        self.existing = {upid: SimpleNamespace(user_id=owner) for upid, owner in existing.items()}
        self.added: list[PDL] = []
        self.flush = AsyncMock()
        self.commit = AsyncMock()

    async def execute(self, statement):
        upid = next(iter(statement.compile().params.values()))
        found = self.existing.get(upid)
        return SimpleNamespace(scalars=lambda: SimpleNamespace(first=lambda: found))

    def add(self, obj) -> None:
        self.added.append(obj)


async def call(monkeypatch, db: FakeDb, query: str) -> dict[str, list[str]]:
    app = FastAPI()
    app.include_router(oauth.router)
    app.dependency_overrides[get_db] = lambda: db
    user = SimpleNamespace(id="moi", email="moi@test")
    monkeypatch.setattr(oauth, "get_current_user_optional", AsyncMock(return_value=user))
    monkeypatch.setattr(enedis_router, "get_valid_token", AsyncMock(return_value=None))
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(f"/oauth/callback?{query}", follow_redirects=False)
    assert response.status_code == 307
    return parse_qs(urlparse(response.headers["location"]).query)


async def test_pdl_deja_lie_conserve_et_nouveau_cree(monkeypatch):
    db = FakeDb({PDL_A: "moi"})
    params = await call(monkeypatch, db, f"code=x&usage_point_id={PDL_A};{PDL_B}")

    assert params["consent_success"] == ["true"]
    assert params["created_count"] == ["1"]
    assert [p.usage_point_id for p in db.added] == [PDL_B]
    db.commit.assert_awaited_once()


async def test_renouvellement_du_meme_pdl_accepte(monkeypatch):
    db = FakeDb({PDL_B: "moi"})
    params = await call(monkeypatch, db, f"code=x&usage_point_id={PDL_B}")

    assert params["consent_success"] == ["true"]
    assert params["created_count"] == ["0"]
    assert db.added == []


async def test_pdl_d_un_autre_compte_toujours_refuse(monkeypatch):
    db = FakeDb({PDL_A: "quelqu_un_d_autre"})
    params = await call(monkeypatch, db, f"code=x&usage_point_id={PDL_A};{PDL_B}")

    assert params["consent_error"] == ["pdl_already_exists"]
    assert params["pdl"] == [PDL_A]
    db.commit.assert_not_awaited()
