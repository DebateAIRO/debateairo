from __future__ import annotations

import os
import sqlite3
from collections.abc import Mapping

DEFAULT_DEV_USER_TOKEN = "user_dev_token"


def connect_db(db_path: str | os.PathLike[str]) -> sqlite3.Connection:
    """Open the shared SQLite DB with the coordinator's connection PRAGMAs.

    Mirrors coordinator/app/core/db.py set_sqlite_pragma — WAL, enforced
    foreign keys, and a 30s busy_timeout (sqlite3's default is 5s) — so
    out-of-process writers wait out write contention exactly as long as the
    coordinator does and their DELETEs are FK-enforced. Keep in lockstep
    with that listener.
    """
    db = sqlite3.connect(db_path)
    db.execute("PRAGMA journal_mode=WAL")
    db.execute("PRAGMA foreign_keys=ON")
    db.execute("PRAGMA busy_timeout=30000")
    return db


def dev_user_token(environ: Mapping[str, str] | None = None) -> str:
    env = os.environ if environ is None else environ
    configured = env.get("DIALECTICAL_USER_TOKEN", "").strip()
    return configured or DEFAULT_DEV_USER_TOKEN


def mask_secret(value: str) -> str:
    if len(value) <= 8:
        return "***"
    return f"{value[:4]}...{value[-4:]}"
