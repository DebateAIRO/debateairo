# EXEC-01 — Opus 5 lens, rev 1

**Ticket:** `t_6fae713b` · **Author:** Codex (gpt-5.6-sol) · **Lens:** Opus 5 (dual diamond, DR-153)
**Date:** 2026-08-11 · **Mode:** read-only (no edits, no git, no board mutation)

## Verdict

**CHANGES REQUESTED** — 3 blocking, 7 advisory.

The core of this change is right and I want to say so plainly before the findings.
`AcceptanceDispatcher` (`acceptance/main.ts:71-89`) is a correct non-blocking
substitution at the acceptance composition root; product code carries no mode
branch (P8 holds — verified by grep, below); `recordTerminalFailure` is placed in
the aggregate that already owns the work-item lifecycle (DDD holds); and
`acceptance/run-acceptance.ts:163-179` genuinely removes the direct-runner bypass
so the ceremony now observes the database source of record instead of masking a
dead worker. That last change is the single most valuable thing in the diff.

What blocks is narrower: the error path drops the observed cause on the floor,
the two register numbers are literals in the UI (and a test now cements them),
and one instance of the ticket's own defect — a work item that reaches no typed
terminal — survives in the crash path while the handoff reports "No silent
stalls" as satisfied.

## What I verified, and what I could not

Verified in-sandbox: I ran the three new unit files —
`tests/unit/acceptance-dispatcher.test.ts`, `tests/unit/v2ui-live-events.test.ts`,
`tests/unit/v2ui-pages.test.ts` — **3 files / 33 tests passed**. The
`run_progress_event_kind_check` constraint the handoff blames for its live RED is
real and does not admit `run.terminal` (`migrations/0014_s11.sql:51-53`: kinds are
`ENVELOPE_CONSUMED, ENVELOPE_STATE, PHASE, TERMINAL, honesty.staleness_trigger_fired`),
so that part of the TDD narrative checks out against the schema.

**Could not verify without the live stack** (embedded PostgreSQL will not start in
this sandbox — SysV shmget denied): the pasted live 202/SSE output, the DB row
states of `75383998…`, `63f3cd76…`, `a317e588…`, the acceptance ceremony suite,
and the full 407-test root run. The orchestrator should run those outside the
sandbox. Every finding below is derived from source, schema, or the dependency
table — none depends on the live run.

---

# BLOCKING

## BLOCKING-1 — The error path discards the observed cause and records a constant in its place

**File:** `acceptance/main.ts:80-87`
**Law:** DR-115 (ABSOLUTE) — "typed loud failure over any default"; also the
goal packet's own diagnosis of Defect 1.

```ts
setImmediate(() => {
  void this.runner.executeWorkItem(input.workItemId).catch(() => this.failures.recordTerminalFailure({
      ...input,
      reason: "ACCEPTANCE_EXECUTION_FAILED"
    })).catch(() => {
      process.stderr.write("ACCEPTANCE_FAILURE_STATE_PERSIST_FAILED\n");
    });
});
```

The `.catch(() => …)` binds no error parameter. The thrown value is not recorded,
not logged, not re-raised — it is unreachable from the moment it is caught. Every
distinct failure collapses to one string, and `buildApi` runs
`Fastify({ logger: false })` (`apps/api/src/index.ts:68`), so there is no server
log either.

The runner throws *richly typed* errors that this code destroys. From
`apps/runner/src/index.ts` alone: `CLAIM_TYPE_COMPOSITION_MAP_UNRESOLVED` (:270),
`JUDGEMENT_POLICY_UNRESOLVED` (:277), `SERVE_POLICY_UNRESOLVED` (:284),
`SCORING_OPERATOR_UNRESOLVED` (:295), `WORK_ITEM_WITHOUT_RUN` (:305),
`COMPOSITION_UNRESOLVED` (:363), `NO_USABLE_JUDGEMENTS` (:371),
`SETTLEMENT_RACE_WITHOUT_WINNER` (:975). Each carries a `TypedDomainError.code`
and a message; all nine become `ACCEPTANCE_EXECUTION_FAILED`.

**Concrete failing case — and it is not hypothetical, it is yesterday.** DR-151
(`decisions-ledger.md:744`) records: *"A live run died with COMPOSITION_UNRESOLVED
('No ratified composition for mixed')"*. That diagnosis — and the six register
rows V ratified because of it — was only possible because the runner's typed code
and message reached a human. Re-run that same failure through this dispatcher and
the entire recorded fact is `ACCEPTANCE_EXECUTION_FAILED`. Nothing in the DB,
nothing in stderr, nothing in the ledger names the claim type. DR-151 could not
have been written.

Note the ledger is not a fallback here. `packages/providers/src/index.ts:245-261`
does record failed *model calls* with `outcome: 'FAILED' | 'TIMED_OUT'`, so a
dead provider leaves a partial trace. But a `TypedDomainError` thrown by the
runner's own logic never reaches the provider gateway and leaves **no row
anywhere**.

This is the same anti-pattern the goal packet indicts as Defect 1 — *"maps every
`TypedDomainError` except `MAKER_INVENTORY_UNSATISFIED` to a bare 500
`INTERNAL_ERROR`, discarding the code"* — reproduced one layer down, in new code,
in the ticket that exists to fix it.

**Minimal close:** bind the error; record `error instanceof TypedDomainError ?
error.code : "ACCEPTANCE_EXECUTION_FAILED"` (`terminal_reason` is free text —
`migrations/0000_s00.sql:108`); write the message to stderr. This is not POL-01's
refusal-mapping refactor and does not touch the shared error handler.

## BLOCKING-2 — AC-76/DR-039: both numbers are HARDCODED, and a test now cements them

**Files:** `apps/v2-ui/app/new/page.tsx:34`, `:298-302`, `:354`;
`tests/unit/v2ui-pages.test.ts:62-65`
**Law:** AC-76/DR-039 — "unruled values are register rows or typed loud failures,
never literals" (`CODING-LOOP-PROTOCOL.md:66`).

The packet asked me to say plainly which it is. **Both numbers are literals in the
UI. Neither is read from the register.**

| What | Where | Value |
|---|---|---|
| depth default | `app/new/page.tsx:34` | `const [depth, setDepth] = useState(1);` |
| depth constraint | `app/new/page.tsx:299-300` | `min={1} max={1}` |
| attempt ceiling | `app/new/page.tsx:354` | `"…may spend up to 9 model attempts…"` — a string literal |

The authoritative source of both is one register row
(`acceptance/seed-register.ts:173-183`):

```ts
rowKey: "runCostEnvelope",
value: { kind: "RUN_COST_ENVELOPE_POLICY", members: [{
  depth_params: { depth: 1 }, risk_tier: "standard", max_model_attempts: 9 }] }
```

**Reading it was available, not blocked.** `apps/v2-ui/lib/api.ts:202` already
calls `client.readDeployment(requireToken(token))`, and
`apps/api/src/index.ts:369-373` returns `register.rows` (`row_key`, `value_json`,
`source_ref`) in that payload. `apps/v2-ui/app/settings/page.tsx` consumes exactly
this path today. The `/new` page is already token-bearing via `AuthGate`
(`app/new/page.tsx:21`). There is no missing capability here.

**Concrete failing case.** DR-149(2) and DR-150(5) both record that PRO-01 and
PANEL-01 are *blocked on V ruling a second envelope member*. The moment V rules
one — say `{standard, depth 2, max_model_attempts 15}` — the register has two
members and this UI does not change: the slider still clamps to `max={1}` so the
ruled depth is unreachable from the form, and the page still tells the user "up to
9 model attempts" while the run may lawfully spend 15. No test fails, no refusal
fires, nothing is loud. A UI that silently misstates what a run will spend against
V's own CLI subscriptions is precisely the drift AC-76 exists to prevent.

**The test makes it worse rather than catching it.** `tests/unit/v2ui-pages.test.ts:62-65`:

```ts
it("defaults to the only ruled depth and makes its nine-attempt cost visible", () => {
  expect(newPage).toContain("useState(1)");
  expect(newPage).toContain("up to 9 model attempts");
});
```

This asserts on **source text**, not behaviour. It cannot fail when the register
and the UI disagree — the only thing it detects is the literal changing. So it
does not protect the invariant it is named for, and it actively **fails** anyone
who fixes this properly by reading the register. That is a ratchet in the wrong
direction.

I note the goal packet did authorise *"Default it to the only ruled value"*, so
depth-1-as-default is not itself the violation — the violation is that the value
and its ceiling are literals with no link to the row that rules them, and that the
handoff's AC evidence (*"`/new` uses only depth 1 and visibly states the
up-to-9-attempt subscription cost"*) presents this as compliance rather than as a
declared deferral. Either read the row, or declare the literal as a dated deferral
that names the drift risk. Silent is the one option AC-76 forecloses.

## BLOCKING-3 — The forever-stall survives in the crash path, and is reported as closed

**Files:** `acceptance/main.ts:71-89`; `apps/scheduler/src/index.ts:88`;
`packages/battery/src/index.ts:306-349`
**Law:** goal packet DELIVERS 3 — *"A dead run must never sit in `QUEUED` forever
— that failure mode is exactly what this ticket exists to kill, so do not
reintroduce it in the error path."*

I traced every exit from dispatch. Three of four are clean; the fourth is not.

| Exit | Outcome |
|---|---|
| Runner rejects | `.catch` → `recordTerminalFailure` → `state='FAILED'` + reason. **Reaches a typed terminal.** ✔ |
| Provider times out | `AbortSignal.timeout` → `PROVIDER_CALL_FAILED` (`providers/src/index.ts:168, 264`) → rejects → same as above. ✔ |
| Attempt budget exhausted | `failFromExhaustedAttempt` → `state='FAILED'`, `terminal_reason='CALL_BUDGET_EXHAUSTED'` (`runner/src/index.ts:328`). ✔ |
| **Process dies mid-execution** | **No terminal. Ever.** ✘ |

**The concrete scenario.** `POST /v1/asks` → 202. `enqueue` writes the row
`state='READY'` (`battery/src/index.ts:253`). `setImmediate` fires;
`executeWorkItem` → `claimById` flips it to `state='CLAIMED'` with a
`claim_deadline` (`battery/src/index.ts:330-333`). The acceptance API process is
then killed — Ctrl-C, OOM, a `next build` into the wrong dist dir, the laptop
sleeping. The row is now `CLAIMED` with a deadline that will pass.

Nothing in this system ever touches it again:

- The only reaper is `apps/scheduler/src/index.ts:88`, which is a scaffold that
  **throws**: `"S00_SCAFFOLD_ONLY: job:reaper implementation belongs to its later slice"`.
- The acceptance harness never starts the scheduler — `grep -rn "scheduler" acceptance/*.ts`
  returns nothing.
- `claimNext` (the polling entry that *would* reclaim an expired claim) is reached
  only via `WalkingSkeletonRunner.executeNext()`, and no loop in the acceptance
  harness calls it. `AcceptanceDispatcher` calls `executeWorkItem` exactly once,
  from the dispatch that created the item.

Result: `core.work_item` stays `CLAIMED` forever, `terminal_reason` stays NULL,
`events()` (`apps/api/src/index.ts:406-412`, which selects `state = 'FAILED'`)
yields no terminal, and `DebatePageClient.tsx:620-630` sees
`runPhase !== "terminal"` and reconnects on an exponential backoff **forever**,
showing V a debate that is permanently generating. That is the original bug,
verbatim, one code path over.

**Why this is blocking rather than advisory:** not because a full crash-recovery
reaper belongs in this ticket — it plainly does not. It is blocking because the
handoff's AC evidence states *"A failing run surfaces typed state rather than
stalling"* and the deferrals section names no exception, so an unclosed instance
of the ticket's own defect is being reported as closed. Either close it (a bounded
startup sweep at the acceptance composition root that fails expired-claim items
with a typed reason is ~15 lines and stays inside P8), or declare it explicitly:
"process death mid-execution leaves the work item CLAIMED with no terminal; there
is no reaper; deferred to <ticket>." One sentence in the handoff resolves this.

---

# ADVISORY

## ADVISORY-1 — The claim expires long before execution finishes

**File:** `acceptance/main.ts:180-183`

```ts
claimMs: longestDeadline,   // = max(JUDGE, COMPOSER, CONFORMANCE deadlineMs)
claimMarginMs: 0,
```

`assertClaimCoversCall` passes only because `claimMs == deadlineMs + 0` exactly
(`battery/src/index.ts:222`). But the claim must cover the *whole work item*, and
the runner makes judge + critic + composer + conformance calls plus up to
`maxRecompose: 2` recompositions — the handoff's own successful run
(`21ece3d7…`) reports `ATTEMPTS [{ count: 6 }]`. So the claim reliably expires
while the work is still live.

Harmless today (single in-process worker, no reaper), but it means the row's
liveness signal is permanently wrong during every successful run, which
contradicts the comment two lines above it — *"The database queue remains the
source of record (P11)"*. It is also a live cost hazard the moment anything else
polls: a second acceptance process or a future reaper would see an expired claim,
legitimately reclaim it, and re-execute a run that is already running, double-
spending V's ruled 9 attempts. Pre-existing (the ceremony used the same settings
when it called the runner directly), but newly load-bearing now that the runner
sits behind a dispatch boundary where nobody watches the result.

## ADVISORY-2 — The ceremony's settle-watch is an unbounded hot spin

**File:** `acceptance/run-acceptance.ts:164-179`

```ts
for (;;) {
  const work = await database.pool.query(/* SELECT state, terminal_reason … */);
  if (state.state === "DONE") break;
  if (state.state === "FAILED") throw new Error(`ACCEPTANCE_RUN_FAILED:${…}`);
  await new Promise<void>((resolve) => setImmediate(resolve));
}
```

Replacing the direct-runner bypass with a DB observation is the right call and I
support it. Two problems with the loop itself:

1. **No deadline and no iteration cap.** If the item never terminalizes — i.e.
   exactly BLOCKING-3 — `runAcceptanceCeremony` hangs forever with no typed
   failure. Under `acceptance/vitest.config.ts` the 120s `testTimeout` bounds it,
   but `run-acceptance.ts` also has a CLI `main()` (bottom of file) that nothing
   bounds. A gate that hangs instead of failing is the same silence class this
   ticket is about.
2. **`setImmediate` is not a poll interval.** This issues a `SELECT` per
   event-loop tick — thousands per second — for the entire duration of a real
   multi-minute model run, against the same default-sized `pg` pool
   (`packages/db/src/index.ts:10-12`, no `max` configured) that the runner needs
   for `withWriteTransaction`. Contention, not deadlock, but it is avoidable.

A deadline plus a ~250 ms interval fixes both.

## ADVISORY-3 — `recordTerminalFailure`'s boolean result is discarded

**Files:** `acceptance/main.ts:81-84`; `packages/battery/src/index.ts:399-409`

`recordTerminalFailure` returns `false` when the guarded UPDATE matches no row
(`WHERE … state <> 'DONE' AND settled_attempt_id IS NULL`). The dispatcher ignores
the return value entirely, so "the failure was not persisted" is indistinguishable
from "the failure was persisted" and is never logged. The benign case is real
(a throw after `settle` already won — `runner/src/index.ts:972-977`), which is why
this is advisory and not blocking. But it means a plumbing bug in `runId` would
also fail silently, and the second `.catch` — the only signal in the whole path —
fires **only** on rejection, never on a `false` return.

## ADVISORY-4 — The synthetic terminal is ordered at the work item's *creation* sequence

**Files:** `apps/api/src/index.ts:438-444`; `apps/v2-ui/lib/v3/liveEvents.ts:89-95`

```ts
at_sequence: Number(work.created_at_seq)   // the item's CREATION seq
```

A terminal event is placed near the *front* of the stream, since `enqueue`
(`apps/api/src/index.ts:295`) runs early in `submit`. Meanwhile the reducer resets
the failure on any later non-FAILED terminal:

```ts
case "run.terminal": return Object.freeze({ ...state, runPhase: "terminal",
  terminalFailure: payloadText(event, "state") === "FAILED" ? payloadText(event, "reason") : null });
```

**Not reachable today** — I checked: `apps/api/src/index.ts:295` is the only
`enqueue` caller in the repo, so there is exactly one work item per run, and a
`TERMINAL` progress row is written only at answer-persist time
(`packages/serve/src/index.ts:1012-1015`), which implies `DONE`, which makes
`recordTerminalFailure` a no-op. So the two cannot co-exist. That is why this is
advisory.

It becomes a live defect the moment a run carries more than one work item —
which is exactly what PRO-01 (per-node defender legs, DR-149(2)) and PANEL-01
(DR-150) are cut to build. A run with one `DONE` item and one `FAILED` item would
then render as a clean success: the FAILED event sorts first, the DONE run's
`TERMINAL` sorts last, and `terminalFailure` is reset to `null`. The UI would hide
a failure it *did* receive. Ordering the synthetic event by a settlement-time
sequence rather than `created_at_seq` closes it cheaply now.

## ADVISORY-5 — The pasted RED does not reproduce the behaviour DONE WHEN asked for

**Source:** handoff "TDD RED → GREEN"; goal packet DONE WHEN

DONE WHEN required *"the RED test that reproduced the forever-QUEUED behaviour
BEFORE the fix, then GREEN."* The pasted RED 1 is:

```
2 failed: TypeError: AcceptanceDispatcher is not a constructor
```

That is a missing-symbol error. It proves the class did not exist; it does not
reproduce forever-QUEUED. The test that genuinely reproduces it is
`acceptance/ceremony.test.ts:249-256` — `vi.waitFor` on
`work_item.state === 'DONE'`, which under `NoopDispatcher` fails on timeout
because the state stays `READY`. That test exists and is good work; its RED is
simply not pasted. Cheap for the orchestrator to close: stash the dispatcher
wiring, run the ceremony file, paste the timeout.

## ADVISORY-6 — "until normal expiry/recovery" describes a mechanism that does not exist

**Source:** handoff, "Acknowledged deferrals and data disposition"

The handoff says `63f3cd76-35ed-48e9-b838-3d946051c1ee` is *"still claimed until
normal expiry/recovery."* There is no expiry and no recovery: the only reaper
throws `S00_SCAFFOLD_ONLY` (`apps/scheduler/src/index.ts:88`) and the acceptance
harness never starts the scheduler. That row is `CLAIMED` permanently.

On the packet's question of whether the evidence rows poison anything: **not
today.** Nothing in the standing stack calls `claimNext`; dispatch uses
`claimById`. But note what happens the moment anything does. `claimNext`
(`battery/src/index.ts:276-281`) selects `state='READY' OR (state='CLAIMED' AND
claim_deadline <= clock_timestamp())` **ordered by `created_at_seq` ascending** —
so `75383998…` (left `READY`, never dispatched) and `63f3cd76…` (expired
`CLAIMED`) are the two *oldest* claimable rows in the live DB and would be picked
up **first**, re-executing two stale runs and spending V's model attempts before
any new ask is served. Leaving them as evidence is defensible; leaving them
undescribed as first-in-line for any future worker is not. Recommend the handoff
say so, or that they be failed with a typed evidentiary reason rather than left
mid-lifecycle.

## ADVISORY-7 — The green architecture audit does not cover the directories this ticket changed

**File:** `tools/orphan-audit/src/index.ts:9-37`

The handoff cites `{"edgeRowsChecked":27,"violations":[]}` as evidence. The 27
rows are correct and complete for what they cover, but the table contains neither
`apps/v2-ui` nor `acceptance` — the two directories carrying most of this diff.
So the audit is green and *silent* about them, which makes the evidence weaker
than it reads. Pre-existing (`apps/v2-ui` arrived with UI-01) and out of scope
here; flagging so the row is not mistaken for coverage it does not provide.

---

# Cleared on inspection

Recording these so the next lens does not re-litigate them.

- **P8 — no acceptance-mode branch in product code. CLEAR.** Grepped
  `packages/`, `apps/api/src`, `apps/runner/src`, `apps/v2-ui/lib`,
  `apps/v2-ui/app` for `ACCEPTANCE`/`NODE_ENV`/`process.env` mode gates. The only
  hits in product code are unrelated (`NEXT_PUBLIC_API_BASE`, an observability
  flag, a verdict-UI flag); the two `acceptance` mentions in `packages/battery`
  and `apps/runner` are prose in comments. The one `NODE_ENV` guard —
  `acceptance/main.ts:154`, rejecting `testOnlyTerminalEvaluator` outside tests —
  sits at the acceptance composition root, exactly where `NoopDispatcher` used to
  live. Substitution is where it belongs.
- **DDD — `recordTerminalFailure` is aggregate-owned, not an anemic setter.
  CLEAR.** `docs/architecture/03-module-design.md:138` gives `battery` *"contract,
  activation and sequencing"*, and :511 names the work-claim rows explicitly as
  battery's. The method sits on `WorkItemRepository` beside `claimNext`,
  `claimById`, `settle`, and `failFromExhaustedAttempt`, guards a real invariant
  (`state <> 'DONE' AND settled_attempt_id IS NULL`), and validates its input
  (`packages/battery/src/index.ts:396-398`). No boundary is reached across; the
  acceptance root depends on the aggregate, not the reverse.
- **27-row edge table. CLEAR** for what it covers (see ADVISORY-7). Row count
  matches `edgeRowsChecked: 27`. No new package edge was introduced —
  `acceptance/` is a composition root and is not an audited row.
- **The 202 is genuinely non-blocking. CLEAR.** `submit` awaits
  `dispatcher.dispatch` (`apps/api/src/index.ts:301`), but `dispatch` only
  schedules a `setImmediate` and resolves (`acceptance/main.ts:80-87`). No hidden
  await on execution. The promise chain is rejection-safe: `void p.catch(a).catch(b)`
  handles both the runner's rejection and the recorder's, so no unhandled
  rejection escapes; and the `setImmediate` callback's only statement calls an
  `async` method, so a synchronous throw cannot crash the process from there.
- **"Does the UI render a failure it did not receive?" — NO. CLEAR.**
  `liveEvents.ts:89-95` sets `terminalFailure` only from a payload that actually
  says `state: "FAILED"`, reads the reason with `payloadText` (absent stays
  absent, never defaulted), and `DebatePageClient.tsx:551-553` renders the banner
  only when `terminalFailure !== null`. The reason surfaced is the one the DB
  stored. My objection in BLOCKING-1 is about what got stored, not about the UI
  inventing anything.

## Bottom line for the orchestrator

BLOCKING-1 and BLOCKING-2 are small, mechanical, and inside this ticket's scope.
BLOCKING-3 is a one-sentence handoff amendment if V would rather defer the reaper
than build it here — I would accept an explicit declared deferral as closing it,
and say so on re-review. None of the three requires rework of the dispatcher
design, which is sound.
