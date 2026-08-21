# BUG-03 rev1 — Grok dual-diamond verdict

Ticket: `t_b0cb0cc7` (BUG-03: debates buffer hid generating runs)  
Lens: Grok (independent of Opus)  
Ground: `goal-packets/BUG-03-codex-goal.md`, `handoffs/BUG-03-codex-handoff.md` (claims to audit, not proof), `git diff 3bef975` at parent `/Users/vladmihaimiron/Documents/DebateAIRO` minus `acceptance/seed-register.*` (DR-173 / orchestrator-carried).  
Isolation: real tree read-only except this file; mutations only in `/private/tmp/bug03-grok-clone` (deleted after); no stack control (PG 55432 / API 8790 / UI 3000 still listening, untouched by this seat); no live debate runs started (Opus owns the one live run).

## Delta surface

Tracked vs `3bef975` (minus seed-register):

| Path | Role |
|---|---|
| `packages/contract/src/index.ts` | `OpenRunSummarySchema`; `AnswerSummary` gains `run_ref` + `created_at_sequence`; `AnswerIndex` gains `open_runs` |
| `packages/serve/src/index.ts` | Mixed asker-scoped page; `NOT EXISTS` served exclusion; BUG-02 `readLoadingProjection` for open state |
| `apps/v2-ui/lib/v3/adapter.ts` | `debateSummariesFromIndex` merge + UI dedupe by `run_ref` |
| `apps/v2-ui/lib/types.ts` | `created_at_sequence?`, `terminal_reason?` on `DebateSummary` |
| `apps/v2-ui/app/page.tsx` | Extracts buffer into tested component |
| `tests/integration/database.test.ts` | Embedded-PG owner / foreign / served / failed |
| `tests/unit/{api,load01-live-proof,v2ui-data-layer}.test.ts` | Closed-shape fixture updates |

Untracked product/test surface in the same ticket:

- `apps/v2-ui/components/DebatesBuffer.tsx`
- `tests/render/bug03-home-buffer.test.tsx`

**Out of ticket (concurrent dirt, not judged as BUG-03 product):**

- `docs/missions/.../decisions-ledger.md` (DR-173 / DR-174 only)
- `acceptance/seed-register.*` (explicitly excluded by packet)
- Goal/handoff/packet docs themselves

**FORBIDDEN clean:** no kernel / DDL / migration paths in the BUG-03 product delta. No new dependency edges. Standing stack processes not controlled by this seat.

---

## Axis 1 — Asker scoping (S05)

**Holds.**

### Production path (file:line)

`packages/serve/src/index.ts:1326-1403` `readAnswerIndex(askerId, limit, offset)`:

1. **Served CTE** (`:1338-1348`): `FROM core.run … JOIN serve.answer … WHERE run.asker_id = $1`.
2. **Open CTE** (`:1349-1358`): `FROM core.run … WHERE run.asker_id = $1 AND NOT EXISTS (serve.answer for run)`.
3. **Union page** ordered by `created_at_sequence DESC`, bound by caller's `LIMIT $2 OFFSET $3` (`:1360-1363`).
4. **Projection re-check** (`:1374-1378`): each open row goes through `RunRepository.readLoadingProjection(row.run_ref, askerId)`.
5. **Projection SQL** (`packages/db/src/index.ts:313-332`): `WHERE run.run_id = $1 AND run.asker_id = $2` — foreign asker yields `null`, dropped by `flatMap` (`serve:1393`).

Served answer materialization still re-scopes via `readAnswerProjection(answer_id, askerId)` (`serve:1372`, ownership at `:1127`).

This matches the pre-BUG-03 answers-index asker discipline (S05): owner sees own open + served; a foreign generating run cannot enter `open_runs` unless both membership and projection asker guards are removed.

### Suite + mutation (clone, real embedded PG)

Baseline (clone):

```text
✓ tests/integration/database.test.ts > BUG-03 asker-scoped debates index >
    lists open owner runs honestly and excludes foreign or already-served runs
✓ tests/render/bug03-home-buffer.test.tsx > BUG-03 home debates buffer > …
Test Files  2 passed (2)
Tests       2 passed | 42 skipped (44)
```

**MUT-BUG03-FOREIGN-LEAK-BOTH-GUARDS** (clone only): open CTE `WHERE run.asker_id = $1` → `WHERE TRUE`; projection `AND run.asker_id = $2` → `AND length($2::text) >= 0` (keeps bind arity). Real-tree hashes unchanged.

```text
FAIL … lists open owner runs honestly and excludes foreign or already-served runs
expected [3 open runs including foreign QUEUED] to deeply equal [failed, running]
+ foreign run_ref present with state "QUEUED"
exit=1
```

Named assertion dies for the believed reason (foreign open row leaks). Handoff claim that removing either guard alone stays green is consistent with defense-in-depth (membership filters before page; projection filters after) — this seat re-proved the dual-guard kill path only.

---

## Axis 2 — No open/served duplicates

**Holds.**

### Production path

1. **Persistence:** open CTE `NOT EXISTS (SELECT 1 FROM serve.answer WHERE answer.run_id = run.run_id)` (`serve:1357-1358`).
2. **UI belt:** `debateSummariesFromIndex` builds `servedRunRefs` from `index.items[].run_ref` and filters `open_runs` with `!servedRunRefs.has(run.run_ref)` (`adapter.ts:472-485`). Served card `id` remains `answer_id` (`:474`); open card `id` is `run_ref` (`:487`).

### Mutation

**MUT-BUG03-SERVED-DUPLICATE** — remove `NOT EXISTS` only:

```text
FAIL … expected open_runs [failed, running]
+ open_runs also contains served run with state "SETTLED"
exit=1
```

Render fixture also plants a duplicate `run:served` in `open_runs` and asserts a single `"The served debate"` occurrence (`bug03-home-buffer.test.tsx:35-41,63`).

---

## Axis 3 — Honest states (DR-115)

**Holds.**

### Production path

- Open wire state/reason come only from BUG-02 `readLoadingProjection` (`serve:1378,1393-1398`) — CASE vocabulary QUEUED / RUNNING (from CLAIMED) / FAILED / SETTLED (`db:321-327`); `terminal_reason` is the latest FAILED work-item reason (`db:328-329`), never synthesized in serve.
- Contract couples FAILED ↔ non-null `terminal_reason` via `OpenRunSummarySchema.superRefine` (`contract:272-285`).
- UI adapter: non-FAILED open → status `"generating"`; FAILED → `"failed"`; `terminal_reason` carried verbatim (`adapter.ts:484-493`). No silent default state string beyond the existing BUG-02 generating-class collapse used by `debateDetailFromRunProjection` (`:450-451`).
- Buffer: failed meta is `Debate generation failed: {terminal_reason}` (`DebatesBuffer.tsx:17-19`); pill label is `statusLabel(debate.status)` (`:45`) → `"Generating"` / `"Failed"` / `"Complete"`.

Integration pins exact terminal reason `TEST_LAYER:BUG03_TERMINAL_FAILURE` and RUNNING null reason (`database.test.ts:459-466`). Render pins the failure copy string (`bug03-home-buffer.test.tsx:62`).

---

## Axis 4 — Contract surface

**Holds.**

Shape changed: required `open_runs: OpenRunSummarySchema[]`, plus required `run_ref` / `created_at_sequence` on answer summaries. Schemas are `.strict()` with non-optional fields and the FAILED/reason superRefine — **not** an optional-everything escape hatch (`contract:260-292`). Inventory lists `OpenRunSummarySchema` (`:489`). Generated inventory already enumerates `open_runs` / `OpenRunSummarySchema` (`packages/contract/generated/field-inventory.json`).

Clone `pnpm run generate:contract` twice → identical hashes:

```text
641a3bcd… field-inventory.json
d1dce75b… openapi.json
486fac24… client.ts
CONTRACT_ZERO_DRIFT
```

Matches handoff-reported hashes.

---

## Axis 5 — F1 sweep (new tests)

| Assertion | Assessment |
|---|---|
| Integration exact `open_runs` (failed + RUNNING, order) | **Pass** — drives real `ServeRepository.readAnswerIndex` on embedded PG; dual-guard + served mutations RED |
| Integration `not.toContain(foreignRunId)` | **Pass** — killed by foreign-leak mutation |
| Integration `not.toContain(servedWork.runId)` | **Pass** — killed by NOT EXISTS removal |
| Integration `items.length + open_runs.length <= limit` | **Pass** — bound is the real caller's limit |
| Render link `href="/debate/run:generating"` | **Pass** — real `debateSummariesFromIndex` + `DebatesBuffer` |
| Render contains `"Generating"` | **Pass** — RED under MUT-BUG03-RENDER-GENERATING-AS-DONE (`complete` pill) |
| Render failed terminal copy | **Pass** — exact string from adapter carrier |
| Render single served topic | **Pass** — UI dedupe path with planted duplicate open row |
| Unit `debateSummariesFromIndex` fixture | **Advisory** — only empty `open_runs`; mixed path is render-covered |

**Advisory F1 gap:** mapping only the *failed* open run's status to `"generating"` while leaving `terminal_reason` would still satisfy `toContain("Generating")` (sibling generating card) and the failure copy assert. Status pill honesty for failed is not independently killed. Does not void axes 1–3; coverage hole only.

---

## Axis 6 — HOME_PAGE_SIZE / AC-76

**Holds.**

- Sole page bound remains `HOME_PAGE_SIZE = 50` in `apps/v2-ui/lib/serverApi.ts:29`, passed as the only limit into `readAnswerIndex` (`:41`).
- Serve applies the caller's `limit` parameter — no new production literal (`serve:1363,1400`).
- Diff +line sweep on BUG-03 production paths: no new `50` / `PAGE_SIZE` / hard page caps. Integration uses call-site `10` as a test parameter only (not a product bound).
- `DebatesBuffer.tsx` introduces no limit literals.

---

## Axis 7 — BUG-02 link target

**Holds.**

Open entries set `id: run.run_ref` (`adapter.ts:487`). Buffer links `href={`/debate/${debate.id}`}` (`DebatesBuffer.tsx:13`). Render asserts `href="/debate/run:generating"` and `href="/debate/run:failed"` (`bug03-home-buffer.test.tsx:58,61`) — run id, not answer id — so BUG-02 `getDebateBundle` / SSR run-first loading receives the run ref.

Served entries still link by `answer_id` (pre-existing served path; BUG-02 answer-id fallback remains valid).

---

## Findings

### BLOCKING

None.

### Advisory

1. **Failed pill visual class is `pillGen`.** `DebatesBuffer.tsx:43` uses `isComplete ? pillOk : pillGen`, so failed cards share the generating pill chrome while the text label is `"Failed"`. Pre-existing pattern extracted from `page.tsx`; copy honesty holds.
2. **F1 gap on failed→generating status-only flip** (Axis 5) — add an assert that failed card HTML contains `"Failed"` / lacks `"Generating"` on that card if rework ever lands.
3. **`listDebatesPageServer.shown` counts only `index.items.length`** (`serverApi.ts:44`), ignoring open runs. Home page displays `debates.length` (`page.tsx:61-65`), so the bug is latent in the unused field, not the user-visible count.
4. **Unit index projection test does not exercise mixed open_runs** (`v2ui-data-layer.test.ts:235-265`); render suite carries that load.
5. **Defense in depth requires both asker guards for a leak** — intentional; document in future mutations that single-guard removal is expected green.

---

## Suite evidence (clone)

- Baseline focused BUG-03 integration + render: **2 passed** on real embedded PostgreSQL (Testcontainers deferred by DR-121).
- MUT foreign dual-guard: **RED** — foreign `QUEUED` appears in `open_runs`.
- MUT served `NOT EXISTS` drop: **RED** — served run appears as open `SETTLED`.
- MUT render generating→complete: **RED** — missing `"Generating"`.
- `generate:contract` zero-drift confirmed in clone.
- Live standing-stack browser proof: **out of seat** (Opus owns the one live run per packet).

Scratch captures: `{SCRATCH}/bug03-delta.txt`, `bug03-grok-suites.log`, `bug03-grok-mutations.log`, `bug03-grok-contract.log`.

---

## Isolation confirmation

- Sole real-tree write by this lens: this verdict file.
- No process control against PG 55432 / API 8790 / UI 3000.
- No debate runs started.
- Product mutations confined to `/private/tmp/bug03-grok-clone` and discarded after (clone deleted; real `serve` / `db` / `adapter` hashes unchanged post-seat).

VERDICT: APPROVED — Axes 1–7 hold on production paths with file:line causality; named integration/render tests go red under directed clone mutations for the believed reasons (asker dual-guard, served exclusion, generating-as-done); contract member is honest and zero-drift; HOME_PAGE_SIZE remains the sole bound; generating home links target `/debate/<run_id>`; residual items are advisory only (failed pill chrome, F1 status-only gap, unused `shown` field).
