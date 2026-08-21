# EXEC-01 dual-diamond review — Grok lens (rev1)

**Ticket:** `t_6fae713b` · **Author:** Codex (gpt-5.6-sol)  
**Reviewer:** Grok (independent read-only lens)  
**Date:** 2026-08-11  
**Inputs verified against source, not handoff trust:** review packet, Codex handoff, goal packet, CODING-LOOP-PROTOCOL (TDD/DDD/SOLID/P1–P18/DR-115/AC-76), decisions-ledger DR-149..DR-153, inventory files listed below.

## Verdict

**APPROVED**

The forever-QUEUED defect class is closed on the acceptance throw path: a non-blocking acceptance-root dispatcher drives the shipped runner, and rejected execution records a typed work-item terminal that the API projects and the UI renders without inventing a reason. Product code carries no acceptance-mode branch. Residual risks (hardcoded ruled UI numbers, discarded root-cause text, process-death / meta-failure stalls) are real but advisory under the laws as written; they do not re-open the ticket’s primary failure mode on the implemented error path.

## Required-check disposition

| Check | Result | Notes |
|---|---|---|
| Non-blocking dispatch vs hidden await / swallowed failures | **PASS** (advisory residual below) | `setImmediate` schedules work; unit test proves `dispatch` returns before `executeWorkItem` runs |
| P8 acceptance-only substitution (no product mode branch) | **PASS** | Substitution only in `acceptance/main.ts`; product still `HatchetDispatcher` |
| DDD ownership of terminal failure on work aggregate | **PASS** | `WorkItemRepository.recordTerminalFailure` in `battery` (owner of `core.work_item`) |
| DR-115 no invented terminal/reason/UI failure | **PASS** (advisory on reason coarseness) | UI/API project stored reason; constant reason is typed, not a fabricated success |
| AC-76/DR-039 depth `1` and “up to 9” register-sourced vs hardcoded | **ADVISORY** | **HARDCODED literals** in `/new` (not register-read); values currently match seed |
| Runner throw/timeout/death → typed terminal | **PASS throw**; **ADVISORY hang/death/persist-fail** | Throw path records FAILED; process death / hang / second-catch swallow leave residual stall |
| TDD RED honesty vs pasted output | **PASS unit structure**; **ADVISORY-UNCERTAIN live RED paste** | Unit tests would fail for the stated reasons; live DDL RED is consistent with migration but not re-run here |
| Evidence DB rows safe residue | **PASS** | Leaving evidence correct; FAILED rows terminal; pre-ticket row inert |

## Independent verification evidence (this seat)

Focused unit tests re-run 2026-08-11:

```text
pnpm vitest run tests/unit/acceptance-dispatcher.test.ts \
  tests/unit/v2ui-live-events.test.ts tests/unit/v2ui-pages.test.ts
Test Files  3 passed (3)
Tests  33 passed (33)
```

Architecture edge audit:

```text
pnpm audit:architecture
{"edgeRowsChecked":27,"violations":[]}
```

Live stack / ceremony re-run / DB probes from the handoff were **not** re-executed in this seat. Those handoff claims remain hypotheses with static + unit support only (marked where relevant).

---

## Findings

### BLOCKING

None.

### ADVISORY

#### A1 — `/new` depth and attempt ceiling are HARDCODED, not register-sourced (AC-76/DR-039 drift class)

- **Where:** `apps/v2-ui/app/new/page.tsx:33-34` (`useState(1)`), `:296-302` (`min={1}` `max={1}`), `:353-354` (`up to 9 model attempts`); frozen by `tests/unit/v2ui-pages.test.ts:62-65`.
- **What:** The ruled envelope is `{standard, depth 1, max_model_attempts 9}` in `acceptance/seed-register.ts:173-179`, but the UI does not read the register (or any deployment projection of it). It embeds `1` and `9` as source literals.
- **Law / scenario:** AC-76/DR-039 / P8 (“source-literal selection is a defect by definition”). A future V ruling that changes the envelope leaves the form default/disclosure silently wrong while the API continues to refuse from the real register.
- **Concrete failing case:** V changes `runCostEnvelope` to depth `2` / `max_model_attempts: 12`. UI still posts depth `1` and advertises “up to 9” until someone edits the literals; the unit test still passes because it asserts the frozen strings.
- **Disposition:** Not blocking for EXEC-01’s stated deliverable (“default to the only ruled value” / close the depth-3 500 trap) — the literals currently match the ruled members and the slider cannot select refused depths. Drift remains the defect class named in the review packet. Say plainly: **HARDCODED, not register-sourced.**

#### A2 — Failure reason constant masks the observed root cause (DR-115 coarseness)

- **Where:** `acceptance/main.ts:81-84` — `.catch(() => this.failures.recordTerminalFailure({ ..., reason: "ACCEPTANCE_EXECUTION_FAILED" }))` discards the rejection value.
- **What:** Every async reject becomes the same typed reason. The failure *is* real and recorded; the underlying cause (provider down, typed domain error, claim bug) is not persisted.
- **Law / scenario:** DR-115 prefers typed loud truth over defaults. The constant is a typed observed class (“acceptance execution failed”), not a fabricated terminal success, but it is coarser than the thrown error.
- **Concrete failing case:** Unreachable provider vs `SCORING_OPERATOR_UNRESOLVED` both surface only `ACCEPTANCE_EXECUTION_FAILED` in SSE/UI — operator cannot distinguish from the served reason alone.
- **Disposition:** Advisory. Stall is avoided; triage fidelity is reduced.

#### A3 — Residual silent stall paths remain outside the throw path

- **Where:** `acceptance/main.ts:80-87` (fire-and-forget + second `.catch` → stderr only); runner `NO_WORK` at `apps/runner/src/index.ts:304-305` (resolved, not rejected — dispatcher ignores); acceptance stack has no `job:reaper`.
- **What:**
  1. If `recordTerminalFailure` itself rejects, only `ACCEPTANCE_FAILURE_STATE_PERSIST_FAILED` is written to stderr; work can remain `READY`/`CLAIMED`.
  2. If `executeWorkItem` returns `{ kind: "NO_WORK" }` without throwing, no failure is recorded.
  3. Process death mid-run leaves `CLAIMED` (or reclaimable) work with no re-dispatch and no acceptance reaper writing `FAILED`; SSE only projects `state = 'FAILED'`.
- **Law / scenario:** Goal packet “dead run must never sit QUEUED forever” / review packet process-death check. Throw path is fixed; hang/death/meta-failure are not.
- **Concrete failing case:** Kill the acceptance API process after HTTP 202 while the work item is `CLAIMED` → no `run.terminal` projection, UI has no typed failure, work never settles under the acceptance composition.
- **Disposition:** Advisory for this ticket’s implemented throw-path fix; full process supervision / reaper is outside the acceptance composition as shipped.

#### A4 — TDD live RED paste not independently re-proven; unit RED structure is honest

- **Where:** Handoff RED claims; progress log `handoffs/EXEC-01-progress.log:2-6`; design after live RED at battery `recordTerminalFailure` + API projection `apps/api/src/index.ts:401-444`.
- **What:** Unit tests would fail without `AcceptanceDispatcher` and without preserving `terminalFailure` reason — structure is RED-capable. Live claim that inserting wire kind `run.terminal` hit `run_progress_event_kind_check` is **consistent** with `migrations/0014_s11.sql:51-53` / `0000_s00.sql:72` (closed kind set has `TERMINAL`, not `run.terminal`). This seat did not re-run the live DDL failure or see machine-captured RED logs beyond the handoff paste.
- **Law / scenario:** CODING-LOOP-PROTOCOL TDD — real output pasted, never claimed.
- **Concrete failing case:** If the live RED were narrated without occurrence, the final design still matches a real constraint, but the chronology would be unproven.
- **Disposition:** Advisory-uncertain on live paste authenticity only; not a product defect.

#### A5 — Evidence rows left in the live DB are correct residue

- **Where:** Handoff disposition for `75383998…` (pre-ticket forever-queued), `63f3cd76…` (live RED), `a317e588…` (typed GREEN failure).
- **What:** Leaving evidence without deleting product data is correct under DR-115 / non-deletion norms. Pre-ticket row remains non-terminal by design (historical proof of the bug). FAILED rows are typed terminals and will not re-execute. They do not rewrite standing configuration; they can appear in any query that lists incomplete or failed runs.
- **Law / scenario:** Review packet evidence-safety check.
- **Concrete failing case:** A later ceremony that asserts “exactly one incomplete work item” or “empty answer index growth” without filtering by run id could be confused — operational hygiene, not poison of register/API.
- **Disposition:** Pass with advisory operational awareness; no change required for approval.

---

## Check-by-check source proof

### 1. Non-blocking dispatch

```71:88:acceptance/main.ts
export class AcceptanceDispatcher implements Dispatcher {
  ...
  async dispatch(input: { readonly runId: string; readonly workItemId: string }): Promise<void> {
    setImmediate(() => {
      void this.runner.executeWorkItem(input.workItemId).catch(() => this.failures.recordTerminalFailure({
          ...input,
          reason: "ACCEPTANCE_EXECUTION_FAILED"
        })).catch(() => {
          process.stderr.write("ACCEPTANCE_FAILURE_STATE_PERSIST_FAILED\n");
        });
    });
  }
}
```

- `dispatch` does not `await` the runner; `PostgresAskApplication.submit` awaits only `dispatch` then returns `{ status: "QUEUED" }` (`apps/api/src/index.ts:301-302`).
- Unit proof: `tests/unit/acceptance-dispatcher.test.ts:13-18` — after `await dispatch`, `executeWorkItem` has not been called yet; it runs under `vi.waitFor`.

### 2. P8 / no product mode branch

- `AcceptanceDispatcher` exists only under `acceptance/`.
- Grep of `apps/` and `packages/` finds no acceptance-mode branch, no `NoopDispatcher`, no `AcceptanceDispatcher` import.
- Product composition: `apps/api/src/main.ts` still constructs `HatchetDispatcher`.
- Acceptance composition root: `acceptance/main.ts:231` wires `new AcceptanceDispatcher(runner, new WorkItemRepository(input.pool))`.
- Ceremony no longer bypasses the dispatcher: `acceptance/run-acceptance.ts:163-177` and `acceptance/ceremony.test.ts:248-258` poll DB work state.

### 3. DDD — terminal failure ownership

- `packages/battery/src/index.ts:391-409` — `WorkItemRepository.recordTerminalFailure` owns the transition on `core.work_item` (package ownership per `03-module-design.md` §9.2).
- Invariants at the write: non-empty reason; `state <> 'DONE'`; `settled_attempt_id IS NULL`; sets `FAILED` + `terminal_reason`.
- Parallel to existing `failFromExhaustedAttempt` — not an anemic cross-context setter from API/UI.

### 4. DR-115 — no invented terminal / reason / UI failure

- Persist: only after real reject (or budget-exhaust path inside runner).
- Project: `apps/api/src/index.ts:436-444` maps `FAILED` work rows to wire `run.terminal` with `reason: work.terminal_reason` (read-time projection after live RED; avoids illegal `run.terminal` kind insert — consistent with DDL).
- UI: `liveEvents.ts:89-95` sets `terminalFailure` only when payload `state === "FAILED"`, reason from payload; `DebatePageClient.tsx:550-553` renders that string or clears error — does not invent `ACCEPTANCE_EXECUTION_FAILED` client-side.
- DDL: `core.work_item` requires `terminal_reason IS NOT NULL` when `state = 'FAILED'` (`migrations/0000_s00.sql:112`).

### 5. AC-76/DR-039 — depth and attempts

- Register (ruled): depth `1`, `max_model_attempts: 9` (`acceptance/seed-register.ts`).
- UI: hardcoded (A1). Goal deliverable met for trap closure; law letter on unruled invention not broken (values are ruled); drift class remains.

### 6. Stall failure mode

- Throw → `recordTerminalFailure` → `FAILED` + reason → SSE projection → UI. Covered by unit test `acceptance-dispatcher.test.ts:21-33` and live-events reason preservation test.
- Residuals: A3.

### 7. TDD honesty

- Progress log timestamps RED→GREEN for dispatcher, UI reason, live DDL, cost copy.
- Unit tests are capable of failing for the right reason (constructor missing; reason undefined; missing cost string).
- Live RED not re-executed here (A4).

### 8. Evidence rows

- Disposition accepted (A5). No product data deletion required or claimed.

---

## Test quality note

New/updated tests exercise real shipped entry points (`AcceptanceDispatcher`, `applyRunEvent`, page source for `/new`). Gaps: no unit test that `recordTerminalFailure` is invoked when `executeWorkItem` resolves `NO_WORK`; no test that second-catch persist failure leaves non-terminal work; `/new` test cements literals rather than register parity (A1).

## Scope / seat hygiene

- This seat wrote only `docs/missions/2026-08-06-v3-programming/reviews/exec01-grok-rev1.md`.
- No product source edits, no git operations, no board mutations.
- Did not read any Opus dual-diamond verdict.

## Comments / handoff cursor

Author handoff claims treated as hypotheses; primary product claims above verified in source + focused unit/architecture runs. Live multi-minute settlement proof and full 407-test suite were not re-run in this seat; they are not required to dispose the law surface given static proof of the critical paths.
