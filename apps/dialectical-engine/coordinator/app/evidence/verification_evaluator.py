"""Verification evaluator: real judge-provider verdicts per EVIDENCE node.

Phase 7 Task 2 (docs/superpowers/plans/2026-07-07-phase7-evidence-verification.md).

Honesty laws (binding):
  - "supported"/"contradicted" may ONLY come from a real judge evaluation
    response (an actual provider call). Parse failures, timeouts, and
    provider errors ALWAYS produce an honest "unverifiable" status with a
    specific reason string -- NEVER a silently-defaulted "supported".
  - The shared Phase 6 lineage metadata helper (`judge_lineage_metadata`
    from `app.scoring.lineage`) is reused rather than reimplemented. Evidence
    verification is stricter than claim scoring: unless that metadata
    affirmatively establishes independence, the provider is never called and
    no verdict is fabricated.
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
primitives (`judge_lineage_metadata`, `bool_env`, the
`ScoringProviderRequest`/`ScoringProvider` transport, and the same
try/except retry-free single-call shape used by `score_node_with_provider`
for the actual `provider.judge_node` invocation) without forking the guard
metadata itself. This evaluator applies the lifecycle contract's stricter
fail-closed rule at its call site: only explicit `independent=True` may
proceed to the provider.

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
from typing import Any

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
from app.scoring.lineage import judge_lineage_metadata
from app.scoring.normalizer import normalize_claim
from app.scoring.service import _public_metadata_text

EVIDENCE_VERIFICATION_ANALYZER_TYPE = "evidence_verification"
EVIDENCE_VERIFICATION_EVALUATOR_VERSION = "evidence-verification-v1"
_VALID_VERDICTS = {"supported", "contradicted", "unverifiable"}

# Task 16 (P3.2, adaptive-expansion activation readiness): "contradicted" and
# "unverifiable" are REAL, judge-produced verdicts -- the verifier's schema
# (app.scoring.prompts._VERIFIER_OUTPUT_SCHEMA) never elicits a numeric
# magnitude for either branch (only "supported" carries the "evidence"
# sub-object), so these are FIXED, documented sentinels feeding ONLY the
# lifecycle-facing snapshot value -- never AnalyzerRun.output["baseScore"],
# which stays computed from `authoritative_evidence` alone (see
# _persist_verification_attempt), honestly None for both, exactly as before
# this change (Task 12's DF-QuAD contract is untouched). This mirrors the
# posture app.qbaf.debate_adapter.CONTRADICTED_EVIDENCE_TAU already
# established for the graph-edge case: a real verdict, no elicited
# confidence, so a conservative constant stands in rather than a fabricated
# number. The exact values are inert for every policy branch that actually
# fires off them: app.exploration.policy's challenge/seek_evidence branches
# read only status/entailment for these two decisions (never base_score/
# uncertainty), and every scalar-sensitive branch (abandon/reopen) requires
# EvidenceStatus.GROUNDED, which neither of these ever is.
LIFECYCLE_CONTRADICTED_BASE_SCORE = 0.05
LIFECYCLE_CONTRADICTED_UNCERTAINTY = 0.90
LIFECYCLE_NO_INFO_BASE_SCORE = 0.05
LIFECYCLE_NO_INFO_UNCERTAINTY = 1.0


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


def evidence_node_verification_eligible(evidence_node: Node) -> bool:
    """Task 11 (P1.2) eligibility guard -- pure, single source of truth,
    used at BOTH the two sites that must agree on it:
      1. app.exploration.scoring_completion_lifecycle (query-time): decides
         whether to CALL evaluate_evidence_verdict for this evidence node at
         all.
      2. app.protocol.runner's 5.5 overlay (read-time, defense-in-depth):
         after latest-per-evidence-node grouping, decides whether an
         ALREADY-PERSISTED verdict may still fold into the rollup.

    Site 2 exists because site 1 alone is not enough: a verdict can be
    persisted while the evidence node was still "pending" citation
    resolution, and citation resolution can LATER downgrade that SAME node
    to "unreachable" (the fetch ultimately failed) after the verdict was
    already recorded. Once a node is "unreachable", site 1 permanently
    refuses to ever (re-)verify it -- so without site 2's re-check, that one
    stale verdict would be the evidence node's only AnalyzerRun forever and
    would haunt the rollup indefinitely. Using the SAME predicate at both
    sites is what actually delivers "an unreachable evidence node's verdict
    stays out of the 5.5 rollup entirely", not just "no NEW verdict is
    recorded for it".

    An evidence node whose citation could not even be fetched
    ("unreachable" -- see app.evidence.citations) has nothing for the
    verifier to compare the claim against, so it is ineligible.
    "resolved_quote_missing" (fetched, quote not found) and "pending"/absent
    (not yet resolved, or a "model-claim" node with no resolution_status key
    at all) remain eligible -- the judge itself may mark those contradicted
    or unverifiable; this guard only pre-filters fetchability, never the
    verdict.

    Fails CLOSED (ineligible) on uninterpretable metadata: `evidence_metadata`
    present but not a dict (corrupted -- should never happen via any writer
    in this codebase, but an untrustworthy value must never be treated as
    "fine") returns False, the same posture as excluding a corrupted verdict
    row from the rollup. `None` (no metadata recorded at all -- the
    Node.evidence_metadata column's own type is Optional[dict]) is a
    legitimate, expected "absent" state, not corruption, and stays eligible.
    """
    metadata = evidence_node.evidence_metadata
    if metadata is None:
        return True
    if not isinstance(metadata, dict):
        return False
    return metadata.get("resolution_status") != "unreachable"


def latest_evidence_verdicts_for_debate(db: Session, debate_id: str) -> dict[str, dict[str, Any]]:
    """Task 12 (P1.3): the SAME latest-per-evidence-node query + unreachable
    re-check app.protocol.runner's 5.5 overlay performs (Task 11 HARD GATE +
    review fix), factored out here so every consumer of "what does the
    latest, currently-eligible evidence_verification verdict say for this
    debate's evidence nodes right now" -- the 5.5 claim-level rollup, the
    DF-QuAD graph adapter's evidence edges (both in app.protocol.runner),
    and the debug-only QBAF view (app.scoring.qbaf_debug) -- reads the
    identical rows the identical way, rather than each re-deriving its own
    query (brief P1.3 point 4: "reuse that loading... do not re-query
    differently").

    Returns {evidence_node_id: {"claim_node_id", "status", "base_score"}}
    for every evidence node whose LATEST persisted evidence_verification
    verdict is still eligible right now (evidence_node_verification_eligible
    on the evidence node's CURRENT row -- an evidence node verified while
    "pending" citation resolution and later downgraded to "unreachable" is
    excluded here even though its verdict row still exists). "Eligible"
    only means "trustworthy to read", not "supported"/"contradicted"
    specifically -- callers that only care about a graph edge filter status
    themselves (see app.qbaf.debate_adapter._evidence_verdict_tau).

    base_score is whatever the row's "baseScore" field holds (only ever
    written non-None by _persist_verification_attempt when status is
    "supported" AND the verifier's evidence sub-object validated) --
    returned verbatim, NOT re-validated here: the graph adapter is the
    single place that decides whether a base_score is usable as a tau
    (brief P1.3 point 4), so this function does not duplicate that check.

    Raises if a persisted row's `output` is corrupted (not dict-shaped) --
    deliberately NOT swallowed here so callers' OWN best-effort/graceful-
    degradation wrapping (e.g. app.protocol.runner's evidence-verification
    overlay try/except) decides how to degrade, exactly as the pre-Task-12
    inline version of this logic behaved.
    """
    verdict_runs = db.scalars(
        select(AnalyzerRun)
        .where(
            AnalyzerRun.debate_id == debate_id,
            AnalyzerRun.analyzer_type == EVIDENCE_VERIFICATION_ANALYZER_TYPE,
        )
        .order_by(AnalyzerRun.seq.desc(), AnalyzerRun.created_at.desc(), AnalyzerRun.id.desc())
    ).all()
    latest_by_evidence_node: dict[str, dict[str, Any]] = {}
    seen_evidence_node_ids: set[str] = set()
    for verdict_run in verdict_runs:
        output = verdict_run.output or {}
        evidence_node_id = output.get("evidenceNodeId")
        claim_node_id = output.get("claimNodeId")
        status = output.get("status")
        if not evidence_node_id or not claim_node_id or not status:
            # Can't be grouped by evidence node (or has no verdict) --
            # excluded rather than guessed at. Production's
            # _persist_verification_attempt always writes evidenceNodeId;
            # this only guards a malformed/legacy row.
            continue
        if evidence_node_id in seen_evidence_node_ids:
            continue  # superseded verdict for an already-resolved evidence node
        seen_evidence_node_ids.add(evidence_node_id)
        latest_by_evidence_node[evidence_node_id] = {
            "claim_node_id": claim_node_id,
            "status": status,
            "base_score": output.get("baseScore"),
        }

    if not latest_by_evidence_node:
        return {}

    current_evidence_nodes = {
        node.id: node
        for node in db.scalars(
            select(Node).where(
                Node.debate_id == debate_id,
                Node.id.in_(latest_by_evidence_node.keys()),
            )
        ).all()
    }
    return {
        evidence_node_id: verdict
        for evidence_node_id, verdict in latest_by_evidence_node.items()
        if (node := current_evidence_nodes.get(evidence_node_id)) is not None
        and evidence_node_verification_eligible(node)
    }


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


def _lifecycle_evidence_for_verdict(
    verdict: str | None,
    authoritative_evidence: Mapping[str, object] | None,
) -> dict | None:
    """Evidence value for the LIFECYCLE snapshot only -- never
    AnalyzerRun.output["baseScore"] (see _persist_verification_attempt,
    which computes that field from `authoritative_evidence` alone,
    unaffected by this function).

    `verdict` must be the RAW value `_parse_verifier_verdict` returned --
    None for every path that is not a genuinely-parsed enum member
    (unparseable response, and the three failure call sites in
    evaluate_evidence_verdict -- timeout, provider error, lineage
    independence refusal -- which never even reach _parse_verifier_verdict
    and so never pass a verdict here at all). Those all correctly fall
    through to `return None` below, preserving the pre-existing withheld
    (terminal_unverifiable, value=None) posture -- this function only ever
    enriches a REAL, judge-produced verdict.
    """
    if verdict == "supported":
        return dict(authoritative_evidence) if authoritative_evidence is not None else None
    if verdict == "contradicted":
        return {
            "status": "contradicted",
            "base_score": LIFECYCLE_CONTRADICTED_BASE_SCORE,
            "uncertainty": LIFECYCLE_CONTRADICTED_UNCERTAINTY,
            "entailment": "REFUTES",
            "caveats": [],
            "evaluator_id": EVIDENCE_VERIFICATION_ANALYZER_TYPE,
            "evaluator_version": EVIDENCE_VERIFICATION_EVALUATOR_VERSION,
        }
    if verdict == "unverifiable":
        return {
            "status": "no_info",
            "base_score": LIFECYCLE_NO_INFO_BASE_SCORE,
            "uncertainty": LIFECYCLE_NO_INFO_UNCERTAINTY,
            "entailment": "NOINFO",
            "caveats": [],
            "evaluator_id": EVIDENCE_VERIFICATION_ANALYZER_TYPE,
            "evaluator_version": EVIDENCE_VERIFICATION_EVALUATOR_VERSION,
        }
    return None


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
    lifecycle_evidence: Mapping[str, object] | None = None,
    commit: bool = True,
) -> None:
    """Persist one verifier attempt and its honest lifecycle projection."""

    # Task 12 (P1.3): the verifier's grounded evidence.base_score, when
    # present -- ONLY ever non-None here when status=="supported" AND
    # _authoritative_evidence_payload validated the whole evidence
    # sub-object (range/type/entailment all checked there already, so this
    # is a trustworthy passthrough, not a second validation pass). A
    # "supported" verdict whose evidence sub-object failed that validation
    # (authoritative_evidence is None despite the textual verdict saying
    # "supported") honestly persists baseScore: None rather than fabricate
    # a number -- app.qbaf.debate_adapter fails closed (no edge) on that.
    # `lifecycle_evidence` (Task 16) is a DELIBERATELY SEPARATE value: it
    # also covers "contradicted"/"unverifiable" real verdicts (fixed
    # sentinels, see _lifecycle_evidence_for_verdict), but must never affect
    # this AnalyzerRun.output["baseScore"] computation.
    base_score = authoritative_evidence.get("base_score") if authoritative_evidence is not None else None

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
            "baseScore": base_score,
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
        lifecycle_evidence=lifecycle_evidence,
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

    # Provider metadata is routed through the SAME secret-safety scrub
    # (`_public_metadata_text`, app.scoring.service) that
    # score_node_with_provider applies before lineage computation --
    # a secret-like model string must be scrubbed to None (unknown lineage)
    # BEFORE it ever reaches lineage_family/judge_lineage_metadata, never
    # echoed raw into persisted output.
    scrubbed_model = _public_metadata_text(getattr(provider, "model", None))
    provider_name = _public_metadata_text(getattr(provider, "provider", None))
    lineage_metadata = judge_lineage_metadata(
        arguer_model_id=claim_generation.model_id if claim_generation else None,
        judge_provider=provider_name,
        judge_model_id=scrubbed_model,
    )
    if lineage_metadata.get("independent") is not True:
        independence_reason = lineage_metadata.get("independenceReason")
        reason = (
            independence_reason
            if independence_reason in {"arguer_lineage_unknown", "judge_lineage_unknown"}
            else "no_independent_judge"
        )
        _persist_verification_attempt(
            db,
            debate=debate,
            claim_node=claim_node,
            evidence_node=evidence_node,
            judge_role=judge_role,
            status="unverifiable",
            reason=reason,
            lineage_metadata=lineage_metadata,
            commit=commit,
        )
        return {"status": "unverifiable", "reason": reason}

    raw_evidence_metadata = (
        evidence_node.evidence_metadata if isinstance(evidence_node.evidence_metadata, dict) else {}
    )
    evidence_kind = raw_evidence_metadata.get("evidenceKind")

    # Task 11 (P1.2): Task 10's retrieval provenance -- method/url/quote/
    # publisher/date/retrieval_query/stance/resolution_status -- flows
    # straight through into the judge-visible evidence_metadata payload
    # (render_single_node_judge_prompt echoes this whole metadata dict back
    # as the prompt's "evidence_metadata" field) whenever the evidence node
    # carries it. Regex-extraction ("model-claim") nodes carry only
    # {evidenceKind, method}; their evidence_kind alias below still resolves
    # from evidenceKind exactly as before this change. A field a node
    # doesn't have (e.g. url on a model-claim node) is honestly absent from
    # the payload, never fabricated as None.
    request = ScoringProviderRequest(
        claim=normalize_claim(node_id=claim_node.id, raw_text=claim_node.claim),
        argument_text=claim_generation.argument if claim_generation else None,
        judge_role=judge_role,
        prompt_version=EVIDENCE_VERIFICATION_EVALUATOR_VERSION,
        metadata={
            **raw_evidence_metadata,
            "evidence_text": evidence_node.claim,
            "evidence_kind": evidence_kind,
        },
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
    # Task 16 (P3.2): `verdict` here is None for every path that isn't a
    # genuinely-parsed enum member (e.g. an unparseable response), so this
    # naturally returns None for those too -- see
    # _lifecycle_evidence_for_verdict's own docstring.
    lifecycle_evidence = _lifecycle_evidence_for_verdict(verdict, authoritative_evidence)

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
        lifecycle_evidence=lifecycle_evidence,
        commit=commit,
    )

    return {"status": final_status, "reason": final_reason}
