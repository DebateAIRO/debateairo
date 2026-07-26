"""LLM-planned + composed perspectives.

Two behaviors layered onto the dynamic-perspective derivation:

1. COMPOSITION (always on with DIALECTICAL_DYNAMIC_PERSPECTIVES): a classified
   claim type no longer REPLACES the generalist lenses -- the type-specific set
   is extended with the missing generalist anchors (Ethical POV, Practical POV),
   capped by DIALECTICAL_MAX_PERSPECTIVES. The "unknown" fallback quartet is
   unchanged (it already carries the anchors).

2. LLM PLANNING (DIALECTICAL_LLM_PERSPECTIVES, default TRUE in production,
   test baseline OFF via conftest): debate creation asks the configured
   perspective_planner agent to select the most incisive lens set for THIS
   topic, seeded with the rule-based candidates. Any failure -- role not
   configured, provider error, invalid JSON, too few valid lenses -- falls
   back silently to the rule-based composition. Debate creation must never
   fail or block on the planner.

Provenance: debate.config.perspective_derivation gains `source`
("llm" | "markers" | "fallback") and `lenses` {label: lens}; the v2_pov render
path prefers the debate-persisted lens text so LLM-authored lenses reach the
worker prompt.
"""
from __future__ import annotations

import json

from sqlalchemy import select

from app.models.entities import Job, Node, Worker, now_utc
from app.providers import AgentConfig, FakeProvider, ProviderRegistry
from app.services import dialectical_v2 as service
from app.services.dialectical_v2 import dynamic_perspectives, render_v2_job_prompt

FLAG_DYNAMIC = "DIALECTICAL_DYNAMIC_PERSPECTIVES"
FLAG_LLM = "DIALECTICAL_LLM_PERSPECTIVES"


def codex_worker(db) -> Worker:
    worker = Worker(
        name="codex-worker",
        token_hash="test-token",
        capabilities=["gpt-5.6sol-medium"],
        last_seen=now_utc(),
        status="online",
    )
    db.add(worker)
    db.commit()
    return worker


def pov_roles(db, debate) -> list[str]:
    return [
        job.required_role
        for job in db.scalars(
            select(Job)
            .where(Job.debate_id == debate.id, Job.job_type == "v2_pov")
            .order_by(Job.created_at)
        ).all()
    ]


def planner_registry(response_text: str) -> ProviderRegistry:
    provider = FakeProvider({"perspective_planner": response_text})
    agents = {
        "perspective_planner": AgentConfig(
            provider="fake", model="fake-model", temperature=0.0, max_tokens=None
        )
    }
    return ProviderRegistry(agents=agents, providers={"fake": provider})


def planner_payload(perspectives: list[dict], claim_type: str = "normative") -> str:
    return json.dumps({"claim_type": claim_type, "perspectives": perspectives})


# ---------------------------------------------------------------------------
# Composition: type-specific lenses extend (not replace) the generalist anchors
# ---------------------------------------------------------------------------


def test_causal_set_composes_specialized_lenses_with_missing_anchors(monkeypatch) -> None:
    monkeypatch.setenv(FLAG_DYNAMIC, "true")
    labels = [label for _t, label, _l in dynamic_perspectives("Does social media use cause depression?")]
    assert labels == ["Mechanism POV", "Confounding POV", "Evidence POV", "Ethical POV", "Practical POV"]


def test_normative_set_deduplicates_anchor_already_in_family(monkeypatch) -> None:
    monkeypatch.setenv(FLAG_DYNAMIC, "true")
    labels = [label for _t, label, _l in dynamic_perspectives("Should cities ban cars downtown?")]
    # Ethical POV already leads the normative family -- only Practical is added.
    assert labels == ["Ethical POV", "Stakeholder POV", "Rights POV", "Consequence POV", "Practical POV"]


def test_composition_respects_max_perspectives_cap(monkeypatch) -> None:
    monkeypatch.setenv(FLAG_DYNAMIC, "true")
    monkeypatch.setenv("DIALECTICAL_MAX_PERSPECTIVES", "4")
    labels = [label for _t, label, _l in dynamic_perspectives("Does social media use cause depression?")]
    assert labels == ["Mechanism POV", "Confounding POV", "Evidence POV", "Ethical POV"]


def test_unknown_topic_keeps_generalist_quartet(monkeypatch) -> None:
    monkeypatch.setenv(FLAG_DYNAMIC, "true")
    labels = [label for _t, label, _l in dynamic_perspectives("how can we end the AI race between China and USA?")]
    assert labels == ["Scientific POV", "Statistical POV", "Ethical POV", "Practical POV"]


# ---------------------------------------------------------------------------
# LLM planning: happy path
# ---------------------------------------------------------------------------


def test_llm_planned_lenses_drive_branches_provenance_and_prompts(db, monkeypatch) -> None:
    monkeypatch.setenv(FLAG_DYNAMIC, "true")
    monkeypatch.setenv(FLAG_LLM, "true")
    codex_worker(db)
    response = planner_payload(
        [
            {"label": "Incentives POV", "lens": "Evaluate the structural incentives each state faces.", "why": "core driver"},
            {"label": "Verification POV", "lens": "Evaluate whether compliance with limits can be verified.", "why": "trust gap"},
            {"label": "Ethical POV", "lens": "Evaluate harms, rights, and who bears the risks.", "why": "anchor"},
            {"label": "Practical POV", "lens": "Evaluate what agreements are operationally feasible.", "why": "anchor"},
        ],
        claim_type="normative",
    )
    monkeypatch.setattr(service, "_planner_registry", lambda: planner_registry(response))

    debate = service.create_dialectical_debate(db, "how can we end the AI race between China and USA?", {})

    assert pov_roles(db, debate) == ["Incentives POV", "Verification POV", "Ethical POV", "Practical POV"]
    derivation = debate.config["perspective_derivation"]
    assert derivation["source"] == "llm"
    assert derivation["claim_type"] == "normative"
    assert derivation["lens_set"] == ["Incentives POV", "Verification POV", "Ethical POV", "Practical POV"]
    assert derivation["lenses"]["Incentives POV"] == "Evaluate the structural incentives each state faces."

    first = db.scalars(
        select(Job).where(Job.debate_id == debate.id, Job.job_type == "v2_pov").order_by(Job.created_at)
    ).first()
    _system, user = render_v2_job_prompt(db, first)
    assert "Evaluate the structural incentives each state faces." in user


def test_llm_lens_count_is_capped_and_labels_fit_required_role(db, monkeypatch) -> None:
    monkeypatch.setenv(FLAG_DYNAMIC, "true")
    monkeypatch.setenv(FLAG_LLM, "true")
    monkeypatch.setenv("DIALECTICAL_MAX_PERSPECTIVES", "3")
    codex_worker(db)
    perspectives = [
        {"label": f"An Extremely Long Perspective Label Number {index} POV", "lens": f"Evaluate angle {index}.", "why": ""}
        for index in range(6)
    ]
    monkeypatch.setattr(
        service, "_planner_registry", lambda: planner_registry(planner_payload(perspectives))
    )

    debate = service.create_dialectical_debate(db, "how can we end the AI race between China and USA?", {})

    roles = pov_roles(db, debate)
    assert len(roles) == 3  # capped
    for role in roles:
        assert 0 < len(role) <= 32  # Job.required_role String(32) safety
    nodes = db.scalars(
        select(Node).where(Node.debate_id == debate.id, Node.parent_id == debate.root_node_id)
    ).all()
    assert sorted(node.claim for node in nodes) == sorted(roles)


# ---------------------------------------------------------------------------
# LLM planning: every failure falls back to the rule-based composition
# ---------------------------------------------------------------------------


def test_invalid_planner_json_falls_back_to_marker_composition(db, monkeypatch) -> None:
    monkeypatch.setenv(FLAG_DYNAMIC, "true")
    monkeypatch.setenv(FLAG_LLM, "true")
    codex_worker(db)
    monkeypatch.setattr(service, "_planner_registry", lambda: planner_registry("this is not json"))

    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})

    derivation = debate.config["perspective_derivation"]
    assert derivation["source"] == "markers"
    assert pov_roles(db, debate) == [
        "Ethical POV",
        "Stakeholder POV",
        "Rights POV",
        "Consequence POV",
        "Practical POV",
    ]


def test_planner_infrastructure_error_falls_back_and_never_fails_creation(db, monkeypatch) -> None:
    monkeypatch.setenv(FLAG_DYNAMIC, "true")
    monkeypatch.setenv(FLAG_LLM, "true")
    codex_worker(db)

    def _broken_registry():
        raise RuntimeError("codex CLI unavailable")

    monkeypatch.setattr(service, "_planner_registry", _broken_registry)

    debate = service.create_dialectical_debate(db, "how can we end the AI race between China and USA?", {})

    derivation = debate.config["perspective_derivation"]
    assert derivation["source"] == "fallback"  # unknown claim type, generalist quartet
    assert pov_roles(db, debate) == ["Scientific POV", "Statistical POV", "Ethical POV", "Practical POV"]


def test_too_few_valid_llm_lenses_falls_back(db, monkeypatch) -> None:
    monkeypatch.setenv(FLAG_DYNAMIC, "true")
    monkeypatch.setenv(FLAG_LLM, "true")
    codex_worker(db)
    response = planner_payload([{"label": "Only One POV", "lens": "Evaluate the only angle.", "why": ""}])
    monkeypatch.setattr(service, "_planner_registry", lambda: planner_registry(response))

    debate = service.create_dialectical_debate(db, "how can we end the AI race between China and USA?", {})

    assert debate.config["perspective_derivation"]["source"] == "fallback"
    assert pov_roles(db, debate) == ["Scientific POV", "Statistical POV", "Ethical POV", "Practical POV"]


def test_llm_flag_off_never_touches_the_planner(db, monkeypatch) -> None:
    monkeypatch.setenv(FLAG_DYNAMIC, "true")
    monkeypatch.setenv(FLAG_LLM, "false")
    codex_worker(db)

    def _must_not_be_called():
        raise AssertionError("planner registry must not be constructed when the flag is off")

    monkeypatch.setattr(service, "_planner_registry", _must_not_be_called)

    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})

    assert debate.config["perspective_derivation"]["source"] == "markers"


# ---------------------------------------------------------------------------
# Seam contract: the planner CLI must never run inside an open write
# transaction (the 2026-07-24-class coordinator wedge)
# ---------------------------------------------------------------------------


def probing_planner_registry(response_text: str, observed: list[bool], probe) -> ProviderRegistry:
    """planner_registry, but every generate() first records whether the
    coordinator's single SQLite writer was free at call time."""
    registry = planner_registry(response_text)
    inner = registry.providers["fake"]

    class WriterProbingProvider:
        def generate(self, *args, **kwargs):
            observed.append(probe())
            return inner.generate(*args, **kwargs)

    registry.providers["fake"] = WriterProbingProvider()
    return registry


def test_perspective_planner_cli_runs_outside_any_open_write_transaction(
    db, monkeypatch, independent_writer_can_commit
) -> None:
    """Regression for the coordinator-wide wedge that app.scoring.service's F1
    fix cured for the judge panel but debate creation never got.

    Mechanism: create_dialectical_debate flushed the Debate, root Node and
    DebateBranch rows -- taking SQLite's single RESERVED writer -- and only
    THEN called the perspective planner, a codex CLI subprocess bounded at
    DIALECTICAL_PERSPECTIVE_PLANNER_TIMEOUT_S (45s default, 120s max). For that
    entire window every other writer in the process (worker heartbeats'
    `UPDATE workers SET last_seen`, job lease refreshes, generation completion)
    blocked on busy_timeout and then failed with "database is locked".

    The seam contract: the planner runs before ANY write, so an unrelated
    writer can still commit while the CLI is out. Ordering is the whole fix --
    the planner needs only the topic and the rule-based candidates, never the
    database -- which also keeps debate creation a single atomic transaction
    (no half-created "generating" debate if the planner or job queueing dies).
    """
    monkeypatch.setenv(FLAG_DYNAMIC, "true")
    monkeypatch.setenv(FLAG_LLM, "true")
    codex_worker(db)
    observed: list[bool] = []
    response = planner_payload(
        [
            {"label": "Mechanism POV", "lens": "Evaluate the causal mechanism.", "why": ""},
            {"label": "Ethical POV", "lens": "Evaluate who bears the cost.", "why": ""},
            {"label": "Practical POV", "lens": "Evaluate whether it is feasible.", "why": ""},
        ]
    )
    monkeypatch.setattr(
        service,
        "_planner_registry",
        lambda: probing_planner_registry(response, observed, independent_writer_can_commit),
    )

    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})

    assert debate.config["perspective_derivation"]["source"] == "llm"
    assert pov_roles(db, debate) == ["Mechanism POV", "Ethical POV", "Practical POV"]
    assert observed == [True], (
        "the perspective planner CLI ran while debate creation held SQLite's "
        "single writer: for the CLI's whole run every other coordinator writer "
        "blocks on busy_timeout and then fails with 'database is locked' "
        f"(observed independent-writer-can-commit={observed})"
    )
