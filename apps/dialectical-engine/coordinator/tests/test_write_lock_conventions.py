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
from pathlib import Path

from sqlalchemy import event, select

import app.core.write_lock as write_lock
from app.core.write_lock import commit_write
from app.models.entities import Debate, DebateBranch
from app.scoring.jobs import current_scoring_branch

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
