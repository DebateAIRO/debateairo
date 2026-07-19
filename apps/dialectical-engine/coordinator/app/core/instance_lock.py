"""W5b single-instance startup guard.

Incident class: an orphaned old coordinator still bound on :8000 while a new
one runs on :8010 -- two writers against one SQLite database silently fight
over job state. At lifespan startup the coordinator takes an exclusive
ADVISORY lock on a lockfile derived from the database path; a second
coordinator process against the same database fails fast with a clear error
instead of becoming a hidden second writer. `DIALECTICAL_ALLOW_MULTI_INSTANCE=1`
bypasses the guard for deliberate multi-instance setups.

Platform notes (imports guarded per-platform):
- POSIX: ``fcntl.flock(LOCK_EX | LOCK_NB)`` -- released automatically by the
  OS if the process dies, so a crashed coordinator never wedges restarts.
- Windows: ``msvcrt.locking(LK_NBLCK)`` on the first byte, same semantics.

Re-entrancy: locks are tracked per lockfile path with a refcount, so multiple
app lifecycles inside ONE process (e.g. overlapping TestClient contexts in
the test suite) share the held lock instead of self-colliding -- ``flock``
treats a second open of the same file as a different lock owner even within
one process. A genuinely different process still conflicts.
"""
from __future__ import annotations

import logging
import os
import threading
from pathlib import Path
from typing import IO

from sqlalchemy.engine import make_url

from app.core.config import bool_env

if os.name == "nt":  # pragma: no cover - exercised only on Windows hosts
    import msvcrt

    fcntl = None
else:
    import fcntl

    msvcrt = None

LOGGER = logging.getLogger(__name__)

MULTI_INSTANCE_ENV = "DIALECTICAL_ALLOW_MULTI_INSTANCE"
LOCKFILE_SUFFIX = ".coordinator.lock"

_holders: dict[str, tuple[IO[bytes], int]] = {}
_holders_guard = threading.Lock()


class SingleInstanceLockError(RuntimeError):
    """A second coordinator instance targeted an already-locked database."""


def lockfile_path_for_database_url(database_url: str) -> Path | None:
    """Lockfile next to the SQLite database file; None when no lock applies.

    Non-file databases (in-memory SQLite, server databases) have no lockfile
    to derive -- server databases bring their own concurrency story and the
    guard deliberately stays out of the way.
    """
    try:
        url = make_url(database_url)
    except Exception:
        return None
    if url.get_backend_name() != "sqlite":
        return None
    database = url.database
    if not database or database == ":memory:":
        return None
    db_path = Path(database).expanduser()
    return db_path.with_name(db_path.name + LOCKFILE_SUFFIX)


def _lock_exclusive_nonblocking(handle: IO[bytes]) -> None:
    if fcntl is not None:
        fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    else:  # pragma: no cover - Windows-only
        handle.seek(0)
        msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)


def _unlock(handle: IO[bytes]) -> None:
    if fcntl is not None:
        fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
    else:  # pragma: no cover - Windows-only
        handle.seek(0)
        msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)


def multi_instance_allowed() -> bool:
    return bool_env(MULTI_INSTANCE_ENV, False)


def acquire_single_instance_lock(database_url: str) -> str | None:
    """Acquire (or re-enter) the exclusive instance lock for this database.

    Returns the lockfile path key to pass to release_single_instance_lock,
    or None when no lock applies (override env, non-file database). Raises
    SingleInstanceLockError when another process already holds the lock.
    """
    if multi_instance_allowed():
        LOGGER.warning(
            "single-instance guard disabled via %s=1 -- multiple coordinators "
            "may now write the same database",
            MULTI_INSTANCE_ENV,
        )
        return None
    lockfile = lockfile_path_for_database_url(database_url)
    if lockfile is None:
        return None
    key = str(lockfile)
    with _holders_guard:
        held = _holders.get(key)
        if held is not None:
            handle, count = held
            _holders[key] = (handle, count + 1)
            return key
        lockfile.parent.mkdir(parents=True, exist_ok=True)
        handle = open(lockfile, "a+b")
        try:
            _lock_exclusive_nonblocking(handle)
        except OSError as exc:
            handle.close()
            raise SingleInstanceLockError(
                f"Another coordinator instance already holds the writer lock for "
                f"database {database_url!r} (lockfile {key}). Two coordinators on "
                f"one database corrupt job state -- stop the other instance, or set "
                f"{MULTI_INSTANCE_ENV}=1 to deliberately allow multiple instances."
            ) from exc
        try:
            # Cosmetic operator breadcrumb: which pid holds the lock.
            handle.seek(0)
            handle.truncate()
            handle.write(str(os.getpid()).encode("ascii"))
            handle.flush()
        except OSError:  # pragma: no cover - breadcrumb only, lock already held
            pass
        _holders[key] = (handle, 1)
        return key


def release_single_instance_lock(key: str | None) -> None:
    """Release one re-entrant hold; the OS lock drops with the last hold."""
    if not key:
        return
    with _holders_guard:
        held = _holders.get(key)
        if held is None:
            return
        handle, count = held
        if count > 1:
            _holders[key] = (handle, count - 1)
            return
        try:
            _unlock(handle)
        except OSError:  # pragma: no cover - releasing best-effort
            LOGGER.exception("failed to unlock instance lockfile %s", key)
        finally:
            handle.close()
            _holders.pop(key, None)
