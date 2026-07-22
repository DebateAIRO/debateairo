"""Lifecycle reevaluation triggered by one durably completed scoring run."""
from __future__ import annotations

from collections.abc import Mapping

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.write_lock import commit_write
from app.evidence.verification_evaluator import (
    evaluate_evidence_verdict,
    evidence_node_verification_eligible,
)
from app.exploration.decision_repository import (
    LIFECYCLE_DECISION_SCHEMA_VERSION,
    LifecycleDecisionPersistence,
    LifecycleDecisionSnapshot,
    persist_lifecycle_decision,
)
from app.exploration.lifecycle_decision_service import decide_lifecycle_for_node
from app.exploration.policy import EXPANSION_ACTIONS
from app.models.entities import AnalyzerRun, Debate, Job, JudgeOutputArtifact, Node, now_utc
from app.scoring.judges import ScoringProvider
from app.services.events import event_bus


# "ROOT_CLAIM" is the real root node_type at every creation site
# (orchestrator.create_debate, dialectical_v2.create_dialectical_debate,
# single_shot) -- see app/qbaf/debate_adapter.py for the canonical node-type
# vocabulary. The former "ROOT" entry matched nothing and silently made the
# root permanently lifecycle-ineligible (W0 fix B5).
#
# W4 evidence-verification interlock (explicit policy): categorical
# evidence-status signals exist only when DIALECTICAL_EVIDENCE_VERIFICATION
# is ON -- the verification evaluator is the ONLY writer of grounded
# EvidenceLifecycleSnapshots, and decide_lifecycle_for_node reaches an
# authenticated (grounded) outcome only through such a snapshot. With the
# flag OFF (its default), NO authenticated decision can exist here at all,
# so the fatal-flag / claim-type categorical signals -- which flow through
# the same grounded-authentication gate -- cannot fire either; the only live
# categorical steering source is then explicit user approval (the approvals
# endpoint). No evidence signal is ever fabricated to work around this:
# fail-safe outcomes stay unauthenticated, are not persisted, and can never
# spawn (binding: no fake runtime data; verificationStatus never decides
# gate eligibility).
_ARGUMENT_NODE_TYPES = {"ROOT_CLAIM", "PRO", "CON"}
_REEVALUATION_KEY = "lifecycle_reevaluation"
_REEVALUATION_SCHEMA_VERSION = "scoring-completion-lifecycle/v1"


def _nonblank_attribute(value: object, name: str) -> bool:
    attribute = getattr(value, name, None)
    return isinstance(attribute, str) and bool(attribute.strip())


def _authenticates_completed_run(
    outcome: object,
    *,
    run: AnalyzerRun,
    decision_timestamp: object,
) -> bool:
    action = getattr(outcome, "action", None)
    keeps_path_active = getattr(outcome, "keeps_path_active", None)
    return (
        getattr(outcome, "authentic_policy_decision", False) is True
        and getattr(outcome, "input_state", None) == "grounded"
        and action in EXPANSION_ACTIONS
        and isinstance(keeps_path_active, bool)
        and keeps_path_active is (action != "abandon")
        and _nonblank_attribute(outcome, "stopping_reason")
        and getattr(outcome, "score_run_id", None) == run.id
        and getattr(outcome, "score_run_sequence", None) == run.seq
        and _nonblank_attribute(outcome, "score_record_id")
        and _nonblank_attribute(outcome, "evidence_snapshot_id")
        and _nonblank_attribute(outcome, "current_score_input_hash")
        and _nonblank_attribute(outcome, "scoring_contract_hash")
        and getattr(outcome, "decision_timestamp", None) == decision_timestamp
        and getattr(outcome, "reason_codes", None) == ()
    )


def _already_reevaluated(run: AnalyzerRun, *, job_id: str) -> bool:
    marker = run.provenance.get(_REEVALUATION_KEY)
    return (
        isinstance(marker, Mapping)
        and set(marker) == {
            "schema_version",
            "status",
            "job_id",
            "analyzer_run_id",
            "node_ids",
        }
        and marker.get("schema_version") == _REEVALUATION_SCHEMA_VERSION
        and marker.get("status") == "complete"
        and marker.get("job_id") == job_id
        and marker.get("analyzer_run_id") == run.id
        and isinstance(marker.get("node_ids"), list)
        and all(isinstance(node_id, str) and node_id for node_id in marker["node_ids"])
        and len(marker["node_ids"]) == len(set(marker["node_ids"]))
    )


def _lifecycle_event_payload(
    persistence: LifecycleDecisionPersistence,
) -> dict[str, object]:
    record = persistence.record
    return {
        "schema_version": record.schema_version,
        "record_id": record.id,
        "idempotency_key": record.idempotency_key,
        "debate_id": record.debate_id,
        "node_id": record.node_id,
        "decision": record.decision,
        "stopping_reason": record.stopping_reason,
        "input_states": {
            "aggregate": record.input_state,
            "score": {
                "availability": record.score_availability,
                "freshness": record.score_freshness,
            },
            "evidence": {
                "availability": record.evidence_availability,
                "freshness": record.evidence_freshness,
            },
        },
        "path_status": record.path_status,
        "stopping_status": record.stopping_status,
        "persistence_result": persistence.persistence_result,
        "child_spawn_count": record.child_spawn_count,
    }


def _completed_operation(
    db: Session,
    *,
    debate_id: str,
    job_id: str,
    analyzer_run_id: str,
) -> tuple[Debate, AnalyzerRun, list[str]] | None:
    debate = db.get(Debate, debate_id)
    job = db.get(Job, job_id)
    run = db.get(AnalyzerRun, analyzer_run_id)
    if (
        debate is None
        or job is None
        or job.debate_id != debate_id
        or job.job_type != "score_debate"
        or job.status != "complete"
        or run is None
        or run.debate_id != debate_id
        or run.analyzer_type != "node_scoring"
        or run.status != "complete"
        or not isinstance(run.seq, int)
        or run.seq <= 0
        or not isinstance(run.output, Mapping)
        or run.output.get("debate_id") != debate_id
        or not isinstance(run.provenance, Mapping)
        or run.provenance.get("scoring_source") != "judge_outputs"
        or run.provenance.get("job_id") != job_id
    ):
        return None
    raw_node_ids = run.provenance.get("node_ids")
    if not isinstance(raw_node_ids, list):
        return None
    node_ids: list[str] = []
    seen: set[str] = set()
    for value in raw_node_ids:
        if (
            not isinstance(value, str)
            or not value
            or value != value.strip()
            or value in seen
        ):
            continue
        seen.add(value)
        node_ids.append(value)
    return debate, run, node_ids


def reevaluate_lifecycle_after_scoring_completion(
    db: Session,
    *,
    debate_id: str,
    job_id: str,
    analyzer_run_id: str,
    verification_provider: ScoringProvider | None = None,
) -> None:
    """Reevaluate exact eligible nodes without creating exploration work."""

    operation = _completed_operation(
        db,
        debate_id=debate_id,
        job_id=job_id,
        analyzer_run_id=analyzer_run_id,
    )
    if operation is None:
        return
    debate, run, node_ids = operation
    if _already_reevaluated(run, job_id=job_id):
        return
    artifact_node_ids = set(
        db.scalars(
            select(JudgeOutputArtifact.node_id).where(
                JudgeOutputArtifact.debate_id == debate_id,
                JudgeOutputArtifact.job_id == job_id,
                JudgeOutputArtifact.analyzer_run_id == analyzer_run_id,
                JudgeOutputArtifact.node_id.in_(node_ids),
            )
        )
    )
    nodes = db.scalars(
        select(Node).where(
            Node.debate_id == debate_id,
            Node.id.in_(node_ids),
        )
    ).all()
    nodes_by_id = {node.id: node for node in nodes}
    eligible = []
    for node_id in node_ids:
        node = nodes_by_id.get(node_id)
        if (
            node is not None
            and node.id in artifact_node_ids
            and isinstance(node.node_type, str)
            and node.node_type in _ARGUMENT_NODE_TYPES
            and node.status != "stale"
        ):
            eligible.append(node)
    evidence_by_parent: dict[str, list[Node]] = {}
    if verification_provider is not None and eligible:
        evidence_nodes = db.scalars(
            select(Node)
            .where(
                Node.debate_id == debate_id,
                Node.parent_id.in_([node.id for node in eligible]),
                Node.node_type == "EVIDENCE",
                Node.status != "stale",
                Node.active_generation_id.is_not(None),
            )
            .order_by(Node.parent_id.asc(), Node.position.asc(), Node.id.asc())
        ).all()
        for evidence_node in evidence_nodes:
            if not evidence_node_verification_eligible(evidence_node):
                continue
            assert evidence_node.parent_id is not None
            evidence_by_parent.setdefault(evidence_node.parent_id, []).append(evidence_node)
    event_handoffs: list[LifecycleDecisionPersistence] = []
    try:
        for node in eligible:
            for evidence_node in evidence_by_parent.get(node.id, []):
                evaluate_evidence_verdict(
                    db,
                    debate,
                    node,
                    evidence_node,
                    verification_provider,
                    commit=False,
                )
        decision_timestamp = now_utc()
        for node in eligible:
            outcome = decide_lifecycle_for_node(
                db,
                debate=debate,
                node=node,
                decision_timestamp=decision_timestamp,
            )
            if not _authenticates_completed_run(
                outcome,
                run=run,
                decision_timestamp=decision_timestamp,
            ):
                continue
            node.stopping_status = outcome.action
            node.stopping_reason = outcome.stopping_reason.strip()
            node.path_status = (
                "active"
                if outcome.keeps_path_active and outcome.action != "abandon"
                else "abandoned"
            )
            persistence = persist_lifecycle_decision(
                db,
                snapshot=LifecycleDecisionSnapshot(
                    schema_version=LIFECYCLE_DECISION_SCHEMA_VERSION,
                    idempotency_key=f"scoring-completion:{run.id}:{node.id}",
                    debate_id=debate_id,
                    node_id=node.id,
                    decision=outcome.action,
                    stopping_reason=node.stopping_reason,
                    path_status=node.path_status,
                    stopping_status=node.stopping_status,
                    input_state=outcome.input_state,
                    reason_codes=outcome.reason_codes,
                    score_availability="present",
                    score_freshness="fresh",
                    evidence_availability="present",
                    evidence_freshness="fresh",
                    current_score_input_hash=outcome.current_score_input_hash,
                    scoring_contract_hash=outcome.scoring_contract_hash,
                    score_record_id=outcome.score_record_id,
                    score_run_id=outcome.score_run_id,
                    score_run_sequence=outcome.score_run_sequence,
                    evidence_snapshot_id=outcome.evidence_snapshot_id,
                    decision_timestamp=outcome.decision_timestamp,
                    # Always 0 at decision time: real spawning happens in the
                    # adaptive dispatcher AFTER this reevaluation (W4), which
                    # writes the real count back onto the record it consumed.
                    child_spawn_count=0,
                    # Fail-closed: a missing classification reads as scalar
                    # and therefore can never steer work.
                    signal_class=getattr(outcome, "signal_class", "scalar"),
                    config_override=None,
                ),
            )
            if persistence.persistence_result == "created":
                event_handoffs.append(persistence)
        run.provenance = {
            **dict(run.provenance),
            _REEVALUATION_KEY: {
                "schema_version": _REEVALUATION_SCHEMA_VERSION,
                "status": "complete",
                "job_id": job_id,
                "analyzer_run_id": run.id,
                "node_ids": [node.id for node in eligible],
            },
        }
        commit_write(db)
    except Exception:
        db.rollback()
        raise
    for persistence in event_handoffs:
        event_bus.publish_from_sync(
            debate_id,
            "dialectical_exploration",
            _lifecycle_event_payload(persistence),
        )
