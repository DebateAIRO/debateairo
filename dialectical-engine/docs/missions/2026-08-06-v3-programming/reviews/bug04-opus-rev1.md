# BUG-04 — Opus 5 lens (dual diamond, rev 1)

Ticket `t_187a3bea` · board `debateai-v3` · reviewer: Opus 5 lens (mutation
testing) · Grok lens ran in parallel, uncoordinated.

Delta reviewed: `git diff 6ff9bc5` at `/Users/vladmihaimiron/Documents/DebateAIRO`
— 3 code files (`apps/v2-ui/components/DebatesBuffer.tsx`,
`tests/integration/database.test.ts`, `tests/render/bug03-home-buffer.test.tsx`).
The three doc paths also dirty in the tree (`CODING-LOOP-PROTOCOL.md`,
`decisions-ledger.md`, `reviews/dr174-architecture-plan.md`) were read and are
DR-174/DR-175 mission artifacts from another lane, not BUG-04 edits.

Isolation (DR-163): every mutation ran in the `cp -Rc` clone
`/private/tmp/bug04-opus-clone`, deleted after; all six touched files verified
byte-identical against the real tree afterwards. **No runs, no stack control** —
the packet needed none, and the integration harness provisions its own throwaway
embedded PostgreSQL in a temp dir on a reserved port
(`tests/support/testDatabase.ts:72-120`, `persistent: false`), so the standing
stack was never read from or written to.

---

## 0. Headline

**All four BUG-03 carry-forwards are genuinely delivered, and the two mutants
that survived BUG-03's entire enforced suite now die.** The handoff's mutation
ledger reproduces exactly — same mutations, same RED text, same exit codes — and
every gate number in the handoff matches my own run to the digit.

As a bonus the new page-order fixture also repairs BUG-03's **F1-a** (the
structurally unfalsifiable `items.length + open_runs.length <= limit`
assertion): the page bound is now pinned by a falsifiable exact-length assertion
on a genuinely full page (proved by MUT-M7).

One material advisory: the failed card's *chrome* is pinned against a second,
synthetic single-card render rather than against the real multi-card document,
so a defect that only appears when the failed card has siblings is invisible
(MUT-M6 survives). The realistic mutation dies, so this is a weaker-than-ideal
pin, not a coverage hole.

VERDICT below.

---

## 1. Mutation ledger

Harness: anchored exact-string edits (`mut.py` + `run-mut.sh`, session
scratchpad); each row applies the mutation alone, runs the named test, reverts,
and re-hashes every touched file. **Every row below reported
`RESTORED_IDENTICAL`.** Clone baseline before any mutation:
`Test Files 78 passed (78) · Tests 564 passed | 1 skipped (565)` — identical to
the handoff.

### 1.1 The handoff's own two ledger rows — both reproduce

| # | Mutation | Test | Result | Observed RED |
|---|---|---|---|---|
| M1 | `MUT-BUG04-RENDER-FAILED-AS-GENERATING` — `adapter.ts:488` `status: run.state === "FAILED" ? "failed" : "generating"` → `status: "generating"` | render | **RED**, exit 1 | `expected { id: 'run:failed', …(7) } to match object { status: 'failed' }` / `+ "status": "generating"` at **line 64** |
| M2 | `MUT-BUG04-SERVED-FIRST` — `serve/src/index.ts:1362` `ORDER BY created_at_sequence DESC` → `ORDER BY kind ASC, created_at_sequence DESC` | integration `-t "keeps a newer in-flight run on page one"` | **RED**, exit 1, `1 failed \| 43 skipped` | `expected [] to deeply equal [ ObjectContaining{run_ref, state:"RUNNING"} ]` at **line 537** |

The handoff's ledger is **honest**: both rows name the real mutation, the real
killing assertion, and quote the real RED. `packages/serve/src/index.ts` and
`apps/v2-ui/lib/v3/adapter.ts` carry no final diff, exactly as claimed.

### 1.2 The three verifications this diamond was required to make

| # | Required check | Mutation | Result |
|---|---|---|---|
| M3 | **(1) A5** — flip the failed card's pill back to `pillGen` | `DebatesBuffer.tsx:43` → `complete ? "pillOk" : "pillGen"` | **RED**, exit 1, on a **card-scoped** assertion at line 66: `expected '<a class="debateCard" href="/debate/r…' to contain 'class="pill pillBad"'`. Received markup is the **failed card alone** — `<div class="pill pillGen">…Failed</div>`. Not a whole-document `toContain`. ✅ |
| M2 | **(2) A1** — break the open-runs ordering with a FULL served page | see above | **RED** on real embedded PG. Page is genuinely full: `HOME_PAGE_SIZE + 1 = 51` served rows against `limit = 50`; shipped code returns 1 open + 49 served. ✅ |
| M4 / M5 | **(3) A3** — do the corrected comments tell the truth? | see §1.3 | **Both true, and precise.** ✅ |

### 1.3 A3 — the two corrected comments, verified

`tests/integration/database.test.ts`
`// MUT-BUG03-FOREIGN-LEAK-BOTH-GUARDS: remove both asker guards -> RED.`

| # | Mutation | Result |
|---|---|---|
| M4 | Remove **both** guards (`serve` index CTE `WHERE run.asker_id = $1` → `$1 = $1`, **and** `db/src/index.ts:333` `readLoadingProjection` `run.asker_id = $2` → `$2 = $2`) | **RED**, exit 1 — two foreign runs leak into `open_runs` at line 460 |
| M5 | Remove **only** the CTE guard | **GREEN**, exit 0 — killed by the surviving projection guard |

The comment is not merely true, it is **exact**: M5 confirms the word "both" is
load-bearing, and the old comment ("remove asker_id from the open arm -> RED")
was indeed false. The BUG-03 diamond's finding is fully discharged.

`tests/render/bug03-home-buffer.test.tsx`
`// MUT-BUG04-RENDER-FAILED-AS-GENERATING: the failed card's own status/chrome assertions turn RED.`

Both halves verified: **status** dies under M1 (line 64), **chrome** dies under
M3 (line 66). The comment names precisely the two assertions that do the work.

The third new comment, `// MUT-BUG04-SERVED-FIRST: order ANSWER rows before
OPEN_RUN rows -> RED.`, is verified true by M2. **No new false comment was
introduced.**

### 1.4 Beyond-ledger hunt

| # | Mutation | Scope | Result |
|---|---|---|---|
| M6 | `pillBad` applied **only when the failed card is alone** (`debate.status === "failed" && debates.length === 1`) | render | **SURVIVES** (exit 0) — see Adv-1 |
| M7 | Page overflows its limit: `LIMIT $2` → `LIMIT $2 + 10` | integration (new test) | **RED**, exit 1 — `expected […] to have a length of 49 but got 51` at line 540 |

**M7 is the good news BUG-03 was waiting for.** BUG-03's F1-a recorded that the
only page-bound assertion (`items.length + open_runs.length <= limit`, 3 rows
against `limit = 10`) was structurally unfalsifiable. The new fixture's
`expect(firstPage.items).toHaveLength(HOME_PAGE_SIZE - 1)` **is** falsifiable and
does catch a broken page bound. F1-a is repaired.

---

## 2. F1 sweep

New integration test (`keeps a newer in-flight run on page one when served
answers exceed HOME_PAGE_SIZE`) — **clean**. All three assertions are exact and
each was independently proven falsifiable:

- `firstPage.total === servedFixtureCount + 1` — guards that the fixture built
  what it claims (52 runs).
- `firstPage.open_runs` exact one-element array — killed by M2.
- `firstPage.items` exact `HOME_PAGE_SIZE - 1` length — killed by M7, and it is
  what makes "a FULL page" real rather than asserted.

No new literal: `servedFixtureCount = HOME_PAGE_SIZE + 1`, and the `10, 1, 1`
passed to `createRun` are that helper's own declared defaults restated
positionally to reach the fifth `askerId` parameter (`database.test.ts:102-108`).
AC-76 clean.

New render assertions — **clean but one is weaker than it reads** (Adv-1). Line
64 (`toMatchObject({ status: "failed" })`) is document-independent and falsifiable
(M1). Lines 66-68 are falsifiable (M3) but observe a *different* render than the
document under test. `toContain("Failed")` is not vacuous: the failure copy on
the card is lower-case ("Debate generation failed:"), so the capital-F match can
only come from `statusLabel`.

Residual from BUG-03, not repaired: `expect(html).toContain("Generating")`
(line 60) is still a whole-document substring across three cards, so **F1-c is
only half-repaired** — the *failed* card is now scoped, the *generating* card is
not. That arm is independently killed by BUG-03's own
`MUT-BUG03-RENDER-GENERATING-AS-DONE` (verified RED in the BUG-03 diamond), so
nothing is unpinned; the assertion simply still cannot attribute its label.

---

## 3. Gates — clone, real output

```text
$ pnpm test
 Test Files  78 passed (78)
      Tests  564 passed | 1 skipped (565)
   Duration  31.92s        (baseline, before any mutation)

$ pnpm test                (after all 7 mutations reverted)
 Test Files  78 passed (78)
      Tests  564 passed | 1 skipped (565)
   Duration  28.15s
```

```text
$ pnpm run typecheck
$ tsc --noEmit
(no output, exit 0)
```

```text
$ pnpm run lint
$ tsx tools/orphan-audit/src/cli.ts architecture
{ "edgeRowsChecked": 27, "violations": [] }
$ tsx tools/orphan-audit/src/cli.ts source
{ "blocking": [] }
```

```text
$ pnpm vitest list | wc -l
564
$ pnpm vitest list | grep -i "BUG-03"
tests/integration/database.test.ts > BUG-03 asker-scoped debates index > lists open owner runs honestly and excludes foreign or already-served runs
tests/integration/database.test.ts > BUG-03 asker-scoped debates index > keeps a newer in-flight run on page one when served answers exceed HOME_PAGE_SIZE
tests/render/bug03-home-buffer.test.tsx > BUG-03 home debates buffer > renders generating and failed runs as honest linked entries without duplicating a served run
```

```text
$ git diff --check
(no output, exit 0)
```

Every number matches the handoff **exactly**: 78 files, 564 | 1, 27 edge rows,
`vitest list` 564, clean whitespace check.

Restore verification (DR-163): all six mutated files —
`DebatesBuffer.tsx`, `adapter.ts`, `serve/src/index.ts`, `db/src/index.ts`,
`tests/integration/database.test.ts`, `tests/render/bug03-home-buffer.test.tsx`
— byte-identical to the real tree after the run. Clone deleted.

---

## 4. Findings

### BLOCKING

None.

### Advisory

- **Adv-1 (material).** The failed card's chrome is pinned against a **second,
  synthetic render** — `renderToStaticMarkup(<DebatesBuffer debates={[failedDebate!]} />)`
  — not against `html`, the three-card document the test actually renders. `html`
  is never asserted to contain `pillBad` at all. MUT-M6 (`pillBad` only when
  `debates.length === 1`) therefore **survives** the focused render test. The
  realistic mutation (M3, flipping the ternary) does die, so no shipped behaviour
  is unguarded — but the pin is one step removed from the surface it is about.
  One-line strengthening, which also kills M6:
  ```ts
  const failedCard = html.split('<a class="debateCard"')
    .find((card) => card.includes('href="/debate/run:failed"'));
  expect(failedCard).toContain('class="pill pillBad"');
  ```
- **Adv-2 (minor).** In the same JSX expression the **label** now comes from
  `statusLabel(debate.status)` — which lower-cases and maps `"error"` to
  `"Failed"` — while the **chrome** comes from a raw `debate.status === "failed"`.
  A summary carrying `"FAILED"` or `"error"` would read *Failed* wearing
  generating chrome. Unreachable today (the sole caller `app/page.tsx` is fed by
  `debateSummariesFromIndex`, which emits only `complete|failed|generating`), but
  `DebateSummary.status` is typed `string`, so the two rules can diverge silently.
  Fix: an `isFailed()` helper in `lib/format.ts` beside `isComplete()`.
- **Adv-3 (scope disclosure).** The new pin proves the **shipped** semantic — one
  global asked-at `created_at_sequence DESC` over the `UNION ALL` — survives a
  full served page **when the open run is the newest**. It does not, and cannot,
  establish "an open run is always on page 1", because the shipped SQL does not
  float open runs. An asker who leaves run A in flight and then asks *and settles*
  50 newer runs finds A on page 2. The realistic case is covered (a just-started
  run is always the newest row). Whether a long-stuck run should float is a
  product-policy question for V, outside BUG-04's stated scope, which was to pin
  the shipped ordering — and it does.
- **Adv-4 (trivial).** BUG-03's unfalsifiable
  `expect(index.items.length + index.open_runs.length).toBeLessThanOrEqual(index.limit)`
  (3 rows against `limit = 10`) is still present in the first test. Now harmless —
  the real bound is pinned by the new fixture — but it still reads as a page-size
  guard it cannot be. Delete or leave a note.
- **Adv-5 (trivial).** The handoff's "pre-existing unrelated dirt" line names 2 of
  the 4 dirty paths, omitting `CODING-LOOP-PROTOCOL.md` and
  `reviews/dr174-architecture-plan.md`. I read both diffs: they are DR-174/DR-175
  mission artifacts from another lane, so the omission is incompleteness, not
  misattribution.

### Recorded, not a finding

`tests/integration/database.test.ts` now imports `HOME_PAGE_SIZE` from
`apps/v2-ui/lib/serverApi.js` — a serve/DB integration test depending on a UI
constant. This is precisely what the packet ordered ("derive the fixture count
from `HOME_PAGE_SIZE`"), it is the correct source of truth for "one home page"
(the test passes it as the real `limit`), and the alternative — a literal `51` —
would breach AC-76. `serverApi.ts` has no Next-only module-scope imports, so the
edge is clean and the architecture audit is unchanged (27 rows, 0 violations).

### Confirmed good (do not regress)

- `.pill.pillBad` at `globals.css:450` is real error chrome (warm-red
  background/border/dot), genuinely distinct from `pillGen` — A5's product line
  reaches an existing, correct vocabulary, and it is **one line**.
- Both handoff ledger rows reproduce with the exact RED text and exit codes
  claimed; the handoff makes no overstated claim I could falsify.
- The corrected `BOTH-GUARDS` comment is exact — M5 proves the qualifier is
  load-bearing, and defense in depth on asker scoping is still real.
- The page-bound hole BUG-03 recorded as F1-a is genuinely repaired (M7).
- All gate numbers reproduce to the digit.

---

## 5. Boundaries I could not cross (disclosed)

1. **No live verification.** The packet forbade stack control and BUG-03's
   diamond already live-proved this surface end to end. Consequently the failed
   card's new `pillBad` chrome has been **read from source and CSS but never
   observed rendered** — the same boundary BUG-03 recorded in its §1.7, since no
   failed run existed for the asker then either. **A5 remains open for V's visual
   gate**; this lens can only certify that the correct class is emitted and that
   the class is styled as error chrome.
2. **No browser.** All UI evidence is `renderToStaticMarkup` output.
3. Adv-3's long-stuck-run ordering case is reasoned from the shipped SQL, not
   exercised — no fixture builds an open run older than a full page of served
   answers.
4. Mutation harness and logs live in this session's scratchpad, not the repo. The
   clone was deleted after restore verification.

---

VERDICT: APPROVED
