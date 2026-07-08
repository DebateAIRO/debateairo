import json

from app.models.entities import Debate, Generation, Node, Worker
from app.scoring.calibration import CALIBRATION_VERSION, calibration_report, correlated_discount, judge_weight
from app.scoring.judges import ScoringProviderResult
from app.scoring.service import score_node_with_provider

from test_node_scoring import base_assessment


def test_judge_weight_cold_start_default_is_neutral() -> None:
    result = judge_weight("claude")
    assert result == {"weight": 1.0, "source": "cold_start", "family": "claude"}


def test_judge_weight_cold_start_handles_unknown_family() -> None:
    result = judge_weight(None)
    assert result == {"weight": 1.0, "source": "cold_start", "family": None}


def test_judge_weight_config_override() -> None:
    result = judge_weight("claude", config={"weights": {"claude": 0.9}})
    assert result == {"weight": 0.9, "source": "config_override", "family": "claude"}
    # Unrelated family in same config still falls back to cold start:
    assert judge_weight("gpt", config={"weights": {"claude": 0.9}}) == {
        "weight": 1.0,
        "source": "cold_start",
        "family": "gpt",
    }


def test_correlated_discount_single_judgment_not_applicable() -> None:
    result = correlated_discount([{"judge_role": "judge", "provider": "anthropic", "model": "claude-3", "family": "claude"}])
    assert result["applicable"] is False
    assert result["reason"] == "single_judgment"


def test_correlated_discount_worked_example_claude_claude_gpt() -> None:
    assessments = [
        {"judge_role": "judge", "provider": "anthropic", "model": "claude-3", "family": "claude"},
        {"judge_role": "verifier", "provider": "anthropic", "model": "claude-3", "family": "claude"},
        {"judge_role": "judge", "provider": "openai", "model": "gpt-4o", "family": "gpt"},
    ]
    result = correlated_discount(assessments, discount_factor=0.5)
    assert result["applicable"] is True
    weights = [item["weight"] for item in result["weights"]]
    assert weights == [1.0, 0.5, 1.0]
    assert result["effectiveWeightTotal"] == 2.5


def test_correlated_discount_flat_not_compounding_for_third_repeat() -> None:
    assessments = [
        {"judge_role": "a", "provider": "anthropic", "model": "claude-3", "family": "claude"},
        {"judge_role": "b", "provider": "anthropic", "model": "claude-3-opus", "family": "claude"},
        {"judge_role": "c", "provider": "anthropic", "model": "claude-3-haiku", "family": "claude"},
        {"judge_role": "d", "provider": "openai", "model": "gpt-4o", "family": "gpt"},
    ]
    result = correlated_discount(assessments, discount_factor=0.5)
    weights = [item["weight"] for item in result["weights"]]
    assert weights == [1.0, 0.5, 0.5, 1.0]
    assert result["effectiveWeightTotal"] == 3.0


def test_correlated_discount_no_shared_family_no_discount() -> None:
    assessments = [
        {"judge_role": "a", "provider": "anthropic", "model": "claude-3", "family": "claude"},
        {"judge_role": "b", "provider": "openai", "model": "gpt-4o", "family": "gpt"},
    ]
    result = correlated_discount(assessments, discount_factor=0.5)
    weights = [item["weight"] for item in result["weights"]]
    assert weights == [1.0, 1.0]
    assert all(item["discounted"] is False for item in result["weights"])


def test_correlated_discount_unknown_family_never_discounted() -> None:
    assessments = [
        {"judge_role": "a", "provider": "unknown", "model": None, "family": None},
        {"judge_role": "b", "provider": "unknown", "model": None, "family": None},
    ]
    result = correlated_discount(assessments, discount_factor=0.5)
    weights = [item["weight"] for item in result["weights"]]
    assert weights == [1.0, 1.0]


def test_calibration_version_constant() -> None:
    assert CALIBRATION_VERSION == "calibration-v1"


def _build_report_debate_and_node(db, *, node_id: str) -> tuple[Debate, Node]:
    debate = Debate(topic="Should cities ban single-use plastics?", status="complete")
    worker = Worker(id=f"worker-{node_id}", name="Worker", token_hash="hash", capabilities=["debate"])
    node = Node(
        id=node_id,
        debate=debate,
        node_type="root",
        depth=0,
        position=0,
        claim="Banning single-use plastics reduces landfill waste.",
        status="complete",
        materialized_path="/",
    )
    generation = Generation(
        id=f"generation-{node_id}",
        node=node,
        model_id="model-a",
        role="pro",
        argument="Reduced plastic production lowers landfill volume.",
        worker_id=worker.id,
    )
    node.active_generation_id = generation.id
    db.add_all([debate, worker, node, generation])
    db.flush()
    debate.root_node_id = node.id
    db.commit()
    return debate, node


class _ReportClaudeProvider:
    provider = "anthropic"
    model = "claude-3-sonnet"

    def judge_node(self, request):
        return ScoringProviderResult(
            provider=self.provider,
            model=self.model,
            raw_output=json.dumps(base_assessment(node_id=request.claim.node_id).model_dump(mode="json")),
            latency_ms=10,
            checked_at="2026-07-07T10:15:30+00:00",
        )


class _ReportClaudeVerifierProvider:
    provider = "anthropic"
    model = "claude-3-opus"

    def judge_node(self, request):
        return ScoringProviderResult(
            provider=self.provider,
            model=self.model,
            raw_output=json.dumps(base_assessment(node_id=request.claim.node_id).model_dump(mode="json")),
            latency_ms=11,
            checked_at="2026-07-07T10:16:30+00:00",
        )


class _ReportGptProvider:
    provider = "codex"
    model = "gpt-5.2-codex"

    def judge_node(self, request):
        return ScoringProviderResult(
            provider=self.provider,
            model=self.model,
            raw_output=json.dumps(base_assessment(node_id=request.claim.node_id).model_dump(mode="json")),
            latency_ms=12,
            checked_at="2026-07-07T10:17:30+00:00",
        )


def test_calibration_report_honest_stub_with_zero_judgments(db) -> None:
    report = calibration_report(db, family="claude")
    assert report == {
        "family": "claude",
        "brier": None,
        "ece": None,
        "reason": "no_ground_truth_outcomes",
        "judgmentsObserved": 0,
        "resolvedOutcomes": 0,
        "calibrationVersion": "calibration-v1",
    }


def test_calibration_report_counts_real_persisted_judgments(db) -> None:
    debate, node = _build_report_debate_and_node(db, node_id="report-node-1")

    score_node_with_provider(
        db, debate, node.id, _ReportClaudeProvider(), judge_role="primary_judge", force_refresh=True
    )
    score_node_with_provider(
        db, debate, node.id, _ReportClaudeVerifierProvider(), judge_role="verifier_judge", force_refresh=True
    )
    score_node_with_provider(
        db, debate, node.id, _ReportGptProvider(), judge_role="third_judge", force_refresh=True
    )

    report = calibration_report(db, family="claude")
    assert report["judgmentsObserved"] == 2
    assert report["brier"] is None
    assert report["ece"] is None
    assert report["resolvedOutcomes"] == 0

    report_all = calibration_report(db, family=None)
    assert report_all["judgmentsObserved"] == 3  # no family filter counts all available artifacts


def test_calibration_report_never_fabricates_a_score(db) -> None:
    report = calibration_report(db, family="nonexistent-family")
    assert report["brier"] is None and report["ece"] is None


class _ReportSecretModelProvider:
    provider = "anthropic"
    # Secret-like model string (matches SECRET_METADATA_MARKERS' "secret"/
    # "token" substrings) -- JudgeOutputArtifact.model is persisted raw/
    # unscrubbed by _persist_judge_output_artifact, so this seeds exactly the
    # condition the Phase 8 Task 3 fix-wave review flagged: lineage_family's
    # unknown-model fallback returns the raw lowercased model string AS the
    # family when the scrub is skipped.
    model = "sk-token-abc123-secret"

    def judge_node(self, request):
        return ScoringProviderResult(
            provider=self.provider,
            model=self.model,
            raw_output=json.dumps(base_assessment(node_id=request.claim.node_id).model_dump(mode="json")),
            latency_ms=13,
            checked_at="2026-07-07T10:18:30+00:00",
        )


def test_calibration_report_never_leaks_secret_like_model_string(db) -> None:
    debate, node = _build_report_debate_and_node(db, node_id="report-node-secret")

    score_node_with_provider(
        db, debate, node.id, _ReportSecretModelProvider(), judge_role="primary_judge", force_refresh=True
    )

    secret_substring = "sk-token-abc123-secret"

    # family=None: no family-scoping happens in this branch, so the artifact
    # is counted honestly (judgmentsObserved includes it) -- and the raw
    # secret model string must never appear anywhere in the serialized
    # report (family=None never derives/echoes a family from the artifact).
    report_unscoped = calibration_report(db, family=None)
    assert report_unscoped["judgmentsObserved"] == 1
    assert secret_substring not in json.dumps(report_unscoped)

    # For every *legitimate* family a caller might scope to, the report's
    # judgmentsObserved-matching step must never surface the raw secret
    # artifact model string verbatim: lineage_family's unknown-model
    # fallback would otherwise return the raw lowercased model string AS
    # the family and this artifact would incorrectly match (and, if ever
    # echoed anywhere), leak the secret. Scrubbed, the secret-like model
    # maps to family=None instead, so it never matches any concrete family
    # and never appears in any of these reports.
    for family in ("claude", "gpt"):
        report = calibration_report(db, family=family)
        assert secret_substring not in json.dumps(report)
    # Passing the raw secret as the `family` argument itself is a distinct,
    # caller-controlled echo (the requested `family` is always echoed back
    # verbatim) -- not a leak of the *artifact's* persisted model string.
    # It must never falsely match the artifact's scrubbed (family=None)
    # judgment, i.e. the fix must not accidentally make the raw secret
    # string comparable to the artifact's derived family.
    report_matching_raw_secret = calibration_report(db, family=secret_substring)
    assert report_matching_raw_secret["judgmentsObserved"] == 0
