from __future__ import annotations

import json
import logging
import re
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.argument_claim.node_adapter import argument_claim_from_node
from app.core.config import bool_env
from app.evidence.presence import EVIDENCE_STATE_EXTRACTED, evidence_presence
from app.models.entities import (
    AgentCapability,
    AgentOutput,
    AgentRun,
    AnalyzerRun,
    CapabilityMatch,
    Debate,
    DebateBranch,
    Generation,
    Job,
    LifecycleDecisionRecord,
    Node,
    ProvenanceRecord,
    SkillCapability,
    Synthesis,
    Worker,
)
from app.scoring.lean import compute_lean, live_pro_con_node_ids
from app.scoring.verdict import verdict_summary

# Phase 9 Task 1: analyzer_type value for the protocol_analysis AnalyzerRun.
# Duplicated here as a literal (rather than imported from
# app.protocol.runner.PROTOCOL_ANALYSIS_TYPE) because that import creates a
# real circular-import cycle: app.scoring.__init__ -> app.scoring.service ->
# app.services.orchestrator -> app.services.serialization (this module) ->
# app.protocol.runner -> app.scoring.service (partially initialized).
# Confirmed live by attempting the direct import first. Keep this literal in
# sync with app/protocol/runner.py:PROTOCOL_ANALYSIS_TYPE.
PROTOCOL_ANALYSIS_TYPE = "protocol_analysis"
LOGGER = logging.getLogger(__name__)


STREAMING_JOB_STATUSES = {"claimed", "running"}
ACTIVE_DEBATE_JOB_STATUSES = {"pending", "claimed", "running"}


# Stream envelope extraction: workers stream v2 JSON; readers should see prose.
_STREAM_TITLE_RE = re.compile(r'"title"\s*:\s*"((?:[^"\\]|\\.)*)')
_STREAM_CONTENT_RE = re.compile(r'"content"\s*:\s*"((?:[^"\\]|\\.)*)')


def _unescape_json_fragment(fragment: str) -> str:
    try:
        return json.loads(f'"{fragment}"')
    except ValueError:
        return fragment.replace('\\"', '"').replace("\\n", "\n")


def presentable_stream_text(raw: str) -> str:
    """Workers stream the v2 JSON envelope; readers should see prose.
    Extract the fields that have arrived so far instead of showing raw
    JSON. Plain-text streams pass through untouched."""
    text = (raw or "").strip()
    if not text.startswith("{"):
        return raw or ""
    parts = []
    for pattern in (_STREAM_TITLE_RE, _STREAM_CONTENT_RE):
        match = pattern.search(text)
        if match and match.group(1):
            parts.append(_unescape_json_fragment(match.group(1)))
    return "\n\n".join(parts) or "Drafting…"


def iso(dt: datetime | None) -> str | None:
    if not dt:
        return None
    if dt.tzinfo is None or dt.utcoffset() is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    return dt.isoformat()


def _worker_names_by_id(db: Session, worker_ids: set[str]) -> dict[str, str]:
    if not worker_ids:
        return {}
    return {
        worker.id: worker.name
        for worker in db.scalars(select(Worker).where(Worker.id.in_(worker_ids))).all()
    }


def _worker_name(worker_names_by_id: dict[str, str], worker_id: str | None) -> str:
    if not worker_id:
        return ""
    return worker_names_by_id.get(worker_id, worker_id)


def _debate_generation_terminally_failed(db: Session, debate: Debate) -> bool:
    """True when the debate's generation cannot progress: at least one
    generation job has terminally failed and no pending/claimed/running
    generation job remains to advance it. Scoring jobs (``score_debate``) are a
    separate lifecycle and are excluded from both checks."""
    active = db.scalar(
        select(Job.id).where(
            Job.debate_id == debate.id,
            Job.status.in_(ACTIVE_DEBATE_JOB_STATUSES),
            Job.job_type != "score_debate",
        )
    )
    if active is not None:
        return False
    failed = db.scalar(
        select(Job.id).where(
            Job.debate_id == debate.id,
            Job.status == "failed",
            Job.job_type != "score_debate",
        )
    )
    return failed is not None


def effective_debate_status(
    db: Session,
    debate: Debate,
    *,
    nodes: list[Node] | None = None,
    active_jobs: list[Job] | None = None,
) -> str:
    if (debate.status or "").lower() != "generating":
        return debate.status
    if not debate.synthesis_id or not debate.completed_at:
        # No synthesis yet: the debate is either still generating or has
        # terminally failed. Surface an honest "failed" for the latter so the
        # FE can stop spinning instead of polling a debate that can never
        # complete. This is additive -- when generation can still progress we
        # fall through to the unchanged "generating" return below.
        if _debate_generation_terminally_failed(db, debate):
            return "failed"
        return debate.status
    if nodes is None:
        nodes = list(db.scalars(select(Node).where(Node.debate_id == debate.id)).all())
    if any(node.status in {"pending", "generating"} for node in nodes):
        return debate.status
    if active_jobs is None:
        active_jobs = list(
            db.scalars(
                select(Job).where(
                    Job.debate_id == debate.id,
                    Job.status.in_(ACTIVE_DEBATE_JOB_STATUSES),
                    Job.job_type != "score_debate",
                )
            ).all()
        )
    if active_jobs:
        return debate.status
    return "complete"


def generation_summary(
    db: Session,
    generation_id: str | None,
    worker_names_by_id: dict[str, str] | None = None,
) -> dict[str, Any] | None:
    if not generation_id:
        return None
    generation = db.get(Generation, generation_id)
    if not generation:
        return None
    if worker_names_by_id is None:
        worker_names_by_id = _worker_names_by_id(db, {generation.worker_id})
    return {
        "id": generation.id,
        "model_id": generation.model_id,
        "role": generation.role,
        "argument": generation.argument,
        "worker_id": generation.worker_id,
        "worker_name": _worker_name(worker_names_by_id, generation.worker_id),
        "created_at": iso(generation.created_at),
    }


def streaming_generation_summary(
    db: Session,
    job: Job,
    worker_names_by_id: dict[str, str] | None = None,
) -> dict[str, Any]:
    if worker_names_by_id is None:
        worker_names_by_id = _worker_names_by_id(db, {job.worker_id} if job.worker_id else set())
    return {
        "id": f"stream:{job.id}",
        "job_id": job.id,
        "model_id": job.required_model,
        "role": job.required_role,
        "argument": presentable_stream_text(job.stream_buffer or ""),
        "worker_id": job.worker_id or "",
        "worker_name": _worker_name(worker_names_by_id, job.worker_id),
        "created_at": iso(job.claimed_at or job.created_at),
        "is_streaming": True,
    }


def active_synthesis_summary(
    db: Session,
    job: Job,
    worker_names_by_id: dict[str, str] | None = None,
) -> dict[str, Any]:
    if worker_names_by_id is None:
        worker_names_by_id = _worker_names_by_id(db, {job.worker_id} if job.worker_id else set())
    return {
        "id": f"stream:{job.id}",
        "job_id": job.id,
        "debate_id": job.debate_id,
        "model_id": job.required_model,
        "worker_id": job.worker_id or "",
        "worker_name": _worker_name(worker_names_by_id, job.worker_id),
        "created_at": iso(job.claimed_at or job.created_at),
        # Literal buffer, NOT envelope-prose (unlike streaming_generation_
        # summary's "argument"): the web client parses this as JSON
        # (partialJsonField in DebatePageClient.tsx) and appends raw
        # synthesis_token deltas onto it to drive the live synthesis
        # preview. presentable_stream_text() here would break that parser.
        "raw": job.stream_buffer or "",
        "is_streaming": True,
    }


def _humanize_reason(code: str | None) -> str | None:
    # Lazy import (W5a): app.exploration.reason_copy itself has zero
    # app-internal imports, but importing ANY submodule of the
    # app.exploration PACKAGE first runs app/exploration/__init__.py, which
    # imports app.exploration.policy -> app.scoring.models -> (package init)
    # app.scoring.service -> app.services.orchestrator -> this module. A
    # module-level import here would add a new edge into that already-latent
    # cycle (present pre-W5a via this file's own `from app.scoring.verdict
    # import verdict_summary` below) at a point BEFORE this module finishes
    # defining itself. A call-time import is safe: every caller of this
    # function only runs once app.services.serialization has fully loaded.
    from app.exploration.reason_copy import humanize_reason

    return humanize_reason(code)


# Legacy quartet node_type -> curated label pairs. Duplicated here as a literal
# (rather than imported from app.services.dialectical_v2.POV_BRANCHES) because
# dialectical_v2 imports app.services.orchestrator, which imports this module --
# the same real circular-import cycle documented for PROTOCOL_ANALYSIS_TYPE at
# the top of this file. Keep in sync with dialectical_v2.POV_BRANCHES.
_LEGACY_POV_LABELS = {
    "SCIENTIFIC_POV": "Scientific POV",
    "STATISTICAL_POV": "Statistical POV",
    "ETHICAL_POV": "Ethical POV",
    "PRACTICAL_POV": "Practical POV",
}


def _node_label(node: Node) -> str | None:
    """Backend-provided display label for a lens/branch node, or None.

    Dynamic perspectives store their real lens identity in Node.claim while
    reusing (cycling) the legacy POV node_types for scoring-graph safety, so
    the FE must receive the label explicitly -- deriving it from node_type
    would rename e.g. "Mechanism POV" (node_type SCIENTIFIC_POV) to
    "Scientific". Emitted only when the claim differs from the legacy curated
    pairing for that node_type: legacy four-POV debates keep label=None so the
    FE's curated legacy lens names render byte-identically.
    """
    if not str(node.node_type or "").endswith("_POV"):
        return None
    label = (node.claim or "").strip()
    if not label:
        return None
    if _LEGACY_POV_LABELS.get(node.node_type) == label:
        return None
    return label


def node_to_dict(
    db: Session,
    node: Node,
    children_by_parent: dict[str | None, list[Node]],
    streaming_jobs_by_node: dict[str, Job] | None = None,
    worker_names_by_id: dict[str, str] | None = None,
) -> dict[str, Any]:
    streaming_job = (streaming_jobs_by_node or {}).get(node.id)
    status = "generating" if streaming_job else node.status
    argument_claim = argument_claim_from_node(node)
    active_generation = (
        streaming_generation_summary(db, streaming_job, worker_names_by_id)
        if streaming_job
        else generation_summary(db, node.active_generation_id, worker_names_by_id)
    )
    payload = {
        **argument_claim.to_node_payload(status=status),
        "label": _node_label(node),
        "argument_claim": argument_claim.to_domain_payload(status=status),
        "path_status": node.path_status,
        "stopping_status": node.stopping_status,
        "stopping_reason": node.stopping_reason,
        # W5a additive: plain-language copy of stopping_reason via the shared
        # reason-code map (app.exploration.reason_copy). Closes the
        # W1-deferred drawer polish ("set aside because: generation_exhausted"
        # -> mapped copy) without changing the pre-existing stopping_reason
        # value above. None when stopping_reason itself is absent -- no
        # fabrication.
        "stopping_reason_human": _humanize_reason(node.stopping_reason),
        "active_generation": active_generation,
        "children": [
            node_to_dict(db, child, children_by_parent, streaming_jobs_by_node, worker_names_by_id)
            for child in sorted(children_by_parent.get(node.id, []), key=lambda item: item.position)
        ],
    }
    if node.node_type == "EVIDENCE":
        payload["evidence_state"] = EVIDENCE_STATE_EXTRACTED
    return payload


def synthesis_to_dict(
    db: Session,
    synthesis: Synthesis | None,
    worker_names_by_id: dict[str, str] | None = None,
    verdict_gate: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    if not synthesis:
        return None
    if worker_names_by_id is None:
        worker_names_by_id = _worker_names_by_id(db, {synthesis.worker_id})
    payload = {
        "id": synthesis.id,
        "debate_id": synthesis.debate_id,
        "strongest_pro": synthesis.strongest_pro,
        "strongest_con": synthesis.strongest_con,
        "verdict": synthesis.verdict,
        "upstream_agent_output_ids": synthesis.upstream_agent_output_ids or [],
        "upstream_agent_run_ids": synthesis.upstream_agent_output_ids or [],
        "analyzer_findings": synthesis.analyzer_findings or {},
        "provenance": synthesis.provenance or {},
        "model_id": synthesis.model_id,
        "worker_id": synthesis.worker_id,
        "worker_name": _worker_name(worker_names_by_id, synthesis.worker_id),
        "created_at": iso(synthesis.created_at),
    }
    if verdict_gate is not None:
        payload["verdict_gate"] = verdict_gate
    return payload


def branch_to_dict(branch: DebateBranch) -> dict[str, Any]:
    return {
        "id": branch.id,
        "debate_id": branch.debate_id,
        "parent_branch_id": branch.parent_branch_id,
        "root_node_id": branch.root_node_id,
        "status": branch.status,
        "created_at": iso(branch.created_at),
    }


def analyzer_run_to_dict(run: AnalyzerRun) -> dict[str, Any]:
    return {
        "id": run.id,
        "debate_id": run.debate_id,
        "branch_id": run.branch_id,
        "analyzer_type": run.analyzer_type,
        "output": run.output,
        "status": run.status,
        "provenance": run.provenance,
        "created_at": iso(run.created_at),
    }


def capability_match_to_dict(db: Session, match: CapabilityMatch) -> dict[str, Any]:
    model = SkillCapability if match.capability_kind == "skill" else AgentCapability
    capability = db.get(model, match.capability_id)
    definition = capability.definition if capability and isinstance(capability.definition, dict) else {}
    return {
        "id": match.capability_id,
        "match_id": match.id,
        "debate_id": match.debate_id,
        "branch_id": match.branch_id,
        "selection_reason": match.selection_reason,
        "score": match.score,
        "status": capability.status if capability else None,
        "reuse_count": capability.reuse_count if capability else 0,
        "definition": definition,
        "name": definition.get("name"),
        "created_at": iso(match.created_at),
    }


def agent_output_to_dict(output: AgentOutput) -> dict[str, Any]:
    return {
        "id": output.id,
        "debate_id": output.debate_id,
        "branch_id": output.branch_id,
        "skill_id": output.skill_id,
        "agent_id": output.agent_id,
        "analyzer_run_ids": output.analyzer_run_ids or [],
        "pros": output.pros or [],
        "cons": output.cons or [],
        "summary": output.summary,
        "confidence": output.confidence,
        "provenance": output.provenance or {},
        "created_at": iso(output.created_at),
    }


def agent_run_to_dict(db: Session, run: AgentRun) -> dict[str, Any]:
    agent = db.get(AgentCapability, run.agent_definition_id or run.agent_id)
    agent_definition = agent.definition if agent and isinstance(agent.definition, dict) else {}
    skills = [db.get(SkillCapability, skill_id) for skill_id in (run.selected_skill_ids or [])]
    skill_definitions = [skill.definition for skill in skills if skill and isinstance(skill.definition, dict)]
    return {
        "id": run.id,
        "debate_id": run.debate_id,
        "branch_id": run.branch_id,
        "agent_definition_id": run.agent_definition_id or run.agent_id,
        "selected_skill_ids": run.selected_skill_ids or ([run.skill_id] if run.skill_id else []),
        "agent": agent_definition,
        "agent_name": agent_definition.get("name") or run.role,
        "role": run.role,
        "lens": run.lens,
        "status": run.status,
        "prompt_input": run.prompt_input or {},
        "output": run.output or {},
        "pros": run.pros or [],
        "cons": run.cons or [],
        "summary": run.summary,
        "confidence": run.confidence,
        "skills_used": [
            {
                "id": skill.id,
                "name": definition.get("name"),
                "type": definition.get("type") or definition.get("kind"),
                "description": definition.get("description"),
                "tags": definition.get("tags") or definition.get("trigger", {}).get("domain_tags", []),
            }
            for skill, definition in zip([skill for skill in skills if skill], skill_definitions, strict=False)
        ],
        "job_id": run.job_id,
        "worker_id": run.worker_id,
        "model_id": run.model_id,
        "provenance": run.provenance or {},
        "created_at": iso(run.created_at),
    }


def provenance_to_dict(record: ProvenanceRecord) -> dict[str, Any]:
    return {
        "id": record.id,
        "debate_id": record.debate_id,
        "branch_id": record.branch_id,
        "artifact_kind": record.artifact_kind,
        "artifact_id": record.artifact_id,
        "model_id": record.model_id,
        "worker_id": record.worker_id,
        "prompt_id": record.prompt_id,
        "job_id": record.job_id,
        "metadata": record.metadata_json,
        "created_at": iso(record.created_at),
    }


# ---------------------------------------------------------------------------
# W5a: decision provenance -- why the tree grew, why it stopped, what failed.
# ---------------------------------------------------------------------------


def _decision_outcome(record: LifecycleDecisionRecord) -> str:
    """Honest, bounded outcome bucket for one lifecycle decision record.

    ``child_spawn_count`` is the ground truth for "did this decision cause
    growth" -- it is written atomically with ``dispatch_outcome="spawned"``
    (app.exploration.expansion_dispatch.expansion_dispatch), so keying off it
    directly is robust even against the dormant v1 argue path (validate-A
    claim 6) that can also write a real count outside the dispatcher. A
    decision that spawned nothing is honestly "annotate_only" regardless of
    the finer-grained dispatch_outcome reason (scalar signal, target no
    longer expandable, never yet dispatched/flag off) -- those are audit-trail
    detail, not product-facing causality; budget/capacity refusals are kept
    distinct because they answer "why did growth stop", not just "did it".
    """
    if (record.child_spawn_count or 0) > 0:
        return "spawned"
    # Lazy import: app.exploration.expansion_dispatch's module body is a safe
    # leaf (no risky module-level imports of its own), but importing it at
    # serialization.py's module level would sit one hop from the documented
    # app.scoring -> app.services.orchestrator -> app.services.serialization
    # cycle via any future import added there. Matches the lazy-import
    # convention expansion_dispatch.py itself already uses for the same reason.
    from app.exploration.expansion_dispatch import OUTCOME_BUDGET_EXHAUSTED, OUTCOME_DEFERRED_NO_CAPACITY

    if record.dispatch_outcome == OUTCOME_BUDGET_EXHAUSTED:
        return "budget_exhausted"
    if record.dispatch_outcome == OUTCOME_DEFERRED_NO_CAPACITY:
        return "deferred_no_capacity"
    return "annotate_only"


def _lifecycle_decisions_payload(db: Session, debate_id: str) -> list[dict[str, Any]]:
    """Latest lifecycle decision per node (bounded -- never the full audit
    trail, which stays in lifecycle_decision_records). Nothing fabricated: a
    node with no recorded decision simply has no entry."""
    records = list(
        db.scalars(
            select(LifecycleDecisionRecord)
            .where(LifecycleDecisionRecord.debate_id == debate_id)
            .order_by(
                LifecycleDecisionRecord.decision_timestamp.asc(),
                LifecycleDecisionRecord.created_at.asc(),
                LifecycleDecisionRecord.id.asc(),
            )
        ).all()
    )
    latest_by_node: dict[str, LifecycleDecisionRecord] = {}
    for record in records:
        # Ascending order -> the last write per node_id is the latest decision.
        latest_by_node[record.node_id] = record
    ordered = sorted(latest_by_node.values(), key=lambda item: (item.decision_timestamp, item.id))
    return [
        {
            "nodeId": record.node_id,
            "decision": record.decision,
            "signalClass": record.signal_class,
            "reason": _humanize_reason(record.stopping_reason),
            "childSpawnCount": record.child_spawn_count,
            "outcome": _decision_outcome(record),
            "decidedAt": iso(record.decision_timestamp),
        }
        for record in ordered
    ]


# Duplicated literal (same reason as app.exploration.reason_copy's docstring:
# importing app.services.orchestrator here risks the documented circular
# import). Keep in sync with app.services.orchestrator.PUBLIC_DEBATE_FAILURE_CODE.
_DEBATE_GENERATION_FAILED_CODE = "debate_generation_failed"


def _completion_state(effective_status: str, nodes: list[Node]) -> str:
    if effective_status == "complete" and any(node.status == "failed" for node in nodes):
        return "complete-with-failed-branches"
    return effective_status


def _completion_reason_code(state: str, nodes: list[Node], debate: Debate) -> str | None:
    if state in ("complete-with-failed-branches", "failed"):
        # `nodes` comes from an un-ordered query (debate_to_dict); every
        # reachable pipeline path today writes the identical bare code
        # GENERATION_EXHAUSTED_STOPPING_REASON to every failed node, so which
        # one is picked first is currently immaterial -- but sort explicitly
        # (materialized_path, then id) so the choice is deterministic rather
        # than depending on incidental DB row order, in case a future
        # failure path ever introduces a second distinct reason.
        failed_nodes = sorted(
            (node for node in nodes if node.status == "failed"),
            key=lambda node: (node.materialized_path or "", node.id),
        )
        for node in failed_nodes:
            reason = (node.stopping_reason or "").strip()
            if reason:
                # The real, already-persisted node-scoped reason (in every
                # reachable pipeline path today: exactly
                # GENERATION_EXHAUSTED_STOPPING_REASON) -- never fabricated.
                return reason
        if state == "failed":
            # No node-scoped detail available (e.g. a debate-level
            # decompose/synthesize-class terminal failure): the honest
            # generic bucket, never the raw private job.error text.
            return _DEBATE_GENERATION_FAILED_CODE
        return None
    # Lazy import: see _decision_outcome's comment above.
    from app.exploration.expansion_dispatch import stopped_because_of

    return stopped_because_of(debate)


# Debate-level completion copy overrides (Task 7): a handful of reason codes
# read differently at the debate-completion scope than at the per-node scope
# reached via `stopping_reason_human` (see node_to_dict). "generation_exhausted"
# at the node level says a single branch was set aside; at the debate level --
# where synthesis still completed over the survivors -- the honest framing is
# that the debate as a whole succeeded despite the pruning, so a retryable
# hiccup on one branch never reads as a dead debate.
_COMPLETION_REASON_OVERRIDES: dict[str, str] = {
    "generation_exhausted": (
        "Some branches were set aside after repeated failures; the debate completed with the rest."
    ),
}


def _completion_reason_override(state: str, reason_code: str | None) -> str | None:
    """The debate-completion copy overrides only read honestly when synthesis
    actually completed over the survivors. A FAILED debate can carry the
    exact same node-level reason code (e.g. generation_exhausted, from the
    one node that got a stopping_reason recorded) as a complete-with-failed-
    branches debate -- the completed-style "the debate completed with the
    rest" copy must never leak onto a failed one just because the codes
    match. Gate on `state`, not just `reason_code`."""
    if state != "complete-with-failed-branches":
        return None
    return _COMPLETION_REASON_OVERRIDES.get(reason_code or "")


def _completion_block(debate: Debate, effective_status: str, nodes: list[Node]) -> dict[str, Any]:
    """Additive `completion` block: why the debate stopped, in plain language.

    state: the honest effective status, refined with "complete-with-failed-
    branches" when at least one node terminally failed (W1) but synthesis
    still completed over the survivors.
    reasonCode: the terminal branch's real stopping reason, the honest
    generic debate-failure bucket, or the adaptive dispatcher's
    stopped_because (W4) -- never raw private worker text.
    humanReason: reasonCode translated via the debate-completion overrides
    (_completion_reason_override, state-gated to complete-with-failed-
    branches) first, falling back to the shared reason-code map for
    everything else. Failed debates always carry a non-empty humanReason
    (reasonCode is never None when state == "failed").
    """
    state = _completion_state(effective_status, nodes)
    reason_code = _completion_reason_code(state, nodes, debate)
    human_reason = _completion_reason_override(state, reason_code) or _humanize_reason(reason_code)
    return {
        "state": state,
        "reasonCode": reason_code,
        "humanReason": human_reason,
    }


def _latest_protocol_output(db: Session, debate_id: str) -> dict[str, Any] | None:
    """Output of the latest persisted protocol_analysis run, or None.

    Phase 9 Task 1 query shape; Phase 11 Task 1 made AnalyzerRun.seq the
    primary sort key (created_at/id remain only as a defensive fallback for
    legacy rows where seq IS NULL).
    """
    latest_protocol_analysis_run = db.scalars(
        select(AnalyzerRun)
        .where(AnalyzerRun.debate_id == debate_id, AnalyzerRun.analyzer_type == PROTOCOL_ANALYSIS_TYPE)
        .order_by(AnalyzerRun.seq.desc(), AnalyzerRun.created_at.desc(), AnalyzerRun.id.desc())
        .limit(1)
    ).first()
    if latest_protocol_analysis_run and isinstance(latest_protocol_analysis_run.output, dict):
        return latest_protocol_analysis_run.output
    return None


def derive_debate_verdict(
    db: Session,
    debate: Debate,
    *,
    nodes: list[Node] | None = None,
    root: Node | None = None,
) -> dict[str, Any]:
    """The single verdict derivation path (W2 rule), shared surface (W5b).

    Assembles the EXACT inputs debate_to_dict serves verdict_summary -- the
    latest persisted protocol_analysis output, the resolved root node id, the
    debate's evidence presence, and the live gate flag -- so read-only
    consumers (the /api/ops/verdict-shadow telemetry feed) can never drift
    from the wire verdict. Returns {"verdict", "protocol_output",
    "evidence_presence", "root_node_id"}. `nodes`/`root` accept
    debate_to_dict's already-loaded rows to avoid duplicate queries.
    """
    if nodes is None:
        nodes = list(
            db.scalars(
                select(Node).where(
                    Node.debate_id == debate.id,
                    or_(Node.status != "stale", Node.path_status != "active", Node.stopping_status != "active"),
                )
            ).all()
        )
    if root is None:
        root = db.get(Node, debate.root_node_id) if debate.root_node_id else None
    protocol_output = _latest_protocol_output(db, debate.id)
    debate_evidence_presence = evidence_presence(nodes)
    verdict = verdict_summary(
        protocol_output,
        root_node_id=root.id if root else None,
        evidence_presence=debate_evidence_presence,
        gate_enabled=bool_env("DIALECTICAL_VERDICT_EVIDENCE_GATE", False),
    )
    return {
        "verdict": verdict,
        "protocol_output": protocol_output,
        "evidence_presence": debate_evidence_presence,
        "root_node_id": root.id if root else None,
    }


def debate_to_dict(db: Session, debate: Debate) -> dict[str, Any]:
    nodes = list(
        db.scalars(
            select(Node).where(
                Node.debate_id == debate.id,
                or_(Node.status != "stale", Node.path_status != "active", Node.stopping_status != "active"),
            )
        ).all()
    )
    streaming_jobs = list(
        db.scalars(
            select(Job)
            .where(Job.debate_id == debate.id, Job.status.in_(STREAMING_JOB_STATUSES))
            .order_by(Job.claimed_at.desc(), Job.created_at.desc(), Job.id.desc())
        ).all()
    )
    streaming_jobs_by_node: dict[str, Job] = {}
    active_synthesis_job: Job | None = None
    for job in streaming_jobs:
        if job.job_type in {"synthesize", "v2_synthesize"}:
            active_synthesis_job = active_synthesis_job or job
        elif job.job_type in {"decompose", "argue", "v2_pov"} and job.node_id and job.node_id not in streaming_jobs_by_node:
            streaming_jobs_by_node[job.node_id] = job
    children_by_parent: dict[str | None, list[Node]] = defaultdict(list)
    for node in nodes:
        children_by_parent[node.parent_id].append(node)
    root = db.get(Node, debate.root_node_id) if debate.root_node_id else None
    synthesis = db.get(Synthesis, debate.synthesis_id) if debate.synthesis_id else None
    generations = list(
        db.scalars(
            select(Generation).join(Node, Generation.node_id == Node.id).where(Node.debate_id == debate.id)
        ).all()
    )
    worker_ids = {generation.worker_id for generation in generations}
    if synthesis:
        worker_ids.add(synthesis.worker_id)
    worker_ids.update(job.worker_id for job in streaming_jobs if job.worker_id)
    worker_names_by_id = _worker_names_by_id(db, worker_ids)
    worker_names: set[str] = set()
    models = {generation.model_id for generation in generations}
    for generation in generations:
        worker_names.add(_worker_name(worker_names_by_id, generation.worker_id))
    if synthesis:
        models.add(synthesis.model_id)
        worker_names.add(_worker_name(worker_names_by_id, synthesis.worker_id))
    for job in streaming_jobs:
        models.add(job.required_model)
        if job.worker_id:
            worker_names.add(_worker_name(worker_names_by_id, job.worker_id))
    branches = list(
        db.scalars(select(DebateBranch).where(DebateBranch.debate_id == debate.id).order_by(DebateBranch.created_at.asc())).all()
    )
    analyzer_runs = list(
        db.scalars(select(AnalyzerRun).where(AnalyzerRun.debate_id == debate.id).order_by(AnalyzerRun.created_at.asc())).all()
    )
    matches = list(
        db.scalars(select(CapabilityMatch).where(CapabilityMatch.debate_id == debate.id).order_by(CapabilityMatch.created_at.asc())).all()
    )
    agent_outputs = list(
        db.scalars(select(AgentOutput).where(AgentOutput.debate_id == debate.id).order_by(AgentOutput.created_at.asc())).all()
    )
    agent_runs = list(
        db.scalars(select(AgentRun).where(AgentRun.debate_id == debate.id).order_by(AgentRun.created_at.asc())).all()
    )
    serialized_agent_runs = [agent_run_to_dict(db, run) for run in agent_runs]
    skills_used = []
    seen_skill_names: set[str] = set()
    for run in serialized_agent_runs:
        for skill in run["skills_used"]:
            name = skill.get("name")
            if name and name not in seen_skill_names:
                seen_skill_names.add(name)
                skills_used.append(name)
    provenance_records = list(
        db.scalars(select(ProvenanceRecord).where(ProvenanceRecord.debate_id == debate.id).order_by(ProvenanceRecord.created_at.asc())).all()
    )
    # W5b: verdict inputs assembled by the shared single-derivation helper
    # (see derive_debate_verdict) -- byte-identical to the previous inline
    # block; the ops shadow endpoint consumes the same helper.
    verdict_context = derive_debate_verdict(db, debate, nodes=nodes, root=root)
    verdict = verdict_context["verdict"]
    protocol_output = verdict_context["protocol_output"]
    debate_evidence_presence = verdict_context["evidence_presence"]
    # P4.1: the synthesis "Leans" meter, derived from the SAME already-loaded
    # `nodes` + `protocol_output` used for the verdict above -- no new query,
    # no new protocol_analysis run. See app.scoring.lean.compute_lean for the
    # dialectical (propagated DF-QuAD strength split)/structural (live node
    # count split, "Even (structural)" when symmetric) fallback rule.
    lean_pro_ids, lean_con_ids = live_pro_con_node_ids(
        [{"id": node.id, "node_type": node.node_type, "status": node.status} for node in nodes]
    )
    lean = compute_lean(
        protocol_output,
        live_pro_node_ids=lean_pro_ids,
        live_con_node_ids=lean_con_ids,
    )
    verdict_gate = {
        "state": verdict["verdictState"],
        "reason": verdict["suppressionReason"],
        # W2 additive: the synthesis verdict_gate mirrors the SAME band
        # verdict_summary served (single derivation point above; "verdictBand"
        # stays the band's sole wire key NAME) so the coverage gate is never
        # re-derived -- or contradicted -- downstream.
        "verdictBand": verdict["verdictBand"],
    }
    claim_types = protocol_output.get("claimTypes") if protocol_output else None
    claim_type_sources = protocol_output.get("claimTypeSource") if protocol_output else None
    claim_type = (
        claim_types.get(root.id)
        if isinstance(claim_types, dict) and root is not None
        else None
    )
    claim_type_source = (
        claim_type_sources.get(root.id)
        if isinstance(claim_type_sources, dict) and root is not None
        else None
    )
    shadow = verdict.get("evidenceGateShadow")
    would_suppress = verdict["verdictState"] == "suppressed_no_evidence" or (
        isinstance(shadow, dict) and shadow.get("wouldSuppress") is True
    )
    LOGGER.info(
        "verdict.evidence_gate debate=%s state=%s would_suppress=%s evidence=%s "
        "claim_type=%s claim_type_source=%s",
        debate.id,
        verdict["verdictState"],
        str(would_suppress).lower(),
        debate_evidence_presence,
        claim_type,
        claim_type_source,
    )
    effective_status = effective_debate_status(db, debate, nodes=nodes)
    payload: dict[str, Any] = {
        "id": debate.id,
        "topic": debate.topic,
        "status": effective_status,
        "config": debate.config,
        "direct_answer": None,
        "root_node_id": debate.root_node_id,
        "synthesis_id": debate.synthesis_id,
        "created_at": iso(debate.created_at),
        "completed_at": iso(debate.completed_at),
        "tree": node_to_dict(db, root, children_by_parent, streaming_jobs_by_node, worker_names_by_id) if root else None,
        "synthesis": synthesis_to_dict(
            db,
            synthesis,
            worker_names_by_id,
            verdict_gate=verdict_gate,
        ),
        "active_synthesis": active_synthesis_summary(db, active_synthesis_job, worker_names_by_id)
        if active_synthesis_job
        else None,
        "branch_lineage": [branch_to_dict(branch) for branch in branches],
        "analyzer_runs": [analyzer_run_to_dict(run) for run in analyzer_runs],
        # Phase 9 Task 1: additive field, no existing key removed/renamed.
        # `root` is the same already-resolved Node variable used by "tree"
        # above (line 349 in the pre-Task-1 file); root.id is the ROOT_CLAIM
        # node id that keys dialecticalStrengths/verificationStatuses.
        "verdict": verdict,
        # P4.1: additive field, always present (value may be None -- see
        # compute_lean's docstring for when there is honestly no data yet).
        "lean": lean,
        "selected_skills": [capability_match_to_dict(db, match) for match in matches if match.capability_kind == "skill"],
        "selected_agents": [capability_match_to_dict(db, match) for match in matches if match.capability_kind == "agent"],
        "agent_outputs": [agent_output_to_dict(output) for output in agent_outputs],
        "agent_runs": serialized_agent_runs,
        "skills_used": skills_used,
        "provenance_records": [provenance_to_dict(record) for record in provenance_records],
        "workers": sorted(worker_names),
        "models": sorted(models),
        "node_count": len(nodes),
        "evidencePresence": debate_evidence_presence,
        # W5a additive: bounded (latest-per-node) decision provenance -- see
        # _lifecycle_decisions_payload. Never the full audit trail.
        "lifecycleDecisions": _lifecycle_decisions_payload(db, debate.id),
        # W5a additive: why the debate stopped, in plain language.
        "completion": _completion_block(debate, effective_status, nodes),
    }
    perspective_derivation = debate.config.get("perspective_derivation") if isinstance(debate.config, dict) else None
    if isinstance(perspective_derivation, dict):
        # W5a additive: only present for debates that actually persisted a
        # derivation at creation time (new, dynamic-perspectives debates) --
        # a pre-W5 or flag-off debate serves no `derivation` key at all,
        # never a fabricated/empty placeholder.
        payload["derivation"] = {
            "claimType": perspective_derivation.get("claim_type"),
            "markers": list(perspective_derivation.get("markers") or []),
            "lensSet": list(perspective_derivation.get("lens_set") or []),
        }
        # Additive: how the lens set was chosen ("llm" | "markers" |
        # "fallback"). Absent for debates created before the LLM planner.
        if perspective_derivation.get("source"):
            payload["derivation"]["source"] = perspective_derivation["source"]
    return payload
