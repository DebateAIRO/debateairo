"""Out-of-process scripts must open the shared SQLite DB with the same
connection PRAGMAs as the coordinator (app/core/db.py set_sqlite_pragma):
journal_mode=WAL, foreign_keys=ON, busy_timeout=30000.

Regression tests for the 2026-07-26 seam audit
(.superpowers/sdd/2026-07-24-p1-contested-frontier/seam-sweep-report.md §4):
raw sqlite3.connect() gave those writers a 5s lock timeout (vs 30s) and
FK-unenforced DELETEs. The call-site tests rely on journal_mode=WAL being a
persistent database property: a scratch DB is left in WAL mode only if the
script's connection ran the coordinator PRAGMAs.
"""

from __future__ import annotations

import importlib.util
import sqlite3
import subprocess
import sys
from pathlib import Path

import pytest

SCRIPTS_DIR = Path(__file__).resolve().parents[2] / "scripts"


def load_script(name: str):
    if str(SCRIPTS_DIR) not in sys.path:
        sys.path.insert(0, str(SCRIPTS_DIR))
    spec = importlib.util.spec_from_file_location(name, SCRIPTS_DIR / f"{name}.py")
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def pragma(db: sqlite3.Connection, name: str):
    return db.execute(f"PRAGMA {name}").fetchone()[0]


def test_connect_db_applies_coordinator_pragmas(tmp_path: Path) -> None:
    common = load_script("_common")
    db = common.connect_db(tmp_path / "engine.sqlite3")
    try:
        assert pragma(db, "journal_mode") == "wal"
        assert pragma(db, "foreign_keys") == 1
        assert pragma(db, "busy_timeout") == 30000
    finally:
        db.close()


def test_connect_db_enforces_foreign_keys(tmp_path: Path) -> None:
    common = load_script("_common")
    db = common.connect_db(tmp_path / "engine.sqlite3")
    try:
        db.execute("create table parents(id integer primary key)")
        db.execute(
            "create table children(id integer primary key, parent_id integer references parents(id))"
        )
        with pytest.raises(sqlite3.IntegrityError):
            db.execute("insert into children(id, parent_id) values (1, 999)")
    finally:
        db.close()


def test_ensure_worker_row_connects_with_coordinator_pragmas(tmp_path: Path) -> None:
    worker = load_script("lmstudio_worker")
    db_path = tmp_path / "engine.sqlite3"
    setup = sqlite3.connect(db_path)
    with setup:
        setup.execute(
            "create table workers(id text primary key, name text, token_hash text,"
            " capabilities text, last_seen text, status text, current_job_id text, created_at text)"
        )
        setup.execute(
            "insert into workers(id, name, token_hash, capabilities, last_seen, status, current_job_id, created_at)"
            " values ('src-id', 'mac-mini', 'hash', '[]', '', 'online', NULL, '')"
        )
    setup.close()

    worker.ensure_worker_row(
        db_path,
        worker_id="lm-1",
        worker_name="mac-mini-lmstudio",
        capability="lmstudio:test-model",
        token_source_worker="mac-mini",
    )

    check = sqlite3.connect(db_path)
    try:
        assert pragma(check, "journal_mode") == "wal"
        row = check.execute("select name, token_hash, status from workers where id = 'lm-1'").fetchone()
    finally:
        check.close()
    assert row == ("mac-mini-lmstudio", "hash", "online")


def test_configure_local_single_machine_connects_with_coordinator_pragmas(tmp_path: Path) -> None:
    db_path = tmp_path / "engine.sqlite3"
    setup = sqlite3.connect(db_path)
    with setup:
        setup.execute("create table settings(key text primary key, value text, updated_at text)")
    setup.close()

    report = tmp_path / "report.json"
    proc = subprocess.run(
        [
            sys.executable,
            str(SCRIPTS_DIR / "configure_local_single_machine.py"),
            "--database",
            str(db_path),
            "--dry-run",
            "--report-path",
            str(report),
        ],
        text=True,
        capture_output=True,
        check=False,
    )
    assert proc.returncode == 0, proc.stderr

    check = sqlite3.connect(db_path)
    try:
        assert pragma(check, "journal_mode") == "wal"
    finally:
        check.close()
    assert report.exists()


def test_probe_lmstudio_worker_job_connects_with_coordinator_pragmas(tmp_path: Path) -> None:
    # The scratch DB has no schema, so the probe fails fast at its first
    # INSERT — before any waiting or worker fallback. The assertion is only
    # that the connection it opened carried the coordinator PRAGMAs.
    db_path = tmp_path / "engine.sqlite3"
    proc = subprocess.run(
        [
            sys.executable,
            str(SCRIPTS_DIR / "probe_lmstudio_worker_job.py"),
            "--database",
            str(db_path),
            "--report-path",
            str(tmp_path / "report.json"),
        ],
        text=True,
        capture_output=True,
        check=False,
    )
    assert proc.returncode != 0

    check = sqlite3.connect(db_path)
    try:
        assert pragma(check, "journal_mode") == "wal"
    finally:
        check.close()
