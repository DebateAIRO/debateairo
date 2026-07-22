from __future__ import annotations

import hashlib
import json
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.entities import AnalyzerRun, NodeScoringResult, now_utc
from app.scoring.judge_registry import JudgeContract
from app.scoring.judges import JudgeChildContext
from app.scoring.models import NormalizedClaim


SCORING_CACHE_ANALYZER_TYPE = "node_scoring_cache"
SCORING_CACHE_SOURCE = "scoring_cache"
# Task 3 amendment (controller follow-up, docs/improvement-plan-2026-07-22.md
# §P2.3): bumped v2 -> v3 because the hash payload below now includes
# debate_question and a children digest (previously claim + argument_text
# only). Motivating case: a later cross-examination task adds attack
# children to a node and rescores it -- without this, that rescore would
# cache-hit on the OLD (children-blind) hash and never see the new
# counters, silently defeating Task 3's tree-aware judge payload. Every
# pre-existing persisted input_hash is intentionally invalidated by this
# bump (a hash computed under the old payload shape can never collide with
# one computed under the new shape, regardless of content).
SCORING_INPUT_HASH_VERSION = "node-scoring-input-v3"


def _children_digest_payload(children: list[JudgeChildContext]) -> list[dict[str, str | None]]:
    # Hash EXACTLY what the judge prompt renders for each child (node_id,
    # stance, claim, argument_excerpt as rendered -- i.e. already truncated),
    # in the same stable order the caller supplies (never re-sorted here):
    # identical rendered payloads must hash identically, and a real content
    # change (a new attack child, a regenerated excerpt, a reordering) must
    # change the hash. `truncated` is deliberately omitted -- it is fully
    # determined by argument_excerpt (whether it carries the truncation
    # marker), so including it would be redundant, not additional signal.
    return [
        {
            "node_id": child.node_id,
            "stance": child.stance,
            "claim": child.claim,
            "argument_excerpt": child.argument_excerpt,
        }
        for child in children
    ]


def node_scoring_input_hash(
    *,
    claim: NormalizedClaim,
    argument_text: str | None,
    debate_question: str | None = None,
    children: list[JudgeChildContext] | None = None,
) -> str:
    payload = {
        "version": SCORING_INPUT_HASH_VERSION,
        "claim": claim.model_dump(mode="json"),
        "argument_text": argument_text or "",
        # Task 3 amendment: debate_question and children are exactly the two
        # new prompt inputs render_single_node_judge_prompt's default branch
        # consumes (docs/improvement-plan-2026-07-22.md §P2.3) -- the cache
        # key now covers everything the prompt renders, not just claim and
        # argument_text. Both default to "absent" (None / no children) so a
        # caller that genuinely has neither (there are none in production,
        # but the parameters stay optional for symmetry with
        # ScoringProviderRequest's own optional fields) still gets a
        # well-defined, deterministic hash.
        "debate_question": debate_question or "",
        "children": _children_digest_payload(children or []),
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
    contract_hash: str | None = None,
) -> dict[str, Any] | None:
    conditions = [
        NodeScoringResult.debate_id == debate_id,
        NodeScoringResult.node_id == node_id,
        NodeScoringResult.input_hash == input_hash,
        NodeScoringResult.judge_role == judge_role,
        NodeScoringResult.provider == provider,
        NodeScoringResult.model == model,
    ]
    if contract_hash is not None:
        conditions.append(NodeScoringResult.contract_hash == contract_hash)
    cached_result = db.scalar(
        select(NodeScoringResult)
        .where(*conditions)
        .order_by(NodeScoringResult.updated_at.desc(), NodeScoringResult.created_at.desc(), NodeScoringResult.id.desc())
    )
    if cached_result:
        if cached_result.status == "available" and isinstance(cached_result.result, dict):
            return cached_result.result
        return None

    # Phase 11 Task 1: this fallback scan relies on encountering the newest-
    # matching row first when multiple AnalyzerRun rows share the same
    # provenance identity (node_id/input_hash/etc). seq (migration 0011) is
    # now the primary sort key -- created_at.desc()/id.desc() remain only as
    # a defensive fallback for legacy rows where seq IS NULL.
    runs = db.scalars(
        select(AnalyzerRun)
        .where(
            AnalyzerRun.debate_id == debate_id,
            AnalyzerRun.analyzer_type == SCORING_CACHE_ANALYZER_TYPE,
            AnalyzerRun.status == "complete",
        )
        .order_by(AnalyzerRun.seq.desc(), AnalyzerRun.created_at.desc(), AnalyzerRun.id.desc())
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
        if contract_hash is not None and provenance.get("contract_hash") != contract_hash:
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
    contract_hash: str | None = None,
) -> dict[str, Any] | None:
    if contract_hash is not None:
        contract_mismatch = db.scalar(
            select(NodeScoringResult).where(
                NodeScoringResult.debate_id == debate_id,
                NodeScoringResult.node_id == node_id,
                NodeScoringResult.input_hash == input_hash,
                NodeScoringResult.judge_role == judge_role,
                NodeScoringResult.provider == provider,
                NodeScoringResult.model == model,
                (NodeScoringResult.contract_hash != contract_hash)
                | (NodeScoringResult.contract_hash.is_(None)),
            )
        )
        if contract_mismatch is not None:
            return {"reason": "scoring_contract_changed", "refresh_available": True}
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
    # Contract-keyed immutable cache: the upsert identity INCLUDES the judge
    # contract. A changed contract means a different scoring artifact — it
    # gets its own row; the old contract's row is preserved as historical.
    # Within one contract (or the legacy NULL-contract lane) re-stores refresh
    # the same row in place.
    contract_hash_value = contract.contract_hash if contract is not None else None
    contract_condition = (
        NodeScoringResult.contract_hash == contract_hash_value
        if contract_hash_value is not None
        else NodeScoringResult.contract_hash.is_(None)
    )
    cached_result = db.scalar(
        select(NodeScoringResult).where(
            NodeScoringResult.debate_id == debate_id,
            NodeScoringResult.node_id == node_id,
            NodeScoringResult.input_hash == input_hash,
            NodeScoringResult.judge_role == judge_role,
            NodeScoringResult.provider == provider,
            NodeScoringResult.model == model,
            contract_condition,
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
