"""Task 17 (P5): benchmark harness tests.

Covers scripts/benchmark/{suite-v1.json,runner.py,report.py} per the task
brief: suite schema validation, metric SQL functions against a fixture DB
built with the coordinator's own SQLAlchemy models, report generation
(golden test), --dry-run smoke with a fake HTTP transport, and spend-cap
stop logic. NO live coordinator/LLM/network anywhere in this file, and no
--panel code path is exercised (brief: "NO panel code runs in tests").

runner.py/report.py are loaded via importlib from their file path (same
pattern as test_subscription_loop.py's `load_module`) since scripts/ is not
a package.
"""
from __future__ import annotations

import importlib.util
import json
import sqlite3
from pathlib import Path

import httpx
import pytest
from sqlalchemy import select

from app.models.entities import (
    AnalyzerRun,
    Debate,
    Generation,
    Job,
    JobTransition,
    JudgeOutputArtifact,
    Node,
    Worker,
    now_utc,
)
from app.core.db import engine


ROOT = Path(__file__).resolve().parents[2]
BENCHMARK_DIR = ROOT / "scripts" / "benchmark"
SUITE_PATH = BENCHMARK_DIR / "cases" / "suite-v1.json"


def load_module(name: str, relative_path: str):
    path = BENCHMARK_DIR / relative_path
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture()
def runner():
    return load_module("benchmark_runner", "runner.py")


@pytest.fixture()
def report():
    return load_module("benchmark_report", "report.py")


# ---------------------------------------------------------------------------
# Suite schema validation
# ---------------------------------------------------------------------------


def test_suite_file_is_valid_json_with_25_cases_in_the_specified_category_split(runner):
    suite = runner.load_suite(SUITE_PATH)
    errors = runner.validate_suite(suite)
    assert errors == []
    cases = suite["cases"]
    assert len(cases) == 25
    counts: dict[str, int] = {}
    for case in cases:
        counts[case["category"]] = counts.get(case["category"], 0) + 1
    assert counts == {"ground_truth_true": 8, "ground_truth_false": 8, "contested_normative": 9}


def test_suite_has_at_least_three_false_premise_traps(runner):
    suite = runner.load_suite(SUITE_PATH)
    traps = [case for case in suite["cases"] if case["is_trap"]]
    assert len(traps) >= 3
    assert all(case["category"] == "ground_truth_false" for case in traps)


def test_suite_case_ids_are_unique(runner):
    suite = runner.load_suite(SUITE_PATH)
    ids = [case["id"] for case in suite["cases"]]
    assert len(ids) == len(set(ids))


def test_validate_suite_rejects_missing_required_field(runner):
    suite = runner.load_suite(SUITE_PATH)
    broken = json.loads(json.dumps(suite))
    del broken["cases"][0]["ground_truth_notes"]
    errors = runner.validate_suite(broken)
    assert any("ground_truth_notes" in error for error in errors)


def test_validate_suite_rejects_bad_category_count(runner):
    suite = runner.load_suite(SUITE_PATH)
    broken = json.loads(json.dumps(suite))
    broken["cases"] = broken["cases"][1:]  # 24 cases now
    errors = runner.validate_suite(broken)
    assert any("25" in error or "count" in error.lower() for error in errors)


def test_validate_suite_rejects_inconsistent_expected_direction(runner):
    suite = runner.load_suite(SUITE_PATH)
    broken = json.loads(json.dumps(suite))
    broken["cases"][0]["expected_verdict_direction"] = "contested"  # was ground_truth_true -> supported
    errors = runner.validate_suite(broken)
    assert any(broken["cases"][0]["id"] in error for error in errors)


def test_validate_suite_rejects_duplicate_ids(runner):
    suite = runner.load_suite(SUITE_PATH)
    broken = json.loads(json.dumps(suite))
    broken["cases"][1]["id"] = broken["cases"][0]["id"]
    errors = runner.validate_suite(broken)
    assert any("duplicate" in error.lower() for error in errors)


def test_cases_from_suite_applies_limit(runner):
    suite = runner.load_suite(SUITE_PATH)
    limited = runner.cases_from_suite(suite, limit=3)
    assert [case["id"] for case in limited] == [case["id"] for case in suite["cases"][:3]]
    assert runner.cases_from_suite(suite, limit=None) == suite["cases"]


# ---------------------------------------------------------------------------
# Fixture DB (built with the coordinator's own SQLAlchemy models)
# ---------------------------------------------------------------------------


def _worker(db) -> Worker:
    worker = Worker(name="bench-worker", token_hash="x", capabilities=["gpt-5.6sol-medium"], status="online")
    db.add(worker)
    db.commit()
    return worker


def _debate_db_path() -> str:
    return str(engine.url.database)


def build_fixture_debate(db, *, with_evidence=True, with_scoring=True, with_verification=True, with_failover=True):
    """A small, realistic v2-shaped debate tree built directly through the
    ORM models (Debate/Node/Generation/Job/JobTransition/AnalyzerRun/
    JudgeOutputArtifact) -- no coordinator pipeline code invoked, matching
    the brief's "fixture DB built with the coordinator's own models"."""
    worker = _worker(db)
    debate = Debate(topic="Does X cause Y?", status="complete")
    db.add(debate)
    db.flush()
    root = Node(
        debate_id=debate.id,
        parent_id=None,
        node_type="ROOT_CLAIM",
        depth=0,
        position=0,
        claim="Does X cause Y?",
        status="complete",
        materialized_path="/0",
    )
    db.add(root)
    db.flush()
    debate.root_node_id = root.id

    branch_specs = [
        ("SCIENTIFIC_POV", "complete", "claude-sonnet-5-high-loop"),
        ("STATISTICAL_POV", "complete", "gpt-5.6sol-medium"),
        ("ETHICAL_POV", "failed", "grok-4.5-high-loop"),
    ]
    pro_nodes = []
    for position, (node_type, status, model_id) in enumerate(branch_specs):
        container = Node(
            debate_id=debate.id,
            parent_id=root.id,
            node_type=node_type,
            depth=1,
            position=position,
            claim=f"{node_type} lens",
            status=status,
            materialized_path=f"/0/{position}",
        )
        db.add(container)
        db.flush()
        gen = Generation(
            node_id=container.id,
            model_id=model_id,
            role="proposer",
            argument="lens argument",
            tokens_in=500,
            tokens_out=300,
            worker_id=worker.id,
        )
        db.add(gen)
        db.flush()
        container.active_generation_id = gen.id
        if status == "complete":
            pro = Node(
                debate_id=debate.id,
                parent_id=container.id,
                node_type="PRO",
                depth=2,
                position=0,
                claim="strongest pro",
                status="complete",
                materialized_path=f"/0/{position}/0",
            )
            db.add(pro)
            db.flush()
            pro_gen = Generation(
                node_id=pro.id, model_id=model_id, role="proposer", argument="pro", tokens_in=200, tokens_out=150, worker_id=worker.id
            )
            db.add(pro_gen)
            db.flush()
            pro.active_generation_id = pro_gen.id
            pro_nodes.append(pro)
            if with_evidence:
                evidence = Node(
                    debate_id=debate.id,
                    parent_id=pro.id,
                    node_type="EVIDENCE",
                    depth=3,
                    position=2000 + position,
                    claim="a study found a link",
                    status="complete",
                    materialized_path=f"/0/{position}/0/{2000 + position}",
                    evidence_metadata={
                        "evidenceKind": "empirical",
                        "method": "retrieval" if position == 0 else "model-claim",
                        "resolution_status": "resolved_quote_found" if position == 0 else None,
                        "url": "https://example.org/study" if position == 0 else None,
                        "retrieval_query": "does X cause Y" if position == 0 else None,
                    },
                )
                db.add(evidence)
    db.flush()

    if with_scoring:
        run = AnalyzerRun(
            debate_id=debate.id,
            branch_id=_first_branch_id(db, debate.id),
            analyzer_type="node_scoring",
            status="complete",
            output={
                "items": [
                    {"node_id": pro_nodes[0].id, "scores": {"strength": 0.9, "uncertainty": 0.1}},
                    {"node_id": pro_nodes[1].id, "scores": {"strength": 0.6, "uncertainty": 0.4}},
                ]
            },
        )
        db.add(run)
        db.flush()
        run.seq = 1
        protocol_run = AnalyzerRun(
            debate_id=debate.id,
            branch_id=_first_branch_id(db, debate.id),
            analyzer_type="protocol_analysis",
            status="complete",
            output={
                "dialecticalStrengths": {root.id: 0.72, pro_nodes[0].id: 0.9, pro_nodes[1].id: 0.6},
                "verificationStatuses": {root.id: "verified"},
                "tauCoverage": 0.8,
                "semanticsVersion": "v1",
                "convergence": {"converged": True},
                "claimTypes": {root.id: "causal"},
                "claimTypeSource": {root.id: "classifier"},
            },
        )
        db.add(protocol_run)
        db.flush()
        protocol_run.seq = 2
        db.add(
            JudgeOutputArtifact(
                debate_id=debate.id,
                node_id=pro_nodes[0].id,
                input_hash="hash-1",
                judge_role="judge",
                provider="codex",
                model="gpt-5.6sol-medium",
                request_metadata={},
                raw_output="{}",
                raw_output_sha256="abc",
                parse_status="available",
                assessment={},
            )
        )
        db.add(
            JudgeOutputArtifact(
                debate_id=debate.id,
                node_id=pro_nodes[1].id,
                input_hash="hash-2",
                judge_role="judge",
                provider="codex",
                model="gpt-5.6sol-medium",
                request_metadata={},
                raw_output="{}",
                raw_output_sha256="def",
                parse_status="available",
                assessment={},
            )
        )

    if with_verification:
        db.add(
            AnalyzerRun(
                debate_id=debate.id,
                branch_id=_first_branch_id(db, debate.id),
                analyzer_type="evidence_verification",
                status="complete",
                output={"status": "supported", "evidenceNodeId": "e1", "claimNodeId": pro_nodes[0].id},
            )
        )
        db.add(
            AnalyzerRun(
                debate_id=debate.id,
                branch_id=_first_branch_id(db, debate.id),
                analyzer_type="evidence_verification",
                status="complete",
                output={"status": "unverifiable", "evidenceNodeId": "e2", "claimNodeId": pro_nodes[1].id},
            )
        )

    job = Job(
        debate_id=debate.id,
        node_id=root.id,
        job_type="v2_pov",
        required_role="v2_pov",
        required_model="gpt-5.6sol-medium",
        status="failed",
    )
    db.add(job)
    db.flush()
    if with_failover:
        db.add(
            JobTransition(
                job_id=job.id,
                debate_id=debate.id,
                job_type="v2_pov",
                from_status="claimed",
                to_status="pending",
                reason="model failover",
                channel="failover",
            )
        )
    db.add(
        JobTransition(
            job_id=job.id,
            debate_id=debate.id,
            job_type="v2_pov",
            from_status=None,
            to_status="pending",
            channel="create",
        )
    )

    debate.completed_at = now_utc()
    db.commit()
    db.refresh(debate)
    return debate, pro_nodes


def _first_branch_id(db, debate_id: str) -> str:
    from app.models.entities import DebateBranch

    branch = db.scalars(select(DebateBranch).where(DebateBranch.debate_id == debate_id)).first()
    if branch is None:
        branch = DebateBranch(debate_id=debate_id, status="active")
        db.add(branch)
        db.flush()
    return branch.id


@pytest.fixture()
def fixture_conn(db, runner):
    """Builds the fixture debate via the ORM `db` session (shared conftest
    fixture, real on-disk sqlite file), commits, then opens a SEPARATE
    read-only connection via runner.open_readonly_db against that same file
    -- mirrors exactly how the real runner reads the DB after polling."""
    debate, pro_nodes = build_fixture_debate(db)
    conn = runner.open_readonly_db(_debate_db_path())
    yield conn, debate.id, pro_nodes
    conn.close()


def test_open_readonly_db_uses_a_read_only_file_uri_and_rejects_writes(runner, db):
    build_fixture_debate(db)
    conn = runner.open_readonly_db(_debate_db_path())
    try:
        # Sanity: it can read.
        row = conn.execute("SELECT COUNT(*) AS n FROM debates").fetchone()
        assert row["n"] >= 1
        # And it genuinely cannot write (proves mode=ro, not just app-level discipline).
        with pytest.raises(sqlite3.OperationalError):
            conn.execute("INSERT INTO debates (id, topic, status) VALUES ('x', 'x', 'draft')")
    finally:
        conn.close()


def test_branch_completion_counts_top_level_branch_containers(fixture_conn, runner):
    conn, debate_id, _pro_nodes = fixture_conn
    result = runner.branch_completion(conn, debate_id)
    assert result == {"completed": 2, "total": 3, "fraction": pytest.approx(2 / 3)}


def test_branch_completion_honest_none_fraction_when_no_branches(runner, db):
    debate = Debate(topic="empty", status="draft")
    db.add(debate)
    db.commit()
    conn = runner.open_readonly_db(_debate_db_path())
    try:
        result = runner.branch_completion(conn, debate.id)
    finally:
        conn.close()
    assert result == {"completed": 0, "total": 0, "fraction": None}


def test_completed_branch_model_families_dedupes_by_family_and_excludes_failed_branch(fixture_conn, runner):
    conn, debate_id, _pro_nodes = fixture_conn
    families = runner.completed_branch_model_families(conn, debate_id)
    # SCIENTIFIC_POV (claude, complete) + STATISTICAL_POV (gpt via codex substring, complete);
    # ETHICAL_POV (grok) is failed and must be excluded.
    assert families == ["claude", "gpt"]


def test_evidence_breakdown_counts_by_method_and_resolution_status(fixture_conn, runner):
    conn, debate_id, _pro_nodes = fixture_conn
    result = runner.evidence_breakdown(conn, debate_id)
    assert result["total"] == 2
    assert result["by_method"] == {"retrieval": 1, "model-claim": 1}
    assert result["by_resolution_status"] == {"resolved_quote_found": 1, "none": 1}


def test_evidence_breakdown_honest_zero_when_no_evidence_nodes(runner, db):
    debate, _ = build_fixture_debate(db, with_evidence=False)
    conn = runner.open_readonly_db(_debate_db_path())
    try:
        result = runner.evidence_breakdown(conn, debate.id)
    finally:
        conn.close()
    assert result == {"total": 0, "by_method": {}, "by_resolution_status": {}}


def test_verification_verdict_counts_groups_by_status(fixture_conn, runner):
    conn, debate_id, _pro_nodes = fixture_conn
    result = runner.verification_verdict_counts(conn, debate_id)
    assert result == {"supported": 1, "unverifiable": 1}


def test_score_distribution_computes_five_number_summary_for_strength_and_uncertainty(fixture_conn, runner):
    conn, debate_id, _pro_nodes = fixture_conn
    result = runner.latest_score_distribution(conn, debate_id)
    assert result["scored_node_count"] == 2
    assert result["strength"]["min"] == pytest.approx(0.6)
    assert result["strength"]["max"] == pytest.approx(0.9)
    assert result["uncertainty"]["min"] == pytest.approx(0.1)
    assert result["uncertainty"]["max"] == pytest.approx(0.4)


def test_score_distribution_none_when_no_scoring_run_exists(runner, db):
    debate, _ = build_fixture_debate(db, with_scoring=False)
    conn = runner.open_readonly_db(_debate_db_path())
    try:
        result = runner.latest_score_distribution(conn, debate.id)
    finally:
        conn.close()
    assert result is None


def test_verdict_band_and_lean_reuse_the_real_pure_scoring_functions(fixture_conn, runner):
    conn, debate_id, _pro_nodes = fixture_conn
    result = runner.verdict_band_and_lean(conn, debate_id)
    # tauCoverage 0.8 >= 0.5 and root strength 0.72 -> "supported" band per
    # app.scoring.verdict's declared thresholds (>=0.65 supported).
    assert result["verdict_band"] == "supported"
    assert result["lean"]["source"] == "dialectical"


def test_failover_event_count_reads_job_transitions_channel(fixture_conn, runner):
    conn, debate_id, _pro_nodes = fixture_conn
    assert runner.failover_event_count(conn, debate_id) == 1


def test_failover_event_count_zero_when_none_recorded(runner, db):
    debate, _ = build_fixture_debate(db, with_failover=False)
    conn = runner.open_readonly_db(_debate_db_path())
    try:
        assert runner.failover_event_count(conn, debate.id) == 0
    finally:
        conn.close()


def test_judge_call_count_reads_judge_output_artifacts(fixture_conn, runner):
    conn, debate_id, _pro_nodes = fixture_conn
    assert runner.judge_call_count(conn, debate_id) == 2


def test_token_and_spend_totals_sums_all_generations_and_prices_known_models(fixture_conn, runner):
    conn, debate_id, _pro_nodes = fixture_conn
    pricing = {"grok-4.5-high-loop": {"input": 1.25, "output": 2.50}}
    result = runner.token_and_spend_totals(conn, debate_id, pricing)
    # 3 container generations (500/300 each) + 2 pro-node generations (200/150 each,
    # only branches 0/1 materialized a pro node -- branch 2 failed before a PRO child).
    assert result["tokens_in"] == 500 * 3 + 200 * 2
    assert result["tokens_out"] == 300 * 3 + 150 * 2
    assert "grok-4.5-high-loop" in result["spend_usd"]["by_model"]
    assert result["spend_usd"]["known_total"] > 0
    assert "claude-sonnet-5-high-loop" in result["spend_usd"]["unpriced_model_ids"]
    assert "gpt-5.6sol-medium" in result["spend_usd"]["unpriced_model_ids"]


def test_token_and_spend_totals_all_unpriced_gives_zero_known_spend(fixture_conn, runner):
    conn, debate_id, _pro_nodes = fixture_conn
    result = runner.token_and_spend_totals(conn, debate_id, {})
    assert result["spend_usd"]["known_total"] == 0.0
    assert result["spend_usd"]["by_model"] == {}


def test_debate_wall_time_seconds_parses_real_sqlite_datetime_format(runner, db):
    debate = Debate(topic="t", status="complete")
    db.add(debate)
    db.commit()
    db.refresh(debate)
    debate.completed_at = now_utc()
    db.commit()
    conn = runner.open_readonly_db(_debate_db_path())
    try:
        seconds = runner.debate_wall_time_seconds(conn, debate.id)
    finally:
        conn.close()
    assert seconds is not None
    assert seconds >= 0.0


def test_debate_wall_time_seconds_none_when_not_completed(runner, db):
    debate = Debate(topic="t", status="generating")
    db.add(debate)
    db.commit()
    conn = runner.open_readonly_db(_debate_db_path())
    try:
        seconds = runner.debate_wall_time_seconds(conn, debate.id)
    finally:
        conn.close()
    assert seconds is None


def test_collect_case_metrics_composes_every_metric_function(fixture_conn, runner):
    conn, debate_id, _pro_nodes = fixture_conn
    metrics = runner.collect_case_metrics(conn, debate_id)
    for key in (
        "branch_completion",
        "model_families_completed_branches",
        "evidence",
        "verification_verdict_counts",
        "score_distribution",
        "verdict_band",
        "lean",
        "failover_events",
        "judge_calls",
        "tokens_in",
        "tokens_out",
        "spend_usd",
        "wall_time_seconds_db",
    ):
        assert key in metrics, key


# ---------------------------------------------------------------------------
# Pure helpers: quartiles, config-tag resolution, panel dimensions
# ---------------------------------------------------------------------------


def test_five_number_summary_empty_is_none(runner):
    assert runner.five_number_summary([]) is None


def test_five_number_summary_single_value(runner):
    assert runner.five_number_summary([0.5]) == {"n": 1, "min": 0.5, "q1": 0.5, "median": 0.5, "q3": 0.5, "max": 0.5}


def test_five_number_summary_multiple_values(runner):
    result = runner.five_number_summary([0.1, 0.2, 0.3, 0.4])
    assert result["n"] == 4
    assert result["min"] == 0.1
    assert result["max"] == 0.4
    assert result["median"] == pytest.approx(0.25)


def test_git_sha_returns_unknown_for_a_non_repo_directory(runner):
    # NOTE: deliberately not pytest's `tmp_path` -- it is nested under this
    # repo's own working tree (coordinator/.tmp/pytest-basetemp/...), and
    # `git -C <dir> rev-parse HEAD` searches upward for the nearest .git, so
    # it would honestly find THIS repo's ancestor .git instead of failing.
    # A system tempdir is genuinely outside any git working tree.
    import shutil
    import tempfile

    outside_dir = tempfile.mkdtemp(prefix="benchmark-harness-non-repo-")
    try:
        assert runner.git_sha(outside_dir) == "unknown"
    finally:
        shutil.rmtree(outside_dir, ignore_errors=True)


def test_git_sha_returns_a_real_sha_for_this_repo(runner):
    sha = runner.git_sha(ROOT)
    assert sha != "unknown"
    assert len(sha) == 40
    assert all(c in "0123456789abcdef" for c in sha)


def test_flags_from_env_file_returns_unknown_source_when_no_path_given(runner):
    assert runner.flags_from_env_file(None) == {"source": "unknown"}


def test_flags_from_env_file_returns_unknown_source_when_path_missing(runner, tmp_path):
    missing = tmp_path / "does-not-exist.env"
    assert runner.flags_from_env_file(missing) == {"source": "unknown"}


def test_flags_from_env_file_filters_to_dialectical_and_next_public_prefixes(runner, tmp_path):
    env_file = tmp_path / "coordinator.env"
    env_file.write_text(
        "\n".join(
            [
                "# comment",
                "DIALECTICAL_EVIDENCE_ACQUISITION=1",
                "DIALECTICAL_ADAPTIVE_EXPANSION=false",
                "NEXT_PUBLIC_VERDICT_FIRST_UI=true",
                "export DIALECTICAL_JUDGE_PANEL_MODELS=claude-sonnet-5-high-loop",
                "SOME_OTHER_SECRET=do-not-capture",
                "",
            ]
        ),
        encoding="utf-8",
    )
    result = runner.flags_from_env_file(env_file)
    assert result["source"] == "env_file"
    assert result["values"] == {
        "DIALECTICAL_EVIDENCE_ACQUISITION": "1",
        "DIALECTICAL_ADAPTIVE_EXPANSION": "false",
        "NEXT_PUBLIC_VERDICT_FIRST_UI": "true",
        "DIALECTICAL_JUDGE_PANEL_MODELS": "claude-sonnet-5-high-loop",
    }
    assert "SOME_OTHER_SECRET" not in result["values"]


def test_panel_dimensions_cover_blueprint_dims_one_through_ten(runner):
    assert len(runner.PANEL_DIMENSIONS) == 10
    keys = [key for key, _title in runner.PANEL_DIMENSIONS]
    assert len(keys) == len(set(keys))


def test_mean_panel_scores_averages_each_dimension(runner):
    dims = [key for key, _title in runner.PANEL_DIMENSIONS]
    a = {dims[0]: 1.0, dims[1]: 0.0}
    b = {dims[0]: 0.5, dims[1]: 1.0}
    result = runner.mean_panel_scores([a, b])
    assert result[dims[0]] == pytest.approx(0.75)
    assert result[dims[1]] == pytest.approx(0.5)


def test_mean_panel_scores_empty_list_is_empty_dict(runner):
    assert runner.mean_panel_scores([]) == {}


def test_parse_panel_json_scores_extracts_object_from_prose_wrapped_text(runner):
    text = 'Here is my scoring:\n{"1_truthfulness": 0.8, "2_hallucination_rate": 0.9}\nThanks.'
    result = runner.parse_panel_json_scores(text)
    assert result == {"1_truthfulness": 0.8, "2_hallucination_rate": 0.9}


def test_parse_panel_json_scores_returns_none_for_unparseable_text(runner):
    assert runner.parse_panel_json_scores("not json at all") is None


# ---------------------------------------------------------------------------
# HTTP orchestration (fake transport only -- no live network)
# ---------------------------------------------------------------------------


def test_create_debate_posts_topic_and_returns_parsed_json(runner):
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["method"] = request.method
        captured["url"] = str(request.url)
        captured["body"] = json.loads(request.content)
        captured["auth"] = request.headers.get("authorization")
        return httpx.Response(200, json={"id": "debate-1", "status": "generating"})

    client = httpx.Client(transport=httpx.MockTransport(handler))
    result = runner.create_debate(client, "http://127.0.0.1:8000", "tok", "Does X cause Y?")

    assert result == {"id": "debate-1", "status": "generating"}
    assert captured["method"] == "POST"
    assert captured["url"] == "http://127.0.0.1:8000/api/debates"
    assert captured["body"] == {"topic": "Does X cause Y?"}
    assert captured["auth"] == "Bearer tok"


def test_fetch_debate_gets_by_id(runner):
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/debates/debate-1"
        return httpx.Response(200, json={"id": "debate-1", "status": "complete"})

    client = httpx.Client(transport=httpx.MockTransport(handler))
    result = runner.fetch_debate(client, "http://127.0.0.1:8000", "tok", "debate-1")
    assert result["status"] == "complete"


def test_poll_until_terminal_stops_as_soon_as_status_is_terminal(runner):
    statuses = iter(["generating", "generating", "complete"])
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(200, json={"id": "debate-1", "status": next(statuses)})

    client = httpx.Client(transport=httpx.MockTransport(handler))
    sleeps = []
    result = runner.poll_until_terminal(
        client,
        "http://127.0.0.1:8000",
        "tok",
        "debate-1",
        timeout_seconds=60,
        poll_interval_seconds=1,
        sleep_fn=sleeps.append,
        clock_fn=iter([0.0, 1.0, 2.0, 3.0]).__next__,
    )
    assert result["debate"]["status"] == "complete"
    assert result["timed_out"] is False
    assert calls["n"] == 3
    assert len(sleeps) == 2  # slept between polls 1->2 and 2->3, not after the terminal one


def test_poll_until_terminal_times_out_honestly(runner):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"id": "debate-1", "status": "generating"})

    client = httpx.Client(transport=httpx.MockTransport(handler))
    clock_values = iter([0.0, 5.0, 11.0])
    result = runner.poll_until_terminal(
        client,
        "http://127.0.0.1:8000",
        "tok",
        "debate-1",
        timeout_seconds=10,
        poll_interval_seconds=1,
        sleep_fn=lambda _seconds: None,
        clock_fn=lambda: next(clock_values),
    )
    assert result["timed_out"] is True
    assert result["debate"]["status"] == "generating"


def test_fetch_settings_returns_none_on_http_error_instead_of_raising(runner):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="boom")

    client = httpx.Client(transport=httpx.MockTransport(handler))
    assert runner.fetch_settings(client, "http://127.0.0.1:8000", "tok") is None


def test_fetch_settings_returns_routing_payload_on_success(runner):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"routing": {}, "enabled_models": ["gpt-5.6sol-medium"]})

    client = httpx.Client(transport=httpx.MockTransport(handler))
    result = runner.fetch_settings(client, "http://127.0.0.1:8000", "tok")
    assert result == {"routing": {}, "enabled_models": ["gpt-5.6sol-medium"]}


# ---------------------------------------------------------------------------
# run_case / execute_run orchestration
# ---------------------------------------------------------------------------


def _sample_case(**overrides):
    case = {
        "id": "case-1",
        "category": "ground_truth_true",
        "claim_type": "causal",
        "topic": "Does X cause Y?",
        "user_intent": "test",
        "expected_verdict_direction": "supported",
        "is_trap": False,
        "ground_truth_notes": "notes",
        "reference": "ref",
    }
    case.update(overrides)
    return case


def test_run_case_creates_polls_and_collects_metrics_end_to_end_with_fake_transport(runner, db):
    debate, _pro_nodes = build_fixture_debate(db)

    def handler(request: httpx.Request) -> httpx.Response:
        if request.method == "POST":
            return httpx.Response(200, json={"id": debate.id, "status": "generating"})
        return httpx.Response(200, json={"id": debate.id, "status": "complete"})

    client = httpx.Client(transport=httpx.MockTransport(handler))
    result = runner.run_case(
        client,
        "http://127.0.0.1:8000",
        "tok",
        _debate_db_path(),
        _sample_case(),
        timeout_seconds=5,
        poll_interval_seconds=0,
        panel=False,
        sleep_fn=lambda _seconds: None,
    )

    assert result["status"] == "completed"
    assert result["debate_id"] == debate.id
    assert result["error"] is None
    assert result["metrics"]["branch_completion"]["total"] == 3
    assert result["panel"] is None


def test_run_case_records_error_status_when_create_debate_fails(runner):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="coordinator down")

    client = httpx.Client(transport=httpx.MockTransport(handler))
    result = runner.run_case(
        client,
        "http://127.0.0.1:8000",
        "tok",
        "/nonexistent.sqlite3",
        _sample_case(),
        timeout_seconds=5,
        poll_interval_seconds=0,
        panel=False,
        sleep_fn=lambda _seconds: None,
    )
    assert result["status"] == "error"
    assert result["error"] is not None
    assert result["debate_id"] is None


def test_run_case_records_error_status_when_create_response_has_no_id(runner):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"status": "generating"})  # no "id" key

    client = httpx.Client(transport=httpx.MockTransport(handler))
    result = runner.run_case(
        client,
        "http://127.0.0.1:8000",
        "tok",
        "/nonexistent.sqlite3",
        _sample_case(),
        timeout_seconds=5,
        poll_interval_seconds=0,
        panel=False,
        sleep_fn=lambda _seconds: None,
    )
    assert result["status"] == "error"
    assert "debate id" in result["error"]


def test_run_case_degrades_to_error_instead_of_raising_when_polling_fails(runner):
    """A poll-time failure (coordinator restart, network blip) must degrade
    this one case, not propagate out and abort the whole run."""

    def handler(request: httpx.Request) -> httpx.Response:
        if request.method == "POST":
            return httpx.Response(200, json={"id": "debate-1", "status": "generating"})
        return httpx.Response(500, text="coordinator restarted mid-poll")

    client = httpx.Client(transport=httpx.MockTransport(handler))
    result = runner.run_case(
        client,
        "http://127.0.0.1:8000",
        "tok",
        "/nonexistent.sqlite3",
        _sample_case(),
        timeout_seconds=5,
        poll_interval_seconds=0,
        panel=False,
        sleep_fn=lambda _seconds: None,
    )
    assert result["status"] == "error"
    assert result["debate_id"] == "debate-1"
    assert result["error"] is not None


def _make_args(**overrides):
    import argparse

    defaults = dict(
        suite=SUITE_PATH,
        base_url="http://127.0.0.1:8000",
        db="/nonexistent.sqlite3",
        out=None,
        limit=None,
        dry_run=False,
        max_spend_usd=None,
        panel=False,
        timeout_seconds=5,
        poll_interval_seconds=0,
        env_file=None,
        user_token="tok",
    )
    defaults.update(overrides)
    return argparse.Namespace(**defaults)


def test_execute_run_dry_run_validates_and_checks_connectivity_but_creates_no_debates(runner):
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append((request.method, request.url.path))
        assert request.method != "POST", "dry-run must never create a debate"
        return httpx.Response(200, json={"routing": {}, "enabled_models": []})

    client = httpx.Client(transport=httpx.MockTransport(handler))
    args = _make_args(dry_run=True, limit=2)
    manifest, results = runner.execute_run(args, client)

    assert manifest["run"]["dry_run"] is True
    assert manifest["config"]["model_pool"] == {"routing": {}, "enabled_models": []}
    assert len(results) == 2
    assert all(r["status"] == "skipped_dry_run" for r in results)
    assert all(call[0] == "GET" for call in calls)


def test_execute_run_dry_run_reports_suite_validation_errors_without_raising(runner, tmp_path):
    broken_path = tmp_path / "broken-suite.json"
    suite = json.loads(SUITE_PATH.read_text())
    del suite["cases"][0]["topic"]
    broken_path.write_text(json.dumps(suite))

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"routing": {}, "enabled_models": []})

    client = httpx.Client(transport=httpx.MockTransport(handler))
    args = _make_args(dry_run=True, suite=broken_path)
    manifest, results = runner.execute_run(args, client)

    assert manifest["run"]["dry_run"] is True
    assert manifest["suite_validation_errors"]
    assert results == []


def test_execute_run_stops_launching_new_cases_once_spend_cap_is_exceeded(runner):
    # Uses the real, valid 25-case suite-v1.json (execute_run always
    # validates the FULL suite before slicing) with --limit 4 to isolate
    # spend-cap behavior over a small, deterministic slice.
    suite = runner.load_suite(SUITE_PATH)
    four_cases = suite["cases"][:4]

    call_log = []

    def fake_run_case(client, base_url, token, db_path, case, **kwargs):
        call_log.append(case["id"])
        return {
            "case_id": case["id"],
            "category": case["category"],
            "claim_type": case["claim_type"],
            "topic": case["topic"],
            "expected_verdict_direction": case["expected_verdict_direction"],
            "is_trap": case["is_trap"],
            "status": "completed",
            "debate_id": "d",
            "error": None,
            "wall_time_seconds": 1.0,
            "metrics": {"spend_usd": {"known_total": 2.0, "by_model": {}, "unpriced_model_ids": []}},
            "panel": None,
        }

    client = httpx.Client(transport=httpx.MockTransport(lambda request: httpx.Response(200, json={"routing": {}, "enabled_models": []})))
    args = _make_args(max_spend_usd=5.0, limit=4)
    manifest, results = runner.execute_run(args, client, run_case_fn=fake_run_case)

    assert call_log == [four_cases[0]["id"], four_cases[1]["id"], four_cases[2]["id"]]
    statuses = [r["status"] for r in results]
    assert statuses == ["completed", "completed", "completed", "skipped_spend_cap"]
    assert manifest["spend"]["stopped_for_cap"] is True
    assert manifest["spend"]["cases_skipped_for_cap"] == [four_cases[3]["id"]]
    assert manifest["spend"]["known_usd_total"] == pytest.approx(6.0)


def test_execute_run_without_a_cap_runs_every_case(runner):
    suite = runner.load_suite(SUITE_PATH)
    two_cases = suite["cases"][:2]

    call_log = []

    def fake_run_case(client, base_url, token, db_path, case, **kwargs):
        call_log.append(case["id"])
        return {
            "case_id": case["id"],
            "category": case["category"],
            "claim_type": case["claim_type"],
            "topic": case["topic"],
            "expected_verdict_direction": case["expected_verdict_direction"],
            "is_trap": case["is_trap"],
            "status": "completed",
            "debate_id": "d",
            "error": None,
            "wall_time_seconds": 1.0,
            "metrics": {"spend_usd": {"known_total": 100.0, "by_model": {}, "unpriced_model_ids": []}},
            "panel": None,
        }

    client = httpx.Client(transport=httpx.MockTransport(lambda request: httpx.Response(200, json={"routing": {}, "enabled_models": []})))
    args = _make_args(max_spend_usd=None, limit=2)
    manifest, results = runner.execute_run(args, client, run_case_fn=fake_run_case)

    assert call_log == [two_cases[0]["id"], two_cases[1]["id"]]
    assert manifest["spend"]["stopped_for_cap"] is False


# ---------------------------------------------------------------------------
# summarize_results
# ---------------------------------------------------------------------------


def _result(**overrides):
    base = {
        "case_id": "c",
        "category": "ground_truth_true",
        "claim_type": "causal",
        "topic": "t",
        "expected_verdict_direction": "supported",
        "is_trap": False,
        "status": "completed",
        "debate_id": "d",
        "error": None,
        "wall_time_seconds": 10.0,
        "metrics": {
            "branch_completion": {"completed": 3, "total": 4, "fraction": 0.75},
            "model_families_completed_branches": ["claude", "gpt"],
            "evidence": {"total": 2, "by_method": {}, "by_resolution_status": {"resolved_quote_found": 1, "resolved_quote_missing": 1}},
            "verification_verdict_counts": {"supported": 1},
            "score_distribution": None,
            "verdict_band": "supported",
            "lean": {"source": "dialectical", "pct": 60, "label": "Pro"},
            "failover_events": 1,
            "judge_calls": 4,
            "tokens_in": 100,
            "tokens_out": 50,
            "spend_usd": {"known_total": 1.5, "by_model": {}, "unpriced_model_ids": ["claude-sonnet-5-high-loop"]},
            "wall_time_seconds_db": 9.5,
        },
        "panel": None,
    }
    base.update(overrides)
    return base


def test_summarize_results_computes_expected_direction_match_rate(runner):
    results = [
        _result(case_id="a", expected_verdict_direction="supported", metrics={**_result()["metrics"], "verdict_band": "supported"}),
        _result(case_id="b", expected_verdict_direction="unsupported", metrics={**_result()["metrics"], "verdict_band": "supported"}),
    ]
    summary = runner.summarize_results(results)
    assert summary["expected_direction_match"] == {"matched": 1, "evaluated": 2, "rate": pytest.approx(0.5)}


def test_summarize_results_trap_match_rate_only_counts_traps(runner):
    results = [
        _result(case_id="a", is_trap=True, expected_verdict_direction="unsupported", metrics={**_result()["metrics"], "verdict_band": "unsupported"}),
        _result(case_id="b", is_trap=False, expected_verdict_direction="supported", metrics={**_result()["metrics"], "verdict_band": "unsupported"}),
    ]
    summary = runner.summarize_results(results)
    assert summary["trap_expected_direction_match"] == {"matched": 1, "evaluated": 1, "rate": pytest.approx(1.0)}


def test_summarize_results_aggregates_cost_and_tokens(runner):
    results = [_result(case_id="a"), _result(case_id="b")]
    summary = runner.summarize_results(results)
    assert summary["tokens_in_total"] == 200
    assert summary["tokens_out_total"] == 100
    assert summary["spend_usd_known_total"] == pytest.approx(3.0)
    assert summary["judge_calls_total"] == 8
    assert summary["failover_events_total"] == 2
    assert summary["unpriced_model_ids"] == ["claude-sonnet-5-high-loop"]


def test_summarize_results_evidence_resolution_rate_excludes_never_attempted(runner):
    results = [_result(case_id="a")]
    summary = runner.summarize_results(results)
    # 1 resolved_quote_found out of 2 attempted (resolved_quote_found + resolved_quote_missing).
    assert summary["evidence_resolution_rate"] == pytest.approx(0.5)


def test_summarize_results_handles_empty_results_without_crashing(runner):
    summary = runner.summarize_results([])
    assert summary["case_count"] == 0
    assert summary["expected_direction_match"] == {"matched": 0, "evaluated": 0, "rate": None}
    assert summary["spend_usd_known_total"] == 0.0


def test_summarize_results_panel_dimension_means_none_when_no_panel_data(runner):
    results = [_result(case_id="a")]
    summary = runner.summarize_results(results)
    assert summary["panel_dimension_means"] is None


def test_summarize_results_panel_dimension_means_when_present(runner):
    dims = [key for key, _title in load_module("benchmark_runner", "runner.py").PANEL_DIMENSIONS]
    panel_a = {"judges": {}, "mean": {dims[0]: 0.8}}
    panel_b = {"judges": {}, "mean": {dims[0]: 0.4}}
    results = [_result(case_id="a", panel=panel_a), _result(case_id="b", panel=panel_b)]
    summary = runner.summarize_results(results)
    assert summary["panel_dimension_means"][dims[0]] == pytest.approx(0.6)


# ---------------------------------------------------------------------------
# write_run_outputs
# ---------------------------------------------------------------------------


def test_write_run_outputs_writes_manifest_and_results_json(runner, tmp_path):
    manifest = {"schema_version": "benchmark-manifest-v1"}
    results = [_result(case_id="a")]
    runner.write_run_outputs(tmp_path, manifest, results)

    written_manifest = json.loads((tmp_path / "manifest.json").read_text())
    written_results = json.loads((tmp_path / "results.json").read_text())
    assert written_manifest == manifest
    assert written_results == results


# ---------------------------------------------------------------------------
# CLI argument parsing
# ---------------------------------------------------------------------------


def test_build_arg_parser_defaults(runner):
    parser = runner.build_arg_parser()
    args = parser.parse_args([])
    assert args.base_url == "http://127.0.0.1:8000"
    assert str(args.db).endswith(".dialectical/db.sqlite3")
    assert args.dry_run is False
    assert args.panel is False
    assert args.limit is None
    assert args.max_spend_usd is None


def test_build_arg_parser_accepts_all_documented_flags(runner):
    parser = runner.build_arg_parser()
    args = parser.parse_args(
        [
            "--base-url",
            "http://example.test",
            "--db",
            "/tmp/x.sqlite3",
            "--out",
            "/tmp/out",
            "--limit",
            "5",
            "--dry-run",
            "--max-spend-usd",
            "3.5",
            "--panel",
        ]
    )
    assert args.base_url == "http://example.test"
    assert args.db == "/tmp/x.sqlite3"
    assert args.out == "/tmp/out"
    assert args.limit == 5
    assert args.dry_run is True
    assert args.max_spend_usd == 3.5
    assert args.panel is True


def test_main_dry_run_end_to_end_writes_outputs_via_injected_client_factory(runner, tmp_path, capsys):
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.method != "POST", "dry-run must never create a debate"
        return httpx.Response(200, json={"routing": {}, "enabled_models": ["gpt-5.6sol-medium"]})

    out_dir = tmp_path / "out"
    exit_code = runner.main(
        ["--dry-run", "--limit", "2", "--out", str(out_dir)],
        client_factory=lambda: httpx.Client(transport=httpx.MockTransport(handler)),
    )

    assert exit_code == 0
    manifest = json.loads((out_dir / "manifest.json").read_text())
    results = json.loads((out_dir / "results.json").read_text())
    assert manifest["run"]["dry_run"] is True
    assert len(results) == 2
    assert all(r["status"] == "skipped_dry_run" for r in results)
    printed = capsys.readouterr().out
    assert "Benchmark run" in printed


def test_main_returns_nonzero_and_prints_errors_for_an_invalid_suite(runner, tmp_path, capsys):
    broken_path = tmp_path / "broken-suite.json"
    suite = json.loads(SUITE_PATH.read_text())
    suite["cases"] = suite["cases"][1:]  # 24 cases -> invalid
    broken_path.write_text(json.dumps(suite))

    exit_code = runner.main(
        ["--dry-run", "--suite", str(broken_path)],
        client_factory=lambda: httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(200, json={}))),
    )

    assert exit_code == 1
    assert "validation failed" in capsys.readouterr().err.lower()


# ---------------------------------------------------------------------------
# report.py -- golden diff test
# ---------------------------------------------------------------------------


def _golden_manifest(label: str, *, git_sha: str, spend: float) -> dict:
    return {
        "schema_version": "benchmark-manifest-v1",
        "created_at": "2026-07-22T00:00:00+00:00",
        "config": {
            "git_sha": git_sha,
            "flags": {"source": "env_file", "path": "/x.env", "values": {"DIALECTICAL_EVIDENCE_ACQUISITION": "1"}},
            "model_pool": {"routing": {}, "enabled_models": ["gpt-5.6sol-medium"]},
        },
        "run": {"limit": None, "max_spend_usd": None, "dry_run": False, "timeout_seconds": 900, "poll_interval_seconds": 5},
        "summary": {
            "case_count": 2,
            "status_counts": {"completed": 2},
            "branch_completion_fraction_mean": 0.75,
            "verdict_band_distribution": {"supported": 2},
            "expected_direction_match": {"matched": 2, "evaluated": 2, "rate": 1.0},
            "trap_expected_direction_match": {"matched": 0, "evaluated": 0, "rate": None},
            "evidence_resolution_rate": 0.5,
            "judge_calls_total": 8,
            "failover_events_total": label == "candidate" and 0 or 2,
            "tokens_in_total": 200,
            "tokens_out_total": 100,
            "spend_usd_known_total": spend,
            "unpriced_model_ids": ["claude-sonnet-5-high-loop"],
            "wall_time_seconds_mean": 10.0,
            "model_family_diversity_mean": 2.0,
            "panel_dimension_means": None,
        },
        "spend": {"known_usd_total": spend, "unpriced_model_ids": [], "cap_usd": None, "stopped_for_cap": False, "cases_skipped_for_cap": []},
    }


def test_report_delta_formats_integer_counts_without_decimal_noise(report):
    assert report._delta(2, 2) == "+0"
    assert report._delta(2, 0) == "-2"
    assert report._delta(0.75, 0.75) == "+0.0000"
    assert report._delta(None, 3.0) == "—"


def test_report_golden_markdown_diff_is_deterministic_and_stable(report, tmp_path):
    baseline = _golden_manifest("baseline", git_sha="a" * 40, spend=1.5)
    candidate = _golden_manifest("candidate", git_sha="b" * 40, spend=3.0)

    first = report.render_report(baseline, candidate)
    second = report.render_report(baseline, candidate)

    assert first == second  # deterministic for identical inputs
    assert "a" * 40 in first
    assert "b" * 40 in first
    assert "spend_usd_known_total" in first or "Spend" in first
    assert first.count("\n\n\n") == 0  # tidy markdown, no triple-blank-line artifacts


def test_report_main_writes_output_file(report, tmp_path):
    baseline_dir = tmp_path / "baseline"
    candidate_dir = tmp_path / "candidate"
    baseline_dir.mkdir()
    candidate_dir.mkdir()
    (baseline_dir / "manifest.json").write_text(json.dumps(_golden_manifest("baseline", git_sha="a" * 40, spend=1.0)))
    (candidate_dir / "manifest.json").write_text(json.dumps(_golden_manifest("candidate", git_sha="b" * 40, spend=2.0)))
    out_file = tmp_path / "diff.md"

    exit_code = report.main(["--baseline", str(baseline_dir), "--candidate", str(candidate_dir), "--out", str(out_file)])

    assert exit_code == 0
    assert out_file.exists()
    assert "a" * 40 in out_file.read_text()


def test_report_main_prints_to_stdout_when_no_out_given(report, tmp_path, capsys):
    baseline_dir = tmp_path / "baseline"
    candidate_dir = tmp_path / "candidate"
    baseline_dir.mkdir()
    candidate_dir.mkdir()
    (baseline_dir / "manifest.json").write_text(json.dumps(_golden_manifest("baseline", git_sha="a" * 40, spend=1.0)))
    (candidate_dir / "manifest.json").write_text(json.dumps(_golden_manifest("candidate", git_sha="b" * 40, spend=2.0)))

    exit_code = report.main(["--baseline", str(baseline_dir), "--candidate", str(candidate_dir)])

    assert exit_code == 0
    assert "a" * 40 in capsys.readouterr().out


def test_render_report_shows_panel_dimensions_when_present(report):
    baseline = _golden_manifest("baseline", git_sha="a" * 40, spend=1.0)
    candidate = _golden_manifest("candidate", git_sha="b" * 40, spend=2.0)
    baseline["summary"]["panel_dimension_means"] = {"1_truthfulness": 0.8, "6_wrongful_agreement_resistance": 0.6}
    candidate["summary"]["panel_dimension_means"] = {"1_truthfulness": 0.9, "6_wrongful_agreement_resistance": 0.4}

    text = report.render_report(baseline, candidate)

    assert "Truthfulness" in text
    assert "Wrongful agreement resistance" in text
    assert "did not run" not in text
