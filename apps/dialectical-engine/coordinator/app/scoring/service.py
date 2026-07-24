from __future__ import annotations

import asyncio
import hashlib
import logging
import time
from datetime import datetime, timezone

from sqlalchemy import event, func, or_, select, update
from sqlalchemy.orm import Session, attributes
from pydantic import ValidationError

from app.core.config import bool_env, float_env
from app.core.oplog import log_event
from app.core.write_lock import commit_write, flush_write
from app.models.entities import (
    AnalyzerRun,
    Debate,
    Generation,
    Job,
    JudgeOutputArtifact,
    Node,
    NodeFeedbackVote,
    NodeScoringResult,
    ProvenanceRecord,
    now_utc,
    uuid_str,
)
from app.providers import ProviderError, ProviderRegistry, detect_scoring_provider_config
from app.scoring.cache import (
    lookup_scoring_cache,
    lookup_stale_scoring_cache_metadata,
    node_scoring_input_hash,
    store_scoring_cache,
)
from app.scoring.calibration import correlated_discount, judge_weight
from app.scoring.disagreement import detect_persisted_judge_disagreements, dispersion_uncertainty
from app.scoring.judge_registry import active_contract
from app.scoring.judge_panel import build_judge_panel_members
from app.scoring.lineage import (
    SECRET_METADATA_MARKERS,
    _public_metadata_text,
    judge_lineage_metadata,
    lineage_family,
    panel_vendor_family,
)
from app.scoring.judges import (
    JudgeChildContext,
    ScoringProvider,
    ScoringProviderRequest,
    ScoringProviderResult,
)
from app.scoring.models import (
    AdaptiveDepthDryRunItem,
    AdaptiveDepthPolicy,
    ClaimAssessment,
    NodeScoringError,
    NodeScoringPending,
    NodeScoringPayload,
    NormalizedClaim,
    ScoringModelMetadata,
    ScoringStatus,
    ScoringStatusModel,
)
from app.scoring.normalizer import normalize_claim
from app.scoring.parser import parse_judge_json
from app.scoring.prompts import render_single_node_judge_prompt
from app.scoring.qbaf_debug import qbaf_debug_block
from app.scoring.reducer import adaptive_depth_dry_run, reduce_assessments
from app.services.job_ledger import record_job_transition
from app.services.orchestrator import create_job

LOGGER = logging.getLogger(__name__)


SCORING_ANALYZER_TYPE = "node_scoring"
SCORING_JOB_TYPE = "score_debate"
JUDGE_OUTPUT_SOURCE = "judge_outputs"
DEFAULT_SCORING_MAX_NODES: int | None = None
SCORING_PROVIDER_MAX_ATTEMPTS = 2
# Task 3 (tree-aware judge payload, docs/improvement-plan-2026-07-22.md
# §P2.3): bound applied to each PRO/CON child's argument excerpt included in
# the judge payload -- long enough to give the judge real signal on the
# child's substance, short enough to keep the payload's size predictable
# regardless of how verbose a child's generated argument gets.
JUDGE_CHILD_ARGUMENT_EXCERPT_MAX_CHARS = 700
# Node.node_type -> JudgeChildContext.stance for the judge's tree-aware
# payload. Mirrors app.protocol.cross_exam's _OPPOSING_NODE_TYPES convention
# (CON is the exact opposing/attack type; PRO is the exact supporting type).
# Deliberately excludes EVIDENCE (a different subsystem -- the "verifier"
# judge role, not this node-scoring judge) and any other node_type (e.g. the
# POV-branch label nodes dynamic perspectives create as direct ROOT_CLAIM
# children): those are structural lens nodes, not PRO/CON arguments the
# judge should weigh as a real counter or support.
_JUDGE_CHILD_STANCE_BY_NODE_TYPE: dict[str, str] = {"PRO": "support", "CON": "attack"}
ACTIVE_SCORING_JOB_STATUSES = {"pending", "claimed", "running"}
STALE_SCORING_JOB_ERROR = "Stale scoring job expired before judge outputs were produced."
UNAVAILABLE_SCORING_JOB_ERROR = "No scoring provider is configured."
# Phase 6 Task 2 (lineage independence, docs/superpowers/plans/2026-07-07-phase6-lineage-independence.md):
# v1 has exactly ONE configured judge system-wide (no pool of independent judge
# candidates to rotate across -- see plan UNVERIFIED #1). This guard is therefore
# a binary block/proceed check, not true rotation: if the single configured
# judge's lineage family collides with the arguer's, there is no second
# candidate to fall back to, so scoring is honestly blocked instead of silently
# reusing the same-lineage judge or fabricating independence.
NO_INDEPENDENT_JUDGE_REASON = "no_independent_judge: judge lineage matches arguer lineage"


def _normalize_loaded_job_deadline(job: Job, *_args) -> None:
    if job.job_type != SCORING_JOB_TYPE or job.deadline is None or job.deadline.tzinfo is not None:
        return
    attributes.set_committed_value(job, "deadline", job.deadline.replace(tzinfo=timezone.utc))


event.listen(Job, "load", _normalize_loaded_job_deadline)
event.listen(Job, "refresh", _normalize_loaded_job_deadline)


def queue_scoring_job(db: Session, debate: Debate, *, model_id: str, judge_role: str = "judge"):
    job = create_job(db, debate.id, SCORING_JOB_TYPE, judge_role, None, required_model=model_id)
    flush_write(db)
    return job


def fail_unavailable_scoring_job(
    db: Session,
    debate: Debate,
    *,
    model_id: str = "",
    judge_role: str = "judge",
    reason: str = UNAVAILABLE_SCORING_JOB_ERROR,
) -> Job:
    job = queue_scoring_job(db, debate, model_id=model_id, judge_role=judge_role)
    record_job_transition(
        db,
        job,
        from_status=job.status,
        to_status="failed",
        channel="scoring_unavailable",
        reason=reason,
    )
    job.status = "failed"
    job.error = reason
    job.deadline = now_utc()
    flush_write(db)
    return job


def debate_scoring_payload(db: Session, debate: Debate) -> dict:
    """Build the public scoring payload for a debate.

    When DIALECTICAL_QBAF_DEBUG is enabled, the successful-scoring path also
    attaches a "qbaf_debug" key (see app.scoring.qbaf_debug.qbaf_debug_block).
    qbaf_debug is a dev/debug field only -- it is not part of the stable wire
    contract and is entirely absent when the flag is off (the default).
    """
    node_ids = _debate_node_ids(db, debate.id)
    run = db.scalars(
        select(AnalyzerRun)
        .where(
            AnalyzerRun.debate_id == debate.id,
            AnalyzerRun.analyzer_type == SCORING_ANALYZER_TYPE,
            AnalyzerRun.status == "complete",
        )
        .order_by(AnalyzerRun.seq.desc(), AnalyzerRun.created_at.desc(), AnalyzerRun.id.desc())
        .limit(1)
    ).first()
    active_job = _active_scoring_job(db, debate.id, newer_than=run.created_at if run else None)
    if not run:
        hydrated_payload = _hydrate_scoring_payload_from_judge_artifacts(db, debate, node_ids, active_job)
        if hydrated_payload is not None:
            return hydrated_payload
        return _attach_active_scoring_job(
            _with_current_node_coverage(_unavailable_payload(debate.id, node_ids=node_ids), node_ids, active_job),
            active_job,
        )
    if not isinstance(run.provenance, dict) or run.provenance.get("scoring_source") != JUDGE_OUTPUT_SOURCE:
        return _attach_active_scoring_job(
            _with_current_node_coverage(
                _unavailable_payload(
                    debate.id,
                    reason="Stored scoring output was not produced by judge outputs.",
                    node_ids=node_ids,
                ),
                node_ids,
                active_job,
            ),
            active_job,
        )

    output = run.output if isinstance(run.output, dict) else {}
    items = output.get("items")
    if not isinstance(items, list):
        return _attach_active_scoring_job(
            _with_current_node_coverage(
                _unavailable_payload(
                    debate.id,
                    reason="Stored scoring output is missing an items array.",
                    node_ids=node_ids,
                ),
                node_ids,
                active_job,
            ),
            active_job,
        )
    try:
        validated_items = [_public_scoring_item(item) for item in items]
    except ValidationError:
        return _attach_active_scoring_job(
            _with_current_node_coverage(
                _unavailable_payload(
                    debate.id,
                    reason="Stored scoring output contains malformed node scoring items.",
                    node_ids=node_ids,
                ),
                node_ids,
                active_job,
            ),
            active_job,
        )
    try:
        status = ScoringStatusModel(status=str(output.get("status") or "available")).status
    except ValidationError:
        return _attach_active_scoring_job(
            _with_current_node_coverage(
                _unavailable_payload(
                    debate.id,
                    reason="Stored scoring output has an unknown status.",
                    node_ids=node_ids,
                ),
                node_ids,
                active_job,
            ),
            active_job,
        )
    if any(item["node_id"] not in set(node_ids) for item in validated_items):
        return _attach_active_scoring_job(
            _with_current_node_coverage(
                _unavailable_payload(
                    debate.id,
                    reason="Stored scoring output references nodes outside the current debate.",
                    node_ids=node_ids,
                ),
                node_ids,
                active_job,
            ),
            active_job,
        )

    payload = {
        "debate_id": debate.id,
        "status": status,
        "node_ids": node_ids,
        "items": validated_items,
    }
    output_errors = output.get("errors")
    if isinstance(output_errors, list):
        public_errors = _public_scoring_errors(output_errors)
        if public_errors:
            payload["errors"] = public_errors
    output_pending = output.get("pending")
    if isinstance(output_pending, list):
        public_pending = _public_scoring_pending(output_pending)
        if public_pending:
            payload["pending"] = public_pending
    reason = _public_metadata_text(output.get("reason"))
    if reason:
        payload["reason"] = reason
    model_metadata = _public_model_metadata(output.get("model_metadata"))
    if model_metadata is not None:
        payload["model_metadata"] = model_metadata
    producer = _public_metadata_text(output.get("producer"))
    if producer:
        payload["producer"] = producer
    if output.get("generated_at"):
        payload["generated_at"] = output["generated_at"]
    for field in ("max_nodes", "scored_node_count", "skipped_node_count"):
        if isinstance(output.get(field), int) and not isinstance(output.get(field), bool):
            payload[field] = output[field]
    if isinstance(output.get("truncated"), bool):
        payload["truncated"] = output["truncated"]
    output_cache = output.get("cache")
    if isinstance(output_cache, dict) and isinstance(output_cache.get("hit"), bool):
        payload["cache"] = output_cache
    elif status in {"available", "partial"}:
        payload["cache"] = {"hit": False}
    if bool_env("DIALECTICAL_QBAF_DEBUG", False):
        payload["qbaf_debug"] = qbaf_debug_block(db, debate, payload)
    payload = _with_current_node_coverage(payload, node_ids, active_job)
    return _attach_active_scoring_job(payload, active_job)


def _hydrate_scoring_payload_from_judge_artifacts(
    db: Session,
    debate: Debate,
    node_ids: list[str],
    active_job: Job | None,
) -> dict | None:
    items: list[dict] = []
    model_metadata: dict | None = None
    sources: set[str] = set()
    for node_id in node_ids:
        item, artifact_metadata, source = _hydrate_node_scoring_item_from_judge_artifact(db, debate, node_id)
        if item is None:
            continue
        items.append(item)
        if source:
            sources.add(source)
        if model_metadata is None:
            model_metadata = artifact_metadata
    if not items:
        return None
    # Provenance-precise producer: only claim artifact provenance when at
    # least one item genuinely hydrated from a contract-matched artifact;
    # a payload served purely from stored public results is historical.
    producer = (
        "persisted-judge-artifacts"
        if "persisted-judge-artifacts" in sources
        else "historical-scoring-cache"
    )
    payload = {
        "debate_id": debate.id,
        "status": "available",
        "node_ids": node_ids,
        "items": items,
        "producer": producer,
        "cache": {"hit": False},
    }
    if model_metadata is not None:
        payload["model_metadata"] = model_metadata
    payload = _with_current_node_coverage(payload, node_ids, active_job)
    return _attach_active_scoring_job(payload, active_job)


def _hydrate_node_scoring_item_from_judge_artifact(
    db: Session,
    debate: Debate,
    node_id: str,
) -> tuple[dict | None, dict | None, str | None]:
    node = db.get(Node, node_id)
    if node is None:
        return None, None, None
    generation = db.get(Generation, node.active_generation_id) if node.active_generation_id else None
    claim = normalize_claim(node_id=node.id, raw_text=node.claim)
    input_hash = node_scoring_input_hash(
        claim=claim,
        argument_text=generation.argument if generation else None,
        debate_question=debate.topic,
        children=_node_children_for_judge(db, node.id),
    )
    try:
        contract = active_contract("judge")
    except KeyError:
        return None, None, None
    artifact = db.scalars(
        select(JudgeOutputArtifact)
        .where(
            JudgeOutputArtifact.debate_id == debate.id,
            JudgeOutputArtifact.node_id == node.id,
            JudgeOutputArtifact.input_hash == input_hash,
            JudgeOutputArtifact.judge_role == contract.role,
            JudgeOutputArtifact.parse_status == "available",
            JudgeOutputArtifact.assessment.is_not(None),
            JudgeOutputArtifact.contract_hash == contract.contract_hash,
        )
        .order_by(JudgeOutputArtifact.checked_at.desc(), JudgeOutputArtifact.created_at.desc(), JudgeOutputArtifact.id.desc())
        .limit(1)
    ).first()
    if artifact is None:
        historical_item, historical_metadata = _hydrate_historical_public_result(db, debate, node, input_hash)
        if historical_item is None:
            return None, None, None
        return historical_item, historical_metadata, "historical-scoring-cache"
    if not isinstance(artifact.assessment, dict):
        return None, None, None
    try:
        assessment = ClaimAssessment.model_validate(artifact.assessment)
    except ValidationError:
        return None, None, None
    item = reduce_assessments(claim, assessment).model_dump(mode="json")
    item = _attach_plural_judge_provenance(
        db,
        item,
        debate_id=debate.id,
        node_id=node.id,
        input_hash=input_hash,
        claim=claim,
        arguer_model_id=generation.model_id if generation else None,
    )
    metadata = ScoringModelMetadata(
        provider=_public_metadata_text(artifact.provider),
        model=_public_metadata_text(artifact.model),
        checked_at=artifact.checked_at.isoformat() if artifact.checked_at else None,
        status="available",
    ).model_dump(mode="json")
    return item, metadata, "persisted-judge-artifacts"


def _hydrate_historical_public_result(
    db: Session,
    debate: Debate,
    node: Node,
    input_hash: str,
) -> tuple[dict | None, dict | None]:
    """Serve a stored public result verbatim for legacy/mismatched contracts.

    Never re-reduces old assessments through current code; never fabricates
    a score when nothing was persisted. The stored ``result`` is the full
    public scoring payload (with an ``items`` array), so we extract the
    single item for this node rather than treating the payload as an item.
    """
    stored = db.scalar(
        select(NodeScoringResult)
        .where(
            NodeScoringResult.debate_id == debate.id,
            NodeScoringResult.node_id == node.id,
            NodeScoringResult.input_hash == input_hash,
            NodeScoringResult.status == "available",
        )
        .order_by(NodeScoringResult.updated_at.desc(), NodeScoringResult.created_at.desc(), NodeScoringResult.id.desc())
    )
    if stored is None or not isinstance(stored.result, dict):
        return None, None
    stored_items = stored.result.get("items")
    if not isinstance(stored_items, list):
        return None, None
    item = next(
        (candidate for candidate in stored_items if isinstance(candidate, dict) and candidate.get("node_id") == node.id),
        None,
    )
    if item is None:
        return None, None
    metadata = ScoringModelMetadata(
        provider=_public_metadata_text(stored.provider),
        model=_public_metadata_text(stored.model),
        checked_at=stored.updated_at.isoformat() if stored.updated_at else None,
        status="available",
    ).model_dump(mode="json")
    return item, metadata


def _judge_child_argument_excerpt(argument: str | None) -> tuple[str | None, bool]:
    """Bound a child's active generation text to
    JUDGE_CHILD_ARGUMENT_EXCERPT_MAX_CHARS, cutting on a word boundary and
    flagging the cut so the judge (and callers) can tell a bounded excerpt
    from the child's whole argument. `argument` is never reflowed/normalized
    here -- only sliced -- so a non-truncated excerpt is byte-identical to
    the source text.
    """
    if argument is None:
        return None, False
    if len(argument) <= JUDGE_CHILD_ARGUMENT_EXCERPT_MAX_CHARS:
        return argument, False
    window = argument[:JUDGE_CHILD_ARGUMENT_EXCERPT_MAX_CHARS]
    last_space = window.rfind(" ")
    excerpt = window[:last_space] if last_space > 0 else window
    return f"{excerpt}…", True


def _node_children_for_judge(db: Session, node_id: str) -> list[JudgeChildContext]:
    """Real PRO/CON children of `node_id`, for the judge's tree-aware payload
    (Task 3, docs/improvement-plan-2026-07-22.md §P2.3). Stable ordering
    (position, then creation order, then id) keeps the payload deterministic.
    Exactly two queries total regardless of child count -- one for the child
    Node rows, one bulk Generation lookup -- never one query per child.
    """
    child_nodes = db.scalars(
        select(Node)
        .where(
            Node.parent_id == node_id,
            Node.node_type.in_(tuple(_JUDGE_CHILD_STANCE_BY_NODE_TYPE)),
        )
        .order_by(Node.position.asc(), Node.created_at.asc(), Node.id.asc())
    ).all()
    if not child_nodes:
        return []
    generation_ids = [child.active_generation_id for child in child_nodes if child.active_generation_id]
    generations_by_id: dict[str, Generation] = {}
    if generation_ids:
        generations_by_id = {
            generation.id: generation
            for generation in db.scalars(select(Generation).where(Generation.id.in_(generation_ids))).all()
        }
    children: list[JudgeChildContext] = []
    for child in child_nodes:
        generation = generations_by_id.get(child.active_generation_id) if child.active_generation_id else None
        excerpt, truncated = _judge_child_argument_excerpt(generation.argument if generation else None)
        children.append(
            JudgeChildContext(
                node_id=child.id,
                stance=_JUDGE_CHILD_STANCE_BY_NODE_TYPE[child.node_type],
                claim=child.claim,
                argument_excerpt=excerpt,
                truncated=truncated,
            )
        )
    return children


def score_one_node_with_provider(
    db: Session,
    debate: Debate,
    provider: ScoringProvider,
    *,
    judge_role: str = "judge",
    timeout_seconds: int = 30,
    force_refresh: bool = False,
) -> dict:
    node_ids = _debate_node_ids(db, debate.id)
    if not node_ids:
        return _unavailable_payload(
            debate.id,
            reason="No current debate nodes are available for scoring.",
            node_ids=[],
        )
    return score_node_with_provider(
        db,
        debate,
        node_ids[0],
        provider,
        judge_role=judge_role,
        timeout_seconds=timeout_seconds,
        force_refresh=force_refresh,
    )


def score_node_with_provider(
    db: Session,
    debate: Debate,
    node_id: str,
    provider: ScoringProvider,
    *,
    judge_role: str = "judge",
    timeout_seconds: int = 30,
    force_refresh: bool = False,
    provider_call_latencies_ms: list[int] | None = None,
) -> dict:
    node_ids = _debate_node_ids(db, debate.id)
    if node_id not in set(node_ids):
        return _unavailable_payload(
            debate.id,
            reason="Requested scoring node is not current in this debate.",
            node_ids=node_ids,
        )
    node = db.get(Node, node_id)
    if node is None:
        return _unavailable_payload(
            debate.id,
            reason="Current debate node could not be loaded for scoring.",
            node_ids=node_ids,
        )
    generation = db.get(Generation, node.active_generation_id) if node.active_generation_id else None
    claim = normalize_claim(node_id=node.id, raw_text=node.claim)
    argument_text = generation.argument if generation else None
    # Task 3 amendment (controller follow-up): fetched here, BEFORE the cache
    # lookup below, rather than deferred to the ScoringProviderRequest
    # construction further down -- the cache key now covers children (see
    # node_scoring_input_hash), so children must be known before the cache
    # can even be checked. Reused as-is for the request below: exactly one
    # fetch per call, on a cache hit or a miss alike (unavoidable now that
    # the cache key depends on it), never a second query.
    children = _node_children_for_judge(db, node.id)
    input_hash = node_scoring_input_hash(
        claim=claim,
        argument_text=argument_text,
        debate_question=debate.topic,
        children=children,
    )
    provider_name = getattr(provider, "provider", None)
    model_name = getattr(provider, "model", None)
    stale_cache_metadata = None
    if provider_name and model_name and not force_refresh:
        try:
            lookup_contract = active_contract(judge_role)
        except KeyError:
            lookup_contract = None
        lookup_contract_hash = lookup_contract.contract_hash if lookup_contract is not None else None
        cached_payload = lookup_scoring_cache(
            db,
            debate_id=debate.id,
            node_id=node.id,
            input_hash=input_hash,
            judge_role=judge_role,
            provider=provider_name,
            model=model_name,
            contract_hash=lookup_contract_hash,
        )
        if cached_payload is not None:
            # Task 22 Fix B sub-cause 2: attribute this cache-served node to the
            # CURRENT scoring job so a resumed (force_refresh=False) pass can
            # persist a complete aggregated run (see the helper's docstring).
            _relink_cached_node_artifacts_to_current_job(
                db, debate_id=debate.id, node_id=node.id, input_hash=input_hash
            )
            return _with_cache_metadata(cached_payload, hit=True)
        stale_cache_metadata = lookup_stale_scoring_cache_metadata(
            db,
            debate_id=debate.id,
            node_id=node.id,
            input_hash=input_hash,
            judge_role=judge_role,
            provider=provider_name,
            model=model_name,
            contract_hash=lookup_contract_hash,
        )

    # Phase 6 Task 2 fix wave (enforcement coverage): the completion-hook
    # guard in ensure_node_scoring_on_completion only gates ONE of three
    # production entry points into this shared write path -- run_scoring_job_
    # background (POST /{debate_id}/scoring/jobs, wake_pending_internal_
    # scoring_job) and force_refresh GET /{debate_id}/scoring both reach
    # score_node_with_provider directly via score_nodes_with_provider /
    # score_debate_with_provider_registry, bypassing that hook entirely.
    # This is the single shared site where every NodeScoringResult row is
    # written (store_scoring_cache below), so the lineage check belongs
    # here, not only at the completion hook. Same binary block/proceed
    # semantics as the completion-hook guard (see NO_INDEPENDENT_JUDGE_REASON
    # module comment): unknown lineage on either side never blocks. Flag OFF
    # short-circuits before any new work -- byte-identical to prior behavior.
    if bool_env("DIALECTICAL_LINEAGE_INDEPENDENCE", False) and provider_name and model_name:
        arguer_family = lineage_family(generation.model_id if generation else None)
        judge_family = lineage_family(_public_metadata_text(model_name))
        if arguer_family is not None and judge_family is not None and arguer_family == judge_family:
            return scoring_result_payload(
                debate_id=debate.id,
                node_ids=node_ids,
                items=[],
                errors=[
                    NodeScoringError(
                        node_id=node.id,
                        status="no_independent_judge",
                        reason=NO_INDEPENDENT_JUDGE_REASON,
                    )
                ],
            )
    request = ScoringProviderRequest(
        claim=claim,
        argument_text=argument_text,
        judge_role=judge_role,
        timeout_seconds=timeout_seconds,
        # Task 3 (tree-aware judge payload, docs/improvement-plan-2026-07-22.md
        # §P2.3): `debate` is always the real debate this node belongs to (a
        # caller-supplied parameter, not inferred), so debate_question is
        # always the node's actual debate question -- never a placeholder.
        # `children` is the SAME list already fetched above for the cache-key
        # computation (Task 3 amendment) -- reused, not re-fetched, so this
        # request is always built from exactly the children the cache lookup
        # already checked freshness against.
        debate_question=debate.topic,
        children=children,
    )
    try:
        result = None
        for attempt in range(1, SCORING_PROVIDER_MAX_ATTEMPTS + 1):
            try:
                result = provider.judge_node(request)
                break
            except ProviderError:
                if attempt >= SCORING_PROVIDER_MAX_ATTEMPTS:
                    raise
        if result is None:
            raise ProviderError("Scoring judge call failed.")
        provider_latency_ms = _public_latency_ms(result.latency_ms)
        if provider_latency_ms is not None and provider_call_latencies_ms is not None:
            provider_call_latencies_ms.append(provider_latency_ms)
    except TimeoutError:
        return _unavailable_payload(debate.id, reason="Scoring judge call timed out.", node_ids=node_ids)
    except ProviderError as exc:
        return _unavailable_payload(
            debate.id,
            reason=_provider_error_reason(exc, "Scoring judge call failed."),
            node_ids=node_ids,
        )
    parsed = parse_judge_json(result.raw_output)
    _persist_judge_output_artifact(
        db,
        debate_id=debate.id,
        node_id=node.id,
        input_hash=input_hash,
        judge_role=judge_role,
        request=request,
        result=result,
        parse_status="available" if parsed.status == "available" and parsed.assessment is not None else "unavailable",
        parse_error=None if parsed.status == "available" and parsed.assessment is not None else parsed.reason,
        assessment=parsed.assessment.model_dump(mode="json") if parsed.assessment is not None else None,
    )
    if parsed.status != "available" or parsed.assessment is None:
        payload = _unavailable_payload(
            debate.id,
            reason=parsed.reason or "Judge output was unavailable.",
            node_ids=node_ids,
            model_metadata=_provider_model_metadata(result, "unavailable"),
        )
        if provider_name and model_name:
            try:
                cache_contract = active_contract(judge_role)
            except KeyError:
                cache_contract = None
            payload.update(
                judge_lineage_metadata(
                    arguer_model_id=generation.model_id if generation else None,
                    judge_provider=_public_metadata_text(provider_name),
                    judge_model_id=_public_metadata_text(model_name),
                )
            )
            store_scoring_cache(
                db,
                debate_id=debate.id,
                node_id=node.id,
                input_hash=input_hash,
                judge_role=judge_role,
                provider=provider_name,
                model=model_name,
                provider_metadata=payload["model_metadata"],
                status="unavailable",
                result=payload,
                contract=cache_contract,
            )
            db.flush()
        return _with_cache_metadata(payload, hit=False, stale=stale_cache_metadata)
    # Task 6 (cross-family judge panel, docs/improvement-plan-2026-07-22.md
    # §P2.2): only runs after the primary judge above has produced a real,
    # available assessment -- there is no `item` yet to attach a panel to if
    # the primary itself failed/timed out/parsed unavailable (every branch
    # above this point already returned). Persists each panel member's own
    # JudgeOutputArtifact under the SAME input_hash before
    # _attach_plural_judge_provenance below re-reads persisted evidence for
    # this node, so a panel judgment is always visible to that read.
    judge_panel_notes = _run_judge_panel(
        db,
        debate=debate,
        node=node,
        request=request,
        input_hash=input_hash,
    )
    item = reduce_assessments(claim, parsed.assessment).model_dump(mode="json")
    item = _attach_plural_judge_provenance(
        db,
        item,
        debate_id=debate.id,
        node_id=node.id,
        input_hash=input_hash,
        claim=claim,
        arguer_model_id=generation.model_id if generation else None,
        judge_panel_notes=judge_panel_notes,
    )
    payload = {
        "debate_id": debate.id,
        "status": "available",
        "node_ids": node_ids,
        "items": [item],
        "model_metadata": _provider_model_metadata(result, "available"),
    }
    producer = _public_metadata_text(result.provider)
    if producer:
        payload["producer"] = producer
    if provider_name and model_name:
        try:
            cache_contract = active_contract(judge_role)
        except KeyError:
            cache_contract = None
        payload.update(
            judge_lineage_metadata(
                arguer_model_id=generation.model_id if generation else None,
                judge_provider=_public_metadata_text(provider_name),
                judge_model_id=_public_metadata_text(model_name),
            )
        )
        store_scoring_cache(
            db,
            debate_id=debate.id,
            node_id=node.id,
            input_hash=input_hash,
            judge_role=judge_role,
            provider=provider_name,
            model=model_name,
            provider_metadata=payload["model_metadata"],
            status="available",
            result=payload,
            contract=cache_contract,
        )
        db.flush()
    return _with_cache_metadata(payload, hit=False, stale=stale_cache_metadata)


def score_nodes_with_provider(
    db: Session,
    debate: Debate,
    provider: ScoringProvider,
    *,
    judge_role: str = "judge",
    timeout_seconds: int = 30,
    max_nodes: int | None = DEFAULT_SCORING_MAX_NODES,
    force_refresh: bool = False,
) -> dict:
    scoring_started_at = time.perf_counter()
    node_ids = _debate_node_ids(db, debate.id)
    if not node_ids:
        return _unavailable_payload(
            debate.id,
            reason="No current debate nodes are available for scoring.",
            node_ids=[],
        )
    bounded_count = len(node_ids) if max_nodes is None else max(0, max_nodes)
    scored_node_ids = node_ids[:bounded_count]
    skipped_node_ids = node_ids[bounded_count:]
    audit_run_id: str | None = None
    if scored_node_ids and _score_nodes_will_call_provider(
        db,
        debate,
        scored_node_ids,
        provider,
        judge_role=judge_role,
        force_refresh=force_refresh,
    ):
        audit_run_id = uuid_str()
        _record_scoring_audit(
            db,
            debate,
            audit_run_id,
            event="started",
            status="running",
            provider=provider,
            judge_role=judge_role,
            requested_node_count=len(scored_node_ids),
            max_nodes=max_nodes,
            model_call_count=0,
        )
        commit_write(db)
    items: list[dict] = []
    errors: list[NodeScoringError] = [
        NodeScoringError(
            node_id=node_id,
            status="unavailable",
            reason="Scoring node limit reached.",
        )
        for node_id in skipped_node_ids
    ]
    model_metadata: dict | None = None
    cache_metadata: dict | None = None
    batch_cache_hit: bool | None = None
    model_call_count = 0
    provider_call_latencies_ms: list[int] = []
    for node_id in scored_node_ids:
        if _score_node_will_call_provider(
            db,
            debate,
            node_id,
            provider,
            judge_role=judge_role,
            force_refresh=force_refresh,
        ):
            model_call_count += 1
        try:
            node_payload = score_node_with_provider(
                db,
                debate,
                node_id,
                provider,
                judge_role=judge_role,
                timeout_seconds=timeout_seconds,
                force_refresh=force_refresh,
                provider_call_latencies_ms=provider_call_latencies_ms,
            )
            commit_write(db)
        except asyncio.CancelledError:
            errors.append(
                NodeScoringError(
                    node_id=node_id,
                    status="unavailable",
                    reason="Scoring batch was cancelled.",
                )
            )
            break
        node_cache = node_payload.get("cache") if isinstance(node_payload.get("cache"), dict) else None
        if isinstance(node_cache, dict) and isinstance(node_cache.get("hit"), bool):
            batch_cache_hit = node_cache["hit"] if batch_cache_hit is None else batch_cache_hit and node_cache["hit"]
        if cache_metadata is None and isinstance(node_cache, dict) and node_cache.get("stale"):
            cache_metadata = node_cache
        if node_payload.get("model_metadata"):
            model_metadata = node_payload["model_metadata"]
        node_items = node_payload.get("items") if isinstance(node_payload.get("items"), list) else []
        if node_items:
            items.extend(node_items)
        else:
            # score_node_with_provider surfaces its own per-node errors[]
            # (currently only the lineage-independence guard does this --
            # see NO_INDEPENDENT_JUDGE_REASON) with the precise status; fall
            # back to the generic "unavailable" synthesis (timeout,
            # ProviderError, parse failure, etc.) when it did not.
            node_errors = node_payload.get("errors") if isinstance(node_payload.get("errors"), list) else []
            propagated = next(
                (error for error in node_errors if isinstance(error, dict) and error.get("node_id") == node_id),
                None,
            )
            if propagated is not None:
                errors.append(
                    NodeScoringError(
                        node_id=node_id,
                        status=propagated.get("status", "unavailable"),
                        reason=str(propagated.get("reason") or "Scoring judge output was unavailable."),
                    )
                )
            else:
                errors.append(
                    NodeScoringError(
                        node_id=node_id,
                        status="unavailable",
                        reason=str(node_payload.get("reason") or "Scoring judge output was unavailable."),
                    )
                )
    if cache_metadata is None and batch_cache_hit is not None:
        cache_metadata = {"hit": batch_cache_hit}
    payload = scoring_result_payload(
        debate_id=debate.id,
        node_ids=node_ids,
        items=items,
        errors=errors,
        model_metadata=model_metadata,
        max_nodes=max_nodes,
        scored_node_count=len(scored_node_ids),
        skipped_node_count=len(skipped_node_ids),
        truncated=bool(skipped_node_ids),
        cache=cache_metadata,
    )
    if audit_run_id is not None:
        failed_node_count = max(0, len(errors) - len(skipped_node_ids))
        event = "failed" if not items and failed_node_count else "completed"
        _record_scoring_audit(
            db,
            debate,
            audit_run_id,
            event=event,
            status=str(payload.get("status") or "unavailable"),
            provider=provider,
            judge_role=judge_role,
            requested_node_count=len(scored_node_ids),
            scored_node_count=len(items),
            failed_node_count=failed_node_count,
            skipped_node_count=len(skipped_node_ids),
            max_nodes=max_nodes,
            truncated=bool(skipped_node_ids),
            model_call_count=model_call_count,
            latency_ms=_elapsed_latency_ms(scoring_started_at),
            provider_call_latencies_ms=provider_call_latencies_ms,
        )
    return payload


def _relink_cached_node_artifacts_to_current_job(
    db: Session,
    *,
    debate_id: str,
    node_id: str,
    input_hash: str,
) -> None:
    """Task 22 Fix B sub-cause 2: re-attribute a cache-served node's judge
    artifacts to the CURRENT scoring job.

    When a force_refresh=False pass serves a node from the NodeScoringResult
    input-hash cache, no judge call runs, so _persist_judge_output_artifact
    (which re-stamps a freshly-judged node's artifact onto the current job)
    never runs for it. But _ensure_job_has_required_judge_artifacts is job-
    scoped: it requires EVERY scored node to have a durable artifact under the
    running job's id. Without this re-stamp, a RESUMED pass (which serves the
    already-judged head nodes from cache) could never satisfy that guard for
    those head nodes, so it would fail to persist the aggregated node_scoring
    run even though every node is durably judged -- exactly the smoke3 failure
    where a partial pass left cache rows but no aggregated run, and each retry
    (force_refresh=True) restarted all nodes to re-stamp them at full judge cost.

    Only artifacts matching the node's CURRENT input_hash are moved (a stale,
    older-content artifact is never falsely re-attributed), and analyzer_run_id
    is nulled so the resuming pass's run links them -- mirroring exactly the job
    re-stamp _persist_judge_output_artifact already applies to judged nodes.
    This is a single bulk UPDATE that no-ops when the artifacts are already under
    the current job; it rides the caller's existing per-node commit_write, so it
    adds no new commit point. force_refresh=True never reaches this path (it
    bypasses the cache and re-judges).
    """
    current_job_id = _current_scoring_job_id(db, debate_id)
    if current_job_id is None:
        return
    db.execute(
        update(JudgeOutputArtifact)
        .where(
            JudgeOutputArtifact.debate_id == debate_id,
            JudgeOutputArtifact.node_id == node_id,
            JudgeOutputArtifact.input_hash == input_hash,
            or_(
                JudgeOutputArtifact.job_id.is_(None),
                JudgeOutputArtifact.job_id != current_job_id,
            ),
        )
        .values(job_id=current_job_id, analyzer_run_id=None)
        .execution_options(synchronize_session=False)
    )


def _persist_judge_output_artifact(
    db: Session,
    *,
    debate_id: str,
    node_id: str,
    input_hash: str,
    judge_role: str,
    request: ScoringProviderRequest,
    result: ScoringProviderResult,
    parse_status: str,
    parse_error: str | None,
    assessment: dict | None,
) -> JudgeOutputArtifact:
    raw_output_sha256 = hashlib.sha256(result.raw_output.encode("utf-8")).hexdigest()
    artifact = db.scalar(
        select(JudgeOutputArtifact).where(
            JudgeOutputArtifact.debate_id == debate_id,
            JudgeOutputArtifact.node_id == node_id,
            JudgeOutputArtifact.input_hash == input_hash,
            JudgeOutputArtifact.judge_role == judge_role,
            JudgeOutputArtifact.provider == result.provider,
            JudgeOutputArtifact.model == result.model,
            JudgeOutputArtifact.raw_output_sha256 == raw_output_sha256,
        )
    )
    if artifact is None:
        artifact = JudgeOutputArtifact(
            debate_id=debate_id,
            node_id=node_id,
            input_hash=input_hash,
            judge_role=judge_role,
            provider=result.provider,
            model=result.model,
            raw_output=result.raw_output,
            raw_output_sha256=raw_output_sha256,
        )
        db.add(artifact)
    current_job_id = _current_scoring_job_id(db, debate_id)
    if current_job_id is not None and artifact.job_id != current_job_id:
        artifact.job_id = current_job_id
        artifact.analyzer_run_id = None
    elif artifact.job_id is None:
        artifact.job_id = current_job_id
    artifact.prompt_version = _artifact_prompt_version(request, result)
    try:
        contract = active_contract(judge_role)
    except KeyError:
        contract = None
    if contract is not None:
        artifact.judge_id = contract.judge_id
        artifact.judge_version = contract.judge_version
        artifact.contract_hash = contract.contract_hash
    artifact.request_metadata = _private_request_metadata(request)
    artifact.parse_status = parse_status
    artifact.parse_error = _public_metadata_text(parse_error)
    artifact.assessment = assessment
    artifact.provider_metadata = _private_provider_metadata(result.metadata)
    artifact.latency_ms = _public_latency_ms(result.latency_ms)
    artifact.checked_at = _artifact_checked_at(result.checked_at)
    db.flush()
    return artifact


def _run_judge_panel(
    db: Session,
    *,
    debate: Debate,
    node: Node,
    request: ScoringProviderRequest,
    input_hash: str,
) -> list[dict]:
    """Task 6 (cross-family judge panel, docs/improvement-plan-2026-07-22.md
    §P2.2): when DIALECTICAL_JUDGE_PANEL_MODELS is set, call each configured
    secondary-family judge (in addition to the primary judge the caller
    already called above) and persist its own JudgeOutputArtifact under the
    SAME input_hash -- so _persisted_judge_evidence_for_node /
    detect_persisted_judge_disagreements / dispersion_uncertainty (all
    already generic over any number of distinct persisted (judge_role,
    provider, model) judgments sharing an input_hash) pick them up
    automatically, with zero changes to that machinery. Sequential, using
    the SAME request the primary judge scored (claim/argument_text/
    debate_question/children all identical -- only judge_role differs per
    member), just like the primary (point 6: "Panel execution sequential is
    fine").

    Returns one honest note per panel member that did NOT end up
    contributing a usable ("available") persisted judgment -- panel
    construction failures, config-time skips (build_judge_panel_members'
    own unconfigured/unavailable entries), runtime failures (call, parse,
    OR persist -- see the per-member try/except below), and parse
    failures -- folded into score_provenance.judge_panel_notes by the
    caller (_attach_plural_judge_provenance). A panel member's own
    failure/timeout/exception -- including a persistence failure, e.g. a
    transient DB error -- is caught here and never propagated: it degrades
    to the remaining judges (point 2), leaving an honest gap rather than a
    fabricated judgment or a failed scoring run, and never discards the
    primary judge's own already-persisted result.
    """
    try:
        members, notes = build_judge_panel_members()
    except Exception:  # noqa: BLE001 -- panel construction must never fail the primary scoring run (point 2)
        LOGGER.exception("judge panel construction raised unexpectedly")
        return [
            {
                "model_id": None,
                "family": None,
                "status": "exception",
                "reason": "Judge panel construction raised an unexpected error.",
            }
        ]
    notes = list(notes)
    for member in members:
        # F1 (2026-07-24 incident): release SQLite's single writer BEFORE this
        # member's up-to-120s judge CLI subprocess. By this point the primary
        # judge's JudgeOutputArtifact is flushed-but-uncommitted (the caller's
        # _persist_judge_output_artifact -> db.flush()), and so is each prior
        # panel member's -- that open write transaction holds the one writer
        # across the CLI call, starving every other writer (worker
        # heartbeats/leases, generation completion) into
        # "database is locked" 500s and freezing the coordinator. Moving the
        # call out of the savepoint alone does NOT fix it (the primary's flush
        # still holds the writer -- verified); committing here makes the
        # primary's (and each prior member's) artifact durable and drops the
        # writer, so the CLI call runs lock-free.
        #
        # Committing the primary before the panel is safe and desirable, not a
        # loss of the old begin_nested-protects-primary guarantee: per-node
        # judge artifacts are ALREADY committed incrementally (the caller
        # commit_writes after each node) and are never atomic with the
        # debate-wide node_scoring AnalyzerRun (written once per run in
        # scoring/jobs.py, its own commit) -- so a crash mid-panel leaves
        # durable artifacts + no cache row, i.e. a benign re-judge next pass,
        # exactly the failure mode the per-node commit already tolerates. The
        # input-hash cache and F2 restart recovery both compose with the
        # earlier durability.
        commit_write(db)
        # The judge CLI call and the pure parse run OUTSIDE any open write
        # transaction/savepoint (the writer was just released). Only the
        # DB-mutating persist runs inside a SAVEPOINT (db.begin_nested()): a
        # persist failure (e.g. a transient DB error) rolls back exactly this
        # member's own uncommitted work -- never the primary's or a prior
        # member's already-committed artifact -- and still degrades to the
        # remaining judges via the try/except below (a persist failure is as
        # real a panel-member failure as a timeout or a bad response).
        try:
            result = member.provider.judge_node(request)
            parsed = parse_judge_json(result.raw_output)
            parse_available = parsed.status == "available" and parsed.assessment is not None
            with db.begin_nested():
                _persist_judge_output_artifact(
                    db,
                    debate_id=debate.id,
                    node_id=node.id,
                    input_hash=input_hash,
                    judge_role=member.judge_role,
                    request=request,
                    result=result,
                    parse_status="available" if parse_available else "unavailable",
                    parse_error=None if parse_available else parsed.reason,
                    assessment=parsed.assessment.model_dump(mode="json") if parsed.assessment is not None else None,
                )
        except TimeoutError:
            LOGGER.warning("judge panel member timed out: %s", member.model_id)
            notes.append(
                {
                    "model_id": member.model_id,
                    "family": member.family,
                    "status": "timeout",
                    "reason": "Panel judge call timed out.",
                }
            )
            continue
        except ProviderError as exc:
            LOGGER.warning("judge panel member provider error for %s: %s", member.model_id, exc)
            notes.append(
                {
                    "model_id": member.model_id,
                    "family": member.family,
                    "status": "provider_error",
                    "reason": _provider_error_reason(exc, "Panel judge call failed."),
                }
            )
            continue
        except Exception:  # noqa: BLE001 -- any panel member failure (call, parse, or persist) must never fail the primary scoring run (point 2)
            LOGGER.exception("judge panel member raised unexpectedly: %s", member.model_id)
            notes.append(
                {
                    "model_id": member.model_id,
                    "family": member.family,
                    "status": "exception",
                    "reason": "Panel judge call raised an unexpected error.",
                }
            )
            continue
        if not parse_available:
            notes.append(
                {
                    "model_id": member.model_id,
                    "family": member.family,
                    "status": "parse_unavailable",
                    "reason": parsed.reason or "Panel judge output was unavailable.",
                }
            )
    if members or notes:
        log_event(
            LOGGER,
            "judge_panel.run",
            debate_id=debate.id,
            node_id=node.id,
            member_count=len(members),
            note_count=len(notes),
        )
    return notes


def _attach_plural_judge_provenance(
    db: Session,
    item: dict,
    *,
    debate_id: str,
    node_id: str,
    input_hash: str,
    claim: NormalizedClaim,
    arguer_model_id: str | None = None,
    judge_panel_notes: list[dict] | None = None,
) -> dict:
    judge_evidence = _persisted_judge_evidence_for_node(
        db,
        debate_id=debate_id,
        node_id=node_id,
        input_hash=input_hash,
    )
    next_item = dict(item)
    # Phase 8 Task 2 (calibration discounting,
    # docs/superpowers/plans/2026-07-07-phase8-calibration-discounting.md):
    # metadata is ALWAYS computed and recorded here, regardless of the
    # judge-count and regardless of the DIALECTICAL_CALIBRATION_WEIGHTS flag
    # -- this mirrors the always-on lineage/provenance recording precedent
    # from Phase 6/7. Only the score-affecting weighted-aggregate below (step
    # 3) is flag-gated. Single-judgment nodes (len(judge_evidence) < 2) still
    # get a full calibrationWeights/calibrationApplied/discountFactor block
    # (applicable: False, calibrationApplied: False) -- "aggregation not
    # applicable" is itself an honest, always-recorded fact, not an early
    # return that skips metadata (unlike judge_participation/
    # disagreement_status above, which ARE skipped below 2 judgments).
    discount_factor = float_env("DIALECTICAL_CALIBRATION_DISCOUNT_FACTOR", 0.5, 0.0, 1.0)
    calibration_flag_on = bool_env("DIALECTICAL_CALIBRATION_WEIGHTS", False)

    # Scrub model text before deriving family: `_public_metadata_text` is the
    # same scrub already applied to provider/model at every other point they
    # are used to derive a served family bucket in this file (the
    # DIALECTICAL_LINEAGE_INDEPENDENCE check at the top of
    # score_node_with_provider derives judge_family the same way:
    # lineage_family(_public_metadata_text(model_name))). judge_evidence's
    # model column is a cache-identity value on JudgeOutputArtifact (written
    # from the raw, unscrubbed ScoringProviderResult at persist time -- see
    # _persist_judge_output_artifact), so it is scrubbed here the same way
    # as every other read-site before it is used, consistent with that
    # established P6 invariant rather than inventing a new rule. The raw
    # provider/model strings themselves are never embedded in the served
    # weights list below (see comment there) -- only judge_role and the
    # derived family are.
    labeled_evidence = [
        {
            "judge_role": evidence["judge_role"],
            "family": lineage_family(_public_metadata_text(evidence["model"])),
        }
        for evidence in judge_evidence
    ]

    discount = correlated_discount(
        [{"family": labeled["family"]} for labeled in labeled_evidence],
        discount_factor=discount_factor,
    )
    # Traceability keying: judge_role + family (never raw provider/model
    # strings). judge_role is already served unscrubbed elsewhere in this
    # same metadata block (judge_participation.judge_roles below), and
    # family is a coarse, non-identifying vendor bucket (mirrors
    # judgeLineage.family) -- but raw provider/model text must NOT be
    # embedded here: an existing, unmodified regression test
    # (test_score_node_with_provider_exposes_plural_provenance_from_
    # distinct_persisted_judges in tests/test_node_scoring.py) asserts the
    # served item never contains the raw provider strings verbatim, even
    # when they carry no SECRET_METADATA_MARKERS substring (e.g.
    # "primary-provider"/"skeptic-provider" are not secrets but are still
    # never leaked into a served item today). judge_role/family alone
    # satisfy the brief's "not just bare indices, to stay legible"
    # requirement without violating that invariant.
    calibration_weights = {
        "applicable": discount["applicable"],
        "discountFactor": discount["discountFactor"],
        "effectiveWeightTotal": discount["effectiveWeightTotal"],
        "weights": [
            {
                "judge_role": labeled_evidence[entry["index"]]["judge_role"],
                "family": entry.get("family"),
                "weight": entry["weight"],
                "discounted": entry["discounted"],
                "source": judge_weight(entry.get("family"), config=None)["source"],
            }
            for entry in discount["weights"]
        ],
    }
    if "reason" in discount:
        calibration_weights["reason"] = discount["reason"]

    calibration_applied = calibration_flag_on and discount["applicable"]

    provenance = dict(next_item.get("score_provenance") or {})
    provenance["calibrationWeights"] = calibration_weights
    provenance["calibrationApplied"] = calibration_applied
    provenance["discountFactor"] = discount_factor

    # Task 6 (cross-family judge panel, docs/improvement-plan-2026-07-22.md
    # §P2.2 point 4): always recorded, mirroring the calibrationWeights
    # precedent immediately above -- "only one real judge ran" is itself an
    # honest, always-present fact (judgment_mode: "single_judgment"), not
    # something only surfaced once a panel happens to exist. judge_families
    # / sole_judge_family_matches_author use panel_vendor_family's vendor-
    # brand vocabulary (the brief's exact mapping) -- deliberately NOT
    # lineage_family's buckets used everywhere else in this function; see
    # panel_vendor_family's docstring for why these are two different
    # "family" concepts. arguer_model_id is used raw (unscrubbed), matching
    # the existing lineage_family(generation.model_id) call sites elsewhere
    # in this file (the DIALECTICAL_LINEAGE_INDEPENDENCE guards) -- only
    # judge-side model text is scrubbed via _public_metadata_text, per that
    # same precedent.
    judge_families = sorted(
        {panel_vendor_family(_public_metadata_text(evidence["model"])) for evidence in judge_evidence}
    )
    provenance["judgment_mode"] = "judge_panel" if len(judge_evidence) >= 2 else "single_judgment"
    provenance["judge_families"] = judge_families
    provenance["sole_judge_family_matches_author"] = (
        len(judge_evidence) == 1 and judge_families == [panel_vendor_family(arguer_model_id)]
    )
    if judge_panel_notes:
        provenance["judge_panel_notes"] = list(judge_panel_notes)
    next_item["score_provenance"] = provenance

    if len(judge_evidence) < 2:
        # Nothing to aggregate against -- no judge_participation/
        # disagreement_status block (existing behavior, unchanged) and
        # scores are never touched, regardless of the flag.
        return next_item

    disagreements = detect_persisted_judge_disagreements(judge_evidence)
    provenance["judge_participation"] = {
        "plural_judges": True,
        "judge_count": len(judge_evidence),
        # BINDING (orchestrator ruling): within a same-family group, WHICH
        # judgment keeps weight 1.0 (the "first occurrence") is decided by
        # the stable DB ordering in _persisted_judge_evidence_for_node --
        # judge_role asc, provider asc, model asc, created_at asc, id asc.
        # Consequence: judge_role/provider/model naming influences which
        # same-family judgment dominates the weighted aggregate below (the
        # alphabetically-first judge_role/provider/model combination in a
        # repeated family wins full weight; later same-family entries in
        # that ordering are the ones discounted). This is a deliberate,
        # recorded choice -- not an accident of iteration order.
        "judge_roles": sorted({str(evidence["judge_role"]) for evidence in judge_evidence}),
    }
    provenance["disagreement_status"] = {
        "status": "present" if disagreements else "none",
        "derived_from": "persisted_judge_artifacts",
    }
    next_item["score_provenance"] = provenance
    if disagreements:
        next_item["judge_disagreements"] = [item.model_dump(mode="json") for item in disagreements]

    if calibration_applied:
        next_item["scores"] = _weighted_aggregate_scores(claim, judge_evidence, discount["weights"])

    # Task 4 (uncertainty -> labeled drivers + dispersion-derived numeric,
    # docs/improvement-plan-2026-07-22.md Sec P2.1): dispersion_uncertainty
    # reads the same judge_evidence base (and the same distinctness rule)
    # as detect_persisted_judge_disagreements above, so this always wins
    # over the reducer's per-assessment heuristic uncertainty -- including
    # overriding the (flag-gated, off by default) calibration-weighted
    # average set just above -- whenever >=2 independent persisted judge
    # assessments exist. Left untouched (None) when they don't, leaving the
    # reducer's "heuristic" stamp and checklist value as the honest
    # fallback.
    dispersion = dispersion_uncertainty(judge_evidence)
    if dispersion is not None:
        scores = dict(next_item.get("scores") or {})
        scores["uncertainty"] = dispersion.uncertainty
        next_item["scores"] = scores
        next_item["uncertainty_source"] = "dispersion"
        # Controller design decision (reviewer follow-up): the drivers list
        # must explain the number it now sits next to. Prepended (not
        # appended) -- it is THE source of this specific numeric, so it
        # leads; the reducer's own heuristic-derived drivers (still
        # meaningful qualitative context from the most recent single
        # assessment) follow.
        existing_drivers = list(next_item.get("uncertainty_drivers") or [])
        next_item["uncertainty_drivers"] = [
            {
                "code": "judge_dispersion",
                "label": f"judges disagree (spread {dispersion.spread:.2f})",
            },
            *existing_drivers,
        ]

    return next_item


# NodeScores numeric fields that reduce_assessments produces per assessment;
# these are exactly the fields weighted-averaged by _weighted_aggregate_scores
# when DIALECTICAL_CALIBRATION_WEIGHTS is on and 2+ persisted judgments exist.
_CALIBRATION_WEIGHTED_SCORE_FIELDS = (
    "strength",
    "uncertainty",
    "impact",
    "evidence_quality",
    "relevance",
    "logical_validity",
    "assumption_risk",
    "counter_resilience",
)


def _weighted_aggregate_scores(
    claim: NormalizedClaim,
    judge_evidence: list[dict],
    weights: list[dict],
) -> dict:
    """Re-run reduce_assessments once per historical persisted judgment and
    return the correlated_discount-weighted average of each NodeScores
    numeric field.

    There is no existing multi-assessment reducer (reduce_assessments takes
    exactly one ClaimAssessment) -- this recomputes N single-assessment
    NodeScoringPayload.scores objects from the SAME already-fetched
    judge_evidence list (no second query), then takes a flat weighted mean
    of each numeric field using the weights correlated_discount already
    computed (same weights recorded in calibrationWeights, so the served
    score and the recorded provenance are always consistent with each
    other). Only called when the flag is on and discounting is applicable;
    callers must leave item["scores"] untouched otherwise.
    """
    weight_by_index = {entry["index"]: entry["weight"] for entry in weights}
    totals = {field: 0.0 for field in _CALIBRATION_WEIGHTED_SCORE_FIELDS}
    weight_total = 0.0
    for index, evidence in enumerate(judge_evidence):
        assessment = ClaimAssessment.model_validate(evidence["assessment"])
        scores = reduce_assessments(claim, assessment).scores
        weight = weight_by_index.get(index, 1.0)
        weight_total += weight
        for field in _CALIBRATION_WEIGHTED_SCORE_FIELDS:
            totals[field] += weight * getattr(scores, field)
    if weight_total <= 0.0:
        # Unreachable in practice (correlated_discount always returns a
        # positive effectiveWeightTotal for 2+ items) but fail closed rather
        # than divide by zero or fabricate a score if that invariant is ever
        # broken: serve the plain unweighted mean instead of crashing.
        weight_total = float(len(judge_evidence))
    return {field: round(totals[field] / weight_total, 4) for field in _CALIBRATION_WEIGHTED_SCORE_FIELDS}


def _persisted_judge_evidence_for_node(
    db: Session,
    *,
    debate_id: str,
    node_id: str,
    input_hash: str,
) -> list[dict]:
    artifacts = db.scalars(
        select(JudgeOutputArtifact)
        .where(
            JudgeOutputArtifact.debate_id == debate_id,
            JudgeOutputArtifact.node_id == node_id,
            JudgeOutputArtifact.input_hash == input_hash,
            JudgeOutputArtifact.parse_status == "available",
            JudgeOutputArtifact.assessment.is_not(None),
        )
        .order_by(
            JudgeOutputArtifact.judge_role.asc(),
            JudgeOutputArtifact.provider.asc(),
            JudgeOutputArtifact.model.asc(),
            JudgeOutputArtifact.created_at.asc(),
            JudgeOutputArtifact.id.asc(),
        )
    ).all()
    evidence: list[dict] = []
    seen_identities: set[tuple[str, str, str]] = set()
    seen_outputs: set[str] = set()
    for artifact in artifacts:
        identity = (artifact.judge_role, artifact.provider, artifact.model)
        if identity in seen_identities or artifact.raw_output_sha256 in seen_outputs:
            continue
        evidence.append(
            {
                "judge_role": artifact.judge_role,
                "provider": artifact.provider,
                "model": artifact.model,
                "raw_output_sha256": artifact.raw_output_sha256,
                "assessment": artifact.assessment,
            }
        )
        seen_identities.add(identity)
        seen_outputs.add(artifact.raw_output_sha256)
    return evidence


def _current_scoring_job_id(db: Session, debate_id: str) -> str | None:
    job = db.scalars(
        select(Job)
        .where(
            Job.debate_id == debate_id,
            Job.job_type == SCORING_JOB_TYPE,
            Job.status.in_(ACTIVE_SCORING_JOB_STATUSES | {"complete"}),
        )
        .order_by(Job.created_at.desc(), Job.id.desc())
        .limit(1)
    ).first()
    return job.id if job is not None else None


def _artifact_prompt_version(request: ScoringProviderRequest, result: ScoringProviderResult) -> str | None:
    metadata_prompt_version = result.metadata.get("prompt_version") if isinstance(result.metadata, dict) else None
    return _public_metadata_text(metadata_prompt_version) or _public_metadata_text(request.prompt_version)


def _private_request_metadata(request: ScoringProviderRequest) -> dict:
    metadata: dict[str, object] = {
        "prompt_version": request.prompt_version,
        "timeout_seconds": request.timeout_seconds,
    }
    if request.metadata:
        metadata["metadata"] = _private_provider_metadata(request.metadata)
    return {key: value for key, value in metadata.items() if value not in (None, {}, [])}


def _private_provider_metadata(value: object) -> dict:
    if not isinstance(value, dict):
        return {}
    allowed_keys = {
        "id",
        "provider_response_id",
        "response_id",
        "request_id",
        "model",
        "provider",
        "finish_reason",
        "stop_reason",
        "usage",
        "input_tokens",
        "output_tokens",
        "total_tokens",
    }
    sanitized: dict[str, object] = {}
    for key, item in value.items():
        if not isinstance(key, str) or key not in allowed_keys:
            continue
        sanitized_item = _private_metadata_value(item)
        if sanitized_item is not None:
            sanitized[key] = sanitized_item
    return sanitized


def _private_metadata_value(value: object) -> object | None:
    if isinstance(value, str):
        return _public_metadata_text(value)
    if isinstance(value, bool) or value is None:
        return value
    if isinstance(value, int | float):
        return value
    if isinstance(value, list):
        sanitized_list = [_private_metadata_value(item) for item in value]
        return [item for item in sanitized_list if item is not None]
    if isinstance(value, dict):
        return _private_provider_metadata(value)
    return None


def _artifact_checked_at(value: object) -> datetime:
    if isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            parsed = None
        if parsed is not None:
            return parsed if parsed.tzinfo is not None else parsed.replace(tzinfo=timezone.utc)
    return now_utc()


class RegistryScoringProvider:
    def __init__(self, registry: ProviderRegistry, *, judge_role: str = "judge") -> None:
        status = detect_scoring_provider_config(
            registry.agents,
            role=judge_role,
            providers=registry.providers,
        )
        if not status.available or status.provider is None or status.model is None:
            raise ProviderError(status.reason or "No scoring provider is configured.")
        self.registry = registry
        self.judge_role = judge_role
        self.provider = status.provider
        self.model = status.model

    def judge_node(self, request: ScoringProviderRequest) -> ScoringProviderResult:
        provider = self.registry.providers[self.provider]
        direct_judge_node = getattr(provider, "judge_node", None)
        if callable(direct_judge_node):
            return direct_judge_node(request)
        try:
            response = self.registry.generate_for_role(
                self.judge_role,
                render_single_node_judge_prompt(request),
                response_format="json",
            )
        except KeyError as exc:
            raise ProviderError("Configured scoring provider is unavailable.") from exc
        return ScoringProviderResult(
            provider=self.provider,
            model=self.model,
            raw_output=response.text,
            checked_at=now_utc().isoformat(),
            metadata=response.raw,
        )


def score_debate_with_provider_registry(
    db: Session,
    debate: Debate,
    registry: ProviderRegistry,
    *,
    judge_role: str = "judge",
    timeout_seconds: int = 30,
    max_nodes: int | None = DEFAULT_SCORING_MAX_NODES,
    force_refresh: bool = False,
) -> dict:
    node_ids = _debate_node_ids(db, debate.id)
    try:
        provider = RegistryScoringProvider(registry, judge_role=judge_role)
    except ProviderError as exc:
        return _unavailable_payload(
            debate.id,
            reason=str(exc) or "No scoring provider is configured.",
            node_ids=node_ids,
        )
    return score_nodes_with_provider(
        db,
        debate,
        provider,
        judge_role=judge_role,
        timeout_seconds=timeout_seconds,
        max_nodes=max_nodes,
        force_refresh=force_refresh,
    )


def ensure_node_scoring_on_completion(
    db: Session,
    debate: Debate,
    node: Node,
    registry: ProviderRegistry,
    *,
    judge_role: str = "judge",
) -> dict:
    node_ids = _debate_node_ids(db, debate.id)
    if node.debate_id != debate.id or node.id not in set(node_ids):
        return scoring_result_payload(
            debate_id=debate.id,
            node_ids=node_ids,
            items=[],
            errors=[
                NodeScoringError(
                    node_id=node.id,
                    status="unavailable",
                    reason="Completed scoring node is not current in this debate.",
                )
            ],
        )
    generation = db.get(Generation, node.active_generation_id) if node.active_generation_id else None
    claim = normalize_claim(node_id=node.id, raw_text=node.claim)
    input_hash = node_scoring_input_hash(
        claim=claim,
        argument_text=generation.argument if generation else None,
        debate_question=debate.topic,
        children=_node_children_for_judge(db, node.id),
    )
    _expire_stale_scoring_jobs(db, debate.id)
    config = detect_scoring_provider_config(
        registry.agents,
        role=judge_role,
        providers=registry.providers,
    )
    if not config.available or config.provider is None or config.model is None:
        fail_unavailable_scoring_job(db, debate, model_id=config.model or "", judge_role=judge_role)
        return scoring_result_payload(
            debate_id=debate.id,
            node_ids=node_ids,
            items=[],
            errors=[
                NodeScoringError(
                    node_id=node.id,
                    status="unavailable",
                    reason="No scoring provider is configured.",
                )
            ],
        )

    # Phase 6 Task 2: lineage-independence enforcement guard, feature-flagged
    # OFF by default. Enforcement only -- lineage *recording* (judgeLineage/
    # arguerLineage/independent) always happens regardless of this flag, at
    # the score_node_with_provider write sites (Task 1).
    #
    # No rotation across judge candidates exists or is implemented here (v1
    # has a single configured judge system-wide -- see the module-level
    # comment on NO_INDEPENDENT_JUDGE_REASON above). This is a binary
    # block/proceed guard: same lineage on both known sides blocks; anything
    # else proceeds.
    #
    # Judgment call (flagged for product sign-off before wider rollout):
    # unknown arguer lineage does NOT block. The honesty law here is about
    # never FABRICATING independence, not about blocking on ignorance --
    # blocking on an unknown would be more conservative, but nothing proves
    # dependence when the arguer lineage is unknown, so the recorded
    # `independent: null` already surfaces the uncertainty honestly.
    if bool_env("DIALECTICAL_LINEAGE_INDEPENDENCE", False):
        arguer_family = lineage_family(generation.model_id if generation else None)
        judge_family = lineage_family(config.model)
        if arguer_family is not None and judge_family is not None and arguer_family == judge_family:
            fail_unavailable_scoring_job(
                db,
                debate,
                model_id=config.model,
                judge_role=judge_role,
                reason=NO_INDEPENDENT_JUDGE_REASON,
            )
            return scoring_result_payload(
                debate_id=debate.id,
                node_ids=node_ids,
                items=[],
                errors=[
                    NodeScoringError(
                        node_id=node.id,
                        status="no_independent_judge",
                        reason=NO_INDEPENDENT_JUDGE_REASON,
                    )
                ],
            )

    # Contract-keyed cache lane (mirrors store_scoring_cache/lookup_scoring_cache):
    # a row stamped with a different judge contract is historical, never a
    # current hit — completion scoring must queue fresh work instead.
    try:
        completion_contract = active_contract(judge_role)
    except KeyError:
        completion_contract = None
    completion_contract_condition = (
        NodeScoringResult.contract_hash == completion_contract.contract_hash
        if completion_contract is not None
        else NodeScoringResult.contract_hash.is_(None)
    )
    cached_result = db.scalar(
        select(NodeScoringResult)
        .where(
            NodeScoringResult.debate_id == debate.id,
            NodeScoringResult.node_id == node.id,
            NodeScoringResult.input_hash == input_hash,
            NodeScoringResult.judge_role == judge_role,
            NodeScoringResult.provider == config.provider,
            NodeScoringResult.model == config.model,
            completion_contract_condition,
        )
        .order_by(NodeScoringResult.updated_at.desc(), NodeScoringResult.created_at.desc(), NodeScoringResult.id.desc())
    )
    if cached_result is not None and isinstance(cached_result.result, dict):
        return _with_cache_metadata(cached_result.result, hit=True)

    active_job = _active_scoring_job(db, debate.id, newer_than=None)
    if active_job is None:
        active_job = queue_scoring_job(db, debate, model_id=config.model, judge_role=judge_role)
    return _attach_active_scoring_job(
        scoring_result_payload(
            debate_id=debate.id,
            node_ids=node_ids,
            items=[],
            errors=[],
            pending=[
                NodeScoringPending(
                    node_id=node.id,
                    status="pending",
                    reason="Scoring has been queued for this node.",
                )
            ],
        ),
        active_job,
    )


def scoring_result_payload(
    *,
    debate_id: str,
    node_ids: list[str],
    items: list[dict],
    errors: list[NodeScoringError],
    pending: list[NodeScoringPending] | None = None,
    reason: str | None = None,
    model_metadata: dict | None = None,
    max_nodes: int | None = None,
    scored_node_count: int | None = None,
    skipped_node_count: int | None = None,
    truncated: bool | None = None,
    cache: dict | None = None,
) -> dict:
    serialized_errors = [error.model_dump(mode="json") for error in errors]
    serialized_pending = [item.model_dump(mode="json") for item in pending or []]
    if items and (serialized_errors or serialized_pending):
        status = "partial"
        default_reason = (
            "Some scoring checks are pending or unavailable."
            if serialized_pending
            else "Some scoring checks were unavailable."
        )
    elif items:
        status = "available"
        default_reason = None
    else:
        status = "unavailable"
        default_reason = _unavailable_result_reason(errors, pending or [])
    payload = {
        "debate_id": debate_id,
        "status": status,
        "node_ids": node_ids,
        "items": items,
    }
    if serialized_errors:
        payload["errors"] = serialized_errors
    if serialized_pending:
        payload["pending"] = serialized_pending
    final_reason = reason if reason is not None else default_reason
    if final_reason:
        payload["reason"] = final_reason
    if model_metadata is not None:
        payload["model_metadata"] = model_metadata
    if max_nodes is not None:
        payload["max_nodes"] = max_nodes
    if scored_node_count is not None:
        payload["scored_node_count"] = scored_node_count
    if skipped_node_count is not None:
        payload["skipped_node_count"] = skipped_node_count
    if truncated is not None:
        payload["truncated"] = truncated
    if cache is not None:
        payload["cache"] = cache
    return payload


def _public_scoring_item(item: object) -> dict:
    payload = NodeScoringPayload.model_validate(item).model_dump(mode="json")
    debug = payload.get("debug")
    if isinstance(debug, dict) and "judge_outputs" in debug:
        payload["debug"] = {key: value for key, value in debug.items() if key != "judge_outputs"}
        debug = payload["debug"]
    if isinstance(debug, dict):
        reducer_version = _public_metadata_text(debug.get("reducer_version"))
        rubric_version = _public_metadata_text(debug.get("rubric_version"))
        if reducer_version is None or rubric_version is None:
            payload["debug"] = None
        else:
            payload["debug"] = {
                "reducer_version": reducer_version,
                "rubric_version": rubric_version,
            }
    return payload


def _public_scoring_errors(errors: list[object]) -> list[dict]:
    public_errors: list[dict] = []
    for error in errors:
        try:
            node_error = NodeScoringError.model_validate(error)
        except ValidationError:
            continue
        reason = _public_metadata_text(node_error.reason)
        if reason is None:
            continue
        public_errors.append(
            NodeScoringError(
                node_id=node_error.node_id,
                status=node_error.status,
                reason=reason,
            ).model_dump(mode="json")
        )
    return public_errors


def _public_scoring_pending(pending: list[object]) -> list[dict]:
    public_pending: list[dict] = []
    for item in pending:
        try:
            node_pending = NodeScoringPending.model_validate(item)
        except ValidationError:
            continue
        reason = _public_metadata_text(node_pending.reason)
        if reason is None:
            continue
        public_pending.append(
            NodeScoringPending(
                node_id=node_pending.node_id,
                status=node_pending.status,
                reason=reason,
            ).model_dump(mode="json")
        )
    return public_pending


def _with_current_node_coverage(payload: dict, node_ids: list[str], active_job: Job | None) -> dict:
    current_node_ids = set(node_ids)
    next_payload = dict(payload)
    next_payload["node_ids"] = node_ids
    raw_items = next_payload.get("items")
    raw_errors = next_payload.get("errors")
    raw_pending = next_payload.get("pending")
    items = [
        item
        for item in (raw_items if isinstance(raw_items, list) else [])
        if isinstance(item, dict) and isinstance(item.get("node_id"), str) and item["node_id"] in current_node_ids
    ]
    errors = [
        error
        for error in (raw_errors if isinstance(raw_errors, list) else [])
        if isinstance(error, dict) and isinstance(error.get("node_id"), str) and error["node_id"] in current_node_ids
    ]
    pending = [
        item
        for item in (raw_pending if isinstance(raw_pending, list) else [])
        if isinstance(item, dict) and isinstance(item.get("node_id"), str) and item["node_id"] in current_node_ids
    ]
    covered_node_ids = {
        item["node_id"]
        for collection in (items, errors, pending)
        for item in collection
        if isinstance(item.get("node_id"), str)
    }
    missing_node_ids = [node_id for node_id in node_ids if node_id not in covered_node_ids]
    if missing_node_ids:
        if active_job is not None:
            pending_status = _public_scoring_job_status(active_job.status)
            reason = (
                "Scoring is running for this node."
                if pending_status == "running"
                else "Scoring is queued for this node."
            )
            pending.extend(
                {
                    "node_id": node_id,
                    "status": "pending",
                    "reason": reason,
                }
                for node_id in missing_node_ids
            )
        else:
            if items or errors or pending:
                errors.extend(
                    {
                        "node_id": node_id,
                        "status": "unavailable",
                        "reason": "Stored scoring output has no result for this current node.",
                    }
                    for node_id in missing_node_ids
                )
    next_payload["items"] = items
    if errors:
        next_payload["errors"] = errors
    else:
        next_payload.pop("errors", None)
    if pending:
        next_payload["pending"] = pending
    else:
        next_payload.pop("pending", None)
    if items and (errors or pending):
        next_payload["status"] = "partial"
        next_payload.setdefault("reason", "Some scoring checks are pending or unavailable.")
    elif items:
        if next_payload.get("status") not in {"partial", "unavailable"}:
            next_payload["status"] = "available"
    else:
        next_payload["status"] = "unavailable"
        next_payload.setdefault("reason", _unavailable_result_reason(
            [NodeScoringError.model_validate(error) for error in errors],
            [NodeScoringPending.model_validate(item) for item in pending],
        ))
    return next_payload


def _unavailable_result_reason(errors: list[NodeScoringError], pending: list[NodeScoringPending] | None = None) -> str:
    for error in errors:
        if error.reason != "Scoring node limit reached.":
            return error.reason
    if errors:
        return errors[0].reason
    for item in pending or []:
        if item.reason:
            return item.reason
    return "No scoring judge outputs are available for this debate."


def _unavailable_payload(
    debate_id: str,
    *,
    reason: str = "No scoring judge outputs are available for this debate.",
    node_ids: list[str] | None = None,
    model_metadata: dict | None = None,
) -> dict:
    payload = {
        "debate_id": debate_id,
        "status": "unavailable",
        "reason": reason,
        "node_ids": node_ids or [],
        "items": [],
    }
    if model_metadata is not None:
        payload["model_metadata"] = model_metadata
    return payload


def _active_scoring_job(db: Session, debate_id: str, *, newer_than) -> Job | None:
    _expire_stale_scoring_jobs(db, debate_id)
    query = select(Job).where(
        Job.debate_id == debate_id,
        Job.job_type == SCORING_JOB_TYPE,
        Job.status.in_(ACTIVE_SCORING_JOB_STATUSES),
        Job.deadline >= now_utc(),
    )
    if newer_than is not None:
        query = query.where(Job.created_at >= newer_than)
    return db.scalars(query.order_by(Job.created_at.desc(), Job.id.desc()).limit(1)).first()


def _expire_stale_scoring_jobs(db: Session, debate_id: str) -> None:
    stale_jobs = db.scalars(
        select(Job).where(
            Job.debate_id == debate_id,
            Job.job_type == SCORING_JOB_TYPE,
            Job.status.in_(ACTIVE_SCORING_JOB_STATUSES),
            Job.deadline < now_utc(),
        )
    ).all()
    for job in stale_jobs:
        record_job_transition(
            db,
            job,
            from_status=job.status,
            to_status="failed",
            channel="scoring_stale",
            reason=STALE_SCORING_JOB_ERROR,
        )
        job.status = "failed"
        job.error = STALE_SCORING_JOB_ERROR
    if stale_jobs:
        commit_write(db)


def _public_scoring_job_status(status: str) -> str:
    if status == "pending":
        return "queued"
    if status in {"claimed", "running"}:
        return "running"
    if status in {"complete", "failed"}:
        return status
    return "failed"


def _attach_active_scoring_job(payload: dict, job: Job | None) -> dict:
    if job is None:
        return payload
    next_payload = dict(payload)
    next_payload["active_scoring_job_id"] = job.id
    next_payload["active_scoring_job_status"] = _public_scoring_job_status(job.status)
    if not next_payload.get("items"):
        next_payload["reason"] = "Judge outputs are being generated."
        next_payload.pop("errors", None)
    return next_payload


def _provider_error_reason(exc: Exception, fallback: str) -> str:
    public_reason = _public_metadata_text(str(exc))
    if public_reason:
        return f"{fallback.rstrip('.')}: {public_reason}"
    return fallback


def get_debate_scoring(db: Session, debate_id: str) -> dict | None:
    debate = db.get(Debate, debate_id)
    if not debate or debate.status == "archived":
        return None
    return debate_scoring_payload(db, debate)


def attach_feedback_to_scoring_payload(db: Session, payload: dict, *, raw_user_token: str | None = None) -> dict:
    node_ids = [node_id for node_id in payload.get("node_ids") or [] if isinstance(node_id, str)]
    if not node_ids:
        return payload
    feedback_summary = feedback_summary_for_nodes(db, node_ids)
    current_user_votes = current_feedback_votes_for_nodes(db, node_ids, raw_user_token=raw_user_token)
    if not feedback_summary and not current_user_votes:
        return payload
    next_payload = dict(payload)
    if feedback_summary:
        next_payload["feedback_summary"] = feedback_summary
    if current_user_votes:
        next_payload["current_user_votes"] = current_user_votes
    return next_payload


def feedback_summary_for_nodes(db: Session, node_ids: list[str]) -> list[dict]:
    if not node_ids:
        return []
    rows = db.execute(
        select(NodeFeedbackVote.node_id, NodeFeedbackVote.vote, func.count(NodeFeedbackVote.id))
        .where(NodeFeedbackVote.node_id.in_(node_ids))
        .group_by(NodeFeedbackVote.node_id, NodeFeedbackVote.vote)
    ).all()
    counts = {node_id: {"node_id": node_id, "up": 0, "down": 0} for node_id in node_ids}
    for node_id, vote, count in rows:
        if node_id in counts and vote in {"up", "down"}:
            counts[node_id][vote] = int(count)
    return [counts[node_id] for node_id in node_ids if counts[node_id]["up"] or counts[node_id]["down"]]


def current_feedback_votes_for_nodes(
    db: Session,
    node_ids: list[str],
    *,
    raw_user_token: str | None,
) -> list[dict]:
    if not node_ids or raw_user_token is None:
        return []
    user_identity_hash = NodeFeedbackVote.hash_user_identity(raw_user_token)
    votes = db.scalars(
        select(NodeFeedbackVote)
        .where(
            NodeFeedbackVote.node_id.in_(node_ids),
            NodeFeedbackVote.user_identity_hash == user_identity_hash,
        )
        .order_by(NodeFeedbackVote.node_id.asc())
    ).all()
    vote_by_node = {vote.node_id: vote.vote for vote in votes}
    return [{"node_id": node_id, "vote": vote_by_node[node_id]} for node_id in node_ids if node_id in vote_by_node]


def get_adaptive_depth_dry_run(db: Session, debate_id: str) -> dict | None:
    scoring_payload = get_debate_scoring(db, debate_id)
    if scoring_payload is None:
        return None
    if scoring_payload.get("status") not in {"available", "partial"}:
        return _adaptive_depth_unavailable_payload(
            debate_id,
            reason=str(scoring_payload.get("reason") or "No scoring judge outputs are available for this debate."),
        )
    items = scoring_payload.get("items")
    if not isinstance(items, list) or not items:
        return _adaptive_depth_unavailable_payload(
            debate_id,
            reason="No scoring judge outputs are available for this debate.",
        )
    plan = adaptive_depth_dry_run(
        [NodeScoringPayload.model_validate(item) for item in items],
        policy=AdaptiveDepthPolicy(mode="adaptive"),
    )
    return {
        "debate_id": debate_id,
        "status": scoring_payload["status"],
        "plan": plan.model_dump(mode="json"),
    }


def record_approved_adaptive_expansion(
    db: Session,
    debate: Debate,
    selected_items: list[AdaptiveDepthDryRunItem],
    *,
    approval_reason: str | None = None,
) -> ProvenanceRecord:
    node_ids = _debate_node_ids(db, debate.id)
    debate_node_ids = set(node_ids)
    selected_node_ids = [item.node_id for item in selected_items]
    unknown_node_ids = [node_id for node_id in selected_node_ids if node_id not in debate_node_ids]
    if unknown_node_ids:
        raise ValueError("Adaptive expansion audit references nodes outside the debate.")

    metadata = {
        "event": "approved",
        "status": "approved",
        "source": "adaptive_depth",
        "selected_node_ids": selected_node_ids,
        "selected_node_count": len(selected_node_ids),
        "reason_summaries": [_adaptive_expansion_reason_summary(item) for item in selected_items],
    }
    public_approval_reason = _public_metadata_text(approval_reason)
    if public_approval_reason:
        metadata["approval_reason"] = public_approval_reason
    record = ProvenanceRecord(
        debate_id=debate.id,
        branch_id=None,
        artifact_kind="adaptive_expansion",
        artifact_id=uuid_str(),
        model_id="",
        worker_id="",
        prompt_id="",
        job_id=None,
        metadata_json=metadata,
    )
    db.add(record)
    flush_write(db)
    return record


def _debate_node_ids(db: Session, debate_id: str) -> list[str]:
    # T2 (P0.5): exclude dead placeholders in addition to stale ones -- a
    # node whose generation exhausted every pool model (status="failed") is
    # a permanent terminal state (no code path ever resets status away from
    # "failed") and must never be judged: it wastes a judge call and
    # produces a misleading strength chip on a claim that is nothing but
    # its bare placeholder label.
    #
    # Deliberately NOT excluded on path_status=="abandoned" (controller
    # decision after Task 2 self-review, see task-2-report.md's "Concerns"
    # section): an abandoned-but-status=="complete" node (a real, generated
    # PRO/CON/ROOT_CLAIM argument the exploration-policy lifecycle set
    # aside) must keep flowing through scoring, because
    # reevaluate_lifecycle_after_scoring_completion's "reopen" decision
    # (exploration/policy.py) only ever reconsiders a node that was just
    # freshly scored in the completed run -- excluding abandoned-but-live
    # nodes here would make that lifecycle's reopen path permanently
    # unreachable (P3 of the plan depends on it staying reachable). Re-
    # selecting them is cheap: NodeScoringResult's contract-hash cache
    # serves an unchanged claim/argument straight from cache rather than
    # re-invoking the judge.
    return list(
        db.scalars(
            select(Node.id)
            .where(
                Node.debate_id == debate_id,
                Node.status != "stale",
                Node.status != "failed",
            )
            .order_by(Node.materialized_path.asc(), Node.depth.asc(), Node.position.asc(), Node.id.asc())
        ).all()
    )


def _adaptive_expansion_reason_summary(item: AdaptiveDepthDryRunItem) -> dict:
    return {
        "node_id": item.node_id,
        "pressure": item.pressure,
        "score": item.score,
        "recommended_action": item.recommended_action,
        "expansion_hint": item.expansion_hint,
        "reasons": [_public_metadata_text(reason) for reason in item.reasons if _public_metadata_text(reason)],
        "hole_count": item.hole_count,
        "recommended_investigation_count": item.recommended_investigation_count,
    }


def _score_nodes_will_call_provider(
    db: Session,
    debate: Debate,
    node_ids: list[str],
    provider: ScoringProvider,
    *,
    judge_role: str,
    force_refresh: bool,
) -> bool:
    return any(
        _score_node_will_call_provider(
            db,
            debate,
            node_id,
            provider,
            judge_role=judge_role,
            force_refresh=force_refresh,
        )
        for node_id in node_ids
    )


def _score_node_will_call_provider(
    db: Session,
    debate: Debate,
    node_id: str,
    provider: ScoringProvider,
    *,
    judge_role: str,
    force_refresh: bool,
) -> bool:
    provider_name = getattr(provider, "provider", None)
    model_name = getattr(provider, "model", None)
    if force_refresh or not provider_name or not model_name:
        return True
    node = db.get(Node, node_id)
    if node is None:
        return False
    generation = db.get(Generation, node.active_generation_id) if node.active_generation_id else None
    claim = normalize_claim(node_id=node.id, raw_text=node.claim)
    argument_text = generation.argument if generation else None
    try:
        will_call_contract = active_contract(judge_role)
    except KeyError:
        will_call_contract = None
    cached_payload = lookup_scoring_cache(
        db,
        debate_id=debate.id,
        node_id=node.id,
        input_hash=node_scoring_input_hash(
            claim=claim,
            argument_text=argument_text,
            debate_question=debate.topic,
            children=_node_children_for_judge(db, node.id),
        ),
        judge_role=judge_role,
        contract_hash=will_call_contract.contract_hash if will_call_contract is not None else None,
        provider=provider_name,
        model=model_name,
    )
    return cached_payload is None


def _record_scoring_audit(
    db: Session,
    debate: Debate,
    audit_run_id: str,
    *,
    event: str,
    status: str,
    provider: ScoringProvider,
    judge_role: str,
    requested_node_count: int,
    max_nodes: int | None,
    scored_node_count: int | None = None,
    failed_node_count: int | None = None,
    skipped_node_count: int | None = None,
    truncated: bool | None = None,
    model_call_count: int | None = None,
    latency_ms: int | None = None,
    provider_call_latencies_ms: list[int] | None = None,
) -> None:
    provider_name = _public_metadata_text(getattr(provider, "provider", None))
    model_name = _public_metadata_text(getattr(provider, "model", None))
    metadata = {
        "event": event,
        "status": status,
        "provider": provider_name,
        "model": model_name,
        "judge_role": judge_role,
        "requested_node_count": requested_node_count,
    }
    if max_nodes is not None:
        metadata["max_nodes"] = max_nodes
    if scored_node_count is not None:
        metadata["scored_node_count"] = scored_node_count
    if failed_node_count is not None:
        metadata["failed_node_count"] = failed_node_count
    if skipped_node_count is not None:
        metadata["skipped_node_count"] = skipped_node_count
    if truncated is not None:
        metadata["truncated"] = truncated
    if model_call_count is not None:
        metadata["model_call_count"] = model_call_count
    if provider_call_latencies_ms:
        metadata["provider_call_latencies_ms"] = provider_call_latencies_ms
        metadata["provider_latency_ms"] = sum(provider_call_latencies_ms)
    public_latency_ms = _public_latency_ms(latency_ms)
    if public_latency_ms is not None:
        metadata["latency_ms"] = public_latency_ms
    db.add(
        ProvenanceRecord(
            debate_id=debate.id,
            branch_id=None,
            artifact_kind="scoring_run",
            artifact_id=audit_run_id,
            model_id=model_name or "",
            worker_id="",
            prompt_id="",
            job_id=None,
            metadata_json=metadata,
        )
    )
    flush_write(db)


def _elapsed_latency_ms(started_at: float) -> int:
    return max(0, int((time.perf_counter() - started_at) * 1000))


def _public_latency_ms(value: object) -> int | None:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        return None
    return value


def _provider_model_metadata(result: ScoringProviderResult, status: ScoringStatus) -> dict:
    return ScoringModelMetadata(
        provider=_public_metadata_text(result.provider),
        model=_public_metadata_text(result.model),
        checked_at=_public_metadata_text(result.checked_at) or now_utc().isoformat(),
        status=status,
    ).model_dump(mode="json")


def _public_model_metadata(value: object) -> dict | None:
    if not isinstance(value, dict):
        return None
    try:
        metadata = ScoringModelMetadata.model_validate(value)
    except ValidationError:
        return None
    return ScoringModelMetadata(
        provider=_public_metadata_text(metadata.provider),
        model=_public_metadata_text(metadata.model),
        checked_at=_public_metadata_text(metadata.checked_at),
        status=metadata.status,
    ).model_dump(mode="json")


def _with_cache_metadata(payload: dict, *, hit: bool, stale: dict | None = None) -> dict:
    cache = {"hit": hit}
    if stale is not None:
        cache["stale"] = stale
    return {**payload, "cache": cache}


def _adaptive_depth_unavailable_payload(debate_id: str, *, reason: str) -> dict:
    plan = adaptive_depth_dry_run([], policy=AdaptiveDepthPolicy(mode="adaptive"))
    return {
        "debate_id": debate_id,
        "status": "unavailable",
        "reason": reason,
        "plan": plan.model_dump(mode="json"),
    }
