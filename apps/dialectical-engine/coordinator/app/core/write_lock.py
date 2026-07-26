from __future__ import annotations

from contextlib import contextmanager
from threading import RLock
from typing import Iterator

from sqlalchemy.orm import Session

_write_lock = RLock()


def _check_out_connection_first(db: Session) -> None:
    """Take this session's pooled connection BEFORE the write lock, never inside.

    THE RULE: acquire the connection first, the write lock second. Both of the
    process's scarce resources are ordered that way here, and nothing may
    reverse it.

    WHY (2026-07-26 21:08 incident, coordinator PID 4828). Every primitive in
    this module used to take the RLock and THEN talk to SQLAlchemy, which checks
    out a pooled connection if the session has none. app/core/db.py builds the
    engine with SQLAlchemy's defaults -- QueuePool, 5 connections plus 10
    overflow, 30s checkout timeout -- so on a busy coordinator that checkout
    BLOCKS, and it blocked with the write lock held.

    That is a lock-ordering inversion, because a session that already owns a
    connection and has FLUSHED holds SQLite's single RESERVED writer and needs
    the RLock to commit and release it: it orders the resources pool -> RLock,
    while the primitives ordered them RLock -> pool. The two orders together
    deadlock, and nothing breaks the deadlock but a timeout:

      * the thread inside the lock waits out pool_timeout (30s) for a slot;
      * the RESERVED holder cannot commit -- committing needs that RLock;
      * every other writer that wins the RLock next blocks inside SQLite on the
        still-held RESERVED lock and dies at busy_timeout=30000 with
        "database is locked".

    The err log caught it exactly: 141 "QueuePool limit of size 5 overflow 10
    reached" failures clustered immediately before the lock victims, one of them
    raised at verification_evaluator.py:464 -- the FIRST database access inside
    `with hold_write_lock():`, reached with the session's connection just
    released by evaluate_evidence_verdict's pre-CLI commit and post-CLI
    rollback. The victims were `UPDATE workers SET last_seen` (113 of 133),
    `UPDATE jobs SET deadline` and the poll claim-commits, all of them dying
    INSIDE commit_write, i.e. holding this RLock while SQLite refused them.

    Session.connection() is the right primitive because it checks out the
    connection and takes NO SQLite lock: pysqlite emits BEGIN only ahead of DML
    (app/core/db.py builds the sessionmaker with autoflush=False and nothing
    uses the isolation_level=None + explicit-BEGIN recipe), which is the same
    established mechanism app/scoring/service.py's pre-CLI commit comment
    documents. So this moves the QUEUEING outside the critical section without
    moving any lock acquisition into it.

    It is not a way to make the pool bigger, and it does not stop pool
    exhaustion: a saturated pool still makes writers wait here. What it
    guarantees is that they wait WITHOUT the write lock, so a RESERVED holder
    can always still commit and no writer is ever starved into busy_timeout.

    GATED ON in_transaction(), deliberately. A session that has done nothing at
    all has no connection AND nothing to write -- SQLAlchemy 2.0 autobegins on
    the first add()/execute(), so in_transaction() is False only in that case.
    Warming unconditionally would give such a session a pointless checkout, and
    on a saturated pool would turn a genuinely empty commit_write into a 30s
    block and then a TimeoutError it never used to be able to raise. When there
    IS pending work the flag is already True (add() autobegins), which is
    exactly the victim path -- claim_pending_job's `UPDATE workers SET
    last_seen` reaching commit_write with rows pending and no connection yet.
    When the session already holds its connection this is a cheap no-op.
    """

    if db.in_transaction():
        db.connection()


def flush_write(db: Session) -> None:
    _check_out_connection_first(db)
    with _write_lock:
        db.flush()


def commit_write(db: Session) -> None:
    _check_out_connection_first(db)
    with _write_lock:
        db.commit()


@contextmanager
def hold_write_lock(db: Session) -> Iterator[None]:
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

    `db` is REQUIRED, not optional, and that is the point: its connection is
    checked out before the lock is taken, so the body can never be the thing
    that queues for a connection while holding the lock. An optional parameter
    would let a call site silently reintroduce the 2026-07-26 inversion --
    which is exactly how it got in, at verification_evaluator.py:464, where the
    FIRST statement inside the lock was the one that needed a connection. See
    _check_out_connection_first for the full mechanism.
    """
    _check_out_connection_first(db)
    with _write_lock:
        yield
