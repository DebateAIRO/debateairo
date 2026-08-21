# PRO-01 dual-diamond review — Grok lens (rev1)

**Ticket:** `t_19834503` · **Board:** `debateai-v3`  
**Reviewer:** Grok (independent read-only dual-diamond lens; DR-153)  
**Date:** 2026-08-12  
**Review packet:** `docs/missions/2026-08-06-v3-programming/reviews/PRO-01-review-packet.md`  
**Law:** `docs/missions/2026-08-06-v3-programming/decisions-ledger.md` · **DR-149**, **DR-153**, **DR-157**, **DR-159**  
**Worker handoff (evidence only):** `docs/missions/2026-08-06-v3-programming/handoffs/PRO-01-codex-handoff.md`  
**Progress log:** `docs/missions/2026-08-06-v3-programming/handoffs/PRO-01-progress.log`  
**Mode:** read-only. Product / acceptance / ledger sources not edited. Did not read any peer (Opus) PRO-01 verdict. Orchestrator gates cited as already green (root `tsc` · v2-ui `tsc` · root vitest **63/449** · acceptance **9/35** · architecture 27/0 · source 0 blocking) — **not re-run**. Standing API on `:8790` was **not** fetched for the depth-2 answer (packet: proof is pasted; standing DB holds only the ceremony debate).

## Verdict

**APPROVED**

Nothing found **BLOCKING**. Expansion arithmetic is B3-B exact (`2^(d+1)−1` for d∈1..5). Depth is taken from the run’s ask-time pin carried on the cost-envelope basis (`derived_from.depth_params`), not an env default or hardcode. PRO/CON children are real GraphWriter nodes with honest S07 edges (`support` / `attack`+`rebutting`, `magnitudeStatus: "UNKNOWN"`). Defender/critic call sites are distinct and maker-alternated by level; no maker grades another maker’s artifact. Mid-expansion envelope hit throws typed `RUN_COST_ENVELOPE_EXHAUSTED` on the shipped budget-aware gateway before transport — no path silently truncates the tree and still returns a complete terminal. The ENV-01 memory-disclosure segment is partitioned out of the conformance set. Serve remains one primary root (B2-A). Depth-2 pasted proof is internally consistent (7 nodes, 3 attack edges, real maker lineage, 11 calls ≤ 66; no depth-3 burn). Residual notes are **ADVISORY** only (mutation teeth on pure plan + ceremony d=1 + gateway exhaustion; production mono `main.ts` still omits critique).

---

## Packet checklist

| # | Topic | Judgment | Evidence |
|---|---|---|---|
| 1 | Expansion real + B3-B + depth from run ask pin | **PASS** | Plan: `buildDebateExpansionPlan` → 3/7/15/31/63; runtime depth: `resolveExpansionDepth(envelopeBasis.derivedFrom.depthParams)` at `apps/runner/src/index.ts:389` |
| 2 | PRO edges real (GraphWriter, UNKNOWN, S07, restatement, reduced, lineage) | **PASS** | `addNode` + `addEdge` + `addStrangerRestatement` + `recordReduced` per child; `polarity`/`magnitudeStatus: "UNKNOWN"` at `:606–618` |
| 3 | Defender independence / FX-HR-H6; maker alternation justified + lineage | **PASS** | Level-alternating `secondary`/`primary` plan; distinct `JUDGE:defender|critic:r*:p*` call sites; ceremony lineage OpenAI then Anthropic×2 |
| 4 | Envelope exhaustion LOUD typed stop | **PASS** | Gateway `assertModelAttemptAllowed` → `RUN_COST_ENVELOPE_EXHAUSTED` (`packages/budget/src/index.ts:265–271`); expansion loop has no soft-complete catch |
| 5 | Memory-segment trap (ENV-01 ADV-1) | **PASS** | Composer `.max(2)`; `partitionServedSegments` keeps memory out of conformance; reserved id refused if composer emits it |
| 6 | Serve set B2-A (ONE primary root) | **PASS** | `runServeGateChain({ nodes: [{ nodeId /* primary only */ }] })` `:811–819`; terminal `servedNodeIds: [nodeId]` `:959` |
| 7 | Depth-2 pasted evidence internal consistency | **PASS** | 7 nodes · 3 attack · OpenAI/Anthropic/OpenAI lineage · 11 calls · no depth-3 claim |
| 8 | Named defect class has test teeth | **PASS** (with ADVISORY-1) | Pure plan fails wrong counts; ceremony fails &lt;3 nodes / wrong edges; gateway fails silent non-exhaustion; runtime d&gt;1 count is live proof + pure plan, not a permanent CI runner integration |

---

## 1. Expansion arithmetic B3-B + depth source

### Law

**DR-159 B3-B:** depth counts **expansion rounds**. Depth `d` → `2^(d+1)−1` authored nodes: **3 / 7 / 15 / 31 / 63** for d = 1..5.  
**DR-157:** depth was inert before this ticket; PRO-01 must make `depth_params.depth` govern expansion.

### Pure plan (`apps/runner/src/index.ts:210–228`)

```text
frontier = [0]  // root position
for round in 1..d:
  for each parent in frontier:
    emit support child + attack child
  frontier := those children
```

Independent recompute of shipped `buildDebateExpansionPlan` (driven as the real export, not reimplemented):

| d | plan legs | authored nodes `1+legs` | `2^(d+1)−1` | support/attack per round |
|---:|---:|---:|---:|---|
| 1 | 2 | **3** | 3 | r1: 1/1 |
| 2 | 6 | **7** | 7 | r1: 1/1 · r2: 2/2 |
| 3 | 14 | **15** | 15 | … 4/4 in r3 |
| 4 | 30 | **31** | 31 | … 8/8 in r4 |
| 5 | 62 | **63** | 63 | … 16/16 in r5 |

**Exact match.** Off-by-one would be 2^d−1 (authored-level convention V rejected) or 2^(d+1) (fencepost); neither is shipped.

Unit pin (`tests/unit/pro01-runner-tree.test.ts:11–27`): `it.each` on `[1,3]…[5,63]` asserts `1 + plan.length === expectedNodes` and per-round support/attack counts `2^(round-1)`.

### Depth source chain (ask → pin → expand)

1. **Ask:** `depth_params` on the ask (`apps/api/src/index.ts:290–291`, `333`).  
2. **Envelope member resolve:** `resolveRunCostEnvelopeBasis(policy, { depthParams: ask.depth_params, riskTier })` stores `derived_from.depth_params` as a frozen copy of the ask’s params (`packages/register/src/index.ts:253–276`) and selects the DR-159 ceiling (42/66/114/210/402).  
3. **Run head:** `envelope_basis` persisted on `core.run`; runner reads frozen head (`packages/db/src/index.ts:298–309`).  
4. **Expansion:**  
   `const expansionDepth = resolveExpansionDepth(envelopeBasis.derivedFrom.depthParams)`  
   (`apps/runner/src/index.ts:388–389`).

`resolveExpansionDepth` (`:193–201`) requires integer depth ∈ [1,5] else typed `RUN_DEPTH_PARAMS_INVALID`. No env var. No hardcode.

**Note (not a defect):** the runner does not re-read the `core.run.depth_params` column (that column is not on `readFrozenHead`). It reads the **same ask snapshot** frozen into the envelope pin. That is the correct dual use of the dial: ceiling member and expansion depth share one ask-time fingerprint. Divergence would be a DB integrity bug, not a PRO-01 wiring choice.

### Runtime loop

```text
for (const leg of buildDebateExpansionPlan(expansionDepth)) { … }  // :523
```

Gated on critique settings being present (`:522`) — same multi-maker precondition as FAIR-01’s critic leg. With critique configured (acceptance path), every plan leg is executed; there is no early break that truncates rounds while still completing.

**Judgment: PASS.** Sharp check (1) holds.

---

## 2. PRO edges real (DR-149 / S07 / DR-115)

Per expansion leg (`apps/runner/src/index.ts:558–649`):

| Obligation | Shipped |
|---|---|
| Own Judge artifact | `selectedMaker.judge.judge({ callSiteKey: \`JUDGE:${role}:r${round}:p${parent}\` })` |
| Own stranger restatement | `writer.addStrangerRestatement({ nodeId, text, checkStatus })` |
| Own reduced judgement | `reduceAssessment` → `selectReducedJudgement` → `recordReduced` bound to **child** `nodeId` |
| Real graph child | `writer.addNode({ parentNodeId: parent.nodeId, childKind: support\|defeater, … provenanceRef: childJudged.provenanceRef })` |
| Real edge | `writer.addEdge({ polarity: leg.polarity, kind: attack→"rebutting" else null, strength: null, magnitudeStatus: "UNKNOWN", strengthSource: "EVIDENCE_VERIFIER", provenanceRef: child })` `:606–618` |

**UNKNOWN honesty:** magnitudes stay unjudged until an evidence verifier measures them — inherited FAIR-01/S07 honesty, not fabricated scores (handoff acknowledges; code matches).

**Propagation pair honesty** (`packages/propagation/src/index.ts:573–577`): when a strict-and rival is withheld by UNKNOWN support, **both** `rivalOperator` and `rivalStrength` are null together — no half-recorded rival.

**UI:** `tests/unit/v2ui-data-layer.test.ts:130–155` projects a real `support` edge as PRO while the position stays neutral **CLAIM** (DR-149: question/position not relabelled PRO).

**Ceremony depth-1** (`acceptance/ceremony.test.ts:350–368`): 3 nodes, 2 edges, relations `support` + `attack`, claims distinct, `placeholder: true` on edges (UNKNOWN surface).

**Judgment: PASS.** No fabricated PRO.

---

## 3. Defender independence (FX-HR-H6) and maker alternation

### What FX-HR-H6 forbids

`packages/judgement/src/s04.ts` panel path: a panel member may not grade an artifact it produced (`PRODUCER_GRADING_FORBIDDEN` / FX-HR-H6). PRO-01 does **not** open `runJudgePanel` for expansion; each child is a **single-organ Judge authorship** of a new statement (support or counter), same pattern as FAIR-01’s critic leg.

Independence obligations that apply:

1. **No self-grading of another maker’s artifact** — satisfied: each call authors its own child position; it does not re-score the parent’s reduced judgement.  
2. **Genuine second maker** — `#criticJudge = new Judge(settings.critique.provider)` (`:286–288`); primary vs secondary gateways.  
3. **Alternation justified and recorded.**

### Alternation plan (`buildDebateExpansionPlan`)

- Round odd → `author: "secondary"` (configured critic gateway)  
- Round even → `author: "primary"`  
- Root is always primary.

Depth-2 exact pin (`pro01-runner-tree.test.ts:29–39`):

```text
r1 p0 support/attack → secondary
r2 p1,p2 support/attack → primary
```

Runtime selects gateway from `leg.author` (`:528–530`). Call sites name role + round + parent (`:561`).

### Ceremony / live lineage

| Evidence | Lineage |
|---|---|
| Ceremony d=1 makers | `["OpenAI", "Anthropic", "Anthropic"]` (`ceremony.test.ts:381`) |
| Ceremony call sites | `JUDGE:critic:r1:p0`, `JUDGE:defender:r1:p0` (`:422–425`) |
| Depth-2 pasted | root OpenAI · d1 Anthropic×2 · d2 OpenAI×4 |
| Strength lineage | each strength `source_ref` = that node’s own `provenance_ref` (`ceremony.test.ts:385–397`) |

Handoff justification matches the code: alternate configured makers by level so every edge crosses makers; recorded artifacts carry the gateway’s honest maker/model (DR-115).

**Judgment: PASS.**

---

## 4. Envelope honesty under exhaustion (sharp check 2)

### Law

Ratified ceilings 42/66/114/210/402; **LOUD typed stop** on exhaustion; never silent truncation + complete terminal.

### Mechanism

1. Every production/acceptance model call goes through `createPostgresProviderGateway` (`apps/runner/src/index.ts:1083–1113`).  
2. Before transport: `budget.assertModelAttemptAllowed(runId)` (`:1097`).  
3. Count = all `MODEL_CALL` ledger rows for the run (`packages/budget/src/index.ts:246–253`); compare to pinned `maxModelAttempts`.  
4. On exhaustion: throw `TypedDomainError("RUN_COST_ENVELOPE_EXHAUSTED", …)` (`:268–270`).

### Expansion path

The expansion loop (`:523–650`) has **no** catch that swallows this error and continues. An exhausted defender/critic call **throws out of `execute`**. Acceptance dispatcher records terminal failure (`acceptance/main.ts:87–88`) — not a settled complete answer with a short tree.

Serve-time path is different and already FAIR/ENV law: after expansion, `evaluateRunPressure` can HARD_STOP into `makeEnvelopeTerminal` with condition mark reason `RUN_COST_ENVELOPE_EXHAUSTED` (`:787–802`, catch at `:927–931`). That is a typed exhausted **answer**, not a silent “complete tree of wrong size.”

### Test teeth

`tests/unit/pro01-runner-tree.test.ts:71–102`:

- Pins envelope `max_model_attempts: 2` with `derived_from.depth_params: { depth: 2 }`.  
- Stubs attempt count already at 2.  
- Calls real `createPostgresProviderGateway(...).call({ callSiteKey: "JUDGE:defender:r2:p1", … })`.  
- Expects reject matching `{ code: "RUN_COST_ENVELOPE_EXHAUSTED" }`.  
- Transport endpoint is `127.0.0.1:1` — if the assert were skipped, the call would not cleanly produce that typed code before network failure.

**Mutation:** remove `assertModelAttemptAllowed` → this test fails.  
**Mutation:** expand half the plan then `return COMPLETED` on error → not covered by this unit test alone (see ADVISORY-1), but no such catch exists in the shipped loop.

**Judgment: PASS.** Sharp check (2) holds — stop is loud and typed; no silent complete truncation path found.

---

## 5. Memory-segment trap (ENV-01 ADV-1)

**Trap:** post-validation `memory:disclosure` as a third segment would make S=3 under `strangerSampleRate >= 1` and blow the depth-1 serve reservation.

**What shipped:**

1. Composer schema remains ENV-01 capped: `.max(2, "Composer output exceeds DR-159's ratified two-segment serve cap")` (`apps/runner/src/index.ts:73`).  
2. Composer may not emit the reserved id: throw `COMPOSITION_CONTRACT_ERROR` if `segment_id === "memory:disclosure"` (`:853–855`).  
3. After compose, `partitionServedSegments(composed, renderedMemory)` (`:235–256`, use at `:871–875`):  
   - **conformanceSegments** = composer segments only (≤2) → fed to `runServeGateChain` / stranger sampling.  
   - **persistedSegments** = conformance + optional typed `memory:disclosure` (loadBearing false, empty refs) for honest persistence.

Unit pin (`pro01-runner-tree.test.ts:55–68`): conformance length stays 2; persisted length 3 with `segmentId: "memory:disclosure"`.

**Not** left to surface as confusing exhaustion. Honest partition.

**Judgment: PASS.**

---

## 6. Serve set unchanged (B2-A)

```text
runServeGateChain({ nodes: [{ nodeId, … primary only … }], … })   // :811–819
servedNodeIds: Object.freeze([nodeId])                            // :959
```

Expansion nodes are judged, written, propagated, and exposed on the answer graph; they are **not** individually served. Composer user packet still lists `availableNodes: [{ ref: "primary", nodeId, … }]` only (`:846`).

PANEL-01 expanded serve set is correctly out of ticket.

**Judgment: PASS.**

---

## 7. Depth-2 pasted evidence (internal consistency only)

Packet orders: judge pasted evidence; do **not** fetch from standing `:8790`.

| Claim | Check |
|---|---|
| Run / answer ids | `9e39a95d-5ca9-4d50-92fd-e0cc616cfeb6` / `13730d8a-d211-4e79-8e88-2c7007bdc32d` |
| Node count | **7** = B3-B d=2 |
| Attack edges | **3** = 1 (r1) + 2 (r2); plan also implies **3** support edges (6 total legs) |
| Makers | Anthropic + OpenAI; independent attack edges: 3 |
| Per-node lineage | d0 primary OpenAI `gpt-5.6-sol` · d1 secondary Anthropic `claude-opus-5` ×2 · d2 primary OpenAI ×4 — matches plan authors |
| Model calls | **11** disclosed (incl. Claude handshake); ceiling d=2 = **66**; healthy ~22 estimate is not a floor |
| Depth-3 | Handoff + progress log: **no depth-3 run**; pure tests cover 15-node shape only |
| DB disposition | Isolated temp DB removed after capture; standing DB untouched |

Proof driver: `acceptance/pro01-depth2-proof.ts` passes `--depth-params '{"depth":2}'` through the real `runAcceptanceCeremony` path.

**Judgment: PASS** (internal consistency; not re-fetched).

---

## 8. Named defect class — mutation argument

| Defect | Would shipped tests fail? | Where |
|---|---|---|
| Plan stops after round 1 for all d | **YES** | `pro01-runner-tree.test.ts` length 3/7/15/31/63 + per-round counts |
| Plan uses authored-level `2^d−1` | **YES** | same `it.each` expects 3 at d=1 (authored-level would want 1) |
| Invalid depth 0/6/missing accepted | **YES** | `resolveExpansionDepth` throws `RUN_DEPTH_PARAMS_INVALID` |
| Edges mislabeled (support↔attack) | **YES** at d=1 ceremony | expects concrete `relation: "support"` / `"attack"` |
| Position relabelled PRO | **YES** | v2ui test: position stays CLAIM, support child PRO |
| Strength lineage stamps parent onto child | **YES** | ceremony strength `source_ref === provenance_ref` per node |
| Gateway allows over-ceiling call | **YES** | exhaustion test expects `RUN_COST_ENVELOPE_EXHAUSTED` |
| Memory segment enters conformance set | **YES** | partition test: conformance stays 2 |
| Runtime hardcodes `expansionDepth = 1` while plan is correct | **Weak CI** | pure plan + d=1 ceremony still green; live d=2 proof would fail (not a permanent suite assert on runner.execute) |
| Runtime `break` after first round inside the for-loop | **Weak CI** | same as above |

Load-bearing pure arithmetic and d=1 runtime shape have real teeth. Full multi-round **runtime** execution is proven by the authorized live depth-2 receipt plus the structural for-loop over the pure plan — see ADVISORY-1.

**Judgment: PASS** for the named classes the packet prioritizes (counts, edges, loud exhaustion); residual gap is advisory.

---

## ADVISORY (non-blocking)

### ADVISORY-1 — Exhaustion + multi-round runtime teeth are gateway / pure-plan heavy

The loud-exhaustion unit test drives `createPostgresProviderGateway` + `BudgetRepository.assertModelAttemptAllowed`, not a full `WalkingSkeletonRunner.execute` that fails mid-tree with N partial nodes. Structurally the expansion loop does not catch-and-complete; a permanent runner-level integration test that forces ceiling mid-round-2 and asserts **no** `DONE` + no complete serve would harden this further. Not BLOCKING: typed throw is on the real call path every expansion leg uses.

Similarly, automated CI does not re-assert “depth=2 → 7 nodes” via embedded PostgreSQL (only pure plan + one-shot live proof). Depth-1 ceremony is the permanent multi-node runtime pin. Acceptable for this ticket given the ordered single depth-2 burn and pure B3-B suite.

### ADVISORY-2 — Production `apps/runner/src/main.ts` still boots without `critique`

Hatchet skeleton main constructs `WalkingSkeletonRunner` with a single provider and **no** `critique` settings. Expansion is therefore gated off (`:522`) on that entry point — depth is resolved but the pro/con loop does not run (mono-model law, DR-137). Acceptance/`createAcceptanceRuntime` **does** wire the second maker (`acceptance/main.ts:233–236`). This is the pre-existing FAIR-01 dual-path shape, not a silent PRO-01 no-op on the path that claims multi-maker debates. Future production dual-maker boot remains a wiring concern outside this ticket’s acceptance proof surface.

### ADVISORY-3 — Test title vs body for depth source

`pro01-runner-tree.test.ts:42` is titled “reads the ruled depth from the pinned envelope basis” but only calls pure `resolveExpansionDepth({ depth: 3 })`. The actual runner wiring at `:388–389` is structural review evidence, not a unit assertion that `execute` reads `envelopeBasis.derivedFrom.depthParams`. Non-blocking given the one-line call site and ask→pin chain reviewed above.

### ADVISORY-4 — POL-01 `onAuthRejected` trap

No auth-action / `onAuthRejected` wiring was introduced under the runner inventory; grep of PRO-01 touch surface does not attach that socket. Trap not invoked. Out of further scope.

---

## Cross-check: two sharp packet checks

| # | Check | Result |
|---|---|---|
| (1) | Expansion arithmetic B3-B exactly; depth from run’s persisted ask-time `depth_params` (via envelope pin) | **HOLD** — formula exact; source is ask pin on envelope basis, not env/hardcode |
| (2) | Exhaustion stops LOUDLY typed; never silent truncate + complete | **HOLD** — `RUN_COST_ENVELOPE_EXHAUSTED` on gateway before transport; expansion has no complete-on-error path |

---

## What was not done (by charter)

- Did not re-run orchestrator full gates (tsc / 449 / 35 / architecture).  
- Did not fetch depth-2 answer from standing `:8790`.  
- Did not implement fixes or edit product/acceptance code.  
- Did not read or align with a peer Opus PRO-01 verdict.  
- Did not authorize or run a depth-3 live proof.  
- Did not expand into PANEL-01 serve-set questions.

---

## Final

**APPROVED** — Grok lens, rev1. Both sharp checks hold. Engine-of-record expansion is real B3-B with honest edges, independent makers, loud envelope stop, memory partition, and B2-A serve.
