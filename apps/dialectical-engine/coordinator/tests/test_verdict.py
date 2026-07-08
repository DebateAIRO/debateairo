from __future__ import annotations

from app.scoring.verdict import VERDICT_THRESHOLDS_VERSION, verdict_summary


def test_verdict_unavailable_when_no_protocol_output() -> None:
    result = verdict_summary(None, root_node_id="node-1")
    assert result["verdictBand"] == "unavailable"
    assert "no protocol analysis" in result["claimLanguage"].lower() or "not available" in result["claimLanguage"].lower()
    assert result["basis"] == {"dialecticalStrength": None, "verificationStatus": None, "convergence": None}
    assert result["verdictThresholdsVersion"] == VERDICT_THRESHOLDS_VERSION


def test_verdict_unavailable_when_no_root_node_id() -> None:
    result = verdict_summary({"dialecticalStrengths": {"node-1": 0.9}}, root_node_id=None)
    assert result["verdictBand"] == "unavailable"


def test_verdict_supported_band_from_real_strength() -> None:
    output = {
        "dialecticalStrengths": {"node-1": 0.8},
        "verificationStatuses": {"node-1": "verified"},
        "convergence": {"converged": True, "reason": None},
    }
    result = verdict_summary(output, root_node_id="node-1")
    assert result["verdictBand"] == "supported"
    assert result["basis"]["dialecticalStrength"] == 0.8
    assert "0.8" in result["claimLanguage"]
    assert result["basis"]["verificationStatus"] == "verified"
    assert result["basis"]["convergence"] == {"converged": True, "reason": None}


def test_verdict_unsupported_band() -> None:
    result = verdict_summary({"dialecticalStrengths": {"node-1": 0.2}}, root_node_id="node-1")
    assert result["verdictBand"] == "unsupported"


def test_verdict_contested_band_midpoint() -> None:
    result = verdict_summary({"dialecticalStrengths": {"node-1": 0.5}}, root_node_id="node-1")
    assert result["verdictBand"] == "contested"


def test_verdict_pending_vs_pending_verification_are_not_conflated() -> None:
    pending = verdict_summary(
        {"dialecticalStrengths": {"node-1": 0.7}, "verificationStatuses": {"node-1": "pending"}},
        root_node_id="node-1",
    )
    pending_verification = verdict_summary(
        {"dialecticalStrengths": {"node-1": 0.7}, "verificationStatuses": {"node-1": "pending_verification"}},
        root_node_id="node-1",
    )
    assert pending["basis"]["verificationStatus"] == "pending"
    assert pending_verification["basis"]["verificationStatus"] == "pending_verification"
    assert pending["basis"]["verificationStatus"] != pending_verification["basis"]["verificationStatus"]


def test_verdict_missing_strengths_still_surfaces_real_partial_data() -> None:
    output = {"qbafUnavailableReason": "cycle detected", "verificationStatuses": {"node-1": "pending_verification"}, "convergence": {"converged": None, "reason": "strengths_unavailable"}}
    result = verdict_summary(output, root_node_id="node-1")
    assert result["verdictBand"] == "unavailable"
    assert result["basis"]["dialecticalStrength"] is None
    assert result["basis"]["verificationStatus"] == "pending_verification"
    assert result["basis"]["convergence"] == {"converged": None, "reason": "strengths_unavailable"}


def test_verdict_never_raises_on_malformed_input() -> None:
    result = verdict_summary({"dialecticalStrengths": "not-a-dict"}, root_node_id="node-1")
    assert result["verdictBand"] == "unavailable"
