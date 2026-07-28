from __future__ import annotations

import threading
import time
from uuid import uuid4

from sqlalchemy import create_engine, event, update
from sqlalchemy.orm import sessionmaker

from app.core.write_lock import commit_write, execute_write, flush_write
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


def test_core_dml_waits_at_writer_gate_before_touching_sqlite(tmp_path) -> None:
    """Core UPDATE must not bypass the gate before ``commit_write``.

    This is the live scoring/heartbeat race: a scoring session retains
    SQLite's RESERVED writer after an artifact flush while a request performs
    ``Session.execute(update(...))``.  The execute must wait at our gate, not
    enter SQLite and race the artifact writer.
    """
    engine = create_engine(
        f"sqlite:///{tmp_path}/core-dml-gate.sqlite3",
        connect_args={"check_same_thread": False},
        pool_size=4,
        future=True,
    )

    @event.listens_for(engine, "connect")
    def short_busy_timeout(connection, _record) -> None:
        connection.execute("PRAGMA busy_timeout=100")

    Setting.__table__.create(bind=engine)
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    setup = Session()
    setup.add(Setting(key="shared", value={"writer": 0}))
    setup.commit()
    setup.close()

    holder = Session()
    holder.add(Setting(key=f"holder-{uuid4().hex}", value={"writer": 1}))
    flush_write(holder)

    waiter_started = threading.Event()
    waiter_done = threading.Event()
    waiter_error: list[BaseException] = []

    def run_core_update() -> None:
        db = Session()
        try:
            waiter_started.set()
            execute_write(
                db,
                update(Setting).where(Setting.key == "shared").values(value={"writer": 2}),
            )
            commit_write(db)
        except BaseException as exc:  # pragma: no cover - assertion reports it
            waiter_error.append(exc)
        finally:
            db.rollback()
            db.close()
            waiter_done.set()

    thread = threading.Thread(target=run_core_update, daemon=True)
    thread.start()
    try:
        assert waiter_started.wait(2)
        time.sleep(0.2)
        assert not waiter_done.is_set(), "Core DML bypassed the transaction writer gate"
        commit_write(holder)
        assert waiter_done.wait(2)
        assert not waiter_error
    finally:
        holder.rollback()
        holder.close()
        thread.join(2)
        engine.dispose()
