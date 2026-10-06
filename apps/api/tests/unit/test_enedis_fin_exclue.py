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
        self.production_unit = "Wh"
        self.holes: set[str] = set()  # jours sans mesure (compteur coupé)
        self.partial: set[str] = set()  # jours dont la courbe de production n'a que 30 points sur 48
        self.activation: str | None = None  # mise en service : avant, ADAM-ERR0123 rendu en dict (sans exception)
        self.failing = False  # Enedis indisponible : chaque appel lève une exception

    def _days(self, kind: str, start: str, end: str) -> list[str]:
        self.calls.append((kind, start, end))
        if self.failing:
            raise RuntimeError("503 Service Unavailable")
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

    def _before_activation(self, kind: str, start: str, end: str) -> bool:
        if self.activation and start < self.activation:
            self.calls.append((kind, start, end))
            return True
        return False

    async def get_production_daily(self, pdl: str, start: str, end: str, token: str) -> dict[str, Any]:
        if self._before_activation("prod_daily", start, end):
            return {"error": "ADAM-ERR0123", "error_description": "anterior to meter activation"}
        points = [{"v": "800", "d": d, "p": "P1D"} for d in self._days("prod_daily", start, end)]
        return build_measure(
            pdl, start, end, points, grandeur_metier="PROD", grandeur_physique="EA", unite=self.production_unit, pas="P1D"
        )

    async def get_production_detail(self, pdl: str, start: str, end: str, token: str) -> dict[str, Any]:
        if self._before_activation("prod_detail", start, end):
            return {"error": "ADAM-ERR0123", "error_description": "anterior to meter activation"}
        points = [
            {"v": "200", "d": f"{d} {h:02d}:{m:02d}:00", "p": "PT30M"}
            for d in self._days("prod_detail", start, end)
            for h in range(15 if d in self.partial else 24)
            for m in (0, 30)
        ]
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


def test_cache_ttl_court_pour_j_moins_1_et_j_moins_2():
    today = datetime.combine(today_paris(), datetime.min.time())

    assert router.recent_cache_ttl(j(1), today, 86400) == 3 * 3600
    assert router.recent_cache_ttl(j(2), today, 86400) == 3 * 3600
    assert router.recent_cache_ttl(j(3), today, 86400) == 86400
    assert router.recent_cache_ttl(j(1), today, 600) == 600  # jamais plus long que le défaut serveur


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


# Cache jour par jour de la production (MED-30), comme la puissance max : un jour récent absent n'est
# jamais caché, un jour ancien sans mesure est marqué vide, J-1 et J-2 sont gardés 3 h au lieu de 24 h.
# La courbe de charge partage la clé par jour du batch de production.
PRODUCTION = pytest.mark.parametrize(
    "handler, kind", [("get_production_daily", "prod_daily"), ("get_production_detail", "prod_detail")]
)
PRODUCTION_KEYS = {"prod_daily": "production:daily", "prod_detail": "production:detail:daily"}


@PRODUCTION
async def test_production_j_moins_1_publie_apres_un_premier_appel(enedis, cache, handler, kind):
    enedis.published_until = 2  # J-1 pas encore publié au premier appel
    first = await call(getattr(router, handler), j(3), j(0), use_cache=True)
    assert served_days(first) == [j(3), j(2)]

    enedis.published_until = 1
    second = await call(getattr(router, handler), j(3), j(0), use_cache=True)

    assert served_days(second) == [j(3), j(2), j(1)]
    assert enedis.calls[-1] == (kind, j(1), j(0))


@PRODUCTION
async def test_production_cache_par_jour_reutilise_entre_fenetres(enedis, cache, handler, kind):
    await call(getattr(router, handler), j(10), j(0), use_cache=True)

    data = await call(getattr(router, handler), j(9), j(6), use_cache=True)

    assert len(enedis.calls) == 1
    assert served_days(data) == [j(9), j(8), j(7)]
    assert not any(key.startswith(f"{PRM}:production") for key in cache.store)  # plus de clé par période


@PRODUCTION
async def test_production_fenetre_glissante_ne_demande_que_le_nouveau_jour(enedis, cache, handler, kind):
    enedis.published_until = 2
    await call(getattr(router, handler), j(10), j(1), use_cache=True)

    enedis.published_until = 1  # le lendemain : la fenêtre a glissé d'un jour
    data = await call(getattr(router, handler), j(9), j(0), use_cache=True)

    assert enedis.calls[-1] == (kind, j(1), j(0))
    assert served_days(data) == days(j(9), j(0))


@PRODUCTION
async def test_production_jours_anciens_sans_mesure_pas_redemandes(enedis, cache, handler, kind):
    enedis.holes = {j(20), j(10)}
    await call(getattr(router, handler), j(30), j(0), use_cache=True)

    data = await call(getattr(router, handler), j(25), j(5), use_cache=True)

    assert len(enedis.calls) == 1
    assert j(20) not in served_days(data) and len(served_days(data)) == 18


@PRODUCTION
async def test_production_jour_recent_sans_mesure_redemande(enedis, cache, handler, kind):
    enedis.published_until = 2
    await call(getattr(router, handler), j(5), j(0), use_cache=True)
    await call(getattr(router, handler), j(5), j(0), use_cache=True)

    assert enedis.calls[-1] == (kind, j(1), j(0))
    assert f"{PRODUCTION_KEYS[kind]}:{PRM}:{j(1)}" not in cache.store


@PRODUCTION
async def test_production_jours_recents_caches_moins_longtemps(enedis, cache, handler, kind):
    await call(getattr(router, handler), j(4), j(0), use_cache=True)

    prefix = PRODUCTION_KEYS[kind]
    assert cache.ttls[f"{prefix}:{PRM}:{j(1)}"] == 3 * 3600
    assert cache.ttls[f"{prefix}:{PRM}:{j(2)}"] == 3 * 3600
    assert cache.ttls[f"{prefix}:{PRM}:{j(4)}"] == 86400


@PRODUCTION
async def test_production_sans_cache_n_ecrit_rien(enedis, cache, handler, kind):
    await call(getattr(router, handler), j(4), j(0))

    assert cache.store == {}


async def test_production_quotidien_unite_conservee_depuis_le_cache(enedis, cache):
    enedis.production_unit = "kWh"
    await call(router.get_production_daily, j(5), j(2), use_cache=True)

    data = await call(router.get_production_daily, j(4), j(3), use_cache=True)

    assert len(enedis.calls) == 1
    assert data["grandeur"][0]["unite"] == "kWh"


async def test_production_detail_reutilise_le_cache_du_batch(enedis, cache):
    await call(router.get_production_detail_batch, j(10), j(0), use_cache=True)
    calls_before = len(enedis.calls)

    data = await call(router.get_production_detail, j(8), j(3), use_cache=True)

    assert len(enedis.calls) == calls_before
    assert len(points_of(data)) == 5 * 48


async def test_production_batch_reutilise_le_cache_du_detail(enedis, cache):
    await call(router.get_production_detail, j(10), j(0), use_cache=True)

    data = await call(router.get_production_detail_batch, j(8), j(3), use_cache=True)

    assert len(enedis.calls) == 1
    assert len(points_of(data)) == 5 * 48


async def test_production_batch_jours_recents_caches_moins_longtemps(enedis, cache):
    await call(router.get_production_detail_batch, j(4), j(0), use_cache=True)

    assert cache.ttls[f"production:detail:daily:{PRM}:{j(1)}"] == 3 * 3600
    assert cache.ttls[f"production:detail:daily:{PRM}:{j(4)}"] == 86400


async def test_production_detail_jour_ancien_partiel_garde_tel_quel(enedis, cache):
    enedis.partial = {j(10)}  # Enedis ne complétera plus une courbe de plus de deux jours
    await call(router.get_production_detail, j(12), j(8), use_cache=True)

    data = await call(router.get_production_detail, j(11), j(9), use_cache=True)

    assert len(enedis.calls) == 1
    assert len(points_of(data)) == 48 + 30


async def test_production_detail_jour_recent_partiel_redemande(enedis, cache):
    enedis.partial = {j(1)}  # courbe de J-1 encore incomplète chez Enedis
    await call(router.get_production_detail, j(3), j(0), use_cache=True)

    enedis.partial = set()
    data = await call(router.get_production_detail, j(3), j(0), use_cache=True)

    assert enedis.calls[-1] == ("prod_detail", j(1), j(0))
    assert len(points_of(data)) == 3 * 48


@PRODUCTION
async def test_production_adam_err0123_ne_marque_pas_les_jours_vides(enedis, cache, handler, kind):
    enedis.activation = j(20)  # Enedis rejette toute plage qui commence avant la mise en service
    await raw_call(getattr(router, handler), j(25), j(15), use_cache=True)

    data = await call(getattr(router, handler), j(20), j(16), use_cache=True)

    assert router.EMPTY_DAY not in cache.store.values()
    assert served_days(data) == days(j(20), j(16))


@PRODUCTION
async def test_production_adam_err0123_memorise_pour_la_meme_plage(enedis, cache, handler, kind):
    enedis.activation = j(20)  # le client resynchronise les mêmes fenêtres antérieures à la mise en service
    first = await raw_call(getattr(router, handler), j(25), j(15), use_cache=True)
    second = await raw_call(getattr(router, handler), j(25), j(15), use_cache=True)

    assert enedis.calls == [(kind, j(25), j(15))]
    assert not first.success and not second.success
    assert "ADAM-ERR0123" in second.error.message


async def test_production_detail_jour_recent_partiel_servi_si_enedis_echoue(enedis, cache):
    enedis.partial = {j(1)}
    await call(router.get_production_detail, j(3), j(0), use_cache=True)

    enedis.failing = True
    data = await call(router.get_production_detail, j(3), j(0), use_cache=True)

    assert len(points_of(data)) == 2 * 48 + 30


async def test_production_batch_ne_redemande_pas_un_jour_vide(enedis, cache):
    enedis.holes = {j(10)}
    await call(router.get_production_detail, j(12), j(8), use_cache=True)

    await call(router.get_production_detail_batch, j(12), j(8), use_cache=True)

    assert len(enedis.calls) == 1


async def test_production_batch_jour_ancien_partiel_ni_redemande_ni_double(enedis, cache):
    enedis.partial = {j(10)}
    await call(router.get_production_detail, j(12), j(8), use_cache=True)

    data = await call(router.get_production_detail_batch, j(11), j(9), use_cache=True)

    assert len(enedis.calls) == 1
    assert len(points_of(data)) == 48 + 30


# --- compte de démo -------------------------------------------------------------------------


async def test_demo_quotidien_fin_exclue(monkeypatch):
    data = await DemoAdapter().get_consumption_daily(PRM, "2026-09-01", "2026-09-08", "secret")

    assert served_days(data) == days("2026-09-01", "2026-09-08")
