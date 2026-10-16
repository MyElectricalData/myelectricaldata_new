"""Nouvelle grille d'un fournisseur : clôture de l'ancienne à la veille (MED-53, issue #145).

Le front envoie, pour une nouvelle grille, une contribution NEW_OFFER par puissance et une
UPDATE_OFFER par puissance de l'ancienne grille, qui porte sa date de fin dans
`pricing_data.valid_to`. L'admin approuve une à une (`approve_contribution`) ou en lot
(`bulk_approve_contributions`, aussi utilisé par « Appliquer directement ») : les deux
chemins doivent laisser la même base.
"""
from collections.abc import AsyncIterator, Awaitable, Callable
from datetime import UTC, date, datetime
from types import SimpleNamespace

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from src.models import EnergyOffer, EnergyProvider, OfferContribution, User
from src.models.base import Base
from src.routers import energy_offers

ANCIENNE = datetime(2026, 2, 5, tzinfo=UTC)
NOUVELLE = "2026-08-01"
VEILLE = date(2026, 7, 31)


@pytest.fixture
async def db() -> AsyncIterator[AsyncSession]:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    tables = [User.__table__, EnergyProvider.__table__, EnergyOffer.__table__, OfferContribution.__table__]
    async with engine.begin() as conn:
        await conn.run_sync(lambda sync: Base.metadata.create_all(sync, tables=tables))
    async with async_sessionmaker(engine, expire_on_commit=False)() as session:
        yield session
    await engine.dispose()


@pytest.fixture(autouse=True)
def sans_mail(monkeypatch: pytest.MonkeyPatch) -> None:
    async def rien(*_args: object, **_kwargs: object) -> None:
        return None

    monkeypatch.setattr(energy_offers, "send_batch_approval_notification", rien)


@pytest.fixture
async def enercoop(db: AsyncSession) -> SimpleNamespace:
    """Enercoop en base : BasicWatt 3/6/9 kVA ouverte depuis le 05/02/2026, et une autre offre BASE."""
    contributeur = User(email="c@example.org", hashed_password="x", client_id="cid", client_secret="s")
    fournisseur = EnergyProvider(name="Enercoop")
    db.add_all([contributeur, fournisseur])
    await db.flush()
    basicwatt = {
        kva: EnergyOffer(
            provider_id=fournisseur.id, name="BasicWatt", offer_type="BASE", power_kva=kva,
            subscription_price=10.0 + kva, base_price=0.25, valid_from=ANCIENNE,
        )
        for kva in (3, 6, 9)
    }
    autre = EnergyOffer(
        provider_id=fournisseur.id, name="Coopérative", offer_type="BASE", power_kva=6,
        subscription_price=14.0, base_price=0.27, valid_from=ANCIENNE,
    )
    db.add_all([*basicwatt.values(), autre])
    await db.commit()
    return SimpleNamespace(contributeur=contributeur, fournisseur=fournisseur, basicwatt=basicwatt, autre=autre)


def nouvelle_puissance(base: SimpleNamespace, kva: int, valid_from: str = NOUVELLE, **pricing: object) -> OfferContribution:
    """Contribution NEW_OFFER telle que la construit useOfferSubmission pour une nouvelle puissance."""
    return OfferContribution(
        contributor_user_id=base.contributeur.id, contribution_type="NEW_OFFER",
        existing_provider_id=base.fournisseur.id, offer_name=f"BasicWatt - {kva} kVA", offer_type="BASE",
        power_kva=kva, pricing_data={"subscription_price": 20.0 + kva, "base_price": 0.28, **pricing},
        price_sheet_url="https://example.org/grille.pdf", valid_from=datetime.fromisoformat(valid_from).replace(tzinfo=UTC),
    )


def cloture(base: SimpleNamespace, offre: EnergyOffer, valid_to: str) -> OfferContribution:
    """Contribution UPDATE_OFFER qui ne change que la date de fin d'une offre existante."""
    return OfferContribution(
        contributor_user_id=base.contributeur.id, contribution_type="UPDATE_OFFER",
        existing_provider_id=base.fournisseur.id, existing_offer_id=offre.id, offer_name=offre.name,
        offer_type=offre.offer_type, power_kva=offre.power_kva,
        pricing_data={"subscription_price": offre.subscription_price, "base_price": offre.base_price, "valid_to": valid_to},
        price_sheet_url="https://example.org/grille.pdf", valid_from=offre.valid_from,
    )


Approbation = Callable[[AsyncSession, list[str]], Awaitable[None]]


async def une_par_une(db: AsyncSession, ids: list[str]) -> None:
    admin = SimpleNamespace(id=None, email="admin@example.org")
    for cid in ids:
        reponse = await energy_offers.approve_contribution(cid, current_user=admin, db=db)
        assert reponse.success, reponse.error


async def en_lot(db: AsyncSession, ids: list[str]) -> None:
    admin = SimpleNamespace(id=None, email="admin@example.org")
    reponse = await energy_offers.bulk_approve_contributions({"contribution_ids": ids}, current_user=admin, db=db)
    assert reponse.success, reponse.error
    assert reponse.data["processed"] == len(ids), reponse.data


CHEMINS = [pytest.param(une_par_une, id="unitaire"), pytest.param(en_lot, id="lot")]


async def soumettre(db: AsyncSession, contributions: list[OfferContribution]) -> list[str]:
    db.add_all(contributions)
    await db.commit()
    return [c.id for c in contributions]


async def offres(db: AsyncSession, nom: str) -> dict[tuple[int, date], date | None]:
    """(puissance, début) -> fin, pour toutes les offres d'un nom."""
    db.expire_all()
    lignes = (await db.execute(select(EnergyOffer).where(EnergyOffer.name == nom))).scalars().all()
    return {(o.power_kva, o.valid_from.date()): (o.valid_to.date() if o.valid_to else None) for o in lignes}


@pytest.mark.asyncio
@pytest.mark.parametrize("approuver", CHEMINS)
async def test_import_ia_nouvelle_grille_cloture_l_ancienne_a_la_veille(
    db: AsyncSession, enercoop: SimpleNamespace, approuver: Approbation
) -> None:
    """Scénario de l'issue #145 : 3, 6 et 36 kVA au 01/08, l'ancienne grille 3/6/9 close au 31/07."""
    ajouts = [nouvelle_puissance(enercoop, kva) for kva in (3, 6, 36)]
    clotures = [cloture(enercoop, o, VEILLE.isoformat()) for o in enercoop.basicwatt.values()]
    await approuver(db, await soumettre(db, [*ajouts, *clotures]))

    assert await offres(db, "BasicWatt") == {
        (3, ANCIENNE.date()): VEILLE,
        (6, ANCIENNE.date()): VEILLE,
        (9, ANCIENNE.date()): VEILLE,
        (3, date(2026, 8, 1)): None,
        (6, date(2026, 8, 1)): None,
        (36, date(2026, 8, 1)): None,
    }
    assert await offres(db, "Coopérative") == {(6, ANCIENNE.date()): None}


@pytest.mark.asyncio
@pytest.mark.parametrize("approuver", CHEMINS)
async def test_nouvelle_puissance_seule_ne_ferme_que_la_meme_offre(
    db: AsyncSession, enercoop: SimpleNamespace, approuver: Approbation
) -> None:
    """Contribution manuelle sans clôture : seule la même offre à la même puissance est close, à la veille."""
    await approuver(db, await soumettre(db, [nouvelle_puissance(enercoop, 6)]))

    assert await offres(db, "BasicWatt") == {
        (3, ANCIENNE.date()): None,
        (6, ANCIENNE.date()): VEILLE,
        (9, ANCIENNE.date()): None,
        (6, date(2026, 8, 1)): None,
    }
    assert await offres(db, "Coopérative") == {(6, ANCIENNE.date()): None}


@pytest.mark.asyncio
@pytest.mark.parametrize("approuver", CHEMINS)
async def test_ajout_historique_ne_ferme_rien(
    db: AsyncSession, enercoop: SimpleNamespace, approuver: Approbation
) -> None:
    """Une grille passée (début et fin dans le passé) s'ajoute sans toucher à la grille ouverte."""
    historique = nouvelle_puissance(enercoop, 6, valid_from="2025-02-01", valid_to="2026-02-04")
    await approuver(db, await soumettre(db, [historique]))

    assert await offres(db, "BasicWatt") == {
        (3, ANCIENNE.date()): None,
        (6, ANCIENNE.date()): None,
        (9, ANCIENNE.date()): None,
        (6, date(2025, 2, 1)): date(2026, 2, 4),
    }
