from __future__ import annotations

import json
import re

from app.scoring.verdict import VERDICT_THRESHOLDS_VERSION, verdict_summary


def test_verdict_unavailable_when_no_protocol_output() -> None:
    result = verdict_summary(None, root_node_id="node-1")
    assert result["verdictBand"] == "unavailable"
    assert "no protocol analysis" in result["claimLanguage"].lower() or "not available" in result["claimLanguage"].lower()
    assert result["basis"] == {
        "dialecticalStrength": None,
        "verificationStatus": None,
        "convergence": None,
        "preGateVerdictBand": "unavailable",
    }
    assert result["verdictState"] == "endorsed"
    assert result["suppressionReason"] is None
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


def test_verdict_state_suppressed_no_evidence_for_proven_empirical_claim() -> None:
    result = verdict_summary(
        {
            "dialecticalStrengths": {"node-1": 0.8},
            "claimTypes": {"node-1": "empirical"},
            "claimTypeSource": {"node-1": "root_claim_text"},
        },
        root_node_id="node-1",
        evidence_presence="none",
        gate_enabled=True,
    )

    assert result["verdictState"] == "suppressed_no_evidence"
    assert result["verdictBand"] == "suppressed"
    assert "withheld" in result["claimLanguage"].lower()
    assert result["suppressionReason"] == {
        "code": "no_evidence",
        "claimType": "empirical",
        "claimTypeSource": "root_claim_text",
        "detail": (
            "No evidence was produced in this run; an endorsed verdict for an empirical "
            "claim requires evidence."
        ),
        "unlock": [
            "attach or cite sources for this claim",
            "re-run once evidence extraction yields spans",
        ],
    }
    assert result["basis"]["preGateVerdictBand"] == "supported"


def test_non_empirical_claim_types_never_suppressed_in_v1() -> None:
    for claim_type in ("normative", "definitional"):
        result = verdict_summary(
            {
                "dialecticalStrengths": {"node-1": 0.8},
                "claimTypes": {"node-1": claim_type},
                "claimTypeSource": {"node-1": "root_claim_text"},
            },
            root_node_id="node-1",
            evidence_presence="none",
            gate_enabled=True,
        )

        assert result["verdictState"] == "endorsed"
        assert result["verdictBand"] == "supported"
        assert result["suppressionReason"] is None


def test_missing_or_unknown_claim_type_never_suppressed_and_never_fabricated() -> None:
    for claim_types in ({}, {"node-1": "unknown"}):
        result = verdict_summary(
            {
                "dialecticalStrengths": {"node-1": 0.8},
                "claimTypes": claim_types,
            },
            root_node_id="node-1",
            evidence_presence="none",
            gate_enabled=True,
        )

        assert result["verdictState"] == "endorsed_with_caveat"
        assert result["verdictBand"] == "supported"
        assert result["suppressionReason"] is None
        assert result["caveats"] == [
            {
                "code": "claim_type_unknown",
                "detail": (
                    "This claim's type could not be established from stored analysis output, "
                    "so the evidence gate was not applied."
                ),
            }
        ]


def test_verification_status_does_not_decide_eligibility() -> None:
    non_empirical_verified = verdict_summary(
        {
            "dialecticalStrengths": {"node-1": 0.8},
            "verificationStatuses": {"node-1": "verified"},
            "claimTypes": {"node-1": "normative"},
        },
        root_node_id="node-1",
        evidence_presence="none",
        gate_enabled=True,
    )
    empirical_pending = verdict_summary(
        {
            "dialecticalStrengths": {"node-1": 0.8},
            "verificationStatuses": {"node-1": "pending_verification"},
            "claimTypes": {"node-1": "empirical"},
        },
        root_node_id="node-1",
        evidence_presence="none",
        gate_enabled=True,
    )

    assert non_empirical_verified["verdictState"] == "endorsed"
    assert empirical_pending["verdictState"] == "suppressed_no_evidence"
    assert empirical_pending["basis"]["verificationStatus"] == "pending_verification"


def test_empirical_extracted_unresolved_gets_evidence_unverified_caveat_not_suppression() -> None:
    result = verdict_summary(
        {
            "dialecticalStrengths": {"node-1": 0.8},
            "claimTypes": {"node-1": "empirical"},
            "claimTypeSource": {"node-1": "scoring_item"},
        },
        root_node_id="node-1",
        evidence_presence="extracted_unresolved",
        gate_enabled=True,
    )

    assert result["verdictState"] == "endorsed_with_caveat"
    assert result["verdictBand"] == "supported"
    assert result["suppressionReason"] is None
    assert result["caveats"] == [
        {
            "code": "evidence_unverified",
            "detail": (
                "Evidence spans were extracted but no external source was resolved or verified."
            ),
        }
    ]


def test_flag_off_shadow_mode_keeps_legacy_fields_identical() -> None:
    output = {
        "dialecticalStrengths": {"node-1": 0.8},
        "verificationStatuses": {"node-1": "pending"},
        "convergence": {"converged": False, "reason": "topology_changed"},
        "semanticsVersion": "df-quad-weighted-v1",
        "claimTypes": {"node-1": "empirical"},
        "claimTypeSource": {"node-1": "root_claim_text"},
    }
    result = verdict_summary(
        output,
        root_node_id="node-1",
        evidence_presence="none",
        gate_enabled=False,
    )

    legacy_fields = {
        "verdictBand": result["verdictBand"],
        "claimLanguage": result["claimLanguage"],
        "verdictThresholdsVersion": result["verdictThresholdsVersion"],
        "basis": {
            key: result["basis"][key]
            for key in (
                "dialecticalStrength",
                "verificationStatus",
                "convergence",
                "semanticsVersion",
            )
        },
    }
    assert json.dumps(legacy_fields, separators=(",", ":")) == json.dumps(
        {
            "verdictBand": "supported",
            "claimLanguage": (
                "The root claim is strongly supported "
                "(dialectical support under semantics version df-quad-weighted-v1: 0.8)."
                " Verification is still pending. Not yet converged."
            ),
            "verdictThresholdsVersion": VERDICT_THRESHOLDS_VERSION,
            "basis": {
                "dialecticalStrength": 0.8,
                "verificationStatus": "pending",
                "convergence": {"converged": False, "reason": "topology_changed"},
                "semanticsVersion": "df-quad-weighted-v1",
            },
        },
        separators=(",", ":"),
    )
    assert result["verdictState"] == "endorsed"
    assert result["suppressionReason"] is None
    assert result["evidenceGateShadow"] == {
        "wouldSuppress": True,
        "reason": {
            "code": "no_evidence",
            "claimType": "empirical",
            "claimTypeSource": "root_claim_text",
            "detail": (
                "No evidence was produced in this run; an endorsed verdict for an empirical "
                "claim requires evidence."
            ),
            "unlock": [
                "attach or cite sources for this claim",
                "re-run once evidence extraction yields spans",
            ],
        },
        "claimType": "empirical",
        "claimTypeSource": "root_claim_text",
    }


def test_claim_language_labels_dialectical_support_under_semantics_version() -> None:
    stamped = verdict_summary(
        {
            "dialecticalStrengths": {"node-1": 0.8},
            "semanticsVersion": "df-quad-weighted-v1",
        },
        root_node_id="node-1",
    )
    assert (
        "dialectical support under semantics version df-quad-weighted-v1: 0.8"
        in stamped["claimLanguage"]
    )
    assert stamped["basis"]["semanticsVersion"] == "df-quad-weighted-v1"

    historical = verdict_summary(
        {"dialecticalStrengths": {"node-1": 0.5}},
        root_node_id="node-1",
    )
    assert (
        "dialectical support under semantics version df-quad-v1: 0.5"
        in historical["claimLanguage"]
    )
    assert historical["basis"]["semanticsVersion"] == "df-quad-v1"

    for summary in (stamped, historical):
        assert re.search(
            r"probabilit|truth[ -]?confidence|likelihood",
            summary["claimLanguage"],
            re.IGNORECASE,
        ) is None


def test_t4_label_migration_changes_only_claim_language_and_semantics_version() -> None:
    protocol_output = {
        "dialecticalStrengths": {"node-1": 0.8},
        "verificationStatuses": {"node-1": "pending"},
        "convergence": {"converged": False, "reason": "topology_changed"},
        "semanticsVersion": "df-quad-weighted-v1",
    }
    legacy = {
        "verdictBand": "supported",
        "claimLanguage": (
            "The root claim is strongly supported (dialectical strength 0.8)."
            " Verification is still pending. Not yet converged."
        ),
        "basis": {
            "dialecticalStrength": 0.8,
            "verificationStatus": "pending",
            "convergence": {"converged": False, "reason": "topology_changed"},
        },
        "verdictThresholdsVersion": VERDICT_THRESHOLDS_VERSION,
    }

    migrated = verdict_summary(protocol_output, root_node_id="node-1")

    assert migrated["claimLanguage"] == (
        "The root claim is strongly supported "
        "(dialectical support under semantics version df-quad-weighted-v1: 0.8)."
        " Verification is still pending. Not yet converged."
    )
    assert migrated["basis"]["semanticsVersion"] == "df-quad-weighted-v1"

    t6_additive_top_level = {
        "verdictState",
        "evidencePresence",
        "suppressionReason",
        "caveats",
        "evidenceGateShadow",
    }
    assert t6_additive_top_level <= migrated.keys()
    restored_legacy_shape = {
        **{
            key: value
            for key, value in migrated.items()
            if key not in t6_additive_top_level
        },
        "claimLanguage": legacy["claimLanguage"],
        "basis": {
            key: value
            for key, value in migrated["basis"].items()
            if key not in {"semanticsVersion", "preGateVerdictBand"}
        },
    }
    assert json.dumps(restored_legacy_shape, separators=(",", ":")) == json.dumps(
        legacy,
        separators=(",", ":"),
    )


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


def test_malformed_claim_type_is_treated_as_unknown_instead_of_raising() -> None:
    result = verdict_summary(
        {
            "dialecticalStrengths": {"node-1": 0.8},
            "claimTypes": {"node-1": ["empirical"]},
        },
        root_node_id="node-1",
        evidence_presence="none",
        gate_enabled=True,
    )

    assert result["verdictBand"] == "supported"
    assert result["verdictState"] == "endorsed_with_caveat"
    assert result["suppressionReason"] is None
    assert [caveat["code"] for caveat in result["caveats"]] == ["claim_type_unknown"]


def test_malformed_claim_type_source_is_not_echoed_into_suppression_reason() -> None:
    result = verdict_summary(
        {
            "dialecticalStrengths": {"node-1": 0.8},
            "claimTypes": {"node-1": "empirical"},
            "claimTypeSource": {"node-1": ["root_claim_text"]},
        },
        root_node_id="node-1",
        evidence_presence="none",
        gate_enabled=True,
    )

    assert result["verdictState"] == "suppressed_no_evidence"
    assert result["suppressionReason"]["claimTypeSource"] is None
