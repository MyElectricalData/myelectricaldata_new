"""MED-89 : les logs applicatifs stockés dans Valkey sont bornés.

Avant : une clé `logs:<niveau>:<ms>` par ligne de log (TTL 24 h), soit 86 % des clés et ~150 Mo du Valkey
de prod. Après : une LISTE par niveau (`logs:<niveau>`), plafonnée par LTRIM, avec un TTL de 24 h.

Les tests passent par un faux Valkey en mémoire (listes, clés simples, pipeline) : aucun serveur requis.
"""

from __future__ import annotations

import fnmatch
import json
import logging
from datetime import datetime, timedelta
from types import SimpleNamespace
from typing import Any

import pytest

PARIS_T0 = datetime.fromisoformat("2026-10-31T12:00:00+01:00")


class FakeValkey:
    """Valkey minimal : listes, clés simples, TTL notés, pipeline. Les valeurs sortent en bytes (prod : decode_responses=False)."""

    def __init__(self) -> None:
        self.lists: dict[str, list[bytes]] = {}
        self.strings: dict[str, bytes] = {}
        self.ttls: dict[str, int] = {}
        self.pipeline_executions = 0
        self.scan_calls = 0

    @staticmethod
    def _b(value: Any) -> bytes:
        return value if isinstance(value, bytes) else str(value).encode("utf-8")

    def lpush(self, key: str, *values: Any) -> int:
        lst = self.lists.setdefault(key, [])
        for value in values:
            lst.insert(0, self._b(value))
        return len(lst)

    def ltrim(self, key: str, start: int, stop: int) -> bool:
        lst = self.lists.get(key, [])
        stop = len(lst) if stop == -1 else stop + 1
        self.lists[key] = lst[start:stop]
        return True

    def expire(self, key: str, seconds: int) -> bool:
        self.ttls[key] = seconds
        return key in self.lists or key in self.strings

    def setex(self, key: str, seconds: int, value: Any) -> bool:
        self.strings[key] = self._b(value)
        self.ttls[key] = seconds
        return True

    def lrange(self, key: str, start: int, stop: int) -> list[bytes]:
        lst = self.lists.get(key, [])
        stop = len(lst) if stop == -1 else stop + 1
        return lst[start:stop]

    def llen(self, key: str) -> int:
        return len(self.lists.get(key, []))

    def get(self, key: str) -> bytes | None:
        return self.strings.get(key)

    def delete(self, *keys: str) -> int:
        deleted = 0
        for key in keys:
            if self.lists.pop(key, None) is not None or self.strings.pop(key, None) is not None:
                deleted += 1
        return deleted

    def keys_matching(self, pattern: str) -> list[str]:
        return [k for k in [*self.lists, *self.strings] if fnmatch.fnmatch(k, pattern)]

    def scan_iter_sync(self, match: str = "*") -> list[bytes]:
        self.scan_calls += 1
        return [k.encode("utf-8") for k in self.keys_matching(match)]

    # Version synchrone (handler) ----------------------------------------------------------------
    def scan_iter(self, match: str = "*"):  # type: ignore[no-untyped-def]
        return self.scan_iter_sync(match)

    def pipeline(self, transaction: bool = True) -> "_Pipeline":
        return _Pipeline(self)


class _Pipeline:
    def __init__(self, base: FakeValkey) -> None:
        self._base = base
        self._ops: list[tuple[str, tuple[Any, ...]]] = []

    def __getattr__(self, name: str):  # type: ignore[no-untyped-def]
        def queue(*args: Any) -> "_Pipeline":
            self._ops.append((name, args))
            return self

        return queue

    def __enter__(self) -> "_Pipeline":
        return self

    def __exit__(self, *exc: Any) -> None:
        return None

    def execute(self) -> list[Any]:
        self._base.pipeline_executions += 1
        return [getattr(self._base, name)(*args) for name, args in self._ops]


class AsyncFakeValkey:
    """Même état que FakeValkey, interface asynchrone (client `redis.asyncio` du CacheService)."""

    def __init__(self, base: FakeValkey) -> None:
        self.base = base

    async def lrange(self, key: str, start: int, stop: int) -> list[bytes]:
        return self.base.lrange(key, start, stop)

    async def llen(self, key: str) -> int:
        return self.base.llen(key)

    async def get(self, key: str) -> bytes | None:
        return self.base.get(key)

    async def delete(self, *keys: str) -> int:
        return self.base.delete(*keys)

    async def scan_iter(self, match: str = "*"):  # type: ignore[no-untyped-def]
        for key in self.base.scan_iter_sync(match):
            yield key

    def pipeline(self, transaction: bool = True) -> "_AsyncPipeline":
        return _AsyncPipeline(self.base)


class _AsyncPipeline(_Pipeline):
    async def __aenter__(self) -> "_AsyncPipeline":
        return self

    async def __aexit__(self, *exc: Any) -> None:
        return None

    async def execute(self) -> list[Any]:  # type: ignore[override]
        return super().execute()


def _entry(level: str, offset_s: int, message: str) -> str:
    return json.dumps(
        {
            "timestamp": (PARIS_T0 + timedelta(seconds=offset_s)).isoformat(),
            "level": level.upper(),
            "logger": "test",
            "message": message,
        }
    )


@pytest.fixture
def valkey() -> FakeValkey:
    return FakeValkey()


# --- Écriture : liste plafonnée par niveau ------------------------------------------------------


def test_store_log_entry_plafonne_la_liste_du_niveau(valkey: FakeValkey) -> None:
    from src.logging_config import store_log_entry

    for i in range(1500):
        store_log_entry(valkey, "INFO", _entry("info", i, f"ligne {i}"), max_entries=1000, ttl=86400)

    assert valkey.llen("logs:info") == 1000
    # La plus récente est en tête, les 500 plus anciennes ont été rognées.
    assert json.loads(valkey.lrange("logs:info", 0, 0)[0])["message"] == "ligne 1499"
    assert json.loads(valkey.lrange("logs:info", -1, -1)[0])["message"] == "ligne 500"


def test_store_log_entry_pose_le_ttl_et_une_seule_liste_par_niveau(valkey: FakeValkey) -> None:
    from src.logging_config import store_log_entry

    store_log_entry(valkey, "WARNING", _entry("warning", 0, "a"), max_entries=10, ttl=86400)
    store_log_entry(valkey, "ERROR", _entry("error", 1, "b"), max_entries=10, ttl=86400)

    assert valkey.ttls["logs:warning"] == 86400
    assert valkey.ttls["logs:error"] == 86400
    assert set(valkey.lists) == {"logs:warning", "logs:error"}
    assert valkey.strings == {}


def test_store_log_entry_tient_en_un_seul_aller_retour(valkey: FakeValkey) -> None:
    """LPUSH + LTRIM + EXPIRE partent dans un même pipeline : pas de liste non bornée entre deux commandes."""
    from src.logging_config import store_log_entry

    store_log_entry(valkey, "INFO", _entry("info", 0, "a"), max_entries=10, ttl=86400)

    assert valkey.pipeline_executions == 1


def test_deux_lignes_dans_la_meme_milliseconde_ne_s_ecrasent_plus(valkey: FakeValkey) -> None:
    from src.logging_config import store_log_entry

    same = _entry("info", 0, "même instant")
    store_log_entry(valkey, "INFO", same, max_entries=10, ttl=86400)
    store_log_entry(valkey, "INFO", same, max_entries=10, ttl=86400)

    assert valkey.llen("logs:info") == 2


def test_plafond_par_defaut_reglable_par_environnement(monkeypatch: pytest.MonkeyPatch) -> None:
    import importlib

    from src import logging_config

    assert logging_config.LOG_MAX_ENTRIES_PER_LEVEL == 1000

    monkeypatch.setenv("LOG_MAX_ENTRIES_PER_LEVEL", "250")
    try:
        reloaded = importlib.reload(logging_config)
        assert reloaded.LOG_MAX_ENTRIES_PER_LEVEL == 250
    finally:
        monkeypatch.delenv("LOG_MAX_ENTRIES_PER_LEVEL")
        importlib.reload(logging_config)


# --- Handler : plus de clé par ligne, une connexion réutilisée ---------------------------------


def _record(level: int, message: str) -> logging.LogRecord:
    return logging.LogRecord("tests.logs", level, __file__, 1, message, None, None)


@pytest.fixture
def handler(valkey: FakeValkey, monkeypatch: pytest.MonkeyPatch):  # type: ignore[no-untyped-def]
    """Handler branché sur le faux Valkey ; `connections` compte les ouvertures de connexion."""
    import redis

    from src.logging_config import RedisLogHandler

    connections: list[str] = []

    def fake_from_url(url: str, *args: Any, **kwargs: Any) -> FakeValkey:
        connections.append(url)
        return valkey

    monkeypatch.setattr(redis.Redis, "from_url", staticmethod(fake_from_url))
    cache_service = SimpleNamespace(redis_client=object())
    h = RedisLogHandler(cache_service, "redis://valkey:6379/0")  # type: ignore[arg-type]
    h.connections = connections  # type: ignore[attr-defined]
    return h


def test_handler_ecrit_dans_la_liste_du_niveau_sans_cle_par_ligne(handler: Any, valkey: FakeValkey) -> None:
    for i in range(20):
        handler.emit(_record(logging.INFO, f"ligne {i}"))
    handler.emit(_record(logging.ERROR, "boom"))
    handler.flush()

    assert valkey.llen("logs:info") == 20
    assert valkey.llen("logs:error") == 1
    assert valkey.keys_matching("logs:*:*") == []
    entry = json.loads(valkey.lrange("logs:error", 0, 0)[0])
    assert entry["level"] == "ERROR"
    assert entry["message"] == "boom"
    assert datetime.fromisoformat(entry["timestamp"]).tzinfo is not None


def test_handler_reutilise_une_seule_connexion(handler: Any) -> None:
    for i in range(20):
        handler.emit(_record(logging.INFO, f"ligne {i}"))
    handler.flush()

    assert len(handler.connections) == 1


def test_handler_ignore_toujours_les_requetes_admin_logs_et_ping(handler: Any, valkey: FakeValkey) -> None:
    handler.emit(_record(logging.INFO, "GET /admin/logs?limit=1000 200"))
    handler.emit(_record(logging.INFO, "HEAD /ping 200"))
    handler.flush()

    assert valkey.lists == {}


def test_handler_survit_a_un_valkey_en_panne(handler: Any, valkey: FakeValkey, monkeypatch: pytest.MonkeyPatch) -> None:
    def boom(*args: Any, **kwargs: Any) -> None:
        raise ConnectionError("valkey down")

    monkeypatch.setattr(valkey, "pipeline", boom)

    handler.emit(_record(logging.INFO, "ne doit pas planter l'application"))
    handler.flush()


# --- Lecture : GET /admin/logs ------------------------------------------------------------------


@pytest.fixture
def admin_valkey(valkey: FakeValkey, monkeypatch: pytest.MonkeyPatch) -> FakeValkey:
    from src.routers import admin

    monkeypatch.setattr(admin.cache_service, "redis_client", AsyncFakeValkey(valkey))
    return valkey


def _seed(valkey: FakeValkey) -> None:
    """info t+0, t+3, t+6 ; error t+1, t+4 ; warning t+2 (entrées poussées dans l'ordre chronologique par niveau)."""
    from src.logging_config import store_log_entry

    for level, offsets in {"info": (0, 3, 6), "error": (1, 4), "warning": (2,)}.items():
        for off in offsets:
            store_log_entry(valkey, level.upper(), _entry(level, off, f"{level}@{off}"), max_entries=1000, ttl=86400)


async def _get_logs(**kwargs: Any) -> Any:
    from src.routers import admin

    params = {"level": None, "limit": 100, "offset": 0, "current_user": None, **kwargs}
    return await admin.get_logs(**params)


async def test_get_logs_fusionne_les_niveaux_du_plus_recent_au_plus_ancien(admin_valkey: FakeValkey) -> None:
    _seed(admin_valkey)

    response = await _get_logs()

    assert response.success is True
    assert [log["message"] for log in response.data["logs"]] == [
        "info@6",
        "error@4",
        "info@3",
        "warning@2",
        "error@1",
        "info@0",
    ]
    assert response.data["total"] == 6
    assert response.data["count"] == 6


async def test_get_logs_applique_offset_et_limit_apres_la_fusion(admin_valkey: FakeValkey) -> None:
    _seed(admin_valkey)

    response = await _get_logs(limit=2, offset=1)

    assert [log["message"] for log in response.data["logs"]] == ["error@4", "info@3"]
    assert response.data["total"] == 6
    assert response.data["offset"] == 1
    assert response.data["limit"] == 2


async def test_get_logs_filtre_par_niveau(admin_valkey: FakeValkey) -> None:
    _seed(admin_valkey)

    response = await _get_logs(level="ERROR")

    assert [log["message"] for log in response.data["logs"]] == ["error@4", "error@1"]
    assert response.data["total"] == 2


async def test_get_logs_ne_balaie_plus_le_keyspace(admin_valkey: FakeValkey) -> None:
    """Chaque rafraîchissement de la page (10 s) faisait un SCAN complet : lire une liste n'en a pas besoin."""
    _seed(admin_valkey)

    await _get_logs()

    assert admin_valkey.scan_calls == 0


async def test_get_logs_ignore_une_entree_illisible(admin_valkey: FakeValkey) -> None:
    _seed(admin_valkey)
    admin_valkey.lpush("logs:info", b"{pas du json")

    response = await _get_logs(level="info")

    assert [log["message"] for log in response.data["logs"]] == ["info@6", "info@3", "info@0"]


async def test_get_logs_sans_logs_rend_une_liste_vide(admin_valkey: FakeValkey) -> None:
    response = await _get_logs()

    assert response.success is True
    assert response.data["logs"] == []
    assert response.data["total"] == 0


# --- Effacement : DELETE /admin/logs/clear ------------------------------------------------------


async def _clear_logs(**kwargs: Any) -> Any:
    from src.routers import admin

    return await admin.clear_logs(**{"level": None, "current_user": None, **kwargs})


async def test_clear_logs_vide_les_listes_et_les_anciennes_cles(admin_valkey: FakeValkey) -> None:
    _seed(admin_valkey)
    # Reliquats d'avant MED-89 (une clé par ligne), qui n'expirent que sous 24 h.
    admin_valkey.setex("logs:info:1793000000000", 86400, _entry("info", -10, "ancien"))
    admin_valkey.setex("logs:error:1793000000001", 86400, _entry("error", -9, "ancien"))
    admin_valkey.setex("autre:cle", 60, "intacte")

    response = await _clear_logs()

    assert response.success is True
    assert admin_valkey.keys_matching("logs:*") == []
    assert admin_valkey.strings == {"autre:cle": b"intacte"}
    assert response.data["deleted_count"] >= 1


async def test_clear_logs_d_un_niveau_laisse_les_autres(admin_valkey: FakeValkey) -> None:
    _seed(admin_valkey)
    admin_valkey.setex("logs:info:1793000000000", 86400, _entry("info", -10, "ancien"))

    response = await _clear_logs(level="info")

    assert response.success is True
    assert admin_valkey.keys_matching("logs:info*") == []
    assert admin_valkey.llen("logs:error") == 2
    assert admin_valkey.llen("logs:warning") == 1


async def test_clear_logs_sans_valkey_signale_l_indisponibilite(monkeypatch: pytest.MonkeyPatch) -> None:
    from src.routers import admin

    monkeypatch.setattr(admin.cache_service, "redis_client", None)

    response = await _clear_logs()

    assert response.success is False
    assert response.error.code == "REDIS_NOT_AVAILABLE"
