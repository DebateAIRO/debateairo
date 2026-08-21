# LOAD-01 dual-diamond review — Grok lens (rev1)

**Ticket:** `t_4020ac7b` · **Board:** `debateai-v3`  
**Reviewer:** Grok (independent read-only dual-diamond lens; DR-153)  
**Date:** 2026-08-13  
**Goal packet:** `docs/missions/2026-08-06-v3-programming/goal-packets/LOAD-01-codex-goal.md`  
**Handoff (inventory pointer only):** `docs/missions/2026-08-06-v3-programming/handoffs/LOAD-01-codex-handoff.md`  
**Law:** DR-165(1) (generating debate NEVER 404s), DR-115 (no fabricated progress for a dead run), S05 (asker-owned reads), XREV-01 A-8 (mid-review loud stop → typed page failure)  
**Mode:** read-only. Product / runtime sources not edited. Judged from shipped source and focused tests — not handoff trust alone. Did not read any peer (Opus) LOAD-01 verdict.  
**Ticket trail read:** body + comments through Codex `READY FOR PEER REVIEW — LOAD-01` (01:35).  
**Upstream cross-check (A-8 definition only):** XREV-01 Opus rev1 A-8 naming of the gap (not a peer LOAD-01 verdict).  
**Focused re-run (this seat):** `pnpm vitest run` on contract + api + v2ui-data-layer + load01-live-proof + load01-run-projection → **5 files / 75 tests passed**.  
**Production-path audit (this seat):** `load01-j5-production-path-audit.txt` in implementer scratch — Hatchet task / dispatcher / acceptance-only `recordTerminalFailure` call sites.

## Verdict

**BLOCKED** (PEER REVIEW CHANGES REQUESTED)

**One BLOCKING finding (J5 / XREV-01 A-8).** LOAD-01 correctly closes DR-165(1) for the *generating* first-paint class (answer-absent live run → SSR loading with the real question, not 404). It also correctly presents a run that is **already** work-item `FAILED` with a terminal reason. It does **not** close goal deliverable (4) / XREV-01 A-8: on the **standing production path** (Hatchet), a mid-review `NODE_REVIEW_UNAVAILABLE` throw is **not** recorded as work `FAILED`, so the new run projection cannot surface typed failure and the reader still hangs in loading. Citing `AcceptanceDispatcher` as the production terminal pipe is causally false — that catch exists only in the acceptance ceremony.

J1–J4 remain **PASS**. Residual notes on ownership test teeth and client dual-path are **ADVISORY**.

---

## Decision table (six OBJECTIVE dimensions)

| # | Dimension | Judgment | One-line evidence |
|---|---|---|---|
| 1 | V's exact flow — SSR first-fetch LOADING with real question (QUEUED/CLAIMED) | **PASS** | `getDebateServer` → `readRun` after answer 404s → `kind: "loading"` → page maps projection → `generating` + question card; never `notFound()` |
| 2 | Typed-FAILED **when already FAILED** → typed failure UI (no 404 / spinner / dead progress) | **PASS** | FAILED + required `terminal_reason` → `kind: "failed"` → Failed pill + error banner; `generating === false` hides progress strip |
| 3 | Genuinely nonexistent id still honest 404 | **PASS** | Run `NOT_FOUND` → `kind: "not_found"` → `notFound()` only on that branch |
| 4 | New run projection is ASKER-OWNED (S05: foreign 404, anon 401) | **PASS** | SQL `run.asker_id = $2`; API `session.asker_id`; route 401 without session; foreign collapses to null → 404 |
| 5 | XREV-01 A-8 mid-review loud stop reaches the page as typed failure | **FAIL (BLOCKING)** | Production Hatchet task has no catch/`recordTerminalFailure`; throw leaves work non-terminal → projection stays live/loading, not typed failed |
| 6 | Mutation-argue load-bearing tests | **PASS** (with gap) | Page/projection kills are real; **no test kills the production A-8 hang** — see §6 and BLOCKING-B1 |

---

## Ticket / scope grounding

- **DELIVERS:** (1) generating → LOADING with question; (2) FAILED → typed failure; (3) missing → honest 404; (4) **XREV A-8 loud stop → page typed failure**; (5) mutation proofs.
- **V's personal hit (DR-165(1)):** POST `/new` → `/debate/<run_ref>` while CLAIMED → first paint 404. Closed by LOAD-01 SSR path (J1).
- **XREV-01 A-8 (routed here by goal packet):** Opus XREV rev1 stated the defect class explicitly — mid-review loud stop rethrows from `executeWorkItem`, Hatchet task has no catch, **no typed run terminal**, debate page has nothing honest to show (DR-165 hang class created by DR-165(3)). LOAD-01 was ordered to cover that terminal. Page-side FAILED handling alone is **not** end-to-end closure.

---

## 1. V's exact flow — SSR path (QUEUED/CLAIMED → LOADING + question)

**PASS**

### Navigation that hits the defect class

| Step | Shipped path | Anchor |
|---|---|---|
| POST ask | `createDebate` → `client.submitAsk` → `{ id: accepted.run_ref }` | `apps/v2-ui/lib/api.ts:261–290` |
| Navigate | `router.push(\`/debate/${encodeURIComponent(debate.id)}\`)` | `apps/v2-ui/app/new/page.tsx:115–116` |
| SSR page | `force-dynamic` + cookie token → `getDebateServer(id, token)` | `apps/v2-ui/app/debate/[id]/page.tsx:9–33` |

### First-fetch resolution (the original 404 site)

`getDebateServer` (`apps/v2-ui/lib/serverApi.ts:62–99`):

1. `readAnswer(id)` — for a fresh run ref this 404s.
2. `readRunAnswer(id)` — no served answer → 404.
3. **Only then** `readRun(id)` — typed projection.
4. Non-`FAILED` states → `{ kind: "loading", run }`.
5. `FAILED` → `{ kind: "failed", run, reason }`.
6. Run also 404 → `{ kind: "not_found" }`.
7. Transport / non-404 contract errors → `{ kind: "pending", ... }` (retryable; **not** not-found).

Page gate (`page.tsx:34–47`): loading → `debateDetailFromRunProjection` + `initialPending`; failed → projection + `initialError`; `not_found` → `notFound()` only.

Adapter (`adapter.ts:450–468`): non-FAILED → V2 `"generating"`; root claim / topic = **`run.question_line`**.

### Backend projection for live work

`RunRepository.readLoadingProjection` (`packages/db/src/index.ts:313–343`): precedence **FAILED > CLAIMED > READY→QUEUED > else RUNNING**. CLAIMED/QUEUED with no answer → SSR **loading**, never 404 from answer absence alone.

### Proof

| Probe | Result |
|---|---|
| `v2ui-data-layer` queued flow | `kind: "loading"`, question, status `generating` |
| `load01-live-proof` | Fastify + contract client: POST → QUEUED → loading with real question |
| Page source guard | loading branch requires `debateDetailFromRunProjection` |

**Judgment: PASS** — V's generating first-paint 404 is closed.

---

## 2. Typed-FAILED **when the work item is already FAILED**

**PASS** (scope: presentation of an already-terminal run — **not** production production of A-8 terminals; see J5)

### Wire + schema honesty

`RunProjectionSchema` (`packages/contract/src/index.ts:130–142`): closed states; **FAILED requires non-null `terminal_reason`**, non-FAILED forbids one.

### SSR + presentation

| Layer | Behaviour |
|---|---|
| `getDebateServer` | `FAILED` → `kind: "failed"` + reason |
| Page | `status: "failed"`; `initialError = "Debate generation failed: ${reason}"`; no `notFound()` |
| Client | Failed pill; error banner (`DebatePageClient.tsx:1188–1192`) |
| Progress | `generating` false for `"failed"` → progress strip not rendered (`:1178–1186`) |

Production paths that **do** already set work `FAILED` (and therefore benefit from this presentation): e.g. `failFromExhaustedAttempt` → `CALL_BUDGET_EXHAUSTED` + `TERMINAL_FAILED` return (`apps/runner/src/index.ts:545–547`). That is **not** the XREV A-8 throw path.

**Judgment: PASS** for the page/projection contract once FAILED exists.

---

## 3. Genuinely nonexistent id still 404s honestly

**PASS**

| Layer | Absent run behaviour |
|---|---|
| DB | no row for `(run_id, asker_id)` → `null` |
| API | `readRun === null` → **404** `RUN_NOT_FOUND` (`apps/api/src/index.ts:237–241`) |
| `getDebateServer` | run `NOT_FOUND` → `kind: "not_found"` |
| Page | **`notFound()`** only on that branch |

**Judgment: PASS.**

---

## 4. ASKER-OWNED run projection (S05)

**PASS**

| Layer | Ownership |
|---|---|
| Session | empty token → `null`; else `asker:${sha256(token)}` (`apps/api/src/index.ts:96–106`) |
| Route | `GET /v1/runs/:id`: no session → **401** `SESSION_REQUIRED` (`:237–241`) |
| Application | `readLoadingProjection(runId, session.asker_id)` (`:407–414`) |
| SQL | `WHERE run.run_id = $1 AND run.asker_id = $2` (`packages/db/src/index.ts:331`) |
| Foreign | different asker → null → **404** |
| Anon UI | no cookie → skip fetch; `AuthGate` |

**Judgment: PASS** (ADVISORY-A2: missing dedicated foreign/anon injects on the new route).

---

## 5. XREV-01 A-8 mid-review loud stop → page typed failure

**FAIL — BLOCKING**

### What A-8 requires (goal packet + XREV routing)

Goal packet deliverable (4): *a mid-review loud stop must reach the page as typed failure, not a hang*. XREV-01 Opus A-8 named the defect: runner rethrows; Hatchet task has no catch; no typed run terminal; page has nothing honest to show.

### What the runner does on mid-review failure

```905:917:apps/runner/src/index.ts
        } catch (error) {
          if (error instanceof TypedDomainError && [
            "RUN_COST_ENVELOPE_EXHAUSTED",
            "CALL_BUDGET_EXHAUSTED",
            "PRODUCER_GRADING_FORBIDDEN"
          ].includes(error.code)) throw error;
          // DR-165(3): the record remains honestly absent, but the authored
          // opinion is unservable. Never turn a failed call into cannot-assess.
          throw new TypedDomainError(
            "NODE_REVIEW_UNAVAILABLE",
            `No valid cross-maker review was recorded for node ${authoredNode.nodeId}`
          );
        }
```

This is a **throw**, not a `return { kind: "TERMINAL_FAILED" }`, and not a call to `recordTerminalFailure` / `failFromExhaustedAttempt`.

### Standing production path (API → Hatchet → runner)

| Component | Role | Terminal record on throw? |
|---|---|---|
| `HatchetDispatcher.dispatch` | `runNoWait` fire-and-forget (`apps/api/src/index.ts:261–280`) | **No** — does not observe task outcome |
| `declareHatchetWalkingSkeletonTask` | `await executeWorkItem` then return result kind (`apps/runner/src/index.ts:1370–1388`) | **No catch** — throw propagates to Hatchet engine retries |
| `apps/runner/src/main.ts` | registers that task only | no failure recorder wired |
| Work item after throw | remains non-`DONE` / non-`FAILED` (CLAIMED until claim loss / retry) | **No** `terminal_reason` |

```1379:1388:apps/runner/src/index.ts
  return input.client.task({
    name: input.workflowName,
    retries: input.engineRetries,
    fn: async (dispatch: { runId: string; workItemId: string }) => {
      const result = await input.runner.executeWorkItem(dispatch.workItemId);
      return result.kind === "COMPLETED"
        ? { kind: result.kind, answerId: result.answerId }
        : { kind: result.kind };
    }
  });
```

### What LOAD-01 actually built (page-only half)

If and only if `core.work_item.state = 'FAILED'` with a reason, `readLoadingProjection` reports FAILED, SSR maps to failed UI. That half is real (J2).

For A-8 on production, the projection CASE sees **CLAIMED** (or READY after reclaim), **not FAILED**:

- SSR → `kind: "loading"` / generating with question
- No answer ever arrives (serve was never written — correct under DR-165(3))
- Page never leaves generating → **infinite loading hang**, not typed failure

That is exactly the A-8 class XREV routed to this ticket.

### AcceptanceDispatcher is not production

`recordTerminalFailure` call sites in the tree:

| Location | Role |
|---|---|
| `packages/battery/src/index.ts:391` | repository method (capability) |
| `acceptance/main.ts:77–99` | **AcceptanceDispatcher only** — ceremony / test API composition |
| `tests/unit/acceptance-dispatcher.test.ts` | unit tests of that ceremony dispatcher |

Standing API composition (`apps/api/src/main.ts`) uses **`HatchetDispatcher`**, not `AcceptanceDispatcher`. Standing runner bootstrap (`apps/runner/src/main.ts`) never calls `recordTerminalFailure`.

**Causally false claim (handoff / prior draft of this review):**  
`runner throw → AcceptanceDispatcher → recordTerminalFailure → page typed failure` as the closed A-8 path.  
**True only for acceptance ceremony.** False for the path V's live debates use.

### What LOAD-01 tests prove vs do not prove

| Proven | Not proven |
|---|---|
| Synthetic FAILED fixture → SSR `kind: "failed"` + reason on page | That A-8 throw ever becomes work FAILED on Hatchet |
| Schema requires reason on FAILED | Production catch that writes that reason for `NODE_REVIEW_UNAVAILABLE` |
| Fixture string `TOTAL_REVIEW_COVERAGE_UNSATISFIED` (synthetic) | Live codes `NODE_REVIEW_UNAVAILABLE` / `NODE_REVIEW_COVERAGE_ENVELOPE_UNRATIFIED` recorded on work items under Hatchet |

### Smallest rework that would close B1

One of (product choice for Codex / Hermes):

1. **Hatchet task catch** (mirror acceptance): on `executeWorkItem` rejection, `recordTerminalFailure({ runId, workItemId, reason: typedCode })`, rethrow or return `TERMINAL_FAILED` per engine policy; or  
2. **Runner-internal**: map `NODE_REVIEW_UNAVAILABLE` (and related loud stops) through `recordTerminalFailure` / aggregate-owned fail before rethrow; or  
3. Explicit non-goal + board re-route if A-8 is no longer LOAD-01's — but the **goal packet currently lists it as a DELIVER**, so leaving it open is **BLOCKING** under that contract.

Plus a test that drives the **shipped production entry** (`declareHatchetWalkingSkeletonTask` fn or runner execute path with the real fail recorder wiring), not only a pre-FAILED fixture into `getDebateServer`.

**Judgment: FAIL (BLOCKING).** Page-only FAILED handling is not A-8 end-to-end closure.

---

## 6. Mutation-argue load-bearing tests

**PASS** for DR-165(1) / missing / ownership / page FAILED presentation; **gap** on A-8 production hang.

| Assertion / suite | Mutation killed |
|---|---|
| Contract `GET /v1/runs/{id}` + `RunProjectionSchema` | Remove route/schema |
| Schema FAILED ⇔ reason | FAILED without reason |
| API queued 200 + missing 404 | Always/never 404 |
| `getDebateServer` queued → loading + question | Answer 404 → not_found |
| `getDebateServer` FAILED → failed | FAILED as pending |
| missing run → not_found | All 404s → loading |
| Adapter question + generating/failed | Placeholder topic |
| `load01-live-proof` composition | Break facade/client/SSR seam |
| Repo SQL asker + FAILED precedence | Drop ownership / reorder CASE |
| Page source notFound/loading/failed | Stop threading states |

| Assertion missing | Mutation that still passes |
|---|---|
| Hatchet task / production fail recorder for review throw | Delete any non-existent catch (already absent); A-8 hang remains; all 75 tests still green |

**Judgment: PASS** on tests that exist for J1–J4/J2 presentation; the missing A-8 production kill is part of **BLOCKING-B1**, not a separate soft miss.

---

## End-to-end diagrams

### Generating path (J1) — CLOSED

```text
POST /v1/asks → 202 { run_ref, QUEUED }
router.push /debate/<run_ref>
page.tsx SSR → getDebateServer
  readAnswer/readRunAnswer 404 → readRun → QUEUED|CLAIMED
  → loading + question_line → V2 generating  ✓
```

### A-8 mid-review loud stop (J5) — OPEN on production

```text
Hatchet task → executeWorkItem
  review fails → throw NODE_REVIEW_UNAVAILABLE
  declareHatchetWalkingSkeletonTask: NO catch, NO recordTerminalFailure
  work_item stays non-FAILED (CLAIMED / retry)
readLoadingProjection → CLAIMED|QUEUED|RUNNING (not FAILED)
getDebateServer → kind: "loading"  → infinite generating hang  ✗
  (never kind: "failed", never typed reason on page)

Acceptance only:
  AcceptanceDispatcher.catch → recordTerminalFailure → FAILED+reason
  → page failed UI would work — but this is NOT standing API/runner
```

---

## BLOCKING findings

### B1 — XREV-01 A-8 not closed on production Hatchet path

- **Law / deliverable:** goal packet (4); XREV-01 A-8; DR-165 hang class.
- **Where:** `declareHatchetWalkingSkeletonTask` (`apps/runner/src/index.ts:1370–1388`); `HatchetDispatcher` (`apps/api/src/index.ts:261–280`); runner throw at `:913–916`. Contrast acceptance-only catch at `acceptance/main.ts:87–91`.
- **Effect:** Mid-review loud stop never becomes work `FAILED`; LOAD-01 projection correctly shows **loading** for live work → page hang without typed failure copy.
- **Why page-only work is insufficient:** J2 proves presentation *given* FAILED. A-8 requires the terminal to **exist** on the production execution path.
- **Required for APPROVED:** production-path terminal record (or explicit re-scope of A-8 off this ticket) + a test that fails if the Hatchet/runner throw leaves work non-FAILED without a typed reason reaching `readLoadingProjection`.

---

## ADVISORY findings (non-blocking)

### A1 — Client refresh path still answer-only

`getDebateBundle` does not call `readRun`; relies on SSR seed + `isNotFound` early-return. Fine for full navigation first paint (J1). Not the A-8 hang root cause.

### A2 — Ownership tests stop at SQL text + happy/missing API

No two-token foreign inject or dedicated 401 inject on `GET /v1/runs/:id`. Structural ownership is present.

### A3 — Fixture reason is synthetic

Tests use `TOTAL_REVIEW_COVERAGE_UNSATISFIED`, not `NODE_REVIEW_UNAVAILABLE` / `ACCEPTANCE_EXECUTION_FAILED:*`. Secondary to B1.

### A4 — Soft generating pre-stream bar

Empty-tree generating still shows V2 `pct: 6` / "Decomposing claim". Live-run vocabulary; not dead-run DR-115 lie. On A-8 hang this bar is part of the infinite loading symptom (symptom of B1, not a separate root).

### A5 — Shared dirty worktree attribution

Behaviour judged as present; no clean-history claim.

---

## What is already good (do not re-litigate as open)

- DR-165(1) first-paint generating 404 is closed (J1).
- Honest missing-id 404 (J3).
- Asker scoping on the new endpoint (J4).
- Typed FAILED presentation contract (J2) for runs that are already terminal (budget-exhaust path included).
- Focused suite 75/75 for the seams LOAD-01 actually wired.

---

## DDD / SOLID / DR-115 (brief)

- Run projection as typed read model for generating first paint: sound.
- DR-115 for dead runs that are **marked** FAILED: sound (no fabricated progress).
- Gap: A-8 leaves the aggregate **non-terminal** on production, so the UI is forced to treat a dead-in-practice run as still generating — that is the honesty failure A-8 named.

---

## Evidence index

| Artifact | Role |
|---|---|
| `apps/v2-ui/app/debate/[id]/page.tsx` | SSR gate |
| `apps/v2-ui/lib/serverApi.ts` | `getDebateServer` |
| `packages/db/src/index.ts` | `readLoadingProjection` |
| `apps/api/src/index.ts` | `GET /v1/runs/:id`, **HatchetDispatcher (no terminal record)** |
| `apps/runner/src/index.ts` | A-8 throw; **Hatchet task without catch** |
| `apps/runner/src/main.ts` | production runner bootstrap |
| `acceptance/main.ts` | **acceptance-only** `recordTerminalFailure` catch |
| `packages/battery/src/index.ts` | `recordTerminalFailure` capability |
| XREV-01 Opus rev1 A-8 | upstream defect definition routed to LOAD-01 |
| Focused re-run | 75/75 (does not kill B1) |
| Scratch `load01-j5-production-path-audit.txt` | production vs acceptance call-site proof |

---

## Bottom line

**BLOCKED.** LOAD-01 earns J1–J4 and the presentation half of typed FAILED, and that is real progress on DR-165(1). It does **not** earn APPROVED while goal deliverable (4) / XREV-01 A-8 remains open on the standing Hatchet path: mid-review `NODE_REVIEW_UNAVAILABLE` still fails to become work `FAILED`, so the new projection cannot show typed failure and the page hangs in generating. Do not treat acceptance-ceremony `recordTerminalFailure` as production proof. Rework B1, then re-enter the dual diamond.
