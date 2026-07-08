# Phase 5a: Epistemic Protocol Skeleton (triage + persisted state machine) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add the skeleton of the 8-phase epistemic protocol on top of the existing `dialectical_v2` flow, without rewriting it: (1) a pure, deterministic triage classifier (`5.1_triage`) that decides difficulty/depth/verification needs from the topic text and config overrides, and (2) a persisted protocol-state machine stored inside `Debate.config["protocol_state"]` (no schema change) that honestly tracks phase status — `"not_implemented"` for phases 5.4-5.7, which do not exist yet. Wire triage + state initialization into `create_dialectical_debate`, and advance the 5.2/5.3/5.8 markers at the points where decomposition, POV/agent generation, and synthesis already complete. This is pure scaffolding: no LLM calls, no new tables, no job-routing changes, no web changes.

**Tech Stack:** Python 3.12, SQLAlchemy, FastAPI, pytest (coordinator suite: `cd coordinator && python -m pytest tests`).

## UNVERIFIED — implementer must confirm before/while implementing

1. **`create_dialectical_debate` lives in `coordinator/app/services/dialectical_v2.py` (line 1285), NOT in `orchestrator.py`.** The mission brief's phrasing ("orchestrator.py") only matches `merged_debate_config` (`coordinator/app/services/orchestrator.py:46`), which `create_dialectical_debate` calls to build `debate_config` before constructing `Debate(...)`. The single integration point for initializing `protocol_state` is inside `create_dialectical_debate`, right after `debate_config = merged_debate_config(config)` (line 1289) and before `debate = Debate(topic=topic, status="generating", config=debate_config)` (line 1291) — merge the protocol state dict into `debate_config` there. Implementer must re-read lines 1285-1327 once before editing to confirm nothing shifted.
2. **`max_depth` bounds confirmed as `bounded_config_int(merged, "max_depth", 2, 1, 5)`** (`coordinator/app/services/orchestrator.py:54`) — default 2, clamped 1-5. This is the "existing config max_depth when present" the mission refers to for depth_budget clamping. Since `merged_debate_config` ALWAYS sets `max_depth` (default 2 if absent), in practice `depth_budget` will always be clamped by it unless triage runs before `merged_debate_config` — implementer must decide call order (this plan calls triage against the ALREADY-merged config, so `max_depth` is always present) and confirm this is the intended semantics, not a bug.
3. **5.2/5.3 completion points both occur synchronously inside `create_dialectical_debate` itself**, not in a later async completion handler: POV branch `Node` rows are created in the `for position, (node_type, label) in enumerate(POV_BRANCHES):` loop (lines 1311-1324), and the `v2_pov` jobs are queued in the same loop via `queue_v2_job(db, debate, "v2_pov", label, model_id, pov_node.id)` (line 1324) — both finish before `create_dialectical_debate` returns (line 1327). This means, for THIS skeleton slice, phases `5.2_decomposition` and `5.3_generation` can only be honestly marked `"complete"` once the loop finishes (decomposition = POV node tree exists; generation = jobs queued, not yet that agent outputs exist). If the implementer judges "5.3_generation complete" should instead mean "agent/POV outputs have actually landed" (i.e. deferred to `complete_v2_worker_job`'s `v2_pov`/`v2_agent_run` branches, `dialectical_v2.py:1143` and `1173`), that is a legitimate alternative reading — but it requires a SECOND best-effort hook in `complete_v2_worker_job` rather than the one at creation time. This plan takes the conservative "structure exists" reading (mark 5.2 and 5.3 complete at creation, right after the POV loop) because it needs no new hook sites and keeps this phase's blast radius to ONE integration point per the mission's design note ("ONE integration point"); implementer must flag if product wants the stricter reading instead.
4. **5.8 hook point confirmed:** `persist_v2_synthesis` (`coordinator/app/services/dialectical_v2.py:836-886`) sets `debate.status = "complete"` (line 878) and `debate.completed_at = now_utc()` (line 879) right before `commit_write(db)` (line 884). This is the single confirmed hook for advancing `5.8_synthesis` to `"complete"` — insert the best-effort marker update between line 879 and `record_provenance(...)` (line 880), or anywhere before `commit_write(db)` at line 884, so it lands in the same transaction. Implementer must re-read this function once before editing.
5. **No existing "advance protocol phase" caller exists anywhere** — this is entirely new code being wired in for the first time. There is no prior art for "best-effort marker update" patterns elsewhere in the codebase that this plan could mirror; the `try/except` wrapper described in Task 3 is this plan's own invention, not a copy of an established idiom. Implementer should sanity-check no better-fitting existing helper (e.g. a generic "best effort" decorator) exists first via a quick grep for `best_effort` or `# best-effort` before writing a new one.
6. **The `db` pytest fixture used throughout `test_dialectical_v2.py`** (e.g. `service.create_dialectical_debate(db, "...", {})`) is not defined in that file itself (no local `@pytest.fixture def db` found in a targeted grep) — it must come from `coordinator/tests/conftest.py`. Implementer must open `conftest.py` once to confirm the fixture's session/engine setup (in-memory vs file-based sqlite) before writing Task 3's db-backed tests, per the "no DB deletion" constraint below.
7. **Exact stakes-keyword list wording** in the "Decided design" section below is this plan's own draft, not lifted from any existing codebase list (no prior "stakes keywords" list was found in `app/scoring` or elsewhere) — implementer should treat the list in Task 1 as a starting point and is free to extend it if review flags gaps, but must not silently shrink it without noting why.

## Global Constraints

- **No commits.** Do not run `git add`/`git commit` for this phase; stop after tests are green and report status.
- **Anti-stall clause:** Run tests as ONE foreground Bash call with the `timeout` parameter set; never `run_in_background`, never `Monitor`. If it times out once, report BLOCKED — do not retry in a loop.
- **Pytest flags (always append):** `--basetemp=.tmp/pytest-claude -o cache_dir=.tmp/pytest-cache-claude -p no:cacheprovider`
- **17 known coordinator failures are pre-existing** (12 env-harness + 5 foreign guardian WIP) — these are NOT this phase's responsibility. Do not attempt to fix them; do not let their presence block a "suite green" claim for the tests this phase owns. Report them as pre-existing if seen.
- **Forbidden files — do not create, modify, or delete:** `Makefile`, `scripts/dev_guardian.py`, `scripts/start_dev.ps1`.
- **No DB deletion** of any kind, including in tests (use in-memory/session-scoped fixtures per existing test patterns).
- **No fake runtime data** — tests must use real fixture rows (real `Debate`/`Node`-shaped rows via `create_dialectical_debate`/`db` fixture as applicable), not hardcoded fake "looks-like-a-response" JSON standing in for a real computation path.
- **TDD strictly:** for every task, write the failing test first, run it and confirm the failure, then implement, then confirm green. Do not write implementation before a failing test exists for it.
- **DDD naming:** any new public strings (phase names, rationale text, status literals) must use claim/debate-domain language consistent with the rest of the codebase (e.g. "claim", "topic", "debate", "synthesis" — not generic "task"/"item" placeholders).
- **No-false-green law:** protocol phases must report HONEST statuses. Phases `5.4_cross_exam`, `5.5_verification`, `5.6_qbaf_scoring`, `5.7_convergence` do not exist yet in this slice and MUST be recorded as `"not_implemented"` — never `"complete"`, never silently omitted. Any attempt to mark a not-implemented phase as `"complete"` must raise, not silently succeed.

**Verified ground truth (dev lineage):**
- `coordinator/app/models/entities.py:32-45` — `Debate` ORM class: `config: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)` (line 38) is a free-form JSON column — no schema change needed to nest `protocol_state` inside it. Other fields: `id`, `topic`, `status` (default `"draft"`), `root_node_id`, `synthesis_id`, `created_at`, `completed_at`.
- `coordinator/app/services/orchestrator.py:46-61` — `merged_debate_config(config)`: merges `DEFAULT_DEBATE_CONFIG` with incoming config, then clamps `max_depth` (`bounded_config_int(merged, "max_depth", 2, 1, 5)`), `branching` (default 2, 2-6), `max_tokens` (default 800, 128-4000), and handles `role_overrides`. Returns the merged dict — this is what becomes `Debate.config` verbatim, so `protocol_state` must be merged in AFTER this call, not before (or it would be silently stripped/overwritten if `DEFAULT_DEBATE_CONFIG` doesn't know about it — confirm `DEFAULT_DEBATE_CONFIG`'s shape does not collide with a `protocol_state` key before finalizing, but since it's a fresh key name collision is unlikely).
- `coordinator/app/services/dialectical_v2.py:1285-1327` — `create_dialectical_debate(db, topic, config=None) -> Debate`: sanitizes topic, calls `merged_debate_config(config)`, requires a codex model, constructs `Debate(topic=topic, status="generating", config=debate_config)`, flushes, creates the `ROOT_CLAIM` root `Node`, sets `debate.root_node_id`, creates a `DebateBranch`, then loops over `POV_BRANCHES` creating one `Node` per POV lens (`SCIENTIFIC_POV`, `STATISTICAL_POV`, `ETHICAL_POV`, `PRACTICAL_POV` per Phase 4's confirmed vocabulary) and queuing one `v2_pov` job each via `queue_v2_job`, then `commit_write(db)`, `db.refresh(debate)`, returns `debate`.
- `coordinator/app/services/dialectical_v2.py:836-886` — `persist_v2_synthesis(db, debate, branch, job, worker, payload)`: validates all POV branches complete, builds a `Synthesis` row, sets `debate.synthesis_id`, `debate.status = "complete"` (line 878), `debate.completed_at = now_utc()` (line 879), records provenance, ensures default scoring, `commit_write(db)` (line 884), publishes `synthesis_completed` and `debate_complete` events. This is the confirmed 5.8 hook.
- `coordinator/app/services/dialectical_v2.py:1091-1282` — `complete_v2_worker_job(db, job, result, metadata)`: dispatches on `job.job_type` in this order as jobs complete: `"v2_plan"` → creates `AgentRun`s + queues `v2_agent_run` jobs; `"v2_pov"` → materializes the POV node, queues `v2_synthesize` once all POV branches complete; `"v2_agent_run"` → records agent output, queues `v2_synthesize` once all agent runs complete; `"v2_synthesize"` → calls `persist_v2_synthesis` (line 1207) and returns (note: no `commit_write` call after this branch in `complete_v2_worker_job` itself — `persist_v2_synthesis` already commits internally at line 884); plus `"v2_skill_create"`, `"v2_agent_create"`, `"v2_agent_argument"` for the alternate skill/agent-capability path. The two dialectical-flow completion paths that lead to synthesis are `v2_pov`-driven (POV/decomposition track) and `v2_agent_run`-driven (agent/skill-capability track) — both converge on `v2_synthesize` → `persist_v2_synthesis`.
- `coordinator/app/scoring/normalizer.py`: `classify_claim_type(text: str) -> tuple[ClaimType, list[str]]` (line 139) — deterministic, regex-only, stdlib `re`-based. Checks hedge markers first (`_find_hedge_markers`, line 59-60: `"might"`, `"may"`, `"could"`, `"some say"`, `"arguably"`, `"probably"`) which are recorded separately and never affect `claim_type`. Then checks 6 families in precedence order `comparative > prediction > causal > normative > definitional > empirical`; 0 matches → `("unknown", [])`; 1 match → that family; 2+ matches → `("mixed", <union of markers>)`. `normalize_claim(*, node_id: str, raw_text: str) -> NormalizedClaim` (line 280) is the higher-level entry point (not directly needed for triage, which only needs `classify_claim_type`).
- `coordinator/app/scoring/models.py:8-17` — `ClaimType = Literal["empirical", "causal", "normative", "definitional", "prediction", "comparative", "mixed", "unknown"]`. This is a `Literal` type alias (Pydantic-adjacent module), not a runtime enum class — no `ClaimType.NORMATIVE`-style members exist; comparisons must be plain string equality against these literals.
- `coordinator/tests/test_dialectical_v2.py` — test style confirmed: tests call `service.create_dialectical_debate(db, "<topic text>", {<config overrides>})` directly against a `db` fixture (session-scoped or per-test SQLAlchemy `Session`, defined in `coordinator/tests/conftest.py` — see UNVERIFIED #6), no separate `make_debate`/`make_node` factory helpers were found in this file; node/job assertions query `db.scalars(select(...))` directly. New protocol tests should follow this same direct-`db`-fixture, direct-`select()` style rather than inventing factory helpers.

---

### Task 1: Pure triage classifier

**Files:**
- Create: `coordinator/app/protocol/__init__.py` (empty, package marker)
- Create: `coordinator/app/protocol/triage.py`
- Test: `coordinator/tests/test_protocol_triage.py` (new)

**Interfaces:**
- Produces: `TriageDecision` (frozen dataclass: `difficulty: Literal["simple", "contested", "high_stakes"]`, `depth_budget: int`, `verification_required: bool`, `rationale: list[str]`, `classifier_version: str`); `triage_debate(topic: str, config: dict | None) -> TriageDecision`.
- Consumes: `app.scoring.normalizer.classify_claim_type` (stdlib-only, deterministic).

- [ ] **Step 1: Write failing tests**

```python
# coordinator/tests/test_protocol_triage.py
import pytest

from app.protocol.triage import TriageDecision, triage_debate


def test_simple_empirical_claim_defaults_to_simple():
    decision = triage_debate("The Earth orbits the Sun.", None)
    assert decision.difficulty == "simple"
    assert decision.depth_budget == 1
    assert decision.verification_required is False
    assert decision.rationale  # non-empty
    assert decision.classifier_version == "triage-v1"


@pytest.mark.parametrize(
    "topic",
    [
        "Cities should ban cars downtown.",  # normative ("should")
        "Higher taxes cause lower investment.",  # causal ("cause")
        "Inflation will rise by 2030.",  # prediction ("will")
    ],
)
def test_normative_causal_prediction_claims_are_contested(topic):
    decision = triage_debate(topic, None)
    assert decision.difficulty == "contested"
    assert decision.depth_budget == 2
    assert decision.verification_required is False


def test_hedge_flag_alone_pushes_to_contested():
    # "arguably" is a hedge marker with no other family match beyond empirical/etc;
    # use a topic whose only signal is the hedge flag.
    decision = triage_debate("This policy is arguably fine.", None)
    assert decision.difficulty == "contested"
    assert any("hedge" in reason.lower() for reason in decision.rationale)


@pytest.mark.parametrize(
    "topic",
    [
        "Should this drug be approved for children?",  # health
        "Should this contract be enforced in court?",  # legal
        "Should the bank raise interest rates?",  # financial
        "Should this bridge safety inspection be skipped?",  # safety
        "Should the city change its zoning policy?",  # policy
    ],
)
def test_stakes_keywords_trigger_high_stakes_and_verification(topic):
    decision = triage_debate(topic, None)
    assert decision.difficulty == "high_stakes"
    assert decision.verification_required is True
    assert decision.depth_budget == 3


def test_config_override_wins_over_classification():
    decision = triage_debate(
        "The Earth orbits the Sun.",
        {"protocol": {"difficulty": "high_stakes", "depth_budget": 3}},
    )
    assert decision.difficulty == "high_stakes"
    assert decision.depth_budget == 3
    assert any("override" in reason.lower() for reason in decision.rationale)


def test_depth_budget_clamped_by_existing_max_depth():
    decision = triage_debate(
        "Should the bank raise interest rates?",  # would be high_stakes -> budget 3
        {"max_depth": 1},
    )
    assert decision.depth_budget == 1
    assert any("max_depth" in reason.lower() or "clamp" in reason.lower() for reason in decision.rationale)


def test_triage_is_deterministic_for_same_input():
    a = triage_debate("Cities should ban cars downtown.", {"max_depth": 2})
    b = triage_debate("Cities should ban cars downtown.", {"max_depth": 2})
    assert a == b


def test_classifier_version_is_pinned():
    decision = triage_debate("The Earth orbits the Sun.", None)
    assert decision.classifier_version == "triage-v1"


def test_decision_is_frozen():
    decision = triage_debate("The Earth orbits the Sun.", None)
    with pytest.raises(Exception):
        decision.difficulty = "simple"  # type: ignore[misc]
```

- [ ] **Step 2: Run to verify failure**

Run: `cd coordinator && python -m pytest tests/test_protocol_triage.py -v --basetemp=.tmp/pytest-claude -o cache_dir=.tmp/pytest-cache-claude -p no:cacheprovider`
Expected: FAIL (`app.protocol.triage` does not exist yet).

- [ ] **Step 3: Implement**

```python
# coordinator/app/protocol/__init__.py
"""Epistemic protocol package (Phase 5a skeleton): triage + persisted phase state."""
```

```python
# coordinator/app/protocol/triage.py
"""Deterministic, rule-based triage for the epistemic protocol's Phase 5.1.

No LLM/provider calls. No network calls. Reuses the same deterministic claim
classification already used for claim normalization (P2) so triage stays
consistent with how the rest of the system reasons about claim types.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

from app.scoring.normalizer import classify_claim_type

CLASSIFIER_VERSION = "triage-v1"

Difficulty = Literal["simple", "contested", "high_stakes"]

_CONTESTED_CLAIM_TYPES = {"normative", "causal", "prediction", "mixed"}

_DEPTH_BUDGET_BY_DIFFICULTY: dict[Difficulty, int] = {
    "simple": 1,
    "contested": 2,
    "high_stakes": 3,
}

# Stakes keywords: written out fully, deliberately conservative — these push a
# claim to "high_stakes" (and force verification_required=True) regardless of
# its rhetorical claim type, because the real-world cost of being wrong is
# what matters here, not the claim's grammatical shape.
_STAKES_KEYWORDS: tuple[str, ...] = (
    # health
    "health", "medical", "medicine", "drug", "vaccine", "disease", "surgery",
    "patient", "clinical", "treatment", "diagnosis", "mental health",
    # legal
    "legal", "law", "lawsuit", "court", "contract", "liability", "regulation",
    "compliance", "crime", "criminal", "constitutional",
    # financial
    "financial", "investment", "tax", "interest rate", "bank", "loan",
    "pension", "retirement", "bankruptcy", "insurance", "market crash",
    # safety
    "safety", "hazard", "accident", "injury", "fatal", "risk of death",
    "structural", "inspection", "emergency",
    # policy
    "policy", "legislation", "government", "regulation", "public health",
    "national security", "immigration", "election",
)


@dataclass(frozen=True)
class TriageDecision:
    difficulty: Difficulty
    depth_budget: int
    verification_required: bool
    rationale: list[str] = field(default_factory=list)
    classifier_version: str = CLASSIFIER_VERSION


def _detect_stakes(topic_lower: str) -> list[str]:
    return [keyword for keyword in _STAKES_KEYWORDS if keyword in topic_lower]


def triage_debate(topic: str, config: dict[str, Any] | None) -> TriageDecision:
    """Classify a debate topic into a difficulty tier + depth budget + verification need.

    Deterministic and side-effect free. Explicit config overrides
    (`config["protocol"]["difficulty"]` / `config["protocol"]["depth_budget"]`)
    always win over classification. `config["max_depth"]`, when present,
    clamps the resulting `depth_budget` (never raises it above that ceiling).
    """
    config = config or {}
    rationale: list[str] = []

    protocol_overrides = config.get("protocol") if isinstance(config.get("protocol"), dict) else {}
    override_difficulty = protocol_overrides.get("difficulty")
    override_depth_budget = protocol_overrides.get("depth_budget")

    topic_lower = topic.lower()
    claim_type, markers = classify_claim_type(topic)
    hedge_hit = any(
        marker in topic_lower for marker in ("might", "may", "could", "some say", "arguably", "probably")
    )
    stakes_hits = _detect_stakes(topic_lower)

    if override_difficulty in ("simple", "contested", "high_stakes"):
        difficulty: Difficulty = override_difficulty  # type: ignore[assignment]
        rationale.append(f"config override: protocol.difficulty={difficulty}")
        verification_required = difficulty == "high_stakes"
    elif stakes_hits:
        difficulty = "high_stakes"
        verification_required = True
        rationale.append(f"stakes keywords matched: {', '.join(stakes_hits)}")
    elif claim_type in _CONTESTED_CLAIM_TYPES:
        difficulty = "contested"
        verification_required = False
        rationale.append(f"claim_type={claim_type} (markers: {', '.join(markers) or 'none'})")
    elif hedge_hit:
        difficulty = "contested"
        verification_required = False
        rationale.append("hedge marker present in topic text")
    else:
        difficulty = "simple"
        verification_required = False
        rationale.append(f"claim_type={claim_type}; no stakes keywords; no hedge markers")

    if hedge_hit and "hedge marker present in topic text" not in rationale:
        rationale.append("hedge marker also present in topic text")

    if override_depth_budget is not None:
        depth_budget = int(override_depth_budget)
        rationale.append(f"config override: protocol.depth_budget={depth_budget}")
    else:
        depth_budget = _DEPTH_BUDGET_BY_DIFFICULTY[difficulty]

    max_depth = config.get("max_depth")
    if isinstance(max_depth, int) and not isinstance(max_depth, bool) and depth_budget > max_depth:
        rationale.append(f"depth_budget clamped from {depth_budget} to max_depth={max_depth}")
        depth_budget = max_depth

    return TriageDecision(
        difficulty=difficulty,
        depth_budget=depth_budget,
        verification_required=verification_required,
        rationale=rationale,
        classifier_version=CLASSIFIER_VERSION,
    )
```

- [ ] **Step 4: Verify pass**

Run: `cd coordinator && python -m pytest tests/test_protocol_triage.py -v --basetemp=.tmp/pytest-claude -o cache_dir=.tmp/pytest-cache-claude -p no:cacheprovider`
Expected: all pass. If `test_hedge_flag_alone_pushes_to_contested` fails because "arguably fine" also happens to match the normative `_NORMATIVE_PATTERNS` (`\bis (good|bad)\b` etc. — "fine" is not in that list, so it should be safe, but double check `classify_claim_type("This policy is arguably fine.")`'s actual returned claim_type before trusting the test), adjust the topic string to one confirmed to hit ONLY the hedge path and no claim-type family, then re-run.

- [ ] **Step 5: Report status (no commit)**

Do not commit. Move to Task 2.

---

### Task 2: Protocol state module

**Files:**
- Create: `coordinator/app/protocol/state.py`
- Test: `coordinator/tests/test_protocol_state.py` (new)

**Interfaces:**
- Produces: `PROTOCOL_VERSION = "protocol-v1"`; `PHASE_NAMES` (ordered tuple of the 8 phase keys); `NOT_IMPLEMENTED_PHASES` (frozenset of `5.4_cross_exam`..`5.7_convergence`); `initialize_protocol_state(topic: str, config: dict | None) -> dict`; `advance_phase(state: dict, phase: str, status: str) -> dict` (pure, returns a new dict, never mutates the input); `protocol_state_of(debate_config: dict | None) -> dict | None`.
- Consumes: Task 1's `triage_debate`.

- [ ] **Step 1: Write failing tests**

```python
# coordinator/tests/test_protocol_state.py
import pytest

from app.protocol.state import (
    NOT_IMPLEMENTED_PHASES,
    PROTOCOL_VERSION,
    advance_phase,
    initialize_protocol_state,
    protocol_state_of,
)


def test_initialize_includes_triage_and_honest_not_implemented_phases():
    state = initialize_protocol_state("Cities should ban cars downtown.", None)
    assert state["version"] == PROTOCOL_VERSION
    assert state["triage"]["difficulty"] == "contested"
    assert state["triage"]["classifier_version"] == "triage-v1"
    phases = state["phases"]
    assert phases["5.1_triage"] == "complete"
    assert phases["5.2_decomposition"] == "pending"
    assert phases["5.3_generation"] == "pending"
    assert phases["5.4_cross_exam"] == "not_implemented"
    assert phases["5.5_verification"] == "not_implemented"
    assert phases["5.6_qbaf_scoring"] == "not_implemented"
    assert phases["5.7_convergence"] == "not_implemented"
    assert phases["5.8_synthesis"] == "pending"


def test_advance_phase_is_pure_and_does_not_mutate_input():
    state = initialize_protocol_state("The Earth orbits the Sun.", None)
    original_phases = dict(state["phases"])
    new_state = advance_phase(state, "5.2_decomposition", "complete")
    assert state["phases"] == original_phases  # untouched
    assert new_state["phases"]["5.2_decomposition"] == "complete"
    assert new_state is not state


def test_advance_phase_round_trips_through_plain_dict():
    state = initialize_protocol_state("The Earth orbits the Sun.", None)
    state = advance_phase(state, "5.2_decomposition", "complete")
    debate_config: dict = {"max_depth": 2, "protocol_state": state}
    loaded = protocol_state_of(debate_config)
    assert loaded == state
    assert loaded["phases"]["5.2_decomposition"] == "complete"


def test_protocol_state_of_returns_none_when_absent():
    assert protocol_state_of({"max_depth": 2}) is None
    assert protocol_state_of(None) is None


def test_advance_unknown_phase_raises_value_error():
    state = initialize_protocol_state("The Earth orbits the Sun.", None)
    with pytest.raises(ValueError):
        advance_phase(state, "5.99_nonexistent", "complete")


@pytest.mark.parametrize("phase", sorted(NOT_IMPLEMENTED_PHASES))
def test_no_false_green_cannot_mark_not_implemented_phase_complete(phase):
    state = initialize_protocol_state("The Earth orbits the Sun.", None)
    with pytest.raises(ValueError, match="not_implemented"):
        advance_phase(state, phase, "complete")


def test_version_is_pinned():
    state = initialize_protocol_state("The Earth orbits the Sun.", None)
    assert state["version"] == "protocol-v1"
```

- [ ] **Step 2: Run to verify failure**

Run: `cd coordinator && python -m pytest tests/test_protocol_state.py -v --basetemp=.tmp/pytest-claude -o cache_dir=.tmp/pytest-cache-claude -p no:cacheprovider`
Expected: FAIL (`app.protocol.state` does not exist yet).

- [ ] **Step 3: Implement**

```python
# coordinator/app/protocol/state.py
"""Persisted epistemic-protocol phase state, stored inside Debate.config.

No schema change: the state lives at debate_config["protocol_state"], a
plain JSON-serializable dict. This module only produces/reads/updates plain
dicts — it never touches the ORM or a session directly (integration call
sites in dialectical_v2.py own the Debate/session plumbing).

No-false-green law: phases 5.4-5.7 do not exist in this slice and must
always report "not_implemented" — attempting to mark one "complete" raises.
"""
from __future__ import annotations

from typing import Any

from app.protocol.triage import triage_debate

PROTOCOL_VERSION = "protocol-v1"

PHASE_NAMES: tuple[str, ...] = (
    "5.1_triage",
    "5.2_decomposition",
    "5.3_generation",
    "5.4_cross_exam",
    "5.5_verification",
    "5.6_qbaf_scoring",
    "5.7_convergence",
    "5.8_synthesis",
)

NOT_IMPLEMENTED_PHASES: frozenset[str] = frozenset(
    {"5.4_cross_exam", "5.5_verification", "5.6_qbaf_scoring", "5.7_convergence"}
)

_VALID_STATUSES = {"pending", "complete", "not_implemented", "failed"}


def initialize_protocol_state(topic: str, config: dict[str, Any] | None) -> dict[str, Any]:
    """Run triage and build the initial protocol_state dict for a new debate.

    Returns a plain, JSON-serializable dict meant to be merged into
    Debate.config under the "protocol_state" key by the caller.
    """
    decision = triage_debate(topic, config)
    phases: dict[str, str] = {name: "pending" for name in PHASE_NAMES}
    phases["5.1_triage"] = "complete"
    for phase in NOT_IMPLEMENTED_PHASES:
        phases[phase] = "not_implemented"

    return {
        "version": PROTOCOL_VERSION,
        "triage": {
            "difficulty": decision.difficulty,
            "depth_budget": decision.depth_budget,
            "verification_required": decision.verification_required,
            "rationale": list(decision.rationale),
            "classifier_version": decision.classifier_version,
        },
        "phases": phases,
    }


def advance_phase(state: dict[str, Any], phase: str, status: str) -> dict[str, Any]:
    """Return a NEW protocol_state dict with `phase` set to `status`.

    Never mutates `state`. Raises ValueError for an unknown phase name, an
    unknown status literal, or any attempt to mark a not-yet-implemented
    phase (5.4-5.7) as "complete" (no-false-green law).
    """
    if phase not in PHASE_NAMES:
        raise ValueError(f"Unknown protocol phase: {phase!r}")
    if status not in _VALID_STATUSES:
        raise ValueError(f"Unknown protocol phase status: {status!r}")
    if phase in NOT_IMPLEMENTED_PHASES and status == "complete":
        raise ValueError(
            f"Refusing to mark {phase!r} complete: this phase is not_implemented "
            "in this slice (no-false-green law) — implement the phase before "
            "advancing its status."
        )

    new_phases = dict(state.get("phases", {}))
    new_phases[phase] = status
    return {**state, "phases": new_phases}


def protocol_state_of(debate_config: dict[str, Any] | None) -> dict[str, Any] | None:
    """Read the protocol_state dict back out of a Debate.config-shaped dict."""
    if not debate_config:
        return None
    state = debate_config.get("protocol_state")
    return state if isinstance(state, dict) else None
```

- [ ] **Step 4: Verify pass**

Run: `cd coordinator && python -m pytest tests/test_protocol_state.py -v --basetemp=.tmp/pytest-claude -o cache_dir=.tmp/pytest-cache-claude -p no:cacheprovider`
Expected: all pass.

- [ ] **Step 5: Report status (no commit)**

Do not commit. Move to Task 3.

---

### Task 3: Integration — initialize at creation, advance 5.2/5.3/5.8 markers

**Files:**
- Modify: `coordinator/app/services/dialectical_v2.py` (`create_dialectical_debate`, POV loop, `persist_v2_synthesis`)
- Test: `coordinator/tests/test_protocol_integration.py` (new)

**Interfaces:**
- Consumes: Task 2's `initialize_protocol_state`, `advance_phase`, `protocol_state_of`.
- Produces: best-effort, non-fatal marker updates at 3 call sites; a marker failure must never fail the job/request.

Before writing, re-read `coordinator/tests/conftest.py` once to confirm the `db` fixture's shape (see UNVERIFIED #6), and re-read `coordinator/app/services/dialectical_v2.py:1285-1327` and `:836-886` once more immediately before editing (see UNVERIFIED #1, #3, #4) to guard against drift from this plan's line numbers.

- [ ] **Step 1: Write failing tests**

```python
# coordinator/tests/test_protocol_integration.py
from unittest.mock import patch

from app.protocol.state import protocol_state_of
from app.services import dialectical_v2 as service


def test_new_debate_has_protocol_state_with_triage(db) -> None:
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    state = protocol_state_of(debate.config)
    assert state is not None
    assert state["triage"]["difficulty"] in ("simple", "contested", "high_stakes")
    assert state["phases"]["5.1_triage"] == "complete"


def test_decomposition_and_generation_markers_complete_after_pov_loop(db) -> None:
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    state = protocol_state_of(debate.config)
    assert state["phases"]["5.2_decomposition"] == "complete"
    assert state["phases"]["5.3_generation"] == "complete"
    # not-implemented phases must still be honestly reported, never upgraded
    assert state["phases"]["5.4_cross_exam"] == "not_implemented"
    assert state["phases"]["5.5_verification"] == "not_implemented"
    assert state["phases"]["5.6_qbaf_scoring"] == "not_implemented"
    assert state["phases"]["5.7_convergence"] == "not_implemented"


def test_synthesis_marker_completes_after_v2_synthesis_persistence(db) -> None:
    # Reuse the same worker-completion flow test_dialectical_v2.py exercises for
    # test_v2_persists_pov_tree_and_synthesis_from_worker_completed_json: drive a
    # debate through complete_v2_worker_job for each queued v2_pov job, then the
    # resulting v2_synthesize job, and assert the 5.8 marker afterward.
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    # NOTE: adapt this driving loop to whatever helper
    # test_v2_persists_pov_tree_and_synthesis_from_worker_completed_json uses in
    # test_dialectical_v2.py to push each pending v2_pov/v2_synthesize job to
    # completion with a valid contract payload — do not invent a new drive
    # helper; copy that test's approach so this test tracks real behavior.
    from tests.test_dialectical_v2 import _drive_debate_to_synthesis  # if such a helper exists

    _drive_debate_to_synthesis(db, debate)

    db.refresh(debate)
    state = protocol_state_of(debate.config)
    assert state["phases"]["5.8_synthesis"] == "complete"


def test_marker_update_failure_does_not_fail_the_debate_creation(db) -> None:
    with patch(
        "app.services.dialectical_v2.initialize_protocol_state",
        side_effect=RuntimeError("simulated marker failure"),
    ):
        debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    assert debate.status == "generating"
    # best-effort: no protocol_state key at all rather than a crash
    assert protocol_state_of(debate.config) is None


def test_marker_update_failure_does_not_fail_synthesis_persistence(db) -> None:
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    with patch(
        "app.services.dialectical_v2.advance_phase",
        side_effect=RuntimeError("simulated marker failure"),
    ):
        from tests.test_dialectical_v2 import _drive_debate_to_synthesis

        _drive_debate_to_synthesis(db, debate)
    db.refresh(debate)
    assert debate.status == "complete"  # synthesis itself must still succeed
```

Note: `_drive_debate_to_synthesis` is a placeholder name — before finalizing this test file, open `coordinator/tests/test_dialectical_v2.py` around `test_v2_persists_pov_tree_and_synthesis_from_worker_completed_json` (grep hit at line 1012) and copy whatever it actually does to drive jobs to completion (likely direct calls to `service.complete_v2_worker_job(db, job, result, metadata)` per pending job, with hand-built valid contract payloads). Replace the two `_drive_debate_to_synthesis` test bodies with that real sequence inlined, rather than importing a helper that may not exist as a standalone function.

- [ ] **Step 2: Run to verify failure**

Run: `cd coordinator && python -m pytest tests/test_protocol_integration.py -v --basetemp=.tmp/pytest-claude -o cache_dir=.tmp/pytest-cache-claude -p no:cacheprovider`
Expected: FAIL (no protocol_state wiring exists yet in `create_dialectical_debate`/`persist_v2_synthesis`).

- [ ] **Step 3: Implement**

In `coordinator/app/services/dialectical_v2.py`, add the import near the other local imports:

```python
from app.protocol.state import advance_phase, initialize_protocol_state, protocol_state_of
```

In `create_dialectical_debate`, right after `debate_config = merged_debate_config(config)` (around line 1289) and before constructing `Debate(...)`:

```python
    debate_config = merged_debate_config(config)
    try:
        debate_config["protocol_state"] = initialize_protocol_state(topic, debate_config)
    except Exception:
        # Best-effort: protocol state is scaffolding, not load-bearing for the
        # debate itself. A triage/state bug must never block debate creation.
        pass
    model_id = require_v2_codex_model(db)
    debate = Debate(topic=topic, status="generating", config=debate_config)
```

Right after the POV-branch loop finishes (after line 1324's `queue_v2_job(...)` call, still inside the `for` loop's enclosing scope, before `commit_write(db)` at line 1325):

```python
    for position, (node_type, label) in enumerate(POV_BRANCHES):
        pov_node = Node(...)
        db.add(pov_node)
        flush_write(db)
        queue_v2_job(db, debate, "v2_pov", label, model_id, pov_node.id)

    try:
        state = protocol_state_of(debate.config)
        if state is not None:
            state = advance_phase(state, "5.2_decomposition", "complete")
            state = advance_phase(state, "5.3_generation", "complete")
            debate.config = {**debate.config, "protocol_state": state}
    except Exception:
        pass  # best-effort: marker update must never fail debate creation

    commit_write(db)
    db.refresh(debate)
    return debate
```

In `persist_v2_synthesis`, right after `debate.completed_at = now_utc()` (line 879) and before `record_provenance(...)` (line 880):

```python
    debate.status = "complete"
    debate.completed_at = now_utc()
    try:
        state = protocol_state_of(debate.config)
        if state is not None:
            state = advance_phase(state, "5.8_synthesis", "complete")
            debate.config = {**debate.config, "protocol_state": state}
    except Exception:
        pass  # best-effort: marker update must never fail synthesis persistence
    record_provenance(db, debate.id, branch.id, "synthesis", synthesis.id, payload["provenance"])
```

Note on mutability: SQLAlchemy's `JSON` column type does not automatically detect in-place mutation of a Python dict — reassigning `debate.config = {**debate.config, ...}` (a new dict, not `debate.config["protocol_state"] = ...` in place) is required for the ORM to pick up the change and persist it on flush/commit. Keep this reassignment pattern at every call site above; do not switch to in-place `debate.config["protocol_state"] = state` without also verifying (e.g. via `MutableDict` tracking or an explicit `flag_modified(debate, "config")` call) that SQLAlchemy will still detect and persist it.

- [ ] **Step 4: Verify pass + rerun-list**

Run (single foreground call, one shot, do not loop):
`cd coordinator && python -m pytest tests/test_protocol_triage.py tests/test_protocol_state.py tests/test_protocol_integration.py tests/test_dialectical_v2.py -v --basetemp=.tmp/pytest-claude -o cache_dir=.tmp/pytest-cache-claude -p no:cacheprovider`

Expected: all pass except the pre-existing 17 known failures (12 env-harness + 5 foreign guardian WIP) if any happen to live in `test_dialectical_v2.py`. If a NEW failure appears in `test_dialectical_v2.py` caused by this change (e.g. an assertion on the exact shape of `debate.config` that this phase's `protocol_state` key now breaks), fix the root cause in this phase's code (not by weakening the pre-existing test) before reporting done. If the run times out once, report BLOCKED — do not retry in a sleep loop.

- [ ] **Step 5: Report status (no commit)**

Do not commit. Report: file paths touched, test results, and flag UNVERIFIED #3 (the "structure exists" vs. "outputs landed" reading of 5.2/5.3 completion) as a decision for Hermes/product to confirm or override before Phase 5b builds on top of these markers.
