"""Offres aux prix saisis à la main (mode client)

Un contrat dont les prix ne sont pas dans la base des offres (grille souscrite avant la grille
actuelle…) : l'utilisateur saisit son abonnement et ses prix du kWh. L'offre est rangée sous un
fournisseur réservé et doit survivre à la synchro, qui supprime ce qui n'existe pas sur la passerelle.
"""

import uuid
from collections.abc import AsyncIterator
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from src.models import Base, EnergyOffer, EnergyProvider, PDL
from src.routers import energy_offers
from src.routers.energy_offers import (
    CustomOfferRequest,
    create_custom_offer,
    delete_custom_offer,
    list_offers,
    update_custom_offer,
)
from src.services.custom_offers import CUSTOM_PROVIDER_ID, CUSTOM_PROVIDER_NAME
from src.services.sync import SyncService

USER = SimpleNamespace(id="user-1")
ZEN_FIXE_JANVIER = {
    "name": "Zen Fixe (janvier 2026)",
    "offer_type": "HC_HP",
    "power_kva": 6,
    "subscription_price": Decimal("18.36"),
    "hc_price": Decimal("0.1493"),
    "hp_price": Decimal("0.1885"),
}


@pytest.fixture
async def db(tmp_path) -> AsyncIterator[AsyncSession]:
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'client.db'}")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.execute(
            text("INSERT INTO users (id, email, hashed_password, client_id, client_secret, is_active, is_admin, "
                 "email_verified, debug_mode, admin_data_sharing) "
                 "VALUES ('user-1', 'client@example.org', 'x', 'cid', 'x', true, false, true, false, false)")
        )
    async with async_sessionmaker(engine, expire_on_commit=False)() as session:
        yield session
    await engine.dispose()


async def test_creation_offre_hc_hp_sous_le_fournisseur_reserve(db):
    response = await create_custom_offer(CustomOfferRequest(**ZEN_FIXE_JANVIER), current_user=USER, db=db)

    assert response.success
    offer = response.data
    assert offer["provider_id"] == CUSTOM_PROVIDER_ID
    assert offer["offer_type"] == "HC_HP"
    assert offer["power_kva"] == 6
    assert (offer["subscription_price"], offer["hc_price"], offer["hp_price"]) == (
        Decimal("18.36"), Decimal("0.1493"), Decimal("0.1885"))
    assert offer["base_price"] is None
    provider = await db.get(EnergyProvider, CUSTOM_PROVIDER_ID)
    assert provider.name == CUSTOM_PROVIDER_NAME

    # Elle apparaît dans la liste des offres, comme les offres de la passerelle
    listed = await list_offers(provider_id=None, include_history=False, db=db)
    assert [o["id"] for o in listed.data] == [offer["id"]]


async def test_modification_et_changement_de_type(db):
    created = (await create_custom_offer(CustomOfferRequest(**ZEN_FIXE_JANVIER), current_user=USER, db=db)).data

    request = CustomOfferRequest(name="Mon offre Base", offer_type="BASE", power_kva=6,
                                 subscription_price=Decimal("12.50"), base_price=Decimal("0.2082"))
    response = await update_custom_offer(request, offer_id=created["id"], current_user=USER, db=db)

    assert response.success
    assert response.data["name"] == "Mon offre Base"
    assert response.data["base_price"] == Decimal("0.2082")
    # Prix sans objet pour une offre Base : effacés
    assert response.data["hc_price"] is None and response.data["hp_price"] is None


async def test_changement_de_type_recale_l_option_des_pdl(db):
    """L'export HA choisit ses séries (base ou hc/hp) d'après PDL.pricing_option : il doit suivre l'offre."""
    created = (await create_custom_offer(CustomOfferRequest(**ZEN_FIXE_JANVIER), current_user=USER, db=db)).data
    db.add(PDL(id=str(uuid.uuid4()), usage_point_id="12345678901234", user_id="user-1",
               selected_offer_id=created["id"], pricing_option="HC_HP"))
    db.add(PDL(id=str(uuid.uuid4()), usage_point_id="98765432109876", user_id="user-1", pricing_option="HC_HP"))
    await db.commit()

    request = CustomOfferRequest(name="Mon offre Base", offer_type="BASE", power_kva=6,
                                 subscription_price=Decimal("12.50"), base_price=Decimal("0.2082"))
    assert (await update_custom_offer(request, offer_id=created["id"], current_user=USER, db=db)).success

    options = {p.usage_point_id: p.pricing_option for p in (await db.execute(select(PDL))).scalars()}
    # Seul le PDL qui a choisi l'offre change
    assert options == {"12345678901234": "BASE", "98765432109876": "HC_HP"}


async def test_une_offre_de_la_passerelle_n_est_pas_modifiable(db):
    db.add(EnergyProvider(id="edf", name="EDF"))
    db.add(EnergyOffer(id="zen-fixe", provider_id="edf", name="Zen Fixe", offer_type="HC_HP",
                       subscription_price=Decimal("15.86"), hc_price=Decimal("0.165"), hp_price=Decimal("0.2231")))
    await db.commit()

    request = CustomOfferRequest(**ZEN_FIXE_JANVIER)
    assert (await update_custom_offer(request, offer_id="zen-fixe", current_user=USER, db=db)).error.code == "NOT_FOUND"
    assert (await delete_custom_offer(offer_id="zen-fixe", current_user=USER, db=db)).error.code == "NOT_FOUND"
    assert (await db.get(EnergyOffer, "zen-fixe")).hp_price == Decimal("0.2231")


async def test_suppression_retire_l_offre_des_pdl(db):
    created = (await create_custom_offer(CustomOfferRequest(**ZEN_FIXE_JANVIER), current_user=USER, db=db)).data
    db.add(PDL(id=str(uuid.uuid4()), usage_point_id="12345678901234", user_id="user-1", selected_offer_id=created["id"]))
    await db.commit()

    response = await delete_custom_offer(offer_id=created["id"], current_user=USER, db=db)

    assert response.success
    assert await db.get(EnergyOffer, created["id"]) is None
    pdl = (await db.execute(select(PDL))).scalar_one()
    await db.refresh(pdl)
    assert pdl.selected_offer_id is None


@pytest.mark.parametrize(
    "fields",
    [
        {"offer_type": "BASE", "subscription_price": 12},  # prix Base manquant
        {"offer_type": "HC_HP", "subscription_price": 12, "hc_price": 0.15},  # prix HP manquant
        {"offer_type": "TEMPO", "subscription_price": 12},  # type non proposé à la saisie
        {"offer_type": "BASE", "subscription_price": -1, "base_price": 0.2},  # abonnement négatif
        {"offer_type": "BASE", "subscription_price": 12, "base_price": 0},  # prix nul
    ],
)
def test_saisie_invalide_refusee(fields):
    with pytest.raises(ValidationError):
        CustomOfferRequest(**fields)


async def test_routes_absentes_en_mode_serveur(db, monkeypatch):
    monkeypatch.setattr(energy_offers.settings, "SERVER_MODE", True)
    with pytest.raises(HTTPException) as exc:
        await create_custom_offer(CustomOfferRequest(**ZEN_FIXE_JANVIER), current_user=USER, db=db)
    assert exc.value.status_code == 404


async def test_la_synchro_garde_les_offres_saisies(db):
    """Miroir de la passerelle : une offre absente à distance est supprimée, sauf les prix saisis."""
    custom = (await create_custom_offer(CustomOfferRequest(**ZEN_FIXE_JANVIER), current_user=USER, db=db)).data
    db.add(EnergyProvider(id="edf", name="EDF"))
    db.add(EnergyProvider(id="disparu", name="Fournisseur disparu"))
    db.add(EnergyOffer(id="ancienne", provider_id="edf", name="Offre retirée", offer_type="BASE",
                       subscription_price=Decimal("10"), base_price=Decimal("0.2")))
    await db.commit()

    service = SyncService.__new__(SyncService)
    service.db = db
    service.adapter = SimpleNamespace(
        get_energy_providers=AsyncMock(return_value={"success": True, "data": [{"id": "edf", "name": "EDF"}]}),
        get_energy_offers=AsyncMock(return_value={"success": True, "data": []}),
    )

    await service.sync_energy_providers()
    await service.sync_energy_offers()

    assert await db.get(EnergyProvider, CUSTOM_PROVIDER_ID) is not None
    assert await db.get(EnergyOffer, custom["id"]) is not None
    assert await db.get(EnergyOffer, "ancienne") is None
    assert await db.get(EnergyProvider, "disparu") is None


async def test_la_synchro_des_pdl_garde_l_option_d_une_offre_saisie(db):
    """On saisit ses prix parce que le contrat diffère de la passerelle : son option ne doit pas
    être réécrite à chaque démarrage, sinon l'export HA ne trouve plus ses séries."""
    custom = (await create_custom_offer(
        CustomOfferRequest(name="Mon offre Base", offer_type="BASE", power_kva=6,
                           subscription_price=Decimal("12.50"), base_price=Decimal("0.2082")),
        current_user=USER, db=db)).data
    db.add(EnergyProvider(id="edf", name="EDF"))
    db.add(EnergyOffer(id="zen-fixe", provider_id="edf", name="Zen Fixe", offer_type="BASE",
                       subscription_price=Decimal("15.86"), base_price=Decimal("0.1952")))
    db.add(PDL(id=str(uuid.uuid4()), usage_point_id="11111111111111", user_id="user-1",
               selected_offer_id=custom["id"], pricing_option="BASE"))
    db.add(PDL(id=str(uuid.uuid4()), usage_point_id="22222222222222", user_id="user-1",
               selected_offer_id=custom["id"], pricing_option="BASE"))
    # Témoin : offre de la passerelle, la passerelle reste maîtresse de l'option (comportement inchangé)
    db.add(PDL(id=str(uuid.uuid4()), usage_point_id="33333333333333", user_id="user-1",
               selected_offer_id="zen-fixe", pricing_option="BASE"))
    await db.commit()

    service = SyncService.__new__(SyncService)
    service.db = db
    service.adapter = SimpleNamespace(get_usage_points=AsyncMock(return_value={"usage_points": [
        {"usage_point_id": "11111111111111", "pricing_option": "HC_HP"},
        {"usage_point_id": "22222222222222"},  # passerelle sans option
        {"usage_point_id": "33333333333333", "pricing_option": "HC_HP"},
    ]}))

    await service.sync_pdl_list("user-1")

    options = {p.usage_point_id: p.pricing_option for p in (await db.execute(select(PDL))).scalars()}
    assert options == {"11111111111111": "BASE", "22222222222222": "BASE", "33333333333333": "HC_HP"}
