# BUG-04 rev1 — Grok dual-diamond verdict

Ticket: `t_187a3bea` (BUG-04: BUG-03 diamond carry-forwards — pillBad, card-scoped pin, page-order pin, comment honesty)  
Lens: Grok (independent of Opus)  
Ground: `goal-packets/BUG-04-codex-goal.md`, `handoffs/BUG-04-codex-handoff.md` (claims to audit, not proof), `git diff 6ff9bc5` at parent `/Users/vladmihaimiron/Documents/DebateAIRO`.  
Isolation: real tree read-only except this file; mutations only in `/private/tmp/bug04-grok-clone` (created via `cp -Rc`, deleted after); no standing-stack control; no live debate runs.

## Delta surface

Tracked vs `6ff9bc5` (product/test only; concurrent docs out of ticket):

| Path | Role |
|---|---|
| `apps/v2-ui/components/DebatesBuffer.tsx` | one-line pill branch: failed → `pillBad` |
| `tests/render/bug03-home-buffer.test.tsx` | card-scoped failed status/chrome asserts; mutation-comment correction |
| `tests/integration/database.test.ts` | real-PG page-order fixture from `HOME_PAGE_SIZE`; dual-guard comment rename |

**Out of ticket (concurrent dirt, not judged as BUG-04 product):**

- `docs/missions/.../CODING-LOOP-PROTOCOL.md`
- `docs/missions/.../decisions-ledger.md`
- `docs/missions/.../reviews/dr174-architecture-plan.md`
- Goal/handoff/packet docs themselves

**FORBIDDEN clean:** no kernel / schema / contract / migration / dependency-edge paths in the BUG-04 product delta. Serve and adapter have **no final diff** (mutations applied only in clone for causality proofs and restored). Standing stack processes not controlled by this seat.

---

## Axis 1 — Failed card chrome is `pillBad` (A5)

**Holds.**

### Production path (file:line)

1. Adapter maps open FAILED → UI status `"failed"`, otherwise `"generating"` (`apps/v2-ui/lib/v3/adapter.ts:488` inside `debateSummariesFromIndex`).
2. Buffer chooses pill class (`DebatesBuffer.tsx:43`):
   - complete → `pillOk`
   - `debate.status === "failed"` → `pillBad`
   - else → `pillGen`
3. Label is `statusLabel(debate.status)` (`DebatesBuffer.tsx:45` → `format.ts:20-29`) → `"Failed"` for failed.
4. CSS class exists at `apps/v2-ui/app/globals.css:450-457` (`.pill.pillBad` / `.dot`); generating chrome remains `.pill.pillGen` at `:442-448`.

### Suite + mutation (clone)

Baseline (clone, focused):

```text
✓ … lists open owner runs honestly …
✓ … keeps a newer in-flight run on page one when served answers exceed HOME_PAGE_SIZE
✓ … renders generating and failed runs as honest linked entries …
Test Files  2 passed (2)
Tests       3 passed | 42 skipped (45)
```

**MUT pillGen flip** (clone only): `DebatesBuffer.tsx:43` rewritten to unconditional `complete ? "pillOk" : "pillGen"` (drop failed branch). Real-tree hash of DebatesBuffer unchanged (`0f1c1f6a…`).

```text
FAIL tests/render/bug03-home-buffer.test.tsx
AssertionError: expected '…' to contain 'class="pill pillBad"'
Received (failed card only): … class="pill pillGen" … Failed …
  at bug03-home-buffer.test.tsx:66  (failedCardHtml card-scoped assert)
Tests  1 failed (1)
```

Dies on the **failed card's own markup**, not a whole-document `toContain` that a sibling generating pill could satisfy. Restored immediately after.

---

## Axis 2 — Card-scoped failed pin (A2)

**Holds.**

### Production path + pin shape

Render test still builds the mixed index through real `debateSummariesFromIndex` + full buffer HTML (`bug03-home-buffer.test.tsx:50-62`). New ownership pin (`:63-68`):

1. `failedDebate = debates.find(id === "run:failed")`
2. `expect(failedDebate).toMatchObject({ status: "failed" })` — adapter projection ownership
3. Re-render **only** that summary: `renderToStaticMarkup(<DebatesBuffer debates={[failedDebate!]} />)`
4. Assert `class="pill pillBad"`, contains `"Failed"`, does **not** contain `"Generating"` on that isolated card

This closes the BUG-03 advisory F1 gap where whole-document `"Generating"` survived a failed→generating status flip because a sibling generating card was still present.

### Mutation — adapter failed-as-generating

**MUT-BUG04-RENDER-FAILED-AS-GENERATING** (clone only): `adapter.ts:488` → unconditional `status: "generating"` inside the open-run map. Serve/db untouched; real adapter hash unchanged.

```text
FAIL … match object { status: 'failed' }
- status: "failed"
+ status: "generating"
  at bug03-home-buffer.test.tsx:64
```

Fails at the failed card's **own status** before chrome asserts run. Terminal-reason whole-document string at `:62` (`Debate generation failed: TOTAL_REVIEW_COVERAGE_UNSATISFIED`) still passes under this mutation — so the *old* comment claiming that the terminal-reason assert killed failed-as-generating was a lie; the *new* comment is accurate.

---

## Axis 3 — Real-PG open-runs-first page order (A1)

**Holds.**

### Production path (file:line)

`ServeRepository.readAnswerIndex` (`packages/serve/src/index.ts:1326-1403`):

1. Served CTE + open CTE union (`:1338-1359`), both asker-scoped.
2. Page mix ordered by **global** `ORDER BY created_at_sequence DESC` then `LIMIT $2 OFFSET $3` (`:1360-1363`) — not kind-first.
3. Open rows re-projected via `readLoadingProjection(run_ref, askerId)` (`:1374-1378`); CLAIMED → RUNNING (`packages/db/src/index.ts:321-327`).

Home request bound remains sole product page size: `HOME_PAGE_SIZE = 50` (`apps/v2-ui/lib/serverApi.ts:29`), passed as limit (`:41`). Serve applies caller limit only — no new production page-size literal in the BUG-04 delta.

### Fixture pin

`database.test.ts:480-541` (`keeps a newer in-flight run on page one when served answers exceed HOME_PAGE_SIZE`):

- Imports product `HOME_PAGE_SIZE` (`:29`) — **no new `50` literal** in the new block.
- `servedFixtureCount = HOME_PAGE_SIZE + 1` (`:482`) — fills one full home page of served rows plus one overflow.
- Newer CLAIMED open run inserted after served fixtures (`:519-531`).
- Calls real `ServeRepository.readAnswerIndex(owner, HOME_PAGE_SIZE, 0)` (`:533-534`).
- Expects: `total === servedFixtureCount + 1`; `open_runs === [{ run_ref: running, state: "RUNNING" }]`; `items.length === HOME_PAGE_SIZE - 1` (`:536-540`).

Under correct global newest-first order the open run occupies one of the `HOME_PAGE_SIZE` slots, so only `HOME_PAGE_SIZE - 1` served answers fit page one.

### Mutation — SERVED-FIRST

**MUT-BUG04-SERVED-FIRST** (clone only): page `ORDER BY created_at_sequence DESC` → `ORDER BY kind ASC, created_at_sequence DESC` at `serve:1362`. ANSWER sorts before OPEN_RUN; a full served page displaces the newer open run. Real serve hash restored after.

```text
FAIL … keeps a newer in-flight run on page one when served answers exceed HOME_PAGE_SIZE
AssertionError: expected [] to deeply equal [ ObjectContaining{ run_ref, state: "RUNNING" } ]
  at database.test.ts:537  (firstPage.open_runs)
Tests  1 failed | 43 skipped
```

Dies for the believed reason: open run missing from page one because the page is filled by served answers. Fixture cardinality is what makes the ORDER BY break observable.

---

## Axis 4 — Mutation-comment honesty (A3)

**Holds.**

| Comment (after BUG-04) | Location | Truth check (this seat) |
|---|---|---|
| `MUT-BUG03-FOREIGN-LEAK-BOTH-GUARDS: remove both asker guards -> RED` | `database.test.ts:472` (was false `MUT-BUG03-FOREIGN-LEAK: remove asker_id from the open arm`) | **True.** Clone removed open CTE `WHERE run.asker_id = $1` → `WHERE TRUE` (`serve:1357`) **and** projection `AND run.asker_id = $2` → `AND length($2::text) >= 0` (`db:332`). RED: foreign `QUEUED` appears in `open_runs` (`database.test.ts:460`). Single-guard removal remains defense-in-depth (expected green if only one falls); comment now names the dual-guard kill path. |
| `MUT-BUG04-RENDER-FAILED-AS-GENERATING: the failed card's own status/chrome assertions turn RED` | `bug03-home-buffer.test.tsx:72` (was false claim that terminal-reason assert kills failed-as-generating) | **True.** Adapter unconditional `generating` → RED at `:64` status; pillGen flip → RED at `:66` chrome. Terminal-reason whole-doc assert alone does **not** kill the adapter mutation (terminal_reason still carried). |

---

## Axis 5 — F1 sweep (new / changed asserts)

| Assertion | Assessment |
|---|---|
| `failedDebate` status `"failed"` (`render:64`) | **Pass** — drives real adapter map; RED under MUT-BUG04-RENDER-FAILED-AS-GENERATING |
| Card-scoped `pillBad` class (`render:66`) | **Pass** — isolated failed card HTML; RED under pillGen flip; sibling generating card cannot mask |
| Card-scoped `"Failed"` / not `"Generating"` (`render:67-68`) | **Pass** — single-card render; statusLabel path; no whole-document mask |
| `servedFixtureCount = HOME_PAGE_SIZE + 1` (`dbtest:482`) | **Pass** — derived from product constant; no new page-size literal |
| `firstPage.total === servedFixtureCount + 1` (`:536`) | **Pass** — real count of owner runs on embedded PG |
| `open_runs === [RUNNING newer]` (`:537-539`) | **Pass** — the ORDER BY pin; RED under MUT-BUG04-SERVED-FIRST |
| `items.length === HOME_PAGE_SIZE - 1` (`:540`) | **Pass** — page-mix consequence of open slot occupation; still HOME_PAGE_SIZE-derived |
| Corrected dual-guard comment (`:472`) | **Pass** — documentation honesty; dual-guard mutation RED as claimed |
| Corrected failed-as-generating comment (`render:72`) | **Pass** — names card-scoped asserts that actually die |

No vacuous inequalities (`x >= 0` style), no whole-document chrome mask, no hard-coded expected page size in the new pin.

**Advisory (non-blocking):**

1. New page-order test does not re-assert asker / foreign / served-exclusion (already pinned by sibling BUG-03 case); acceptable scope split.
2. `listDebatesPageServer.shown` still counts only `index.items.length` (`serverApi.ts:44`) — pre-existing latent field, not user-visible home count; out of BUG-04 scope.
3. Live failed-card visual check on the standing stack was not performed (packet forbids stack control; no guaranteed live failed run). Executable evidence is embedded-PG + SSR render.

---

## Findings

### BLOCKING

None.

### Advisory

1. Live P3 visual confirmation of an existing failed home card remains for the running system when such a run exists — not executable in this read-only diamond seat.
2. Defense-in-depth dual-guard comment is now honest; single-guard removal still expected green (documented, not a suite hole for BUG-04).

---

## Suite evidence (clone)

- Baseline focused BUG-03/04 integration + render: **3 passed** on real embedded PostgreSQL (Testcontainers deferred by DR-121).
- MUT pillGen flip: **RED** at card-scoped `pillBad` (`render:66`).
- MUT adapter failed-as-generating: **RED** at card-scoped status (`render:64`).
- MUT SERVED-FIRST ORDER BY: **RED** at empty `open_runs` (`dbtest:537`) with `HOME_PAGE_SIZE + 1` served filling the page.
- MUT FOREIGN-LEAK-BOTH-GUARDS: **RED** — foreign `QUEUED` in `open_runs` (`dbtest:460`).
- Real-tree product/test hashes unchanged after clone delete:
  - `DebatesBuffer.tsx` `0f1c1f6a…`
  - `bug03-home-buffer.test.tsx` `26c5ce0a…`
  - `database.test.ts` `9cbfd1d3…`
  - serve / adapter / db restored to pre-seat content (no final product diff on those paths).

Scratch captures (private seat dir, not repo): `bug04-delta-names.txt`, `bug04-baseline.log`, `bug04-mut-pillgen.log`, `bug04-mut-served-first.log`, `bug04-mut-failed-as-gen.log`, `bug04-mut-foreign-leak-both.log`, `bug04-real-hashes-before.txt`, `bug04-real-hashes-after.txt`.

---

## Isolation confirmation

- Sole real-tree write by this lens: this verdict file.
- No process control against the standing stack.
- No debate runs started.
- Product mutations confined to `/private/tmp/bug04-grok-clone` and discarded after (clone deleted).

VERDICT: APPROVED
