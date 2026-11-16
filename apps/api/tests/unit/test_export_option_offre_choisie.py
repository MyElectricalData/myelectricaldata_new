"""Option tarifaire d'un PDL sans option fournisseur : celle de l'offre choisie dans le client

Quand la passerelle ne donne pas l'option du PDL, l'export prenait le code d'acheminement du
contrat (ou rien) et exportait le PDL en BASE : HC, HP et coûts à -1 sur la carte Linky, même
avec l'offre EDF Tempo choisie. Tempo sans plage HC connue : 22h-6h.
"""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.services.exporters.home_assistant import HomeAssistantExporter
from src.services.exporters.tariff import TariffProfile


def make_exporter() -> HomeAssistantExporter:
    exporter = HomeAssistantExporter.__new__(HomeAssistantExporter)
    exporter.config = {}
    exporter.prefix = "myelectricaldata"
    return exporter


def fake_db(pdl_row: SimpleNamespace | None, contract_row: SimpleNamespace | None, offer_row: SimpleNamespace | None) -> MagicMock:
    """execute() : ligne PDL, ligne ContractData, puis l'offre choisie"""
    results = []
    for value in (pdl_row, contract_row, offer_row):
        result = MagicMock()
        result.first.return_value = value
        results.append(result)
    db = MagicMock()
    db.execute = AsyncMock(side_effect=results)
    return db


def pdl(pricing_option: str | None, offpeak_hours: object = None) -> SimpleNamespace:
    return SimpleNamespace(pricing_option=pricing_option, offpeak_hours=offpeak_hours, subscribed_power=9, selected_offer_id="offre-1")


def contract(pricing_option: str | None, offpeak_hours: object = None) -> SimpleNamespace:
    return SimpleNamespace(pricing_option=pricing_option, offpeak_hours=offpeak_hours, subscribed_power=9)


def offer(offer_type: str, name: str = "Tempo - 9 kVA") -> SimpleNamespace:
    return SimpleNamespace(offer_type=offer_type, name=name, hc_schedules=None)


@pytest.mark.parametrize("contract_option", [None, "", "BTINFMUDT"])
async def test_pdl_sans_option_prend_l_offre_tempo_choisie(contract_option: str | None) -> None:
    """Pas d'option sur le PDL : l'offre Tempo choisie fixe le profil, avec les plages HC du contrat"""
    db = fake_db(pdl(None), contract(contract_option, {"default": "HC (22H30-6H30)"}), offer("TEMPO"))
    profile, ranges, _ = await make_exporter()._get_pdl_contract_info(db, "123")
    assert profile == TariffProfile("TEMPO")
    assert ranges == [(1350, 390)]


async def test_tempo_sans_plage_hc_prend_22h_6h() -> None:
    """Ni le contrat ni le PDL ne donnent de plage : heures creuses de l'option Tempo, 22h-6h"""
    db = fake_db(pdl(None), contract(None, None), offer("TEMPO"))
    profile, ranges, _ = await make_exporter()._get_pdl_contract_info(db, "123")
    assert profile.family == "TEMPO"
    assert ranges == [(22 * 60, 6 * 60)]


async def test_option_tempo_du_pdl_sans_plage_prend_22h_6h() -> None:
    db = fake_db(SimpleNamespace(pricing_option="TEMPO", offpeak_hours=None, subscribed_power=9, selected_offer_id=None), None, None)
    profile, ranges, _ = await make_exporter()._get_pdl_contract_info(db, "123")
    assert profile.family == "TEMPO"
    assert ranges == [(22 * 60, 6 * 60)]


async def test_option_du_pdl_reste_prioritaire_sur_l_offre() -> None:
    """La passerelle donne l'option du PDL : elle reste prioritaire, comme avant"""
    db = fake_db(pdl("HC_HP", {"default": "HC (23H00-7H00)"}), None, offer("TEMPO"))
    profile, ranges, _ = await make_exporter()._get_pdl_contract_info(db, "123")
    assert profile == TariffProfile("HC_HP")
    assert ranges == [(1380, 420)]


async def test_pdl_sans_option_offre_hc_hp() -> None:
    db = fake_db(pdl(None), contract("BTINFMUDT", {"default": "HC (22H00-6H00)"}), offer("HC_HP", "Tarif Bleu HC - 6 kVA"))
    profile, ranges, _ = await make_exporter()._get_pdl_contract_info(db, "123")
    assert profile == TariffProfile("HC_HP")
    assert ranges == [(1320, 360)]


async def test_hc_hp_sans_plage_reste_sans_plage() -> None:
    """Seul Tempo a des heures creuses fixes : une offre HC/HP sans plage connue n'en invente pas"""
    db = fake_db(pdl(None), contract(None, None), offer("HC_HP", "Tarif Bleu HC - 6 kVA"))
    profile, ranges, _ = await make_exporter()._get_pdl_contract_info(db, "123")
    assert profile.family == "HC_HP"
    assert ranges == []
