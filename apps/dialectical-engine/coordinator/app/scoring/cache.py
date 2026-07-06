from __future__ import annotations

import hashlib
import json
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.entities import AnalyzerRun, NodeScoringResult, now_utc
from app.scoring.judge_registry import JudgeContract
from app.scoring.models import NormalizedClaim


SCORING_CACHE_ANALYZER_TYPE = "node_scoring_cache"
SCORING_CACHE_SOURCE = "scoring_cache"
SCORING_INPUT_HASH_VERSION = "node-scoring-input-v2"


def node_scoring_input_hash(*, claim: NormalizedClaim, argument_text: str | None) -> str:
    payload = {
        "version": SCORING_INPUT_HASH_VERSION,
        "claim": claim.model_dump(mode="json"),
        "argument_text": argument_text or "",
    }
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def lookup_scoring_cache(
    db: Session,
    *,
    debate_id: str,
    node_id: str,
    input_hash: str,
    judge_role: str,
    provider: str,
    model: str,
) -> dict[str, Any] | None:
    cached_result = db.scalar(
        select(NodeScoringResult)
        .where(
            NodeScoringResult.debate_id == debate_id,
            NodeScoringResult.node_id == node_id,
            NodeScoringResult.input_hash == input_hash,
            NodeScoringResult.judge_role == judge_role,
            NodeScoringResult.provider == provider,
            NodeScoringResult.model == model,
        )
        .order_by(NodeScoringResult.updated_at.desc(), NodeScoringResult.created_at.desc(), NodeScoringResult.id.desc())
    )
    if cached_result:
        if cached_result.status == "available" and isinstance(cached_result.result, dict):
            return cached_result.result
        return None

    runs = db.scalars(
        select(AnalyzerRun)
        .where(
            AnalyzerRun.debate_id == debate_id,
            AnalyzerRun.analyzer_type == SCORING_CACHE_ANALYZER_TYPE,
            AnalyzerRun.status == "complete",
        )
        .order_by(AnalyzerRun.created_at.desc(), AnalyzerRun.id.desc())
    ).all()
    for run in runs:
        provenance = run.provenance if isinstance(run.provenance, dict) else {}
        if provenance.get("scoring_source") != SCORING_CACHE_SOURCE:
            continue
        if provenance.get("node_id") != node_id:
            continue
        if provenance.get("input_hash") != input_hash:
            continue
        if provenance.get("judge_role") != judge_role:
            continue
        if provenance.get("provider") != provider:
            continue
        if provenance.get("model") != model:
            continue
        output = run.output if isinstance(run.output, dict) else {}
        payload = output.get("payload")
        return payload if isinstance(payload, dict) else None
    return None


def lookup_stale_scoring_cache_metadata(
    db: Session,
    *,
    debate_id: str,
    node_id: str,
    input_hash: str,
    judge_role: str,
    provider: str,
    model: str,
) -> dict[str, Any] | None:
    prior_result = db.scalar(
        select(NodeScoringResult)
        .where(
            NodeScoringResult.debate_id == debate_id,
            NodeScoringResult.node_id == node_id,
            NodeScoringResult.input_hash != input_hash,
            NodeScoringResult.judge_role == judge_role,
            NodeScoringResult.provider == provider,
            NodeScoringResult.model == model,
        )
        .order_by(NodeScoringResult.updated_at.desc(), NodeScoringResult.created_at.desc(), NodeScoringResult.id.desc())
    )
    if prior_result is None:
        return None
    return {"reason": "input_hash_mismatch", "refresh_available": True}


def store_scoring_cache(
    db: Session,
    *,
    debate_id: str,
    node_id: str,
    input_hash: str,
    judge_role: str,
    provider: str,
    model: str,
    provider_metadata: dict[str, Any],
    status: str,
    result: dict[str, Any],
    contract: JudgeContract | None = None,
) -> NodeScoringResult:
    cached_result = db.scalar(
        select(NodeScoringResult).where(
            NodeScoringResult.debate_id == debate_id,
            NodeScoringResult.node_id == node_id,
            NodeScoringResult.input_hash == input_hash,
            NodeScoringResult.judge_role == judge_role,
            NodeScoringResult.provider == provider,
            NodeScoringResult.model == model,
        )
    )
    if cached_result is None:
        cached_result = NodeScoringResult(
            debate_id=debate_id,
            node_id=node_id,
            input_hash=input_hash,
            judge_role=judge_role,
            provider=provider,
            model=model,
        )
        db.add(cached_result)
    cached_result.provider_metadata = provider_metadata
    cached_result.status = status
    cached_result.result = result
    if contract is not None:
        cached_result.judge_id = contract.judge_id
        cached_result.judge_version = contract.judge_version
        cached_result.contract_hash = contract.contract_hash
    cached_result.updated_at = now_utc()
    return cached_result
