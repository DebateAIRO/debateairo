from __future__ import annotations

from contextlib import contextmanager
from threading import RLock
from typing import Iterator

from sqlalchemy.orm import Session

_write_lock = RLock()


def flush_write(db: Session) -> None:
    with _write_lock:
        db.flush()


def commit_write(db: Session) -> None:
    with _write_lock:
        db.commit()


@contextmanager
def hold_write_lock() -> Iterator[None]:
    """Expose the same process-wide RLock that flush_write/commit_write use.

    RLock is reentrant, so a caller that reads-then-writes under this lock and
    later calls flush_write/commit_write (which re-acquire the same lock) is
    safe -- the outer acquisition here is what actually closes any read/write
    race, since a nested flush_write/commit_write call is a no-op re-entry on
    the same thread's already-held lock, not a second independent acquisition.

    Used by app.models.entities.next_analyzer_run_seq to make the
    MAX(seq)+1 read and the row's flush a single atomic critical section (see
    that function's docstring for why lock-around-the-read alone is
    insufficient).
    """
    with _write_lock:
        yield
