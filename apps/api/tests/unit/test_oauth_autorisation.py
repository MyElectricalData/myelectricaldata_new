"""Callback de consentement Data Connect v2 : autorisation_id → PRM (MED-14)."""

from unittest.mock import AsyncMock

from src.routers import oauth


async def test_autorisation_id_resolue_en_prm(monkeypatch):
    adapter = AsyncMock()
    adapter.get_client_credentials_token.return_value = {"access_token": "jeton"}
    adapter.get_usage_points_from_authorization.return_value = ["99999999999991"]
    monkeypatch.setattr(oauth, "enedis_adapter", adapter)

    assert await oauth.resolve_autorisation_id("123456789") == ["99999999999991"]
    adapter.get_usage_points_from_authorization.assert_awaited_once_with(123456789, "jeton")


async def test_autorisation_id_invalide_sans_appel_enedis(monkeypatch):
    adapter = AsyncMock()
    monkeypatch.setattr(oauth, "enedis_adapter", adapter)

    assert await oauth.resolve_autorisation_id("abc;drop") == []
    adapter.get_client_credentials_token.assert_not_awaited()
