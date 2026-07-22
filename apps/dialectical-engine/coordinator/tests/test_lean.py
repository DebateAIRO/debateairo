from __future__ import annotations

from app.scoring.lean import compute_lean, live_pro_con_node_ids


# ---------------------------------------------------------------------------
# live_pro_con_node_ids: T2 dead-node-exclusion precedent applied to PRO/CON
# ---------------------------------------------------------------------------


def test_live_pro_con_node_ids_splits_by_type_and_excludes_dead_statuses() -> None:
    nodes = [
        {"id": "root", "node_type": "ROOT_CLAIM", "status": "complete"},
        {"id": "pro-1", "node_type": "PRO", "status": "complete"},
        {"id": "pro-2", "node_type": "PRO", "status": "failed"},
        {"id": "pro-3", "node_type": "PRO", "status": "stale"},
        {"id": "con-1", "node_type": "CON", "status": "complete"},
        # path_status == "abandoned" is deliberately NOT excluded, matching
        # app.scoring.service._debate_node_ids (T2 precedent): an
        # abandoned-but-status=="complete" node is still a real argument.
        {"id": "con-2", "node_type": "CON", "status": "complete", "path_status": "abandoned"},
        {"id": "evidence-1", "node_type": "EVIDENCE", "status": "complete"},
        {"id": "pov-1", "node_type": "SCIENTIFIC_POV", "status": "complete"},
    ]

    pro_ids, con_ids = live_pro_con_node_ids(nodes)

    assert pro_ids == ["pro-1"]
    assert con_ids == ["con-1", "con-2"]


def test_live_pro_con_node_ids_empty_for_no_nodes() -> None:
    assert live_pro_con_node_ids([]) == ([], [])


# ---------------------------------------------------------------------------
# compute_lean: dialectical branch (propagated DF-QuAD strengths)
# ---------------------------------------------------------------------------


def test_compute_lean_dialectical_pro_majority() -> None:
    protocol_output = {
        "dialecticalStrengths": {"pro-1": 0.9, "con-1": 0.3},
        "tauCoverage": 1.0,
    }
    result = compute_lean(protocol_output, live_pro_node_ids=["pro-1"], live_con_node_ids=["con-1"])
    assert result == {"source": "dialectical", "pct": 75, "label": "Pro"}


def test_compute_lean_dialectical_con_majority() -> None:
    protocol_output = {
        "dialecticalStrengths": {"pro-1": 0.2, "con-1": 0.8},
        "tauCoverage": 1.0,
    }
    result = compute_lean(protocol_output, live_pro_node_ids=["pro-1"], live_con_node_ids=["con-1"])
    assert result == {"source": "dialectical", "pct": 20, "label": "Con"}


def test_compute_lean_dialectical_even_split_has_no_structural_suffix() -> None:
    # A REAL dialectical 50/50 (usable judge-informed strengths) must read
    # as plain "Even" -- the "(structural)" disambiguation is reserved for
    # the count-based fallback, never the genuine strength reading.
    protocol_output = {
        "dialecticalStrengths": {"pro-1": 0.5, "con-1": 0.5},
        "tauCoverage": 1.0,
    }
    result = compute_lean(protocol_output, live_pro_node_ids=["pro-1"], live_con_node_ids=["con-1"])
    assert result == {"source": "dialectical", "pct": 50, "label": "Even"}


def test_compute_lean_sums_strength_across_multiple_nodes_per_side() -> None:
    protocol_output = {
        "dialecticalStrengths": {"pro-1": 0.4, "pro-2": 0.4, "con-1": 0.2},
        "tauCoverage": 1.0,
    }
    result = compute_lean(
        protocol_output, live_pro_node_ids=["pro-1", "pro-2"], live_con_node_ids=["con-1"]
    )
    assert result == {"source": "dialectical", "pct": 80, "label": "Pro"}


def test_compute_lean_missing_strength_entry_contributes_zero_not_a_crash() -> None:
    protocol_output = {
        "dialecticalStrengths": {"pro-1": 0.6},  # con-1 has no recorded strength
        "tauCoverage": 1.0,
    }
    result = compute_lean(protocol_output, live_pro_node_ids=["pro-1"], live_con_node_ids=["con-1"])
    assert result == {"source": "dialectical", "pct": 100, "label": "Pro"}


def test_compute_lean_excludes_dead_node_ids_from_mass_when_caller_omits_them() -> None:
    # A failed node's inflated strength must never influence the mass -- the
    # caller (live_pro_con_node_ids) is what keeps it out of the id lists in
    # the first place; this proves compute_lean only ever sums over the ids
    # it is actually given.
    protocol_output = {
        "dialecticalStrengths": {"pro-1": 0.5, "pro-dead": 0.99, "con-1": 0.5},
        "tauCoverage": 1.0,
    }
    result = compute_lean(protocol_output, live_pro_node_ids=["pro-1"], live_con_node_ids=["con-1"])
    assert result == {"source": "dialectical", "pct": 50, "label": "Even"}


# ---------------------------------------------------------------------------
# compute_lean: fallback -- divide-by-zero guard
# ---------------------------------------------------------------------------


def test_compute_lean_zero_total_mass_falls_back_to_structural() -> None:
    protocol_output = {
        "dialecticalStrengths": {"pro-1": 0.0, "con-1": 0.0},
        "tauCoverage": 1.0,
    }
    result = compute_lean(protocol_output, live_pro_node_ids=["pro-1"], live_con_node_ids=["con-1"])
    assert result == {"source": "structural", "pct": 50, "label": "Even (structural)"}


# ---------------------------------------------------------------------------
# compute_lean: fallback -- tauCoverage == 0 (default taus carry no signal)
# ---------------------------------------------------------------------------


def test_compute_lean_zero_tau_coverage_falls_back_despite_real_looking_strengths() -> None:
    protocol_output = {
        "dialecticalStrengths": {"pro-1": 0.9, "con-1": 0.1},
        "tauCoverage": 0.0,
    }
    result = compute_lean(protocol_output, live_pro_node_ids=["pro-1"], live_con_node_ids=["con-1"])
    assert result == {"source": "structural", "pct": 50, "label": "Even (structural)"}


def test_compute_lean_missing_tau_coverage_defaults_to_zero_and_falls_back() -> None:
    # Every pre-W2 stored protocol_analysis run lacks tauCoverage entirely --
    # matches app.scoring.verdict.verdict_summary's identical default.
    protocol_output = {"dialecticalStrengths": {"pro-1": 0.9, "con-1": 0.1}}
    result = compute_lean(protocol_output, live_pro_node_ids=["pro-1"], live_con_node_ids=["con-1"])
    assert result["source"] == "structural"


def test_compute_lean_out_of_range_tau_coverage_treated_as_zero() -> None:
    protocol_output = {
        "dialecticalStrengths": {"pro-1": 0.9, "con-1": 0.1},
        "tauCoverage": 1.5,
    }
    result = compute_lean(protocol_output, live_pro_node_ids=["pro-1"], live_con_node_ids=["con-1"])
    assert result["source"] == "structural"


# ---------------------------------------------------------------------------
# compute_lean: fallback -- no/malformed protocol_analysis output
# ---------------------------------------------------------------------------


def test_compute_lean_no_protocol_output_uses_structural_counts() -> None:
    result = compute_lean(
        None,
        live_pro_node_ids=["pro-1", "pro-2", "pro-3"],
        live_con_node_ids=["con-1", "con-2", "con-3"],
    )
    assert result == {"source": "structural", "pct": 50, "label": "Even (structural)"}


def test_compute_lean_malformed_protocol_output_uses_structural_counts() -> None:
    result = compute_lean("not-a-dict", live_pro_node_ids=["pro-1"], live_con_node_ids=["con-1", "con-2"])
    assert result["source"] == "structural"


def test_compute_lean_malformed_dialectical_strengths_uses_structural_counts() -> None:
    protocol_output = {"dialecticalStrengths": "not-a-dict", "tauCoverage": 1.0}
    result = compute_lean(protocol_output, live_pro_node_ids=["pro-1"], live_con_node_ids=["con-1", "con-2"])
    assert result["source"] == "structural"


# ---------------------------------------------------------------------------
# compute_lean: structural label rule -- symmetric vs genuinely asymmetric
# ---------------------------------------------------------------------------


def test_compute_lean_structural_symmetric_counts_label_even_structural() -> None:
    # This is the audit's finding: the v2 generation contract guarantees
    # exactly-symmetric PRO/CON counts today, so this is the common case.
    result = compute_lean(None, live_pro_node_ids=["p1", "p2", "p3"], live_con_node_ids=["c1", "c2", "c3"])
    assert result == {"source": "structural", "pct": 50, "label": "Even (structural)"}


def test_compute_lean_structural_asymmetric_counts_label_from_thresholds() -> None:
    # Only possible once adaptive expansion grows one side more -- genuinely
    # informative count differential, so it gets a plain (non-suffixed)
    # label, but `source` still honestly reads "structural".
    result = compute_lean(
        None,
        live_pro_node_ids=["p1", "p2", "p3", "p4", "p5", "p6"],
        live_con_node_ids=["c1", "c2"],
    )
    assert result == {"source": "structural", "pct": 75, "label": "Pro"}


def test_compute_lean_structural_asymmetric_but_still_in_even_band() -> None:
    # 10 vs 9 -> 52.6%, rounds into the 46-54 "Even" band, but the counts are
    # NOT symmetric -- plain "Even", not "(structural)"-suffixed, per the
    # controller design (only exact symmetry gets the disambiguating suffix).
    result = compute_lean(
        None,
        live_pro_node_ids=[f"p{i}" for i in range(10)],
        live_con_node_ids=[f"c{i}" for i in range(9)],
    )
    assert result == {"source": "structural", "pct": 53, "label": "Even"}


# ---------------------------------------------------------------------------
# compute_lean: no data at all -- honest absence, never a fabricated 50/50
# ---------------------------------------------------------------------------


def test_compute_lean_returns_none_when_no_live_nodes_at_all() -> None:
    assert compute_lean(None, live_pro_node_ids=[], live_con_node_ids=[]) is None


def test_compute_lean_returns_none_when_no_live_nodes_even_with_protocol_output() -> None:
    protocol_output = {"dialecticalStrengths": {}, "tauCoverage": 1.0}
    assert compute_lean(protocol_output, live_pro_node_ids=[], live_con_node_ids=[]) is None
