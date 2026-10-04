"""Callback de consentement Data Connect v2 : Enedis renvoie autorisation_id SANS code (MED-14).

Mesuré en prod le 05/10/2026 : `/oauth/callback?autorisation_id=58249&state=…`.
"""

from unittest.mock import AsyncMock
from urllib.parse import parse_qs, urlparse

import httpx
from fastapi import FastAPI

from src.models.database import get_db
from src.routers import oauth


def make_app(monkeypatch) -> FastAPI:
    app = FastAPI()
    app.include_router(oauth.router)
    app.dependency_overrides[get_db] = lambda: None
    # Utilisateur non connecté : la route doit rediriger vers le login en gardant les paramètres
    monkeypatch.setattr(oauth, "get_current_user_optional", AsyncMock(return_value=None))
    return app


async def call(app: FastAPI, query: str) -> httpx.Response:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.get(f"/oauth/callback?{query}", follow_redirects=False)


async def test_callback_v2_sans_code_accepte(monkeypatch):
    response = await call(make_app(monkeypatch), "autorisation_id=58249&state=abc")

    assert response.status_code == 307
    redirect = parse_qs(urlparse(response.headers["location"]).query)["redirect"][0]
    assert parse_qs(urlparse(redirect).query) == {"autorisation_id": ["58249"]}


async def test_callback_v1_inchange(monkeypatch):
    response = await call(make_app(monkeypatch), "code=xyz&usage_point_id=99999999999991")

    redirect = parse_qs(urlparse(response.headers["location"]).query)["redirect"][0]
    assert parse_qs(urlparse(redirect).query) == {"code": ["xyz"], "usage_point_id": ["99999999999991"]}
