"""P1 Task 3: bounded synthesis payload.

render_v2_job_prompt serialised every node with its full argument text and
no cap -- O(nodes x argument length). At frontier depth this blows the
context window at the last step of a multi-hour run. The payload becomes
O(branches + K) instead, and must never silently drop nodes.
"""
from __future__ import annotations

import hashlib

from sqlalchemy import select

from app.models.entities import (
    AnalyzerRun,
    Debate,
    DebateBranch,
    Generation,
    Job,
    JudgeOutputArtifact,
    Node,
    Worker,
    next_analyzer_run_seq,
    now_utc,
)
from app.scoring.service import JUDGE_OUTPUT_SOURCE, SCORING_ANALYZER_TYPE
from app.services import dialectical_v2 as service
from app.services.dialectical_v2 import V2_CODEX_MODEL_ID
from app.synthesis.branch_summary import (
    build_synthesis_tree_payload,
    synthesis_contested_k,
    synthesis_load_bearing_k,
)

from test_protocol_runner import _scoring_payload_for_node

TOPIC = "Should cities ban cars downtown?"
POV_TYPES = ("SCIENTIFIC_POV", "STATISTICAL_POV", "ETHICAL_POV", "PRACTICAL_POV")

CONTESTED_K = 30


def _assert_node_conservation(db, debate: Debate, payload: dict) -> None:
    """The EXACT conservation identity (P1 Task 3, extended by Task 8).

    Every node in the debate is accounted for exactly once, as a branch
    entry, a full record, or an omission -- with the denominator queried
    from the database rather than hard-coded. A `>=` assertion would still
    pass if omitted_count double-counted nodes already carried elsewhere, or
    simply reported len(nodes), and Task 7 consumes omitted_count for the
    coverage record, so an inflated count is exactly the failure mode that
    must not slip through.

    Task 8 makes this load-bearing in a second way: `contested` is now
    CAPPED, and the nodes cut by that cap have to land in omitted_count. A
    cut contested node that fell out of the identity would be a silent drop
    of the very nodes the run exists to surface.
    """
    all_nodes = db.scalars(select(Node).where(Node.debate_id == debate.id)).all()
    assert (
        len(payload["load_bearing"])
        + len(payload["contested"])
        + len(payload["branches"])
        + payload["omitted_count"]
    ) == len(all_nodes)


def _seed_two_family_panel(
    db, debate: Debate, node: Node, *, spread: float, make_judge_evidence
) -> None:
    """Persist a two-family judge panel for `node` that disagrees on
    critic.logical_validity by exactly `spread`, the way production persists
    it (one JudgeOutputArtifact per family, same input_hash, distinct
    (judge_role, provider, model) identities). This is the evidence
    `app.scoring.disagreement.field_spreads` actually reads -- through the
    real `latest_judge_evidence_for_node` resolution, not a stub.
    """
    base = round((1.0 - spread) / 2, 4)
    for judge_role, logical_validity in (
        ("critic", base),
        ("critic_b", round(base + spread, 4)),
    ):
        evidence = make_judge_evidence(judge_role=judge_role, logical_validity=logical_validity)
        raw_output = f"{node.id}:{judge_role}:{logical_validity}"
        db.add(
            JudgeOutputArtifact(
                debate_id=debate.id,
                node_id=node.id,
                input_hash=f"branch-summary-input-hash-{node.id}",
                judge_role=evidence["judge_role"],
                provider=evidence["provider"],
                model=evidence["model"],
                raw_output=raw_output,
                raw_output_sha256=hashlib.sha256(raw_output.encode("utf-8")).hexdigest(),
                parse_status="available",
                assessment=evidence["assessment"],
                checked_at=now_utc(),
            )
        )


def _v2_debate_with_deep_scored_tree(
    db,
    node_count: int,
    contested_node_index: int | None = None,
    *,
    scoring_run_id: str | None = None,
    contested_node_spreads: dict[int, float] | None = None,
    make_judge_evidence=None,
) -> tuple[Debate, Node]:
    """A v2 debate whose tree carries `node_count` complete PRO/CON argument
    nodes, chained deep under four POV branches, each with an active
    Generation holding non-empty argument text and a real persisted
    node_scoring AnalyzerRun item.

    The scoring items are built with tests/test_protocol_runner's
    `_scoring_payload_for_node`, i.e. through the REAL normalizer + reducer
    (`normalize_claim` + `reduce_assessments`) -- not a hand-rolled shape --
    so `scores.impact`, `scores.strength` and `score_provenance` are exactly
    what production scoring persists. `strength_override` varies strength per
    node so impact x strength has a meaningful ordering.

    When `contested_node_index` is set, that node's item is marked contested
    the way app/scoring/service.py:1386 marks it: a `score_provenance
    ["disagreement_status"]["status"] == "present"` block plus the
    dispersion-derived `uncertainty_source`.

    `contested_node_spreads` ({argument index: logical_validity spread})
    marks each listed node contested the same way AND persists a real
    two-family judge panel carrying that exact per-field spread, so P1 Task
    8's contested ranking reads measured dispersion rather than a stub.
    """
    worker = Worker(
        name="branch-summary-worker",
        token_hash="test-token",
        capabilities=[V2_CODEX_MODEL_ID],
        last_seen=now_utc(),
        status="online",
    )
    db.add(worker)
    debate = Debate(topic=TOPIC, status="generating", config={})
    db.add(debate)
    db.flush()
    root = Node(
        debate_id=debate.id,
        node_type="ROOT_CLAIM",
        depth=0,
        position=0,
        claim=TOPIC,
        status="complete",
        materialized_path="/0",
    )
    db.add(root)
    db.flush()
    debate.root_node_id = root.id
    db.add(DebateBranch(debate_id=debate.id, root_node_id=root.id, status="active"))
    db.flush()

    povs: list[Node] = []
    for position, pov_type in enumerate(POV_TYPES):
        pov = Node(
            debate_id=debate.id,
            parent_id=root.id,
            node_type=pov_type,
            depth=1,
            position=position,
            claim=f"{pov_type.replace('_POV', '').title()} POV",
            status="complete",
            materialized_path=f"{root.materialized_path}/{position}",
        )
        db.add(pov)
        db.flush()
        povs.append(pov)

    # Chain each POV's arguments downward so the tree is genuinely deep
    # (node_count / len(POV_TYPES) levels), not a wide fan-out.
    tips = list(povs)
    arguments: list[Node] = []
    for index in range(node_count):
        slot = index % len(povs)
        parent = tips[slot]
        node_type = "PRO" if index % 2 == 0 else "CON"
        node = Node(
            debate_id=debate.id,
            parent_id=parent.id,
            node_type=node_type,
            depth=parent.depth + 1,
            position=0,
            claim=f"Argument {index}: downtown access trades off against congestion.",
            status="complete",
            materialized_path=f"{parent.materialized_path}/0",
        )
        db.add(node)
        db.flush()
        generation = Generation(
            node_id=node.id,
            model_id=V2_CODEX_MODEL_ID,
            role=node_type,
            argument=f"Full argument body for node {index}. " * 4,
            is_active=True,
            worker_id=worker.id,
        )
        db.add(generation)
        db.flush()
        node.active_generation_id = generation.id
        db.flush()
        tips[slot] = node
        arguments.append(node)

    items = []
    for index, node in enumerate(arguments):
        # Distinct strengths (0.90 down to 0.14, cycling) so impact x strength
        # produces a real ranking rather than a flat tie.
        strength = round(0.9 - (index % 20) * 0.04, 4)
        item = _scoring_payload_for_node(node.id, node.claim, strength_override=strength)
        spreads = contested_node_spreads or {}
        if (contested_node_index is not None and index == contested_node_index) or (
            index in spreads
        ):
            item["uncertainty_source"] = "dispersion"
            item["score_provenance"] = {
                **item["score_provenance"],
                "disagreement_status": {
                    "status": "present",
                    "derived_from": "persisted_judge_artifacts",
                },
            }
        if index in spreads:
            assert make_judge_evidence is not None, (
                "contested_node_spreads needs the make_judge_evidence fixture"
            )
            _seed_two_family_panel(
                db,
                debate,
                node,
                spread=spreads[index],
                make_judge_evidence=make_judge_evidence,
            )
        items.append(item)

    _persist_scoring_run(db, debate, items, run_id=scoring_run_id)
    db.commit()
    return debate, root


def _persist_scoring_run(
    db, debate: Debate, items: list[dict], *, run_id: str | None = None
) -> AnalyzerRun:
    """Persist a node_scoring AnalyzerRun the way production does -- through
    next_analyzer_run_seq, so the row carries a real monotonic seq (Phase 11
    Task 1: seq is the primary sort key at every latest-run read site)."""
    branch = service.first_branch(db, debate.id)
    kwargs = {"id": run_id} if run_id is not None else {}
    run = AnalyzerRun(
        debate_id=debate.id,
        branch_id=branch.id,
        analyzer_type=SCORING_ANALYZER_TYPE,
        output={"status": "available", "items": items},
        status="complete",
        provenance={"scoring_source": JUDGE_OUTPUT_SOURCE},
        **kwargs,
    )
    next_analyzer_run_seq(db, run)  # assigns seq, db.add()s and flushes
    return run


def _v2_synthesize_job(db, debate: Debate) -> Job:
    """The debate's v2_synthesize job, queued through the real queue site
    (minus rotation/cross-exam, which are irrelevant to prompt rendering)."""
    job = service.queue_v2_job(
        db, debate, "v2_synthesize", "v2_synthesizer", V2_CODEX_MODEL_ID, None
    )
    db.commit()
    return job


def test_load_bearing_k_default_is_twenty(monkeypatch):
    # Read the production default, not whatever this machine/CI runner happens
    # to export.
    monkeypatch.delenv("DIALECTICAL_SYNTHESIS_LOAD_BEARING_K", raising=False)

    assert synthesis_load_bearing_k() == 20


def test_payload_is_bounded_and_reports_omissions(db):
    debate, root = _v2_debate_with_deep_scored_tree(db, node_count=120)

    payload = build_synthesis_tree_payload(
        db, debate, load_bearing_k=20, contested_k=CONTESTED_K
    )

    assert len(payload["load_bearing"]) == 20
    assert payload["omitted_count"] > 0
    # This is strictly stronger than the brief's bound: if the identity
    # holds, so does the brief's `>= 120`.
    _assert_node_conservation(db, debate, payload)


def test_load_bearing_ranked_by_impact_times_strength(db):
    debate, root = _v2_debate_with_deep_scored_tree(db, node_count=30)

    payload = build_synthesis_tree_payload(
        db, debate, load_bearing_k=5, contested_k=CONTESTED_K
    )

    products = [item["impact"] * item["strength"] for item in payload["load_bearing"]]
    assert products == sorted(products, reverse=True)


def test_contested_nodes_are_always_included_even_below_k(db):
    """A contested node is the point of the run; it must never be cut for rank."""
    debate, root = _v2_debate_with_deep_scored_tree(
        db, node_count=30, contested_node_index=29
    )

    payload = build_synthesis_tree_payload(
        db, debate, load_bearing_k=5, contested_k=CONTESTED_K
    )

    contested_ids = {item["node_id"] for item in payload["contested"]}
    assert len(contested_ids) == 1
    # ...and it really was outside the top-K, so inclusion is not incidental.
    assert contested_ids.isdisjoint({item["node_id"] for item in payload["load_bearing"]})


def test_contested_k_default_is_thirty(monkeypatch):
    # Read the production default, not whatever this machine/CI runner
    # happens to export.
    monkeypatch.delenv("DIALECTICAL_SYNTHESIS_CONTESTED_K", raising=False)

    assert synthesis_contested_k() == 30


def test_contested_is_capped_and_the_cut_nodes_are_counted_as_omitted(
    db, make_judge_evidence
):
    """P1 Task 8: `contested` was Task 3's one unbounded term, on the
    reasoning that a contested node is the point of the run. Task 5 then
    measured 13 of 26 production nodes contested at the chosen threshold --
    50% -- so at frontier scale the unbounded term re-unbounds the payload
    Task 3 exists to bound. The cap is real, and the nodes it cuts are
    counted honestly rather than silently dropped.
    """
    spreads = {index: round(0.10 + index * 0.05, 4) for index in range(8)}
    debate, root = _v2_debate_with_deep_scored_tree(
        db,
        node_count=30,
        contested_node_spreads=spreads,
        make_judge_evidence=make_judge_evidence,
    )

    payload = build_synthesis_tree_payload(db, debate, load_bearing_k=5, contested_k=3)

    assert len(payload["contested"]) == 3
    _assert_node_conservation(db, debate, payload)
    # The 5 cut contested nodes are in omitted_count, not in load_bearing:
    # they had their privileged shot and lost it on spread, so they must not
    # come back in through the ordinary ranking.
    surviving = {item["node_id"] for item in payload["contested"]}
    load_bearing_ids = {item["node_id"] for item in payload["load_bearing"]}
    cut = {
        node_id
        for node_id in _contested_node_ids(db, debate)
        if node_id not in surviving
    }
    assert len(cut) == 5
    assert cut.isdisjoint(load_bearing_ids)


def test_capped_contested_survivors_are_the_widest_spread(db, make_judge_evidence):
    """Rank contested by widest cross-family field spread, descending, so the
    most-disagreed nodes survive the cut."""
    spreads = {0: 0.10, 1: 0.50, 2: 0.20, 3: 0.60, 4: 0.30}
    debate, root = _v2_debate_with_deep_scored_tree(
        db,
        node_count=30,
        contested_node_spreads=spreads,
        make_judge_evidence=make_judge_evidence,
    )
    argument_ids = _argument_node_ids(db, debate)

    payload = build_synthesis_tree_payload(db, debate, load_bearing_k=5, contested_k=2)

    # 0.60 (index 3) and 0.50 (index 1) are the two widest; nothing else.
    assert [item["node_id"] for item in payload["contested"]] == [
        argument_ids[3],
        argument_ids[1],
    ]


def _argument_node_ids(db, debate: Debate) -> list[str]:
    """The debate's PRO/CON argument node ids in the order
    `_v2_debate_with_deep_scored_tree` indexes them by -- read off the
    persisted scoring run's item list, which the factory builds in exactly
    that order (node created_at is coarse wall clock and ties here)."""
    run = db.scalars(
        select(AnalyzerRun).where(
            AnalyzerRun.debate_id == debate.id,
            AnalyzerRun.analyzer_type == SCORING_ANALYZER_TYPE,
        )
    ).one()
    return [item["node_id"] for item in run.output["items"]]


def _contested_node_ids(db, debate: Debate) -> set[str]:
    from app.synthesis.branch_summary import _is_contested, _scored_items

    scored = _scored_items(db, debate)
    return {node_id for node_id, item in scored.items() if _is_contested(item)}


def test_full_argument_text_only_for_load_bearing_and_contested(db):
    debate, root = _v2_debate_with_deep_scored_tree(db, node_count=60)

    payload = build_synthesis_tree_payload(
        db, debate, load_bearing_k=10, contested_k=CONTESTED_K
    )

    for item in payload["load_bearing"]:
        assert item.get("argument")
    for branch in payload["branches"]:
        assert "argument" not in branch
        assert branch.get("summary")


def test_same_created_at_tick_resolved_by_seq_not_random_id(db):
    """Incremental scoring fires on every branch completion, so two scoring
    runs sharing a created_at tick is routine. `id` is a random UUID4, so
    id.desc() alone would pick a run at random -- and reading the STALE run
    ranks the wrong nodes as load-bearing. seq must decide (Phase 11 Task 1,
    the same invariant tests/test_analyzer_run_seq.py pins at the scoring
    service, serialization, and cache read sites)."""
    # Ids pinned so id.desc() alone would pick the STALE run:
    # "id-zzzz..." sorts after "id-aaaa..." lexicographically.
    debate, root = _v2_debate_with_deep_scored_tree(
        db, node_count=4, scoring_run_id="id-zzzzzzzz-older-but-lexicographically-last"
    )
    stale = db.scalars(
        select(AnalyzerRun).where(
            AnalyzerRun.debate_id == debate.id,
            AnalyzerRun.analyzer_type == SCORING_ANALYZER_TYPE,
        )
    ).one()
    node_ids = [item["node_id"] for item in stale.output["items"]]

    # A newer run in the SAME created_at tick, whose scores differ.
    fresh = _persist_scoring_run(
        db,
        debate,
        [
            _scoring_payload_for_node(node_id, "restated claim", strength_override=0.99)
            for node_id in node_ids
        ],
        run_id="id-aaaaaaaa-newer-but-lexicographically-first",
    )
    fresh.created_at = stale.created_at  # same tick
    db.commit()

    # Provable repro premise: created_at is tied, and a bare id.desc()
    # tiebreak would select the stale run -- only seq gets this right.
    assert fresh.created_at == stale.created_at
    assert max(stale.id, fresh.id) == stale.id
    assert fresh.seq > stale.seq

    payload = build_synthesis_tree_payload(
        db, debate, load_bearing_k=5, contested_k=CONTESTED_K
    )

    # 0.99 comes only from the seq-winner; the stale run's top strength is 0.90.
    assert {item["strength"] for item in payload["load_bearing"]} == {0.99}


def test_flag_off_renders_historical_payload_unchanged(db, monkeypatch):
    from app.services.dialectical_v2 import render_v2_job_prompt

    monkeypatch.delenv("DIALECTICAL_HIERARCHICAL_SYNTHESIS", raising=False)
    debate, root = _v2_debate_with_deep_scored_tree(db, node_count=8)
    job = _v2_synthesize_job(db, debate)

    # render_v2_job_prompt returns (system, user); the tree payload is
    # serialised into the user message.
    _system, rendered = render_v2_job_prompt(db, job)

    assert '"active_generation"' in rendered
    assert '"load_bearing"' not in rendered


def test_flag_on_renders_bounded_payload(db, monkeypatch):
    """The gate is real: flag ON swaps the every-node list for the bounded
    payload, so no full argument text rides in via active_generation."""
    from app.services.dialectical_v2 import render_v2_job_prompt

    monkeypatch.setenv("DIALECTICAL_HIERARCHICAL_SYNTHESIS", "true")
    debate, root = _v2_debate_with_deep_scored_tree(db, node_count=40)
    job = _v2_synthesize_job(db, debate)

    _system, rendered = render_v2_job_prompt(db, job)

    assert '"load_bearing"' in rendered
    assert '"omitted_count"' in rendered
    assert '"active_generation"' not in rendered
