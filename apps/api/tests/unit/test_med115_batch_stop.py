"""MED-115 : arrêter tout le batch sur un refus d'accès ou de quota Enedis."""

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.routers import enedis as router
from tests.unit import test_enedis_fin_exclue as harnais
from tests.unit.test_enedis_fin_exclue import (
    PRM,
    days,
    enedis_http_error,
    j,
    points_of,
    raw_call,
    served_days,
)


cache = harnais.cache
enedis = harnais.enedis
BATCHS = pytest.mark.parametrize("nature", ["consumption", "production"], ids=["conso", "prod"])


@pytest.fixture
def espions_dates(monkeypatch: pytest.MonkeyPatch) -> SimpleNamespace:
    """Observer la blacklist même quand le faux cache n'a pas de client Redis."""
    espions = SimpleNamespace(
        increment=AsyncMock(return_value=1),
        blacklist=AsyncMock(),
        verification=AsyncMock(return_value=False),
    )
    monkeypatch.setattr(router, "increment_date_fail_count", espions.increment)
    monkeypatch.setattr(router, "blacklist_date", espions.blacklist)
    monkeypatch.setattr(router, "is_date_blacklisted", espions.verification)
    return espions


@BATCHS
@pytest.mark.parametrize("statut", [401, 403, 429])
@pytest.mark.parametrize("en_value_error", [False, True], ids=["http", "value_error"])
@pytest.mark.parametrize("avec_cache", [False, True], ids=["sans_lectures", "lectures_en_cache"])
async def test_batch_refus_http_arrete_toutes_les_semaines_sans_blacklist(
    enedis, cache, espions_dates, nature, statut, en_value_error, avec_cache
):
    """Un 401, 403 ou 429 arrête conso et prod au premier appel, sans pénaliser les dates ni succès propre."""
    enedis.rejected_before = j(0)
    enedis.rejected_status = statut
    enedis.rejected_as_value_error = en_value_error
    # Une date déjà en échec exposerait aussi la blacklist au prochain incrément.
    espions_dates.increment.return_value = 6
    if avec_cache:
        cache.store[f"{nature}:detail:daily:{PRM}:{j(28)}"] = {
            "readings": [
                {"v": "300", "d": f"{j(28)} {h:02d}:{m:02d}:00", "p": "PT30M"}
                for h in range(24)
                for m in (0, 30)
            ],
            "expected_count": 48,
        }

    response = await raw_call(getattr(router, f"get_{nature}_detail_batch"), j(28), j(7), avec_cache)

    assert len(enedis.calls) == 1, "Le refus doit interrompre aussi les semaines suivantes"
    espions_dates.increment.assert_not_called()
    espions_dates.blacklist.assert_not_called()
    assert not response.success or (
        avec_cache and response.error is not None and response.error.code == "PARTIAL_DATA"
    ), "Un refus Enedis ne doit pas devenir un succès propre"
    if response.success:
        assert len(points_of(response.data)) == 48
        assert served_days(response.data) == [j(28)]


@BATCHS
@pytest.mark.parametrize("en_exception", [False, True], ids=["reponse", "exception"])
async def test_batch_no_data_found_blackliste_la_semaine_sans_reessai(
    enedis, cache, espions_dates, monkeypatch, nature, en_exception
):
    """no_data_found garde la blacklist de la plage, en réponse métier comme en exception."""
    async def sans_donnees(pdl, start, end, token):
        enedis.calls.append((nature, start, end))
        if en_exception:
            raise ValueError("no_data_found: aucune mesure")
        return {"error": "no_data_found"}

    monkeypatch.setattr(enedis, f"get_{nature}_detail", sans_donnees)

    response = await raw_call(getattr(router, f"get_{nature}_detail_batch"), j(21), j(14))

    assert len(enedis.calls) == 1
    assert not response.success
    assert [appel.args for appel in espions_dates.blacklist.await_args_list] == [
        (PRM, jour) for jour in days(j(21), j(14))
    ]
    espions_dates.increment.assert_not_called()


@BATCHS
async def test_batch_adam_err0123_avance_le_debut_puis_sert_les_mesures(
    enedis, cache, espions_dates, monkeypatch, nature
):
    """ADAM-ERR0123 conserve les essais au jour suivant jusqu'à la mise en service."""
    original = getattr(enedis, f"get_{nature}_detail")

    async def avant_activation(pdl, start, end, token):
        if start < j(19):
            enedis.calls.append((nature, start, end))
            return {"error": "ADAM-ERR0123", "error_description": "anterior to meter activation"}
        return await original(pdl, start, end, token)

    monkeypatch.setattr(enedis, f"get_{nature}_detail", avant_activation)

    response = await raw_call(getattr(router, f"get_{nature}_detail_batch"), j(21), j(14))

    assert [appel[1:] for appel in enedis.calls] == [(j(21), j(14)), (j(20), j(14)), (j(19), j(14))]
    assert [appel.args for appel in espions_dates.increment.await_args_list] == [(PRM, j(21)), (PRM, j(20))]
    espions_dates.blacklist.assert_not_called()
    assert response.success
    assert served_days(response.data) == days(j(19), j(14))


@BATCHS
async def test_batch_erreur_500_reste_retentee(enedis, cache, espions_dates, monkeypatch, nature):
    """Une indisponibilité HTTP 500 reste retentée, contrairement aux refus d'accès et de quota."""
    async def indisponible(pdl, start, end, token):
        enedis.calls.append((nature, start, end))
        raise enedis_http_error(500, False)

    monkeypatch.setattr(enedis, f"get_{nature}_detail", indisponible)

    response = await raw_call(getattr(router, f"get_{nature}_detail_batch"), j(21), j(14))

    assert len(enedis.calls) > 1
    assert not response.success
