from __future__ import annotations

import asyncio
import time

from sqlalchemy import select
from sqlalchemy.orm import Session
from pydantic import ValidationError

from app.core.write_lock import commit_write, flush_write
from app.models.entities import AnalyzerRun, Debate, Generation, Node, ProvenanceRecord, now_utc, uuid_str
from app.providers import ProviderError, ProviderRegistry, detect_scoring_provider_config
from app.scoring.cache import (
    lookup_scoring_cache,
    lookup_stale_scoring_cache_metadata,
    node_scoring_input_hash,
    store_scoring_cache,
)
from app.scoring.judges import ScoringProvider, ScoringProviderRequest, ScoringProviderResult
from app.scoring.models import (
    AdaptiveDepthDryRunItem,
    AdaptiveDepthPolicy,
    NodeScoringError,
    NodeScoringPayload,
    ScoringModelMetadata,
    ScoringStatus,
    ScoringStatusModel,
)
from app.scoring.normalizer import normalize_claim
from app.scoring.parser import parse_judge_json
from app.scoring.prompts import render_single_node_judge_prompt
from app.scoring.reducer import adaptive_depth_dry_run, reduce_assessments
from app.services.orchestrator import create_job


SCORING_ANALYZER_TYPE = "node_scoring"
SCORING_JOB_TYPE = "score_debate"
JUDGE_OUTPUT_SOURCE = "judge_outputs"
DEFAULT_SCORING_MAX_NODES = 12
SECRET_METADATA_MARKERS = (
    "api_key",
    "apikey",
    "authorization",
    "bearer ",
    "client_secret",
    "password",
    "secret",
    "token",
    "--api-key",
    "--token",
    "key=",
    "token=",
)


def queue_scoring_job(db: Session, debate: Debate, *, model_id: str, judge_role: str = "judge"):
    job = create_job(db, debate.id, SCORING_JOB_TYPE, judge_role, None, required_model=model_id)
    flush_write(db)
    return job


def debate_scoring_payload(db: Session, debate: Debate) -> dict:
    node_ids = _debate_node_ids(db, debate.id)
    run = db.scalars(
        select(AnalyzerRun)
        .where(
            AnalyzerRun.debate_id == debate.id,
            AnalyzerRun.analyzer_type == SCORING_ANALYZER_TYPE,
            AnalyzerRun.status == "complete",
        )
        .order_by(AnalyzerRun.created_at.desc(), AnalyzerRun.id.desc())
        .limit(1)
    ).first()
    if not run:
        return _unavailable_payload(debate.id, node_ids=node_ids)
    if not isinstance(run.provenance, dict) or run.provenance.get("scoring_source") != JUDGE_OUTPUT_SOURCE:
        return _unavailable_payload(
            debate.id,
            reason="Stored scoring output was not produced by judge outputs.",
            node_ids=node_ids,
        )

    output = run.output if isinstance(run.output, dict) else {}
    items = output.get("items")
    if not isinstance(items, list):
        return _unavailable_payload(
            debate.id,
            reason="Stored scoring output is missing an items array.",
            node_ids=node_ids,
        )
    try:
        validated_items = [_public_scoring_item(item) for item in items]
    except ValidationError:
        return _unavailable_payload(
            debate.id,
            reason="Stored scoring output contains malformed node scoring items.",
            node_ids=node_ids,
        )
    try:
        status = ScoringStatusModel(status=str(output.get("status") or "available")).status
    except ValidationError:
        return _unavailable_payload(
            debate.id,
            reason="Stored scoring output has an unknown status.",
            node_ids=node_ids,
        )
    if any(item["node_id"] not in set(node_ids) for item in validated_items):
        return _unavailable_payload(
            debate.id,
            reason="Stored scoring output references nodes outside the current debate.",
            node_ids=node_ids,
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
    return payload


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
    input_hash = node_scoring_input_hash(claim=claim, argument_text=argument_text)
    provider_name = getattr(provider, "provider", None)
    model_name = getattr(provider, "model", None)
    stale_cache_metadata = None
    if provider_name and model_name and not force_refresh:
        cached_payload = lookup_scoring_cache(
            db,
            debate_id=debate.id,
            node_id=node.id,
            input_hash=input_hash,
            judge_role=judge_role,
            provider=provider_name,
            model=model_name,
        )
        if cached_payload is not None:
            return _with_cache_metadata(cached_payload, hit=True)
        stale_cache_metadata = lookup_stale_scoring_cache_metadata(
            db,
            debate_id=debate.id,
            node_id=node.id,
            input_hash=input_hash,
            judge_role=judge_role,
            provider=provider_name,
            model=model_name,
        )
    try:
        result = provider.judge_node(
            ScoringProviderRequest(
                claim=claim,
                argument_text=argument_text,
                judge_role=judge_role,
                timeout_seconds=timeout_seconds,
            )
        )
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
    except Exception as exc:
        return _unavailable_payload(
            debate.id,
            reason=_provider_error_reason(exc, "Scoring judge call failed unexpectedly."),
            node_ids=node_ids,
        )
    parsed = parse_judge_json(result.raw_output)
    if parsed.status != "available" or parsed.assessment is None:
        payload = _unavailable_payload(
            debate.id,
            reason=parsed.reason or "Judge output was unavailable.",
            node_ids=node_ids,
            model_metadata=_provider_model_metadata(result, "unavailable"),
        )
        if provider_name and model_name:
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
            )
            db.flush()
        return _with_cache_metadata(payload, hit=False, stale=stale_cache_metadata)
    item = reduce_assessments(claim, parsed.assessment).model_dump(mode="json")
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
    max_nodes: int = DEFAULT_SCORING_MAX_NODES,
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
    bounded_count = max(0, max_nodes)
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
        if cache_metadata is None and isinstance(node_cache, dict) and node_cache.get("stale"):
            cache_metadata = node_cache
        if node_payload.get("model_metadata"):
            model_metadata = node_payload["model_metadata"]
        node_items = node_payload.get("items") if isinstance(node_payload.get("items"), list) else []
        if node_items:
            items.extend(node_items)
        else:
            errors.append(
                NodeScoringError(
                    node_id=node_id,
                    status="unavailable",
                    reason=str(node_payload.get("reason") or "Scoring judge output was unavailable."),
                )
            )
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
    max_nodes: int = DEFAULT_SCORING_MAX_NODES,
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


def scoring_result_payload(
    *,
    debate_id: str,
    node_ids: list[str],
    items: list[dict],
    errors: list[NodeScoringError],
    reason: str | None = None,
    model_metadata: dict | None = None,
    max_nodes: int | None = None,
    scored_node_count: int | None = None,
    skipped_node_count: int | None = None,
    truncated: bool | None = None,
    cache: dict | None = None,
) -> dict:
    serialized_errors = [error.model_dump(mode="json") for error in errors]
    if items and serialized_errors:
        status = "partial"
        default_reason = "Some scoring checks were unavailable."
    elif items:
        status = "available"
        default_reason = None
    else:
        status = "unavailable"
        default_reason = _unavailable_result_reason(errors)
    payload = {
        "debate_id": debate_id,
        "status": status,
        "node_ids": node_ids,
        "items": items,
    }
    if serialized_errors:
        payload["errors"] = serialized_errors
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


def _unavailable_result_reason(errors: list[NodeScoringError]) -> str:
    for error in errors:
        if error.reason != "Scoring node limit reached.":
            return error.reason
    if errors:
        return errors[0].reason
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
    return list(
        db.scalars(
            select(Node.id)
            .where(Node.debate_id == debate_id, Node.status != "stale")
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
    cached_payload = lookup_scoring_cache(
        db,
        debate_id=debate.id,
        node_id=node.id,
        input_hash=node_scoring_input_hash(claim=claim, argument_text=argument_text),
        judge_role=judge_role,
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
    max_nodes: int,
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
        "max_nodes": max_nodes,
    }
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


def _public_metadata_text(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    if not normalized:
        return None
    lowered = normalized.lower()
    if any(marker in lowered for marker in SECRET_METADATA_MARKERS):
        return None
    return normalized


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
