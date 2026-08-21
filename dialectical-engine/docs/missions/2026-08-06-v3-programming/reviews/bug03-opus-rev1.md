# BUG-03 — Opus 5 lens (dual diamond, rev 1)

Ticket `t_b0cb0cc7` · board `debateai-v3` · reviewer: Opus 5 lens (mutation
testing + LIVE verification) · Grok lens ran in parallel, uncoordinated.

Delta reviewed: `git diff 3bef975` at `/Users/vladmihaimiron/Documents/DebateAIRO`,
**minus** `DebateAI-V3/acceptance/seed-register.*` (DR-173, ruled separately).
That is 10 tracked files + 2 untracked production/test files
(`apps/v2-ui/components/DebatesBuffer.tsx`, `tests/render/bug03-home-buffer.test.tsx`).

Isolation (DR-163): every mutation ran in `cp -Rc` clone
`/private/tmp/bug03-opus-clone`, deleted after; restores verified byte-identical
against the real tree. The standing stack (PG 55432 / API 8790 / UI 3000) was
never killed, restarted or written to except by the one ruled ask.

---

## 0. Headline

**The bug V reported is fixed, and I watched it be fixed live.** V's exact
scenario — start a debate, navigate back to the home buffer while it generates —
now shows the run as a `Generating` card linking to `/debate/<run_ref>`, and
after settle the same debate appears exactly **once** as a served entry with no
lingering generating row. All four of the handoff's mutation-ledger rows
reproduce RED and restore GREEN.

Two mutants survive the **entire** enforced suite, and both are behaviours the
packet named. Neither is a defect in the shipped code — the shipped code is
correct — but both are unpinned, and **two mutation-kill claims written inside
the new test files are false**. Those are advisory findings, not blockers, on
the calibration this diamond used for BUG-02 (live defect ⇒ BLOCKING; silent
survivor ⇒ advisory).

VERDICT below.

---

## 1. LIVE verification — one real depth-1 run, the V scenario

Standing stack was already running BUG-03 code (API `8790` served `open_runs`
and `run_ref` on the baseline probe *before* my ask; UI `3000` runs
`next dev` per `.claude/launch.json`, so no build skew existed and no restart
ceremony was needed). Baseline probe, before anything:

```text
$ curl -s -H "x-user-dev-token: v-dev" "http://127.0.0.1:8790/v1/answers?limit=5&offset=0"
{"items":[{"answer_id":"da01304d-…","run_ref":"11f87170-…","answer_version":1,
"question_line":"What is the strongest case for adopting a four-day workweek…",
…,"created_at_sequence":1}],"open_runs":[],"limit":5,"offset":0,"total":1}
```

### 1.1 The ask (T = 2026-08-14T06:07:19Z)

```text
$ curl -X POST http://127.0.0.1:8790/v1/asks -H 'x-user-dev-token: v-dev' -d '{
  "question_line":"BUG-03 live: does the buffer show me generating?",
  "risk_tier":"standard","tier_source":"MACHINE_DEFAULT",
  "tier_provenance_ref":"machine:deployment-floor","composition_budget_tier":"low",
  "depth_params":{"depth":1},"agent_count":2,
  "decision_owner":"bug03-diamond","action_owner":"bug03-diamond",
  "decision_scope":"personal","caller_scope":"ASKER",
  "as_of":"2026-08-14T06:07:19Z","steering_presets":[],"steering_annotations":[]}'

{"run_ref":"0c616aec-1f14-48ae-95b5-a39dfa1c4c78","status":"QUEUED"}
HTTP 202
```

### 1.2 In flight — the API index surface (T+6s, 06:07:25Z)

```json
{
  "items": [ { "answer_id":"da01304d-…", "run_ref":"11f87170-…",
               "question_line":"What is the strongest case for adopting a four-day workweek at a software company?",
               "created_at_sequence": 1 } ],
  "open_runs": [
    { "run_ref": "0c616aec-1f14-48ae-95b5-a39dfa1c4c78",
      "question_line": "BUG-03 live: does the buffer show me generating?",
      "state": "RUNNING",
      "terminal_reason": null,
      "created_at_sequence": 279 }
  ],
  "limit": 50, "offset": 0, "total": 2
}
```

Open-run entry shape verified: honest state from the run/work-item projection
(`RUNNING`, not an invented label), the real question line, and the run ref —
exactly DELIVERS #1.

### 1.3 In flight — THE V SCENARIO, the HOME page (same window)

`GET http://localhost:3000/` with `Cookie: debateai:user-dev-token=v-dev`
(cookie name read from `apps/v2-ui/lib/serverApi.ts` → `USER_TOKEN_COOKIE`).
HTTP 200, 47022 bytes. Every `debateCard` anchor extracted from the SSR HTML:

```text
HREF /debate/0c616aec-1f14-48ae-95b5-a39dfa1c4c78
  PILL_CLASS: pillGen
  TEXT: BUG-03 live: does the buffer show me generating? | Generating | →

HREF /debate/da01304d-38f8-4c1f-b6f5-8160d6895859
  PILL_CLASS: pillOk
  TEXT: What is the strongest case for adopting a four-day workweek…? | Complete | →
```

Header count: `class="count">2 total<`.

This is the reported bug, gone: the in-flight run is **present**, **newest-first**,
labelled `Generating`, and **linked to its own `/debate/<run_ref>`**. V would
have found their debate.

### 1.4 Settle (06:15:18Z, ≈8m after the ask)

```text
06:09:51Z  {"run_ref":"0c616aec-…","state":"RUNNING","terminal_reason":null}
06:12:24Z  {"run_ref":"0c616aec-…","state":"RUNNING","terminal_reason":null}
06:15:18Z  {"run_ref":"0c616aec-…","state":"SETTLED","terminal_reason":null}
06:15:26Z  GET /v1/runs/0c616aec-…/answer → HTTP 200
```

Index at 06:15:26Z:

```json
{"items":[
  {"answer_id":"030bba3b-9987-44f5-9122-ceac61497a87","run_ref":"0c616aec-1f14-48ae-95b5-a39dfa1c4c78",
   "question_line":"BUG-03 live: does the buffer show me generating?","verdict_state":"SUPPORTED",
   "serve_state":"COMPOSED","staleness_state":"FRESH","created_at_sequence":279},
  {"answer_id":"da01304d-…","run_ref":"11f87170-…","created_at_sequence":1}],
 "open_runs":[],"limit":50,"offset":0,"total":2}
```

### 1.5 Home page after settle — served exactly ONCE

```text
COUNT PILL: 2 total
CARD 1: HREF /debate/030bba3b-9987-44f5-9122-ceac61497a87
  PILL=pillOk  TEXT: BUG-03 live: does the buffer show me generating? | Complete | →
CARD 2: HREF /debate/da01304d-38f8-4c1f-b6f5-8160d6895859
  PILL=pillOk  TEXT: What is the strongest case for adopting a four-day workweek…? | Complete | →
TOTAL CARDS: 2
```

**One** card for the BUG-03 debate. **No** lingering generating entry
(`open_runs: []`). No duplicate. DELIVERS #2's "appears ONCE" holds live.

### 1.6 Both link forms resolve, and S05 holds live

```text
GET /debate/030bba3b-… (served card's answer_id link)  → HTTP 200
GET /debate/0c616aec-… (the generating card's run_ref link, post-settle) → HTTP 200
GET /v1/answers  with  x-user-dev-token: bug03-foreign-probe
  → {"items":[],"open_runs":[],"limit":50,"offset":0,"total":0}
```

The S05 boundary is proven **live**, not only in the clone: a different asker
token sees neither V's served answers nor V's open runs.

### 1.7 FAILED arm — boundary disclosed

The database has **no failed run** for this asker post-reseed: the owner's
`open_runs` was `[]` both before the ask and after settle, and `total` is 2
(both served). There is therefore **no live evidence for the failed-run card**.
The failed arm rests entirely on:

- `tests/integration/database.test.ts` — real embedded PG, `recordTerminalFailure`
  → `state:"FAILED", terminal_reason:"TEST_LAYER:BUG03_TERMINAL_FAILURE"`, and
- `tests/render/bug03-home-buffer.test.tsx` — exact copy
  `Debate generation failed: TOTAL_REVIEW_COVERAGE_UNSATISFIED`.

Both are mutation-proven below (MUT-X2, MUT-X3). Advisory A5 records a styling
observation about that card that only a live failure would have surfaced.

---

## 2. Mutation ledger

Harness: `mutate.py` (anchored string edits) + `run-mut.sh`; each row applies
the mutation, runs the named test, reverts, and re-hashes every touched file.
Every row below reports `RESTORED_IDENTICAL`. Clone baseline before any
mutation: `Test Files 78 passed (78) · Tests 563 passed | 1 skipped (564)`.

### 2.1 The handoff's own four rows — all reproduce

| # | Mutation | Test run | Result | Observed RED |
|---|---|---|---|---|
| 1 | `MUT-BUG03-DROP-OPEN-READ` — open rows filtered to the empty set | integration `-t "BUG-03"` | **RED**, exit 1 | `expected [] to deeply equal [ ObjectContaining{…}, …(1) ]` |
| 2 | `MUT-BUG03-FOREIGN-LEAK-BOTH-GUARDS` — asker predicate removed from **both** the index CTE and `RunRepository.readLoadingProjection` | integration | **RED**, exit 1 | `expected [ {…}, {…}, {…} ] to deeply equal [ ObjectContaining{…}, …(1) ]` (foreign run leaked in) |
| 3 | `MUT-BUG03-SERVED-DUPLICATE` — `NOT EXISTS serve.answer` → `TRUE` | integration | **RED**, exit 1 | `expected [ {…}, {…}, {…} ] to deeply equal [ ObjectContaining{…}, …(1) ]` (served run reappears as an open row) |
| 4 | `MUT-BUG03-RENDER-GENERATING-AS-DONE` — non-failed open run → `"complete"` | render | **RED**, exit 1 | `expected '<a class="debateCard" href="/debate/r…' to contain 'Generating'` |

The ledger is **honest**. Row 2's caveat in the handoff ("Removing either guard
alone stayed green, proving defense in depth") is also literally true — see
MUT-X1/X1b.

### 2.2 Beyond-ledger hunt (10 further mutations)

| # | Mutation | Scope | Result |
|---|---|---|---|
| X1 | Foreign leak in the **index CTE only** (`run.asker_id = $1` → `$1 = $1`) | integration | **SURVIVES focused** (killed by the second guard: `readLoadingProjection` returns `null` and the row is dropped) |
| X1b | Foreign leak in the **projection only** | integration | **SURVIVES focused** (killed by the first guard) |
| X2 | Swallow `terminal_reason` in `serve` (`projection.terminalReason` → `null`) | integration | **RED** — killed by the *contract*, not the assertion: `ZodError: FAILED requires a terminal reason and non-failed runs forbid one` at `open_runs.0` |
| X3 | Swallow the failure copy in `DebatesBuffer` (always render `relativeTime`) | render | **RED** — `expected … to contain 'Debate generation failed: TOTAL_REVIE…'` |
| X4 | **Pagination edge**: `ORDER BY created_at_sequence DESC` → `ORDER BY kind ASC, created_at_sequence DESC` (served answers win every page slot) | integration, then **full suite** | **SURVIVES — full suite green (563 \| 1, exit 0)** |
| X5 | Render a **FAILED** run as generating (`status: "generating"` unconditionally, `terminal_reason` preserved) | render, then **full suite** | **SURVIVES — full suite green (563 \| 1, exit 0)** |
| X6 | Drop the UI served-run dedupe (`.filter(run => !servedRunRefs.has(...))`) | render | **RED** — `expected [ Array(4) ] to deeply equal [ Array(3) ]` |
| X7 | Render a generating run **without its link** (`href` → `"/"` unless complete) | render | **RED** — `expected '<a class="debateCard" href="/">…' to contain 'href="/debate/run:generating"'` |
| X8 | Drop open runs from the merged UI list entirely | render | **RED** — `expected [ 'answer:served' ] to deeply equal [ Array(3) ]` |

X1/X1b together confirm the claimed defense in depth is real. Note the residual:
under X1 a leaked foreign row still **consumes a `LIMIT` slot** before being
dropped, so the owner's own oldest page rows would silently vanish. Only
reachable under mutation; recorded as A4.

### 2.3 The two silent survivors (full enforced suite green)

**X4 — the pagination edge is unpinned, and its failure mode *is* the reported
bug.** With served rows sorted ahead of open rows, an asker holding
`HOME_PAGE_SIZE` (50) served answers stops seeing their in-flight debate on
home — precisely "I cannot see it in the debates buffer as generating". The
shipped SQL is **correct** (one global `created_at_sequence DESC` over the
`UNION ALL`, so a fresh open run always takes the top slot), but nothing pins
it. The only assertion the handoff cites for the bound —

```ts
expect(index.items.length + index.open_runs.length).toBeLessThanOrEqual(index.limit);
```

— runs with 3 rows against `limit = 10`. It **cannot fail for the reason it is
believed to test** (see F1-a).

**X5 — a FAILED run may wear the `Generating` pill and no test notices.**
`status: run.state === "FAILED" ? "failed" : "generating"` → `status:
"generating"` keeps the failure line rendering (so the copy assertion still
passes) while the pill flips to `Generating`. The render test's status assertion
is `expect(html).toContain("Generating")`, satisfied by the *other* card. A user
would see a failed debate advertising itself as still generating — forever. The
shipped code is correct; the behaviour is unpinned.

### 2.4 Two mutation-kill claims inside the new test files are FALSE

These are comments the tests carry as their own mutation evidence:

- `tests/integration/database.test.ts`:
  `// MUT-BUG03-FOREIGN-LEAK: remove asker_id from the open arm -> RED.`
  **Measured: GREEN** (X1). The handoff's table is honest about this; the
  in-file comment contradicts the handoff.
- `tests/render/bug03-home-buffer.test.tsx`:
  `// MUT-BUG03-RENDER-FAILED-AS-GENERATING: the terminal-reason assertion turns RED.`
  **Measured: GREEN** (X5). The terminal-reason assertion is untouched by that
  mutation; nothing else observes the failed card's status.

A maintainer reading either comment would believe a guard is pinned that is not.

---

## 3. F1 sweep — assertions that cannot fail for their believed reason

**F1-a (material).** `tests/integration/database.test.ts`, the bound assertion
`items.length + open_runs.length <= limit` — fixture is 3 rows, `limit` is 10.
The assertion is structurally unfalsifiable and is the handoff's sole evidence
for the `HOME_PAGE_SIZE` AC. It is the same hole X4 walks through.

**F1-b (advisory).** Same test: `expect(open_runs.map(r => r.run_ref))
.not.toContain(foreignRunId)` and `.not.toContain(servedWork.runId)` are both
strictly implied by the preceding exact `expect(index.open_runs).toEqual([...])`.
Redundant, not misleading — but they read as independent S05/dedupe guards and
are not.

**F1-c (material).** `tests/render/bug03-home-buffer.test.tsx`:
`expect(html).toContain("Generating")` is a whole-document substring check
across three cards. It cannot attribute the label to the generating run. This
is why X5 survives; `statusLabel("failed") === "Failed"`, so a card-scoped
assertion would have killed it.

Everything else in both new tests is exact and meaningful: the ordered id list,
the exact `open_runs` array, the two `href` assertions, the exact failure copy,
and `html.match(/The served debate/g)).toHaveLength(1)`.

---

## 4. Design observations (no mutation attached)

- `readAnswerIndex` now issues 1 page query + 1 count + **N + M** per-row
  projection queries (`readAnswerProjection` per served row, `readLoadingProjection`
  per open row). At `HOME_PAGE_SIZE = 50` that is up to 52 round trips for one
  home render. The N-per-answer half is pre-existing; the M-per-open-run half is
  new. Correct and canonical (it reuses BUG-02's projection rather than
  duplicating lifecycle SQL) — but it is an N+1 the surface did not have before.
- Served-arm ordering silently changed from `max(answer.sealed_at_seq) DESC` to
  `run.created_at_seq DESC`, i.e. from *answered-at* to *asked-at*. Necessary for
  one merged order and disclosed in the handoff as the chosen key, but it is a
  behaviour change to an already-shipped surface and no test pins either order.
- `total` changed from "count of distinct answers" to "count of the asker's
  runs", and the page is now per-**run** (`DISTINCT ON (run.run_id)`) rather than
  per-answer. Self-consistent with the merged page, and live it renders honestly
  (`2 total` for 2 cards).
- `DebateListPage.shown` (`apps/v2-ui/lib/serverApi.ts:44`) is still
  `index.items.length` — **served only** — while the buffer now renders served +
  open. `app/page.tsx` does not use `shown` (it uses `debates.length`), so nothing
  is wrong today; the field is now a mislabelled trap for the next caller.
- No new literals (AC-76 clean), no DDL/migration, no new dependency edge, and
  the architecture audit is clean.

---

## 5. Gates — clone, real output

```text
$ pnpm test
 Test Files  78 passed (78)
      Tests  563 passed | 1 skipped (564)
   Duration  37.20s
```

```text
$ pnpm run typecheck
$ tsc --noEmit
(no output, exit 0)
```

```text
$ pnpm run lint
$ pnpm run audit:architecture && pnpm run audit:source
$ tsx tools/orphan-audit/src/cli.ts architecture
{ "edgeRowsChecked": 27, "violations": [] }
$ tsx tools/orphan-audit/src/cli.ts source
{ "blocking": [] }
```

```text
$ pnpm vitest list | wc -l
563
$ pnpm vitest list | grep -i bug03
tests/integration/database.test.ts > BUG-03 asker-scoped debates index > lists open owner runs honestly and excludes foreign or already-served runs
tests/render/bug03-home-buffer.test.tsx > BUG-03 home debates buffer > renders generating and failed runs as honest linked entries without duplicating a served run
```

```text
$ pnpm run generate:contract && shasum packages/contract/generated/*
641a3bcd41393430a610ac6fe5df01d182e73eef  packages/contract/generated/field-inventory.json
d1dce75b257e0d961609249f50552ef578e06499  packages/contract/generated/openapi.json
486fac249ec983512cbb91178ad69d14f53ec550  packages/contract/generated/client.ts
(git status on packages/contract/generated/: clean — zero drift)
```

All five hashes/counts match the handoff's pasted output **exactly**
(563 | 1, 78 files, 27 edge rows, identical contract hashes).

---

## 6. Findings

### BLOCKING

None.

### Advisory

- **A1 (material).** `MUT-X4` — the pagination edge that silently drops open
  runs when the served page is full survives the whole enforced suite. Its
  failure mode is literally the ticket. Fix: add one integration case with
  `limit` smaller than the served count and assert the open run is still on
  page 1 — that assertion also repairs F1-a.
- **A2 (material).** `MUT-X5` — a FAILED open run rendered with the `Generating`
  pill survives the whole enforced suite. Fix: scope the status assertion to the
  failed card (e.g. assert the failed card's markup contains `Failed`, or that
  `debates.find(d => d.id === "run:failed").status === "failed"`).
- **A3.** Two false mutation-kill comments inside the new test files (§2.4).
  They should be corrected or deleted; as written they misrepresent coverage,
  and one contradicts the handoff's own honest ledger row.
- **A4.** Single-guard asker leak (X1) is caught, but the leaked row still
  consumes a `LIMIT` slot before being dropped — a masked-truncation path.
  Mutation-only; worth a comment at the CTE.
- **A5.** `DebatesBuffer` gives the failed card `pill pillGen` (the generating
  colour vocabulary) because `isComplete("failed")` is false; only the text
  `Failed` distinguishes it. `.pill.pillBad` already exists
  (`apps/v2-ui/app/globals.css:450`) and is used by
  `app/admin/workers/page.tsx`. Flag for V's visual gate — I had no live failed
  run to look at (§1.7).
- **A6.** `DebateListPage.shown` is now served-only while the buffer renders
  served + open (§4). Unused today; rename or recompute.
- **A7.** Every card's meta line renders `relativeTime("")` → empty, because the
  index contract carries no timestamps. Pre-existing for served entries, now
  inherited by generating entries: an in-flight card shows no "started N minutes
  ago". Out of BUG-03's stated scope; noted because it is the natural next thing
  V will ask for on this exact surface.
- **A8.** N+1 projection reads per index page (§4).

### Confirmed good (do not regress)

- The V scenario, end to end, live: generating card present, newest-first,
  linked to `/debate/<run_ref>`; served once after settle; `open_runs` empties
  (§1.3, §1.5).
- S05 proven **live** against the standing API with a foreign token (§1.6).
- The closed contract, not a test, is what kills a swallowed `terminal_reason`
  (X2) — the strongest guard in this delta.
- Defense in depth on asker scoping is real (X1/X1b), exactly as the handoff
  claimed.
- Generating-without-link (X7) and open-runs-dropped-from-UI (X8) both die.
- All four handoff ledger rows reproduce; all gates match the handoff's numbers
  exactly.

---

## 7. Boundaries I could not cross (disclosed)

1. **No live FAILED run existed** (§1.7). The failed card's copy, its link and
   its `terminal_reason` are test-only evidence. A5 (its pill styling) was read
   from source and CSS, never observed.
2. **One run, depth 1.** No concurrency, no second asker's *runs* (only a
   foreign token's empty index), no `>HOME_PAGE_SIZE` page — which is precisely
   why A1 cannot be settled by observation.
3. **`SETTLED`-without-answer was never observed live** — the run went
   `RUNNING → SETTLED` with the answer already servable at the next poll, so the
   "SETTLED still shows as Generating" branch is test-only.
4. **No browser.** All UI evidence is SSR HTML from `curl` against `next dev`;
   no hydration, effects or client refresh were exercised.
5. Mutation harness, logs, and the captured home-page HTML live in this
   session's scratchpad, not in the repo. The clone was deleted after restore
   verification (all nine touched files byte-identical to the real tree).

---

VERDICT: APPROVED
