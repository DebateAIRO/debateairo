# EXEC-01 dual-diamond review — Grok lens (rev3)

**Ticket:** `t_6fae713b` · **Author:** Codex (gpt-5.6-sol)  
**Reviewer:** Grok (independent read-only dual-diamond lens, rev3)  
**Date:** 2026-08-11  
**Packet:** `reviews/EXEC-01-rev3-review-packet.md`  
**Inputs verified against source (not handoff trust):** rework directive, rev1 Grok/Opus verdicts, goal packet, CODING-LOOP-PROTOCOL (DR-115 / AC-76/DR-039), decisions-ledger DR-149..DR-153, handoff, and the rev2/rev3-touched product paths below.

**Mode:** read-only. This seat wrote only this verdict file. No product code edits, no git mutations, no board mutations. Did not read any Opus rev3 verdict.

## Verdict

**APPROVED**

All three rework closures (R1–R3) hold in shipped source. Carry-forward advisories are either fixed or honestly deferred. Residual notes below are ADVISORY only; none re-open the ticket’s primary forever-QUEUED / typed-terminal / register-drift obligations under the rework directive.

Orchestrator-greenlit gates (root/v2-ui tsc, 411/34 vitest, architecture/source audits) were **not** re-run in this seat per packet budget. Claims below are static + unit-source verification of the three closures and carried advisories.

---

## Required closures (R1–R3)

| Item | Result | Source proof (not handoff-only) |
|---|---|---|
| **R1** observed cause on dispatch error path | **CLOSED** | `acceptance/main.ts:71-75` `acceptanceFailureReason`; `:87-97` binds `error` and persists reason; tests in `tests/unit/acceptance-dispatcher.test.ts` |
| **R2** register-derived envelope + loud refuse + divergence-sensitive test | **CLOSED** | Adapter `runCostEnvelopeFromDeployment` (`apps/v2-ui/lib/v3/adapter.ts` ~484–540); API `getRunCostEnvelope` (`apps/v2-ui/lib/api.ts:215-219`); `/new` (`apps/v2-ui/app/new/page.tsx:53-75,326-338,391-401`); data-layer tests (`tests/unit/v2ui-data-layer.test.ts:420-465`) |
| **R3** crash-path stall named; no unqualified “no silent stalls” | **CLOSED** | Handoff PROCESS_DEATH_STALL declaration + closure path; unqualified phrase absent from handoff; contract test `tests/unit/exec01-rework-contract.test.ts` |

### R1 — error path carries the observed cause

**Rev1 defect:** `.catch(() => …)` discarded the rejection value; every runner `TypedDomainError` collapsed to bare `ACCEPTANCE_EXECUTION_FAILED`.

**Shipped code:**

```71:97:acceptance/main.ts
function acceptanceFailureReason(error: unknown): string {
  return error instanceof TypedDomainError
    ? `ACCEPTANCE_EXECUTION_FAILED:${error.code}`
    : "ACCEPTANCE_EXECUTION_FAILED:UNEXPECTED_ERROR";
}
// ...
void this.runner.executeWorkItem(input.workItemId).catch(async (error: unknown) => {
  const recorded = await this.failures.recordTerminalFailure({
    ...input,
    reason: acceptanceFailureReason(error)
  });
  if (!recorded) {
    process.stderr.write("ACCEPTANCE_FAILURE_STATE_NOT_RECORDED\n");
  }
}).catch(() => {
    process.stderr.write("ACCEPTANCE_FAILURE_STATE_PERSIST_FAILED\n");
});
```

| Check | Evidence |
|---|---|
| `TypedDomainError.code` preserved | Composed reason `ACCEPTANCE_EXECUTION_FAILED:${error.code}`. Unit: `acceptance-dispatcher.test.ts:36-50` expects `…:COMPOSITION_UNRESOLVED` for a thrown `TypedDomainError` (the DR-151 concrete case class). |
| Non-typed honesty (DR-115) | Non-domain rejections become `…:UNEXPECTED_ERROR` — **not** a fabricated typed domain code and **not** the raw `Error.message` (avoids persisting sensitive provider text). Unit: `:22-33`. |
| Parseable composed reason | Prefix is fixed; remainder is the code. Shipped runner codes are `SCREAMING_SNAKE` without `:` (`apps/runner/src/index.ts` throws). UI displays the full reason string; no new consumer-side split ambiguity is introduced on the served path. |
| Swallowed cause on dispatch paths | Runner rejection cause is no longer discarded. `recordTerminalFailure === false` is now loud on stderr (`ACCEPTANCE_FAILURE_STATE_NOT_RECORDED`) rather than treated as success. Persist **rejection** still maps only to a constant stderr line (see ADVISORY-A2). |

**Failing case that would re-open R1:** re-introduce a parameterless `.catch(() => recordTerminalFailure({ reason: "ACCEPTANCE_EXECUTION_FAILED" }))` — the typed unit test fails immediately.

### R2 — `/new` reads the register; tests can fail on drift

**Rev1 defect:** depth `1` and “up to 9” were source literals; page test asserted source text and could not fail when register and UI diverged.

**Shipped product path:**

1. **Adapter** (`runCostEnvelopeFromDeployment`): finds `register.rows` entry `row_key === "runCostEnvelope"`; absent → `TypedDomainError("RUN_COST_ENVELOPE_UNAVAILABLE", …)`; missing/empty/malformed members → `RUN_COST_ENVELOPE_INVALID`; projects `depth` / `riskTier` / `maxModelAttempts` from each member with no literal fallback.
2. **API** (`getRunCostEnvelope`): `runCostEnvelopeFromDeployment(await client.readDeployment(token))` — same path settings already use.
3. **Page** (`app/new/page.tsx`): loads envelope via `getRunCostEnvelope`; filters members by asker `riskTier`; depth options and attempt disclosure render from `member.depth` / `member.maxModelAttempts`; `envelopeError` surfaces fetch/projection failure to the user; submit uses `selectedEnvelopeMember.depth` only when a ruled member is selected (`ready` requires it). Surviving `min={1}` on V2-only sliders (branching/concurrency) are unrelated and are not posted into the V3 ask.

**No surviving depth/attempt drift literals on `/new`:** `useState(1)`, `max={1}` on tree depth, and `"up to 9 model attempts"` are absent from `page.tsx`.

**Divergence-sensitive tests (the rework’s critical question):**

| Test | What fails on register↔UI disagreement |
|---|---|
| `v2ui-data-layer.test.ts:420-446` | Deployment fixture with depth `2` / `max_model_attempts: 12` must project exactly `{ depth: 2, riskTier: "standard", maxModelAttempts: 12 }` through **shipped** `runCostEnvelopeFromDeployment` and `getRunCostEnvelope`. Hardcoding `1`/`9` in the adapter fails this test. |
| `v2ui-data-layer.test.ts:448-465` | Empty rows → `RUN_COST_ENVELOPE_UNAVAILABLE`; empty members → `RUN_COST_ENVELOPE_INVALID`. Fallback invention fails here. |
| `v2ui-pages.test.ts:62-67` | Page source must call `getRunCostEnvelope`, reference `maxModelAttempts`, and must **not** re-cement `useState(1)` or `"up to 9 model attempts"`. |

That is a real RED→GREEN for the register-projection seam, not the rev1 freeze-the-literals ratchet. Residual page-test structural limits are ADVISORY-A1 only.

### R3 — process-death stall honestly declared

**Rev1 defect:** handoff claimed stall freedom while process death mid-claim left work `CLAIMED` forever (scheduler is `S00_SCAFFOLD_ONLY`; acceptance never calls `claimNext`).

**Shipped disclosure (handoff, verified present):**

- Names the window: process dies after claim → item remains `CLAIMED` past deadline → UI waits indefinitely.
- Why out of scope: harness starts no scheduler/reaper that calls `claimNext`.
- Closure path: ship and start a scheduler/reaper that reclaims expired claims; lifecycle work outside EXEC-01.

**Static checks this seat re-confirmed:**

- `apps/scheduler/src/index.ts` still contains `S00_SCAFFOLD_ONLY`.
- `acceptance/main.ts` still has no `claimNext(` call.
- Handoff contains the `PROCESS_DEATH_STALL:` declaration and the close-by-reaper sentence.
- Handoff does **not** contain unqualified `"No silent stalls"` / `"no silent stalls"`.
- Handoff no longer says `"until normal expiry/recovery"` (mechanism that does not exist).
- `tests/unit/exec01-rework-contract.test.ts` encodes the above as a regression.

Clean exits (runner reject → R1 reason; timeout/budget exhaustion via runner) remain typed terminals; only abrupt process death is the declared lifecycle residual.

---

## Carry-forward advisories (directive list)

| Advisory | Disposition | Evidence |
|---|---|---|
| Claim expiry sized to one call while a run makes several | **FIXED** | `acceptance/main.ts:191-196`: `claimMs = longestDeadline * maximumRunAttempts` where `maximumRunAttempts` is max of ruled `runCostEnvelope` members’ `max_model_attempts`. |
| Ceremony unbounded `setImmediate` settle-watch | **DEFERRED (honest)** | Still `setImmediate` loop in `acceptance/run-acceptance.ts:164-177`; handoff records ceremony-only hot spin out of EXEC-01 scope with bounded-backoff closure path. |
| Synthetic terminal ordered at work-item creation sequence | **DEFERRED (honest)** | Still `at_sequence: Number(work.created_at_seq)` in `apps/api/src/index.ts` (~442); handoff records unreachable under one-work-item acceptance; multi-work-item must order at failure transition. `apps/api` correctly left outside this rework. |
| Evidence-row language | **FIXED** | Handoff describes expired `CLAIMED` evidence as eligible for future `claimNext` with no recovery-by-expiry alone; not “normal expiry/recovery”. |
| Silence | **None** | Every carried advisory is fixed or named. |

---

## Findings

### BLOCKING

None.

### ADVISORY

#### A1 — `/new` page suite is still structural wiring, not a render-with-fixture divergence test

- **Where:** `tests/unit/v2ui-pages.test.ts:62-67` (source contains / not-contains); contrast `tests/unit/v2ui-data-layer.test.ts:420-465` (behavioral projection).
- **Law / scenario:** rework R2 asked for a test that fails when register and UI disagree. The **adapter/API seam** now does. The page suite proves wiring names and forbids the old literals; it would not catch every hypothetical page that still called `getRunCostEnvelope` but rendered a parallel local constant for the ceiling string.
- **Failing case (theoretical):** a page that assigns `const maxModelAttempts = 9` for copy while still importing the envelope for depth options could pass the page source test while lying about spend; the data-layer fixture test would still protect the projection function itself.
- **Disposition:** ADVISORY. Product path currently binds `selectedEnvelopeMember.maxModelAttempts` for display and submit; R2 product obligation is met. Strengthening would be a DOM/render test with a mocked envelope, not a rework re-open.

#### A2 — Persist-path meta-failure still only stderr; `NO_WORK` still non-terminal

- **Where:** `acceptance/main.ts:95-97` second `.catch` → `ACCEPTANCE_FAILURE_STATE_PERSIST_FAILED`; runner `NO_WORK` resolve path (handoff deferrals).
- **Law / scenario:** goal “no silent stalls” on the **implemented throw path** is fixed (R1). Process death is declared (R3). If `recordTerminalFailure` **rejects**, only stderr is written and work may remain non-terminal. `NO_WORK` without throw is treated as resolved execution.
- **Failing case:** force `recordTerminalFailure` to reject after a runner throw → stderr constant, no UI terminal; or a future path where `executeWorkItem` returns `{ kind: "NO_WORK" }` for a just-enqueued id.
- **Disposition:** ADVISORY / deferred as recorded. Not a re-open of R1/R3 as written; handoff names `NO_WORK` explicitly.

#### A3 — Claim-window fix is conservative but still wall-clock, not per-call observed liveness

- **Where:** `acceptance/main.ts:191-197` (`claimMarginMs: 0`).
- **Law / scenario:** multi-call runs no longer share a one-call claim. The bound is `max_model_attempts × longest organ deadline`, which covers the successful 6-call proof under the ruled 9. It is still an estimate, not a reaper-backed liveness signal.
- **Failing case:** a future envelope with a low ceiling relative to serial full-deadline organ calls could still expire mid-run before any reaper exists — same class as process death until lifecycle work ships.
- **Disposition:** ADVISORY. Directive’s mid-run double-spend hazard under concurrent pollers is substantially reduced; full claim hygiene remains lifecycle scope.

---

## Cleared / not re-litigated (rev1 clearances still hold)

- **Dispatcher design / non-blocking 202 / P8** — `setImmediate` schedule only; substitution only at acceptance root; product still `HatchetDispatcher`.
- **DDD** — `WorkItemRepository.recordTerminalFailure` remains aggregate-owned on `core.work_item`.
- **UI does not invent failure** — live-events / debate page still project stored `FAILED` reason only.
- **Rev3 typecheck honesty** — handoff invalidates the false rev2 root-tsc claim and records the TS2345 RED + matcher GREEN; progress log matches. Not re-run here.

---

## Test-quality note (rev3)

| Suite | Real entry point? | Fails for the right reason? |
|---|---|---|
| `acceptance-dispatcher.test.ts` | Yes — constructs shipped `AcceptanceDispatcher` | Yes — wrong reason string / missing typed code fails |
| `v2ui-data-layer.test.ts` envelope cases | Yes — `runCostEnvelopeFromDeployment` / `getRunCostEnvelope` | Yes — wrong projection or silent fallback fails |
| `v2ui-pages.test.ts` envelope case | Source wiring only | Partial — forbids old literals; see A1 |
| `exec01-rework-contract.test.ts` | Source + handoff text for R3 declaration | Yes for “undeclared stall claim returns”; does not execute a crash |

No tautological “always green” constants observed on the R1/R2 behavioral tests.

---

## Scope / seat hygiene

- **Wrote only:** `docs/missions/2026-08-06-v3-programming/reviews/exec01-grok-rev3.md`
- **Did not mutate:** product paths (`acceptance/main.ts`, `apps/v2-ui/**`, tests, board, git)
- **Did not read:** any Opus rev3 dual-diamond verdict
- **Did not re-run:** full gate matrix (orchestrator already greenlit rev3)

## Comments / handoff cursor

Author handoff claims treated as hypotheses; R1–R3 and carried advisories verified in source as above. Handoff comment cursor (rev3 gate + REWORK ACKNOWLEDGED) noted but not independently re-polled from the board in this seat.
