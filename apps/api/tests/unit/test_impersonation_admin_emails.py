"""Impersonation d'un propriétaire de PDL partagé (MED-112).

/admin/shared-pdls s'ouvre à un e-mail d'ADMIN_EMAILS : l'impersonation doit l'accepter aussi, sinon
le client de l'admin lit la liste puis voit chaque appel retomber sur son propre compte. Le
consentement du propriétaire (admin_data_sharing) reste exigé dans tous les cas.
"""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.middleware import auth as auth_module
from src.middleware.auth import get_impersonation_context


def request(owner_id: str | None) -> MagicMock:
    req = MagicMock()
    req.headers = {"X-Impersonate-User-Id": owner_id} if owner_id else {}
    return req


def user(email: str, *, is_admin: bool = False, role: str | None = None, sharing: bool = False) -> SimpleNamespace:
    return SimpleNamespace(
        id=f"id-{email}", email=email, is_admin=is_admin,
        role=SimpleNamespace(name=role) if role else None, admin_data_sharing=sharing,
    )


def db_returning(target: SimpleNamespace | None) -> AsyncMock:
    result = MagicMock()
    result.scalar_one_or_none.return_value = target
    db = AsyncMock()
    db.execute.return_value = result
    return db


@pytest.fixture(autouse=True)
def admin_emails(monkeypatch):
    monkeypatch.setattr(auth_module.settings, "ADMIN_EMAILS", "Admin@Example.org, autre@example.org")


OWNER = user("owner@example.org", sharing=True)


async def test_admin_par_admin_emails_impersonne() -> None:
    target = await get_impersonation_context(request(OWNER.id), user("admin@example.org"), db_returning(OWNER))
    assert target is OWNER


@pytest.mark.parametrize("admin", [user("x@example.org", is_admin=True), user("y@example.org", role="admin")])
async def test_admin_par_flag_ou_role_impersonne(admin: SimpleNamespace) -> None:
    assert await get_impersonation_context(request(OWNER.id), admin, db_returning(OWNER)) is OWNER


async def test_non_admin_n_impersonne_pas() -> None:
    db = db_returning(OWNER)
    assert await get_impersonation_context(request(OWNER.id), user("lambda@example.org", role="user"), db) is None
    db.execute.assert_not_called()


async def test_sans_consentement_du_proprietaire_rien() -> None:
    refus = user("owner@example.org", sharing=False)
    assert await get_impersonation_context(request(refus.id), user("admin@example.org"), db_returning(refus)) is None


async def test_sans_en_tete_rien() -> None:
    assert await get_impersonation_context(request(None), user("admin@example.org"), db_returning(OWNER)) is None
