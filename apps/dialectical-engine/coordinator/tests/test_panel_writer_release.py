"""F1 (2026-07-24 incident): no judge CLI call may hold the single SQLite writer.

The judge panel froze the coordinator because the primary judge's persisted-
but-uncommitted artifact held the SQLite write transaction across every panel
member's up-to-120s CLI subprocess -- starving all other writers into
`database is locked` 500s. Moving the panel judge_node out of begin_nested is
NOT enough (the primary's flush still holds the writer); the fix commits the
writer before each panel CLI call.

These tests assert the REAL invariant: a SECOND sqlite connection can
successfully COMMIT a write while a judge's judge_node() is executing. Do NOT
weaken them to `not db.in_nested_transaction()` -- that assertion passed while
the coordinator was frozen (see the task report's probe table).
"""
from __future__ import annotations

import json

from sqlalchemy import text

from app.core.db import SessionLocal
from app.scoring.judge_panel import JudgePanelMember
from app.scoring.judge_registry import judge_panel_role
from app.scoring.judges import ScoringProviderResult
from app.scoring.service import score_node_with_provider

from test_node_scoring import base_assessment, _lineage_guard_debate_and_node


def _second_connection_commit_succeeds_during_call() -> bool:
    """A separate connection writes AND commits. Returns True iff the writer
    was free (short busy_timeout so a held writer fails fast instead of
    waiting out the 30s production busy_timeout)."""
    other = SessionLocal()
    try:
        other.execute(text("PRAGMA busy_timeout=300"))
        other.execute(text("UPDATE debates SET topic = topic"))
        other.commit()
        return True
    except Exception:  # noqa: BLE001 -- "database is locked" means the writer was held
        other.rollback()
        return False
    finally:
        other.close()


def test_primary_judge_cli_runs_with_writer_free(db, monkeypatch) -> None:
    monkeypatch.delenv("DIALECTICAL_JUDGE_PANEL_MODELS", raising=False)
    observed: dict = {}

    class PrimaryProvider:
        provider = "codex"
        model = "gpt-5.6sol-medium"

        def judge_node(self, request):
            observed["second_commit_ok"] = _second_connection_commit_succeeds_during_call()
            return ScoringProviderResult(
                provider=self.provider,
                model=self.model,
                raw_output=json.dumps(base_assessment(node_id=request.claim.node_id).model_dump(mode="json")),
                latency_ms=10,
                checked_at="2026-07-24T10:15:30+00:00",
            )

    debate, node, _g = _lineage_guard_debate_and_node(db, arguer_model_id="model-a")
    payload = score_node_with_provider(db, debate, node.id, PrimaryProvider(), judge_role="judge", force_refresh=True)

    assert payload["status"] == "available"
    # The primary judge's own CLI call is already lock-free: only reads precede
    # it in score_node_with_provider (node/generation/children/cache lookups),
    # so the writer is never held across it -- a second connection commits
    # freely. (Note: the primary connection may be in_transaction here, but
    # that is a WAL *read* transaction, which never blocks a writer -- which is
    # exactly why the real invariant is a second-connection commit, not
    # in_transaction()/in_nested_transaction().)
    assert observed["second_commit_ok"] is True


def test_panel_member_cli_runs_with_writer_free(db, monkeypatch) -> None:
    from app.scoring import service as scoring_service

    monkeypatch.setenv("DIALECTICAL_JUDGE_PANEL_MODELS", "panel-model-x")
    observed: dict = {}

    class PrimaryProvider:
        provider = "codex"
        model = "gpt-5.6sol-medium"

        def judge_node(self, request):
            return ScoringProviderResult(
                provider=self.provider,
                model=self.model,
                raw_output=json.dumps(
                    {
                        **base_assessment(node_id=request.claim.node_id).model_dump(mode="json"),
                        "_private_test_marker": "F1-PRIMARY",
                    }
                ),
                latency_ms=10,
                checked_at="2026-07-24T10:15:30+00:00",
            )

    class PanelMemberProvider:
        provider = "claude"
        model = "panel-model-x"

        def judge_node(self, request):
            # The writer MUST be free here: the primary judge's already-
            # persisted artifact would otherwise hold it across this call.
            observed["second_commit_ok"] = _second_connection_commit_succeeds_during_call()
            return ScoringProviderResult(
                provider=self.provider,
                model=self.model,
                raw_output=json.dumps(
                    {
                        **base_assessment(node_id=request.claim.node_id).model_dump(mode="json"),
                        "_private_test_marker": "F1-PANEL",
                    }
                ),
                latency_ms=12,
                checked_at="2026-07-24T10:16:30+00:00",
            )

    member = JudgePanelMember(
        family="claude",
        model_id="panel-model-x",
        judge_role=judge_panel_role("claude"),
        provider=PanelMemberProvider(),
    )
    monkeypatch.setattr(scoring_service, "build_judge_panel_members", lambda: ([member], []))

    debate, node, _g = _lineage_guard_debate_and_node(db, arguer_model_id="model-a")
    payload = score_node_with_provider(db, debate, node.id, PrimaryProvider(), judge_role="judge", force_refresh=True)

    assert payload["status"] == "available"
    # The invariant that the brief's `not in_nested_transaction()` check missed:
    # a second connection COMMITS a write while the panel member's CLI call is
    # executing. Fails on the pre-fix code (primary's flush holds the writer
    # across the panel); passes once the writer is committed before the call.
    assert observed["second_commit_ok"] is True
