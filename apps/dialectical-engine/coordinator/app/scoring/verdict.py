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

VERDICT_THRESHOLDS_VERSION = "verdict-v1"

_SUPPORTED_THRESHOLD = 0.65
_UNSUPPORTED_THRESHOLD = 0.35

_UNAVAILABLE_CLAIM_LANGUAGE = "No protocol analysis is available yet for this debate."


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


def verdict_summary(protocol_output: dict | None, *, root_node_id: str | None) -> dict[str, Any]:
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
        return _unavailable()

    if not isinstance(protocol_output, dict):
        return _unavailable()

    strengths = protocol_output.get("dialecticalStrengths")
    verification_statuses = protocol_output.get("verificationStatuses")
    if not isinstance(verification_statuses, dict):
        verification_statuses = {}
    verification_status = verification_statuses.get(root_node_id)
    convergence = protocol_output.get("convergence")

    if not isinstance(strengths, dict) or root_node_id not in strengths:
        return _unavailable(verification_status=verification_status, convergence=convergence)

    strength = strengths[root_node_id]
    if not isinstance(strength, (int, float)) or isinstance(strength, bool):
        return _unavailable(verification_status=verification_status, convergence=convergence)
    strength = float(strength)

    if strength >= _SUPPORTED_THRESHOLD:
        band = "supported"
        claim_language = f"The root claim is strongly supported (dialectical strength {round(strength, 2)})."
    elif strength <= _UNSUPPORTED_THRESHOLD:
        band = "unsupported"
        claim_language = f"The root claim is weakly supported (dialectical strength {round(strength, 2)})."
    else:
        band = "contested"
        claim_language = f"The root claim is contested (dialectical strength {round(strength, 2)})."

    if verification_status in ("pending", "pending_verification"):
        claim_language += " Verification is still pending."

    if isinstance(convergence, dict) and convergence.get("converged") is False:
        claim_language += " Not yet converged."

    return {
        "verdictBand": band,
        "claimLanguage": claim_language,
        "basis": {
            "dialecticalStrength": strength,
            "verificationStatus": verification_status,
            "convergence": convergence,
        },
        "verdictThresholdsVersion": VERDICT_THRESHOLDS_VERSION,
    }
