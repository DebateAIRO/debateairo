from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib

import pytest
from sqlalchemy import select

from app.evidence.lifecycle_input_repository import persist_evidence_lifecycle_snapshot
from app.exploration.lifecycle_decision_service import decide_lifecycle_for_node
from app.models.entities import (
    AnalyzerRun,
    Debate,
    DebateBranch,
    Generation,
    JudgeOutputArtifact,
    Job,
    Node,
    NodeScoringResult,
    Worker,
)
from app.scoring.cache import node_scoring_input_hash
from app.scoring.judge_registry import active_contract
from app.scoring.models import ClaimAssessment
from app.scoring.normalizer import normalize_claim
from app.services.orchestrator import spawn_child_argument_jobs


DECISION_TIME = datetime(2026, 7, 15, 12, 0, tzinfo=timezone.utc)


def _score_item(node_id: str) -> dict[str, object]:
    # reducer_version/rubric_version must match the LIVE active contract
    # (app.exploration.lifecycle_inputs._parse_score_value compares them
    # against active_scoring_contract, which decide_lifecycle_for_node
    # builds from the real active_contract("judge") -- same contract
    # _persist_score below already uses for contract_hash/judge_id/
    # judge_version/prompt_version). Deriving them here, rather than
    # hardcoding a version string, keeps this fixture correct across future
    # reducer/rubric version bumps instead of silently going stale.
    contract = active_contract("judge")
    return {
        "node_id": node_id,
        "claim": {
            "node_id": node_id,
            "raw_text": "A weak, resolved claim.",
            "core_claim": "A weak, resolved claim.",
            "claim_type": "normative",
        },
        "scores": {
            "strength": 0.10,
            "uncertainty": 0.10,
            "impact": 0.10,
            "evidence_quality": 0.90,
            "relevance": 0.80,
            "logical_validity": 0.90,
            "assumption_risk": 0.10,
            "counter_resilience": 0.80,
        },
        "labels": {
            "strength_label": "weak",
            "uncertainty_label": "low",
            "impact_label": "low",
        },
        "holes": [],
        "fatal_flags": [],
        "score_caps": [],
        "judge_disagreements": [],
        "recommended_investigations": [],
        "rationale": {
            "short": "Persisted low-strength result.",
            "why_not_higher": "The claim is weak.",
            "why_not_lower": "Some support remains.",
            "weakest_link": "Low impact.",
        },
        "score_provenance": {
            "raw_judge_output_kind": "claim_assessment",
            "raw_judge_output_included": False,
            "final_score_source": "deterministic_reducer",
            "reducer_version": contract.reducer_version,
            "rubric_version": contract.rubric_version,
        },
    }


def _valid_claim_assessment() -> dict[str, object]:
    return ClaimAssessment.model_validate(
        {
            "steelman": {
                "charitable_strength": 0.10,
                "confidence": 0.90,
                "improved_claim": "A weak, resolved claim.",
            },
            "critic": {
                "logical_validity": 0.90,
                "assumption_risk": 0.10,
                "counterargument_strength": 0.80,
            },
            "evidence": {
                "evidence_quality": 0.90,
                "evidence_relevance": 0.80,
                "evidence_sufficiency": 0.80,
                "source_reliability": 0.90,
                "freshness": 0.90,
                "support_status": "grounded",
            },
            "context": {
                "relevance": 0.80,
                "impact": 0.10,
                "dependency_weight": 0.20,
                "relation_to_root": "supports",
            },
            "fallacy": {
                "logical_consistency": 0.90,
            },
        },
        strict=True,
    ).model_dump(mode="json")


def _subject(db) -> tuple[Debate, Node, Generation, Worker, DebateBranch]:
    worker = Worker(
        name="lifecycle-fixture-worker",
        token_hash="fixture-token-hash",
        capabilities=["fixture-model", "mock-local"],
        last_seen=DECISION_TIME,
        status="online",
    )
    debate = Debate(
        topic="Should cities ban cars?",
        status="generating",
        config={"max_depth": 2, "branching": 2},
    )
    db.add_all([worker, debate])
    db.flush()
    node = Node(
        debate_id=debate.id,
        node_type="PRO",
        depth=1,
        position=0,
        claim="A weak, resolved claim.",
        status="complete",
        materialized_path="/0/0",
    )
    db.add(node)
    db.flush()
    generation = Generation(
        node_id=node.id,
        model_id="fixture-arguer",
        role="proposer",
        argument="A weak argument with resolved evidence.",
        prompt_version="v1",
        worker_id=worker.id,
        is_active=True,
    )
    db.add(generation)
    db.flush()
    node.active_generation_id = generation.id
    branch = DebateBranch(debate_id=debate.id, root_node_id=node.id, status="active")
    db.add(branch)
    db.flush()
    return debate, node, generation, worker, branch


def _persist_score(
    db,
    *,
    debate: Debate,
    node: Node,
    generation: Generation,
    branch: DebateBranch,
    observed_at: datetime,
) -> NodeScoringResult:
    contract = active_contract("judge")
    input_hash = node_scoring_input_hash(
        claim=normalize_claim(node_id=node.id, raw_text=node.claim),
        argument_text=generation.argument,
        # _subject() never gives `node` any PRO/CON children, so this must
        # match app.scoring.service._node_children_for_judge's real result
        # for it: debate.topic and no children.
        debate_question=debate.topic,
        children=[],
    )
    item = _score_item(node.id)
    checked_at = observed_at.isoformat().replace("+00:00", "Z")
    payload = {
        "debate_id": debate.id,
        "status": "available",
        "node_ids": [node.id],
        "items": [item],
        "model_metadata": {
            "provider": "fixture-provider",
            "model": "fixture-model",
            "checked_at": checked_at,
            "status": "available",
        },
    }
    scoring_job = Job(
        id="fixture-score-job",
        debate_id=debate.id,
        node_id=None,
        job_type="score_debate",
        required_role=contract.role,
        required_model="fixture-model",
        status="complete",
        worker_id=generation.worker_id,
        deadline=observed_at,
        created_at=observed_at,
    )
    run = AnalyzerRun(
        id="score-run-current",
        debate_id=debate.id,
        branch_id=branch.id,
        analyzer_type="node_scoring",
        output=payload,
        status="complete",
        provenance={
            "scoring_source": "judge_outputs",
            "job_id": "fixture-score-job",
            "node_ids": [node.id],
        },
        seq=1,
        created_at=observed_at,
    )
    row = NodeScoringResult(
        id="score-record-current",
        debate_id=debate.id,
        node_id=node.id,
        input_hash=input_hash,
        judge_role=contract.role,
        provider="fixture-provider",
        model="fixture-model",
        judge_id=contract.judge_id,
        judge_version=contract.judge_version,
        contract_hash=contract.contract_hash,
        provider_metadata=payload["model_metadata"],
        status="available",
        result=payload,
        created_at=observed_at,
        updated_at=observed_at,
    )
    artifact = JudgeOutputArtifact(
        id="judge-artifact-current",
        debate_id=debate.id,
        node_id=node.id,
        job_id=scoring_job.id,
        analyzer_run_id=run.id,
        input_hash=input_hash,
        judge_role=contract.role,
        provider=row.provider,
        model=row.model,
        judge_id=contract.judge_id,
        judge_version=contract.judge_version,
        contract_hash=contract.contract_hash,
        prompt_version=contract.prompt_version,
        request_metadata={},
        raw_output="{}",
        raw_output_sha256=hashlib.sha256(b"{}").hexdigest(),
        parse_status="available",
        assessment=_valid_claim_assessment(),
        provider_metadata=payload["model_metadata"],
        checked_at=observed_at,
        created_at=observed_at,
    )
    db.add_all([scoring_job, run, row, artifact])
    db.flush()
    return row


def _persist_lookalike_artifact(
    db,
    *,
    source: JudgeOutputArtifact,
    artifact_id: str,
    analyzer_run_id: str,
    raw_output: str,
) -> JudgeOutputArtifact:
    artifact = JudgeOutputArtifact(
        id=artifact_id,
        debate_id=source.debate_id,
        node_id=source.node_id,
        job_id=source.job_id,
        analyzer_run_id=analyzer_run_id,
        input_hash=source.input_hash,
        judge_role=source.judge_role,
        provider=source.provider,
        model=source.model,
        judge_id=source.judge_id,
        judge_version=source.judge_version,
        contract_hash=source.contract_hash,
        prompt_version=source.prompt_version,
        request_metadata=source.request_metadata,
        raw_output=raw_output,
        raw_output_sha256=hashlib.sha256(raw_output.encode("utf-8")).hexdigest(),
        parse_status=source.parse_status,
        assessment=source.assessment,
        provider_metadata=source.provider_metadata,
        checked_at=source.checked_at,
        created_at=source.created_at,
    )
    db.add(artifact)
    db.flush()
    return artifact


def _persist_equal_payload_run(
    db,
    *,
    source: AnalyzerRun,
    run_id: str,
    sequence: int,
) -> AnalyzerRun:
    run = AnalyzerRun(
        id=run_id,
        debate_id=source.debate_id,
        branch_id=source.branch_id,
        analyzer_type=source.analyzer_type,
        output=source.output,
        status=source.status,
        provenance=source.provenance,
        seq=sequence,
        created_at=source.created_at,
    )
    db.add(run)
    db.flush()
    return run


def _persist_grounded_evidence(
    db,
    *,
    debate: Debate,
    node: Node,
    worker: Worker,
    observed_at: datetime,
    reference_suffix: str = "",
) -> str:
    evidence_node = Node(
        id="evidence-node-current",
        debate_id=debate.id,
        parent_id=node.id,
        node_type="EVIDENCE",
        depth=node.depth + 1,
        position=10_000,
        claim="A persisted evidence source.",
        status="completed",
        materialized_path=f"{node.materialized_path}/10000",
        evidence_metadata={"evidenceKind": "citation"},
    )
    db.add(evidence_node)
    db.flush()
    generation = Generation(
        id="evidence-generation-current",
        node_id=evidence_node.id,
        model_id="fixture-arguer",
        role="proposer",
        argument=evidence_node.claim,
        prompt_version="v1",
        worker_id=worker.id,
        is_active=True,
    )
    db.add(generation)
    db.flush()
    evidence_node.active_generation_id = generation.id
    content_hash = hashlib.sha256(evidence_node.claim.encode("utf-8")).hexdigest()
    source = {
        "evidence_node_id": evidence_node.id,
        "claim_node_id": node.id,
        "generation_id": generation.id,
        "reference": f"evidence-node:{evidence_node.id}{reference_suffix}",
        "content_sha256": content_hash,
        "evidence_kind": "citation",
    }
    observed_text = observed_at.isoformat().replace("+00:00", "Z")
    row = persist_evidence_lifecycle_snapshot(
        db,
        snapshot={
            "schema_version": "lifecycle-input-persistence/v1",
            "debate_id": debate.id,
            "node_id": node.id,
            "source_identity": source,
            "availability": "present",
            "observed_at": observed_text,
            "provenance": {
                "source_kind": "evidence_verification_run",
                "source_record_id": "evidence-run-current",
                "run": {"run_id": "evidence-run-current", "sequence": 2},
                "producer": "fixture-evidence-evaluator",
                "recorded_at": observed_text,
                "checked_at": observed_text,
            },
            "value": {
                "source": source,
                "status": "grounded",
                "base_score": 0.80,
                "uncertainty": 0.10,
                "entailment": "SUPPORTS",
                "caveats": [],
                "evaluator_id": "fixture-evaluator",
                "evaluator_version": "v1",
            },
            "unavailability_reason": None,
        },
        verification_status="supported",
    )
    return row.id


def _persist_grounded_lifecycle_inputs(db) -> tuple[Debate, Node]:
    debate, node, generation, worker, branch = _subject(db)
    observed_at = DECISION_TIME - timedelta(minutes=5)
    _persist_score(
        db,
        debate=debate,
        node=node,
        generation=generation,
        branch=branch,
        observed_at=observed_at,
    )
    _persist_grounded_evidence(
        db,
        debate=debate,
        node=node,
        worker=worker,
        observed_at=observed_at,
    )
    return debate, node


def test_grounded_correlated_persisted_inputs_authenticate_abandonment(db) -> None:
    debate, node, generation, worker, branch = _subject(db)
    score_row = _persist_score(
        db,
        debate=debate,
        node=node,
        generation=generation,
        branch=branch,
        observed_at=DECISION_TIME - timedelta(minutes=5),
    )
    evidence_snapshot_id = _persist_grounded_evidence(
        db,
        debate=debate,
        node=node,
        worker=worker,
        observed_at=DECISION_TIME - timedelta(minutes=4),
    )

    outcome = decide_lifecycle_for_node(
        db,
        debate=debate,
        node=node,
        decision_timestamp=DECISION_TIME,
    )

    assert outcome.action == "abandon"
    assert outcome.keeps_path_active is False
    assert outcome.authentic_policy_decision is True
    assert outcome.input_state == "grounded"
    assert outcome.stopping_reason == "low-strength low-impact path is resolved enough to pause"
    assert outcome.score_record_id == score_row.id
    assert outcome.score_run_id == "score-run-current"
    assert outcome.score_run_sequence == 1
    assert outcome.evidence_snapshot_id == evidence_snapshot_id
    assert outcome.decision_timestamp == DECISION_TIME
    assert outcome.scoring_contract_hash == active_contract("judge").contract_hash


@pytest.mark.parametrize("artifact_job_id", [None, "other-score-job"], ids=["null", "mismatched"])
def test_artifact_job_identity_must_match_producing_run(
    db,
    artifact_job_id: str | None,
) -> None:
    debate, node = _persist_grounded_lifecycle_inputs(db)
    artifact = db.get(JudgeOutputArtifact, "judge-artifact-current")
    source_job = db.get(Job, "fixture-score-job")
    assert artifact is not None
    assert source_job is not None
    if artifact_job_id is not None:
        db.add(
            Job(
                id=artifact_job_id,
                debate_id=source_job.debate_id,
                node_id=source_job.node_id,
                job_type=source_job.job_type,
                required_role=source_job.required_role,
                required_model=source_job.required_model,
                status="complete",
                worker_id=source_job.worker_id,
                deadline=source_job.deadline,
                created_at=source_job.created_at,
            )
        )
    artifact.job_id = artifact_job_id
    db.flush()

    outcome = decide_lifecycle_for_node(
        db,
        debate=debate,
        node=node,
        decision_timestamp=DECISION_TIME,
    )

    assert outcome.action == "continue"
    assert outcome.authentic_policy_decision is False
    assert outcome.input_state == "unverifiable"
    assert "score_run_unverifiable" in outcome.reason_codes


@pytest.mark.parametrize(
    "assessment",
    [{}, {"steelman": {}}],
    ids=["empty", "malformed"],
)
def test_artifact_assessment_must_match_canonical_schema(
    db,
    assessment: dict[str, object],
) -> None:
    debate, node = _persist_grounded_lifecycle_inputs(db)
    artifact = db.get(JudgeOutputArtifact, "judge-artifact-current")
    assert artifact is not None
    artifact.assessment = assessment
    db.flush()

    outcome = decide_lifecycle_for_node(
        db,
        debate=debate,
        node=node,
        decision_timestamp=DECISION_TIME,
    )

    assert outcome.action == "continue"
    assert outcome.authentic_policy_decision is False
    assert outcome.input_state == "unverifiable"
    assert "score_run_unverifiable" in outcome.reason_codes


def test_artifact_prompt_version_must_match_active_contract(db) -> None:
    debate, node = _persist_grounded_lifecycle_inputs(db)
    artifact = db.get(JudgeOutputArtifact, "judge-artifact-current")
    assert artifact is not None
    artifact.prompt_version = "stale-prompt-version"
    db.flush()

    outcome = decide_lifecycle_for_node(
        db,
        debate=debate,
        node=node,
        decision_timestamp=DECISION_TIME,
    )

    assert outcome.action == "continue"
    assert outcome.authentic_policy_decision is False
    assert outcome.input_state == "unverifiable"
    assert "score_run_unverifiable" in outcome.reason_codes


def test_absent_inputs_continue_without_policy_abandonment(db) -> None:
    debate, node, _generation, _worker, _branch = _subject(db)

    outcome = decide_lifecycle_for_node(
        db,
        debate=debate,
        node=node,
        decision_timestamp=DECISION_TIME,
    )

    assert outcome.action == "continue"
    assert outcome.keeps_path_active is True
    assert outcome.authentic_policy_decision is False
    assert outcome.input_state == "missing"
    assert outcome.reason_codes == ("score_missing", "evidence_source_missing")
    assert outcome.stopping_reason
    assert "score_missing" in outcome.stopping_reason
    assert outcome.score_record_id is None
    assert outcome.evidence_snapshot_id is None


def test_mixed_grounded_score_and_missing_evidence_continue_fail_safe(db) -> None:
    debate, node, generation, _worker, branch = _subject(db)
    _persist_score(
        db,
        debate=debate,
        node=node,
        generation=generation,
        branch=branch,
        observed_at=DECISION_TIME - timedelta(minutes=5),
    )

    outcome = decide_lifecycle_for_node(
        db,
        debate=debate,
        node=node,
        decision_timestamp=DECISION_TIME,
    )

    assert outcome.action == "continue"
    assert outcome.keeps_path_active is True
    assert outcome.authentic_policy_decision is False
    assert outcome.reason_codes == ("evidence_source_missing",)
    assert outcome.score_record_id == "score-record-current"


def test_stale_correlated_inputs_continue_fail_safe(db) -> None:
    debate, node, generation, worker, branch = _subject(db)
    stale_time = DECISION_TIME - timedelta(hours=2)
    _persist_score(
        db,
        debate=debate,
        node=node,
        generation=generation,
        branch=branch,
        observed_at=stale_time,
    )
    _persist_grounded_evidence(
        db,
        debate=debate,
        node=node,
        worker=worker,
        observed_at=stale_time,
    )

    outcome = decide_lifecycle_for_node(
        db,
        debate=debate,
        node=node,
        decision_timestamp=DECISION_TIME,
    )

    assert outcome.action == "continue"
    assert outcome.keeps_path_active is True
    assert outcome.authentic_policy_decision is False
    assert outcome.input_state == "stale"
    assert set(outcome.reason_codes) == {"score_stale", "evidence_stale"}


def test_mismatched_current_evidence_source_cannot_abandon(db) -> None:
    debate, node, generation, worker, branch = _subject(db)
    observed_at = DECISION_TIME - timedelta(minutes=5)
    _persist_score(
        db,
        debate=debate,
        node=node,
        generation=generation,
        branch=branch,
        observed_at=observed_at,
    )
    _persist_grounded_evidence(
        db,
        debate=debate,
        node=node,
        worker=worker,
        observed_at=observed_at,
        reference_suffix="-wrong",
    )

    outcome = decide_lifecycle_for_node(
        db,
        debate=debate,
        node=node,
        decision_timestamp=DECISION_TIME,
    )

    assert outcome.action == "continue"
    assert outcome.keeps_path_active is True
    assert outcome.authentic_policy_decision is False
    assert outcome.input_state == "mismatched"
    assert "evidence_source_mismatch" in outcome.reason_codes


def test_authentic_abandonment_persists_statuses_and_spawns_no_child(db, monkeypatch) -> None:
    debate, node, generation, worker, branch = _subject(db)
    observed_at = DECISION_TIME - timedelta(minutes=5)
    _persist_score(
        db,
        debate=debate,
        node=node,
        generation=generation,
        branch=branch,
        observed_at=observed_at,
    )
    _persist_grounded_evidence(
        db,
        debate=debate,
        node=node,
        worker=worker,
        observed_at=observed_at,
    )

    monkeypatch.setattr("app.services.orchestrator.now_utc", lambda: DECISION_TIME)
    spawn_child_argument_jobs(
        db,
        debate,
        node,
        [{"node_type": "CON", "claim": "A generated challenge."}],
    )
    db.flush()

    assert node.path_status == "abandoned"
    assert node.stopping_status == "abandon"
    assert node.stopping_reason == "low-strength low-impact path is resolved enough to pause"
    assert db.scalars(select(Node).where(Node.parent_id == node.id, Node.node_type != "EVIDENCE")).all() == []
    assert db.scalars(select(Job).where(Job.node_id == node.id)).all() == []


def test_stale_inputs_persist_fail_safe_continuation_and_retry_is_idempotent(db, monkeypatch) -> None:
    debate, node, generation, worker, branch = _subject(db)
    stale_time = DECISION_TIME - timedelta(hours=2)
    _persist_score(
        db,
        debate=debate,
        node=node,
        generation=generation,
        branch=branch,
        observed_at=stale_time,
    )
    _persist_grounded_evidence(
        db,
        debate=debate,
        node=node,
        worker=worker,
        observed_at=stale_time,
    )
    candidates = [
        {"node_type": "PRO", "claim": "A generated support."},
        {"node_type": "CON", "claim": "A generated challenge."},
    ]

    monkeypatch.setattr("app.services.orchestrator.now_utc", lambda: DECISION_TIME)
    spawn_child_argument_jobs(db, debate, node, candidates)
    db.flush()

    # First spawn: `node` was still childless when the lifecycle decision
    # ran, so the persisted (stale) score's input_hash still matches --
    # staleness alone (not a tree change) drives the fail-safe "continue".
    children = db.scalars(
        select(Node).where(Node.parent_id == node.id, Node.node_type != "EVIDENCE")
    ).all()
    child_ids = [child.id for child in children]
    jobs = db.scalars(select(Job).where(Job.node_id.in_(child_ids))).all()
    assert node.path_status == "active"
    assert node.stopping_status == "continue"
    assert node.stopping_reason
    assert "score_stale" in node.stopping_reason
    assert "evidence_stale" in node.stopping_reason
    assert len(children) == 2
    assert len(jobs) == 2

    # Retry is idempotent: no duplicate children are spawned. Task 3
    # amendment (controller follow-up, docs/improvement-plan-2026-07-22.md
    # §P2.3): by now `node` HAS the two real children just spawned above, so
    # the live input_hash (which now keys on children, not just claim +
    # argument_text) genuinely no longer matches the persisted score --
    # "score_input_hash_mismatch" is the honest reason this time, not
    # "score_stale": the TREE changed, not just the clock. This is exactly
    # the invalidation the amendment exists to guarantee.
    spawn_child_argument_jobs(db, debate, node, candidates)
    db.flush()

    assert node.stopping_reason
    assert "score_input_hash_mismatch" in node.stopping_reason
    assert "evidence_stale" in node.stopping_reason
    children_after_retry = db.scalars(
        select(Node).where(Node.parent_id == node.id, Node.node_type != "EVIDENCE")
    ).all()
    assert len(children_after_retry) == 2
    assert [child.id for child in children_after_retry] == child_ids


def test_duplicate_authenticated_artifact_linkage_fails_closed(db) -> None:
    debate, node, generation, worker, branch = _subject(db)
    observed_at = DECISION_TIME - timedelta(minutes=5)
    _persist_score(
        db,
        debate=debate,
        node=node,
        generation=generation,
        branch=branch,
        observed_at=observed_at,
    )
    _persist_grounded_evidence(
        db,
        debate=debate,
        node=node,
        worker=worker,
        observed_at=observed_at,
    )
    source = db.get(JudgeOutputArtifact, "judge-artifact-current")
    assert source is not None
    _persist_lookalike_artifact(
        db,
        source=source,
        artifact_id="judge-artifact-duplicate",
        analyzer_run_id="score-run-current",
        raw_output='{"duplicate": true}',
    )

    outcome = decide_lifecycle_for_node(
        db,
        debate=debate,
        node=node,
        decision_timestamp=DECISION_TIME,
    )

    assert outcome.action == "continue"
    assert outcome.authentic_policy_decision is False
    assert outcome.input_state == "unverifiable"
    assert "score_provenance_ambiguous" in outcome.reason_codes


def test_equal_payload_timestamp_lookalike_runs_fail_closed(db) -> None:
    debate, node, generation, worker, branch = _subject(db)
    observed_at = DECISION_TIME - timedelta(minutes=5)
    _persist_score(
        db,
        debate=debate,
        node=node,
        generation=generation,
        branch=branch,
        observed_at=observed_at,
    )
    _persist_grounded_evidence(
        db,
        debate=debate,
        node=node,
        worker=worker,
        observed_at=observed_at,
    )
    source_run = db.get(AnalyzerRun, "score-run-current")
    source_artifact = db.get(JudgeOutputArtifact, "judge-artifact-current")
    assert source_run is not None
    assert source_artifact is not None
    lookalike_run = _persist_equal_payload_run(
        db,
        source=source_run,
        run_id="score-run-lookalike",
        sequence=2,
    )
    _persist_lookalike_artifact(
        db,
        source=source_artifact,
        artifact_id="judge-artifact-lookalike-run",
        analyzer_run_id=lookalike_run.id,
        raw_output='{"lookalike": true}',
    )

    outcome = decide_lifecycle_for_node(
        db,
        debate=debate,
        node=node,
        decision_timestamp=DECISION_TIME,
    )

    assert outcome.action == "continue"
    assert outcome.authentic_policy_decision is False
    assert outcome.input_state == "unverifiable"
    assert "score_provenance_ambiguous" in outcome.reason_codes


def test_score_run_candidate_limit_is_typed_fail_safe(db, monkeypatch) -> None:
    debate, node, generation, _worker, branch = _subject(db)
    observed_at = DECISION_TIME - timedelta(minutes=5)
    _persist_score(
        db,
        debate=debate,
        node=node,
        generation=generation,
        branch=branch,
        observed_at=observed_at,
    )
    source = db.get(JudgeOutputArtifact, "judge-artifact-current")
    assert source is not None
    _persist_lookalike_artifact(
        db,
        source=source,
        artifact_id="judge-artifact-over-limit",
        analyzer_run_id="score-run-current",
        raw_output='{"over_limit": true}',
    )
    monkeypatch.setattr(
        "app.exploration.lifecycle_decision_service.MAX_SCORING_RESULT_CANDIDATES",
        1,
    )

    outcome = decide_lifecycle_for_node(
        db,
        debate=debate,
        node=node,
        decision_timestamp=DECISION_TIME,
    )

    assert outcome.action == "continue"
    assert outcome.authentic_policy_decision is False
    assert "score_run_candidate_limit_exceeded" in outcome.reason_codes


def test_score_record_candidate_limit_is_typed_fail_safe(db, monkeypatch) -> None:
    debate, node, generation, _worker, branch = _subject(db)
    observed_at = DECISION_TIME - timedelta(minutes=5)
    source = _persist_score(
        db,
        debate=debate,
        node=node,
        generation=generation,
        branch=branch,
        observed_at=observed_at,
    )
    db.add(
        NodeScoringResult(
            id="score-record-over-limit",
            debate_id=source.debate_id,
            node_id=source.node_id,
            input_hash=source.input_hash,
            judge_role=source.judge_role,
            provider="other-fixture-provider",
            model="other-fixture-model",
            judge_id=source.judge_id,
            judge_version=source.judge_version,
            contract_hash=source.contract_hash,
            provider_metadata=source.provider_metadata,
            status=source.status,
            result=source.result,
            created_at=source.created_at,
            updated_at=source.updated_at,
        )
    )
    db.flush()
    monkeypatch.setattr(
        "app.exploration.lifecycle_decision_service.MAX_SCORING_RESULT_CANDIDATES",
        1,
    )

    outcome = decide_lifecycle_for_node(
        db,
        debate=debate,
        node=node,
        decision_timestamp=DECISION_TIME,
    )

    assert outcome.action == "continue"
    assert outcome.authentic_policy_decision is False
    assert "score_candidate_limit_exceeded" in outcome.reason_codes


@pytest.mark.parametrize("input_state", ["missing", "stale"])
def test_abandoned_parent_preserves_prior_stop_for_non_authentic_inputs(
    db,
    monkeypatch,
    input_state: str,
) -> None:
    debate, node, generation, worker, branch = _subject(db)
    node.path_status = "abandoned"
    node.stopping_status = "abandon"
    node.stopping_reason = "Prior authentic stop"
    if input_state == "stale":
        stale_time = DECISION_TIME - timedelta(hours=2)
        _persist_score(
            db,
            debate=debate,
            node=node,
            generation=generation,
            branch=branch,
            observed_at=stale_time,
        )
        _persist_grounded_evidence(
            db,
            debate=debate,
            node=node,
            worker=worker,
            observed_at=stale_time,
        )

    monkeypatch.setattr("app.services.orchestrator.now_utc", lambda: DECISION_TIME)
    spawn_child_argument_jobs(
        db,
        debate,
        node,
        [{"node_type": "PRO", "claim": "Must not be spawned."}],
    )
    db.flush()

    assert node.path_status == "abandoned"
    assert node.stopping_status == "abandon"
    assert node.stopping_reason == "Prior authentic stop"
    assert db.scalars(
        select(Node).where(Node.parent_id == node.id, Node.node_type != "EVIDENCE")
    ).all() == []
    assert db.scalars(select(Job).where(Job.node_id == node.id)).all() == []
