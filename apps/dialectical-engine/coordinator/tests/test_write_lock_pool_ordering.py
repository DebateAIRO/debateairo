"""The 2026-07-26 21:08 coordinator wedge: the process write lock must never be
held across a blocking connection-pool checkout.

INCIDENT. A writer held SQLite's RESERVED lock for >30s repeatedly on the live
coordinator, starving worker heartbeats (`UPDATE workers SET last_seen`), poll
claim-commits and job `deadline` refreshes into "database is locked" after their
30s busy_timeout. The err log carried 141 `QueuePool limit of size 5 overflow 10
reached, connection timed out, timeout 30.00` failures clustered immediately
BEFORE each lock victim, and one of them names the exact site:

    verification_evaluator.py, line 464, in _persist_verification_attempt_locked
        branch = _first_branch(db, debate.id)
      ...
    sqlalchemy.exc.TimeoutError: QueuePool limit of size 5 overflow 10 reached

Line 464 is the FIRST database access inside `with hold_write_lock():`, and
`evaluate_evidence_verdict` reaches it having just released the session's
connection (the pre-CLI `commit_write`, then the post-CLI `db.rollback()`). So
the checkout happens INSIDE the critical section.

THE INVERSION. Every write primitive in app.core.write_lock takes the
process-wide RLock and THEN talks to SQLAlchemy, which may need to check out a
pooled connection. That orders the two resources RLock -> pool. But a session
that already owns a connection and has FLUSHED (RESERVED held) orders them
pool -> RLock: it needs the RLock to commit and release RESERVED. The two
orders together are a textbook lock-ordering deadlock, and the pool is finite
(5 + 10 overflow by default in app/core/db.py), so it happens whenever the
coordinator is busy enough to saturate it:

  * thread A holds the RLock and blocks up to pool_timeout (30s) for a slot;
  * the RESERVED holder cannot commit -- committing needs A's RLock;
  * every other writer that wins the RLock next blocks inside SQLite on that
    still-held RESERVED lock and dies at busy_timeout with "database is locked".

Nothing breaks it but a timeout, which is why the holds were repeatedly >30s.

THE RULE, and it is general: acquire the connection BEFORE the write lock, never
inside it. The write lock serializes writers; it must never also be the thing
you hold while queueing for a connection.
"""
from __future__ import annotations

import threading
import time
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

import app.core.write_lock as write_lock
from app.core.write_lock import commit_write, flush_write
from app.models.entities import Setting

# Long enough that a wedged run is unambiguous, short enough that a red test
# fails the suite in seconds instead of the production 30.
POOL_TIMEOUT_SECONDS = 5.0


@pytest.fixture()
def tiny_pool(tmp_path):
    """A real file-backed engine whose pool holds exactly `size` connections.

    File-backed, not :memory:, because the whole subject is SQLite's real
    cross-connection locking. The connect-time listener in app.core.db applies
    WAL and busy_timeout=30000 to this engine too (it is registered on the
    Engine class), so these connections behave exactly like production's.
    """

    def _make(size: int):
        engine = create_engine(
            f"sqlite:///{tmp_path}/pool-ordering.sqlite3",
            connect_args={"check_same_thread": False},
            pool_size=size,
            max_overflow=0,
            pool_timeout=POOL_TIMEOUT_SECONDS,
            future=True,
        )
        Setting.__table__.create(bind=engine, checkfirst=True)
        return engine, sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)

    engines: list = []

    def _tracked(size: int):
        engine, factory = _make(size)
        engines.append(engine)
        return engine, factory

    yield _tracked
    for engine in engines:
        engine.dispose()


def _write_lock_is_free() -> bool:
    """True iff no OTHER thread holds the process write lock.

    Sound from the main thread specifically: the RLock is reentrant, so this
    would spuriously succeed if the calling thread already held it, and the
    main thread never does in these tests.
    """
    if write_lock._write_lock.acquire(blocking=False):
        write_lock._write_lock.release()
        return True
    return False


def _pending_setting(session) -> None:
    session.add(Setting(key=f"probe-{uuid4().hex}", value={"probe": True}))


def test_write_primitives_do_not_hold_the_lock_across_a_pool_checkout(tiny_pool) -> None:
    """RED before the fix: `flush_write` takes the RLock, then queues for a
    connection, so the lock stays held for the whole pool wait.

    This is the invariant in its purest form and it is deterministic: with the
    pool saturated, the flushing thread cannot proceed, and the only question is
    whether it is sitting on the process write lock while it waits.
    """

    _engine, Session = tiny_pool(1)

    # Saturate: one connection in the pool, and this session owns it.
    hog = Session()
    hog.execute(text("SELECT 1"))

    about_to_flush = threading.Event()
    outcome: dict[str, object] = {}

    def blocked_writer() -> None:
        session = Session()
        _pending_setting(session)
        about_to_flush.set()
        started = time.monotonic()
        try:
            flush_write(session)
            outcome["flushed"] = True
        except Exception as exc:  # the pool timeout, expected while saturated
            outcome["error"] = type(exc).__name__
        finally:
            outcome["seconds"] = time.monotonic() - started
            session.rollback()
            session.close()

    thread = threading.Thread(target=blocked_writer, daemon=True)
    thread.start()
    try:
        assert about_to_flush.wait(5), "writer thread never reached flush_write"

        # Give it time to actually enter flush_write and block in the pool,
        # then assert the invariant for as long as it is demonstrably stuck.
        deadline = time.monotonic() + POOL_TIMEOUT_SECONDS * 0.6
        observed = 0
        while time.monotonic() < deadline and thread.is_alive():
            assert _write_lock_is_free(), (
                "the process write lock was held while a writer queued for a "
                "connection -- this is the 2026-07-26 wedge: a session holding "
                "SQLite RESERVED now cannot commit, because committing needs "
                "this very lock, and every other writer dies on busy_timeout"
            )
            observed += 1
            time.sleep(0.02)

        assert thread.is_alive(), "the writer was never actually blocked; test is not exercising the seam"
        assert observed > 0
    finally:
        hog.rollback()
        hog.close()
        thread.join(POOL_TIMEOUT_SECONDS + 5)


def test_a_reserved_holder_can_commit_while_another_writer_waits_for_a_pool_slot(tiny_pool) -> None:
    """The incident end to end, with the real victim shape.

    `holder` is the production `commit=False` shape -- flushed under the lock,
    RESERVED held, lock released -- which is exactly what
    `_persist_verification_attempt(commit=False)` leaves behind. `waiter` is the
    lifecycle tail's next locked persist, queueing for a connection. `victim` is
    a worker heartbeat.

    Under the inversion the holder cannot commit until the waiter's pool timeout
    expires, so the victim waits out busy_timeout and dies "database is locked".
    """

    _engine, Session = tiny_pool(2)

    # Connection 1: a session that has FLUSHED and not committed -> RESERVED.
    holder = Session()
    _pending_setting(holder)
    flush_write(holder)

    # Connection 2: saturate the rest of the pool.
    hog = Session()
    hog.execute(text("SELECT 1"))

    about_to_flush = threading.Event()
    waiter_outcome: dict[str, object] = {}

    def waiter() -> None:
        session = Session()
        _pending_setting(session)
        about_to_flush.set()
        try:
            flush_write(session)
        except Exception as exc:
            waiter_outcome["error"] = type(exc).__name__
        finally:
            session.rollback()
            session.close()

    waiting = threading.Thread(target=waiter, daemon=True)
    waiting.start()

    try:
        assert about_to_flush.wait(5)
        time.sleep(0.2)  # let the waiter reach the pool queue

        # THE ASSERTION: the RESERVED holder must be able to commit right now.
        # commit_write needs the process write lock; under the inversion the
        # waiter is sitting on it for the whole pool timeout.
        started = time.monotonic()
        commit_write(holder)
        elapsed = time.monotonic() - started

        assert elapsed < POOL_TIMEOUT_SECONDS * 0.5, (
            f"the RESERVED holder was blocked {elapsed:.1f}s from committing by a "
            "writer queueing for a connection while holding the process write "
            "lock; in production that is a >30s RESERVED hold and every "
            "concurrent short writer dies with 'database is locked'"
        )
    finally:
        holder.rollback()
        holder.close()
        hog.rollback()
        hog.close()
        waiting.join(POOL_TIMEOUT_SECONDS + 5)
