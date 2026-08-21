# LOAD-01 — Opus 5 lens, rev1 (dual diamond DR-153)

Ticket `t_4020ac7b` · worker Codex GPT-5.6 Sol (session `019ff813-cfdc-7e12-aa4a-11864e128012`)
· goal packet `goal-packets/LOAD-01-codex-goal.md` · handoff `handoffs/LOAD-01-codex-handoff.md`
· ruling DR-165(1). Reviewed 2026-08-13 against the shared tree at `56b256c` + working changes.

**Method (DR-163):** every probe and mutation ran in an APFS clone of the PARENT git
root — `cp -Rc /Users/vladmihaimiron/Documents/DebateAIRO` (with `.git` and the parent
`.gitignore`) at
`…/9d9a0a17…/scratchpad/clone/DebateAIRO`. Clone verified byte-identical to the
shared tree before mutating (`diff -rq --exclude=node_modules --exclude=.next-dev
--exclude=.pgdata` → exit 0, no differences) and every mutated file md5-restored and
re-verified after each mutation. The shared tree's `git status --porcelain` was 293
entries at start and 293 at finish; the six LOAD-01 source files in the REAL tree
md5-match their pre-review values (listed at the end). Only this verdict was written
to the real tree.

**DR-163-A:** no `codex exec` / worker CLI process was in flight. Repo-touching
processes: the standing Next dev server (pids 2273/2283/2289, `apps/v2-ui`,
`NEXT_DIST_DIR=.next-dev`) and a running acceptance stack (pids 74634/74640/74654,
`acceptance/run-acceptance.ts`, embedded Postgres on `acceptance/.pgdata`). Neither was
restarted, written to, or read from by me. The Grok lens (`~/.grok/bin/grok -p /goal`,
pid 9707) is running concurrently — hence the clone.

**Baseline reproduced independently in the clone (pristine):**

```text
vitest run                      Test Files  70 passed (70) · Tests  493 passed (493)
vitest run tests/unit tests/architecture
                                Test Files  62 passed (62) · Tests  431 passed (431)  (10.6s — the mutation harness)
tsc --noEmit                    TSC_OK
pnpm lint                       architecture { "edgeRowsChecked": 27, "violations": [] }
                                source       { "blocking": [] }
tsx packages/contract/src/generate.ts
                                generated/{client.ts,openapi.json,field-inventory.json} md5-identical
                                before/after → ZERO DRIFT
```

The worker's headline numbers reproduce exactly.

---

## Verdict

**BLOCKING ×4 · ADVISORY ×7.**

The engineering is sound and the ruling's *primary* clause is genuinely satisfied:
V's exact flow no longer 404s, the loading view carries the real question line, and
it hands off to the settled debate with no manual reload. What blocks is what the
loading view *says* while it waits — it fabricates progress on the very screen V
ruled on — and that three of the four DELIVERS are guarded by regexes over source
text rather than by behaviour, so I can break them and keep the suite green.

---

## 1. V's exact flow at the SSR seam — SATISFIED (with a caveat, §B1)

Driven with provider doubles against the **real** Fastify facade and the **real**
generated contract client (`opusprobe/probe3.test.ts` in the clone):

```text
BEFORE serve:  loading          ← GET /v1/runs/run:probe → QUEUED, question_line intact
AFTER  serve:  ok(settled debate)   ← readRunAnswer now returns the answer; SSR flips
```

* `apps/v2-ui/lib/serverApi.ts:62-99` — `readAnswer` 404 → `readRunAnswer` 404 → `readRun`.
  Only an absent *run* becomes `not_found`. Correct shape.
* `apps/v2-ui/app/debate/[id]/page.tsx:38-47` — loading and failed both thread a
  projection-derived `DebateDetail`; `notFound()` fires only on the typed missing run.

**The question line really renders.** I rendered the real client component under
`react-dom/server` (no jsdom exists in this repo — I added a 12-line vitest config with
`oxc.jsx.runtime=automatic` and an `@/` alias; see §A7):

```text
QUEUED   → HAS QUESTION LINE: true   pill = "Generating"
FAILED   → HAS QUESTION LINE: true   pill = "Failed", no progress strip,
                                     banner "Debate generation failed: TOTAL_REVIEW_COVERAGE_UNSATISFIED"
```

**The transition needs no manual reload — and it is race-free.** Two findings behind
that claim, both established by execution/reading rather than assertion:

1. `GET /v1/runs/{id}/events` is a **snapshot** generator, not a live stream
   (`apps/api/src/index.ts:512` returns immediately when a queued run has no progress
   rows). Measured: **0 events, stream resolved (closed) after 16ms.** So the handoff
   does not ride the SSE connection — it rides
   `DebatePageClient.tsx:559-568`, which calls `refresh()` on *every* stream close and
   then `scheduleReconnect()`. That is a poll with backoff `1s → 2s → 4s → … → 30s`
   (`:529-535`), with `attempt` reset to 0 only when a real event arrives (`:548`).
2. The success handoff cannot race: the answer `INSERT` and the `'TERMINAL'`
   `run_progress_event` are inside **one** `withWriteTransaction`
   (`packages/serve/src/index.ts:922` … `:1060-1064`), so `run.terminal` is never
   visible before the answer is readable. `refreshTriggeredBy("run.terminal")`
   (`lib/v3/liveEvents.ts:71-83`) then pulls the settled projection.

DR-165(1) is met on this axis. Worst-case visible latency between "answer served" and
"page shows the debate" is one backoff interval, up to ~30s (§A5).

---

## 2. The failure triangle — two of three clean, one broken

| case | result |
|---|---|
| typed FAILED at SSR | **clean** — `status:"failed"`, no progress strip, real terminal reason, "Failed" pill (rendered, above) |
| genuinely nonexistent id | **honest 404 at the data layer** (`tests/unit/v2ui-data-layer.test.ts:470-478`) — but the *page* guard is prose, see §B4 |
| mid-review loud stop (XREV-01 A-8) | **BROKEN — see §B2** |

**Mutation asked for by the brief — "swap the projection to claim *generating* for a
FAILED run": CAUGHT, twice.**

```text
M3  apps/v2-ui/lib/serverApi.ts:84   if (run.state === "FAILED")  →  if (false && …)
    → 1 failed | 430 passed   (v2ui-data-layer.test.ts "surfaces a typed failed run…")

M4  apps/v2-ui/lib/v3/adapter.ts:451 status = run.state === "FAILED" ? "failed" : "generating"
                                     →  status = "generating"
    → 1 failed | 430 passed   (same test)

M6  apps/v2-ui/lib/v3/adapter.ts:461 claim: run.question_line
                                     →  claim: "Your debate is being generated"
    → 2 failed | 429 passed   (both LOAD-01 data-layer tests)

M7  packages/contract/src/index.ts:135-142  superRefine body → if (false)
    → 1 failed | 430 passed   (contract.test.ts "keeps loading and loud-stop run states typed on the wire")
```

DR-115 fabrication at the *data* layer is genuinely protected. The gap is one layer up.

---

## 3. Ownership (S05) — BLOCKING, see §B3

## 4. Contract discipline — CLEAN

* Regeneration is genuine: `tsx packages/contract/src/generate.ts` → all three generated
  artifacts md5-identical before/after. **Zero drift.**
* `field-inventory.json` carries `RunProjectionSchema → ["run_ref","question_line","state","terminal_reason"]`;
  `routes` carries `GET /v1/runs/{id}`, `/events`, `/answer`.
* AC-59 holds in this repo's established sense: `packages/contract/package.json` exports
  **only** `./generated/client.ts`, which re-exports `src/`. `apps/v2-ui` imports
  `type RunProjection` from `@debateai/contract`, i.e. through the generated barrel —
  no hand-rolled UI type.
* Architecture table: 27 rows, 0 violations. Source audit: 0 blocking. `tsc --noEmit` clean.

Nit only: `tests/unit/contract.test.ts:23-24` appends the new route with a leading-comma
continuation (`"GET /v1/runs/{id}/events"` newline `,"GET /v1/runs/{id}"`). Cosmetic.

---

# BLOCKING

## B1 — DR-115: the loading view fabricates progress on the exact screen V ruled on

`apps/v2-ui/app/debate/[id]/DebatePageClient.tsx:738`

```ts
const pct = total ? Math.round((done / total) * 100) : complete ? 100 : 40;
return { pct, label: "Models arguing", count: `${pct}%` };
```

`debateDetailFromRunProjection` (`lib/v3/adapter.ts:450-468`) builds a tree with a single
`ROOT_CLAIM` and **zero children**. The walk at `:727-737` skips `ROOT_CLAIM`, so
`total === 0` and the fallback fires. Rendered output, from executing the real component:

```text
QUEUED   <div class="progressStrip"><span class="progressLabel">Models arguing</span>
             <div class="progressFill" style="width:40%"></div>
             <span class="progressCount">40%</span></div>
CLAIMED  … identical …
RUNNING  … identical …
```

A run that is **QUEUED** — nothing dispatched, no worker, no model call — shows a bar
40% full labelled *"Models arguing"*. That is a measurement-free number and a false
statement about system state, on the page V asked for, while V's visual gate
(DR-165(1) → UI-01) waits on it. The goal packet's DELIVERS(1) says "progress **if the
stream provides it**"; at QUEUED the stream provides nothing (§1, measured: 0 events).

Before LOAD-01 this branch was unreachable for a pre-first-event run because SSR 404'd.
LOAD-01 is the change that routes V's flow into it.

**Fix:** render no progress bar until the stream has described at least one node, or
render a typed indeterminate state carrying the actual run state word. Zero fabricated
percentage.

## B2 — DELIVERS(4)/XREV-01 A-8: a mid-session loud stop shows failure *and* a running progress bar

The SSR-failed path is clean. The path where the run fails **while V is watching** is not.
Trace: `DebatePageClient.tsx:489-493` handles `run.terminal` by calling `setError(...)`
**only** — it never touches `debate.status`. `refresh()` then 404s (no answer) and returns
silently (`:369-374`), so `debate.status` remains `"generating"` from the SSR projection,
`generating` stays `true` (`:719`), and `debateTerminal` stays `false`.

Rendered (real component, `initialDebate` = live projection + `error` set — exactly the
post-`run.terminal` client state):

```text
--- mid-session loud stop ---
progressStrip → "Models arguing" … width:40% … "40%"
PILL: class="pill pillGen"> … Generating
HAS error banner: true   ("Debate generation failed: XREV_LOUD_STOP_TOTAL_COVERAGE")
HAS progressStrip: true
```

A dead run displaying "Generating · Models arguing · 40%" next to its own failure banner
is the exact thing DR-115 names — *"do not fabricate progress for a dead run"* — and
DELIVERS(4) requires the loud stop to reach the page **as typed failure**. It reaches as
a banner beside a live-looking spinner, and it stays that way: `:563-565` returns without
scheduling a reconnect once `runPhase === "terminal"`, so nothing ever corrects it short
of the manual reload V complained about.

**Fix:** on `run.terminal` with a failure, set the debate status to `failed` (or thread
the terminal through the same projection path SSR uses), so `generating` goes false and
the failed view is what V sees.

## B3 — S05 ownership on the new endpoint is asserted in prose, not by fixture

The only ownership coverage is `tests/unit/load01-run-projection.test.ts:30-33`, which
regexes the **SQL string**. There is no real-database fixture — `readLoadingProjection`
appears nowhere in `tests/integration/` — and no foreign-asker or anonymous fixture at
the route.

```text
M2   packages/db/src/index.ts:331   drop "AND run.asker_id = $2" and the param
     → 1 failed | 430 passed        ← caught, but only by the SQL-text regex

M2c  packages/db/src/index.ts:331
     WHERE run.run_id = $1 AND run.asker_id = $2
     →  WHERE run.run_id = $1 AND (run.asker_id = $2 OR 1 = 1)
     → Test Files 62 passed (62) · Tests 431 passed (431)      ← SURVIVES
```

M2c keeps every asserted substring (`run.asker_id = $2` still matches, `values` still
`[runId, askerId]`) and grants **every asker read access to every other asker's run
projection** — question line, state, and terminal reason — with the suite fully green.
That is a cross-tenant read of user-authored question text.

```text
M1   apps/api/src/index.ts:239   remove the 401 guard on GET /v1/runs/:id
     → Test Files 62 passed (62) · Tests 431 passed (431)      ← SURVIVES
```

The route's behaviour today is correct — I confirmed by execution that anon → `401
{"error":"SESSION_REQUIRED"}` and token → `200` — but nothing in the suite holds it
there. `tests/unit/api.test.ts:365-392` asserts 200-owned and 404-missing and stops;
compare `:477`, which *does* assert 401 for `/v1/runs/:id/events`.

**Fix:** (a) a real-DB fixture for `readLoadingProjection` proving foreign asker → `null`;
(b) `expect((await api.inject({method:"GET", url:"/v1/runs/run:queued"})).statusCode).toBe(401)`.

## B4 — the SSR page guard is a regex over its own source; DELIVERS(3) has no behavioural test

`tests/unit/load01-run-projection.test.ts:36-42` reads `page.tsx` as a **string** and
matches four regexes. My own trivial variant:

```text
M11  apps/v2-ui/app/debate/[id]/page.tsx:45-47
     } else if (result.kind === "not_found") {
       if (0) notFound();
       initialDebate = null; initialPending = true;
     }
     → Test Files 62 passed (62) · Tests 431 passed (431)      ← SURVIVES
```

The regex `/result\.kind === "not_found"[\s\S]{0,80}notFound\(\)/` still matches, and a
genuinely nonexistent id now renders an eternal "Connecting to the coordinator…" spinner
instead of an honest 404 — DELIVERS(3) inverted, DR-115 violated (a fabricated generating
state for a run that does not exist), suite green. The same shape defeats the `loading`
and `failed` assertions.

`page.tsx` is a plain async server component; it can be invoked directly in vitest with
`next/headers` and `next/navigation` stubbed. **Fix:** three behavioural cases —
loading / failed / `notFound()` thrown — driven through the real function.

---

# ADVISORY

**A1 — a 5xx during generation is one line away from being V's original defect.**
`serverApi.ts:89-95` correctly maps a non-404 run-read failure to `pending`; I confirmed
by execution (`503/500 during generation -> pending`). But:

```text
M9  serverApi.ts:89   if (runFailure instanceof ContractHttpError && runFailure.code === "NOT_FOUND")
                      →  if (runFailure instanceof ContractHttpError)
    → Test Files 62 passed (62) · Tests 431 passed (431)      ← SURVIVES
```

An API restart or DB blip mid-generation would render a hard 404 on V's live debate and
nothing would notice. The handoff explicitly claims "transport failure → retryable pending
state"; add the fixture that claim implies.

**A2 — `bool_or(FAILED)` may over-report a whole run as dead.** `packages/db/src/index.ts:322`
makes the projection `FAILED` as soon as *any* `core.work_item` for the run is FAILED.
Work items are enqueued per battery-row/node-set (`packages/battery/src/index.ts:247-259`),
so a run can hold several. Once SSR renders `failed`, `debateTerminal` is true and
`DebatePageClient.tsx:497-522` stops streaming entirely — if the run later serves an
answer, the page stays on "Failed" until a manual reload, i.e. the mirror image of V's
complaint. If a single item's `CALL_BUDGET_EXHAUSTED` is ever survivable, this is a bug;
if a run is always single-item in practice, say so in the handoff and pin it with a test.

**A3 — `ELSE 'RUNNING'` silently absorbs two different stuck states.** `:325` returns
`RUNNING` both when every work item is `DONE` but no answer was served, and when the run
row has zero work items (the `LEFT JOIN` yields `bool_or(NULL) = NULL`). Both render as an
indefinite generating state with no disclosure. Better than a 404, but DR-115 would prefer
a typed "settling" / "stalled" word over an eternal spinner.

**A4 — the typed state is carried to the UI and then thrown away.** `adapter.ts:451`
collapses `QUEUED | CLAIMED | RUNNING` into one `"generating"`; all three render
byte-identically (verified). The contract now carries exactly the honest content V's
"loading state" wants — *queued* vs *arguing* — for free. Spending it costs one map.

**A5 — settle latency up to ~30s.** Per §1, the handoff is a backoff poll capped at 30s,
and `attempt` resets only on a received event. On a run that emits nothing for a while,
the settled debate can appear up to half a minute after it exists. Acceptable, but it
should be a stated property, not an accident.

**A6 — DELIVERS(4)'s terminal reason is invented.** `TOTAL_REVIEW_COVERAGE_UNSATISFIED`
appears **only** in LOAD-01's own tests (`load01-run-projection.test.ts:17,27`,
`v2ui-data-layer.test.ts:458,462`, `contract.test.ts:70-71`); nothing in `packages/` or
`apps/` emits it. The FAILED path is correctly generic over `work_item.terminal_reason`,
so it *will* carry XREV's reason when XREV lands — but "XREV-01's loud mid-review stop"
in the handoff's Outcome is a shape claim, not an end-to-end proof. Say so.

**A7 — the repo has no render-layer test at all, and it is cheap to fix.** There is no
`jsdom`/`happy-dom`/testing-library anywhere in the workspace, which is *why* B1, B2 and
B4 all survive: every v2-ui "UI" test is a regex over source text. I rendered the real
`DebatePageClient` under `react-dom/server` in this repo with a 12-line vitest config —
`oxc: { jsx: { runtime: "automatic", importSource: "react" } }`, an `@/` → `apps/v2-ui/`
alias, and `react`/`react-dom` reachable from the root. `useEffect` does not run, which is
exactly right for asserting what SSR hands the browser. Every one of B1/B2/B4 becomes a
killed mutation under it. Recommend adopting it as house infrastructure.

---

## Mutation ledger (all in the clone, all md5-restored)

| # | mutation | file:line | outcome |
|---|---|---|---|
| M1 | drop 401 guard on `GET /v1/runs/:id` | `apps/api/src/index.ts:239` | **SURVIVES** (B3) |
| M2 | drop `AND run.asker_id = $2` | `packages/db/src/index.ts:331` | killed — *by SQL-text regex only* |
| M2c | `AND (run.asker_id = $2 OR 1 = 1)` | `packages/db/src/index.ts:331` | **SURVIVES** (B3) |
| M3 | FAILED run reported as `loading` | `apps/v2-ui/lib/serverApi.ts:84` | killed |
| M4 | projection always `"generating"` | `apps/v2-ui/lib/v3/adapter.ts:451` | killed |
| M6 | question line → placeholder copy | `apps/v2-ui/lib/v3/adapter.ts:461` | killed (2 tests) |
| M7 | drop FAILED↔terminal_reason refinement | `packages/contract/src/index.ts:136` | killed |
| M9 | any `ContractHttpError` → `not_found` | `apps/v2-ui/lib/serverApi.ts:89` | **SURVIVES** (A1) |
| M11 | `notFound()` text kept, call disarmed | `apps/v2-ui/app/debate/[id]/page.tsx:46` | **SURVIVES** (B4) |

Load-bearing tests, and the named mutation each kills:

* `v2ui-data-layer.test.ts:427-447` ("V's exact queued run flow") kills M6 (placeholder
  question) and any change that makes a queued run `pending`/`not_found`.
* `v2ui-data-layer.test.ts:449-479` ("typed failed run … missing id not-found") kills
  M3 and M4 — the two DR-115 fabrications — and the missing-id swallow.
* `contract.test.ts:56-75` kills M7 (a FAILED run without a reason, or a live run
  carrying one).
* `api.test.ts:365-392` kills removal of the route or of its 404; it does **not** kill M1.
* `load01-run-projection.test.ts:7-34` kills M2; it does **not** kill M2c.
* `load01-run-projection.test.ts:36-42` kills deletion of the page branches; it does
  **not** kill M11.
* `load01-live-proof.test.ts` kills removal of the contract route/schema/client read.

## Real-tree integrity

```text
30867fcbc5799cbeaeeabfa1a7fd6ae8  apps/api/src/index.ts
0743de8d8fa20b382b88e2b1ed2fe9b8  packages/db/src/index.ts
1f301578afd9da53ebb195a0c6039e46  apps/v2-ui/lib/serverApi.ts
5d8fb1bf03b3934784392c94c2328bf1  apps/v2-ui/lib/v3/adapter.ts
98531ab09373b5a8da34eec4e881e454  packages/contract/src/index.ts
62e836ad1a5e1301065e2aa19b85dc70  apps/v2-ui/app/debate/[id]/page.tsx
git status --porcelain | wc -l   →  293 at start, 293 at finish
```

Every value matches the post-restore md5 recorded in the clone. Nothing in the shared
tree was mutated; the standing stack was neither restarted nor touched.

## Bottom line

DR-165(1)'s headline — *"I want those 404s to never happen"* — is genuinely delivered:
the queued run loads, carries V's own question, and settles into the debate on its own.
The typed contract, the DB projection and the SSR discrimination are well-shaped, well-
separated, and the DR-115 mutations at the data layer are all caught.

It cannot ship as-is because the loading screen tells V a 40%-complete story about a run
that has not started (B1), a run that dies under V's eyes keeps that story running beside
its own obituary (B2), and the two guards that would have caught either — page routing and
asker ownership — are regexes over source text that I broke while the suite stayed green
(B3, B4). Fix B1 and B2 in `DebatePageClient`, back B3 and B4 with the behavioural fixtures
they claim, and this passes my lens.

— Opus 5 lens, rev1
