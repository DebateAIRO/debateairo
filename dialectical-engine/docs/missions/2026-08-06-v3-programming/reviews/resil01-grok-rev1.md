# RESIL-01 dual-diamond review — Grok lens (rev1)

**Ticket:** `t_00c8561c` · **Board:** `debateai-v3`  
**Reviewer:** Grok (independent dual-diamond lens; DR-171 authorizing seat)  
**Date:** 2026-08-14  
**Review packet:** `docs/missions/2026-08-06-v3-programming/reviews/resil01-grok-review-packet.md`  
**Ground truth:** `reviews/dr174-architecture-plan.md` (incl. DR-174-A revision) · `reviews/dr174-plan-grok-verdict.md` (binding conditions 1–10) · ledger DR-174 / DR-174-A / DR-176 · `goal-packets/RESIL-01-codex-goal.md` · `handoffs/RESIL-01-codex-handoff.md`  
**Mode:** real tree read-only for product code; sole real-tree write is this file. Mutation kills only in DR-163 clone `/private/tmp/resil01-grok-clone` (deleted after use). Standing stack ports PG 55432 / API 8790 / UI 3000 untouched by this seat. Did not read or coordinate with the Opus lens. No product/stack control; no commits/pushes/merges.

## Verdict

**APPROVED**

Nothing found **BLOCKING**. Every packet verify item (1–10) and every Grok binding condition from `dr174-plan-grok-verdict.md` holds under production-path evidence (live `git diff ee4c676` + shipped sources). Load-bearing kill proofs for hold-cap recovery, whole-subtree exclusion (incl. re-parent forbid), UI null-guard, and no-default threshold were demonstrated in the clone (pass → red on named tests). Residual notes are **ADVISORY** only (primary-path *wiring* lacks a unit-suite pin; integration T17/T18/T33 not re-hosted by this seat).

---

## Packet / condition checklist

| # | Topic | Judgment | Evidence |
|---|---|---|---|
| GT | Delta is RESIL-01 surface vs `ee4c676` | **PASS** | 30 tracked files + untracked `migrations/0021_dr174_cooldown_prune.sql` (+ handoff/packet docs); +949/−139; inventory matches handoff |
| 1 / BC1 | Primary `JUDGE` enters same cooldown/final-retry as funnel | **PASS** | `apps/runner/src/index.ts:840-853` `primaryAttempt = await cooldownAttempt({ callSiteKey: "JUDGE", … })` → `:765-774` `withCooldownRetry`; funnel `authorPosition` `:986-1000`; DIE-LOUD on halt `:854-858` / `:1109-1113` |
| 2 / BC numbers | Register rows only: `{600_000, 1, 2, TRANSPORT_EXHAUSTION}` + `0.35` | **PASS** | `acceptance/seed-register.ts:175-188` + sourceRefs `acceptance:DR-174:V-approved` / `acceptance:DR-176:V-approved`; `runtime-policy.ts:49-56` pins `final_retry_attempts: 1`, `max_cooldown_holds_per_run: 2`, `applies_to: TRANSPORT_EXHAUSTION`, `hiddenNodeScoreThreshold: 0.35`; seed test expects exact rows |
| 3 / BC2 | Hold-cap from event stream, never process memory | **PASS** | `withCooldownRetry` `:216` `countCooldownHolds(runId)`; production SQL `packages/db/src/index.ts:254-262` counts `run_progress_event` `kind='node.retrying'` + `state='COOLDOWN_HOLD'`; clone M2 → **T25/T26 RED** |
| 4 / BC3 | T27 whole-subtree exclude; no re-parent; store retained; arrow out of number | **PASS** | `excludeHiddenSubtrees` `:257-292` expands descendants then drops nodes+arrows (no re-parent); runner `:1312-1321`; unit T27/T28/T33 green; clone M3 no-op → **T27/T28+T33 RED**; clone M5 re-parent → **T27/T28+T33 RED**; integration T33 retains `core.node` count 8 |
| 5 / BC7 | Marks H/L/N kernel + REQUIRED records + migration 0021 CHECKs | **PASS** | `packages/kernel/src/index.ts:102-107` three members; `packages/serve/src/index.ts:788-798` REQUIRED_CONDITION_MARK_RECORDS; migration `0021` column CHECKs name all three; T32 green |
| 6 / BC4 | `NODE_REVIEW_UNAVAILABLE` retired on class-H path only | **PASS** | Review transport halt → `hiddenReviewRecords` `:1240-1242` (no throw); envelope/budget/producer-grading re-raise `:1254-1258`; non-transport still throws `NODE_REVIEW_UNAVAILABLE` `:1261-1264` |
| 7 / BC9 | Sparse `authoredNodes` + pre-flight cooldown-aware | **PASS** | `Map` `:934` + XREV `authoredNodes.values()` `:1220`; pre-flight effective bound `maxAttempts + finalRetryAttempts` `:800`; non-maker sites → `preflightHaltedSites` continue `:812-819`; maker positions still `failFromExhaustedAttempt` `:821` (DIE-LOUD BC5) |
| 8 / BC6 | UI 0.35 retired; register-sourced; null-guard verbatim | **PASS** | `isLowStrengthNode(strength, threshold)` no default `:114-119`; `if (strength == null) return false` survives; `hiddenNodeScoreThresholdFromDeployment`; clone M4 → **T30/T31 RED**; clone M6 default restored → **T30/T31 RED** (`length === 2`) |
| 9 | HOLDING self-expires on `hold_until`; planned event kinds only | **PASS** | Projection `:362-380` requires `COOLDOWN_HOLD` **and** `hold_until > clock_timestamp()` else RUNNING/null; event kinds `node.retrying` / `ledger.could_not_do` only (`0021` + `HoldProgressEvent`); states COOLDOWN_HOLD / COOLDOWN_RETRY / EXPANSION_HALTED ride those kinds |
| 10 | F1 on new tests; M=2 byte-identity outside new paths | **PASS** | Focused suite 9/9 green; no `expect(true)` / skip theatre in `dr174-resilience.test.ts`; `packages/providers` and `packages/propagation` **absent** from delta (zero providers control-flow change; pure exclude-then-evaluate) |
| BC5 | Dead maker-position DIE-LOUD (no SERVE-SURVIVING) | **PASS** | Primary/secondary halt throws `MAKER_POSITION_UNAVAILABLE`; no mono-maker re-derivation path added |
| BC8 | Hidden-by-default UI binding if shipping honesty hide | **PASS** | `DebateCanvas.tsx:101` `useState(false)` for `showSetAsidePaths` (was true pre-ticket); H/L map to `path_status: "abandoned"` via adapter |
| BC10 | Migration `0021` next free after `0020`; no providers sleep | **PASS** | `migrations/0021_dr174_cooldown_prune.sql` untracked-new; providers delta empty |

---

## Ground truth and delta surface

**Read in order:** architecture plan (+ DR-174-A revision) · plan-grok-verdict (binding conditions 1–10) · ledger DR-174 / DR-174-A / DR-176 · goal packet · Codex handoff.

**Parent git root** `/Users/vladmihaimiron/Documents/DebateAIRO`, base `ee4c676` ("Intake seed gated DRAFT…").

**Tracked delta (`git diff --stat ee4c676 -- DebateAI-V3`):** 30 files, +949 / −139.

Production / policy / schema surfaces:

| Path | Role |
|---|---|
| `apps/runner/src/index.ts` | `withCooldownRetry`, `excludeHiddenSubtrees`, primary+funnel+review wraps, Map authoredNodes, preflight, H/L/N marks |
| `packages/db/src/index.ts` | `countCooldownHolds`, lifecycle event write, HOLDING projection |
| `packages/ledger/src/index.ts` | exhausted-attempt carrier gains callSiteKey/outcome/ledgerEntryRef |
| `packages/contract/src/index.ts` | HOLDING + hold_until; H/L/N record shapes |
| `packages/serve/src/index.ts` | REQUIRED records + typed H/L/N validation + persistence columns |
| `migrations/0021_dr174_cooldown_prune.sql` | event-kind CHECK widen; condition_mark columns + CHECKs |
| `acceptance/{seed-register,runtime-policy,main}.ts` | register rows + wire holdRecorder |
| `apps/v2-ui/**`, `web/lib/v3Presentation.ts` | threshold sourcing, HOLDING copy, set-aside H/L/N labels |
| `tests/unit/dr174-resilience.test.ts`, `tests/integration/database.test.ts`, related pins | T10–T33 ledger |

**Not in delta (M=2 / plan non-touch):** `packages/providers`, `packages/propagation`, `packages/kernel` (three marks already present at base `ee4c676` under DR-176 comments — still live members; T32 pins them).

**Numeric sweep (production delta):** new policy numbers are only V-ruled `600_000`, `1`, `2`, `0.35`, and `TRANSPORT_EXHAUSTION`. Other added digits are structural (`plannedLegCount: 1`, UI minute math `60_000`, zod `.min(1)`, placeholder SQL `$N`) — not invented policy.

---

## Binding conditions (Grok authorization) — detailed evidence

### BC1 / Packet 1 — Primary maker-position wrap

**Production path.** Primary authoring is no longer a bare `this.#judge.judge` outside the funnel:

```text
apps/runner/src/index.ts:840-853
  primaryAttempt = await cooldownAttempt({ callSiteKey: "JUDGE", … attempt(maxAttempts) => judge.judge({… bound: {… maxAttempts}}) })
:765-774 cooldownAttempt → withCooldownRetry({ baseMaxAttempts, policy, hold, attempt })
:986-1000 authorPosition (secondary, expansion, cross-root) same cooldownAttempt
:1224-1239 review path same cooldownAttempt
```

DIE-LOUD after full courtesy on maker positions: `:854-858` primary, `:1109-1113` secondary (`MAKER_POSITION_UNAVAILABLE`). Expansion/review halt records instead of killing the run.

**Kill proof.**

| Mutation (clone only) | Named suite | Result |
|---|---|---|
| Remove primary `cooldownAttempt` wrap; call `judge.judge` with raw bound | `tests/unit/dr174-resilience.test.ts` | **Still 9/9 green** |

**Static hold:** the production call site is the wrap itself; helper tests pin `withCooldownRetry` behaviour (T10/T13/T25/T26) but do **not** pin that `execute()` routes `callSiteKey: "JUDGE"` through it. **ADVISORY-1** (test ledger gap), not an implementation refute — the live path is wrapped.

**Judgment: PASS** (implementation); ADVISORY on unit pin.

---

### BC numbers / Packet 2 — Register rows only

```text
acceptance/seed-register.ts:175-188
  runDeathPolicy: { kind: RUN_DEATH_POLICY, cooldown_ms: 600_000,
    final_retry_attempts: 1, max_cooldown_holds_per_run: 2,
    applies_to: TRANSPORT_EXHAUSTION }
  sourceRef: acceptance:DR-174:V-approved
  hiddenNodeScoreThreshold: 0.35
  sourceRef: acceptance:DR-176:V-approved
```

`acceptance/runtime-policy.ts:49-56` schema: `final_retry_attempts: z.literal(1)`, `max_cooldown_holds_per_run: z.literal(2)`, `applies_to: z.literal("TRANSPORT_EXHAUSTION")`, `hiddenNodeScoreThreshold: z.literal(0.35)`. Transport-only enforcement in control flow: `withCooldownRetry` only catches `ProviderCallFailedError` (T13 proves schema `ProviderContentUnacceptedError` never enters hold/wait).

`acceptance/main.ts:202-220` wires policy + `holdRecorder` → `RunRepository.countCooldownHolds` / `recordRunLifecycleEvent`.

**Judgment: PASS.**

---

### BC2 / Packet 3 — Hold-cap from durable event stream

```text
withCooldownRetry :216  holds = await input.hold.countCooldownHolds(input.runId)
              :217  if (holds >= maxCooldownHoldsPerRun) → HALTED (no wait, no final retry)
RunRepository.countCooldownHolds :254-262
  SELECT count(*) FROM core.run_progress_event
  WHERE run_id=$1 AND kind='node.retrying' AND value_json->>'state'='COOLDOWN_HOLD'
```

**Clone M2:** replaced the `countCooldownHolds` call with `const holds = 0` → **T25/T26 RED** (`countCooldownHolds` expected called with `run:test`; also would wait/retry past cap).

T25 green path: holds already 2 → one attempt, no wait; holds 1 → wait once + final attempt with maxAttempts 4 (`[[3],[4]]`).

**Judgment: PASS.**

---

### BC3 / Packet 4 — Hidden ≠ unserved-but-scored (T27)

`excludeHiddenSubtrees` (`:257-292`):

1. Transitively add every descendant of each hidden id.
2. Drop excluded nodes and any arrow with excluded source/target.
3. Drop dependent EDGE-target arrows.
4. Return a new snapshot — **never** rewrites `parentNodeId` of survivors (contrast `snapshotWithoutNode` re-parent in `packages/propagation`).

Runner applies class-H then class-L exclusion before final `evaluate` (`:1312-1321`). Store writes already happened earlier; exclusion is evaluate-snapshot only.

**Clone kills:**

| Mutation | Red tests |
|---|---|
| M3: function returns full snapshot | T27/T28, T33 |
| M5: re-parent children onto grandparent | T27/T28, T33 |

Unit T27 asserts hidden-child not re-parented to root and absent from strengths/arrowOrder/fingerprint; full snapshot still contains hidden node (store-side retention analogue). Integration T33 (read, not re-run) asserts `core.node` count 8 + served strength equals evaluate(excludeHidden…)).

**Judgment: PASS.**

---

### BC7 / Packet 5 — Three marks

| Layer | Evidence |
|---|---|
| Kernel | `CONDITION_MARKS` includes `HIDDEN-UNJUDGEABLE`, `HIDDEN-LOW-SCORE`, `UNAUTHORED-BRANCH-HALTED` (`packages/kernel/src/index.ts:102-107`) |
| REQUIRED records | `packages/serve/src/index.ts:788-798` + typed field validation `:819-835` |
| Migration 0021 | CHECK predicates name all three members on the new columns (`call_site_key`, `planned_leg_count`, `terminal_transport_outcome`, `hidden_*`, `excluded_from_served_number`) |
| Runner mint | `:1376-1379`, records `:1432-1481` |
| Unit T32 | length 27, arrayContaining three names, assertRequiredConditionMarkRecords |

V chose Grok's N-name (DR-176); no fourth vocabulary path.

**Judgment: PASS.**

---

### BC4 / Packet 6 — NODE_REVIEW_UNAVAILABLE retirement scope

```text
:1240-1242  reviewAttempt.kind === "HALTED" → push hiddenReviewRecords; continue  // class H
:1254-1258  RUN_COST_ENVELOPE_EXHAUSTED | CALL_BUDGET_EXHAUSTED | PRODUCER_GRADING_FORBIDDEN → rethrow
:1261-1264  other failures → NODE_REVIEW_UNAVAILABLE (non-transport review failure still loud)
```

Class-H transport path no longer kills the run. Envelope/budget refusals untouched.

**Judgment: PASS.**

---

### BC9 / Packet 7 — Two latent defects

1. **Sparse authoredNodes:** `Map<number, AuthoredDebateNode>` (`:934`); XREV iterates `.values()` (`:1220`); no hole/`undefined` property access. Halted expansion indices skip via `haltedIndices` without leaving sparse array slots.
2. **Pre-flight:** judge bound becomes `maxAttempts + finalRetryAttempts` (`:800`); exhausted non-maker judge keys record into `preflightHaltedSites` and **continue** (`:812-819`) so a later `cooldownAttempt` can emit EXPANSION_HALTED without `failFromExhaustedAttempt` on the whole item. Maker keys `JUDGE` / `JUDGE:root:secondary` still fail the work item (DIE-LOUD BC5).

**Judgment: PASS.**

---

### BC6 / Packet 8 — UI literal retired + null-guard

```text
apps/v2-ui/lib/debateTreeUtils.ts:114-119
  isLowStrengthNode(strength, threshold)  // required arg; no default
  if (strength == null) return false;     // VERBATIM
  return strength <= threshold;
```

No local `0.35` in this file. Threshold from `hiddenNodeScoreThresholdFromDeployment` / page state. T30/T31: null/undefined → false; `length === 2`; register provenance `acceptance:DR-176:V-approved`.

**Clone M4** (missing score treated as low): **T30/T31 RED**.  
**Clone M6** (restore `threshold = 0.35` default): **T30/T31 RED** (`length` 1 ≠ 2).

**Judgment: PASS.**

---

### Packet 9 — HOLDING projection

```text
packages/db/src/index.ts:362-380
  HOLDING ⇔ latest node.retrying event is COOLDOWN_HOLD AND hold_until > clock_timestamp()
  else CLAIMED → RUNNING; expired hold_until → holdUntil null (self-expiry)
```

Event kinds authorized in migration 0021 CHECK: existing set + `node.retrying` + `ledger.could_not_do` only (the plan's two additions). Progress value states: `COOLDOWN_HOLD` / `COOLDOWN_RETRY` / `EXPANSION_HALTED` (`HoldProgressEvent`). Contract couples `HOLDING` ↔ non-null `hold_until`.

**Judgment: PASS.**

---

### Packet 10 — F1 + M=2

- Focused unit suite **9/9 green** (baseline in clone).
- No unfailable patterns in `dr174-resilience.test.ts`.
- `packages/providers` and `packages/propagation` have **empty** diff vs `ee4c676` — final-retry uses remaining-attempts arithmetic only; exclusion is pure graph thinning before existing `evaluate`.
- UI set-aside affordance reused (adapter maps H/L → abandoned path_status); no parallel hide channel.

**Judgment: PASS.**

---

## Clone mutation ledger (DR-163)

Clone: `cp -Rc` parent root → `/private/tmp/resil01-grok-clone`. Focused suite: `pnpm vitest run tests/unit/dr174-resilience.test.ts`. Captured under seat scratch `resil01-grok-mutations.log`. Clone deleted after restores. Real tree product sources bit-identical to pre-review for mutated paths.

| # | Production mutation | Observation |
|---:|---|---|
| 0 | (baseline) | 9 passed |
| 1 | Primary path bare `judge.judge` (no cooldown) | 9 still passed — **no unit pin for primary wiring** |
| 2 | `holds = 0` instead of `countCooldownHolds` | **T25/T26 RED** |
| 3 | `excludeHiddenSubtrees` returns full snapshot | **T27/T28 + T33 RED** |
| 4 | null-guard → `(strength ?? 0) <= threshold` | **T30/T31 RED** |
| 5 | re-parent children of hidden onto grandparent | **T27/T28 + T33 RED** |
| 6 | restore `threshold: number = 0.35` | **T30/T31 RED** (`length` 1) |

Integration suite (embedded PG T17/T18/T33) not re-executed by this seat (Opus owns live verification). Static read of those tests + production SQL/runner paths is the evidence here.

---

## Findings

### BLOCKING

None.

### ADVISORY

1. **Primary-path wrap lacks a unit-suite mutation pin.** Removing the primary `cooldownAttempt` in the clone left all nine focused unit tests green. Production wiring at `:840-853` is correct and is the authorization condition that matters; recommend a source-level or runner-level pin (e.g. assert `callSiteKey: "JUDGE"` routes through `withCooldownRetry` / record a hold on primary transport death) so a future refactor cannot silently restore the DIE-LOUD bare path Grok refuted at plan time.
2. **Integration T17/T18/T33 not re-hosted here.** Read as authored; durable event recovery and live class-H serve are claimed by the handoff and by static SQL/runner traces. Opus throwaway stack owns re-confirmation.
3. **`cooldown_ms` schema is `z.number().int().positive()` not `z.literal(600_000)`.** Seed + seed test pin `600_000` exactly; not an invented number, but looser than the final-retry/cap literals. Optional harden.

---

## Isolation audit

| Check | Result |
|---|---|
| Sole real-tree write | this file `reviews/resil01-grok-rev1.md` |
| Product / test / migration mutation by this seat | **none** on real tree |
| Clone | created, mutated, suite run, restored, **deleted** |
| Stack control (PG 55432 / API 8790 / UI 3000) | **none** (ports observed listening; not started/stopped/reseeded by this seat) |
| Cross-lens contamination | did not read Opus verdict |
| Opus handoff trust | not used as sole evidence; tree/diff/mutations adjudicate |

---

VERDICT: APPROVED
