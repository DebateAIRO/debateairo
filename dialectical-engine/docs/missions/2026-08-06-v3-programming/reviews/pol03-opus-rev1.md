# POL-03 dual-diamond review — Opus 5 lens, rev 1

**Ticket:** `t_5faad0ce` · **Board:** `debateai-v3` · **Goal packet:**
`goal-packets/POL-03-codex-goal.md` · **Handoff:**
`handoffs/POL-03-codex-handoff.md` · dual diamond (DR-153); Grok's lens
(`pol03-grok-rev1.md`) already greenlit — this verdict closes the diamond.

**Mode:** read-only except this file. Every mutation below was applied to the
real `packages/db/src/index.ts`, run against the real enforced suite, and
restored **md5-identical** (`56b20f6e7ce36e29b90e59dd5800c8e2` before and
after). I did not read Grok's verdict until after forming my own on the source.

## VERDICT: APPROVED

The stack-killer is dead, and it is dead for the right reason. `createPool`
previously returned a bare `PgPool` with **zero** `error` listeners; a
backend/idle-client failure under a live pool is then an uncaught
EventEmitter error, which is process death — the shape of yesterday's three
stack deaths. The fix attaches the listener at construction, records the first
failure as sticky terminal typed state, prints it loudly, and refuses all
subsequent pool work with that same `TypedDomainError/DATABASE_POOL_FAILED`.
No retry, no reconnect, no timer, no fabricated health, no swallow.

No BLOCKING findings. Four ADVISORY items below, one of which (A1) is worth
the worker's attention because it names a real hole in the *fast* half of the
ratchet.

---

## (a) The process survives a pool-level error — proven by a real backend kill

**PASS.** Re-run in this review, real command, real embedded PostgreSQL 18.4:

```text
$ npx vitest run tests/unit/pol03-pool-resilience.test.ts tests/integration/pol03-pool-resilience.test.ts
 ✓ does not mislabel an ordinary SQL failure as a pool failure
 ✓ survives an idle backend termination and reports in-flight and subsequent failures typed 474ms
 ✓ keeps a child process alive and rejects subsequent queries typed after an idle pool error 111ms
 Test Files  2 passed (2)
      Tests  3 passed (3)
```

Live PostgreSQL evidence printed by that run — this is a **real backend being
killed under a live pool**, not a mock:

```text
[S00 DB embedded] ... [19105] FATAL:  terminating connection due to administrator command
[S00 DB embedded] ... [19105] STATEMENT:  SELECT pg_sleep(30)
[S00 DB embedded] ... [19107] FATAL:  terminating connection due to administrator command
```

I checked the reproduction against the goal packet's demand line by line
(`tests/support/poolFailureChild.ts:37-64`):

| Demanded | What the fixture actually does |
|---|---|
| child process | `poolFailureHarness.ts:10` — `spawn(process.execPath, ["--import","tsx", child])`, separate process, exit code observed |
| live pool | `createPool(connectionString)` against the real test DB, plus a **second** pool used only as the killer |
| kill a real backend | `SELECT pg_backend_pid()` on a checked-out client → `pg_terminate_backend($1)` from the killer pool, asserted `terminated === true` |
| **active** backend, not just idle | the kill lands *during* an in-flight `SELECT pg_sleep(30)` (`:47-50`) |
| **idle** pooled backend too | second client checked out, pid captured, `release()`d back to the pool, *then* terminated (`:53-56`) |
| assert SURVIVAL | `tests/integration/…:22` — `expect(child.exitCode).toBe(0)` |
| assert TYPED subsequent | `:24-34` — receipt requires **both** `inFlightError` **and** `subsequentError` = `{name:"TypedDomainError", code:"DATABASE_POOL_FAILED"}` |
| assert LOUD | `:23` — stderr must contain `[DATABASE_POOL_FAILED] PostgreSQL pool operation failed: terminating connection due to administrator command` |

Both halves of the packet's "assert the process SURVIVES **and** subsequent
queries fail TYPED" are present, and the in-flight leg is a bonus the packet
did not require.

## (d) Mutation-argue: removing the listener fails the new test

**PASS — and it fails in both files.** MUT-1: delete the `pool.on("error", …)`
block from the real `createPool`, change nothing else.

```text
 ✓ does not mislabel an ordinary SQL failure as a pool failure
 × survives an idle backend termination and reports in-flight and subsequent failures typed
 × keeps a child process alive and rejects subsequent queries typed after an idle pool error
AssertionError: node:events:497
Error: POL03_SIMULATED_IDLE_BACKEND_RESET
```

The child dies at `node:events:497` — the uncaught-EventEmitter-error throw
site — with a non-zero exit, exactly the incident. The ratchet is real: the
listener is load-bearing for both the synthetic and the real-backend proof.

## (b) The failure surfaces honestly (DR-115)

**PASS, and I pushed harder than the packet asked.**

MUT-2 is the interesting mutation, because it is the *plausible* bad fix — the
one a hurried worker writes: keep the listener (process survives!), log it, but
never record terminal state. That leaves the pool **secretly dead-or-alive**:
callers get whatever the next connection attempt happens to do.

```ts
// MUT-2 — survives, logs, but records no terminal state
pool.on("error", (error: Error) => {
  console.error(`[${DATABASE_POOL_FAILED}] ${typedPoolFailure(error).message}`);
});
```

Result:

```text
 ✓ does not mislabel an ordinary SQL failure as a pool failure
 ✓ keeps a child process alive and rejects subsequent queries typed after an idle pool error   ← unit PASSES
 × survives an idle backend termination and reports in-flight and subsequent failures typed
AssertionError: expected { survived: true, …(2) } to match object { survived: true, …(2) }
-     "code": "DATABASE_POOL_FAILED",
-     "name": "TypedDomainError",
+     "name": "Error",
```

The real-DB test kills it: after the idle backend was terminated, the mutant
pool silently opened a *fresh* connection and answered `SELECT 1` successfully,
so the child's `expectFailure` threw `POL03_EXPECTED_DATABASE_FAILURE` and the
receipt came back `name:"Error"`. That is precisely "no silent recovery that
fabricates health" being enforced by a test, not by prose. Good.

Remaining honesty checks, all PASS:

| DR-115 property | Evidence |
|---|---|
| Loud | `index.ts:71` `console.error("[DATABASE_POOL_FAILED] …")`; asserted in both fixtures |
| Typed | `TypedDomainError(DATABASE_POOL_FAILED, …)` (`:14-18`), single code upward |
| Sticky, not amnesiac | `terminalFailure ??= …` (`:70`); `query`/`connect` short-circuit on the **same instance** (`:77`, `:98`) |
| No fabricated success | grep of `packages/db/src/index.ts` for `retry\|reconnect\|backoff\|setTimeout\|setInterval\|recreate` → **zero hits** |
| Ordinary SQL not mislabelled | `typedQueryFailure` gates on `08*`, `57P01..03`, transport codes, and connection-termination text only; integration test 1 pins `SELECT pol03_missing_column` → still pg `error` / `42703` |
| In-flight, not just next-call | `wrapClientQueries` (`:39-63`) wired from both `connect` paths (`:104`, `:112`) |

## (c) The change is surgical

**PASS.** `git diff --stat packages/db/src/index.ts` → `114 insertions, 2
deletions`, one production file. The whole delta is: four module-level helpers,
the `error` listener, and `query`/`connect` wrappers on the returned pool. No
new pool class, no size/idle-timeout tuning, no pool manager, no HTTP-layer
edit (`apps/api/` untouched), no migration, no persistence change. The return
type is still `Pool`, so no consumer contract moved. The only non-production
additions are fixtures (`poolFailureChild.ts`, `poolFailureHarness.ts`, two
test files) and a `connectionString` field added to `TestDatabase` that merely
re-exposes a string the harness already built.

**No invented value.** Recovery is explicitly *not* implemented; the pool stays
terminal and says so. That is the correct posture for an un-ruled question —
a reconnect/restart policy is V's to rule, in its own slice.

**Pre-existing dirt correctly disclaimed.** The `readFrozenHead().agentCount`
hunk inside the same file is PANEL/PRO's, and the handoff says so rather than
claiming it.

---

## Gate re-runs (this review, whole tree)

| Gate | Result |
|---|---|
| POL-03 focused | **GREEN** 2 files / 3 tests |
| Full root Vitest (`npx vitest run`) | **GREEN — 65 files / 461 tests, exit 0** |
| Acceptance Vitest | **GREEN — 9 files / 35 tests** |
| Root typecheck `npx tsc --noEmit` | **exit 0, no output** |

Two attributions in the handoff are now stale in the worker's favour and should
be recorded as resolved, not carried as suspicion: the `database.test.ts:768`
maker-count failure (handoff said 458/459) is **gone**, and the three
`apps/runner/src/index.ts` `unservedRoot` TS18048 errors the handoff attributed
to PANEL/PRO are **gone** — root typecheck is clean. POL-03 ships into a green
tree.

---

## ADVISORY

- **A1 — the fast unit test does not, on its own, pin the terminal-typed
  property; only the real-DB test does.** Under MUT-2 the unit test stayed
  GREEN. The reason is a coincidence in the fixture: the emit-mode child points
  at `postgresql://127.0.0.1:1/…`, so its "subsequent" query fails with
  `ECONNREFUSED`, which `typedQueryFailure` maps to the *same*
  `DATABASE_POOL_FAILED` code the terminal short-circuit would have produced.
  The unit test therefore pins **survival** honestly and pins **typedness**
  only accidentally. Consequence: if anyone ever tags the integration file as
  slow/optional, half the ratchet silently evaporates. Cheap fix — point the
  emit-mode child at a reachable DB (or assert the rejection is the *same*
  `TypedDomainError` instance the listener stored), so the unit kills MUT-2 too.
  Not blocking: the integration test exists, runs in the default `vitest run`,
  and does kill it today.

- **A2 — the loud-message assertion is locale-fragile.** The integration test
  requires the literal English string `terminating connection due to
  administrator command`, and `typedQueryFailure`'s regex leans on the same
  wording. PostgreSQL localises server messages via `lc_messages`; SQLSTATE
  `57P01`/`08*` cover the code-bearing paths, but the socket-teardown path that
  arrives with no SQLSTATE is caught by text alone. Under a non-English server
  locale the in-flight leg would degrade to an untyped error and the test would
  fail for the wrong reason. Consider asserting on the code and pinning
  `lc_messages=C` in the embedded fixture.

- **A3 — terminal is permanent for the process lifetime.** After the first pool
  `error`, that `Pool` instance never serves again; recovery means restarting
  the process (or a future V-ratified rebuild policy). This is the right
  non-goal for this slice and the handoff names it honestly, but it is an
  operational fact the runbook must carry: POL-03 converts "process dies" into
  "process lives and refuses DB work" — supervision still has to notice.

- **A4 — `rejectKnownFailure` drops the callback's `client`/`release`
  arguments** (`index.ts:31-34` invokes `callback(failure)` only). A caller
  written as `pool.connect((err, client, release) => { … release(); })` that
  ignored `err` would hit a `TypeError`. Nothing in the repo uses callback-style
  `connect` or `query` (grep across `apps/`, `packages/`, `acceptance/`,
  `tests/`, `tools/` → zero hits), so this is latent only. Passing
  `(failure, undefined, () => {})` would close it.

---

## Summary

| # | Question | Result |
|---|---|---|
| a | Process survives a pool error; child-process repro kills a **real** backend under a live pool and asserts **both** survival and typed subsequent (and in-flight) failure | **PASS** |
| b | Honest surface — loud, typed, sticky; no silent retry; no swallow leaving the pool secretly usable (MUT-2 killed by the real-DB test) | **PASS** |
| c | Surgical — one production file, +114/−2, no retry policy, no pooling redesign, no HTTP layer | **PASS** |
| d | Mutation-argue — removing the listener fails the new tests (child dies at `node:events:497`) | **PASS** |

**VERDICT: APPROVED.** With Grok's greenlight already recorded, the POL-03
diamond is complete and the ticket closes. The four advisories are for the
record and for whoever writes the pool-recovery slice; none of them should hold
this.

---

*Method note: all runs are real commands in the repo working tree. Mutations
MUT-1 and MUT-2 were applied to the real `packages/db/src/index.ts` and the
file was restored byte-identical (md5 `56b20f6e7ce36e29b90e59dd5800c8e2`
verified after the last mutation). No service was restarted, no DB row written,
no git mutation performed, and no repository file other than this verdict was
left changed.*
