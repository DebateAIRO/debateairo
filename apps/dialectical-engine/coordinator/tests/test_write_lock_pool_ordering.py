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
from app.core.write_lock import commit_write, flush_write, hold_write_lock
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


def _incident_shape_session(Session):
    """A session in `evaluate_evidence_verdict`'s post-CLI state.

    `verification_evaluator.py:610` commits before the judge CLI and
    `:620` rolls back after it. Both close the SessionTransaction and RETURN
    the pooled connection (probed: `checkedout()` drops to 0 after either), so
    the session that then enters `hold_write_lock(db)` at `:417` owns no
    connection AND reports `in_transaction() == False`. That combination is the
    whole point of these two tests: it is the exact state in which the entry
    gate has nothing to key on, and the first statement inside the lock --
    `_first_branch(db, debate.id)` at `:464`, the frame the incident's own
    `TimeoutError` traceback names -- is the one that queues for a slot.

    Built before the pool is saturated, because reaching this state requires a
    connection of its own.
    """

    session = Session()
    _pending_setting(session)
    session.commit()  # the pre-CLI commit_write
    session.rollback()  # the post-CLI rollback
    assert not session.in_transaction(), "the incident shape requires an idle session"
    return session


def test_hold_write_lock_never_queues_for_a_connection_inside_the_lock(tiny_pool) -> None:
    """RED before follow-up 1: `hold_write_lock`'s entry gate skips the warm on
    a session that has just committed and rolled back, so the body's first
    statement checks out UNDER the lock -- the original inversion, at the exact
    frame the 21:08 forensics named.

    `flush_write`/`commit_write` are gated on `in_transaction()` for a real
    reason (an empty commit must not gain a checkout it never needed, and with
    it a `TimeoutError` it could never raise before). `hold_write_lock` is a
    different contract: a caller only takes a read-then-write critical section
    in order to touch the database inside it, so there is no "nothing to do"
    case to protect and the gate buys nothing but the hole this test pins.
    """

    _engine, Session = tiny_pool(1)

    session = _incident_shape_session(Session)

    # Saturate: one connection in the pool, and the hog owns it.
    hog = Session()
    hog.execute(text("SELECT 1"))

    entering = threading.Event()
    outcome: dict[str, object] = {}

    def locked_reader() -> None:
        entering.set()
        started = time.monotonic()
        try:
            with hold_write_lock(session):
                # `_first_branch(db, debate.id)`'s stand-in: the first
                # statement inside the critical section, needing a connection.
                session.execute(text("SELECT count(*) FROM settings"))
            outcome["read"] = True
        except Exception as exc:  # the pool timeout, expected while saturated
            outcome["error"] = type(exc).__name__
        finally:
            outcome["seconds"] = time.monotonic() - started
            session.rollback()
            session.close()

    thread = threading.Thread(target=locked_reader, daemon=True)
    thread.start()
    try:
        assert entering.wait(5), "reader thread never reached hold_write_lock"

        deadline = time.monotonic() + POOL_TIMEOUT_SECONDS * 0.6
        observed = 0
        while time.monotonic() < deadline and thread.is_alive():
            assert _write_lock_is_free(), (
                "the process write lock was held while a hold_write_lock body "
                "queued for a connection -- this is verification_evaluator.py:464 "
                "verbatim: the RESERVED holder now cannot commit, because "
                "committing needs this very lock, and every other writer dies "
                "on busy_timeout with 'database is locked'"
            )
            observed += 1
            time.sleep(0.02)

        assert thread.is_alive(), "the reader was never actually blocked; test is not exercising the seam"
        assert observed > 0
    finally:
        hog.rollback()
        hog.close()
        thread.join(POOL_TIMEOUT_SECONDS + 5)


def test_a_writer_queueing_on_the_lock_cannot_wedge_the_lock_holder(tiny_pool) -> None:
    """The circular wait the post-hoc review raised against the fix itself.

    Since `da3a566`, a thread merely WAITING on the RLock already holds a pool
    slot (the checkout happens before `with _write_lock`). Pair that with a
    lock HOLDER that needs a NEW slot from inside the lock and the wait-for
    graph closes: holder -> pool -> waiter -> RLock -> holder. Nothing breaks it
    but `pool_timeout` (30s in production), and the RESERVED holder starves for
    the whole of it -- the very outcome the commit set out to make impossible.

    The cycle is real, and this test is red today. But it is a strict
    consequence of the holder's in-lock checkout, not of the pre-lock one: a
    lock holder that needs no new resource always completes, so the RLock is
    always eventually released and the graph never closes. That is why the fix
    is to warm `hold_write_lock` unconditionally (follow-up 1) rather than to
    move the checkout back inside the lock -- the latter is the 2026-07-26
    inversion, and `test_write_primitives_do_not_hold_the_lock_across_a_pool_checkout`
    is already red for it.

    The residual is pool PRESSURE, not deadlock: each queued writer pins one
    slot, so beyond `pool_size + max_overflow` concurrent writers the surplus
    fails with `TimeoutError` from `_check_out_connection_first` -- raised
    before the lock is taken, so no writer is ever starved into busy_timeout.
    """

    _engine, Session = tiny_pool(2)

    holder_session = _incident_shape_session(Session)

    # Slot 1 of 2.
    hog = Session()
    hog.execute(text("SELECT 1"))

    in_lock = threading.Event()
    waiter_pinned = threading.Event()
    holder_outcome: dict[str, object] = {}
    waiter_outcome: dict[str, object] = {}

    def holder() -> None:
        started = time.monotonic()
        try:
            with hold_write_lock(holder_session):
                in_lock.set()
                # Give the waiter its chance to pin the last slot and queue on
                # the RLock. Post-fix it cannot: this thread warmed before the
                # lock, so the pool is already empty and the waiter blocks
                # OUTSIDE the lock, which is exactly the point.
                waiter_pinned.wait(0.5)
                holder_session.execute(text("SELECT count(*) FROM settings"))
            holder_outcome["read"] = True
        except Exception as exc:
            holder_outcome["error"] = type(exc).__name__
        finally:
            holder_outcome["seconds"] = time.monotonic() - started
            holder_session.rollback()
            holder_session.close()

    def waiter() -> None:
        session = Session()
        _pending_setting(session)
        try:
            # Precisely what `_check_out_connection_first` leaves a queued
            # writer holding: the slot, taken before the lock is contended.
            session.connection()
            waiter_pinned.set()
            commit_write(session)
            waiter_outcome["committed"] = True
        except Exception as exc:
            waiter_outcome["error"] = type(exc).__name__
        finally:
            session.rollback()
            session.close()

    holding = threading.Thread(target=holder, daemon=True)
    waiting = threading.Thread(target=waiter, daemon=True)
    holding.start()
    try:
        assert in_lock.wait(5), "holder never entered hold_write_lock"
        waiting.start()
        holding.join(POOL_TIMEOUT_SECONDS + 5)
        waiting.join(POOL_TIMEOUT_SECONDS + 5)

        assert holder_outcome.get("error") is None, (
            f"the lock holder failed with {holder_outcome.get('error')} after "
            f"{holder_outcome.get('seconds', 0):.1f}s: it queued for a pool slot "
            "from inside the critical section while a writer that already owns a "
            "slot queued on the lock -- a circular wait that only pool_timeout "
            "breaks, and in production that is a 30s RESERVED hold"
        )
        assert holder_outcome.get("read") is True
        assert waiter_outcome.get("error") is None, (
            f"the queued writer failed with {waiter_outcome.get('error')}"
        )
        assert waiter_outcome.get("committed") is True
    finally:
        hog.rollback()
        hog.close()
        holding.join(POOL_TIMEOUT_SECONDS + 5)
        waiting.join(POOL_TIMEOUT_SECONDS + 5)


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
