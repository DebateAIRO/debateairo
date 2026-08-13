# BUG-02 — Opus 5 diamond lens, review 1

Ticket: `t_59d211be` · board `debateai-v3` · mission PROG-V3-R1
Reviewer: Opus 5 lens (mutation testing + LIVE verification). Grok lens runs in
parallel and was not consulted.
Delta reviewed: `git diff 6c6fbca` at `/Users/vladmihaimiron/Documents/DebateAIRO`
(14 files, +252/-45).
Isolation (DR-163): every mutation ran in `cp -Rc` clone
`/private/tmp/bug02-opus-clone`; each mutated file was byte-restored, the clone
was verified `cmp`-identical to the real tree on all nine production files, then
deleted. The real tree was never edited (its `git diff --stat 6c6fbca` reads
14 files / +252 / −45 before and after this review). The standing stack
(PG 55432, API 8790, UI 3000) was never killed or restarted.

---

## 0. Headline

Mechanisms A (client run-first resolution) and C (no user-visible 404 noise) are
**live-proven** and well mutation-covered. Mechanism B's DB half could **not** be
live-proven — the standing API process predates the fix on disk — and the live
run exposed a **BLOCKING** consequence of the new client design that the enforced
suite cannot see: when the run projection reports anything other than `SETTLED`,
the client **discards an answer that is already served** and shows a permanent
loading surface, with no recovery even on a hard reload.

Counts: 22 mutations applied. **17 RED**, **5 silent survivors** — and three of
the survivors (B1, L9, B4) sit directly on load-bearing claims in the handoff.
All four *priority* mutations named in the goal packet die. Every gate the
handoff claims reproduces exactly, including `vitest list` = 551.

---

## 1. Live verification — one real run

Budget honoured: exactly **one** ask, depth 1, standard tier, low composition
budget, 2 agents. 20 `MODEL_CALL` ledger entries.

### 1.1 Baseline honesty probe (free, before the run)

A genuinely nonexistent id must still 404 loudly:

```text
$ curl -s -i http://127.0.0.1:8790/v1/runs/00000000-0000-4000-8000-000000000000 -H "x-user-dev-token: v-dev"
HTTP/1.1 404 Not Found
content-type: application/json; charset=utf-8
content-length: 25
Date: Thu, 13 Aug 2026 19:01:08 GMT

{"error":"RUN_NOT_FOUND"}
```

SSR for the same id emits Next's honest 404 (from the RSC payload of
`http://localhost:3000/debate/00000000-…`):

```text
E{"digest":"NEXT_HTTP_ERROR_FALLBACK;404","name":"Error","message":"NEXT_HTTP_ERROR_FALLBACK;404",
 "stack":[["DebatePage","webpack-internal:///(rsc)/./app/debate/[id]/page.tsx",52,70,28,1,false]],"env":"Server"}
```

No loading surface for a nonexistent id. **Honesty inversion did not happen.**

### 1.2 The ask

```text
$ curl -s -i -X POST http://127.0.0.1:8790/v1/asks -H "x-user-dev-token: v-dev" \
   -H "content-type: application/json" -d '{…"question_line":"BUG-02 live verification: what makes a good unit test?"…}'
HTTP/1.1 202 Accepted
Date: Thu, 13 Aug 2026 19:01:16 GMT

{"run_ref":"7b5fbee3-7455-406a-b8b6-f7399a36a870","status":"QUEUED"}
```

### 1.3 In-flight window (19:01:21Z → 19:06:30Z, ~5m14s)

64-sample poller (5s cadence). Representative sample:

```text
2026-08-13T19:01:21Z | run={"run_ref":"7b5fbee3-…","question_line":"BUG-02 live verification: what makes a good unit test?",
                            "state":"CLAIMED","terminal_reason":null}|HTTP:200
                     | answerHTTP=404 | byAnswerHTTP=404
```

`/v1/runs/<id>` returned **`CLAIMED`** for the whole flight, and
`/v1/runs/<id>/answer` returned 404 (by design, server-side).

**Boundary — the standing API predates the fix.** `CLAIMED` is a value the
patched SQL can no longer emit (its `CASE` maps `CLAIMED → 'RUNNING'`). Process
evidence:

```text
$ lsof -nP -iTCP:8790 -sTCP:LISTEN -t | xargs ps -o pid,lstart,command -p
  PID  STARTED                      COMMAND
96979  Thu Aug 13 21:16:01 2026     node … tsx … acceptance/run-acceptance.ts --token v-dev --serve

$ ls -lT packages/db/src/index.ts
-rw-r--r--  1 vladmihaimiron  staff  18538 Aug 13 21:49:38 2026 packages/db/src/index.ts
```

The API process started **33 minutes before** `packages/db/src/index.ts` was
written. The UI is `next dev` and *does* serve the current source (it emitted
`progressFillIndeterminate`/`aria-busy`, which exist only in the new code).
**Consequence: mechanism B's DB half is NOT live-verified.** It is verified only
by the clone's real-embedded-PostgreSQL integration test (§2). I did not restart
the stack, per the goal packet.

### 1.4 Browser during flight (19:03:59Z) — mechanisms A and C, live

Loaded `http://localhost:3000/debate/7b5fbee3-…` with the identity token in
localStorage + cookie.

```json
{ "hasTrack": true, "ariaBusy": "true", "hasIndeterminate": true, "errorish": [],
  "bodyText": "Dialectical Engine\ndezbatere.ro\nBUG-02 live verification: what makes a good unit test?\nRUNNING\n…" }
```

- The **LOAD-01 indeterminate bar renders** (`.progressTrack[aria-busy=true]` +
  `.progressFillIndeterminate`).
- The status pill reads **`RUNNING`**, not `CLAIMED` — **even though the API
  returned `CLAIMED`**. This live-proves the *presentation* half of mechanism B
  (`adapter.ts` `presentedState`) independently of the DB half. The SSR RSC
  payload agrees: `\"run_state\":\"RUNNING\"` with `initialPending: true`.
- The user's own question renders.
- No error/failed/not-found element in the DOM.

Browser network trace for the whole in-flight window (filter `v1/`):

```text
13. [GET] /api/v1/runs/7b5fbee3-… => [200] OK
16. [GET] /api/v1/runs/7b5fbee3-… => [200] OK
18. [GET] /api/v1/runs/7b5fbee3-…/events => [200] OK
… (25 further /v1/runs/<id> 200s and /events reconnects) …
```

Filter `answer` over the entire session (in-flight, post-settle, and after a hard
reload): **zero requests.** Console across the whole session: **0 errors, 0
warnings** (1 informational React DevTools line).

**Mechanism C is met, live: no `/v1/answers/<run_ref>` probe, no
`/v1/runs/<run_ref>/answer` probe, no 404, no banner, no toast, no not-found.**

### 1.5 Settle (19:06:35Z) — and the blocking result

```text
2026-08-13T19:06:35Z | run={… "state":"RUNNING","terminal_reason":null}|HTTP:200 | answerHTTP=200 | byAnswerHTTP=404 | ssrBytes=89493
SETTLED_DETECTED at 2026-08-13T19:06:35Z
2026-08-13T19:06:39Z | POSTSETTLE run={… "state":"RUNNING","terminal_reason":null}|HTTP:200 | ssrBytes=89496
$ curl -s http://127.0.0.1:8790/v1/runs/7b5fbee3-7455-406a-b8b6-f7399a36a870 -H "x-user-dev-token: v-dev"
{"run_ref":"7b5fbee3-…","question_line":"BUG-02 live verification: what makes a good unit test?","state":"RUNNING","terminal_reason":null}
$ curl -s -o /dev/null -w "answer=%{http_code}\n" http://127.0.0.1:8790/v1/runs/7b5fbee3-…/answer -H "x-user-dev-token: v-dev"
answer=200
```

The eternal-`RUNNING` lie is still live on this stack — expected, since this API
is the pre-fix build. What matters is what the **new client** does with it.

Browser at 19:07:54Z, 79 seconds after the answer served, page never touched:

```json
{ "hasTrack": true, "hasIndeterminate": false, "bodyLen": 1217,
  "head": "Dialectical Engine\ndezbatere.ro\nRUNNING\nThread\nSplit\nTree\nMap\n…" }
```

No debate. Still `RUNNING`. The question line is gone. Zero answer requests.

Then a **hard reload** at 19:08:58Z. SSR *did* deliver the served answer (89 496
bytes of HTML vs 40 830 in flight), and the client still ends at:

```json
{ "hasTrack": true, "hasIndeterminate": false, "bodyLen": 1217,
  "head": "Dialectical Engine\ndezbatere.ro\nRUNNING\n…" }
```

That the server really did hand the client the answer is not an inference — the
same cookie-only request the browser makes shows it in the RSC payload:

```text
$ grep -c "0e91e719-c42a-42dd-8670-121a21137beb" ssr-post-settle.html   # the served answer_id
1
$ grep -o 'initialPending[^,]*' ssr-post-settle.html
initialPending\":false}
$ grep -o 'initialAnswer\\":null' ssr-post-settle.html                  # in-flight capture has it; this one does not
(no match)
```

(In-flight, the same greps give `initialAnswer\":null` and
`initialPending\":true`.)

**The client blanked a served answer that the server had already handed it.** The
mechanism is explicit in the delta (`DebatePageClient.tsx` `refresh()`):

```ts
} else {
  answerRef.current = null;
  setAnswer(null);
  setDebate((current) => …);
}
```

`getDebateBundle` returns `loading` for every projection state that is not
`SETTLED`/`FAILED`, and `refresh()` then unconditionally nulls a held answer.
There is no path back to the answer except a `SETTLED` projection.

### 1.6 Is this only deployment skew? No — the race is reachable in the fixed code

`apps/runner/src/index.ts` persists and serves the answer, appends the `SERVE`
ledger entry, and **only then**, in a separate transaction, marks the work item
done:

```ts
await this.#ledger.append({ … actionKind: "SERVE", subjectItemId: persisted.answerId … });
const wonSettlement = await this.#work.settle({ workItemId: claimed.workItemId, … });
```

`settle()` is its own `withWriteTransaction`. So even with the patched SQL there
is a real window in which `/v1/runs/:id/answer` is 200 while the last work item
is still `CLAIMED` — i.e. the projection says `RUNNING`. Two consequences, of
very different severity:

- **Bounded (flicker).** In the normal path the window is two DB writes. A
  `refresh()` landing inside it converts an already-rendered debate back into a
  loading bar for a few milliseconds. Annoying, self-healing.
- **Unbounded (hang), and this is the serious one.** If the runner dies between
  the `SERVE` ledger append and `settle()` — crash, kill, redeploy — the answer is
  served and the work item stays `CLAIMED` **until the claim deadline expires**,
  which the goal packet itself describes as "claim TTL hours". For that entire
  period `/v1/runs/:id` reports `RUNNING` while `/v1/runs/:id/answer` reports 200.
  The pre-fix client showed the debate (answer-first). The new client shows a
  loading bar for hours and a hard reload does not help. This codebase already
  treats mid-run process death as a live condition: `tests/unit/exec01-rework-contract.test.ts`
  is literally named *"EXEC-01 crash-path disclosure › declares the surviving
  process-death stall"*.

I did **not** observe the bounded flicker directly. I observed the unbounded form
live (§1.5) against a projection that was stale for a different reason, and read
the settle ordering in source. That boundary is stated plainly — but the failure
*shape* I observed is the same shape a crash between serve and settle produces
with the patched SQL.

### 1.7 BUG-01 retry evidence (free observation)

None available. The ledger digest for the served answer shows:

```text
JUDGEMENT_SCHEDULED          OK           8
MODEL_CALL                   OK           20
PROPAGATION                  OK           1
SERVE                        OK           1
total entries 30 ; non-OK: []
```

No `FAILED` `MODEL_CALL` attempts, so BUG-01's content-rejection retry path was
not exercised by this run. Nothing to report either way.

Unrelated observation (out of BUG-02 scope, advisory only): the served answer is
`serve_state: COMPONENTS_ONLY` with `verdict_unavailable.reason_ref =
"serve-gate:COMPONENTS_ONLY_DEFECT"`, and all 8 ledger work items report
`status: "ERROR", reason: "MISSING_COMPLETED_ITEM"`. That is a run-quality signal
for whoever owns the serve gate, not a BUG-02 defect.

### 1.8 The SSR claim in the review packet is not literally true

The goal packet asked me to verify that "the LOADING state server-renders" via
curl with the identity cookie. It does **not**, and never did:

```text
$ curl -s http://localhost:3000/debate/<run_ref> -H "Cookie: debateai:user-dev-token=v-dev"
…<div class="eyebrow">Authentication</div><h1 class="display sm">Enter your user token</h1>…
```

`DebatePageGate` wraps the client in `AuthGate`, which resolves identity from
`localStorage`, so the server-rendered *markup* is always the token prompt. The
loading truth does reach the browser in the RSC payload
(`\"run_state\":\"RUNNING\"`, `initialPending: true`) and the surface paints on
hydration — which the browser evidence in §1.4 confirms. This is pre-existing
UI-01 architecture; the BUG-02 delta touches neither `AuthGate` nor `page.tsx`.
Recording it so no future reviewer mistakes the auth shell for a missing loading
surface.

---

## 2. Mutation ledger re-run (clone)

Baseline in the clone before any mutation:

```text
$ pnpm exec vitest run tests/unit/v2ui-data-layer.test.ts tests/unit/contract.test.ts \
    tests/unit/load01-run-projection.test.ts tests/render/load01-debate-page.test.tsx tests/unit/v2ui-ownership.test.ts
 Test Files  5 passed (5)
      Tests  72 passed (72)
   Duration  1.35s
```

Every mutation below was applied to the clone, the named tests run, and the file
byte-for-byte restored afterwards.

### 2.1 The handoff's own ledger

| # | Mutation (clone) | Expected | Observed | Killing test(s) |
|---|---|---|---|---|
| L1 | Drop client run-projection-first; restore the answer-first 404 probe pair in `getDebateBundle` | RED | **RED** (6 failed) | `reads an in-flight CLAIMED/RUNNING run first…`, all 3 mocked-transport render tests |
| L4 | `presentedState = run.state` (expose raw `CLAIMED`) | RED | **RED** (3 failed) | `renders CLAIMED as typed indeterminate truth…`, `reads an in-flight CLAIMED run first…` |
| L5 | Restore pre-fix `progressStrip` JSX (no indeterminate bar) | RED | **RED** (5 failed) | all 5 LOAD-01 render assertions |
| L6 | Return `readAnswer(...)` instead of the loading bundle (resurface the by-design 404) | RED | **RED** (5 failed) | `keeps an existing in-flight run out of the error path` + render trace |
| L7 | Delete the `SETTLED → readRunAnswer` block | RED | **RED** (2 failed) | `flips a settled run to its served answer…`, `renders the served debate after … SETTLED` |
| L8 | Remove `SETTLED` from `RunProjectionSchema` | RED | **RED** (1 failed) | `keeps loading and loud-stop run states typed on the wire` |
| L9 | Clobber SSE-built nodes on projection refresh (`setDebate(bundle.detail)`) | RED | see §2.3 | — |
| L2 | Revert the settled arm → `ELSE 'RUNNING'` | RED | see §2.3 | — |
| L3 | `CLAIMED` arm → `THEN 'CLAIMED'` | RED | see §2.3 | — |

All four **priority** mutations named in the goal packet (drop the client
fallback, revert the settled arm, resurface the in-flight error banner, break the
serve-flip) are covered; L1/L6/L7 are RED here and L2 is in §2.3.

### 2.2 Beyond-ledger hunt

| # | Mutation | Rationale | Observed |
|---|---|---|---|
| B2 | On `readRun` 404, synthesise a `loading` bundle (client honesty inversion) | a nonexistent id must still 404 loudly | **RED** (3 failed) |
| B3 | `getDebateServer` returns `loading` instead of `not_found` (SSR honesty inversion) | same, server side | **RED** (1 failed) |
| B4 | Delete the `FAILED` arm — a dead run presents as loading | eternal spinner on a failed run | see §2.3 |
| B5 | Drop `aria-busy` only | screen-reader honesty | **RED** (3 failed) |
| B6 | Remove the `settled` label from `statusLabel` | new vocabulary member unlabelled | see §2.3 |
| B9 | Loading surface stops showing the user's own question | LOAD-01 content | **RED** (5 failed) |
| B10 | In-flight run presented as `complete` (loading surface suppressed) | the original defect | **RED** (8 failed) |
| B1 | Kill the SSE-driven `refresh()` (`if (false) void input.refresh()`) — bar renders, flip is dead | the packet's named "flip dead" probe | see §2.3 |

### 2.3 Full-suite verdicts for the deferred rows and the F1 probes

These eight ran against the **entire enforced suite** (`pnpm exec vitest run`,
76 files / 552 tests, real embedded PostgreSQL included), so "survived" here means
survived everything, not just the five focused files.

| # | Mutation | Result | Killed by |
|---|---|---|---|
| L2 | Settled arm → `ELSE 'RUNNING'` (eternal RUNNING restored) | **RED** — 2 failed | `tests/integration/database.test.ts › projects a claimed work item as RUNNING and an all-DONE run as SETTLED`; `tests/unit/load01-run-projection.test.ts` |
| L3 | `CLAIMED` arm → `THEN 'CLAIMED'` | **RED** — 2 failed | same two |
| F1-CLAIMED-CASE-TO-QUEUED | `CLAIMED` arm → `THEN 'QUEUED'` (a different lie in the same arm) | **RED** — 2 failed | same two |
| B7 | `bool_and(state='DONE')` → `bool_or(...)` (semantically equivalent, see §4.1) | **RED** — 1 failed | **only** `tests/unit/load01-run-projection.test.ts` (SQL source text). The real-PG test cannot see it. |
| F1-SQL-REFORMAT | `work.state='DONE'` — whitespace only, behaviour identical | **RED** — 1 failed | **only** `tests/unit/load01-run-projection.test.ts` |
| F1-INVENTED-PCT | loading branch returns `pct: 37, count: "37%"` | **RED** — 5 failed | all five LOAD-01 render assertions |
| **L9** | Clobber SSE-built nodes on projection refresh | **GREEN — SURVIVED** | nothing (552 tests) |
| **B1** | Kill the SSE-driven `refresh()` — bar renders, flip is dead | **GREEN — SURVIVED** | nothing (552 tests) |
| **B4** | Delete the client `FAILED` arm — a dead run presents as loading | **GREEN — SURVIVED** | nothing (552 tests) |
| **B6** | Remove the `settled` label from `statusLabel` | **GREEN — SURVIVED** | nothing (552 tests) |
| **B8** | `ELSE 'QUEUED'` → `ELSE 'RUNNING'` (zero-work-item run) | **GREEN — SURVIVED** | nothing (552 tests) |

### 2.4 The five silent survivors

- **B1 — the flip is dead and nothing notices.** `if (false) void input.refresh()`
  in `createDebatePageRunEventConsumer` disables every SSE-driven refresh: the
  loading bar renders forever and the debate never appears. All 551 tests pass.
  This is the mechanical proof of finding **BUG02-B2**.
- **L9 — the tree-preservation branch has no killing test.** The handoff's own
  ledger row 8 says "review should mutate that branch and rerun render/live
  tests"; I did, against the whole suite, and it survives. Under P1 that row has
  no killing assertion and should not be listed as one.
- **B4 — a `FAILED` run silently becomes a loading bundle.** Deleting the
  `run.state === "FAILED"` arm from `getDebateBundle` means a dead run shows the
  indeterminate bar forever, with no banner. The *SSR* failed path is covered
  (`surfaces a typed failed run and keeps a truly missing id not-found` kills the
  serverApi mutation B3), but the **client** failed arm is uncovered. DELIVER 2's
  "loud stop" is only half tested.
- **B6 — the new `SETTLED` label is unlabelled.** `statusLabel` falls through to
  `return status || "—"`, so the user would see the raw token `SETTLED` — exactly
  the class of defect this ticket removed for `CLAIMED`. Reachable in the
  author's own documented finalizing window (`SETTLED` projection + answer not
  yet readable → `debateDetailFromRunProjection` → `run_state: "SETTLED"` →
  `progress.label = statusLabel("SETTLED")`). The
  `v2-ui honesty labels cover the full closed vocabulary` describe block covers
  tier sources, condition marks and abstention kinds — not `statusLabel`.
- **B8 — the `ELSE` arm is untested.** Only reachable for a run with zero work
  items; low severity, listed for completeness.

---

## 3. F1 sweep — assertions that cannot fail for their believed reason

**F1-a (material).** The enforced suite has **no DOM test environment**: no
`jsdom`, no `happy-dom`, no `@testing-library/react`; `vitest.config.ts` sets no
`environment`, and `tests/render/load01-debate-page.test.tsx` uses
`renderToStaticMarkup`, which runs **no effects**. Therefore `refresh()`, the SSE
consumer wiring, and every state transition in `DebatePageClient` are never
executed by any test. Two consequences:

- The test named `flips a settled run to its served answer **without a manual
  refresh**` does not test a refresh, a component, or a flip. It asserts that
  `getDebateBundle` calls `["run", "run-answer"]` for a `SETTLED` projection.
  The name claims a behaviour the assertion structurally cannot observe.
- The delta's own acceptance claim #1 ("flips to the debate when the answer
  serves — **without a manual refresh**") therefore rests on no executable
  evidence. Mutation **B1** (disabling the SSE-driven refresh entirely) is the
  proof; see §2.3 for its result.

**F1-b (advisory, confirmed).** `tests/unit/load01-run-projection.test.ts`
asserts the SQL **source text** by regex
(`/WHEN bool_and\(work\.state = 'DONE'\) THEN 'SETTLED'/`). Two probes prove it
is a string test, not a behaviour test:

- `F1-SQL-REFORMAT` — `work.state='DONE'`, whitespace only, behaviour identical:
  **RED**. A neutral reformat breaks the gate.
- `B7-PREMATURE-SETTLED` — `bool_and` → `bool_or`, an *equivalent* mutant at that
  position (§4.1): **RED**, and killed **only** by this text assertion; the
  real-PG integration test could not distinguish it.

The real-PG test is the load-bearing one. The source-text test should be read as
executable documentation of the CASE, and future SQL edits should expect to touch
it for cosmetic reasons.

**F1-c (minor, largely cleared).** `tests/render/load01-debate-page.test.tsx:110`,
`expect(html).not.toContain("40%")`, inside a test named "…with no invented
progress": `40%` is an arbitrary literal the code could never emit, so that one
line cannot fail for the reason its name gives. I probed whether the property
itself is protected — `F1-INVENTED-PCT` makes the loading branch return
`pct: 37, count: "37%"` — and it came back **RED across all five** LOAD-01 render
assertions. So the *test* is load-bearing (via `progressFillIndeterminate`,
`progressTrack`, `aria-busy`); only the `"40%"` line is dead weight. Replacing it
with `not.toMatch(/\d+%/)` or `not.toContain("progressCount")` would make the
intent honest, but nothing is unguarded.

**F1-d (minor).** `not.toContain("Claimed")`, `not.toContain("Models arguing")`,
`not.toContain("Generating")` are negative-only assertions. L4/L5/B10 show the
surrounding positives do carry weight, so these are cheap redundancy rather than
false comfort.

---

## 4. Design observations (SOLID/DDD, no mutation attached)

1. **The `SETTLED` arm is only reachable when every item is `DONE`.** The
   work-item vocabulary is CHECK-constrained to
   `('READY','CLAIMED','DONE','FAILED')` (`migrations/0000_s00.sql:103`), and the
   three preceding arms consume `FAILED`, `CLAIMED`, `READY`. So
   `bool_and(work.state = 'DONE')` and `bool_or(...)` are **equivalent mutants**
   at that position — the arm is a tautology given the arms above it. Not a
   defect; worth knowing that the `bool_and` cannot be "tightened".
2. **`ELSE 'QUEUED'` is reachable only for a run with zero work items** (LEFT
   JOIN, NULL aggregates). That is the honest reading of a freshly accepted ask.
   The old `ELSE 'RUNNING'` was the eternal-RUNNING lie; the new ELSE is correct.
3. **The SSR path still fires the by-design 404 pair per page load.**
   `getDebateServer` is answer-first (`/v1/answers/:id` → 404 →
   `/v1/runs/:id/answer` → 404 → `/v1/runs/:id`), visible in the in-flight RSC
   payload. The goal packet explicitly blessed the SSR shape, and these are not
   user-visible, so this is advisory only — but "minimal 404 chatter" is not
   literally achieved server-side.

---

## 5. Gates (clone, real output)

All gates run in the clone **after** every mutation was restored. First, proof
the clone was returned to the delivered state:

```text
$ git -C /private/tmp/bug02-opus-clone diff --stat 6c6fbca | tail -3
 DebateAI-V3/tests/unit/v2ui-data-layer.test.ts     | 86 ++++++++++++++++++++--
 DebateAI-V3/tests/unit/v2ui-ownership.test.ts      |  2 +
 14 files changed, 252 insertions(+), 45 deletions(-)
```

Identical to the real tree's `git diff --stat 6c6fbca` (14 files, +252/−45).

```text
===== GATE: typecheck =====
$ tsc --noEmit
(no output, exit 0)

===== GATE: lint =====
$ pnpm run audit:architecture && pnpm run audit:source
$ tsx tools/orphan-audit/src/cli.ts architecture
{
  "edgeRowsChecked": 27,
  "violations": []
}
$ tsx tools/orphan-audit/src/cli.ts source
{
  "blocking": []
}

===== GATE: vitest list count =====
551

===== GATE: full vitest run =====
 ✓ tests/unit/exec01-rework-contract.test.ts > EXEC-01 crash-path disclosure > declares the surviving process-death stall instead of claiming unqualified stall freedom 1ms
 ✓ tests/unit/test-database-policy.test.ts > DR-121 — prototype database provisioning policy > selects real embedded PostgreSQL without probing a Docker-family runtime 1ms

 Test Files  76 passed (76)
      Tests  551 passed | 1 skipped (552)
   Duration  24.65s (transform 821ms, setup 0ms, import 5.62s, tests 12.75s, environment 4ms)
```

Typecheck also run read-only on the **real** tree: `tsc --noEmit`, exit 0.

`vitest list` = **551**, matching the expected collection count exactly. Every
gate the handoff claimed reproduces.

---

## 6. Findings

### BLOCKING

**BUG02-B1 — a served answer can be discarded by a non-`SETTLED` projection, and
on this stack the debate never appears at all.**
Evidence: §1.5 (live, 79 s after serve and after a hard reload the page shows a
loading surface and no debate, with zero answer requests ever issued) and §1.6
(the runner serves the answer and settles the work item in two separate
transactions, so the same condition is reachable with the patched SQL).
`getDebateBundle` treats the run projection as the sole authority on whether an
answer exists, and `refresh()` then executes `setAnswer(null)` on every `loading`
bundle. The pre-fix client was noisy but self-healing; the new one is quiet but
fails closed.
Minimal remedies (author's choice): (a) never null a held answer on a `loading`
bundle — keep `answerRef.current` and only add run status; and/or (b) when the
SSE live state is already `terminal`, read the answer regardless of the
projection state.
This finding is *independent of the deployment skew* — the skew is what made it
observable, the ordering in `apps/runner/src/index.ts` is what makes it
reachable.

**BUG02-B2 — DELIVER 1's "without a manual refresh" has no executable evidence,
and the whole flip can be deleted silently.**
Mutation **B1** — `if (false) void input.refresh()`, which kills every SSE-driven
refresh so the loading bar renders forever and the debate never appears — passes
**all 551 tests**. Cause (§3 F1-a): the enforced suite has no DOM environment
(`vitest.config.ts` sets none; no `jsdom`/`happy-dom`/`@testing-library`), and
`tests/render/*` uses `renderToStaticMarkup`, which runs no effects. `refresh()`
is never executed by any test in the repo. The test named `flips a settled run to
its served answer **without a manual refresh**` asserts only that
`getDebateBundle` calls `["run", "run-answer"]`. Under P1 this is a load-bearing
behaviour with no killing assertion. Either add a DOM environment for one focused
mount-and-advance test, or restate DELIVER 1 and acceptance claim 1 to what the
tests actually prove.

### Advisory

- **BUG02-A1** — mechanism B's DB half is **not live-verified**; the standing API
  predates the fix (§1.3). A restart is required for a live `SETTLED` proof and
  is outside my mandate. The clone's real-embedded-PostgreSQL test is the only
  behavioural evidence, and it is genuine (L2/L3/F1-CLAIMED-CASE all die there).
- **BUG02-A2** — the client `FAILED` arm has no killing test (mutation **B4**
  survives all 551): delete it and a dead run shows the indeterminate bar
  forever with no banner. The SSR failed path *is* covered; the client one is
  not. DELIVER 2's loud stop is half-tested.
- **BUG02-A3** — the ledger's row 8 (clobber SSE-built nodes) has no killing
  assertion: mutation **L9** survives all 551. The handoff itself deferred that
  mutation to review; the row should not be listed as covered.
- **BUG02-A4** — the new `SETTLED` label is untested and falls through to the raw
  token (mutation **B6** survives): a user in the documented finalizing window
  would read `SETTLED`, the same defect class this ticket fixed for `CLAIMED`.
- **BUG02-A5** — deployment coupling: the browser's ability to show a served
  answer now depends on the client, API and DB halves shipping together. Worth a
  line wherever the stack restart procedure lives.
- **BUG02-A6** — F1-b: the SQL source-text assertion is a string test; a
  whitespace-only reformat and an equivalent `bool_and`→`bool_or` mutant both go
  red there and nowhere else (§3, §2.3).
- **BUG02-A7** — SSR still fires the by-design 404 pair per page load (§4.3);
  not user-visible, and the packet blessed the SSR shape.
- **BUG02-A8** — the packet's "loading state server-renders" expectation is not
  achievable through `AuthGate`; the loading surface paints on hydration (§1.8).
  Pre-existing, not caused by this delta.
- **BUG02-A9** — the `ELSE` arm of the CASE (zero-work-item run) is untested
  (mutation **B8** survives). Low severity.

### Confirmed good (do not regress)

- Run-first client resolution: **zero** answer-endpoint requests from the browser
  during a 5-minute flight, and zero console errors/warnings (§1.4).
- The LOAD-01 indeterminate bar with `aria-busy="true"` renders live (§1.4).
- `CLAIMED` never reaches the user as a resting label — proven live *against an
  API that literally returned `CLAIMED`* (§1.4).
- A nonexistent id still 404s loudly, server-side and in SSR (§1.1); both honesty
  inversions I planted were killed (B2, B3).
- All four priority ledger mutations die (§2.1).

---

## 7. Boundaries I could not cross (disclosed in full)

1. **Mechanism B was never exercised live.** The API on 8790 runs pre-fix code
   (§1.3). Restarting the standing stack is forbidden by the packet, so the live
   `SETTLED` proof does not exist. Only the clone's real-PG test covers it.
2. **The fixed-projection flip was never observed end-to-end.** Because of (1),
   the browser never saw a `SETTLED` projection. The flip is covered only by the
   `getDebateBundle` call-order tests — and mutation B1 shows the component-level
   flip is uncovered entirely.
3. **The bounded serve→settle flicker is a source reading, not an observation.**
   §1.6 states this explicitly.
4. **One run only.** No sample of failed runs, no concurrent-asker behaviour, no
   `FAILED` projection observed live. `terminal_reason`/failure presentation is
   test-only evidence.
5. **The BUG-01 retry path was not exercised** by this run (§1.7); I have no live
   evidence about it either way.
6. Screenshots, SSR captures, the 64-sample timeline, the mutation driver and its
   JSON results live in this session's scratchpad, not in the repo.

---

VERDICT: BLOCKING
