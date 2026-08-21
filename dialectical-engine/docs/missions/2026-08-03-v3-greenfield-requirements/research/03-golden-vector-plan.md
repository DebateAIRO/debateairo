RESEARCH HANDOFF COMPLETE

# 03 — Golden-vector harvest plan

Ticket: `../wayfinder/issues/03-golden-vector-plan.md` (REQ-V3-GREENFIELD-R1)
Seat: Opus 5 research subagent. Read-only survey; V2 unchanged; nothing built.
Evidence base: `apps/dialectical-engine/coordinator/` at commit `b967c27`.

**Headline verdict:** existing fixtures are **NOT sufficient**. A V2 run harness
**IS needed**, but a narrower one than "run real debates" — a deterministic,
fake-judge, DB-backed **vector recorder**. Roughly 60% of the vector surface can
be captured with no harness at all, by a pure extraction script. The remaining
40% — everything involving graph topology, tau coverage, and the served payload —
has no surviving source of truth in the repo and must be regenerated.

---

## Existing fixtures survey

### What exists

| Asset | Path | What it is | Usable as a vector source? |
|---|---|---|---|
| smoke4 judge artifacts | `/Users/vladmihaimiron/Documents/DebateAIRO/apps/dialectical-engine/coordinator/tests/fixtures/smoke4_judge_artifacts.json` | 433,837 B. Flat list of **78 objects** = 26 nodes × 3 judge families, exported read-only from production debate `f67ad244-a37f-44cd-9008-31df0ef87bfe`. Keys: `node_id, judge_role, provider, model, raw_output_sha256, input_hash, parse_status, assessment`. All 78 `parse_status == "available"`. | **YES, partially.** The only recorded-from-production artifact in the repo. Judge-layer only. |
| smoke4 replay test | `.../coordinator/tests/test_cross_family_disagreement_replay.py` | The only replay harness that exists. Regroups the fixture into the exact dict shape `_persisted_judge_evidence_for_node` hands the detector, pins `EXPECTED_CONTESTED_COUNTS = {0.20: 16, 0.25: 13, 0.30: 8}`. Its docstring carries the `sqlite3 … -json` export command that produced the fixture. | **YES — this is the pattern to copy.** It is a working proof that frozen-JSON replay of V2 scoring behavior is achievable. |
| DF-QuAD literature goldens | `.../coordinator/tests/test_dfquad.py` | Two hand-transcribed graphs (`_golden_1_graph()` / `_golden_2_graph()`) from arXiv:2307.13582 Fig. 3 and arXiv:2407.08497 Fig. 1, asserted at `pytest.approx(x, abs=1e-12)`. Docstring: the numbers are ground truth; the implementation, never the numbers, must change. | **YES, and uniquely valuable** — these are *external* ground truth, not V2 behavior, so they carry **zero clean-room contamination** and transfer to V3 verbatim. |
| Benchmark suite inputs | `.../scripts/benchmark/cases/suite-v1.json` | 25 hand-authored cases (`id, category, claim_type, topic, expected_verdict_direction, is_trap, ground_truth_notes`). Authored inputs + direction labels. | **As topic seeds only.** Contains no V2 outputs. |
| Benchmark runner | `.../scripts/benchmark/runner.py` | Drives the coordinator HTTP API per case, polls to terminal state, reads metrics read-only from the SQLite DB, emits `manifest.json` + `results.json` (`benchmark-manifest-v1`). Imports `verdict_summary` and `compute_lean` so bands never drift. Injectable `client_factory` makes it offline-testable. | **Starting point, not a substitute.** It records *aggregate metrics*, not per-node input→output pairs, and captures none of the four internal observation points. |
| pytest `conftest.py` | `.../coordinator/tests/conftest.py` | Sets `DIALECTICAL_HOME` to a fresh `mkdtemp` and `DIALECTICAL_DATABASE_URL` to a SQLite file under it **before any app import**; `db` fixture does full drop/create per test; autouse `_no_internal_scoring_thread` stubs `trigger_internal_scoring_after_completion` to a no-op. | **Yes — this is the harness's boot recipe, already proven.** |

### What does NOT exist

- **No database.** No `*.db` / `*.sqlite3` / `*.sql` / dump anywhere in the repo,
  under `~`, or in temp. `~/.dialectical/db.sqlite3` — the source of the smoke4
  export — **is gone**. The `VACUUM INTO` snapshot referenced in
  `.../docs/improvement-plan-2026-07-22.md` for debate
  `90bad9c5-7181-446f-b943-55aa997cfd9f` was never committed and no longer
  exists. **Re-exporting a richer fixture from the original run is impossible.**
- **No snapshot library.** No syrupy / pytest-snapshot / approvaltests; no
  `.snap` / `.approved` files. `pyproject.toml` loads only `pytest_cov` and
  `pytest_asyncio`. The two hand-rolled substitutes are canonical-JSON string
  comparison in `test_verdict.py` and one pinned SHA-256 in
  `test_debate_graph_adapter.py:416`.
- **No `runs/` / `golden/` / `traces/` / `cassettes/` directory.** The runner's
  documented output dir `scripts/benchmark/runs/` has never been created.
- **No committed evaluation dataset.** `.../coordinator/app/evaluation/harness.py`
  defines `EvaluationHarness` / `EvaluationExample` / `EvaluationReport` with
  zero datasets anywhere in the tree.
- **No Makefile target** for benchmark / replay / golden / fixture / seed. The
  runner is invoked by hand only.

### Why the ~997 scoring tests are seeds, not vectors

~43% of the 2,335 tests in `coordinator/tests/` touch scoring, and ~201 of those
are pure no-DB no-mock scoring math. They encode real behavioral knowledge — but
they are **not harvestable as-is**, for four reasons:

1. **They are entangled with V2's Python types.** Inputs are `NormalizedClaim` /
   `ClaimAssessment` pydantic models, `ArgumentGraph` / `QBAFGraph` dataclasses.
   V3's stack is undecided (charting Q5), so vectors must be language-neutral
   JSON, not Python literals.
2. **Cross-file helper imports are load-bearing and undeclared.**
   `base_claim` / `base_assessment` / `explicit_depth_pressure_payload` live in
   `test_node_scoring.py` (10,657 lines, 217 tests) and are imported by
   `test_qbaf_debug.py`, `test_judge_contract_golden.py`, `test_calibration.py`,
   and `conftest.py` itself. `test_panel_scoring_reliability.py` imports four
   helpers from `test_score_before_synthesis.py`. Harvesting means untangling.
3. **Tolerance is inconsistent across identical math.** `test_dfquad.py` pins
   `abs=1e-12`; `test_qbaf_semantics.py` uses bare `pytest.approx` (rel=1e-6)
   for the same DF-QuAD propagation; `test_debate_graph_adapter.py` uses raw
   `==` on floats out of `compute_strengths()`. A vector table must pick one bar
   (see marking scheme below).
4. **They assert V2 is self-consistent, not that V2 is right.**
   `test_judge_contract_golden.py`, despite its name, pins **no expected
   scores** — only that contract stamps are present and raw output does not
   leak. It is not a numeric golden table.

**Survey verdict:** one real recording (judge layer only, no topology), one set
of literature goldens (pure DF-QuAD core), one working replay pattern, and no
database. Everything else must be captured fresh.

---

## Vector families

Ten families, 61 vector groups. Each group expands to 2–6 concrete vectors
(boundary, just-inside, just-outside, degenerate), giving roughly **140–180
concrete vectors** total. Family IDs are stable and are the join key between this
plan, the carryover manifest, and the eventual test suite.

Every vector targets one of **four observation points** (OP) so a divergence can
be localized rather than merely detected:

- **OP1 — reducer**: `reduce_assessments(claim, assessment) -> NodeScoringPayload`
- **OP2 — graph**: `debate_argument_graph(...) -> AdaptedDebateGraph` +
  `ArgumentGraph.compute_strengths()`
- **OP3 — protocol run**: the persisted `protocol_analysis` `AnalyzerRun.output`
  (`dialecticalStrengths`, `tauCoverage`, `tauSources`, `graphFingerprint`,
  `semanticsVersion`, `convergence`, `compositionNote`)
- **OP4 — served payload**: the HTTP response bodies —
  `GET /{debate_id}/scoring`, the verdict summary, the lean block, the
  serialization block. **The only point at which indicted semantic (d) is
  observable.**

### G — Graph topology (OP2, OP3) — 7 groups

Targets `debate_argument_graph` + `compute_strengths`.

| ID | Shape | Why |
|---|---|---|
| G1 | Single node (ROOT_CLAIM only, no edges, no children) | Degenerate floor. `probabilistic_sum([]) == 0` and `sigma(tau,0,0) == tau` must hold; root strength == its own tau. |
| G2 | Shallow-wide: root + N sibling PRO/CON, N ∈ {1, 2, 8, 50} | Probabilistic-sum saturation. At N=50 the aggregate approaches 1.0 and float accumulation order becomes observable. |
| G3 | Deep chain: linear PRO→PRO→…→root, depth ∈ {2, 5, 20} | Traversal-order sensitivity. V2 uses iterative Kahn's sort (`dfquad.py:113`); V3 may use recursion (as `semantics.py:41` already does internally). Must agree. |
| G4 | Balanced mixed tree: POV containers + PRO/CON + EVIDENCE, depth 3, breadth 3 | The realistic production shape. This is the family the harness must actually run end-to-end. |
| G5 | Degenerate/error: cycle; edge endpoint absent from `base_scores`; self-parent; duplicate edges; empty node list; tau out of [0,1] | V2 raises `CyclicGraphError` / `ValueError`; `qbaf_debug_block` swallows into `{"unavailable_reason": …}` while `runner.py:260` converts to `qbafUnavailableReason`. Two different degradation contracts — both must be pinned. |
| G6 | Container/lens-lift: POV container sitting between a PRO/CON child and the root | The `df-quad-v1` vs `df-quad-v2-lens-lift` divergence. Under v1 the container gets a support edge; under v2 the child's edge lifts past it (`_v2_effective_parent`). Also: orphaned-parent walk, malformed container cycle. |
| G7 | Evidence edges: verdict ∈ {supported(base_score), contradicted, unverifiable, absent, malformed base_score, bool base_score, out-of-range} | Task-12 semantics. `CONTRADICTED_EVIDENCE_TAU = 0.7` is a fabricated magnitude (`debate_adapter.py:60`) and belongs to indicted semantic (a). |

### W — Edge weight and tau spread (OP2) — 4 groups

| ID | Case | Why |
|---|---|---|
| W1 | tau extremes: all 0.0, all 1.0, all 0.5, mixed spread | `sigma(0, v_a, v_s) == 0` when attacked; `sigma(1, …)` saturation. |
| W2 | Mediating-function branch boundary: `v_a == v_s` exactly, and ±1e-9 either side | `dfquad.py:64` branches on `attacker_strength >= supporter_strength`. The `>=` (not `>`) is a real semantic choice and must be pinned; a V3 that uses `>` produces a discontinuity DF-QuAD exists to avoid. |
| W3 | Weighted lane only: edge weight ∈ {0.0, 0.5, 1.0}; duplicate edge same weight (collapses); duplicate edge conflicting weight (**raises**) | `semantics.py:89-102`. Note: `SEMANTICS_WEIGHTED_V1` is *registered* in `semantics_versions.py:5` but **rejected** by `debate_adapter.py:266`. See Uncertainties. |
| W4 | Float accumulation: 20 supporters each at 0.1; same set in reversed order | Probabilistic sum is order-insensitive in exact arithmetic but not in IEEE-754. Sets the tolerance floor empirically. |

### U — Unjudged nodes — **indicted (a)** (OP2, OP3, OP4) — 6 groups

| ID | Case | Why |
|---|---|---|
| U1 | Every argument node judged → `tauCoverage == 1.0` | The control. Must MATCH. |
| U2 | No node judged → `tauCoverage == 0.0`, every tau is `DEFAULT_TAU = 0.5` | The pure indictment case. V2 produces a full strength distribution from zero evidence. |
| U3 | Partial coverage at the gate: exactly 0.5, 0.49, 0.51 | `verdict.py:44 _TAU_COVERAGE_MIN = 0.5` and `verdict.py:256` collapse coverage to a binary `tauSourceMajority`. 51% judged currently reads as `"judge_strength"`. |
| U4 | Judged graph containing `status == "failed"` nodes | `runner.py:237` excludes dead ids from the coverage *denominator* but not from the *graph*. Subtle and must be pinned before it is re-specified. |
| U5 | Unjudged leaves vs unjudged root vs unjudged interior | Where the 0.5 default lands changes the root strength differently in each case. |
| U6 | Malformed score item: `strength` is bool / str / missing / `scores` key absent | `_tau_for` (`debate_adapter.py:84-92`) falls to `DEFAULT_TAU` on every one. Also: `lean.py:141` scores an absent node as **0.0 mass**, and `dialectical_v2.py:1502` ranks unscored branches as strength 0 — *two additional, different* fallbacks for the same condition. |

### D — Dedup collision — **indicted (c)** (OP1, OP3, OP4) — 9 groups

| ID | Case | Why |
|---|---|---|
| D1 | Byte-identical claim text twice | `node_scoring_input_hash` (`cache.py:51-75`) — sha256 over canonical JSON. Must collide (cache hit). |
| D2 | Whitespace-only difference (trailing space, double space, `\r\n` vs `\n`) | Different hash under V2 → full re-judge. |
| D3 | Case-only difference | Same. |
| D4 | Unicode normalization difference (NFC vs NFD, curly vs straight apostrophe) | Same. Likely the most common real-world false miss. |
| D5 | Semantic paraphrase, entirely different strings | V2 treats as unrelated. The core indictment. |
| D6 | Two judges, **byte-identical** `raw_output` | `service.py:1593` and the duplicated expression at `disagreement.py:249` collapse them via `raw_output_sha256`. Must stay collapsed. |
| D7 | Two judges, semantically identical, differing by one byte | Counted as **two independent** judgments; drives dispersion and `uncertainty_source == "dispersion"`. The indictment's sharp edge. |
| D8 | Same evidence span extracted twice | `extraction.py:177` `persist_evidence_nodes` has **no dedup check at all** — re-extraction duplicates EVIDENCE leaves and inflates `distinct_source_count`. |
| D9 | Evidence sources `sub.example.com` vs `example.com` vs `example.com/a` | `independence.py:142-144` counts distinct `(source_domain, method)` string pairs; no public-suffix logic (documented choice at `independence.py:42-45`). |

### A — Abstention and honest degradation (OP1, OP3, OP4) — 8 groups

Feeds ticket 10 (abstention semantics) as well as this one.

| ID | Case |
|---|---|
| A1 | Judge output unparseable (`parse_status != "available"`) |
| A2 | Judge returns explicit abstention / refusal |
| A3 | Zero judges available for a node |
| A4 | `protocol_output` absent entirely → band `unavailable` |
| A5 | `protocol_output` present, `root_node_id` absent from `dialecticalStrengths` |
| A6 | Evidence gate: `empirical` claim × `evidence_presence` ∈ {none, extracted_unresolved, present} × `gate_enabled` ∈ {true, false} (shadow mode) |
| A7 | `verificationStatus` `"pending"` vs `"pending_verification"` — distinct in `basis`, same suffix sentence in `claimLanguage` (`verdict.py:18-23`) |
| A8 | Convergence: `first_evaluation` / `topology_changed` / `semantics_changed` / `strengths_unavailable` / converged / not-converged, incl. the evidence-topology-change detector (`runner.py:330-340`) |

### S — Semantics variant selection — **indicted (b)** (OP2, OP3) — 4 groups

| ID | Case | Why |
|---|---|---|
| S1 | Identical graph under `df-quad-v1` and `df-quad-v2-lens-lift` | Must produce **different** strengths and a **different** fingerprint (`debate_adapter.py:334` salts the digest for non-default semantics). Records the real magnitude of the variant choice. |
| S2 | `df-quad-weighted-v1` requested through the debate path | V2 **raises** (`debate_adapter.py:266`). Meanwhile `api/qbaf.py:83` stamps that same literal on runs computed by `DFQuADSemantics` (`name == "df-quad"`) — a stamp that does not describe the computation. |
| S3 | Semantics stamp absent / blank on a stored run | `verdict.py:236-238` and `semantics_versions.py:16` silently backfill to v1 rather than "unknown". |
| S4 | Unknown semantics string | `resolve_semantics` raises; `runner.py:294-299` catches and treats as honestly-different for convergence. |

Supporting evidence for the indictment: the production path pins the variant as a
module constant — `runner.py:188 semantics_version = DEFAULT_SEMANTICS`, and
`runner.py:191` calls `debate_argument_graph` **without** a semantics argument.
`debate.config` is read for `convergence_epsilon` (`runner.py:276`) but never for
semantics. The only route to v2-lens-lift is the debug env var
`DIALECTICAL_QBAF_DEBUG_SEMANTICS` (`qbaf_debug.py:108`). The aggregation formula
itself has no variant seam: `compute_strengths()` takes no semantics parameter.

### P — Provenance-blind serving — **indicted (d)** (OP4 only) — 7 groups

These are the only vectors that require the HTTP surface. None of them are
reachable from the pure lane.

| ID | Case | V2 behavior |
|---|---|---|
| P1 | Mixed-provenance payload: node A freshly judged, node B hydrated from historical cache | One payload-level `producer` label for the whole set (`service.py:316-320`); per-item freshness unrecoverable. |
| P2 | Multi-node debate, judges differ per node | `service.py:309-310` — only the **first** node's provider/model/checked_at becomes the payload's `model_metadata`. |
| P3 | A reducer/rubric version string fails the secret scrub | `service.py:2042-2043` drops **all** debug provenance rather than flagging it. |
| P4 | Payload replayed from a stored `AnalyzerRun` | Served as `"cache": {"hit": False}` (`service.py:285-286`, `:327`) though nothing was recomputed. |
| P5 | Provider/model metadata containing a secret marker | `lineage.py:147-148` returns `None` — indistinguishable on the wire from "never recorded". |
| P6 | Lean served for a partially-judged run | `lean.py:146` omits the `tauCoverage` it gated on, unlike `verdict.py:292` which carries it in `basis`. And the gate is `> 0.0` (`lean.py:140`): **one** judged node in 100 lets a "dialectical" lean be computed from 99 default taus. |
| P7 | Item hydrated under a superseded `contract_hash` | `service.py:437` hardcodes `status="available"`; `_hydrate_historical_public_result` (`service.py:427-430`) adds no stale marker to the item. |

Structural root cause to record with the family: `ScoreProvenance`
(`models.py:346-353`) declares only `raw_judge_output_kind`,
`raw_judge_output_included`, `final_score_source`, `reducer_version`,
`rubric_version` — **no `judge_id`, `judge_version`, `contract_hash`,
`input_hash`, `run_id`, or per-node `tau_source`**, and the served payload
(`service.py:250-255`) carries no `tauCoverage` / `tauSources` /
`semanticsVersion` / `graphFingerprint` at all; the only carrier of `tau_sources`
is the debug block, gated off by `DIALECTICAL_QBAF_DEBUG` (`service.py:287`).

### R — Reducer and rubric (OP1) — 9 groups — kept behavior

| ID | Case |
|---|---|
| R1 | `evidence_weighted` composition — the 0.25/0.25/0.20/0.15/0.15 − 0.20 form (`reducer.py:128-133`) |
| R2 | `argument_only` composition for `normative` / `definitional` — (1/3), (4/15), 0.20, 0.20, −0.20 (`reducer.py:119-124`), incl. the branch boundary on `claim_type` |
| R3 | Clamp at both ends: inputs driving `base_strength` below 0 and above 1 |
| R4 | Score caps: `weak_evidence` → strength ≤ 0.45; `fatal_contradiction` → strength ≤ 0.25; impact ≤ 0.25 (`caps.py:18,29,40`), incl. two caps on the same field |
| R5 | Uncertainty ladder: 0.20 base + 0.08/flag + 0.10 no-refs + 0.10 low-quality + 0.08/disagreement + 0.04/cap (`reducer.py:363-368`) |
| R6 | `uncertainty_drivers` **ordering** — the fixed emission order is contractual (`reducer.py:378-385`) and repeats per disagreement/cap |
| R7 | Depth pressure: four ×0.25 contributors; label boundaries at 0.34 and 0.67 (`reducer.py:418-423`) tested at exactly 0.25/0.50/0.75 |
| R8 | `recommended_investigations`: priority clamp to [1,5], the sort key `(priority, action, reason)`, the unanswered-attack signal |
| R9 | Rounding: every emitted score passes `round(value, 4)` (`reducer.py:450-451`) |

### V — Verdict banding (OP3→OP4) — 4 groups — kept behavior

| ID | Case |
|---|---|
| V1 | Band boundaries at exactly 0.65 and 0.35, ±0.001 either side (`>=` and `<=` respectively) |
| V2 | `insufficient_scoring` at `tauCoverage` exactly 0.5, 0.4999, 0.5001 |
| V3 | `claimLanguage` exact strings, incl. the `round(strength, 2)` embedded in `support_label` and the appended pending/not-converged sentences |
| V4 | Suppression + caveats: `suppressed_no_evidence`, `endorsed_with_caveat`, `evidenceGateShadow` when the gate is off |

### N — Normalizer (OP1) — 3 groups — kept behavior, interacts with (c)

| ID | Case |
|---|---|
| N1 | `classify_claim_type` across empirical / causal / normative / definitional / mixed / unknown |
| N2 | `extract_scope` |
| N3 | `ambiguity_flags` — load-bearing: they drive `clarity`, uncertainty, holes, and an `ask_user` investigation |

---

## Capture method (incl. harness-needed verdict)

### Verdict

> **A V2 run harness IS needed.** Existing fixtures cover the judge-disagreement
> organ (smoke4) and the pure DF-QuAD core (literature goldens) and nothing else.
> The decisive fact is that **`~/.dialectical/db.sqlite3` no longer exists**, so
> no richer export from the original production run is possible. Families G4,
> U1–U5, A1/A3/A8, S1/S3, P1–P7 have **no surviving source of truth** and must be
> regenerated by running V2.

This graduates into a task ticket. Proposed name: **`18 — V2 golden-vector
recorder`**, `Type: task`, `Blocked by: 03`. This document is its specification.
Building it is out of scope here and out of scope for the frozen V2 repo.

### Three capture lanes

**Lane 1 — Pure extraction. No harness. ~60% of the surface.**

A single script that imports V2's pure modules and writes one JSON file per
vector. No database, no HTTP, no LLM, no network, no clock. Runs in seconds.

Covers: G1–G3, G5–G7 (OP2 only), W1–W4, R1–R9, V1–V4, N1–N3, S1/S2/S4, D1–D5
(hash level), U6 (adapter level), A4–A7 (verdict level).

Entry points it calls, all already pure and already purity-enforced by
`test_qbaf_purity.py`:

- `app.qbaf.dfquad.ArgumentGraph.compute_strengths`, `probabilistic_sum`, `mediating_function`
- `app.qbaf.debate_adapter.debate_argument_graph`
- `app.qbaf.semantics.DFQuADSemantics.propagate`, `combine_df_quad`
- `app.qbaf.semantics_versions.resolve_semantics`
- `app.scoring.reducer.reduce_assessments`, `select_depth_pressure`, `adaptive_depth_dry_run`
- `app.scoring.caps.apply_score_caps`
- `app.scoring.normalizer.classify_claim_type`, `extract_scope`, `normalize_claim`
- `app.scoring.cache.node_scoring_input_hash`
- `app.scoring.verdict.verdict_summary`
- `app.scoring.lean.compute_lean`
- `app.scoring.disagreement.field_spreads`, `detect_persisted_judge_disagreements`, `detect_disagreements`
- `app.scoring.parser.parse_judge_json`
- `app.scoring.calibration.judge_weight`, `correlated_discount`
- `app.exploration`'s `resolve_scoring_input`

**Lane 2 — Frozen replay. No harness. Already working.**

Reuse `smoke4_judge_artifacts.json` unchanged for D6, D7, and the dispersion/
disagreement organ, following `test_cross_family_disagreement_replay.py` exactly.
Copy that file's discipline: re-apply the production filters in the loader rather
than trusting the export, and record the expected counts as data.

**Lane 3 — V2 run harness. NEEDED. ~40% of the surface.**

Covers: G4, U1–U5, A1–A3, A8, S3, P1–P7, D8, D9 — i.e. everything requiring real
topology, real coverage arithmetic, or a real HTTP response.

#### What the harness MUST do

1. **Boot against a throwaway DB.** Set `DIALECTICAL_HOME` to a fresh temp dir
   and `DIALECTICAL_DATABASE_URL` to a SQLite file under it **before importing
   any app module** — the recipe `conftest.py` already proves. It must never
   open, read, or write `~/.dialectical/db.sqlite3`.

2. **Drive real debates through the real surfaces**, as
   `scripts/benchmark/runner.py` does (create via HTTP, poll to terminal state),
   so the served payloads in OP4 are genuine responses and not reconstructions.

3. **Use a scripted deterministic judge by default.** Wire
   `ProviderRegistry(agents=…, providers=…)` with the existing `FakeProvider`
   seam the test suite already uses. Zero LLM spend, byte-reproducible. It MUST
   also expose a `--live` mode for one confirmatory realism run, but `--live`
   output is *evidence*, never a golden vector — real judges are nondeterministic.

4. **Record at all four observation points, per debate.** Recording only OP4
   makes a divergence undiagnosable; recording only OP1–OP3 makes indicted
   semantic (d) untestable. Both halves are required.
   - **Inputs**: the full node table (`id, parent_id, node_type, status, depth,
     position, materialized_path`); the scripted assessments keyed by
     `(node_id, judge_role, provider, model)`; `debate.config`; the complete env
     flag set (at minimum `DIALECTICAL_FIELD_DISAGREEMENT`,
     `DIALECTICAL_QBAF_DEBUG`, `DIALECTICAL_QBAF_DEBUG_SEMANTICS`,
     `SCORE_BEFORE_SYNTHESIS`, `ADVERSARIAL_POV`, `CROSS_EXAM`,
     `DYNAMIC_PERSPECTIVES`, `LLM_PERSPECTIVES`, `SYNTHESIZER_ROTATION`).
   - **OP1**: each `NodeScoringPayload`, `model_dump(mode="json")`.
   - **OP2**: `base_scores`, `tau_sources`, `attacks`, `supports`, `fingerprint`,
     `semantics`, and `compute_strengths()`.
   - **OP3**: the `protocol_analysis` `AnalyzerRun.output` verbatim.
   - **OP4**: the raw response bodies of `GET /{debate_id}/scoring`, the verdict
     summary, the lean block, and the serialization block.

5. **Normalize node ids to stable aliases.** V2 node ids are almost certainly
   uuid4; without aliasing (`n0`, `n1`, … plus a recorded alias map) every
   re-record produces fresh ids and no vector is comparable across runs — and
   `graphFingerprint` is computed over node ids, so the fingerprint must be
   recorded **both** raw and alias-normalized.

6. **Self-check determinism before writing.** Run each scenario twice and refuse
   to emit unless the two manifests are byte-identical after alias
   normalization. This catches hidden nondeterminism (timestamps, dict ordering,
   `now_utc()` leakage) at capture time instead of at V3-comparison time, where
   it would masquerade as a divergence.

7. **Stamp every vector with its provenance.** V2 commit SHA; `REDUCER_VERSION`,
   `RUBRIC_VERSION`, `SCORING_INPUT_HASH_VERSION`, `VERDICT_THRESHOLDS_VERSION`,
   `CONVERGENCE_VERSION`, `crossExamVersion`, `verificationVersion`, the
   semantics id, and the env flag set. **A vector without its version stamps is
   unfalsifiable later** — V2's own comments show these versions have been bumped
   repeatedly (`node-scoring-reducer-v3`, `node-scoring-input-v3`, `verdict-v2`)
   precisely to invalidate stale artifacts.

8. **One vector = one self-describing JSON file.** Shape:
   `{id, family, observation_point, mark, match_spec, inputs, outputs, stamps, notes}`.
   No Python pickles, no pydantic, no cross-file imports — V3's stack is
   undecided, and the vectors must outlive that decision.

9. **Write nowhere but its own output directory.** V2 source is read-only.

#### Clean-room role split — a hard requirement

The capture script and the harness must **read V2's source**. That is legitimate
for capture — vectors record behavior, not code. But it contaminates the reader.
The mission's clean-room ruling therefore requires an explicit split:

- **Dirty room** (may read V2 source): whoever writes the extraction script and
  the harness, and whoever writes the behavioral spec in the carryover manifest.
- **Clean room** (may read *only* the vectors, the match/differ marks, and the
  behavioral spec — never V2 source): whoever implements V3's scoring organs.

This belongs in the carryover manifest as a binding process requirement, not just
here. Without it, "clean-room" is a label rather than a control.

#### Where the harness lives

Not in the frozen V2 repo. It needs V2 importable on its path, so it is either in
the V3 repo with a pinned V2 checkout, or in the third "race harness" place ticket
15 is deciding. Flagging for tickets 15 and 17 — this plan does not choose.

---

## Match/differ marking scheme

### Marks

Every vector carries exactly one mark, stored **in the vector file as data**, not
in test code — because ticket 08's contested-cluster rulings will re-mark some
vectors, and re-marking must not mean rewriting tests.

| Mark | Meaning |
|---|---|
| `MUST-MATCH` | V3 must reproduce V2's recorded output within the vector's `match_spec`. A divergence is a V3 bug. |
| `MUST-DIFFER(a)` | Unjudged-node fallback confidence. V3 must **not** reproduce V2's value here. |
| `MUST-DIFFER(b)` | Hardcoded aggregation-variant switch. |
| `MUST-DIFFER(c)` | Exact-string dedup. |
| `MUST-DIFFER(d)` | Provenance-blind serving. |
| `UNPINNED` | V2's behavior here is neither defended nor indicted. **Temporary only.** Every `UNPINNED` vector must be resolved to a MATCH or DIFFER mark by V before the spec pack closes — the mission's coverage law leaves no row contested-silent. Count of remaining `UNPINNED` vectors is a spec-readiness gate. |

The third mark is load-bearing. A strict two-way scheme forces a premature ruling
on behaviors nobody has examined (e.g. `lean.py`'s `> 0.0` gate, or the
`>=` in the mediating function), and a premature `MUST-MATCH` would freeze an
accident into the V3 contract.

### What "match" means numerically

| `match_spec` | Rule | Applies to |
|---|---|---|
| `EXACT` | Byte-identical after canonical serialization `json.dumps(x, sort_keys=True, separators=(",",":"))` | Strings, enums, labels, bands, ids, hashes, fingerprints, reason codes, claim language |
| `ROUND-4` | `round(v3, 4) == round(v2, 4)` | Everything downstream of the reducer. Justified because `reducer.py:450-451` **already** rounds every emitted score to 4dp — 4dp *is* V2's published precision, and demanding more would test V2's float noise rather than its semantics. |
| `TOL-1e-12` | `abs(v3 − v2) <= 1e-12` | Pure DF-QuAD core and adapter output on graphs of depth ≤ 20. Matches the existing bar in `test_dfquad.py`; tight enough to catch a wrong formula, loose enough to permit a different evaluation order. |
| `TOL-1e-9` | `abs(v3 − v2) <= 1e-9` | Propagated strengths on depth > 20 or breadth > 20, where IEEE-754 accumulation order legitimately differs between Kahn's-sort and recursive traversal. Family W4 exists to measure whether 1e-9 is the right floor; if W4 shows drift beyond it, the bar moves and the reason is recorded. |
| `ORDER-EXACT` | List equality including order | `uncertainty_drivers` (order is documented as contractual), `recommended_investigations` (explicit sort key), `caveats`, topological ordering where exposed |
| `SET-EQUAL` | Order-free membership | `attacks` / `supports` edge lists — V2 dedups order-preserving, but edge order provably cannot affect DF-QuAD output, so pinning it would over-constrain V3 |
| `KEYS-EQUAL` | Same key set, same value types, values unconstrained | Payload envelopes where V3 may add fields but must not drop them |
| `BAND-EQUAL` | The categorical output matches even where the underlying float is allowed to move | Verdict band, strength/uncertainty/impact labels, depth-pressure label. **The primary tool for MUST-DIFFER vectors**: it lets V3 change a number while the human-facing conclusion is still held to account. |
| `RAISES(<class>)` | Same error category, message not pinned | G5, S2, S4, W3-conflicting |
| `DEGRADES(<shape>)` | Same honest-degradation shape | `{"unavailable_reason": …}`, `qbafUnavailableReason`, band `unavailable`, `{"converged": None, "reason": …}` |

**Superset rule for `KEYS-EQUAL`:** V3 adding provenance fields is *expected*
(that is indicted semantic (d) being fixed) and must never be scored as a
divergence. V3 *dropping* a field V2 served is always a divergence, regardless of
mark — the UI boundary contract (ticket 01) depends on it.

### The MUST-DIFFER contract — what makes a vector separate "same" from "better"

`!=` is not a test. A `MUST-DIFFER` vector is worthless unless it also pins what
must **not** move. Every `MUST-DIFFER` vector therefore carries five fields:

| Field | Purpose |
|---|---|
| `differs_in` | Exact field path that is permitted/required to change, e.g. `outputs.op2.tau_sources["n3"]` |
| `v2_value` | The recorded V2 value at that path |
| `v3_forbidden` | **The regression trap.** Reproducing V2's value here *is* the bug. Usually `== v2_value`, sometimes a class (e.g. "any bare float"). |
| `v3_required` | A positive predicate the V3 output must satisfy — not merely "different". |
| `unchanged_elsewhere` | The field paths in this same vector that remain `MUST-MATCH`. **This is the separator.** Without it, any V3 output whatsoever passes a MUST-DIFFER vector, and "intentionally better" becomes unfalsifiable. |

Worked examples, one per indictment:

**(a) — vector `U2-01`, OP2/OP3, graph G4 with zero judged nodes**
- `differs_in`: `base_scores[*]` where `tau_sources[*] == "default"`; `outputs.op3.tauCoverage` consumers
- `v2_value`: every such tau is `0.5`; a full `dialecticalStrengths` distribution is produced
- `v3_forbidden`: emitting any bare float strength for an unjudged node — the specific trap is `0.5`, but *any* silently-substituted number is the defect
- `v3_required`: the unjudged node's confidence is a **typed unknown** that propagates; the root's served result carries an explicit "not computed from evidence" state rather than a number
- `unchanged_elsewhere`: graph topology (`attacks`/`supports`) `SET-EQUAL`; the `tauCoverage` **arithmetic** (`judged / argument_nodes`, EVIDENCE excluded, `status=="failed"` excluded) `EXACT`; all *judged* nodes' taus `ROUND-4`

**(b) — vector `S1-01`, OP2, graph G6 under v1 vs v2-lens-lift**
- `differs_in`: how the variant is selected and recorded
- `v2_value`: `runner.py:188` pins the constant; `runner.py:191` omits the argument; only a debug env var reaches v2-lens-lift; `api/qbaf.py:83` stamps a literal that does not describe the computation
- `v3_forbidden`: a module-level constant as the production selector; a stamp written independently of the object that computed the run
- `v3_required`: the variant is an explicit, recorded input on the run; the stamp is emitted **by** the computing component; requesting an unavailable variant fails loudly
- `unchanged_elsewhere`: for a *fixed* variant, every strength `TOL-1e-12` against V2's recorded values under that same variant; the fingerprint's sensitivity to the variant preserved

**(c) — vector `D7-01`, OP1/OP3, two byte-different semantically-identical judge outputs**
- `differs_in`: independence count, `uncertainty_source`, `scores.uncertainty`, `disagreement_status`
- `v2_value`: 2 independent judgments; `uncertainty_source == "dispersion"`; a non-zero spread
- `v3_forbidden`: treating a one-byte difference as evidence of judge disagreement
- `v3_required`: the two collapse, or the dispersion they generate is explicitly attributed to textual rather than substantive difference
- `unchanged_elsewhere`: the D6 byte-identical case still collapses (`EXACT`); `DISPERSION_UNCERTAINTY_SLOPE`'s mapping from a *genuine* spread `ROUND-4`; `field_spreads` on the smoke4 corpus still yields 13/26 contested at 0.25 unless V rules otherwise

**(d) — vector `P1-01`, OP4, mixed fresh/historical payload**
- `differs_in`: `producer`, `model_metadata`, `cache.hit`, per-item provenance
- `v2_value`: one payload-level `producer`; first node's metadata for all; `hit: False` on a pure replay
- `v3_forbidden`: any payload-level provenance label that a per-item fact contradicts
- `v3_required`: provenance is per-item — judge identity, contract hash, input hash, run id, freshness, and tau source travel with each score
- `unchanged_elsewhere`: every **numeric** score in the payload `ROUND-4`; every band and label `EXACT`; no V2-served field removed (`KEYS-EQUAL` superset rule)

### Coverage bookkeeping

Marks roll up to a readiness table the spec pack can publish:

| Family | Groups | Expected dominant mark |
|---|---|---|
| G | 7 | MUST-MATCH (G6 partly MUST-DIFFER(b)) |
| W | 4 | MUST-MATCH (W2 boundary likely UNPINNED at first) |
| U | 6 | **MUST-DIFFER(a)** |
| D | 9 | **MUST-DIFFER(c)** (D1, D6 stay MUST-MATCH) |
| A | 8 | MUST-MATCH, pending ticket 10 |
| S | 4 | **MUST-DIFFER(b)** |
| P | 7 | **MUST-DIFFER(d)** |
| R | 9 | MUST-MATCH, pending tickets 12/13 |
| V | 4 | MUST-MATCH, pending ticket 15 |
| N | 3 | MUST-MATCH |

Gate: **zero `UNPINNED` vectors remain** when the spec pack closes.

---

## Uncertainties

1. **Does `~/.dialectical/db.sqlite3` really not exist?** This is the single
   highest-leverage open question. My search found no SQLite file anywhere in the
   repo, under `$HOME`, or in temp. If V still holds that database (or any
   backup, or the machine that ran debate `f67ad244`), a read-only
   `VACUUM INTO` snapshot would yield real topology + real judge outputs + real
   served payloads for a genuine production run — and Lane 3's scope would shrink
   from "run V2" to "export V2", cutting the harness ticket substantially.
   **Ask V before sizing ticket 18.**

2. **Are node ids uuid4?** I inferred this but did not confirm it in
   `app/models/entities.py`. If they are deterministic, alias normalization
   becomes optional and `graphFingerprint` comparison gets much simpler. If not,
   aliasing is mandatory and the fingerprint must be recorded twice.

3. **Is 4dp rounding a contract or an accident?** `reducer.py:451` rounds every
   emitted score to 4 decimals. I have proposed `ROUND-4` as the bar downstream
   of the reducer on the assumption it is deliberate. If it is incidental, the
   bar should be tighter and the rounding itself becomes an `UNPINNED` vector.

4. **Is the weighted lane in the carryover set at all?**
   `SEMANTICS_WEIGHTED_V1` is registered but rejected by the debate adapter;
   `app/qbaf/semantics.py` + `app/orchestration/recursive.py` +
   `app/metareasoning/node_selection.py` + `app/api/qbaf.py` form a **second,
   parallel DF-QuAD implementation** unreachable from the debate path. If V3 does
   not carry it over, families W3 and S2 shrink and roughly 20 tests' worth of
   behavior leaves the manifest. This needs a ruling — it is not obviously in
   scope for any existing ticket.

5. **Ticket 08 will re-mark vectors.** ~24 CONTESTED battery rows are unresolved.
   A vector marked `MUST-MATCH` today may become `MUST-DIFFER` when the
   contested-cluster rulings land. This is why marks must live in vector data,
   not test code — but it also means the vector set cannot be frozen until 08
   closes. Capture can start now; marking closes last.

6. **Fake judges prove plumbing, not distribution.** Lane 3's deterministic mode
   proves V2 and V3 agree on the *machinery*. It does not prove they agree when
   fed the messy, high-variance output of real judges. I believe that gap belongs
   to the race criteria (ticket 15) rather than to equivalence testing — but if V
   wants equivalence proven against live judges, the harness needs a recorded-
   live-response replay mode and the spend authorization to populate it.

7. **Three different unjudged-node fallbacks, not one.** Indicted semantic (a) is
   framed as a single defect, but I found at least three distinct ones with
   different values: `DEFAULT_TAU = 0.5` in the adapter, `or 0.0` in
   `lean.py:141` and `dialectical_v2.py:1502`, and `0.0` in
   `branch_summary.py:243` — plus `CONTRADICTED_EVIDENCE_TAU = 0.7`, a fabricated
   magnitude for a verdict that carries none. Whether the indictment covers all
   of them, or only the adapter's, changes family U's marking. Recommend it
   covers all four; flagging rather than assuming.

8. **`judge_weight` is called with `config=None` unconditionally**
   (`service.py:1403`), making `calibration.py`'s `"config_override"` branch
   unreachable — every judge weight is `1.0 / "cold_start"`. `runner.py:256-257`
   self-documents this as `modelWeight=constant-1.0(P8)`. This looks like a fifth
   candidate indictment (hardcoded-and-unreachable configuration) that nobody has
   named. Not in my scope to rule on; recording it here so it is not lost.
