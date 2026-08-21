# Hermes PROG-11 — eval-11-devmenu stage verification

## Result

APPROVED branch `codex/eval-11-devmenu` at `c88dce1`, containing declared commits `91a4c16` and `c88dce1`, after reading all four PROG-11 peer-review artifacts and independently verifying the lane.

## Verification performed

- `pnpm run typecheck` — PASS, exit 0, no diagnostics.
- `pnpm exec vitest run --reporter=dot` — PASS, 104 files / 730 tests, exit 0.
- Focused required run — PASS, 4 files / 10 tests: structural UI control enumeration, exact API route subtree and production refusal, real-PostgreSQL dev-menu projection/grants, and whole-workspace unbound selector guard.
- `git diff --check dev...HEAD` — PASS.
- Both declared commits are ancestors of the tested clean head.

## Review resolution

Round 1 split A-REWORK/B-PASS. Commit `c88dce1` closed seat A's four blockers by extracting the canonical dispatch-binding resolver, sharing HARVEST constants and collapsing the parked-run query, replacing lexical no-bind checks with exact route and rendered-control enumeration, and removing the unread `shadow_decision` grant. Round 2 returned dual PASS.

## Required spot-checks

- Structural no-bind proof: the rendered subtree exposes exactly two catalog `Select` buttons and no other interactive control; the Fastify subtree contains only the read route and consumer-selection POST. Both tests passed.
- Darkness: the architecture guard found zero production callers of judge selection, seat-share allocation, and shadow-decision persistence across all workspace production roots.
- Production gate: enabled + `NODE_ENV=production` throws `EVALUATOR_DEV_MENU_PRODUCTION_FORBIDDEN`; the normal API composition does not register the route; the UI Settings branch is default-off and production-excluded.
- Grant surface: all migrations give `debateai_evaluator_api` exactly one evaluator-table write privilege, `INSERT` on `evaluator.consumer_selection`, plus only the ledger sequence authority required for its append-only order token. Register access is SELECT-only.
- Repository write surface: `selectConsumerModel` is the sole method that writes; it advisory-locks, pins the latest available probe, requires an enumerated model, supersedes the prior selection, and appends one consumer-selection row.

## Non-blocking follow-ups and custody

- Recorded a UI-layer `toContain("UNBOUND")` render assertion follow-up for FR-9.2 AC2.
- Recorded a second DOM-enumeration fixture follow-up for branches absent from the current healthy/empty fixture; seat A measured that an unrendered branch escapes the guard.
- Marked `eval-11-devmenu` done on the durable `model-evaluator` board.
- Reconciled the two previously approved but stale-running board entries (`eval-09-consumer` and `eval-10-seatshare`) to done, leaving all ten PROGRAMMING lanes complete.
- Added the board note that PROGRAMMING closes pending the orchestrator's V HITL dev-menu reaction round and the QA loop.
- Updated wayfinder issue 11 to done with the same two follow-ups and closure boundary.

## Files produced or amended

- `docs/missions/2026-08-14-model-evaluator/programming/reviews/PROG-11-hermes-stage-verdict.md`
- `.hermes/reports/2026-08-14-model-evaluator/agent-reports/hermes-PROG-11.md`
- `docs/missions/2026-08-14-model-evaluator/wayfinder/issues/11-dev-menu.md`

Final verdict: `HERMES STAGE VERDICT: LANE eval-11 APPROVED`
