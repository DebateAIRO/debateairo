from __future__ import annotations

import os
import tempfile

TEST_HOME = tempfile.mkdtemp(prefix="dialectical-test-")
os.environ["DIALECTICAL_HOME"] = TEST_HOME
os.environ["DIALECTICAL_DATABASE_URL"] = f"sqlite:///{TEST_HOME}/test.sqlite3"
os.environ["DIALECTICAL_USER_TOKEN"] = "user_test_token"
# Test-suite baseline: run the legacy fixed-quartet debate-creation path so the
# existing quartet-asserting tests remain valid byte-for-byte. Production
# defaults DIALECTICAL_DYNAMIC_PERSPECTIVES to TRUE (see dialectical_v2.bool_env
# call). setdefault (not a hard set) so a test can still opt into the dynamic
# path via monkeypatch.setenv, and delenv to exercise the production default.
os.environ.setdefault("DIALECTICAL_DYNAMIC_PERSPECTIVES", "false")
# Same discipline for the LLM perspective planner (production default TRUE):
# tests stay deterministic and provider-free; LLM-path tests opt in with a
# fake planner registry (see tests/test_llm_perspectives.py).
os.environ.setdefault("DIALECTICAL_LLM_PERSPECTIVES", "false")
# Task 8 (P3.4/P4.2): both default TRUE in production, but the test baseline
# pins them OFF so the many pipeline tests that claim/complete a v2_synthesize
# right after generation keep their pre-Task-8 behavior byte-for-byte:
#  - SCORE_BEFORE_SYNTHESIS on would defer synthesis until the tree is scored,
#    but the autouse _no_internal_scoring_thread stub means scoring never runs
#    in tests, so synthesis would never become claimable within the budget.
#  - SYNTHESIZER_ROTATION on would rotate the synthesize model off the anchor
#    whenever a second family is online, breaking anchor-pinned assertions.
# Task 8's own tests opt back in per-case via monkeypatch.setenv, and delenv
# exercises the production default. setdefault (not a hard set) preserves that.
os.environ.setdefault("DIALECTICAL_SCORE_BEFORE_SYNTHESIS", "false")
os.environ.setdefault("DIALECTICAL_SYNTHESIZER_ROTATION", "false")
# Task 14 (P3.1): the adversarial POV pipeline defaults OFF in production too,
# but pin it explicitly in the test baseline so a stray shell env can never
# flip the many pipeline tests that complete v2_pov jobs with the legacy 7-card
# contract onto the 3-card proposer contract. Task 14's own tests opt in per
# case via monkeypatch.setenv; delenv exercises the production default.
os.environ.setdefault("DIALECTICAL_ADVERSARIAL_POV", "false")
# Task 15 (P3.3): the pre-synthesis cross-examination wave defaults OFF in
# production too, but pin it explicitly in the test baseline (same defensive
# discipline as ADVERSARIAL_POV above) so a stray shell env can never flip the
# many pipeline tests that complete the last v2_pov job expecting a
# v2_synthesize job to be queued directly onto queuing the wave instead.
# Task 15's own tests opt in per case via monkeypatch.setenv; delenv exercises
# the production default.
os.environ.setdefault("DIALECTICAL_CROSS_EXAM", "false")

import hashlib
import json
import logging
from uuid import uuid4

import pytest
from sqlalchemy import text
from sqlalchemy.exc import OperationalError

import app.main  # noqa: F401 — warms the orchestrator<->scoring<->serialization import cycle so collection order can't break imports

from app.core.auth import ensure_user_token
from app.core.db import Base, SessionLocal, engine, init_db
from app.exploration.policy import EvidenceSignal, ScoreSignal
from app.models.entities import Setting


@pytest.fixture(autouse=True)
def _isolate_app_logger_configuration():
    """Contain app startup's ONE global side effect: the `app` logger.

    app.main.run_startup_tasks calls app.core.log_config.configure_app_logging,
    which sets a level, installs a stderr handler, and -- to guarantee no
    double-printing -- sets `propagate = False` on the `app` logger. That is
    process-wide and permanent, so any test that boots the real lifespan
    (`with TestClient(app):` in test_instance_lock / test_reaper_lifespan)
    silently reconfigured logging for every test that ran afterwards, and
    caplog-based assertions on `app.*` records in LATER files stopped seeing
    anything (caplog captures via propagation to root).

    Snapshot/restore rather than "don't configure": the production behaviour
    under test is exactly that startup configures this logger.
    """

    logger = logging.getLogger("app")
    handlers, level, propagate = list(logger.handlers), logger.level, logger.propagate
    try:
        yield
    finally:
        logger.handlers = handlers
        logger.setLevel(level)
        logger.propagate = propagate


# P1 Task 4: pure-policy signal factories (no database involved). Defaults are
# a deliberately unremarkable mid-range claim with grounded, supporting
# evidence: no fatal flags, no recommended actions, and every threshold
# predicate in ExplorationPolicy left un-fired. A test therefore states, in its
# keyword overrides alone, exactly which predicates it means to exercise.
@pytest.fixture()
def make_score_signal():
    def _make(**overrides) -> ScoreSignal:
        data: dict = {
            "node_id": "node-1",
            "claim_type": "empirical",
            "strength": 0.62,
            "uncertainty": 0.24,
            "impact": 0.55,
            "evidence_quality": 0.65,
            "logical_validity": 0.72,
            "assumption_risk": 0.28,
            "counter_resilience": 0.58,
            "holes": (),
            "fatal_flags": (),
            "recommended_actions": (),
            # P1 Task 5: the persisted panel-disagreement predicate. Default
            # False keeps the baseline signal "an unremarkable claim with no
            # fired predicate" -- a test that means to exercise the
            # cross-family challenge ground says so with judges_disagree=True.
            "judges_disagree": False,
        }
        data.update(overrides)
        # holes/fatal_flags/recommended_actions are tuple fields; accept any
        # iterable from the caller so tests can pass plain lists.
        for sequence_field in ("holes", "fatal_flags", "recommended_actions"):
            data[sequence_field] = tuple(data[sequence_field])
        return ScoreSignal(**data)

    return _make


@pytest.fixture()
def make_evidence_signal():
    def _make(**overrides) -> EvidenceSignal:
        data: dict = {
            # str values are coerced to EvidenceStatus/EntailmentLabel by
            # EvidenceSignal.__post_init__, so tests may pass either form.
            "status": "grounded",
            "base_score": 0.72,
            "uncertainty": 0.18,
            "entailment": "SUPPORTS",
            "caveats": (),
        }
        data.update(overrides)
        data["caveats"] = tuple(data["caveats"])
        return EvidenceSignal(**data)

    return _make


# P1 Task 5: persisted judge-evidence factory. The dict shape is NOT invented
# here -- it is the exact shape app/scoring/service.py's
# _persisted_judge_evidence_for_node builds from a JudgeOutputArtifact row and
# app/scoring/disagreement.py's _distinct_persisted_judge_evidence consumes:
# judge_role / provider / model / raw_output_sha256 (four non-empty strings,
# all four required by the distinctness rule) plus "assessment". "assessment"
# is a RAW dict, not a ClaimAssessment instance, because the production
# builder copies JudgeOutputArtifact.assessment (a JSON column) through
# unparsed -- _distinct_persisted_judge_evidence is what model_validates it.
# The default assessment is a mid-range, no-fatal-flag judgment; a test names
# the leaf score fields it means to move as keyword arguments.
_JUDGE_ASSESSMENT_DEFAULTS: dict[str, dict[str, float]] = {
    "steelman": {"charitable_strength": 0.60, "confidence": 0.70},
    "critic": {
        "logical_validity": 0.60,
        "assumption_risk": 0.30,
        "counterargument_strength": 0.35,
    },
    "evidence": {
        "evidence_quality": 0.55,
        "evidence_relevance": 0.60,
        "evidence_sufficiency": 0.50,
        "source_reliability": 0.55,
        "freshness": 0.50,
    },
    "context": {"relevance": 0.65, "impact": 0.55, "dependency_weight": 0.40},
    "fallacy": {"logical_consistency": 0.70},
}
_JUDGE_ASSESSMENT_FIELD_SECTION = {
    field_name: section
    for section, fields in _JUDGE_ASSESSMENT_DEFAULTS.items()
    for field_name in fields
}


@pytest.fixture()
def make_judge_evidence():
    def _make(
        *,
        judge_role: str = "judge",
        provider: str | None = None,
        model: str | None = None,
        raw_output_sha256: str | None = None,
        **assessment_fields: float,
    ) -> dict:
        assessment = {
            section: dict(fields) for section, fields in _JUDGE_ASSESSMENT_DEFAULTS.items()
        }
        for field_name, value in assessment_fields.items():
            section = _JUDGE_ASSESSMENT_FIELD_SECTION.get(field_name)
            if section is None:
                raise TypeError(f"unknown ClaimAssessment score field: {field_name}")
            assessment[section][field_name] = value
        # Identity defaults track judge_role so a three-role panel is three
        # DISTINCT judgments under the (judge_role, provider, model) rule, and
        # the raw-output digest is derived from the whole judgment so two
        # byte-identical judgments still collapse exactly as production's
        # raw_output_sha256 dedupe collapses them.
        provider = provider if provider is not None else f"{judge_role}-provider"
        model = model if model is not None else f"{judge_role}-model"
        if raw_output_sha256 is None:
            digest_source = json.dumps([judge_role, provider, model, assessment], sort_keys=True)
            raw_output_sha256 = hashlib.sha256(digest_source.encode("utf-8")).hexdigest()
        return {
            "judge_role": judge_role,
            "provider": provider,
            "model": model,
            "raw_output_sha256": raw_output_sha256,
            "assessment": assessment,
        }

    return _make


# P1 Task 6: frontier-ordering factories. Each builds a REAL v2 debate, a
# REAL complete node_scoring AnalyzerRun, and one REAL LifecycleDecisionRecord
# per node -- the priority is never stubbed in, it is whatever
# frontier_priority derives from the persisted scoring item. The requested
# priority is fed as `impact`, with `uncertainty` pinned to 1.0 and no judge
# artifacts (so max_field_spread is 0.0): multiplying by 1.0 is exact in
# IEEE-754, so the recorded priority is bit-for-bit the requested value and
# an ordering assertion cannot fail on a mantissa artefact.
#
# Nodes are the depth-2 strongest-PRO/strongest-CON pair under each POV
# container (8 of them after the fixed quartet), one decision per node, so
# neither the per-node (2) nor the per-debate (6) budget default truncates a
# wave-width test ahead of the wave width itself.
def _frontier_decisions_factory(signal_class: str):
    def _make(db, *, priorities):
        from datetime import timedelta

        from sqlalchemy import select

        from app.models.entities import AnalyzerRun, Node, next_analyzer_run_seq, now_utc
        from app.services.dialectical_v2 import first_branch

        from test_adaptive_expansion import persist_decision
        from test_node_scoring import explicit_depth_pressure_payload
        from test_v2_expand import codex_worker, make_v2_debate

        worker = codex_worker(db)
        debate = make_v2_debate(db, worker)
        nodes = list(
            db.scalars(
                select(Node)
                .where(
                    Node.debate_id == debate.id,
                    Node.node_type.in_(("PRO", "CON")),
                    Node.status == "complete",
                    Node.depth == 2,
                )
                .order_by(Node.materialized_path.asc(), Node.id.asc())
            ).all()
        )
        assert len(nodes) >= len(priorities), (
            f"fixture needs {len(priorities)} expandable depth-2 nodes, found {len(nodes)}"
        )
        chosen = nodes[: len(priorities)]
        run = AnalyzerRun(
            debate_id=debate.id,
            branch_id=first_branch(db, debate.id).id,
            analyzer_type="node_scoring",
            output={
                "status": "available",
                "items": [
                    explicit_depth_pressure_payload(
                        node_id=node.id, impact=priority, uncertainty=1.0
                    ).model_dump(mode="json")
                    for node, priority in zip(chosen, priorities)
                ],
                "producer": "stored-judge-output",
            },
            status="complete",
            provenance={"scoring_source": "judge_outputs"},
        )
        # next_analyzer_run_seq assigns run.seq, db.add()s and db.flush()es as
        # one lock-covered critical section -- do NOT db.add() separately.
        next_analyzer_run_seq(db, run)
        db.commit()
        records = [
            persist_decision(
                db,
                debate_id=debate.id,
                node_id=node.id,
                decision="challenge",
                signal_class=signal_class,
                run_id=run.id,
            )
            for node in chosen
        ]
        # Pin DISTINCT, ascending created_at values. The dispatcher's sort
        # tiebreaks on (created_at, id), so if these rows shared a tick the
        # pre-sort walk would fall back to random-UUID id order -- and an
        # ordering test would then only detect a broken sort about three runs
        # in four. Distinct timestamps make creation order deterministic, so
        # "creation order" is a real, reproducible baseline to sort away from.
        base = now_utc()
        for offset, record in enumerate(records):
            record.created_at = base + timedelta(seconds=offset)
        db.commit()
        return debate, records, run.id

    return _make


@pytest.fixture()
def categorical_decisions_factory():
    return _frontier_decisions_factory("categorical")


@pytest.fixture()
def scalar_decisions_factory():
    return _frontier_decisions_factory("scalar")


# P1 Task 7: convergence-run factory. Builds a REAL v2 debate (or reuses the
# one handed in, so a test can lay down a SEQUENCE of waves against one debate)
# and persists a REAL complete protocol_analysis AnalyzerRun.
#
# The output shape is NOT invented here: it is exactly what
# app/protocol/runner.py writes on the comparable branch -- a "convergence"
# dict carrying converged / maxDelta / nodesCompared / epsilon, alongside
# "convergenceVersion". `converged` is derived with the runner's own predicate
# (max_delta <= epsilon, runner.py's comparable branch) rather than passed in,
# so a factory-built run can never disagree with itself the way a hand-written
# literal could.
#
# `expanded` models the OTHER half of a wave. A wave is an expansion round
# followed by a measurement of the drift it caused, so the default call
# advances `rounds_completed` exactly as a spawning dispatch pass would.
# `expanded=False` builds the case that matters for the counter's correctness:
# a protocol run produced by some OTHER scoring completion (pre-synthesis, cold
# start, the API) on a tree that nobody grew.
@pytest.fixture()
def converged_run_factory():
    def _make(db, *, max_delta: float, epsilon: float, debate=None, expanded: bool = True):
        from app.exploration.expansion_dispatch import (
            ADAPTIVE_EXPANSION_CONFIG_KEY,
            ROUNDS_COMPLETED_KEY,
            adaptive_expansion_state,
            rounds_completed,
        )
        from app.models.entities import AnalyzerRun, next_analyzer_run_seq
        from app.protocol.runner import CONVERGENCE_VERSION, PROTOCOL_ANALYSIS_TYPE
        from app.services.dialectical_v2 import first_branch

        from test_v2_expand import codex_worker, make_v2_debate

        if debate is None:
            debate = make_v2_debate(db, codex_worker(db))
        if expanded:
            state = adaptive_expansion_state(debate)
            state[ROUNDS_COMPLETED_KEY] = rounds_completed(debate) + 1
            debate.config = {**(debate.config or {}), ADAPTIVE_EXPANSION_CONFIG_KEY: state}
        run = AnalyzerRun(
            debate_id=debate.id,
            branch_id=first_branch(db, debate.id).id,
            analyzer_type=PROTOCOL_ANALYSIS_TYPE,
            output={
                "convergence": {
                    "converged": max_delta <= epsilon,
                    "maxDelta": max_delta,
                    "nodesCompared": 4,
                    "nodesAdded": 0,
                    "nodesRemoved": 0,
                    "epsilon": epsilon,
                },
                "convergenceVersion": CONVERGENCE_VERSION,
            },
            status="complete",
            provenance={"scoring_source": "protocol_analysis", "debate_id": debate.id},
        )
        # next_analyzer_run_seq assigns run.seq, db.add()s and db.flush()es as
        # one lock-covered critical section -- do NOT db.add() separately.
        # seq is what orders successive waves; created_at ties are routine.
        next_analyzer_run_seq(db, run)
        db.commit()
        return debate, run.id

    return _make


@pytest.fixture()
def db():
    # Per-connection SQLite state survives in the engine's pool across tests
    # and breaks order-independence: PRAGMAs set by a test on a pooled
    # connection outlive it (the connect-time pragma listener only fires on
    # fresh connects), and the drop_all/create_all rebuild below rotates
    # through the FIFO pool, leaving connections whose cached schema predates
    # the rebuild -- their first PRAGMA (e.g. index_list during inspection)
    # then answers from the stale cache. Dispose the pool so every test runs
    # on fresh connections.
    engine.dispose()
    init_db()
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as session:
        ensure_user_token(session, "user_test_token")
        yield session


@pytest.fixture()
def independent_writer_can_commit():
    """Callable -> True iff a SECOND connection can commit a write RIGHT NOW.

    The seam probe for "is this code path holding SQLite's single writer?".
    Call it from inside a stubbed long call (judge CLI, planner CLI, citation
    fetch) to assert that the rest of the coordinator -- worker heartbeats'
    `UPDATE workers SET last_seen`, job lease refreshes, generation completion
    -- can still make progress while that call is out. A path that flushes
    before a long call holds the RESERVED writer for its whole duration and
    starves every other writer into busy_timeout expiry and "database is
    locked" (the 2026-07-24 coordinator wedge).

    Probed at the connection level, NOT with `db.in_transaction()`: the
    pysqlite driver does not emit BEGIN until a DML statement runs, so
    SQLAlchemy reports an open transaction for read-only sessions that hold no
    SQLite lock at all. What starves other writers is the lock, so the honest
    probe is whether anyone else can still commit.

    busy_timeout is pinned low on the probe connection so a held writer fails
    the probe in milliseconds instead of blocking the suite for the 30s
    production timeout (app.core.db.set_sqlite_pragma).
    """

    def _probe() -> bool:
        with SessionLocal() as probe:
            probe.execute(text("PRAGMA busy_timeout=200"))
            try:
                probe.add(Setting(key=f"writer-probe-{uuid4().hex}", value={"probe": True}))
                try:
                    probe.commit()
                except OperationalError:
                    probe.rollback()
                    return False
                return True
            finally:
                # Restore the production value before this connection goes back
                # to the pool: closing a Session returns the connection, it does
                # not reconnect, and the connect-time pragma listener only fires
                # on a fresh connect (see the `db` fixture's dispose comment).
                probe.execute(text("PRAGMA busy_timeout=30000"))
                probe.commit()

    return _probe


@pytest.fixture(autouse=True)
def _no_internal_scoring_thread(monkeypatch):
    """Test-suite baseline: v2 completion's fire-and-forget internal scoring
    trigger (W2, app.scoring.jobs.trigger_internal_scoring_after_completion)
    is stubbed to a no-op. The repo's config/agents.yaml configures a real
    judge agent, so without this stub every completed v2 pipeline would spawn
    a daemon thread that claims the debate's pending scoring job and attempts
    REAL codex scoring -- racing test teardown and mutating job/analyzer rows
    nondeterministically. Tests that exercise the trigger itself monkeypatch
    it back (or call drive_internal_scoring_for_debate directly) -- see
    tests/test_scoring_verdict_refresh.py.
    """
    monkeypatch.setattr(
        "app.services.dialectical_v2.trigger_internal_scoring_after_completion",
        lambda debate_id: None,
    )

