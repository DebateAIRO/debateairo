from __future__ import annotations

import asyncio
import json
import logging
import re
from datetime import timedelta
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.config import RUNTIME_SETTINGS_KEY, int_env, load_settings
from app.core.write_lock import commit_write, flush_write

from app.models.entities import Debate, Generation, Job, Node, Setting, Synthesis, Worker, now_utc, uuid_str
from app.services.events import event_bus
from app.services.job_ledger import record_job_transition
from app.services.prompts import render_prompt
from app.services.routing import routing_engine
from app.services.serialization import debate_to_dict, iso
from app.services.spend import capped_model_ids


DEFAULT_DEBATE_CONFIG = {
    "max_depth": 2,
    "branching": 2,
    "max_tokens": 800,
}
ROLE_OVERRIDE_KEYS = ("role_overrides", "roles", "routing")
MAX_STREAM_DELTA_CHARS = 16_384
MAX_STREAM_BUFFER_CHARS = 200_000
MUTABLE_JOB_STATUSES = {"claimed", "running"}
PUBLIC_NODE_FAILURE_CODE = "claim_generation_failed"
PUBLIC_NODE_FAILURE_MESSAGE = "Claim generation failed"
PUBLIC_DEBATE_FAILURE_CODE = "debate_generation_failed"
PUBLIC_DEBATE_FAILURE_MESSAGE = "Debate generation failed"
V2_POV_ROLES = {
    "SCIENTIFIC_POV": "Scientific POV",
    "STATISTICAL_POV": "Statistical POV",
    "ETHICAL_POV": "Ethical POV",
    "PRACTICAL_POV": "Practical POV",
}
# W1 bounded failure lifecycle: job families whose terminal failure degrades
# only their branch (node failed + stopping_reason) instead of failing the
# debate. Everything else (root-generation `decompose`, synthesize-class,
# and the v2 capability chain targeting the root) keeps the honest
# debate-level terminal `failed`. v2_expand (W3) targets its pending
# placeholder child, so terminal failure marks only that child path failed.
NODE_DEGRADABLE_JOB_TYPES = {"argue", "v2_pov", "v2_expand"}
GENERATION_EXHAUSTED_STOPPING_REASON = "generation_exhausted"
DEFAULT_MAX_JOB_ATTEMPTS = 4
LOGGER = logging.getLogger(__name__)


class StaleJobMutationError(ValueError):
    pass


class StreamOffsetError(ValueError):
    pass


def merged_debate_config(config: dict[str, Any] | None) -> dict[str, Any]:
    incoming = dict(config or {})
    raw_role_overrides = None
    for key in ROLE_OVERRIDE_KEYS:
        if key in incoming:
            raw_role_overrides = incoming.pop(key)
            break
    # Retired swarm feature (W3): the caller's raw "swarm" request is still
    # popped so it is never persisted into debate.config -- keeps payloads
    # byte-identical to the dead-flag era (no "swarm" key at all). The
    # DIALECTICAL_SWARM descriptor planning and its dispatch seam were
    # removed with zero production callers.
    incoming.pop("swarm", None)
    merged = {**DEFAULT_DEBATE_CONFIG, **incoming}
    merged["max_depth"] = bounded_config_int(merged, "max_depth", 2, 1, 5)
    merged["branching"] = bounded_config_int(merged, "branching", 2, 2, 6)
    merged["max_tokens"] = bounded_config_int(merged, "max_tokens", 800, 128, 4000)
    # W7 per-debate expansion budgets: keep only the known integer knobs
    # within bounds. Runtime bookkeeping keys (rounds_completed /
    # stopped_because) and anything else a client sends are dropped so the
    # adaptive loop's state can never be pre-seeded at creation time.
    raw_adaptive = merged.pop("adaptive_expansion", None)
    if isinstance(raw_adaptive, dict):
        from app.exploration.expansion_dispatch import BUDGET_BOUNDS

        sanitized_budgets = {
            key: value
            for key, (minimum, maximum) in BUDGET_BOUNDS.items()
            if isinstance(value := raw_adaptive.get(key), int)
            and not isinstance(value, bool)
            and minimum <= value <= maximum
        }
        if sanitized_budgets:
            merged["adaptive_expansion"] = sanitized_budgets
    if raw_role_overrides is not None:
        from app.api.settings import validate_routing

        merged["role_overrides"] = validate_routing(raw_role_overrides)
    return merged


def bounded_config_int(config: dict[str, Any], key: str, default: int, minimum: int, maximum: int) -> int:
    raw = config.get(key, default)
    if raw is None or isinstance(raw, bool):
        raise ValueError(f"{key} must be an integer")
    try:
        value = int(raw)
    except (TypeError, ValueError, OverflowError):
        raise ValueError(f"{key} must be an integer") from None
    return max(minimum, min(value, maximum))


def sanitize_text(value: str, limit: int = 12_000) -> str:
    return re.sub(r"\s+", " ", value).strip()[:limit]


def enabled_models(db: Session) -> set[str] | None:
    setting = db.get(Setting, RUNTIME_SETTINGS_KEY)
    if not setting:
        return None
    values = setting.value.get("enabled_models") or []
    if not isinstance(values, list):
        return None
    cleaned = {value.strip() for value in values if isinstance(value, str) and value.strip()}
    configured = configured_routing_models()
    if configured:
        cleaned &= configured
    return cleaned or None


def configured_routing_models(roles: dict[str, dict[str, Any]] | None = None) -> set[str]:
    models: set[str] = set()
    for config in (roles or routing_engine.as_dict() or {}).values():
        if config.get("primary"):
            models.add(str(config["primary"]))
        models.update(str(model) for model in config.get("fallback", []) if model)
        models.update(str(model) for model in config.get("pool", []) if model)
    return models


def routing_roles_for_debate(debate: Debate | None) -> dict[str, dict[str, Any]]:
    roles = {role: dict(role_config) for role, role_config in (routing_engine.as_dict() or {}).items()}
    if not debate or not isinstance(debate.config, dict):
        return roles
    overrides = debate.config.get("role_overrides")
    if not isinstance(overrides, dict):
        return roles
    for role, role_config in overrides.items():
        if isinstance(role, str) and isinstance(role_config, dict):
            roles[role] = dict(role_config)
    return roles


def routing_allowed_models(db: Session) -> set[str] | None:
    allowed = enabled_models(db)
    configured = configured_routing_models()
    capped = capped_model_ids(db, allowed or configured)
    if not capped:
        return allowed
    return (allowed or configured) - capped


def worker_capability_set(worker: Worker) -> set[str]:
    return {str(capability).strip() for capability in worker.capabilities or [] if str(capability).strip()}


def online_capabilities(db: Session) -> set[str]:
    settings = load_settings()
    allowed = routing_allowed_models(db)
    cutoff = now_utc() - timedelta(seconds=settings.worker_offline_seconds)
    workers = db.scalars(select(Worker).where(Worker.last_seen >= cutoff, Worker.status == "online")).all()
    caps: set[str] = set()
    for worker in workers:
        caps.update(worker_capability_set(worker))
    if allowed is not None:
        caps &= allowed
    return caps


def role_for_node(node_type: str) -> str:
    return "proposer" if node_type == "PRO" else "opponent"


def claim_author_exclusions(db: Session, role: str, parent: Node | None, debate: Debate | None = None) -> set[str]:
    if debate is None and parent is not None:
        debate = db.get(Debate, parent.debate_id)
    role_config = routing_roles_for_debate(debate).get(role, {})
    if role_config.get("constraint") != "not_same_as_claim_author" or not parent:
        return set()
    active_generation = db.get(Generation, parent.active_generation_id) if parent.active_generation_id else None
    if not active_generation:
        return set()
    capabilities = online_capabilities(db)
    if any(model != active_generation.model_id for model in capabilities):
        return {active_generation.model_id}
    return set()


def make_deadline() -> Any:
    settings = load_settings()
    return now_utc() + timedelta(seconds=max(settings.worker_poll_seconds * 2, settings.job_fallback_seconds))


def max_job_attempts() -> int:
    """Retry budget per job (env-tunable, read at decision time)."""
    return int_env("DIALECTICAL_MAX_JOB_ATTEMPTS", DEFAULT_MAX_JOB_ATTEMPTS, 1, 100)


def job_attempts_exhausted(job: Job) -> bool:
    """True when this job has consumed its retry budget.

    ``Job.attempts`` counts claims; every claim ends in exactly one of
    complete, worker-reported /fail, or a timeout-class outcome (deadline
    expiry, worker vanished/restarted) tracked in ``Job.timeout_attempts``.
    Timeout-class attempts count at HALF weight so a transient outage does not
    burn the budget at the same rate as a deterministic crash: a pure crash
    loop terminates exactly at the budget, a pure timeout loop at twice it.
    """
    attempts = job.attempts or 0
    timeout_attempts = min(job.timeout_attempts or 0, attempts)
    weighted = attempts - 0.5 * timeout_attempts
    return weighted >= max_job_attempts()


def create_job(
    db: Session,
    debate_id: str,
    job_type: str,
    role: str,
    node_id: str | None,
    required_model: str | None = None,
    exclude_models: set[str] | None = None,
) -> Job:
    allowed_models = routing_allowed_models(db)
    debate = db.get(Debate, debate_id)
    role_configs = routing_roles_for_debate(debate)
    if required_model is not None:
        # The enabled_models allowlist governs worker routing, and score_debate
        # jobs are never worker-routed: they are internal bookkeeping for the
        # in-process judge provider (claim, reaper, and serialization all
        # exclude them), so the judge model does not need to be an enabled
        # worker model.
        if (
            job_type != "score_debate"
            and allowed_models is not None
            and required_model not in allowed_models
        ):
            raise ValueError(f"Model {required_model} is not currently allowed")
        model = required_model
    else:
        model = routing_engine.choose(
            role,
            online_capabilities(db),
            exclude_models=exclude_models,
            allowed_models=allowed_models,
            roles=role_configs,
        )
    job = Job(
        debate_id=debate_id,
        node_id=node_id,
        job_type=job_type,
        required_role=role,
        required_model=model,
        status="pending",
        deadline=make_deadline(),
    )
    db.add(job)
    record_job_transition(db, job, from_status=None, to_status="pending", channel="create")
    return job


def create_debate(db: Session, topic: str, config: dict[str, Any] | None = None) -> Debate:
    topic = sanitize_text(topic, 2_000)
    if not topic:
        raise ValueError("Topic is required")
    debate = Debate(topic=topic, status="generating", config=merged_debate_config(config))
    db.add(debate)
    flush_write(db)
    root = Node(
        debate_id=debate.id,
        parent_id=None,
        node_type="ROOT_CLAIM",
        depth=0,
        position=0,
        claim=topic,
        status="pending",
        materialized_path="/0",
    )
    db.add(root)
    flush_write(db)
    debate.root_node_id = root.id
    create_job(db, debate.id, "decompose", "decomposer", root.id)
    commit_write(db)
    db.refresh(debate)
    return debate


def extract_jsonish(result: Any) -> dict[str, Any]:
    if isinstance(result, dict):
        return result
    text = str(result).strip()
    decoder = json.JSONDecoder()
    for index, char in enumerate(text):
        if char != "{":
            continue
        try:
            payload, _ = decoder.raw_decode(text[index:])
        except json.JSONDecodeError:
            continue
        if isinstance(payload, dict):
            return payload
    raise ValueError("Model output did not contain a valid JSON object")


def create_generation(
    db: Session,
    job: Job,
    node: Node,
    argument: str,
    prompt_rendered: str,
    metadata: dict[str, Any],
) -> Generation:
    db.query(Generation).filter(Generation.node_id == node.id, Generation.is_active.is_(True)).update(
        {"is_active": False}
    )
    generation = Generation(
        node_id=node.id,
        model_id=job.required_model,
        role=job.required_role,
        argument=sanitize_text(argument),
        prompt_version="v1",
        prompt_rendered=prompt_rendered,
        tokens_in=metadata.get("tokens_in"),
        tokens_out=metadata.get("tokens_out"),
        latency_ms=int(metadata.get("latency_ms") or 0),
        is_active=True,
        worker_id=str(job.worker_id),
    )
    db.add(generation)
    flush_write(db)
    node.active_generation_id = generation.id
    node.status = "complete"
    return generation


def ensure_default_scoring_for_completed_generation(db: Session, debate: Debate, node: Node) -> dict:
    from app.providers import ProviderRegistry
    from app.scoring.service import ensure_node_scoring_on_completion

    return ensure_node_scoring_on_completion(db, debate, node, ProviderRegistry())


def normalized_decomposition_children(payload: dict[str, Any], debate: Debate) -> list[dict[str, str]]:
    branching = int(debate.config.get("branching", 2))
    raw_children = payload.get("children")
    rows = raw_children if isinstance(raw_children, list) else []
    children: list[dict[str, str]] = []
    for position, row in enumerate(rows):
        if len(children) >= branching:
            break
        if isinstance(row, dict):
            claim = sanitize_text(str(row.get("claim") or ""))
            node_type = str(row.get("node_type") or "").upper()
        else:
            claim = sanitize_text(str(row))
            node_type = ""
        if not claim:
            continue
        if node_type not in {"PRO", "CON"}:
            node_type = "PRO" if position % 2 == 0 else "CON"
        children.append({"node_type": node_type, "claim": claim})
    return children


def _candidate_child_claims(result: Any) -> list[dict[str, str]]:
    payload = result if isinstance(result, dict) else {}
    raw_children = payload.get("children") if isinstance(payload, dict) else None
    rows = raw_children if isinstance(raw_children, list) else []
    candidates: list[dict[str, str]] = []
    for position, row in enumerate(rows):
        if isinstance(row, dict):
            claim = sanitize_text(str(row.get("claim") or ""))
            node_type = str(row.get("node_type") or row.get("type") or "").upper()
        else:
            claim = sanitize_text(str(row))
            node_type = ""
        if not claim:
            continue
        if node_type not in {"PRO", "CON"}:
            node_type = "PRO" if position % 2 == 0 else "CON"
        candidates.append({"node_type": node_type, "claim": claim})
    return candidates


def _score_signal_for_node(node: Node):
    """Construct the legacy LIP-00 negative example for contract tests only.

    Production orchestration never calls this helper.  It remains importable
    so the persistence contract can prove that the old all-neutral shape is
    non-authoritative and cannot pass the lifecycle mapper.
    """
    from app.exploration.policy import ScoreSignal

    return ScoreSignal(
        node_id=node.id,
        claim_type="normative",
        strength=0.5,
        uncertainty=0.5,
        impact=0.5,
        evidence_quality=0.5,
        logical_validity=0.5,
        assumption_risk=0.5,
        counter_resilience=0.5,
    )


def exploration_decision_for_node(db: Session, debate: Debate, node: Node):
    if db is None or debate is None:
        # LIP-00's read-only negative contract invokes this seam without a
        # persistence context.  Fail safe explicitly; do not reinterpret the
        # legacy neutral helper above as authenticated policy input.
        from app.exploration.policy import ExpansionDecision

        return ExpansionDecision(
            node_id=node.id,
            action="continue",
            priority=0.0,
            reasons=("lifecycle inputs unavailable: persistence context missing",),
            keeps_path_active=True,
        )
    from app.exploration.lifecycle_decision_service import decide_lifecycle_for_node

    return decide_lifecycle_for_node(
        db,
        debate=debate,
        node=node,
        decision_timestamp=now_utc(),
    )


def spawn_child_argument_jobs(
    db: Session,
    debate: Debate,
    parent: Node,
    child_candidates: list[dict[str, str]],
    *,
    decision: Any | None = None,
) -> int:
    max_depth = int(debate.config.get("max_depth", 2))
    if decision is None:
        decision = exploration_decision_for_node(db, debate, parent)
    authentic_decision = bool(getattr(decision, "authentic_policy_decision", True))
    if not authentic_decision and (
        parent.path_status == "abandoned" or parent.depth >= max_depth
    ):
        return 0
    parent.stopping_status = decision.action
    stopping_reason = getattr(decision, "stopping_reason", None)
    if not isinstance(stopping_reason, str) or not stopping_reason.strip():
        reasons = getattr(decision, "reasons", ())
        stopping_reason = "; ".join(reasons) if reasons else f"lifecycle action: {decision.action}"
    parent.stopping_reason = stopping_reason
    keeps_path_active = bool(decision.keeps_path_active) and decision.action != "abandon"
    parent.path_status = "active" if keeps_path_active else "abandoned"
    if not keeps_path_active:
        return 0
    if parent.depth >= max_depth:
        return 0
    if decision.action not in {"continue", "deepen", "challenge"}:
        return 0
    existing = db.scalar(
        select(Node)
        .where(
            Node.parent_id == parent.id,
            Node.node_type != "EVIDENCE",
            Node.status != "stale",
        )
        .limit(1)
    )
    if existing:
        return 0
    branching = int(debate.config.get("branching", 2))
    selected_candidates = child_candidates[:branching]
    if any(
        not isinstance(candidate, dict)
        or candidate.get("node_type") not in {"PRO", "CON"}
        or not isinstance(candidate.get("claim"), str)
        or not candidate["claim"].strip()
        for candidate in selected_candidates
    ):
        return 0
    child_spawn_count = 0
    for position, candidate in enumerate(selected_candidates):
        node_type = candidate["node_type"]
        child = Node(
            debate_id=debate.id,
            parent_id=parent.id,
            node_type=node_type,
            depth=parent.depth + 1,
            position=position,
            claim=candidate["claim"],
            status="pending",
            materialized_path=f"{parent.materialized_path}/{position}",
        )
        db.add(child)
        flush_write(db)
        role = role_for_node(node_type)
        create_job(
            db,
            debate.id,
            "argue",
            role,
            child.id,
            exclude_models=claim_author_exclusions(db, role, parent, debate),
        )
        child_spawn_count += 1
    return child_spawn_count


def _lifecycle_component_status(
    decision: Any,
    component: str,
    identity: object,
) -> tuple[str, str]:
    availability = getattr(decision, f"{component}_availability", None)
    freshness = getattr(decision, f"{component}_freshness", None)
    if (
        isinstance(availability, str)
        and availability.strip()
        and isinstance(freshness, str)
        and freshness.strip()
    ):
        return availability.strip(), freshness.strip()

    if getattr(decision, "input_state", "unverifiable") == "grounded":
        return "present", "fresh"
    reason_codes = getattr(decision, "reason_codes", ())
    component_reasons = tuple(
        reason
        for reason in reason_codes
        if isinstance(reason, str) and reason.startswith(f"{component}_")
    )
    other_component = "evidence" if component == "score" else "score"
    other_component_reasons = tuple(
        reason
        for reason in reason_codes
        if isinstance(reason, str) and reason.startswith(f"{other_component}_")
    )
    unscoped_reasons = tuple(
        reason
        for reason in reason_codes
        if not isinstance(reason, str)
        or not reason.startswith(("score_", "evidence_"))
    )
    if identity is None or any("missing" in reason for reason in component_reasons):
        return "absent", "unknown"
    if any("stale" in reason for reason in component_reasons):
        return "present", "stale"
    if component_reasons:
        return "present", "unknown"
    if other_component_reasons and not unscoped_reasons:
        return "present", "fresh"
    return "present", "unknown"


def _persist_lifecycle_evaluation(
    db: Session,
    *,
    job: Job,
    node: Node,
    decision: Any,
    child_spawn_count: int,
):
    from app.exploration.decision_repository import (
        LifecycleDecisionSnapshot,
        persist_lifecycle_decision,
    )

    score_record_id = getattr(decision, "score_record_id", None)
    score_run_id = getattr(decision, "score_run_id", None)
    evidence_snapshot_id = getattr(decision, "evidence_snapshot_id", None)
    score_availability, score_freshness = _lifecycle_component_status(
        decision,
        "score",
        score_record_id or score_run_id,
    )
    evidence_availability, evidence_freshness = _lifecycle_component_status(
        decision,
        "evidence",
        evidence_snapshot_id,
    )
    return persist_lifecycle_decision(
        db,
        snapshot=LifecycleDecisionSnapshot(
            schema_version="lifecycle-decision-record/v1",
            idempotency_key=job.idempotency_key,
            debate_id=job.debate_id,
            node_id=node.id,
            decision=decision.action,
            stopping_reason=node.stopping_reason or f"lifecycle action: {decision.action}",
            path_status=node.path_status,
            stopping_status=node.stopping_status,
            input_state=getattr(decision, "input_state", "unverifiable"),
            reason_codes=tuple(getattr(decision, "reason_codes", ())),
            score_availability=score_availability,
            score_freshness=score_freshness,
            evidence_availability=evidence_availability,
            evidence_freshness=evidence_freshness,
            current_score_input_hash=getattr(decision, "current_score_input_hash", None),
            scoring_contract_hash=getattr(decision, "scoring_contract_hash", None),
            score_record_id=score_record_id,
            score_run_id=score_run_id,
            score_run_sequence=getattr(decision, "score_run_sequence", None),
            evidence_snapshot_id=evidence_snapshot_id,
            decision_timestamp=getattr(decision, "decision_timestamp", now_utc()),
            child_spawn_count=child_spawn_count,
        ),
    )


def _lifecycle_event_payload(persistence) -> dict[str, Any]:
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


def stale_descendants(db: Session, node: Node) -> None:
    prefix = f"{node.materialized_path}/"
    descendants = db.scalars(
        select(Node).where(
            Node.debate_id == node.debate_id,
            Node.materialized_path.startswith(prefix),
            Node.status != "stale",
        )
    ).all()
    descendant_ids = [descendant.id for descendant in descendants]
    for descendant in descendants:
        descendant.status = "stale"
    cancel_active_jobs_for_nodes(db, descendant_ids, "Ancestor was regenerated")


def cancel_active_jobs_for_nodes(db: Session, node_ids: list[str], reason: str) -> None:
    if not node_ids:
        return
    jobs = db.scalars(
        select(Job).where(
            Job.node_id.in_(node_ids),
            Job.status.in_(["pending", "claimed", "running"]),
        )
    ).all()
    for job in jobs:
        record_job_transition(
            db, job, from_status=job.status, to_status="failed", channel="cancel", reason=reason
        )
        release_job_claim(db, job)
        job.status = "failed"
        job.error = reason
        job.stream_buffer = ""


def cancel_active_jobs_for_node(db: Session, node: Node, reason: str) -> None:
    cancel_active_jobs_for_nodes(db, [node.id], reason)


def cancel_active_synthesis_jobs(db: Session, debate_id: str, reason: str) -> None:
    jobs = db.scalars(
        select(Job).where(
            Job.debate_id == debate_id,
            Job.job_type.in_(["synthesize", "v2_synthesize"]),
            Job.status.in_(["pending", "claimed", "running"]),
        )
    ).all()
    for job in jobs:
        record_job_transition(
            db, job, from_status=job.status, to_status="failed", channel="cancel", reason=reason
        )
        release_job_claim(db, job)
        job.status = "failed"
        job.error = reason
        job.stream_buffer = ""


def pending_or_running_jobs(db: Session, debate_id: str) -> list[Job]:
    return list(
        db.scalars(
            select(Job).where(
                Job.debate_id == debate_id,
                Job.status.in_(["pending", "claimed", "running"]),
            )
        ).all()
    )


def capable_online_workers(db: Session, model_id: str) -> list[Worker]:
    allowed = routing_allowed_models(db)
    if allowed is not None and model_id not in allowed:
        return []
    settings = load_settings()
    cutoff = now_utc() - timedelta(seconds=settings.worker_offline_seconds)
    workers = db.scalars(select(Worker).where(Worker.last_seen >= cutoff, Worker.status == "online")).all()
    return [worker for worker in workers if model_id in worker_capability_set(worker)]


def worker_debate_loads(db: Session, debate_id: str, workers: list[Worker]) -> dict[str, int]:
    worker_ids = [worker.id for worker in workers]
    loads = {worker_id: 0 for worker_id in worker_ids}
    if not worker_ids:
        return loads

    generation_rows = db.execute(
        select(Generation.worker_id, func.count(Generation.id))
        .join(Node, Generation.node_id == Node.id)
        .where(Node.debate_id == debate_id, Generation.worker_id.in_(worker_ids))
        .group_by(Generation.worker_id)
    ).all()
    for worker_id, count in generation_rows:
        loads[str(worker_id)] += int(count)

    synthesis_rows = db.execute(
        select(Synthesis.worker_id, func.count(Synthesis.id))
        .where(Synthesis.debate_id == debate_id, Synthesis.worker_id.in_(worker_ids))
        .group_by(Synthesis.worker_id)
    ).all()
    for worker_id, count in synthesis_rows:
        loads[str(worker_id)] += int(count)

    running_rows = db.execute(
        select(Job.worker_id, func.count(Job.id))
        .where(
            Job.debate_id == debate_id,
            Job.worker_id.in_(worker_ids),
            Job.status.in_(["claimed", "running"]),
        )
        .group_by(Job.worker_id)
    ).all()
    for worker_id, count in running_rows:
        loads[str(worker_id)] += int(count)
    return loads


def worker_can_claim_job(db: Session, worker: Worker, job: Job, now: Any) -> bool:
    capable_workers = capable_online_workers(db, job.required_model)
    if len(capable_workers) <= 1:
        return True

    settings = load_settings()
    loads = worker_debate_loads(db, job.debate_id, capable_workers)
    worker_load = loads.get(worker.id, 0)
    min_load = min(loads.values()) if loads else worker_load
    if worker_load <= min_load:
        return True

    comparable_now = now.replace(tzinfo=None) if job.created_at.tzinfo is None else now
    waited = comparable_now - job.created_at
    if waited >= timedelta(seconds=settings.worker_poll_seconds):
        return True

    idle_lower_load_worker = any(
        other.id != worker.id
        and loads.get(other.id, 0) < worker_load
        and not other.current_job_id
        for other in capable_workers
    )
    return not idle_lower_load_worker


def mark_worker_seen(worker: Worker, now: Any) -> None:
    worker.last_seen = now
    if worker.status != "degraded":
        worker.status = "online"


def release_job_claim(db: Session, job: Job) -> None:
    if job.worker_id:
        worker = db.get(Worker, job.worker_id)
        if worker and worker.current_job_id == job.id:
            worker.current_job_id = None
    job.worker_id = None
    job.claimed_at = None


def refresh_worker_job_leases(db: Session, worker: Worker) -> None:
    """Any authenticated contact from a worker (poll, heartbeat, stream)
    proves liveness for every job it holds: slide those leases so the
    deadline sweep only fires for workers that have actually gone silent.
    The hard stuck cap still bounds total time per assignment."""
    held = db.scalars(
        select(Job).where(Job.worker_id == worker.id, Job.status.in_(["claimed", "running"]))
    ).all()
    for job in held:
        job.deadline = make_deadline()


def release_held_job_for_restart(db: Session, worker: Worker) -> list[tuple[str, str, dict[str, Any]]]:
    """A worker that declares a fresh start cannot still be running its old
    job: requeue it immediately instead of waiting for the stuck cap."""
    if not worker.current_job_id:
        return []
    held = db.get(Job, worker.current_job_id)
    if held is not None and held.worker_id == worker.id and held.status in {"claimed", "running"}:
        return requeue_or_terminalize_timed_out_job(db, held, "Worker restarted while job was active")
    worker.current_job_id = None
    return []


def reset_job_target_for_retry(db: Session, job: Job) -> None:
    debate = db.get(Debate, job.debate_id)
    if debate and debate.status not in {"archived", "failed"}:
        debate.status = "generating"
    if job.node_id:
        node = db.get(Node, job.node_id)
        if node and node.status != "stale":
            node.status = "pending"


def requeue_active_jobs_for_worker(db: Session, worker: Worker, reason: str) -> list[tuple[str, str, dict[str, Any]]]:
    """Requeue-or-terminalize every job actively held by `worker`.

    Returns the (debate_id, event, payload) terminal events to publish --
    per terminalize_job_failure's contract, the caller must commit first,
    then publish (this function never publishes itself: both callers
    (app/api/workers.py) share one transaction across possibly-multiple
    workers and must commit that transaction before any event goes out).
    """
    jobs = db.scalars(
        select(Job).where(
            Job.worker_id == worker.id,
            Job.status.in_(["claimed", "running"]),
        )
    ).all()
    terminal_events: list[tuple[str, str, dict[str, Any]]] = []
    for job in jobs:
        terminal_events.extend(requeue_or_terminalize_timed_out_job(db, job, reason))
    return terminal_events


def archive_debate(db: Session, debate: Debate) -> None:
    debate.status = "archived"
    for job in pending_or_running_jobs(db, debate.id):
        record_job_transition(
            db,
            job,
            from_status=job.status,
            to_status="failed",
            channel="archive",
            reason="Debate archived",
        )
        release_job_claim(db, job)
        job.status = "failed"
        job.error = "Debate archived"
    commit_write(db)


def reroute_unavailable_pending_jobs(db: Session, now: Any) -> None:
    jobs = db.scalars(select(Job).where(Job.status == "pending", Job.deadline < now)).all()
    for job in jobs:
        if capable_online_workers(db, job.required_model):
            continue
        constraint_excludes: set[str] = set()
        if job.node_id:
            node = db.get(Node, job.node_id)
            parent = db.get(Node, node.parent_id) if node and node.parent_id else None
            debate = db.get(Debate, job.debate_id)
            constraint_excludes = claim_author_exclusions(db, job.required_role, parent, debate)
            role_configs = routing_roles_for_debate(debate)
        else:
            debate = db.get(Debate, job.debate_id)
            role_configs = routing_roles_for_debate(debate)
        try:
            replacement = routing_engine.choose(
                job.required_role,
                online_capabilities(db),
                exclude_models={job.required_model, *constraint_excludes},
                allowed_models=routing_allowed_models(db),
                roles=role_configs,
            )
        except ValueError:
            continue
        if replacement != job.required_model:
            job.required_model = replacement
            job.deadline = make_deadline()


def maybe_queue_synthesis(db: Session, debate: Debate) -> Job | None:
    if debate.synthesis_id:
        return None
    pending_nodes = db.scalar(
        select(Node.id).where(Node.debate_id == debate.id, Node.status.in_(["pending", "generating"])).limit(1)
    )
    if pending_nodes:
        return None
    active_jobs = [
        job
        for job in pending_or_running_jobs(db, debate.id)
        if job.job_type in {"decompose", "argue", "synthesize"}
    ]
    if active_jobs:
        return None
    existing_synthesis_job = db.scalar(
        select(Job)
        .where(
            Job.debate_id == debate.id,
            Job.job_type == "synthesize",
            Job.status.in_(["pending", "claimed", "running"]),
        )
        .limit(1)
    )
    if existing_synthesis_job:
        return None
    return create_job(db, debate.id, "synthesize", "synthesizer", None)


def try_claim_pending_job(db: Session, job: Job, worker: Worker, now: Any) -> bool:
    deadline = make_deadline()
    result = db.execute(
        update(Job)
        .where(Job.id == job.id, Job.status == "pending")
        .values(
            status="running",
            worker_id=worker.id,
            claimed_at=now,
            deadline=deadline,
            stream_buffer="",
            attempts=Job.attempts + 1,
        )
    )
    if result.rowcount != 1:
        db.expire(job)
        return False
    worker.current_job_id = job.id
    mark_worker_seen(worker, now)
    record_job_transition(
        db,
        job,
        from_status="pending",
        to_status="running",
        channel="claim",
        reason=f"claimed by worker {worker.id}",
    )
    commit_write(db)
    db.refresh(job)
    return True


def ensure_mutable_claim(db: Session, job: Job) -> None:
    expected_worker_id = job.worker_id
    db.refresh(job)
    if not expected_worker_id or job.worker_id != expected_worker_id:
        raise StaleJobMutationError("Job is not claimed by this worker")
    if job.status not in MUTABLE_JOB_STATUSES:
        raise StaleJobMutationError(f"Job is {job.status} and cannot be mutated")


def claim_pending_job(db: Session, worker: Worker) -> Job | None:
    refresh_worker_job_leases(db, worker)
    # Collected up front (not published) so every terminal event -- orphan
    # release included -- goes out only after the commit that persists it,
    # per terminalize_job_failure's "commit, then publish" contract. A
    # pre-commit publish would let a refresh()-triggering terminal SSE race a
    # not-yet-committed tree, and a rollback after publish would emit a
    # phantom terminal-failure event.
    terminal_events: list[tuple[str, str, dict[str, Any]]] = []
    if worker.current_job_id:
        held = db.get(Job, worker.current_job_id)
        if (
            held is not None
            and held.worker_id == worker.id
            and held.status in {"claimed", "running"}
        ):
            # The worker is polling while its job is in flight (loop
            # harnesses poll on a timer). Its lease was just refreshed by
            # refresh_worker_job_leases above, so nothing is wrong: report
            # busy instead of yanking the job. Genuine restarts announce
            # themselves via fresh_start registration; genuinely dead
            # workers stop contacting and the deadline sweep reclaims.
            mark_worker_seen(worker, now_utc())
            commit_write(db)
            return None
        worker.current_job_id = None

    if worker.status != "online":
        worker.last_seen = now_utc()
        commit_write(db)
        if terminal_events:
            _publish_events_sync(terminal_events)
        return None

    capabilities = worker_capability_set(worker)
    allowed_models = routing_allowed_models(db)
    if allowed_models is not None:
        capabilities &= allowed_models
    now = now_utc()
    reroute_unavailable_pending_jobs(db, now)
    # score_debate is excluded: scoring runs in a coordinator background
    # thread with its own expiry handling (_expire_stale_scoring_jobs);
    # resetting it to pending here would fight that state machine and flip a
    # complete debate back to "generating" via reset_job_target_for_retry.
    expired = db.scalars(
        select(Job).where(
            Job.status.in_(["claimed", "running"]),
            Job.deadline < now,
            Job.job_type != "score_debate",
        )
    ).all()
    for job in expired:
        terminal_events.extend(requeue_or_terminalize_timed_out_job(db, job, "Job deadline expired"))
    if terminal_events:
        commit_write(db)
        _publish_events_sync(terminal_events)
    flush_write(db)

    jobs = list(
        db.scalars(
            select(Job)
            .where(
                Job.status == "pending",
                Job.required_model.in_(capabilities),
                Job.job_type != "score_debate",
            )
            .order_by(Job.created_at.asc())
        ).all()
    )
    job = next((candidate for candidate in jobs if worker_can_claim_job(db, worker, candidate, now)), None)
    if not job:
        mark_worker_seen(worker, now)
        commit_write(db)
        return None
    for candidate in [job, *[candidate for candidate in jobs if candidate.id != job.id]]:
        if worker_can_claim_job(db, worker, candidate, now) and try_claim_pending_job(db, candidate, worker, now):
            return candidate
    mark_worker_seen(worker, now)
    commit_write(db)
    return None


def render_job_payload(db: Session, job: Job) -> dict[str, Any]:
    debate = db.get(Debate, job.debate_id)
    if not debate:
        raise ValueError("Debate not found")
    node = db.get(Node, job.node_id) if job.node_id else None
    claim = node.claim if node else debate.topic
    if job.job_type.startswith("v2_"):
        from app.services.dialectical_v2 import render_v2_job_prompt

        system, user = render_v2_job_prompt(db, job)
    elif job.job_type == "synthesize":
        context = json.dumps(debate_to_dict(db, debate), default=str)
        system, user = render_prompt("synthesizer", debate.topic, debate.topic, 0, context=context)
    else:
        prompt_name = "decomposer" if job.required_role == "decomposer" else job.required_role
        system, user = render_prompt(prompt_name, debate.topic, claim, node.depth if node else 0)
    return {
        "id": job.id,
        "debate_id": job.debate_id,
        "node_id": job.node_id,
        "job_type": job.job_type,
        "required_role": job.required_role,
        "required_model": job.required_model,
        "deadline": iso(job.deadline),
        "prompt": {
            "system": system,
            "user": user,
            "max_tokens": int(debate.config.get("max_tokens", 800)),
        },
    }


async def publish_job_started(db: Session, job: Job) -> None:
    if job.job_type in {"synthesize", "v2_synthesize"}:
        await event_bus.publish(
            job.debate_id,
            "synthesis_started",
            {"debate_id": job.debate_id, "model_id": job.required_model, "worker_id": job.worker_id},
        )
        return
    if job.job_type.startswith("v2_"):
        await event_bus.publish(
            job.debate_id,
            "artifact_started",
            {
                "debate_id": job.debate_id,
                "job_id": job.id,
                "job_type": job.job_type,
                "model_id": job.required_model,
                "worker_id": job.worker_id,
                "role": job.required_role,
            },
        )
        return
    await event_bus.publish(
        job.debate_id,
        "node_started",
        {
            "node_id": job.node_id,
            "model_id": job.required_model,
            "worker_id": job.worker_id,
            "role": job.required_role,
        },
    )


async def append_stream_delta(db: Session, job: Job, delta: str, offset: int | None = None) -> None:
    if not delta:
        return
    ensure_mutable_claim(db, job)
    if len(delta) > MAX_STREAM_DELTA_CHARS:
        raise ValueError(f"stream delta exceeds {MAX_STREAM_DELTA_CHARS} characters")
    current_buffer = job.stream_buffer or ""
    if offset is not None:
        if offset < 0:
            raise StreamOffsetError("stream offset cannot be negative")
        if offset < len(current_buffer):
            existing = current_buffer[offset : offset + len(delta)]
            if existing == delta:
                return
            raise StreamOffsetError("stream offset does not match buffered output")
        if offset > len(current_buffer):
            raise StreamOffsetError("stream offset is ahead of buffered output")
    if len(current_buffer) + len(delta) > MAX_STREAM_BUFFER_CHARS:
        raise ValueError(f"stream buffer exceeds {MAX_STREAM_BUFFER_CHARS} characters")
    job.stream_buffer = current_buffer + delta
    job.status = "running"
    job.deadline = make_deadline()
    commit_write(db)
    if job.job_type in {"synthesize", "v2_synthesize"}:
        await event_bus.publish(job.debate_id, "synthesis_token", {"debate_id": job.debate_id, "delta": delta})
    elif job.job_type.startswith("v2_"):
        await event_bus.publish(
            job.debate_id,
            "artifact_token",
            {"debate_id": job.debate_id, "job_id": job.id, "job_type": job.job_type, "delta": delta},
        )
    else:
        await event_bus.publish(job.debate_id, "node_token", {"node_id": job.node_id, "delta": delta})


async def complete_job(db: Session, job: Job, result: Any, metadata: dict[str, Any] | None = None) -> dict[str, Any]:
    metadata = metadata or {}
    ensure_mutable_claim(db, job)
    debate = db.get(Debate, job.debate_id)
    if not debate:
        raise ValueError("Debate not found")
    worker = db.get(Worker, job.worker_id) if job.worker_id else None
    if worker:
        worker.current_job_id = None
        worker.last_seen = now_utc()
        worker.status = "online"
    previous_job_status = job.status
    job.status = "complete"
    record_job_transition(
        db, job, from_status=previous_job_status, to_status="complete", channel="complete"
    )

    if job.job_type == "decompose":
        node = db.get(Node, job.node_id)
        if not node:
            raise ValueError("Root node not found")
        payload = extract_jsonish(result)
        node.claim = sanitize_text(payload.get("root_claim") or node.claim)
        root_argument = payload.get("argument") or "Debate decomposed into initial pro and con claims."
        create_generation(db, job, node, root_argument, job.stream_buffer or json.dumps(payload), metadata)
        stale_descendants(db, node)
        children = normalized_decomposition_children(payload, debate)
        for position, child_payload in enumerate(children):
            child = Node(
                debate_id=debate.id,
                parent_id=node.id,
                node_type=child_payload["node_type"],
                depth=1,
                position=position,
                claim=child_payload["claim"],
                status="pending",
                materialized_path=f"{node.materialized_path}/{position}",
            )
            db.add(child)
            flush_write(db)
            role = role_for_node(child.node_type)
            create_job(
                db,
                debate.id,
                "argue",
                role,
                child.id,
                exclude_models=claim_author_exclusions(db, role, node, debate),
            )
        ensure_default_scoring_for_completed_generation(db, debate, node)
        commit_write(db)
        await event_bus.publish(job.debate_id, "tree_ready", {"tree": debate_to_dict(db, debate)})
        await event_bus.publish(job.debate_id, "node_complete", {"node_id": node.id, "generation_id": node.active_generation_id})

    elif job.job_type == "argue":
        node = db.get(Node, job.node_id)
        if not node:
            raise ValueError("Node not found")
        argument = result.get("argument") if isinstance(result, dict) else str(result)
        generation = create_generation(db, job, node, argument, job.stream_buffer or str(result), metadata)
        ensure_default_scoring_for_completed_generation(db, debate, node)
        lifecycle_decision = exploration_decision_for_node(db, debate, node)
        child_spawn_count = spawn_child_argument_jobs(
            db,
            debate,
            node,
            _candidate_child_claims(result),
            decision=lifecycle_decision,
        )
        lifecycle_persistence = _persist_lifecycle_evaluation(
            db,
            job=job,
            node=node,
            decision=lifecycle_decision,
            child_spawn_count=child_spawn_count,
        )
        flush_write(db)
        maybe_queue_synthesis(db, debate)
        commit_write(db)
        if lifecycle_persistence.persistence_result == "created":
            await event_bus.publish(
                job.debate_id,
                "dialectical_exploration",
                _lifecycle_event_payload(lifecycle_persistence),
            )
        await event_bus.publish(job.debate_id, "node_complete", {"node_id": node.id, "generation_id": generation.id})

    elif job.job_type == "synthesize":
        payload = extract_jsonish(result)
        synthesis = Synthesis(
            debate_id=debate.id,
            strongest_pro=sanitize_text(payload.get("strongest_pro", "")),
            strongest_con=sanitize_text(payload.get("strongest_con", "")),
            verdict=sanitize_text(payload.get("verdict", "")),
            model_id=job.required_model,
            worker_id=str(job.worker_id),
        )
        db.add(synthesis)
        flush_write(db)
        debate.synthesis_id = synthesis.id
        debate.status = "complete"
        debate.completed_at = now_utc()
        commit_write(db)
        await event_bus.publish(job.debate_id, "synthesis_complete", {"synthesis": payload})
        await event_bus.publish(job.debate_id, "debate_complete", {"debate_id": debate.id})
    elif job.job_type.startswith("v2_"):
        from app.services.dialectical_v2 import complete_v2_worker_job

        await complete_v2_worker_job(db, job, extract_jsonish(result), metadata)
    else:
        raise ValueError(f"Unsupported job type {job.job_type}")

    db.refresh(debate)
    return debate_to_dict(db, debate)


def _log_event_publish_exception(task: asyncio.Task[None]) -> None:
    try:
        task.result()
    except asyncio.CancelledError:
        return
    except Exception:
        LOGGER.exception("Failed to publish orchestrator failure event")


def _publish_events_sync(events: list[tuple[str, str, dict[str, Any]]]) -> None:
    """Publish (debate_id, event, payload) tuples from sync coordinator paths.

    Mirrors dialectical_v2.publish_event (not imported: circular import):
    fire-and-forget on a running loop, blocking asyncio.run otherwise.
    """
    for debate_id, event, payload in events:
        try:
            asyncio.get_running_loop()
        except RuntimeError:
            asyncio.run(event_bus.publish(debate_id, event, payload))
        else:
            task = asyncio.create_task(event_bus.publish(debate_id, event, payload))
            task.add_done_callback(_log_event_publish_exception)


def _queue_synthesis_after_branch_failure(db: Session, debate: Debate, job: Job) -> None:
    """After a terminal branch failure, let the survivors reach synthesis.

    Count-agnostic: synthesis is queued over however many branches survive.
    When NO branch survives, nothing is queued -- the debate is left with a
    failed job and no active jobs, so effective_debate_status derives an
    honest terminal "failed" instead of a synthesis over nothing.
    """
    if job.job_type in ("v2_pov", "v2_expand"):
        from app.services.dialectical_v2 import (
            V2_CODEX_MODEL_ID,
            has_completed_branch_container,
            pending_generation_nodes,
            queue_v2_job,
        )

        if not debate.root_node_id:
            return
        flush_write(db)
        # W3 whole-tree quiescence: outstanding v2_pov/v2_expand jobs anywhere
        # in the tree keep blocking synthesis (the failed job itself is
        # already terminal at this point, so it never blocks).
        if pending_generation_nodes(db, debate.id, debate.root_node_id):
            return
        if job.job_type == "v2_expand":
            # W4 (flag-gated): a terminally failed expand child ends the
            # adaptive round -- growth stopped because generation was
            # exhausted on the failed path. Recorded before synthesis is
            # queued over the survivors, so the loop never wedges and the
            # synthesis prompt can carry the stopping context. Joins the
            # caller's terminal-failure transaction (commit-then-publish).
            from app.exploration.expansion_dispatch import (
                STOPPED_GENERATION_EXHAUSTED,
                adaptive_expansion_enabled,
                record_adaptive_stop,
            )

            if adaptive_expansion_enabled():
                record_adaptive_stop(db, debate, STOPPED_GENERATION_EXHAUSTED)
        if not has_completed_branch_container(db, debate.id, debate.root_node_id):
            return
        existing_synthesis = db.scalar(
            select(Job)
            .where(
                Job.debate_id == debate.id,
                Job.job_type == "v2_synthesize",
                Job.status.in_(["pending", "claimed", "running"]),
            )
            .limit(1)
        )
        if existing_synthesis is None:
            # Synthesis integrates the whole tree: pin it to the anchor model
            # rather than inheriting whichever model's job failed last.
            queue_v2_job(db, debate, "v2_synthesize", "v2_synthesizer", V2_CODEX_MODEL_ID, None)
        return
    # v1 argue: never route a v1 synthesis into a v2 tree, and only
    # synthesize when at least one argument survived.
    if debate_uses_v2_pipeline(db, debate.id):
        return
    flush_write(db)
    survivor = db.scalar(
        select(Node.id)
        .where(Node.debate_id == debate.id, Node.node_type.in_(["PRO", "CON"]), Node.status == "complete")
        .limit(1)
    )
    if survivor is None:
        return
    maybe_queue_synthesis(db, debate)


def terminalize_job_failure(db: Session, job: Job, reason: str) -> list[tuple[str, str, dict[str, Any]]]:
    """Shared terminal-failure handling for every requeue channel.

    Node-degradable families (argue, v2_pov) degrade only their branch: the
    node is marked failed with stopping_reason "generation_exhausted", the
    path is abandoned, and debate.status is NOT touched. Every other family
    keeps the honest debate-level terminal "failed". Returns the
    (debate_id, event, payload) tuples to publish after commit.
    """
    previous_job_status = job.status
    job.status = "failed"
    record_job_transition(
        db,
        job,
        from_status=previous_job_status,
        to_status="failed",
        channel="terminalize",
        reason=reason,
    )
    job.error = sanitize_text(reason, 2_000) or "Job failed"
    # Keep job.worker_id for attribution (which worker last held the poison
    # job); only free the worker itself to take new work.
    if job.worker_id:
        worker = db.get(Worker, job.worker_id)
        if worker and worker.current_job_id == job.id:
            worker.current_job_id = None
    debate = db.get(Debate, job.debate_id)
    node = db.get(Node, job.node_id) if job.node_id else None
    events: list[tuple[str, str, dict[str, Any]]] = []
    if job.job_type in NODE_DEGRADABLE_JOB_TYPES and node is not None and debate is not None:
        node.status = "failed"
        node.stopping_status = "stop"
        node.stopping_reason = GENERATION_EXHAUSTED_STOPPING_REASON
        node.path_status = "abandoned"
        _queue_synthesis_after_branch_failure(db, debate, job)
        events.append(
            (
                job.debate_id,
                "node_failed",
                {
                    "node_id": node.id,
                    "code": PUBLIC_NODE_FAILURE_CODE,
                    "reason": PUBLIC_NODE_FAILURE_MESSAGE,
                    "terminal": True,
                },
            )
        )
        return events
    if debate is not None and debate.status != "archived":
        debate.status = "failed"
    if node is not None and not job.job_type.startswith("v2_"):
        node.status = "failed"
        events.append(
            (
                job.debate_id,
                "node_failed",
                {
                    "node_id": node.id,
                    "code": PUBLIC_NODE_FAILURE_CODE,
                    "reason": PUBLIC_NODE_FAILURE_MESSAGE,
                    "terminal": True,
                },
            )
        )
    events.append(
        (
            job.debate_id,
            "debate_failed",
            {
                "scope": job.job_type,
                "code": PUBLIC_DEBATE_FAILURE_CODE,
                "message": PUBLIC_DEBATE_FAILURE_MESSAGE,
                "retry_in_s": 5,
            },
        )
    )
    return events


def requeue_or_terminalize_timed_out_job(db: Session, job: Job, reason: str) -> list[tuple[str, str, dict[str, Any]]]:
    """Timeout-class requeue (deadline expiry / worker vanished).

    Consumes half-weight budget; requeues with a fresh deadline while budget
    remains, otherwise applies the shared terminal handling. Returns events
    to publish (empty when requeued).
    """
    previous_job_status = job.status
    job.timeout_attempts = (job.timeout_attempts or 0) + 1
    if job_attempts_exhausted(job):
        return terminalize_job_failure(db, job, f"{reason} (retry budget exhausted)")
    record_job_transition(
        db,
        job,
        from_status=previous_job_status,
        to_status="pending",
        channel="timeout_requeue",
        reason=reason,
    )
    job.status = "pending"
    release_job_claim(db, job)
    reset_job_target_for_retry(db, job)
    job.stream_buffer = ""
    job.error = reason
    job.deadline = make_deadline()
    return []


async def fail_job(db: Session, job: Job, reason: str, retryable: bool) -> None:
    ensure_mutable_claim(db, job)
    job.error = sanitize_text(reason, 2_000)
    if job.worker_id:
        worker = db.get(Worker, job.worker_id)
        if worker:
            worker.current_job_id = None
            worker.status = "degraded" if retryable else worker.status
    if retryable and not job_attempts_exhausted(job):
        record_job_transition(
            db,
            job,
            from_status=job.status,
            to_status="pending",
            channel="worker_fail",
            reason=job.error,
        )
        job.status = "pending"
        release_job_claim(db, job)
        job.stream_buffer = ""
        job.deadline = make_deadline()
        if job.node_id and not job.job_type.startswith("v2_"):
            node = db.get(Node, job.node_id)
            if node:
                node.status = "pending"
        commit_write(db)
        if job.node_id and not job.job_type.startswith("v2_"):
            await event_bus.publish(
                job.debate_id,
                "node_failed",
                {
                    "node_id": job.node_id,
                    "code": PUBLIC_NODE_FAILURE_CODE,
                    "reason": PUBLIC_NODE_FAILURE_MESSAGE,
                    "retry_in_s": 5,
                },
            )
        else:
            await event_bus.publish(
                job.debate_id,
                "debate_failed",
                {
                    "scope": job.job_type,
                    "code": PUBLIC_DEBATE_FAILURE_CODE,
                    "message": PUBLIC_DEBATE_FAILURE_MESSAGE,
                    "retry_in_s": 5,
                },
            )
        return
    events = terminalize_job_failure(db, job, job.error or "Job failed")
    commit_write(db)
    for debate_id, event, payload in events:
        await event_bus.publish(debate_id, event, payload)


def debate_uses_v2_pipeline(db: Session, debate_id: str) -> bool:
    """True when the debate was built by the v2 pipeline.

    Every v2 debate queues v2_* jobs synchronously at creation and job rows
    are never deleted, so their presence is a durable structural marker.
    (DebateBranch is NOT usable here: scoring backfills a branch for scored
    v1 debates via current_scoring_branch.)
    """
    return (
        db.scalar(
            select(Job.id)
            .where(Job.debate_id == debate_id, Job.job_type.startswith("v2_", autoescape=True))
            .limit(1)
        )
        is not None
    )


async def regenerate_node(db: Session, node: Node, model_id: str | None = None) -> Job:
    if model_id is not None:
        model_id = model_id.strip()
        if not model_id:
            raise ValueError("model_id must be a non-empty string")
    debate = db.get(Debate, node.debate_id)
    if not debate:
        raise ValueError("Debate not found")
    active_generation = db.get(Generation, node.active_generation_id) if node.active_generation_id else None
    online_models = online_capabilities(db)
    if node.node_type == "ROOT_CLAIM":
        # v1-reroute guard, root edition (W3, carried from the W0 review): a
        # v1 `decompose` job on a v2 tree rebuilds v1 PRO/CON children and its
        # argue chain can queue a v1 `synthesize` that replaces the debate's
        # v2 synthesis -- same corruption family as the PRO/CON guard below.
        if debate_uses_v2_pipeline(db, debate.id):
            raise ValueError(
                "Root regeneration is not supported inside a v2 debate; regenerate a POV branch node instead"
            )
        role = "decomposer"
        job_type = "decompose"
    elif node.node_type in V2_POV_ROLES:
        # Dynamic perspectives recycle the legacy POV node_types (they are NOT
        # unique among siblings); the lens identity lives in the node's
        # claim/label. Derive the regen role from the actual label so the job
        # and its materialization keep the dynamic identity; fall back to the
        # legacy label only when the claim is blank.
        claim_label = (node.claim or "").strip()
        role = claim_label or V2_POV_ROLES[node.node_type]
        job_type = "v2_pov"
    else:
        # v1-reroute guard (W0/B4): a v1 `argue` job on a v2 tree completes
        # through complete_job's v1 branch and can queue a v1 `synthesize`
        # that replaces the debate's v2 synthesis, bypassing the v2 branch-
        # completeness gate and provenance. Refuse instead of corrupting.
        if debate_uses_v2_pipeline(db, debate.id):
            raise ValueError(
                "Argument regeneration is not supported inside a v2 debate; regenerate the POV branch node instead"
            )
        role = role_for_node(node.node_type)
        job_type = "argue"
    parent = db.get(Node, node.parent_id) if node.parent_id else None
    role_configs = routing_roles_for_debate(debate)
    constrained_excludes = claim_author_exclusions(db, role, parent, debate)
    if model_id and model_id not in (configured_routing_models(role_configs) | online_models):
        raise ValueError(f"Model {model_id} is not configured or online")
    if model_id and model_id in constrained_excludes:
        raise ValueError(f"Model {model_id} violates role constraint {role}: not_same_as_claim_author")
    exclude = (
        {active_generation.model_id}
        if active_generation and not model_id and any(model != active_generation.model_id for model in online_models)
        else set()
    )
    exclude |= constrained_excludes if not model_id else set()
    cancel_active_jobs_for_node(db, node, "Node regeneration superseded")
    cancel_active_synthesis_jobs(db, debate.id, "Node regeneration superseded synthesis")
    required_model = model_id
    if job_type == "v2_pov" and required_model is None and active_generation:
        required_model = active_generation.model_id
    job = create_job(
        db,
        debate.id,
        job_type,
        role,
        node.id,
        required_model=required_model,
        exclude_models=exclude,
    )
    stale_descendants(db, node)
    node.status = "pending"
    debate.status = "generating"
    debate.synthesis_id = None
    debate.completed_at = None
    commit_write(db)
    return job


def markdown_export(db: Session, debate: Debate) -> str:
    data = debate_to_dict(db, debate)
    models = ", ".join(data["models"]) or "none"
    workers = ", ".join(data["workers"]) or "none"

    def string_list(value: Any) -> list[str]:
        if not isinstance(value, list):
            return []
        return [item.strip() for item in value if isinstance(item, str) and item.strip()]

    lines = [
        f"# Debate: {data['topic']}",
        "",
        f"**Created:** {data['created_at']} - **Workers:** {workers} - **Models:** {models} - "
        f"**Depth:** {data['config'].get('max_depth')} - **Nodes:** {data['node_count']}",
        "",
        "## Synthesis",
        "",
    ]
    synthesis = data.get("synthesis")
    if synthesis:
        provenance = synthesis.get("provenance") if isinstance(synthesis.get("provenance"), dict) else {}
        sections = [
            ("Agreements", string_list(provenance.get("agreements"))),
            ("Tensions", string_list(provenance.get("tensions"))),
            ("Evidence Gaps", string_list(provenance.get("evidence_gaps"))),
            ("Key Takeaways", string_list(provenance.get("key_takeaways"))),
        ]
        structured_sections = [(title, items) for title, items in sections if items]
        if not str(synthesis.get("strongest_con") or "").strip() and structured_sections:
            worker_name = synthesis.get("worker_name")
            worker_suffix = f" on {worker_name}" if worker_name else ""
            lines.extend(
                [
                    f"### {synthesis['strongest_pro']}",
                    "",
                    synthesis["verdict"],
                    "",
                    f"_Generated by {synthesis['model_id']}{worker_suffix}._",
                ]
            )
            for title, items in structured_sections:
                lines.extend(["", f"### {title}", ""])
                lines.extend([f"- {item}" for item in items])
        else:
            lines.extend(
                [
                    f"**Strongest Pro** *(by {synthesis['model_id']})*: {synthesis['strongest_pro']}",
                    f"**Strongest Con** *(by {synthesis['model_id']})*: {synthesis['strongest_con']}",
                    f"**Verdict** *(by {synthesis['model_id']})*: {synthesis['verdict']}",
                ]
            )
    else:
        lines.append("_Synthesis pending._")
    lines.extend(["", "---", "", "## Tree", ""])

    def walk(node: dict[str, Any], prefix: str = "") -> None:
        if node["node_type"] == "ROOT_CLAIM":
            lines.extend(["### Root Claim", f"> {node['claim']}", ""])
        else:
            marker = "▲ Pro" if node["node_type"] == "PRO" else "▼ Con"
            generation = node.get("active_generation") or {}
            model = generation.get("model_id", "pending")
            worker = generation.get("worker_name", generation.get("worker_id", "pending"))
            hashes = "#" * min(6, 4 + node["depth"])
            lines.append(f"{prefix}{hashes} {marker} {node['position'] + 1} - *{model}* (worker: {worker})")
            lines.append(generation.get("argument") or "_Pending._")
            lines.append("")
        for child in node.get("children", []):
            walk(child, prefix + "  ")

    if data["tree"]:
        walk(data["tree"])

    lines.extend(["", "---", "", "## Generation History", ""])
    history_nodes = list(
        db.scalars(
            select(Node)
            .where(Node.debate_id == debate.id)
            .order_by(Node.materialized_path, Node.depth, Node.position, Node.created_at)
        ).all()
    )
    history_count = 0
    for node in history_nodes:
        generations = list(
            db.scalars(
                select(Generation)
                .where(Generation.node_id == node.id)
                .order_by(Generation.created_at.desc(), Generation.id.desc())
            ).all()
        )
        if not generations:
            continue
        history_count += len(generations)
        if node.node_type == "ROOT_CLAIM":
            node_label = "Root Claim"
        else:
            marker = "Pro" if node.node_type == "PRO" else "Con"
            node_label = f"{marker} {node.position + 1}: {node.claim}"
        status_suffix = f" [{node.status}]" if node.status != "complete" else ""
        lines.extend([f"### {node_label}{status_suffix}", ""])
        for generation in generations:
            state = "Active" if generation.is_active else "Archived"
            worker = db.get(Worker, generation.worker_id)
            worker_name = worker.name if worker else generation.worker_id
            created_at = iso(generation.created_at) or "unknown"
            lines.append(
                f"- **{state}** `{generation.id}` - *{generation.model_id}* "
                f"(worker: {worker_name}, role: {generation.role}, created: {created_at})"
            )
            argument = generation.argument or "_No argument text._"
            for argument_line in argument.splitlines() or [argument]:
                lines.append(f"  > {argument_line}")
            lines.append("")
    if history_count == 0:
        lines.append("_No generations recorded._")
    return "\n".join(lines).strip() + "\n"
