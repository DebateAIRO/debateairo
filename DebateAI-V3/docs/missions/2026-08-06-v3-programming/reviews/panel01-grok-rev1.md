# PANEL-01 dual-diamond review — Grok lens (rev1)

**Ticket:** `t_eeea2f6e` · **Board:** `debateai-v3`  
**Reviewer:** Grok (independent read-only dual-diamond lens; DR-153)  
**Date:** 2026-08-12  
**Review packet:** `docs/missions/2026-08-06-v3-programming/reviews/PANEL-01-review-packet.md`  
**Worker claim inventory (not authority):** `docs/missions/2026-08-06-v3-programming/handoffs/PANEL-01-codex-handoff.md`, `handoffs/PANEL-01-progress.log`  
**Mode:** read-only. Product / runtime sources not edited. Judged from shipped source and tests, not handoff prose alone. Did **not** read any peer (Opus) PANEL-01 verdict. Orchestrator gates cited as already green (root `tsc` clean · v2-ui `tsc` clean · root vitest **63 files / 456 tests** · acceptance **9 / 35** · architecture 27/0 · source 0 blocking) — **not re-run**.

## Verdict

**CHANGES REQUESTED**

The multi-maker **graph** shape is real: two independently authored roots, per-root B3-B children, ordered cross-root responses with real GraphWriter support/attack edges at `magnitudeStatus: "UNKNOWN"`, M=2 typed guard, dormant `runJudgePanel` left dormant, and the depth-1 arithmetic (8 nodes / 4 attacks / 12 calls under the 42 ceiling) reconciles. That is not enough for this ticket.

**The ticket's soul fails.** B2-A one-served-root is lawful only if honesty surfaces say so **plainly**. The sole shipped disclosure is a bare `UNCOVERED-SCOPE` condition mark whose stranger-facing label is **"Scope not fully covered"** — the pre-existing Q27 *question-coverage* mark, not a multi-maker serve-asymmetry statement. A reader does **not** learn which maker's root was composed into the answer, or that the other maker's root was deliberately left out of the serve set. That is DR-115-class burial: the answer still reads as *the debate's answer* while being the primary house's answer.

**Serve-root selection is a silent constant.** Index-0 / primary / the main `this.#judge` gateway (OpenAI in acceptance) always owns the served root; there is no alternating policy, no recorded provenance of the choice, and no honesty field naming the served maker. Packet check 2 requires the choice to be **at minimum visible and recorded**. It is neither. That reopens the model-balance question V dismissed — by code, not by ruling.

Two **BLOCKING** findings below. Topology, M-guard mechanism, edges, arithmetic, dormant surfaces, and most of the mutation surface are otherwise sound and would pass once honesty is fixed.

---

## Judgment topics (packet §What to judge)

| # | Topic | Judgment |
|---|---|---|
| 1 | Shape honesty (one served / two authored) — **ticket soul** | **FAIL** (BLOCKING-1) |
| 2 | Which root served · who decided · provenance | **FAIL** (BLOCKING-2) |
| 3 | M-guard (typed, DR-159, agent_count trace, mutation) | **PASS** (ADVISORY-3 residual teeth) |
| 4 | Cross-root edges (GraphWriter, S07, UNKNOWN, direction, 4 attacks, no FX-HR-H6 self-grade) | **PASS** |
| 5 | Arithmetic (depth-1 M=2 → 8 nodes, 12/42, DEPTH-01 table) | **PASS** |
| 6 | B3-B per root reuses PRO-01 shipped loop | **PASS** (ADVISORY-1 plan-sibling drift) |
| 7 | Dormant panel + mono-maker regression fix | **PASS** (ADVISORY-2 mono test teeth) |
| 8 | Mutation-argue load-bearing tests | **PARTIAL** (ADVISORY-3) |

---

### 1. The shape's honesty — ticket soul

**FAIL — BLOCKING-1**

#### Exact surface where a reader might learn one-served / two-authored

| Layer | Location | What it does |
|---|---|---|
| **Stamp (only disclosure)** | `apps/runner/src/index.ts:886` | `conditionMarks: Object.freeze(effectiveMakerCount === 2 ? ["UNCOVERED-SCOPE"] : [])` |
| **Serve set (mechanism, not disclosure)** | `apps/runner/src/index.ts:957–966`, `992`, `1007–1010`, `1105` | `runServeGateChain` receives **only** the primary `nodeId`; composer `availableNodes` is `[{ ref: "primary", nodeId, fact: judged.statement }]`; any non-`primary` node_ref throws `COMPOSITION_CONTRACT_ERROR`; terminal `servedNodeIds: [nodeId]` |
| **Fact bundle** | `apps/runner/src/index.ts:882–883` | `facts: [judged.statement]` — primary root text only; secondary root never enters the serve fact bundle |
| **UI label** | `apps/v2-ui/lib/v3/labels.ts:28` (also `web/lib/v3Presentation.ts:134`) | `case "UNCOVERED-SCOPE": return "Scope not fully covered"` |
| **Honesty drawer** | `apps/v2-ui/components/AnswerHonestyDrawer.tsx:124–153` | Renders condition-mark chips via `conditionMarkLabel(mark)` and optional `condition_mark_records` with `reason` / `subject_ref` |
| **Docs claim (not a runtime surface)** | `acceptance/README.md:69–71` | Claims `UNCOVERED-SCOPE` "say[s] plainly that the other root is graph-visible but not composed" — **aspirational prose; not what the UI string says** |

There is **no** dedicated serve-state field, no drawer sentence naming makers, and **no** `condition_mark_records` row minted for this stamp with a reason such as "secondary root graph-visible, not composed."

#### What the mark actually means in law

`docs/founding/requirements-spec.md` binds `UNCOVERED-SCOPE` to **Q27** — *"What part of the original question am I simply not covering?"* / "the split does not cover this part of the question" (spec table rows ~283, ~1484; DR-020 knob 8 coverage diagnostic). That is **question-coverage residual**, not **maker-serve asymmetry**.

Reusing that token for "we composed only OpenAI's root while Anthropic also authored a full root" **overloads** a stranger-facing vocabulary. A careful reader who knows Q27 will misread the mark as incomplete question coverage, not as "one house's answer."

#### Honesty judgment

| Packet bar | Met? |
|---|---|
| Reader learns the served answer is from **one** maker's root | **No** — chip says "Scope not fully covered" |
| Reader learns **which** maker's root was served | **No** — no maker name, no root id, no "primary only" phrase |
| Reader learns the **other** root was **not** composed | **No** — not stated; secondary root is only discoverable by inspecting the full graph node list and comparing to segment `assertedNodeRefs` |
| Surface is plain vs buried / silent | **Buried / silent** — DR-115 class at maximum consequence |

Worker claim ("honest fixed-primary serve disclosure") is therefore **false against the shipped stranger surface**. The graph is dual-authored; the answer presentation is not dual-honest.

#### Concrete failing cases

1. Open honesty drawer on a settled M=2 answer: chip text is **"Scope not fully covered"** — never "Served root: OpenAI; Anthropic root present in graph but not composed."
2. `GET /v1/runs/:id/answer` condition_marks may contain `UNCOVERED-SCOPE` but no structured record naming served vs unserved root (ceremony never asserts the mark at all — see §8).
3. Served segments' `assertedNodeRefs` resolve only to primary `nodeId` (`:1007–1010`) while the graph returns **8** nodes including a second depth-0 root (`acceptance/ceremony.test.ts:334–341`) — dual reality without dual disclosure.

---

### 2. Which root gets served, and who decided?

**FAIL — BLOCKING-2**

#### Which root

**Always the primary root** — the first authored position (`nodeId` from the main `#judge` call at `:503–551`), role `"primary"`, gateway `this.settings.providerRef` / `this.#judge`. In acceptance that is **OpenAI** (`ceremony.test.ts:367–368` lineage starts `"OpenAI", "Anthropic", ...`; first claim is the primary double's statement).

Secondary root is authored only when `effectiveMakerCount === 2` (`:716–730`) and **never** enters `runServeGateChain.nodes`.

#### Who / what decided

| Candidate | Shipped? |
|---|---|
| Alternating serve | **No** |
| Provenance-driven / register-ruled serve primary | **No** |
| Asker- or V-selected served maker | **No** |
| **Fixed constant: primary = main judge gateway** | **Yes** |

Decision rule is structural code:

```text
authoredNodes[0]  := primary judge root   // always served
authoredNodes[1]  := secondary root        // M=2 only; never served
runServeGateChain.nodes := [{ nodeId: authoredNodes[0] }]
```

`effectiveMakerCount` itself is `critiqueSettings !== undefined && criticJudge !== null ? 2 : 1` (`:456`) — configuration presence, not a serve-policy enum.

#### Is the choice recorded with provenance?

**No.** There is no ledger action, serve-policy receipt, or condition-mark record of the form "serve_primary_policy=fixed_index_0 / OpenAI." The only residue is implicit: which node id appears in composition `assertedNodeRefs` / `servedNodeIds: [nodeId]` (`:1105`). That is **recoverable by forensic DB read**, not a **recorded decision** a stranger honesty surface can show.

#### Model-balance reopening

Packet: *"A silent constant favouring one house is the model-balance question V dismissed — reopened by code. It must at minimum be visible and recorded."*

Shipped: **silent constant favouring the primary house (OpenAI in the live dual-maker stack).** Not visible. Not recorded. **Reopened.**

---

### 3. The M-guard

**PASS**

#### Typed, loud, names DR-159

`assertRatifiedMakerCount` (`apps/runner/src/index.ts:186–197`):

- Invalid / non-positive → `RUN_MAKER_COUNT_INVALID`
- `effectiveMakerCount > 2` → `RUN_MAKER_COUNT_EXCEEDS_RATIFIED_ENVELOPE` with message  
  `DR-159 ratified the run-cost envelope for M=2; received M=…`
- Constant `DR159_RATIFIED_MAKER_COUNT = 2` (`:184`)

Separate config alignment (`:457–462`):

- `run.agentCount !== effectiveMakerCount` → `RUN_MAKER_CONFIGURATION_MISMATCH`  
  (requested makers vs real configured maker gateways)

#### Trace `agent_count` ask → guard

1. **Ask body** — `agent_count` on contract (`packages/contract/src/index.ts:113` positive int).  
2. **API create run** — `agentCount: ask.agent_count` (`apps/api/src/index.ts:352`).  
3. **Persist** — `core.run.agent_count` insert (`packages/db/src/index.ts:135,145`).  
4. **Frozen head** — `readFrozenHead` selects `agent_count` → `agentCount` (`packages/db/src/index.ts:300–309`).  
5. **Guard before model work** — after claim + `readFrozenHead`, **before** `JUDGEMENT_SCHEDULED` / `#judge.judge` (`apps/runner/src/index.ts:452–463` then `:489+`).

Would it fire for M=3? Yes: `assertRatifiedMakerCount(3)` throws `RUN_MAKER_COUNT_EXCEEDS_RATIFIED_ENVELOPE` with DR-159 in the message. Unit pin: `tests/unit/pro01-runner-tree.test.ts:14–18`.

#### Mutation-argue its test

| Mutant | Unit test reaction |
|---|---|
| Delete `assertRatifiedMakerCount` body / always no-op | `pro01-runner-tree.test.ts` "guards DR-159…" **fails** (expects throw on 3) |
| Soft-cap silently clamp to 2 | Same test **fails** (must throw, not clamp) |
| Remove only runtime call, keep pure function | Pure unit still green; **no** integration test injects `agent_count: 3` through runner — residual **ADVISORY-3** |

Guard mechanism itself is sound and loud.

---

### 4. Cross-root edges

**PASS**

| Requirement | Evidence |
|---|---|
| Real GraphWriter edges | `authorPosition` → `writer.addEdge` (`:668–681`) for every planned edge |
| S07 vocabulary | `polarity: "support" \| "attack"`; attacks also set `kind: "rebutting"` (`:676–677`) |
| Honest UNKNOWN magnitude | `magnitudeStatus: "UNKNOWN"`, `strength: null` (`:678–679`); comment at `:769–771` |
| Direction | **Both directions**: `buildCrossRootExchangePlan(2)` → primary `0→1` and secondary `1→0` (`:289–292`, runtime loop `:772–797`). Justified in plan comment: each maker defends own root and attacks the other — not a silent one-way bias |
| 4 attack edges among 8 nodes at depth-1 M=2 | Tree: 2 attack children (one per root) + cross-root: 2 attack edges = **4**. Ceremony `assertFairDebate` → `attackEdgeCount: 4`, `nodeCount: 8` (`ceremony.test.ts:420–425`); edges length 8 (4 tree + 4 cross-root support/attack) |
| No FX-HR-H6 self-grading | Cross-root uses same Judge organ on **each maker's own gateway** (`selectedMaker` by role `:604–606`); makers author responses, they do not grade another maker's artifact via `runJudgePanel`. Dormant panel still carries FX-HR-H6 reject on producer-grading (`packages/judgement/src/s04.ts:232–234`) and is not wired into the runner |

---

### 5. Arithmetic

**PASS**

#### Node count (depth-1, M=2, B3-B + cross-root)

| Layer | Count |
|---|---:|
| Independently authored roots | 2 |
| B3-B round 1: each root → support + attack child | 2 × 2 = 4 |
| Ordered cross-root responses (one per maker) | 2 |
| **Total nodes** | **8** |

Pure plan legs at depth 1 M=2 (`buildMultiMakerExpansionPlan(1,2)` — unit test `:22–27`): four legs, children indices 2..5 under roots 0 and 1. Plus two cross-root pushes → 8 authored nodes.

#### Calls vs 42 ceiling

Live proof (handoff inventory, orchestrator-accepted): **12 / 42** model calls. Plausible first-try decomposition consistent with shipped organs:

- 8 × JUDGE (one per authored node)  
- 1 × COMPOSER  
- 2 × CONFORMANCE (two-segment B2-A cap)  
- (+ residual call site / handshake accounting to reach the pasted **12**)

All under DR-159 depth-1 retry-tolerant ceiling **42** (`DEPTH-01-envelope-proposal.md` B3-B+B2-A retry table depth 1 → 42).

#### DEPTH-01 M=2 table reconciliation

DEPTH-01 first-try B3-B+B2-A at depth 1 listed **14** *before* cross-root exchange was counted as a funded leg. PANEL adds two cross-root authoring calls and two extra nodes. Observed **12** first-try success on the healthy path is **below** both the old 14 sketch and the **42** retry-tolerant pin — envelope not violated. Node topology **8** is the declared PANEL design (2 roots × (1 + 2 children) + 2 cross-root), not the mono PRO-01 `2^(d+1)−1` formula alone.

Ceremony locks the settled shape: 8 nodes, 8 edges, 4 attacks, 6 named expansion/cross-root call sites (`ceremony.test.ts:334–417`).

---

### 6. B3-B expansion per root reuses PRO-01's shipped loop

**PASS** (with ADVISORY-1)

| Piece | Shared with PRO-01? |
|---|---|
| Depth pin | **Yes** — `resolveExpansionDepth(envelopeBasis.derivedFrom.depthParams)` (`:454`) |
| Authoring organ | **Yes** — same `authorPosition` → `Judge.judge` + `GraphWriter.addNode/addEdge` + restatement + `recordReduced` |
| BFS plan pure function | **Sibling, not call-through** — production M=2 uses `buildMultiMakerExpansionPlan` (`:256–283`, `:735–736`); original `buildDebateExpansionPlan` (`:235–253`) remains exported/unit-tested but is **not** invoked from the runner path |

Execution is one loop body over a multi-root plan — not a second copy of the Judge/write path. The **plan** pure function is a parallel implementation that **can** drift from `buildDebateExpansionPlan` (e.g. polarity counts, round authorship). **ADVISORY-1**, not blocking: packet's "not a second copy that can drift" is met for the expensive runtime path; residual drift risk is on the pure planner only.

Mono-maker path intentionally uses `[]` instead of either plan (`:735–737`) — see §7.

---

### 7. Dormant panel surfaces + mono-maker regression

**PASS** (with ADVISORY-2)

#### Dormant `runJudgePanel`

- Implementation remains pure bulkhead in `packages/judgement/src/s04.ts:224+`.  
- Runner imports Judge / reduce / select — **does not** import or call `runJudgePanel`.  
- Orphan-audit rows **unchanged**:  
  - `tools/orphan-audit/src/index.ts:605` neverCalled reason: *"production shell is honestly single-judge until panel routing is composed"*  
  - `:635` s04Surface: *"pure P15 bulkhead only; production runner is honestly single-judge"*  
  - Scaffold still expects UNATTACHED (`tests/architecture/scaffold.test.ts:99,113`)  
- PANEL authorship is multi-**maker roots**, not multi-**member grading panel** — matches DR-154(2).

#### Mono-maker regression fix

**What it was:** first integration of multi-maker expansion accidentally expanded **one-maker** runs (suite: 8 runner integration failures). Fix: gate expansion + secondary root + cross-root to **`effectiveMakerCount === 2` only** (`:716`, `:735–737`); M=1 keeps prior one-root / no-expansion behavior (handoff claim; code matches).

**Is it tested?**

- Implicitly: mono-maker integration paths that expect a single node still pass in the orchestrator 456 suite (not re-run here).  
- **No** focused unit test of the form "when M=1, runtime expansion legs are empty / node count stays 1."  
- `buildMultiMakerExpansionPlan(depth, 1)` would still emit legs if called — the guard is the runtime ternary, not the pure function.  
→ **ADVISORY-2**: name a regression test on the runtime gate so re-enabling M=1 expansion is deliberate.

---

### 8. Mutation-argue the load-bearing tests

**PARTIAL — ADVISORY-3**

| Mutant | Would current tests fail? |
|---|---|
| **Second root silently vanished** (no secondary author, no cross-root) | **Yes** — ceremony expects 8 nodes, dual makers `["OpenAI","Anthropic",…]`, call sites including `JUDGE:cross-root:0->1` / `1->0`, `assertFairDebate` `distinctMakers` length 2 and 4 attacks (`ceremony.test.ts:334–425`). Pure plan unit expects 4 multi-maker legs + 2 exchange legs. |
| **Serve quietly took both roots** into composition | **Weak / mostly no** — no ceremony assert that `condition_marks` contains `UNCOVERED-SCOPE`; no assert that serve `nodes.length === 1` or that segment refs exclude secondary. Composer code **would** reject non-`primary` refs if the double tried dual refs, but a mutated runner that passed two primary-labeled nodes or expanded `availableNodes` without updating tests could green. **Honesty mutant is unfanged.** |
| **M-guard deleted** | **Yes** for pure unit (`assertRatifiedMakerCount(3)`). **No** end-to-end runner test with `agent_count: 3`. |

Load-bearing graph topology is well fanged. **Serve honesty and dual-serve regression are not** — which is consistent with BLOCKING-1/2: the shape the tests defend is "two roots in the graph," not "reader told one root was served."

---

## BLOCKING findings

### BLOCKING-1 — Honesty surface buried / wrong vocabulary (DR-115)

**Where:** `apps/runner/src/index.ts:886`; `apps/v2-ui/lib/v3/labels.ts:28`; absence of `condition_mark_records` / serve-policy disclosure.

**Defect:** M=2 serve stamps only `UNCOVERED-SCOPE` ("Scope not fully covered"), a Q27 coverage mark. Reader never learns which maker's root was served or that the other was excluded from composition.

**Failing case:** Settled dual-maker answer → honesty drawer chip "Scope not fully covered" while segments assert only primary `nodeId` and graph holds a full secondary root + tree.

**Required direction (for rework, not implemented here):** A stranger-plain disclosure that names (a) served maker/root, (b) unserved maker/root still graph-visible, (c) B2-A one-root serve policy — either a dedicated mark/record with reason text or an honest reuse that does not collide with Q27's meaning. Tests must fail if the mark/record disappears or if serve composes both roots without disclosure.

### BLOCKING-2 — Silent fixed primary serve without provenance

**Where:** `apps/runner/src/index.ts:503–551` (primary root), `:957–966` / `:992` / `:1105` (serve set); no ledger/serve-policy provenance of the choice.

**Defect:** Serve primary is a code constant (main judge / OpenAI in acceptance). Not alternating, not recorded, not visible. Reopens model-balance by implementation.

**Failing case:** Any M=2 run always composes OpenAI (or whichever gateway is wired as primary) with no receipt a stranger or auditor can read as "why this house."

**Required direction:** Record the serve-primary decision (policy id + chosen maker/root id) on the answer or condition-mark records, and surface it. If V still wants fixed-primary, the **ruling must be visible in product**, not only in ticket prose.

---

## ADVISORY findings

### ADVISORY-1 — Dual pure expansion planners

`buildDebateExpansionPlan` and `buildMultiMakerExpansionPlan` can drift. Prefer one planner parameterized by root count, or a pure equivalence test (M=1 multi-maker plan ≡ legacy plan).

### ADVISORY-2 — Mono-maker no-expansion gate lacks a focused test

Add a unit/integration assert that M=1 yields a single root and zero expansion/cross-root call sites so the regression fix cannot silently reappear.

### ADVISORY-3 — Mutation holes on serve honesty and M=3 runtime

Ceremony should assert `UNCOVERED-SCOPE` (or its successor mark) and serve-set cardinality 1 when M=2. Consider one runner-level test that `agent_count: 3` fails typed before any MODEL_CALL ledger row.

---

## What is solid (for the rework baseline)

- Two real maker roots with independent Judge gateways and lineage.  
- Per-root B3-B children via shared `authorPosition` machinery.  
- Cross-root both ways, UNKNOWN magnitude, four attacks, eight nodes.  
- M-guard typed with DR-159 naming; `agent_count` frozen on run head.  
- `runJudgePanel` / orphan-audit rows untouched; FX-HR-H6 not reintroduced as self-grading.  
- Depth-1 proof budget 12 ≤ 42; ceremony shape locks 8/4/lineage.

None of that substitutes for honest one-served / two-authored disclosure or a recorded serve-primary choice.

---

## Packet checklist (summary)

| # | Topic | Judgment |
|---|---|---|
| 1 | Honesty of one-served / two-authored | **CHANGES REQUESTED** · BLOCKING-1 |
| 2 | Serve-root selection + provenance | **CHANGES REQUESTED** · BLOCKING-2 |
| 3 | M-guard | **PASS** |
| 4 | Cross-root edges | **PASS** |
| 5 | Arithmetic | **PASS** |
| 6 | B3-B reuses PRO-01 loop | **PASS** · ADVISORY-1 |
| 7 | Dormant panel + mono-maker fix | **PASS** · ADVISORY-2 |
| 8 | Mutation-argue tests | **PARTIAL** · ADVISORY-3 |

**Dual-diamond Grok lens: CHANGES REQUESTED.**
