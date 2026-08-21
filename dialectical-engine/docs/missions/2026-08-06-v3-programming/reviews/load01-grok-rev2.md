# LOAD-01 dual-diamond review — Grok lens (rev2)

**Ticket:** `t_4020ac7b` · **Board:** `debateai-v3`  
**Reviewer:** Grok (independent read-only dual-diamond lens; DR-153)  
**Date:** 2026-08-13  
**Scope of this rev:** **only** Grok rev1 **B1** — XREV-01 A-8 production Hatchet hang / AcceptanceDispatcher causal-false claim. J1–J4 and Opus findings are **not** re-litigated.  
**Prior Grok verdict (rev1):** `reviews/load01-grok-rev1.md` — **BLOCKED** on B1.  
**Handoff (inventory pointer only):** `handoffs/LOAD-01-codex-handoff.md` (Rev2 rework outcome § GROK-B1).  
**Law:** goal packet deliverable (4); XREV-01 A-8; DR-165 hang class (dead-in-practice run still treated as generating).  
**Mode:** read-only product judgment. Product / runtime sources not edited for the verdict (one temporary hang-kill mutation was applied and **restored** during this seat’s verification). Did not read any peer (Opus) LOAD-01 verdict.  
**Focused re-run (this seat):** `pnpm vitest run tests/unit/load01-production-terminal.test.ts` → **1 file / 1 test GREEN**.  
**Hang-kill mutation (this seat):** remove production catch’s `recordTerminalFailure` call → same test **RED** (`Number of calls: 0`); restore → **GREEN** again.

## Verdict

**APPROVED**

Grok rev1 **B1 is CLOSED**. On the standing production Hatchet path, a mid-execution throw from `executeWorkItem` is caught inside `declareHatchetWalkingSkeletonTask`’s task `fn`, recorded as work `FAILED` with a public typed reason (`RUNNER_EXECUTION_FAILED:<domain-code>` / `RUNNER_EXECUTION_FAILED:UNEXPECTED_ERROR`), and only then rethrown. Production bootstrap wires a real `WorkItemRepository` as the failure recorder. A focused test drives the **shipped** production task entry and fails if the recorder is not called with that typed reason. AcceptanceDispatcher remains ceremony-only; it is no longer cited as the production terminal pipe.

Nothing found **BLOCKING** on the B1 contract. Residual notes below are **ADVISORY** only and do not re-open B1.

---

## B1 decision table (this seat only)

| # | Claim under test | Judgment | One-line evidence |
|---|---|---|---|
| 1 | Production Hatchet task `fn` catches mid-execution throw | **PASS** | `try/catch` around `executeWorkItem` in `declareHatchetWalkingSkeletonTask` (`apps/runner/src/index.ts:1397–1413`) |
| 2 | Catch records typed FAILED via `recordTerminalFailure` before rethrow | **PASS** | `recordTerminalFailure({ runId, workItemId, reason })` then `throw error` (`:1404–1412`); fail-loud if not recorded (`RUNNER_FAILURE_STATE_NOT_RECORDED`) |
| 3 | Reason family is production `RUNNER_EXECUTION_FAILED:*`, not acceptance-only prefix | **PASS** | `runnerTerminalFailureReason` → `RUNNER_EXECUTION_FAILED:${code}` or `…:UNEXPECTED_ERROR` (`:1378–1382`); acceptance still uses `ACCEPTANCE_EXECUTION_FAILED:*` (`acceptance/main.ts:71–75`) |
| 4 | Standing bootstrap wires a real recorder (not dead composition) | **PASS** | `apps/runner/src/main.ts:40–42` — `failures: new WorkItemRepository(pool)` |
| 5 | Repository actually marks work FAILED + terminal_reason | **PASS** | `WorkItemRepository.recordTerminalFailure` updates `state='FAILED'` + `terminal_reason` (`packages/battery/src/index.ts:391–409`) |
| 6 | Hang-killing test drives shipped production task entry | **PASS** | `tests/unit/load01-production-terminal.test.ts` calls real `declareHatchetWalkingSkeletonTask`, mid-review `NODE_REVIEW_UNAVAILABLE` reject, asserts recorder args |
| 7 | Test fails if catch does not call the recorder | **PASS** | This seat: mutation `recorded = true` without call → RED `Number of calls: 0`; restored |

---

## What rev1 B1 required

From `reviews/load01-grok-rev1.md` § BLOCKING B1 / J5:

1. On the **standing production path** (Hatchet), a mid-review `NODE_REVIEW_UNAVAILABLE` (or equivalent loud stop) throw must become work `FAILED` with a typed reason — not leave the work non-terminal so the new run projection stays loading forever.
2. Citing `AcceptanceDispatcher.catch → recordTerminalFailure` as the production terminal was **causally false** (acceptance ceremony only).
3. Smallest rework: catch at Hatchet task (or equivalent runner-internal terminal) + a test that drives the **shipped production entry**, not only a pre-FAILED page fixture.

Page-only FAILED presentation (rev1 J2) was already PASS and is **not** re-judged here.

---

## Production task site (independent re-read)

### Task wrapper — catch + typed reason + rethrow

`declareHatchetWalkingSkeletonTask` (`apps/runner/src/index.ts:1384–1416`):

```ts
fn: async (dispatch: { runId: string; workItemId: string }) => {
  try {
    const result = await input.runner.executeWorkItem(dispatch.workItemId);
    return result.kind === "COMPLETED"
      ? { kind: result.kind, answerId: result.answerId }
      : { kind: result.kind };
  } catch (error) {
    const recorded = await input.failures.recordTerminalFailure({
      runId: dispatch.runId,
      workItemId: dispatch.workItemId,
      reason: runnerTerminalFailureReason(error)
    });
    if (!recorded) {
      throw new TypedDomainError("RUNNER_FAILURE_STATE_NOT_RECORDED", dispatch.workItemId);
    }
    throw error;
  }
}
```

Reason helper (`:1378–1382`):

| Input | Public reason |
|---|---|
| `TypedDomainError` (e.g. `NODE_REVIEW_UNAVAILABLE`) | `RUNNER_EXECUTION_FAILED:NODE_REVIEW_UNAVAILABLE` |
| Non-typed throw | `RUNNER_EXECUTION_FAILED:UNEXPECTED_ERROR` |

This is the EXEC-01 / handoff production family (`RUNNER_EXECUTION_FAILED:*`), **not** the acceptance-only `ACCEPTANCE_EXECUTION_FAILED:*` prefix.

### Standing composition wires a real recorder

`apps/runner/src/main.ts:40–42`:

```ts
const task = declareHatchetWalkingSkeletonTask({ client: hatchet, runner,
  failures: new WorkItemRepository(pool),
  workflowName: environment.HATCHET_WORKFLOW_NAME, engineRetries: environment.HATCHET_ENGINE_RETRIES });
```

`WorkItemRepository.recordTerminalFailure` (`packages/battery/src/index.ts:391–409`) requires a non-empty reason and sets `core.work_item.state = 'FAILED'` with `terminal_reason = $3` under the open-work predicates. Once FAILED, the LOAD-01 run projection path (already judged PASS as rev1 J2) can surface typed failure instead of infinite generating.

### Causal path after rework (B1 closed)

```text
Hatchet task fn
  → executeWorkItem
  → mid-review throw NODE_REVIEW_UNAVAILABLE
  → catch: recordTerminalFailure(
        reason = RUNNER_EXECUTION_FAILED:NODE_REVIEW_UNAVAILABLE
      )
  → work_item FAILED + terminal_reason
  → rethrow (engine may still retry; state is already terminal for projection)
  → readLoadingProjection → FAILED + reason
  → getDebateServer → kind: "failed"  ✓  (not infinite loading)
```

### AcceptanceDispatcher remains ceremony-only (rev1 disposition held)

| Path | Role | Reason prefix |
|---|---|---|
| `declareHatchetWalkingSkeletonTask` + `main.ts` | **production** | `RUNNER_EXECUTION_FAILED:*` |
| `AcceptanceDispatcher` (`acceptance/main.ts:77–99`) | acceptance ceremony / test API | `ACCEPTANCE_EXECUTION_FAILED:*` |

Rev1’s “causal-false if AcceptanceDispatcher is cited as production” note stays dispositioned: production no longer depends on that catch. Ceremony may keep its own mirror; that is not a second product gate.

---

## Hang-killing test (this seat)

**File:** `tests/unit/load01-production-terminal.test.ts`

Drives the **exported** `declareHatchetWalkingSkeletonTask` with:

- a client double that captures the real registered task `fn`;
- runner that rejects with `TypedDomainError("NODE_REVIEW_UNAVAILABLE", …)` (mid-review loud-stop class);
- `failures.recordTerminalFailure` spy.

Assertions:

1. task `fn` still rethrows / rejects with `code: "NODE_REVIEW_UNAVAILABLE"`;
2. `recordTerminalFailure` called with  
   `{ runId, workItemId, reason: "RUNNER_EXECUTION_FAILED:NODE_REVIEW_UNAVAILABLE" }`.

### This-seat results

| Probe | Result |
|---|---|
| GREEN | `pnpm vitest run tests/unit/load01-production-terminal.test.ts` → **1 passed** |
| Mutation RED | Replaced catch recorder call with `const recorded = true` (no call) → **failed** `expected "vi.fn()" to be called … Number of calls: 0` |
| Restore GREEN | Original catch restored → **1 passed** again; no `MUTATION` marker left in source |

Handoff’s claimed GROK-B1 mutation result matches what this seat observed; handoff was treated as hypothesis until re-verified.

---

## Residual advisories (do not re-open B1)

### A1 — Engine retries after terminal record

The catch rethrows after a successful `recordTerminalFailure`. Hatchet `engineRetries` may still retry the task. That is outside the B1 hang contract: the work item is already `FAILED` with a reason, so the run projection leaves the infinite-loading class. Whether retries after FAILED are desirable is an orthogonal runner/ops question.

### A2 — Test covers typed mid-review reject, not every throw class

The focused production-terminal test asserts the `TypedDomainError` / `NODE_REVIEW_UNAVAILABLE` path. The helper also maps unexpected errors to `RUNNER_EXECUTION_FAILED:UNEXPECTED_ERROR`; a dedicated unexpected-error call assertion is not required to close B1 (A-8 named the mid-review loud stop).

### A3 — Live standing Hatchet + browser not re-run here

Environment may not exercise a standing Hatchet worker end-to-end. B1’s bar (per goal / plan) is the **production task site** + unit kill of the hang path — both closed in this seat.

---

## Explicit non-judgments (out of scope for this rev)

- J1–J4 (generating SSR, already-FAILED UI, missing 404, asker ownership) — left at rev1 **PASS**.
- Opus B1–B4 (run_state labels, terminal UI dual-path, ownership fixture, page `notFound` behavior) — not opened.
- Full suite / acceptance / typecheck / lint gates — not required for B1 closure.

---

## Evidence index

| Artifact | Role |
|---|---|
| `apps/runner/src/index.ts:1378–1416` | `runnerTerminalFailureReason` + production Hatchet task catch/record/rethrow |
| `apps/runner/src/main.ts:40–42` | standing `WorkItemRepository` failure wiring |
| `packages/battery/src/index.ts:391–409` | `recordTerminalFailure` → work `FAILED` + `terminal_reason` |
| `acceptance/main.ts:71–99` | ceremony-only mirror (`ACCEPTANCE_EXECUTION_FAILED:*`) — contrast only |
| `tests/unit/load01-production-terminal.test.ts` | hang-kill on shipped production task `fn` |
| `reviews/load01-grok-rev1.md` | prior B1 definition (XREV A-8 production hang) |
| This-seat GREEN log | implementer scratch `load01-production-terminal.vitest.log` |
| This-seat RED mutation log | implementer scratch `load01-production-terminal-mutation.red.log` |
| This-seat path audit | implementer scratch `load01-grok-rev2-audit.txt` |

---

## Bottom line

**APPROVED.** Grok rev1 B1 is closed on the production Hatchet path: mid-execution runner throws are caught at `declareHatchetWalkingSkeletonTask`, recorded as typed work `FAILED` with `RUNNER_EXECUTION_FAILED:*`, rethrown only after that record, and wired from standing `main.ts` through a real `WorkItemRepository`. The focused production-terminal test kills removal of that recorder call. AcceptanceDispatcher is no longer a false production citation for A-8. This seat does not re-open J1–J4 or Opus findings.
