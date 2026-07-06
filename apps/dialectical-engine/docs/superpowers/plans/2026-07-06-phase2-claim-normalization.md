# Phase 2: Deterministic Claim Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** `normalize_claim` in `coordinator/app/scoring/normalizer.py` stops being a thin stub and becomes a deterministic, rule-based claim classifier: it assigns a real `claim_type` (including `mixed`), extracts conservative `scope` fields, derives mechanical `implied_assumptions`, flags hedging via `ambiguity_flags`, and pulls `evidence_refs` (URLs) from raw text — all via stdlib `re`, with zero provider/LLM calls and zero new dependencies. When nothing matches, the result stays honestly `unknown` — never guessed.

**Architecture:** `normalizer.py` gains a `classify_claim_type(text) -> tuple[ClaimType, list[str]]` rule engine (hedge detection first, then ordered family checks: comparative > prediction > causal > normative > definitional > empirical, with multi-family matches collapsing to `mixed`), an `extract_scope(text) -> Scope` conservative regex extractor (timeframe/geography/population, fixed vocabularies only), and a mechanical `implied_assumptions` deriver keyed off the classified type. `normalize_claim` wires these together plus a URL-regex `evidence_refs` extractor, leaving `key_terms` untouched (empty — no NLP faked). Because classification and scope extraction change real output for real claims, `SCORING_INPUT_HASH_VERSION` in `coordinator/app/scoring/cache.py` bumps from `"node-scoring-input-v1"` to `"node-scoring-input-v2"` so existing cached scoring results go stale honestly through the existing `input_hash_mismatch` staleness path — no cache is silently reused across a behavior change.

**Tech Stack:** Python 3.12, stdlib `re` only (no new dependencies), pydantic models (`coordinator/app/scoring/models.py`), pytest (coordinator suite: `cd coordinator && python -m pytest tests`).

## Global Constraints

- Deterministic only: no LLM/provider calls, no network calls, no new third-party dependencies. `re` (stdlib) is the only tool used for classification/extraction.
- Honesty over guessing: if no rule family matches, `claim_type` stays `"unknown"`. If a scope field (timeframe/geography/population) cannot be matched against the fixed patterns/vocabulary, it stays `None` — never inferred, never defaulted to a guess.
- `mixed` is a real, intentional outcome: when two or more rule families match with comparable specificity, classification returns `"mixed"` and reports every matched family's markers — it is not an error path.
- `key_terms` is explicitly out of scope for this phase: leave it as an empty list (existing default). Do not fake keyword/NLP extraction to make it non-empty.
- Coordinator suite must show **zero NEW failures** versus the known baseline of **12 known env-harness failures** (pre-existing, unrelated to scoring — capture the baseline failure count/names before touching code, per Task 1 Step 0, and diff against it after implementation).
- Git staging is explicit-path only: never `git add -A` / `git add .`. Stage only the files this plan names.
- Every commit created for this plan ends with the trailer: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- No wire/DTO renames beyond what's specified: `ClaimType` literal values, `Scope` field names, and `NormalizedClaim` field names are already fixed in `app/scoring/models.py` — this plan only changes what `normalizer.py` computes, not the shapes.

**Verified ground truth (read before implementing):**
- `coordinator/app/scoring/normalizer.py` (current stub): `normalize_claim(*, node_id, raw_text) -> NormalizedClaim` only trims `raw_text` into `core_claim` and calls a private `_claim_type(core_claim)` regex cascade. It never populates `scope`, `implied_assumptions`, `evidence_refs`, `ambiguity_flags`, or `key_terms` — those all silently default via `NormalizedClaim`'s pydantic defaults (`Scope()`, `[]`, `[]`, `[]`, `[]`). There is no `mixed` path and no hedge detection today.
- `coordinator/app/scoring/models.py:8-17` — **verified exact `ClaimType` literal**: `Literal["empirical", "causal", "normative", "definitional", "prediction", "comparative", "mixed", "unknown"]`. This matches the decided design's claim-type vocabulary exactly — no enum mismatch found.
- `coordinator/app/scoring/models.py:44-48` — **verified exact `Scope` model** (note: the class is named `Scope`, not `ScoringScope` as the task brief called it — flagged below): fields are `population: str | None`, `timeframe: str | None`, `geography: str | None`, `domain: str | None`, all defaulting to `None`. `NormalizedClaim.scope: Scope = Field(default_factory=Scope)` at line 120.
- `coordinator/app/scoring/models.py:115-124` — `NormalizedClaim` fields: `node_id`, `raw_text`, `core_claim`, `claim_type: ClaimType = "mixed"` (note: the *field default* is `"mixed"`, but `normalize_claim` always computes and overrides it explicitly — this default only matters if a caller constructs `NormalizedClaim` directly without going through `normalize_claim`, which is what `base_claim()` in the test suite does), `scope: Scope`, `implied_assumptions: list[str]`, `evidence_refs: list[str]`, `ambiguity_flags: list[str]`, `key_terms: list[str]`.
- `coordinator/app/scoring/cache.py:16` — `SCORING_INPUT_HASH_VERSION = "node-scoring-input-v1"`, consumed only inside `node_scoring_input_hash(*, claim, argument_text)` (line 19-26), which hashes `{"version": ..., "claim": claim.model_dump(mode="json"), "argument_text": ...}`. No other file references the literal string `"node-scoring-input-v1"` except this one definition site (confirmed via repo-wide search) — the bump is a single-line change.
- `coordinator/tests/test_node_scoring.py` already imports and exercises `normalize_claim` extensively (30+ call sites) and contains **three tests that assert current stub behavior and must be updated as part of this task** (behavior change is the point, not a regression):
  - `test_claim_normalizer_defaults_vague_text_to_unknown_claim_type` (~line 1957-1960): asserts `normalize_claim(node_id="node-1", raw_text="Maybe this matters somehow.").claim_type == "unknown"`. Under the new rules, `"Maybe"` is not one of the specified hedge markers (`"might"`, `"may"`, `"could"`, `"some say"`, `"arguably"`, `"probably"`), and no family regex matches this sentence either — **this assertion still holds** (`unknown` is still correct) but must be re-verified against the new implementation rather than assumed to pass unchanged.
  - `test_claim_normalizer_assigns_minimal_deterministic_claim_types` (~line 1963-1977), a parametrized test with 6 cases: `"Teams should adopt remote work for retention."` → `normative`; `"Remote work causes higher retention."` → `causal`; `"Remote work is defined as work done away from a central office."` → `definitional`; `"Remote work will increase hiring competition next year."` → `prediction`; `"Remote work has higher retention than office-only work."` → `comparative`; `"Studies show remote work retention is 8 percent higher."` → `empirical`. **All six must be re-checked against the new rule engine** — the empirical case additionally contains a comparative-shaped fragment ("higher") which must NOT cause it to flip to `mixed`/`comparative` (no explicit "than" comparison construction is present, so comparative should not fire); this is a case the implementer must verify explicitly, not assume.
  - `test_claim_normalizer_does_not_invent_assumptions_or_evidence` (~line 1980-1986): asserts `normalize_claim(node_id="node-1", raw_text="Remote work might help some teams.").implied_assumptions == []` and `evidence_refs == []` and `ambiguity_flags == []` and `key_terms == []`. **This assertion is now WRONG under the decided design** and must be deliberately updated: `"might"` is a specified hedge marker, so `ambiguity_flags` must become `["might"]` (non-empty). `implied_assumptions` stays `[]` (no causal/prediction/comparative family matched). `evidence_refs` stays `[]` (no URL). `key_terms` stays `[]` (out of scope, per constraints). The plan's new test file supersedes this exact scenario; this pre-existing test in `test_node_scoring.py` must be edited in place as part of Task 1 (see Step 3b) so the suite doesn't regress.
- `coordinator/tests/test_node_scoring.py:89-100` `base_claim()` test helper constructs a `NormalizedClaim` directly (bypassing `normalize_claim`) with hardcoded fields including `"ambiguity_flags": ["missing evidence"]` and `"implied_assumptions": ["productivity is measurable"]` — this helper is unaffected by this plan (it doesn't call `normalize_claim` or the new rule engine) and needs no changes.
- `coordinator/tests/test_node_scoring.py:4783-4801` already contains `test_node_scoring_input_hash_is_stable_for_same_real_inputs` and `test_node_scoring_input_hash_changes_when_claim_or_argument_changes` — both compare hash-to-hash (never assert a literal hash string), so they are unaffected by the `v1`→`v2` bump and require no changes.
- No existing `coordinator/tests/test_normalizer.py` file exists yet — this plan creates it fresh.
- Python venv confirmed at `apps/dialectical-engine/.venv/Scripts/python.exe` (sibling to `coordinator/`), so `cd coordinator && ../.venv/Scripts/python.exe -m pytest ...` resolves correctly.

**Flagged deviation from the task brief (does not change any design decision, naming only):** the brief calls the scope type `ScoringScope`; the actual, already-existing pydantic model in `app/scoring/models.py` is named `Scope` (see `models.py:44-48`). This plan uses the real name `Scope` throughout. No new type is introduced and no rename is performed — `extract_scope(text) -> Scope` returns the existing model as-is.

---

### Task 1: Rule-based claim normalization + input-hash version bump

**Files:**
- Modify: `coordinator/app/scoring/normalizer.py` (full rewrite of the module body)
- Modify: `coordinator/app/scoring/cache.py` (one-line version bump)
- Modify: `coordinator/tests/test_node_scoring.py` (update the one pre-existing test whose assertion is now deliberately wrong — see Global Constraints note above)
- Test: `coordinator/tests/test_normalizer.py` (new)

**Interfaces:**
- Produces: `classify_claim_type(text: str) -> tuple[ClaimType, list[str]]`; `extract_scope(text: str) -> Scope`; `normalize_claim(*, node_id: str, raw_text: str) -> NormalizedClaim` (signature unchanged, behavior no longer stubbed).
- Consumes: `app.scoring.models.ClaimType`, `app.scoring.models.Scope`, `app.scoring.models.NormalizedClaim` (all pre-existing, unchanged).

- [ ] **Step 0: Capture the baseline failure count**

Before touching any code, run the full coordinator suite once and record the result so the "zero NEW failures" constraint has a concrete baseline to diff against:

```bash
cd coordinator && PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 ../.venv/Scripts/python.exe -m pytest -p pytest_cov.plugin -p pytest_asyncio.plugin tests -v --basetemp=.pytest-tmp
```

Expected: 12 known env-harness failures (pre-existing, unrelated to scoring/normalization — e.g. environment/infra-dependent tests). Save the list of failing test node IDs from this run; it is the baseline every later run in this task must match exactly (same 12, no more, no fewer, no new names).

- [ ] **Step 1: Write failing tests**

```python
# coordinator/tests/test_normalizer.py
from __future__ import annotations

import pytest

from app.scoring.cache import SCORING_INPUT_HASH_VERSION, node_scoring_input_hash
from app.scoring.models import Scope
from app.scoring.normalizer import classify_claim_type, extract_scope, normalize_claim


# ---------------------------------------------------------------------------
# classify_claim_type: one family per test group, >=3 example sentences each
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "text",
    [
        "Remote work has higher retention than office-only work.",
        "This proposal is better than the previous policy.",
        "Solar power is now cheaper than coal in most markets.",
    ],
)
def test_classify_claim_type_comparative(text: str) -> None:
    claim_type, markers = classify_claim_type(text)
    assert claim_type == "comparative"
    assert markers


@pytest.mark.parametrize(
    "text",
    [
        "Remote work will increase hiring competition next year.",
        "Automation is going to displace millions of factory jobs.",
        "Global temperatures are expected to rise by 2050.",
    ],
)
def test_classify_claim_type_prediction(text: str) -> None:
    claim_type, markers = classify_claim_type(text)
    assert claim_type == "prediction"
    assert markers


@pytest.mark.parametrize(
    "text",
    [
        "Remote work causes higher employee retention.",
        "Poor sleep leads to reduced cognitive performance.",
        "The policy change was caused by public pressure.",
    ],
)
def test_classify_claim_type_causal(text: str) -> None:
    claim_type, markers = classify_claim_type(text)
    assert claim_type == "causal"
    assert markers


@pytest.mark.parametrize(
    "text",
    [
        "Teams should adopt remote work for better retention.",
        "Governments ought to regulate carbon emissions more strictly.",
        "It is wrong to ignore climate refugees.",
    ],
)
def test_classify_claim_type_normative(text: str) -> None:
    claim_type, markers = classify_claim_type(text)
    assert claim_type == "normative"
    assert markers


@pytest.mark.parametrize(
    "text",
    [
        "Remote work is defined as work done away from a central office.",
        "Inflation means that money loses purchasing power over time.",
        "A recession is when economic activity declines for two consecutive quarters.",
    ],
)
def test_classify_claim_type_definitional(text: str) -> None:
    claim_type, markers = classify_claim_type(text)
    assert claim_type == "definitional"
    assert markers


@pytest.mark.parametrize(
    "text",
    [
        "Studies show remote work retention is 8 percent higher.",
        "Research indicates that 42% of workers prefer hybrid schedules.",
        "The data shows a measured increase in productivity of 15%.",
    ],
)
def test_classify_claim_type_empirical(text: str) -> None:
    claim_type, markers = classify_claim_type(text)
    assert claim_type == "empirical"
    assert markers


# ---------------------------------------------------------------------------
# Ambiguity / hedging markers (recorded, do not change claim_type on their own)
# ---------------------------------------------------------------------------


def test_classify_claim_type_hedge_does_not_block_family_match() -> None:
    claim_type, markers = classify_claim_type("Remote work might cause higher retention.")
    assert claim_type == "causal"
    assert markers  # causal markers, not hedge markers


@pytest.mark.parametrize(
    ("text", "expected_hedge"),
    [
        ("Remote work might help some teams.", "might"),
        ("This policy may reduce costs.", "may"),
        ("The plan could improve morale.", "could"),
        ("Some say remote work harms culture.", "some say"),
        ("Arguably, remote work is the future.", "arguably"),
        ("This is probably the right call.", "probably"),
    ],
)
def test_normalize_claim_records_hedge_as_ambiguity_flag(text: str, expected_hedge: str) -> None:
    claim = normalize_claim(node_id="node-1", raw_text=text)
    assert expected_hedge in claim.ambiguity_flags


def test_normalize_claim_no_hedge_means_no_ambiguity_flags() -> None:
    claim = normalize_claim(node_id="node-1", raw_text="Remote work causes higher retention.")
    assert claim.ambiguity_flags == []


# ---------------------------------------------------------------------------
# Mixed and unknown outcomes
# ---------------------------------------------------------------------------


def test_classify_claim_type_mixed_when_two_families_match() -> None:
    # Causal ("leads to") AND comparative ("more ... than") both fire.
    text = "Remote work leads to more retention than office-only work."
    claim_type, markers = classify_claim_type(text)
    assert claim_type == "mixed"
    assert len(markers) >= 2


def test_classify_claim_type_unknown_when_nothing_matches() -> None:
    claim_type, markers = classify_claim_type("Maybe this matters somehow.")
    assert claim_type == "unknown"
    assert markers == []


def test_normalize_claim_defaults_vague_text_to_unknown_claim_type() -> None:
    claim = normalize_claim(node_id="node-1", raw_text="Maybe this matters somehow.")
    assert claim.claim_type == "unknown"


# ---------------------------------------------------------------------------
# implied_assumptions: mechanical derivations only
# ---------------------------------------------------------------------------


def test_implied_assumptions_for_causal_claim() -> None:
    claim = normalize_claim(node_id="node-1", raw_text="Remote work causes higher retention.")
    assert claim.implied_assumptions == [
        "correlation supports causation here",
        "no major confounder dominates",
    ]


def test_implied_assumptions_for_prediction_claim() -> None:
    claim = normalize_claim(node_id="node-1", raw_text="Remote work will increase hiring competition next year.")
    assert claim.implied_assumptions == ["current trend continues"]


def test_implied_assumptions_for_comparative_claim() -> None:
    claim = normalize_claim(node_id="node-1", raw_text="Remote work has higher retention than office-only work.")
    assert claim.implied_assumptions == ["comparison baseline is well-defined"]


def test_implied_assumptions_empty_for_definitional_claim() -> None:
    claim = normalize_claim(node_id="node-1", raw_text="Remote work is defined as work done away from a central office.")
    assert claim.implied_assumptions == []


# ---------------------------------------------------------------------------
# evidence_refs: URL extraction only
# ---------------------------------------------------------------------------


def test_normalize_claim_extracts_url_evidence_refs() -> None:
    text = "Remote work causes higher retention (see https://example.com/study-2024 for details)."
    claim = normalize_claim(node_id="node-1", raw_text=text)
    assert claim.evidence_refs == ["https://example.com/study-2024"]


def test_normalize_claim_no_url_means_empty_evidence_refs() -> None:
    claim = normalize_claim(node_id="node-1", raw_text="Remote work causes higher retention.")
    assert claim.evidence_refs == []


def test_normalize_claim_extracts_multiple_url_evidence_refs() -> None:
    text = "See http://a.example.com/one and https://b.example.org/two for sources."
    claim = normalize_claim(node_id="node-1", raw_text=text)
    assert claim.evidence_refs == ["http://a.example.com/one", "https://b.example.org/two"]


# ---------------------------------------------------------------------------
# extract_scope: conservative, fixed-vocabulary extraction
# ---------------------------------------------------------------------------


def test_extract_scope_timeframe_year() -> None:
    scope = extract_scope("By 2030, remote work will dominate white-collar hiring.")
    assert scope.timeframe == "2030"


def test_extract_scope_timeframe_since() -> None:
    scope = extract_scope("Since 2020, remote work adoption has tripled.")
    assert scope.timeframe == "since 2020"


def test_extract_scope_timeframe_over_last_n_years() -> None:
    scope = extract_scope("Over the last 5 years, remote work adoption has tripled.")
    assert scope.timeframe == "over the last 5 years"


def test_extract_scope_geography_fixed_vocabulary_match() -> None:
    scope = extract_scope("Remote work adoption in Germany has tripled since 2020.")
    assert scope.geography == "Germany"


def test_extract_scope_geography_no_match_stays_none() -> None:
    scope = extract_scope("Remote work adoption in Springfield has tripled.")
    assert scope.geography is None


def test_extract_scope_population_among_pattern() -> None:
    scope = extract_scope("Remote work is more popular among software engineers.")
    assert scope.population == "software engineers"


def test_extract_scope_unmatched_fields_stay_none() -> None:
    scope = extract_scope("Remote work improves retention.")
    assert scope.timeframe is None
    assert scope.geography is None
    assert scope.population is None
    assert scope.domain is None


def test_extract_scope_combines_multiple_fields() -> None:
    scope = extract_scope("Since 2020, remote work adoption among software engineers in Germany has tripled.")
    assert scope.timeframe == "since 2020"
    assert scope.geography == "Germany"
    assert scope.population == "software engineers"


def test_normalize_claim_wires_scope_into_result() -> None:
    claim = normalize_claim(
        node_id="node-1",
        raw_text="Since 2020, remote work adoption in Germany has tripled.",
    )
    assert isinstance(claim.scope, Scope)
    assert claim.scope.timeframe == "since 2020"
    assert claim.scope.geography == "Germany"


# ---------------------------------------------------------------------------
# core_claim passthrough (existing behavior, must not regress)
# ---------------------------------------------------------------------------


def test_normalize_claim_preserves_actual_text_as_core_claim() -> None:
    claim = normalize_claim(node_id="node-1", raw_text="  Remote work improves productivity.  ")
    assert claim.node_id == "node-1"
    assert claim.raw_text == "  Remote work improves productivity.  "
    assert claim.core_claim == "Remote work improves productivity."


# ---------------------------------------------------------------------------
# key_terms: explicitly out of scope, must remain empty
# ---------------------------------------------------------------------------


def test_normalize_claim_key_terms_remains_empty() -> None:
    claim = normalize_claim(node_id="node-1", raw_text="Remote work causes higher retention among engineers.")
    assert claim.key_terms == []


# ---------------------------------------------------------------------------
# Input-hash version bump: same claim/argument, hash differs after the bump
# ---------------------------------------------------------------------------


def test_input_hash_version_is_bumped_to_v2() -> None:
    assert SCORING_INPUT_HASH_VERSION == "node-scoring-input-v2"


def test_node_scoring_input_hash_changes_from_v1_baseline_for_same_claim() -> None:
    claim = normalize_claim(node_id="node-1", raw_text="Remote work causes higher retention.")
    v1_payload_hash = __import__("hashlib").sha256(
        __import__("json").dumps(
            {
                "version": "node-scoring-input-v1",
                "claim": claim.model_dump(mode="json"),
                "argument_text": "Retention improved by 12%.",
            },
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
    ).hexdigest()
    v2_hash = node_scoring_input_hash(claim=claim, argument_text="Retention improved by 12%.")
    assert v2_hash != v1_payload_hash
```

- [ ] **Step 2: Run to verify failure**

Run: `cd coordinator && PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 ../.venv/Scripts/python.exe -m pytest -p pytest_cov.plugin -p pytest_asyncio.plugin tests/test_normalizer.py -v --basetemp=.pytest-tmp`

Expected: FAIL — `classify_claim_type` and `extract_scope` do not exist yet (`ImportError`); `SCORING_INPUT_HASH_VERSION` is still `"node-scoring-input-v1"`.

- [ ] **Step 3a: Implement `normalizer.py`**

Replace the full contents of `coordinator/app/scoring/normalizer.py`:

```python
"""Deterministic, rule-based claim normalization.

No LLM/provider calls. No network calls. No new dependencies — classification
and extraction use only the stdlib `re` module. When a rule does not clearly
match, the corresponding field stays honestly empty/`None`/`"unknown"` —
never guessed.

Claim type precedence
----------------------
Hedging/ambiguity markers ("might", "may", "could", "some say", "arguably",
"probably") are detected FIRST and always recorded into `ambiguity_flags`.
They never affect `claim_type` on their own — a hedged causal claim is still
`causal`, just also flagged as ambiguous.

After hedge detection, each of the six type families is checked independently
against the full text (a claim can match more than one family). If:
  - exactly one family matches -> that family's type is returned.
  - two or more families match -> `"mixed"` is returned, with the union of
    every matched family's marker strings.
  - no family matches -> `"unknown"` is returned with an empty marker list.

When exactly one family matches, the families are checked in this order
(more-specific-first), and the FIRST one found in this order wins in the
(impossible-in-practice-since-we-scan-all, but documented for clarity) case
of ambiguity in implementation:

    comparative > prediction > causal > normative > definitional > empirical

This order matters because some sentence shapes could plausibly be described
by more than one family's *name* even though only one family's *regex*
actually matches (e.g. "higher" alone is not a comparative match — only an
explicit "more/less/-er ... than"-shaped construction is). The precedence
list is the tie-breaker used when deciding which family's match "counts more"
for documentation purposes; in this implementation ties are handled by the
mixed-when-multiple-match rule above, and precedence order is reflected in
the order family checks are performed and reported.
"""
from __future__ import annotations

import re

from app.scoring.models import ClaimType, NormalizedClaim, Scope


# ---------------------------------------------------------------------------
# Hedging / ambiguity markers
# ---------------------------------------------------------------------------

_HEDGE_MARKERS: list[tuple[str, re.Pattern[str]]] = [
    ("might", re.compile(r"\bmight\b", re.IGNORECASE)),
    ("may", re.compile(r"\bmay\b", re.IGNORECASE)),
    ("could", re.compile(r"\bcould\b", re.IGNORECASE)),
    ("some say", re.compile(r"\bsome say\b", re.IGNORECASE)),
    ("arguably", re.compile(r"\barguably\b", re.IGNORECASE)),
    ("probably", re.compile(r"\bprobably\b", re.IGNORECASE)),
]


def _find_hedge_markers(text: str) -> list[str]:
    return [label for label, pattern in _HEDGE_MARKERS if pattern.search(text)]


# ---------------------------------------------------------------------------
# Claim-type family rules, in precedence order (more-specific-first):
#   comparative > prediction > causal > normative > definitional > empirical
# ---------------------------------------------------------------------------

_COMPARATIVE_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"\bmore\b[\w\s]{0,40}?\bthan\b", re.IGNORECASE),
    re.compile(r"\bless\b[\w\s]{0,40}?\bthan\b", re.IGNORECASE),
    re.compile(r"\bbetter\b[\w\s]{0,40}?\bthan\b", re.IGNORECASE),
    re.compile(r"\bworse\b[\w\s]{0,40}?\bthan\b", re.IGNORECASE),
    re.compile(r"\b\w+er\b[\w\s]{0,40}?\bthan\b", re.IGNORECASE),
    re.compile(r"\bcompared to\b", re.IGNORECASE),
    re.compile(r"\brelative to\b", re.IGNORECASE),
]

_PREDICTION_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"\bwill\s", re.IGNORECASE),
    re.compile(r"\bgoing to\b", re.IGNORECASE),
    re.compile(r"\bby 20\d\d\b", re.IGNORECASE),
    re.compile(r"\bis expected to\b", re.IGNORECASE),
    re.compile(r"\bare expected to\b", re.IGNORECASE),
    re.compile(r"\bforecast\b", re.IGNORECASE),
]

_CAUSAL_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"\bcauses\b", re.IGNORECASE),
    re.compile(r"\bcaused by\b", re.IGNORECASE),
    re.compile(r"\bleads? to\b", re.IGNORECASE),
    re.compile(r"\bresults? in\b", re.IGNORECASE),
    re.compile(r"\bbecause of\b", re.IGNORECASE),
    re.compile(r"\bdrives?\b", re.IGNORECASE),
    re.compile(r"\btriggers?\b", re.IGNORECASE),
]

_NORMATIVE_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"\bshould\b", re.IGNORECASE),
    re.compile(r"\bought\b", re.IGNORECASE),
    re.compile(r"\bmust not\b", re.IGNORECASE),
    re.compile(r"\bmust\s", re.IGNORECASE),
    re.compile(r"\bit is (wrong|right|immoral|unjust|unfair) to\b", re.IGNORECASE),
    re.compile(r"\bis (good|bad)\b", re.IGNORECASE),
    re.compile(r"\bare (good|bad)\b", re.IGNORECASE),
]

_DEFINITIONAL_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"\bis defined as\b", re.IGNORECASE),
    re.compile(r"\bmeans that\b", re.IGNORECASE),
    re.compile(r"\brefers to\b", re.IGNORECASE),
    re.compile(r"\bis a type of\b", re.IGNORECASE),
    re.compile(r"\bis when\b", re.IGNORECASE),
]

_EMPIRICAL_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"\bstudy\b", re.IGNORECASE),
    re.compile(r"\bstudies show\b", re.IGNORECASE),
    re.compile(r"\bresearch\b", re.IGNORECASE),
    re.compile(r"\bdata\b", re.IGNORECASE),
    re.compile(r"\bevidence\b", re.IGNORECASE),
    re.compile(r"\d+%"),
    re.compile(r"\brate of\b", re.IGNORECASE),
    re.compile(r"\bstatistics\b", re.IGNORECASE),
    re.compile(r"\bmeasured\b", re.IGNORECASE),
    re.compile(r"\bobserved\b", re.IGNORECASE),
    re.compile(r"\d+\s*percent\b", re.IGNORECASE),
]

_FAMILY_RULES: list[tuple[ClaimType, list[re.Pattern[str]]]] = [
    ("comparative", _COMPARATIVE_PATTERNS),
    ("prediction", _PREDICTION_PATTERNS),
    ("causal", _CAUSAL_PATTERNS),
    ("normative", _NORMATIVE_PATTERNS),
    ("definitional", _DEFINITIONAL_PATTERNS),
    ("empirical", _EMPIRICAL_PATTERNS),
]


def classify_claim_type(text: str) -> tuple[ClaimType, list[str]]:
    """Classify a claim's rhetorical type via ordered, deterministic regex rules.

    Returns (claim_type, matched_marker_strings). Hedge markers are detected
    separately (see `_find_hedge_markers`) and never influence this return
    value. See module docstring for full precedence rules.
    """
    matches: list[tuple[ClaimType, list[str]]] = []
    for claim_type, patterns in _FAMILY_RULES:
        found = [match.group(0) for pattern in patterns if (match := pattern.search(text))]
        if found:
            matches.append((claim_type, found))

    if len(matches) == 0:
        return "unknown", []
    if len(matches) == 1:
        return matches[0]

    all_markers: list[str] = []
    for _claim_type, markers in matches:
        for marker in markers:
            if marker not in all_markers:
                all_markers.append(marker)
    return "mixed", all_markers


# ---------------------------------------------------------------------------
# implied_assumptions: mechanical derivations keyed off claim_type only
# ---------------------------------------------------------------------------


def _implied_assumptions(claim_type: ClaimType) -> list[str]:
    if claim_type == "causal":
        return ["correlation supports causation here", "no major confounder dominates"]
    if claim_type == "prediction":
        return ["current trend continues"]
    if claim_type == "comparative":
        return ["comparison baseline is well-defined"]
    return []


# ---------------------------------------------------------------------------
# extract_scope: conservative, fixed-vocabulary regex extraction
# ---------------------------------------------------------------------------

_YEAR_PATTERN = re.compile(r"\b(19|20)\d\d\b")
_SINCE_YEAR_PATTERN = re.compile(r"\bsince (\d{4})\b", re.IGNORECASE)
_OVER_LAST_N_YEARS_PATTERN = re.compile(r"\bover the last (\d+) years?\b", re.IGNORECASE)

# Fixed, small vocabulary only. Deliberately NOT a general "in <ProperNoun>"
# heuristic — anything outside this list stays None rather than guessed.
_GEOGRAPHY_VOCABULARY: list[str] = [
    "United States",
    "United Kingdom",
    "Germany",
    "France",
    "Canada",
    "Australia",
    "Japan",
    "China",
    "India",
    "Brazil",
    "Europe",
    "Asia",
    "Africa",
    "North America",
    "South America",
]
_GEOGRAPHY_PATTERN = re.compile(
    r"\b(" + "|".join(re.escape(name) for name in _GEOGRAPHY_VOCABULARY) + r")\b"
)

_POPULATION_PATTERN = re.compile(r"\bamong ([a-z][\w\-]*(?:\s+[a-z][\w\-]*){0,3})", re.IGNORECASE)


def extract_scope(text: str) -> Scope:
    """Conservatively extract timeframe/geography/population scope.

    Every field defaults to None and is only set when a fixed pattern (or,
    for geography, a fixed vocabulary list) matches. No inference, no
    fuzzy matching, no free-form proper-noun guessing.
    """
    timeframe: str | None = None
    since_match = _SINCE_YEAR_PATTERN.search(text)
    over_match = _OVER_LAST_N_YEARS_PATTERN.search(text)
    year_match = _YEAR_PATTERN.search(text)
    if since_match:
        timeframe = f"since {since_match.group(1)}"
    elif over_match:
        timeframe = f"over the last {over_match.group(1)} years"
    elif year_match:
        timeframe = year_match.group(0)

    geography: str | None = None
    geography_match = _GEOGRAPHY_PATTERN.search(text)
    if geography_match:
        geography = geography_match.group(1)

    population: str | None = None
    population_match = _POPULATION_PATTERN.search(text)
    if population_match:
        population = population_match.group(1).strip()

    return Scope(timeframe=timeframe, geography=geography, population=population, domain=None)


# ---------------------------------------------------------------------------
# evidence_refs: URL extraction only
# ---------------------------------------------------------------------------

_URL_PATTERN = re.compile(r"https?://[^\s\)\]\,]+")


def _extract_evidence_refs(text: str) -> list[str]:
    return _URL_PATTERN.findall(text)


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


def normalize_claim(*, node_id: str, raw_text: str) -> NormalizedClaim:
    core_claim = raw_text.strip()
    claim_type, _markers = classify_claim_type(core_claim)
    return NormalizedClaim(
        node_id=node_id,
        raw_text=raw_text,
        core_claim=core_claim,
        claim_type=claim_type,
        scope=extract_scope(core_claim),
        implied_assumptions=_implied_assumptions(claim_type),
        evidence_refs=_extract_evidence_refs(core_claim),
        ambiguity_flags=_find_hedge_markers(core_claim),
        key_terms=[],
    )
```

Notes on the regexes above (read before questioning any single one):
- `_COMPARATIVE_PATTERNS`'s `\b\w+er\b[\w\s]{0,40}?\bthan\b` covers generic `-er than` constructions (e.g. "cheaper than", "faster than") in addition to the explicit `better/worse/more/less than` cases, per the decided design's `"-er than"` family member.
- `_PREDICTION_PATTERNS`'s `\bwill\s` intentionally requires a trailing space (matches the decided design's `"will "` marker exactly) so it does not match words like "will." at a sentence end without a following word — acceptable per spec since predictions are always "will <verb>".
- `_NORMATIVE_PATTERNS` checks `\bmust not\b` before the bare `\bmust\s` pattern is even needed for correctness (both are independently in the pattern list and both would independently match on "must not" text; this is fine because `classify_claim_type` only needs to know the family matched at least once — duplicate matches within one family collapse to a single family match).
- `_EMPIRICAL_PATTERNS` includes both `\d+%` and `\d+\s*percent\b` to satisfy the decided design's `"\d+%"` marker plus the human-readable "percent" spelling already exercised by the pre-existing test fixture `"Studies show remote work retention is 8 percent higher."`.
- `_GEOGRAPHY_PATTERN` is deliberately a fixed alternation over `_GEOGRAPHY_VOCABULARY` — no generic `"in <ProperNoun>"` heuristic is implemented, per the decided design ("only match the fixed list").
- `_POPULATION_PATTERN`'s `among (...)` capture is intentionally simple (up to 4 lowercase-led words) and only fires on an explicit "among X" construction — no other population heuristic is added.

- [ ] **Step 3b: Update the one pre-existing test whose expectation is now deliberately wrong**

In `coordinator/tests/test_node_scoring.py`, the test `test_claim_normalizer_does_not_invent_assumptions_or_evidence` (around line 1980) currently asserts `ambiguity_flags == []` for `"Remote work might help some teams."` — but `"might"` is now a recognized hedge marker, so this must change to assert the flag IS recorded. Replace:

```python
def test_claim_normalizer_does_not_invent_assumptions_or_evidence() -> None:
    claim = normalize_claim(node_id="node-1", raw_text="Remote work might help some teams.")

    assert claim.implied_assumptions == []
    assert claim.evidence_refs == []
    assert claim.ambiguity_flags == []
    assert claim.key_terms == []
```

with:

```python
def test_claim_normalizer_does_not_invent_assumptions_or_evidence() -> None:
    claim = normalize_claim(node_id="node-1", raw_text="Remote work might help some teams.")

    assert claim.implied_assumptions == []
    assert claim.evidence_refs == []
    assert claim.ambiguity_flags == ["might"]
    assert claim.key_terms == []
```

Leave the other two tests in that file (`test_claim_normalizer_defaults_vague_text_to_unknown_claim_type` and `test_claim_normalizer_assigns_minimal_deterministic_claim_types`) untouched — verify in Step 4 that both still pass unmodified against the new implementation (per the ground-truth analysis above, they should; if either fails, that is a real signal to re-examine the specific regex involved, not a reason to loosen the test).

- [ ] **Step 3c: Bump the input-hash version**

In `coordinator/app/scoring/cache.py`, change line 16:

```python
SCORING_INPUT_HASH_VERSION = "node-scoring-input-v1"
```

to:

```python
SCORING_INPUT_HASH_VERSION = "node-scoring-input-v2"
```

No other change to `cache.py` is needed — `node_scoring_input_hash` already reads this constant by reference.

- [ ] **Step 4: Run to verify pass**

Run: `cd coordinator && PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 ../.venv/Scripts/python.exe -m pytest -p pytest_cov.plugin -p pytest_asyncio.plugin tests/test_normalizer.py -v --basetemp=.pytest-tmp`

Expected: all new tests pass.

Then run the previously-stubbed-behavior tests in `test_node_scoring.py` explicitly:

Run: `cd coordinator && PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 ../.venv/Scripts/python.exe -m pytest -p pytest_cov.plugin -p pytest_asyncio.plugin tests/test_node_scoring.py -v -k "claim_normalizer or claim_type_model" --basetemp=.pytest-tmp`

Expected: `test_claim_normalizer_preserves_actual_text_as_core_claim`, `test_claim_normalizer_defaults_vague_text_to_unknown_claim_type`, `test_claim_normalizer_assigns_minimal_deterministic_claim_types` (all 6 parametrizations), `test_claim_normalizer_does_not_invent_assumptions_or_evidence` (as edited in Step 3b), and `test_claim_type_model_accepts_unknown_claim_type` all pass.

- [ ] **Step 5: Full suite baseline comparison**

Run: `cd coordinator && PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 ../.venv/Scripts/python.exe -m pytest -p pytest_cov.plugin -p pytest_asyncio.plugin tests -v --basetemp=.pytest-tmp`

Compare the failing-test list against the Step 0 baseline (12 known env-harness failures). Requirement: the failing set is identical (same test node IDs, same count) — zero NEW failures introduced by this task. If any test outside `test_normalizer.py`/the Step 3b edit newly fails, that is a real regression to fix before proceeding — do not adjust the baseline to hide it.

- [ ] **Step 6: Commit**

```bash
git add coordinator/app/scoring/normalizer.py coordinator/app/scoring/cache.py coordinator/tests/test_normalizer.py coordinator/tests/test_node_scoring.py
git commit -m "$(cat <<'EOF'
feat(scoring): deterministic rule-based claim normalization (Phase 2)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```
