"""P4.1: pure derivation of the synthesis "Leans" meter from persisted
protocol_analysis output.

``compute_lean`` is a pure function -- no I/O, no DB access, no LLM calls,
mirroring app.scoring.verdict.verdict_summary's contract. It prefers the
propagated DF-QuAD strength split of live PRO vs CON nodes
(``source="dialectical"``) when the latest persisted ``protocol_analysis``
AnalyzerRun (see app/protocol/runner.py's ``_run_protocol_analysis``) carries
usable, judge-informed strengths, and falls back to a raw live-node-count
split (``source="structural"``) otherwise.

Honesty law (binding, see docs/improvement-plan-2026-07-22.md P4.1): the v2
debate-generation contract guarantees a symmetric PRO/CON node count on every
completed branch (audit-verified: all 12 debates in the DB had exactly equal
PRO/CON counts as of the 2026-07-22 audit) -- a bare "Even" count-based label
would silently misrepresent that permanent topology artifact as a genuine
50/50 dialectical reading forever. The structural fallback therefore labels
an exactly-symmetric count split "Even (structural)"; only a genuinely
asymmetric count split (only reachable once adaptive expansion grows one side
more than the other) gets a plain Pro/Con/Even label, and even then `source`
stays "structural" -- it is still a topology proxy, not a strength reading.
"""
from __future__ import annotations

from typing import Any, Iterable, Mapping

PRO_LABEL_THRESHOLD = 55
CON_LABEL_THRESHOLD = 45

# T2 (P0.5) dead-node-exclusion precedent, applied here to PRO/CON nodes:
# app.scoring.service._debate_node_ids excludes status=="failed" (a
# permanent, terminal dead placeholder -- no code path ever resets status
# away from "failed") from judging; app.protocol.runner._run_protocol_
# analysis's dead_node_ids does the same for tauCoverage's denominator.
# "stale" (superseded by a later revision) is the other permanent non-live
# state. path_status=="abandoned" is deliberately NOT included here, matching
# that precedent exactly: an abandoned-but-status=="complete" node is still a
# real, generated argument and must keep counting as live.
_DEAD_STATUSES = frozenset({"failed", "stale"})


def live_pro_con_node_ids(
    nodes: Iterable[Mapping[str, Any]],
) -> tuple[list[str], list[str]]:
    """Split a debate's nodes into (live PRO ids, live CON ids).

    ``nodes``: plain ``{"id", "node_type", "status"}`` mappings (matches the
    node_dicts shape app.protocol.runner already builds from ORM Node rows --
    no ORM import needed here, keeping this module pure/independently
    testable). Every other node_type (EVIDENCE, POV/lens containers,
    ROOT_CLAIM) is excluded by construction: neither list is ever populated
    from them.
    """
    pro_ids: list[str] = []
    con_ids: list[str] = []
    for node in nodes:
        if node.get("status") in _DEAD_STATUSES:
            continue
        node_id = node.get("id")
        if node_id is None:
            continue
        node_type = node.get("node_type")
        if node_type == "PRO":
            pro_ids.append(str(node_id))
        elif node_type == "CON":
            con_ids.append(str(node_id))
    return pro_ids, con_ids


def _label_from_pct(pct: int) -> str:
    if pct >= PRO_LABEL_THRESHOLD:
        return "Pro"
    if pct <= CON_LABEL_THRESHOLD:
        return "Con"
    return "Even"


def _numeric_or_none(value: Any) -> float | None:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    return None


def _structural_lean(pro_count: int, con_count: int) -> dict[str, Any] | None:
    total = pro_count + con_count
    if total == 0:
        return None
    pct = round(100 * pro_count / total)
    label = "Even (structural)" if pro_count == con_count else _label_from_pct(pct)
    return {"source": "structural", "pct": pct, "label": label}


def compute_lean(
    protocol_output: Mapping[str, Any] | None,
    *,
    live_pro_node_ids: Iterable[str],
    live_con_node_ids: Iterable[str],
) -> dict[str, Any] | None:
    """Pure mapping from a real (or absent) protocol_analysis output plus the
    debate's live PRO/CON node ids to a lean summary for the synthesis
    "Leans" meter.

    protocol_output: the ``.output`` dict of the latest persisted
        ``protocol_analysis`` AnalyzerRun, or None if no such run exists yet.
    live_pro_node_ids / live_con_node_ids: ids of live (not failed/stale)
        PRO/CON nodes -- see ``live_pro_con_node_ids``.

    Prefers ``source="dialectical"`` (propagated DF-QuAD strength split,
    ``pro_mass = sum(strength(n) for n in live PRO)``, likewise for CON, ``pct
    = round(100 * pro_mass / (pro_mass + con_mass))``) when the run has
    usable, judge-informed strengths -- ``tauCoverage > 0``, since an
    all-default-tau run carries no real judge signal (same
    ``_TAU_COVERAGE_MIN``-style gate as app.scoring.verdict.verdict_summary,
    just thresholded at >0 rather than >=0.5: any real signal at all is
    enough to prefer strength over a raw count here) -- and the resulting
    pro+con mass is non-zero (divide-by-zero guard). Falls back to
    ``source="structural"`` (live node count split) otherwise.

    Returns None only when there is genuinely no live PRO/CON node to read a
    lean from (e.g. before any argument exists) -- never a fabricated 50/50.
    Never raises: malformed input degrades to the structural path.
    """
    pro_ids = list(live_pro_node_ids)
    con_ids = list(live_con_node_ids)

    strengths = protocol_output.get("dialecticalStrengths") if isinstance(protocol_output, Mapping) else None
    raw_tau_coverage = protocol_output.get("tauCoverage") if isinstance(protocol_output, Mapping) else None
    if (
        isinstance(raw_tau_coverage, (int, float))
        and not isinstance(raw_tau_coverage, bool)
        and 0.0 <= float(raw_tau_coverage) <= 1.0
    ):
        tau_coverage = float(raw_tau_coverage)
    else:
        # Missing/malformed coverage (every pre-W2 stored run, or a corrupt
        # value) is honestly no coverage at all -- same default as
        # app.scoring.verdict.verdict_summary.
        tau_coverage = 0.0

    if isinstance(strengths, Mapping) and tau_coverage > 0.0:
        pro_mass = sum((_numeric_or_none(strengths.get(node_id)) or 0.0) for node_id in pro_ids)
        con_mass = sum((_numeric_or_none(strengths.get(node_id)) or 0.0) for node_id in con_ids)
        total_mass = pro_mass + con_mass
        if total_mass > 0.0:
            pct = round(100 * pro_mass / total_mass)
            return {"source": "dialectical", "pct": pct, "label": _label_from_pct(pct)}

    return _structural_lean(len(pro_ids), len(con_ids))
