# BUG-02 rev1 — Grok dual-diamond verdict

Ticket: `t_59d211be` (BUG-02)  
Lens: Grok (independent of Opus)  
Ground: `goal-packets/BUG-02-codex-goal.md`, `handoffs/BUG-02-codex-handoff.md`, `git diff 6c6fbca` at `/Users/vladmihaimiron/Documents/DebateAIRO`  
Isolation: real tree read-only except this file; mutations only in `/private/tmp/bug02-grok-clone`; no stack control (PG 55432 / API 8790 / UI 3000); no runs started.

## Delta surface

14 paths, matching the handoff inventory:

- Production: `apps/v2-ui/lib/api.ts`, `DebatePageClient.tsx`, `globals.css`, `adapter.ts`, `types.ts`, `format.ts`, `packages/contract/src/index.ts`, `packages/db/src/index.ts`
- Tests: `tests/integration/database.test.ts`, `tests/render/load01-debate-page.test.tsx`, `tests/unit/{contract,load01-run-projection,v2ui-data-layer,v2ui-ownership}.test.ts`

**FORBIDDEN:** no kernel / DDL / migration paths in the delta. `SETTLED` is type-layer vocabulary only (`RunProjectionSchema` + DB read CASE projecting existing `work_item.state='DONE'`).

**Invented numbers:** no new poll interval / timeout literals in the production delta. Indeterminate bar CSS is width/gradient only (`globals.css` `.progressFillIndeterminate`).

---

## Mechanism A — client run-first fallback

**Holds.**

### Production path (file:line)

`apps/v2-ui/lib/api.ts:138-179` — `DebateBundle` is a discriminated union (`served` | `loading` | `failed`). `getDebateBundle`:

1. `readRun` first (`api.ts:159`).
2. Run present + `FAILED` → `kind: "failed"` (`:164-165`).
3. Run present + `SETTLED` → `readRunAnswer`; serve on success; on answer `NOT_FOUND` only, fall through to loading (`:167-174`) — commit gap is not a user error.
4. Run present + in-flight → `kind: "loading"` without calling either answer endpoint (`:176`).
5. Run `NOT_FOUND` → single `readAnswer` fallback for answer ids (`:178`); non-404 errors rethrow (`:161`).

`apps/v2-ui/app/debate/[id]/DebatePageClient.tsx:412-444` — `refresh()` consumes the bundle:

- `served` sets answer + debate; clears synthesis draft when composed.
- non-served preserves a non-empty live tree for the same id and only patches `run_state`/`status` (`:427-429`).
- `setError` only for `failed` or residual throw; the prior `isNotFound` swallow is gone (`:438-442`), so honest absence stays loud.
- Progress strip (`:1237-1248`): when `progress.pct === null`, renders `progressTrack` + `progressFillIndeterminate` + `aria-busy` (pre-fix path rendered label only — no bar).

### Fetch-call count

In-flight unit path asserts exactly `["run"]` (`tests/unit/v2ui-data-layer.test.ts` — MUT-BUG02-RUN-FIRST). The old answer-first pair (`readAnswer` 404 → `readRunAnswer` 404) is gone from the client loop.

### Clone baseline

```
pnpm exec vitest run tests/unit/contract.test.ts tests/unit/load01-run-projection.test.ts \
  tests/unit/v2ui-data-layer.test.ts tests/render/load01-debate-page.test.tsx
Test Files  4 passed (4)
Tests       69 passed (69)
```

---

## Mechanism B — projection honesty

**Holds.**

### Production path (file:line)

`packages/db/src/index.ts:313-344` `readLoadingProjection` CASE:

| arm | result |
|---|---|
| `bool_or(FAILED)` | `FAILED` |
| `bool_or(CLAIMED)` | **`RUNNING`** (`:323`) |
| `bool_or(READY)` | `QUEUED` |
| `bool_and(DONE)` | **`SETTLED`** (`:325`) |
| ELSE | `QUEUED` |

UI adapter normalizes residual wire `CLAIMED` → presented `RUNNING` (`apps/v2-ui/lib/v3/adapter.ts:452-468`). Render assertions require label `Running` and forbid `Claimed`.

Contract: `RunProjectionSchema.state` adds `SETTLED` (`packages/contract/src/index.ts:134`). UI types/format follow (`types.ts` run_state; `format.ts` "Settled" label).

### Clone mutations (load-bearing)

On real embedded PG in the clone:

1. **Drop settled arm only** (keep `CLAIMED→RUNNING`, `ELSE 'RUNNING'`):

```
FAIL tests/integration/database.test.ts >
  LOAD-01 run projection ownership boundary >
  projects a claimed work item as RUNNING and an all-DONE run as SETTLED
expected state SETTLED, received RUNNING
```

Unit source pin also RED on missing `WHEN bool_and(work.state = 'DONE') THEN 'SETTLED'`.

2. **CLAIMED arm reverted to `'CLAIMED'`**: same integration test RED on first assert (`expected RUNNING, received CLAIMED`).

Baseline before mutation: the named integration test **passed** on embedded PostgreSQL.

---

## Mechanism C — no user-visible errors for in-flight

**Holds.**

### Production path (file:line)

- In-flight runs never throw answer `NOT_FOUND` from `getDebateBundle` (Mechanism A).
- `SETTLED` + answer gap: only `isNotFound` is absorbed; returns loading (`api.ts:170-174`).
- `refresh` sets `error` null for loading/served; failed runs get an explicit generation-failed string (`DebatePageClient.tsx:435-437`).
- Residual throw (neither run nor answer visible) remains fatal (`:438-442`) — honest `NOT_FOUND` is still loud.

### Clone mutation

Restored answer-first dual-404 throw inside `getDebateBundle`:

```
FAIL ... keeps an existing in-flight run out of the error path
  promise rejected ContractHttpError NOT_FOUND (expected loading)
FAIL ... reads an in-flight CLAIMED/RUNNING run first without probing either answer endpoint
FAIL render ... without either answer 404 probe / SETTLED serve flip
```

Named assertions fail for the believed reason (MUT-BUG02-404-BANNER / RUN-FIRST / RENDER-404-LOOP).

---

## F1 sweep

| Assertion | Assessment |
|---|---|
| Unit run-first `calls === ["run"]` | **Pass** — drives real `getDebateBundle`; mutation C RED |
| Unit serve-flip order | **Pass** — real entry point |
| Unit in-flight out of error path | **Pass** — mutation C RED by rethrow |
| Integration claimed/SETTLED on embedded PG | **Pass** — executes SQL; mutation B RED |
| Unit SQL source pins | **Acceptable** — pin class, but paired with integration |
| Contract `SETTLED` parse | **Pass** — real schema |
| Render indeterminate bar / no Claimed | **Pass** — static markup of real adapter detail |
| Render "no answer probe" via empty `calls` | **Pass with advisory** — instruments answer stubs only; does not drive `DebatePageClient.refresh()` |

No F1 failure that voids a load-bearing claim for A/B/C.

---

## SSR vs client classification parity

| Situation | Client `getDebateBundle` | SSR `getDebateServer` |
|---|---|---|
| In-flight QUEUED/CLAIMED/RUNNING | `loading` (1× `readRun`) | `loading` (answer 404 + runAnswer 404 + `readRun`) |
| FAILED | `failed` | `failed` |
| SETTLED + answer | `served` | `served` |
| SETTLED + answer commit gap | `loading` | `loading` |
| Absent run + answer | throws `NOT_FOUND` (loud) | `kind: "not_found"` (loud) |
| Transport error | throws | `kind: "pending"` |

Outcome classes (served / loading / failed / loud-absent) align for the ask-redirect run-id path the ticket cares about. Order and result *shape* still differ (see advisories).

---

## Findings

### BLOCKING

None.

### Advisory

1. **SSR remains answer-first.** `serverApi.ts:62-99` still probes both answer endpoints before the run projection, so server-side 404 pairs remain for in-flight SSR. Browser client loop is fixed. Ticket text required the client to gain the SSR *classification shape*, not that SSR become run-first. Residual server log noise only.

2. **Client union lacks explicit `not_found` / `pending` members.** Absence and transport failures surface via throw + `refresh` error string / uncaught pending paths, while SSR types them. Outcomes stay loud for true absence; shape divergence is maintainability risk, not a reopened V defect for in-flight runs.

3. **Live-tree preservation branch untested.** `DebatePageClient.tsx:427-429` is claimed in the mutation ledger ("Clobber SSE-built nodes…") but no named automated assertion kills that mutation. Static review of the branch looks correct; coverage gap only.

4. **`statusLabel` still maps `"claimed" → "Claimed"`** (`format.ts:24`). Dead for the main path (DB projects RUNNING; adapter remaps CLAIMED), but a bypass could still show the resting label the ticket forbids.

5. **Render transport tests do not mount `refresh()`.** They call `getDebateBundle` then `renderToStaticMarkup` with the resulting detail. Data-layer behavior is enforced; the page's async error/loading wiring is enforced by code review + unit bundle contracts, not a full client refresh render harness.

---

## Suite evidence (clone)

- Unit/render baseline: 4 files, 69 tests passed.
- Integration named test: passed on real embedded PostgreSQL; RED under settled-arm drop and CLAIMED-arm revert.
- Mechanism C answer-first mutation: named unit/render tests RED as above.
- Live standing-stack browser proof: **out of seat** (Opus owns the one live run per packet).

---

## Isolation confirmation

- Sole real-tree write intended by this lens: this verdict file.
- No process control against PG 55432 / API 8790 / UI 3000.
- No debate runs started.
- Product mutations confined to `/private/tmp/bug02-grok-clone` and discarded after.

VERDICT: APPROVED — Mechanisms A/B/C hold on production paths with file:line causality; named load-bearing tests go red under the directed clone mutations for the believed reasons; FORBIDDEN surface clean; no invented poll/timeouts; residual items are advisory (SSR probe order, union shape, SSE tree-preservation test gap).
