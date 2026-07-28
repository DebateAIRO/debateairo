from __future__ import annotations

from contextlib import contextmanager
from threading import Lock, RLock
from typing import Iterator

from sqlalchemy import event
from sqlalchemy.orm import Session

_write_lock = RLock()
_sqlite_writer_gate = Lock()
_WRITER_GATE_INFO_KEY = "_dialectical_sqlite_writer_gate"


def _uses_sqlite(db: Session) -> bool:
    bind = db.get_bind()
    return bind.dialect.name == "sqlite"


def _acquire_writer_gate(db: Session) -> None:
    """Own SQLite's single-writer gate until the outer transaction ends.

    A flush starts (and retains) SQLite's RESERVED write transaction. Releasing
    only the short-lived RLock after that flush allowed another thread to take
    the RLock and block inside SQLite, while the RESERVED holder simultaneously
    needed the RLock to commit: RLock -> RESERVED versus RESERVED -> RLock.
    Holding this transaction-scoped gate closes that inversion by ensuring no
    second in-process writer can enter SQLite until the first transaction has
    committed or rolled back.
    """
    if not _uses_sqlite(db) or db.info.get(_WRITER_GATE_INFO_KEY):
        return
    _sqlite_writer_gate.acquire()
    db.info[_WRITER_GATE_INFO_KEY] = True


def _release_writer_gate(db: Session) -> None:
    if db.info.pop(_WRITER_GATE_INFO_KEY, False):
        _sqlite_writer_gate.release()


@event.listens_for(Session, "after_transaction_end")
def _release_writer_gate_after_transaction(
    session: Session, transaction: object
) -> None:
    # A flush creates an internal/nested SessionTransaction. Only the end of
    # the outer transaction releases SQLite's writer ownership.
    if getattr(transaction, "parent", None) is None:
        _release_writer_gate(session)


def _check_out_connection_first(db: Session, *, unconditional: bool) -> None:
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

    `unconditional` IS THE WHOLE DESIGN, and it is stated per call site rather
    than defaulted, because getting it wrong is silent (corrected 2026-07-27,
    Mandate D follow-up 1 -- the first shipped version gated every primitive and
    the gate turned hold_write_lock back into a no-op at the incident site).

    unconditional=False -- flush_write / commit_write. A session with genuinely
    nothing pending has no connection and nothing to write, and warming it would
    give it a pointless checkout plus, on a saturated pool, a 30s block and a
    TimeoutError those two functions could never raise before. Their gate is
    sound because pending work ALWAYS shows as in_transaction() == True:
    SQLAlchemy 2.0 autobegins on the first add()/execute(), and even setting an
    attribute on an expired instance triggers a load that autobegins and checks
    out. That is the victim path -- claim_pending_job's `UPDATE workers SET
    last_seen` reaching commit_write with rows pending and no connection yet.

    unconditional=True -- hold_write_lock. Its callers by construction intend to
    touch the database inside the critical section (that is what a read-then-
    write critical section IS), so there is no "nothing to do" case for a gate
    to protect, and the empty-commit rationale above simply does not apply.

    WHAT in_transaction() DOES AND DOES NOT MEAN (corrected 2026-07-27). The
    original text here claimed it is False "only" for a session that has done
    nothing at all. That was WRONG, and the error was load-bearing: it is also
    False after any commit() or rollback(), both of which close the
    SessionTransaction and RETURN the pooled connection (probed: checkedout()
    drops to 0 after either). That is precisely the incident state --
    evaluate_evidence_verdict commits before the judge CLI
    (verification_evaluator.py:610) and rolls back after it (:620), then enters
    hold_write_lock(db) at :417 owning no connection with the flag False. Under
    the old gate the warm was skipped and _first_branch(db, debate.id) at :464
    -- the exact frame in the incident's TimeoutError traceback -- checked out
    INSIDE the lock. Pinned red-first by
    test_hold_write_lock_never_queues_for_a_connection_inside_the_lock.

    When the session already holds its connection this is a cheap no-op either
    way.
    """

    if unconditional or db.in_transaction():
        db.connection()


def flush_write(db: Session) -> None:
    _check_out_connection_first(db, unconditional=False)
    _acquire_writer_gate(db)
    try:
        with _write_lock:
            db.flush()
    except BaseException:
        # A failed flush leaves the Session unusable until rollback. Roll back
        # here so the transaction-scoped writer gate can never leak if a
        # caller propagates the exception without cleaning the Session first.
        db.rollback()
        raise


def commit_write(db: Session) -> None:
    _check_out_connection_first(db, unconditional=False)
    if db.info.get(_WRITER_GATE_INFO_KEY) or db.new or db.dirty or db.deleted:
        _acquire_writer_gate(db)
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
    checked out before the lock is taken. An optional parameter would let a
    call site silently reintroduce the 2026-07-26 inversion -- which is exactly
    how it got in, at verification_evaluator.py:464, where the FIRST statement
    inside the lock was the one that needed a connection. The warm here is
    UNCONDITIONAL, unlike flush_write/commit_write's; see
    _check_out_connection_first for why the gate is right there and wrong here.

    WHAT THIS DOES NOT GUARANTEE (corrected 2026-07-27). The original text here
    claimed "the body can never be the thing that queues for a connection while
    holding the lock". That is FALSE and reads as a proof of an invariant this
    code does not have. The warm covers the connection the body starts with; it
    cannot cover one the body throws away. Any db.commit() / db.rollback() /
    commit_write(db) inside the block returns the pooled connection, and the
    next statement checks a new one out UNDER the lock -- the inversion again,
    and now with a queued writer already pinning a slot (every RLock waiter
    holds one since da3a566), a closed wait-for cycle that only pool_timeout
    breaks. Reproduced by
    test_a_writer_queueing_on_the_lock_cannot_wedge_the_lock_holder.

    So the invariant is a CONVENTION on the bodies, not a property of this
    contextmanager, and it is enforced where conventions can be:
    tests/test_write_lock_conventions.py scans every hold_write_lock block
    (following module-local helper calls) and fails on a release followed by
    further database work. app/scoring/jobs.py's waker had exactly that shape
    and was restructured so each of its critical sections ends at its commit.
    """
    _check_out_connection_first(db, unconditional=True)
    _acquire_writer_gate(db)
    with _write_lock:
        yield
