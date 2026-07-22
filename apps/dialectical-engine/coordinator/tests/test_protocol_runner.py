from __future__ import annotations

from unittest.mock import patch

import pytest
from sqlalchemy import select

from app.models.entities import AnalyzerRun, JudgeOutputArtifact, Node, next_analyzer_run_seq
from app.protocol.runner import run_protocol_analysis
from app.protocol.state import protocol_state_of
from app.qbaf.dfquad import CyclicGraphError
from app.scoring import NodeScoringPayload, reduce_assessments
from app.scoring.normalizer import normalize_claim
from app.scoring.service import SCORING_ANALYZER_TYPE, JUDGE_OUTPUT_SOURCE
from app.services import dialectical_v2 as service

from app.evidence.verification_evaluator import EVIDENCE_VERIFICATION_ANALYZER_TYPE

from test_dialectical_v2 import complete_worker_v2_pipeline, real_codex_worker
from test_node_scoring import base_assessment


def _scoring_payload_for_node(node_id: str, raw_text: str, *, strength_override: float | None = None) -> dict:
    """Build a REAL NodeScoringPayload via the actual normalizer + reducer.

    Not hand-rolled fake JSON: this runs the same deterministic code path
    (`normalize_claim` + `reduce_assessments`) that production scoring uses,
    just fed a real ClaimAssessment fixture instead of a live judge call.
    """
    claim = normalize_claim(node_id=node_id, raw_text=raw_text)
    assessment = base_assessment()
    payload = reduce_assessments(claim, assessment)
    if strength_override is not None:
        payload = payload.model_copy(
            update={"scores": payload.scores.model_copy(update={"strength": strength_override})}
        )
    return payload.model_dump(mode="json")


def _seed_scored_pro_con_nodes(db, debate) -> dict[str, float]:
    """Add a real PRO + CON child under the debate's ROOT_CLAIM, each with a
    real persisted node_scoring AnalyzerRun (built via the real reducer), so
    debate_argument_graph has a non-trivial acyclic graph to compute over.

    Returns the {node_id: strength} map used, for delta assertions in Task 2.
    """
    root_id = debate.root_node_id
    pro = Node(
        debate_id=debate.id,
        parent_id=root_id,
        node_type="PRO",
        depth=1,
        position=10,
        claim="Downtown car bans reduce congestion and improve air quality.",
        status="complete",
        materialized_path="/0/10",
    )
    con = Node(
        debate_id=debate.id,
        parent_id=root_id,
        node_type="CON",
        depth=1,
        position=11,
        claim="Downtown car bans burden delivery and limited-mobility access.",
        status="complete",
        materialized_path="/0/11",
    )
    db.add_all([pro, con])
    db.flush()

    strengths = {pro.id: 0.7, con.id: 0.6}
    items = [
        _scoring_payload_for_node(pro.id, pro.claim, strength_override=strengths[pro.id]),
        _scoring_payload_for_node(con.id, con.claim, strength_override=strengths[con.id]),
    ]
    branch = service.first_branch(db, debate.id)
    db.add(
        AnalyzerRun(
            debate_id=debate.id,
            branch_id=branch.id,
            analyzer_type=SCORING_ANALYZER_TYPE,
            output={"status": "available", "items": items},
            status="complete",
            provenance={"scoring_source": JUDGE_OUTPUT_SOURCE},
        )
    )
    db.commit()
    return strengths


def _latest_protocol_analysis_run(db, debate_id: str) -> AnalyzerRun:
    return db.scalars(
        select(AnalyzerRun)
        .where(AnalyzerRun.debate_id == debate_id, AnalyzerRun.analyzer_type == "protocol_analysis")
        .order_by(AnalyzerRun.created_at.desc(), AnalyzerRun.id.desc())
    ).first()


def _other_protocol_analysis_run(db, debate_id: str, *, excluding_id: str) -> AnalyzerRun:
    """Deterministically select the second protocol_analysis run for a debate
    that has exactly two such runs, WITHOUT relying on (created_at, id)
    ordering.

    AnalyzerRun.created_at is wall-clock (coarse on Windows) and id is a
    random UUID4, so when two runs for the same debate land in the same
    timestamp tick, `_latest_protocol_analysis_run`'s tie-break on id can pick
    either row nondeterministically. That is only a hazard for tests that
    create 2+ protocol_analysis runs and then need to distinguish "first" vs
    "second" -- this helper sidesteps it by excluding the already-known first
    run's id instead of sorting.
    """
    runs = db.scalars(
        select(AnalyzerRun).where(
            AnalyzerRun.debate_id == debate_id,
            AnalyzerRun.analyzer_type == "protocol_analysis",
            AnalyzerRun.id != excluding_id,
        )
    ).all()
    assert len(runs) == 1, f"expected exactly 1 other protocol_analysis run, found {len(runs)}"
    return runs[0]


def _latest_node_scoring_items(db, debate_id: str) -> list[dict]:
    run = db.scalars(
        select(AnalyzerRun)
        .where(AnalyzerRun.debate_id == debate_id, AnalyzerRun.analyzer_type == SCORING_ANALYZER_TYPE)
        .order_by(AnalyzerRun.created_at.desc(), AnalyzerRun.id.desc())
    ).first()
    return list((run.output or {}).get("items") or []) if run else []


def _bump_one_node_strength(db, debate, *, delta: float) -> None:
    """Persist a NEW node_scoring AnalyzerRun (real reducer output, real DB
    row -- not a mutated fake) where the CON node's judge strength is bumped
    by `delta` relative to the latest node_scoring run. debate_scoring_payload
    always reads the latest node_scoring AnalyzerRun, so adding a new one is
    the real way to change "current" scoring for a subsequent protocol run.
    """
    items = _latest_node_scoring_items(db, debate.id)
    # Identify the CON node by node_type via the Node table (scoring items
    # don't carry node_type themselves).
    con_node = db.scalars(
        select(Node).where(Node.debate_id == debate.id, Node.node_type == "CON")
    ).first()
    new_items = []
    for item in items:
        if item.get("node_id") == con_node.id:
            bumped_strength = item["scores"]["strength"] + delta
            item = {**item, "scores": {**item["scores"], "strength": bumped_strength}}
        new_items.append(item)
    branch = service.first_branch(db, debate.id)
    db.add(
        AnalyzerRun(
            debate_id=debate.id,
            branch_id=branch.id,
            analyzer_type=SCORING_ANALYZER_TYPE,
            output={"status": "available", "items": new_items},
            status="complete",
            provenance={"scoring_source": JUDGE_OUTPUT_SOURCE},
        )
    )
    db.commit()


def _add_new_scored_node(db, debate) -> str:
    """Add a REAL new PRO child node (via the Node ORM, not fake JSON) plus a
    REAL new node_scoring AnalyzerRun (via the actual reducer) that includes
    it, so a subsequent protocol run sees genuine topology drift.
    """
    root_id = debate.root_node_id
    extra = Node(
        debate_id=debate.id,
        parent_id=root_id,
        node_type="PRO",
        depth=1,
        position=20,
        claim="Downtown car bans also free up space for public transit lanes.",
        status="complete",
        materialized_path="/0/20",
    )
    db.add(extra)
    db.flush()

    items = _latest_node_scoring_items(db, debate.id)
    new_item = _scoring_payload_for_node(extra.id, extra.claim, strength_override=0.55)
    items = [*items, new_item]

    branch = service.first_branch(db, debate.id)
    db.add(
        AnalyzerRun(
            debate_id=debate.id,
            branch_id=branch.id,
            analyzer_type=SCORING_ANALYZER_TYPE,
            output={"status": "available", "items": items},
            status="complete",
            provenance={"scoring_source": JUDGE_OUTPUT_SOURCE},
        )
    )
    db.commit()
    return extra.id


def _seed_claim_node_with_scoring(db, debate, *, raw_text: str, position: int) -> Node:
    """Add a REAL claim child Node (via the ORM) plus a REAL node_scoring
    AnalyzerRun entry (via the actual normalizer + reducer) for it, so
    `_run_protocol_analysis`'s `nodes_with_claims` sees this node with a
    claim_type derived honestly from `raw_text` (not hand-set).
    """
    root_id = debate.root_node_id
    node = Node(
        debate_id=debate.id,
        parent_id=root_id,
        node_type="PRO",
        depth=1,
        position=position,
        claim=raw_text,
        status="complete",
        materialized_path=f"/0/{position}",
    )
    db.add(node)
    db.flush()

    items = _latest_node_scoring_items(db, debate.id)
    new_item = _scoring_payload_for_node(node.id, raw_text)
    items = [*items, new_item]

    branch = service.first_branch(db, debate.id)
    db.add(
        AnalyzerRun(
            debate_id=debate.id,
            branch_id=branch.id,
            analyzer_type=SCORING_ANALYZER_TYPE,
            output={"status": "available", "items": items},
            status="complete",
            provenance={"scoring_source": JUDGE_OUTPUT_SOURCE},
        )
    )
    db.commit()
    return node


def _persist_evidence_verification_run(db, debate, *, claim_node_id: str, evidence_node_id: str, status: str) -> None:
    """Persist a REAL AnalyzerRun(analyzer_type="evidence_verification") row
    shaped exactly like app.evidence.verification_evaluator.evaluate_evidence_verdict
    writes it (evidenceNodeId/claimNodeId/status/reason/evaluatorVersion),
    so the runner's real-verdict lookup reads authentic data, not a fake
    stand-in shape.
    """
    branch = service.first_branch(db, debate.id)
    db.add(
        AnalyzerRun(
            debate_id=debate.id,
            branch_id=branch.id,
            analyzer_type=EVIDENCE_VERIFICATION_ANALYZER_TYPE,
            output={
                "evidenceNodeId": evidence_node_id,
                "claimNodeId": claim_node_id,
                "status": status,
                "reason": None,
                "evaluatorVersion": "evidence-verification-v1",
            },
            status="complete",
            provenance={"judge_role": "verifier"},
        )
    )
    db.commit()


def _persist_protocol_analysis_fixture(db, debate, *, output: dict) -> AnalyzerRun:
    """Persist a prior protocol row with deterministic sequence ordering."""
    run = AnalyzerRun(
        debate_id=debate.id,
        branch_id=service.first_branch(db, debate.id).id,
        analyzer_type="protocol_analysis",
        output=output,
        status="complete",
        provenance={"scoring_source": "protocol_analysis_test_fixture"},
    )
    next_analyzer_run_seq(db, run)
    db.commit()
    return run


def test_verification_statuses_uses_real_verdict_when_available(db) -> None:
    real_codex_worker(db)
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    claim_node = _seed_claim_node_with_scoring(
        db, debate, raw_text="A recent study found that congestion pricing reduces downtown traffic.", position=30
    )
    _persist_evidence_verification_run(
        db, debate, claim_node_id=claim_node.id, evidence_node_id="evidence-node-fixture-1", status="supported"
    )

    run_protocol_analysis(db, debate)

    latest = _latest_protocol_analysis_run(db, debate.id)
    assert latest.output["verificationStatuses"][claim_node.id] == "supported"
    assert latest.output["verificationSource"][claim_node.id] == "real_verdict"


def test_verification_statuses_falls_back_to_kind_classifier_when_no_verdict_exists(db) -> None:
    real_codex_worker(db)
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    claim_node = _seed_claim_node_with_scoring(
        db, debate, raw_text="A recent study found that congestion pricing reduces downtown traffic.", position=30
    )

    run_protocol_analysis(db, debate)

    latest = _latest_protocol_analysis_run(db, debate.id)
    assert latest.output["verificationStatuses"][claim_node.id] == "pending_verification"
    assert latest.output["verificationSource"][claim_node.id] == "kind_classifier"


def test_verification_statuses_never_overrides_normative_claims(db) -> None:
    real_codex_worker(db)
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    claim_node = _seed_claim_node_with_scoring(
        db, debate, raw_text="Cities should ban cars downtown to protect pedestrians.", position=30
    )
    # Stray AnalyzerRun pointed at a normative claim node -- Task 2's caller
    # should never produce this, but the runner must defend against it anyway.
    _persist_evidence_verification_run(
        db, debate, claim_node_id=claim_node.id, evidence_node_id="evidence-node-fixture-2", status="supported"
    )

    run_protocol_analysis(db, debate)

    latest = _latest_protocol_analysis_run(db, debate.id)
    assert latest.output["verificationStatuses"][claim_node.id] == "unverifiable_by_kind"
    # Defense-in-depth: source stays "kind_classifier" even though a stray
    # real verdict exists -- the conflict is honestly never surfaced as a
    # real_verdict source, since it was never actually applied.
    assert latest.output["verificationSource"][claim_node.id] == "kind_classifier"


def test_corrupted_evidence_verification_row_falls_back_and_still_persists(db) -> None:
    # Phase 7 Task 3 review finding: a corrupted evidence_verification
    # AnalyzerRun (output is a JSON list, not a dict) must NEVER abort the
    # whole protocol run. Pre-fix, output.get("claimNodeId") raises
    # AttributeError inside the overlay, which propagates to the OUTER
    # best-effort wrapper -- no protocol_analysis row gets persisted at all.
    # Post-fix, the overlay's own try/except catches this, logs, and leaves
    # verification_map/verificationSource at the pure P5b kind-classifier
    # fallback while the run still persists.
    real_codex_worker(db)
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    claim_node = _seed_claim_node_with_scoring(
        db, debate, raw_text="A recent study found that congestion pricing reduces downtown traffic.", position=30
    )
    branch = service.first_branch(db, debate.id)
    db.add(
        AnalyzerRun(
            debate_id=debate.id,
            branch_id=branch.id,
            analyzer_type=EVIDENCE_VERIFICATION_ANALYZER_TYPE,
            # Corrupted shape: output is a JSON list, not a dict -- calling
            # .get("claimNodeId") on this raises AttributeError.
            output=["not", "a", "dict"],
            status="complete",
            provenance={"judge_role": "verifier"},
        )
    )
    db.commit()

    # RED-first proof (see report): pre-fix, this call raised inside
    # _run_protocol_analysis's overlay block and the outer try/except in
    # run_protocol_analysis swallowed it -- but with NO protocol_analysis
    # AnalyzerRun persisted at all, unlike the legitimate best-effort cases
    # elsewhere in this file which persist zero rows by early-exit BEFORE any
    # partial work. This call must not raise either way (run_protocol_analysis
    # is always best-effort at its outer boundary).
    run_protocol_analysis(db, debate)

    runs = db.scalars(
        select(AnalyzerRun).where(
            AnalyzerRun.debate_id == debate.id,
            AnalyzerRun.analyzer_type == "protocol_analysis",
        )
    ).all()
    assert len(runs) == 1  # run still persisted despite the corrupted row
    run = runs[0]
    # Pure P5b kind-classifier fallback -- byte-identical to what
    # test_verification_statuses_falls_back_to_kind_classifier_when_no_verdict_exists
    # asserts for the same claim text with no verdict rows at all, proving
    # the corrupted row was ignored rather than partially applied.
    assert run.output["verificationStatuses"][claim_node.id] == "pending_verification"
    assert run.output["verificationSource"][claim_node.id] == "kind_classifier"
    assert "crossExam" in run.output  # rest of the run stayed intact


def test_run_protocol_analysis_persists_one_protocol_analysis_run(db) -> None:
    real_codex_worker(db)
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    run_protocol_analysis(db, debate)
    runs = db.scalars(
        select(AnalyzerRun).where(
            AnalyzerRun.debate_id == debate.id,
            AnalyzerRun.analyzer_type == "protocol_analysis",
        )
    ).all()
    assert len(runs) == 1
    run = runs[0]
    assert run.status == "complete"
    assert "crossExam" in run.output
    assert "verificationStatuses" in run.output
    assert run.output["crossExamVersion"] == "cross-exam-v1"
    assert run.output["verificationVersion"] == "verification-v1"
    assert run.provenance["scoring_source"] == "protocol_analysis"


def test_protocol_analysis_output_stamps_semantics_version(db) -> None:
    real_codex_worker(db)
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})

    run_protocol_analysis(db, debate)

    run = _latest_protocol_analysis_run(db, debate.id)
    assert run.output["semanticsVersion"] == "df-quad-v1"
    assert run.output["qbafSemantics"] == "df-quad-v1"


def test_protocol_analysis_persists_root_claim_type_on_normal_v2_completion(db) -> None:
    worker = real_codex_worker(db)
    debate = service.create_dialectical_debate(
        db,
        "Measured global surface temperature data show a warming of 1.1 degrees Celsius since 1900.",
        {},
    )

    complete_worker_v2_pipeline(db, debate, worker)

    run = _latest_protocol_analysis_run(db, debate.id)
    assert run.output["claimTypes"][debate.root_node_id] == "empirical"
    assert run.output["claimTypeSource"][debate.root_node_id] == "root_claim_text"


def test_normal_completion_unmatched_topic_persists_honest_unknown_type(db) -> None:
    worker = real_codex_worker(db)
    debate = service.create_dialectical_debate(db, "Cities and their downtowns.", {})

    complete_worker_v2_pipeline(db, debate, worker)

    run = _latest_protocol_analysis_run(db, debate.id)
    assert run.output["claimTypes"][debate.root_node_id] == "unknown"
    assert run.output["claimTypeSource"][debate.root_node_id] == "root_claim_text"


def test_protocol_analysis_output_persists_claim_type_maps(db) -> None:
    real_codex_worker(db)
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    _seed_scored_pro_con_nodes(db, debate)
    scoring_items = _latest_node_scoring_items(db, debate.id)

    run_protocol_analysis(db, debate)

    run = _latest_protocol_analysis_run(db, debate.id)
    claim_types = run.output["claimTypes"]
    claim_type_source = run.output["claimTypeSource"]
    scored_ids = {item["node_id"] for item in scoring_items}
    assert set(claim_types) == scored_ids | {debate.root_node_id}
    assert set(run.output["verificationStatuses"]) == scored_ids
    for item in scoring_items:
        node_id = item["node_id"]
        assert claim_types[node_id] == item["claim"]["claim_type"]
        assert claim_type_source[node_id] == "scoring_item"
    assert claim_type_source[debate.root_node_id] == "root_claim_text"


def test_root_claim_type_classification_failure_is_graceful(db) -> None:
    real_codex_worker(db)
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})

    with patch("app.protocol.runner.classify_claim_type", side_effect=RuntimeError("classifier unavailable")):
        run_protocol_analysis(db, debate)

    run = _latest_protocol_analysis_run(db, debate.id)
    assert run is not None
    assert debate.root_node_id not in run.output["claimTypes"]
    assert debate.root_node_id not in run.output["claimTypeSource"]


def test_protocol_analysis_logs_semantics_version(db, capsys) -> None:
    real_codex_worker(db)
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})

    run_protocol_analysis(db, debate)

    assert f"qbaf.semantics version=df-quad-v1 debate={debate.id}" in capsys.readouterr().out


def test_protocol_analysis_run_does_not_trip_judge_artifact_listener(db) -> None:
    # The after_insert listener only acts on analyzer_type == "node_scoring";
    # this is a direct regression guard, not just code inspection.
    real_codex_worker(db)
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    run_protocol_analysis(db, debate)
    linked = db.scalars(
        select(JudgeOutputArtifact).where(JudgeOutputArtifact.debate_id == debate.id)
    ).all()
    assert linked == []  # nothing spuriously linked by this phase's analyzer run


def test_run_protocol_analysis_advances_markers_to_complete(db) -> None:
    real_codex_worker(db)
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    run_protocol_analysis(db, debate)
    db.refresh(debate)
    state = protocol_state_of(debate.config)
    assert state["phases"]["5.4_cross_exam"] == "complete"
    assert state["phases"]["5.5_verification"] == "complete"
    # 5.6/5.7 are now registered/implemented (Phase 5c Task 1/2) and the
    # runner advances both to "complete" once the run finishes. FLAGGED:
    # 5.7_convergence's expected value re-pinned from "not_implemented" to
    # "complete" now that Task 2 registers it and the runner evaluates it.
    assert state["phases"]["5.6_qbaf_scoring"] == "complete"
    assert state["phases"]["5.7_convergence"] == "complete"


def test_run_protocol_analysis_is_best_effort_and_never_raises(db) -> None:
    real_codex_worker(db)
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    with patch("app.protocol.runner.cross_examine", side_effect=RuntimeError("boom")):
        run_protocol_analysis(db, debate)  # must not raise
    # no protocol_analysis AnalyzerRun on failure
    runs = db.scalars(
        select(AnalyzerRun).where(
            AnalyzerRun.debate_id == debate.id,
            AnalyzerRun.analyzer_type == "protocol_analysis",
        )
    ).all()
    assert runs == []


def test_synthesis_triggers_protocol_analysis(db) -> None:
    worker = real_codex_worker(db)
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    complete_worker_v2_pipeline(db, debate, worker)
    db.refresh(debate)
    state = protocol_state_of(debate.config)
    assert state["phases"]["5.4_cross_exam"] == "complete"
    assert state["phases"]["5.5_verification"] == "complete"
    runs = db.scalars(
        select(AnalyzerRun).where(
            AnalyzerRun.debate_id == debate.id,
            AnalyzerRun.analyzer_type == "protocol_analysis",
        )
    ).all()
    assert len(runs) == 1


def test_marker_and_analysis_failure_never_fails_synthesis(db) -> None:
    worker = real_codex_worker(db)
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    with patch("app.services.dialectical_v2.run_protocol_analysis", side_effect=RuntimeError("boom")):
        complete_worker_v2_pipeline(db, debate, worker)
    db.refresh(debate)
    assert debate.status == "complete"  # synthesis itself must still succeed


def test_run_protocol_analysis_computes_dialectical_strengths_for_scored_debate(db) -> None:
    # Build a debate with a ROOT_CLAIM + one PRO + one CON child, each scored,
    # so debate_argument_graph produces a non-trivial acyclic graph.
    real_codex_worker(db)
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    _seed_scored_pro_con_nodes(db, debate)
    run_protocol_analysis(db, debate)
    run = _latest_protocol_analysis_run(db, debate.id)
    assert "dialecticalStrengths" in run.output
    assert set(run.output["dialecticalStrengths"].keys())  # non-empty
    assert run.output["qbafSemantics"] == "df-quad-v1"
    assert run.output["compositionNote"] == (
        "v1: tau=judgeStrength|default; verificationModifier=none(P7); modelWeight=constant-1.0(P8)"
    )
    assert "graphFingerprint" in run.output
    assert "tauSources" in run.output
    assert "qbafUnavailableReason" not in run.output


def test_protocol_analysis_records_tau_coverage_fraction_of_argument_nodes(db) -> None:
    # W2: tauCoverage is the 0..1 fraction of ARGUMENT nodes (every non-
    # EVIDENCE node) whose tau came from a persisted judge strength. The
    # fixed-quartet debate has root + 4 POV containers; seeding scored PRO +
    # CON children makes 7 argument nodes with exactly 2 judged.
    real_codex_worker(db)
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    _seed_scored_pro_con_nodes(db, debate)

    run_protocol_analysis(db, debate)

    run = _latest_protocol_analysis_run(db, debate.id)
    assert run.output["tauCoverage"] == pytest.approx(2 / 7)
    pro = db.scalars(select(Node).where(Node.debate_id == debate.id, Node.node_type == "PRO")).one()
    con = db.scalars(select(Node).where(Node.debate_id == debate.id, Node.node_type == "CON")).one()
    assert run.output["tauSources"][pro.id] == "judge_strength"
    assert run.output["tauSources"][con.id] == "judge_strength"
    assert run.output["tauSources"][debate.root_node_id] == "default"


def test_protocol_analysis_tau_coverage_zero_for_unscored_debate(db) -> None:
    real_codex_worker(db)
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})

    run_protocol_analysis(db, debate)

    run = _latest_protocol_analysis_run(db, debate.id)
    assert run.output["tauCoverage"] == 0.0
    assert all(source == "default" for source in run.output["tauSources"].values())


def test_evidence_nodes_do_not_dilute_tau_coverage(db) -> None:
    # EVIDENCE nodes are _NO_EDGE extracted substrings whose taus never
    # compose into the root strength -- they must not appear in the coverage
    # denominator.
    real_codex_worker(db)
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    _seed_scored_pro_con_nodes(db, debate)
    pro = db.scalars(select(Node).where(Node.debate_id == debate.id, Node.node_type == "PRO")).one()
    evidence = Node(
        debate_id=debate.id,
        parent_id=pro.id,
        node_type="EVIDENCE",
        depth=2,
        position=0,
        claim="a transport study reported fewer collisions",
        status="complete",
        materialized_path="/0/10/0",
    )
    db.add(evidence)
    db.commit()

    run_protocol_analysis(db, debate)

    run = _latest_protocol_analysis_run(db, debate.id)
    assert run.output["tauCoverage"] == pytest.approx(2 / 7)
    # The evidence node still gets an honest per-node tau source entry.
    assert run.output["tauSources"][evidence.id] == "default"


def test_tau_coverage_excludes_only_failed_placeholders_and_counts_abandoned_complete_nodes(db) -> None:
    # T2 (P0.5), narrowed per controller decision after Task 2 self-review
    # (see task-2-report.md "Concerns"): only status=="failed" placeholder
    # nodes are excluded from the tauCoverage denominator. An abandoned-but-
    # status=="complete" node (exploration/policy.py set its path aside,
    # but it is a real, already-generated argument -- app.scoring.service.
    # _debate_node_ids keeps scoring it precisely so its own reopen
    # decision stays reachable) must stay IN the denominator: it needs to
    # be judged and counted like any other live node, not silently treated
    # as dead.
    real_codex_worker(db)
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    povs = db.scalars(
        select(Node).where(Node.debate_id == debate.id, Node.node_type != "ROOT_CLAIM")
    ).all()
    assert len(povs) == 4  # fixed quartet -- conftest disables dynamic perspectives
    abandoned_but_complete, *dead_povs = povs
    assert len(dead_povs) == 3
    for pov in dead_povs:
        # Mirrors terminalize_job_failure's node-degradable branch exactly
        # (orchestrator.py ~1592-1596).
        pov.status = "failed"
        pov.stopping_status = "stop"
        pov.stopping_reason = "generation_exhausted"
        pov.path_status = "abandoned"
    # Mirrors the exploration-policy lifecycle's "abandon" decision on an
    # otherwise-successfully-generated node (scoring_completion_lifecycle.py):
    # status stays "complete", only path_status moves to "abandoned".
    abandoned_but_complete.status = "complete"
    abandoned_but_complete.path_status = "abandoned"
    db.commit()

    root_id = debate.root_node_id
    root = db.get(Node, root_id)
    branch = service.first_branch(db, debate.id)

    # Stage 1: only root is judged so far. If abandoned_but_complete were
    # (incorrectly) excluded from the denominator like the dead povs,
    # tauCoverage would misreport 1.0 here; it must instead reflect the one
    # live-but-still-unjudged node.
    db.add(
        AnalyzerRun(
            debate_id=debate.id,
            branch_id=branch.id,
            analyzer_type=SCORING_ANALYZER_TYPE,
            output={"status": "available", "items": [_scoring_payload_for_node(root_id, root.claim)]},
            status="complete",
            provenance={"scoring_source": JUDGE_OUTPUT_SOURCE},
        )
    )
    db.commit()

    run_protocol_analysis(db, debate)
    first_run = _latest_protocol_analysis_run(db, debate.id)
    assert first_run.output["tauCoverage"] == pytest.approx(0.5)  # 1 judged / 2 live nodes
    assert first_run.output["tauSources"][root_id] == "judge_strength"
    assert first_run.output["tauSources"][abandoned_but_complete.id] == "default"
    for pov in dead_povs:
        assert first_run.output["tauSources"][pov.id] == "default"

    # Stage 2: ordinary rescoring reaches the abandoned-but-complete node
    # too (exactly the mechanism that keeps its "reopen" decision alive) --
    # coverage now reaches 1.0.
    items = [
        _scoring_payload_for_node(root_id, root.claim),
        _scoring_payload_for_node(abandoned_but_complete.id, abandoned_but_complete.claim),
    ]
    db.add(
        AnalyzerRun(
            debate_id=debate.id,
            branch_id=branch.id,
            analyzer_type=SCORING_ANALYZER_TYPE,
            output={"status": "available", "items": items},
            status="complete",
            provenance={"scoring_source": JUDGE_OUTPUT_SOURCE},
        )
    )
    db.commit()

    run_protocol_analysis(db, debate)
    second_run = _other_protocol_analysis_run(db, debate.id, excluding_id=first_run.id)
    assert second_run.output["tauCoverage"] == 1.0
    assert second_run.output["tauSources"][root_id] == "judge_strength"
    assert second_run.output["tauSources"][abandoned_but_complete.id] == "judge_strength"
    # Dead nodes still get an honest per-node tau-source entry (default) --
    # they are excluded from the coverage *scope*, not silently disappeared.
    for pov in dead_povs:
        assert second_run.output["tauSources"][pov.id] == "default"


def test_run_protocol_analysis_records_qbaf_unavailable_reason_on_cycle(db) -> None:
    real_codex_worker(db)
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    with patch("app.protocol.runner.debate_argument_graph", side_effect=CyclicGraphError("cycle detected")):
        run_protocol_analysis(db, debate)
    run = _latest_protocol_analysis_run(db, debate.id)
    assert "qbafUnavailableReason" in run.output
    assert "dialecticalStrengths" not in run.output
    # cross-exam/verification must still be present -- failure is isolated
    assert "crossExam" in run.output
    assert "verificationStatuses" in run.output


def test_qbaf_phase_advances_to_complete_on_success_and_on_honest_failure(db) -> None:
    worker = real_codex_worker(db)
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    run_protocol_analysis(db, debate)
    db.refresh(debate)
    state = protocol_state_of(debate.config)
    assert state["phases"]["5.6_qbaf_scoring"] == "complete"

    debate2 = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    with patch("app.protocol.runner.debate_argument_graph", side_effect=CyclicGraphError("cycle")):
        run_protocol_analysis(db, debate2)
    db.refresh(debate2)
    state2 = protocol_state_of(debate2.config)
    assert state2["phases"]["5.6_qbaf_scoring"] == "complete"  # honest-unavailable still completes the evaluation


def test_no_raw_judge_output_in_qbaf_section(db) -> None:
    real_codex_worker(db)
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    run_protocol_analysis(db, debate)
    run = _latest_protocol_analysis_run(db, debate.id)
    dumped = str(run.output)
    assert "ClaimAssessment" not in dumped  # no raw judge object leakage


def test_first_evaluation_has_null_convergence_with_reason(db) -> None:
    real_codex_worker(db)
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    run_protocol_analysis(db, debate)
    run = _latest_protocol_analysis_run(db, debate.id)
    # NOTE: the brief's Step 1 worked example asserted strict equality with
    # NO "epsilon" key here, but the brief's own Interfaces section (and the
    # separately-given test_invalid_convergence_epsilon_falls_back_to_default,
    # which is ALSO a first_evaluation case with no seeded prior run) both
    # require "epsilon" to always be present in the convergence dict. Those
    # two worked examples are mutually contradictory as written; resolved in
    # favor of the explicit "always including epsilon" rule so every
    # first_evaluation output still reports which epsilon would have applied.
    assert run.output["convergence"] == {
        "converged": None,
        "reason": "first_evaluation",
        "epsilon": 0.05,
    }
    assert run.output["convergenceVersion"] == "epsilon-stability-v1"


def test_second_evaluation_computes_max_delta_against_previous_run(db) -> None:
    real_codex_worker(db)
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    _seed_scored_pro_con_nodes(db, debate)
    run_protocol_analysis(db, debate)
    first_run = _latest_protocol_analysis_run(db, debate.id)
    # Hand-computed fixture: root_claim + 4 POV children (tau=0.5 default,
    # each a leaf support edge into root) + PRO (tau=0.7) + CON (tau=0.6),
    # each PRO/POV/CON node is itself a topological leaf with no incoming
    # attackers/supporters, so each node's own DF-QuAD strength equals its
    # own tau exactly. Bumping CON's judge strength by +0.2 (0.6 -> 0.8)
    # therefore shifts ONLY con's own strength by exactly 0.2 (root's
    # strength also shifts, but by a smaller amount via the mediating
    # function -- verified by hand: root goes 0.690625 -> 0.590625, a delta
    # of 0.1, strictly less than con's own 0.2 delta). maxDelta over the
    # intersection is therefore exactly 0.2.
    _bump_one_node_strength(db, debate, delta=0.2)
    run_protocol_analysis(db, debate)
    second_run = _other_protocol_analysis_run(db, debate.id, excluding_id=first_run.id)
    convergence = second_run.output["convergence"]
    assert convergence["comparedAnalyzerRunId"] == first_run.id
    assert convergence["nodesCompared"] == len(first_run.output["dialecticalStrengths"])
    assert convergence["maxDelta"] == pytest.approx(0.2, abs=1e-6)
    assert convergence["converged"] is (convergence["maxDelta"] <= 0.05)


def test_convergence_none_when_semantics_version_changes(db) -> None:
    real_codex_worker(db)
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    _seed_scored_pro_con_nodes(db, debate)
    run_protocol_analysis(db, debate)
    baseline = db.scalars(
        select(AnalyzerRun)
        .where(AnalyzerRun.debate_id == debate.id, AnalyzerRun.analyzer_type == "protocol_analysis")
        .order_by(AnalyzerRun.seq.desc())
    ).first()
    prior = _persist_protocol_analysis_fixture(
        db,
        debate,
        output={
            "dialecticalStrengths": dict(baseline.output["dialecticalStrengths"]),
            "semanticsVersion": "df-quad-weighted-v1",
        },
    )

    run_protocol_analysis(db, debate)

    current = db.scalars(
        select(AnalyzerRun)
        .where(AnalyzerRun.debate_id == debate.id, AnalyzerRun.analyzer_type == "protocol_analysis")
        .order_by(AnalyzerRun.seq.desc())
    ).first()
    assert current.id != prior.id
    assert current.output["convergence"]["converged"] is None
    assert current.output["convergence"]["reason"] == "semantics_changed"
    assert current.output["convergence"]["epsilon"] == 0.05


def test_convergence_pins_missing_previous_semantics_stamp_to_v1(db) -> None:
    real_codex_worker(db)
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    _seed_scored_pro_con_nodes(db, debate)
    run_protocol_analysis(db, debate)
    baseline = db.scalars(
        select(AnalyzerRun)
        .where(AnalyzerRun.debate_id == debate.id, AnalyzerRun.analyzer_type == "protocol_analysis")
        .order_by(AnalyzerRun.seq.desc())
    ).first()
    _persist_protocol_analysis_fixture(
        db,
        debate,
        output={"dialecticalStrengths": dict(baseline.output["dialecticalStrengths"])},
    )

    run_protocol_analysis(db, debate)

    current = db.scalars(
        select(AnalyzerRun)
        .where(AnalyzerRun.debate_id == debate.id, AnalyzerRun.analyzer_type == "protocol_analysis")
        .order_by(AnalyzerRun.seq.desc())
    ).first()
    assert current.output["convergence"]["converged"] is True
    assert "reason" not in current.output["convergence"]


def test_convergence_epsilon_is_config_overridable(db) -> None:
    real_codex_worker(db)
    debate = service.create_dialectical_debate(
        db, "Should cities ban cars downtown?", {"protocol": {"convergence_epsilon": 0.5}}
    )
    _seed_scored_pro_con_nodes(db, debate)
    run_protocol_analysis(db, debate)
    _bump_one_node_strength(db, debate, delta=0.2)
    run_protocol_analysis(db, debate)
    run = _latest_protocol_analysis_run(db, debate.id)
    assert run.output["convergence"]["epsilon"] == 0.5


def test_invalid_convergence_epsilon_falls_back_to_default(db) -> None:
    real_codex_worker(db)
    debate = service.create_dialectical_debate(
        db, "Should cities ban cars downtown?", {"protocol": {"convergence_epsilon": 1.5}}
    )
    run_protocol_analysis(db, debate)
    run = _latest_protocol_analysis_run(db, debate.id)
    assert run.output["convergence"]["epsilon"] == 0.05


def test_topology_drift_reports_added_and_removed_node_counts(db) -> None:
    real_codex_worker(db)
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    _seed_scored_pro_con_nodes(db, debate)
    run_protocol_analysis(db, debate)
    first_run = _latest_protocol_analysis_run(db, debate.id)
    _add_new_scored_node(db, debate)
    run_protocol_analysis(db, debate)
    run = _other_protocol_analysis_run(db, debate.id, excluding_id=first_run.id)
    assert run.output["convergence"]["nodesAdded"] >= 1


def test_convergence_phase_advances_to_complete_regardless_of_converged_value(db) -> None:
    real_codex_worker(db)
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    run_protocol_analysis(db, debate)
    db.refresh(debate)
    state = protocol_state_of(debate.config)
    assert state["phases"]["5.7_convergence"] == "complete"


def test_qbaf_unavailable_yields_strengths_unavailable_convergence_reason(db) -> None:
    # If THIS run's own QBAF computation fails (qbafUnavailableReason), the
    # convergence evaluation cannot compare strengths that don't exist --
    # it must report a distinct, honest reason rather than silently reusing
    # "first_evaluation" or crashing.
    real_codex_worker(db)
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    with patch("app.protocol.runner.debate_argument_graph", side_effect=CyclicGraphError("cycle detected")):
        run_protocol_analysis(db, debate)
    run = _latest_protocol_analysis_run(db, debate.id)
    assert run.output["convergence"] == {
        "converged": None,
        "reason": "strengths_unavailable",
        "epsilon": 0.05,
    }
