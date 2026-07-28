from __future__ import annotations

import threading
import time
from uuid import uuid4

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.core.write_lock import commit_write, flush_write
from app.models.entities import Setting


def test_flushed_writer_can_commit_while_second_writer_waits(tmp_path) -> None:
    """A RESERVED holder must never need a lock owned by its own waiter.

    This is the exact live completion/scoring race: one request flushes and
    retains SQLite's RESERVED writer, a second writer arrives, and then the
    first request commits. Before the transaction-scoped gate, writer two held
    the process RLock while waiting in SQLite and writer one therefore could
    not commit until busy_timeout expired.
    """
    engine = create_engine(
        f"sqlite:///{tmp_path}/transaction-gate.sqlite3",
        connect_args={"check_same_thread": False},
        pool_size=4,
        future=True,
    )

    @event.listens_for(engine, "connect")
    def short_busy_timeout(connection, _record) -> None:
        connection.execute("PRAGMA busy_timeout=500")

    Setting.__table__.create(bind=engine)
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    holder = Session()
    waiter_started = threading.Event()
    waiter_done = threading.Event()
    waiter_error: list[BaseException] = []

    holder.add(Setting(key=f"holder-{uuid4().hex}", value={"writer": 1}))
    flush_write(holder)

    def wait_for_writer() -> None:
        db = Session()
        try:
            db.add(Setting(key=f"waiter-{uuid4().hex}", value={"writer": 2}))
            waiter_started.set()
            commit_write(db)
        except BaseException as exc:  # pragma: no cover - assertion reports it
            waiter_error.append(exc)
        finally:
            db.rollback()
            db.close()
            waiter_done.set()

    thread = threading.Thread(target=wait_for_writer, daemon=True)
    thread.start()
    try:
        assert waiter_started.wait(2)
        time.sleep(0.05)
        started = time.monotonic()
        commit_write(holder)
        assert time.monotonic() - started < 0.4
        assert waiter_done.wait(2)
        assert not waiter_error
    finally:
        holder.rollback()
        holder.close()
        thread.join(2)
        engine.dispose()
