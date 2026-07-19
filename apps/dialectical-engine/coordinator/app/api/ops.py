"""W5b read-only ops surfaces: job observability + verdict shadow telemetry.

GET /api/ops/jobs           recent job transitions + current job counts.
GET /api/ops/verdict-shadow evidence-gate shadow aggregates over the most
                            recent completed debates (the W6 G-A/G-D flip
                            evidence feed). Computed on demand from the
                            single verdict derivation path; no persistence.

Auth (documented choice): both endpoints gate on the user token, matching
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
from app.models.entities import Debate, Job, JobTransition
from app.services.serialization import derive_debate_verdict, iso

LOGGER = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ops", tags=["ops"])

DEFAULT_TRANSITIONS_LIMIT = 100
MAX_TRANSITIONS_LIMIT = 500
DEFAULT_SHADOW_LIMIT = 50
MAX_SHADOW_LIMIT = 200


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
