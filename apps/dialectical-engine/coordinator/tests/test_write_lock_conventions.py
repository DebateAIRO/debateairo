"""Every Session write in app/ must take the process write lock.

app.core.write_lock's RLock is the coordinator's writer-serialization
invariant: flush_write/commit_write (and hold_write_lock for read-then-write
critical sections) are the ONLY ways a session may reach SQLite's RESERVED
writer. A bare `db.flush()` outside that lock opens a write transaction
concurrently with threads that believe the RLock serializes all writers --
the same invariant the 2026-07-26 21:08 incident fix
(test_write_lock_pool_ordering, app.core.write_lock docstrings) hardened from
the other side. The scoring module shipped five such bypasses
(service.py's cache-store/artifact-persist/relink flushes, jobs.py's
current_scoring_branch); these tests exist so a sixth can never land quietly.

Two complementary pins:

* the conventions scan proves NO `db.flush()`/`db.commit()` anywhere in app/
  bypasses the lock, by AST: each such call must be issued from
  app/core/write_lock.py itself or sit lexically inside a
  `with hold_write_lock(...)` block (entities.next_analyzer_run_seq and
  decision_repository's locked persist are the two legitimate in-lock cases);
* the behavioral probe drives one production writer (current_scoring_branch)
  and asserts, from a second thread, that the write lock is actually held at
  the moment its flush runs.

Scope of the scan, stated honestly: it keys on the repo-wide convention that
ORM sessions are named `db` (or `session`) -- a Session bound to another name
would evade it, as would getattr tricks. Raw-connection commits
(app/core/db.py's `connection.commit()` during init/migration) are a
different layer with no Session and no ORM writers racing them, and are
deliberately out of scope.
"""
from __future__ import annotations

import ast
import threading
from datetime import timedelta
from pathlib import Path

from sqlalchemy import event, select

import app.core.write_lock as write_lock
from app.core.db import engine
from app.core.write_lock import commit_write
from app.models.entities import Debate, DebateBranch, Job, now_utc
from app.providers import AgentConfig, ProviderRegistry
from app.scoring.jobs import current_scoring_branch, wake_pending_internal_scoring_job

APP_ROOT = Path(__file__).resolve().parents[1] / "app"
# The primitive itself: its db.flush()/db.commit() ARE the lock-covered ones.
EXEMPT = {APP_ROOT / "core" / "write_lock.py"}
SESSION_NAMES = {"db", "session"}
WRITE_METHODS = {"flush", "commit"}


def _is_hold_write_lock_with(node: ast.With) -> bool:
    for item in node.items:
        expr = item.context_expr
        if not isinstance(expr, ast.Call):
            continue
        func = expr.func
        name = func.id if isinstance(func, ast.Name) else getattr(func, "attr", None)
        if name == "hold_write_lock":
            return True
    return False


def _unlocked_session_writes(path: Path) -> list[str]:
    """`db.flush()` / `db.commit()` calls not lexically under hold_write_lock."""

    violations: list[str] = []

    def visit(node: ast.AST, locked: bool) -> None:
        if isinstance(node, ast.With) and _is_hold_write_lock_with(node):
            locked = True
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda)):
            # A function DEFINED inside a locked block runs later, when the
            # lock is long released -- lexical nesting is not coverage.
            locked = False
        if (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute)
            and node.func.attr in WRITE_METHODS
            and isinstance(node.func.value, ast.Name)
            and node.func.value.id in SESSION_NAMES
            and not locked
        ):
            relative = path.relative_to(APP_ROOT.parent)
            violations.append(f"{relative}:{node.lineno} {ast.unparse(node)}")
        for child in ast.iter_child_nodes(node):
            visit(child, locked)

    visit(ast.parse(path.read_text(encoding="utf-8")), False)
    return violations


CONNECTION_RELEASING_METHODS = {"rollback", "commit", "close"}
CONNECTION_RELEASING_FUNCTIONS = {"commit_write"}


def _passes_session(call: ast.Call) -> bool:
    args = list(call.args) + [keyword.value for keyword in call.keywords]
    return any(isinstance(arg, ast.Name) and arg.id in SESSION_NAMES for arg in args)


def _module_functions(tree: ast.AST) -> dict[str, ast.AST]:
    return {
        node.name: node
        for node in ast.walk(tree)
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
    }


def _session_events(node: ast.AST, functions: dict[str, ast.AST], *, depth: int, seen: frozenset) -> list:
    """('release'|'work', lineno, source) for every session call, in source order.

    Calls to module-local helpers are inlined (bounded depth) so that a locked
    block whose whole body is one helper call -- which is the shape at
    verification_evaluator.py:417 and scoring_completion_lifecycle.py:342 -- is
    actually inspected rather than waved through.
    """

    events: list = []
    calls = sorted(
        (child for child in ast.walk(node) if isinstance(child, ast.Call)),
        key=lambda call: (call.lineno, call.col_offset),
    )
    for call in calls:
        func = call.func
        if (
            isinstance(func, ast.Attribute)
            and isinstance(func.value, ast.Name)
            and func.value.id in SESSION_NAMES
        ):
            kind = "release" if func.attr in CONNECTION_RELEASING_METHODS else "work"
            events.append((kind, call.lineno, ast.unparse(call)[:70]))
            continue
        name = func.id if isinstance(func, ast.Name) else getattr(func, "attr", None)
        if name is None or not _passes_session(call):
            continue
        if name in CONNECTION_RELEASING_FUNCTIONS:
            events.append(("release", call.lineno, ast.unparse(call)[:70]))
        elif name in functions and depth > 0 and name not in seen:
            events.extend(
                _session_events(functions[name], functions, depth=depth - 1, seen=seen | {name})
            )
        else:
            events.append(("work", call.lineno, ast.unparse(call)[:70]))
    return events


def _release_then_more_work_under_the_lock(path: Path) -> list[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    functions = _module_functions(tree)
    violations: list[str] = []
    for node in ast.walk(tree):
        if not (isinstance(node, ast.With) and _is_hold_write_lock_with(node)):
            continue
        events: list = []
        for statement in node.body:
            events.extend(_session_events(statement, functions, depth=3, seen=frozenset()))
        released: tuple | None = None
        for kind, lineno, source in events:
            if kind == "release":
                released = (lineno, source)
            elif released is not None:
                relative = path.relative_to(APP_ROOT.parent)
                violations.append(
                    f"{relative}: hold_write_lock at line {node.lineno} releases its "
                    f"connection at line {released[0]} (`{released[1]}`) and then runs "
                    f"`{source}` at line {lineno} still holding the lock"
                )
                break
    return violations


def test_no_hold_write_lock_body_releases_its_connection_and_then_keeps_working() -> None:
    """The invariant hold_write_lock CANNOT enforce for itself.

    Its pre-lock `db.connection()` covers the connection the body starts with.
    It cannot cover one the body throws away: `db.rollback()`, `db.commit()` and
    `commit_write(db)` each close the SessionTransaction and RETURN the pooled
    connection (probed -- `checkedout()` drops to 0 after any of them), so the
    next statement checks a new one out UNDER the lock. That is the 2026-07-26
    inversion reintroduced, and since da3a566 every writer queued on the RLock
    holds a slot of its own, which closes the wait-for cycle outright (see
    test_a_writer_queueing_on_the_lock_cannot_wedge_the_lock_holder).

    So a release is legal only as the LAST session call in the block, which is
    the shape every current call site now has. `app/scoring/jobs.py`'s waker had
    the violating shape twice and was split into two critical sections.

    Honest scope: module-local helper calls are inlined to depth 3, but a call
    into ANOTHER module is scored as plain work -- if such a helper commits and
    its caller keeps working under the lock, this scan will not see it.
    """

    violations = [
        violation
        for path in sorted(APP_ROOT.rglob("*.py"))
        if path not in EXEMPT
        for violation in _release_then_more_work_under_the_lock(path)
    ]
    assert not violations, (
        "hold_write_lock bodies that release their pooled connection and then "
        "keep using the session (move the release to the end of the block, or "
        "split the block so each critical section ends at its commit):\n  "
        + "\n  ".join(violations)
    )


def test_every_session_write_in_app_goes_through_the_write_lock() -> None:
    violations = [
        violation
        for path in sorted(APP_ROOT.rglob("*.py"))
        if path not in EXEMPT
        for violation in _unlocked_session_writes(path)
    ]
    assert not violations, (
        "Session writes that bypass the process write lock (use "
        "flush_write/commit_write from app.core.write_lock, or wrap the "
        "read-then-write section in hold_write_lock):\n  " + "\n  ".join(violations)
    )


def _write_lock_held_right_now() -> bool:
    """Probe from a helper thread; the caller may own the RLock reentrantly.

    A non-blocking acquire from the CALLING thread would always succeed while
    it holds the lock (RLock re-entry), so the honest probe is whether some
    OTHER thread is shut out at this instant.
    """

    result: dict[str, bool] = {}

    def probe() -> None:
        if write_lock._write_lock.acquire(blocking=False):
            write_lock._write_lock.release()
            result["held"] = False
        else:
            result["held"] = True

    thread = threading.Thread(target=probe)
    thread.start()
    thread.join(5)
    return result.get("held", False)


def test_current_scoring_branch_flushes_under_the_write_lock(db) -> None:
    """RED while jobs.current_scoring_branch flushes bare: its INSERT takes
    SQLite's RESERVED writer with the process write lock demonstrably free, so
    it can race any thread that trusts the lock to serialize writers."""

    debate = Debate(topic="write-lock conventions probe")
    db.add(debate)
    commit_write(db)

    lock_held_at_flush: list[bool] = []

    def before_flush(session, flush_context, instances) -> None:
        lock_held_at_flush.append(_write_lock_held_right_now())

    event.listen(db, "before_flush", before_flush)
    try:
        branch = current_scoring_branch(db, debate)
        commit_write(db)
    finally:
        event.remove(db, "before_flush", before_flush)

    assert branch.debate_id == debate.id
    assert db.scalar(select(DebateBranch).where(DebateBranch.debate_id == debate.id)) is not None
    assert lock_held_at_flush, "current_scoring_branch never flushed; the probe observed nothing"
    assert all(lock_held_at_flush), (
        "current_scoring_branch issued a flush with the process write lock "
        "free -- a bare db.flush() bypassing flush_write, i.e. a writer the "
        "RLock does not serialize"
    )


class _RecordingBackgroundTasks:
    def __init__(self) -> None:
        self.tasks: list[tuple] = []

    def add_task(self, fn, *args) -> None:
        self.tasks.append((fn, *args))


def _fake_scoring_registry():
    class _FakeProvider:
        provider = "mock"
        model = "mock-judge"

    return ProviderRegistry(
        agents={"judge": AgentConfig(provider="mock", model="mock-judge", temperature=0.0)},
        providers={"mock": _FakeProvider()},
    )


def test_the_scoring_waker_never_checks_out_a_connection_under_the_write_lock(db) -> None:
    """RED before Mandate D follow-up 2: `wake_pending_internal_scoring_job`
    released its pooled connection twice from INSIDE `hold_write_lock` and
    re-checked one out with the lock still held.

    Both releases were invisible as writes: `db.rollback()` (the snapshot reset)
    and `commit_write(db)` (the stale-sweep durability commit) each close the
    SessionTransaction and return the connection to the pool -- probed,
    `checkedout()` drops to 0 after either -- and the statement immediately
    after each one needs a new slot. On a saturated pool that is the 2026-07-26
    inversion again, in the browser-poll hot path, and now with every queued
    writer pinning a slot of its own it is a closed wait-for cycle (see
    test_a_writer_queueing_on_the_lock_cannot_wedge_the_lock_holder).

    The probe is at the pool, not at the statement: `hold_write_lock`'s own warm
    is a checkout too, and the ONLY honest distinction between it and the bug is
    whether the write lock was held at the moment the slot was taken.
    """

    debate = Debate(topic="scoring waker pool-ordering probe", status="complete", config={})
    db.add(debate)
    commit_write(db)
    db.add(
        Job(
            debate_id=debate.id,
            job_type="score_debate",
            required_role="judge",
            required_model="mock-judge",
            status="pending",
            deadline=now_utc() - timedelta(minutes=5),
        )
    )
    commit_write(db)

    lock_held_at_checkout: list[bool] = []

    def on_checkout(dbapi_connection, connection_record, connection_proxy) -> None:
        lock_held_at_checkout.append(_write_lock_held_right_now())

    # Listen on the live pool object, not the Engine: `checkout` is a PoolEvents
    # event, and the fixture's engine.dispose() has already swapped the pool in
    # by the time the test body runs, so this reference is the stable one.
    pool = engine.pool
    event.listen(pool, "checkout", on_checkout)
    try:
        wake_pending_internal_scoring_job(
            db,
            debate,
            _RecordingBackgroundTasks(),
            registry_factory=_fake_scoring_registry,
            create_if_missing=True,
        )
    finally:
        event.remove(pool, "checkout", on_checkout)

    assert lock_held_at_checkout, "no pool checkout was observed; the probe is not exercising the seam"
    assert not any(lock_held_at_checkout), (
        "wake_pending_internal_scoring_job checked out a pooled connection while "
        "holding the process write lock: it released the connection mid-critical-"
        "section (db.rollback() / commit_write) and the next statement queued for "
        "a new slot with the lock held -- on a saturated pool that is a 30s "
        "RESERVED hold and 'database is locked' for every concurrent short writer"
    )
