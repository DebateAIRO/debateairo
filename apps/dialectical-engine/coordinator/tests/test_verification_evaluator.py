from __future__ import annotations

import json

import pytest
from sqlalchemy import select

from app.evidence.verification_evaluator import (
    EVIDENCE_VERIFICATION_ANALYZER_TYPE,
    evaluate_evidence_verdict,
    evidence_node_verification_eligible,
    latest_evidence_verdicts_for_debate,
    rollup_claim_verification_status,
)
from app.models.entities import (
    AnalyzerRun,
    Debate,
    DebateBranch,
    EvidenceLifecycleSnapshot,
    Generation,
    Node,
    Worker,
    next_analyzer_run_seq,
)
from app.providers import ProviderError
from app.scoring.judges import ScoringProviderResult


# ---------------------------------------------------------------------------
# rollup_claim_verification_status: pure function, no fixtures needed.
# ---------------------------------------------------------------------------


def test_rollup_claim_verification_status_contradicted_wins() -> None:
    assert rollup_claim_verification_status(["supported", "contradicted", "pending"]) == "contradicted"


def test_rollup_claim_verification_status_supported_when_no_contradiction() -> None:
    assert rollup_claim_verification_status(["supported", "unverifiable"]) == "supported"


def test_rollup_claim_verification_status_pending_when_nothing_resolved() -> None:
    assert rollup_claim_verification_status(["unverifiable", "pending"]) == "pending"


def test_rollup_claim_verification_status_pending_when_empty() -> None:
    assert rollup_claim_verification_status([]) == "pending"


# ---------------------------------------------------------------------------
# evidence_node_verification_eligible: pure function, no fixtures needed.
# Shared between app.exploration.scoring_completion_lifecycle's query-time
# guard and app.protocol.runner's read-time re-check (Task 11 / P1.2 review,
# CRITICAL finding) -- both call THIS function, never a local copy, so they
# can never silently disagree about what "eligible" means.
# ---------------------------------------------------------------------------


def test_evidence_node_verification_eligible_excludes_unreachable() -> None:
    node = Node(node_type="EVIDENCE", depth=1, position=0, claim="x", evidence_metadata={"resolution_status": "unreachable"})
    assert evidence_node_verification_eligible(node) is False


@pytest.mark.parametrize(
    "evidence_metadata",
    [
        {"resolution_status": "resolved_quote_missing"},
        {"resolution_status": "resolved_quote_found"},
        {"resolution_status": "pending"},
        {"evidenceKind": "statistical", "method": "model-claim"},  # no resolution_status key at all
        {},  # empty dict -- no resolution_status key either
        None,  # no metadata recorded at all -- legitimate "absent" state
    ],
)
def test_evidence_node_verification_eligible_includes_non_unreachable(evidence_metadata) -> None:
    node = Node(node_type="EVIDENCE", depth=1, position=0, claim="x", evidence_metadata=evidence_metadata)
    assert evidence_node_verification_eligible(node) is True


@pytest.mark.parametrize(
    "evidence_metadata",
    [
        "not-a-dict",
        ["a", "list", "not", "a", "dict"],
        42,
        True,
    ],
)
def test_evidence_node_verification_eligible_fails_closed_on_corrupted_metadata(evidence_metadata) -> None:
    # MINOR finding (Task 11 / P1.2 review): corrupted (present but
    # uninterpretable) evidence_metadata must fail CLOSED -- treated as
    # ineligible, the same untrustworthy-data posture the 5.5 rollup already
    # takes on a corrupted AnalyzerRun.output -- not fail OPEN as "eligible
    # by default". None (no metadata at all) is the only value that gets the
    # eligible default; anything else non-dict is corruption, not absence.
    node = Node(node_type="EVIDENCE", depth=1, position=0, claim="x", evidence_metadata=evidence_metadata)
    assert evidence_node_verification_eligible(node) is False


# ---------------------------------------------------------------------------
# evaluate_evidence_verdict: DB-backed, real claim + EVIDENCE node fixtures
# per Task 1's persist_evidence_nodes shape (mirrors
# test_evidence_extraction.py's _build_claim_node_with_generation, extended
# with a persisted EVIDENCE child node + its own Generation, plus a
# DebateBranch since AnalyzerRun.branch_id is a required FK).
# ---------------------------------------------------------------------------


def _build_claim_and_evidence_node(
    db,
    *,
    claim_model_id: str,
    argument_text: str = "A 2023 study found that 40% of participants reported improved outcomes.",
    evidence_text: str = "A 2023 study found that 40% of participants reported improved outcomes.",
    evidence_kind: str = "statistical",
    id_suffix: str = "1",
    no_claim_generation: bool = False,
    evidence_metadata: dict | None = None,
) -> tuple[Debate, Node, Node]:
    debate = Debate(topic="Should cities invest in public transit?", status="running")
    worker = Worker(id=f"worker-verify-{id_suffix}", name="Worker Verify", token_hash="hash", capabilities=["debate"])
    db.add_all([debate, worker])
    db.flush()
    branch = DebateBranch(debate_id=debate.id, status="active")
    db.add(branch)
    db.flush()

    claim_node = Node(
        id=f"claim-node-verify-{id_suffix}",
        debate_id=debate.id,
        node_type="PRO",
        depth=1,
        position=0,
        claim="Public transit investment improves urban mobility.",
        status="complete",
        path_status="active",
        materialized_path="/0",
    )
    db.add(claim_node)
    db.flush()

    if no_claim_generation:
        # Deliberately leave active_generation_id unset (nullable per the
        # Node model): arguer lineage is honestly unknown, not faked with a
        # None model_id on a Generation row that otherwise must exist.
        pass
    else:
        claim_generation = Generation(
            id=f"generation-claim-verify-{id_suffix}",
            node_id=claim_node.id,
            model_id=claim_model_id,
            role="pro",
            argument=argument_text,
            prompt_version="v1",
            worker_id=worker.id,
        )
        db.add(claim_generation)
        db.flush()
        claim_node.active_generation_id = claim_generation.id

    evidence_node = Node(
        id=f"evidence-node-verify-{id_suffix}",
        debate_id=debate.id,
        parent_id=claim_node.id,
        node_type="EVIDENCE",
        depth=claim_node.depth + 1,
        position=0,
        claim=evidence_text,
        status="completed",
        path_status="active",
        materialized_path="/0/0",
        evidence_metadata=evidence_metadata if evidence_metadata is not None else {"evidenceKind": evidence_kind},
    )
    db.add(evidence_node)
    db.flush()
    evidence_generation = Generation(
        id=f"generation-evidence-verify-{id_suffix}",
        node_id=evidence_node.id,
        model_id=claim_model_id,
        role="pro",
        argument=evidence_text,
        prompt_version="v1",
        worker_id=worker.id,
    )
    db.add(evidence_generation)
    db.flush()
    evidence_node.active_generation_id = evidence_generation.id

    db.commit()
    return debate, claim_node, evidence_node


class _FakeProvider:
    def __init__(self, *, provider: str, model: str, raw_output: str | None = None, error: Exception | None = None) -> None:
        self.provider = provider
        self.model = model
        self.raw_output = raw_output
        self.error = error
        self.requests = []

    def judge_node(self, request):
        self.requests.append(request)
        if self.error is not None:
            raise self.error
        return ScoringProviderResult(
            provider=self.provider,
            model=self.model,
            raw_output=self.raw_output or "",
            latency_ms=12,
            checked_at="2026-07-07T10:15:30+00:00",
        )


def _complete_supported_verdict() -> dict:
    return {
        "verdict": "supported",
        "evidence": {
            "status": "grounded",
            "base_score": 0.8,
            "uncertainty": 0.1,
            "entailment": "SUPPORTS",
            "caveats": [],
        },
    }


def test_evaluate_evidence_verdict_is_noop_pending_when_flag_off(db, monkeypatch) -> None:
    monkeypatch.delenv("DIALECTICAL_EVIDENCE_VERIFICATION", raising=False)
    debate, claim_node, evidence_node = _build_claim_and_evidence_node(db, claim_model_id="claude-sonnet-5-high-loop")
    fake_provider = _FakeProvider(
        provider="codex",
        model="gpt-5.2-codex",
        raw_output=json.dumps({"verdict": "supported"}),
    )

    result = evaluate_evidence_verdict(db, debate, claim_node, evidence_node, fake_provider)

    assert result["status"] == "pending"
    assert result["reason"] == "verification_disabled"
    assert fake_provider.requests == []
    assert db.scalars(select(AnalyzerRun).where(AnalyzerRun.analyzer_type == "evidence_verification")).all() == []


def test_evaluate_evidence_verdict_blocks_same_lineage_judge_when_enabled(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_EVIDENCE_VERIFICATION", "true")
    debate, claim_node, evidence_node = _build_claim_and_evidence_node(db, claim_model_id="claude-sonnet-5-high-loop")
    fake_provider = _FakeProvider(
        provider="anthropic",
        model="claude-opus-4",
        raw_output=json.dumps({"verdict": "supported"}),
    )

    result = evaluate_evidence_verdict(db, debate, claim_node, evidence_node, fake_provider)

    assert result["status"] == "unverifiable"
    assert result["reason"] == "no_independent_judge"
    assert fake_provider.requests == []  # provider must NEVER be called when lineage collides


def test_evaluate_evidence_verdict_records_real_verdict_from_independent_judge(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_EVIDENCE_VERIFICATION", "true")
    debate, claim_node, evidence_node = _build_claim_and_evidence_node(db, claim_model_id="claude-sonnet-5-high-loop")
    fake_provider = _FakeProvider(
        provider="codex",
        model="gpt-5.2-codex",
        raw_output=json.dumps(_complete_supported_verdict()),
    )

    result = evaluate_evidence_verdict(db, debate, claim_node, evidence_node, fake_provider)

    assert result["status"] == "supported"
    assert len(fake_provider.requests) == 1
    request = fake_provider.requests[0]
    assert request.judge_role == "verifier"
    assert request.prompt_version == "evidence-verification-v1"
    assert request.metadata["evidence_text"] == evidence_node.claim
    assert request.metadata["evidence_kind"] == "statistical"

    run = db.scalars(
        select(AnalyzerRun).where(AnalyzerRun.analyzer_type == "evidence_verification")
    ).one()
    assert run.output["evidenceNodeId"] == evidence_node.id
    assert run.output["claimNodeId"] == claim_node.id
    assert run.output["status"] == "supported"
    assert run.output["independent"] is True
    assert run.output["evaluatorVersion"] == "evidence-verification-v1"
    assert run.status == "complete"
    assert run.provenance["judge_role"] == "verifier"

    snapshot = db.scalars(select(EvidenceLifecycleSnapshot)).one()
    assert snapshot.verification_status == "supported"
    assert snapshot.payload["availability"] == "present"
    assert snapshot.payload["value"]["status"] == "grounded"


# ---------------------------------------------------------------------------
# Task 11 (P1.2) end-to-end activation readiness: the verifier payload's
# evidence_metadata must include Task 10's retrieval provenance
# (url/publisher/date/resolution_status/method) when the evidence node has
# it, and regex-extraction ("model-claim") evidence must keep working.
# ---------------------------------------------------------------------------


def test_evaluate_evidence_verdict_payload_includes_retrieval_metadata(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_EVIDENCE_VERIFICATION", "true")
    retrieval_metadata = {
        "method": "retrieval",
        "url": "https://example.com/study",
        "quote": "Congestion pricing cut downtown traffic by 15% in the first year.",
        "publisher": "Example Transit Review",
        "date": "2023-05-01",
        "retrieval_query": "congestion pricing downtown traffic study",
        "stance": "supports",
        "resolution_status": "resolved_quote_found",
    }
    debate, claim_node, evidence_node = _build_claim_and_evidence_node(
        db,
        claim_model_id="claude-sonnet-5-high-loop",
        evidence_text=retrieval_metadata["quote"],
        id_suffix="retrieval",
        evidence_metadata=retrieval_metadata,
    )
    fake_provider = _FakeProvider(
        provider="codex",
        model="gpt-5.2-codex",
        raw_output=json.dumps(_complete_supported_verdict()),
    )

    result = evaluate_evidence_verdict(db, debate, claim_node, evidence_node, fake_provider)

    assert result["status"] == "supported"
    request = fake_provider.requests[0]
    # Task 10 retrieval provenance flows straight into the verifier's
    # judge-visible metadata payload -- the judge can weigh source
    # credibility (publisher/date/URL) instead of seeing bare text.
    assert request.metadata["method"] == "retrieval"
    assert request.metadata["url"] == retrieval_metadata["url"]
    assert request.metadata["publisher"] == retrieval_metadata["publisher"]
    assert request.metadata["date"] == retrieval_metadata["date"]
    assert request.metadata["retrieval_query"] == retrieval_metadata["retrieval_query"]
    assert request.metadata["stance"] == retrieval_metadata["stance"]
    assert request.metadata["resolution_status"] == retrieval_metadata["resolution_status"]
    # No evidenceKind on a retrieval node -- honestly absent, never fabricated.
    assert request.metadata["evidence_kind"] is None
    assert request.metadata["evidence_text"] == evidence_node.claim


def test_evaluate_evidence_verdict_payload_still_includes_model_claim_kind(db, monkeypatch) -> None:
    # Regex-extraction evidence (method "model-claim") keeps working: its
    # evidenceKind still surfaces as evidence_kind exactly as before this
    # change, and its "method" key passes through the same as retrieval's.
    monkeypatch.setenv("DIALECTICAL_EVIDENCE_VERIFICATION", "true")
    debate, claim_node, evidence_node = _build_claim_and_evidence_node(
        db,
        claim_model_id="claude-sonnet-5-high-loop",
        id_suffix="model-claim",
        evidence_metadata={"evidenceKind": "statistical", "method": "model-claim"},
    )
    fake_provider = _FakeProvider(
        provider="codex",
        model="gpt-5.2-codex",
        raw_output=json.dumps(_complete_supported_verdict()),
    )

    result = evaluate_evidence_verdict(db, debate, claim_node, evidence_node, fake_provider)

    assert result["status"] == "supported"
    request = fake_provider.requests[0]
    assert request.metadata["evidence_kind"] == "statistical"
    assert request.metadata["method"] == "model-claim"
    assert "url" not in request.metadata  # honestly absent, never fabricated


def test_evaluate_evidence_verdict_honest_unverifiable_on_provider_failure(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_EVIDENCE_VERIFICATION", "true")
    debate, claim_node, evidence_node = _build_claim_and_evidence_node(db, claim_model_id="claude-sonnet-5-high-loop")
    failing_provider = _FakeProvider(
        provider="codex",
        model="gpt-5.2-codex",
        error=ProviderError("verifier judge call failed"),
    )

    result = evaluate_evidence_verdict(db, debate, claim_node, evidence_node, failing_provider)

    assert result["status"] == "unverifiable"
    assert result["reason"] != "supported"
    assert result["reason"]  # non-empty honest reason string


def test_evaluate_evidence_verdict_honest_unverifiable_on_unparseable_verdict(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_EVIDENCE_VERIFICATION", "true")
    debate, claim_node, evidence_node = _build_claim_and_evidence_node(db, claim_model_id="claude-sonnet-5-high-loop")
    fake_provider = _FakeProvider(
        provider="codex",
        model="gpt-5.2-codex",
        raw_output=json.dumps({"verdict": "definitely-true-trust-me"}),
    )

    result = evaluate_evidence_verdict(db, debate, claim_node, evidence_node, fake_provider)

    assert result["status"] == "unverifiable"
    assert result["reason"] == "unparseable_verdict"


def test_evaluate_evidence_verdict_honest_unverifiable_on_non_json_output(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_EVIDENCE_VERIFICATION", "true")
    debate, claim_node, evidence_node = _build_claim_and_evidence_node(db, claim_model_id="claude-sonnet-5-high-loop")
    fake_provider = _FakeProvider(
        provider="codex",
        model="gpt-5.2-codex",
        raw_output="not json at all",
    )

    result = evaluate_evidence_verdict(db, debate, claim_node, evidence_node, fake_provider)

    assert result["status"] == "unverifiable"
    assert result["reason"] != "supported"


def test_evaluate_evidence_verdict_records_contradicted_verdict(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_EVIDENCE_VERIFICATION", "true")
    debate, claim_node, evidence_node = _build_claim_and_evidence_node(db, claim_model_id="claude-sonnet-5-high-loop")
    fake_provider = _FakeProvider(
        provider="codex",
        model="gpt-5.2-codex",
        raw_output=json.dumps({"verdict": "contradicted"}),
    )

    result = evaluate_evidence_verdict(db, debate, claim_node, evidence_node, fake_provider)

    assert result["status"] == "contradicted"
    run = db.scalars(
        select(AnalyzerRun).where(AnalyzerRun.analyzer_type == "evidence_verification")
    ).one()
    assert run.output["status"] == "contradicted"


# ---------------------------------------------------------------------------
# Task 12 (P1.3): the persisted AnalyzerRun.output must carry the verifier's
# grounded evidence.base_score when supported -- this is the SAME row
# app.protocol.runner's 5.5 overlay (and app.evidence.verification_evaluator.
# latest_evidence_verdicts_for_debate below) already loads, so the DF-QuAD
# graph adapter's evidence tau reads it from there rather than a second query.
# ---------------------------------------------------------------------------


def test_evaluate_evidence_verdict_persists_base_score_when_supported(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_EVIDENCE_VERIFICATION", "true")
    debate, claim_node, evidence_node = _build_claim_and_evidence_node(
        db, claim_model_id="claude-sonnet-5-high-loop", id_suffix="base-score-supported"
    )
    fake_provider = _FakeProvider(
        provider="codex",
        model="gpt-5.2-codex",
        raw_output=json.dumps(_complete_supported_verdict()),
    )

    result = evaluate_evidence_verdict(db, debate, claim_node, evidence_node, fake_provider)

    assert result["status"] == "supported"
    run = db.scalars(
        select(AnalyzerRun).where(AnalyzerRun.analyzer_type == "evidence_verification")
    ).one()
    assert run.output["baseScore"] == 0.8  # _complete_supported_verdict()'s evidence.base_score


def test_evaluate_evidence_verdict_base_score_honestly_none_when_contradicted(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_EVIDENCE_VERIFICATION", "true")
    debate, claim_node, evidence_node = _build_claim_and_evidence_node(
        db, claim_model_id="claude-sonnet-5-high-loop", id_suffix="base-score-contradicted"
    )
    fake_provider = _FakeProvider(
        provider="codex",
        model="gpt-5.2-codex",
        raw_output=json.dumps({"verdict": "contradicted"}),
    )

    result = evaluate_evidence_verdict(db, debate, claim_node, evidence_node, fake_provider)

    assert result["status"] == "contradicted"
    run = db.scalars(
        select(AnalyzerRun).where(AnalyzerRun.analyzer_type == "evidence_verification")
    ).one()
    assert run.output["baseScore"] is None


def test_evaluate_evidence_verdict_base_score_none_when_supported_but_evidence_object_invalid(
    db, monkeypatch
) -> None:
    # verdict says "supported" but the evidence sub-object fails
    # _authoritative_evidence_payload's semantic validation (wrong
    # entailment) -- authoritative_evidence is None, so baseScore must be
    # honestly None too, never fabricated from the unvalidated raw number.
    monkeypatch.setenv("DIALECTICAL_EVIDENCE_VERIFICATION", "true")
    debate, claim_node, evidence_node = _build_claim_and_evidence_node(
        db, claim_model_id="claude-sonnet-5-high-loop", id_suffix="base-score-invalid-evidence"
    )
    fake_provider = _FakeProvider(
        provider="codex",
        model="gpt-5.2-codex",
        raw_output=json.dumps(
            {
                "verdict": "supported",
                "evidence": {
                    "status": "grounded",
                    "base_score": 0.8,
                    "uncertainty": 0.1,
                    "entailment": "REFUTES",  # invalid: must be SUPPORTS
                    "caveats": [],
                },
            }
        ),
    )

    result = evaluate_evidence_verdict(db, debate, claim_node, evidence_node, fake_provider)

    assert result["status"] == "supported"
    run = db.scalars(
        select(AnalyzerRun).where(AnalyzerRun.analyzer_type == "evidence_verification")
    ).one()
    assert run.output["baseScore"] is None


# ---------------------------------------------------------------------------
# Task 12 (P1.3): latest_evidence_verdicts_for_debate -- the SAME
# latest-per-evidence-node query + unreachable re-check
# app.protocol.runner's 5.5 overlay performs (Task 11), factored out so the
# claim-level rollup, the DF-QuAD graph adapter's evidence edges, and the
# debug-only QBAF view all read one query's output.
# ---------------------------------------------------------------------------


def _evidence_node(db, debate, claim_node, *, node_id: str, evidence_metadata: dict | None = None) -> Node:
    node = db.get(Node, node_id)
    if node is not None:
        return node
    node = Node(
        id=node_id,
        debate_id=debate.id,
        parent_id=claim_node.id,
        node_type="EVIDENCE",
        depth=claim_node.depth + 1,
        position=0,
        claim="Evidence fixture text.",
        status="complete",
        path_status="active",
        materialized_path=f"/evidence-fixture/{node_id}",
        evidence_metadata=evidence_metadata,
    )
    db.add(node)
    db.flush()
    return node


def _persist_verdict_row(
    db, debate, *, evidence_node_id: str, claim_node_id: str, status: str, base_score: float | None = None
) -> AnalyzerRun:
    branch = db.scalars(select(DebateBranch).where(DebateBranch.debate_id == debate.id)).first()
    run = AnalyzerRun(
        debate_id=debate.id,
        branch_id=branch.id,
        analyzer_type=EVIDENCE_VERIFICATION_ANALYZER_TYPE,
        output={
            "evidenceNodeId": evidence_node_id,
            "claimNodeId": claim_node_id,
            "status": status,
            "reason": None,
            "evaluatorVersion": "evidence-verification-v1",
            "baseScore": base_score,
        },
        status="complete",
        provenance={"judge_role": "verifier"},
    )
    next_analyzer_run_seq(db, run)
    db.commit()
    return run


def test_latest_evidence_verdicts_for_debate_returns_empty_when_no_rows(db) -> None:
    debate, claim_node, _evidence = _build_claim_and_evidence_node(
        db, claim_model_id="claude-sonnet-5-high-loop", id_suffix="latest-empty"
    )
    assert latest_evidence_verdicts_for_debate(db, debate.id) == {}


def test_latest_evidence_verdicts_for_debate_returns_status_and_base_score(db) -> None:
    debate, claim_node, _evidence = _build_claim_and_evidence_node(
        db, claim_model_id="claude-sonnet-5-high-loop", id_suffix="latest-basic"
    )
    evidence_node = _evidence_node(db, debate, claim_node, node_id="evidence-latest-basic")
    _persist_verdict_row(
        db, debate, evidence_node_id=evidence_node.id, claim_node_id=claim_node.id, status="supported", base_score=0.77
    )

    result = latest_evidence_verdicts_for_debate(db, debate.id)

    assert result == {
        evidence_node.id: {"claim_node_id": claim_node.id, "status": "supported", "base_score": 0.77}
    }


def test_latest_evidence_verdicts_for_debate_keeps_only_latest_per_evidence_node(db) -> None:
    debate, claim_node, _evidence = _build_claim_and_evidence_node(
        db, claim_model_id="claude-sonnet-5-high-loop", id_suffix="latest-reverified"
    )
    evidence_node = _evidence_node(db, debate, claim_node, node_id="evidence-latest-reverified")
    _persist_verdict_row(
        db, debate, evidence_node_id=evidence_node.id, claim_node_id=claim_node.id, status="contradicted"
    )
    _persist_verdict_row(
        db, debate, evidence_node_id=evidence_node.id, claim_node_id=claim_node.id, status="supported", base_score=0.9
    )

    result = latest_evidence_verdicts_for_debate(db, debate.id)

    assert result[evidence_node.id]["status"] == "supported"
    assert result[evidence_node.id]["base_score"] == 0.9


def test_latest_evidence_verdicts_for_debate_excludes_unreachable_node(db) -> None:
    debate, claim_node, _evidence = _build_claim_and_evidence_node(
        db, claim_model_id="claude-sonnet-5-high-loop", id_suffix="latest-unreachable"
    )
    evidence_node = _evidence_node(
        db,
        debate,
        claim_node,
        node_id="evidence-latest-unreachable",
        evidence_metadata={"resolution_status": "unreachable"},
    )
    _persist_verdict_row(
        db, debate, evidence_node_id=evidence_node.id, claim_node_id=claim_node.id, status="supported", base_score=0.9
    )

    assert latest_evidence_verdicts_for_debate(db, debate.id) == {}


def test_latest_evidence_verdicts_for_debate_excludes_row_with_missing_node(db) -> None:
    debate, claim_node, _evidence = _build_claim_and_evidence_node(
        db, claim_model_id="claude-sonnet-5-high-loop", id_suffix="latest-missing-node"
    )
    _persist_verdict_row(
        db,
        debate,
        evidence_node_id="evidence-node-never-persisted",
        claim_node_id=claim_node.id,
        status="supported",
        base_score=0.9,
    )

    assert latest_evidence_verdicts_for_debate(db, debate.id) == {}


def test_latest_evidence_verdicts_for_debate_ignores_rows_missing_required_fields(db) -> None:
    debate, claim_node, _evidence = _build_claim_and_evidence_node(
        db, claim_model_id="claude-sonnet-5-high-loop", id_suffix="latest-missing-fields"
    )
    branch = db.scalars(select(DebateBranch).where(DebateBranch.debate_id == debate.id)).first()
    run = AnalyzerRun(
        debate_id=debate.id,
        branch_id=branch.id,
        analyzer_type=EVIDENCE_VERIFICATION_ANALYZER_TYPE,
        output={"claimNodeId": claim_node.id, "status": "contradicted"},
        status="complete",
        provenance={"judge_role": "verifier"},
    )
    next_analyzer_run_seq(db, run)
    db.commit()

    assert latest_evidence_verdicts_for_debate(db, debate.id) == {}


def test_latest_evidence_verdicts_for_debate_raises_on_corrupted_output_row(db) -> None:
    # A corrupted row (output is a list, not a dict) must RAISE rather than
    # be silently swallowed here -- app.protocol.runner's caller relies on
    # this to trigger its OWN graceful-degradation try/except (mirrors the
    # pre-Task-12 inline behavior asserted by
    # test_corrupted_evidence_verification_row_falls_back_and_still_persists
    # in test_protocol_runner.py).
    debate, claim_node, _evidence = _build_claim_and_evidence_node(
        db, claim_model_id="claude-sonnet-5-high-loop", id_suffix="latest-corrupted"
    )
    branch = db.scalars(select(DebateBranch).where(DebateBranch.debate_id == debate.id)).first()
    run = AnalyzerRun(
        debate_id=debate.id,
        branch_id=branch.id,
        analyzer_type=EVIDENCE_VERIFICATION_ANALYZER_TYPE,
        output=["not", "a", "dict"],
        status="complete",
        provenance={"judge_role": "verifier"},
    )
    next_analyzer_run_seq(db, run)
    db.commit()

    with pytest.raises(AttributeError):
        latest_evidence_verdicts_for_debate(db, debate.id)


# ---------------------------------------------------------------------------
# Fix wave (review findings on Phase 7 Task 2):
#   Finding 1 -- provider/model must be scrubbed through the SAME
#     _public_metadata_text secret-safety filter as score_node_with_provider
#     BEFORE lineage computation, both at the guard and at
#     judge_lineage_metadata. A secret-like model string must never reach the
#     lineage guard raw and must never be echoed into persisted output.
#   Finding 3 -- TimeoutError is a distinct honest-failure branch from
#     ProviderError.
#   LIP-05R -- unknown arguer or scrubbed judge lineage cannot establish an
#     independent verifier. Both paths fail closed before the provider call
#     and persist terminal-unverifiable lineage provenance.
# ---------------------------------------------------------------------------


def test_evaluate_evidence_verdict_unknown_scrubbed_judge_lineage_fails_closed_without_provider_call(
    db, monkeypatch
) -> None:
    monkeypatch.setenv("DIALECTICAL_EVIDENCE_VERIFICATION", "true")
    secret_marker = "secret-token-verify-scrub"
    debate, claim_node, evidence_node = _build_claim_and_evidence_node(
        db, claim_model_id="claude-sonnet-5-high-loop", id_suffix="scrub"
    )
    fake_provider = _FakeProvider(
        provider=f"codex --api-key {secret_marker}",
        model=f"gpt-5.4 TOKEN={secret_marker}",
        raw_output=json.dumps(_complete_supported_verdict()),
    )

    result = evaluate_evidence_verdict(db, debate, claim_node, evidence_node, fake_provider)

    assert fake_provider.requests == []
    assert result == {"status": "unverifiable", "reason": "judge_lineage_unknown"}

    run = db.scalars(
        select(AnalyzerRun).where(AnalyzerRun.analyzer_type == "evidence_verification")
    ).one()
    assert run.output["status"] == "unverifiable"
    assert run.output["reason"] == "judge_lineage_unknown"
    assert run.output["judgeLineage"]["provider"] is None
    assert run.output["judgeLineage"]["model"] is None
    assert run.output["judgeLineage"]["family"] is None
    assert run.output["independent"] is None
    assert run.output["independenceReason"] == "judge_lineage_unknown"

    snapshot = db.scalars(select(EvidenceLifecycleSnapshot)).one()
    assert snapshot.verification_status == "unverifiable"
    assert snapshot.payload["availability"] == "terminal_unverifiable"
    assert snapshot.payload["value"] is None
    assert snapshot.payload["unavailability_reason"] == "judge_lineage_unknown"
    assert snapshot.payload["source_identity"]["claim_node_id"] == claim_node.id
    assert snapshot.payload["source_identity"]["evidence_node_id"] == evidence_node.id
    assert snapshot.payload["provenance"]["source_record_id"] == run.id

    # No secret appears ANYWHERE in the persisted output or provenance.
    persisted = json.dumps(run.output) + json.dumps(run.provenance) + json.dumps(snapshot.payload)
    assert secret_marker not in persisted
    assert "secret" not in persisted.lower()


def test_evaluate_evidence_verdict_honest_unverifiable_on_timeout(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_EVIDENCE_VERIFICATION", "true")
    debate, claim_node, evidence_node = _build_claim_and_evidence_node(
        db, claim_model_id="claude-sonnet-5-high-loop", id_suffix="timeout"
    )
    timing_out_provider = _FakeProvider(
        provider="codex",
        model="gpt-5.2-codex",
        error=TimeoutError("verifier judge call timed out"),
    )

    result = evaluate_evidence_verdict(db, debate, claim_node, evidence_node, timing_out_provider)

    assert result["status"] == "unverifiable"
    assert result["reason"] == "verification_judge_call_timed_out"


def test_evaluate_evidence_verdict_unknown_arguer_lineage_fails_closed_without_provider_call(
    db, monkeypatch
) -> None:
    monkeypatch.setenv("DIALECTICAL_EVIDENCE_VERIFICATION", "true")
    monkeypatch.setenv("DIALECTICAL_LINEAGE_INDEPENDENCE", "true")
    debate, claim_node, evidence_node = _build_claim_and_evidence_node(
        db, claim_model_id="claude-sonnet-5-high-loop", id_suffix="unknown-lineage", no_claim_generation=True
    )
    fake_provider = _FakeProvider(
        provider="codex",
        model="gpt-5.2-codex",
        raw_output=json.dumps(_complete_supported_verdict()),
    )

    result = evaluate_evidence_verdict(db, debate, claim_node, evidence_node, fake_provider)

    assert fake_provider.requests == []
    assert result == {"status": "unverifiable", "reason": "arguer_lineage_unknown"}

    run = db.scalars(
        select(AnalyzerRun).where(AnalyzerRun.analyzer_type == "evidence_verification")
    ).one()
    assert run.output["status"] == "unverifiable"
    assert run.output["reason"] == "arguer_lineage_unknown"
    assert run.output["independent"] is None
    assert run.output["independenceReason"] == "arguer_lineage_unknown"
    assert run.output["arguerLineage"] is None

    snapshot = db.scalars(select(EvidenceLifecycleSnapshot)).one()
    assert snapshot.verification_status == "unverifiable"
    assert snapshot.payload["availability"] == "terminal_unverifiable"
    assert snapshot.payload["value"] is None
    assert snapshot.payload["unavailability_reason"] == "arguer_lineage_unknown"
    assert snapshot.payload["source_identity"]["claim_node_id"] == claim_node.id
    assert snapshot.payload["source_identity"]["evidence_node_id"] == evidence_node.id
    assert snapshot.payload["provenance"]["source_record_id"] == run.id


def test_evaluate_evidence_verdict_failure_path_still_persists_lineage_metadata(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_EVIDENCE_VERIFICATION", "true")
    debate, claim_node, evidence_node = _build_claim_and_evidence_node(
        db, claim_model_id="claude-sonnet-5-high-loop", id_suffix="failure-lineage"
    )
    fake_provider = _FakeProvider(
        provider="codex",
        model="gpt-5.2-codex",
        raw_output="not json at all",
    )

    result = evaluate_evidence_verdict(db, debate, claim_node, evidence_node, fake_provider)

    assert result["status"] == "unverifiable"
    assert result["reason"] == "unparseable_verdict"

    run = db.scalars(
        select(AnalyzerRun).where(AnalyzerRun.analyzer_type == "evidence_verification")
    ).one()
    assert run.output["status"] == "unverifiable"
    assert run.output["reason"] == "unparseable_verdict"
    assert run.output["judgeLineage"]["provider"] == "codex"
    assert run.output["judgeLineage"]["model"] == "gpt-5.2-codex"
    assert run.output["independent"] is True
    assert run.output["evaluatorVersion"] == "evidence-verification-v1"
