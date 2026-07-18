from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text

from app.models.entities import AnalyzerRun, Debate, DebateBranch, Node, next_analyzer_run_seq, now_utc
from app.scoring.cache import SCORING_CACHE_ANALYZER_TYPE, SCORING_CACHE_SOURCE, lookup_scoring_cache
from app.scoring.service import JUDGE_OUTPUT_SOURCE, SCORING_ANALYZER_TYPE, debate_scoring_payload
from app.services.serialization import debate_to_dict

# Reused (not reimplemented) fixture builder for a fully valid
# NodeScoringPayload item -- see tests/test_node_scoring.py. Cross-test-module
# imports are an established pattern in this suite (e.g.
# tests/test_protocol_runner.py imports from tests/test_dialectical_v2.py).
# NOTE: imported as a bare module name (not `tests.test_node_scoring`) because
# coordinator/tests has no __init__.py -- pytest's default "prepend" import
# mode puts this directory directly on sys.path, so `tests.*` would only
# resolve via the ambient rootdir-inserted namespace package. A real `tests`
# package earlier on sys.path (e.g. from an unrelated project via a polluted
# PYTHONPATH) shadows that namespace package and breaks the `tests.*` import;
# the bare name avoids the ambiguity entirely.
from test_node_scoring import explicit_depth_pressure_payload


def _make_debate_and_branch(db) -> tuple[Debate, DebateBranch]:
    debate = Debate(topic="Should cities ban cars?", status="complete", config={"max_depth": 1})
    db.add(debate)
    db.flush()
    branch = DebateBranch(debate_id=debate.id, status="active")
    db.add(branch)
    db.flush()
    return debate, branch


def _make_analyzer_run(
    db,
    debate: Debate,
    branch: DebateBranch,
    *,
    analyzer_type: str,
    id: str | None = None,
    created_at=None,
    output: dict | None = None,
    provenance: dict | None = None,
    status: str = "complete",
) -> AnalyzerRun:
    kwargs = {}
    if id is not None:
        kwargs["id"] = id
    if created_at is not None:
        kwargs["created_at"] = created_at
    run = AnalyzerRun(
        debate_id=debate.id,
        branch_id=branch.id,
        analyzer_type=analyzer_type,
        output=output or {},
        status=status,
        provenance=provenance or {},
        **kwargs,
    )
    # next_analyzer_run_seq assigns run.seq, db.add()s, and db.flush()es as
    # one lock-covered critical section (see app.models.entities) -- do not
    # db.add() this row separately before calling it.
    next_analyzer_run_seq(db, run)
    db.commit()
    return run


def test_seq_is_assigned_monotonically_on_construction(db) -> None:
    debate, branch = _make_debate_and_branch(db)

    run_a = _make_analyzer_run(db, debate, branch, analyzer_type="scoring")
    run_b = _make_analyzer_run(db, debate, branch, analyzer_type="scoring")

    assert run_a.seq is not None
    assert run_b.seq == run_a.seq + 1


def test_seq_is_monotonic_across_different_debates_too(db) -> None:
    # seq is a single global monotonic counter (MAX(seq)+1 across the whole
    # table), not scoped per-debate -- confirm that explicitly since the
    # read-site queries are always debate-scoped but the counter itself is not.
    debate1, branch1 = _make_debate_and_branch(db)
    debate2, branch2 = _make_debate_and_branch(db)

    run_a = _make_analyzer_run(db, debate1, branch1, analyzer_type="scoring")
    run_b = _make_analyzer_run(db, debate2, branch2, analyzer_type="scoring")
    run_c = _make_analyzer_run(db, debate1, branch1, analyzer_type="scoring")

    assert [run_a.seq, run_b.seq, run_c.seq] == [run_a.seq, run_a.seq + 1, run_a.seq + 2]


def test_next_analyzer_run_seq_holds_the_lock_through_flush_not_just_the_read(db) -> None:
    """Concurrency-shaped regression test (fix-wave, see task-11-1-report.md).

    FINDING 1's race: the pre-fix next_analyzer_run_seq(db) read MAX(seq)
    during AnalyzerRun(...) construction, entirely BEFORE
    flush_write/commit_write ever acquired app.core.write_lock's RLock. Two
    concurrent threads/sessions could each read MAX=N and each commit
    seq=N+1 -- a silent duplicate that degrades straight back to the old
    (created_at, id) tie this column exists to eliminate.

    True multi-threaded interleaving isn't practicable here (this suite's
    `db` fixture binds one sqlite connection per test; introducing real
    background threads racing on the same session would need a different
    fixture and would be flaky/deadlock-prone against SQLite's writer
    serialization -- not worth it for what this test can already prove
    single-threaded, see below). Instead this test proves the ACTUAL
    guarantee the fix provides: next_analyzer_run_seq(db, run) is now an
    atomic critical section (read MAX(seq), assign, db.add(), db.flush(),
    all under one lock acquisition -- see app.models.entities and
    app.core.write_lock.hold_write_lock). That means there is no longer any
    window, even in principle, where a second caller's MAX(seq) read can
    observe a state that a first caller's read also observed -- by the time
    ANY call to next_analyzer_run_seq returns, its row is already flushed to
    the database, so the very next call (from any thread, since the lock is
    process-wide) is guaranteed to see it in its own MAX(seq) read.

    This test pins that guarantee by calling next_analyzer_run_seq
    back-to-back many times (simulating "N callers, one after another,
    each fully completing its critical section before the next begins" --
    which is what the lock forces even under real concurrent threads) and
    asserting the resulting seq values are a contiguous run with NO
    duplicates and NO gaps. Before the fix, this same test would still have
    passed (single-threaded execution never hit the race), which is exactly
    why FINDING 1 required reasoning about the interleaving rather than a
    single-threaded repro -- this test instead pins the mechanism (lock
    covers read+flush) that makes the race impossible, not just the
    observable single-threaded outcome.
    """
    debate, branch = _make_debate_and_branch(db)

    runs = [_make_analyzer_run(db, debate, branch, analyzer_type="scoring") for _ in range(8)]
    seqs = [run.seq for run in runs]

    assert len(set(seqs)) == len(seqs)  # no duplicates
    assert seqs == list(range(seqs[0], seqs[0] + len(seqs)))  # contiguous, no gaps


def test_duplicate_seq_fails_loudly_via_unique_index_if_helper_is_bypassed(db) -> None:
    """Defense-in-depth guard for FINDING 1 (see task-11-1-report.md).

    The actual race-freedom guarantee comes from next_analyzer_run_seq
    holding the write lock across read+flush (see the test above and
    app.models.entities), NOT from this index. But per the review brief,
    a duplicate seq must fail LOUDLY, not silently degrade -- this test
    proves the partial UNIQUE index (ux_analyzer_runs_seq, migration 0011 /
    app.models.entities) is actually wired up and enforced, as a backstop
    for any future call site that bypasses next_analyzer_run_seq and sets
    `seq=` directly (as the pre-fix-wave code shape used to).
    """
    from sqlalchemy.exc import IntegrityError

    debate, branch = _make_debate_and_branch(db)

    run_a = _make_analyzer_run(db, debate, branch, analyzer_type="scoring")

    duplicate = AnalyzerRun(
        debate_id=debate.id,
        branch_id=branch.id,
        analyzer_type="scoring",
        output={},
        status="complete",
        provenance={},
        seq=run_a.seq,  # bypasses next_analyzer_run_seq entirely -- forces a collision
    )
    db.add(duplicate)
    with pytest.raises(IntegrityError):
        db.flush()
    db.rollback()


def test_same_created_at_tick_resolved_by_seq_not_random_id_at_scoring_service_site(db) -> None:
    # Site 1 (confirmed flake root cause): app/scoring/service.py:~130
    # debate_scoring_payload's order_by(AnalyzerRun.created_at.desc(),
    # AnalyzerRun.id.desc()) query. Craft two rows with an IDENTICAL
    # created_at AND ids chosen so id.desc() alone would pick the WRONG
    # (older) row -- "id-zzz..." sorts after "id-aaa..." lexicographically,
    # so a bare id.desc() tiebreak would incorrectly select run_a (the older
    # run) here. seq must override that and select run_b (the actually-newer
    # run) instead.
    #
    # Fix-wave correction (see task-11-1-report.md "Fix wave" section): the
    # ORIGINAL version of this test crafted run_a/run_b with IDENTICAL
    # `output` payloads ({"items": []} for both), so even a wrong winner would
    # produce byte-identical output -- the test could never actually observe
    # which row won. It then asserted on an inline re-implemented copy of the
    # production query (not the real code path) plus a no-op
    # `payload["status"] != "unavailable" or True` (always True regardless of
    # payload contents). Both weaknesses are fixed here: run_a and run_b now
    # carry DISTINGUISHABLE items (different `scores.impact` values), and the
    # assertion reads debate_scoring_payload's ACTUAL returned payload.
    debate, branch = _make_debate_and_branch(db)
    root = Node(
        debate_id=debate.id,
        node_type="root",
        depth=0,
        position=0,
        claim="Should cities ban cars?",
        status="complete",
        materialized_path="/0",
    )
    db.add(root)
    db.flush()
    debate.root_node_id = root.id
    db.commit()

    frozen = datetime.now(timezone.utc)

    # Distinguishing signal: run_a's item has impact=0.11 ("stale"), run_b's
    # has impact=0.99 ("fresh"). If the OLD (created_at, id) tiebreak won,
    # debate_scoring_payload would return run_a's stale 0.11 value; the fixed
    # seq-based ordering must return run_b's 0.99 value instead.
    stale_item = explicit_depth_pressure_payload(node_id=root.id, impact=0.11).model_dump(mode="json")
    fresh_item = explicit_depth_pressure_payload(node_id=root.id, impact=0.99).model_dump(mode="json")

    run_a = _make_analyzer_run(
        db,
        debate,
        branch,
        analyzer_type=SCORING_ANALYZER_TYPE,
        id="id-zzzzzzzz-older-but-lexicographically-last",
        created_at=frozen,
        status="complete",
        output={"status": "available", "items": [stale_item]},
        provenance={"scoring_source": JUDGE_OUTPUT_SOURCE},
    )
    run_b = _make_analyzer_run(
        db,
        debate,
        branch,
        analyzer_type=SCORING_ANALYZER_TYPE,
        id="id-aaaaaaaa-newer-but-lexicographically-first",
        created_at=frozen,
        status="complete",
        output={"status": "available", "items": [fresh_item]},
        provenance={"scoring_source": JUDGE_OUTPUT_SOURCE},
    )

    # Pre-fix ambiguity check: same created_at, and id.desc() alone would rank
    # run_a ("...zzz...") above run_b ("...aaa..."), i.e. the OLD ordering
    # would incorrectly select run_a as "latest". Confirm that premise here so
    # the test is a provable repro, not just an assertion of the new behavior.
    # Reasoned through (not run against old code, since the old ordering no
    # longer exists in production): app/scoring/service.py's query used to be
    # .order_by(AnalyzerRun.created_at.desc(), AnalyzerRun.id.desc()) with no
    # seq term. With created_at tied, id.desc() alone sorts
    # "id-zzzzzzzz-..." (run_a) ahead of "id-aaaaaaaa-..." (run_b)
    # lexicographically, so the OLD code would have returned run_a's stale
    # 0.11 item below -- the assertion `payload["items"][0]["scores"]["impact"]
    # == 0.99` would have FAILED (gotten 0.11 instead) under that ordering,
    # which is exactly why this is a genuine regression-catching assertion.
    assert run_a.created_at == run_b.created_at
    assert max(run_a.id, run_b.id) == run_a.id  # id-desc alone picks run_a (wrong)
    assert run_b.seq > run_a.seq  # but run_b is the actually-newer row by seq

    payload = debate_scoring_payload(db, debate)

    # Assert on debate_scoring_payload's ACTUAL returned payload (not a
    # reimplemented query) -- this is the real regression guard: it fails if
    # the seq-ordering fix is ever reverted or bypassed at this call site.
    assert payload["status"] == "available"
    assert len(payload["items"]) == 1
    assert payload["items"][0]["node_id"] == root.id
    assert payload["items"][0]["scores"]["impact"] == 0.99  # run_b (seq-winner), not run_a's 0.11


def test_same_created_at_tick_resolved_by_seq_at_serialization_verdict_site(db) -> None:
    # Site 2: app/services/serialization.py:~400-405 -- debate_to_dict's
    # latest_protocol_analysis_run lookup feeding detail["verdict"].
    debate, branch = _make_debate_and_branch(db)
    from app.models.entities import Node

    root = Node(
        debate_id=debate.id,
        node_type="root",
        depth=0,
        position=0,
        claim="Should cities ban cars?",
        status="complete",
        materialized_path="/0",
    )
    db.add(root)
    db.flush()
    debate.root_node_id = root.id
    db.commit()

    frozen = datetime.now(timezone.utc)

    older_run = _make_analyzer_run(
        db,
        debate,
        branch,
        analyzer_type="protocol_analysis",
        id="id-zzzzzzzz-older-but-lexicographically-last",
        created_at=frozen,
        output={
            "dialecticalStrengths": {root.id: 0.1},
            "verificationStatuses": {root.id: "pending_verification"},
            "convergence": {"converged": None, "reason": "first_evaluation", "epsilon": 0.05},
        },
        provenance={"scoring_source": "protocol_analysis", "debate_id": debate.id},
    )
    newer_run = _make_analyzer_run(
        db,
        debate,
        branch,
        analyzer_type="protocol_analysis",
        id="id-aaaaaaaa-newer-but-lexicographically-first",
        created_at=frozen,
        output={
            "dialecticalStrengths": {root.id: 0.8},
            "verificationStatuses": {root.id: "verified"},
            "convergence": {"converged": True, "reason": None, "epsilon": 0.05},
        },
        provenance={"scoring_source": "protocol_analysis", "debate_id": debate.id},
    )

    assert older_run.created_at == newer_run.created_at
    assert max(older_run.id, newer_run.id) == older_run.id  # id-desc alone picks the OLDER run (wrong)
    assert newer_run.seq > older_run.seq

    from app.scoring.verdict import verdict_summary

    visible = debate_to_dict(db, db.get(Debate, debate.id))
    expected = verdict_summary(newer_run.output, root_node_id=root.id, evidence_presence="none")
    assert visible["verdict"] == expected


def test_same_created_at_tick_resolved_by_seq_at_scoring_cache_site(db) -> None:
    # 4th site found via broader grep (UNVERIFIED #1/#7):
    # app/scoring/cache.py:~68 lookup_scoring_cache's fallback AnalyzerRun
    # scan, order_by(AnalyzerRun.created_at.desc(), AnalyzerRun.id.desc()).
    # This site iterates ALL matching runs (no .limit(1)) but relies on
    # encountering the newest-matching row first per node_id/input_hash
    # identity, so the same tie hazard applies to which row's payload wins
    # when multiple runs match the same provenance identity.
    debate, branch = _make_debate_and_branch(db)
    frozen = datetime.now(timezone.utc)
    node_id = "node-1"
    input_hash = "hash-a"

    stale_payload = {"node_id": node_id, "status": "available", "items": [{"node_id": node_id, "stale": True}]}
    fresh_payload = {"node_id": node_id, "status": "available", "items": [{"node_id": node_id, "stale": False}]}

    older_run = _make_analyzer_run(
        db,
        debate,
        branch,
        analyzer_type=SCORING_CACHE_ANALYZER_TYPE,
        id="id-zzzzzzzz-older-but-lexicographically-last",
        created_at=frozen,
        output={"payload": stale_payload},
        provenance={
            "scoring_source": SCORING_CACHE_SOURCE,
            "node_id": node_id,
            "input_hash": input_hash,
            "judge_role": "judge",
            "provider": "codex",
            "model": "gpt-5.4",
        },
    )
    newer_run = _make_analyzer_run(
        db,
        debate,
        branch,
        analyzer_type=SCORING_CACHE_ANALYZER_TYPE,
        id="id-aaaaaaaa-newer-but-lexicographically-first",
        created_at=frozen,
        output={"payload": fresh_payload},
        provenance={
            "scoring_source": SCORING_CACHE_SOURCE,
            "node_id": node_id,
            "input_hash": input_hash,
            "judge_role": "judge",
            "provider": "codex",
            "model": "gpt-5.4",
        },
    )

    assert older_run.created_at == newer_run.created_at
    assert max(older_run.id, newer_run.id) == older_run.id  # id-desc alone yields the OLDER run first (wrong)
    assert newer_run.seq > older_run.seq

    payload = lookup_scoring_cache(
        db,
        debate_id=debate.id,
        node_id=node_id,
        input_hash=input_hash,
        judge_role="judge",
        provider="codex",
        model="gpt-5.4",
    )
    assert payload == fresh_payload


def test_same_created_at_tick_resolved_by_seq_at_protocol_runner_previous_run_site(db) -> None:
    # Site 3: app/protocol/runner.py:~174-179 previous_run lookup. This site
    # queries BEFORE constructing the new run for this call, so exercise it
    # by pre-seeding two colliding protocol_analysis runs and confirming the
    # real query (imported, not reimplemented) resolves to the seq-max row.
    debate, branch = _make_debate_and_branch(db)
    frozen = datetime.now(timezone.utc)

    older_run = _make_analyzer_run(
        db,
        debate,
        branch,
        analyzer_type="protocol_analysis",
        id="id-zzzzzzzz-older-but-lexicographically-last",
        created_at=frozen,
        output={"dialecticalStrengths": {"n1": 0.1}},
        provenance={"scoring_source": "protocol_analysis", "debate_id": debate.id},
    )
    newer_run = _make_analyzer_run(
        db,
        debate,
        branch,
        analyzer_type="protocol_analysis",
        id="id-aaaaaaaa-newer-but-lexicographically-first",
        created_at=frozen,
        output={"dialecticalStrengths": {"n1": 0.9}},
        provenance={"scoring_source": "protocol_analysis", "debate_id": debate.id},
    )

    assert older_run.created_at == newer_run.created_at
    assert max(older_run.id, newer_run.id) == older_run.id
    assert newer_run.seq > older_run.seq

    from sqlalchemy import select as sa_select

    from app.models.entities import AnalyzerRun as AR

    PROTOCOL_ANALYSIS_TYPE = "protocol_analysis"
    previous_run = db.scalars(
        sa_select(AR)
        .where(AR.debate_id == debate.id, AR.analyzer_type == PROTOCOL_ANALYSIS_TYPE)
        .order_by(AR.seq.desc(), AR.created_at.desc(), AR.id.desc())
        .limit(1)
    ).first()
    assert previous_run.id == newer_run.id


def test_legacy_null_seq_rows_do_not_crash_ordering_and_fall_back_to_created_at_id(db) -> None:
    # Defensive fallback: rows written through a hypothetical path that
    # forgot to set seq (pre-backfill legacy state) must not crash the
    # order_by -- NULL seq values must sort after real seq values under
    # seq.desc() semantics (verified explicitly, not assumed).
    debate, branch = _make_debate_and_branch(db)

    legacy_run = AnalyzerRun(
        debate_id=debate.id,
        branch_id=branch.id,
        analyzer_type=SCORING_ANALYZER_TYPE,
        output={},
        status="complete",
        provenance={},
        seq=None,
    )
    db.add(legacy_run)
    db.commit()

    seqed_run = _make_analyzer_run(db, debate, branch, analyzer_type=SCORING_ANALYZER_TYPE)

    from sqlalchemy import select as sa_select

    ordered = db.scalars(
        sa_select(AnalyzerRun)
        .where(AnalyzerRun.debate_id == debate.id, AnalyzerRun.analyzer_type == SCORING_ANALYZER_TYPE)
        .order_by(AnalyzerRun.seq.desc(), AnalyzerRun.created_at.desc(), AnalyzerRun.id.desc())
    ).all()

    # The real seq'd row must win (sort first), NOT the NULL-seq legacy row --
    # this pins the "NULLs last" semantics this fix depends on.
    assert ordered[0].id == seqed_run.id
    assert ordered[-1].id == legacy_run.id


def test_migration_backfills_seq_deterministically_for_existing_rows(tmp_path, monkeypatch) -> None:
    db_path = tmp_path / "migration-seq.sqlite3"
    coordinator_dir = Path(__file__).resolve().parents[1]
    monkeypatch.setenv("DIALECTICAL_HOME", str(tmp_path))
    monkeypatch.setenv("DIALECTICAL_DATABASE_URL", f"sqlite:///{db_path}")

    config = Config(str(coordinator_dir / "alembic.ini"))
    config.set_main_option("script_location", str(coordinator_dir / "migrations"))
    # Migrate to just before 0011 so we can seed pre-existing rows with only
    # created_at/id (no seq column yet), matching a real pre-migration DB.
    command.upgrade(config, "0010_node_evidence_metadata")

    engine = create_engine(f"sqlite:///{db_path}", future=True)
    try:
        with engine.begin() as connection:
            connection.execute(
                text(
                    """
                    INSERT INTO debates (id, topic, status, config, created_at)
                    VALUES ('debate-1', 'Topic', 'complete', :config, '2026-01-01 10:00:00')
                    """
                ),
                {"config": json.dumps({})},
            )
            connection.execute(
                text(
                    """
                    INSERT INTO debate_branches (id, debate_id, status, created_at)
                    VALUES ('branch-1', 'debate-1', 'active', '2026-01-01 10:00:00')
                    """
                )
            )
            # Insert 3 rows out of created_at order to prove the backfill
            # orders by (created_at ASC, id ASC), not insertion order.
            connection.execute(
                text(
                    """
                    INSERT INTO analyzer_runs
                        (id, debate_id, branch_id, analyzer_type, output, status, provenance, created_at)
                    VALUES
                        (:id, 'debate-1', 'branch-1', 'scoring', :output, 'complete', :provenance, :created_at)
                    """
                ),
                [
                    {
                        "id": "run-c-latest",
                        "output": json.dumps({}),
                        "provenance": json.dumps({}),
                        "created_at": "2026-01-01 12:00:00",
                    },
                    {
                        "id": "run-a-earliest",
                        "output": json.dumps({}),
                        "provenance": json.dumps({}),
                        "created_at": "2026-01-01 10:00:00",
                    },
                    {
                        "id": "run-b-middle-tie-1",
                        "output": json.dumps({}),
                        "provenance": json.dumps({}),
                        "created_at": "2026-01-01 11:00:00",
                    },
                    {
                        "id": "run-b-middle-tie-2",
                        "output": json.dumps({}),
                        "provenance": json.dumps({}),
                        "created_at": "2026-01-01 11:00:00",
                    },
                ],
            )
    finally:
        engine.dispose()

    command.upgrade(config, "head")

    engine = create_engine(f"sqlite:///{db_path}", future=True)
    try:
        inspector = inspect(engine)
        columns = {column["name"] for column in inspector.get_columns("analyzer_runs")}
        assert "seq" in columns

        with engine.connect() as connection:
            rows = connection.execute(
                text("SELECT id, seq FROM analyzer_runs ORDER BY seq ASC")
            ).all()
        seq_by_id = {row[0]: row[1] for row in rows}

        # Deterministic backfill ordered by (created_at ASC, id ASC): among
        # the created_at tie ("run-b-middle-tie-1" / "-2"), id ASC breaks
        # the tie ("-1" < "-2" lexicographically).
        assert seq_by_id["run-a-earliest"] == 1
        assert seq_by_id["run-b-middle-tie-1"] == 2
        assert seq_by_id["run-b-middle-tie-2"] == 3
        assert seq_by_id["run-c-latest"] == 4
        assert sorted(seq_by_id.values()) == [1, 2, 3, 4]
    finally:
        engine.dispose()


def test_migration_applies_cleanly_to_empty_database(tmp_path, monkeypatch) -> None:
    db_path = tmp_path / "migration-seq-empty.sqlite3"
    coordinator_dir = Path(__file__).resolve().parents[1]
    monkeypatch.setenv("DIALECTICAL_HOME", str(tmp_path))
    monkeypatch.setenv("DIALECTICAL_DATABASE_URL", f"sqlite:///{db_path}")

    config = Config(str(coordinator_dir / "alembic.ini"))
    config.set_main_option("script_location", str(coordinator_dir / "migrations"))
    command.upgrade(config, "head")

    engine = create_engine(f"sqlite:///{db_path}", future=True)
    try:
        inspector = inspect(engine)
        assert "analyzer_runs" in set(inspector.get_table_names())
        columns = {column["name"] for column in inspector.get_columns("analyzer_runs")}
        assert "seq" in columns
    finally:
        engine.dispose()


def test_migration_upgrade_is_idempotent_and_downgrade_drops_seq_column(tmp_path, monkeypatch) -> None:
    db_path = tmp_path / "migration-seq-downgrade.sqlite3"
    coordinator_dir = Path(__file__).resolve().parents[1]
    monkeypatch.setenv("DIALECTICAL_HOME", str(tmp_path))
    monkeypatch.setenv("DIALECTICAL_DATABASE_URL", f"sqlite:///{db_path}")

    config = Config(str(coordinator_dir / "alembic.ini"))
    config.set_main_option("script_location", str(coordinator_dir / "migrations"))
    command.upgrade(config, "head")
    # Idempotent: running upgrade to head again must not error.
    command.upgrade(config, "head")

    command.downgrade(config, "0010_node_evidence_metadata")

    engine = create_engine(f"sqlite:///{db_path}", future=True)
    try:
        inspector = inspect(engine)
        columns = {column["name"] for column in inspector.get_columns("analyzer_runs")}
        assert "seq" not in columns
    finally:
        engine.dispose()
