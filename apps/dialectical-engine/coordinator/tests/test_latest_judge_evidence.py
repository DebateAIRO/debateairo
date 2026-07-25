"""FW2 Part A: which judge panel ``latest_judge_evidence_for_node`` resolves.

The function exists for exactly ONE job -- resolving WHICH ``input_hash`` a
node was most recently judged on -- and until this module existed nothing
tested that job. Every other fixture in the suite seeds exactly one
``input_hash`` per node, so the resolution branch was unreachable and a
mutation inverting the ``.desc()`` to ``.asc()`` (i.e. reading the OLDEST
panel) left the whole suite green.

It matters because both frontier consumers read through it:
``expansion_dispatch._score_items_by_node`` (which node the wave spends on)
and ``branch_summary._rank_and_cap_contested`` (which node reaches the
synthesiser). A node re-judged after a rescore is rare today; once adaptive
expansion spawns rescores across 12 waves it is the normal case, because each
spawn invalidates its parent's judge input hash.
"""
from __future__ import annotations

import hashlib
from datetime import timedelta

import pytest
from sqlalchemy import select

from app.models.entities import (
    AnalyzerRun,
    Debate,
    JudgeOutputArtifact,
    Node,
    next_analyzer_run_seq,
    now_utc,
)
from app.scoring.service import latest_judge_evidence_for_node
from app.services.dialectical_v2 import first_branch


def _seed_panel(
    db,
    debate: Debate,
    node: Node,
    *,
    input_hash: str,
    logical_validity: float,
    created_at,
    make_judge_evidence,
    analyzer_run_id: str | None = None,
    artifact_id: str | None = None,
) -> None:
    """One persisted judge panel for `node` under `input_hash`.

    Two families, the way production persists a panel (one artifact each,
    same input_hash, distinct (judge_role, provider, model) identities), so
    the resolved panel is a real multi-judge read rather than a single row.
    """
    for index, judge_role in enumerate(("critic", "critic_b")):
        evidence = make_judge_evidence(judge_role=judge_role, logical_validity=logical_validity)
        raw_output = f"{input_hash}:{judge_role}:{logical_validity}"
        # Explicit ids only when the caller pins them, because the same-tick
        # test below needs to control the (random UUID4) `id` tiebreak. Left
        # unset otherwise so the column default supplies a real UUID.
        pinned = {"id": f"{artifact_id}-{index}"} if artifact_id else {}
        db.add(
            JudgeOutputArtifact(
                **pinned,
                debate_id=debate.id,
                node_id=node.id,
                analyzer_run_id=analyzer_run_id,
                input_hash=input_hash,
                judge_role=evidence["judge_role"],
                provider=evidence["provider"],
                model=evidence["model"],
                raw_output=raw_output,
                raw_output_sha256=hashlib.sha256(raw_output.encode("utf-8")).hexdigest(),
                parse_status="available",
                assessment=evidence["assessment"],
                checked_at=created_at,
                created_at=created_at,
            )
        )
    db.flush()


def _scoring_run(db, debate: Debate, *, created_at) -> AnalyzerRun:
    """A complete node_scoring run whose `seq` orders it against its peers.

    Provenance deliberately carries no `job_id`, so the AnalyzerRun
    after_insert listener (_link_judge_artifacts_to_analyzer_run) links
    nothing -- these tests attach artifacts to runs explicitly, and an
    implicit re-link would silently rewrite the very association under test.
    """
    run = AnalyzerRun(
        debate_id=debate.id,
        branch_id=first_branch(db, debate.id).id,
        analyzer_type="node_scoring",
        output={"status": "available", "items": []},
        status="complete",
        provenance={"scoring_source": "judge_outputs"},
        created_at=created_at,
    )
    next_analyzer_run_seq(db, run)
    return run


def _validity(evidence: list[dict]) -> set[float]:
    return {e["assessment"]["critic"]["logical_validity"] for e in evidence}


@pytest.fixture()
def scored_node(db):
    """A real v2 debate and one of its complete argument nodes."""
    from test_v2_expand import codex_worker, make_v2_debate

    debate = make_v2_debate(db, codex_worker(db))
    node = db.scalars(
        select(Node)
        .where(
            Node.debate_id == debate.id,
            Node.node_type.in_(("PRO", "CON")),
            Node.status == "complete",
        )
        .order_by(Node.materialized_path.asc(), Node.id.asc())
    ).first()
    assert node is not None
    return debate, node


def test_two_input_hashes_resolve_to_the_newer_panel(db, scored_node, make_judge_evidence):
    """The branch the function exists for, and the one the suite never had.

    Older panel judged the node at 0.20; a rescore re-judged it at 0.80 under
    a NEW input_hash (which is what a spawn produces -- children are part of
    the hash, app/scoring/service.py:349). The frontier must rank on 0.80.
    Inverting the ordering to `.asc()` returns {0.20} and fails here.
    """
    debate, node = scored_node
    older = now_utc() - timedelta(minutes=5)
    _seed_panel(
        db,
        debate,
        node,
        input_hash="input-hash-older",
        logical_validity=0.20,
        created_at=older,
        make_judge_evidence=make_judge_evidence,
    )
    _seed_panel(
        db,
        debate,
        node,
        input_hash="input-hash-newer",
        logical_validity=0.80,
        created_at=now_utc(),
        make_judge_evidence=make_judge_evidence,
    )
    db.commit()

    evidence = latest_judge_evidence_for_node(db, debate_id=debate.id, node_id=node.id)

    assert len(evidence) == 2
    assert _validity(evidence) == {0.80}


def test_same_tick_rejudge_resolves_by_analyzer_run_seq(db, scored_node, make_judge_evidence):
    """The determinism fix: a same-tick re-judge is ordered by the producing
    run's `seq`, not by a random UUID4.

    `created_at` is deliberately IDENTICAL on both panels -- routine on a
    same-tick re-judge, and the exact case the docstring's (created_at, id)
    ordering could not resolve. The artifact ids are pinned so `id DESC`
    actively prefers the WRONG (older) panel: without the seq tiebreak this
    test fails every run rather than about one run in two.
    """
    debate, node = scored_node
    tick = now_utc()
    older_run = _scoring_run(db, debate, created_at=tick)
    newer_run = _scoring_run(db, debate, created_at=tick)
    assert newer_run.seq > older_run.seq
    db.commit()

    _seed_panel(
        db,
        debate,
        node,
        input_hash="input-hash-older",
        logical_validity=0.20,
        created_at=tick,
        make_judge_evidence=make_judge_evidence,
        analyzer_run_id=older_run.id,
        artifact_id="zzzz-older-artifact",
    )
    _seed_panel(
        db,
        debate,
        node,
        input_hash="input-hash-newer",
        logical_validity=0.80,
        created_at=tick,
        make_judge_evidence=make_judge_evidence,
        analyzer_run_id=newer_run.id,
        artifact_id="aaaa-newer-artifact",
    )
    db.commit()

    evidence = latest_judge_evidence_for_node(db, debate_id=debate.id, node_id=node.id)

    assert _validity(evidence) == {0.80}


def test_created_at_still_outranks_a_lower_seq_run(db, scored_node, make_judge_evidence):
    """`seq` is a TIEBREAK, not the primary key -- pinned so the fix cannot
    silently re-order panels that `created_at` already separates.

    A cache-hit re-stamp relinks an OLD artifact (old created_at) to a NEW
    run, so seq-primary ordering would change which panel wins in a case the
    pre-fix code answered correctly. This asserts the wall clock still leads.
    """
    debate, node = scored_node
    newer_run = _scoring_run(db, debate, created_at=now_utc())
    older_run = _scoring_run(db, debate, created_at=now_utc())
    assert older_run.seq > newer_run.seq  # seq disagrees with the wall clock
    db.commit()

    _seed_panel(
        db,
        debate,
        node,
        input_hash="input-hash-older",
        logical_validity=0.20,
        created_at=now_utc() - timedelta(minutes=5),
        make_judge_evidence=make_judge_evidence,
        analyzer_run_id=older_run.id,
    )
    _seed_panel(
        db,
        debate,
        node,
        input_hash="input-hash-newer",
        logical_validity=0.80,
        created_at=now_utc(),
        make_judge_evidence=make_judge_evidence,
        analyzer_run_id=newer_run.id,
    )
    db.commit()

    evidence = latest_judge_evidence_for_node(db, debate_id=debate.id, node_id=node.id)

    assert _validity(evidence) == {0.80}


def test_never_judged_node_yields_no_fabricated_panel(db, scored_node):
    debate, node = scored_node

    assert latest_judge_evidence_for_node(db, debate_id=debate.id, node_id=node.id) == []
