"""Service-layer integration for Phase 5.4 (cross-exam) + 5.5 (verification).

Best-effort orchestration only: reads current Node rows + the latest
persisted scoring payload, runs the two pure analysis modules, and persists
ONE AnalyzerRun capturing both results. Never raises to its caller -- a
failure here must never fail debate creation, worker-job completion, or
synthesis. No new LLM calls. No new nodes. No raw judge output is stored in
the analyzer's output; only the already-summarized report shapes (the
cross-exam report's entries carry only claim ids, counter ids/strengths, and
already-public judge-disagreement dicts -- never a raw ClaimAssessment or
judge free-text).
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.write_lock import commit_write
from app.evidence.verification_evaluator import (
    latest_evidence_verdicts_for_debate,
    rollup_claim_verification_status,
)
from app.models.entities import AnalyzerRun, Debate, DebateBranch, Node, next_analyzer_run_seq
from app.protocol.cross_exam import cross_examine
from app.protocol.state import advance_phase, protocol_state_of
from app.protocol.verification import classify_verification, verification_statuses
from app.qbaf.dfquad import CyclicGraphError
from app.qbaf.debate_adapter import EVIDENCE_VERIFIER_TAU_SOURCE, debate_argument_graph
from app.qbaf.semantics_versions import DEFAULT_SEMANTICS, resolve_semantics
from app.scoring.normalizer import classify_claim_type
from app.scoring.service import debate_scoring_payload

PROTOCOL_ANALYSIS_TYPE = "protocol_analysis"
DEFAULT_CONVERGENCE_EPSILON = 0.05
CONVERGENCE_VERSION = "epsilon-stability-v1"


def _first_branch(db: Session, debate_id: str) -> DebateBranch:
    # Local, minimal lookup mirroring dialectical_v2.first_branch -- not
    # imported directly from app.services.dialectical_v2 to avoid a circular
    # import (that module imports run_protocol_analysis from this one).
    branch = db.scalar(
        select(DebateBranch).where(DebateBranch.debate_id == debate_id).order_by(DebateBranch.created_at.asc())
    )
    if not branch:
        raise ValueError("Debate branch not found")
    return branch


def run_protocol_analysis(db: Session, debate: Debate) -> None:
    try:
        _run_protocol_analysis(db, debate)
    except Exception as exc:
        # Best-effort: this is deterministic scaffolding analysis, not
        # load-bearing for the debate itself. Any bug here must never
        # propagate to the caller (debate creation / worker completion /
        # synthesis persistence).
        print(f"[protocol.runner] run_protocol_analysis failed (non-fatal): {exc!r}")


def _run_protocol_analysis(db: Session, debate: Debate) -> None:
    nodes = db.scalars(
        select(Node).where(Node.debate_id == debate.id, Node.status != "stale")
    ).all()
    node_dicts = [
        {"id": node.id, "parent_id": node.parent_id, "node_type": node.node_type}
        for node in nodes
    ]

    scoring_payload = debate_scoring_payload(db, debate)
    scoring_items = scoring_payload.get("items") or []

    cross_exam_report = cross_examine(node_dicts, scoring_items)

    nodes_with_claims = [
        {
            "id": item["node_id"],
            "claim_type": (item.get("claim") or {}).get("claim_type", "unknown"),
        }
        for item in scoring_items
        if item.get("node_id")
    ]
    claim_types = {node["id"]: node["claim_type"] for node in nodes_with_claims}
    claim_type_source = {node["id"]: "scoring_item" for node in nodes_with_claims}

    root_id = debate.root_node_id
    if root_id and root_id not in claim_types:
        root = next((node for node in nodes if node.id == root_id), None)
        root_text = (root.claim or "").strip() if root is not None else ""
        if root_text:
            try:
                root_claim_type, _markers = classify_claim_type(root_text)
            except Exception as exc:  # noqa: BLE001 - provenance is best-effort metadata
                print(
                    "[protocol.runner] root claim-type classification failed "
                    f"(non-fatal, omitting provenance): {exc!r}"
                )
            else:
                claim_types[root_id] = root_claim_type
                claim_type_source[root_id] = "root_claim_text"

    verification_map = verification_statuses(nodes_with_claims)

    # verificationSource: audit trail distinguishing a real-verdict rollup
    # from the P5b kind-classifier fallback, per node -- honest bookkeeping,
    # never influences the verificationStatuses value itself. Initialized to
    # all-"kind_classifier" BEFORE the overlay try/except below so that any
    # failure inside the overlay leaves both verification_map and
    # verification_source at the pure P5b fallback, never partially applied.
    verification_source: dict[str, str] = {node["id"]: "kind_classifier" for node in nodes_with_claims}

    # Task 12 (P1.3): per-evidence-node verified verdicts, keyed by EVIDENCE
    # node id, feeding the DF-QuAD graph adapter's evidence edges below
    # ({"status", "base_score"} per node -- see debate_argument_graph's
    # evidence_verifications param). Initialized empty (matching the
    # pre-Task-12 "always no-edge" behavior) BEFORE the try block so any
    # failure inside it (same graceful-degradation posture as
    # verification_map/verification_source above) leaves evidence edges off
    # rather than partially applied.
    evidence_verifications: dict[str, dict[str, Any]] = {}

    # Phase 7 Task 3: overlay real persisted evidence-verification verdicts
    # on top of the P5b kind-classifier fallback computed above. Always-on
    # (no DIALECTICAL_EVIDENCE_VERIFICATION gate here) -- this just reads
    # whatever verdicts already exist; if Task 2's flag was off, no
    # evidence_verification AnalyzerRun rows exist and this loop is a no-op,
    # leaving verification_map byte-identical to pre-Phase-7 behavior.
    #
    # Phase 7 Task 3 review (graceful degradation, binding): this overlay is
    # read-derived from persisted rows that this function does not control
    # the shape of. A corrupted/unexpected row (e.g. a non-dict output, or a
    # status/id value of an unexpected type) must NEVER abort the whole
    # protocol run -- the spec'd behavior is verdict-read failure falls back
    # to the P5b kind-classifier map, and the run still persists with
    # crossExam/QBAF/convergence intact. Scoped tightly to ONLY this overlay
    # block; anything raised OUTSIDE this try (e.g. by cross_examine,
    # debate_argument_graph, or the final AnalyzerRun construction/commit)
    # must still propagate to the outer best-effort wrapper in
    # run_protocol_analysis, unchanged.
    try:
        # HARD GATE (Task 11 / P1.2) + unreachable re-check (Task 11 review)
        # + Task 12 (P1.3) per-evidence-node verified verdicts all come from
        # ONE shared, latest-per-evidence-node query
        # (app.evidence.verification_evaluator.latest_evidence_verdicts_for_debate)
        # so the claim-level rollup below and the DF-QuAD evidence edges can
        # never read two different views of "what counts as verified right
        # now" (brief P1.3 point 4: "reuse that loading... do not re-query
        # differently"). Raises on a corrupted row (e.g. non-dict output) --
        # caught by this SAME try/except, same as before the refactor.
        verified_evidence = latest_evidence_verdicts_for_debate(db, debate.id)

        verdicts_by_claim_node: dict[str, list[str]] = {}
        for evidence_node_id, verdict in verified_evidence.items():
            verdicts_by_claim_node.setdefault(verdict["claim_node_id"], []).append(verdict["status"])
            evidence_verifications[evidence_node_id] = {
                "status": verdict["status"],
                "base_score": verdict["base_score"],
            }

        for node in nodes_with_claims:
            node_id = node["id"]
            # Defense-in-depth: re-check claim_type here even though Task 2's
            # caller should never have evaluated a normative/definitional claim.
            # A real verdict must NEVER override unverifiable_by_kind.
            if classify_verification(node.get("claim_type", "unknown")) == "unverifiable_by_kind":
                continue
            real_verdicts = verdicts_by_claim_node.get(node_id)
            if real_verdicts:
                verification_map[node_id] = rollup_claim_verification_status(real_verdicts)
                verification_source[node_id] = "real_verdict"
    except Exception as exc:
        # Honest degradation: leave verification_map/verification_source
        # exactly at the P5b kind-classifier fallback computed above and
        # keep going -- the protocol run must still persist. evidence_
        # verifications also resets to {} (no evidence edges) for the same
        # reason: a corrupted verdict read must never partially wire the
        # DF-QuAD graph.
        print(f"[protocol.runner] evidence-verification overlay failed (non-fatal, falling back to kind_classifier): {exc!r}")
        verification_map = verification_statuses(nodes_with_claims)
        verification_source = {node["id"]: "kind_classifier" for node in nodes_with_claims}
        evidence_verifications = {}

    scores_by_node_id = {
        item["node_id"]: item for item in scoring_items if item.get("node_id")
    }
    semantics_version = DEFAULT_SEMANTICS
    qbaf_output: dict[str, Any] = {}
    try:
        adapted = debate_argument_graph(
            node_dicts, scores_by_node_id, evidence_verifications=evidence_verifications
        )
        strengths = adapted.graph.compute_strengths()
        # W2: aggregate judge-score coverage over ARGUMENT nodes -- every
        # non-EVIDENCE node (ROOT_CLAIM, PRO, CON, POV containers all carry a
        # tau that composes into the root strength). EVIDENCE nodes stay
        # excluded from this denominator even once Task 12 (P1.3) gives some
        # of them a real verifier-driven edge -- tauCoverage measures JUDGE
        # coverage over argument nodes specifically; evidence verification is
        # a different signal class with its own (0/1, not fractional)
        # semantics, so mixing the two denominators would make tauCoverage
        # mean something different depending on how much evidence happens to
        # exist. `argument_node_ids` below already filters by node_type !=
        # "EVIDENCE" regardless of tau_source, so this holds unconditionally.
        # 0..1 fraction whose tau came from a persisted judge strength rather
        # than DEFAULT_TAU; consumed by verdict_summary's coverage gate.
        #
        # T2 (P0.5) dead-node exclusion: a failed placeholder node
        # (app.scoring.service._debate_node_ids already excludes it from
        # judging on status=="failed" alone -- see that function's comment
        # for why path_status=="abandoned" is deliberately NOT an exclusion
        # criterion, on either side) can never earn a "judge_strength" tau,
        # so leaving its id in this denominator would hold tauCoverage
        # below 1.0 forever, even once every live node is judged -- through
        # no scoring fault. An abandoned-but-status=="complete" node stays
        # OUT of dead_node_ids here, matching _debate_node_ids: it is still
        # scored, so it still earns "judge_strength" and still counts
        # toward coverage like any other live node.
        #
        # `nodes` above is intentionally NOT filtered by status (unlike the
        # scoring node-id query): a dead node can still be a live sibling's
        # attack/support edge *target* by construction (parent_id), and
        # debate_adapter._edge_for never verifies an edge endpoint actually
        # exists in the graph -- dropping dead nodes from `node_dicts`/the
        # graph itself risks an orphaned edge that raises ValueError in
        # debate_argument_graph (caught below as qbafUnavailableReason,
        # losing tauCoverage entirely, which is worse than the bug this
        # fixes). In practice a status=="failed" node is always a leaf (no
        # NODE_DEGRADABLE_JOB_TYPES job type creates its children before
        # that job succeeds), so this risk does not currently materialize --
        # but excluding dead ids from just the coverage scope, not the
        # graph, is the smallest change that establishes the invariant
        # without relying on that leaf-only property holding forever. Dead
        # nodes still get an honest "default" tauSources entry above, they
        # are just never counted toward -- or against -- coverage.
        dead_node_ids = {str(node.id) for node in nodes if node.status == "failed"}
        argument_node_ids = [
            str(node["id"])
            for node in node_dicts
            if str(node["node_type"]) != "EVIDENCE" and str(node["id"]) not in dead_node_ids
        ]
        judged_count = sum(
            1
            for node_id in argument_node_ids
            if adapted.tau_sources.get(node_id) == "judge_strength"
        )
        tau_coverage = judged_count / len(argument_node_ids) if argument_node_ids else 0.0
        qbaf_output = {
            "dialecticalStrengths": strengths,
            "graphFingerprint": adapted.fingerprint,
            "tauSources": dict(adapted.tau_sources),
            "tauCoverage": tau_coverage,
            "qbafSemantics": semantics_version,
            "compositionNote": (
                "v1: tau=judgeStrength|default; verificationModifier=none(P7); "
                "modelWeight=constant-1.0(P8)"
            ),
        }
    except (CyclicGraphError, ValueError) as exc:
        qbaf_output = {"qbafUnavailableReason": str(exc)}

    # Query the previous protocol_analysis run BEFORE constructing/adding
    # this run's new AnalyzerRun below. This sidesteps any SQLAlchemy
    # autoflush ambiguity about whether the not-yet-added new row could
    # appear in this same select -- at this point in the function no new
    # AnalyzerRun has been constructed or added to the session yet, so this
    # query is provably scoped to prior runs only.
    previous_run = db.scalars(
        select(AnalyzerRun)
        .where(AnalyzerRun.debate_id == debate.id, AnalyzerRun.analyzer_type == PROTOCOL_ANALYSIS_TYPE)
        .order_by(AnalyzerRun.seq.desc(), AnalyzerRun.created_at.desc(), AnalyzerRun.id.desc())
        .limit(1)
    ).first()

    raw_epsilon = (debate.config or {}).get("protocol", {}).get("convergence_epsilon")
    if isinstance(raw_epsilon, (int, float)) and not isinstance(raw_epsilon, bool) and 0 < raw_epsilon < 1:
        epsilon = float(raw_epsilon)
    else:
        epsilon = DEFAULT_CONVERGENCE_EPSILON

    curr_strengths = qbaf_output.get("dialecticalStrengths")
    if curr_strengths is None:
        # This run's own QBAF computation didn't produce strengths (honest
        # failure, e.g. CyclicGraphError) -- there is nothing to compare.
        convergence = {"converged": None, "reason": "strengths_unavailable", "epsilon": epsilon}
    else:
        previous_output = (previous_run.output or {}) if previous_run else {}
        prev_strengths = previous_output.get("dialecticalStrengths") if previous_run else None
        if previous_run is None or prev_strengths is None:
            convergence = {"converged": None, "reason": "first_evaluation", "epsilon": epsilon}
        else:
            previous_semantics_value = previous_output.get("semanticsVersion")
            try:
                previous_semantics = resolve_semantics(previous_semantics_value)
            except ValueError:
                # A stamped but unknown semantics is still honestly different
                # from this runner's known v1 semantics; never compare across it.
                previous_semantics = previous_semantics_value
            if previous_semantics != semantics_version:
                convergence = {
                    "converged": None,
                    "reason": "semantics_changed",
                    "epsilon": epsilon,
                }
            else:
                prev_keys = set(prev_strengths.keys())
                curr_keys = set(curr_strengths.keys())
                intersection = prev_keys & curr_keys
                added = curr_keys - prev_keys
                removed = prev_keys - curr_keys

                # Task 12 (P1.3) honesty fix: node-id-set overlap alone is
                # blind to a topology change that adds/removes an EDGE
                # without adding/removing a NODE -- exactly what happens the
                # first time an EXISTING (already-scored-as-default) EVIDENCE
                # node gains a verifier-driven support/attack edge (its id
                # was already present in BOTH runs' dialecticalStrengths).
                # Comparing which node ids carry the EVIDENCE_VERIFIER_TAU_
                # SOURCE tau source between the two runs' persisted
                # tauSources catches exactly that case: it is the ONLY tau
                # source Task 12 introduces, and an EVIDENCE node's tau
                # source flips to/from it exactly when its edge appears/
                # disappears (app.qbaf.debate_adapter._evidence_verdict_tau).
                # A debate that never touches evidence verification always
                # computes two empty sets here (equal), so this can never
                # change behavior for any pre-Task-12 scenario -- reporting a
                # raw maxDelta for what is actually a structural graph change
                # would misrepresent it as ordinary strength drift.
                prev_evidence_edge_nodes = {
                    node_id
                    for node_id, source in (previous_output.get("tauSources") or {}).items()
                    if source == EVIDENCE_VERIFIER_TAU_SOURCE
                }
                curr_evidence_edge_nodes = {
                    node_id
                    for node_id, source in (qbaf_output.get("tauSources") or {}).items()
                    if source == EVIDENCE_VERIFIER_TAU_SOURCE
                }
                evidence_topology_changed = prev_evidence_edge_nodes != curr_evidence_edge_nodes

                if not intersection or evidence_topology_changed:
                    convergence = {
                        "converged": None,
                        "reason": "topology_changed",
                        "nodesCompared": 0,
                        "nodesAdded": len(added),
                        "nodesRemoved": len(removed),
                        "epsilon": epsilon,
                    }
                else:
                    max_delta = max(abs(curr_strengths[k] - prev_strengths[k]) for k in intersection)
                    convergence = {
                        "converged": max_delta <= epsilon,
                        "maxDelta": max_delta,
                        "nodesCompared": len(intersection),
                        "nodesAdded": len(added),
                        "nodesRemoved": len(removed),
                        "epsilon": epsilon,
                        "comparedAnalyzerRunId": previous_run.id,
                    }

    branch = _first_branch(db, debate.id)
    run = AnalyzerRun(
        debate_id=debate.id,
        branch_id=branch.id,
        analyzer_type=PROTOCOL_ANALYSIS_TYPE,
        output={
            "crossExam": cross_exam_report.to_dict(),
            "verificationStatuses": verification_map,
            "verificationSource": verification_source,
            "claimTypes": claim_types,
            "claimTypeSource": claim_type_source,
            "crossExamVersion": cross_exam_report.version,
            "verificationVersion": "verification-v1",
            "semanticsVersion": semantics_version,
            **qbaf_output,
            "convergence": convergence,
            "convergenceVersion": CONVERGENCE_VERSION,
        },
        status="complete",
        provenance={"scoring_source": "protocol_analysis", "debate_id": debate.id},
    )
    # next_analyzer_run_seq assigns run.seq, db.add()s, and db.flush()es as
    # one lock-covered critical section (see app.models.entities).
    next_analyzer_run_seq(db, run)

    state = protocol_state_of(debate.config)
    if state is not None:
        state = advance_phase(state, "5.4_cross_exam", "complete")
        state = advance_phase(state, "5.5_verification", "complete")
        state = advance_phase(state, "5.6_qbaf_scoring", "complete")
        state = advance_phase(state, "5.7_convergence", "complete")
        debate.config = {**debate.config, "protocol_state": state}

    commit_write(db)
    print(f"qbaf.semantics version={semantics_version} debate={debate.id}")
