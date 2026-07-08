"""Pure calibration substrate: cold-start judge weights + correlated-error discount.

Honesty laws enforced here:
  - Weights are declared config/cold-start values, NEVER presented as "learned".
    Every weight-shaped output carries an explicit "source" of exactly
    "cold_start" or "config_override" -- no other value, ever, in this phase.
  - The correlated-error discount applies ONLY when genuinely aggregating 2+
    assessments. A single-assessment input returns "applicable": False with
    reason "single_judgment" -- weights are untouched (1.0), not silently
    dropped or fabricated.
  - Unknown/None family assessments are NEVER discounted against each other:
    unknown lineage is never assumed to correlate.

Pure module: no DB access, no os.getenv reads. Callers derive `family` via
`app.scoring.lineage.lineage_family` before calling `correlated_discount`;
`judge_weight`/`correlated_discount` themselves intentionally do not import
lineage, keeping them pure grouping/arithmetic functions over already-labeled
input (mirrors the no-I/O discipline of reducer.py/disagreement.py).
`calibration_report` below is the one DB-backed exception in this module and
imports `lineage_family`/`_public_metadata_text` from `app.scoring.lineage`
for its own family-scoped filtering (see its docstring).
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.entities import JudgeOutputArtifact
from app.scoring.lineage import _public_metadata_text, lineage_family

CALIBRATION_VERSION = "calibration-v1"


def judge_weight(family: str | None, config: dict | None = None) -> dict:
    """Return a declared judge weight for a family, never presented as learned.

    - If `config["weights"][family]` exists, that override is returned with
      source "config_override".
    - Otherwise, the cold-start neutral default (1.0, source "cold_start") is
      returned -- including for `family=None` (unknown lineage), which is an
      honest, valid case, not an error.
    """
    if config is not None:
        weights = config.get("weights")
        if isinstance(weights, dict) and family in weights:
            return {"weight": weights[family], "source": "config_override", "family": family}
    return {"weight": 1.0, "source": "cold_start", "family": family}


def correlated_discount(assessments_with_families: list[dict], *, discount_factor: float = 0.5) -> dict:
    """Compute per-assessment weights, discounting repeat same-family judgments.

    Pure grouping/arithmetic function, no I/O. Input items must already carry
    a `"family"` key (derived by the caller via `lineage_family`).

    - Fewer than 2 assessments: discounting is not applicable (nothing to
      aggregate against). Returns `"applicable": False` with reason
      "single_judgment" -- weights list reflects the single item at full
      weight 1.0 (or is empty for zero items), never fabricated or dropped.
    - 2+ assessments: grouped by family in first-appearance input order
      (stable, deterministic -- never sorted by family name). The first
      occurrence of a family gets weight 1.0; every subsequent occurrence of
      the SAME family gets a flat `discount_factor` weight (not compounding
      further for a 3rd+ repeat). Items with `family=None` are never
      discounted against each other -- unknown lineage is never assumed to
      correlate, so every `family=None` item always gets weight 1.0.
    """
    clamped_factor = max(0.0, min(1.0, discount_factor))

    if len(assessments_with_families) < 2:
        if len(assessments_with_families) == 1:
            weights = [{"index": 0, "weight": 1.0, "discounted": False}]
            effective_total = 1.0
        else:
            weights = []
            effective_total = 0.0
        return {
            "applicable": False,
            "reason": "single_judgment",
            "weights": weights,
            "discountFactor": clamped_factor,
            "effectiveWeightTotal": effective_total,
        }

    seen_families: set[str] = set()
    weights: list[dict] = []
    for index, item in enumerate(assessments_with_families):
        family = item.get("family")
        if family is None:
            weight = 1.0
            discounted = False
        elif family in seen_families:
            weight = clamped_factor
            discounted = True
        else:
            weight = 1.0
            discounted = False
            seen_families.add(family)
        weights.append({"index": index, "family": family, "weight": weight, "discounted": discounted})

    return {
        "applicable": True,
        "discountFactor": clamped_factor,
        "weights": weights,
        "effectiveWeightTotal": sum(entry["weight"] for entry in weights),
    }


def calibration_report(db: Session, family: str | None = None) -> dict:
    """Return an honest Brier/ECE calibration-report stub.

    Real DB-backed function (unlike `judge_weight`/`correlated_discount`
    above, which are pure) -- this one queries `JudgeOutputArtifact` for a
    REAL `judgmentsObserved` count. `brier`/`ece` are ALWAYS None and
    `resolvedOutcomes` is ALWAYS the literal 0 in this phase: no
    outcome/ground-truth-label substrate exists anywhere in this repo (see
    Phase 8 plan UNVERIFIED #3 -- re-grepped, zero hits), so there is
    nothing to resolve a real Brier score or ECE against yet. This is an
    honest structural statement, not a fabricated number, mirroring Phase
    7's "no_ground_truth_outcomes" stub framing.

    `judgmentsObserved` counts persisted `JudgeOutputArtifact` rows where
    `parse_status == "available"` and `assessment is not None`, optionally
    scoped to `family` (derived via `lineage_family(_public_metadata_text(row.model))`
    in Python, since `JudgeOutputArtifact.model` is a raw string and
    `lineage_family` is not a SQL expression -- option (a) from the task
    brief: fetch matching rows and post-filter in Python. This function is
    a report, not a hot path.). A zero count is itself an honest, valid
    result -- the same shape is returned whether or not any judgments exist.

    `JudgeOutputArtifact.model` is persisted raw/unscrubbed (see
    `_persist_judge_output_artifact` in `service.py`), so it is scrubbed via
    `_public_metadata_text` before deriving `family` here -- the same
    scrub already applied at every other lineage_family call site (binding
    invariant since Phase 6; see the identical rationale in
    `service.py`'s `_attach_plural_judge_provenance`). Without this scrub, a
    secret-like model string could surface verbatim as the served `family`
    value in this report's output. `_public_metadata_text` lives in
    `app.scoring.lineage` (moved there from `app.scoring.service` in the
    Phase 8 Task 3 fix wave specifically so this module could import it at
    the top level without creating an import cycle, since `service.py`
    imports from this module).
    """
    rows = db.scalars(
        select(JudgeOutputArtifact.model).where(
            JudgeOutputArtifact.parse_status == "available",
            JudgeOutputArtifact.assessment.is_not(None),
        )
    ).all()

    if family is None:
        judgments_observed = len(rows)
    else:
        judgments_observed = sum(
            1 for model in rows if lineage_family(_public_metadata_text(model)) == family
        )

    return {
        "family": family,
        "brier": None,
        "ece": None,
        "reason": "no_ground_truth_outcomes",
        "judgmentsObserved": judgments_observed,
        "resolvedOutcomes": 0,
        "calibrationVersion": CALIBRATION_VERSION,
    }
