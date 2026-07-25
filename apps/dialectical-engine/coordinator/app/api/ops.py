"""W5b read-only ops surfaces: job observability + verdict shadow telemetry.

GET /api/ops/jobs           recent job transitions + current job counts.
GET /api/ops/verdict-shadow evidence-gate shadow aggregates over the most
                            recent completed debates (the W6 G-A/G-D flip
                            evidence feed). Computed on demand from the
                            single verdict derivation path; no persistence.
GET /api/ops/expansion      adaptive-expansion state per debate: why growth
                            stopped, the dispatch_outcome histogram, and the
                            frontier's top records by priority (FW2 P0.4).

Auth (documented choice): all endpoints gate on the user token, matching
how the existing admin-ish surface does it (GET /api/settings depends on
require_user_token). Nothing under /api/ops is a public-read path.
"""
from __future__ import annotations

import logging
from collections import Counter
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.auth import AuthContext, require_user_token
from app.core.config import bool_env
from app.core.db import get_db
from app.exploration.expansion_dispatch import (
    CONVERGED_WAVES_KEY,
    FRONTIER_DISTRIBUTION_KEY,
    GROWTH_STARTED_AT_KEY,
    ROUNDS_COMPLETED_KEY,
    STOPPED_BECAUSE_KEY,
    WAVE_POLARITY_KEY,
    adaptive_expansion_enabled,
    adaptive_expansion_state,
    expansion_priority_floor,
    expansion_wave_width,
    growth_elapsed_seconds,
    rounds_completed,
)
from app.models.entities import Debate, Job, JobTransition, LifecycleDecisionRecord
from app.services.serialization import derive_debate_verdict, iso

LOGGER = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ops", tags=["ops"])

DEFAULT_TRANSITIONS_LIMIT = 100
MAX_TRANSITIONS_LIMIT = 500
DEFAULT_SHADOW_LIMIT = 50
MAX_SHADOW_LIMIT = 200
DEFAULT_EXPANSION_LIMIT = 10
MAX_EXPANSION_LIMIT = 50
DEFAULT_EXPANSION_TOP = 10
MAX_EXPANSION_TOP = 100


def _transition_to_dict(row: JobTransition) -> dict[str, Any]:
    return {
        "id": row.id,
        "job_id": row.job_id,
        "debate_id": row.debate_id,
        "job_type": row.job_type,
        "from_status": row.from_status,
        "to_status": row.to_status,
        "reason": row.reason,
        "channel": row.channel,
        "created_at": iso(row.created_at),
    }


@router.get("/jobs")
def ops_jobs(
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[AuthContext, Depends(require_user_token)],
    limit: Annotated[int, Query(ge=1, le=MAX_TRANSITIONS_LIMIT)] = DEFAULT_TRANSITIONS_LIMIT,
) -> dict[str, Any]:
    transitions = list(
        db.scalars(
            select(JobTransition)
            .order_by(JobTransition.created_at.desc(), JobTransition.id.desc())
            .limit(limit)
        ).all()
    )
    count_rows = db.execute(
        select(Job.job_type, Job.status, func.count(Job.id)).group_by(Job.job_type, Job.status)
    ).all()
    by_status: Counter[str] = Counter()
    job_counts = []
    for job_type, status, count in sorted(count_rows):
        job_counts.append({"job_type": job_type, "status": status, "count": int(count)})
        by_status[status] += int(count)
    return {
        "transitions": [_transition_to_dict(row) for row in transitions],
        "job_counts": job_counts,
        "job_counts_by_status": dict(sorted(by_status.items())),
        "limit": limit,
    }


def _coverage_bucket(tau_coverage: Any) -> str:
    """Quartile bucket for the tau-coverage histogram; honest "unavailable"
    when no coverage exists (unscored debate / unavailable band)."""
    if not isinstance(tau_coverage, (int, float)) or isinstance(tau_coverage, bool):
        return "unavailable"
    clamped = max(0.0, min(1.0, float(tau_coverage)))
    if clamped >= 1.0:
        return "1.00"
    lower = int(clamped * 4) / 4
    return f"{lower:.2f}-{lower + 0.25:.2f}"


def _shadow_row(db: Session, debate: Debate) -> dict[str, Any]:
    """One debate's shadow-telemetry row, via the single derivation path."""
    verdict = derive_debate_verdict(db, debate)["verdict"]
    basis = verdict.get("basis") if isinstance(verdict.get("basis"), dict) else {}
    shadow = verdict.get("evidenceGateShadow")
    if isinstance(shadow, dict):
        # Gate OFF (shadow mode): the would-be decision the gate did not apply.
        would_suppress = shadow.get("wouldSuppress") is True
        claim_type = shadow.get("claimType")
    else:
        # Gate ON: suppression is real, not shadowed.
        would_suppress = verdict.get("verdictState") == "suppressed_no_evidence"
        reason = verdict.get("suppressionReason")
        claim_type = reason.get("claimType") if isinstance(reason, dict) else None
    return {
        "debateId": debate.id,
        "completedAt": iso(debate.completed_at),
        "verdictBand": verdict.get("verdictBand"),
        "preGateVerdictBand": basis.get("preGateVerdictBand"),
        "wouldSuppress": would_suppress,
        "suppressed": verdict.get("verdictState") == "suppressed_no_evidence",
        "tauCoverage": basis.get("tauCoverage"),
        "claimType": claim_type,
    }


@router.get("/verdict-shadow")
def verdict_shadow(
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[AuthContext, Depends(require_user_token)],
    limit: Annotated[int, Query(ge=1, le=MAX_SHADOW_LIMIT)] = DEFAULT_SHADOW_LIMIT,
) -> dict[str, Any]:
    debates = list(
        db.scalars(
            select(Debate)
            .where(Debate.status != "archived", Debate.completed_at.is_not(None))
            .order_by(Debate.completed_at.desc(), Debate.id.desc())
            .limit(limit)
        ).all()
    )
    rows: list[dict[str, Any]] = []
    errors = 0
    band_histogram: Counter[str] = Counter()
    pre_gate_band_histogram: Counter[str] = Counter()
    coverage_histogram: Counter[str] = Counter()
    claim_type_histogram: Counter[str] = Counter()
    would_flip_count = 0
    for debate in debates:
        try:
            row = _shadow_row(db, debate)
        except Exception:
            # Never raises: a bad debate is counted and skipped, the feed
            # keeps serving the rest.
            errors += 1
            LOGGER.exception("verdict shadow derivation failed debate=%s", debate.id)
            continue
        rows.append(row)
        band_histogram[str(row["verdictBand"])] += 1
        pre_gate_band_histogram[str(row["preGateVerdictBand"])] += 1
        coverage_histogram[_coverage_bucket(row["tauCoverage"])] += 1
        claim_type_histogram[str(row["claimType"] or "unknown")] += 1
        if row["wouldSuppress"] and not row["suppressed"]:
            # Flipping the gate ON would change this debate's served band.
            would_flip_count += 1
    return {
        "limit": limit,
        "sampled": len(rows),
        "errors": errors,
        "gateEnabled": bool_env("DIALECTICAL_VERDICT_EVIDENCE_GATE", False),
        "debates": rows,
        "aggregates": {
            "bandHistogram": dict(sorted(band_histogram.items())),
            "preGateBandHistogram": dict(sorted(pre_gate_band_histogram.items())),
            "wouldFlipCount": would_flip_count,
            "coverageHistogram": dict(sorted(coverage_histogram.items())),
            "claimTypeHistogram": dict(sorted(claim_type_histogram.items())),
        },
    }


def _expansion_record_row(record: LifecycleDecisionRecord) -> dict[str, Any]:
    return {
        "recordId": record.id,
        "nodeId": record.node_id,
        "decision": record.decision,
        "signalClass": record.signal_class,
        # NULL stays null, meaning NEVER MEASURED -- not measured zero. The
        # priority floor makes exactly that distinction (an unranked record
        # is exempt from it), so collapsing it here would misreport which
        # records the floor could even refuse.
        "frontierPriority": record.frontier_priority,
        "dispatchOutcome": record.dispatch_outcome,
        "childSpawnCount": record.child_spawn_count,
        "createdAt": iso(record.created_at),
    }


def _expansion_row(db: Session, debate: Debate, *, top: int) -> dict[str, Any]:
    """One debate's adaptive-expansion state, outcome histogram and frontier head.

    Read-only, and derived through the dispatcher's OWN accessors
    (adaptive_expansion_state, rounds_completed, growth_elapsed_seconds)
    rather than by re-reading debate.config here -- so this surface cannot
    drift from what the dispatcher actually believes, which is the entire
    point of pointing the operator at it.
    """
    state = adaptive_expansion_state(debate)
    outcome_rows = db.execute(
        select(LifecycleDecisionRecord.dispatch_outcome, func.count(LifecycleDecisionRecord.id))
        .where(LifecycleDecisionRecord.debate_id == debate.id)
        .group_by(LifecycleDecisionRecord.dispatch_outcome)
    ).all()
    histogram: dict[str, int] = {}
    records_total = 0
    unoutcomed = 0
    for outcome, count in outcome_rows:
        records_total += int(count)
        if outcome is None:
            # Non-dispatchable decisions (continue/deepen/abandon/reopen)
            # legitimately keep a NULL outcome -- they are not
            # expansion-bearing. Reported separately rather than bucketed
            # under a made-up code, so the histogram stays the vocabulary the
            # dispatcher actually writes.
            unoutcomed += int(count)
            continue
        histogram[str(outcome)] = int(count)
    top_records = list(
        db.scalars(
            select(LifecycleDecisionRecord)
            .where(LifecycleDecisionRecord.debate_id == debate.id)
            # NULLs sort last under DESC in SQLite, so ranked records lead and
            # an all-unranked frontier is still visible rather than hidden.
            # (created_at, id) makes equal priorities a stable read.
            .order_by(
                LifecycleDecisionRecord.frontier_priority.desc(),
                LifecycleDecisionRecord.created_at.desc(),
                LifecycleDecisionRecord.id.desc(),
            )
            .limit(top)
        ).all()
    )
    converged = state.get(CONVERGED_WAVES_KEY)
    return {
        "debateId": debate.id,
        "status": debate.status,
        "roundsCompleted": rounds_completed(debate),
        "stoppedBecause": state.get(STOPPED_BECAUSE_KEY),
        "convergedWaves": converged if isinstance(converged, int) else 0,
        "growthStartedAt": state.get(GROWTH_STARTED_AT_KEY),
        "growthElapsedSeconds": round(growth_elapsed_seconds(debate), 1),
        # FW2 P0.3 / P1.5, persisted by the dispatcher's bookkeeping tail.
        # Absent (null) on a debate that has not completed a deciding pass.
        "frontierPriorityDistribution": state.get(FRONTIER_DISTRIBUTION_KEY),
        "wavePolarity": state.get(WAVE_POLARITY_KEY),
        "recordsTotal": records_total,
        "recordsWithoutOutcome": unoutcomed,
        "dispatchOutcomeHistogram": dict(sorted(histogram.items())),
        "topRecords": [_expansion_record_row(record) for record in top_records],
    }


@router.get("/expansion")
def ops_expansion(
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[AuthContext, Depends(require_user_token)],
    debate_id: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=MAX_EXPANSION_LIMIT)] = DEFAULT_EXPANSION_LIMIT,
    top: Annotated[int, Query(ge=1, le=MAX_EXPANSION_TOP)] = DEFAULT_EXPANSION_TOP,
) -> dict[str, Any]:
    """Adaptive-expansion state per debate (FW2 P0.4).

    The flip plan directs the operator to ``/api/ops/*`` and there was
    nothing there for any of this: whether growth is running, why it stopped,
    where the frontier sat relative to the floor, and which records won the
    budget. Reconstructing that meant hand-querying SQLite on a live box.

    ``debate_id`` narrows to one debate; without it the most recently created
    non-archived debates are returned. Both are bounded, and the per-debate
    work is two grouped/limited queries -- read-only, no derivation, no
    writes, matching the discipline of the two endpoints above.

    The knobs (``floor``, ``waveWidth``) are echoed alongside the state
    because every distribution here is only interpretable against them, and
    the operator reading this surface is deciding whether to move exactly
    those numbers.
    """
    query = select(Debate).where(Debate.status != "archived")
    if debate_id:
        query = select(Debate).where(Debate.id == debate_id)
    debates = list(
        db.scalars(
            query.order_by(Debate.created_at.desc(), Debate.id.desc()).limit(limit)
        ).all()
    )
    return {
        "limit": limit,
        "top": top,
        "debateId": debate_id,
        "adaptiveExpansionEnabled": adaptive_expansion_enabled(),
        "floor": expansion_priority_floor(),
        "waveWidth": expansion_wave_width(),
        "debates": [_expansion_row(db, debate, top=top) for debate in debates],
    }
