# EXEC-01 rework directive — rev 1 → rev 2

**Diamond result (DR-153):** Grok lens **APPROVED** (0 blocking, advisories).
Opus 5 lens **CHANGES REQUESTED** (3 blocking). Both must greenlight, so this
returns to you.

**Read this first, because it is the point:** the two lenses ran independently
and reached the SAME FACTS on all three items — same files, same lines, same
mechanisms. They differed only in severity. Nobody is splitting hairs and no
lens is being over-ruled; you are fixing three things both reviewers found.

Full verdicts: `reviews/exec01-opus-rev1.md` and `reviews/exec01-grok-rev1.md`.
Read both in full. **Reproduce-first is mandatory** (heartbeat v3.2.0 §4): for
each item below, write the RED test that demonstrates the exact reported defect
against current code BEFORE you fix it.

What both lenses cleared, so you do not re-litigate it: the dispatcher design
itself, P8 / no product mode branch, the DDD placement of
`recordTerminalFailure`, the 27-row edge table, the non-blocking 202, and "the
UI does not render a failure it did not receive". The core is sound. Do not
redesign it.

---

## R1 — BLOCKING: the error path throws away the observed cause

**Where:** `acceptance/main.ts:80-87`.

**What:** `.catch(() => …)` binds no error parameter, so the thrown value is
unreachable the instant it is caught. Nine distinct `TypedDomainError`s from the
runner all collapse into one opaque string, and `Fastify({logger:false})` means
nothing is logged either. A runner-thrown domain error leaves **no row anywhere**
carrying its identity.

**Why it is blocking:** this is Defect 1's own anti-pattern — *discarding the
typed code and serving a generic one* — reproduced one layer down, inside the
ticket that exists to fix that exact class of defect.

**The concrete case, from yesterday, in this repo:** DR-151 was minted because a
live run died with `COMPOSITION_UNRESOLVED ("No ratified composition for
mixed")`. That diagnosis — and the six register rows V ratified because of it —
would have been IMPOSSIBLE under this code. The failure would have read
`ACCEPTANCE_EXECUTION_FAILED` and nothing more.

**Fix:** capture the caught error and persist its typed identity with the
failure. `ACCEPTANCE_EXECUTION_FAILED` may remain the outer category, but the
recorded reason must carry the underlying `TypedDomainError.code` when there is
one. DR-115 applies to your own error path: record what was OBSERVED, never a
default that masks it. If a non-TypedDomainError arrives, say that honestly too
rather than flattening it.

## R2 — BLOCKING: AC-76/DR-039 — both numbers are hardcoded, and the test freezes them

**Where:** `apps/v2-ui/app/new/page.tsx:34` (`useState(1)`), `:299-300`
(`min={1} max={1}`), `:354` (`"up to 9 model attempts"`). Frozen by
`tests/unit/v2ui-pages.test.ts:62-65`, which asserts on SOURCE TEXT
(`expect(newPage).toContain("useState(1)")`).

**Both lenses found this independently.** Grok graded it advisory, Opus
blocking; the facts are identical.

**Why it is blocking:** the ruled envelope is one register row
(`acceptance/seed-register.ts`). The UI embeds its contents as literals, so the
two can silently disagree — which is precisely the drift AC-76/DR-039 exists to
forbid. And the test makes it WORSE than untested: it cannot fail when the
register and the UI diverge, and it actively fails anyone who fixes this
properly by reading the register.

**Reading it was available, not blocked:** `apps/v2-ui/lib/api.ts:202` already
calls `readDeployment`, which returns `register.rows`; the settings page already
consumes that path.

**The concrete case:** DR-149(2) and DR-150(5) record that PRO-01 and PANEL-01
are BLOCKED pending a second envelope member. The moment V rules one, the
slider still clamps to 1 and the page still says 9 while a run may spend 15.
Nothing fails. That is a lie shipped to V.

**Fix:** source both the allowed depth(s) and the attempt ceiling from the
register through the existing deployment path. Replace the source-text
assertion with a test that FAILS when the register and the UI disagree — that
is the whole point of the test. If the register cannot be reached at render
time, refuse loudly with a typed absence rather than falling back to a literal.

## R3 — BLOCKING as written; an honest declared deferral CLOSES it

**Where:** the crash path. `apps/scheduler/src/index.ts:88` throws
`S00_SCAFFOLD_ONLY`; the harness never starts the scheduler; nothing calls
`claimNext`.

**What:** three of four exits are clean — reject, timeout and budget-exhausted
all reach typed terminals (verified by the Opus lens). But if the PROCESS DIES
mid-execution, the work item sits `CLAIMED` forever, `events()` yields no
terminal, and `DebatePageClient.tsx:620-630` reconnects forever showing a
debate that is generating and never will.

**Why it is blocking:** not because a reaper belongs in this ticket — it does
not — but because your handoff asserts **"No silent stalls"** with no declared
exception. The reviewer stated explicitly that an explicit declared deferral
would close this finding on re-review.

**Fix:** either bound the crash case, or DECLARE IT — in the handoff's
acknowledged-deferrals section, naming the exact surviving stall window, why it
is out of scope, and what would close it. Do not restate "no silent stalls"
unqualified.

## Carry-forward advisories (fix if you are touching the file; otherwise record)

- **Claim expiry mid-run:** `claimMs` is sized to ONE call's deadline, but the
  successful proof run made 6 calls. Harmless while nothing polls; a
  double-spend hazard the moment anything does.
- **Settle-watch hot spin:** the ceremony's watch is an unbounded
  `setImmediate` loop with no deadline — thousands of SELECTs/sec against the
  runner's own pool.
- **Synthetic terminal ordering:** it is ordered at the work item's CREATION
  sequence. Unreachable today; a live defect the moment PRO-01/PANEL-01 add a
  second work item per run.
- **RED honesty:** the pasted RED (`AcceptanceDispatcher is not a constructor`)
  does not reproduce forever-QUEUED, which DONE WHEN required. Your rev-2 RED
  tests must actually demonstrate the reported defects.
- **Evidence rows:** "until normal expiry/recovery" describes a mechanism that
  does not exist — those rows are first in line for any future `claimNext`.
  Say what is true.

---

## Done when

All three R-items closed with RED→GREEN evidence pasted real, the carry-forward
advisories fixed-or-recorded, every gate green again (root + acceptance suites,
both typechecks, architecture/source/orphan audits), the handoff UPDATED rather
than rewritten (keep rev-1's evidence, add rev-2's), then back to `review` with
comment `REWORK READY FOR HERMES REVIEW — EXEC-01 rev2`.

Same session, same terminal. Return control at the handoff, a genuine blocker,
or an IMPORTANT OPERATION; keep the goal alive and resumable.
