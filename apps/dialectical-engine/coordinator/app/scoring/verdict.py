"""Phase 9 Task 1: pure verdict summary derived from persisted protocol_analysis output.

verdict_summary is a pure function -- no I/O, no DB access, no LLM calls. It
maps the real, already-persisted `protocol_analysis` AnalyzerRun output
(see app/protocol/runner.py's `_run_protocol_analysis`) to a qualitative
"verdict band" plus a deterministic, honest plain-language sentence.

Honesty laws (binding, see docs/superpowers/plans/2026-07-07-phase9-verdict-first-ui.md):
- The v1 band thresholds below (>= 0.65 supported, <= 0.35 unsupported, else
  contested) are FIXED/DECLARED, not learned or calibrated. They are versioned
  via VERDICT_THRESHOLDS_VERSION so callers/UI can display that this is a
  declared-not-learned mapping, and so the value can be revised later without
  silently changing meaning under callers' feet.
- The real underlying dialectical strength (and verificationStatus/convergence)
  is always returned alongside the band in `basis` -- never band-only, never a
  fabricated number.
- "pending" (real-verdict path, all-unverifiable) and "pending_verification"
  (P5b kind-classifier fallback) are DISTINCT verificationStatus values and
  are never conflated in `basis["verificationStatus"]`. Per the brief's
  documented either/or choice: this implementation appends the SAME suffix
  sentence ("Verification is still pending.") for both states in
  `claimLanguage` (the brief permits this as long as `basis.verificationStatus`
  keeps the real, un-merged value -- which it does).
- Missing/malformed input degrades honestly to the "unavailable" band; this
  function never raises.
"""
from __future__ import annotations

from typing import Any

from app.qbaf.semantics_versions import DEFAULT_SEMANTICS

VERDICT_THRESHOLDS_VERSION = "verdict-v2"
GATE_ELIGIBLE_CLAIM_TYPES = frozenset({"empirical"})

_SUPPORTED_THRESHOLD = 0.65
_UNSUPPORTED_THRESHOLD = 0.35
# W2 (verdict-v1 -> verdict-v2): minimum 0..1 fraction of argument nodes whose
# tau came from persisted judge scores (protocol run's "tauCoverage") before a
# strength-based band may be served. Below it the honest band is
# "insufficient_scoring" -- the strength of an all-default-tau run is a
# topology artifact, not evidence. Declared, not learned, like the band
# thresholds above; the version bump marks its introduction.
_TAU_COVERAGE_MIN = 0.5

_UNAVAILABLE_CLAIM_LANGUAGE = "No protocol analysis is available yet for this debate."
_SUPPRESSED_CLAIM_LANGUAGE = (
    "Endorsed verdict withheld — no evidence was produced in this run for this empirical claim."
)
_NO_EVIDENCE_DETAIL = (
    "No evidence was produced in this run; an endorsed verdict for an empirical claim "
    "requires evidence."
)
_EVIDENCE_UNVERIFIED_DETAIL = (
    "Evidence spans were extracted but no external source was resolved or verified."
)
_CLAIM_TYPE_UNKNOWN_DETAIL = (
    "This claim's type could not be established from stored analysis output, so the "
    "evidence gate was not applied."
)
_NO_EVIDENCE_UNLOCK = [
    "attach or cite sources for this claim",
    "re-run once evidence extraction yields spans",
]


def _mapping_value(value: Any, key: str) -> Any | None:
    return value.get(key) if isinstance(value, dict) else None


def _no_evidence_reason(claim_type: str, claim_type_source: Any | None) -> dict[str, Any]:
    return {
        "code": "no_evidence",
        "claimType": claim_type,
        "claimTypeSource": claim_type_source,
        "detail": _NO_EVIDENCE_DETAIL,
        "unlock": list(_NO_EVIDENCE_UNLOCK),
    }


def _unavailable(
    *,
    verification_status: Any | None = None,
    convergence: Any | None = None,
) -> dict[str, Any]:
    return {
        "verdictBand": "unavailable",
        "claimLanguage": _UNAVAILABLE_CLAIM_LANGUAGE,
        "basis": {
            "dialecticalStrength": None,
            "verificationStatus": verification_status,
            "convergence": convergence,
        },
        "verdictThresholdsVersion": VERDICT_THRESHOLDS_VERSION,
    }


def _apply_evidence_gate(
    summary: dict[str, Any],
    *,
    protocol_output: dict | None,
    root_node_id: str | None,
    evidence_presence: str | None,
    gate_enabled: bool,
) -> dict[str, Any]:
    pre_gate_band = summary["verdictBand"]
    summary["basis"]["preGateVerdictBand"] = pre_gate_band

    claim_types = protocol_output.get("claimTypes") if isinstance(protocol_output, dict) else None
    claim_type_sources = (
        protocol_output.get("claimTypeSource") if isinstance(protocol_output, dict) else None
    )
    raw_claim_type = _mapping_value(claim_types, root_node_id) if root_node_id else None
    claim_type = (
        raw_claim_type
        if isinstance(raw_claim_type, str) and raw_claim_type.strip()
        else None
    )
    raw_claim_type_source = (
        _mapping_value(claim_type_sources, root_node_id) if root_node_id else None
    )
    claim_type_source = (
        raw_claim_type_source
        if isinstance(raw_claim_type_source, str) and raw_claim_type_source.strip()
        else None
    )
    gate_eligible = claim_type in GATE_ELIGIBLE_CLAIM_TYPES
    would_suppress = gate_eligible and evidence_presence == "none"
    suppression_reason = (
        _no_evidence_reason(claim_type, claim_type_source) if would_suppress else None
    )
    caveats: list[dict[str, str]] = []
    if gate_eligible and evidence_presence == "extracted_unresolved":
        caveats.append(
            {"code": "evidence_unverified", "detail": _EVIDENCE_UNVERIFIED_DETAIL}
        )
    if claim_type in (None, "unknown") and evidence_presence == "none":
        caveats.append(
            {"code": "claim_type_unknown", "detail": _CLAIM_TYPE_UNKNOWN_DETAIL}
        )

    summary.update(
        {
            "verdictState": "endorsed_with_caveat" if caveats else "endorsed",
            "evidencePresence": evidence_presence,
            "suppressionReason": None,
            "caveats": caveats,
        }
    )
    if gate_enabled and would_suppress:
        summary.update(
            {
                "verdictBand": "suppressed",
                "claimLanguage": _SUPPRESSED_CLAIM_LANGUAGE,
                "verdictState": "suppressed_no_evidence",
                "suppressionReason": suppression_reason,
            }
        )
    if not gate_enabled:
        summary["evidenceGateShadow"] = {
            "wouldSuppress": would_suppress,
            "reason": suppression_reason,
            "claimType": claim_type,
            "claimTypeSource": claim_type_source,
        }
    return summary


def verdict_summary(
    protocol_output: dict | None,
    *,
    root_node_id: str | None,
    evidence_presence: str | None = None,
    gate_enabled: bool = False,
) -> dict[str, Any]:
    """Pure mapping from a real (or absent) protocol_analysis output to a
    qualitative verdict band + deterministic claim-language string.

    protocol_output: the `.output` dict of the latest persisted
        `protocol_analysis` AnalyzerRun, or None if no such run exists yet.
    root_node_id: the debate's root claim node id (see
        app/qbaf/debate_adapter.py -- ROOT_CLAIM is the node_type excluded
        from QBAF edges, and `dialecticalStrengths` is keyed by node id
        verbatim, so the root claim's own strength is
        `dialecticalStrengths[root_node_id]`), or None if the debate has no
        resolved root node.

    Never raises -- every lookup is defensive; malformed/partial input
    degrades to the "unavailable" shape rather than a stack trace.
    """
    if not protocol_output or not root_node_id:
        return _apply_evidence_gate(
            _unavailable(),
            protocol_output=protocol_output,
            root_node_id=root_node_id,
            evidence_presence=evidence_presence,
            gate_enabled=gate_enabled,
        )

    if not isinstance(protocol_output, dict):
        return _apply_evidence_gate(
            _unavailable(),
            protocol_output=None,
            root_node_id=root_node_id,
            evidence_presence=evidence_presence,
            gate_enabled=gate_enabled,
        )

    strengths = protocol_output.get("dialecticalStrengths")
    verification_statuses = protocol_output.get("verificationStatuses")
    if not isinstance(verification_statuses, dict):
        verification_statuses = {}
    verification_status = verification_statuses.get(root_node_id)
    convergence = protocol_output.get("convergence")

    if not isinstance(strengths, dict) or root_node_id not in strengths:
        return _apply_evidence_gate(
            _unavailable(verification_status=verification_status, convergence=convergence),
            protocol_output=protocol_output,
            root_node_id=root_node_id,
            evidence_presence=evidence_presence,
            gate_enabled=gate_enabled,
        )

    strength = strengths[root_node_id]
    if not isinstance(strength, (int, float)) or isinstance(strength, bool):
        return _apply_evidence_gate(
            _unavailable(verification_status=verification_status, convergence=convergence),
            protocol_output=protocol_output,
            root_node_id=root_node_id,
            evidence_presence=evidence_presence,
            gate_enabled=gate_enabled,
        )
    strength = float(strength)

    semantics_version = protocol_output.get("semanticsVersion")
    if not isinstance(semantics_version, str) or not semantics_version.strip():
        semantics_version = DEFAULT_SEMANTICS
    support_label = (
        f"dialectical support under semantics version {semantics_version}: "
        f"{round(strength, 2)}"
    )

    raw_tau_coverage = protocol_output.get("tauCoverage")
    if (
        isinstance(raw_tau_coverage, (int, float))
        and not isinstance(raw_tau_coverage, bool)
        and 0.0 <= float(raw_tau_coverage) <= 1.0
    ):
        tau_coverage = float(raw_tau_coverage)
    else:
        # Stored runs without the W2 tauCoverage field (every pre-existing
        # artifact) were computed over all-default taus, and a malformed
        # value proves nothing -- 0.0 is the honest reading, never a guess.
        tau_coverage = 0.0
    tau_source_majority = "judge_strength" if tau_coverage >= _TAU_COVERAGE_MIN else "default"

    if tau_coverage < _TAU_COVERAGE_MIN:
        band = "insufficient_scoring"
        claim_language = (
            "No verdict is served: too few argument nodes carry judge scores "
            f"(tau coverage {round(tau_coverage, 2)}, below the declared minimum "
            f"{_TAU_COVERAGE_MIN}). Structural reading for transparency ({support_label})."
        )
    elif strength >= _SUPPORTED_THRESHOLD:
        band = "supported"
        claim_language = f"The root claim is strongly supported ({support_label})."
    elif strength <= _UNSUPPORTED_THRESHOLD:
        band = "unsupported"
        claim_language = f"The root claim is weakly supported ({support_label})."
    else:
        band = "contested"
        claim_language = f"The root claim is contested ({support_label})."

    if verification_status in ("pending", "pending_verification"):
        claim_language += " Verification is still pending."

    if isinstance(convergence, dict) and convergence.get("converged") is False:
        claim_language += " Not yet converged."

    summary = {
        "verdictBand": band,
        "claimLanguage": claim_language,
        "basis": {
            "dialecticalStrength": strength,
            "verificationStatus": verification_status,
            "convergence": convergence,
            "semanticsVersion": semantics_version,
            # W2 additive: the coverage the band was gated on, plus the run's
            # tau-source majority -- the band always sits beside the real
            # strength AND the real coverage, never alone.
            "tauCoverage": tau_coverage,
            "tauSourceMajority": tau_source_majority,
        },
        "verdictThresholdsVersion": VERDICT_THRESHOLDS_VERSION,
    }
    return _apply_evidence_gate(
        summary,
        protocol_output=protocol_output,
        root_node_id=root_node_id,
        evidence_presence=evidence_presence,
        gate_enabled=gate_enabled,
    )
