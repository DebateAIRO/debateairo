# BUG-02 — Opus 5 diamond lens, rev2 rework confirmation (P8)

Ticket: `t_59d211be` · board `debateai-v3` · mission PROG-V3-R1
Reviewer: Opus 5 lens — the lens that issued the rev1 **BLOCKING** verdict.
Mandate: P8 (finder-confirms-own-finding). Grok's rev1 APPROVE stands; this is
the only remaining gate.
Rev1 verdict under confirmation: `reviews/bug02-opus-rev1.md`.
Rev2 claims under test: `handoffs/BUG-02-codex-handoff.md`.
Delta: `git diff 6c6fbca` at `/Users/vladmihaimiron/Documents/DebateAIRO`
(24 files, +1683/−78) minus the DR-172 seed files committed separately as
`b0443e7` (`acceptance/seed-register.*`).

Isolation (DR-163): every mutation ran in `cp -Rc` clone
`/private/tmp/bug02-confirm-clone`. All 16 touched files were verified
`cmp`-identical to the real tree after the battery, the clone's
`git diff --stat 6c6fbca` was re-read as `24 files / +1683 / −78`, and the clone
was deleted. The real tree's `git diff --stat 6c6fbca` reads `24 files changed,
1683 insertions(+), 78 deletions(-)` both before and after this review. The
standing stack was never killed or restarted — same PIDs throughout
(API 25519 started `Thu Aug 13 23:00:20 2026`, UI 18666, PG 25533).

---

## 0. Headline

Both of my rev1 BLOCKING findings are **CONFIRMED-CLOSED**, and — unlike rev1 —
both are closed **live**, not only in tests.

The decisive event: at `2026-08-14T05:12:24Z` the standing API reported
`"state":"SETTLED"` for the live run, and a browser tab that had been parked on
the loading surface since `05:05:57Z` **flipped to the rendered debate without a
manual refresh and without a reload** (`performance.navigation.type` still
`"navigate"`). That is the exact behaviour rev1 proved absent.

25 mutations applied. **22 RED**, 3 GREEN — of which one is the *desired* green
(the whitespace-reformat probe, proving the source-text SQL pin is gone), one is
a **provable equivalent mutant**, and one is a genuine but narrow redundancy gap
recorded as a new advisory. Every gate the handoff claims reproduces exactly,
including `vitest list` = 561 and `561 passed | 1 skipped (562)`.

### 0.1 The precondition rev1 could not satisfy

Rev1's boundary #1 was that the standing API predated the fix on disk, so
mechanism B's DB half was never live-exercised. That precondition is now
**satisfied**:

```text
$ lsof -nP -iTCP:8790 -sTCP:LISTEN -t | xargs ps -o pid,lstart -p
  PID  STARTED
25519  Thu Aug 13 23:00:20 2026

$ ls -lT packages/db/src/index.ts apps/v2-ui/lib/api.ts \
      "apps/v2-ui/app/debate/[id]/DebatePageClient.tsx" package.json
-rw-r--r--@ 1 … 18537 Aug 13 22:29:23 2026 packages/db/src/index.ts
-rw-r--r--@ 1 … 13103 Aug 13 22:32:32 2026 apps/v2-ui/lib/api.ts
-rw-r--r--@ 1 … 74294 Aug 13 22:29:55 2026 apps/v2-ui/app/debate/[id]/DebatePageClient.tsx
-rw-r--r--@ 1 …  2555 Aug 13 22:32:16 2026 package.json

$ find packages apps/runner apps/serve acceptance -type f \
      \( -name '*.ts' -o -name '*.tsx' -o -name '*.sql' \) \
      -newermt "2026-08-13 23:00:20" | grep -v node_modules
(no output)
```

The API process started **26 minutes after** the last rev2 source write, and no
source file is newer than the process. **The standing API runs rev2 code.**

---

## 1. Live verification — one real run, depth 1

Budget honoured: exactly **one** `POST /v1/asks`, depth 1, standard tier,
`MACHINE_DEFAULT` tier source, low composition budget, 2 agents, empty steering
arrays.

### 1.1 Baseline honesty probes (free, before and after the run)

A genuinely nonexistent id must still 404 loudly — API:

```text
$ curl -s -i http://127.0.0.1:8790/v1/runs/00000000-0000-4000-8000-000000000000 -H "x-user-dev-token: v-dev"
HTTP/1.1 404 Not Found
content-type: application/json; charset=utf-8
content-length: 25
Date: Fri, 14 Aug 2026 05:04:52 GMT

{"error":"RUN_NOT_FOUND"}
```

…and SSR:

```text
$ curl -s http://localhost:3000/debate/00000000-0000-4000-8000-000000000000 \
    -H "Cookie: debateai:user-dev-token=v-dev" -o ssr-404.html -w "http=%{http_code}\n"
http=404
$ grep -o 'NEXT_HTTP_ERROR_FALLBACK;404' ssr-404.html   → NEXT_HTTP_ERROR_FALLBACK;404
$ grep -c 'initialPending\":true'        ssr-404.html   → 0
```

**No honesty inversion.** A nonexistent id is not dressed up as a loading run,
on either side.

### 1.2 The ask

```text
$ curl -s -i -X POST http://127.0.0.1:8790/v1/asks -H "x-user-dev-token: v-dev" \
   -H "content-type: application/json" \
   -d '{"question_line":"BUG-02 rev2 confirm: what makes code reviewable?","risk_tier":"standard",
        "tier_source":"MACHINE_DEFAULT","tier_provenance_ref":"machine:deployment-floor",
        "composition_budget_tier":"low","depth_params":{"depth":1},"agent_count":2,
        "decision_owner":"bug02-confirm","action_owner":"bug02-confirm","decision_scope":"personal",
        "caller_scope":"ASKER","as_of":"…","steering_presets":[],"steering_annotations":[]}'
HTTP/1.1 202 Accepted
Date: Fri, 14 Aug 2026 05:05:21 GMT

{"run_ref":"34913492-4f91-4e45-b593-f18d7f339a76","status":"QUEUED"}
```

### 1.3 Timeline (118 samples, 5 s cadence, `05:05:40Z → 05:15:42Z`)

```text
2026-08-14T05:05:40Z | run={…,"state":"RUNNING","terminal_reason":null} | answer=404 | ssrBytes=41670
…
2026-08-14T05:12:19Z | run={…,"state":"RUNNING","terminal_reason":null} | answer=404 | ssrBytes=41671
2026-08-14T05:12:24Z | run={…,"state":"SETTLED","terminal_reason":null} | answer=200 | ssrBytes=101148
ANSWER_200_AT 2026-08-14T05:12:24Z
2026-08-14T05:12:29Z | run={…,"state":"SETTLED","terminal_reason":null} | answer=200 | ssrBytes=101144
…
2026-08-14T05:15:42Z | run={…,"state":"SETTLED","terminal_reason":null} | answer=200 | ssrBytes=101149
```

Three facts, each of which rev1 could not obtain:

1. **`CLAIMED` never appeared on the wire.** Every in-flight sample reads
   `RUNNING`. Mechanism B's DB half, live.
2. **`SETTLED` appeared, and stuck.** The eternal-`RUNNING` lie I recorded live
   in rev1 §1.5 is gone — the projection converged 3 min 18 s of continued
   polling later and never regressed.
3. **SSR bytes stepped 41 670 → 101 148 at the same sample.** The page
   server-renders the debate the moment the answer exists.

Confirmed post-settle, directly:

```text
$ curl -s http://127.0.0.1:8790/v1/runs/34913492-4f91-4e45-b593-f18d7f339a76 -H "x-user-dev-token: v-dev"
{"run_ref":"34913492-4f91-4e45-b593-f18d7f339a76","question_line":"BUG-02 rev2 confirm: what makes code reviewable?","state":"SETTLED","terminal_reason":null}
$ curl -s -o /dev/null -w "answerHTTP=%{http_code}\n" http://127.0.0.1:8790/v1/runs/34913492-…/answer -H "x-user-dev-token: v-dev"
answerHTTP=200
```

### 1.4 SSR payloads — in flight and after settle

```text
IN FLIGHT (05:12:0x)                      POST-SETTLE (05:13:3x)
SSR_HTTP=200 bytes=41670                  SSR_HTTP=200 bytes=101147
run_state\":\"RUNNING\"}                  answer id df9d993d-… present: 1
initialPending\":true                     initialPending\":false
initialAnswer\":null  (present)           initialAnswer\":null  (absent)
error markers: 0                          error markers: 0
```

The loading truth and then the served answer both reach the client honestly,
with zero `NEXT_HTTP_ERROR_FALLBACK` / `RUN_NOT_FOUND` / `Unable to load`
markers in either payload.

### 1.5 The client-side flip — my rev1 live BLOCKING finding, retested

A browser (playwright) was parked on `/debate/34913492-…` at `05:05:57Z` with the
identity token in `localStorage` + the `debateai:user-dev-token` cookie
(`apps/v2-ui/lib/serverApi.ts:14`), and **was never reloaded or touched again**.

**In flight, 05:06:02Z:**

```json
{ "hasTrack": true, "ariaBusy": "true", "hasIndeterminate": true, "errorish": [],
  "bodyLen": 1079,
  "head": "Dialectical Engine\ndezbatere.ro\nBUG-02 rev2 confirm: what makes code reviewable?\nRUNNING\nThread\nSplit\nTree\nMap\n…" }
```

**After settle, 05:12:51Z — same tab, no interaction:**

```json
{ "url": "http://localhost:3000/debate/34913492-4f91-4e45-b593-f18d7f339a76",
  "navType": "navigate",
  "hasIndeterminate": false, "hasTrack": false, "bodyLen": 10892,
  "head": "Dialectical Engine\ndezbatere.ro\nBUG-02 rev2 confirm: what makes code reviewable?\nCOMPLETE\nServed downgraded\nThread\nSplit\nTree\nMap\n…" }
```

**05:13:33Z, content probe:**

```json
{ "navType": "navigate", "statusPill": "COMPLETE", "errorish": [],
  "sampleContent": ["Root claimBUG-02 rev2 confirm: what makes code reviewable?8 claims/depth 2", …] }
```

`navType` is `"navigate"`, not `"reload"` — the flip is the *original* page
instance. Loading surface (1 079 chars, indeterminate bar, `RUNNING`) became a
rendered 8-claim debate (10 892 chars, `COMPLETE`) with no user action.

**Rev1's exact counter-observation was:** 79 s after serve and *even after a
hard reload*, `bodyLen: 1217`, `hasIndeterminate: false`, no debate, `RUNNING`.
That failure is gone.

### 1.6 Network trace — mechanism C, live, and the flip's mechanism

Whole session, 1 489 requests:

```text
1085  /api/v1/runs/<id>
 380  /api/v1/runs/<id>/events
  11  /api/v1/runs/<id>/answer
  10  /api/v1/answers/<id>/ledger-digest
```

```text
non-200 responses:  0   (all 1489 => [200] OK)
console errors:     0
console warnings:   0   (1 informational message total)
```

**Every one of the 11 `/answer` requests is a 200, and all of them occur after
the flip point.** The ordering at the boundary is the mechanism itself:

```text
1477. [GET] /api/v1/runs/34913492-… => [200] OK
1478. [GET] /api/v1/runs/34913492-…/events => [200] OK      ← terminal frame
1479. [GET] /api/v1/runs/34913492-…/answer => [200] OK      ← refresh(true)
```

Zero absent-answer probes during the entire 6 min 47 s flight, zero 404s of any
kind, zero user-visible error surface. Mechanism C holds, live, again.

### 1.7 Why the crash-window hang I described in rev1 §1.6 is now closed

Rev1's argument was that `SERVE` and `settle()` are separate transactions, so
`answer=200` with the projection still `RUNNING` is reachable — and the rev1
client turned that into an unbounded loading hang. Reading rev2's ordering:

- The `TERMINAL` progress-event row is written **inside the answer-persist
  transaction** — `packages/serve/src/index.ts:1060-1064`:
  `INSERT INTO core.run_progress_event (run_id, at_seq, kind, value_json) VALUES ($1,$2,'TERMINAL',$3::jsonb)`.
- `apps/runner/src/index.ts:1400` calls `this.#work.settle({...})` **after** that
  transaction commits and after the `SERVE` ledger append.
- `apps/api/src/index.ts:531` maps a stored `TERMINAL` row to the
  `run.terminal` stream event.

So in the exact window rev1 named — answer served, work item still `CLAIMED`,
projection still `RUNNING`, runner dead — the `run.terminal` event **already
exists** and drives `refresh(true)` → `answerExpected` → `readRunAnswer` → 200 →
served. And `getDebateServer` (`apps/v2-ui/lib/serverApi.ts:62-74`) is still
answer-first, so a reload recovers the answer regardless of the projection. Both
the *hang* and the *hard-reload-doesn't-help* halves of BUG02-B1 are closed by
construction, not only by the happy path I observed.

### 1.8 Free observations (out of BUG-02 scope)

- The served answer is again a downgrade: the page shows `Served downgraded`, and
  the ledger digest reports all 8 work items `{"status":"ERROR","reason":
  "MISSING_COMPLETED_ITEM"}`. Identical to rev1 §1.7 — a serve-gate/run-quality
  signal for its owner, not a BUG-02 defect.
- **1 085 `/v1/runs/<id>` reads from one open tab in ~7 minutes (~2.6/s).** The
  `/events` endpoint replays stored events and closes (`apps/api/src/index.ts`
  `for (const event of events) yield event;`), the client reconnects (380 times),
  and each stream close calls `refresh()`. I did **not** measure a pre-BUG-02
  baseline for this cadence, so I make no regression claim — recorded as new
  advisory N3.

---

## 2. Mutation ledger (clone) — 25 mutations

Clone baseline before any mutation:

```text
$ pnpm exec vitest list --reporter=dot | wc -l
561
$ pnpm exec vitest run
 Test Files  77 passed (77)
      Tests  561 passed | 1 skipped (562)
   Duration  33.85s
```

`[UI]` = focused target of 80 tests (`tests/render/bug02-debate-effects.test.tsx`,
`tests/render/load01-debate-page.test.tsx`, `tests/unit/v2ui-data-layer.test.ts`,
`tests/unit/v2ui-ownership.test.ts`, `tests/unit/contract.test.ts`,
`tests/unit/load01-run-projection.test.ts`).
`[DB]` = 43 tests on **real embedded PostgreSQL** (`tests/integration/database.test.ts`
+ `tests/unit/load01-run-projection.test.ts`).
`[FULL]` = the entire enforced suite, 562 collected.
Every mutant was byte-restored after its run.

### 2.1 R1 / B1 — is the flip now a killable rendered behaviour?

| # | Mutation | Result | Killed by |
|---|---|---|---|
| M-B1-KILLER-SSE-WIRING | `if (false && refreshTriggeredBy(...)) void input.refresh(...)` — **my rev1 killer mutation, verbatim intent** | **RED** 1 failed / 80 | `bug02-debate-effects › renders loading, then a served answer after terminal SSE without manual refresh` |
| M-B1-HARD-REFRESH-NOOP | `refresh()` returns immediately — every refresh path dead | **RED** 2 failed / 80 | flip test + FAILED-banner test |
| M-B1c-CONSUMER-DROPS-TERMINAL-SIGNAL | `void input.refresh(false)` — consumer stops forwarding terminal authority | **RED** 1 failed / 80 | flip test |
| M-B1d-STREAMCLOSE-DROPS-TERMINAL-SIGNAL | stream-close-after-terminal `refresh(true)` → `refresh()` | **GREEN — survives all 561** | nothing (new advisory N1) |

Rev1's B1 survived all 551 tests. It now dies. **The killer mutation is RED.**

### 2.2 F1 re-check on the new flip test — is it a call-order assertion again?

No. `tests/render/bug02-debate-effects.test.tsx:125-141` is a real DOM mount
(`createRoot` + `act`, `// @vitest-environment jsdom`) that:

- asserts `document.querySelector(".progressFillIndeterminate")` is present and
  `document.body.textContent` does **not** contain the answer's claim text
  **before** the event;
- emits a real `run.terminal` `RunEvent` through the live consumer seam;
- then asserts `document.body.textContent` **contains** `"The position claim
  under test."` and the indeterminate bar is **gone**.

That is rendered content before/after, not a call order. It also exercises the
**real** `getDebateBundle` (the `vi.mock` forwards to `actual.getDebateBundle`
with a mocked read client), so the data layer is under test too, not stubbed out.

One residual F1 nit, cosmetic: the *unit* test still named
`flips a settled run to its served answer without a manual refresh`
(`tests/unit/v2ui-data-layer.test.ts`) still asserts only
`expect(calls).toEqual(["run","run-answer"])`. Its name still overclaims — but
the claim it names is now genuinely covered elsewhere, so this is a naming nit,
not a coverage hole. Recorded as N2.

### 2.3 R2 — answer authority over a lagging projection

| # | Mutation | Result | Killed by |
|---|---|---|---|
| M-R2-DROP-HELD-ANSWER-AUTHORITY | delete `if (options.currentAnswer) return servedDebateBundle(...)` from the loading path | **RED** 2 failed / 80 | jsdom `keeps a server-rendered answer authoritative over a lagging RUNNING projection` + unit `keeps an already-held answer authoritative over a lagging projection` |
| M-R2-PREFER-LOADING-OVER-ANSWER | return the loading bundle *before* the held-answer check ("prefer loading over answer") | **RED** 2 failed / 80 | same two |
| M-R2-IGNORE-ANSWEREXPECTED | `if (run.state === "SETTLED")` — drop `\|\| options.answerExpected` | **RED** 2 failed / 80 | flip test + unit `lets an available answer win over a lagging RUNNING projection after a terminal signal` |
| M-R2-REFRESH-STOPS-FORWARDING-HELD | `currentAnswer: null` in `refresh`'s call — the wiring, not the function | **RED** 1 failed / 80 | jsdom SSR-authority test |
| M-R2-DISCARD-ANSWER-IN-REFRESH | re-insert rev1's exact defect: `answerRef.current = null; setAnswer(null);` in the non-served branch | **GREEN — survives all 561** | **equivalent mutant, see below** |

**The GREEN is provably equivalent, not a coverage hole.** `refresh` always passes
`currentAnswer: answerRef.current`; `getDebateBundle` returns `kind:"served"`
whenever `options.currentAnswer` is truthy (both on the `answerExpected` catch
path and on the main path). So the mutated `else` branch is reachable only when
`answerRef.current` is already falsy, making `answerRef.current = null` a no-op.
And `setAnswer` / `answerRef.current` are written together in exactly one place
(`DebatePageClient.tsx:421-422`) and initialised together from `initialAnswer`
(lines 353, 363) — verified by grep, only those five `answerRef.current`
references exist and the other three are read-only guards. Therefore `answer`
is non-null iff `answerRef.current` is non-null, and the mutation cannot change
observable behaviour. The guard that *does* carry the weight is pinned twice
(M-R2-DROP-HELD-ANSWER-AUTHORITY, M-R2-REFRESH-STOPS-FORWARDING-HELD), both RED.

My rev1 SSR case — `initialAnswer` non-null must render the debate — is exactly
the jsdom `mount(answer)` test, and both "prefer loading over answer" mutants
kill it.

### 2.4 R3 — the client FAILED arm

| # | Mutation | Result | Killed by |
|---|---|---|---|
| M-R3-DELETE-CLIENT-FAILED-ARM | delete the `run.state === "FAILED"` arm from `getDebateBundle` (a dead run becomes a loading bundle) | **RED** 2 failed / 80 | jsdom `renders the client FAILED projection as a failure banner instead of a spinner` + unit `returns a typed client failure instead of an eternal loading bundle` |
| M-R3-DELETE-FAILED-BANNER-WRITE | `setError(null)` unconditionally in `refresh` — bundle is typed failed but no banner reaches the DOM | **RED** 1 failed / 80 | jsdom FAILED test |

Rev1's B4 survived all 551. Both the *typing* and the *rendering* of the failure
now have killing assertions.

### 2.5 R4 — B6, L9, B8, and the SQL source-regex

| # | Mutation | Result | Killed by |
|---|---|---|---|
| M-B6-DELETE-SETTLED-LABEL | remove `if (s === "settled") return "Settled";` → raw `SETTLED` token reaches the user | **RED** 1 failed / 80 | `BUG-02 projection labels › labels the SETTLED transport token in plain words` |
| M-L9-CLOBBER-SSE-TREE | `setDebate(bundle.detail)` on a loading refresh | **RED** 1 failed / 80 | jsdom `preserves an SSE-built tree when a loading projection refresh completes` |
| M-B8-ZEROWORK-ARM-TO-RUNNING | `WHEN count(work.work_item_id) = 0 THEN 'RUNNING'` | **RED** 1 failed / 43 `[DB]` | `projects a freshly accepted zero-work-item run as QUEUED` |
| M-L2-ELSE-SETTLED-TO-RUNNING | `ELSE 'RUNNING'` — the eternal-RUNNING lie restored | **RED** 1 failed / 43 `[DB]` | `projects a claimed work item as RUNNING and an all-DONE run as SETTLED` |
| M-L3-CLAIMED-ARM-RAW-CLAIMED | `WHEN bool_or(work.state='CLAIMED') THEN 'CLAIMED'` | **RED** 3 failed / 43 `[DB]` | the two LOAD-01 projection tests + `P11/ADR-0017 claim discipline` |
| **M-F1-SQL-WHITESPACE-REFORMAT** | `work.state='FAILED'` etc. — whitespace only, behaviour identical | **GREEN — survives all 561** | **desired: the source-text pin is gone** |
| M-B7-BOOLOR-TO-BOOLAND-CLAIMED | `bool_or(...='CLAIMED')` → `bool_and(...)` | **RED** 2 failed / 43 `[DB]` | `prioritizes FAILED, CLAIMED and READY behavior before the all-DONE terminal arm` + claim discipline |
| M-B7b-BOOLOR-TO-BOOLAND-FAILED | `bool_or(...='FAILED')` → `bool_and(...)` | **RED** 1 failed / 43 `[DB]` | same priority test |
| M-ARMORDER-FAILED-BELOW-CLAIMED | move the `FAILED` arm below `CLAIMED` | **RED** 1 failed / 43 `[DB]` | same priority test |
| M-OWNERSHIP-DROP-ASKER-FILTER | drop `run.asker_id = $2` from the WHERE | **RED** 6 failed / 43 `[DB]` | 4 LOAD-01 tests incl. `returns 401 to anonymous callers and 404 to a foreign asker` |

This is the row I want on record. In rev1, `bool_and → bool_or` and a
whitespace-only reformat were **both** RED and killed **only** by a source-text
regex — a string test masquerading as a behaviour test. In rev2 the regex is
gone (`tests/unit/load01-run-projection.test.ts`, −3 lines), the cosmetic
reformat is correctly **GREEN**, and every *semantic* SQL mutant I could
construct — arm value, arm order, aggregate strength, ownership filter — dies on
**real embedded PostgreSQL**. My rev1 A6 is closed, and closed the right way.

### 2.6 Rev1 priority kills — still covered

| # | Mutation | Result | Killed by |
|---|---|---|---|
| M-L1-RESTORE-ANSWER-FIRST | restore the pre-fix answer-first 404 probe pair | **RED** 11 failed / 80 | flip, FAILED, 3 LOAD-01 render, 3 data-layer, … |
| M-L4-RAW-CLAIMED-PRESENTED | `presentedState = run.state` (expose raw `CLAIMED`) | **RED** 3 failed / 80 | 2 LOAD-01 render + `reads an in-flight CLAIMED run first…` |
| M-L5-REMOVE-INDETERMINATE-BAR | drop `progressFillIndeterminate` | **RED** 3 failed / 80 | flip test + 2 LOAD-01 render |
| M-L8-SCHEMA-DROP-SETTLED | remove `SETTLED` from `RunProjectionSchema` | **RED** 1 failed / 80 | `keeps loading and loud-stop run states typed on the wire` |

### 2.7 Tally

**25 mutations · 22 RED · 3 GREEN** (1 desired-green, 1 provable equivalent
mutant, 1 genuine narrow gap → advisory N1). Rev1's five silent survivors (B1,
L9, B4, B6, B8) are all RED now.

---

## 3. Per-finding disposition

### Rev1 BLOCKING

| Finding | Status | Evidence |
|---|---|---|
| **BUG02-B1** — a served answer can be discarded by a non-`SETTLED` projection; the debate never appears, not even on hard reload | **CONFIRMED-CLOSED** | Live §1.5: the parked tab flipped to the rendered debate with `navType:"navigate"`. §1.3: the projection reached `SETTLED` and stayed. §1.7: `TERMINAL` is committed *inside* the answer-persist transaction (`packages/serve/src/index.ts:1060`) before `settle()` (`apps/runner/src/index.ts:1400`), so the crash window emits `run.terminal` → `refresh(true)`; SSR remains answer-first so reload always recovers. Mutations: 4 RED (§2.3) |
| **BUG02-B2** — "without a manual refresh" has no executable evidence; the whole flip can be deleted silently | **CONFIRMED-CLOSED** | My rev1 killer mutation is now **RED** (§2.1). The new jsdom suite asserts **rendered** content before/after a real terminal event, not a call order (§2.2). `jsdom` is a devDependency only (`dependencies` contains no jsdom) and is opted in per-file via `// @vitest-environment jsdom` in exactly one file — `vitest.config.ts` still sets no global environment, so the other 76 files' semantics are untouched |

### Rev1 advisories

| Finding | Status | Evidence |
|---|---|---|
| **BUG02-A1** — mechanism B's DB half not live-verified | **CONFIRMED-CLOSED** | §0.1 process/mtime proof + §1.3 live `RUNNING`-never-`CLAIMED` and live `SETTLED` |
| **BUG02-A2** — client `FAILED` arm uncovered | **CONFIRMED-CLOSED** | §2.4, 2 RED |
| **BUG02-A3** — ledger row 8 (SSE tree clobber) had no killing assertion | **CONFIRMED-CLOSED** | §2.5 M-L9-CLOBBER-SSE-TREE RED |
| **BUG02-A4** — `SETTLED` falls through to the raw token | **CONFIRMED-CLOSED** | §2.5 M-B6-DELETE-SETTLED-LABEL RED |
| **BUG02-A5** — deployment coupling (client/API/DB must ship together) | **STILL-OPEN (advisory, documentation)** | No code change addresses it and none was asked for; it is now moot for *this* stack (§0.1). Still worth a line wherever the restart procedure lives |
| **BUG02-A6** — SQL source-text assertion is a string test | **CONFIRMED-CLOSED** | §2.5: regex removed, cosmetic reformat GREEN, four semantic SQL mutants RED on real PG |
| **BUG02-A7** — SSR still fires the by-design 404 pair per page load | **STILL-OPEN (advisory)** | `getDebateServer` (`apps/v2-ui/lib/serverApi.ts:62-74`) is unchanged and still answer-first. Not user-visible; the packet blessed the SSR shape; and §1.7 shows this ordering is now what makes hard-reload recovery work — arguably load-bearing, not waste |
| **BUG02-A8** — the loading state does not server-render *markup* (AuthGate) | **STILL-OPEN (advisory, pre-existing)** | Post-settle SSR carries the answer in the RSC payload (`initialPending:false`, answer id present) but the served markup is still the auth shell; in-flight, `grep -c progressFillIndeterminate ssr-inflight.html` = 0 while the browser paints the bar on hydration (§1.4, §1.5). Unchanged UI-01 architecture; the BUG-02 delta touches neither `AuthGate` nor `page.tsx` |
| **BUG02-A9** — the `ELSE`/zero-work arm untested | **CONFIRMED-CLOSED** | §2.5 M-B8-ZEROWORK-ARM-TO-RUNNING RED |

### New in rev2 (advisory only — none blocking)

- **N1** — `M-B1d`: in `DebatePageClient.tsx`, the stream-close-after-terminal
  path `if (liveRef.current.runPhase === "terminal") void refresh(true)`
  degrades to `refresh()` with **no killing test** (survives all 561). This is
  the *retry* path — the primary terminal-event path is covered three ways — so
  losing it only matters when the terminal-triggered read transiently missed and
  the projection is still lagging. Narrow; worth one assertion, not a block.
- **N2** — the unit test `flips a settled run to its served answer without a
  manual refresh` (`tests/unit/v2ui-data-layer.test.ts`) still asserts only
  `calls === ["run","run-answer"]`. The name still overclaims; the behaviour it
  names is now covered by `tests/render/bug02-debate-effects.test.tsx`. Rename
  to something like *"reads the run answer once a SETTLED projection appears"*.
- **N3** — 1 085 `/v1/runs/<id>` reads from one open tab in ~7 min (~2.6/s),
  driven by 380 `/events` replay-and-close reconnects each calling `refresh()`
  (§1.6). **Boundary: I did not measure a pre-BUG-02 baseline, so this is an
  observation, not a regression claim.**
- **N4** (out of scope, repeat of rev1) — the served answer is again
  `Served downgraded` with all 8 work items `ERROR / MISSING_COMPLETED_ITEM`.
  Serve-gate run quality, not BUG-02.

### Confirmed good (do not regress)

- Client-side flip without refresh or reload — **live** (§1.5).
- `SETTLED` reaches the wire and the projection converges — **live** (§1.3).
- Zero absent-answer probes in flight; all 11 `/answer` reads are 200s issued
  after the terminal frame; 0/1489 non-200; 0 console errors/warnings (§1.6).
- The indeterminate bar with `aria-busy="true"` renders live (§1.5).
- `CLAIMED` never reaches the user, and now never even reaches the wire (§1.3).
- A nonexistent id still 404s loudly on both API and SSR (§1.1).
- All rev1 priority mutations still die (§2.6).

---

## 4. Gates (clone, restored to the delivered state, real output)

Restoration proof first — all 16 touched files `cmp`-identical to the real tree:

```text
IDENTICAL  apps/v2-ui/app/debate/[id]/DebatePageClient.tsx
IDENTICAL  apps/v2-ui/lib/api.ts
IDENTICAL  apps/v2-ui/lib/format.ts
IDENTICAL  apps/v2-ui/lib/types.ts
IDENTICAL  apps/v2-ui/lib/v3/adapter.ts
IDENTICAL  apps/v2-ui/app/globals.css
IDENTICAL  packages/contract/src/index.ts
IDENTICAL  packages/db/src/index.ts
IDENTICAL  package.json
IDENTICAL  tests/render/bug02-debate-effects.test.tsx
IDENTICAL  tests/render/load01-debate-page.test.tsx
IDENTICAL  tests/unit/v2ui-data-layer.test.ts
IDENTICAL  tests/unit/load01-run-projection.test.ts
IDENTICAL  tests/unit/contract.test.ts
IDENTICAL  tests/unit/v2ui-ownership.test.ts
IDENTICAL  tests/integration/database.test.ts
MISMATCH=0

$ git -C /private/tmp/bug02-confirm-clone diff --stat 6c6fbca | tail -1
 24 files changed, 1683 insertions(+), 78 deletions(-)
```

```text
===== GATE: typecheck =====
$ pnpm exec tsc --noEmit
(no output, exit 0)

===== GATE: lint =====
$ pnpm run audit:architecture
$ tsx tools/orphan-audit/src/cli.ts architecture
{
  "edgeRowsChecked": 27,
  "violations": []
}
$ pnpm run audit:source
$ tsx tools/orphan-audit/src/cli.ts source
{
  "blocking": []
}

===== GATE: vitest list count =====
561

===== GATE: full vitest run =====
 Test Files  77 passed (77)
      Tests  561 passed | 1 skipped (562)
   Start at  08:14:54
   Duration  27.31s (transform 1.09s, setup 0ms, import 6.39s, tests 13.67s, environment 407ms)
```

Typecheck also run read-only on the **real** tree: `pnpm exec tsc --noEmit`,
exit 0.

Dependency-scope check on the handoff's one sanctioned addition:

```text
$ python3 -c "import json;d=json.load(open('package.json')); print('deps:',{k:v for k,v in d.get('dependencies',{}).items() if 'jsdom' in k}); print('devDeps has jsdom:',d.get('devDependencies',{}).get('jsdom'))"
deps: {}
devDeps has jsdom: ^30.0.1

$ grep -n "environment" vitest.config.ts        → (no global environment set)
$ grep -rln "@vitest-environment" tests/        → tests/render/bug02-debate-effects.test.tsx
```

`edgeRowsChecked` is unchanged at 27 with zero violations: no new architecture
edge. Every gate the handoff claims reproduces exactly (`561`, `561 passed | 1
skipped (562)`, `77 files`).

---

## 5. Boundaries (disclosed in full)

1. **One run only.** No `FAILED` projection was observed live — the client
   failure banner is proven by the jsdom test and two RED mutations, not by a
   live failed run. No concurrent-asker behaviour was sampled.
2. **The crash-between-serve-and-settle window was not induced.** §1.7 is a
   source-ordering argument (`packages/serve/src/index.ts:1060` inside the
   persist transaction vs `apps/runner/src/index.ts:1400` after it) plus the
   observed happy-path flip. I did not kill the runner mid-flight to reproduce
   it — that would have required touching the standing stack.
3. **The `answerExpected`-catch fallback was not exercised live.** The branch
   `readRunAnswer` 404 → `servedDebateBundle(options.currentAnswer)` is covered
   by mutation (M-R2-DROP-HELD-ANSWER-AUTHORITY, M-R2-REFRESH-STOPS-FORWARDING-HELD)
   only; the live run's answer was readable on first try.
4. **N3's polling cadence has no baseline.** Observation only, no regression
   claim.
5. **The loading surface still does not appear in server-rendered *markup*.**
   The truth is in the RSC payload and paints on hydration (A8, unchanged
   pre-existing UI-01 behaviour); the browser evidence in §1.5 is what
   substantiates the loading surface, not the raw SSR HTML.
6. **BUG-01's retry path was not exercised** by this run — no `FAILED`
   `MODEL_CALL` attempts. No evidence either way, same as rev1.
7. Screenshots, the 118-sample timeline, both SSR captures, the network trace,
   the mutation specs and driver live in this session's scratchpad, not in the
   repo. The clone was deleted (`rm -rf /private/tmp/bug02-confirm-clone`;
   `ls` → `No such file or directory`).

---

## 6. Judgement

Every finding I raised in rev1 is either closed with executable and live
evidence, or is an advisory that no longer bears on correctness. My killer
mutation dies. The rework did not merely satisfy the mutation I named — it made
the underlying behaviour observable (a real DOM environment, scoped to one file,
as a devDependency) and replaced a string-matching SQL gate with behavioural
kills on real PostgreSQL, which is the harder and more honest fix. The one new
survivor (N1) is a retry path whose primary is covered three ways, the one
equivalent mutant is provably equivalent, and the one desired green is proof
that the F1 defect I flagged is gone.

The remaining STILL-OPEN items (A5, A7, A8) are pre-existing or documentation
matters that the BUG-02 delta neither caused nor was asked to fix.

---

VERDICT: APPROVE
