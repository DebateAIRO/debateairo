"""Authenticated lifecycle decisions at the orchestration boundary.

This service owns database loading and policy invocation.  It never repairs
or substitutes lifecycle inputs: only persisted score/evidence values that
the LIP-01 and LIP-02 resolvers accept for one explicit decision timestamp
may reach ``ExplorationPolicy``.
"""
from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.evidence.lifecycle_input_repository import (
    EvidenceLifecycleResolution,
    load_evidence_lifecycle_candidates,
    resolve_evidence_lifecycle_input,
)
from app.exploration.lifecycle_inputs import (
    SCHEMA_VERSION,
    ComponentResolution,
    EvidenceSourceIdentity,
    ExpectedLifecycleCorrelation,
    RunIdentity,
    ScoringContractIdentity,
    map_lifecycle_inputs,
    policy_signals_for_lifecycle,
)
from app.exploration.policy import ExplorationPolicy
from app.exploration.scoring_input_resolver import (
    MAX_SCORING_RESULT_CANDIDATES,
    ScoringInputResolution,
    ScoringResultCandidate,
    resolve_scoring_input,
)
from app.models.entities import (
    AnalyzerRun,
    Debate,
    Generation,
    JudgeOutputArtifact,
    Node,
    NodeScoringResult,
)
from app.scoring.cache import node_scoring_input_hash
from app.scoring.judge_registry import active_contract
from app.scoring.models import ClaimAssessment
from app.scoring.normalizer import normalize_claim
# Task 3 amendment (controller follow-up, docs/improvement-plan-2026-07-22.md
# §P2.3): reuses the SAME live children-fetch app.scoring.service's
# score_node_with_provider uses to build both the judge payload and the
# cache key, rather than a second, potentially-diverging implementation --
# a lifecycle decision's "current" input hash must be computed exactly the
# way a fresh score would be, or it can never correctly authenticate a
# persisted score against the node's live state. Cross-module import of a
# private helper mirrors the existing
# app.evidence.verification_evaluator -> app.scoring.service._public_metadata_text
# precedent.
from app.scoring.service import _node_children_for_judge


DEFAULT_SCORE_MAX_AGE_SECONDS = 60 * 60
DEFAULT_EVIDENCE_MAX_AGE_SECONDS = 60 * 60
SCORING_ANALYZER_TYPE = "node_scoring"
SCORING_SOURCE = "judge_outputs"
_STATE_PRECEDENCE = {
    "grounded": -1,
    "missing": 0,
    "pending": 1,
    "unverifiable": 2,
    "stale": 3,
    "mismatched": 4,
    "malformed": 5,
}
# Task 16 (P3.2, adaptive-expansion activation readiness): a REAL, judge-
# produced adverse verdict is just as authoritative as a "grounded"(=
# supports) one for POLICY purposes -- app.exploration.policy's categorical
# challenge branch is grounded in EvidenceStatus.CONTRADICTED/REFUTED +
# EntailmentLabel.REFUTES, and its seek_evidence branch in
# EvidenceStatus.{MISSING,UNAVAILABLE,NO_INFO}. resolve_evidence_lifecycle_
# input's OWN "state" name deliberately stays "contradicted"/"no_info" (never
# rewritten to "grounded") because it must still refuse to authorize an
# ABANDON decision -- see its "grounded_for_abandonment" field and
# test_resolver_withholds_authoritative_but_contradicted_evidence. This set
# names exactly which evidence-resolution states may proceed to the real
# policy signal below; every other non-grounded state (missing/pending/
# unverifiable-from-an-infra-failure/stale/mismatched/malformed) still fails
# safe exactly as before.
_EVIDENCE_AUTHENTICATING_STATES = {"grounded", "contradicted", "no_info"}


@dataclass(frozen=True)
class LifecycleDecisionOutcome:
    action: str
    keeps_path_active: bool
    stopping_reason: str
    input_state: str
    reason_codes: tuple[str, ...]
    authentic_policy_decision: bool
    decision_timestamp: datetime
    current_score_input_hash: str
    scoring_contract_hash: str
    score_record_id: str | None = None
    score_run_id: str | None = None
    score_run_sequence: int | None = None
    evidence_snapshot_id: str | None = None
    # W4 categorical-only steering law (see app.exploration.policy): the
    # policy's structural classification travels with the outcome so the
    # persisted decision record can carry it. Fail-closed default: scalar.
    signal_class: str = "scalar"


def _utc(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() != timezone.utc.utcoffset(value):
        raise ValueError("decision_timestamp must be timezone-aware UTC")
    return value.astimezone(timezone.utc)


def _parsed_utc(value: object) -> datetime | None:
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, str):
        text = value.strip()
        if text.endswith("Z"):
            text = f"{text[:-1]}+00:00"
        try:
            parsed = datetime.fromisoformat(text)
        except ValueError:
            return None
    else:
        return None
    if parsed.tzinfo is None:
        # SQLite drops offsets on round-trip.  Persisted scoring timestamps
        # are specified as UTC, so a database-returned naive value is UTC.
        parsed = parsed.replace(tzinfo=timezone.utc)
    if parsed.utcoffset() != timezone.utc.utcoffset(parsed):
        return None
    return parsed.astimezone(timezone.utc)


def _active_contract_identity() -> ScoringContractIdentity:
    contract = active_contract("judge")
    return ScoringContractIdentity(
        judge_id=contract.judge_id,
        judge_version=contract.judge_version,
        role=contract.role,
        rubric_version=contract.rubric_version,
        prompt_version=contract.prompt_version,
        output_schema_version=contract.schema_version,
        reducer_version=contract.reducer_version,
        contract_hash=contract.contract_hash,
    )


def _current_score_input_hash(db: Session, debate: Debate, node: Node) -> str:
    generation = db.get(Generation, node.active_generation_id) if node.active_generation_id else None
    return node_scoring_input_hash(
        claim=normalize_claim(node_id=node.id, raw_text=node.claim),
        argument_text=generation.argument if generation is not None else None,
        # Task 3 amendment: must match exactly how app.scoring.service
        # computes the SAME node's input_hash when it actually scores it, or
        # a fresh score's input_hash could never authenticate against this
        # "current" hash -- see the module-level import comment above.
        debate_question=debate.topic,
        children=_node_children_for_judge(db, node.id),
    )


def _expected_evidence_source(
    db: Session,
    *,
    debate: Debate,
    node: Node,
) -> tuple[EvidenceSourceIdentity | None, str | None]:
    sources = db.scalars(
        select(Node).where(
            Node.debate_id == debate.id,
            Node.parent_id == node.id,
            Node.node_type == "EVIDENCE",
            Node.status != "stale",
        )
    ).all()
    if not sources:
        return None, "evidence_source_missing"
    if len(sources) != 1:
        return None, "evidence_source_ambiguous"
    source = sources[0]
    if not source.active_generation_id:
        return None, "evidence_source_generation_missing"
    kind = None
    if isinstance(source.evidence_metadata, Mapping):
        raw_kind = source.evidence_metadata.get("evidenceKind")
        if isinstance(raw_kind, str) and raw_kind.strip():
            kind = raw_kind.strip()
    if kind is None:
        return None, "evidence_source_kind_missing"
    return (
        EvidenceSourceIdentity(
            evidence_node_id=source.id,
            claim_node_id=node.id,
            generation_id=source.active_generation_id,
            reference=f"evidence-node:{source.id}",
            content_sha256=hashlib.sha256(source.claim.encode("utf-8")).hexdigest(),
            evidence_kind=kind,
        ),
        None,
    )


def _matching_item(payload: object, node_id: str) -> Mapping[str, object] | None:
    if not isinstance(payload, Mapping):
        return None
    items = payload.get("items")
    if not isinstance(items, list):
        return None
    matches = [item for item in items if isinstance(item, Mapping) and item.get("node_id") == node_id]
    return matches[0] if len(matches) == 1 else None


def _run_authenticates_row(
    *,
    run: AnalyzerRun,
    artifact: JudgeOutputArtifact,
    row: NodeScoringResult,
    node_id: str,
    expected_prompt_version: str,
) -> bool:
    provenance = run.provenance if isinstance(run.provenance, Mapping) else {}
    node_ids = provenance.get("node_ids")
    run_job_id = provenance.get("job_id")
    if not isinstance(run.output, Mapping) or run.output.get("debate_id") != row.debate_id:
        return False
    if provenance.get("scoring_source") != SCORING_SOURCE:
        return False
    if (
        not isinstance(run_job_id, str)
        or not run_job_id.strip()
        or artifact.job_id != run_job_id.strip()
    ):
        return False
    if not isinstance(node_ids, list) or node_id not in node_ids:
        return False
    if _matching_item(run.output, node_id) != _matching_item(row.result, node_id):
        return False
    if artifact.prompt_version != expected_prompt_version:
        return False
    if row.status == "available":
        if artifact.parse_status != "available" or not isinstance(artifact.assessment, Mapping):
            return False
        try:
            ClaimAssessment.model_validate(artifact.assessment, strict=True)
        except (TypeError, ValidationError, ValueError):
            return False
    if any(
        left != right
        for left, right in (
            (artifact.input_hash, row.input_hash),
            (artifact.judge_role, row.judge_role),
            (artifact.provider, row.provider),
            (artifact.model, row.model),
            (artifact.judge_id, row.judge_id),
            (artifact.judge_version, row.judge_version),
            (artifact.contract_hash, row.contract_hash),
        )
    ):
        return False
    checked_at = row.provider_metadata.get("checked_at") if isinstance(row.provider_metadata, Mapping) else None
    return _parsed_utc(checked_at) == _parsed_utc(artifact.checked_at)


def _score_resolution(
    db: Session,
    *,
    expected: ExpectedLifecycleCorrelation,
) -> tuple[ScoringInputResolution, RunIdentity | None]:
    rows = db.scalars(
        select(NodeScoringResult)
        .where(
            NodeScoringResult.debate_id == expected.debate_id,
            NodeScoringResult.node_id == expected.node_id,
        )
        .order_by(NodeScoringResult.id.asc())
        .limit(MAX_SCORING_RESULT_CANDIDATES + 1)
    ).all()
    if len(rows) > MAX_SCORING_RESULT_CANDIDATES:
        return (
            ScoringInputResolution(
                resolution=ComponentResolution(
                    component="score",
                    state="unverifiable",
                    availability="present",
                    freshness="unknown",
                    reason_code="score_candidate_limit_exceeded",
                )
            ),
            None,
        )
    if not rows:
        return (
            ScoringInputResolution(
                resolution=ComponentResolution(
                    component="score",
                    state="missing",
                    availability="absent",
                    freshness="unknown",
                    reason_code="score_missing",
                )
            ),
            None,
        )

    candidates: list[ScoringResultCandidate] = []
    for row in rows:
        linked = db.execute(
            select(JudgeOutputArtifact, AnalyzerRun)
            .join(AnalyzerRun, JudgeOutputArtifact.analyzer_run_id == AnalyzerRun.id)
            .where(
                JudgeOutputArtifact.debate_id == expected.debate_id,
                JudgeOutputArtifact.node_id == expected.node_id,
                JudgeOutputArtifact.provider == row.provider,
                JudgeOutputArtifact.model == row.model,
                AnalyzerRun.debate_id == expected.debate_id,
                AnalyzerRun.analyzer_type == SCORING_ANALYZER_TYPE,
                AnalyzerRun.status == "complete",
                AnalyzerRun.seq > 0,
            )
            .order_by(AnalyzerRun.seq.desc())
            .limit(MAX_SCORING_RESULT_CANDIDATES + 1)
        ).all()
        if len(linked) > MAX_SCORING_RESULT_CANDIDATES:
            return (
                ScoringInputResolution(
                    resolution=ComponentResolution(
                        component="score",
                        state="unverifiable",
                        availability="present",
                        freshness="unknown",
                        reason_code="score_run_candidate_limit_exceeded",
                    )
                ),
                None,
            )
        authenticated = [
            (artifact, run)
            for artifact, run in linked
            if _run_authenticates_row(
                run=run,
                artifact=artifact,
                row=row,
                node_id=expected.node_id,
                expected_prompt_version=expected.active_scoring_contract.prompt_version,
            )
        ]
        if len(authenticated) > 1:
            return (
                ScoringInputResolution(
                    resolution=ComponentResolution(
                        component="score",
                        state="unverifiable",
                        availability="present",
                        freshness="unknown",
                        reason_code="score_provenance_ambiguous",
                    )
                ),
                None,
            )
        if authenticated:
            _, run = authenticated[0]
            candidates.append(
                ScoringResultCandidate(
                    row=row,
                    run=RunIdentity(run_id=run.id, sequence=run.seq),
                )
            )
    if not candidates:
        return (
            ScoringInputResolution(
                resolution=ComponentResolution(
                    component="score",
                    state="unverifiable",
                    availability="present",
                    freshness="unknown",
                    reason_code="score_run_unverifiable",
                )
            ),
            None,
        )
    current_run = max(
        (candidate.run for candidate in candidates),
        key=lambda run: run.sequence or 0,
    )
    return (
        resolve_scoring_input(
            expected=expected,
            current_run=current_run,
            candidates=tuple(candidates),
        ),
        current_run,
    )


def _evidence_resolution(
    db: Session,
    *,
    expected: ExpectedLifecycleCorrelation,
    source_problem: str | None,
) -> EvidenceLifecycleResolution:
    if source_problem is not None:
        return EvidenceLifecycleResolution(
            state="missing" if source_problem == "evidence_source_missing" else "unverifiable",
            reason_code=source_problem,
            value=None,
            grounded_for_abandonment=False,
            snapshot_id=None,
        )
    return resolve_evidence_lifecycle_input(db, expected=expected)


def _fail_safe(
    *,
    expected: ExpectedLifecycleCorrelation,
    state: str,
    reasons: tuple[str, ...],
    score_record_id: str | None,
    score_run: RunIdentity | None,
    evidence_snapshot_id: str | None,
) -> LifecycleDecisionOutcome:
    reason_text = "; ".join(reasons) if reasons else "lifecycle_inputs_unavailable"
    return LifecycleDecisionOutcome(
        action="continue",
        keeps_path_active=True,
        stopping_reason=f"lifecycle inputs unavailable: {reason_text}",
        input_state=state,
        reason_codes=reasons,
        authentic_policy_decision=False,
        decision_timestamp=expected.decision_timestamp,
        current_score_input_hash=expected.current_score_input_hash,
        scoring_contract_hash=expected.active_scoring_contract.contract_hash,
        score_record_id=score_record_id,
        score_run_id=score_run.run_id if score_run is not None else None,
        score_run_sequence=score_run.sequence if score_run is not None else None,
        evidence_snapshot_id=evidence_snapshot_id,
    )


def decide_lifecycle_for_node(
    db: Session,
    *,
    debate: Debate,
    node: Node,
    decision_timestamp: datetime,
    score_max_age_seconds: int = DEFAULT_SCORE_MAX_AGE_SECONDS,
    evidence_max_age_seconds: int = DEFAULT_EVIDENCE_MAX_AGE_SECONDS,
) -> LifecycleDecisionOutcome:
    """Load one correlated lifecycle moment and return a persistence-ready result."""

    decision_timestamp = _utc(decision_timestamp)
    evidence_source, source_problem = _expected_evidence_source(
        db,
        debate=debate,
        node=node,
    )
    expected = ExpectedLifecycleCorrelation(
        schema_version=SCHEMA_VERSION,
        debate_id=debate.id,
        node_id=node.id,
        current_score_input_hash=_current_score_input_hash(db, debate, node),
        active_scoring_contract=_active_contract_identity(),
        expected_evidence_source=evidence_source,
        decision_timestamp=decision_timestamp,
        score_max_age_seconds=score_max_age_seconds,
        evidence_max_age_seconds=evidence_max_age_seconds,
    )
    score, current_run = _score_resolution(db, expected=expected)
    evidence = _evidence_resolution(
        db,
        expected=expected,
        source_problem=source_problem,
    )
    reasons = tuple(
        reason
        for reason, grounded in (
            (score.resolution.reason_code, score.resolution.state == "grounded"),
            (evidence.reason_code, evidence.state in _EVIDENCE_AUTHENTICATING_STATES),
        )
        if not grounded
    )
    if reasons:
        state = max(
            (score.resolution.state, evidence.state),
            key=lambda item: _STATE_PRECEDENCE.get(item, _STATE_PRECEDENCE["unverifiable"]),
        )
        return _fail_safe(
            expected=expected,
            state=state,
            reasons=reasons,
            score_record_id=score.selected_record_id,
            score_run=current_run,
            evidence_snapshot_id=evidence.snapshot_id,
        )

    assert score.lifecycle_candidate is not None
    mapped = map_lifecycle_inputs(
        expected=expected,
        score_candidates=(score.lifecycle_candidate,),
        evidence_candidates=load_evidence_lifecycle_candidates(
            db,
            debate_id=debate.id,
            node_id=node.id,
        ),
    )
    signals = policy_signals_for_lifecycle(mapped)
    if signals is None:
        return _fail_safe(
            expected=expected,
            state=mapped.state,
            reasons=mapped.reason_codes,
            score_record_id=score.selected_record_id,
            score_run=current_run,
            evidence_snapshot_id=evidence.snapshot_id,
        )
    score_signal, evidence_signal = signals
    decision = ExplorationPolicy().decide(
        score=score_signal,
        evidence=evidence_signal,
        path_state="abandoned" if node.path_status == "abandoned" else "active",
    )
    stopping_reason = "; ".join(decision.reasons).strip()
    if not stopping_reason:
        stopping_reason = f"authenticated lifecycle policy action: {decision.action}"
    return LifecycleDecisionOutcome(
        action=decision.action,
        keeps_path_active=decision.keeps_path_active,
        stopping_reason=stopping_reason,
        input_state="grounded",
        reason_codes=(),
        authentic_policy_decision=True,
        decision_timestamp=expected.decision_timestamp,
        current_score_input_hash=expected.current_score_input_hash,
        scoring_contract_hash=expected.active_scoring_contract.contract_hash,
        score_record_id=score.selected_record_id,
        score_run_id=current_run.run_id if current_run is not None else None,
        score_run_sequence=current_run.sequence if current_run is not None else None,
        evidence_snapshot_id=evidence.snapshot_id,
        signal_class=decision.signal_class,
    )
