# BUG-01 dual-diamond review — Grok lens (rev1)

**Ticket:** `t_fcd509b0` · **Board:** `debateai-v3`  
**Reviewer:** Grok (independent dual-diamond lens; DR-153)  
**Date:** 2026-08-13  
**Review packet:** `docs/missions/2026-08-06-v3-programming/reviews/bug01-grok-review-packet.md`  
**Ground truth:** Codex handoff · architecture plan · plan-grok-verdict (binding conditions 1–5 / findings 1–11)  
**Mode:** real tree read-only for product code; suites run read-only; sole real-tree write is this file. Mutation tests only in DR-163 clone `/private/tmp/bug01-grok-clone` (deleted after use). Standing stack ports PG 55432 / API 8790 / UI 3000 untouched. Did not read or coordinate with the Opus lens.

## Verdict

**APPROVED**

Nothing found **BLOCKING**. The implementation is a conformance repair of Seam C’s already-named schema-failure retry behaviour. Binding conditions 1–5 hold under production-path evidence (source traces + suite runs including real embedded PostgreSQL for T11–T13 and a clone mutation that kills T4 for the believed reason). Residual notes are **ADVISORY** only.

---

## Packet / condition checklist

| # | Topic | Judgment | Evidence |
|---|---|---|---|
| GT | Delta is the BUG-01 surface vs `2c61198` | **PASS** | 7 paths only: `providers`, `judgement`, `runner`, unit/integration/architecture tests; no kernel/DDL/contract/battery/ledger/seed |
| C1 | Absent `classifyContent` ⇒ byte-identical one-shot | **PASS** | Gateway gate `providers/src/index.ts:265-268`; T4 green; clone mutation → T4 fails (`PROVIDER_CONTENT_UNACCEPTED`, attempts=3) |
| C2 | Exhaustion → typed organ codes + **last** parse error | **PASS** | Carrier `ProviderContentUnacceptedError` → judge/review/runner wraps; T3/T8/T9 green |
| C3 | Bound is only `CallBound.maxAttempts` | **PASS** | Product delta has no new bound literal; seed still 3/3/3; loop uses `request.bound.maxAttempts` only |
| C4 | No schema widen / DDL / kernel vocab / new edges / stack control | **PASS** | Still `.strict()`; T7 rejects `notes_absent`; T14 six outcomes; 27-edge audit green; no stack control |
| C5 | Findings carried (5 sites, predicates, FAILED honesty, terminal OK-only, claim_type) | **PASS** | Five production sites; composer/conformance/R9 declare predicates; FAILED+artifact link; T10/T11/T13 |
| PC | Real DB both rows; OK consumers; repair hygiene; F1 sweep | **PASS** | T11/T12 on embedded PG; `findSuccessfulCommandArtifact` SERVE-only; T6/T8; no unfailable BUG-01 pin found |

---

## Ground truth and delta surface

**Read in full:** handoff, architecture plan, plan-grok-verdict (binding conditions 1–5), packet.

**Parent git root** `/Users/vladmihaimiron/Documents/DebateAIRO`, `git diff 2c61198 --name-only`:

1. `DebateAI-V3/apps/runner/src/index.ts`
2. `DebateAI-V3/packages/judgement/src/index.ts`
3. `DebateAI-V3/packages/providers/src/index.ts`
4. `DebateAI-V3/tests/architecture/scaffold.test.ts`
5. `DebateAI-V3/tests/integration/database.test.ts`
6. `DebateAI-V3/tests/unit/judgement.test.ts`
7. `DebateAI-V3/tests/unit/provider.test.ts`

Stat: 7 files, +576 / −110. Matches handoff inventory. **No** `packages/kernel`, `migrations/`, `packages/contract`, `packages/battery`, `packages/ledger`, `acceptance/seed-register.ts`, or stack process control in the delta. Real-tree product files were not mutated by this seat.

---

## Condition 1 — Absent predicate ⇒ one-shot

**Production path** (`packages/providers/src/index.ts:265-299`):

```
if (
  request.classifyContent !== undefined
  && (classifiedContent.parseStatus === "PARSE_FAILED"
      || classifiedContent.parseStatus === "SCHEMA_FAILED")
) {
  // ledger FAILED + continue
}
```

Retry requires a **declared** `classifyContent` returning `PARSE_FAILED` / `SCHEMA_FAILED`. Fallback `contentParseStatus` (`:166-173`) returns only `PARSED` | `UNPARSED` and is used only when the predicate is absent (`:236-238`); `UNPARSED` never enters the retry branch under production code.

**T4** (collected name: `persists the raw real HTTP response unconditionally before ledgering the attempt`, `tests/unit/provider.test.ts:158-204`): no `classifyContent`, non-JSON content `"not-json-on-purpose"`, `maxAttempts: 3` → exactly one artifact/ledger step and byte-identical content:

```
["outside-transaction", "artifact:UNPARSED", "ledger:OK"]
```

**Clone mutation (DR-163):** in `/private/tmp/bug01-grok-clone`, removed the declared-predicate gate and allowed `UNPARSED` to `continue`. Re-ran T4:

```
ProviderContentUnacceptedError: fallback-unparsed
code: PROVIDER_CONTENT_UNACCEPTED, attempts: 3
```

T4 fails for the believed reason (fallback multi-attempt spend). Real tree left with `classifyContent !== undefined` guard intact (0 mutation markers).

**Judgment: PASS.**

---

## Condition 2 — Typed loudness end-to-end

| Stage | Location | Behaviour |
|---|---|---|
| Exhaustion carrier | `providers/src/index.ts:57-69`, `:347-354` | `ProviderContentUnacceptedError` code `PROVIDER_CONTENT_UNACCEPTED`; fields `attempts`, `lastParseStatus`, `lastParseError`, artifact/ledger refs; message = **last** parse error |
| Transport exhaustion | `:356` | `ProviderCallFailedError` / `PROVIDER_CALL_FAILED` (typed, not bare `Error`) |
| Judge wrap | `judgement/src/index.ts:147-150` | `instanceof ProviderContentUnacceptedError` → `TypedDomainError("JUDGE_SCHEMA_FAILURE", error.lastParseError)` |
| Review wrap | `judgement/src/index.ts:226-229` | same → `NODE_REVIEW_SCHEMA_FAILURE` + last error |
| Runner wrap | `apps/runner/src/index.ts:232-244` | `callWithContentContract` → organ code (`COMPOSITION_CONTRACT_ERROR` / `CONFORMANCE_CONTRACT_ERROR` / `POST_COMPOSE_R9_CONTRACT_ERROR`) + last error |
| Acceptance wrap | `acceptance/main.ts:73` (unchanged) | `ACCEPTANCE_EXECUTION_FAILED:${error.code}` |

No salvage, strip, default τ, or fabricated judgement after exhaustion (NON-goal preserved).

**Suite:** T3 (last error `error:rejected-2`, attempts=2), T8 (`JUDGE_SCHEMA_FAILURE` + last error), T9 (`NODE_REVIEW_SCHEMA_FAILURE` + last error) — all green on real tree.

**Judgment: PASS.**

---

## Condition 3 — Bound is `CallBound.maxAttempts` only

- Gateway loop: `for (let attempt = 1; attempt <= request.bound.maxAttempts; attempt += 1)` (`providers/src/index.ts:198`); repair packet applied only when `attempt < request.bound.maxAttempts` (`:292`).
- Product-source delta: no new `schemaRepairAttempts` / second literal bound / nested retry loop. Numeric `maxAttempts: N` appearances in the delta are **test fixtures** (and one pre-existing composer recompose local override pattern), not a new production bound.
- Register seed unchanged (not in delta): `acceptance/seed-register.ts:165-167` still `JUDGE` / `COMPOSER` / `CONFORMANCE` `maxAttempts: 3`.
- DR-159 A-2 env bounds on Hatchet path named as adjacent, not fixed here.

**Judgment: PASS.**

---

## Condition 4 — No widen / DDL / kernel / edges / stack

| Check | Result |
|---|---|
| `judgeArtifactSchema` / `nodeReviewArtifactSchema` | still `.strict()` (`judgement/src/index.ts:18-32`) |
| T7 incident vector | nested `evidence.notes_absent` → declared predicate `SCHEMA_FAILED` |
| Kernel `LEDGER_OUTCOMES` | unchanged six members (`kernel/src/index.ts:185`); T14 green; no kernel file in delta |
| Migrations / contract | none in delta |
| Architecture edges | T15 / “matches all 27 dependency-edge rows” green; zero violations |
| Stack process control | none; standing ports not touched |

**Judgment: PASS.**

---

## Condition 5 — Findings carried

### Five production `provider.call` sites (not six)

| # | Site | Predicate / repair |
|---:|---|---|
| 1 | `packages/judgement/src/index.ts:127` `Judge.judge` | `classifyContent` + `buildRepairPacket` |
| 2 | `packages/judgement/src/index.ts:206` `Judge.review` | same |
| 3 | `apps/runner/src/index.ts:1187` composer via `callWithContentContract` | `classifyStructuredContent(compositionSchema)` + repair |
| 4 | `apps/runner/src/index.ts:1238` conformance | same for conformance schema |
| 5 | `apps/runner/src/index.ts:1260` post-compose R9 | same for r9 schema |

Wrapper `provider.call` at `runner/src/index.ts:238` is the shared helper body, not a sixth organ site. Plan’s “six sites” count remains refuted; implementation uses five.

### Bonus A — ledger FAILED honesty + terminal OK-only

- Rejected attempts ledger `outcome: "FAILED"` with `raw_artifact_ref` set (`providers/src/index.ts:269-283`).
- `packages/battery/src/terminal.ts:1032-1035` already counts `MODEL_CALL … outcome = 'OK'` only (not in delta; honesty is the OK→FAILED relabel). T11/T13: 2 FAILED + 1 OK → `judgeCallCount === 1`, counters = 3.
- Adjacent exact-`JUDGE` multi-maker key miss remains out of scope (finding 11 / plan §10.1).

### Bonus B — composer / conformance / R9 predicates

Declared at the three runner sites above; first-time honest `SCHEMA_FAILED` on organ-contract violations (no longer silent `PARSED` via fallback).

### `claim_type` tightened (T10)

`claim_type: z.enum(CLAIM_TYPES).optional()` (`judgement/src/index.ts:25`); bogus value classified `SCHEMA_FAILED` by the declared predicate (T7/T10).

**Judgment: PASS.**

---

## Production-path causality

### Real DB writes both rows (T11/T12)

Ran on real embedded PostgreSQL (DR-121: Testcontainers deferred):

```
✓ T11/T13 charges every rejected attempt while terminal execution counts only the accepted attempt
✓ T12 exposes the last rejected artifact to the redelivery exhaustion check
```

T11 outcome chain on real PG:

```
{ outcome: "FAILED", parse_status: "SCHEMA_FAILED" } × 2
{ outcome: "OK", parse_status: "PARSED" }
```

`countRunModelAttempts` = 3, `countModelAttempts` = 3, `judgeCallCount` = 1. T12: `findExhaustedModelAttempt` returns the final rejected artifact ref matching the last ledger row.

### `MODEL_CALL` `OK` consumers under OK→FAILED

| Consumer | Filter | Impact |
|---|---|---|
| `budget.countRunModelAttempts` | outcome-blind `MODEL_CALL` | charges retries (desired) |
| `ledger.countModelAttempts` | outcome-blind | same |
| `ledger.findExhaustedModelAttempt` | outcome-blind | same |
| `battery/terminal.ts` executed-check counts | `outcome = 'OK'` | stricter; desired; T13 |
| `ledger.findSuccessfulCommandArtifact` | `action_kind = 'SERVE'` + `OK|BLOCKED` | **SERVE-only; unaffected** (`packages/ledger/src/index.ts:452-468`) |

No other production `MODEL_CALL`+`outcome='OK'` consumer found that the relabel would break.

### Repair packet hygiene (T6/T8 falsification attempt)

Production builders (`buildContentRepairPacket` `judgement/src/index.ts:34-40`; `buildSchemaRepairPacket` `runner/src/index.ts:223-229`) interpolate **only** `parseError`:

```
Machine parse error: ${parseError}
```

They accept `RejectedProviderContent.rawText` in the type but **do not** insert it. T8 asserts repair JSON contains the machine error and **not** `"raw model content must not be interpolated"`. T6: without builder, HTTP body and `input_hash` are identical across attempts; with builder, `input_hash` changes and `contract_hash` stays fixed. No production path authors suggested scores/values.

### F1 sweep (BUG-01 tests)

| Test | Drives real path? | Can fail for believed reason? |
|---|---|---|
| T1/T2 | real gateway + local HTTP | yes — delete `continue` / dishonest OK |
| T3 | real gateway exhaustion | yes — bare error / first-error carrier |
| T4 | real gateway absent predicate | **yes — clone mutation proved** |
| T5/T6 | real HTTP bodies + hashes | yes — hoist hash / author repair |
| T7/T10 | real `Judge` predicate on incident shape | yes — strip/widen schema or `z.unknown()` claim_type |
| T8 | real repair builder + code wrap | yes — interpolate raw / rename code |
| T9 | real review wrap | yes — leave review untyped (thin on predicate body; see advisory) |
| T11–T13 | real PG gateway + budget/ledger/terminal | yes — OK filter on counters / count FAILED as executed |
| T14 | imports `LEDGER_OUTCOMES` | yes — mint new outcome member |
| T15 | architecture edge audit | yes — new edge |

No source-text-only pin, import-only, or predicate-only assertion that cannot fail was found among the BUG-01 set.

**Judgment: PASS.**

---

## Suite receipts (this seat)

| Command | Result |
|---|---|
| `pnpm vitest run tests/unit/provider.test.ts tests/unit/judgement.test.ts tests/architecture/scaffold.test.ts` | 3 files / 24 tests passed |
| `pnpm vitest run tests/integration/database.test.ts -t content-rejection` | T11/T13 + T12 passed (embedded PG 18.4) |
| Architecture T14 + 27-edge | passed |
| Clone T4 mutation | failed as required (`PROVIDER_CONTENT_UNACCEPTED`, attempts=3) |

Full monorepo `pnpm test` not re-run here; focused gating suites + real-PG integration hold. Handoff’s 543-pass claim is not independently re-asserted.

---

## BLOCKING findings

None.

---

## ADVISORY findings

1. **T9 is thinner than T7 on the review predicate body.** T9 proves exhaustion → `NODE_REVIEW_SCHEMA_FAILURE` with last error via a throwing mock, but does not feed a malformed review JSON through the real `classifyContent` the way T7 does for the judge schema. Production `review` does declare a real `.strict()` predicate (`judgement/src/index.ts:217-224`); residual is test-depth, not a missing seam.

2. **Caller-owned repair callbacks remain a DR-115 trust surface.** All five production sites use fixed machine-error-only templates today. A future caller that interpolates `rawText` or suggests values would not be stopped by the gateway. Pre-acknowledged by design; no production site currently misbehaves.

3. **Pre-existing adjacent items (out of scope, reconfirmed):** `terminal.ts:1032` exact `call_site_key = 'JUDGE'` misses multi-maker keys; DR-159 A-2 env-sourced Hatchet bounds. Correctly deferred.

4. **Live incident re-fire not attempted** (packet + DR-115). Retry proof is test-layer local HTTP + real embedded PG, not a summoned live model rejection on the standing acceptance stack.

---

## Isolation confirmation

- Sole real-tree write: this file (`docs/missions/2026-08-06-v3-programming/reviews/bug01-grok-rev1.md`).
- Product / test sources under BUG-01 remain the Codex uncommitted delta only; this seat did not edit them.
- DR-163 clone used for T4 mutation only; removed after use.
- No board post; no git commit/push; standing stack untouched.

VERDICT: APPROVED — binding conditions 1–5 hold with production-path evidence; no blocking findings.
