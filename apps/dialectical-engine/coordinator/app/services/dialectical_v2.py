from __future__ import annotations

import asyncio
import json
import logging
import os
from collections import Counter
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

from sqlalchemy import func, select
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
from app.core.config import bool_env, int_env, load_settings
from app.evidence.citations import evidence_url_is_safe, trigger_citation_resolution
from app.evidence.extraction import persist_evidence_nodes, persist_retrieval_evidence_nodes
from app.exploration.expansion_dispatch import (
    STOPPED_QUIESCENT_NO_DECISIONS,
    adaptive_expansion_enabled,
    maybe_queue_rescore_after_expansion,
    record_adaptive_stop,
    stopped_because_of,
)
from app.scoring.judge_panel import panel_model_ids
from app.scoring.lineage import lineage_family
from app.scoring.normalizer import classify_claim_type
from app.services.events import event_bus
from app.services.orchestrator import (
    _is_cross_exam_expand_job,
    cancel_active_synthesis_jobs,
    capable_online_workers,
    create_generation,
    create_job,
    debate_uses_v2_pipeline,
    extract_jsonish,
    merged_debate_config,
    online_capabilities,
    routing_allowed_models,
    sanitize_text,
    worker_capability_set,
)
from app.protocol.cross_exam import _OPPOSING_NODE_TYPES
from app.protocol.runner import PROTOCOL_ANALYSIS_TYPE, run_protocol_analysis
from app.protocol.state import advance_phase, initialize_protocol_state, protocol_state_of
from app.providers import ProviderRegistry
from app.scoring.jobs import trigger_internal_scoring_after_completion
from app.scoring.service import debate_scoring_payload, ensure_node_scoring_on_completion


DEFAULT_ANALYZERS = ("Statistical Analyzer", "Scientific Analyzer", "Psychological Analyzer")
MODEL_ID = "coordinator-deterministic-v2"
WORKER_LABEL = "coordinator"
V2_CODEX_MODEL_ID = "gpt-5.6sol-medium"
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

# Generalist anchors composed into every classified lens set: a type-specific
# family EXTENDS the generalist coverage instead of replacing it, so a causal
# debate still gets ethical/practical scrutiny alongside mechanism-level
# skepticism. The "unknown" fallback quartet already carries both anchors.
_ANCHOR_PERSPECTIVES: tuple[tuple[str, str], ...] = (
    ("Ethical POV", POV_LENS_DESCRIPTIONS["Ethical POV"]),
    ("Practical POV", POV_LENS_DESCRIPTIONS["Practical POV"]),
)


def max_perspectives() -> int:
    """Perspective budget for one debate (DIALECTICAL_MAX_PERSPECTIVES).

    A soft cap, not a target: the rule-based composition and the LLM planner
    may both select fewer lenses; neither may exceed it. Floor of 2 keeps the
    honesty invariant that a debate always has at least two perspectives.
    """
    return int_env("DIALECTICAL_MAX_PERSPECTIVES", 7, 2, 16)


def _attach_pov_node_types(labelled: list[tuple[str, str]]) -> list[tuple[str, str, str]]:
    """Assign legacy POV node_types to (label, lens) pairs by cycling
    POV_BRANCHES -- see the dynamic-perspectives design note above for why
    node_types must stay in the legacy vocabulary."""
    pov_types = [node_type for node_type, _label in POV_BRANCHES]
    return [
        (pov_types[index % len(pov_types)], label, lens)
        for index, (label, lens) in enumerate(labelled)
    ]


def _classify_and_select_perspectives(topic: str) -> tuple[str, list[str], list[tuple[str, str, str]]]:
    """Single source of truth for the rule-based perspective derivation.

    Returns (claim_type, matched_markers, [(node_type, label, lens), ...]).
    Computing the classification exactly once here -- instead of separately
    inside `dynamic_perspectives` -- lets `create_dialectical_debate` (W5a)
    persist the SAME derivation that produced the debate's lens set, rather
    than discarding it and risking drift from a second classification call.

    A classified family is COMPOSED with the missing generalist anchors
    (specialized lenses first, anchors appended), capped by max_perspectives().
    """
    claim_type, markers = classify_claim_type(topic)
    labelled = _CLAIM_TYPE_PERSPECTIVES.get(claim_type)
    if labelled is None:
        composed = list(_FALLBACK_PERSPECTIVES)
    else:
        composed = list(labelled)
        present = {label.casefold() for label, _lens in composed}
        composed.extend(
            (label, lens)
            for label, lens in _ANCHOR_PERSPECTIVES
            if label.casefold() not in present
        )
    return claim_type, markers, _attach_pov_node_types(composed[: max_perspectives()])


def dynamic_perspectives(topic: str) -> list[tuple[str, str, str]]:
    """Return [(node_type, label, lens_description), ...] for `topic`.

    Deterministic and provider-free. The perspective COUNT and the label/lens
    CONTENT vary by claim type (at least 2, no fixed universal count); the
    node_type is always drawn from the legacy POV vocabulary so downstream
    scoring/qbaf/serialization treat each perspective exactly like a legacy POV
    lens.
    """
    _claim_type, _markers, perspectives = _classify_and_select_perspectives(topic)
    return perspectives


# ---------------------------------------------------------------------------
# LLM perspective planning (DIALECTICAL_LLM_PERSPECTIVES, default ON)
# ---------------------------------------------------------------------------
# The rule-based classifier only sees surface markers, so question-phrased
# topics ("how can we ...") routinely land on the generalist fallback. The
# planner asks the configured perspective_planner agent to pick the most
# incisive lens set for THIS topic, seeded with the rule-based candidates.
# Strictly best-effort: any failure (role unconfigured, provider error,
# timeout, invalid JSON, too few valid lenses) returns None and creation
# proceeds on the rule-based composition -- debate creation must never fail
# or wedge because of the planner.

PERSPECTIVE_PLANNER_ROLE = "perspective_planner"


def _planner_registry() -> ProviderRegistry:
    from app.providers.codex_cli import CodexCliProvider

    settings = load_settings()
    # Creation is a synchronous API call; bound the planner well below the
    # provider's 120s default so a slow CLI degrades to the rule-based set
    # instead of hanging the request.
    timeout = int_env("DIALECTICAL_PERSPECTIVE_PLANNER_TIMEOUT_S", 45, 5, 120)
    return ProviderRegistry(
        providers={"codex": CodexCliProvider(executable=settings.codex_command, timeout_seconds=timeout)}
    )


def plan_perspectives_with_llm(
    topic: str, candidates: list[tuple[str, str]]
) -> tuple[str | None, list[tuple[str, str]]] | None:
    """Ask the perspective_planner agent for the lens set best suited to `topic`.

    Returns (claim_type_or_None, [(label, lens), ...]) on success, None on any
    failure. Labels are sanitized to fit Job.required_role String(32); the
    result is deduplicated and capped by max_perspectives(); fewer than two
    valid lenses counts as failure so the honesty floor stays with the
    rule-based path.
    """
    try:
        registry = _planner_registry()
        if PERSPECTIVE_PLANNER_ROLE not in registry.agents:
            return None
        cap = max_perspectives()
        candidate_lines = "\n".join(f'- "{label}": {lens}' for label, lens in candidates)
        prompt = (
            "You select the debate perspectives (lenses) for a dialectical engine that "
            "argues a question from several independent points of view.\n\n"
            f"Question: {topic}\n\n"
            "Rule-based candidate lenses (safe fallback, replace freely):\n"
            f"{candidate_lines}\n\n"
            f"Choose between 3 and {cap} perspectives giving the most incisive "
            "multi-angle examination of THIS question -- quality over quantity; "
            "only include a lens when it attacks a genuine weak point of the "
            "question (causal mechanism, base rates, verification, incentives, "
            "rights, feasibility, second-order effects, ...).\n"
            "Requirements:\n"
            "- Always keep ethical and practical coverage: either the generic "
            '"Ethical POV"/"Practical POV" or sharper topic-specific equivalents.\n'
            '- Each label: at most 26 characters, ending in " POV", unique.\n'
            '- Each lens: one imperative sentence starting with "Evaluate".\n'
            "- Order lenses from most to least incisive.\n\n"
            "Return exactly one strict JSON object of the shape "
            '{"claim_type": "causal|prediction|comparative|normative|definitional|empirical|mixed|unknown", '
            '"perspectives": [{"label": "...", "lens": "...", "why": "..."}]} '
            "with no commentary."
        )
        response = registry.generate_for_role(
            PERSPECTIVE_PLANNER_ROLE,
            [{"role": "user", "content": prompt}],
            response_format="json",
        )
        payload = extract_jsonish(response.text)
        raw_perspectives = payload.get("perspectives")
        if not isinstance(raw_perspectives, list):
            return None
        seen: set[str] = set()
        lenses: list[tuple[str, str]] = []
        for entry in raw_perspectives:
            if not isinstance(entry, dict):
                continue
            label = sanitize_text(str(entry.get("label") or ""), 32)
            lens = sanitize_text(str(entry.get("lens") or ""), 600)
            if not label or not lens or label.casefold() in seen:
                continue
            seen.add(label.casefold())
            lenses.append((label, lens))
            if len(lenses) >= cap:
                break
        if len(lenses) < 2:
            return None
        raw_claim_type = payload.get("claim_type")
        claim_type = (
            raw_claim_type.strip() if isinstance(raw_claim_type, str) and raw_claim_type.strip() else None
        )
        return claim_type, lenses
    except Exception as exc:
        LOGGER.warning(
            "perspective planner unavailable, falling back to rule-based lenses: %r", exc
        )
        return None


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


def _looks_mock_model(model_id: str) -> bool:
    lowered = model_id.lower()
    return any(marker in lowered for marker in ("mock", "fake", "deterministic"))


def v2_generation_model_pool(db: Session) -> list[str]:
    """Ordered model pool for v2 generation jobs (anchor first).

    The codex anchor model always leads -- creation stays readiness-gated on
    it (require_v2_codex_model). With DIALECTICAL_MULTI_MODEL_GENERATION
    (default ON), every other routing-allowed model advertised by an online
    real worker joins in sorted order, so all working models collaborate on
    a debate instead of one provider debating itself. Mock/deterministic
    workers and mock-looking model ids never enter the pool, and a
    single-worker deployment degrades to a pool of one (byte-identical to
    the flag-off behavior).
    """
    if not bool_env("DIALECTICAL_MULTI_MODEL_GENERATION", True):
        return [V2_CODEX_MODEL_ID]
    settings = load_settings()
    cutoff = now_utc() - timedelta(seconds=settings.worker_offline_seconds)
    workers = db.scalars(
        select(Worker).where(Worker.last_seen >= cutoff, Worker.status == "online")
    ).all()
    allowed = routing_allowed_models(db)
    extras: set[str] = set()
    for worker in workers:
        if _is_mock_or_deterministic_worker(worker):
            continue
        for capability in worker_capability_set(worker):
            if capability == V2_CODEX_MODEL_ID or _looks_mock_model(capability):
                continue
            if allowed is not None and capability not in allowed:
                continue
            extras.add(capability)
    return [V2_CODEX_MODEL_ID, *sorted(extras)]


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


# --------------------------------------------------------------------------
# Task 10 (P1.1): evidence-acquisition jobs (retrieval via search-capable CLIs).
# --------------------------------------------------------------------------
# A v2_evidence job asks a search-capable worker to retrieve independent sources
# bearing on an evidence-eligible claim (empirical/causal), returning a strict
# JSON contract that materializes into EVIDENCE nodes with real retrieval
# provenance -- the first non-regex evidence path in the engine. The feature is
# flag-gated OFF: with DIALECTICAL_EVIDENCE_ACQUISITION unset, no v2_evidence
# job is ever queued and every POV/expand completion stays byte-identical to the
# pre-Task-10 flow. Evidence jobs are AUXILIARY (orchestrator.AUXILIARY_JOB_TYPES):
# terminal failure never damages the node or debate.
EVIDENCE_ELIGIBLE_CLAIM_TYPES = frozenset({"empirical", "causal"})
EVIDENCE_MAX_SOURCES_PER_JOB = 3
EVIDENCE_STANCES = frozenset({"supports", "refutes", "mixed"})
DEFAULT_EVIDENCE_SEARCH_MODELS = ("claude-sonnet-5-high-loop",)
EVIDENCE_JOB_ROLE = "v2_evidence"


def evidence_acquisition_enabled() -> bool:
    """P1.1 feature gate. Default OFF."""
    return bool_env("DIALECTICAL_EVIDENCE_ACQUISITION", False)


def evidence_search_models() -> list[str]:
    """Ordered, de-duplicated search-capable model list evidence jobs may use
    (env DIALECTICAL_EVIDENCE_SEARCH_MODELS, comma-separated; default the single
    Claude loop model whose CLI carries --allowedTools WebSearch). Evidence jobs
    round-robin over whichever of these are online and fail over ONLY within
    this set (orchestrator.next_failover_model)."""
    raw = os.getenv("DIALECTICAL_EVIDENCE_SEARCH_MODELS")
    if raw is None:
        return list(DEFAULT_EVIDENCE_SEARCH_MODELS)
    models: list[str] = []
    for part in raw.split(","):
        model = part.strip()
        if model and model not in models:
            models.append(model)
    return models or list(DEFAULT_EVIDENCE_SEARCH_MODELS)


def evidence_max_per_node() -> int:
    """Max v2_evidence jobs queued per argument node (env, clamped)."""
    return int_env("DIALECTICAL_EVIDENCE_MAX_PER_NODE", 2, 0, 20)


def evidence_max_per_debate() -> int:
    """Max v2_evidence jobs queued per debate (env, clamped)."""
    return int_env("DIALECTICAL_EVIDENCE_MAX_PER_DEBATE", 6, 0, 200)


def _evidence_eligible(text: str) -> bool:
    """Reuse the SAME deterministic claim-type classifier scoring uses -- a
    claim is evidence-eligible only when it reads empirical or causal."""
    claim_type, _markers = classify_claim_type(text or "")
    return claim_type in EVIDENCE_ELIGIBLE_CLAIM_TYPES


def _count_evidence_jobs(db: Session, debate_id: str, node_id: str | None = None) -> int:
    query = select(func.count()).select_from(Job).where(
        Job.debate_id == debate_id, Job.job_type == "v2_evidence"
    )
    if node_id is not None:
        query = query.where(Job.node_id == node_id)
    return int(db.scalar(query) or 0)


def choose_evidence_model(db: Session, debate: Debate) -> str | None:
    """Round-robin the debate's next evidence job across the ONLINE
    search-capable models; if none is online, pin it to the first configured
    search model so it waits pending until one comes online (an evidence job's
    role is unrouted, so reroute_unavailable_pending_jobs can never move it onto
    a non-search model). Returns None only when no search model is configured."""
    models = evidence_search_models()
    if not models:
        return None
    online = online_capabilities(db)
    online_search = [model for model in models if model in online]
    if online_search:
        rotation = _count_evidence_jobs(db, debate.id)
        return online_search[rotation % len(online_search)]
    return models[0]


def maybe_queue_evidence_job(db: Session, debate: Debate, node: Node) -> Job | None:
    """Best-effort: queue one v2_evidence job for `node` when the flag is on,
    the node's claim is evidence-eligible (empirical/causal), and both the
    per-node and per-debate budgets allow it. Never raises -- a queueing failure
    must never damage the POV/expand completion that called it (mirrors
    extract_and_persist_evidence_for_completed_node's best-effort guard)."""
    try:
        if not evidence_acquisition_enabled():
            return None
        if node is None or node.node_type == "EVIDENCE":
            return None
        generation = db.get(Generation, node.active_generation_id) if node.active_generation_id else None
        claim_text = generation.argument if generation else (node.claim or "")
        if not _evidence_eligible(claim_text):
            return None
        if _count_evidence_jobs(db, debate.id, node.id) >= evidence_max_per_node():
            return None
        # Read-then-queue budget: within one completion transaction the count is
        # consistent, but two branch completions committing concurrently on
        # different workers can each pass this check before the other commits, so
        # the per-debate total may overshoot by up to one racing completion's
        # worth of eligible nodes (a branch has <=6). Acceptable -- evidence is
        # auxiliary and every extra job is itself cost-capped and non-fatal.
        if _count_evidence_jobs(db, debate.id) >= evidence_max_per_debate():
            return None
        model_id = choose_evidence_model(db, debate)
        if model_id is None:
            return None
        return queue_v2_job(db, debate, "v2_evidence", EVIDENCE_JOB_ROLE, model_id, node.id)
    except Exception as exc:  # pragma: no cover - defensive best-effort guard
        print(
            f"[dialectical_v2] evidence job queueing failed for node "
            f"{getattr(node, 'id', '?')} (non-fatal): {exc!r}"
        )
        return None


def _normalize_evidence_source(raw: Any, index: int) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raise ValueError(f"Evidence source #{index} must be a JSON object")
    url = sanitize_text(str(raw.get("url") or ""), 2_000)
    if not url or not evidence_url_is_safe(url):
        raise ValueError(f"Evidence source #{index} must include a fetchable http(s) url")
    quote = sanitize_text(str(raw.get("quote") or ""), 300)
    if not quote:
        raise ValueError(f"Evidence source #{index} must include a non-empty quote")
    publisher = sanitize_text(str(raw.get("publisher") or ""), 300)
    if not publisher:
        raise ValueError(f"Evidence source #{index} must include a publisher")
    stance = str(raw.get("stance") or "").strip().lower()
    if stance not in EVIDENCE_STANCES:
        raise ValueError(f"Evidence source #{index} stance must be one of supports|refutes|mixed")
    retrieval_query = sanitize_text(str(raw.get("retrieval_query") or ""), 500)
    return {
        "url": url,
        "quote": quote,
        "publisher": publisher,
        "date": _normalize_iso_date(raw.get("date")),
        "retrieval_query": retrieval_query,
        "stance": stance,
    }


def _normalize_iso_date(raw: Any) -> str | None:
    """Keep an ISO-8601 date verbatim (YYYY-MM-DD or a full ISO 8601 timestamp,
    optionally 'Z'-suffixed); anything else -> None. A model that returns
    "last Tuesday" or "May 2023" yields a null date rather than junk metadata."""
    if raw in (None, ""):
        return None
    text = sanitize_text(str(raw), 40)
    if not text:
        return None
    for parser in (datetime.fromisoformat, date.fromisoformat):
        try:
            parser(text)
            return text
        except ValueError:
            continue
    return None


def validate_evidence_contract(payload: dict[str, Any]) -> dict[str, Any]:
    """Strict evidence-source contract (mirrors validate_pov_contract's
    strictness: malformed -> ValueError -> retryable failure -> failover ladder).
    An empty sources list is a valid, honest "found nothing" completion (0
    EVIDENCE nodes), NOT a failure. Provenance is always required."""
    if not isinstance(payload, dict):
        raise ValueError("Evidence output must be a JSON object")
    raw_sources = payload.get("sources")
    if not isinstance(raw_sources, list):
        raise ValueError("Evidence output must include a sources list")
    if len(raw_sources) > EVIDENCE_MAX_SOURCES_PER_JOB:
        raise ValueError(f"Evidence output must include at most {EVIDENCE_MAX_SOURCES_PER_JOB} sources")
    sources = [_normalize_evidence_source(raw, index) for index, raw in enumerate(raw_sources)]
    provenance = payload.get("provenance")
    if not isinstance(provenance, dict) or not all(
        provenance.get(key) for key in ("model_id", "worker_id", "prompt_id", "job_id")
    ):
        raise ValueError("Evidence output must include model, worker, prompt, and job provenance")
    return {"sources": sources, "provenance": provenance}


def materialize_evidence_nodes(
    db: Session,
    debate: Debate,
    job: Job,
    claim_node: Node,
    payload: dict[str, Any],
    *,
    worker: Worker | None = None,
) -> list[Node]:
    """Create EVIDENCE child nodes (method "retrieval") under `claim_node` from
    a validated evidence payload (capped at EVIDENCE_MAX_SOURCES_PER_JOB).
    Attribution is the retrieving model/worker."""
    provenance = payload.get("provenance") or {}
    sources = list(payload.get("sources") or [])[:EVIDENCE_MAX_SOURCES_PER_JOB]
    model_id = str(provenance.get("model_id") or job.required_model)
    worker_id = str((worker.id if worker else None) or provenance.get("worker_id") or job.worker_id or "")
    return persist_retrieval_evidence_nodes(
        db,
        debate,
        claim_node,
        sources=sources,
        model_id=model_id,
        worker_id=worker_id,
    )


def _extract_and_maybe_acquire_evidence(db: Session, debate: Debate, node: Node) -> None:
    """Seam run over each completed argument node: the always-on regex extractor
    (marks in-prose citations as method "model-claim"), then -- flag-gated --
    queue a retrieval evidence job for the same node. Both are best-effort and
    never fail node completion."""
    extract_and_persist_evidence_for_completed_node(db, debate, node)
    maybe_queue_evidence_job(db, debate, node)


# --------------------------------------------------------------------------
# Task 8 (P3.4 + P4.2): score-before-synthesis, score-informed synthesis,
# synthesizer rotation (docs/improvement-plan-2026-07-22.md).
# --------------------------------------------------------------------------
# "Argument node" scope reused from the protocol runner's tauCoverage
# definition (app/protocol/runner.py): every NON-EVIDENCE node carries a tau
# that composes into the root strength (ROOT_CLAIM, PRO, CON, and the POV/lens
# containers). EVIDENCE nodes are no-edge extracted substrings and are
# excluded. "Live" additionally drops dead placeholders (status stale/failed),
# the same exclusion app.scoring.service._debate_node_ids applies before
# judging -- a dead node can never earn a scoring result, so keeping it in the
# "must be scored" set would defer synthesis forever.
_ARGUMENT_DEAD_STATUSES = ("stale", "failed")


def score_before_synthesis_enabled() -> bool:
    """P3.4 sequencing fix: score the tree before synthesis so the synthesis
    prompt reflects measured standing. Default ON; env kill-switch."""
    return bool_env("DIALECTICAL_SCORE_BEFORE_SYNTHESIS", True)


def defer_panel_scoring_during_generation() -> bool:
    """Task 22 Fix B sub-cause 3: True when a judge panel is configured
    (DIALECTICAL_JUDGE_PANEL_MODELS set).

    The multi-judge panel scoring pass is write-heavy -- one JudgeOutputArtifact
    (+ a NodeScoringResult cache row) per node per judge. Cold-started mid-
    generation it loses those writes to the generation/adversarial/cross-exam/
    evidence write-storm under SQLite's single writer (the 2026-07-24 smoke run:
    both score_debate jobs failed on 'database is locked'). So when a panel is
    on, the pre-synthesis scoring trigger is deferred until generation quiesces
    (see should_fire_pre_synthesis_scoring), letting the heavy pass run against a
    calm writer. Panel off -> False: the single-judge pre-synthesis overlap-
    with-generation behavior is byte-identical to before Fix B."""
    return bool(panel_model_ids())


def should_fire_pre_synthesis_scoring(*, generation_pending: bool) -> bool:
    """Task 22 Fix B sub-cause 3: whether a branch/expansion completion should
    fire the pre-synthesis internal scoring trigger right now.

    Off when score-before-synthesis is disabled (unchanged). Panel OFF -> always
    fires (byte-identical overlap-with-generation, even while generation is
    pending). Panel ON -> fires only once generation has quiesced
    (generation_pending is False), so the write-heavy panel pass never cold-
    starts into the generation write-storm. The always-on post-synthesis trigger
    (persist_v2_synthesis) remains the backstop that runs after generation is
    fully done."""
    if not score_before_synthesis_enabled():
        return False
    if defer_panel_scoring_during_generation() and generation_pending:
        return False
    return True


def synthesizer_rotation_enabled() -> bool:
    """P4.2: rotate the synthesizer off the hardcoded anchor family so the
    reader is not the family that wrote most of the content. Default ON."""
    return bool_env("DIALECTICAL_SYNTHESIZER_ROTATION", True)


# --------------------------------------------------------------------------
# Task 14 (P3.1): the adversarial POV pipeline (cross-model attacker).
# --------------------------------------------------------------------------
# Today a POV branch is one model in one completion -- the PRO and CON of a
# branch share one author and one forward pass (self-play, not adversarial
# testing). With DIALECTICAL_ADVERSARIAL_POV ON, the v2_pov job's contract
# shrinks to the PRO side only (lens card + strongest_pro + strongest_pro.pro),
# and on proposer materialization the completion tail queues TWO v2_expand
# CHALLENGE jobs authored by a DIFFERENT model family than the proposer:
#  (a) the strongest attack against the lens claim -> the branch's top-level CON
#      (the position where strongest_con lives on the legacy path),
#  (b) the strongest attack against strongest_pro -> its CON child.
# Flag OFF: the 7-card contract/prompt/materialization are byte-identical to the
# legacy self-play path and no attacker job is ever queued.
ADVERSARIAL_ATTACK_REASON = (
    "adversarial_pov: find the decision-changing objection against this claim"
)


def adversarial_pov_enabled() -> bool:
    """P3.1 feature gate. Default OFF: flag-off behavior is byte-identical to
    the legacy one-shot POV subtree (proposer authors the whole 7-card branch,
    no attacker jobs)."""
    return bool_env("DIALECTICAL_ADVERSARIAL_POV", False)


def choose_adversarial_attacker_model(db: Session, proposer_model_id: str) -> tuple[str, str]:
    """Pick the attacker model + the reason it was chosen (P3.1).

    Prefer a healthy online pool model whose lineage family DIFFERS from the
    proposer's, so the attack is genuinely adversarial (a different family
    challenges the claim) rather than the proposer critiquing itself. Reuses
    the SAME pool + lineage_family machinery choose_synthesizer_model uses --
    NOT a second mapper. Same-family fallback (the proposer's own model) is
    allowed ONLY when the pool has a single family; the choice is recorded so
    the branch discloses honestly which case applied.

    Returns (model_id, reason) where reason is one of
    "cross_family" | "same_family_fallback_single_family_pool"."""
    proposer_family = lineage_family(proposer_model_id)
    for model in v2_generation_model_pool(db):
        family = lineage_family(model)
        if family is not None and family != proposer_family:
            return model, "cross_family"
    return proposer_model_id, "same_family_fallback_single_family_pool"


def _is_adversarial_attacker_job(job: Job) -> bool:
    """True when a v2_expand job is one of Task 14's adversarial challenge jobs
    (marked in its payload at queue time). Used to scope the post-attack
    scoring trigger + the failure manifest to adversarial attacks, leaving the
    adaptive-expansion path byte-identical."""
    payload = job.payload if isinstance(job.payload, dict) else {}
    return bool(payload.get("adversarial_pov"))


def synthesis_score_wait_seconds() -> int:
    """Bounded deferral budget: how long a pending v2_synthesize job waits for
    scoring before it becomes claimable with whatever scores exist. Clamped to
    [0, 3600]; 0 disables the wait (synthesis claimable immediately)."""
    return int_env("DIALECTICAL_SYNTHESIS_SCORE_WAIT_SECONDS", 240, 0, 3600)


def live_argument_nodes(db: Session, debate_id: str) -> list[Node]:
    """The debate's live argument nodes (non-EVIDENCE, not stale/failed), in
    stable tree order. See the module comment above for the argument-node
    scope this reuses from the protocol runner."""
    return list(
        db.scalars(
            select(Node)
            .where(
                Node.debate_id == debate_id,
                Node.node_type != "EVIDENCE",
                Node.status.notin_(_ARGUMENT_DEAD_STATUSES),
            )
            .order_by(Node.materialized_path.asc(), Node.depth.asc(), Node.position.asc(), Node.id.asc())
        ).all()
    )


def all_live_argument_nodes_scored(db: Session, debate: Debate) -> bool:
    """True when every live argument node appears in the latest persisted
    public scoring payload's scored items. Empty tree -> True (nothing to
    score)."""
    live_ids = {node.id for node in live_argument_nodes(db, debate.id)}
    if not live_ids:
        return True
    payload = debate_scoring_payload(db, debate)
    scored_ids = {
        item["node_id"]
        for item in (payload.get("items") or [])
        if isinstance(item, dict) and item.get("node_id")
    }
    return live_ids <= scored_ids


def v2_synthesis_claim_blocked(db: Session, job: Job, now: Any) -> bool:
    """Claim-eligibility deferral: True when this pending v2_synthesize job
    must NOT yet be claimed because scoring of the debate's live argument
    nodes has not finished and the score-wait budget has not elapsed.

    Returns False (claimable) for any non-synthesize job, when the
    score-before-synthesis flag is off, once every live argument node is
    scored, or once the job has been pending past the wait budget -- so the
    deferral is always bounded and can never wedge a debate. Skipping a job
    here burns no attempt (see orchestrator.worker_can_claim_job)."""
    if job.job_type != "v2_synthesize":
        return False
    if not score_before_synthesis_enabled():
        return False
    debate = db.get(Debate, job.debate_id)
    if debate is None:
        return False
    if all_live_argument_nodes_scored(db, debate):
        return False
    comparable_now = now.replace(tzinfo=None) if job.created_at.tzinfo is None else now
    waited = comparable_now - job.created_at
    return waited < timedelta(seconds=synthesis_score_wait_seconds())


def _majority_author_family(db: Session, debate: Debate) -> str | None:
    """Most common lineage family among the models that authored the debate's
    COMPLETED branch containers (depth-1 non-EVIDENCE nodes under the root --
    materialize_pov_branch stamps the branch's author model on the container).
    None when no completed branch has a resolvable author family. Uses
    app.scoring.lineage.lineage_family (the established internal grouping the
    judge/arguer-independence path already uses) -- NOT a second family
    mapper."""
    if not debate.root_node_id:
        return None
    containers = db.scalars(
        select(Node)
        .where(
            Node.debate_id == debate.id,
            Node.parent_id == debate.root_node_id,
            Node.node_type != "EVIDENCE",
            Node.status == "complete",
        )
        # Stable order so Counter's tie-break (insertion order) is deterministic
        # across backends when two families are exactly even.
        .order_by(Node.position.asc(), Node.id.asc())
    ).all()
    families: list[str] = []
    for container in containers:
        generation = (
            db.get(Generation, container.active_generation_id) if container.active_generation_id else None
        )
        family = lineage_family(generation.model_id if generation else None)
        if family:
            families.append(family)
    if not families:
        return None
    return Counter(families).most_common(1)[0][0]


def choose_synthesizer_model(db: Session, debate: Debate) -> tuple[str, dict[str, Any]]:
    """Pick the v2_synthesize model + rotation provenance (P4.2).

    Rotation (default on) prefers a healthy online pool model whose lineage
    family differs from the majority author family of completed branches, so
    the reader is not the same family that wrote most of the content. Falls
    back to the anchor (V2_CODEX_MODEL_ID) when rotation is disabled, when no
    completed branch has a resolvable author family, or when no different-
    family online pool model is available. The v2_synthesize failover ladder
    is unchanged -- rotation only changes the FIRST pinned model.

    Returns (model_id, {chosen_model, family, rotation_reason,
    author_family_majority}); rotation_reason is one of
    "rotated_off_author_family" | "anchor_fallback" | "rotation_disabled"."""
    anchor_family = lineage_family(V2_CODEX_MODEL_ID)
    if not synthesizer_rotation_enabled():
        return V2_CODEX_MODEL_ID, {
            "chosen_model": V2_CODEX_MODEL_ID,
            "family": anchor_family,
            "rotation_reason": "rotation_disabled",
            "author_family_majority": None,
        }
    author_family = _majority_author_family(db, debate)
    if author_family is not None:
        for model in v2_generation_model_pool(db):
            if model == V2_CODEX_MODEL_ID:
                continue
            family = lineage_family(model)
            if family is not None and family != author_family:
                return model, {
                    "chosen_model": model,
                    "family": family,
                    "rotation_reason": "rotated_off_author_family",
                    "author_family_majority": author_family,
                }
    return V2_CODEX_MODEL_ID, {
        "chosen_model": V2_CODEX_MODEL_ID,
        "family": anchor_family,
        "rotation_reason": "anchor_fallback",
        "author_family_majority": author_family,
    }


# --------------------------------------------------------------------------
# Task 15 (P3.3): the pre-synthesis cross-examination round.
# --------------------------------------------------------------------------
# Today's protocol phase 5.4 "cross-exam" (app.protocol.cross_exam) is a
# passive read-only analysis over ALREADY-EXISTING scores/nodes -- no new LLM
# calls, no new nodes. With DIALECTICAL_CROSS_EXAM ON, a REAL skeptic wave
# runs immediately before synthesis: for each completed POV branch, that
# branch's strongest claim gets ONE v2_expand CHALLENGE job from a healthy
# online model in a DIFFERENT family than the claim's own author, carrying
# the skeptic contract below. This reuses the v2_expand machinery end to end
# (queueing, materialization, the Task 3 children-digest cache-busting that
# was built anticipating exactly this) -- nothing new is invented, only a new
# caller of it. Flag OFF: the wave never queues and queue_v2_synthesize_job
# is byte-identical to pre-Task-15.
CROSS_EXAM_REASON = (
    "cross-examination: find the decision-changing objection — the "
    "single strongest reason this claim's conclusion should change"
)


def cross_exam_enabled() -> bool:
    """P3.3 feature gate. Default OFF."""
    return bool_env("DIALECTICAL_CROSS_EXAM", False)


def cross_exam_max_jobs() -> int:
    """Wave size cap (env, clamped [0, 20]). 0 disables the wave even with
    the flag on. Counts against nothing else -- its own budget only."""
    return int_env("DIALECTICAL_CROSS_EXAM_MAX_JOBS", 8, 0, 20)


# P1 Task 1: hard depth guardrail. The v2 pipeline previously had no depth
# check of any kind; triage's depth_budget is computed and never read. This
# is a safety rail against unbounded expansion chains, NOT a target -- the
# frontier's priority floor is what actually stops healthy branches.
MAX_EXPANSION_DEPTH = 10


def expansion_depth_limit() -> int:
    return int_env("DIALECTICAL_MAX_EXPANSION_DEPTH", MAX_EXPANSION_DEPTH, 1, 32)


# "Is this v2_expand job part of the P3.3 wave" has exactly ONE definition:
# orchestrator._is_cross_exam_expand_job (used directly below, never
# aliased). terminalize_job_failure needs the SAME job.payload marker check
# to route these jobs through the AUXILIARY terminal path, so the predicate
# lives there and is reused here rather than duplicated. dialectical_v2
# already imports FROM orchestrator at module level, so this needs no
# deferred import (the reverse direction would; orchestrator cannot import
# dialectical_v2 at module level -- see the deferred imports elsewhere in
# this file). Cross-module reuse of an underscore-prefixed name matches this
# file's existing app.protocol.cross_exam._OPPOSING_NODE_TYPES import.


def _cross_exam_wave_already_queued(db: Session, debate_id: str) -> bool:
    """True once at least one cross-exam-marked v2_expand job has ever been
    queued for this debate. Job rows are never deleted (the same durable-
    marker precedent debate_uses_v2_pipeline relies on), so this is a stable
    per-debate idempotency check regardless of how many of those jobs are
    still outstanding vs. terminal."""
    jobs = db.scalars(
        select(Job).where(Job.debate_id == debate_id, Job.job_type == "v2_expand")
    ).all()
    return any(_is_cross_exam_expand_job(job) for job in jobs)


def _cross_exam_branch_claim(
    container: Node,
    live_nodes_by_id: dict[str, Node],
    children_by_parent: dict[str, list[Node]],
    strength_by_node: dict[str, float],
) -> Node | None:
    """The branch's strongest claim (brief P3.3 point 2): the branch's own
    live argument node (the container included) with the highest current
    persisted strength. Fallback when nothing in the branch is scored: the
    branch's strongest_pro node (position 0 PRO child of the container) --
    the SAME "strongest claim" position Task 14's adversarial attacker
    targets, and the only node BOTH the legacy and adversarial-POV proposer
    contracts guarantee exists on every completed branch."""
    subtree_ids: set[str] = set()
    frontier = [container.id]
    while frontier:
        current = frontier.pop()
        if current in subtree_ids:
            continue
        subtree_ids.add(current)
        frontier.extend(child.id for child in children_by_parent.get(current, []))
    scored_candidates = [live_nodes_by_id[node_id] for node_id in subtree_ids if node_id in strength_by_node]
    if scored_candidates:
        # Highest strength wins; ties broken by node id for determinism
        # (mirrors app.protocol.cross_exam.cross_examine's own tie-break).
        scored_candidates.sort(key=lambda node: (-strength_by_node[node.id], node.id))
        return scored_candidates[0]
    # position is a next-free-slot allocation shared across a container's
    # PRO/CON children (see queue_v2_expand_job), so at most one child can
    # ever match "PRO at position 0" -- no ordering needed to pick among
    # candidates that structurally cannot exceed one.
    return next(
        (child for child in children_by_parent.get(container.id, []) if child.node_type == "PRO" and child.position == 0),
        None,
    )


def maybe_queue_cross_exam_wave(db: Session, debate: Debate) -> list[Job]:
    """P3.3: queue the pre-synthesis skeptic wave -- one v2_expand CHALLENGE
    job per completed POV branch, against that branch's strongest claim,
    authored by a healthy online model from a DIFFERENT family than the
    claim's own author (choose_adversarial_attacker_model reuse -- family
    helper reuse, same-family fallback recorded honestly in the payload).

    Returns the newly-queued wave jobs; empty when the flag is off, the cap
    is 0, no branch has completed yet, or the wave already ran for this
    debate (idempotent -- see _cross_exam_wave_already_queued). Called from
    queue_v2_synthesize_job, itself only reached once the tree is otherwise
    quiescent, so a second wave can never be queued for the same debate: the
    first wave's own v2_expand jobs hold whole-tree quiescence (see
    pending_generation_nodes) until it resolves.
    """
    if not cross_exam_enabled():
        return []
    cap = cross_exam_max_jobs()
    if cap <= 0 or not debate.root_node_id:
        return []
    if _cross_exam_wave_already_queued(db, debate.id):
        return []
    containers = db.scalars(
        select(Node)
        .where(
            Node.debate_id == debate.id,
            Node.parent_id == debate.root_node_id,
            Node.node_type != "EVIDENCE",
            Node.status == "complete",
        )
        .order_by(Node.position.asc(), Node.id.asc())
    ).all()
    if not containers:
        return []
    live_nodes = live_argument_nodes(db, debate.id)
    live_nodes_by_id = {node.id: node for node in live_nodes}
    children_by_parent: dict[str, list[Node]] = {}
    for node in live_nodes:
        if node.parent_id:
            children_by_parent.setdefault(node.parent_id, []).append(node)
    scoring_payload = debate_scoring_payload(db, debate)
    strength_by_node: dict[str, float] = {}
    for item in scoring_payload.get("items") or []:
        if isinstance(item, dict) and item.get("node_id"):
            scores = item.get("scores") if isinstance(item.get("scores"), dict) else {}
            value = scores.get("strength")
            if isinstance(value, (int, float)):
                strength_by_node[item["node_id"]] = float(value)
    # Cap ranking (brief: "branches > cap -> strongest branches first by root
    # strength"): the branch's OWN container strength, unscored -> 0.0, ties
    # broken by node id for determinism (same convention as the claim pick
    # above and app.protocol.cross_exam.cross_examine).
    ranked_containers = sorted(
        containers, key=lambda node: (-(strength_by_node.get(node.id) or 0.0), node.id)
    )[:cap]
    queued: list[Job] = []
    for container in ranked_containers:
        claim = _cross_exam_branch_claim(container, live_nodes_by_id, children_by_parent, strength_by_node)
        if claim is None:
            continue
        author_generation = (
            db.get(Generation, claim.active_generation_id) if claim.active_generation_id else None
        )
        author_model = str((author_generation.model_id if author_generation else None) or "")
        attacker_model, attacker_reason = choose_adversarial_attacker_model(db, author_model)
        marker = {
            "cross_exam": True,
            "cross_exam_attacker_reason": attacker_reason,
            "cross_exam_author_model": author_model,
            "cross_exam_author_family": lineage_family(author_model),
            "cross_exam_attacker_model": attacker_model,
            "cross_exam_attacker_family": lineage_family(attacker_model),
            "cross_exam_branch_container_id": container.id,
        }
        try:
            queued.append(
                queue_v2_expand_job(
                    db,
                    debate,
                    claim,
                    "CON",
                    CROSS_EXAM_REASON,
                    attacker_model,
                    payload_extra=marker,
                )
            )
        except Exception as exc:  # pragma: no cover - defensive best-effort guard
            print(f"[dialectical_v2] cross-exam job queueing failed for claim {claim.id} (non-fatal): {exc!r}")
    return queued


def queue_v2_synthesize_job(db: Session, debate: Debate) -> Job:
    """Single queue site for the debate's v2_synthesize job. Every synthesis-
    queue path routes through here so synthesizer selection + rotation
    provenance live in exactly ONE place (never copied). That now includes
    NOT ONLY the four completion tails but also the branch-terminal-FAILURE
    path (orchestrator._queue_synthesis_after_branch_failure) -- a Task 15
    fix: that path used to queue v2_synthesize directly, bypassing both
    rotation and (see below) the cross-exam wave whenever a debate reached
    "ready to synthesize" via a branch's terminal failure rather than a
    completion tail's success. Records the rotation decision in job.payload;
    it is mirrored into synthesis.provenance at persist time.

    Task 15 (P3.3): reached here means the tree is otherwise quiescent --
    exactly the moment the brief's pre-synthesis wave must run, regardless of
    whether that quiescence was reached by success or by a branch's terminal
    failure (see above). On its first hit for a debate, maybe_queue_cross_exam_
    wave queues the wave INSTEAD of synthesis (its v2_expand jobs then hold
    quiescence, so every caller's own pre-check keeps this seam from firing
    again until the wave resolves); once the wave has already run (or is
    disabled), it returns [] and this falls through to real synthesis exactly
    as before."""
    wave_jobs = maybe_queue_cross_exam_wave(db, debate)
    if wave_jobs:
        return wave_jobs[-1]
    model_id, rotation = choose_synthesizer_model(db, debate)
    job = queue_v2_job(db, debate, "v2_synthesize", "v2_synthesizer", model_id, None)
    payload = dict(job.payload or {})
    payload["synthesizer_rotation"] = rotation
    job.payload = payload
    flush_write(db)
    return job


def _synthesis_node_scores(db: Session, debate: Debate) -> dict[str, Any]:
    """Score-informed synthesis payload (P3.4/P4.2): per live argument node,
    the measured strength/uncertainty projected from the latest persisted
    PUBLIC scoring items (reused shape -- no parallel scoring computation).
    Present-but-honest: an unscored live node is listed with scored=false + a
    reason, so the block is a complete census of the tree whether or not
    scoring finished."""
    live = live_argument_nodes(db, debate.id)
    payload = debate_scoring_payload(db, debate)
    items_by_node = {
        item["node_id"]: item
        for item in (payload.get("items") or [])
        if isinstance(item, dict) and item.get("node_id")
    }
    nodes: list[dict[str, Any]] = []
    scored_count = 0
    for node in live:
        item = items_by_node.get(node.id)
        if not isinstance(item, dict):
            nodes.append(
                {
                    "node_id": node.id,
                    "node_type": node.node_type,
                    "scored": False,
                    "reason": "No current scoring result for this node yet.",
                }
            )
            continue
        scored_count += 1
        scores = item.get("scores") if isinstance(item.get("scores"), dict) else {}
        drivers = item.get("uncertainty_drivers") if isinstance(item.get("uncertainty_drivers"), list) else []
        nodes.append(
            {
                "node_id": node.id,
                "node_type": node.node_type,
                "scored": True,
                "strength": scores.get("strength"),
                "strength_kind": item.get("strength_kind"),
                "uncertainty": scores.get("uncertainty"),
                "uncertainty_source": item.get("uncertainty_source"),
                "uncertainty_drivers": [
                    driver.get("label")
                    for driver in drivers[:3]
                    if isinstance(driver, dict) and driver.get("label")
                ],
            }
        )
    complete = scored_count == len(live)
    return {
        "status": payload.get("status", "unavailable"),
        "live_argument_node_count": len(live),
        "scored_node_count": scored_count,
        "reason": None
        if complete
        else "Scoring is incomplete for some live argument nodes; treat their standing as not-yet-measured, not as weak.",
        "nodes": nodes,
    }


def _synthesis_verification_statuses(db: Session, debate: Debate) -> dict[str, Any]:
    """Score-informed synthesis payload (P3.4): per-node verification standing
    read from the latest persisted protocol verification rollup
    (app/protocol/runner.py writes verificationStatuses + verificationSource on
    each protocol_analysis run -- reused, never recomputed here). Present-but-
    honest: when no protocol analysis has run yet, available=false + a
    reason."""
    run = db.scalars(
        select(AnalyzerRun)
        .where(
            AnalyzerRun.debate_id == debate.id,
            AnalyzerRun.analyzer_type == PROTOCOL_ANALYSIS_TYPE,
        )
        .order_by(AnalyzerRun.seq.desc(), AnalyzerRun.created_at.desc(), AnalyzerRun.id.desc())
    ).first()
    output = run.output if run is not None and isinstance(run.output, dict) else None
    status_map = output.get("verificationStatuses") if isinstance(output, dict) else None
    if not isinstance(status_map, dict) or not status_map:
        return {
            "available": False,
            "reason": "No verification analysis has run for this debate yet.",
            "statuses": [],
        }
    source_map = output.get("verificationSource") if isinstance(output.get("verificationSource"), dict) else {}
    statuses = [
        {"node_id": node_id, "status": status, "source": source_map.get(node_id)}
        for node_id, status in status_map.items()
    ]
    return {
        "available": True,
        "version": output.get("verificationVersion"),
        "statuses": statuses,
    }


def _synthesis_unresolved_attacks(db: Session, debate: Debate) -> dict[str, Any]:
    """Score-informed synthesis payload (P4.2): per node, the attack children
    the debate did NOT resolve in the parent's favor. Cheap deterministic
    proxy (NOT a QBAF re-derivation): an attack child (a CON child -- reusing
    app.protocol.cross_exam._OPPOSING_NODE_TYPES) is 'unresolved' when its
    measured strength is >= its parent's, or when either the parent or the
    attacker is unscored (so an unmeasured attack is surfaced, never silently
    treated as resolved). The definition ships in the payload."""
    live = live_argument_nodes(db, debate.id)
    payload = debate_scoring_payload(db, debate)
    strength_by_node: dict[str, float | None] = {}
    for item in payload.get("items") or []:
        if isinstance(item, dict) and item.get("node_id"):
            scores = item.get("scores") if isinstance(item.get("scores"), dict) else {}
            value = scores.get("strength")
            strength_by_node[item["node_id"]] = float(value) if isinstance(value, (int, float)) else None
    children_by_parent: dict[str, list[Node]] = {}
    for node in live:
        if node.parent_id:
            children_by_parent.setdefault(node.parent_id, []).append(node)
    per_node: list[dict[str, Any]] = []
    for node in live:
        attack_children = [
            child
            for child in children_by_parent.get(node.id, [])
            if child.node_type in _OPPOSING_NODE_TYPES
        ]
        if not attack_children:
            continue
        parent_strength = strength_by_node.get(node.id)
        unresolved_ids = [
            child.id
            for child in attack_children
            if parent_strength is None
            or strength_by_node.get(child.id) is None
            or strength_by_node[child.id] >= parent_strength
        ]
        if unresolved_ids:
            per_node.append(
                {
                    "node_id": node.id,
                    "parent_strength": parent_strength,
                    "attack_child_count": len(attack_children),
                    "unresolved_attack_count": len(unresolved_ids),
                    "unresolved_attack_ids": unresolved_ids,
                }
            )
    return {
        "definition": (
            "An attack child is a CON child node. An attack is 'unresolved' when its "
            "measured strength is >= its parent's, or when either the parent or the "
            "attacker is unscored. Cheap deterministic proxy over persisted scores, "
            "not a QBAF re-derivation."
        ),
        "nodes": per_node,
    }


def _synthesis_failure_manifest(db: Session, debate: Debate) -> dict[str, Any]:
    """Score-informed synthesis payload (P4.2): which perspectives died and
    why. Each failed branch container (depth-1 non-EVIDENCE node under the root
    with status=='failed') with its label, the models the failover ladder
    exhausted (job.payload['tried_models'] + the last required_model), and the
    recorded stopping_reason -- so the synthesis accounts for the perspectives
    that never made it, not just the survivors."""
    if not debate.root_node_id:
        return {"died_count": 0, "perspectives": []}
    failed = db.scalars(
        select(Node)
        .where(
            Node.debate_id == debate.id,
            Node.parent_id == debate.root_node_id,
            Node.node_type != "EVIDENCE",
            Node.status == "failed",
        )
        .order_by(Node.position.asc(), Node.id.asc())
    ).all()
    perspectives: list[dict[str, Any]] = []
    for node in failed:
        job = db.scalars(
            select(Job)
            .where(
                Job.debate_id == debate.id,
                Job.node_id == node.id,
                Job.job_type == "v2_pov",
            )
            .order_by(Job.created_at.desc(), Job.id.desc())
        ).first()
        tried_models: list[str] = []
        if job is not None:
            job_payload = job.payload if isinstance(job.payload, dict) else {}
            tried_models = [model for model in (job_payload.get("tried_models") or []) if isinstance(model, str)]
            if job.required_model and job.required_model not in tried_models:
                tried_models.append(job.required_model)
        perspectives.append(
            {
                "node_id": node.id,
                "label": (node.claim or "").strip() or node.node_type,
                "tried_models": tried_models,
                "stopping_reason": node.stopping_reason,
            }
        )
    attacker_failures = _synthesis_attacker_failures(db, debate)
    return {
        "died_count": len(perspectives),
        "perspectives": perspectives,
        # Task 14 (P3.1): adversarial attacker (CON) jobs that died terminally,
        # so the synthesis accounts for the missing challenges (the CON node is
        # failed/absent, not silently resolved).
        "attacker_failure_count": len(attacker_failures),
        "attacker_failures": attacker_failures,
    }


def _synthesis_attacker_failures(db: Session, debate: Debate) -> list[dict[str, Any]]:
    """Task 14 (P3.1): the adversarial attacker (v2_expand CON) jobs that
    failed terminally. Each entry names the failed CON node, the attack target
    (lens_claim | strongest_pro), its parent, the models the failover ladder
    exhausted, the attacker-selection reason, and the node's stopping reason --
    so the synthesis knows which challenges never made it (a missing CON is a
    gap in the adversarial test, not a claim that survived unchallenged)."""
    failed_jobs = db.scalars(
        select(Job)
        .where(
            Job.debate_id == debate.id,
            Job.job_type == "v2_expand",
            Job.status == "failed",
        )
        .order_by(Job.created_at.asc(), Job.id.asc())
    ).all()
    failures: list[dict[str, Any]] = []
    seen_nodes: set[str] = set()
    for job in failed_jobs:
        if not _is_adversarial_attacker_job(job):
            continue
        if job.node_id and job.node_id in seen_nodes:
            continue
        payload = job.payload if isinstance(job.payload, dict) else {}
        node = db.get(Node, job.node_id) if job.node_id else None
        tried_models = [model for model in (payload.get("tried_models") or []) if isinstance(model, str)]
        if job.required_model and job.required_model not in tried_models:
            tried_models.append(job.required_model)
        if job.node_id:
            seen_nodes.add(job.node_id)
        failures.append(
            {
                "node_id": job.node_id,
                "parent_node_id": payload.get("parent_node_id"),
                "target": payload.get("adversarial_target"),
                "attacker_reason": payload.get("adversarial_attacker_reason"),
                "tried_models": tried_models,
                "stopping_reason": node.stopping_reason if node is not None else None,
            }
        )
    return failures


def _synthesis_measured_standing(db: Session, debate: Debate) -> dict[str, Any]:
    """Assemble the four score-informed synthesis payload blocks (P3.4/P4.2).
    Every block is present-but-honest even when scoring/verification has not
    run, so the synthesis prompt contract is stable regardless of timing."""
    return {
        "node_scores": _synthesis_node_scores(db, debate),
        "verification_statuses": _synthesis_verification_statuses(db, debate),
        "unresolved_attacks": _synthesis_unresolved_attacks(db, debate),
        "failure_manifest": _synthesis_failure_manifest(db, debate),
    }


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


# FW3 (I-8): the two payload keys that decide which budget rail an expansion
# is counted against (app.exploration.expansion_dispatch._adaptive_expand_jobs
# / ._operator_expand_jobs). Each has its own keyword argument; `payload_extra`
# may not set either.
_RESERVED_EXPAND_PAYLOAD_KEYS = frozenset({"decision_record_id", "approval_audit_id"})


def queue_v2_expand_job(
    db: Session,
    debate: Debate,
    node: Node,
    polarity: str,
    reason: str,
    model_id: str | None = None,
    *,
    decision_record_id: str | None = None,
    approval_audit_id: str | None = None,
    payload_extra: dict[str, Any] | None = None,
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
    if node.depth >= expansion_depth_limit():
        raise ValueError(
            f"Expansion target is at or beyond the depth limit ({expansion_depth_limit()})"
        )
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
    if approval_audit_id:
        # FW3 (I-4): the operator-approval linkage, written HERE rather than
        # patched onto job.payload after the fact, for the same reason
        # decision_record_id is -- it is committed atomically with the job, so
        # the operator budget rail (expansion_dispatch._operator_expand_jobs)
        # counts a marker that exists from the job's first durable instant.
        payload["approval_audit_id"] = approval_audit_id
    if payload_extra:
        # Additive markers/provenance for the caller (e.g. Task 14's adversarial
        # attacker markers), committed atomically with the job.
        #
        # FW3 (I-8): the ORIGIN keys are reserved and rejected outright. The
        # old `setdefault` merge claimed it "never overrides the structural
        # keys above", which was true only for keys already PRESENT --
        # decision_record_id and approval_audit_id are absent whenever their
        # kwarg is falsy, so payload_extra could have forged either origin.
        # No caller does, but both keys now carry budget authority, and a
        # forged origin would spend (or dodge) a rail. Raising beats dropping:
        # a caller passing an origin key is confused about which mechanism it
        # is using, and should hear about it.
        forged = _RESERVED_EXPAND_PAYLOAD_KEYS.intersection(payload_extra)
        if forged:
            raise ValueError(
                "payload_extra may not set expansion origin keys: "
                + ", ".join(sorted(forged))
            )
        for key, value in payload_extra.items():
            payload.setdefault(key, value)
    job.payload = payload
    commit_write(db)
    return job


def queue_adversarial_attacker_jobs(db: Session, debate: Debate, pov_job: Job, pov_node: Node) -> list[Job]:
    """P3.1 attacker phase: queue the TWO cross-model challenge jobs for a
    freshly-materialized adversarial POV branch.

    (a) the strongest attack against the lens claim -> the branch's top-level
        CON (position 1 under the container, where strongest_con lives on the
        legacy path); (b) the strongest attack against strongest_pro -> its CON
        child (position 1 under strongest_pro). Both are v2_expand CHALLENGE
        jobs (reusing queue_v2_expand_job + expansion_reason) authored by a
        model from a DIFFERENT family than the proposer's -- the position
        contract is honored for free by queue_v2_expand_job's next-free-slot
        allocation. Same-family fallback is recorded honestly in the payload.

    Best-effort: a queueing failure must never damage the already-complete
    proposer branch (the CON is simply absent, which is visible/honest and
    surfaced in the synthesis failure manifest)."""
    strongest_pro = db.scalar(
        select(Node)
        .where(Node.parent_id == pov_node.id, Node.node_type == "PRO", Node.position == 0)
        .order_by(Node.id.asc())
    )
    proposer_generation = (
        db.get(Generation, pov_node.active_generation_id) if pov_node.active_generation_id else None
    )
    proposer_model = str(
        (proposer_generation.model_id if proposer_generation else None) or pov_job.required_model or ""
    )
    attacker_model, attacker_reason = choose_adversarial_attacker_model(db, proposer_model)
    marker = {
        "adversarial_pov": True,
        "adversarial_attacker_reason": attacker_reason,
        "adversarial_proposer_model": proposer_model,
        "adversarial_proposer_family": lineage_family(proposer_model),
        "adversarial_attacker_model": attacker_model,
        "adversarial_attacker_family": lineage_family(attacker_model),
    }
    queued: list[Job] = []
    # (a) attack the lens claim -> top-level CON under the container.
    queued.append(
        queue_v2_expand_job(
            db,
            debate,
            pov_node,
            "CON",
            ADVERSARIAL_ATTACK_REASON,
            attacker_model,
            payload_extra={**marker, "adversarial_target": "lens_claim"},
        )
    )
    # (b) attack strongest_pro -> its CON child.
    if strongest_pro is not None:
        queued.append(
            queue_v2_expand_job(
                db,
                debate,
                strongest_pro,
                "CON",
                ADVERSARIAL_ATTACK_REASON,
                attacker_model,
                payload_extra={**marker, "adversarial_target": "strongest_pro"},
            )
        )
    return queued


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


def _con_content_present(container: Any, key: str) -> bool:
    """True when `container[key]` carries real Con content (title/content) --
    used to reject con-bearing proposer payloads under the adversarial flag.
    An absent key or an empty/null value is not con-bearing (a compliant
    proposer simply omits it)."""
    if not isinstance(container, dict):
        return False
    value = container.get(key)
    if not isinstance(value, dict):
        return False
    return bool(str(value.get("title") or "").strip() or str(value.get("content") or "").strip())


def validate_pov_proposer_contract(payload: dict[str, Any]) -> dict[str, Any]:
    """Adversarial-flag proposer contract (P3.1): the PRO side ONLY --
    lens card + strongest_pro + strongest_pro.pro (3 cards) + provenance. A
    different model authors the CON attacks, so a con-bearing payload (any
    strongest_con, or a strongest_pro.con) is REJECTED: the proposer must not
    write challenge cards. The returned shape carries no strongest_con and its
    strongest_pro carries no con -- materialize_pov_branch grows only the PRO
    side and the attacker jobs supply the CONs."""
    root = require_title_content(payload, "POV output")
    strongest_pro_in = payload.get("strongest_pro")
    if not isinstance(strongest_pro_in, dict):
        raise ValueError("strongest_pro must be a JSON object")
    strongest_pro = require_title_content(strongest_pro_in, "strongest_pro")
    nested_pro = require_title_content(
        strongest_pro_in.get("pro") if isinstance(strongest_pro_in.get("pro"), dict) else {},
        "strongest_pro.pro",
    )
    if _con_content_present(payload, "strongest_con") or _con_content_present(strongest_pro_in, "con"):
        raise ValueError(
            "Adversarial POV proposer output must not include Con cards "
            "(strongest_con or strongest_pro.con); a different model writes the attack"
        )
    provenance = payload.get("provenance")
    if not isinstance(provenance, dict) or not all(provenance.get(key) for key in ("model_id", "worker_id", "prompt_id", "job_id")):
        raise ValueError("POV output must include model, worker, prompt, and job provenance")
    return {
        **root,
        "strongest_pro": {**strongest_pro, "pro": nested_pro},
        "provenance": provenance,
    }


def validate_pov_contract(payload: dict[str, Any]) -> dict[str, Any]:
    if adversarial_pov_enabled():
        return validate_pov_proposer_contract(payload)
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
    _extract_and_maybe_acquire_evidence(db, debate, pro_node)
    if adversarial_pov_enabled():
        # P3.1 proposer phase: grow the PRO side ONLY -- strongest_pro (above)
        # plus its single nested Pro. The two CON attacks are authored by a
        # different-family model via the v2_expand challenge jobs the completion
        # tail queues; they materialize at the legacy strongest_con /
        # strongest_pro.con positions (position 1 under the container and under
        # strongest_pro respectively -- queue_v2_expand_job's next-free-slot).
        nested_pro = create_completed_node(
            db,
            debate,
            pro_node,
            node_type="PRO",
            position=0,
            title=payload["strongest_pro"]["pro"]["title"],
            content=payload["strongest_pro"]["pro"]["content"],
            job=job,
            provenance=provenance,
            prompt_rendered=job.stream_buffer or json.dumps(payload["strongest_pro"]["pro"]),
        )
        _extract_and_maybe_acquire_evidence(db, debate, nested_pro)
        return pov_node
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
    _extract_and_maybe_acquire_evidence(db, debate, con_node)
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
        _extract_and_maybe_acquire_evidence(db, debate, nested_pro)
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
        _extract_and_maybe_acquire_evidence(db, debate, nested_con)
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
    _extract_and_maybe_acquire_evidence(db, debate, child)
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
    # P1 Task 2: one bulk fetch instead of a db.get per outstanding job.
    # This runs on every POV/expand completion; the per-node loop was a
    # quadratic query storm against SQLite's single writer at frontier
    # budgets. Semantics are unchanged: same node set, missing rows skipped.
    missing_ids = {node_id for node_id in outstanding_node_ids if node_id and node_id not in pending}
    if missing_ids:
        for node in db.scalars(select(Node).where(Node.id.in_(missing_ids))).all():
            pending[node.id] = node
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
            # Task 8 (P4.2): mirror the synthesizer-rotation decision (chosen
            # model, family, rotation_reason) recorded on the job payload at
            # queue time into the durable synthesis provenance.
            "synthesizer_rotation": (job.payload or {}).get("synthesizer_rotation"),
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
        try:
            ensure_default_scoring_for_completed_v2_node(db, debate, scoring_node)
        except Exception as exc:
            # Best-effort: scoring bootstrap must never fail synthesis
            # persistence. run_protocol_analysis above has already committed,
            # so raising here would strand the debate complete-in-database
            # while skipping the completion events and scoring trigger below
            # (and hand the submitting worker a 400 for a job that actually
            # succeeded).
            print(f"[dialectical_v2] completion scoring bootstrap failed (non-fatal): {exc!r}")
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
        # The debate-persisted lens map wins (it is the only source that knows
        # LLM-authored lenses, and for rule-derived labels it is byte-identical
        # to the static maps); legacy POV labels then resolve from
        # POV_LENS_DESCRIPTIONS, dynamic labels from the dynamic lens map.
        derivation = debate.config.get("perspective_derivation") if isinstance(debate.config, dict) else None
        persisted_lenses = derivation.get("lenses") if isinstance(derivation, dict) else None
        persisted_lens = persisted_lenses.get(pov_label) if isinstance(persisted_lenses, dict) else None
        lens_description = (
            persisted_lens
            or POV_LENS_DESCRIPTIONS.get(pov_label)
            or DYNAMIC_LENS_DESCRIPTIONS.get(pov_label, "")
        )
        system = (
            "You are a Codex-backed Dialectical Engine V2 POV worker. "
            "Return exactly one strict JSON object. Do not include markdown or status wrappers."
        )
        if adversarial_pov_enabled():
            # P3.1 proposer phase: PRO side ONLY. A different, opposing model
            # attacks these claims via v2_expand challenge jobs, so the
            # proposer must NOT write any Con/challenge cards.
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
                    },
                },
            }
            user = (
                f"Generate the PRO side of the {pov_label} branch for the debate question. "
                f"Lens instructions: {lens_description} "
                "Use real reasoning from this model call only; do not use placeholders or canned examples. "
                "State the perspective's assessment, its single strongest Pro, and one nested Pro that "
                "supports that Pro. Do NOT write any Con, challenge, objection, or limitation cards -- a "
                "different, opposing model will attack your claims. Every generated card must have a short "
                "title and concise content.\n\n"
                f"Context JSON:\n{json.dumps(pov_context, default=str)}"
            )
        else:
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
        # P1 Task 3: bounded payload. Flag OFF renders the historical
        # every-node-with-full-argument list byte-identically; flag ON
        # renders O(branches + K). See app/synthesis/branch_summary.py.
        if bool_env("DIALECTICAL_HIERARCHICAL_SYNTHESIS", False):
            from app.synthesis.branch_summary import (
                build_synthesis_tree_payload,
                synthesis_contested_k,
                synthesis_load_bearing_k,
            )

            tree_nodes = build_synthesis_tree_payload(
                db,
                debate,
                load_bearing_k=synthesis_load_bearing_k(),
                contested_k=synthesis_contested_k(),
            )
            # FW1 (T3 #11): the flag changes tree_nodes from "every node" to a
            # deliberately PARTIAL view, and nothing in the prompt said so.
            # omitted_count was the whole point of bounding the payload
            # honestly rather than silently dropping nodes -- and an honest
            # number nobody explains is not honest to the only reader that
            # matters here. Without this the synthesiser reads a sample as a
            # census and writes "the debate contains no X" about an X it was
            # never shown. Flag-gated: with the flag OFF the payload really is
            # every node, so this paragraph would itself be the false claim.
            tree_payload_note = (
                "The tree_nodes block is a bounded view of the argument tree and is "
                "not a complete list of its nodes: `branches` carries one summary per "
                "perspective branch, `load_bearing` the full text of the nodes ranked "
                "highest by impact x strength, `contested` the full text of the nodes "
                "the judge families disagreed about most, ranked by widest cross-family "
                "field spread, and `omitted_count` the number of further nodes that "
                "exist in this debate but are NOT included here, having ranked out on "
                "impact x strength or on narrow disagreement. Treat those omitted nodes "
                "as real and unread: do not describe the tree as exhaustive, and do not "
                "conclude that a point is missing from the debate merely because it is "
                "missing from this payload. "
            )
        else:
            # Flag OFF: every node, with full argument text -- so there is
            # nothing partial to declare and the prompt text stays
            # byte-identical (pinned by test_branch_summary.py).
            tree_payload_note = ""
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
        # Task 8 (P3.4/P4.2): score-informed synthesis context. Always present-
        # but-honest (empty + reason when scoring/verification has not run yet),
        # so this prompt contract is stable whether or not scoring finished.
        measured_standing = _synthesis_measured_standing(db, debate)
        user = (
            "Return a non-adjudicating synthesis JSON with exactly this shape: "
            '{"title":"Synthesis","content":"...","tensions":["..."],"agreements":["..."],'
            '"evidence_gaps":["..."],"key_takeaways":["..."],'
            '"provenance":{"model_id":"...","worker_id":"...","prompt_id":"...","job_id":"..."}}. '
            "Summarize tensions, agreements, evidence gaps, and key takeaways. "
            "Ground the synthesis in the measured_standing block (per-node node_scores, "
            "verification_statuses, unresolved_attacks, and the failure_manifest), not the "
            "argument prose alone. Where a branch's prose confidence disagrees with its "
            "measured strength or verification standing, say so explicitly, and account for "
            "the perspectives in the failure_manifest instead of treating the surviving "
            "branches as the whole debate. "
            f"{tree_payload_note}"
            "Do not declare a winner and do not say Pro wins or Con wins. Do not return status wrappers.\n"
            f"{adaptive_context}"
            f"Context JSON:\n{json.dumps({**base_context, 'agent_runs': completed_runs, 'tree_nodes': tree_nodes, 'measured_standing': measured_standing}, default=str)}"
        )
    elif job.job_type == "v2_evidence":
        if not job.node_id:
            raise ValueError("Evidence job must target a claim node")
        claim_node = db.get(Node, job.node_id)
        if not claim_node:
            raise ValueError("Evidence claim node not found")
        claim_generation = (
            db.get(Generation, claim_node.active_generation_id) if claim_node.active_generation_id else None
        )
        claim_text = claim_generation.argument if claim_generation else claim_node.claim
        evidence_context = {
            **base_context,
            "claim": claim_text,
            "claim_node_id": claim_node.id,
            "max_sources": EVIDENCE_MAX_SOURCES_PER_JOB,
            "output_contract": {
                "sources": [
                    {
                        "url": "canonical source URL (http or https)",
                        "quote": "verbatim quote copied from the source, at most 300 characters",
                        "publisher": "site or organization name",
                        "date": "ISO date (YYYY-MM-DD) or null",
                        "retrieval_query": "the query you searched",
                        "stance": "supports | refutes | mixed",
                    }
                ],
                "provenance": {"model_id": "...", "worker_id": "...", "prompt_id": "...", "job_id": "..."},
            },
        }
        system = (
            "You are a Codex-backed Dialectical Engine V2 evidence-retrieval worker. "
            "Use web search to find real, independent sources. Return exactly one strict JSON "
            "object. Do not include markdown or status wrappers."
        )
        user = (
            "Search the web for independent, reputable sources bearing on the claim below -- "
            "seek sources that SUPPORT it and sources that REFUTE it. Prefer primary and "
            f"reputable sources. Return AT MOST {EVIDENCE_MAX_SOURCES_PER_JOB} sources. Each "
            "source must include a canonical http(s) url, a verbatim quote of at most 300 "
            "characters copied from the source, the publisher (site/organization), an ISO date "
            "or null, the retrieval_query you used, and a stance of supports, refutes, or mixed. "
            "Do not fabricate URLs or quotes; if you find nothing relevant, return an empty "
            'sources list. Return strict JSON: {"sources":[{"url","quote","publisher","date",'
            '"retrieval_query","stance"}],"provenance":{"model_id","worker_id","prompt_id","job_id"}}.\n\n'
            f"Claim:\n{claim_text}\n\n"
            f"Context JSON:\n{json.dumps(evidence_context, default=str)}"
        )
    else:
        raise ValueError(f"Unsupported V2 job type {job.job_type}")
    return system, user


def complete_v2_worker_job(db: Session, job: Job, result: Any, metadata: dict[str, Any]) -> None:
    # Deliberately sync (it was `async def` with zero awaits): it runs inside
    # complete_job_sync on a threadpool thread, off the event loop (2026-07-26
    # pool-exhaustion follow-up -- see api/jobs.py). Its publishes already go
    # through publish_event, which is loop-agnostic.
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

    if job.job_type == "v2_evidence":
        # Strict contract first (malformed -> ValueError -> retryable failure ->
        # search-only failover ladder -> AUXILIARY terminal, never debate-fatal).
        payload = validate_evidence_contract(result if isinstance(result, dict) else {})
        if not job.node_id:
            raise ValueError("Evidence job must target a claim node")
        claim_node = db.get(Node, job.node_id)
        if claim_node is None:
            raise ValueError("Evidence claim node not found")
        evidence_nodes = materialize_evidence_nodes(db, debate, job, claim_node, payload, worker=worker)
        for evidence_node in evidence_nodes:
            record_provenance(db, debate.id, branch.id, "retrieval_evidence", evidence_node.id, payload["provenance"])
        publish_event(
            debate.id,
            "evidence_acquired",
            {
                "debate_id": debate.id,
                "node_id": claim_node.id,
                "job_id": job.id,
                "evidence_node_ids": [n.id for n in evidence_nodes],
                "source_count": len(evidence_nodes),
            },
        )
        commit_write(db)
        # Fire-and-forget citation resolution (best-effort, off the worker POST):
        # fetch each new source URL and stamp resolution_status. Never blocks or
        # fails completion (matches trigger_internal_scoring_after_completion).
        node_ids = [n.id for n in evidence_nodes]
        if node_ids:
            try:
                trigger_citation_resolution(debate.id, node_ids)
            except Exception as exc:
                print(f"[dialectical_v2] citation resolution trigger failed (non-fatal): {exc!r}")
        # Controller addition (Task 12 / P1.3): close the pipeline-ordering
        # gap Task 11 disclosed -- v2_evidence completion did not itself
        # trigger any scoring/analysis pass, so newly-materialized evidence
        # could sit unverified and un-graphed until something UNRELATED
        # re-scored the debate. Firing the SAME Task 8 incremental-scoring
        # driver used at the v2_pov/v2_expand completion sites means the
        # NEXT scoring pass picks these nodes up, which (via
        # reevaluate_lifecycle_after_scoring_completion) opportunistically
        # verifies their evidence children, whose verdicts then flow into
        # the NEXT protocol re-analysis as DF-QuAD evidence edges (Task 12) --
        # acquisition -> scoring -> verification -> protocol re-analysis ->
        # evidence edges, without manual intervention. Best-effort/
        # fire-and-forget, matching every other trigger site in this
        # function; gated on evidence_acquisition_enabled() alone (the same
        # flag that gates v2_evidence jobs existing at all) rather than
        # DIALECTICAL_SCORE_BEFORE_SYNTHESIS -- this is evidence-acquisition's
        # own completion-driven trigger, independent of the v2_pov branch-
        # completion trigger's own flag.
        if evidence_acquisition_enabled():
            try:
                trigger_internal_scoring_after_completion(debate.id)
            except Exception as exc:
                print(f"[dialectical_v2] evidence-completion scoring trigger failed (non-fatal): {exc!r}")
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
        if adversarial_pov_enabled():
            # P3.1 attacker phase: queue the two cross-model challenge jobs on
            # proposer materialization. Queued BEFORE the quiescence check so
            # their pending v2_expand jobs (in V2_GENERATION_JOB_TYPES) hold
            # synthesis until proposer + both attackers are terminal. Best-
            # effort: a queueing failure must never damage the already-complete
            # proposer branch (the CON is simply absent -- honest, and surfaced
            # in the synthesis failure manifest).
            try:
                queue_adversarial_attacker_jobs(db, debate, job, pov_node)
            except Exception as exc:
                print(f"[dialectical_v2] adversarial attacker queueing failed (non-fatal): {exc!r}")
        pending_branches = pending_generation_nodes(db, debate.id, debate.root_node_id)
        existing_synthesis = db.scalar(
            select(Job).where(
                Job.debate_id == debate.id,
                Job.job_type == "v2_synthesize",
                Job.status.in_(["pending", "claimed", "running"]),
            )
        )
        if not pending_branches and existing_synthesis is None:
            queue_v2_synthesize_job(db, debate)
        commit_write(db)
        # Task 8 (P3.4): incremental scoring at branch completion. Fire the
        # internal scoring driver so judging overlaps remaining generation and
        # the tree is (incrementally) scored before synthesis becomes
        # claimable (see v2_synthesis_claim_blocked). Fire-and-forget after the
        # commit above; the scoring path is idempotent/input-hash-cached, so
        # repeated triggers only judge new/changed nodes. Best-effort: it must
        # never fail or delay POV completion (matches persist_v2_synthesis's
        # trigger_internal_scoring_after_completion guard). Flag off -> today's
        # post-synthesis-only scoring flow, untouched. Task 22 Fix B sub-cause 3:
        # with a panel configured, defer until this was the LAST branch (no
        # pending branches) so the write-heavy panel pass does not cold-start
        # into the generation write-storm; panel off fires immediately as before.
        if should_fire_pre_synthesis_scoring(generation_pending=bool(pending_branches)):
            try:
                trigger_internal_scoring_after_completion(debate.id)
            except Exception as exc:
                print(f"[dialectical_v2] pre-synthesis scoring trigger failed (non-fatal): {exc!r}")
        return

    if job.job_type == "v2_expand":
        # Deliberately minimal output contract: one {title, content} object.
        payload = require_title_content(result if isinstance(result, dict) else {}, "Expansion output")
        provenance = (
            result.get("provenance")
            if isinstance(result, dict) and isinstance(result.get("provenance"), dict)
            else {}
        )
        if _is_cross_exam_expand_job(job):
            # Task 15 (P3.3): coordinator-authoritative mark (job.payload was
            # set by the coordinator at queue time, never by the worker) so
            # the child's provenance record honestly discloses its cross-
            # examination origin -- additive only, no existing provenance key
            # touched; exposed for free via the existing provenance_records
            # serialization channel (debate_to_dict) so the UI could badge it
            # later (no UI work in this task).
            provenance = {**provenance, "cross_exam": True}
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
            queue_v2_synthesize_job(db, debate)
        commit_write(db)
        # Task 14 (P3.1) / Task 15 (P3.3): a materialized adversarial attack or
        # cross-exam attack (a CON child) is a new argument node whose parent's
        # scoring input-hash (Task 3) is now stale. Fire the SAME Task 8
        # incremental-scoring trigger the proposer branch uses so the attack
        # node -- and its cache-invalidated parent -- get (re)scored before
        # synthesis becomes claimable. Scoped to adversarial attacker / cross-
        # exam jobs so the adaptive-expansion path's own scoring behavior
        # (below) stays byte-identical; gated on the same
        # DIALECTICAL_SCORE_BEFORE_SYNTHESIS flag. Best-effort/fire-and-forget,
        # matching every other trigger site in this function. Task 22 Fix B sub-
        # cause 3: with a panel configured, defer until the attack was the LAST
        # pending node so the write-heavy panel pass does not cold-start into the
        # generation write-storm; panel off fires immediately as before.
        if (_is_adversarial_attacker_job(job) or _is_cross_exam_expand_job(job)) and should_fire_pre_synthesis_scoring(
            generation_pending=bool(pending_nodes)
        ):
            try:
                trigger_internal_scoring_after_completion(debate.id)
            except Exception as exc:
                print(f"[dialectical_v2] post-attack scoring trigger failed (non-fatal): {exc!r}")
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
            queue_v2_synthesize_job(db, debate)
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
        queue_v2_synthesize_job(db, debate)
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

    # Dynamic perspectives (DEFAULT ON): derive a claim-type-appropriate lens
    # set instead of the fixed quartet. When the flag is off, `perspectives` is
    # exactly POV_BRANCHES, so the loop below is byte-identical to the legacy
    # path. Only the (node_type, label) source list changes; the per-perspective
    # Node + v2_pov job mechanics are shared.
    #
    # SEAM (ordering is load-bearing): this block runs BEFORE the first write
    # below, because plan_perspectives_with_llm shells out to the codex CLI for
    # up to DIALECTICAL_PERSPECTIVE_PLANNER_TIMEOUT_S (45s default, 120s max).
    # It used to run AFTER the Debate/root Node/DebateBranch flushes, which
    # meant debate creation held SQLite's single RESERVED writer across that
    # whole subprocess -- starving every other writer in the process (worker
    # heartbeats' `UPDATE workers SET last_seen`, job lease refreshes,
    # generation completion) into busy_timeout expiry and "database is locked"
    # 500s. Same defect app.scoring.service's F1 fix cured for the judge panel.
    # The planner needs only the topic and the rule-based candidates -- never
    # the database -- so hoisting it is a pure reordering that keeps debate
    # creation ONE atomic transaction (a planner or job-queueing failure still
    # leaves no half-created "generating" debate behind).
    if bool_env("DIALECTICAL_DYNAMIC_PERSPECTIVES", True):
        claim_type, markers, selected = _classify_and_select_perspectives(topic)
        source = "markers" if claim_type != "unknown" else "fallback"
        if bool_env("DIALECTICAL_LLM_PERSPECTIVES", True):
            # 2026-07-26 pool-exhaustion fix: the SEAM note above keeps the
            # planner out of the WRITE transaction, but the request session has
            # already READ (require_user_token, require_v2_codex_model above),
            # and a read is enough to check a QueuePool connection out and hold
            # it until the transaction ends. Release it before the CLI goes out
            # for 45-120s, or every concurrent debate creation pins one of the
            # pool's slots for the subprocess's whole run. rollback() is the
            # right primitive: nothing is dirty yet (first write is below), it
            # only ends the read transaction, and everything captured so far
            # (model_id, debate_config, selected) is plain Python data.
            db.rollback()
            planned = plan_perspectives_with_llm(
                topic, candidates=[(label, lens) for _node_type, label, lens in selected]
            )
            if planned is not None:
                planned_claim_type, labelled = planned
                selected = _attach_pov_node_types(labelled)
                source = "llm"
                if planned_claim_type:
                    claim_type = planned_claim_type
        perspectives = [(node_type, label) for node_type, label, _lens in selected]
        # W5a: persist the derivation that produced this debate's lens set
        # (additive; NEW debates only -- see serialization.debate_to_dict's
        # `derivation` key). Folded into the config the Debate is CONSTRUCTED
        # with, so there is no ORM dirty-tracking concern at all (debate.config
        # is a plain JSON column, not a MutableDict, so an in-place update on a
        # persisted row would not be tracked -- cf. the reassign-wholesale
        # pattern in app.exploration.expansion_dispatch._write_adaptive_expansion_state).
        # `lenses` is load-bearing for LLM-planned debates: render_v2_job_prompt
        # resolves an LLM-authored label's lens text from here, since no static
        # map can know it.
        debate_config = {
            **debate_config,
            "perspective_derivation": {
                "claim_type": claim_type,
                "markers": list(markers),
                "lens_set": [label for _node_type, label, _lens in selected],
                "source": source,
                "lenses": {label: lens for _node_type, label, lens in selected},
            },
        }
    else:
        perspectives = list(POV_BRANCHES)

    # First write of the request: everything from here to the commit_write
    # below is local DB work only -- no CLI, no network (see the SEAM note).
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

    # Multi-model collaboration: POV branches round-robin across every online
    # real worker model (anchor first), so the perspectives are argued by
    # different providers whenever the deployment has them.
    model_pool = v2_generation_model_pool(db)
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
        queue_v2_job(db, debate, "v2_pov", label, model_pool[position % len(model_pool)], pov_node.id)

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
