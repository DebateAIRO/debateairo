"""Lifecycle reevaluation triggered by one durably completed scoring run."""
from __future__ import annotations

import logging
from collections.abc import Mapping

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.write_lock import commit_write, hold_write_lock
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

LOGGER = logging.getLogger(__name__)


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
                # 2026-07-26: per-node degradation, matching the judge-panel
                # precedent -- one evidence node's verification failure must
                # never kill the whole lifecycle tail. Before this guard, one
                # transient persist error 25 evidence nodes into the loop
                # (score job 39cf6b82) discarded all lifecycle decisions and
                # with them the entire adaptive-expansion dispatch: the P1
                # frontier never ran. An unverified evidence node is an
                # honest, fail-closed lifecycle input (the resolver treats a
                # missing verdict as unresolved); a dead tail is neither.
                try:
                    evaluate_evidence_verdict(
                        db,
                        debate,
                        node,
                        evidence_node,
                        verification_provider,
                        commit=False,
                    )
                except Exception:
                    LOGGER.exception(
                        "evidence verification degraded (non-fatal) debate=%s claim=%s evidence=%s",
                        debate_id,
                        node.id,
                        evidence_node.id,
                    )
                    db.rollback()
        decision_timestamp = now_utc()
        # commit -- NOT rollback -- before the decision phase: the
        # verification loop's commit=False persists are flushed but
        # uncommitted, so a rollback here would silently discard every
        # verification verdict (the lifecycle suite caught exactly that as
        # verificationStatus reverting to pending_verification). Committing
        # makes the expensive CLI-derived verifications durable-early -- the
        # same call the F1 panel fix made deliberately -- and a crash between
        # here and the decision commit leaves durable verifications + no
        # decisions, which the next scoring pass redecides benignly. It also
        # releases SQLite's RESERVED writer, which the flushed-but-uncommitted
        # verification writes were holding.
        #
        # TWO PHASES, AND THE LOCK COVERS EXACTLY THE SECOND (FW3 re-review,
        # NB-1). THE RULE, and it is general: never leave SQLite's RESERVED
        # writer held while the process write lock is free.
        #
        # Why that is the rule. Every in-process writer goes through
        # app.core.write_lock, so it takes the RLock and THEN talks to SQLite.
        # If this phase holds RESERVED (which it does from the first
        # authenticated INSERT to the final commit) with the RLock free, a
        # worker heartbeat, a job lease refresh or a generation completion
        # acquires the RLock, blocks inside SQLite on our RESERVED lock, and we
        # can no longer commit -- committing needs that same RLock. Neither
        # side can move until busy_timeout (30s in production) expires and the
        # contender dies with "database is locked". That is the failure family
        # this branch exists to remove, and the string the flip plan's
        # acceptance step 6 greps for.
        #
        # I-6's objection is still answered, and better than by the shape it
        # objected to. The expensive part of this phase is the per-node
        # compute -- decide_lifecycle_for_node issues several reads per node,
        # 34 nodes on the live P1 debate -- and it takes no locks and writes
        # nothing. It now runs FIRST, entirely outside the critical section.
        # What remains inside is bounded and I/O-light: one INSERT per
        # AUTHENTICATED decision, the node attribute updates, the run marker,
        # and the commit. So the hold is proportional to decisions persisted,
        # not to nodes considered, and contains no query loop and no CLI.
        #
        # Splitting the phases is semantically free: decide_lifecycle_for_node
        # reads persisted score/evidence/artifact rows plus the node's own
        # path_status, and no node's decision reads anything another node's
        # decision writes -- each node is decided exactly once, and the
        # decision_timestamp was already captured once for all of them above.
        #
        # KNOWN REMAINING INSTANCE of the rule above, deliberately not changed
        # here: the verification loop overhead just before this. _persist_
        # verification_attempt(commit=False) flushes under the lock and returns
        # with the lock released and RESERVED still held, until the NEXT
        # evidence node's pre-CLI commit_write. That window is short -- a
        # handful of queries, never a CLI, since the CLI runs after that commit
        # -- and closing it means changing when verification verdicts become
        # durable, which is its own decision with its own incident history (see
        # the commit-not-rollback note above). Recorded so the rule is not read
        # as already universal.
        commit_write(db)
        decisions = _decide_lifecycle_outcomes(
            db,
            debate=debate,
            eligible=eligible,
            decision_timestamp=decision_timestamp,
        )
        with hold_write_lock(db):
            _persist_lifecycle_decisions(
                db,
                debate_id=debate_id,
                job_id=job_id,
                run=run,
                decisions=decisions,
                decision_timestamp=decision_timestamp,
                event_handoffs=event_handoffs,
            )
    except Exception:
        db.rollback()
        raise
    for persistence in event_handoffs:
        event_bus.publish_from_sync(
            debate_id,
            "dialectical_exploration",
            _lifecycle_event_payload(persistence),
        )


def _decide_lifecycle_outcomes(
    db: Session,
    *,
    debate: Debate,
    eligible: list[Node],
    decision_timestamp,
) -> list[tuple[Node, object]]:
    """PHASE 1: decide every eligible node. Reads only, no lock, no writes.

    This is the expensive half -- several queries per node -- and none of it
    needs the write lock or belongs inside it (see the caller's NB-1 note).
    """
    return [
        (
            node,
            decide_lifecycle_for_node(
                db,
                debate=debate,
                node=node,
                decision_timestamp=decision_timestamp,
            ),
        )
        for node in eligible
    ]


def _persist_lifecycle_decisions(
    db: Session,
    *,
    debate_id: str,
    job_id: str,
    run: AnalyzerRun,
    decisions: list[tuple[Node, object]],
    decision_timestamp,
    event_handoffs: list[LifecycleDecisionPersistence],
) -> None:
    """PHASE 2: persist the authenticated decisions, the run marker, commit.

    MUST be called with the process write lock already held (the caller does
    it). Every write in the lifecycle tail happens here, so holding the lock
    across the whole function is what guarantees SQLite's RESERVED writer --
    taken by the first INSERT below -- is never held while the lock is free.
    See the caller's NB-1 note for what that prevents.
    """
    for node, outcome in decisions:
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
            "node_ids": [node.id for node, _outcome in decisions],
        },
    }
    commit_write(db)
