"""La liste des contributions en attente renvoie les variantes de puissance (MED-86).

`GET /energy/contributions/pending` omettait `power_variants` : une contribution au nouveau format
(une variante par puissance, avec son abonnement et ses prix) arrivait sans aucun prix, et le champ
legacy `power_kva` y est `None`. Un modérateur, humain ou agent, ne pouvait donc pas juger l'offre
depuis cette route. Le champ doit être présent pour tout élément de la liste, `None` pour une
contribution au format legacy.
"""
from collections.abc import AsyncIterator
from types import SimpleNamespace

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from src.models import ContributionMessage, EnergyOffer, EnergyProvider, OfferContribution, User
from src.models.base import Base
from src.routers import energy_offers

GRILLE = "https://example.org/grille.pdf"

VARIANTES = [
    {"power_kva": 6, "subscription_price": 12.5, "pricing_data": {"base_price": 0.2516}},
    {"power_kva": 9, "subscription_price": 16.1, "pricing_data": {"base_price": 0.2516}},
]


@pytest.fixture
async def db() -> AsyncIterator[AsyncSession]:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    tables = [
        User.__table__,
        EnergyProvider.__table__,
        EnergyOffer.__table__,
        OfferContribution.__table__,
        ContributionMessage.__table__,
    ]
    async with engine.begin() as conn:
        await conn.run_sync(lambda sync: Base.metadata.create_all(sync, tables=tables))
    async with async_sessionmaker(engine, expire_on_commit=False)() as session:
        yield session
    await engine.dispose()


@pytest.fixture(autouse=True)
def sans_notification(monkeypatch: pytest.MonkeyPatch) -> None:
    async def rien(*_args: object, **_kwargs: object) -> None:
        return None

    for nom in ("send_contribution_notification", "send_batch_contribution_notification", "send_batch_approval_notification"):
        monkeypatch.setattr(energy_offers, nom, rien)
    monkeypatch.setattr(energy_offers.slack_service, "send_contribution_notification", rien)
    monkeypatch.setattr(energy_offers.slack_service, "send_batch_contribution_notification", rien)


@pytest.fixture
async def contributeur(db: AsyncSession) -> SimpleNamespace:
    user = User(email="c@example.org", hashed_password="x", client_id="cid", client_secret="s")
    db.add(user)
    await db.commit()
    return SimpleNamespace(id=user.id, email=user.email, is_admin=False, role=None)


def nouvelle_offre(**champs: object) -> dict:
    return {
        "contribution_type": "NEW_OFFER",
        "provider_name": "Plenitude",
        "offer_name": "Eco Base",
        "offer_type": "BASE",
        "price_sheet_url": GRILLE,
        **champs,
    }


async def pending(db: AsyncSession) -> list[dict]:
    reponse = await energy_offers.list_pending_contributions(current_user=SimpleNamespace(), db=db)
    assert reponse.success, reponse.error
    return reponse.data


@pytest.mark.asyncio
async def test_pending_renvoie_les_variantes_de_puissance(db: AsyncSession, contributeur: SimpleNamespace) -> None:
    cree = await energy_offers.create_contribution(nouvelle_offre(power_variants=VARIANTES), current_user=contributeur, db=db)
    assert cree.success, cree.error

    [element] = await pending(db)

    assert element["power_variants"] == VARIANTES
    assert element["power_kva"] is None


@pytest.mark.asyncio
async def test_pending_garde_la_cle_a_none_pour_le_format_legacy(db: AsyncSession, contributeur: SimpleNamespace) -> None:
    cree = await energy_offers.create_contribution(
        nouvelle_offre(power_kva=6, pricing_data={"subscription_price": 12.5, "base_price": 0.2516}),
        current_user=contributeur,
        db=db,
    )
    assert cree.success, cree.error

    [element] = await pending(db)

    assert "power_variants" in element
    assert element["power_variants"] is None
    assert element["power_kva"] == 6
