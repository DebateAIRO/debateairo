# GROK-01 dual-diamond review — Grok lens (rev1)

**Ticket:** `t_43b4c17b` · GROK-01 (third maker / DR-177)  
**Reviewer:** Grok (independent read-only dual-diamond lens; maker-panel house under review)  
**Date:** 2026-08-14  
**Goal packet:** `docs/missions/2026-08-06-v3-programming/goal-packets/GROK-01-codex-goal.md`  
**Handoff (inventory pointer only):** `docs/missions/2026-08-06-v3-programming/handoffs/GROK-01-codex-handoff.md`  
**Delta base:** parent git root `/Users/vladmihaimiron/Documents/DebateAIRO` @ `05820b8`  
**Mode:** production-path causality; real tree read-only; no stack control; no paid model calls; no peer-lens read.  
**Deliverable:** this file only.

## Verdict summary

Nothing found **BLOCKING** on the five gating axes. Relay honesty matches the claude-relay pattern; N-generic planner/selection/disclosure pins are causal under DR-163 clone mutation; reviewer rotation is persisted last-reviewer state with M=2 sole-eligible fallback; M=3 ceilings remain proposal-only (handoff + pure derivation test); M-guard still refuses `agent_count` 3 before model calls; focused suites and F1 theatre grep are clean.

---

## Decision table (five gating axes)

| # | Axis | Judgment | One-line evidence |
|---|---|---|---|
| 1 | Relay honesty (claude-relay pattern) | **PASS** | Handshake before serve; dead CLI refuses boot; maker `xAI`; model id from CLI parse only |
| 2 | N-generic pins real (DR-163 clone) | **PASS** | Third-member seed strip → M=2 byte-stable + roster pins red for missing xAI; pair-hardcode exchange → scales pin red |
| 3 | Reviewer rotation (persisted, no RNG) | **PASS** | `readLatestReviewerMaker` → `selectDifferentMakerReviewer(..., latest)`; no `Math.random` |
| 4 | M=3 discipline (proposal only; guard refuses 3) | **PASS** | Register stays 60/108/204/396/780; `DR159_RATIFIED_MAKER_COUNT=2`; integration refuse-3 green |
| 5 | F1 sweep on new/changed tests | **PASS** | Acceptance 41/41; unit pins 15/15; no theatre patterns |

---

## Delta inventory (vs `05820b8`)

Tracked modifications (14 files, +326/−152):  
`acceptance/{README,ceremony.test,dual-maker-proof,main,run-acceptance,runtime-policy,runtime-policy.test,seed-register,seed-register.test}.ts|md`, `apps/runner/src/index.ts`, `packages/judgement/src/index.ts`, `tests/{integration/database,unit/pro01-runner-tree,unit/xrev01-node-review}.test.ts`.

Untracked GROK-01 product surfaces:  
`acceptance/grok-relay.ts`, `acceptance/grok-relay.test.ts`, `acceptance/grok01-envelope-derivation.ts`, `acceptance/grok01-envelope-derivation.test.ts`, `acceptance/test-fixtures/fake-grok-cli.mjs`.

Mission artifacts (not judged as product): goal packet + handoff (+ progress log).

Scratch captures: `{SCRATCH}/grok01-delta-stat.txt` and the axis logs named below.

---

## 1. Relay honesty — PASS

### Pattern parity with `claude-relay.ts`

| Property | Claude reference | Grok shipped |
|---|---|---|
| Shared core | `relay-core.js` | same import surface |
| Startup handshake before HTTP serve | `startClaudeRelay` → `invokeCli` then `startCliRelayServer` (`acceptance/claude-relay.ts:106–125`) | `startGrokRelay` → `invokeCli` then `startCliRelayServer` (`acceptance/grok-relay.ts:78–97`) |
| Dead/unauth CLI refuses boot | nonzero exit / `is_error` → `CLAUDE_CLI_FAILED` | same via adapter `failureCode: "GROK_CLI_FAILED"` (`acceptance/grok-relay.ts:50–53`, parse `is_error` at `:34`) |
| Maker lineage constant | `ANTHROPIC_MAKER = "Anthropic"` | `XAI_MAKER = "xAI"` (`acceptance/grok-relay.ts:13`) — **not** OpenAI/Anthropic |
| Model id | keys of CLI `modelUsage` only | `model` / `model_id` / single `modelUsage` key; zero or multi → `GROK_CLI_MODEL_UNRESOLVED` (`acceptance/grok-relay.ts:37–46`) — **no fabricated default** |
| Test-only process seam | `TEST_ONLY_CLAUDE_COMMAND_FORBIDDEN` | `TEST_ONLY_GROK_COMMAND_FORBIDDEN` (`acceptance/grok-relay.ts:79–83`) |
| OpenAI-compatible body | `relay-core` `maker: options.adapter.maker`, `model: completion.model` (`acceptance/relay-core.ts:159–165`) | same path |

Handshake prompt is mandatory and runs **before** the server is returned (`acceptance/grok-relay.ts:84–97`). A failing CLI never reaches `startCliRelayServer`.

### Ceremony / runtime wiring (production acceptance path)

- Ceremony env requires operator port `ACCEPTANCE_GROK_RELAY_PORT` (`acceptance/main.ts:39`; test pin `acceptance/runtime-policy.test.ts:95–109`) — **no invented numeric port in product**.
- `run-acceptance.ts:169–191` boots Claude + Grok in parallel, passes CLI-reported models into `makerRelays` keyed by `acceptance:claude-cli` / `acceptance:grok-cli`.
- Runtime maps relays by `providerRef` and stamps gateway `maker` from the **register provider row**, not from a free string (`acceptance/main.ts:176–189`).
- Third provider seeded as `{ providerRef: "acceptance:grok-cli", maker: "xAI" }` (`acceptance/seed-register.ts:260–263`) under provenance `acceptance:DR-177:V-approved` (`:17`, `:266`).

### Focused tests (captured)

`pnpm vitest run --config acceptance/vitest.config.ts acceptance/grok-relay.test.ts acceptance/grok01-envelope-derivation.test.ts`  
→ **5 passed** (`{SCRATCH}/grok01-relay-tests.log`): handshake + `maker === "xAI"` + verbatim fake CLI model; tool-less args; boot refuse on dead CLI / unresolved model; test seam forbidden outside `NODE_ENV=test`.

**ADVISORY (non-blocking):** standalone `main()` parses `process.env.GROK_RELAY_PORT` (`acceptance/main.ts:317`) while the ceremony schema and proposed V-row use `ACCEPTANCE_GROK_RELAY_PORT`. No number is invented; ceremony path is the packet shape. Unify the env key later if standalone boot is retained.

---

## 2. N-generic pins — PASS (DR-163 clone causality)

### Production generalization (file:line)

| Seam | Evidence |
|---|---|
| Multi-maker expansion | `authorIndex = (rootIndex + round) % effectiveMakerCount` (`apps/runner/src/index.ts` planner; unit pin expects M=3 author sequence `[1,1,2,2,0,0]`) |
| Cross-root exchange | `M*(M-1)` ordered legs via double loop over maker indices (`apps/runner/src/index.ts` `buildCrossRootExchangePlan`) |
| Unserved disclosure | all non-served roots listed (`buildUnservedMakerPositionRecord`) |
| Configured maker list | primary + critique + `additionalMakers` (`apps/runner/src/index.ts:648–660`) |
| Dual-maker M=2 retained | `dual-maker-proof.ts` uses `policy.providers[0]/[1]` only (diff vs base) |

Unit pin `tests/unit/pro01-runner-tree.test.ts:44–77` asserts M=3 topology **and** the DR-162-A slice-to-two mutation for M=2 shape.

### Clone mutation protocol

```text
cp -Rc /Users/vladmihaimiron/Documents/DebateAIRO /private/tmp/grok01-grok-clone
# clone-only: delete xAI provider from acceptance/seed-register.ts
# later clone-only: pair-hardcode buildCrossRootExchangePlan
rm -rf /private/tmp/grok01-grok-clone   # done after captures
```

Real tree remaining proof: `acceptance/seed-register.ts:263` still has `maker: "xAI"`.

| Mutation | Result | Believed reason |
|---|---|---|
| Remove third seed provider (xAI) | Unit M=2/N-generic pure planner suite **15/15 green** (`{SCRATCH}/grok01-clone-m2.log`) | Planner does not read seed |
| Same | `runtime-policy` third-maker roster pin **RED**; `seed-register` configuredProviderSet **RED** (`{SCRATCH}/grok01-clone-n-generic-red.log`) | expected xAI row absent |
| Same | M=2 plan JSON **byte-stable** vs real-tree baseline (`M2_BYTE_STABLE true`; `{SCRATCH}/grok01-m2-baseline.json` vs `grok01-clone-m2-after-seed-mutation.json`) | N-generic code reduces cleanly at M=2 |
| Pair-hardcode `buildCrossRootExchangePlan` in clone | `scales the tree walk…` **RED** at `buildCrossRootExchangePlan(3)` expect 6 legs (`{SCRATCH}/grok01-clone-n-generic-planner-red.log`) | pin actually demands full `M*(M-1)` |
| Same pair-hardcode | M=2 exchange pin **still green** | retained path unchanged |

**Judgment: PASS** — pins fail for the third-member / N-generic reasons, not unrelated fallout; M=2 retained path is byte-stable.

---

## 3. Reviewer rotation — PASS

### Production path

```ts
// apps/runner/src/index.ts:101–114
const candidates = configuredMakers.filter((c) => c.maker !== authorMaker);
const reviewer = candidates.find((c) => c.maker !== latestReviewerMaker) ?? candidates[0];
```

Call site (`apps/runner/src/index.ts:1291–1292`):

```ts
const latestReviewerMaker = await this.#judgements.readLatestReviewerMaker(run.runId, authoredNode.maker);
const reviewer = selectDifferentMakerReviewer(authoredNode.maker, configuredMakers, latestReviewerMaker);
```

Persisted state (`packages/judgement/src/index.ts:349–362`): SQL joins `ledger.node_review` → author/reviewer `raw_artifact.maker`, `ORDER BY review.at_seq DESC LIMIT 1` for the same author maker — **recorded history**, not RNG.

Grep on rotation production files: **no** `Math.random` / unseeded RNG (`{SCRATCH}/grok01-m3-ceiling-grep.txt`).

### Pins

`tests/unit/xrev01-node-review.test.ts:28–38`:

- last reviewer `house-b` → selects `house-c`
- last reviewer `house-c` → selects `house-b`
- M=2 with last=`house-b` → still sole eligible `house-b` (byte-stable fallback)

Captured: `{SCRATCH}/grok01-rotation-tests.log` — **15/15** including the rotation pin.

---

## 4. Critical M=3 discipline — PASS

### Forbidden seed check

| Surface | Result |
|---|---|
| `acceptance/seed-register.ts` `runCostEnvelope` members | still **60 / 108 / 204 / 396 / 780** (`:193–202`) — DR-172 M=2 law |
| `DR159_RATIFIED_MAKER_COUNT` | still **`2`** (`apps/runner/src/index.ts:420`); `assertRatifiedMakerCount` throws `RUN_MAKER_COUNT_EXCEEDS_RATIFIED_ENVELOPE` above 2 (`:423–432`); called at execute (`:824`) |
| Product `+` lines matching proposal ceilings `102,174,318,606,1182` | **only** in `acceptance/grok01-envelope-derivation.test.ts` (derivation oracle) — **not** in register/runtime seed (`{SCRATCH}/grok01-m3-ceiling-grep2.txt`) |
| Pure derivation module | documents proposal-only (`acceptance/grok01-envelope-derivation.ts:13–16`); `setAThreeTimesHeadroom` is pure arithmetic, never written to register |
| Handoff / V-row | proposal table + ratify-or-reject row (allowed) |

**No seeded unratified M=3 ceiling found. Would have been BLOCKING.**

### M-guard refuse `agent_count` 3 (named test, zero model spend)

1. Unit: `tests/unit/pro01-runner-tree.test.ts:15–19` — `assertRatifiedMakerCount(3)` → `RUN_MAKER_COUNT_EXCEEDS_RATIFIED_ENVELOPE` (`{SCRATCH}/grok01-mguard-refuse3.log`).
2. Integration (real embedded PostgreSQL):  
   `tests/integration/database.test.ts:1328–1349`  
   `refuses agent_count 3 with RUN_MAKER_COUNT_EXCEEDS_RATIFIED_ENVELOPE before any model call`  
   asserts provider call count **0** and ledger `MODEL_CALL` count **0** — **PASSED** (same log).

---

## 5. F1 sweep — PASS

| Suite | Result | Capture |
|---|---|---|
| Full acceptance (`acceptance/vitest.config.ts`) | **11 files, 41 tests passed** | `{SCRATCH}/grok01-f1-suite.log` |
| Unit pins `pro01` + `xrev01` | **15/15** | `{SCRATCH}/grok01-rotation-tests.log` |
| Theatre grep (`expect(true)`, empty/skip theatre, etc.) on GROK-01 test surfaces | **no hits** | `{SCRATCH}/grok01-f1-theatre-grep.txt` |

Relay tests drive real `startGrokRelay` + HTTP `/v1/chat/completions` through the process-double CLI. Envelope test drives `deriveMakerEnvelopeProposal(3)`. Rotation/planner tests call shipped runner exports. Integration refuse-3 drives `WalkingSkeletonRunner.executeWorkItem`. No hardcoded oracle standing in for the unit under test beyond expected **outputs of the real function**.

Acknowledged deferral (handoff, accepted): no paid live Grok auth/JSON envelope call — process-double is the lawful proof seam under `NODE_ENV=test`.

---

## Residual ADVISORY (cannot flip APPROVED alone)

1. **Standalone boot env key** `GROK_RELAY_PORT` vs ceremony `ACCEPTANCE_GROK_RELAY_PORT` (`acceptance/main.ts:317` vs `:39`) — unify if both boots remain.
2. **Live CLI JSON envelope** under real auth remains a V/orchestrator spend gate (handoff §Environment tail). Not a GROK-01 structural defect relative to FAIR-02 process-double precedent.

---

## Files reviewed (product)

`acceptance/grok-relay.ts`, `acceptance/grok-relay.test.ts`, `acceptance/test-fixtures/fake-grok-cli.mjs`, `acceptance/grok01-envelope-derivation.ts`, `acceptance/grok01-envelope-derivation.test.ts`, `acceptance/claude-relay.ts`, `acceptance/relay-core.ts`, `acceptance/main.ts`, `acceptance/run-acceptance.ts`, `acceptance/runtime-policy.ts`, `acceptance/runtime-policy.test.ts`, `acceptance/seed-register.ts`, `acceptance/seed-register.test.ts`, `acceptance/dual-maker-proof.ts`, `apps/runner/src/index.ts`, `packages/judgement/src/index.ts`, `tests/unit/pro01-runner-tree.test.ts`, `tests/unit/xrev01-node-review.test.ts`, `tests/integration/database.test.ts` (refuse-3 region).

Real product tree was not modified by this seat. Clone deleted after mutation proofs.

VERDICT: APPROVED
