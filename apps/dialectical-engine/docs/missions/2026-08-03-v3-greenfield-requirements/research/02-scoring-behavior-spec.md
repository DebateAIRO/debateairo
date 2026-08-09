RESEARCH HANDOFF COMPLETE

# 02 — Scoring-machinery behavioral spec (clean-room extraction from V2)

Ticket: `wayfinder/issues/02-scoring-behavior-extraction.md` · Mission: REQ-V3-GREENFIELD-R1
Seat: Opus research · Date: 2026-08-03 · V2 engine read-only, unmodified.

## How to read this document

This is a **behavioral specification**, not a code description. Everything below is
written so that an engineer with **no access to the V2 source** can reimplement the
kept organs and get byte-comparable numbers. Formulas are given in full; constants are
given as literals; ordering, tie-breaking and failure paths are stated explicitly.

- Paths are repo-relative to `apps/dialectical-engine/`.
- `file:line` citations are evidence for the *claim in the sentence they follow*, not
  an instruction to copy that code. **Nothing here may be copied; this text is the
  carryover.**
- Four semantics are documented **as current behavior** and then marked
  `EXCLUDED-BY-RULING` in the register at the end. V3 must reproduce everything in the
  organ sections **except** what the register forbids.
- Every numeric worked example in this document was recomputed independently from the
  formulas as stated, and cross-checked against V2's own golden tests. Where they
  agree, the number is cited from both.

Terminology used throughout (V2's own vocabulary):

| Term | Meaning |
|---|---|
| **tau** (τ) | a node's *base score* — its standalone strength before any attacker/supporter influence |
| **strength** | a node's *final* strength after DF-QuAD propagation |
| **judge strength** | the `scores.strength` a per-node judge assessment reduced to; the normal source of tau |
| **tau source** | provenance label for where a node's tau came from (`judge_strength`, `default`, `verifier_evidence`) |
| **tau coverage** | fraction of argument nodes whose tau came from a real judge strength |
| **semantics version** | which aggregation variant produced a strength set |

---

## Organ 1 — QBAF / DF-QuAD aggregation semantics

### 1.1 Purpose

Turn a debate's node tree plus its per-node judge scores into one number per node —
the *dialectical strength* — by propagating attacker and supporter influence up an
acyclic bipolar argument graph. This number is the sole quantitative basis of the
served verdict and the "Leans" meter.

### 1.2 The pure core: DF-QuAD

The math is Discontinuity-Free QuAD (Rago, Toni, Aurisicchio, Baroni, KR 2016), cited
in-repo at `coordinator/app/qbaf/dfquad.py:1-28`.

**Aggregation function (α), "probabilistic sum"** — `dfquad.py:47-59`:

```
agg([])            = 0
agg(v1 … vn)       = 1 − Π(1 − vi)
```

Implemented as a left fold `a ← 1 − (1−a)(1−v)` starting from `a = 0.0`. Floating
point, IEEE double. Order of the fold is the order of the incoming-edge list; the
fold is mathematically commutative but **not** bit-identical under reordering, so
edge ordering must be pinned for byte-comparable reproduction (see §1.5).

**Mediating function (σ)** — `dfquad.py:62-66`, given a node's tau, aggregated
attacker strength `va` and aggregated supporter strength `vs`:

```
σ(τ, va, vs) = τ − τ·(va − vs)          if va ≥ vs
σ(τ, va, vs) = τ + (1 − τ)·(vs − va)    otherwise
```

Note the tie case `va == vs` takes the first branch and yields exactly `τ`.

**Graph object** — `dfquad.py:73-98`. A frozen `ArgumentGraph` of:

- `base_scores`: `node_id → τ`, each required to be in `[0, 1]`
- `attacks`: sequence of `(attacker_id, target_id)`
- `supports`: sequence of `(supporter_id, target_id)`

Edges are **unweighted** in this implementation. On construction the graph takes
independent frozen copies of all three collections, so later mutation of the caller's
containers cannot affect it (`dfquad.py:92-98`; pinned by
`coordinator/tests/test_dfquad.py:246-270`). Duplicate edges are collapsed at
construction — see §1.6 and the register entry (c).

**Evaluation order** — `dfquad.py:113-140`. Kahn's algorithm over the *union* of
attack and support edges, iterative (never recursive). In-degree is counted over that
union; the seed queue is every zero-in-degree node **in `base_scores` insertion
order**; the queue is FIFO. If the emitted order is shorter than the node set, the
graph has a cycle → `CyclicGraphError` (a `ValueError` subclass), never a partial or
fixed-point result.

**Strength computation** — `dfquad.py:142-165`:

1. Validate every tau is in `[0,1]`; validate every edge endpoint exists in
   `base_scores`. Either failure → `ValueError` (`dfquad.py:100-111`).
2. Topologically sort. Cycle → `CyclicGraphError`.
3. For each node in that order:
   `va = agg([strength(a) for a in incoming attackers])`,
   `vs = agg([strength(s) for s in incoming supporters])`,
   `strength(node) = σ(τ(node), va, vs)`.
4. Return the full `node_id → strength` map.

Because the order is topological, every predecessor's strength is final before it is
read. A node with no incoming edges gets `σ(τ, 0, 0) = τ` — its base score unchanged.

**Golden vectors (literature ground truth, reproduced in-repo at
`coordinator/tests/test_dfquad.py:95-138`)** — V3 must match these exactly:

*Golden 1* (arXiv:2307.13582 Fig. 3). All τ = 0.5, nodes A–H;
supports `B→A, C→A`; attacks `D→A, E→B, F→D, G→F, H→F`.
Expected: `F = 0.125`, `B = 0.25`, `D = 0.4375`, `A = 0.59375`; leaves `C, E, G, H = 0.5`.

*Golden 2* (arXiv:2407.08497 Fig. 1). τ: `alpha 0.5, beta 0.3, gamma 0.6, rho 0.7,
zeta 0.4`; supports `beta→alpha, zeta→gamma`; attacks `gamma→alpha, rho→beta`.
Expected: `zeta = 0.4`, `rho = 0.7`, `gamma = 0.76`, `beta = 0.09`, `alpha = 0.165`.

Structural properties the implementation must preserve (`test_dfquad.py:146-231`):
determinism across repeated calls; adding an attacker strictly lowers the target;
adding a supporter strictly raises it; empty graph → empty result; isolated node →
its own tau.

### 1.3 The debate adapter: tree → argument graph

`coordinator/app/qbaf/debate_adapter.py`. Pure (no ORM/network/clock/filesystem —
enforced by `coordinator/tests/test_debate_graph_adapter.py:31-56`).

**Inputs** (`debate_adapter.py:242-264`):

- `nodes`: ordered sequence of plain `{"id", "parent_id", "node_type"}` dicts.
- `scores`: `node_id → scoring item dict` (the public per-node scoring payload), or `{}`.
- `semantics`: an identifier string; default `"df-quad-v1"`.
- `container_types`: optional override of the lens-container set (v2 semantics only).
- `evidence_verifications`: optional `evidence_node_id → {"status", "base_score"}`.

**Node-type vocabulary and edge mapping (v1, the production variant)** —
`debate_adapter.py:42-47, 131-150`. Edges point **child → parent**:

| `node_type` | v1 edge into `parent_id` | Notes |
|---|---|---|
| `PRO` | **support** | |
| `SCIENTIFIC_POV`, `STATISTICAL_POV`, `ETHICAL_POV`, `PRACTICAL_POV` | **support** | POV "lens" containers, treated as supporters of the root |
| `CON` | **attack** | |
| `ROOT_CLAIM` | none | |
| `EVIDENCE` | none, unless a verifier verdict says otherwise (§1.4) | |
| anything else | none, and the marker `"<node_id>__edge" → "unmapped_edge"` is recorded | |
| any node with `parent_id is None` | none | |

**Tau derivation** — `debate_adapter.py:84-92`:

- If `scores[node_id]["scores"]["strength"]` exists and is a real `int`/`float`
  (explicitly **not** `bool`) → `(float(strength), "judge_strength")`.
- Otherwise → `(0.5, "default")`. **`DEFAULT_TAU = 0.5`** at `debate_adapter.py:20`.
  *(This fallback is indicted — register entry (a).)*

Verified-evidence tau overrides this and is only ever consulted for nodes whose
`node_type == "EVIDENCE"` (`debate_adapter.py:293-306`), so a malformed
`evidence_verifications` map keyed by a non-evidence node id can never move that
node's tau.

**Outputs** — `AdaptedDebateGraph` (`debate_adapter.py:76-81`):

- `graph`: the `ArgumentGraph`
- `tau_sources`: `node_id → "judge_strength" | "default" | "verifier_evidence"`, plus
  per-node **edge markers** under the synthetic key `"<node_id>__edge"` with value
  `"unmapped_edge" | "lens_no_edge" | "orphaned_parent"` (`debate_adapter.py:322-323`)
- `fingerprint`: hex SHA-256 (see below)
- `semantics`: the resolved identifier

**Fingerprint** — `debate_adapter.py:329-338`. One row per node:
`(node_id, str(parent_id or ""), node_type, format(tau, ".6f"))`. Rows are sorted
lexicographically as 4-tuples, each joined with `"|"`, each followed by `"\n"`, and
fed to SHA-256. **If and only if** the resolved semantics is not the default, the
digest is pre-seeded with `"semantics|<identifier>\n"` first. Consequences that must
be preserved: the fingerprint is input-order-independent
(`test_debate_graph_adapter.py:317-327`), changes when any tau changes
(`:330-334`), and differs between v1 and v2 for the same tree (`:430-436`). The
default-semantics fingerprint for the canonical 4-POV tree is
`736a718fd8cbecc13fb91963d3fdf8971324b7443c21ef79c0588c1c0bf3c480`
(`test_debate_graph_adapter.py:416`) — a usable golden vector.

**Edge list ordering**: `attacks` and `supports` preserve the input node iteration
order (`debate_adapter.py:288-328`), *then* are deduplicated order-preservingly by the
graph constructor. This is the ordering that pins the probabilistic-sum fold.

### 1.4 Verified-evidence edges

`debate_adapter.py:95-128`, with the polarity table at `:73` and the constants at
`:60, :67`.

Given `evidence_verifications[node_id] = {"status", "base_score"}` for an
`EVIDENCE`-typed node:

- `status == "supported"` → **support** edge; tau = `base_score`, but **only** if
  `base_score` is a real numeric (not `bool`) in `[0,1]`. Otherwise the whole thing
  fails closed to "no edge, default tau" — a corrupted upstream row must never
  fabricate a tau. (`test_debate_graph_adapter.py:177-193` pins the rejected values:
  `None`, `"0.8"`, `True`, `-0.01`, `1.01`, `NaN`.)
- `status == "contradicted"` → **attack** edge; tau = the documented constant
  **`CONTRADICTED_EVIDENCE_TAU = 0.7`**. Rationale recorded in-repo: the verifier's
  output schema only ever carries a numeric score on the *supported* branch, so a
  contradiction has no magnitude the verifier vouches for; 0.7 is "strong enough to
  register, deliberately below 1.0".
- any other status (`"unverifiable"`, `"pending"`, unknown), node id absent from the
  map, or the map being `None`/`{}` → **no edge, tau = 0.5, tau source `"default"`**.
  `None`, `{}` and the argument being omitted entirely are required to be
  indistinguishable, fingerprint included (`test_debate_graph_adapter.py:196-202`).
- Tau source for a real verdict is the literal `"verifier_evidence"`.

### 1.5 The v2 "lens-lift" variant (registered, reachable only in debug)

`debate_adapter.py:153-239`, selected by `semantics == "df-quad-v2-lens-lift"`.

- Node classes (`:153-164`): container (any type in the container set — default the
  four POV types), `no_edge` (EVIDENCE without a verdict), `root` (ROOT_CLAIM),
  `support` (PRO), `attack` (CON), `unmapped` (anything else).
- A container emits **no edge** and records marker `"lens_no_edge"`.
- A PRO/CON/verified-EVIDENCE node's edge target is not its literal parent but its
  **nearest non-container ancestor** (`_v2_effective_parent`, `:167-199`): walk up
  `parent_id` while the current parent is a container. The walk carries a `visited`
  set seeded with the *source* node itself, so a malformed container cycle can never
  manufacture a self-edge. If the walk hits a missing parent, a `None` parent, or a
  cycle, it fails closed: **no edge**, marker `"orphaned_parent"` — and, importantly,
  the node's **tau override still applies**; only the edge is dropped
  (`test_debate_graph_adapter.py:276-291`).
- Multi-level container chains lift through all of them
  (`test_debate_graph_adapter.py:439-458`).

**Behavioural difference, measured in-repo.** Same tree — root plus four unjudged POV
lens children, all tau 0.5:

| Semantics | Edges | Root strength |
|---|---|---|
| `df-quad-v1` (production) | four supports into root | **0.96875** (`test_debate_graph_adapter.py:409-415`) |
| `df-quad-v2-lens-lift` | none | **0.5** (`test_debate_graph_adapter.py:419-427`) |

This is the "hidden switch" — register entry (b).

### 1.6 The second, divergent DF-QuAD implementation (weighted)

`coordinator/app/qbaf/semantics.py` is a **separate** implementation of the same math
with different properties. V3 must decide deliberately whether to keep one or both.

- Operates on `QBAFGraph` (`coordinator/app/qbaf/model.py:113-155`) whose `Edge`
  carries a **weight** in `[0,1]`, default `1.0` (`model.py:81-110`).
- `DFQuADSemantics.propagate` (`semantics.py:33-79`) is **recursive with memoisation**
  and a `visiting` set; a cycle raises a plain `ValueError` with a different message
  than `CyclicGraphError`.
- Each incoming edge contributes `edge.weight × strength(source)` before aggregation
  (`semantics.py:53`), then the same α and σ are applied via validated wrappers
  (`semantics.py:19-30`) that additionally reject out-of-range inputs.
- Duplicate handling differs: identity is `(source_id, target_id, polarity)`; exact
  duplicates collapse, but the **same identity with conflicting weights raises
  `ValueError`** (`semantics.py:81-103`).
- `ClaimNode` defaults: `base_score = 0.5`, `final_strength = 0.5`, `uncertainty = 0.0`,
  `status = "open"` (`model.py:25-51`) — a second, independent "0.5 from nothing" default.

This path is reached only from `POST /api/qbaf/runs`
(`coordinator/app/api/qbaf.py:58-86`), stamps semantics `"df-quad-weighted-v1"`, and
persists into an **in-memory** repository (`app/api/qbaf.py:20`) — runs do not survive
a process restart. It never touches the debate/verdict path.

### 1.7 Production driver: protocol analysis

`coordinator/app/protocol/runner.py`, function `_run_protocol_analysis` (`:63-397`).
This is the only production caller that produces served strengths.

**Inputs.** All `Node` rows of the debate with `status != "stale"` — note **failed
nodes are included in the graph** (`runner.py:64-70`) — projected to
`{"id", "parent_id", "node_type"}`; plus the latest public scoring payload's `items`
keyed by `node_id` (`runner.py:72-73, 185-187`); plus the latest per-evidence-node
verifier verdicts (`runner.py:152-160`, via
`app/evidence/verification_evaluator.py:181+`, which returns only verdicts whose
evidence node is *currently* eligible).

**Behavior.**

1. `semantics_version = DEFAULT_SEMANTICS` — a hardcoded literal (`runner.py:188`).
2. Build the graph and compute strengths (`runner.py:191-194`). The `semantics=`
   argument is **not passed**, so v1 is always used.
3. **tau coverage** (`runner.py:237-248`):
   - `dead_node_ids` = ids of nodes with `status == "failed"` (excluded from the
     coverage *denominator* but **not** from the graph).
   - `argument_node_ids` = every node whose `node_type != "EVIDENCE"` and which is not
     a dead node. This deliberately includes ROOT_CLAIM, PRO, CON **and POV containers**.
   - `judged_count` = how many of those have `tau_sources[id] == "judge_strength"`.
   - `tau_coverage = judged_count / len(argument_node_ids)`, or `0.0` if that list is empty.
4. Emit the QBAF block: `dialecticalStrengths` (flat `node_id → float`),
   `graphFingerprint`, `tauSources` (the full map incl. `__edge` markers),
   `tauCoverage`, `qbafSemantics`, and a literal `compositionNote` string
   `"v1: tau=judgeStrength|default; verificationModifier=none(P7); modelWeight=constant-1.0(P8)"`
   (`runner.py:249-259`).
5. **Convergence** against the previous `protocol_analysis` run (`runner.py:276-361`).
   Epsilon = `debate.config["protocol"]["convergence_epsilon"]` when it is numeric,
   non-bool and strictly in `(0,1)`, else `0.05` (`runner.py:36, 276-280`). Outcomes,
   in evaluation order:
   - no strengths this run → `{converged: None, reason: "strengths_unavailable"}`
   - no previous run, or previous run had no strengths → `reason: "first_evaluation"`
   - previous run's `semanticsVersion` differs from this run's (unknown values are
     honestly different, never coerced) → `reason: "semantics_changed"`
   - no overlapping node ids, **or** the set of nodes carrying tau source
     `"verifier_evidence"` changed between runs → `reason: "topology_changed"` with
     `nodesCompared: 0`, `nodesAdded`, `nodesRemoved`
   - otherwise `maxDelta = max |curr[k] − prev[k]|` over the intersection;
     `converged = maxDelta <= epsilon`; also emits `nodesCompared`, `nodesAdded`,
     `nodesRemoved`, `epsilon`, `comparedAnalyzerRunId`.
   - `convergenceVersion = "epsilon-stability-v1"`.
6. Persist exactly one `AnalyzerRun` of type `protocol_analysis`
   (`runner.py:364-383`) whose `output` carries the cross-exam report, verification
   statuses and their per-node source, claim types and their source, version stamps
   (`crossExamVersion`, `verificationVersion`, `semanticsVersion`), the QBAF block
   spread inline, and the convergence block. Provenance is
   `{"scoring_source": "protocol_analysis", "debate_id": …}`. Stored runs are
   append-only; nothing is ever rewritten.

**Failure paths.** Any `CyclicGraphError` or `ValueError` out of the graph build or
strength computation is caught and replaced by `{"qbafUnavailableReason": str(exc)}` —
the run still persists, but with **no** `dialecticalStrengths` and **no** `tauCoverage`
(`runner.py:260-261`). The evidence-verification overlay has its own inner
try/except that resets verification statuses to the kind-classifier fallback and
evidence verdicts to `{}` (`runner.py:173-183`). The whole function is wrapped in a
best-effort guard that prints and swallows any exception (`runner.py:52-60`): protocol
analysis must never fail debate creation, job completion, or synthesis.

### 1.8 Consumers of the strengths

**Verdict** — `coordinator/app/scoring/verdict.py`, pure, never raises
(`verdict.py:169-303`). Inputs: the persisted `protocol_analysis` output, the root
node id, an `evidence_presence` string, and a `gate_enabled` flag.

Declared (not learned) constants — `verdict.py:33-44`:
`VERDICT_THRESHOLDS_VERSION = "verdict-v2"`, supported ≥ `0.65`, unsupported ≤ `0.35`,
minimum tau coverage `0.50`, gate-eligible claim types = `{"empirical"}`.

Band selection, in order (`verdict.py:244-273`):

1. Read `tauCoverage`; accept only a non-bool numeric in `[0,1]`, else **0.0**
   ("a malformed value proves nothing").
   `tauSourceMajority = "judge_strength" if coverage >= 0.5 else "default"`.
2. `coverage < 0.50` → band **`insufficient_scoring`**, with claim language that
   still prints the raw strength as a "structural reading for transparency".
3. `strength >= 0.65` → **`supported`**; `strength <= 0.35` → **`unsupported`**;
   else **`contested`**.
4. Suffix `" Verification is still pending."` when the root's verification status is
   `"pending"` or `"pending_verification"` (these two are never conflated in `basis`).
5. Suffix `" Not yet converged."` when `convergence.converged is False`.

Degradation to band `unavailable` (`verdict.py:191-233`): missing/non-dict protocol
output, missing root id, missing `dialecticalStrengths`, root absent from it, or a
non-numeric/bool root strength.

Evidence gate (`verdict.py:98-166`), applied to every result including `unavailable`:
records `preGateVerdictBand`; computes `gate_eligible = claim_type in {"empirical"}`
and `would_suppress = gate_eligible and evidence_presence == "none"`; sets
`verdictState` to `endorsed` / `endorsed_with_caveat` / (gate on and would-suppress)
`suppressed_no_evidence` with band `suppressed`. Caveat codes: `evidence_unverified`
(eligible claim with `extracted_unresolved` evidence) and `claim_type_unknown`
(unknown/absent claim type with no evidence). When the gate is **off**, a shadow block
`evidenceGateShadow = {wouldSuppress, reason, claimType, claimTypeSource}` is emitted
instead of suppressing.

**Lean meter** — `coordinator/app/scoring/lean.py:93-148`, pure. Prefers
`source: "dialectical"` when `tauCoverage > 0` and the strength map is usable:
`pro_mass = Σ strength(n) for live PRO`, likewise CON, `pct = round(100·pro/(pro+con))`;
labels Pro ≥ 55, Con ≤ 45, else Even. Falls back to `source: "structural"` on live
PRO/CON **counts**, where an exactly-symmetric split is labelled `"Even (structural)"`
so a guaranteed topology artifact is never sold as a 50/50 reading. Live = status not
in `{failed, stale}`; `path_status == "abandoned"` deliberately still counts as live.
Returns `None` — never a fabricated 50/50 — when there is no live PRO/CON node at all.

### 1.9 Edge cases and failure paths (Organ 1, consolidated)

| Situation | Behavior |
|---|---|
| Empty node set | empty strength map; `tauCoverage = 0.0` |
| Node with no incoming edges | `strength = τ` |
| `va == vs` exactly | `strength = τ` (first σ branch) |
| Tau outside `[0,1]` | `ValueError` at compute time |
| Edge endpoint not in `base_scores` | `ValueError` at compute time |
| Cycle in attack ∪ support | `CyclicGraphError`; the adapter never validates acyclicity itself, so it surfaces from `compute_strengths` (`test_debate_graph_adapter.py:337-347`) |
| Duplicate identical edge | collapsed once (see register (c)) |
| Unknown `node_type` | no edge, marker `unmapped_edge`, tau still assigned |
| Missing/malformed judge score | tau 0.5, source `default` (register (a)) |
| Any of the above in production | caught → `qbafUnavailableReason`, run still persists |

---

## Organ 2 — The per-node judge scoring contract

### 2.1 Purpose

For one debate node, obtain a structured assessment from an LLM judge, reduce it
deterministically to a small numeric score vector plus human-legible explanation, and
persist both the raw judge output and the reduced result under a hash that pins every
semantic input.

### 2.2 Inputs

**Claim normalisation** — `coordinator/app/scoring/normalizer.py`, deterministic,
regex-only, no LLM, no network. `normalize_claim(node_id, raw_text)` (`:280-293`)
produces a `NormalizedClaim`:

- `core_claim` = `raw_text.strip()`
- `claim_type` ∈ `{empirical, causal, normative, definitional, prediction,
  comparative, mixed, unknown}` via `classify_claim_type` (`:139-162`): six independent
  regex families are all tested; **exactly one match → that type; two or more →
  `"mixed"` with the union of markers; none → `"unknown"` with an empty marker list**.
  Documented precedence (comparative > prediction > causal > normative > definitional
  > empirical) governs the order families are *checked and reported*, not the
  multi-match outcome. Family patterns are literal and enumerable
  (`normalizer.py:68-136`).
- `ambiguity_flags` = hedge markers found, from the fixed list
  `{might, may, could, some say, arguably, probably}` (`:49-56`). Hedges **never**
  influence `claim_type`.
- `implied_assumptions`: mechanical, keyed off type only (`:170-177`) — causal →
  `["correlation supports causation here", "no major confounder dominates"]`,
  prediction → `["current trend continues"]`, comparative →
  `["comparison baseline is well-defined"]`, else `[]`.
- `scope`: conservative extraction (`:233-261`). Timeframe by `since <year>` >
  `over the last N years` > any bare 4-digit 19xx/20xx. Geography only from a **fixed
  15-entry vocabulary** (`:190-206`). Population only from an `among <1-4 lowercase
  words>` pattern with prepositional boundary stops. Anything unmatched stays `None` —
  never guessed. `domain` is always `None`.
- `evidence_refs`: URLs only, `https?://[^\s\)\],]+` (`:268-272`).
- `key_terms`: always `[]`.

**Child context** — `coordinator/app/scoring/service.py:460-497`. The node's direct
children whose `node_type` is `PRO` or `CON` **only** (EVIDENCE and lens nodes are
deliberately excluded — `service.py:87-95`), ordered `position asc, created_at asc,
id asc`, each carrying `{node_id, stance ("support"|"attack"), claim,
argument_excerpt, truncated}`. The excerpt is the child's active generation argument
bounded to **700 characters** (`service.py:86, 442-457`): if longer, cut at the last
space inside the window (or hard-cut when there is none) and append `"…"`, and set
`truncated = True`. Non-truncated excerpts are byte-identical to the source. Exactly
two DB queries regardless of child count.

**Request** — `ScoringProviderRequest` (`coordinator/app/scoring/judges.py:34-49`):
`claim`, `argument_text`, `judge_role`, `prompt_version` (default
`"scoring-provider-v2"`), `timeout_seconds` (default 30), `metadata`,
`debate_question`, `children`.

**Prompt** — `coordinator/app/scoring/prompts.py:47-116`. Two messages. The user
message is `json.dumps(payload, sort_keys=True)` of
`{judge_role, prompt_version, debate_question, claim, argument_text, children,
attacks_provided, instructions{output, include, schema}}`, where `attacks_provided` is
`any(child.stance == "attack")` and `schema` is the JSON Schema of `ClaimAssessment`.
The system message instructs: JSON only; never invent evidence/citations/sources;
score `context.relevance` **relative to `debate_question`**; score
`critic.counterargument_strength` against the strongest real attack when
`attacks_provided`, otherwise against plausible counters *and say so in the findings*.
A separate `"verifier"` role branch renders an evidence-verification prompt with its
own schema (`prompts.py:9-71`) whose `allOf` clause **requires the `evidence` object
to be absent unless `verdict == "supported"`** — this is why contradicted evidence has
no verifier-supplied magnitude (§1.4).

### 2.3 The judge output schema

`ClaimAssessment` (`coordinator/app/scoring/models.py:234-239`) — five required
sub-objects, every listed float validated to `[0,1]`:

| Section | Required fields | Optional |
|---|---|---|
| `steelman` | `charitable_strength`, `confidence` | `improved_claim`, `strongest_points[]`, `required_assumptions[]`, `recommended_investigations[]` |
| `critic` | `logical_validity`, `assumption_risk`, `counterargument_strength` | `findings[]`, `fatal_flags[]`, `recommended_investigations[]` |
| `evidence` | `evidence_quality`, `evidence_relevance`, `evidence_sufficiency`, `source_reliability`, `freshness` | `support_status` (default `"missing"`, from a closed 7-value set), `missing_evidence[]`, `fatal_flags[]`, `recommended_investigations[]` |
| `context` | `relevance`, `impact`, `dependency_weight` | `relation_to_root` (default `"clarifies"`, one of supports/attacks/clarifies/side_issue), `why_it_matters` |
| `fallacy` | `logical_consistency` | `detected_fallacies[]`, `contradiction_flags[]`, `fatal_flags[]` |

A `FatalFlag` is `{type, severity ∈ {low,medium,high}, description}` (`models.py:277-281`).

**Parsing** — `coordinator/app/scoring/parser.py:28-101`. Three strategies, each tried
only after the previous fails, so clean bare JSON is never altered:

1. `json.loads` on the raw payload.
2. Strip a markdown fence matching `` ```[^\n`]*\r?\n(.*?)``` `` (DOTALL, non-greedy,
   `search` not `match`) and retry.
3. Extract the first **brace-balanced** `{…}` substring, respecting string literals and
   backslash escapes, and retry.

Outcomes: JSON that never parses → `{status: "unavailable", reason: "Judge output was
not valid JSON."}`. JSON that parses but fails schema validation → `{status:
"unavailable", reason: "Judge output did not match the scoring schema."}` — fence
tolerance must never mask a schema failure as a parse failure. Success →
`{status: "available", assessment}`.

### 2.4 The deterministic reducer

`coordinator/app/scoring/reducer.py`, function `reduce_assessments(claim, assessment)`
(`:113-204`). Pure. Versions: `REDUCER_VERSION = "node-scoring-reducer-v3"`,
`RUBRIC_VERSION = "debateai-rubric-v1"` (`:44-45`).

**Derived intermediates:**

```
counter_resilience = 1.0 − critic.counterargument_strength
clarity            = max(0.0, 1.0 − 0.15 × len(claim.ambiguity_flags))
```

**Base strength — two compositions, branching on claim type** (`:47-54, 116-134`).
`_ARGUMENT_ONLY_CLAIM_TYPES = {"normative", "definitional"}`:

*argument_only* (normative/definitional — types that can never carry external evidence):

```
base = (1/3)·critic.logical_validity
     + (4/15)·counter_resilience
     + 0.20·clarity
     + 0.20·context.relevance
     − 0.20·critic.assumption_risk
```

(the four positive weights are the evidence-weighted ones renormalised over 0.75:
0.25/0.75, 0.20/0.75, 0.15/0.75, 0.15/0.75; the assumption-risk penalty is unchanged)

*evidence_weighted* (every other type — the default):

```
base = 0.25·critic.logical_validity
     + 0.25·evidence.evidence_quality
     + 0.20·counter_resilience
     + 0.15·clarity
     + 0.15·context.relevance
     − 0.20·critic.assumption_risk
```

`strength = clamp(base, 0, 1)`. `impact = context.impact`. The chosen branch is
emitted as `strength_kind ∈ {argument_only, evidence_weighted}`.

**Score caps** — `coordinator/app/scoring/caps.py:6-50`, applied in this order, each
recording a `ScoreCap{score, cap_value, reason, triggered_by}`:

1. `claim_type ∈ {empirical, causal}` **and** `evidence.evidence_quality < 0.30`
   → `strength = min(strength, 0.45)`, `triggered_by = "weak_evidence"`.
2. `fallacy.contradiction_flags` non-empty **or** any fatal flag of type
   `"contradiction"` across critic/evidence/fallacy
   → `strength = min(strength, 0.25)`, `triggered_by = "fatal_contradiction"`.
3. `context.relevance < 0.25` → `impact = min(impact, 0.25)`,
   `triggered_by = "low_relevance"`.

**Heuristic uncertainty** — `reducer.py:357-369`:

```
u = 0.20
  + 0.08 × len(claim.ambiguity_flags)
  + 0.10 if claim.evidence_refs is empty else 0
  + 0.10 if evidence.evidence_quality < 0.30 else 0
  + 0.08 × disagreement_count
  + 0.04 × cap_count
uncertainty = clamp(u, 0, 1)
```

`uncertainty_source` is stamped `"heuristic"` here (`reducer.py:202`); the service layer
may override it (§2.6).

**Uncertainty drivers** — `reducer.py:372-415`. Emitted in a **fixed, never-reordered**
order so callers can rely on "first = primary": `no_evidence_refs` (no
`evidence_refs`), `low_evidence_quality` (`< 0.30`), `ambiguity` (with the flag count),
one `judge_disagreement` per detected disagreement, one `score_caps` per cap (labelled
by `cap.triggered_by`, not by the capped field name), `strong_counter`
(`counterargument_strength > 0.6`).

**Rounding.** Every emitted numeric score is `round(value, 4)` (`reducer.py:450-451`).

**Holes** — `reducer.py:207-245`, appended in this order: one `missing_evidence`
(severity high) per `evidence.missing_evidence` entry; one `ambiguity` (medium) per
ambiguity flag; one `assumption_risk` (high) if `critic.assumption_risk >= 0.65`; one
`fallacy` (high) per detected fallacy. Each carries a `source` string identifying the
producing sub-judge.

**Single-assessment disagreements** — `coordinator/app/scoring/disagreement.py:32-61`,
three fixed tension rules: steelman ≥ 0.75 with evidence quality < 0.35 (high);
impact ≥ 0.75 with assumption risk ≥ 0.70 (high); evidence quality ≥ 0.70 with
relevance < 0.35 (medium).

**Recommended investigations** — `reducer.py:248-334`. Generated when: any
`contradiction` fatal flag (→ `challenge`, priority **fixed at 1**); any
`missing_evidence` hole (→ `find_evidence`); any disagreement (→ `challenge`); any
`ambiguity` hole (→ `ask_user`). Priority for the last three starts at 5 and is
reduced by: severity (`low 0`, `medium 1`, `high 2`), −1 if `impact >= 0.75`, −1 if
`uncertainty >= 0.50`, −1 if the action is `challenge` **and**
`context.relation_to_root == "attacks"` **and** `counterargument_strength >= 0.65`;
then clamped to `[1,5]`. The list is sorted by `(priority, action, reason)`.

**Labels** — `reducer.py:418-423`: `< 0.34 → low`, `< 0.67 → mid`, else `high`
(named per field: weak/mixed/strong for strength; low/medium/high otherwise).

**Rationale** — `reducer.py:341-354`: `short` reads
`"{Claim|<Type> claim} scored {strength:.2f} with {uncertainty:.2f} uncertainty."`
where `claim_type == "unknown"` renders the bare word `"Claim"` rather than
`"Unknown claim"`. `why_not_higher` and `weakest_link` are the first hole's
description, or `"No dominant weakness was detected by the scoring reducer."`.
`why_not_lower` is a fixed sentence.

**Depth pressure** (`reducer.py:57-110`), used by the adaptive-depth dry run: score
starts at 0 and gains 0.25 for each of — any high-severity hole, `impact >= 0.75`,
`uncertainty >= 0.50`, any priority-1 `challenge` investigation; clamped, rounded to 4;
labelled by the same low/mid/high thresholds. Dry-run items drop `low` pressure and
sort by `(-score, node_id)`; `expansion_hint` is `"expand"` for high pressure else
`"review_for_expansion"`.

### 2.5 Output shape

`NodeScoringPayload` (`coordinator/app/scoring/models.py:392-414`): `node_id`, `claim`,
`scores` (the eight-field `NodeScores`: strength, uncertainty, impact,
evidence_quality, relevance, logical_validity, assumption_risk, counter_resilience —
all `[0,1]`), `labels`, `holes[]`, `fatal_flags[]` (critic then evidence then fallacy,
in that order — `reducer.py:145-149`), `score_caps[]`, `judge_disagreements[]`,
`recommended_investigations[]`, `rationale`, `score_provenance`, `debug`,
`uncertainty_drivers[]`, `uncertainty_source`, `strength_kind`.

`ScoreProvenance` (`models.py:346-353`, extra keys allowed) always carries
`raw_judge_output_kind = "claim_assessment"`, `raw_judge_output_included = False`
(literal, cannot be `True`), `final_score_source = "deterministic_reducer"`, plus the
live reducer/rubric versions. **Raw judge text is never included in a served item.**

The debate-level envelope is `DebateScoringResponse` (`models.py:429-447`) with
`status ∈ {available, partial, unavailable}` and optional `errors[]`, `pending[]`,
`max_nodes`, `scored_node_count`, `skipped_node_count`, `truncated`, `generated_at`,
`reason`, `producer`, `model_metadata`, `cache`, `active_scoring_job_id`,
`active_scoring_job_status`. Status is derived, not asserted
(`service.py:1990-2004`): items **and** (errors or pending) → `partial`; items only →
`available`; no items → `unavailable` with a reason chosen by
`_unavailable_result_reason` (`service.py:2171-2180`), which prefers the first error
that is *not* `"Scoring node limit reached."`, then the first error, then the first
pending reason, then a default sentence.

### 2.6 The per-node scoring call, end to end

`score_node_with_provider` (`coordinator/app/scoring/service.py:527-832`). Ordered
behavior:

1. **Currency check.** Node must be in the current node set (§2.7). Not current →
   `unavailable`, reason `"Requested scoring node is not current in this debate."`
   Node row missing → `"Current debate node could not be loaded for scoring."`
2. Load the active generation, normalise the claim, fetch children, compute the
   **input hash** (§3.3). Children are fetched *before* the cache lookup because they
   are part of the key, and reused for the request — exactly one fetch per call.
3. **Cache lookup** (skipped when `force_refresh` or provider/model unknown). On a hit
   the cached payload is returned with `cache = {"hit": true}` after re-attributing
   the node's judge artifacts to the current job (§3.4). On a miss, a *stale* probe
   records why: `"scoring_contract_changed"` if a row exists under a different or NULL
   contract hash, else `"input_hash_mismatch"` if a row exists under a different input
   hash (`coordinator/app/scoring/cache.py:145-185`).
4. **Lineage-independence guard**, flag `DIALECTICAL_LINEAGE_INDEPENDENCE`, default
   **off** (`service.py:620-635`). When on and both families are known and equal →
   return a payload with a single error `{status: "no_independent_judge", reason:
   "no_independent_judge: judge lineage matches arguer lineage"}`. Binary block/proceed
   — there is no judge rotation. Unknown lineage on either side never blocks.
5. **Commit before the call.** The write transaction is released before the judge
   subprocess so a long CLI call cannot hold the single SQLite writer.
6. **Provider call** with at most `SCORING_PROVIDER_MAX_ATTEMPTS = 2` attempts
   (`service.py:80, 703-711`); a `ProviderError` on the last attempt re-raises.
   `TimeoutError` → `unavailable`, reason `"Scoring judge call timed out."`;
   `ProviderError` → `unavailable` with a scrubbed reason, default
   `"Scoring judge call failed."`
7. **Persist the raw artifact unconditionally** — parseable or not (§3.2).
8. **Parse failure** → `unavailable` payload carrying the parse reason and
   `model_metadata.status = "unavailable"`, lineage metadata attached, and a cache row
   stored with status `"unavailable"` so the failure is not re-paid on the next pass.
9. **Judge panel** (§2.8), only after the primary judge produced a usable assessment.
10. **Reduce** to an item, then **attach plural-judge provenance** (§2.9).
11. Build the payload (`status: "available"`, one item, model metadata, `producer` =
    scrubbed provider name), attach lineage metadata, store the cache row, return with
    `cache = {"hit": false}` plus any stale metadata.

**Batch behavior** — `score_nodes_with_provider` (`service.py:835-1027`): node list
truncated to `max_nodes` (default `None` = unbounded, `service.py:79`), skipped nodes
each becoming an error `"Scoring node limit reached."`; one commit per node;
`asyncio.CancelledError` breaks the loop with `"Scoring batch was cancelled."`; a
per-node payload with no items contributes either its own propagated error (preserving
the precise status, e.g. `no_independent_judge`) or a generic `unavailable`. Batch
cache metadata is an AND-fold over per-node hits, plus separate hit/miss counters; a
node whose payload carries no cache block counts as neither. An audit
`ProvenanceRecord` of kind `scoring_run` is written at start and end **only when the
pass will actually call a provider** (`service.py:857-878, 994-1014, 2504-2564`).

### 2.7 Which nodes are scored

`_debate_node_ids` (`service.py:2394-2425`): all nodes of the debate with
`status != "stale"` **and** `status != "failed"`, ordered
`materialized_path asc, depth asc, position asc, id asc`. `path_status == "abandoned"`
is **deliberately not** an exclusion — an abandoned-but-complete node must stay
scoreable so the exploration-policy reopen lifecycle remains reachable.

### 2.8 The cross-family judge panel

`coordinator/app/scoring/judge_panel.py` + `service.py:1168-1317`. Opt-in via
`DIALECTICAL_JUDGE_PANEL_MODELS`, a comma-separated model-id list; unset/empty →
no members → the single-judge path is byte-identical (`judge_panel.py:56-69`).

Each listed model is mapped to a lineage family; a family with no configured
in-process provider, or whose provider reports unavailable, becomes a **skip note**
rather than an error. Each surviving member gets its own `judge_role` of the form
`judge_panel_<family>` (`judge_registry.py:89-97`) — hence its own judge contract and
contract hash — and is called **sequentially with the identical request** (only
`judge_role` differs), at temperature 0.0, JSON response format.

Ordering guarantees: the writer lock is released (`commit_write`) before each member's
call; only the DB-mutating persist runs inside a savepoint, so a persist failure rolls
back that member alone. Every failure mode — construction exception, timeout, provider
error, any other exception, or an unparseable response — produces an honest note
`{model_id, family, status, reason}` with `status ∈ {exception, timeout,
provider_error, parse_unavailable, unconfigured, unavailable}` and **never** fails the
primary run or discards its result. Notes are folded into
`score_provenance.judge_panel_notes`.

### 2.9 Plural-judge provenance and aggregation

`_attach_plural_judge_provenance` (`service.py:1320-1508`).

**Evidence base** — `_persisted_judge_evidence_for_node` (`service.py:1564-1606`):
all `JudgeOutputArtifact` rows for `(debate, node, input_hash)` with
`parse_status == "available"` and a non-null assessment, ordered
`judge_role, provider, model, created_at, id` — all ascending. Rows are then
deduplicated (see register (c)).

**Always recorded, regardless of judge count and regardless of flags:**

- `calibrationWeights`: `{applicable, discountFactor, effectiveWeightTotal, weights[]}`
  where each weight entry is `{judge_role, family, weight, discounted, source}`.
  **Raw provider/model strings are never embedded** — only `judge_role` and the derived
  family. `source` is `"cold_start"` or `"config_override"`, never "learned"
  (`coordinator/app/scoring/calibration.py:35-48`).
- `calibrationApplied` = flag `DIALECTICAL_CALIBRATION_WEIGHTS` (default off) **and**
  discounting applicable.
- `discountFactor` = `DIALECTICAL_CALIBRATION_DISCOUNT_FACTOR`, default `0.5`, clamped
  to `[0,1]`.
- `judgment_mode` = `"judge_panel"` if ≥ 2 distinct judgments else `"single_judgment"`.
- `judge_families` = sorted vendor-brand buckets of every judgment.
- `sole_judge_family_matches_author` = exactly one judgment **and** its vendor family
  equals the arguer's.

**Correlated-error discount** — `calibration.py:51-107`. Fewer than 2 judgments →
`applicable: False, reason: "single_judgment"`, single item at weight 1.0. Two or more:
group by family in **first-appearance order** (never sorted by family name); the first
occurrence of a family keeps weight 1.0, every subsequent occurrence of the same family
gets the flat discount factor (**not compounding** for a third repeat); items with an
**unknown (`None`) family are never discounted against each other** — unknown lineage is
never assumed to correlate.

**Only when ≥ 2 distinct judgments exist:**

- `judge_participation = {plural_judges: true, judge_count, judge_roles: sorted set}`.
  Recorded consequence: within a same-family group, which judgment keeps full weight is
  decided by the stable `judge_role, provider, model, created_at, id` ordering — the
  alphabetically-first combination wins; later same-family entries are the discounted
  ones. This is a deliberate, documented choice.
- `disagreement_status = {status: "present"|"none", derived_from:
  "persisted_judge_artifacts"}`.
- If disagreements exist, the item's `judge_disagreements` is **replaced** by them.
- If `calibrationApplied`, the item's whole `scores` object is replaced by a weighted
  mean: re-run the reducer once per persisted judgment against the same claim, then
  take `Σ(wᵢ·fieldᵢ)/Σwᵢ` for each of the eight numeric fields, rounded to 4
  (`service.py:1514-1561`). If the weight total is ≤ 0 (unreachable in practice) it
  falls back to the plain unweighted mean rather than dividing by zero.
- **Dispersion uncertainty always wins over both the heuristic and the weighted
  average** (`service.py:1487-1506`, `disagreement.py:263-287`):
  `spread = max(signal) − min(signal)` over the distinct judgments, where the signal is
  a fixed composite (`disagreement.py:290-304`):

  ```
  signal = clamp(0.30·logical_validity + 0.30·evidence_quality
               + 0.25·(1 − counterargument_strength) + 0.15·relevance
               − 0.20·assumption_risk, 0, 1)
  ```

  `uncertainty = clamp(spread × (0.5/0.35), 0, 1)`, rounded to 4
  (`disagreement.py:18`). On success the item's `uncertainty_source` becomes
  `"dispersion"` and a `judge_dispersion` driver labelled
  `"judges disagree (spread {spread:.2f})"` is **prepended** to the driver list.
  Fewer than two parseable judgments → `None`, and callers must keep the heuristic
  value; `None` must never be read as zero uncertainty.

**Cross-judge disagreement detection** — `disagreement.py:169-226`. Behind flag
`DIALECTICAL_FIELD_DISAGREEMENT`, default **off**:

- Flag **off** (production default): the historical composite gate — compute the same
  composite signal per judgment, take min and max (ties broken by `judge_role`), and
  emit one `persisted_judge_strength_gap` disagreement only if the gap is `>= 0.35`.
  The repo records this gate as **un-fireable against its own data**: the largest
  observed composite spread across 26 nodes was 0.11 (`disagreement.py:64-69`).
- Flag **on**: per-field spread on four pivotal fields —
  `critic.logical_validity`, `steelman.charitable_strength`, `evidence.evidence_quality`,
  `context.impact` (`disagreement.py:80-85`) — with threshold
  `DISAGREEMENT_FIELD_THRESHOLD = 0.25` (`:99`). If any field's spread meets it, emit
  one `cross_family_field_spread` disagreement naming the **widest** field and its
  spread, severity high, `judges` = sorted distinct judge roles.
- A judgment whose assessment fails schema validation is **silently discarded** from
  the panel, with no annotation on any audited record — a three-judge panel with one
  unparseable judgment silently becomes a two-judge panel (`disagreement.py:131-149`).

### 2.10 Lineage vocabulary

`coordinator/app/scoring/lineage.py`. Two deliberately different "family" concepts:

- `lineage_family` (`:18-46`): substring match, first hit wins, over
  `claude→claude, gpt→gpt, codex→gpt, gemini→gemini, llama→llama, mistral→mistral,
  deepseek→deepseek, grok→grok`. An unrecognised non-empty string is returned
  **lowercased and unchanged** — its own family of one, never folded into another
  bucket and never collapsed to `None`. `None`/empty → `None`.
- `panel_vendor_family` (`:54-94`): the product-facing brand bucket —
  `codex|gpt→openai, claude→anthropic, gemini→google, grok→xai, lmstudio→local`,
  everything else (including empty) → the literal string `"unknown"` (never `None`).

`judge_lineage_metadata` (`:97-137`) emits `{judgeLineage, arguerLineage, independent,
independenceReason}` and **never fabricates independence**: unknown arguer →
`independent: null, reason "arguer_lineage_unknown"`; unknown judge family →
`independent: null, reason "judge_lineage_unknown"`; else
`independent = arguer_family != judge_family` with reason `independent_lineage` /
`same_lineage`.

`_public_metadata_text` (`:140-149`) is the scrub applied to every string before it is
served or used to derive a served bucket: non-string or blank → `None`; a value whose
lowercase form contains any of `api_key, apikey, authorization, "bearer ",
client_secret, password, secret, token, --api-key, --token, key=, token=` → `None`;
else the stripped string.

### 2.11 Failure paths (Organ 2, consolidated)

| Failure | Result |
|---|---|
| Node not current / not loadable | `unavailable` with a specific reason; no provider call |
| Provider timeout | `unavailable`, `"Scoring judge call timed out."` |
| Provider error after 2 attempts | `unavailable`, scrubbed error text or `"Scoring judge call failed."` |
| Output not JSON | `unavailable`, `"Judge output was not valid JSON."`; raw artifact still persisted; failure cached |
| JSON but wrong schema | `unavailable`, `"Judge output did not match the scoring schema."` |
| Same-lineage judge, flag on | error status `no_independent_judge`, scoring blocked, never a silently reused judge |
| Panel member fails in any way | honest note in `judge_panel_notes`; primary result untouched |
| Panel member's assessment unparseable at read time | judgment silently dropped from the panel |
| No scoring provider configured | scoring job created and immediately failed with `"No scoring provider is configured."` |

---

## Organ 3 — Trusted-run reconstruction

> **Naming caveat (see Uncertainties U1).** No module, function, script or test in V2
> carries the name "trusted-run reconstruction". The behaviour V's steer names is
> reconstructed here from the mechanism that satisfies its description — *"a
> reconstruction validated six times out of six against persisted output, byte-identical
> across two runs, and independently re-implemented"* (upstream `human-plan.md:411`) —
> namely V2's ability to rebuild a served scoring payload deterministically from
> durable raw judge artifacts. V should confirm the mapping before it is frozen into
> the spec.

### 3.1 Purpose

Make every served score **re-derivable from persisted raw evidence**, so that (a) a
crashed or partial scoring pass can resume without re-paying for judge calls, (b) a
payload can be rebuilt when the aggregated run row is missing, and (c) an independent
re-implementation of the reducer can be checked against real stored inputs.

### 3.2 What is persisted, and under what identity

**`JudgeOutputArtifact`** — one row per distinct raw judge output
(`service.py:1105-1165`). Identity for upsert:
`(debate_id, node_id, input_hash, judge_role, provider, model, raw_output_sha256)`. It
stores the **raw text**, its SHA-256, the request metadata (prompt version, timeout,
scrubbed provider metadata), the parse status and parse error, the validated assessment
dict (or `None`), provider metadata, latency, and `checked_at`. It is stamped with the
**current active judge contract** (`judge_id`, `judge_version`, `contract_hash`) at
write time; if a current scoring job exists and differs from the artifact's job, the
artifact is re-stamped onto that job and its `analyzer_run_id` is cleared.

Provider metadata is allow-listed before storage (`service.py:1715-1739`): only
`id, provider_response_id, response_id, request_id, model, provider, finish_reason,
stop_reason, usage, input_tokens, output_tokens, total_tokens` survive, recursively
scrubbed. `checked_at` accepts an ISO string (with `Z` normalised to `+00:00`,
naive values coerced to UTC) and otherwise falls back to now (`service.py:1757-1765`).

**`NodeScoringResult`** — the per-node public payload cache
(`coordinator/app/scoring/cache.py:188-242`). Upsert identity:
`(debate_id, node_id, input_hash, judge_role, provider, model, contract_hash)` where a
NULL contract hash is its own lane. A changed contract yields a **new row**; the old
contract's row is preserved as historical, never overwritten.

**`AnalyzerRun`** of type `node_scoring` — the debate-level aggregated run
(`coordinator/app/scoring/jobs.py:221-242`), with provenance
`{"scoring_source": "judge_outputs", "job_id", "node_ids"}`. Sequence numbers are
assigned under the write lock.

### 3.3 The input hash — what "the same input" means

`node_scoring_input_hash` (`cache.py:51-75`). SHA-256 over
`json.dumps(payload, sort_keys=True, separators=(",", ":"))` of:

```
{
  "version":         "node-scoring-input-v3",
  "claim":           <full NormalizedClaim, JSON mode>,
  "argument_text":   <argument or "">,
  "debate_question": <topic or "">,
  "children":        [{node_id, stance, claim, argument_excerpt} …]   # rendered order
}
```

The children digest hashes **exactly what the prompt renders** — including the already
truncated excerpt — in the caller's order, never re-sorted. The `truncated` boolean is
deliberately omitted as fully determined by the excerpt. Motivating property: adding an
attack child to a node changes its hash, so a rescore cannot cache-hit on a
children-blind key and miss the new counters.

The **judge contract is deliberately not part of the input hash**; it is a separate
column, so an artifact from a superseded contract can share the current input hash and
be recognised as superseded rather than colliding.

### 3.4 The reconstruction paths

**(A) Rebuild the payload from artifacts** — `_hydrate_scoring_payload_from_judge_artifacts`
(`service.py:293-332`), used when no completed `node_scoring` run exists. For each
current node id, in node order:

1. `_hydrate_node_scoring_item_from_judge_artifact` (`service.py:335-396`): recompute
   the claim and the input hash from live rows; select the newest
   `JudgeOutputArtifact` matching `(debate, node, input_hash, current judge role,
   parse_status "available", assessment not null, **current contract hash**)`, ordered
   `checked_at desc, created_at desc, id desc`.
2. If found: validate the stored assessment against the schema, **re-run the reducer**
   over it, then re-attach plural-judge provenance. Source label
   `"persisted-judge-artifacts"`.
3. If not found: fall back to (B). Source label `"historical-scoring-cache"`.
4. Any missing node, missing contract, non-dict assessment, or schema-validation
   failure yields nothing for that node — never a fabricated score.

The payload's `producer` is `"persisted-judge-artifacts"` if **at least one** item came
from a contract-matched artifact, else `"historical-scoring-cache"`
(`service.py:313-320`). Model metadata is taken from the **first** item that produced
any.

**(B) Serve a stored public result verbatim** — `_hydrate_historical_public_result`
(`service.py:399-439`). Selects the newest `NodeScoringResult` matching
`(debate, node, input_hash, status "available")` — **without a contract-hash
predicate** — reads its stored `result` payload, and extracts the single item whose
`node_id` matches. Stated invariants: it **never re-reduces old assessments through
current code**, and **never fabricates a score when nothing was persisted**. This is
the deliberate "legacy/mismatched contract" lane. *(Its per-item provenance
consequences are indicted — register entry (d).)*

**(C) Resume a partial pass** — `_relink_cached_node_artifacts_to_current_job`
(`service.py:1044-1102`). When a `force_refresh=False` pass serves a node from cache,
no judge call runs, so no artifact would be stamped onto the running job. This helper
re-attributes the node's artifacts to the current job — but **only** those whose
`contract_hash` equals the current active contract **for their own judge role** (the
primary and each panel role are distinct contracts). A superseded-contract artifact is
left untouched, so a resuming run never absorbs an out-of-contract judgment.
`analyzer_run_id` is nulled on moved artifacts so the resuming run relinks them.

**(D) Completeness gate** — `_ensure_job_has_required_judge_artifacts`
(`jobs.py:371-406`). Before an aggregated `node_scoring` run is persisted, every
required node id (the payload's `node_ids` minus those skipped by the node limit, in
order, deduplicated) must have at least one `JudgeOutputArtifact` under the running
job's id. Missing any → `RuntimeError` → the job fails and **no** aggregated run is
written. This is the guarantee that a persisted run is always fully reconstructible
from durable raw evidence.

**(E) Resolving "the panel this node was most recently judged on"** —
`latest_judge_evidence_for_node` (`service.py:1609-1683`). Picks the newest available
artifact by `created_at desc`, then `AnalyzerRun.seq desc` (via an **outer** join, so
an unlinked artifact is still a candidate and, in SQLite, sorts last), then `id desc`;
returns the distinct evidence for that artifact's input hash. Wall clock leads; run
sequence only breaks its ties. Documented residual: two artifacts sharing a timestamp
tick **and** both unlinked still fall through to a random UUID.

### 3.5 The judge contract

`coordinator/app/scoring/judge_registry.py:31-126`. A `JudgeContract` is frozen and
pins `judge_id, judge_version, role, rubric_version, prompt_version, schema_version,
reducer_version` **plus the full JSON Schema of `ClaimAssessment`**. `contract_hash` is
SHA-256 over `json.dumps(payload, sort_keys=True, separators=(",", ":"))` of exactly
those fields. Consequence: any change to the rubric, prompt, output schema, or reducer
math changes the hash and invalidates every cached result and artifact — old outputs
can never be silently reinterpreted by newer code. Registered contracts: the primary
`node_scoring.primary` at role `"judge"`, plus a per-family panel contract
`node_scoring.panel.<family>` resolved on demand from a `judge_panel_<family>` role.

Currently pinned versions: `SCORING_PROMPT_VERSION = "scoring-provider-v2"`,
`CLAIM_ASSESSMENT_SCHEMA_VERSION = "claim-assessment-v1"`,
`REDUCER_VERSION = "node-scoring-reducer-v3"`, `RUBRIC_VERSION = "debateai-rubric-v1"`.

Defence against drift: the default `score_provenance` factory reads the **live**
constants rather than string literals, so a bare payload construction can never mint
provenance claiming stale reducer math (`models.py:361-389`).

### 3.6 Serving path and its provenance checks

`debate_scoring_payload` (`service.py:149-290`). Ordered:

1. Compute the current node ids; find the newest **completed** `node_scoring`
   `AnalyzerRun` by `seq desc, created_at desc, id desc`; find any active scoring job
   created after it.
2. No run → try reconstruction path (A); if that yields nothing, return an
   `unavailable` payload.
3. **Run-level provenance check**: `run.provenance["scoring_source"]` must equal
   `"judge_outputs"`, else `unavailable` with
   `"Stored scoring output was not produced by judge outputs."`
4. `output["items"]` must be a list, else `"Stored scoring output is missing an items
   array."`; every item must validate as a `NodeScoringPayload`, else
   `"Stored scoring output contains malformed node scoring items."`; the status string
   must be a known status, else `"Stored scoring output has an unknown status."`; every
   item's `node_id` must be in the current node set, else `"Stored scoring output
   references nodes outside the current debate."`
5. Sanitising on the way out (`service.py:2033-2049`): each item is re-validated,
   `debug.judge_outputs` is **stripped**, and `debug` is reduced to
   `{reducer_version, rubric_version}` — or set to `None` if either fails the secret
   scrub. Errors and pending entries are re-validated and their reasons scrubbed,
   dropping any entry whose reason does not survive (`service.py:2052-2089`).
6. Optional scalars are copied through only when well-typed (`max_nodes`,
   `scored_node_count`, `skipped_node_count` must be non-bool ints; `truncated` must be
   a bool); `cache` is copied only if it carries a boolean `hit`, otherwise defaulted to
   `{"hit": false}` for `available`/`partial`.
7. If `DIALECTICAL_QBAF_DEBUG` is on, attach the debug block (Organ 4).
8. **Coverage reconciliation** — `_with_current_node_coverage` (`service.py:2092-2168`):
   drop items/errors/pending for nodes that are no longer current; for current nodes
   with no entry at all, add `pending` entries (`"Scoring is running for this node."` /
   `"Scoring is queued for this node."`) if a job is active, else add errors
   (`"Stored scoring output has no result for this current node."`) — but only if the
   payload had *some* content already; then recompute the status.
9. Attach the active job's id and its public status
   (`pending→queued`, `claimed|running→running`, `complete|failed` as-is, anything else
   → `failed` — `service.py:2239-2247`).

Stale-job expiry (`service.py:2202-2237`) runs on every read: active jobs past their
deadline are transitioned to failed with `"Stale scoring job expired before judge
outputs were produced."`

---

## Organ 4 — The `qbaf_debug` graph view

### 4.1 Purpose

A **debug-only** rendering of the DF-QuAD graph for one debate, attached to the public
scoring payload behind a flag, so an operator can see the taus, their provenance, the
edges, and the resulting strengths without running the protocol analyser. It is
explicitly **not part of the stable wire contract** (`service.py:150-155`).

### 4.2 Activation and placement

- Flag `DIALECTICAL_QBAF_DEBUG`, default **off**; read with truthy values
  `{1, true, yes, on}` (`coordinator/app/core/config.py:142-146`).
- Attached only on the **successful** scoring-payload path, as `payload["qbaf_debug"]`
  (`service.py:287-288`). Entirely absent when the flag is off
  (`tests/test_qbaf_debug.py:236-243`).
- Semantics override: env `DIALECTICAL_QBAF_DEBUG_SEMANTICS`, defaulting to
  `"df-quad-v1"` (`coordinator/app/scoring/qbaf_debug.py:20, 108`). **This is the only
  runtime path in the whole system that can select a non-default aggregation variant.**

### 4.3 Inputs

- The debate's node rows (`qbaf_debug.py:23-45`): `status != "stale"` **and**
  `status != "failed"`, ordered `materialized_path, depth, position, id` — all
  ascending — projected to `{id, parent_id, node_type}`. This mirrors the scoring node
  query, including its deliberate refusal to exclude `path_status == "abandoned"`.
- The scoring payload's `items`, indexed by `node_id` (`qbaf_debug.py:48-56`). A
  non-dict payload, a missing `items`, or a non-list `items` all yield `{}` — never a
  crash (`tests/test_qbaf_debug.py:183-192`).
- The same latest-per-evidence-node verifier verdicts the production path uses,
  projected to `{status, base_score}` (`qbaf_debug.py:59-93`).

### 4.4 Output

On success, a dict of exactly six keys (`qbaf_debug.py:114-121`):

| Key | Value |
|---|---|
| `fingerprint` | the adapter's SHA-256 hex digest |
| `strengths` | `node_id → final strength` |
| `tau_sources` | full map, including the `"<node_id>__edge"` markers |
| `semantics` | the resolved identifier actually used |
| `attacks` | list of `(source, target)` pairs, adapter order, deduplicated |
| `supports` | same, for supports |

Raw judge output never appears (`tests/test_qbaf_debug.py:57-59`).

### 4.5 Failure paths — two distinct tiers, deliberately

1. **Evidence enrichment failure** has its **own** try/except (`qbaf_debug.py:86-89`):
   any exception fetching verdicts degrades to "no evidence edges" and the block is
   still produced normally. Pinned by `tests/test_qbaf_debug.py:136-163`.
2. **Any other failure** — including `CyclicGraphError` from a malformed parent chain,
   or a `ValueError` from an unknown edge endpoint — is caught by the outer handler and
   returns `{"unavailable_reason": str(exc)}` **and nothing else** (no `strengths` key)
   (`qbaf_debug.py:122-123`; `tests/test_qbaf_debug.py:166-180`).

The function **never raises** and, once called, always returns a dict. Callers decide
whether to call it at all. The stated invariant is that this debug feature can never
affect real scoring.

### 4.6 Known divergence from the production graph

The debug view and the production protocol analysis build the graph over **different
node sets**:

| | node filter | source |
|---|---|---|
| `qbaf_debug` | `status not in {stale, failed}` | `qbaf_debug.py:33-41` |
| production | `status != "stale"` (failed nodes **included** in the graph) | `runner.py:64-66` |

For a debate containing any failed node, the debug block's strengths, fingerprint and
node set will therefore differ from the persisted `dialecticalStrengths`. V2 documents
the production choice as deliberate (a dead node can still be a live sibling's edge
*target*, and dropping it risks an orphaned edge that would fail the whole computation)
but does not reconcile the debug view with it. **V3 must pick one node-set rule and use
it in both places, or state the divergence in the served payload.**

---

## EXCLUDED-BY-RULING register

The four semantics below are **current V2 behavior**, documented so V3 can be checked
against them, and are **forbidden in V3**. Each entry gives the mechanism, the exact
site(s), the measured consequence, and what V2 already does that partially mitigates it
(so V3 does not lose a real safeguard while removing the defect).

---

### (a) EXCLUDED-BY-RULING — Unjudged-node fallback confidence

**Mechanism.** Any node that has no judge score is silently given a base score of
**0.5** that is then indistinguishable, inside the aggregation, from a measured one.
Because DF-QuAD's aggregation is a probabilistic sum, a handful of such nodes stacks to
near-certainty from topology alone.

**Where it lives.**

| Site | What it does |
|---|---|
| `coordinator/app/qbaf/debate_adapter.py:20` | `DEFAULT_TAU = 0.5` |
| `coordinator/app/qbaf/debate_adapter.py:84-92` | `_tau_for` returns `(DEFAULT_TAU, "default")` whenever `scores[node_id]["scores"]["strength"]` is missing or not a real number |
| `coordinator/app/qbaf/debate_adapter.py:303-308` | writes that tau into `base_scores` on exactly the same footing as a judged tau |
| `coordinator/app/qbaf/dfquad.py:47-59, 62-66, 156-163` | the probabilistic sum + mediating function that convert N default taus into a near-1.0 root |
| `coordinator/app/qbaf/model.py:30-31` | the second, independent default pair on the weighted path: `base_score = 0.5`, `final_strength = 0.5` |

**Measured consequence — V2's own golden test.**
`coordinator/tests/test_debate_graph_adapter.py:398-416`: a root plus four **unjudged**
POV lens children, every tau defaulted to 0.5, produces
`root = 0.96875` under production semantics. Recomputed independently from the formulas
in §1.2: `agg([0.5]×4) = 1 − 0.5⁴ = 0.9375`; `σ(0.5, 0, 0.9375) = 0.5 + 0.5·0.9375 =
0.96875`. This is the audit's *"about ninety-seven percent confidence, from the shape
of the map alone"* (upstream `human-plan.md:95`). With five such supporters the figure
is `0.984375`.

**What V2 already does about it (keep the intent, not the mechanism).**

- Provenance *is* recorded per node as `tau_sources[node_id] = "default"`
  (`debate_adapter.py:308`) and persisted as `tauSources` (`runner.py:252`).
- An aggregate coverage number is computed (`runner.py:243-248`) and used as a
  **band gate**: below `_TAU_COVERAGE_MIN = 0.5` the verdict band becomes
  `insufficient_scoring` rather than supported/unsupported/contested
  (`coordinator/app/scoring/verdict.py:44, 256-264`), with the honest sentence
  *"the strength of an all-default-tau run is a topology artifact, not evidence"*
  (`verdict.py:38-43`).
- A missing or malformed `tauCoverage` is read as **0.0**, never guessed
  (`verdict.py:244-255`).

**Why that is not enough (and what V3 must therefore do differently).** The gate is
aggregate and band-level only: the raw fabricated number is still served in
`basis.dialecticalStrength` (`verdict.py:285`) and printed inside the
`insufficient_scoring` claim language as a *"structural reading for transparency"*
(`verdict.py:262-263`); the lean meter uses a far weaker gate of merely
`tauCoverage > 0` (`coordinator/app/scoring/lean.py:140`); and at 50 % coverage a
supported band can still be served with half its taus invented. **V3 must not have a
"tau from nothing" state at all** — an unjudged node must be representable as
*unmeasured* (excluded, or carried as an explicit abstention that cannot contribute
strength), never as 0.5.

---

### (b) EXCLUDED-BY-RULING — Hardcoded aggregation-variant switch

**Mechanism.** Three aggregation variants are registered; the production verdict path
selects one by a **literal in the source**, with no configuration, environment, request
or database input. The alternative is reachable only from a debug-only code path, so it
never runs against real traffic and its disagreement with the served answer is never
surfaced.

**Where it lives.**

| Site | What it does |
|---|---|
| `coordinator/app/qbaf/semantics_versions.py:4-11` | registers three ids — `df-quad-v1`, `df-quad-weighted-v1`, `df-quad-v2-lens-lift` — and sets `DEFAULT_SEMANTICS = SEMANTICS_V1` |
| `coordinator/app/protocol/runner.py:188` | **`semantics_version = DEFAULT_SEMANTICS`** — the hardcode |
| `coordinator/app/protocol/runner.py:191-193` | calls the adapter **without** a `semantics=` argument, so v1 is always used |
| `coordinator/app/protocol/runner.py:254, 376` | stamps `qbafSemantics` / `semanticsVersion` with that same literal |
| `coordinator/app/qbaf/debate_adapter.py:265-269` | the switch itself: resolves the id, rejects anything outside `{v1, v2-lens-lift}`, sets `is_lens_lift` |
| `coordinator/app/scoring/qbaf_debug.py:108` | the **only** runtime override — env `DIALECTICAL_QBAF_DEBUG_SEMANTICS`, itself only read when `DIALECTICAL_QBAF_DEBUG` is on (`service.py:287`) |
| `coordinator/app/api/qbaf.py:83` | the third variant, `df-quad-weighted-v1`, on a separate in-memory-only API path that never touches the verdict |

**Measured consequence — V2's own tests.** Identical tree, identical taus:

| Semantics | Root strength | Evidence |
|---|---|---|
| `df-quad-v1` (production) | **0.96875** | `tests/test_debate_graph_adapter.py:409-415` |
| `df-quad-v2-lens-lift` | **0.5** | `tests/test_debate_graph_adapter.py:419-427` |

Under the declared bands (`verdict.py:36-37`) that is `supported` versus `contested`
from the same underlying judgements — the audit's *"same five scored maps … supported
under the original scoring rule and unsupported under the revised one; average
confidence fell from about 0.93 to about 0.21 … Production hardcodes the original, so
the alternative never runs"* (upstream `human-plan.md:97`). The mechanism is visible in
the two edge tables: under v1 every POV lens container emits a **support** edge into the
root (`debate_adapter.py:42, 148-149`); under v2 a container emits **no edge** and its
PRO/CON descendants lift to the nearest argumentative ancestor
(`debate_adapter.py:223-239`), so counter-arguments that v1 buried under a "supporting"
lens become real attacks on the root.

**What V2 already does about it.** The variant is *stamped* on every persisted run
(`runner.py:376`), the fingerprint is seeded with any non-default identifier so runs
under different semantics can never be confused (`debate_adapter.py:334-335`), and
convergence refuses to compare across a semantics change
(`runner.py:293-305`). Version registration itself is honest — an unknown identifier
raises rather than silently defaulting (`semantics_versions.py:14-19`).

**What V3 must therefore do differently.** The choice must be an explicit, recorded
input to the run, not a source literal; and where a registered alternative disagrees
materially, **both readings must be served together with the deciding constant printed**
— the upstream ruling is explicit that a constant which flips the verdict means "serving
both, pinning the constant, and printing a visible line stating the conclusion depends
on it", and explicitly **not** an abstention (upstream `human-plan.md:619`).

---

### (c) EXCLUDED-BY-RULING — Exact-string dedup

**Mechanism.** Every deduplication in the system is byte equality — of an edge tuple,
of an identity tuple, or of a raw-output hash. Nothing anywhere compares meaning. Two
sub-claims saying the same thing in different words therefore count twice, and the
probabilistic sum converts that repetition directly into strength.

**Where it lives — the complete inventory.**

| Site | Dedup key | Effect |
|---|---|---|
| `coordinator/app/qbaf/dfquad.py:92-98` | `(str(source), str(target))` per polarity list, via order-preserving `dict.fromkeys` | exact duplicate edges collapse; anything else double-counts |
| `coordinator/app/qbaf/semantics.py:81-103` | `(source_id, target_id, polarity)` | exact duplicates collapse; **conflicting weights on the same identity raise `ValueError`** |
| `coordinator/app/scoring/service.py:1589-1605` | `(judge_role, provider, model)` **or** exact `raw_output_sha256` | judge-panel distinctness: byte-identical judgements collapse, semantically identical ones from different models both count as independent |
| `coordinator/app/scoring/disagreement.py:229-260` | the same two keys, applied to the same evidence list | the distinctness rule used by the disagreement gate and by dispersion uncertainty |
| `coordinator/app/scoring/judge_panel.py:60-69` | exact model-id string | duplicate panel entries dropped |
| `coordinator/app/scoring/calibration.py:86-99` | exact family string; `None` never matches `None` | correlated-error grouping |
| `coordinator/app/evidence/verification_evaluator.py:225-239` | exact evidence node id | first verdict per node wins |
| `coordinator/app/scoring/jobs.py:387-405`, `coordinator/app/api/scoring.py:558-568` | exact node-id string | required-artifact and approval lists |

**Measured consequence.** From the aggregation in §1.2, a single supporter of strength
`0.40` restated twice more yields aggregated support of `0.40 → 0.64 → 0.784` — the
audit's *"a single claim at strength 0.40, restated a second and third time, rose to
0.64 and then 0.78"* (upstream `human-plan.md:99`), reproduced exactly from the formula.

**The nearest thing V2 has to provenance-based counting, and why it does not count.**
`coordinator/app/evidence/independence.py:127-150` counts distinct
`(source_domain, method)` pairs across a claim's evidence children — but its own
docstring states it measures *sourcing breadth, never truth*, it deliberately does not
widen the key with `model_family`, and it is consumed **only** by serialization
(`coordinator/app/services/serialization.py:298-307`). It gates nothing: no scoring or
aggregation path reads it.

**What V3 must therefore do differently.** Per the upstream ruling (`human-plan.md:370,
802`): counting is by **provenance**, not by citation count — shared source is
deterministic and **gates** (count a cluster once, conservatively at the strength of its
strongest member, never the sum); shared assumption is a **flag**, never a gate (lift
the premise into its own node and mark it).

---

### (d) EXCLUDED-BY-RULING — Provenance-blind serving

**Mechanism.** Provenance is computed and persisted, and then **no serving path reads it
per item**. Numbers derived from measured judgements and numbers derived from defaults
are summed, averaged and displayed through the same channel with nothing on the served
artifact distinguishing them.

**Where it lives.**

| Site | What is provenance-blind |
|---|---|
| `coordinator/app/protocol/runner.py:249-259` | `dialecticalStrengths` is a **flat** `node_id → float` map. `tauSources` is persisted **beside** it, never joined to it. |
| `coordinator/app/scoring/lean.py:140-146` | sums per-node strengths across live PRO and CON with **no per-node tau-source check**, gated only on the debate-wide `tauCoverage > 0`, and labels the result `source: "dialectical"` — i.e. presents it as a strength reading. One judged node out of thirty satisfies the gate. |
| `coordinator/app/scoring/verdict.py:209-296` | reads only the **root's** strength and the **aggregate** coverage. `basis` never carries the root's own tau source; `tauSourceMajority` (`verdict.py:256`) is derived from the aggregate number, not from any node's actual `tauSources` entry. |
| `coordinator/app/scoring/service.py:399-439` | `_hydrate_historical_public_result` selects a stored result **without any contract-hash predicate** and serves it verbatim with `status: "available"`. The only signal is the payload-level `producer: "historical-scoring-cache"` (`service.py:313-320`) — **per item** there is nothing marking it as produced under a superseded rubric/prompt/reducer contract, and a mixed payload where one item hydrated from a current artifact reports `producer: "persisted-judge-artifacts"` for the whole payload. |
| `web/components/VerdictBanner.tsx:90`, `web/lib/types.ts:594` | the UI's only provenance surface is the aggregate `tauCoverage`. A repo-wide search of `web/` finds **no** consumer of `tauSources`, `score_provenance`, `judgment_mode`, `judge_families`, or `reducer_version`. |

**What V2 already does right (keep this).** Provenance is genuinely *recorded*, always
and honestly, at several levels: per-node `tau_sources` (`debate_adapter.py:308`); a
run-level `scoring_source` check that refuses to serve a payload not produced by judge
outputs (`service.py:177`); always-on lineage recording that never fabricates
independence (`lineage.py:97-137`); `calibrationWeights` and `judgment_mode` recorded
even when only one judge ran (`service.py:1338-1349, 1435-1439`); `uncertainty_source`
distinguishing measured dispersion from the heuristic checklist
(`models.py:36-58`); `strength_kind` distinguishing the two strength compositions; and a
secret scrub on every served string (`lineage.py:140-149`). **The defect is the join,
not the recording.**

**What V3 must therefore do differently.** Per the upstream ruling
(`human-plan.md:143, 664`): every weight-bearing number carries its own kind, source and
producer; a claim without a locator blocks serving; and a verdict resting on reasoning
alone is downgraded from a verdict to a hypothesis plus a research plan. Concretely for
these organs: a served strength must travel with the provenance of the taus that
produced it, and no aggregate coverage number may stand in for per-node labels.

---

## Uncertainties

**U1 — "Trusted-run reconstruction" is not a named V2 artifact.** A repo-wide search
finds the phrase only in mission documents (`human-plan.md:411`,
`post-report-discussion-summary.md:47`, this mission's intake and tickets); no module,
function, script or test carries it, and the review lenses independently flagged the
term as undefined for a stranger (`reviews/ReviewLens-Hermes.md:9`). Organ 3 above maps
it to the mechanism that satisfies the description — persisted raw judge artifacts +
input/contract hashing + the artifact-completeness gate + the two hydration paths. **V
should confirm this mapping**, and in particular whether the "six times out of six,
byte-identical across two runs, independently re-implemented" bar is a *validation
procedure V3 must re-run* (which would make it a golden-vector obligation, ticket 03) or
a *property of the organ*.

**U2 — The exact "~0.97" arithmetic.** The audit says *five* unjudged sub-claims;
V2's own golden test produces `0.96875` from **four** unjudged supporters, and five
gives `0.984375` (both recomputed here). The likeliest reading is that the fifth node in
the audit's count is the root itself (four POV lens children plus the root), but this is
not resolvable from code alone. It does not affect the mechanism or the exclusion — only
the phrasing of any worked example V3 quotes.

**U3 — Two DF-QuAD implementations; which is kept?** `app/qbaf/dfquad.py` (unweighted,
iterative Kahn sort, `CyclicGraphError`) and `app/qbaf/semantics.py` (edge-weighted,
recursive with memoisation, plain `ValueError` on cycles, raises on conflicting
duplicate weights) implement the same math with materially different behaviour. Only the
first reaches the verdict. The second is reachable only via `POST /api/qbaf/runs` into an
**in-memory** repository (`app/api/qbaf.py:20`), so its runs do not survive a restart.
**Is the weighted variant in the kept-organ set at all?** If yes, the edge-weight
semantics (`weighted_strength = weight × source_strength`, `semantics.py:53`) must be
specified as a first-class part of Organ 1, and its default `weight = 1.0`
(`model.py:86`) is a fifth "value from nothing" that V should rule on.

**U4 — Debug-vs-production node-set divergence (§4.6).** `qbaf_debug` excludes
`status == "failed"` nodes from the graph; production includes them. For any debate with
a failed node the debug view's fingerprint and strengths do not match the persisted ones.
V3 must choose one rule. Related: the pointer comment at `qbaf_debug.py:24` cites
`service.py:1811` for `_debate_node_ids`, which now lives at `service.py:2394` — the
mirror is maintained by comment, not by construction.

**U5 — Which flag state is "the kept behavior"?** Several organ behaviours are
flag-gated and **off** in production, so "V2's behavior" is ambiguous for them:
`DIALECTICAL_CALIBRATION_WEIGHTS` (weighted score aggregation), `DIALECTICAL_FIELD_DISAGREEMENT`
(the per-field 0.25 gate; with it off the live gate is the 0.35 composite one the repo
itself records as un-fireable — `disagreement.py:64-69, 86-99`),
`DIALECTICAL_LINEAGE_INDEPENDENCE`, `DIALECTICAL_EVIDENCE_VERIFICATION`,
`DIALECTICAL_JUDGE_PANEL_MODELS` (unset), `DIALECTICAL_QBAF_DEBUG`. V must say, per flag,
whether V3 carries the flag-off behaviour, the flag-on behaviour, or neither. My reading
of the ruling: the un-fireable 0.35 composite gate is one of the audit's "checks that
could not fire" and should not be carried in either state — but that is not one of the
four indicted semantics, so it is flagged here rather than assumed.

**U6 — `CONTRADICTED_EVIDENCE_TAU = 0.7`** (`debate_adapter.py:60`) is a declared
constant with no verifier-supplied magnitude behind it. It is not one of the four
indicted semantics, but it is structurally the same species of defect as (a) — a number
from nothing, just an honestly documented one. V should rule explicitly.

**U7 — Dead organ.** `SelfConsistencyScorer` / `parse_score_sample` /
`SelfConsistencyResult` (`coordinator/app/scoring/self_consistency.py`) are exported from
`app.scoring.__init__` but have **no caller anywhere in `app/`**. It implements a 3–5
sample self-consistency estimator whose uncertainty is `max(spread(base_scores),
spread(edge_weights))` and whose point estimates are plain means. Carry or drop?

**U8 — Rounding and float determinism.** Reduced scores are rounded to 4 decimals
(`reducer.py:450-451`) but DF-QuAD strengths are **not** rounded anywhere before being
persisted or compared (`runner.py:250`, and the convergence `maxDelta` at
`runner.py:352`). Byte-identical reproduction across implementations therefore depends on
IEEE-754 double semantics **and** on the edge iteration order fixed in §1.3. If ticket 03
wants exact golden vectors rather than tolerance-based ones, V3 should pin a rounding
rule at the persistence boundary; V2 does not have one.

**U9 — Judge model behaviour is out of scope here.** Everything above specifies the
*deterministic* half of the per-node contract. The judge's own numeric outputs are LLM
products and are not reproducible from this spec; golden vectors for Organ 2 must
therefore replay **stored** `ClaimAssessment` fixtures through the reducer rather than
re-invoke a judge. Fixtures of the right shape already exist in-repo
(`coordinator/tests/fixtures/smoke4_judge_artifacts.json`) and are read-only evidence
this mission may cite.
