# PROG-11 Hermes stage verdict — `eval-11-devmenu`

Mission: `model-evaluator`  
Lane: `codex/eval-11-devmenu`  
Verified commits: `91a4c16` + `c88dce1`  
Verdict: **APPROVED**

## Review chain and ruling basis

I read all four pre-existing `PROG-11-*.md` review artifacts. Round 1 split A-REWORK/B-PASS. Seat A's four blockers were test and invariant hygiene rather than a functional failure: the dispatch-binding resolver was duplicated, the parked-run predicate duplicated worker constants and SQL, the no-bind-control test was lexical rather than structural, and migration 0029 granted an unread `shadow_decision` surface. Commit `c88dce1` extracted the canonical resolver, shared the HARVEST constants and collapsed the parked query, replaced the lexical guard with rendered-control and exact-route enumeration, and removed the unused grant. Both independent round-2 reviews returned PASS.

## Independent verification

All executable checks ran in `/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-11-devmenu/DebateAI-V3` at clean head `c88dce1`.

| Check | Command | Result |
|---|---|---|
| Repository typecheck | `pnpm run typecheck` | PASS; `tsc --noEmit`, exit 0, no diagnostics |
| Full repository tests | `pnpm exec vitest run --reporter=dot` | PASS; **104 files / 730 tests**, exit 0 |
| Required focused checks | `pnpm exec vitest run tests/render/evaluator-dev-menu-controls.test.tsx tests/unit/evaluator-dev-menu-api.test.ts tests/integration/evaluator-dev-menu-database.test.ts tests/architecture/evaluator-selector-unbound.test.ts --reporter=verbose` | PASS; 4 files / 10 tests |
| Patch hygiene | `git diff --check dev...HEAD` | PASS; no output |
| Declared commits | `git merge-base --is-ancestor` for `91a4c16` and `c88dce1` | PASS; both are ancestors of tested HEAD |

The full suite completed without the round-1 intermittent PostgreSQL teardown error.

## Required spot-checks

### Structural no-bind-control proof — PASS

`tests/render/evaluator-dev-menu-controls.test.tsx:67-71` mounts the real component under jsdom and enumerates every `button`, `input`, `select`, `textarea`, `form`, and linked anchor in the rendered subtree. The committed healthy-catalog fixture yields exactly two `BUTTON:Select` controls. `tests/unit/evaluator-dev-menu-api.test.ts:55-78` independently byte-pins the Fastify subtree to only `GET/HEAD /v1/dev/evaluator` and `POST /v1/dev/evaluator/consumer-selection`. Both tests passed.

The architecture guard also passed. It recursively scans production sources under `apps`, `packages`, `web`, `tools`, and `acceptance` and found no caller of judge selection, seat-share allocation, or shadow-decision persistence. A diff scan found no standalone `BOUND` state or register-row write. The only UI mutation calls consumer selection.

### Dev-only production-forbidden gate — PASS

The server route is compositionally absent unless `EVALUATOR_DEV_MENU_ENABLED` is exactly `true`; the normal composition returns 404. `loadApiEnvironment` requires a dedicated `EVALUATOR_DEV_MENU_DATABASE_URL` when enabled and throws `EVALUATOR_DEV_MENU_PRODUCTION_FORBIDDEN` when enabled with `NODE_ENV=production`. The focused production-composition test passed.

The UI is reachable only from Settings and is guarded at module scope by both `NODE_ENV !== "production"` and `NEXT_PUBLIC_EVALUATOR_DEV_MENU_ENABLED === "true"`; it is not wired into the normal ask flow. The dev repository receives a separately constructed pool rather than the product pool.

### Single-write grant surface — PASS

Across all migrations, `debateai_evaluator_api` receives exactly one evaluator-table write grant: `INSERT ON evaluator.consumer_selection` in migration 0023. Its only additional mutation authority is the ledger sequence allocator required to assign the append-only ordering token. Migration 0029 adds SELECT-only grants and no write privilege; the round-1 `shadow_decision SELECT` over-grant is absent.

The repository has one write method, `selectConsumerModel`. It serializes under the consumer-selection advisory lock, requires the latest catalog probe to be `AVAILABLE`, checks the selected model belongs to that probe, chains `supersedes_selection_id`, and performs one append-only `consumer_selection` INSERT. The real PostgreSQL test passed for enumerated selection, non-enumerated refusal, unavailable/latest-probe refusal, and narrow privileges. Register access is SELECT-only, so the dev-menu role cannot author binding state.

## Product surface and darkness

The delivered Settings prototype exposes the latest vLLM-enumerated consumer models, explicit unavailable state, starter/grown domains with provenance, harvested observation count, profile/rank peek, read-only `UNBOUND` dispatch status, and parked HARVEST runs with persisted failure receipts and no reset path. The worker and display share `HARVEST_PIPELINE_VERSION` and `HARVEST_MAX_CONSECUTIVE_FAILURES`. No evaluator-derived value steers production dispatch.

## Non-blocking follow-ups

Two test-strengthening notes are recorded on board ticket `eval-11-devmenu` and the matching wayfinder issue:

1. Add `expect(container.textContent).toContain("UNBOUND")` at the UI render layer for FR-9.2 AC2. The repository layer already asserts `UNBOUND`, and the component currently renders it, but the round-2 test does not pin that visible behavior.
2. Add a second DOM-control-enumeration fixture covering currently unrendered branches, especially an unavailable catalog plus populated parked runs. Seat A's RED experiment measured that a control planted in an unrendered branch escapes the current healthy/empty fixture.

These are non-blocking coverage gaps. The present component has no bind/reset control, the server has only the two pinned routes, and the restricted database role independently cannot author binding state.

## Custody and decision

All four round-1 blockers are resolved, round 2 is dual PASS, independent typecheck and all 730 repository tests pass, and the required structural, production-gating, and grant-surface spot-checks are substantive. `eval-11-devmenu` is approved and done.

Board custody now records all ten PROGRAMMING lanes complete. PROGRAMMING closes pending the orchestrator's V HITL dev-menu reaction round and the QA loop; this verdict does not self-approve either downstream gate.

HERMES STAGE VERDICT: LANE eval-11 APPROVED
