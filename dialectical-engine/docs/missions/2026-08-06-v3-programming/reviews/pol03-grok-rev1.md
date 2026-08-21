# POL-03 dual-diamond review — Grok lens (rev1)

**Ticket:** `t_5faad0ce` · **Board:** `debateai-v3`  
**Reviewer:** Grok (independent read-only dual-diamond lens; DR-153)  
**Date:** 2026-08-12  
**Goal packet:** `docs/missions/2026-08-06-v3-programming/goal-packets/POL-03-codex-goal.md`  
**Handoff (inventory pointer only):** `docs/missions/2026-08-06-v3-programming/handoffs/POL-03-codex-handoff.md`  
**Mode:** read-only. Product / runtime sources not edited. Judged from shipped source and tests, not handoff prose. Did not read any peer (Opus) POL-03 verdict.  
**Orchestrator suite note (honored, not re-litigated):** full suite post-quiet was **65 files / 460 tests all green**. The worker's earlier 458/459 "pre-existing maker-count" attribution is treated as **resolved**, not as residual suspicion about POL-03.

## Verdict

**APPROVED**

The pool-level stack-killer is dead for the shape that killed yesterday's processes. Before this fix, `createPool` returned a bare `PgPool` with zero `error` listeners; node-postgres emits `error` on idle-client/backend failure, and with zero listeners that is an uncaught EventEmitter exception that kills the Node process. The shipped fix attaches a permanent `error` listener, retains the first failure as terminal typed state (`TypedDomainError` / `DATABASE_POOL_FAILED`), logs it loudly to stderr, maps connection-class query failures the same way, and rejects subsequent `query`/`connect` with that same typed state. There is no reconnect, no silent retry, no fabricated health, and no swallow that leaves the pool secretly usable. The child-process path proves both the fast emit-idle RED→GREEN and a real PostgreSQL 18.4 backend kill (active `pg_sleep` + idle pooled backend) with process survival and typed in-flight + subsequent failures.

No BLOCKING findings. Residual notes below are ADVISORY only.

---

## Judgment topics

### 1. Process survival + typed loud surface (DR-115)

**PASS**

**Shipped seam** (`packages/db/src/index.ts:65–121` — `createPool`):

```ts
export function createPool(connectionString: string): Pool {
  const pool = new PgPool({ connectionString });
  let terminalFailure: TypedDomainError | undefined;

  pool.on("error", (error: Error) => {
    terminalFailure ??= typedPoolFailure(error);
    console.error(`[${DATABASE_POOL_FAILED}] ${terminalFailure.message}`);
  });
  // query / connect wrappers: if terminalFailure set → rejectKnownFailure;
  // else map connection-class failures via typedQueryFailure / typedPoolFailure
  return pool;
}
```

| Requirement | Evidence |
|---|---|
| Process does not die from uncaught Pool `error` | Listener is always attached at construction (`pool.on("error", …)`). Zero-listener uncaught path is closed. Unit child emits `error` and exits **0** (not 1). |
| Failure is typed | `typedPoolFailure` → `TypedDomainError` with code `DATABASE_POOL_FAILED` (`index.ts:14–18`, constant at `:9`). |
| Loud, not silent | First (and subsequent) pool errors write `console.error(\`[DATABASE_POOL_FAILED] …\`)` (`:69–72`). Unit + integration assert that exact stderr prefix. |
| Terminal, not secretly dead-but-usable | `terminalFailure ??= …` retains first error; later `query`/`connect` short-circuit via `rejectKnownFailure` (`:76–77`, `:97–98`) with the **same** typed instance. |
| No silent retry / health fabrication (DR-115) | No reconnect loop, no pool replacement, no success invention, no health endpoint. Grep of POL-03 production path: only `DATABASE_POOL_FAILED` / `terminalFailure` / `pool.on("error")` — no `retry`, `reconnect`, or fabricated health. |
| Ordinary SQLSTATE not mislabeled | `typedQueryFailure` (`:20–28`) maps only `08*`, `57P01..03`, transport codes (`ECONNREFUSED`/`RESET`/`EPIPE`/`ETIMEDOUT`), and connection-termination message patterns. Integration: `SELECT pol03_missing_column` still rejects as pg `error` with code **`42703`**, not `DATABASE_POOL_FAILED`. |

**In-flight path:** checked-out clients get `wrapClientQueries` so their `query` failures also pass through `typedQueryFailure` (`:39–63`, wired from `connect` at `:104`, `:112`). Active backend termination during `pg_sleep(30)` is therefore typed, not raw-uncaught.

**Callback + promise surfaces:** both promise `.catch` and callback-style `query`/`connect` are wrapped; terminal reject uses `queueMicrotask` for callbacks (`rejectKnownFailure`, `:30–37`). Consumers keep the `Pool` contract (return type still `Pool`).

**DR-115 bar:** fail closed, fail loud, fail typed — met. The pool is intentionally terminal after an idle-client error; recovery/restart policy is correctly **not** invented here (would be a separate V-ratified value).

---

### 2. Child-process reproduction actually kills a backend under a live pool

**PASS**

This is not a mock-only unit of the listener in isolation pretending to be the incident. Two layers:

#### 2a. Fast unit — emit idle Pool error in a real child process

| Piece | Path / behavior |
|---|---|
| Child | `tests/support/poolFailureChild.ts:66–75` — `createPool(...)`, `pool.emit("error", new Error("POL03_SIMULATED_IDLE_BACKEND_RESET"))`, then `pool.query("SELECT 1")` |
| Launcher | `tests/support/poolFailureHarness.ts` — `spawn(process.execPath, ["--import", "tsx", childPath])` (separate process) |
| Assert | `tests/unit/pol03-pool-resilience.test.ts` — `exitCode === 0`, stderr contains `[DATABASE_POOL_FAILED] … POL03_SIMULATED_IDLE_BACKEND_RESET`, receipt `{ survived: true, subsequentError: { name: "TypedDomainError", code: "DATABASE_POOL_FAILED" } }` |

**RED shape (handoff inventory; mechanism matches source):** without the listener, emitting `error` on BoundPool with zero listeners → uncaught → child exit **1**. That is yesterday's process-death class.

#### 2b. Integration — real PostgreSQL backend termination

| Piece | Path / behavior |
|---|---|
| DB | Real embedded PostgreSQL 18.4 via `startTestDatabase()` (`connectionString` exposed on `TestDatabase` for the child) |
| Child mode | `POL03_MODE=backend` → `reproduceRealBackendFailure` (`poolFailureChild.ts:37–64`) |
| Active kill | Checkout client → `pg_backend_pid()` → start `SELECT pg_sleep(30)` → second pool `pg_terminate_backend(pid)` → expect in-flight failure typed |
| Idle kill | Checkout → get pid → release to pool → terminate that backend → subsequent `pool.query("SELECT 1")` fails typed |
| Assert | `tests/integration/pol03-pool-resilience.test.ts:16–35` — exit 0; stderr contains administrator-command pool failure; receipt both `inFlightError` and `subsequentError` are `TypedDomainError` / `DATABASE_POOL_FAILED` |
| SQLSTATE preservation | Same file `:11–14` — ordinary missing-column stays `42703` |

Live PostgreSQL evidence from this review's focused re-run:

```text
FATAL:  terminating connection due to administrator command
STATEMENT:  SELECT pg_sleep(30)
FATAL:  terminating connection due to administrator command
```

#### Focused re-run (this review)

```text
$ pnpm vitest run tests/unit/pol03-pool-resilience.test.ts tests/integration/pol03-pool-resilience.test.ts

✓ does not mislabel an ordinary SQL failure as a pool failure
✓ survives an idle backend termination and reports in-flight and subsequent failures typed 476ms
✓ keeps a child process alive and rejects subsequent queries typed after an idle pool error 111ms

Test Files  2 passed (2)
Tests       3 passed (3)
Duration    1.97s
```

Evidence saved: review scratch `pol03-focused.log`.

**Bar:** the RED incident shape (listener-less Pool error → process death) is what GREEN now survives; real backend kill under a live pool asserts survival **and** typed subsequent (and in-flight) failures. Met.

---

### 3. Surgical scope — no retry policy, no pooling redesign

**PASS**

| Claim | Evidence |
|---|---|
| Production change is pool-level error handling | Diff on `packages/db/src/index.ts` is: helpers + expanded `createPool` (listener, terminal state, query/connect wrappers). No new pool class, no size/idle-timeout redesign, no multi-pool manager. |
| No retry policy invented | No backoff, no reconnect timer, no automatic pool recreate. Terminal fail-closed only. |
| No HTTP-layer rewrite | Zero edits under `apps/api/`. POL-01/POL-02 surfaces untouched. |
| Test support is fixture-only | New: `poolFailureChild.ts`, `poolFailureHarness.ts`, `tests/unit/pol03-pool-resilience.test.ts`, `tests/integration/pol03-pool-resilience.test.ts`. `testDatabase.ts` only exposes already-created `connectionString` to the child — no production behavior change. |
| Mission docs | Handoff + progress log only (expected). |
| Pre-existing dirt not claimed | `readFrozenHead().agentCount` in the same `index.ts` diff is **pre-existing** PANEL/PRO work (handoff §Inventory); not part of POL-03's contract and not judged as POL-03 scope inflation. Other dirty paths (`database.test.ts`, runner typecheck, etc.) left alone. |

**SOLID / adapter boundary:** translation stays at the DB adapter construction seam; callers still receive `Pool`. Domain language upward is a single infrastructure failure code, not conflated with ordinary SQL/domain errors.

---

## Suite / gate attribution (orchestrator-honored)

| Gate | Status for this review |
|---|---|
| Focused POL-03 unit + integration | **GREEN** this review: 2 files / 3 tests (live re-run) |
| Full monorepo suite | Orchestrator recorded **65 files / 460 tests all green** after the tree quieted. Worker’s earlier 458/459 sole failure at `database.test.ts:768` (maker-count expectation) is **resolved**, not re-opened as POL-03 suspicion. |
| Typecheck / runner dirt | Pre-existing `apps/runner` / PANEL-PRO; outside POL-03 surgical contract. |
| Architecture lint / whitespace | Handoff claims green; not re-run as a gate for this review. |

---

## Residual notes

### ADVISORY A1 — terminal pool is permanent for process lifetime

After the first idle-client `error`, `terminalFailure` is sticky for that `Pool` instance until process restart / `createPool` again. That is the correct DR-115 posture for this slice (no inventing reconnect). Operators and future work must treat pool death as process-level recovery (restart the API process or explicitly rebuild the pool under a ratified policy). **Not blocking** — explicit non-goal of POL-03; residual risk already named honestly in the handoff.

### ADVISORY A2 — message-regex branch in `typedQueryFailure`

Connection-class detection includes a case-insensitive message regex (`connection terminated|reset|server closed…|administrator command`) in addition to SQLSTATE/`code` lists. Message matching is slightly brittle across driver/locale variants, but SQLSTATE `08*` / `57P01..03` and Node transport codes cover the primary paths; the regex is belt-and-suspenders for admin-terminate wording observed live. Ordinary SQLSTATE path is proven preserved. **Not blocking.**

### ADVISORY A3 — unit path uses `pool.emit("error", …)` rather than a real idle disconnect

The fast unit synthesizes the EventEmitter event. That is the correct micro-RED for “zero listeners → process death,” and the integration path supplies the real backend kill. Together they cover the incident class. A pure unit without the integration would be insufficient; with both, the dual proof holds. **Not blocking.**

---

## Summary checklist

| # | Question | Result |
|---|---|---|
| 1 | Process survival + typed loud surface (DR-115); no silent retry / fabricated health / secret dead pool | **PASS** |
| 2 | Child-process reproduction: real backend kill under live pool; survival + typed in-flight and subsequent failures | **PASS** |
| 3 | Surgical: pool error handling + fixtures only; no retry policy / pooling redesign / HTTP rewrite | **PASS** |

**Verdict: APPROVED** — dual-diamond Grok lens greenlight for POL-03.
