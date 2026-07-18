"""Lane 3 tests: dynamic perspectives replace the fixed 4-POV creation.

DIALECTICAL_DYNAMIC_PERSPECTIVES (default TRUE in production) derives a
claim-type-appropriate lens set at debate creation instead of the hardcoded
quartet. The test-suite baseline runs the legacy path (conftest sets the flag
off); these tests explicitly opt into the dynamic path (or delete the env var
to exercise the production default).

Design under test:
  - Perspective SELECTION is deterministic + provider-free (rule-based
    classify_claim_type), producing at least 2 perspectives with no fixed
    universal count.
  - node_type is always a legacy POV type (String(16)-safe, qbaf-adapter-safe);
    dynamic identity lives in the LABEL + lens description.
  - v2_pov job prompts carry the dynamic lens description.
  - Synthesis gating is count-agnostic (works for N != 4).
"""
from __future__ import annotations

import asyncio

import pytest
from sqlalchemy import select

from app.main import app  # noqa: F401 - warm up the import graph (import-cycle guard)
from app.models.entities import Debate, Job, Node, Worker, now_utc
from app.qbaf.debate_adapter import _DEFAULT_CONTAINER_TYPES, _SUPPORT_TYPES
from app.services import dialectical_v2 as service
from app.services.dialectical_v2 import (
    DYNAMIC_LENS_DESCRIPTIONS,
    POV_BRANCHES,
    dynamic_perspectives,
    pending_branch_containers,
    render_v2_job_prompt,
)
from app.services.orchestrator import claim_pending_job, complete_job
from app.services.serialization import debate_to_dict

FLAG = "DIALECTICAL_DYNAMIC_PERSPECTIVES"
_LEGACY_POV_TYPES = {node_type for node_type, _label in POV_BRANCHES}


def codex_worker(db) -> Worker:
    worker = Worker(
        name="codex-worker",
        token_hash="test-token",
        capabilities=["codex-gpt-5.5"],
        last_seen=now_utc(),
        status="online",
    )
    db.add(worker)
    db.commit()
    return worker


def generic_pov_output(worker: Worker, job_id: str, pov: str) -> dict:
    """POV contract payload that works for ANY perspective label (the legacy
    worker_pov_output only handles the four fixed labels)."""
    return {
        "title": f"{pov} assessment",
        "content": f"A concise {pov} assessment based on the strongest available reasoning.",
        "strongest_pro": {
            "title": f"{pov} strongest pro",
            "content": f"The strongest {pov} pro relies on the clearest relevant evidence.",
            "pro": {"title": f"{pov} pro support", "content": f"Detail strengthening the {pov} pro."},
            "con": {"title": f"{pov} pro limitation", "content": f"Detail limiting the {pov} pro."},
        },
        "strongest_con": {
            "title": f"{pov} strongest con",
            "content": f"The strongest {pov} con identifies the most important risk.",
            "pro": {"title": f"{pov} con support", "content": f"Detail strengthening the {pov} con."},
            "con": {"title": f"{pov} con limitation", "content": f"Detail limiting the {pov} con."},
        },
        "provenance": {
            "model_id": "codex-gpt-5.5",
            "worker_id": worker.id,
            "prompt_id": f"prompt-{job_id}",
            "job_id": job_id,
        },
    }


def pov_jobs(db, debate: Debate) -> list[Job]:
    return list(
        db.scalars(
            select(Job)
            .where(Job.debate_id == debate.id, Job.job_type == "v2_pov")
            .order_by(Job.created_at)
        ).all()
    )


# ---------------------------------------------------------------------------
# Production default: dynamic active when the env var is unset
# ---------------------------------------------------------------------------


def test_production_default_enables_dynamic_perspectives(db, monkeypatch) -> None:
    monkeypatch.delenv(FLAG, raising=False)  # genuinely-unset -> bool_env default TRUE
    codex_worker(db)

    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    roles = [job.required_role for job in pov_jobs(db, debate)]

    # A normative topic yields the normative lens set, NOT the legacy quartet.
    assert roles == ["Ethical POV", "Stakeholder POV", "Rights POV", "Consequence POV"]


# ---------------------------------------------------------------------------
# Dynamic creation per claim type (varying counts, no fixed universal count)
# ---------------------------------------------------------------------------


def test_dynamic_causal_topic_yields_three_perspectives(db, monkeypatch) -> None:
    monkeypatch.setenv(FLAG, "true")
    codex_worker(db)

    debate = service.create_dialectical_debate(db, "Does social media use cause depression?", {})
    roles = [job.required_role for job in pov_jobs(db, debate)]

    assert roles == ["Mechanism POV", "Confounding POV", "Evidence POV"]


def test_dynamic_comparative_topic_yields_two_perspectives(db, monkeypatch) -> None:
    monkeypatch.setenv(FLAG, "true")
    codex_worker(db)

    debate = service.create_dialectical_debate(db, "Is nuclear power safer than coal?", {})
    roles = [job.required_role for job in pov_jobs(db, debate)]

    assert roles == ["Baseline POV", "Measurement POV"]
    assert len(roles) >= 2  # honesty floor: at least two perspectives


def test_dynamic_mixed_topic_yields_five_perspectives(db, monkeypatch) -> None:
    monkeypatch.setenv(FLAG, "true")
    codex_worker(db)

    # "studies show" (empirical) + "causes" (causal) -> mixed -> 5 perspectives.
    debate = service.create_dialectical_debate(db, "Studies show that banning cars causes fewer accidents", {})
    roles = [job.required_role for job in pov_jobs(db, debate)]

    assert len(roles) == 5
    assert roles[-1] == "Integrative POV"


# ---------------------------------------------------------------------------
# node_type safety: legacy-compatible + String(16)
# ---------------------------------------------------------------------------


def test_dynamic_node_types_are_legacy_compatible_and_fit_string16(db, monkeypatch) -> None:
    monkeypatch.setenv(FLAG, "true")
    codex_worker(db)

    debate = service.create_dialectical_debate(db, "Studies show that banning cars causes fewer accidents", {})
    pov_nodes = list(
        db.scalars(
            select(Node).where(Node.debate_id == debate.id, Node.parent_id == debate.root_node_id)
        ).all()
    )

    assert len(pov_nodes) == 5
    for node in pov_nodes:
        assert node.node_type in _LEGACY_POV_TYPES
        assert len(node.node_type) <= 16
        # Every dynamic POV type is a scoring-recognized support container, so
        # edges/classification are never corrupted.
        assert node.node_type in _SUPPORT_TYPES
        assert node.node_type in _DEFAULT_CONTAINER_TYPES
        # required_role carries the label and must fit Job.required_role String(32).
        assert len(node.claim) <= 32


def test_dynamic_perspectives_helper_is_deterministic() -> None:
    a = dynamic_perspectives("Does social media use cause depression?")
    b = dynamic_perspectives("Does social media use cause depression?")
    assert a == b
    assert [nt for nt, _label, _lens in a] == ["SCIENTIFIC_POV", "STATISTICAL_POV", "ETHICAL_POV"]


# ---------------------------------------------------------------------------
# v2_pov prompt carries the dynamic lens
# ---------------------------------------------------------------------------


def test_dynamic_pov_job_prompt_carries_dynamic_lens(db, monkeypatch) -> None:
    monkeypatch.setenv(FLAG, "true")
    codex_worker(db)

    debate = service.create_dialectical_debate(db, "Does social media use cause depression?", {})
    first = pov_jobs(db, debate)[0]
    assert first.required_role == "Mechanism POV"

    _system, user = render_v2_job_prompt(db, first)
    lens = DYNAMIC_LENS_DESCRIPTIONS["Mechanism POV"]
    assert lens  # non-empty
    assert lens in user


# ---------------------------------------------------------------------------
# Synthesis gating is count-agnostic (N=3 and N=5)
# ---------------------------------------------------------------------------


def _make_debate_with_n_pov_children(db, n: int) -> tuple[Debate, list[Node]]:
    debate = Debate(topic="topic", status="generating", config={})
    db.add(debate)
    db.flush()
    root = Node(
        debate_id=debate.id,
        parent_id=None,
        node_type="ROOT_CLAIM",
        depth=0,
        position=0,
        claim="topic",
        status="complete",
        materialized_path="/0",
    )
    db.add(root)
    db.flush()
    debate.root_node_id = root.id
    children = []
    for position in range(n):
        child = Node(
            debate_id=debate.id,
            parent_id=root.id,
            node_type="SCIENTIFIC_POV",
            depth=1,
            position=position,
            claim=f"Perspective {position}",
            status="pending",
            materialized_path=f"/0/{position}",
        )
        db.add(child)
        children.append(child)
    db.flush()
    db.commit()
    return debate, children


@pytest.mark.parametrize("n", [3, 5])
def test_synthesis_gate_counts_all_n_perspectives(db, n: int) -> None:
    debate, children = _make_debate_with_n_pov_children(db, n)

    # Gate blocks while any perspective is incomplete, for any N.
    assert len(pending_branch_containers(db, debate.id, debate.root_node_id)) == n
    for child in children[:-1]:
        child.status = "complete"
    db.flush()
    assert len(pending_branch_containers(db, debate.id, debate.root_node_id)) == 1

    children[-1].status = "complete"
    db.flush()
    assert pending_branch_containers(db, debate.id, debate.root_node_id) == []


def test_dynamic_three_perspective_debate_queues_synthesis_only_after_all_complete(db, monkeypatch) -> None:
    monkeypatch.setenv(FLAG, "true")
    worker = codex_worker(db)

    debate = service.create_dialectical_debate(db, "Does social media use cause depression?", {})
    assert len(pov_jobs(db, debate)) == 3

    def synthesis_queued() -> bool:
        return db.scalar(
            select(Job).where(Job.debate_id == debate.id, Job.job_type == "v2_synthesize")
        ) is not None

    completed = 0
    while True:
        job = claim_pending_job(db, worker)
        if job is None or job.job_type != "v2_pov":
            break
        # No synthesis job may exist until the last POV is completed.
        assert not synthesis_queued()
        asyncio.run(complete_job(db, job, generic_pov_output(worker, job.id, job.required_role), {"latency_ms": 5}))
        completed += 1

    assert completed == 3
    assert synthesis_queued()  # queued exactly once all 3 perspectives finished


# ---------------------------------------------------------------------------
# Serializer emits the dynamic lens label (web integration contract)
# ---------------------------------------------------------------------------
# The web tree renderer prefers a backend-provided `label` field on each node
# payload over node_type-derived names (web/lib/debatePresentation.ts
# branchLabelOf). Dynamic perspectives cycle legacy node_types while the real
# lens identity lives in Node.claim, so without `label` in node_to_dict a node
# labeled "Mechanism POV" (node_type SCIENTIFIC_POV) would render "Scientific".


def test_node_payload_emits_dynamic_label_for_cycled_node_types(db, monkeypatch) -> None:
    monkeypatch.setenv(FLAG, "true")
    codex_worker(db)

    debate = service.create_dialectical_debate(db, "Does social media use cause depression?", {})
    detail = debate_to_dict(db, db.get(Debate, debate.id))
    children = detail["tree"]["children"]

    assert [child["label"] for child in children] == [
        "Mechanism POV",
        "Confounding POV",
        "Evidence POV",
    ]
    # The wrong-name scenario from the web lane: cycled node_type must NOT win.
    first = children[0]
    assert first["node_type"] == "SCIENTIFIC_POV"
    assert first["label"] == "Mechanism POV"


def test_node_payload_emits_label_when_dynamic_reuses_a_legacy_name_on_other_type(db, monkeypatch) -> None:
    monkeypatch.setenv(FLAG, "true")
    codex_worker(db)

    # Normative set: first perspective is labeled "Ethical POV" but cycling
    # assigns node_type SCIENTIFIC_POV -- label must be emitted so the FE does
    # not derive "Scientific" from the node_type.
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    first = debate_to_dict(db, db.get(Debate, debate.id))["tree"]["children"][0]

    assert first["node_type"] == "SCIENTIFIC_POV"
    assert first["label"] == "Ethical POV"


def test_node_payload_label_null_when_claim_matches_legacy_pairing(db, monkeypatch) -> None:
    monkeypatch.setenv(FLAG, "true")
    codex_worker(db)

    # Empirical set starts with ("Scientific POV", ...) on node_type
    # SCIENTIFIC_POV -- identical to the legacy pairing, so label stays null
    # and the FE keeps its curated legacy lens name.
    debate = service.create_dialectical_debate(
        db, "Recent research and data show remote work adoption measured at 40%", {}
    )
    children = debate_to_dict(db, db.get(Debate, debate.id))["tree"]["children"]

    assert [child["claim"] for child in children] == [
        "Scientific POV",
        "Statistical POV",
        "Data-quality POV",
    ]
    assert children[0]["label"] is None  # SCIENTIFIC_POV + "Scientific POV" = legacy pairing
    assert children[1]["label"] is None  # STATISTICAL_POV + "Statistical POV" = legacy pairing
    assert children[2]["label"] == "Data-quality POV"  # ETHICAL_POV + dynamic name


def test_node_payload_label_null_for_legacy_quartet_and_non_pov_nodes(db, monkeypatch) -> None:
    monkeypatch.setenv(FLAG, "false")
    worker = codex_worker(db)

    debate = service.create_dialectical_debate(db, "Does social media use cause depression?", {})
    job = claim_pending_job(db, worker)
    assert job is not None and job.job_type == "v2_pov"
    asyncio.run(complete_job(db, job, generic_pov_output(worker, job.id, job.required_role), {"latency_ms": 5}))

    detail = debate_to_dict(db, db.get(Debate, debate.id))
    tree = detail["tree"]

    assert tree["label"] is None  # ROOT_CLAIM is not a lens
    assert [child["label"] for child in tree["children"]] == [None, None, None, None]
    completed = next(child for child in tree["children"] if child["status"] == "complete")
    for stance in completed["children"]:  # PRO/CON cards are not lenses
        if stance["node_type"] in {"PRO", "CON"}:
            assert stance["label"] is None


# ---------------------------------------------------------------------------
# Legacy path unchanged when the flag is off
# ---------------------------------------------------------------------------


def test_legacy_quartet_when_flag_disabled(db, monkeypatch) -> None:
    monkeypatch.setenv(FLAG, "false")
    codex_worker(db)

    debate = service.create_dialectical_debate(db, "Does social media use cause depression?", {})
    pov_nodes = list(
        db.scalars(
            select(Node).where(Node.debate_id == debate.id, Node.parent_id == debate.root_node_id)
        ).all()
    )

    assert [node.node_type for node in pov_nodes] == [
        "SCIENTIFIC_POV",
        "STATISTICAL_POV",
        "ETHICAL_POV",
        "PRACTICAL_POV",
    ]
    assert [job.required_role for job in pov_jobs(db, debate)] == [
        "Scientific POV",
        "Statistical POV",
        "Ethical POV",
        "Practical POV",
    ]
