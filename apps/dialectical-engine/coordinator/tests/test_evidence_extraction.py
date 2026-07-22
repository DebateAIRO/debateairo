from __future__ import annotations

from app.evidence.extraction import evidence_kind, extract_evidence_spans, persist_evidence_nodes
from app.models.entities import Debate, Generation, Node, Worker


def test_evidence_kind_recognizes_citation_via_url() -> None:
    assert evidence_kind("See https://example.org/study for details.") == "citation"


def test_evidence_kind_recognizes_statistical() -> None:
    assert evidence_kind("A survey found that 62% of respondents agreed.") == "statistical"


def test_evidence_kind_recognizes_empirical() -> None:
    assert evidence_kind("A controlled trial observed a measurable reduction in outcomes.") == "empirical"


def test_evidence_kind_recognizes_anecdotal() -> None:
    assert evidence_kind("In my experience, this policy caused confusion locally.") == "anecdotal"


def test_evidence_kind_unclassified_is_honest_fallback_not_guessed() -> None:
    assert evidence_kind("This claim is simply true because it is obviously correct.") == "unclassified"


def test_evidence_kind_law_does_not_match_lawn_word_boundary_lesson() -> None:
    """P5a triage lesson: word-boundary regexes must not substring-match
    ("law" must not match "lawn"). This sentence contains "lawn" (a
    statistical-keyword lookalike is not in play here, but the anecdotal
    marker check and empirical checks must not fire on word fragments)."""
    assert evidence_kind("Mowing the lawn is a weekend chore for many homeowners.") == "unclassified"


def test_extract_evidence_spans_drops_unclassified_sentences() -> None:
    argument = (
        "This policy is clearly the right choice. "
        "A 2023 study found that 40% of participants reported improved outcomes. "
        "In my experience, similar policies have worked well locally."
    )
    spans = extract_evidence_spans(argument)
    assert len(spans) == 2
    kinds = {span["evidenceKind"] for span in spans}
    assert kinds == {"statistical", "anecdotal"}
    assert all(span["text"] in argument for span in spans)  # verbatim, never rewritten


def test_extract_evidence_spans_returns_empty_list_when_no_evidence_present() -> None:
    argument = "This is simply the correct position and everyone should agree."
    assert extract_evidence_spans(argument) == []


def test_extract_evidence_spans_recognizes_citation_url_sentence() -> None:
    argument = (
        "This is a strong position overall. "
        "See https://example.org/research/study-42 for the full writeup."
    )
    spans = extract_evidence_spans(argument)
    assert len(spans) == 1
    assert spans[0]["evidenceKind"] == "citation"
    assert spans[0]["text"] in argument


# ---------------------------------------------------------------------------
# DB-backed persistence tests (real Debate/Node/Generation/Worker rows, per
# the existing fixture conventions in test_node_scoring.py — no hand-built
# fake JSON).
# ---------------------------------------------------------------------------


def _build_claim_node_with_generation(db, *, argument_text: str) -> tuple[Debate, Node, Generation]:
    debate = Debate(topic="Should cities invest in public transit?", status="running")
    worker = Worker(id="worker-evidence", name="Worker Evidence", token_hash="hash", capabilities=["debate"])
    claim_node = Node(
        id="claim-node-1",
        debate=debate,
        node_type="PRO",
        depth=1,
        position=0,
        claim="Public transit investment improves urban mobility.",
        status="complete",
        path_status="active",
        materialized_path="/0",
    )
    generation = Generation(
        id="generation-claim-1",
        node=claim_node,
        model_id="model-a",
        role="pro",
        argument=argument_text,
        prompt_version="v1",
        worker_id="worker-evidence",
    )
    claim_node.active_generation_id = generation.id
    db.add_all([debate, worker, claim_node, generation])
    db.commit()
    return debate, claim_node, generation


def test_persist_evidence_nodes_creates_evidence_children_with_copied_attribution(db) -> None:
    argument_text = (
        "This policy is clearly the right choice. "
        "A 2023 study found that 40% of participants reported improved outcomes."
    )
    debate, claim_node, generation = _build_claim_node_with_generation(db, argument_text=argument_text)

    evidence_nodes = persist_evidence_nodes(db, debate, claim_node, generation)

    assert len(evidence_nodes) == 1
    assert evidence_nodes[0].node_type == "EVIDENCE"
    assert evidence_nodes[0].parent_id == claim_node.id
    assert evidence_nodes[0].depth == claim_node.depth + 1
    # Task 9 (scoring/status hygiene, docs/improvement-plan-2026-07-22.md
    # Sec P2.5): "complete" (no "-ed") is the app-wide node-status vocabulary
    # -- every other Node.status reader/writer uses it; extractor-created
    # EVIDENCE nodes must match, not carry the one-off "completed" spelling.
    assert evidence_nodes[0].status == "complete"

    evidence_generation = db.get(Generation, evidence_nodes[0].active_generation_id)
    assert evidence_generation is not None
    assert evidence_generation.argument in generation.argument  # verbatim substring, not fabricated
    assert evidence_generation.model_id == generation.model_id  # honest attribution, copied not invented
    assert evidence_generation.worker_id == generation.worker_id
    assert evidence_generation.role == generation.role
    assert evidence_generation.is_active is True


def test_persist_evidence_nodes_returns_empty_list_when_argument_has_no_evidence(db) -> None:
    argument_text = "This is simply the correct position and everyone should agree."
    debate, claim_node, generation = _build_claim_node_with_generation(db, argument_text=argument_text)

    evidence_nodes = persist_evidence_nodes(db, debate, claim_node, generation)

    assert evidence_nodes == []


def test_persist_evidence_nodes_handles_multiple_spans_with_correct_positions(db) -> None:
    argument_text = (
        "This policy is clearly the right choice. "
        "A 2023 study found that 40% of participants reported improved outcomes. "
        "In my experience, similar policies have worked well locally."
    )
    debate, claim_node, generation = _build_claim_node_with_generation(db, argument_text=argument_text)

    evidence_nodes = persist_evidence_nodes(db, debate, claim_node, generation)

    assert len(evidence_nodes) == 2
    positions = sorted(node.position for node in evidence_nodes)
    # RE-PINNED (Hermes ticket 1): evidence positions now live in the
    # reserved EVIDENCE_POSITION_OFFSET (1000+) namespace so they can never
    # collide with argument-child (PRO/CON) positions, which use small
    # indexes (0, 1, ...). Old pinned values were [0, 1]; see
    # coordinator/app/evidence/extraction.py for the offset rationale.
    assert positions == [1000, 1001]
    for node in evidence_nodes:
        assert node.debate_id == debate.id
        assert node.parent_id == claim_node.id


def test_persist_evidence_nodes_does_not_collide_with_existing_sibling_pro_child(db) -> None:
    """Regression for Hermes ticket 1: materialize_pov_branch extracts
    evidence from a claim node BEFORE adding that node's nested PRO/CON
    children at positions 0 and 1. Evidence positions/paths must never
    collide with those argument-child positions/paths, regardless of
    extraction order. Reproduce the collision shape directly: a claim node
    that already has a PRO child at sibling position 0 (materialized_path
    ending in "/0"), then extract evidence from the SAME claim node's
    generation and assert no duplicate (position, materialized_path) among
    the claim node's children.
    """
    argument_text = (
        "This policy is clearly the right choice. "
        "A 2023 study found that 40% of participants reported improved outcomes."
    )
    debate, claim_node, generation = _build_claim_node_with_generation(db, argument_text=argument_text)

    existing_pro_child = Node(
        id="existing-pro-child",
        debate=debate,
        parent_id=claim_node.id,
        node_type="PRO",
        depth=claim_node.depth + 1,
        position=0,
        claim="Nested pro child occupying sibling position 0.",
        status="complete",
        path_status="active",
        materialized_path=f"{claim_node.materialized_path}/0",
    )
    db.add(existing_pro_child)
    db.commit()

    evidence_nodes = persist_evidence_nodes(db, debate, claim_node, generation)
    assert len(evidence_nodes) == 1  # sanity: exactly one evidence span extracted

    siblings = [existing_pro_child, *evidence_nodes]
    positions = [node.position for node in siblings]
    paths = [node.materialized_path for node in siblings]
    assert len(positions) == len(set(positions)), f"duplicate sibling position among {siblings!r}"
    assert len(paths) == len(set(paths)), f"duplicate sibling materialized_path among {siblings!r}"
