from __future__ import annotations

import json

from sqlalchemy import select

from app.evidence.verification_evaluator import (
    evaluate_evidence_verdict,
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
        evidence_metadata={"evidenceKind": evidence_kind},
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
    debate, claim_node, evidence_node = _build_claim_and_evidence_node(db, claim_model_id="claude-sonnet-5")
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
    debate, claim_node, evidence_node = _build_claim_and_evidence_node(db, claim_model_id="claude-sonnet-5")
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
    debate, claim_node, evidence_node = _build_claim_and_evidence_node(db, claim_model_id="claude-sonnet-5")
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


def test_evaluate_evidence_verdict_honest_unverifiable_on_provider_failure(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_EVIDENCE_VERIFICATION", "true")
    debate, claim_node, evidence_node = _build_claim_and_evidence_node(db, claim_model_id="claude-sonnet-5")
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
    debate, claim_node, evidence_node = _build_claim_and_evidence_node(db, claim_model_id="claude-sonnet-5")
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
    debate, claim_node, evidence_node = _build_claim_and_evidence_node(db, claim_model_id="claude-sonnet-5")
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
    debate, claim_node, evidence_node = _build_claim_and_evidence_node(db, claim_model_id="claude-sonnet-5")
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
        db, claim_model_id="claude-sonnet-5", id_suffix="scrub"
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
        db, claim_model_id="claude-sonnet-5", id_suffix="timeout"
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
        db, claim_model_id="claude-sonnet-5", id_suffix="unknown-lineage", no_claim_generation=True
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
        db, claim_model_id="claude-sonnet-5", id_suffix="failure-lineage"
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
