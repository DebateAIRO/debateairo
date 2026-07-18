"""Verification evaluator: real judge-provider verdicts per EVIDENCE node.

Phase 7 Task 2 (docs/superpowers/plans/2026-07-07-phase7-evidence-verification.md).

Honesty laws (binding):
  - "supported"/"contradicted" may ONLY come from a real judge evaluation
    response (an actual provider call). Parse failures, timeouts, and
    provider errors ALWAYS produce an honest "unverifiable" status with a
    specific reason string -- NEVER a silently-defaulted "supported".
  - The Phase 6 lineage-independence guard (`lineage_family`,
    `judge_lineage_metadata` from `app.scoring.lineage`) is reused verbatim,
    never reimplemented. When enabled and the judge is same-family with the
    evidence's arguer, the provider is never called and no verdict is
    fabricated.
  - Gated by `DIALECTICAL_EVIDENCE_VERIFICATION` (default OFF). Flag off is a
    total no-op: no provider call, no DB writes, byte-identical to not having
    this module wired in at all.

UNVERIFIED #5 (routing decision, RESOLVED): this evaluator calls
`provider.judge_node(request)` directly with its OWN lineage guard and OWN
persistence, rather than routing through `score_node_with_provider`.
`score_node_with_provider` is claim-scoring-shaped: it resolves
`node.active_generation_id` for a single node whose OWN generation is being
scored, computes an `input_hash` from that node's `claim` + `argument_text`,
and writes to the `NodeScoringResult` cache table keyed to that node. A
verification evaluation is a fundamentally different shape -- it evaluates
an EVIDENCE child node's text AGAINST the credibility of a claim, and must
persist per-evidence-node verdicts distinct from claim-level QBAF scoring
(see UNVERIFIED #3). Forking a parallel cache/claim-scoring code path into
that function would be a mismatch; instead we reuse only the shared
primitives (`lineage_family`, `judge_lineage_metadata`, `bool_env`, the
`ScoringProviderRequest`/`ScoringProvider` transport, and the same
try/except retry-free single-call shape used by `score_node_with_provider`
for the actual `provider.judge_node` invocation) without forking the guard
LOGIC itself -- the guard's semantics (binary block/proceed on known-equal
families) are identical to Phase 6's, just re-expressed at this call site
per the plan's explicit sanction ("apply the lineage guard directly").

UNVERIFIED #6 (JudgeContract registration, RESOLVED): no new JudgeContract is
registered for judge_role="verifier". The role-specific prompt and strict
response schema are versioned through `ScoringProviderRequest`, while
`judge_registry.active_contract` is
used by claim scoring purely for contract-hash-keyed CACHE identity and
audit-trail parity across repeated scoring attempts of the SAME node
(`NodeScoringResult`/`JudgeOutputArtifact` cache lookups). The verification
evaluator has no cache lookup of its own (each evidence node is verified at
most once by its caller, per Task 3's wiring) and persists directly to a
fresh `AnalyzerRun` row every time it runs -- there is no cache-identity
concern to key on a contract_hash for. Registering a contract now would add
cache-busting semantics that this uncached evaluator does not consume. This
can be added later without a migration
(AnalyzerRun.provenance is free-form JSON) if/when a verifier JudgeContract
is authored.
"""
from __future__ import annotations

from collections.abc import Mapping
from datetime import datetime
import json
from json import JSONDecodeError

from sqlalchemy.orm import Session

from sqlalchemy import select

from app.core.config import bool_env
from app.core.write_lock import commit_write
from app.evidence.lifecycle_input_repository import (
    build_verification_lifecycle_snapshot,
    persist_evidence_lifecycle_snapshot,
)
from app.models.entities import AnalyzerRun, Debate, DebateBranch, Generation, Node, next_analyzer_run_seq
from app.providers import ProviderError
from app.scoring.judges import ScoringProvider, ScoringProviderRequest
from app.scoring.lineage import judge_lineage_metadata, lineage_family
from app.scoring.normalizer import normalize_claim
from app.scoring.service import _public_metadata_text

EVIDENCE_VERIFICATION_ANALYZER_TYPE = "evidence_verification"
EVIDENCE_VERIFICATION_EVALUATOR_VERSION = "evidence-verification-v1"
_VALID_VERDICTS = {"supported", "contradicted", "unverifiable"}


def _first_branch(db: Session, debate_id: str) -> DebateBranch:
    # Local, minimal lookup mirroring app.protocol.runner._first_branch --
    # not imported from app.services.dialectical_v2 to avoid the same
    # circular-import risk that module's own docstring flags (dialectical_v2
    # already imports app.evidence.extraction; importing dialectical_v2 back
    # from app.evidence would risk a cycle depending on import order).
    branch = db.scalar(
        select(DebateBranch).where(DebateBranch.debate_id == debate_id).order_by(DebateBranch.created_at.asc())
    )
    if not branch:
        raise ValueError("Debate branch not found")
    return branch


def rollup_claim_verification_status(evidence_verdicts: list[str]) -> str:
    """Pure function: roll up per-evidence-node verdicts into one claim-level
    status. Any "contradicted" wins; else any "supported" wins; else
    "pending" (honest -- covers both an empty list and a list of nothing but
    "unverifiable"/"pending" entries, since unverifiable evidence must never
    upgrade a claim's status)."""
    if "contradicted" in evidence_verdicts:
        return "contradicted"
    if "supported" in evidence_verdicts:
        return "supported"
    return "pending"


def _active_generation(db: Session, node: Node) -> Generation | None:
    if not node.active_generation_id:
        return None
    return db.get(Generation, node.active_generation_id)


def _authoritative_evidence_payload(parsed: dict) -> dict | None:
    evidence = parsed.get("evidence")
    if not isinstance(evidence, dict) or set(evidence) != {
        "status",
        "base_score",
        "uncertainty",
        "entailment",
        "caveats",
    }:
        return None
    if evidence.get("status") != "grounded" or evidence.get("entailment") != "SUPPORTS":
        return None
    base_score = evidence.get("base_score")
    uncertainty = evidence.get("uncertainty")
    caveats = evidence.get("caveats")
    if (
        isinstance(base_score, bool)
        or not isinstance(base_score, int | float)
        or not 0.0 <= float(base_score) <= 1.0
        or isinstance(uncertainty, bool)
        or not isinstance(uncertainty, int | float)
        or not 0.0 <= float(uncertainty) <= 1.0
        or not isinstance(caveats, list)
        or not all(isinstance(caveat, str) for caveat in caveats)
    ):
        return None
    return {
        "status": "grounded",
        "base_score": float(base_score),
        "uncertainty": float(uncertainty),
        "entailment": "SUPPORTS",
        "caveats": caveats,
        "evaluator_id": EVIDENCE_VERIFICATION_ANALYZER_TYPE,
        "evaluator_version": EVIDENCE_VERIFICATION_EVALUATOR_VERSION,
    }


def _parse_verifier_verdict(
    raw_output: str,
) -> tuple[str | None, str | None, dict | None]:
    """Parse a verdict and any complete lifecycle-authoritative evidence."""
    try:
        parsed = json.loads(raw_output)
    except JSONDecodeError:
        return None, "unparseable_verdict", None
    if not isinstance(parsed, dict):
        return None, "unparseable_verdict", None
    verdict = parsed.get("verdict")
    if verdict not in _VALID_VERDICTS:
        return None, "unparseable_verdict", None
    authoritative_evidence = (
        _authoritative_evidence_payload(parsed) if verdict == "supported" else None
    )
    return verdict, None, authoritative_evidence


def _persist_verification_attempt(
    db: Session,
    *,
    debate: Debate,
    claim_node: Node,
    evidence_node: Node,
    judge_role: str,
    status: str,
    reason: str | None,
    lineage_metadata: dict,
    checked_at: datetime | str | None = None,
    authoritative_evidence: Mapping[str, object] | None = None,
    commit: bool = True,
) -> None:
    """Persist one verifier attempt and its honest lifecycle projection."""

    branch = _first_branch(db, debate.id)
    run = AnalyzerRun(
        debate_id=debate.id,
        branch_id=branch.id,
        analyzer_type=EVIDENCE_VERIFICATION_ANALYZER_TYPE,
        output={
            "evidenceNodeId": evidence_node.id,
            "claimNodeId": claim_node.id,
            "status": status,
            "reason": reason,
            "evaluatorVersion": EVIDENCE_VERIFICATION_EVALUATOR_VERSION,
            **lineage_metadata,
        },
        status="complete",
        provenance={"judge_role": judge_role},
    )
    # Assigning the sequence flushes the run and materializes created_at.
    next_analyzer_run_seq(db, run)
    assert run.seq is not None
    assert run.created_at is not None
    evidence_kind = "unclassified"
    if isinstance(evidence_node.evidence_metadata, dict):
        raw_kind = evidence_node.evidence_metadata.get("evidenceKind")
        if isinstance(raw_kind, str) and raw_kind.strip():
            evidence_kind = raw_kind.strip()
    snapshot = build_verification_lifecycle_snapshot(
        debate_id=debate.id,
        claim_node_id=claim_node.id,
        evidence_node_id=evidence_node.id,
        evidence_generation_id=evidence_node.active_generation_id or "",
        evidence_text=evidence_node.claim,
        evidence_kind=evidence_kind,
        verification_run_id=run.id,
        sequence=run.seq,
        verification_status=status,
        verification_reason=reason,
        recorded_at=run.created_at,
        checked_at=checked_at,
        authoritative_evidence=authoritative_evidence,
    )
    persist_evidence_lifecycle_snapshot(
        db,
        snapshot=snapshot,
        verification_status=status,
    )
    if commit:
        commit_write(db)


def evaluate_evidence_verdict(
    db: Session,
    debate: Debate,
    claim_node: Node,
    evidence_node: Node,
    provider: ScoringProvider,
    *,
    judge_role: str = "verifier",
    commit: bool = True,
) -> dict:
    """Evaluate ONE evidence node's verdict via a real judge-provider call.

    Flag off (default): immediate honest no-op, no provider call, no side
    effects. See module docstring for the full honesty-law rationale.
    """
    if not bool_env("DIALECTICAL_EVIDENCE_VERIFICATION", False):
        return {"status": "pending", "reason": "verification_disabled"}

    claim_generation = _active_generation(db, claim_node)

    # Phase 6 lineage guard, reused (not reimplemented) per Global Constraints:
    # same binary block/proceed semantics as score_node_with_provider's guard
    # -- unknown lineage on either side never blocks (see that function's
    # module comment for the judgment-call rationale, carried over verbatim).
    # Provider metadata is routed through the SAME secret-safety scrub
    # (`_public_metadata_text`, app.scoring.service) that
    # score_node_with_provider applies before lineage computation --
    # a secret-like model string must be scrubbed to None (unknown lineage)
    # BEFORE it ever reaches lineage_family/judge_lineage_metadata, never
    # echoed raw into persisted output.
    scrubbed_model = _public_metadata_text(getattr(provider, "model", None))
    arguer_family = lineage_family(claim_generation.model_id if claim_generation else None)
    judge_family = lineage_family(scrubbed_model)
    provider_name = _public_metadata_text(getattr(provider, "provider", None))
    lineage_metadata = judge_lineage_metadata(
        arguer_model_id=claim_generation.model_id if claim_generation else None,
        judge_provider=provider_name,
        judge_model_id=scrubbed_model,
    )
    if arguer_family is not None and judge_family is not None and arguer_family == judge_family:
        _persist_verification_attempt(
            db,
            debate=debate,
            claim_node=claim_node,
            evidence_node=evidence_node,
            judge_role=judge_role,
            status="unverifiable",
            reason="no_independent_judge",
            lineage_metadata=lineage_metadata,
            commit=commit,
        )
        return {"status": "unverifiable", "reason": "no_independent_judge"}

    evidence_kind = None
    if isinstance(evidence_node.evidence_metadata, dict):
        evidence_kind = evidence_node.evidence_metadata.get("evidenceKind")

    request = ScoringProviderRequest(
        claim=normalize_claim(node_id=claim_node.id, raw_text=claim_node.claim),
        argument_text=claim_generation.argument if claim_generation else None,
        judge_role=judge_role,
        prompt_version=EVIDENCE_VERIFICATION_EVALUATOR_VERSION,
        metadata={"evidence_text": evidence_node.claim, "evidence_kind": evidence_kind},
    )

    try:
        result = provider.judge_node(request)
    except TimeoutError:
        _persist_verification_attempt(
            db,
            debate=debate,
            claim_node=claim_node,
            evidence_node=evidence_node,
            judge_role=judge_role,
            status="unverifiable",
            reason="verification_judge_call_timed_out",
            lineage_metadata=lineage_metadata,
            commit=commit,
        )
        return {"status": "unverifiable", "reason": "verification_judge_call_timed_out"}
    except ProviderError:
        _persist_verification_attempt(
            db,
            debate=debate,
            claim_node=claim_node,
            evidence_node=evidence_node,
            judge_role=judge_role,
            status="unverifiable",
            reason="verification_judge_call_failed",
            lineage_metadata=lineage_metadata,
            commit=commit,
        )
        return {"status": "unverifiable", "reason": "verification_judge_call_failed"}

    verdict, error_reason, authoritative_evidence = _parse_verifier_verdict(result.raw_output)

    # Same scrub applied at the guard above -- reuse it here rather than the
    # raw provider attributes, so no secret-like provider/model string is ever
    # echoed into judge_lineage_metadata or the persisted AnalyzerRun.output.
    final_status = verdict if verdict is not None else "unverifiable"
    final_reason = error_reason  # None on success, honest reason string on failure

    _persist_verification_attempt(
        db,
        debate=debate,
        claim_node=claim_node,
        evidence_node=evidence_node,
        judge_role=judge_role,
        status=final_status,
        reason=final_reason,
        lineage_metadata=lineage_metadata,
        checked_at=result.checked_at,
        authoritative_evidence=authoritative_evidence,
        commit=commit,
    )

    return {"status": final_status, "reason": final_reason}
