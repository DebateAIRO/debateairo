from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.write_lock import commit_write, flush_write
from app.models.entities import (
    AgentDefinition,
    AgentRun,
    AnalyzerRun,
    CapabilityMatch,
    Debate,
    DebateBranch,
    Generation,
    Job,
    Node,
    ProvenanceRecord,
    SkillDefinition,
    Synthesis,
    Worker,
    next_analyzer_run_seq,
    now_utc,
)
from app.core.config import bool_env
from app.evidence.extraction import persist_evidence_nodes
from app.exploration.expansion_dispatch import (
    STOPPED_QUIESCENT_NO_DECISIONS,
    adaptive_expansion_enabled,
    maybe_queue_rescore_after_expansion,
    record_adaptive_stop,
    stopped_because_of,
)
from app.scoring.normalizer import classify_claim_type
from app.services.events import event_bus
from app.services.orchestrator import (
    cancel_active_synthesis_jobs,
    capable_online_workers,
    create_generation,
    create_job,
    debate_uses_v2_pipeline,
    merged_debate_config,
    routing_allowed_models,
    sanitize_text,
    worker_capability_set,
)
from app.protocol.runner import run_protocol_analysis
from app.protocol.state import advance_phase, initialize_protocol_state, protocol_state_of
from app.providers import ProviderRegistry
from app.scoring.jobs import trigger_internal_scoring_after_completion
from app.scoring.service import ensure_node_scoring_on_completion


DEFAULT_ANALYZERS = ("Statistical Analyzer", "Scientific Analyzer", "Psychological Analyzer")
MODEL_ID = "coordinator-deterministic-v2"
WORKER_LABEL = "coordinator"
V2_CODEX_MODEL_ID = "codex-gpt-5.5"
NO_REAL_CODEX_WORKER_ERROR = "No real Codex worker online for Dialectical V2 artifact generation"
# W3: the job families that generate argument-tree nodes for a v2 debate.
# Any outstanding job of these types anywhere in the tree blocks synthesis
# (whole-tree quiescence -- see pending_generation_nodes).
V2_GENERATION_JOB_TYPES = ("v2_pov", "v2_expand")
OUTSTANDING_JOB_STATUSES = ("pending", "claimed", "running")
POV_BRANCHES = (
    ("SCIENTIFIC_POV", "Scientific POV"),
    ("STATISTICAL_POV", "Statistical POV"),
    ("ETHICAL_POV", "Ethical POV"),
    ("PRACTICAL_POV", "Practical POV"),
)
POV_LENS_DESCRIPTIONS = {
    "Scientific POV": (
        "Evaluate causal mechanisms, empirical evidence quality, uncertainty, external validity, "
        "and what the current scientific reasoning supports or does not support."
    ),
    "Statistical POV": (
        "Evaluate measurement, base rates, effect sizes, distributions, statistical uncertainty, "
        "confounding, sample quality, and quantitative evidence gaps."
    ),
    "Ethical POV": (
        "Evaluate fairness, harm, dignity, rights, responsibility, and group tradeoffs, including "
        "whether the action should be done even if it works."
    ),
    "Practical POV": (
        "Evaluate feasibility, operational complexity, costs, maintainability, failure modes, "
        "rollout risks, and edge cases, including whether the action can realistically be done."
    ),
}
# --------------------------------------------------------------------------
# Dynamic perspectives (DIALECTICAL_DYNAMIC_PERSPECTIVES)
# --------------------------------------------------------------------------
# V's product direction: put the dynamic-perspective algorithm to work in place
# of the fixed 4-POV quartet. Perspective SELECTION is deterministic and
# provider-free at creation time (creation is a synchronous API call): it reuses
# the existing rule-based claim classifier (app.scoring.normalizer.
# classify_claim_type) to pick a claim-type-appropriate lens set, with a safe
# generalist fallback when the type is unknown.
#
# node_type design (safest minimal choice, justified): the qbaf debate adapter
# (app/qbaf/debate_adapter.py) recognizes ONLY the four legacy POV node types as
# support containers -- any unknown node_type produces an "unmapped_edge" in
# BOTH semantics paths, which would DROP a perspective's support edge and orphan
# its subtree from scoring. So each dynamic perspective REUSES a legacy POV
# node_type (drawn by cycling POV_BRANCHES), keeping the scoring graph
# structurally identical to the quartet, while the perspective's real identity
# lives in its dynamic LABEL (Node.claim) and lens description. This also fits
# the Node.node_type String(16) column trivially (the reused types already do).
#
# Each entry below is (label, lens_description). Labels stay <= 32 chars because
# they flow into Job.required_role (String(32)).
_CLAIM_TYPE_PERSPECTIVES: dict[str, tuple[tuple[str, str], ...]] = {
    "causal": (
        ("Mechanism POV", "Evaluate the proposed causal mechanism, its plausibility, dose-response, and the temporal ordering linking cause to effect."),
        ("Confounding POV", "Evaluate alternative explanations, confounders, reverse causation, and selection effects that could produce the association without the claimed cause."),
        ("Evidence POV", "Evaluate the design, quality, and external validity of the empirical evidence offered for the causal claim."),
    ),
    "prediction": (
        ("Trend POV", "Evaluate whether the historical trend the forecast extrapolates is stable and what conditions must hold for it to continue."),
        ("Disruptor POV", "Evaluate shocks, regime changes, saturation, and feedback effects that could break the forecast."),
        ("Base-rate POV", "Evaluate base rates and reference-class outcomes for similar predictions, and the calibration of the forecast's stated confidence."),
    ),
    "comparative": (
        ("Baseline POV", "Evaluate whether the comparison baseline and reference class are well-defined and genuinely like-for-like."),
        ("Measurement POV", "Evaluate how each side of the comparison is measured and whether the magnitude of the difference is meaningful and robust."),
    ),
    "normative": (
        ("Ethical POV", POV_LENS_DESCRIPTIONS["Ethical POV"]),
        ("Stakeholder POV", "Evaluate who bears the benefits and harms, whose interests are weighted, and distributional fairness across affected groups."),
        ("Rights POV", "Evaluate rights, duties, consent, and side-constraints that may hold regardless of aggregate outcomes."),
        ("Consequence POV", "Evaluate the realistic downstream consequences, incentives, and second-order effects of adopting the prescription."),
    ),
    "definitional": (
        ("Conceptual POV", "Evaluate whether the definition is coherent, non-circular, and captures the intended concept."),
        ("Boundary POV", "Evaluate edge cases, counterexamples, and borderline instances that test the definition's boundaries."),
    ),
    "empirical": (
        ("Scientific POV", POV_LENS_DESCRIPTIONS["Scientific POV"]),
        ("Statistical POV", POV_LENS_DESCRIPTIONS["Statistical POV"]),
        ("Data-quality POV", "Evaluate sampling, measurement error, missing data, and reproducibility of the underlying data."),
    ),
    "mixed": (
        ("Scientific POV", POV_LENS_DESCRIPTIONS["Scientific POV"]),
        ("Statistical POV", POV_LENS_DESCRIPTIONS["Statistical POV"]),
        ("Ethical POV", POV_LENS_DESCRIPTIONS["Ethical POV"]),
        ("Practical POV", POV_LENS_DESCRIPTIONS["Practical POV"]),
        ("Integrative POV", "Evaluate how the claim's factual, quantitative, ethical, and practical dimensions interact, and where they reinforce or conflict."),
    ),
}

# Fallback for "unknown" (and any unmapped claim type): the general four-lens
# set, carried through the SAME dynamic path so the algorithm is genuinely
# active by default while staying a safe generalist default.
_FALLBACK_PERSPECTIVES: tuple[tuple[str, str], ...] = tuple(
    (label, POV_LENS_DESCRIPTIONS[label]) for _node_type, label in POV_BRANCHES
)

# Flat label -> lens map for the render path (render_v2_job_prompt). Labels that
# recur across sets map to an identical lens, so flattening is unambiguous.
DYNAMIC_LENS_DESCRIPTIONS: dict[str, str] = {
    label: lens
    for perspectives in (*_CLAIM_TYPE_PERSPECTIVES.values(), _FALLBACK_PERSPECTIVES)
    for label, lens in perspectives
}


def dynamic_perspectives(topic: str) -> list[tuple[str, str, str]]:
    """Return [(node_type, label, lens_description), ...] for `topic`.

    Deterministic and provider-free. The perspective COUNT and the label/lens
    CONTENT vary by claim type (at least 2, no fixed universal count); the
    node_type is always drawn from the legacy POV vocabulary so downstream
    scoring/qbaf/serialization treat each perspective exactly like a legacy POV
    lens.
    """
    claim_type, _markers = classify_claim_type(topic)
    labelled = _CLAIM_TYPE_PERSPECTIVES.get(claim_type, _FALLBACK_PERSPECTIVES)
    pov_types = [node_type for node_type, _label in POV_BRANCHES]
    return [
        (pov_types[index % len(pov_types)], label, lens)
        for index, (label, lens) in enumerate(labelled)
    ]


PROMPT_DIR = Path(__file__).resolve().parents[1] / "prompts"
AgentCapability = AgentDefinition
SkillCapability = SkillDefinition
AgentOutput = AgentRun
LOGGER = logging.getLogger(__name__)


@dataclass(frozen=True)
class V2GenerationReadiness:
    ready: bool
    required_model: str
    reason: str
    reason_code: str
    online_worker_names: list[str]
    known_worker_names: list[str]


def _log_event_publish_exception(task: asyncio.Task[None]) -> None:
    try:
        task.result()
    except asyncio.CancelledError:
        return
    except Exception:
        LOGGER.exception("Failed to publish dialectical v2 event")


async def _publish_event_observably(debate_id: str, event: str, data: dict[str, Any]) -> None:
    try:
        await event_bus.publish(debate_id, event, data)
    except asyncio.CancelledError:
        raise
    except Exception:
        LOGGER.exception("Failed to publish dialectical v2 event")


def publish_event(debate_id: str, event: str, data: dict[str, Any]) -> None:
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        asyncio.run(event_bus.publish(debate_id, event, data))
    else:
        # This service is called from sync coordinator paths today. If a future
        # async caller enters here, publish without blocking but keep failures
        # visible instead of dropping task exceptions.
        task = asyncio.create_task(_publish_event_observably(debate_id, event, data))
        task.add_done_callback(_log_event_publish_exception)


def keyword_set(text: str) -> set[str]:
    words = {
        word.strip(".,!?;:()[]{}\"'").lower()
        for word in text.split()
        if len(word.strip(".,!?;:()[]{}\"'")) >= 4
    }
    tags = set(words)
    if words & {"city", "cities", "downtown", "traffic", "cars", "transport", "mobility"}:
        tags.update({"urban", "transport", "policy"})
    if words & {"ban", "restrict", "restriction", "regulate"}:
        tags.update({"governance", "tradeoff"})
    return tags


def classify_question(question: str) -> dict[str, Any]:
    tags = sorted(keyword_set(question))
    question_type = "policy" if {"policy", "governance", "tradeoff"} & set(tags) else "general"
    return {"question_type": question_type, "domain_tags": tags, "question": question}


def capability_tags(definition: dict[str, Any] | None, kind: str) -> set[str]:
    if not isinstance(definition, dict):
        return set()
    if kind == "skill":
        trigger = definition.get("trigger") if isinstance(definition.get("trigger"), dict) else {}
        return {str(tag).lower() for tag in trigger.get("domain_tags", []) if str(tag).strip()}
    return {str(tag).lower() for tag in definition.get("domain_tags", []) if str(tag).strip()}


def is_selectable(status: str | None, quality_score: float | None) -> bool:
    return status in {"active", "provisional"} and (quality_score is None or quality_score >= 0.5)


def real_v2_capability_provenance(definition: dict[str, Any] | None) -> bool:
    if not isinstance(definition, dict):
        return False
    provenance = definition.get("provenance")
    if not isinstance(provenance, dict):
        return False
    model_id = str(provenance.get("created_by_model") or provenance.get("model_id") or "").strip()
    worker_id = str(provenance.get("created_by_worker_id") or provenance.get("worker_id") or "").strip()
    job_id = str(provenance.get("job_id") or "").strip()
    lowered = model_id.lower()
    if not model_id or not worker_id or not job_id:
        return False
    return not (
        lowered == MODEL_ID
        or lowered.startswith("mock")
        or lowered.startswith("fake")
        or "deterministic" in lowered
    )


def overlap_score(candidate_tags: Iterable[str], target_tags: Iterable[str]) -> int:
    return len(set(candidate_tags) & set(target_tags))


def _worker_name(worker: Worker) -> str:
    return str(worker.name or worker.id or "").strip()


def _is_mock_or_deterministic_worker(worker: Worker) -> bool:
    markers = ("mock", "fake", "deterministic", "local")
    name = _worker_name(worker).lower()
    return any(marker in name for marker in markers)


def _real_v2_codex_workers(workers: Iterable[Worker]) -> list[Worker]:
    return [
        worker
        for worker in workers
        if V2_CODEX_MODEL_ID in worker_capability_set(worker)
        and not _is_mock_or_deterministic_worker(worker)
    ]


def v2_generation_readiness(db: Session) -> V2GenerationReadiness:
    workers = list(db.scalars(select(Worker).order_by(Worker.created_at.asc(), Worker.id.asc())).all())
    known_worker_names = [_worker_name(worker) for worker in workers if _worker_name(worker)]
    capable_workers = [worker for worker in workers if V2_CODEX_MODEL_ID in worker_capability_set(worker)]

    allowed = routing_allowed_models(db)
    if allowed is not None and V2_CODEX_MODEL_ID not in allowed:
        return V2GenerationReadiness(
            ready=False,
            required_model=V2_CODEX_MODEL_ID,
            reason=f"{V2_CODEX_MODEL_ID} is not currently allowed for routing.",
            reason_code="offline_real_worker",
            online_worker_names=[],
            known_worker_names=known_worker_names,
        )

    online_workers = capable_online_workers(db, V2_CODEX_MODEL_ID)
    online_real_workers = _real_v2_codex_workers(online_workers)
    if online_real_workers:
        return V2GenerationReadiness(
            ready=True,
            required_model=V2_CODEX_MODEL_ID,
            reason=f"Real {V2_CODEX_MODEL_ID} worker is online.",
            reason_code="ready",
            online_worker_names=[_worker_name(worker) for worker in online_real_workers if _worker_name(worker)],
            known_worker_names=known_worker_names,
        )

    if not workers:
        reason_code = "no_workers"
        reason = "No workers are known to the coordinator."
    elif capable_workers and all(_is_mock_or_deterministic_worker(worker) for worker in capable_workers):
        reason_code = "mock_or_deterministic_only"
        reason = f"Only mock, local, or deterministic workers advertise {V2_CODEX_MODEL_ID}."
    elif any(worker.status == "offline" for worker in _real_v2_codex_workers(capable_workers)):
        reason_code = "offline_real_worker"
        reason = f"A real {V2_CODEX_MODEL_ID} worker is known but marked offline."
    elif _real_v2_codex_workers(capable_workers):
        reason_code = "stale_real_worker"
        reason = f"A real {V2_CODEX_MODEL_ID} worker is known but stale or not currently online."
    else:
        reason_code = "mock_or_deterministic_only"
        reason = f"No real {V2_CODEX_MODEL_ID} worker is online."

    return V2GenerationReadiness(
        ready=False,
        required_model=V2_CODEX_MODEL_ID,
        reason=reason,
        reason_code=reason_code,
        online_worker_names=[],
        known_worker_names=known_worker_names,
    )


def require_v2_codex_model(db: Session) -> str:
    if v2_generation_readiness(db).ready:
        return V2_CODEX_MODEL_ID
    raise RuntimeError(NO_REAL_CODEX_WORKER_ERROR)


def prompt_text(name: str) -> str:
    return (PROMPT_DIR / name).read_text(encoding="utf-8")


def normalize_key(*parts: str) -> str:
    return " ".join(part.strip().lower() for part in parts if part and part.strip())


def definition_name(definition: dict[str, Any] | None) -> str:
    return str((definition or {}).get("name") or "").strip()


def validate_planner_contract(payload: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValueError("Planner output must be a JSON object")
    agents = payload.get("agents")
    skills = payload.get("skills")
    if not isinstance(agents, list) or not agents:
        raise ValueError("Planner output must include non-empty agents")
    if not isinstance(skills, list) or not skills:
        raise ValueError("Planner output must include non-empty skills")

    normalized_skills: list[dict[str, Any]] = []
    for index, skill in enumerate(skills):
        if not isinstance(skill, dict):
            raise ValueError(f"Planner skill {index + 1} must be an object")
        skill_type = str(skill.get("type") or "").strip().lower()
        if skill_type != "prompt":
            raise ValueError("Only prompt skills are supported in this ticket")
        name = sanitize_text(str(skill.get("name") or ""), 160)
        body = sanitize_text(str(skill.get("body") or skill.get("instructions") or ""), 4_000)
        description = sanitize_text(str(skill.get("description") or ""), 1_000)
        if not name:
            raise ValueError("Planner skill name is required")
        if not body:
            raise ValueError("Planner skill body is required")
        tags = [sanitize_text(str(tag), 80).lower() for tag in skill.get("tags", []) if str(tag).strip()]
        normalized_skills.append(
            {"name": name, "type": "prompt", "description": description, "body": body, "tags": sorted(set(tags))}
        )

    skill_names = {skill["name"].lower() for skill in normalized_skills}
    normalized_agents: list[dict[str, Any]] = []
    for index, agent in enumerate(agents):
        if not isinstance(agent, dict):
            raise ValueError(f"Planner agent {index + 1} must be an object")
        name = sanitize_text(str(agent.get("name") or ""), 160)
        lens = sanitize_text(str(agent.get("lens") or agent.get("role") or ""), 160)
        default_prompt = sanitize_text(str(agent.get("default_prompt") or agent.get("instructions") or ""), 4_000)
        description = sanitize_text(str(agent.get("description") or ""), 1_000)
        if not name:
            raise ValueError("Planner agent name is required")
        if not lens:
            raise ValueError("Planner agent lens is required")
        if not default_prompt:
            raise ValueError("Planner agent default_prompt is required")
        requested_skill_names = [
            sanitize_text(str(skill_name), 160)
            for skill_name in agent.get("skill_names", [])
            if str(skill_name).strip()
        ]
        selected_names = [skill_name for skill_name in requested_skill_names if skill_name.lower() in skill_names]
        if not selected_names:
            selected_names = [normalized_skills[0]["name"]]
        normalized_agents.append(
            {
                "name": name,
                "description": description,
                "lens": lens,
                "domain": sanitize_text(str(agent.get("domain") or ""), 160),
                "default_prompt": default_prompt,
                "skill_names": selected_names,
            }
        )

    return {"agents": normalized_agents, "skills": normalized_skills}


def skill_definition_payload(skill: dict[str, Any], debate_id: str, provenance: dict[str, Any]) -> dict[str, Any]:
    return {
        "kind": "skill",
        "name": skill["name"],
        "type": "prompt",
        "status": "active",
        "description": skill["description"],
        "body": skill["body"],
        "instructions": skill["body"],
        "tags": skill["tags"],
        "provenance": provenance | {"created_in_debate_id": debate_id},
    }


def agent_definition_payload(agent: dict[str, Any], debate_id: str, provenance: dict[str, Any]) -> dict[str, Any]:
    return {
        "kind": "agent",
        "name": agent["name"],
        "status": "active",
        "description": agent["description"],
        "lens": agent["lens"],
        "domain": agent["domain"],
        "domain_tags": [tag for tag in keyword_set(f"{agent['domain']} {agent['lens']}")],
        "default_prompt": agent["default_prompt"],
        "provenance": provenance | {"created_in_debate_id": debate_id},
    }


def find_skill_definition(db: Session, planned: dict[str, Any]) -> SkillDefinition | None:
    planned_key = normalize_key(planned["name"], *planned.get("tags", []))
    for skill in db.scalars(select(SkillDefinition)).all():
        definition = skill.definition if isinstance(skill.definition, dict) else {}
        tags = definition.get("tags") or definition.get("trigger", {}).get("domain_tags", [])
        if normalize_key(definition_name(definition), *[str(tag) for tag in tags]) == planned_key:
            return skill
    return None


def find_agent_definition(db: Session, planned: dict[str, Any]) -> AgentDefinition | None:
    planned_key = normalize_key(planned["name"], planned["lens"])
    for agent in db.scalars(select(AgentDefinition)).all():
        definition = agent.definition if isinstance(agent.definition, dict) else {}
        if normalize_key(definition_name(definition), str(definition.get("lens") or definition.get("role") or "")) == planned_key:
            return agent
    return None


def resolve_planned_definitions(
    db: Session,
    debate: Debate,
    branch: DebateBranch,
    plan: dict[str, Any],
    provenance: dict[str, Any],
) -> tuple[dict[str, SkillDefinition], list[AgentDefinition]]:
    skills_by_name: dict[str, SkillDefinition] = {}
    for planned_skill in plan["skills"]:
        skill = find_skill_definition(db, planned_skill)
        reason = "reused"
        if not skill:
            skill = SkillDefinition(
                definition=skill_definition_payload(planned_skill, debate.id, provenance),
                status="active",
            )
            db.add(skill)
            flush_write(db)
            reason = "created"
            record_provenance(db, debate.id, branch.id, "skill", skill.id, skill.definition.get("provenance", {}))
        else:
            skill.reuse_count = (skill.reuse_count or 0) + 1
            skill.last_used_at = now_utc()
        db.add(
            CapabilityMatch(
                debate_id=debate.id,
                branch_id=branch.id,
                capability_kind="skill",
                capability_id=skill.id,
                selection_reason=reason,
                score=1 if reason == "reused" else 0,
            )
        )
        skills_by_name[planned_skill["name"].lower()] = skill
        publish_event(debate.id, f"skill_{reason}", {"debate_id": debate.id, "skill_id": skill.id})

    agents: list[AgentDefinition] = []
    for planned_agent in plan["agents"]:
        agent = find_agent_definition(db, planned_agent)
        reason = "reused"
        if not agent:
            agent = AgentDefinition(
                definition=agent_definition_payload(planned_agent, debate.id, provenance),
                status="active",
            )
            db.add(agent)
            flush_write(db)
            reason = "created"
            record_provenance(db, debate.id, branch.id, "agent", agent.id, agent.definition.get("provenance", {}))
        else:
            agent.reuse_count = (agent.reuse_count or 0) + 1
            agent.last_used_at = now_utc()
        db.add(
            CapabilityMatch(
                debate_id=debate.id,
                branch_id=branch.id,
                capability_kind="agent",
                capability_id=agent.id,
                selection_reason=reason,
                score=1 if reason == "reused" else 0,
            )
        )
        agents.append(agent)
        publish_event(debate.id, f"agent_{reason}", {"debate_id": debate.id, "agent_id": agent.id})
    return skills_by_name, agents


def first_branch(db: Session, debate_id: str) -> DebateBranch:
    branch = db.scalar(
        select(DebateBranch).where(DebateBranch.debate_id == debate_id).order_by(DebateBranch.created_at.asc())
    )
    if not branch:
        raise ValueError("Debate branch not found")
    return branch


def first_skill_match(db: Session, debate_id: str) -> SkillCapability | None:
    match = db.scalar(
        select(CapabilityMatch)
        .where(CapabilityMatch.debate_id == debate_id, CapabilityMatch.capability_kind == "skill")
        .order_by(CapabilityMatch.created_at.desc())
    )
    return db.get(SkillCapability, match.capability_id) if match else None


def first_agent_match(db: Session, debate_id: str) -> AgentCapability | None:
    match = db.scalar(
        select(CapabilityMatch)
        .where(CapabilityMatch.debate_id == debate_id, CapabilityMatch.capability_kind == "agent")
        .order_by(CapabilityMatch.created_at.desc())
    )
    return db.get(AgentCapability, match.capability_id) if match else None


def select_reusable_skill(db: Session, debate: Debate, branch: DebateBranch, classification: dict[str, Any]) -> SkillCapability | None:
    target_tags = set(classification["domain_tags"])
    candidates = db.scalars(select(SkillCapability)).all()
    selectable = [
        (overlap_score(capability_tags(candidate.definition, "skill"), target_tags), candidate)
        for candidate in candidates
        if is_selectable(candidate.status, candidate.quality_score)
        and real_v2_capability_provenance(candidate.definition)
    ]
    selectable = [(score, candidate) for score, candidate in selectable if score > 0]
    if not selectable:
        return None
    score, skill = max(selectable, key=lambda item: (item[0], item[1].reuse_count or 0))
    skill.reuse_count = (skill.reuse_count or 0) + 1
    skill.last_used_at = now_utc()
    db.add(
        CapabilityMatch(
            debate_id=debate.id,
            branch_id=branch.id,
            capability_kind="skill",
            capability_id=skill.id,
            selection_reason="reused",
            score=score,
        )
    )
    publish_event(debate.id, "skill_reused", {"debate_id": debate.id, "skill_id": skill.id})
    return skill


def select_reusable_agent(
    db: Session,
    debate: Debate,
    branch: DebateBranch,
    skill: SkillCapability,
    classification: dict[str, Any],
) -> AgentCapability | None:
    target_tags = set(classification["domain_tags"])
    candidates = db.scalars(select(AgentCapability)).all()
    selectable = [
        (overlap_score(capability_tags(candidate.definition, "agent"), target_tags), candidate)
        for candidate in candidates
        if is_selectable(candidate.status, candidate.quality_score)
        and real_v2_capability_provenance(candidate.definition)
    ]
    selectable = [(score, candidate) for score, candidate in selectable if score > 0]
    if not selectable:
        return None
    score, agent = max(selectable, key=lambda item: (item[0], item[1].reuse_count or 0))
    agent.reuse_count = (agent.reuse_count or 0) + 1
    agent.last_used_at = now_utc()
    db.add(
        CapabilityMatch(
            debate_id=debate.id,
            branch_id=branch.id,
            capability_kind="agent",
            capability_id=agent.id,
            selection_reason="reused",
            score=score,
        )
    )
    publish_event(debate.id, "agent_reused", {"debate_id": debate.id, "agent_id": agent.id, "skill_id": skill.id})
    return agent


def queue_v2_job(db: Session, debate: Debate, job_type: str, role: str, model_id: str, node_id: str | None = None) -> Job:
    job = create_job(db, debate.id, job_type, role, node_id, required_model=model_id)
    flush_write(db)
    publish_event(debate.id, f"{job_type}_queued", {"debate_id": debate.id, "job_id": job.id, "model_id": model_id})
    return job


def queue_next_capability_job(
    db: Session,
    debate: Debate,
    branch: DebateBranch,
    skill: SkillCapability | None,
    classification: dict[str, Any],
    model_id: str,
) -> Job:
    if skill is None:
        return queue_v2_job(db, debate, "v2_skill_create", "v2_skill_creator", model_id, debate.root_node_id)
    agent = select_reusable_agent(db, debate, branch, skill, classification)
    if agent is None:
        return queue_v2_job(db, debate, "v2_agent_create", "v2_agent_creator", model_id, debate.root_node_id)
    return queue_v2_job(db, debate, "v2_agent_argument", "v2_agent", model_id, debate.root_node_id)


def branch_lens_label(db: Session, node: Node) -> str:
    """Label of the depth-1 branch container above `node` (the node's own
    claim when it IS the container). Identity lives in the claim/label,
    NEVER in node_type: sibling node_types are not unique (dynamic
    perspectives cycle the legacy POV vocabulary)."""
    current: Node | None = node
    seen: set[str] = set()
    while current is not None and current.depth > 1 and current.parent_id and current.id not in seen:
        seen.add(current.id)
        current = db.get(Node, current.parent_id)
    return str((current.claim if current is not None else "") or "").strip()


def queue_v2_expand_job(
    db: Session,
    debate: Debate,
    node: Node,
    polarity: str,
    reason: str,
    model_id: str | None = None,
    *,
    decision_record_id: str | None = None,
) -> Job:
    """Queue ONE single-node expansion under `node` (the W3 primitive).

    Creates a pending placeholder child Node (depth = node.depth + 1,
    node_type = polarity) plus a `v2_expand` Job targeting the PLACEHOLDER --
    never the parent -- through the same queue_v2_job machinery every other
    v2 generation job uses. The job payload carries the parent node id, the
    child polarity, the branch's lens label, and the decision reason (all
    used by the prompt render). Terminal failure therefore degrades only the
    child path (W1 node-scoped handling); the parent is never touched.

    Nothing calls this on the default path yet: expansion is manually
    queueable in W3, and W4 wires adaptive decisions to it. Returns the Job
    (job.node_id is the placeholder child's id). Commits.
    """
    polarity = str(polarity or "").strip().upper()
    if polarity not in {"PRO", "CON"}:
        raise ValueError("Expansion polarity must be PRO or CON")
    reason = sanitize_text(str(reason or ""), 2_000)
    if not reason:
        raise ValueError("Expansion reason is required")
    if node.debate_id != debate.id:
        raise ValueError("Expansion node does not belong to this debate")
    if node.node_type in {"ROOT_CLAIM", "EVIDENCE"}:
        raise ValueError("Expansion target must be an argument node below the root")
    if node.status != "complete" or not node.active_generation_id:
        raise ValueError("Expansion target must be a completed argument node")
    if not debate_uses_v2_pipeline(db, debate.id):
        raise ValueError("Expansion is only supported on v2-pipeline debates")

    model = (model_id or "").strip()
    if not model:
        # Reuse the model that authored the parent (the regen precedent);
        # fall back to the debate's default v2 model.
        active_generation = db.get(Generation, node.active_generation_id)
        model = str(getattr(active_generation, "model_id", "") or "") or V2_CODEX_MODEL_ID

    # Next free argument-child slot: EVIDENCE siblings live at an offset
    # range (see app/evidence/extraction.py) and stale siblings keep their
    # old slots, so both are excluded from the allocation.
    siblings = db.scalars(select(Node).where(Node.parent_id == node.id)).all()
    position = (
        max(
            (
                sibling.position
                for sibling in siblings
                if sibling.node_type != "EVIDENCE" and sibling.status != "stale"
            ),
            default=-1,
        )
        + 1
    )
    # Placeholder label, replaced by the generated title at completion.
    # Non-empty because every serialized node flows through ArgumentClaim,
    # which requires non-empty text; descriptive of the REQUEST, never fake
    # generated content.
    placeholder_label = "Additional supporting argument" if polarity == "PRO" else "Additional challenging argument"
    child = Node(
        debate_id=debate.id,
        parent_id=node.id,
        node_type=polarity,
        depth=node.depth + 1,
        position=position,
        claim=placeholder_label,
        status="pending",
        materialized_path=f"{node.materialized_path}/{position}",
    )
    db.add(child)
    flush_write(db)
    # An in-flight synthesis would race the persist-time quiescence guard and
    # die a nonretryable death there (failing the debate). Supersede it
    # instead -- the regen precedent -- and the expand completion tail queues
    # a fresh v2_synthesize once the tree is quiescent again.
    cancel_active_synthesis_jobs(db, debate.id, "Expansion superseded synthesis")
    job = queue_v2_job(db, debate, "v2_expand", "v2_expander", model, child.id)
    payload: dict[str, Any] = {
        "parent_node_id": node.id,
        "polarity": polarity,
        "lens_label": branch_lens_label(db, node),
        "reason": reason,
    }
    if decision_record_id:
        # W4 idempotency linkage: the audited lifecycle decision that spawned
        # this job travels in the payload, committed atomically with the job,
        # so a dispatch replay can never double-spawn for the same decision.
        payload["decision_record_id"] = decision_record_id
    job.payload = payload
    commit_write(db)
    return job


def analyzer_output(question: str, analyzer_type: str, classification: dict[str, Any]) -> dict[str, Any]:
    tags = ", ".join(classification["domain_tags"][:5]) or "general"
    if analyzer_type == "Statistical Analyzer":
        finding = f"Quantitative claims about '{question}' require baseline, affected population, and time-horizon evidence."
    elif analyzer_type == "Scientific Analyzer":
        finding = f"Empirical evaluation of '{question}' depends on causal evidence, external validity, and uncertainty."
    else:
        finding = f"Behavioral responses to '{question}' may include adaptation, reactance, equity concerns, and compliance effects."
    return {
        "analyzer": analyzer_type,
        "question": question,
        "classification": classification["question_type"],
        "domain_tags": tags,
        "findings": [finding],
        "structured": True,
    }


def run_analyzers(db: Session, debate: Debate, branch: DebateBranch, classification: dict[str, Any]) -> list[AnalyzerRun]:
    runs: list[AnalyzerRun] = []
    for analyzer_type in DEFAULT_ANALYZERS:
        publish_event(debate.id, "analyzer_started", {"debate_id": debate.id, "analyzer_type": analyzer_type})
        run = AnalyzerRun(
            debate_id=debate.id,
            branch_id=branch.id,
            analyzer_type=analyzer_type,
            output=analyzer_output(debate.topic, analyzer_type, classification),
            status="complete",
            provenance={"model_id": MODEL_ID, "worker_id": WORKER_LABEL, "prompt_id": f"analyzer-{analyzer_type}"},
        )
        # next_analyzer_run_seq assigns run.seq, db.add()s, and db.flush()es
        # as one lock-covered critical section (see app.models.entities) --
        # do not call db.add()/flush_write() separately for this row.
        next_analyzer_run_seq(db, run)
        runs.append(run)
        publish_event(debate.id, "analyzer_completed", {"debate_id": debate.id, "analyzer_run_id": run.id, "analyzer_type": analyzer_type})
    return runs


def validate_agent_output_contract(payload: dict[str, Any]) -> dict[str, Any]:
    pros = payload.get("pros")
    cons = payload.get("cons")
    provenance = payload.get("provenance")
    if not isinstance(pros, list) or len(pros) != 5 or any(not isinstance(item, str) or not item.strip() for item in pros):
        raise ValueError("Agent output must include exactly 5 non-empty pros")
    if not isinstance(cons, list) or len(cons) != 5 or any(not isinstance(item, str) or not item.strip() for item in cons):
        raise ValueError("Agent output must include exactly 5 non-empty cons")
    if not isinstance(provenance, dict) or not all(provenance.get(key) for key in ("model_id", "worker_id", "prompt_id", "job_id")):
        raise ValueError("Agent output must include model, worker, prompt, and job provenance")
    return payload


def require_title_content(payload: dict[str, Any], label: str) -> dict[str, str]:
    if not isinstance(payload, dict):
        raise ValueError(f"{label} must be a JSON object")
    title = sanitize_text(str(payload.get("title") or ""), 160)
    content = sanitize_text(str(payload.get("content") or ""), 4_000)
    if not title or not content:
        raise ValueError(f"{label} must include non-empty title and content")
    return {"title": title, "content": content}


def validate_pov_contract(payload: dict[str, Any]) -> dict[str, Any]:
    root = require_title_content(payload, "POV output")
    strongest_pro = require_title_content(payload.get("strongest_pro") if isinstance(payload.get("strongest_pro"), dict) else {}, "strongest_pro")
    strongest_con = require_title_content(payload.get("strongest_con") if isinstance(payload.get("strongest_con"), dict) else {}, "strongest_con")
    for stance_name, stance in (("strongest_pro", payload.get("strongest_pro")), ("strongest_con", payload.get("strongest_con"))):
        if not isinstance(stance, dict):
            raise ValueError(f"{stance_name} must be a JSON object")
        stance["pro"] = require_title_content(stance.get("pro") if isinstance(stance.get("pro"), dict) else {}, f"{stance_name}.pro")
        stance["con"] = require_title_content(stance.get("con") if isinstance(stance.get("con"), dict) else {}, f"{stance_name}.con")
    provenance = payload.get("provenance")
    if not isinstance(provenance, dict) or not all(provenance.get(key) for key in ("model_id", "worker_id", "prompt_id", "job_id")):
        raise ValueError("POV output must include model, worker, prompt, and job provenance")
    return {
        **root,
        "strongest_pro": {**strongest_pro, "pro": payload["strongest_pro"]["pro"], "con": payload["strongest_pro"]["con"]},
        "strongest_con": {**strongest_con, "pro": payload["strongest_con"]["pro"], "con": payload["strongest_con"]["con"]},
        "provenance": provenance,
    }


def validate_skill_definition_contract(payload: dict[str, Any]) -> dict[str, Any]:
    required = ("kind", "name", "version", "status", "description", "trigger", "workflow", "constraints", "output_contract", "quality", "provenance")
    if not isinstance(payload, dict) or any(key not in payload for key in required):
        raise ValueError("Skill creation output did not match the required JSON contract")
    if payload.get("kind") != "skill":
        raise ValueError("Skill creation output kind must be skill")
    provenance = payload.get("provenance")
    if not isinstance(provenance, dict) or not all(
        provenance.get(key) for key in ("created_by_model", "created_by_worker_id", "creation_prompt_id", "job_id")
    ):
        raise ValueError("Skill creation output must include model, worker, prompt, and job provenance")
    return payload


def validate_agent_definition_contract(payload: dict[str, Any]) -> dict[str, Any]:
    required = (
        "kind",
        "name",
        "version",
        "status",
        "description",
        "domain_tags",
        "role",
        "purpose",
        "instructions",
        "input_contract",
        "output_contract",
        "quality",
        "provenance",
    )
    if not isinstance(payload, dict) or any(key not in payload for key in required):
        raise ValueError("Agent creation output did not match the required JSON contract")
    if payload.get("kind") != "agent":
        raise ValueError("Agent creation output kind must be agent")
    provenance = payload.get("provenance")
    if not isinstance(provenance, dict) or not all(
        provenance.get(key) for key in ("created_by_model", "created_by_worker_id", "creation_prompt_id", "job_id")
    ):
        raise ValueError("Agent creation output must include model, worker, prompt, and job provenance")
    return payload


def validate_synthesis_contract(payload: dict[str, Any]) -> dict[str, Any]:
    if all(payload.get(key) for key in ("title", "content")):
        normalized = {
            "strongest_pro": sanitize_text(str(payload["title"]), 2_000),
            "strongest_con": "",
            "verdict": sanitize_text(str(payload["content"]), 4_000),
            "provenance": payload.get("provenance"),
            "tensions": payload.get("tensions") or [],
            "agreements": payload.get("agreements") or [],
            "evidence_gaps": payload.get("evidence_gaps") or [],
            "key_takeaways": payload.get("key_takeaways") or [],
        }
    elif isinstance(payload, dict) and all(payload.get(key) for key in ("strongest_pro", "strongest_con", "verdict")):
        normalized = payload
    else:
        raise ValueError("Synthesis output did not match the required JSON contract")
    forbidden = str(normalized.get("verdict") or "").lower()
    if "winner" in forbidden or " wins" in forbidden or " win " in forbidden:
        raise ValueError("Synthesis must not declare a winner")
    provenance = payload.get("provenance")
    if not isinstance(provenance, dict) or not all(provenance.get(key) for key in ("model_id", "worker_id", "prompt_id", "job_id")):
        raise ValueError("Synthesis output must include model, worker, prompt, and job provenance")
    return normalized


def generation_argument(title: str, content: str) -> str:
    return f"{title}\n\n{content}"


def ensure_default_scoring_for_completed_v2_node(db: Session, debate: Debate, node: Node) -> dict:
    return ensure_node_scoring_on_completion(db, debate, node, ProviderRegistry())


def create_completed_node(
    db: Session,
    debate: Debate,
    parent: Node,
    *,
    node_type: str,
    position: int,
    title: str,
    content: str,
    job: Job,
    provenance: dict[str, Any],
    prompt_rendered: str,
    node: Node | None = None,
) -> Node:
    # W3: when `node` is given (a pending placeholder created at queue time,
    # e.g. a v2_expand child), it is completed in place instead of creating a
    # new row -- same generation/provenance/status machinery either way, and
    # replays cannot mint a second sibling.
    if node is None:
        node = Node(
            debate_id=debate.id,
            parent_id=parent.id,
            node_type=node_type,
            depth=parent.depth + 1,
            position=position,
            claim=title,
            status="pending",
            materialized_path=f"{parent.materialized_path}/{position}",
        )
        db.add(node)
        flush_write(db)
    else:
        node.claim = title
    create_generation(
        db,
        job,
        node,
        generation_argument(title, content),
        prompt_rendered,
        {"latency_ms": 0},
    )
    generation = db.get(Generation, node.active_generation_id) if node.active_generation_id else None
    if generation:
        generation.worker_id = str(provenance.get("worker_id") or job.worker_id)
        generation.model_id = str(provenance.get("model_id") or job.required_model)
        generation.role = node_type if node_type in {"PRO", "CON"} else job.required_role
    node.status = "complete"
    return node


def extract_and_persist_evidence_for_completed_node(db: Session, debate: Debate, node: Node) -> None:
    """Best-effort EVIDENCE-node extraction over a completed claim node's
    active Generation prose (Phase 7 Task 1). Extraction/persistence is
    always-on (no feature flag) and unconditional per the phase's Global
    Constraints, but must NEVER fail node completion/generation persistence
    -- mirrors the protocol runner's best-effort try/except pattern used
    elsewhere in this file (see persist_v2_synthesis's protocol-analysis and
    marker-update guards above)."""
    try:
        if not node.active_generation_id:
            return
        generation = db.get(Generation, node.active_generation_id)
        if generation is None:
            return
        persist_evidence_nodes(db, debate, node, generation)
    except Exception as exc:
        print(f"[dialectical_v2] evidence extraction failed for node {node.id} (non-fatal): {exc!r}")


def materialize_pov_branch(db: Session, debate: Debate, job: Job, payload: dict[str, Any]) -> Node:
    if not job.node_id:
        raise ValueError("POV job must target a POV node")
    pov_node = db.get(Node, job.node_id)
    if not pov_node:
        raise ValueError("POV node not found")
    provenance = payload["provenance"]
    create_generation(
        db,
        job,
        pov_node,
        generation_argument(payload["title"], payload["content"]),
        job.stream_buffer or json.dumps(payload),
        {"latency_ms": 0},
    )
    generation = db.get(Generation, pov_node.active_generation_id) if pov_node.active_generation_id else None
    if generation:
        generation.worker_id = str(provenance.get("worker_id") or job.worker_id)
        generation.model_id = str(provenance.get("model_id") or job.required_model)
        generation.role = job.required_role
    # Never overwrite an existing non-empty label: the POV node's claim IS the
    # perspective's identity (dynamic lenses recycle legacy node_types), and
    # job.required_role may lag it (e.g. a legacy-labelled regen job). At
    # creation claim == required_role, so this is a no-op there.
    if not (pov_node.claim or "").strip():
        pov_node.claim = job.required_role
    pov_node.status = "complete"

    pro_node = create_completed_node(
        db,
        debate,
        pov_node,
        node_type="PRO",
        position=0,
        title=payload["strongest_pro"]["title"],
        content=payload["strongest_pro"]["content"],
        job=job,
        provenance=provenance,
        prompt_rendered=job.stream_buffer or json.dumps(payload["strongest_pro"]),
    )
    extract_and_persist_evidence_for_completed_node(db, debate, pro_node)
    con_node = create_completed_node(
        db,
        debate,
        pov_node,
        node_type="CON",
        position=1,
        title=payload["strongest_con"]["title"],
        content=payload["strongest_con"]["content"],
        job=job,
        provenance=provenance,
        prompt_rendered=job.stream_buffer or json.dumps(payload["strongest_con"]),
    )
    extract_and_persist_evidence_for_completed_node(db, debate, con_node)
    for parent, stance in ((pro_node, payload["strongest_pro"]), (con_node, payload["strongest_con"])):
        nested_pro = create_completed_node(
            db,
            debate,
            parent,
            node_type="PRO",
            position=0,
            title=stance["pro"]["title"],
            content=stance["pro"]["content"],
            job=job,
            provenance=provenance,
            prompt_rendered=job.stream_buffer or json.dumps(stance["pro"]),
        )
        extract_and_persist_evidence_for_completed_node(db, debate, nested_pro)
        nested_con = create_completed_node(
            db,
            debate,
            parent,
            node_type="CON",
            position=1,
            title=stance["con"]["title"],
            content=stance["con"]["content"],
            job=job,
            provenance=provenance,
            prompt_rendered=job.stream_buffer or json.dumps(stance["con"]),
        )
        extract_and_persist_evidence_for_completed_node(db, debate, nested_con)
    return pov_node


def materialize_expand_child(
    db: Session,
    debate: Debate,
    job: Job,
    payload: dict[str, str],
    provenance: dict[str, Any],
) -> Node:
    """Complete a v2_expand job's pending placeholder child in place.

    The job targets the PLACEHOLDER (created by queue_v2_expand_job), never
    the parent: the parent's claim/label/content are never touched (the
    corruption class W0 closed). Reuses the same completed-node machinery the
    POV materializer uses (create_completed_node with the existing node
    passed in), so a replayed completion cannot mint a second child even
    before the job state machine rejects it.
    """
    if not job.node_id:
        raise ValueError("Expand job must target its pending child node")
    child = db.get(Node, job.node_id)
    if not child:
        raise ValueError("Expand child node not found")
    parent = db.get(Node, child.parent_id) if child.parent_id else None
    if not parent:
        raise ValueError("Expand parent node not found")
    create_completed_node(
        db,
        debate,
        parent,
        node_type=child.node_type,
        position=child.position,
        title=payload["title"],
        content=payload["content"],
        job=job,
        provenance=provenance,
        prompt_rendered=job.stream_buffer or json.dumps(payload),
        node=child,
    )
    extract_and_persist_evidence_for_completed_node(db, debate, child)
    return child


def pending_branch_containers(db: Session, debate_id: str, root_node_id: str) -> list[Node]:
    # A terminally failed branch (W1: node.status == "failed",
    # stopping_reason "generation_exhausted") is no longer pending: it must
    # stop blocking synthesis so the surviving branches can complete the
    # debate. Synthesis stays count-agnostic over whatever branches remain.
    return list(
        db.scalars(
            select(Node).where(
                Node.debate_id == debate_id,
                Node.parent_id == root_node_id,
                Node.node_type != "EVIDENCE",
                Node.status.notin_(["complete", "failed"]),
            )
        ).all()
    )


def pending_generation_nodes(db: Session, debate_id: str, root_node_id: str) -> list[Node]:
    """Whole-tree quiescence check for v2 synthesis (W3).

    A debate may synthesize only when it is quiescent: no branch container is
    still pending AND no node anywhere in the tree has an outstanding
    generation job (v2_pov or v2_expand in pending/claimed/running). W1
    semantics preserved: terminally failed nodes/jobs are NOT pending, so a
    poisoned expand child never blocks synthesis forever. Count-agnostic over
    however many lenses/expansions exist.
    """
    pending: dict[str, Node] = {
        node.id: node for node in pending_branch_containers(db, debate_id, root_node_id)
    }
    outstanding_node_ids = db.scalars(
        select(Job.node_id).where(
            Job.debate_id == debate_id,
            Job.job_type.in_(V2_GENERATION_JOB_TYPES),
            Job.status.in_(OUTSTANDING_JOB_STATUSES),
            Job.node_id.is_not(None),
        )
    ).all()
    for node_id in outstanding_node_ids:
        if node_id and node_id not in pending:
            node = db.get(Node, node_id)
            if node is not None:
                pending[node_id] = node
    return list(pending.values())


def has_completed_branch_container(db: Session, debate_id: str, root_node_id: str) -> bool:
    """True when at least one non-EVIDENCE branch under the root completed."""
    return (
        db.scalar(
            select(Node.id)
            .where(
                Node.debate_id == debate_id,
                Node.parent_id == root_node_id,
                Node.node_type != "EVIDENCE",
                Node.status == "complete",
            )
            .limit(1)
        )
        is not None
    )


def persist_v2_synthesis(
    db: Session,
    debate: Debate,
    branch: DebateBranch,
    job: Job,
    worker: Worker | None,
    payload: dict[str, Any],
) -> None:
    agent_outputs = db.scalars(select(AgentRun).where(AgentRun.debate_id == debate.id).order_by(AgentRun.created_at.asc())).all()
    # W3: whole-tree quiescence re-check -- outstanding v2_pov/v2_expand jobs
    # anywhere in the tree block synthesis, not just pending branch containers.
    if pending_generation_nodes(db, debate.id, debate.root_node_id):
        raise ValueError("Cannot synthesize until all branches and expansions are complete")
    findings = {run.analyzer_type: (run.output.get("findings") or [""])[0] for run in analyzer_runs_for_debate(db, debate.id)}
    synthesis = Synthesis(
        debate_id=debate.id,
        strongest_pro=sanitize_text(str(payload["strongest_pro"])),
        strongest_con=sanitize_text(str(payload["strongest_con"])),
        verdict=sanitize_text(str(payload["verdict"])),
        upstream_agent_output_ids=[output.id for output in agent_outputs],
        analyzer_findings=findings,
        provenance={
            **payload["provenance"],
            "tensions": payload.get("tensions") or [],
            "agreements": payload.get("agreements") or [],
            "evidence_gaps": payload.get("evidence_gaps") or [],
            "key_takeaways": payload.get("key_takeaways") or [],
            "contribution_summary": payload.get("contribution_summary") or [],
        },
        model_id=str(payload["provenance"].get("model_id") or job.required_model),
        worker_id=str(payload["provenance"].get("worker_id") or (worker.id if worker else job.worker_id)),
    )
    db.add(synthesis)
    flush_write(db)
    debate.synthesis_id = synthesis.id
    debate.status = "complete"
    debate.completed_at = now_utc()
    try:
        state = protocol_state_of(debate.config)
        if state is not None:
            state = advance_phase(state, "5.3_generation", "complete")
            state = advance_phase(state, "5.8_synthesis", "complete")
            debate.config = {**debate.config, "protocol_state": state}
    except Exception as exc:
        # Best-effort: marker update must never fail synthesis persistence.
        print(f"[dialectical_v2] protocol_state advance failed (non-fatal): {exc!r}")
    try:
        run_protocol_analysis(db, debate)
    except Exception as exc:
        # Best-effort: protocol analysis must never fail synthesis persistence.
        # run_protocol_analysis is already internally best-effort/non-raising;
        # this outer try/except is defense-in-depth, kept symmetric with the
        # marker-update try/except above (Phase 5a style).
        print(f"[dialectical_v2] protocol analysis failed (non-fatal): {exc!r}")
    record_provenance(db, debate.id, branch.id, "synthesis", synthesis.id, payload["provenance"])
    scoring_node = db.get(Node, debate.root_node_id) if debate.root_node_id else None
    if scoring_node is not None:
        ensure_default_scoring_for_completed_v2_node(db, debate, scoring_node)
    if adaptive_expansion_enabled():
        try:
            # W4: every completed adaptive debate carries a non-empty
            # stopped_because. When no dispatch pass recorded one yet (e.g.
            # the debate's first completion, before any post-completion
            # scoring/dispatch ran), the honest state is a quiescent tree
            # with no decisions demanding growth. Never overwrites a reason
            # a dispatch pass or failure path already recorded.
            record_adaptive_stop(db, debate, STOPPED_QUIESCENT_NO_DECISIONS, overwrite=False)
        except Exception as exc:
            print(f"[dialectical_v2] adaptive stopped_because backstop failed (non-fatal): {exc!r}")
    commit_write(db)
    publish_event(debate.id, "synthesis_completed", {"debate_id": debate.id, "synthesis_id": synthesis.id, "job_id": job.id})
    publish_event(debate.id, "debate_complete", {"debate_id": debate.id})
    try:
        # W2 (B6): the coordinator itself initiates scoring at completion --
        # no browser poll needed. Fire-and-forget after the commit above;
        # must never fail or delay synthesis persistence (the trigger is
        # non-raising; this guard is defense-in-depth, matching the
        # best-effort style of the protocol-analysis guard above).
        trigger_internal_scoring_after_completion(debate.id)
    except Exception as exc:
        print(f"[dialectical_v2] internal scoring trigger failed (non-fatal): {exc!r}")


def record_provenance(
    db: Session,
    debate_id: str,
    branch_id: str,
    artifact_kind: str,
    artifact_id: str,
    provenance: dict[str, Any],
) -> None:
    db.add(
        ProvenanceRecord(
            debate_id=debate_id,
            branch_id=branch_id,
            artifact_kind=artifact_kind,
            artifact_id=artifact_id,
            model_id=str(provenance.get("model_id") or provenance.get("created_by_model") or ""),
            worker_id=str(provenance.get("worker_id") or provenance.get("created_by_worker_id") or ""),
            prompt_id=str(provenance.get("prompt_id") or provenance.get("creation_prompt_id") or ""),
            job_id=provenance.get("job_id"),
            metadata_json=provenance,
        )
    )


def analyzer_runs_for_debate(db: Session, debate_id: str) -> list[AnalyzerRun]:
    return list(db.scalars(select(AnalyzerRun).where(AnalyzerRun.debate_id == debate_id).order_by(AnalyzerRun.created_at.asc())).all())


def render_v2_job_prompt(db: Session, job: Job) -> tuple[str, str]:
    debate = db.get(Debate, job.debate_id)
    if not debate:
        raise ValueError("Debate not found")
    branch = first_branch(db, debate.id)
    classification = classify_question(debate.topic)
    analyzers = [run.output for run in analyzer_runs_for_debate(db, debate.id)]
    skill = first_skill_match(db, debate.id)
    agent = first_agent_match(db, debate.id)
    base_context = {
        "debate_id": debate.id,
        "branch_id": branch.id,
        "question": debate.topic,
        "classification": classification,
        "analyzer_outputs": analyzers,
        "job_id": job.id,
        "worker_id": job.worker_id,
        "required_model": job.required_model,
    }
    agent_run = db.scalar(select(AgentRun).where(AgentRun.job_id == job.id)) if job.job_type == "v2_agent_run" else None
    system = (
        "You are a Codex-backed Dialectical Engine V2 artifact worker. "
        "Do not edit files, run commands, report readiness, or return status wrappers. "
        "Return exactly one strict JSON object in the requested shape."
    )
    if job.job_type == "v2_plan":
        user = (
            f"{prompt_text('planner.v1.md')}\n\n"
            f"Context JSON:\n{json.dumps(base_context, default=str)}"
        )
    elif job.job_type == "v2_pov":
        if not job.node_id:
            raise ValueError("POV job must target a POV node")
        pov_node = db.get(Node, job.node_id)
        pov_label = pov_node.claim if pov_node else job.required_role
        # Legacy POV labels resolve from POV_LENS_DESCRIPTIONS (byte-identical
        # render); dynamic-perspective labels fall back to the dynamic lens map.
        lens_description = POV_LENS_DESCRIPTIONS.get(pov_label) or DYNAMIC_LENS_DESCRIPTIONS.get(pov_label, "")
        pov_context = {
            **base_context,
            "pov": pov_label,
            "lens_description": lens_description,
            "output_contract": {
                "title": "short title for the POV assessment",
                "content": "concise content with only the most relevant data/reasoning",
                "strongest_pro": {
                    "title": "short title",
                    "content": "concise content",
                    "pro": {"title": "short title", "content": "concise support for the strongest Pro"},
                    "con": {"title": "short title", "content": "concise challenge to the strongest Pro"},
                },
                "strongest_con": {
                    "title": "short title",
                    "content": "concise content",
                    "pro": {"title": "short title", "content": "concise support for the strongest Con"},
                    "con": {"title": "short title", "content": "concise challenge to the strongest Con"},
                },
            },
        }
        system = (
            "You are a Codex-backed Dialectical Engine V2 POV worker. "
            "Return exactly one strict JSON object. Do not include markdown or status wrappers."
        )
        user = (
            f"Generate the {pov_label} branch for the debate question. "
            f"Lens instructions: {lens_description} "
            "Use real reasoning from this model call only; do not use placeholders or canned examples. "
            "Create one strongest Pro and one strongest Con, and for each create one nested Pro and one nested Con. "
            "Every generated card must have a short title and concise content.\n\n"
            f"Context JSON:\n{json.dumps(pov_context, default=str)}"
        )
    elif job.job_type == "v2_expand":
        if not job.node_id:
            raise ValueError("Expand job must target its pending child node")
        child = db.get(Node, job.node_id)
        if not child:
            raise ValueError("Expand child node not found")
        parent = db.get(Node, child.parent_id) if child.parent_id else None
        if not parent:
            raise ValueError("Expand parent node not found")
        expand_payload = job.payload if isinstance(job.payload, dict) else {}
        parent_generation = db.get(Generation, parent.active_generation_id) if parent.active_generation_id else None
        lens_label = str(expand_payload.get("lens_label") or "").strip() or branch_lens_label(db, parent)
        lens_description = POV_LENS_DESCRIPTIONS.get(lens_label) or DYNAMIC_LENS_DESCRIPTIONS.get(lens_label, "")
        polarity = child.node_type
        stance = "supports" if polarity == "PRO" else "challenges"
        expand_context = {
            **base_context,
            "parent_argument": {
                "title": parent.claim,
                "content": parent_generation.argument if parent_generation else "",
            },
            "lens": lens_label,
            "lens_description": lens_description,
            "polarity": polarity,
            "expansion_reason": str(expand_payload.get("reason") or ""),
            "output_contract": {
                "title": "short title for the new argument",
                "content": "concise argument content",
            },
        }
        system = (
            "You are a Codex-backed Dialectical Engine V2 expansion worker. "
            "Return exactly one strict JSON object. Do not include markdown or status wrappers."
        )
        user = (
            f"Generate exactly one new {polarity} argument that {stance} the parent argument below, "
            f"reasoned through the {lens_label} lens. "
            f"Lens instructions: {lens_description} "
            f"This expansion was requested because: {expand_context['expansion_reason']} "
            "Use real reasoning from this model call only; do not use placeholders or canned examples. "
            "Return one JSON object with a short title and concise content.\n\n"
            f"Context JSON:\n{json.dumps(expand_context, default=str)}"
        )
    elif job.job_type == "v2_agent_run":
        if not agent_run:
            raise ValueError("AgentRun not found for v2_agent_run job")
        agent_definition = db.get(AgentDefinition, agent_run.agent_definition_id)
        skill_definitions = [
            db.get(SkillDefinition, skill_id)
            for skill_id in (agent_run.selected_skill_ids or [])
        ]
        run_context = {
            **base_context,
            "agent_run_id": agent_run.id,
            "agent_definition": agent_definition.definition if agent_definition else {},
            "selected_skills": [skill.definition for skill in skill_definitions if skill],
            "prompt_input": agent_run.prompt_input or {},
        }
        user = (
            f"{prompt_text('agent_run.v1.md')}\n\n"
            f"Context JSON:\n{json.dumps(run_context, default=str)}"
        )
    elif job.job_type == "v2_skill_create":
        user = (
            "Return a complete reusable Skill JSON object. Use this JSON object structure and fill in all fields:\n"
            '{"kind":"skill","name":"...","version":1,"status":"provisional","description":"...",'
            '"trigger":{"question_types":["policy"],"domain_tags":["..."],"activation_rules":["..."]},'
            '"workflow":{"context_to_inspect":["question","classification","statistical_analyzer_output","scientific_analyzer_output","psychological_analyzer_output"],'
            '"steps":["Identify required perspectives","Search for matching Agents","Create missing Agents","Invoke Agents","Enforce 5 pros and 5 cons per Agent","Compare tensions","Return structured debate contribution"]},'
            '"constraints":{"must_use_default_analyzers":true,"must_preserve_provenance":true,"must_require_exactly_5_pros_5_cons":true},'
            '"output_contract":{"format":"structured_json","sections":["selected_agents","agent_outputs","skill_findings"]},'
            '"quality":{"created_by":"system","creation_reason":"No suitable skill found.","reuse_count":0,"quality_score":null},'
            '"provenance":{"created_in_debate_id":"...","created_by_model":"...","created_by_worker_id":"...","creation_prompt_id":"...","job_id":"..."}}\n'
            "Do not return {\"status\":\"ready\"}. Do not omit any top-level key. "
            f"Context:\n{base_context}"
        )
    elif job.job_type == "v2_agent_create":
        user = (
            "Return a complete reusable Agent JSON object for the selected Skill. Use this JSON object structure and fill in all fields:\n"
            '{"kind":"agent","name":"...","version":1,"status":"provisional","description":"...",'
            '"domain_tags":["..."],"role":"Debate participant","purpose":"...",'
            '"instructions":{"operating_principles":["..."],"reasoning_style":"...","boundaries":["..."],"allowed_tools":["default_analyzers"],"allowed_skills":["..."]},'
            '"input_contract":{"required":["question","analyzer_outputs"],"optional":["prior_branch_outputs","skill_context"]},'
            '"output_contract":{"pros_count":5,"cons_count":5,"requires_summary":true,"requires_confidence":true},'
            '"quality":{"created_by":"system","creation_reason":"No suitable existing agent found.","reuse_count":0,"last_used_at":null,"quality_score":null},'
            '"provenance":{"created_in_debate_id":"...","created_by_model":"...","created_by_worker_id":"...","creation_prompt_id":"...","job_id":"..."}}\n'
            "Do not return {\"status\":\"ready\"}. Do not omit any top-level key. "
            f"Selected skill:\n{getattr(skill, 'definition', {})}\nContext:\n{base_context}"
        )
    elif job.job_type == "v2_agent_argument":
        user = (
            "Return an Agent output JSON object with exactly this shape: "
            '{"pros":["...","...","...","...","..."],"cons":["...","...","...","...","..."],'
            '"summary":"...","confidence":0.0,'
            '"provenance":{"model_id":"...","worker_id":"...","prompt_id":"...","job_id":"..."}}. '
            "There must be exactly five non-empty pros and exactly five non-empty cons. Do not return status wrappers. "
            f"Selected skill:\n{getattr(skill, 'definition', {})}\nSelected agent:\n{getattr(agent, 'definition', {})}\nContext:\n{base_context}"
        )
    elif job.job_type == "v2_synthesize":
        completed_runs = [
            {
                "id": run.id,
                "agent_definition_id": run.agent_definition_id,
                "selected_skill_ids": run.selected_skill_ids or [],
                "lens": run.lens,
                "role": run.role,
                "output": run.output or {},
                "summary": run.summary,
                "pros": run.pros or [],
                "cons": run.cons or [],
                "provenance": run.provenance or {},
            }
            for run in db.scalars(
                select(AgentRun).where(AgentRun.debate_id == debate.id, AgentRun.status == "complete").order_by(AgentRun.created_at.asc())
            ).all()
        ]
        tree_nodes = [
            {
                "id": node.id,
                "parent_id": node.parent_id,
                "node_type": node.node_type,
                "claim": node.claim,
                "depth": node.depth,
                "position": node.position,
                "status": node.status,
                "active_generation": {
                    "model_id": generation.model_id,
                    "role": generation.role,
                    "argument": generation.argument,
                }
                if node.active_generation_id and (generation := db.get(Generation, node.active_generation_id))
                else None,
            }
            for node in db.scalars(select(Node).where(Node.debate_id == debate.id).order_by(Node.materialized_path.asc())).all()
        ]
        # W4 (flag-gated; flag-off renders stay byte-identical even when a
        # stale adaptive_expansion config key exists): a completed adaptive
        # debate's synthesis gets the recorded stopping context.
        adaptive_context = ""
        if adaptive_expansion_enabled():
            stopped_because = stopped_because_of(debate)
            if stopped_because:
                adaptive_context = (
                    "Adaptive expansion context: automatic tree growth for this debate "
                    f"stopped (reason: {stopped_because}). "
                    "Treat the argument tree as final under that stopping condition.\n"
                )
        user = (
            "Return a non-adjudicating synthesis JSON with exactly this shape: "
            '{"title":"Synthesis","content":"...","tensions":["..."],"agreements":["..."],'
            '"evidence_gaps":["..."],"key_takeaways":["..."],'
            '"provenance":{"model_id":"...","worker_id":"...","prompt_id":"...","job_id":"..."}}. '
            "Summarize tensions, agreements, evidence gaps, and key takeaways. "
            "Do not declare a winner and do not say Pro wins or Con wins. Do not return status wrappers.\n"
            f"{adaptive_context}"
            f"Context JSON:\n{json.dumps({**base_context, 'agent_runs': completed_runs, 'tree_nodes': tree_nodes}, default=str)}"
        )
    else:
        raise ValueError(f"Unsupported V2 job type {job.job_type}")
    return system, user


async def complete_v2_worker_job(db: Session, job: Job, result: Any, metadata: dict[str, Any]) -> None:
    debate = db.get(Debate, job.debate_id)
    if not debate:
        raise ValueError("Debate not found")
    branch = first_branch(db, debate.id)
    classification = classify_question(debate.topic)
    worker = db.get(Worker, job.worker_id) if job.worker_id else None
    model_id = job.required_model

    if job.job_type == "v2_plan":
        payload = validate_planner_contract(result if isinstance(result, dict) else {})
        provenance = {
            **(result.get("provenance") if isinstance(result, dict) and isinstance(result.get("provenance"), dict) else {}),
            "model_id": model_id,
            "worker_id": worker.id if worker else str(job.worker_id or ""),
            "prompt_id": f"prompt-{job.id}",
            "job_id": job.id,
        }
        skills_by_name, agents = resolve_planned_definitions(db, debate, branch, payload, provenance)
        planned_agents = payload["agents"]
        for planned_agent, agent in zip(planned_agents, agents, strict=True):
            selected_skills = [
                skills_by_name[name.lower()]
                for name in planned_agent["skill_names"]
                if name.lower() in skills_by_name
            ]
            if not selected_skills:
                selected_skills = list(skills_by_name.values())
            agent_run = AgentRun(
                debate_id=debate.id,
                branch_id=branch.id,
                skill_id=selected_skills[0].id,
                agent_id=agent.id,
                agent_definition_id=agent.id,
                selected_skill_ids=[skill.id for skill in selected_skills],
                role=planned_agent["name"],
                lens=planned_agent["lens"],
                prompt_input={"topic": debate.topic, "planner_agent": planned_agent},
                output={},
                status="pending",
                analyzer_run_ids=[run.id for run in analyzer_runs_for_debate(db, debate.id)],
                provenance={"planned_by_job_id": job.id},
            )
            db.add(agent_run)
            flush_write(db)
            run_job = queue_v2_job(db, debate, "v2_agent_run", "v2_agent", model_id, debate.root_node_id)
            agent_run.job_id = run_job.id
            flush_write(db)
            publish_event(debate.id, "agent_run_created", {"debate_id": debate.id, "agent_run_id": agent_run.id, "job_id": run_job.id})
        commit_write(db)
        return

    if job.job_type == "v2_pov":
        payload = validate_pov_contract(result if isinstance(result, dict) else {})
        pov_node = materialize_pov_branch(db, debate, job, payload)
        record_provenance(db, debate.id, branch.id, "pov_branch", pov_node.id, payload["provenance"])
        publish_event(
            debate.id,
            "pov_completed",
            {"debate_id": debate.id, "node_id": pov_node.id, "job_id": job.id, "role": job.required_role},
        )
        pending_branches = pending_generation_nodes(db, debate.id, debate.root_node_id)
        existing_synthesis = db.scalar(
            select(Job).where(
                Job.debate_id == debate.id,
                Job.job_type == "v2_synthesize",
                Job.status.in_(["pending", "claimed", "running"]),
            )
        )
        if not pending_branches and existing_synthesis is None:
            queue_v2_job(db, debate, "v2_synthesize", "v2_synthesizer", model_id, None)
        commit_write(db)
        return

    if job.job_type == "v2_expand":
        # Deliberately minimal output contract: one {title, content} object.
        payload = require_title_content(result if isinstance(result, dict) else {}, "Expansion output")
        provenance = (
            result.get("provenance")
            if isinstance(result, dict) and isinstance(result.get("provenance"), dict)
            else {}
        )
        child = materialize_expand_child(db, debate, job, payload, provenance)
        record_provenance(db, debate.id, branch.id, "expand_node", child.id, provenance)
        publish_event(
            debate.id,
            "expand_completed",
            {"debate_id": debate.id, "node_id": child.id, "parent_node_id": child.parent_id, "job_id": job.id},
        )
        # Existing web vocabulary for "a node's generation completed" -- the
        # tree refreshes live without any new client wiring.
        publish_event(debate.id, "node_complete", {"node_id": child.id, "generation_id": child.active_generation_id})
        pending_nodes = pending_generation_nodes(db, debate.id, debate.root_node_id)
        existing_synthesis = db.scalar(
            select(Job).where(
                Job.debate_id == debate.id,
                Job.job_type == "v2_synthesize",
                Job.status.in_(["pending", "claimed", "running"]),
            )
        )
        if not pending_nodes and existing_synthesis is None:
            queue_v2_job(db, debate, "v2_synthesize", "v2_synthesizer", model_id, None)
        commit_write(db)
        # W4 adaptive loop: a completed expansion wakes a debate-scoped
        # re-score (judge scores -> protocol re-run -> lifecycle
        # reevaluation -> possibly another dispatch round), only once the
        # tree is quiescent again and only with the flag on. Strictly
        # best-effort: any failure here leaves the flag-off behavior
        # (synthesis queued above) untouched, so the loop can never wedge
        # the debate.
        if not pending_nodes and adaptive_expansion_enabled():
            try:
                if maybe_queue_rescore_after_expansion(db, debate) is not None:
                    trigger_internal_scoring_after_completion(debate.id)
            except Exception as exc:
                print(f"[dialectical_v2] adaptive re-score trigger failed (non-fatal): {exc!r}")
        return

    if job.job_type == "v2_agent_run":
        agent_run = db.scalar(select(AgentRun).where(AgentRun.job_id == job.id))
        if not agent_run:
            raise ValueError("AgentRun must exist before v2_agent_run completion")
        payload = validate_agent_output_contract(result if isinstance(result, dict) else {})
        agent_run.output = payload
        agent_run.status = "complete"
        agent_run.worker_id = worker.id if worker else job.worker_id
        agent_run.model_id = str(payload.get("provenance", {}).get("model_id") or job.required_model)
        agent_run.pros = payload["pros"]
        agent_run.cons = payload["cons"]
        agent_run.summary = sanitize_text(str(payload.get("summary") or payload.get("contribution_summary") or ""))
        agent_run.confidence = int(float(payload.get("confidence") or 0) * 100) if float(payload.get("confidence") or 0) <= 1 else int(payload.get("confidence") or 0)
        agent_run.provenance = payload["provenance"]
        flush_write(db)
        record_provenance(db, debate.id, branch.id, "agent_run", agent_run.id, payload["provenance"])
        publish_event(debate.id, "agent_output_completed", {"debate_id": debate.id, "agent_output_id": agent_run.id, "agent_run_id": agent_run.id, "job_id": job.id})
        incomplete = db.scalar(
            select(AgentRun).where(AgentRun.debate_id == debate.id, AgentRun.status != "complete").limit(1)
        )
        existing_synthesis = db.scalar(
            select(Job).where(
                Job.debate_id == debate.id,
                Job.job_type == "v2_synthesize",
                Job.status.in_(["pending", "claimed", "running"]),
            )
        )
        if incomplete is None and existing_synthesis is None:
            queue_v2_job(db, debate, "v2_synthesize", "v2_synthesizer", model_id, None)
        commit_write(db)
        return

    if job.job_type == "v2_synthesize":
        payload = validate_synthesis_contract(result if isinstance(result, dict) else {})
        persist_v2_synthesis(db, debate, branch, job, worker, payload)
        return

    if job.job_type == "v2_skill_create":
        payload = validate_skill_definition_contract(result if isinstance(result, dict) else {})
        skill = SkillCapability(definition=payload, status=str(payload.get("status") or "provisional"))
        db.add(skill)
        flush_write(db)
        db.add(
            CapabilityMatch(
                debate_id=debate.id,
                branch_id=branch.id,
                capability_kind="skill",
                capability_id=skill.id,
                selection_reason="created",
                score=0,
            )
        )
        record_provenance(db, debate.id, branch.id, "skill", skill.id, payload["provenance"])
        publish_event(debate.id, "skill_created", {"debate_id": debate.id, "skill_id": skill.id, "job_id": job.id})
        queue_next_capability_job(db, debate, branch, skill, classification, model_id)
        commit_write(db)
        return

    skill = first_skill_match(db, debate.id)
    if not skill:
        raise ValueError("V2 Skill must exist before this job can complete")

    if job.job_type == "v2_agent_create":
        payload = validate_agent_definition_contract(result if isinstance(result, dict) else {})
        agent = AgentCapability(definition=payload, status=str(payload.get("status") or "provisional"))
        db.add(agent)
        flush_write(db)
        db.add(
            CapabilityMatch(
                debate_id=debate.id,
                branch_id=branch.id,
                capability_kind="agent",
                capability_id=agent.id,
                selection_reason="created",
                score=0,
            )
        )
        record_provenance(db, debate.id, branch.id, "agent", agent.id, payload["provenance"])
        publish_event(debate.id, "agent_created", {"debate_id": debate.id, "agent_id": agent.id, "skill_id": skill.id, "job_id": job.id})
        queue_v2_job(db, debate, "v2_agent_argument", "v2_agent", model_id, debate.root_node_id)
        commit_write(db)
        return

    agent = first_agent_match(db, debate.id)
    if not agent:
        raise ValueError("V2 Agent must exist before this job can complete")

    if job.job_type == "v2_agent_argument":
        payload = validate_agent_output_contract(result if isinstance(result, dict) else {})
        agent_output = AgentOutput(
            debate_id=debate.id,
            branch_id=branch.id,
            skill_id=skill.id,
            agent_id=agent.id,
            analyzer_run_ids=[run.id for run in analyzer_runs_for_debate(db, debate.id)],
            pros=payload["pros"],
            cons=payload["cons"],
            summary=sanitize_text(str(payload.get("summary") or "")),
            confidence=int(float(payload.get("confidence") or 0) * 100) if float(payload.get("confidence") or 0) <= 1 else int(payload.get("confidence") or 0),
            provenance=payload["provenance"],
        )
        db.add(agent_output)
        flush_write(db)
        record_provenance(db, debate.id, branch.id, "agent_output", agent_output.id, payload["provenance"])
        publish_event(debate.id, "agent_output_completed", {"debate_id": debate.id, "agent_output_id": agent_output.id, "job_id": job.id})
        queue_v2_job(db, debate, "v2_synthesize", "v2_synthesizer", model_id, None)
        commit_write(db)
        return

    raise ValueError(f"Unsupported V2 job type {job.job_type}")


def create_dialectical_debate(db: Session, topic: str, config: dict[str, Any] | None = None) -> Debate:
    topic = sanitize_text(topic, 2_000)
    if not topic:
        raise ValueError("Topic is required")
    debate_config = merged_debate_config(config)
    try:
        debate_config["protocol_state"] = initialize_protocol_state(topic, debate_config)
    except Exception as exc:
        # Best-effort: protocol state is scaffolding, not load-bearing for the
        # debate itself. A triage/state bug must never block debate creation.
        print(f"[dialectical_v2] protocol_state init failed (non-fatal): {exc!r}")
    model_id = require_v2_codex_model(db)
    debate = Debate(topic=topic, status="generating", config=debate_config)
    db.add(debate)
    flush_write(db)
    root = Node(
        debate_id=debate.id,
        parent_id=None,
        node_type="ROOT_CLAIM",
        depth=0,
        position=0,
        claim=topic,
        status="complete",
        materialized_path="/0",
    )
    db.add(root)
    flush_write(db)
    debate.root_node_id = root.id
    branch = DebateBranch(debate_id=debate.id, parent_branch_id=None, root_node_id=root.id, status="active")
    db.add(branch)
    flush_write(db)

    # Dynamic perspectives (DEFAULT ON): derive a claim-type-appropriate lens
    # set instead of the fixed quartet. When the flag is off, `perspectives` is
    # exactly POV_BRANCHES, so the loop below is byte-identical to the legacy
    # path. Only the (node_type, label) source list changes; the per-perspective
    # Node + v2_pov job mechanics are shared.
    if bool_env("DIALECTICAL_DYNAMIC_PERSPECTIVES", True):
        perspectives = [(node_type, label) for node_type, label, _lens in dynamic_perspectives(topic)]
    else:
        perspectives = list(POV_BRANCHES)

    for position, (node_type, label) in enumerate(perspectives):
        pov_node = Node(
            debate_id=debate.id,
            parent_id=root.id,
            node_type=node_type,
            depth=1,
            position=position,
            claim=label,
            status="pending",
            materialized_path=f"{root.materialized_path}/{position}",
        )
        db.add(pov_node)
        flush_write(db)
        queue_v2_job(db, debate, "v2_pov", label, model_id, pov_node.id)

    try:
        state = protocol_state_of(debate.config)
        if state is not None:
            state = advance_phase(state, "5.2_decomposition", "complete")
            state = advance_phase(state, "5.3_generation", "in_progress")
            debate.config = {**debate.config, "protocol_state": state}
    except Exception as exc:
        # Best-effort: marker update must never fail debate creation.
        print(f"[dialectical_v2] protocol_state advance failed (non-fatal): {exc!r}")

    commit_write(db)
    db.refresh(debate)
    return debate
