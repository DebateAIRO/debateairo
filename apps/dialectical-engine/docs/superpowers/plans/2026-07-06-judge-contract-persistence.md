# Judge Contract Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make judge identity an immutable, persisted contract so code changes can never silently change what old scores mean.

**Architecture:** Add a `JudgeContract` registry (versions + content hash) in the scoring domain. Stamp `judge_id`/`judge_version`/`contract_hash` onto every `JudgeOutputArtifact` and `NodeScoringResult` at write time, include `contract_hash` in cache identity, and gate artifact re-hydration on contract match — legacy/mismatched artifacts surface as historical/stale, never re-reduced through current code.

**Tech Stack:** Python 3.12, FastAPI coordinator, SQLAlchemy + Alembic (SQLite dev / env-configurable), pydantic v2, pytest.

## Global Constraints

- Backend/API wire DTO field names must NOT be renamed (OBS-DDD boundary stands).
- Published/public payload additions use DDD camelCase names (`judgeId`, `judgeVersion`, `scoringContractHash`); raw DTO/internal names stay snake_case.
- Old scores are never deleted, hidden, or overwritten — only marked historical/stale.
- Old artifacts are never reduced through current reducer code unless their `contract_hash` matches the active contract.
- Missing judge/contract must never be treated as score `0` or as a fresh score.
- Alembic migration must be SQLite-compatible (`batch_alter_table`) and additive-only (nullable columns; NULL = legacy row).
- Raw judge output stays private (`_public_metadata_text` / existing stripping unchanged).
- Existing test suites must stay green: `make test` (coordinator + worker) after every task.
- Design decision (MVP): `contract_hash` covers the five version strings + the pydantic `ClaimAssessment` JSON schema. Prompt *content* changes must bump `prompt_version` (convention enforced by review); hashing the rendered provider template is a follow-up, not this slice.

**Verified ground truth this plan builds on (dev @ a324a40):**
- Cache identity today is `debate_id/node_id/input_hash/judge_role/provider/model` — no contract fields: `coordinator/app/scoring/cache.py:29-54`, `entities.py:324-344`.
- `JudgeOutputArtifact` unique identity has no contract fields: `entities.py:265-283`; it already stores `prompt_version` per artifact.
- **Hydration is looser than the research doc claimed:** `_hydrate_node_scoring_item_from_judge_artifact` (`service.py:275-320`) selects artifacts by `debate/node/input_hash/parse_status` only — not even `judge_role/provider/model` — then runs `reduce_assessments` (current code) over the stored assessment.
- Version constants exist: `REDUCER_VERSION = "node-scoring-reducer-v1"`, `RUBRIC_VERSION = "debateai-rubric-v1"` (`reducer.py:26-27`); `ScoringProviderRequest.prompt_version = "scoring-provider-v1"` (`judges.py:17`).
- Migrations are numbered; next is `0007` (`coordinator/migrations/versions/`).

---

### Task 1: Judge contract registry

**Files:**
- Create: `coordinator/app/scoring/judge_registry.py`
- Test: `coordinator/tests/test_judge_registry.py`

**Interfaces:**
- Produces: `JudgeContract` (frozen pydantic model: `judge_id: str`, `judge_version: str`, `role: str`, `rubric_version: str`, `prompt_version: str`, `schema_version: str`, `reducer_version: str`, property `contract_hash: str`), `active_contract(role: str) -> JudgeContract`, `PRIMARY_NODE_SCORING_JUDGE: JudgeContract`.

- [ ] **Step 1: Write the failing tests**

```python
# coordinator/tests/test_judge_registry.py
from app.scoring.judge_registry import (
    PRIMARY_NODE_SCORING_JUDGE,
    JudgeContract,
    active_contract,
)


def _contract(**overrides) -> JudgeContract:
    base = dict(
        judge_id="node_scoring.primary",
        judge_version="v1",
        role="judge",
        rubric_version="debateai-rubric-v1",
        prompt_version="scoring-provider-v1",
        schema_version="claim-assessment-v1",
        reducer_version="node-scoring-reducer-v1",
    )
    base.update(overrides)
    return JudgeContract(**base)


def test_contract_hash_is_stable_for_identical_contracts() -> None:
    assert _contract().contract_hash == _contract().contract_hash
    assert len(_contract().contract_hash) == 64  # sha256 hex


def test_contract_hash_changes_when_prompt_version_changes() -> None:
    assert _contract().contract_hash != _contract(prompt_version="scoring-provider-v2").contract_hash


def test_contract_hash_changes_when_rubric_version_changes() -> None:
    assert _contract().contract_hash != _contract(rubric_version="debateai-rubric-v2").contract_hash


def test_contract_hash_changes_when_reducer_version_changes() -> None:
    assert _contract().contract_hash != _contract(reducer_version="node-scoring-reducer-v2").contract_hash


def test_contract_hash_covers_claim_assessment_schema() -> None:
    # Hash input embeds the ClaimAssessment JSON schema, so schema drift changes identity.
    payload = _contract().hash_payload()
    assert '"claim-assessment-schema"' in payload or "claim-assessment-schema" in payload


def test_active_contract_returns_primary_judge_for_judge_role() -> None:
    contract = active_contract("judge")
    assert contract is PRIMARY_NODE_SCORING_JUDGE
    assert contract.judge_id == "node_scoring.primary"
    assert contract.judge_version == "v1"
    assert contract.reducer_version == "node-scoring-reducer-v1"
    assert contract.rubric_version == "debateai-rubric-v1"


def test_active_contract_rejects_unknown_role() -> None:
    import pytest

    with pytest.raises(KeyError):
        active_contract("nonexistent_role")
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd coordinator && python -m pytest tests/test_judge_registry.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.scoring.judge_registry'`

- [ ] **Step 3: Write the implementation**

```python
# coordinator/app/scoring/judge_registry.py
"""Immutable judge contracts.

A JudgeContract pins every semantic input of a persisted score: rubric,
prompt, output schema, and reducer versions, plus the ClaimAssessment JSON
schema itself. Its contract_hash is persisted on artifacts and cache rows
so old outputs can never be silently reinterpreted by newer code.
"""
from __future__ import annotations

import hashlib
import json
from functools import cached_property

from pydantic import BaseModel, ConfigDict

from app.scoring.models import ClaimAssessment
from app.scoring.reducer import REDUCER_VERSION, RUBRIC_VERSION

CLAIM_ASSESSMENT_SCHEMA_VERSION = "claim-assessment-v1"
SCORING_PROMPT_VERSION = "scoring-provider-v1"


class JudgeContract(BaseModel):
    model_config = ConfigDict(frozen=True)

    judge_id: str
    judge_version: str
    role: str
    rubric_version: str
    prompt_version: str
    schema_version: str
    reducer_version: str

    def hash_payload(self) -> str:
        payload = {
            "judge_id": self.judge_id,
            "judge_version": self.judge_version,
            "role": self.role,
            "rubric_version": self.rubric_version,
            "prompt_version": self.prompt_version,
            "schema_version": self.schema_version,
            "reducer_version": self.reducer_version,
            "claim-assessment-schema": ClaimAssessment.model_json_schema(),
        }
        return json.dumps(payload, sort_keys=True, separators=(",", ":"))

    @cached_property
    def contract_hash(self) -> str:
        return hashlib.sha256(self.hash_payload().encode("utf-8")).hexdigest()


PRIMARY_NODE_SCORING_JUDGE = JudgeContract(
    judge_id="node_scoring.primary",
    judge_version="v1",
    role="judge",
    rubric_version=RUBRIC_VERSION,
    prompt_version=SCORING_PROMPT_VERSION,
    schema_version=CLAIM_ASSESSMENT_SCHEMA_VERSION,
    reducer_version=REDUCER_VERSION,
)

_ACTIVE_CONTRACTS: dict[str, JudgeContract] = {
    PRIMARY_NODE_SCORING_JUDGE.role: PRIMARY_NODE_SCORING_JUDGE,
}


def active_contract(role: str) -> JudgeContract:
    return _ACTIVE_CONTRACTS[role]
```

Note: `cached_property` on a frozen pydantic model requires no extra config in pydantic v2 (it stores on `__dict__` which frozen models permit for cached properties). If the frozen config rejects it in this pydantic version, replace `cached_property` with a plain `@property` that recomputes — the tests assert stability of the value, not identity of computation.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd coordinator && python -m pytest tests/test_judge_registry.py -v`
Expected: 7 passed

- [ ] **Step 5: Commit**

```bash
git add coordinator/app/scoring/judge_registry.py coordinator/tests/test_judge_registry.py
git commit -m "feat(scoring): add immutable judge contract registry"
```

---

### Task 2: Contract columns on artifacts and cache rows (migration 0007)

**Files:**
- Modify: `coordinator/app/models/entities.py` (inside `class JudgeOutputArtifact` ~line 285+, and `class NodeScoringResult` ~line 327+)
- Create: `coordinator/migrations/versions/0007_judge_contract_identity.py`
- Test: `coordinator/tests/test_judge_contract_columns.py`

**Interfaces:**
- Produces: nullable columns `judge_id: str|None`, `judge_version: str|None`, `contract_hash: str|None` on both `JudgeOutputArtifact` and `NodeScoringResult`. NULL means "legacy row written before contracts existed".

- [ ] **Step 1: Write the failing test**

```python
# coordinator/tests/test_judge_contract_columns.py
from app.models.entities import JudgeOutputArtifact, NodeScoringResult


def test_judge_output_artifact_has_contract_identity_columns() -> None:
    cols = JudgeOutputArtifact.__table__.columns
    for name in ("judge_id", "judge_version", "contract_hash"):
        assert name in cols, f"missing column {name}"
        assert cols[name].nullable is True


def test_node_scoring_result_has_contract_identity_columns() -> None:
    cols = NodeScoringResult.__table__.columns
    for name in ("judge_id", "judge_version", "contract_hash"):
        assert name in cols, f"missing column {name}"
        assert cols[name].nullable is True
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd coordinator && python -m pytest tests/test_judge_contract_columns.py -v`
Expected: FAIL with `AssertionError: missing column judge_id`

- [ ] **Step 3: Add the mapped columns to both entities**

In `coordinator/app/models/entities.py`, inside `JudgeOutputArtifact` (after the `model` column) and inside `NodeScoringResult` (after the `model` column), add the identical block:

```python
    judge_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    judge_version: Mapped[str | None] = mapped_column(String(32), nullable=True)
    contract_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
```

- [ ] **Step 4: Create the Alembic migration**

```python
# coordinator/migrations/versions/0007_judge_contract_identity.py
"""Add judge contract identity to judge artifacts and scoring cache rows."""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0007_judge_contract_identity"
down_revision = "0006_node_feedback_votes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for table in ("judge_output_artifacts", "node_scoring_results"):
        with op.batch_alter_table(table) as batch:
            batch.add_column(sa.Column("judge_id", sa.String(120), nullable=True))
            batch.add_column(sa.Column("judge_version", sa.String(32), nullable=True))
            batch.add_column(sa.Column("contract_hash", sa.String(128), nullable=True))
    op.create_index(
        "ix_node_scoring_results_contract_hash",
        "node_scoring_results",
        ["contract_hash"],
    )


def downgrade() -> None:
    op.drop_index("ix_node_scoring_results_contract_hash", table_name="node_scoring_results")
    for table in ("judge_output_artifacts", "node_scoring_results"):
        with op.batch_alter_table(table) as batch:
            batch.drop_column("contract_hash")
            batch.drop_column("judge_version")
            batch.drop_column("judge_id")
```

Check the actual `revision` id string of `0006_node_feedback_votes.py` first (`grep -n "^revision" coordinator/migrations/versions/0006_node_feedback_votes.py`) and use its exact value for `down_revision` — the file name and the revision string may differ.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd coordinator && python -m pytest tests/test_judge_contract_columns.py -v`
Expected: 2 passed
Also run: `cd coordinator && python -m pytest tests -k migration -v` (if migration tests exist, they must stay green).

- [ ] **Step 6: Commit**

```bash
git add coordinator/app/models/entities.py coordinator/migrations/versions/0007_judge_contract_identity.py coordinator/tests/test_judge_contract_columns.py
git commit -m "feat(scoring): persist judge contract identity columns (migration 0007)"
```

---

### Task 3: Stamp contracts at write time

**Files:**
- Modify: `coordinator/app/scoring/service.py` — `_persist_judge_output_artifact` (~line 644)
- Modify: `coordinator/app/scoring/cache.py` — `store_scoring_cache` (~line 112)
- Test: `coordinator/tests/test_judge_contract_stamping.py`

**Interfaces:**
- Consumes: `active_contract(role)` from Task 1; columns from Task 2.
- Produces: `store_scoring_cache(..., contract: JudgeContract | None = None)` keyword; every new `JudgeOutputArtifact` and `NodeScoringResult` written with `judge_id`, `judge_version`, `contract_hash` populated.

- [ ] **Step 1: Write the failing test**

```python
# coordinator/tests/test_judge_contract_stamping.py
# Reuse the session/db fixture pattern from the existing scoring service tests
# (see coordinator/tests/ for the established in-memory SQLite fixture; import
# the same helpers rather than inventing a new fixture).
from app.scoring.cache import store_scoring_cache
from app.scoring.judge_registry import PRIMARY_NODE_SCORING_JUDGE


def test_store_scoring_cache_stamps_contract_identity(db_session, seeded_debate_node) -> None:
    debate_id, node_id = seeded_debate_node
    row = store_scoring_cache(
        db_session,
        debate_id=debate_id,
        node_id=node_id,
        input_hash="hash-1",
        judge_role="judge",
        provider="codex",
        model="model-a",
        provider_metadata={},
        status="available",
        result={"ok": True},
        contract=PRIMARY_NODE_SCORING_JUDGE,
    )
    assert row.judge_id == "node_scoring.primary"
    assert row.judge_version == "v1"
    assert row.contract_hash == PRIMARY_NODE_SCORING_JUDGE.contract_hash


def test_store_scoring_cache_without_contract_leaves_identity_null(db_session, seeded_debate_node) -> None:
    debate_id, node_id = seeded_debate_node
    row = store_scoring_cache(
        db_session,
        debate_id=debate_id,
        node_id=node_id,
        input_hash="hash-2",
        judge_role="judge",
        provider="codex",
        model="model-a",
        provider_metadata={},
        status="available",
        result={"ok": True},
    )
    assert row.judge_id is None and row.contract_hash is None
```

(Adapt fixture names `db_session` / `seeded_debate_node` to whatever the existing scoring cache tests in `coordinator/tests/` actually use — copy their setup verbatim; do not write a new database bootstrap.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd coordinator && python -m pytest tests/test_judge_contract_stamping.py -v`
Expected: FAIL with `TypeError: store_scoring_cache() got an unexpected keyword argument 'contract'`

- [ ] **Step 3: Implement stamping**

In `coordinator/app/scoring/cache.py`, extend `store_scoring_cache`:

```python
from app.scoring.judge_registry import JudgeContract  # top of file


def store_scoring_cache(
    db: Session,
    *,
    debate_id: str,
    node_id: str,
    input_hash: str,
    judge_role: str,
    provider: str,
    model: str,
    provider_metadata: dict[str, Any],
    status: str,
    result: dict[str, Any],
    contract: JudgeContract | None = None,
) -> NodeScoringResult:
    ...  # existing lookup/create body unchanged
    cached_result.provider_metadata = provider_metadata
    cached_result.status = status
    cached_result.result = result
    if contract is not None:
        cached_result.judge_id = contract.judge_id
        cached_result.judge_version = contract.judge_version
        cached_result.contract_hash = contract.contract_hash
    cached_result.updated_at = now_utc()
    return cached_result
```

In `coordinator/app/scoring/service.py`, inside `_persist_judge_output_artifact`, after `artifact.prompt_version = _artifact_prompt_version(request, result)` add:

```python
    contract = active_contract(judge_role)
    artifact.judge_id = contract.judge_id
    artifact.judge_version = contract.judge_version
    artifact.contract_hash = contract.contract_hash
```

with `from app.scoring.judge_registry import active_contract` added to the service imports. Wrap the lookup defensively — unknown roles must not break persistence of the raw artifact:

```python
    try:
        contract = active_contract(judge_role)
    except KeyError:
        contract = None
    if contract is not None:
        artifact.judge_id = contract.judge_id
        artifact.judge_version = contract.judge_version
        artifact.contract_hash = contract.contract_hash
```

Then find the two `store_scoring_cache(...)` call sites in `service.py` (the unavailable-path and available-path blocks inside `score_node_with_provider`, ~lines 277-317) and pass `contract=active_contract(request.judge_role)` (same defensive try/except, passing `contract=None` on KeyError).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd coordinator && python -m pytest tests/test_judge_contract_stamping.py tests/test_judge_registry.py -v`
Expected: all pass
Then: `cd coordinator && python -m pytest tests -v -k scoring` — existing scoring tests must stay green.

- [ ] **Step 5: Commit**

```bash
git add coordinator/app/scoring/cache.py coordinator/app/scoring/service.py coordinator/tests/test_judge_contract_stamping.py
git commit -m "feat(scoring): stamp judge contract identity on artifacts and cache rows"
```

---

### Task 4: Contract-aware cache identity

**Files:**
- Modify: `coordinator/app/scoring/cache.py` — `lookup_scoring_cache` (~line 29), `lookup_stale_scoring_cache_metadata` (~line 85)
- Modify: `coordinator/app/scoring/service.py` — the `lookup_scoring_cache(...)` call site in `score_node_with_provider` (~line 200-230) and the `lookup_stale_scoring_cache_metadata(...)` call site
- Test: `coordinator/tests/test_contract_cache_identity.py`

**Interfaces:**
- Consumes: Task 3 stamping.
- Produces: `lookup_scoring_cache(..., contract_hash: str | None = None)` — a row is a cache HIT only if `row.contract_hash == contract_hash`; rows with different/NULL hash are treated as stale-candidates. `lookup_stale_scoring_cache_metadata` gains the same param and returns `{"reason": "scoring_contract_changed", "refresh_available": True}` when a row exists for the same input but a different/legacy contract.

- [ ] **Step 1: Write the failing tests**

```python
# coordinator/tests/test_contract_cache_identity.py
from app.scoring.cache import (
    lookup_scoring_cache,
    lookup_stale_scoring_cache_metadata,
    store_scoring_cache,
)
from app.scoring.judge_registry import PRIMARY_NODE_SCORING_JUDGE

V1 = PRIMARY_NODE_SCORING_JUDGE
COMMON = dict(input_hash="h1", judge_role="judge", provider="codex", model="model-a")


def _store(db, debate_id, node_id, contract):
    return store_scoring_cache(
        db, debate_id=debate_id, node_id=node_id, provider_metadata={},
        status="available", result={"score": 1}, contract=contract, **COMMON,
    )


def test_cache_hit_requires_matching_contract_hash(db_session, seeded_debate_node) -> None:
    debate_id, node_id = seeded_debate_node
    _store(db_session, debate_id, node_id, V1)
    hit = lookup_scoring_cache(
        db_session, debate_id=debate_id, node_id=node_id,
        contract_hash=V1.contract_hash, **COMMON,
    )
    assert hit == {"score": 1}


def test_v1_result_is_not_reused_for_different_contract(db_session, seeded_debate_node) -> None:
    debate_id, node_id = seeded_debate_node
    _store(db_session, debate_id, node_id, V1)
    hit = lookup_scoring_cache(
        db_session, debate_id=debate_id, node_id=node_id,
        contract_hash="different-contract-hash", **COMMON,
    )
    assert hit is None


def test_legacy_null_contract_row_is_not_a_fresh_hit(db_session, seeded_debate_node) -> None:
    debate_id, node_id = seeded_debate_node
    _store(db_session, debate_id, node_id, None)  # legacy row
    hit = lookup_scoring_cache(
        db_session, debate_id=debate_id, node_id=node_id,
        contract_hash=V1.contract_hash, **COMMON,
    )
    assert hit is None


def test_old_contract_row_remains_queryable_and_reports_stale(db_session, seeded_debate_node) -> None:
    debate_id, node_id = seeded_debate_node
    row = _store(db_session, debate_id, node_id, None)
    assert row.result == {"score": 1}  # historical row still present, untouched
    stale = lookup_stale_scoring_cache_metadata(
        db_session, debate_id=debate_id, node_id=node_id,
        contract_hash=V1.contract_hash, **COMMON,
    )
    assert stale == {"reason": "scoring_contract_changed", "refresh_available": True}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd coordinator && python -m pytest tests/test_contract_cache_identity.py -v`
Expected: FAIL with `TypeError: lookup_scoring_cache() got an unexpected keyword argument 'contract_hash'`

- [ ] **Step 3: Implement contract-aware lookup**

In `lookup_scoring_cache`, add the parameter and the identity condition:

```python
def lookup_scoring_cache(
    db: Session,
    *,
    debate_id: str,
    node_id: str,
    input_hash: str,
    judge_role: str,
    provider: str,
    model: str,
    contract_hash: str | None = None,
) -> dict[str, Any] | None:
    conditions = [
        NodeScoringResult.debate_id == debate_id,
        NodeScoringResult.node_id == node_id,
        NodeScoringResult.input_hash == input_hash,
        NodeScoringResult.judge_role == judge_role,
        NodeScoringResult.provider == provider,
        NodeScoringResult.model == model,
    ]
    if contract_hash is not None:
        conditions.append(NodeScoringResult.contract_hash == contract_hash)
    cached_result = db.scalar(
        select(NodeScoringResult)
        .where(*conditions)
        .order_by(NodeScoringResult.updated_at.desc(), NodeScoringResult.created_at.desc(), NodeScoringResult.id.desc())
    )
    ...  # rest unchanged, INCLUDING the AnalyzerRun fallback loop; add to that
         # loop the same guard: when contract_hash is not None, require
         # provenance.get("contract_hash") == contract_hash before returning.
```

In `lookup_stale_scoring_cache_metadata`, add `contract_hash: str | None = None` and, before the existing `input_hash != input_hash` probe, add a same-input/different-contract probe:

```python
    if contract_hash is not None:
        contract_mismatch = db.scalar(
            select(NodeScoringResult).where(
                NodeScoringResult.debate_id == debate_id,
                NodeScoringResult.node_id == node_id,
                NodeScoringResult.input_hash == input_hash,
                NodeScoringResult.judge_role == judge_role,
                NodeScoringResult.provider == provider,
                NodeScoringResult.model == model,
                (NodeScoringResult.contract_hash != contract_hash)
                | (NodeScoringResult.contract_hash.is_(None)),
            )
        )
        if contract_mismatch is not None:
            return {"reason": "scoring_contract_changed", "refresh_available": True}
```

In `service.py`, pass `contract_hash=active_contract(request.judge_role).contract_hash` (with the same defensive `KeyError → None`) at both call sites. The web type already tolerates new reasons: `ScoringCacheMetadata.stale.reason` is `"input_hash_mismatch" | string` (`web/lib/types.ts:52`) — no frontend change required in this slice.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd coordinator && python -m pytest tests/test_contract_cache_identity.py -v`
Expected: 4 passed
Then: `cd coordinator && python -m pytest tests -v -k "scoring or cache"` — green.

- [ ] **Step 5: Commit**

```bash
git add coordinator/app/scoring/cache.py coordinator/app/scoring/service.py coordinator/tests/test_contract_cache_identity.py
git commit -m "feat(scoring): include contract hash in scoring cache identity"
```

---

### Task 5: Hydration guard — no necromancy

**Files:**
- Modify: `coordinator/app/scoring/service.py` — `_hydrate_node_scoring_item_from_judge_artifact` (~line 275)
- Test: `coordinator/tests/test_artifact_hydration_contract_guard.py`

**Interfaces:**
- Consumes: contract columns (Task 2), stamping (Task 3).
- Produces: hydration selects only artifacts where `contract_hash == active_contract("judge").contract_hash` (and — fixing the pre-existing looseness — also filters `judge_role == "judge"`). Artifacts with NULL/mismatched contract are NOT re-reduced; if a stored public `NodeScoringResult` exists for that node+input it is returned as the historical result; otherwise the node is simply not hydrated (falls through to the normal "unavailable / rescore available" path — never a fake score, never a 0).

- [ ] **Step 1: Write the failing tests**

```python
# coordinator/tests/test_artifact_hydration_contract_guard.py
# Use the existing hydration test setup from coordinator/tests (the tests that
# exercise _hydrate_scoring_payload_from_judge_artifacts / persisted-judge-artifacts
# producer). Copy that fixture arrangement; the new assertions are:

def test_artifact_with_matching_contract_hydrates(db_session, debate_with_scored_artifact) -> None:
    # artifact was stamped with the active contract in the fixture
    payload = hydrate(db_session, ...)  # existing helper/callpath in those tests
    assert payload is not None
    assert payload["producer"] == "persisted-judge-artifacts"


def test_artifact_with_null_contract_is_not_reduced_through_current_reducer(
    db_session, debate_with_legacy_artifact
) -> None:
    # legacy artifact: contract_hash IS NULL, no NodeScoringResult stored
    payload = hydrate(db_session, ...)
    assert payload is None  # falls through to normal scoring path; NOT silently reduced


def test_artifact_with_mismatched_contract_falls_back_to_stored_public_result(
    db_session, debate_with_legacy_artifact_and_stored_result
) -> None:
    payload = hydrate(db_session, ...)
    assert payload is not None
    # served from NodeScoringResult verbatim, not re-reduced:
    assert payload["items"][0] == stored_result_item_fixture()


def test_malformed_legacy_artifact_stays_private(db_session, debate_with_malformed_artifact) -> None:
    payload = hydrate(db_session, ...)
    assert payload is None  # and nothing from raw_output appears anywhere in payload
```

(Write these against the real call path used by the existing hydration tests in `coordinator/tests` — search for tests referencing `persisted-judge-artifacts`. The four behaviors above are the contract; wire them into that suite's fixtures rather than inventing parallel ones.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd coordinator && python -m pytest tests/test_artifact_hydration_contract_guard.py -v`
Expected: FAIL — mismatched/legacy artifacts currently hydrate through `reduce_assessments`.

- [ ] **Step 3: Implement the guard**

In `_hydrate_node_scoring_item_from_judge_artifact`, after computing `input_hash`:

```python
    try:
        contract = active_contract("judge")
    except KeyError:
        return None, None

    artifact = db.scalars(
        select(JudgeOutputArtifact)
        .where(
            JudgeOutputArtifact.debate_id == debate.id,
            JudgeOutputArtifact.node_id == node.id,
            JudgeOutputArtifact.input_hash == input_hash,
            JudgeOutputArtifact.judge_role == contract.role,
            JudgeOutputArtifact.parse_status == "available",
            JudgeOutputArtifact.assessment.is_not(None),
            JudgeOutputArtifact.contract_hash == contract.contract_hash,
        )
        .order_by(JudgeOutputArtifact.checked_at.desc(), JudgeOutputArtifact.created_at.desc(), JudgeOutputArtifact.id.desc())
        .limit(1)
    ).first()
    if artifact is None:
        return _hydrate_historical_public_result(db, debate, node, input_hash)
    ...  # existing model_validate + reduce_assessments path unchanged
```

Add the historical fallback helper in the same file:

```python
def _hydrate_historical_public_result(
    db: Session,
    debate: Debate,
    node: Node,
    input_hash: str,
) -> tuple[dict | None, dict | None]:
    """Serve a stored public result verbatim for legacy/mismatched contracts.

    Never re-reduces old assessments through current code; never fabricates
    a score when nothing was persisted.
    """
    stored = db.scalar(
        select(NodeScoringResult)
        .where(
            NodeScoringResult.debate_id == debate.id,
            NodeScoringResult.node_id == node.id,
            NodeScoringResult.input_hash == input_hash,
            NodeScoringResult.status == "available",
        )
        .order_by(NodeScoringResult.updated_at.desc(), NodeScoringResult.created_at.desc(), NodeScoringResult.id.desc())
    )
    if stored is None or not isinstance(stored.result, dict) or not stored.result:
        return None, None
    metadata = ScoringModelMetadata(
        provider=_public_metadata_text(stored.provider),
        model=_public_metadata_text(stored.model),
        checked_at=stored.updated_at.isoformat() if stored.updated_at else None,
        status="available",
    ).model_dump(mode="json")
    return stored.result, metadata
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd coordinator && python -m pytest tests/test_artifact_hydration_contract_guard.py -v`
Expected: 4 passed
Then the full scoring suite: `cd coordinator && python -m pytest tests -v -k scoring` — green. NOTE: existing hydration tests will now need their fixtures stamped with the active contract (they exercise the match path) — update those fixtures to call the Task-3 stamping path rather than weakening the guard.

- [ ] **Step 5: Commit**

```bash
git add coordinator/app/scoring/service.py coordinator/tests/test_artifact_hydration_contract_guard.py coordinator/tests/<updated existing hydration tests>
git commit -m "feat(scoring): gate judge artifact hydration on contract match"
```

---

### Task 6: Golden regression test + full verification

**Files:**
- Create: `coordinator/tests/test_judge_contract_golden.py`
- Test command: full suites

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Write the golden test**

```python
# coordinator/tests/test_judge_contract_golden.py
"""Golden contract test: a fixture debate scored by the active judge produces
stable identity, correct provenance, and zero raw-output leakage."""
import json

from app.scoring.judge_registry import PRIMARY_NODE_SCORING_JUDGE, active_contract


def test_active_judge_set_is_exactly_the_expected_registry() -> None:
    assert active_contract("judge") is PRIMARY_NODE_SCORING_JUDGE
    assert PRIMARY_NODE_SCORING_JUDGE.judge_id == "node_scoring.primary"
    assert PRIMARY_NODE_SCORING_JUDGE.judge_version == "v1"


def test_scored_fixture_debate_produces_contract_stamped_rows(
    db_session, scored_fixture_debate  # reuse the mock-provider end-to-end fixture from existing service tests
) -> None:
    from app.models.entities import JudgeOutputArtifact, NodeScoringResult
    from sqlalchemy import select

    artifacts = db_session.scalars(select(JudgeOutputArtifact)).all()
    results = db_session.scalars(select(NodeScoringResult)).all()
    assert artifacts and results
    for row in [*artifacts, *results]:
        assert row.judge_id == "node_scoring.primary"
        assert row.judge_version == "v1"
        assert row.contract_hash == PRIMARY_NODE_SCORING_JUDGE.contract_hash


def test_public_payload_has_no_raw_output_leakage(db_session, scored_fixture_debate_payload) -> None:
    payload_text = json.dumps(scored_fixture_debate_payload)
    assert "raw_output" not in payload_text
    # judge identity, when exposed publicly, must use DDD names only:
    assert "judge_id" not in payload_text  # wire name stays internal
```

- [ ] **Step 2: Run the golden test**

Run: `cd coordinator && python -m pytest tests/test_judge_contract_golden.py -v`
Expected: 3 passed

- [ ] **Step 3: Full verification**

Run: `make test` (from `DebateV2/apps/dialectical-engine`)
Expected: coordinator + worker suites pass with existing coverage floors (≥70%).
Run: `git diff --check` — clean.

- [ ] **Step 4: Commit**

```bash
git add coordinator/tests/test_judge_contract_golden.py
git commit -m "test(scoring): golden judge-contract regression coverage"
```

---

## Explicitly OUT of this slice (follow-up tickets)

1. **UI copy** — "Scored with node_scoring.primary@v1 … Re-score available" banner; the backend already emits `stale.reason: "scoring_contract_changed"` which the web types accept; surfacing it is a small web ticket (respect DDD naming: `judgeId`/`judgeVersion` in published payloads).
2. **Lifecycle states** (`DRAFT/ACTIVE/DEPRECATED/RETIRED` + `judge_definitions` table) — the registry constant is the v1 of this; promote to a DB-backed registry only when a second judge or a version bump actually exists (YAGNI).
3. **Prompt template content hashing** — include the rendered provider prompt template in `hash_payload()` once the template is importable from the provider module.
4. **`AnalyzerRun.provenance` stamping** at every scoring-cache AnalyzerRun write site (the fallback loop guard in Task 4 already tolerates both).
5. **Explicit migration tool** for re-scoring legacy artifacts under the new contract (`MIGRATION_REQUIRED` state).
