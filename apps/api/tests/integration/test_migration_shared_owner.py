"""Migration a7c2e9d4b1f0 (MED-112) : colonnes shared_owner_* des PDL sur une base SQLite EXISTANTE.

Une base neuve est amorcée par create_all puis stamp (cf. test_client_sqlite) : seule une base déjà
en service avant MED-112 rejoue cette révision. On la simule en retirant les colonnes d'une base
amorcée, puis en reposant la révision précédente.
"""

import os
import sqlite3
import subprocess
import sys
from pathlib import Path

API_DIR = Path(__file__).resolve().parents[2]
PREVIOUS = "f4a9c1d7b3e5"
REVISION = "a7c2e9d4b1f0"


def _alembic(url: str, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=API_DIR, env={**os.environ, "DATABASE_URL": url}, capture_output=True, text=True, timeout=120,
    )


def _columns(path: Path) -> set[str]:
    with sqlite3.connect(path) as conn:
        return {r[1] for r in conn.execute("PRAGMA table_info(pdls)")}


def _base_avant_med112(tmp_path: Path) -> tuple[str, Path]:
    path = tmp_path / "client.db"
    url = f"sqlite+aiosqlite:///{path}"
    assert _alembic(url, "upgrade", "head").returncode == 0
    with sqlite3.connect(path) as conn:
        conn.execute("DROP INDEX ix_pdls_shared_owner_id")
        conn.execute("ALTER TABLE pdls DROP COLUMN shared_owner_email")
        conn.execute("ALTER TABLE pdls DROP COLUMN shared_owner_id")
        conn.execute("INSERT INTO users (id, email, hashed_password, client_id, client_secret, is_active, is_admin, email_verified, debug_mode, admin_data_sharing) "
                     "VALUES ('u1', 'a@b.c', 'x', 'cid', 'cs', 1, 1, 1, 0, 0)")
        conn.execute("INSERT INTO pdls (id, usage_point_id, user_id, has_consumption, has_production, is_active) "
                     "VALUES ('p1', '11111111111111', 'u1', 1, 0, 1)")
        conn.execute("UPDATE alembic_version SET version_num = ?", (PREVIOUS,))
    assert "shared_owner_id" not in _columns(path)
    return url, path


def test_upgrade_ajoute_les_colonnes_sans_perte(tmp_path):
    url, path = _base_avant_med112(tmp_path)

    result = _alembic(url, "upgrade", "head")
    assert result.returncode == 0, result.stderr[-2000:]

    assert {"shared_owner_id", "shared_owner_email"} <= _columns(path)
    with sqlite3.connect(path) as conn:
        assert conn.execute("SELECT usage_point_id, shared_owner_id FROM pdls").fetchall() == [("11111111111111", None)]
        assert conn.execute("SELECT version_num FROM alembic_version").fetchone() == (REVISION,)


def test_downgrade_puis_upgrade(tmp_path):
    url, path = _base_avant_med112(tmp_path)
    assert _alembic(url, "upgrade", "head").returncode == 0

    result = _alembic(url, "downgrade", PREVIOUS)
    assert result.returncode == 0, result.stderr[-2000:]
    assert not {"shared_owner_id", "shared_owner_email"} & _columns(path)
    with sqlite3.connect(path) as conn:
        assert conn.execute("SELECT count(*) FROM pdls").fetchone() == (1,)

    assert _alembic(url, "upgrade", "head").returncode == 0
    assert {"shared_owner_id", "shared_owner_email"} <= _columns(path)


# --- PostgreSQL (passerelle, client en PostgreSQL) ---------------------------------------------

import shutil  # noqa: E402
import socket  # noqa: E402
import tempfile  # noqa: E402

import pytest  # noqa: E402


def _pg_bin(name: str) -> str | None:
    for candidate in (shutil.which(name), f"/opt/homebrew/opt/postgresql@14/bin/{name}"):
        if candidate and os.path.exists(candidate):
            return candidate
    return None


@pytest.fixture
def pg(tmp_path):
    initdb, pg_ctl, psql = _pg_bin("initdb"), _pg_bin("pg_ctl"), _pg_bin("psql")
    if not (initdb and pg_ctl and psql):
        pytest.skip("binaires PostgreSQL (initdb, pg_ctl, psql) absents")
    data = tmp_path / "pgdata"
    sock = Path(tempfile.mkdtemp(prefix="pg", dir="/tmp"))  # socket Unix : chemin court sur macOS
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
    subprocess.run([initdb, "-D", str(data), "-U", "postgres", "-A", "trust", "-E", "UTF8"], check=True, capture_output=True)
    try:
        subprocess.run([pg_ctl, "-D", str(data), "-w", "-l", str(data / "log"), "-o",
                        f"-p {port} -k {sock} -c listen_addresses=127.0.0.1", "start"], check=True, capture_output=True)

        def sql(query: str) -> str:
            return subprocess.run([psql, "-h", "127.0.0.1", "-p", str(port), "-U", "postgres", "-At", "-c", query],
                                  check=True, capture_output=True, text=True).stdout.strip()

        yield f"postgresql+asyncpg://postgres@127.0.0.1:{port}/postgres", sql
    finally:
        subprocess.run([pg_ctl, "-D", str(data), "-m", "immediate", "stop"], capture_output=True)
        shutil.rmtree(sock, ignore_errors=True)


def test_postgresql_upgrade_downgrade(pg):
    url, sql = pg
    cols = "SELECT string_agg(column_name, ',' ORDER BY column_name) FROM information_schema.columns " \
           "WHERE table_name = 'pdls' AND column_name LIKE 'shared_owner%'"

    result = _alembic(url, "upgrade", "head")
    assert result.returncode == 0, result.stderr[-2000:]
    assert sql(cols) == "shared_owner_email,shared_owner_id"

    result = _alembic(url, "downgrade", PREVIOUS)
    assert result.returncode == 0, result.stderr[-2000:]
    assert sql(cols) == ""

    assert _alembic(url, "upgrade", "head").returncode == 0
    assert sql(cols) == "shared_owner_email,shared_owner_id"
    assert sql("SELECT version_num FROM alembic_version") == REVISION
