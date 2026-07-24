# Contested-Frontier Deliberation — Design

**Date:** 2026-07-24
**Status:** Approved for planning
**Supersedes control-flow decisions in:** `apps/dialectical-engine/docs/improvement-plan-2026-07-22.md` (P0–P5, shipped 2026-07-23)
**Grounded in:** live debate `f67ad244-a37f-44cd-9008-31df0ef87bfe` ("smoke4", 2026-07-24 17:08–17:38)

---

## 1. Motivation

Smoke4 was the first run with the full stack live: evidence acquisition, evidence
verification, a three-family judge panel, calibration weights, adversarial POV, and
cross-exam. It produced 52 nodes, 78 judge artifacts (all parsing `available` across
codex / claude / gemini), and a verdict.

It also produced an unambiguous result about its own design. The five strongest claims
in the entire tree are all attacks on the engine's founding premise:

| strength | claim |
|---|---|
| 0.534 | Calibrated confidence and independence are assumed, not verified |
| 0.523 | Failure to Falsify Is Not Validation |
| 0.517 | Failed Search Is Not Falsification |
| 0.507 | Consensus Can Amplify Shared Error |
| 0.507 | The Scorer Is Unvalidated: Regress to an Unaudited Judge |

The five weakest are the constructive POV roots themselves (0.241–0.291). No node in
the tree scored above 0.534; every node landed `mixed` or `weak`, mean 0.394.

Across six models and three judge families, the measured consensus is that **"iterate
until the AIs agree" is not a valid stopping rule.** This design takes that result at
face value and replaces the objective.

### 1.1 New objective

> Spend budget where model families disagree. Stop when disagreement is resolved or
> provably irreducible. Report unresolved disputes as part of the answer, not as a
> failure.

Agreement stops being the target. Resolution of disagreement becomes the target, and
irreducible disagreement becomes a first-class output.

---

## 2. Measured defects in the current engine

Each defect below is observed in smoke4 and traced to source.

### D1 — Synthesis races scoring (verdict written against 27% coverage)

`score_debate` started 17:12; synthesis ran 17:33–17:38; the aggregated `node_scoring`
run landed **17:54**. The verdict states it itself: *"Only 10 of 37 live argument nodes
(27%) have been scored."*

This is arithmetic, not an edge case. `DIALECTICAL_SYNTHESIS_SCORE_WAIT_SECONDS`
defaults to **240 s** (`coordinator/app/services/dialectical_v2.py:1204-1208`) while the
panel scoring deadline is `30min + nodes × panel_judges × 120s`
(`coordinator/app/scoring/jobs.py:60-74`). At 26 nodes × 2 panel judges that is a
~2h6m budget racing a 4-minute gate.

### D2 — `depth_budget` is inert; there is no depth control in v2

`triage.py` computes `depth_budget` (`_DEPTH_BUDGET_BY_DIFFICULTY`, `triage.py:21-25`),
clamps it to `max_depth` (`triage.py:139-142`), and persists it to
`protocol_state.triage.depth_budget` (`protocol/state.py:52`). **Nothing ever reads it
back.** A repo-wide grep finds hits only in those two files.

The legacy v1 pipeline enforces `max_depth` at `orchestrator.py:502-521`, but the live
v2 pipeline's `queue_v2_expand_job` (`dialectical_v2.py:1854-1955`) has **no depth check
at all**. Tree shape is set by the fixed POV template (root=0, POV=1, pro/con=2,
nested=3) plus expansion budgets — not by any depth knob.

### D3 — The improvement loop is open

The scorer emitted **49 `recommended_investigations`** in smoke4 (23 `challenge`,
26 `find_evidence`) and the engine acted on **zero**. It computes what to do next,
writes it to a report, and stops.

The consumer already exists: `coordinator/app/exploration/expansion_dispatch.py` maps
`DECISION_POLARITY = {"challenge": "CON", "seek_evidence": "PRO"}`
(`expansion_dispatch.py:76`) and selects a different-family author
(`_expansion_model_for`, `expansion_dispatch.py:196-210`). It is gated behind
`DIALECTICAL_ADAPTIVE_EXPANSION`, which defaults `False`
(`expansion_dispatch.py:79-81`) and is unset in production. Its budgets are
`max_rounds=2`, `max_per_node=2`, `max_per_debate=6`.

**This is an unplugged cable, not missing machinery.**

### D4 — Cross-family disagreement is measured, then discarded

Real dispersion exists in smoke4 (26 nodes, all three families present):

| field | mean spread | max | ≥0.20 | ≥0.30 |
|---|---|---|---|---|
| `critic.logical_validity` | 0.196 | 0.45 | 11 | 5 |
| `fallacy.logical_consistency` | 0.192 | 0.40 | 16 | 4 |
| `critic.assumption_risk` | 0.170 | 0.29 | 10 | 0 |
| `steelman.charitable_strength` | 0.168 | 0.42 | 9 | 1 |
| `critic.counterargument_strength` | 0.165 | 0.29 | 9 | 0 |
| `context.impact` | 0.136 | 0.35 | 5 | 2 |
| `evidence.evidence_quality` | 0.114 | 0.30 | 3 | 1 |
| `context.relevance` | 0.089 | 0.36 | 3 | 1 |

Yet every node recorded `disagreement_status: {"status": "none"}`.

Cause, verified at `coordinator/app/scoring/disagreement.py:72`:

```python
if high_score - low_score < 0.35:
    return []
```

The comparison runs on `_claim_strength_signal` (`disagreement.py:145-159`), a weighted
composite of five fields. Averaging across fields shrinks spread: the root node's raw
`logical_validity` spread was 0.17 (0.38 / 0.55 / 0.50) but its composite spread was
0.11. **A 0.35 gate on a composite is roughly 3× above anything this panel can
produce.** It has never fired and, as configured, never will.

### D5 — Adversarial monoculture

18 of 24 CON nodes in smoke4 were authored by `gpt-5.6sol-medium` alone. PRO nodes were
spread across six families. The adversarial half of the tree — the half doing the
validating — is effectively single-family.

`choose_adversarial_attacker_model` (`dialectical_v2.py:1174-1193`) does enforce
cross-family selection, but only three call sites use it: adversarial POV
(`dialectical_v2.py:1988`), cross-exam (`dialectical_v2.py:1502`), and adaptive
expansion (`expansion_dispatch.py:196-210`). Ordinary `v2_expand` children created by
the POV template do not route through it.

Separately, the primary judge is hard-wired to codex `gpt-5.6sol-medium`
(`config/agents.yaml:8-10`), so every gpt-authored node is graded at full weight by its
own family.

### D6 — Judge-tier mismatch is being read as disagreement

The panel is `claude-sonnet-5-high-loop` + `gemini-3.5-flash-loop`
(`deploy/launchd/coordinator.plist:26-27`) alongside primary judge `gpt-5.6sol-medium`.
Gemini is a **flash**-tier model on a panel with two high-tier models, and it grades
systematically generous — on node `7809a51f`: gemini 0.80 / 0.82 / 0.90 where claude
gave 0.35 / 0.40 / 0.50 on the same fields.

A constant per-judge offset is not disagreement about the claim. Today it is
indistinguishable from it.

### D7 — Non-convergence is computed and ignored

Post-scoring protocol run: `converged: false`, `maxDelta: 0.226`, `epsilon: 0.05`,
`nodesCompared: 52`. Scores were still moving at 4.5× the stability threshold when the
engine stopped. Stopping was driven by the exhaustion of the POV template, not by the
convergence test — which exists, ran, and failed.

### D8 — The synthesis prompt cannot survive a deep tree

`render_v2_job_prompt` for `v2_synthesize` (`dialectical_v2.py:2853-2874`) serialises
**every node in the debate together with its full `active_generation.argument` text**
into a single JSON blob. There is no truncation, no cap, no summarisation.

This is O(total nodes × argument length). At 52 nodes it fit. A contested-frontier run
targeting depth 10 will produce several hundred nodes. **This is the first thing that
breaks, and it breaks at the last step of a multi-hour run.**

### D9 — Evidence retrieval is structurally half-broken

3 of 6 `v2_evidence` jobs failed in smoke4 (coordinator-side `400` at job-complete).

Root cause: **only the `claude` CLI receives `--allowedTools WebSearch`, and only via
`scripts/subscription_loop.py:541-542`.** The standalone worker's `ClaudeCliAdapter`
(`worker/app/adapters/claude_cli.py:13-27`) never passes the flag. A `v2_evidence` job
claimed by a standard worker has no web access and can only fabricate URLs, which then
fail contract validation (`dialectical_v2.py:987-1049`).

Compounding it: `evidence_search_models()` defaults to a single model
(`DEFAULT_EVIDENCE_SEARCH_MODELS`, `dialectical_v2.py:881`), and `next_failover_model`
restricts `v2_evidence` to that pool (`orchestrator.py:983`) with
`job.required_model` already in `tried` (`orchestrator.py:977`). **The first failure
exhausts the failover ladder.**

### D10 — Perspective identity is assigned by positional round-robin

`_attach_pov_node_types` (`dialectical_v2.py:201-210`):

```python
return [(pov_types[index % len(pov_types)], label, lens) for index, ... ]
```

A free-form lens is stamped onto one of four fixed node types purely by list position.
A lens named "Confounding POV" becomes `ETHICAL_POV` because it landed at index 2.

This is deliberate — the QBAF adapter (`qbaf/debate_adapter.py:22-31, 225`) recognises
only those four types as support containers, and an unknown type yields
`"unmapped_edge"` and orphans the whole subtree from scoring. But it means `node_type`
carries no semantic information, and there is no typed notion of *what kind of thing*
a sub-question is.

### D11 — Deep-tree scaling hazards

- `pending_generation_nodes` (`dialectical_v2.py:2462-2488`) does a full scan of
  outstanding jobs plus one `db.get` per node, on **every** POV/expand completion.
- `node_to_dict` (`services/serialization.py:310-356`) recurses once per tree level
  (`:328-330`) with no bound.
- `Node.node_type` is `String(16)` (`models/entities.py:55`); `STATISTICAL_POV` is 15
  characters. One character of headroom.
- `Job.required_role` is `String(32)` (`entities.py:146`) and lens labels are sanitised
  to exactly 32 (`dialectical_v2.py:319`) — no margin. The planner prompt says 26
  (`dialectical_v2.py:295-316`); the sanitiser allows 32.

### D12 — Calibration has no ground truth

`calibration_report` (`scoring/calibration.py:110-167`) always returns `brier: None`,
`ece: None`, `resolvedOutcomes: 0`, reason `"no_ground_truth_outcomes"`. Judge weights
are permanently `"cold_start"` 1.0 (`calibration.py:35-48`).

The tree's 0.507 claim *"The Scorer Is Unvalidated"* is literally true in code. This
design does not fully solve it — that needs ground truth — but §5.2 removes the largest
uncontrolled source of judge error.

---

## 3. Architecture

The chosen shape is **contested-frontier search with independent seeding** (option
"A + C hybrid").

```
                    ┌─────────────────────────────────────────┐
   independent      │                                         │
   family seeds ──► decompose ──► generate ──► score ──► prioritize
   (§5.3)           (§5.4)           ▲                        │
                                     │                        │
                                     └──────── expand ◄───────┘
                                              (frontier)
                                                  │
                                     stop? ───────┘
                                       │
                                       ▼
                                  adjudicate (§5.2)
                                       │
                                       ▼
                                  synthesize (§5.6)
```

One mechanism — a priority queue over live nodes — replaces `depth_budget`, `branching`,
the triage depth classifier, the one-shot cross-exam wave, and the dormant
adaptive-expansion flag. **Depth becomes an outcome, not an input.**

### 3.1 Design principles

1. **Reuse before building.** §5.1 activates and re-tunes existing code
   (`expansion_dispatch.py`) rather than writing a new scheduler.
2. **Remove concepts.** Every knob this design retires (`depth_budget`, `branching`,
   the separate cross-exam wave) is a knob nobody has to reason about again.
3. **Prerequisites first.** Deep-tree safety (§5.5) ships before budgets rise (§5.1),
   because the failure mode is a crash at the final step of a multi-hour run.
4. **Honest degradation.** Every new stage must degrade to today's behaviour on
   failure, and must record why. This is already the house style
   (`dialectical_v2.py:3081-3085`, `scoring/service.py:1186-1217`).

---

## 4. Budget envelope

| Parameter | Value | Rationale |
|---|---|---|
| Wall-clock ceiling per debate | **4 hours** | Operator-chosen. Hard stop; synthesis always runs. |
| Expansion waves | up to **12** | `DIALECTICAL_EXPANSION_MAX_ROUNDS`, currently 2 |
| Expansions per node | **3** | currently 2 |
| Expansions per debate | **150** | currently 6 |
| Depth guardrail | **10** | *new*; a safety rail, not a target |
| Token cost | unconstrained | Operator-stated |

Settled branches terminate at depth 2. The contested spine reaches 8–10. Total work is
comparable to a uniform depth-5 expansion but concentrated where it changes the answer.

---

## 5. Components

### 5.1 Contested-frontier loop

**Unit purpose:** decide which nodes get more work, and when to stop.
**Owns:** `coordinator/app/exploration/expansion_dispatch.py`
**Depends on:** persisted `node_scoring` results; `convergence` from `protocol_analysis`.

**Priority function.** For each live argument node:

```
priority = impact × uncertainty × dispersion_factor
```

All three inputs already exist on scored items: `scores.impact`, `scores.uncertainty`,
and the per-field cross-family spread from §5.2 (`dispersion_factor = 1 + max
per-field spread`, so an undisputed node is never penalised below its
`impact × uncertainty` merit).

**Priority floor:** `PRIORITY_FLOOR = 0.15`, configurable via
`DIALECTICAL_EXPANSION_PRIORITY_FLOOR`, clamp `[0.0, 1.0]`. Nodes scoring below it are
not expanded. Against smoke4's distribution (`impact` median ~0.6, `uncertainty` median
~0.35) this admits roughly the top half of nodes in wave 1 and tightens as uncertainty
falls — which is the intended behaviour.

**Frontier width:** each wave expands at most `EXPANSION_WAVE_WIDTH = 12` nodes
(`DIALECTICAL_EXPANSION_WAVE_WIDTH`, clamp `[1, 64]`), subject to the per-node and
per-debate budgets in §4. This is the `top-K` referenced in §6 step 7.

**Action selection.** Take the action the scorer already recommended for that node
(`recommended_investigations[].action`), mapped through the existing
`DECISION_POLARITY` table: `challenge → CON`, `seek_evidence → PRO`/evidence job.
This closes D3 by consuming output the engine already produces.

**Wave structure.** `score → prioritize → expand → score → …`. Scoring must complete
before the next prioritisation; partial scores produce mis-ranked frontiers.

**Stop conditions** (any one):
- no live node clears the priority floor;
- `convergence.maxDelta < epsilon` for **two consecutive** waves (D7 — the test already
  exists and already ran, it was simply not an input to stopping);
- `max_rounds` waves completed;
- `max_per_debate` expansions consumed;
- wall-clock ceiling reached.

The stop reason is recorded and surfaced in the verdict (`stopped_because_of` already
exists, `dialectical_v2.py:2878-2880`).

**Depth guardrail.** Add a depth check to `queue_v2_expand_job`
(`dialectical_v2.py:1854-1955`) refusing children beyond depth 10. This is the first
depth control the v2 pipeline has ever had (D2). Retire `depth_budget` from `triage.py`
and `protocol/state.py` rather than leaving inert config in place.

**Acceptance:** on a re-run, ≥1 branch reaches depth ≥8; ≥1 branch terminates at depth
≤3; the recorded stop reason is `converged` or `priority_floor`, not `budget_exhausted`.

---

### 5.2 Disagreement as a first-class signal

**Unit purpose:** detect real cross-family disagreement, and resolve it.
**Owns:** `coordinator/app/scoring/disagreement.py`, plus a new adjudication path.

**(a) Per-field threshold.** Replace the composite 0.35 gate (`disagreement.py:72`)
with a per-field test. A node is `contested` when **any** pivotal field has a
cross-family spread ≥ **0.25**:

- `critic.logical_validity`
- `steelman.charitable_strength`
- `evidence.evidence_quality`
- `context.impact`

Against smoke4's raw data this fires on **at least 5** nodes for `logical_validity`
alone (5 nodes measured ≥0.30, 11 measured ≥0.20), versus zero today. The exact count at
0.25 must be recomputed on de-biased scores (§5.2b) — de-biasing will remove some
apparent disagreement, which is the point. The composite signal is retained for
uncertainty derivation (`dispersion_uncertainty`, `disagreement.py:118-142`) — only the
*detection* gate changes.

**Threshold calibration is a deliverable, not an assumption.** 0.25 is a starting value
derived from one debate. The replay test in §8 must report the contested-node count at
0.20 / 0.25 / 0.30 so the value is chosen against data rather than defended.

**(b) Judge de-biasing.** Before measuring spread, subtract each judge's mean offset
from the panel mean. **Offsets are computed per field, not globally** — a judge may be
generous on `logical_validity` and strict on `evidence_quality`, and a single scalar
offset would smear the two together. For each pivotal field `f`:

```
offset[j][f] = mean over nodes n of ( score[j][f][n] − mean over judges of score[·][f][n] )
adjusted[j][f][n] = score[j][f][n] − offset[j][f]
```

Only nodes judged by **all** panel members contribute to `offset` (a partial panel
would bias the mean toward whoever happened to be present). `adjusted` values are used
solely for dispersion detection; persisted scores remain the raw blended values.

This removes the constant tier bias in D6 while preserving per-node disagreement. It is
computed per debate, requires no ground truth, and is recorded in `score_provenance` so
the raw values remain auditable.

**Constraint:** de-biasing requires ≥3 judges and ≥5 scored nodes to be stable. Below
either threshold, skip it and record `judge_debias: {applied: false, reason: ...}`.

**(c) Adjudication.** When a node is `contested`, queue one adjudication judgment from a
family **not already on that node**. The adjudicator receives the conflicting
assessments and returns:

```json
{
  "disagreement_kind": "definitional" | "evidential" | "scope" | "value",
  "what_is_disputed": "<one sentence>",
  "better_supported_side": "<judge_role>" | "neither",
  "why": "<one sentence>",
  "resolvable_by": "<the observation or definition that would settle it>"
}
```

`disagreement_kind` is the most presentable artifact this system can produce and does
not exist today. It feeds §5.6 directly.

**Panel provider constraint:** `providers/judge_panel_providers.py:31-34` currently
supports only `claude` and `gemini`. Adjudication from a third family (grok/xai)
requires adding a provider. If unavailable, adjudication falls back to the unused one of
{claude, gemini} and records `adjudicator_family_reused: true`.

**Acceptance:** on a re-run, `disagreement_status: "present"` on ≥3 nodes; every
`present` node carries an adjudication record with a non-null `disagreement_kind`.

---

### 5.3 Independence

**Unit purpose:** stop the tree from inheriting one model's framing, and stop families
from grading themselves.

**(a) Independent seeding.** Before decomposition, every family in the pool drafts its
own answer to the raw question in parallel (5 families → 5 drafts, one wave). The
decomposition planner (§5.4) receives all five. Today a single codex call
(`_planner_registry()`, `dialectical_v2.py:267-277`) frames every lens, so the entire
tree inherits one model's problem framing.

Seeds are persisted as debate-level artifacts, not tree nodes — they are inputs to
decomposition, not claims to be scored.

**(b) Family-disjoint attack edges.** Route **all** CON-polarity generation through
`choose_adversarial_attacker_model` (`dialectical_v2.py:1174-1193`), not just the three
current call sites. Family-disjointness becomes a property of every attack edge.

Where the pool has only one family, the existing honest fallback
(`same_family_fallback_single_family_pool`) is retained and recorded.

**(c) Author-family judge exclusion.** Exclude the author's family from primary-judge
duty on a node. Where the roster makes that impossible, fall back to the existing
calibration discount (`correlated_discount`, `scoring/calibration.py:51-107`) and record
`sole_judge_family_matches_author: true` — which is already computed
(`scoring/service.py:1356-1358`) and currently only reported, never acted on.

**Acceptance:** no single family authors >40% of CON nodes (smoke4: 75%); zero nodes
where the sole full-weight judge shares the author's family.

---

### 5.4 Typed decomposition

**Unit purpose:** split a question into units that each have a defined validation
contract.

The planner (`plan_perspectives_with_llm`, `dialectical_v2.py:280-352`) currently emits
free-form `{label, lens, why}`. Extend it to emit a `kind` per sub-question:

| kind | validation contract | strength basis |
|---|---|---|
| `definition` | resolved by cross-family agreement on terms | argument-only |
| `empirical` | **requires** evidence; verification mandatory | evidence-weighted |
| `causal` | **requires** evidence; verification mandatory | evidence-weighted |
| `normative` | argument-only; evidence optional | argument-only |
| `feasibility` | cost / latency / maintainability estimates | argument-only |

Two of these contracts already exist: `EVIDENCE_ELIGIBLE_CLAIM_TYPES = {empirical,
causal}` (`dialectical_v2.py:878`) and `strength_kind: argument_only` (observed in
smoke4 output). This change makes the *decomposition* choose them explicitly rather than
inferring from a keyword classifier.

Perspective lenses continue to steer viewpoint, layered on top. Two orthogonal axes:
**what kind of thing is this** × **from whose viewpoint**.

**`node_type` mapping (D10).** The positional round-robin
(`_attach_pov_node_types`, `dialectical_v2.py:201-210`) is retained as the QBAF support
container mapping — changing it risks orphaning subtrees
(`qbaf/debate_adapter.py:22-31, 225`). The `kind` is stored in `Node.metadata` instead,
where it is semantically meaningful and cannot break edge construction. A comment at the
round-robin site must state that `node_type` is a container label, not an identity —
consistent with the existing warnings at `dialectical_v2.py:1841-1845`.

**Acceptance:** every POV node carries a `kind` in metadata; every `empirical`/`causal`
node either has ≥1 verified evidence child or an explicit `evidence_unavailable` record.

---

### 5.5 Deep-tree safety (prerequisite)

**This ships before §5.1 budgets rise.** Each item is a crash or a storm at scale.

**(a) Hierarchical synthesis (D8).** Replace the flat "every node with full argument"
payload (`dialectical_v2.py:2853-2874`) with two stages:

1. Per-branch summarisation under a fixed token budget, producing a bounded summary per
   POV branch.
2. Final synthesis over: the branch summaries + the **top 20** load-bearing nodes in
   full (ranked by `impact × strength`; `SYNTHESIS_LOAD_BEARING_K = 20`, configurable
   via `DIALECTICAL_SYNTHESIS_LOAD_BEARING_K`, clamp `[5, 100]`) + all `contested`
   nodes with their adjudications.

   Note this K is independent of §5.1's frontier width — one governs prompt size, the
   other governs expansion fan-out.

Payload size becomes O(branches + K) instead of O(total nodes × argument length).

**(b) `pending_generation_nodes` (D11).** Called on every POV/expand completion, does a
full job scan plus one `db.get` per node (`dialectical_v2.py:2462-2488`). Replace with a
single aggregate query. At 400 nodes and 150 expansions this is otherwise an O(N²)
query storm against a single-writer SQLite.

**(c) `node_to_dict` recursion (D11).** Bound the recursion in
`services/serialization.py:310-356` or convert to iteration.

**(d) Column widths (D11).** Widen `Node.node_type` from `String(16)`
(`models/entities.py:55`). Reconcile the planner prompt's 26-char label limit
(`dialectical_v2.py:295-316`) with the 32-char sanitiser (`dialectical_v2.py:319`) and
`Job.required_role String(32)` (`entities.py:146`).

**(e) SQLite contention.** More depth means more concurrent writers. The F1 fix
(`scoring/service.py:1137-1159`, release the writer across panel CLI calls) and the 30 s
`busy_timeout` are in place; this design adds no new long-held write transactions, and
that constraint must be preserved in every new stage.

**Acceptance:** a synthetic 400-node tree synthesises without truncation error; no
single query exceeds a fixed row budget during a full run.

---

### 5.6 Structured verdict

**Unit purpose:** collapse the tree into something a reader can act on.

Synthesis emits a typed object; prose becomes one field inside it, not the whole thing.

```json
{
  "answer": "<the best-supported position>",
  "confidence": {
    "value": 0.0,
    "drivers": ["<labelled uncertainty drivers>"],
    "limits": "<what the confidence does NOT cover>"
  },
  "load_bearing_claims": [
    {
      "node_id": "...", "claim": "...", "strength": 0.0, "impact": 0.0,
      "judge_vector": {"openai": 0.0, "anthropic": 0.0, "google": 0.0}
    }
  ],
  "open_disputes": [
    {
      "node_id": "...", "what_is_disputed": "...",
      "disagreement_kind": "definitional|evidential|scope|value",
      "positions": [{"family": "...", "position": "...", "strength": 0.0}],
      "resolvable_by": "..."
    }
  ],
  "what_would_change_this": ["<cheapest decisive test>"],
  "coverage": {
    "nodes_total": 0, "nodes_scored": 0,
    "evidence_total": 0, "evidence_verified": 0,
    "max_depth_reached": 0, "stopped_because": "..."
  },
  "narrative": "<the prose verdict, unchanged in spirit>"
}
```

`coverage` is mandatory and must be computed, not narrated. Smoke4's verdict was
admirably honest about its own 27% coverage — but it was honest in prose, which no UI
can act on.

**Synthesis gate (D1).** Replace the fixed 240 s wait
(`synthesis_score_wait_seconds`, `dialectical_v2.py:1204-1208`) with:

- proceed when scoring coverage ≥ **95%** of live argument nodes, **or**
- the debate wall-clock ceiling is reached — in which case `coverage` records the
  shortfall and `stopped_because: "wall_clock"`.

`all_live_argument_nodes_scored` (`dialectical_v2.py:1228-1242`) already computes the
100% case; this relaxes it to a ratio and adds the ceiling.

**Acceptance:** on a re-run, `coverage.nodes_scored / nodes_total ≥ 0.95`; the web UI
renders `open_disputes` without parsing prose.

---

### 5.7 Evidence acquisition repair

**(a) Give the worker search.** Add `--allowedTools WebSearch` for `v2_evidence` jobs in
`worker/app/adapters/claude_cli.py:13-27`, matching
`scripts/subscription_loop.py:541-542`. Today a `v2_evidence` job claimed by a standard
worker has no web access at all and can only fabricate.

**(b) Widen the failover ladder.** `DEFAULT_EVIDENCE_SEARCH_MODELS`
(`dialectical_v2.py:881`) must contain ≥2 search-capable models, or `next_failover_model`
(`orchestrator.py:974-988`) has nothing to fail over to and the first failure is
terminal.

**(c) Clamp rather than reject.** `EVIDENCE_MAX_SOURCES_PER_JOB = 3`
(`dialectical_v2.py:879`) currently fails the whole job when a model returns 4+
(`dialectical_v2.py:1040-1041`). Truncate to the first 3 and record the overflow.

**(d) Port allowlist.** `_ALLOWED_PORTS = {None, 80, 443}` (`evidence/citations.py:48`)
rejects legitimate `https://host:8443/...` sources. Widen to any port under `https`,
keeping every other SSRF guard (scheme allowlist, DNS re-resolution, per-hop redirect
validation, streaming size cap) **unchanged**. This is the only security-relevant change
in this design and must be reviewed as such.

**Acceptance:** ≥80% of `v2_evidence` jobs complete (smoke4: 50%); ≥1 evidence node
reaches verification verdict `supported`.

---

## 6. Data flow

1. **Seed** — N families draft independent answers (§5.3a). Persisted as debate
   artifacts.
2. **Decompose** — planner reads all seeds, emits typed sub-questions with lenses
   (§5.4). Each becomes a POV node at depth 1.
3. **Generate** — POV branches materialise; CON edges are family-disjoint (§5.3b).
4. **Score** — primary judge + panel; per-field dispersion computed on de-biased scores
   (§5.2a/b); author-family excluded from primary judging (§5.3c).
5. **Adjudicate** — `contested` nodes get a third-family adjudication (§5.2c).
6. **Prioritize** — frontier ranked by `impact × uncertainty × dispersion` (§5.1).
7. **Expand** — top-K nodes get their recommended investigation. Return to 4.
8. **Stop** — priority floor, two-wave convergence, budget, or wall clock (§5.1).
9. **Synthesize** — hierarchical (§5.5a), emitting the structured verdict (§5.6).

---

## 7. Error handling

The existing house rule holds: **every new stage degrades to today's behaviour and
records why.**

| Failure | Degradation | Record |
|---|---|---|
| Seed generation fails for a family | Decompose from the seeds that succeeded | `seeds_missing: [families]` |
| Planner returns <2 valid sub-questions | Rule-based perspectives (`dialectical_v2.py:328-329`) | `source: "markers"` |
| Adjudicator family unavailable | Reuse an existing panel family | `adjudicator_family_reused: true` |
| De-biasing preconditions unmet | Raw scores, no offset | `judge_debias.applied: false` |
| Branch summarisation fails | Fall back to truncated raw nodes for that branch | `branch_summary_failed: [ids]` |
| Wall clock reached mid-wave | Stop expanding, score what exists, synthesize | `stopped_because: "wall_clock"` |
| Evidence job fails after failover | Auxiliary failure, debate unaffected (`orchestrator.py:55`) | existing behaviour |

No new stage may hold a SQLite write transaction across a CLI call. This caused a
9-hour production wedge on 2026-07-24 and is documented at `scoring/service.py:1137-1159`.

---

## 8. Testing

**Unit.**
- Priority function: ordering, floor behaviour, ties.
- Per-field disagreement gate: replay smoke4's 78 artifacts, assert ≥3 nodes
  `contested` (today: 0).
- De-biasing: a synthetic judge with a constant +0.2 offset must produce ~0 residual
  dispersion; a genuinely disagreeing judge must not be flattened.
- Stop conditions: each independently, plus two-wave convergence hysteresis.
- Depth guardrail: expansion at depth 10 refused.

**Integration.**
- Wave loop over a fixture tree: assert re-prioritisation between waves, and that
  scoring completes before the next prioritisation.
- Hierarchical synthesis against a synthetic 400-node tree: assert payload stays under
  budget and no node is silently dropped.
- Coverage gate: synthesis blocks under 95%, proceeds at the wall-clock ceiling with an
  accurate `coverage` block.

**Regression.**
- Full existing suite must stay green (baseline: 2421 passed / 4 skipped).
- Every new behaviour is flag-gated and **defaults OFF**; flag-off runs must be
  byte-identical to today. This is the established binding in this codebase
  (`expansion_dispatch.py:79-81`).

**Live.**
- Benchmark harness (P5, `T17`) before and after, on the same question.
- One full smoke on the sharpened question (§9).

---

## 9. Re-run

After §5.5 + §5.1 land, re-run with a question sharpened to force empirical claims.
Smoke4 triaged `verification_required: false` (normative, marker `"should"`), so nothing
was ever verified:

> Design and justify an algorithm for multi-model deliberative investigation: given an
> arbitrary question, how should a system (a) decompose it into individually decidable
> sub-questions, (b) assign which model families argue, attack, and judge each one so
> that agreement is evidence of correctness rather than of shared bias, (c) decide where
> to spend additional depth, and (d) terminate? For each design choice, state the
> measurement that would show it working, and cite published results or experiments that
> support or undermine it.

The final clause is load-bearing: it produces `empirical` sub-questions (§5.4), which
makes evidence acquisition and verification fire.

---

## 10. Phasing

| Phase | Contents | Gate |
|---|---|---|
| **P1** | §5.5 deep-tree safety, §5.1 frontier loop | 400-node synthesis test passes; one branch reaches depth ≥8 |
| **P2** | §5.2 disagreement, §5.3 independence | ≥3 contested nodes with adjudications; CON monoculture <40% |
| **P3** | §5.4 typed decomposition, §5.6 structured verdict | Verdict renders in the web UI without prose parsing |
| **P4** | §5.7 evidence repair | ≥80% evidence job completion; ≥1 `supported` verdict |
| **P5** | Re-run §9, benchmark before/after | — |

P1 is strictly ordered internally: deep-tree safety (§5.5) before budgets rise (§5.1).

**Each phase gets its own implementation plan.** This spec is deliberately wider than
one plan's worth of work — it is the design of record for the whole direction. Planning
proceeds one phase at a time, gated on the previous phase's acceptance criteria, so that
what P2 does can be informed by what P1 measured. Do not attempt to plan P1–P5 as a
single unit.

---

## 11. Out of scope

- **Judge calibration against ground truth** (D12). Requires resolved outcomes the
  system does not have. §5.2b removes the largest uncontrolled error source; genuine
  calibration needs a labelled benchmark and is its own project.
- **Debate-of-debates** (full option C — each family builds an independent tree, then
  families cross-examine each other's trees). §5.3a takes the cheap 80% of the
  independence benefit. Revisit if seeded independence proves insufficient.
- **Retiring the legacy v1 pipeline.** It still owns `max_depth` enforcement
  (`orchestrator.py:502-521`) and is untouched here.
- **New judge panel providers beyond claude/gemini**, except as required by §5.2c.
