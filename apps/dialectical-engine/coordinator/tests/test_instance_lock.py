"""W5b: single-instance startup guard.

A second coordinator process against the same SQLite database must fail fast
(exclusive advisory lock on a lockfile derived from the DB path) unless
DIALECTICAL_ALLOW_MULTI_INSTANCE=1. Tests use tmp databases only and never
touch the live stack.
"""
from __future__ import annotations

import subprocess
import sys
import textwrap
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.instance_lock import (
    SingleInstanceLockError,
    acquire_single_instance_lock,
    lockfile_path_for_database_url,
    release_single_instance_lock,
)
from app.main import app

_FLOCK_PROBE = textwrap.dedent(
    """
    import sys

    if sys.platform == "win32":
        import msvcrt

        def try_lock(handle):
            handle.seek(0)
            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
    else:
        import fcntl

        def try_lock(handle):
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)

    with open(sys.argv[1], "a+b") as handle:
        try:
            try_lock(handle)
        except OSError:
            print("LOCKED")
        else:
            print("ACQUIRED")
    """
)

_FLOCK_HOLDER = textwrap.dedent(
    """
    import sys

    if sys.platform == "win32":
        import msvcrt

        def try_lock(handle):
            handle.seek(0)
            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
    else:
        import fcntl

        def try_lock(handle):
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)

    handle = open(sys.argv[1], "a+b")
    try_lock(handle)
    print("HOLDING", flush=True)
    sys.stdin.readline()
    """
)


def _probe_lock_from_other_process(lockfile: Path) -> str:
    result = subprocess.run(
        [sys.executable, "-c", _FLOCK_PROBE, str(lockfile)],
        capture_output=True,
        text=True,
        timeout=30,
        check=True,
    )
    return result.stdout.strip()


def test_lockfile_derivation_from_database_url(tmp_path) -> None:
    db_path = tmp_path / "engine.sqlite3"
    lockfile = lockfile_path_for_database_url(f"sqlite:///{db_path}")
    assert lockfile == tmp_path / "engine.sqlite3.coordinator.lock"
    assert lockfile_path_for_database_url("sqlite://") is None
    assert lockfile_path_for_database_url("sqlite:///:memory:") is None
    assert lockfile_path_for_database_url("postgresql://host/db") is None


def test_lock_excludes_other_processes_and_releases(tmp_path) -> None:
    database_url = f"sqlite:///{tmp_path / 'guard.sqlite3'}"
    key = acquire_single_instance_lock(database_url)
    assert key is not None
    try:
        assert _probe_lock_from_other_process(Path(key)) == "LOCKED"
    finally:
        release_single_instance_lock(key)
    assert _probe_lock_from_other_process(Path(key)) == "ACQUIRED"


def test_second_instance_fails_fast_with_clear_error(tmp_path) -> None:
    database_url = f"sqlite:///{tmp_path / 'second.sqlite3'}"
    lockfile = lockfile_path_for_database_url(database_url)
    holder = subprocess.Popen(
        [sys.executable, "-c", _FLOCK_HOLDER, str(lockfile)],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        text=True,
    )
    try:
        assert holder.stdout.readline().strip() == "HOLDING"
        with pytest.raises(SingleInstanceLockError) as excinfo:
            acquire_single_instance_lock(database_url)
        message = str(excinfo.value)
        assert "Another coordinator instance" in message
        assert str(lockfile) in message
        assert "DIALECTICAL_ALLOW_MULTI_INSTANCE" in message
    finally:
        holder.stdin.write("\n")
        holder.stdin.close()
        holder.wait(timeout=30)


def test_multi_instance_override_skips_the_guard(tmp_path, monkeypatch) -> None:
    database_url = f"sqlite:///{tmp_path / 'override.sqlite3'}"
    lockfile = lockfile_path_for_database_url(database_url)
    holder = subprocess.Popen(
        [sys.executable, "-c", _FLOCK_HOLDER, str(lockfile)],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        text=True,
    )
    try:
        assert holder.stdout.readline().strip() == "HOLDING"
        monkeypatch.setenv("DIALECTICAL_ALLOW_MULTI_INSTANCE", "1")
        assert acquire_single_instance_lock(database_url) is None, (
            "the override must allow startup without taking the lock"
        )
    finally:
        holder.stdin.write("\n")
        holder.stdin.close()
        holder.wait(timeout=30)


def test_reentrant_acquire_within_one_process_refcounts(tmp_path) -> None:
    """Overlapping app lifecycles in ONE process (test clients) share the
    held lock; the OS lock drops only with the last release."""
    database_url = f"sqlite:///{tmp_path / 'reentrant.sqlite3'}"
    first = acquire_single_instance_lock(database_url)
    second = acquire_single_instance_lock(database_url)
    assert first == second and first is not None
    release_single_instance_lock(second)
    assert _probe_lock_from_other_process(Path(first)) == "LOCKED", (
        "still held after releasing one of two holds"
    )
    release_single_instance_lock(first)
    assert _probe_lock_from_other_process(Path(first)) == "ACQUIRED"


def test_lifespan_fails_fast_when_lock_is_held_elsewhere(db, monkeypatch) -> None:
    def _conflict(database_url: str) -> str:
        raise SingleInstanceLockError("Another coordinator instance already holds the writer lock")

    monkeypatch.setattr("app.main.acquire_single_instance_lock", _conflict)
    with pytest.raises(SingleInstanceLockError):
        with TestClient(app):
            pass  # pragma: no cover - startup must fail before serving


def test_lifespan_acquires_and_releases_the_real_lock(db) -> None:
    from app.core.db import get_engine

    lockfile = lockfile_path_for_database_url(str(get_engine().url))
    assert lockfile is not None, "the test engine runs on a tmp sqlite file"
    with TestClient(app):
        assert _probe_lock_from_other_process(lockfile) == "LOCKED"
    assert _probe_lock_from_other_process(lockfile) == "ACQUIRED"
