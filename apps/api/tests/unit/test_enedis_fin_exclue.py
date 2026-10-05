"""Mode serveur : fin de période EXCLUE, comme dateFin Data Connect 2026 (MED-19).

Un faux Enedis applique la vraie règle (points dans [dateDebut, dateFin[, rien au-delà de J-1)
et un cache en mémoire remplace Redis : les tests décrivent ce que reçoit le client.
"""

from datetime import date, datetime, timedelta
from types import SimpleNamespace
from typing import Any
from zoneinfo import ZoneInfo

import pytest

from src.adapters.demo_adapter import DemoAdapter
from src.adapters.enedis_format import build_measure
from src.routers import enedis as router

PRM = "99999999999991"


def today_paris() -> date:
    return datetime.now(ZoneInfo("Europe/Paris")).date()


def j(n: int) -> str:
    """J-n au format YYYY-MM-DD (j(0) = aujourd'hui, j(1) = hier)."""
    return (today_paris() - timedelta(days=n)).isoformat()


def days(start: str, end: str) -> list[str]:
    """Jours de [start, end[."""
    current, stop = date.fromisoformat(start), date.fromisoformat(end)
    out = []
    while current < stop:
        out.append(current.isoformat())
        current += timedelta(days=1)
    return out


class FakeEnedis:
    """Data Connect 2026 : dateFin exclue, dateDebut < dateFin exigé, données jusqu'à J-1."""

    def __init__(self, published_until: int = 1, pma: str = "5000") -> None:
        self.calls: list[tuple[str, str, str]] = []
        self.published_until = published_until  # dernier jour publié : J-published_until
        self.pma = pma
        self.power_unit = "VA"
        self.holes: set[str] = set()  # jours sans mesure (compteur coupé)

    def _days(self, kind: str, start: str, end: str) -> list[str]:
        self.calls.append((kind, start, end))
        if start >= end:
            raise RuntimeError(f"ADAM-ERR0069 dateDebut {start} >= dateFin {end}")
        last = date.fromisoformat(j(self.published_until))
        return [d for d in days(start, end) if date.fromisoformat(d) <= last and d not in self.holes]

    async def get_consumption_daily(self, pdl: str, start: str, end: str, token: str) -> dict[str, Any]:
        points = [{"v": "1000", "d": d, "p": "P1D"} for d in self._days("daily", start, end)]
        return build_measure(pdl, start, end, points, grandeur_metier="CONS", grandeur_physique="EA", unite="Wh", pas="P1D")

    async def get_consumption_detail(self, pdl: str, start: str, end: str, token: str) -> dict[str, Any]:
        points = [
            {"v": "300", "d": f"{d} {h:02d}:{m:02d}:00", "p": "PT30M"}
            for d in self._days("detail", start, end)
            for h in range(24)
            for m in (0, 30)
        ]
        return build_measure(pdl, start, end, points, grandeur_metier="CONS", grandeur_physique="PA", unite="W")

    async def get_max_power(self, pdl: str, start: str, end: str, token: str) -> dict[str, Any]:
        points = [{"v": self.pma, "d": f"{d} 12:00:00"} for d in self._days("power", start, end)]
        return build_measure(pdl, start, end, points, grandeur_metier="CONS", grandeur_physique="PMA", unite=self.power_unit, pas="P1D")

    async def get_production_daily(self, pdl: str, start: str, end: str, token: str) -> dict[str, Any]:
        points = [{"v": "800", "d": d, "p": "P1D"} for d in self._days("prod_daily", start, end)]
        return build_measure(pdl, start, end, points, grandeur_metier="PROD", grandeur_physique="EA", unite="Wh", pas="P1D")

    async def get_production_detail(self, pdl: str, start: str, end: str, token: str) -> dict[str, Any]:
        points = [{"v": "200", "d": f"{d} 12:00:00", "p": "PT30M"} for d in self._days("prod_detail", start, end)]
        return build_measure(pdl, start, end, points, grandeur_metier="PROD", grandeur_physique="PA", unite="W")


class FakeCache:
    redis_client = None  # liste noire des dates inactive
    ttl = 86400

    def __init__(self) -> None:
        self.store: dict[str, Any] = {}
        self.ttls: dict[str, int | None] = {}

    async def get(self, key: str, encryption_key: str) -> Any:
        return self.store.get(key)

    async def set(self, key: str, value: Any, encryption_key: str, ttl: int | None = None) -> bool:
        self.store[key] = value
        self.ttls[key] = ttl
        return True

    def make_cache_key(self, usage_point_id: str, endpoint: str, **kwargs: Any) -> str:
        return ":".join([usage_point_id, endpoint, *(f"{k}={v}" for k, v in sorted(kwargs.items()))])


@pytest.fixture
def enedis(monkeypatch) -> FakeEnedis:
    fake = FakeEnedis()

    async def adapter_for_user(user):
        return fake, False

    async def valid_token(*args):
        return "token"

    async def rate_limit(*args, **kwargs):
        return True, None

    monkeypatch.setattr(router, "get_adapter_for_user", adapter_for_user)
    monkeypatch.setattr(router, "get_valid_token", valid_token)
    monkeypatch.setattr(router, "check_rate_limit", rate_limit)
    monkeypatch.setattr(router, "get_encryption_key", lambda *args: "key")
    return fake


@pytest.fixture
def cache(monkeypatch) -> FakeCache:
    fake = FakeCache()
    monkeypatch.setattr(router, "cache_service", fake)
    return fake


USER = SimpleNamespace(id="u1", is_admin=False, debug_mode=False, email="test@example.com")
REQUEST = SimpleNamespace(scope={"route": SimpleNamespace(path="/enedis/test")}, url=SimpleNamespace(path="/enedis/test"))


async def call(handler, start: str, end: str, use_cache: bool = False) -> Any:
    response = await raw_call(handler, start, end, use_cache)
    assert response.success, response.error
    return response.data


async def raw_call(handler, start: str, end: str, use_cache: bool = False) -> Any:
    return await handler(
        request=REQUEST,
        usage_point_id=PRM,
        start=start,
        end=end,
        use_cache=use_cache,
        current_user=USER,
        impersonated_user=None,
        db=None,
    )


def points_of(data: dict[str, Any]) -> list[dict[str, Any]]:
    return [p for g in data["grandeur"] for p in g["points"]]


def served_days(data: dict[str, Any]) -> list[str]:
    return sorted({p["d"][:10] for p in points_of(data)})


# --- adjust_date_range ---------------------------------------------------------------------


def test_adjust_date_range_plafonne_la_fin_exclue_a_today():
    assert router.adjust_date_range(j(5), j(-3)) == (j(5), j(0))
    assert router.adjust_date_range(j(5), j(0)) == (j(5), j(0))
    assert router.adjust_date_range(j(5), j(1)) == (j(5), j(1))


def test_adjust_date_range_debut_apres_la_fin_donne_un_jour():
    assert router.adjust_date_range(j(0), j(0)) == (j(1), j(0))
    assert router.adjust_date_range(j(2), j(-1)) == (j(2), j(0))


# --- consommation quotidienne ---------------------------------------------------------------


async def test_quotidien_end_today_sert_j_moins_1(enedis, cache):
    data = await call(router.get_consumption_daily, j(4), j(0))

    assert served_days(data) == [j(4), j(3), j(2), j(1)]
    assert enedis.calls == [("daily", j(4), j(0))]
    assert data["periode"] == {"dateDebut": j(4), "dateFin": j(0)}


async def test_quotidien_end_hier_s_arrete_a_j_moins_2(enedis, cache):
    data = await call(router.get_consumption_daily, j(4), j(1))

    assert served_days(data) == [j(4), j(3), j(2)]


async def test_quotidien_cache_jour_isole_manquant_recupere(enedis, cache):
    for d in (j(4), j(3), j(1)):
        cache.store[f"consumption:daily:{PRM}:{d}"] = {"v": "1000", "d": d, "p": "P1D"}

    data = await call(router.get_consumption_daily, j(4), j(0), use_cache=True)

    assert served_days(data) == [j(4), j(3), j(2), j(1)]
    assert f"consumption:daily:{PRM}:{j(2)}" in cache.store
    assert len(enedis.calls) == 1
    _, api_start, api_end = enedis.calls[0]
    assert api_start <= j(2) < api_end


async def test_quotidien_cache_deux_jours_manquants_recuperes(enedis, cache):
    for d in (j(5), j(2)):
        cache.store[f"consumption:daily:{PRM}:{d}"] = {"v": "1000", "d": d, "p": "P1D"}

    data = await call(router.get_consumption_daily, j(5), j(1), use_cache=True)

    assert served_days(data) == [j(5), j(4), j(3), j(2)]
    assert enedis.calls == [("daily", j(4), j(2))]


async def test_quotidien_tout_en_cache_aucun_appel(enedis, cache):
    for d in days(j(4), j(0)):
        cache.store[f"consumption:daily:{PRM}:{d}"] = {"v": "1000", "d": d, "p": "P1D"}

    data = await call(router.get_consumption_daily, j(4), j(0), use_cache=True)

    assert served_days(data) == [j(4), j(3), j(2), j(1)]
    assert enedis.calls == []
    assert data["periode"]["dateFin"] == j(0)


# --- courbe de charge -----------------------------------------------------------------------


async def test_detail_end_today_sert_j_moins_1(enedis, cache):
    data = await call(router.get_consumption_detail, j(4), j(0))

    points = points_of(data)
    assert len(points) == 4 * 48
    assert max(p["d"] for p in points) == f"{j(1)} 23:30:00"


async def test_detail_cache_complet_aucun_appel_ni_jour_fantome(enedis, cache):
    for d in days(j(4), j(1)):
        for h in range(24):
            for m in (0, 30):
                cache.store[f"consumption:detail:{PRM}:{d}T{h:02d}:{m:02d}"] = {"v": "300", "d": f"{d} {h:02d}:{m:02d}:00", "p": "PT30M"}

    data = await call(router.get_consumption_detail, j(4), j(1), use_cache=True)

    assert enedis.calls == []
    assert served_days(data) == [j(4), j(3), j(2)]


async def test_batch_end_hier_s_arrete_a_j_moins_2(enedis, cache):
    data = await call(router.get_consumption_detail_batch, j(4), j(1))

    assert max(p["d"] for p in points_of(data)) == f"{j(2)} 23:30:00"
    assert data["periode"]["dateFin"] == j(1)


async def test_batch_end_today_sert_j_moins_1(enedis, cache):
    data = await call(router.get_consumption_detail_batch, j(4), j(0))

    assert max(p["d"] for p in points_of(data)) == f"{j(1)} 23:30:00"
    assert len(points_of(data)) == 4 * 48


# --- puissance max --------------------------------------------------------------------------


async def test_power_j_moins_1_publie_apres_un_premier_appel(enedis, cache):
    enedis.published_until = 2  # J-1 pas encore publié au premier appel
    first = await call(router.get_max_power, j(3), j(0), use_cache=True)
    assert served_days(first) == [j(3), j(2)]

    enedis.published_until = 1
    second = await call(router.get_max_power, j(3), j(0), use_cache=True)

    assert served_days(second) == [j(3), j(2), j(1)]
    assert enedis.calls[-1] == ("power", j(1), j(0))


async def test_power_cache_par_jour_reutilise_entre_fenetres(enedis, cache):
    await call(router.get_max_power, j(10), j(0), use_cache=True)

    data = await call(router.get_max_power, j(9), j(6), use_cache=True)

    assert len(enedis.calls) == 1
    assert served_days(data) == [j(9), j(8), j(7)]


async def test_power_end_today_sans_cache_sert_j_moins_1(enedis, cache):
    data = await call(router.get_max_power, j(4), j(-2))

    assert served_days(data) == [j(4), j(3), j(2), j(1)]
    assert enedis.calls == [("power", j(4), j(0))]


def test_power_cache_ttl_court_pour_j_moins_1_et_j_moins_2():
    today = datetime.combine(today_paris(), datetime.min.time())

    assert router.power_cache_ttl(j(1), today, 86400) == 3 * 3600
    assert router.power_cache_ttl(j(2), today, 86400) == 3 * 3600
    assert router.power_cache_ttl(j(3), today, 86400) == 86400
    assert router.power_cache_ttl(j(1), today, 600) == 600  # jamais plus long que le défaut serveur


async def test_power_jours_recents_caches_moins_longtemps(enedis, cache):
    await call(router.get_max_power, j(4), j(0), use_cache=True)

    assert cache.ttls[f"consumption:max_power:{PRM}:{j(1)}"] == 3 * 3600
    assert cache.ttls[f"consumption:max_power:{PRM}:{j(2)}"] == 3 * 3600
    assert cache.ttls[f"consumption:max_power:{PRM}:{j(4)}"] == 86400


async def test_power_jours_anciens_sans_mesure_pas_redemandes(enedis, cache):
    enedis.holes = {j(20), j(10)}
    await call(router.get_max_power, j(30), j(0), use_cache=True)

    data = await call(router.get_max_power, j(30), j(0), use_cache=True)

    assert len(enedis.calls) == 1
    assert j(20) not in served_days(data) and len(served_days(data)) == 28


async def test_power_jour_recent_sans_mesure_redemande(enedis, cache):
    enedis.published_until = 2
    await call(router.get_max_power, j(5), j(0), use_cache=True)
    await call(router.get_max_power, j(5), j(0), use_cache=True)

    assert enedis.calls[-1] == ("power", j(1), j(0))


async def test_power_unite_conservee_depuis_le_cache(enedis, cache):
    enedis.power_unit = "kVA"
    await call(router.get_max_power, j(5), j(2), use_cache=True)

    data = await call(router.get_max_power, j(5), j(2), use_cache=True)

    assert len(enedis.calls) == 1
    assert data["grandeur"][0]["unite"] == "kVA"


@pytest.mark.parametrize("use_cache", [True, False])
async def test_power_date_invalide(enedis, cache, use_cache):
    response = await raw_call(router.get_max_power, "2026-13-01", j(0), use_cache)

    assert not response.success
    assert response.error.code == "INVALID_DATE_FORMAT"
    assert enedis.calls == []


# --- production -----------------------------------------------------------------------------


@pytest.mark.parametrize("handler, kind", [("get_production_daily", "prod_daily"), ("get_production_detail", "prod_detail")])
async def test_production_fin_plafonnee_a_today(enedis, cache, handler, kind):
    data = await call(getattr(router, handler), j(4), j(-1))

    assert enedis.calls == [(kind, j(4), j(0))]
    assert served_days(data) == [j(4), j(3), j(2), j(1)]


# --- compte de démo -------------------------------------------------------------------------


async def test_demo_quotidien_fin_exclue(monkeypatch):
    data = await DemoAdapter().get_consumption_daily(PRM, "2026-09-01", "2026-09-08", "secret")

    assert served_days(data) == days("2026-09-01", "2026-09-08")
