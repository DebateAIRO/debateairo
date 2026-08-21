# READY FOR PEER REVIEW — PROG-11 evaluator dev menu

WORKER CLAIM:
- agent: Codex GPT-5.6 Sol
- ticket: PROG-11 / 11-dev-menu
- worker CLI session id: goal `01a00622-8fcc-7441-bec4-064c0137cb79`
- branch/worktree: `codex/eval-11-devmenu` / `/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-11-devmenu`
- assignment type: first_pass
- comments read through: goal packet and `wayfinder/issues/11-dev-menu.md` through EOF on 2026-08-15; no Kanban comment thread was supplied and board mutation was prohibited
- next action: independent read-only peer review

## Outcome

- Added a rough dev-only evaluator section under V3 Settings. It is compiled out
  in production and appears only when `NEXT_PUBLIC_EVALUATOR_DEV_MENU_ENABLED=true`.
- Added a separately gated API composition. Enabling it in production is refused;
  development requires a dedicated `EVALUATOR_DEV_MENU_DATABASE_URL` so evaluator
  reads and the single selection write use the narrow evaluator API role rather
  than the product/admin pool.
- The consumer picker lists only models from the latest vLLM catalog probe. It
  displays a typed unavailable state when the latest probe is unavailable and
  refuses stale or non-enumerated models.
- Consumer selection is append-only, advisory-lock serialized, references the
  latest catalog row through the existing composite FK, supersedes the current
  selection, and is the only dev-menu mutation.
- The status projection shows starter/grown domains with provenance, total
  evaluator observation rows, latest profile cells and ranks, and read-only
  `UNBOUND` dispatch state.
- Parked/circuit-broken runs use the worker's actual exclusion definition: three
  HARVEST failures after the last success/skip. Their persisted failure receipts
  are shown; no reset or retry control exists.
- Migration `0029_evaluator_dev_menu_grants.sql` adds only the SELECT grants the
  dev API needs plus the pre-existing consumer-selection INSERT mechanism. It
  grants no evaluator pipeline, observation, profile, rank, shadow, routing, or
  binding write.
- No allocator call site, BOUND state, bind control, API key, cloud endpoint,
  board mutation, push, merge, or normal ask-flow surface was added.

## Commit and changed files

Commit: `91a4c16aed0013743cdf7f6ed4c18f8ec2ceb995`

- `apps/api/package.json`
- `apps/api/src/index.ts`
- `apps/api/src/main.ts`
- `apps/v2-ui/app/settings/page.tsx`
- `apps/v2-ui/components/EvaluatorDevMenu.tsx`
- `apps/v2-ui/lib/api.ts`
- `migrations/0029_evaluator_dev_menu_grants.sql`
- `packages/evaluator/src/dev-menu.ts`
- `packages/evaluator/src/index.ts`
- `packages/register/src/runtime-environment.ts`
- `pnpm-lock.yaml`
- `tests/integration/evaluator-dev-menu-database.test.ts`
- `tests/unit/evaluator-dev-menu-api.test.ts`
- `tests/unit/evaluator-dev-menu-ui.test.ts`
- `tools/orphan-audit/src/index.ts`

Allowed-scope evidence: every changed file implements, wires, grants, tests, or
audits the ticket-11 dev-menu read/selection boundary. `skeleton/` was untouched,
so no skeleton VERSION/CHANGELOG/upgrade-guide change applies.

## RED → GREEN evidence

RED after the dev-menu tests were authored first:

```text
pnpm exec vitest run tests/unit/evaluator-dev-menu-api.test.ts \
  tests/unit/evaluator-dev-menu-ui.test.ts \
  tests/integration/evaluator-dev-menu-database.test.ts

Test Files 3 failed (3)
Representative failures:
  Cannot find module '../../packages/evaluator/src/dev-menu.js'
  ENOENT ... apps/v2-ui/components/EvaluatorDevMenu.tsx
```

The worktree initially had no dependencies linked; `pnpm install
--frozen-lockfile` reused 387 packages from the local content-addressable store
with zero downloads. The behavioral missing-implementation RED above was then
captured.

Focused GREEN:

```text
pnpm exec vitest run tests/unit/evaluator-dev-menu-api.test.ts \
  tests/unit/evaluator-dev-menu-ui.test.ts
Test Files 2 passed (2)
Tests      6 passed (6)

pnpm exec vitest run tests/integration/evaluator-dev-menu-database.test.ts
Test Files 1 passed (1)
Tests      4 passed (4)
```

The real embedded-PostgreSQL fixture uses pinned `2026-08-15T14:00:00.000Z`
clocks and real inserts. It proves catalog FK selection, non-enumerated refusal,
unavailable/latest-probe refusal, starter/grown provenance, observation/profile/
rank reads, three-failure parking receipts, and narrow grants.

## Exact verification

```text
pnpm exec vitest run --reporter=dot
Test Files 103 passed (103)
Tests      729 passed (729)

pnpm run typecheck
PASS (tsc --noEmit)

pnpm --filter dialectical-engine-v2ui typecheck
PASS (tsc --noEmit -p tsconfig.json)

pnpm --filter dialectical-engine-v2ui test
tests 27; pass 27; fail 0

pnpm run audit:architecture
edgeRowsChecked: 27; violations: []

pnpm run audit:source
blocking: []

bash tests/render-templates.sh
PASS

bash tests/lint-templates.sh
PASS

git diff --check
PASS
```

The full suite includes the evaluator panel-membership differentials and the
darkness guard. `tests/architecture/evaluator-selector-unbound.test.ts` confirms
zero production callers of judge selection, seat-share allocation, and shadow
dispatch persistence.

## Risks and review focus

- The prototype intentionally needs two explicit development gates and a
  deployment-provided narrow-role database URL; without them it remains absent.
- The status read is a bounded latest projection (24 profile rows), not an
  operational analytics browser.
- Visual/product reaction is the ticket's HITL next gate. The implementation
  worker did not self-approve that gate and did not add production chrome.

Comments read through: goal packet and binding Programming-stage handoff through
EOF on 2026-08-15; no newer ticket comments were provided.

READY FOR PEER REVIEW: codex/eval-11-devmenu

## Continuation after client termination

The original worker/session resumed after the known CLI hang. The designated
worktree was clean on `codex/eval-11-devmenu` at
`c88dce14d4929818b46d9472caf7e7ebce330c8c`; the committed rework was intact,
so there was no uncommitted implementation change to commit.

The four-item rework remains complete:

1. The dev menu consumes the package's canonical
   `readEvaluatorDispatchBinding` from the shared dispatch-binding module.
2. The worker and display consume shared `HARVEST_PIPELINE_VERSION` and
   `HARVEST_MAX_CONSECUTIVE_FAILURES`; the display predicate exists once in a
   single CTE.
3. The lexical no-bind assertion was replaced by exact Fastify route-tree and
   jsdom interactive-control enumeration. The earlier durable RED proof remains:
   a temporary `Activate` button passed the old regex, then failed the new DOM
   test with three controls instead of exactly two `Select` buttons.
4. Migration 0029 does not grant `shadow_decision SELECT`; the integration test
   asserts its absence. Least privilege was chosen because no legitimate reader
   exists in this display.

Fresh continuation verification on 2026-08-15:

```text
pnpm exec vitest run tests/render/evaluator-dev-menu-controls.test.tsx \
  tests/unit/evaluator-dev-menu-api.test.ts \
  tests/unit/evaluator-dev-menu-ui.test.ts \
  tests/integration/evaluator-dev-menu-database.test.ts \
  tests/unit/evaluator-foundation.test.ts --reporter=verbose
Test Files 5 passed (5)
Tests      22 passed (22)

pnpm exec vitest run \
  tests/architecture/evaluator-selector-unbound.test.ts --reporter=verbose
Test Files 1 passed (1)
Tests      1 passed (1)

pnpm run typecheck
PASS (exit 0)

pnpm --filter dialectical-engine-v2ui typecheck
PASS (exit 0)
```

Comments read through: the continuation request and both round-1 reviewer
artifacts through EOF on 2026-08-15. No rework finding remains open.

READY FOR PEER REVIEW: codex/eval-11-devmenu

## Rework round 1 acknowledgement

REWORK ACKNOWLEDGED: reviewer A review 1 at
`docs/missions/2026-08-14-model-evaluator/programming/reviews/PROG-11-opus-review-1.md`
and reviewer B review 1 at
`docs/missions/2026-08-14-model-evaluator/programming/reviews/PROG-11-opus2-review-1.md`
were read through EOF on 2026-08-15. This is the original worker/session on
`codex/eval-11-devmenu` at `91a4c16`.

Findings accepted for the smallest correction:

1. B1: remove the duplicate dispatch-binding resolver and consume the package's
   canonical `readEvaluatorDispatchBinding` implementation.
2. B2: share `HARVEST_PIPELINE_VERSION` and
   `HARVEST_MAX_CONSECUTIVE_FAILURES` between the worker and display, and express
   the parked-run predicate once.
3. B3: reproduce the lexical test's blind spot, then replace it with exact
   composed-route enumeration and jsdom interactive-control enumeration.
4. B4: remove the unused `shadow_decision` SELECT grant and its pinned test
   expectation. The dev menu has no shadow-decision reader, so least privilege
   is preferable to expanding the display solely to justify a permission.

Comments read through: both supplied rework review artifacts through EOF on
2026-08-15.

## Rework round 1 completion

Commit: `c88dce14d4929818b46d9472caf7e7ebce330c8c`
(`fix(evaluator): harden dev menu invariants`). The worktree is clean and the
branch remains local-only.

### Finding disposition

1. **B1 resolved.** The canonical dispatch-binding row key, type, and
   `readEvaluatorDispatchBinding` now live in
   `packages/evaluator/src/dispatch-binding.ts`, are re-exported by the package,
   and are consumed directly by `dev-menu.ts`. The duplicate resolver and
   literal row key were removed.
2. **B2 resolved.** `HARVEST_PIPELINE_VERSION` and
   `HARVEST_MAX_CONSECUTIVE_FAILURES` now live in
   `packages/evaluator/src/harvest-constants.ts`. The evaluator package exports
   both; the worker consumes and re-exports the shared threshold, while the dev
   menu binds both values as SQL parameters. The duplicated parked/receipt SQL
   became one CTE and therefore contains the exclusion predicate once.
3. **B3 resolved with reproduction.** A temporary `Activate` button was added
   solely to demonstrate the old test's blind spot. The unchanged four-phrase
   regex test passed all 3 tests despite that control. With the same temporary
   button present, the new jsdom enumeration failed exactly as intended:
   expected `[BUTTON:Select, BUTTON:Select]`, received
   `[BUTTON:Activate, BUTTON:Select, BUTTON:Select]`. The temporary button was
   then removed. The committed tests enumerate the exact Fastify dev-evaluator
   route subtree (`GET/HEAD /v1/dev/evaluator` and
   `POST /v1/dev/evaluator/consumer-selection`, with no binding/dispatch route)
   and the exact rendered interactive-control set (the two `Select` buttons).
   The old lexical absence assertion was removed.
4. **B4 resolved by dropping the grant.** Migration 0029 no longer grants
   `SELECT` on `evaluator.shadow_decision`, and the integration test now asserts
   that permission is absent. This is the least-privilege choice because the
   ticket requires the existing register-backed dark-launch status projection,
   not a shadow-decision listing; adding an otherwise unrequested reader solely
   to justify a privilege would expand the prototype without product value.

### Rework verification

```text
pnpm exec vitest run tests/render/evaluator-dev-menu-controls.test.tsx \
  tests/unit/evaluator-dev-menu-api.test.ts \
  tests/unit/evaluator-dev-menu-ui.test.ts \
  tests/integration/evaluator-dev-menu-database.test.ts \
  tests/unit/evaluator-foundation.test.ts --reporter=verbose
Test Files 5 passed (5)
Tests      22 passed (22)

pnpm exec vitest run tests/integration/evaluator-database.test.ts \
  tests/integration/evaluator-seat-share-database.test.ts \
  tests/architecture/evaluator-selector-unbound.test.ts --reporter=dot
Test Files 3 passed (3)
Tests      22 passed (22)

pnpm exec vitest run --reporter=dot
Test Files 104 passed (104)
Tests      730 passed (730)

pnpm run typecheck
PASS

pnpm --filter dialectical-engine-v2ui typecheck
PASS

pnpm --filter dialectical-engine-v2ui test
tests 27; pass 27; fail 0

pnpm run audit:architecture
edgeRowsChecked: 27; violations: []

pnpm run audit:source
blocking: []

pnpm run audit:text-bytes
REPOSITORY_TEXT_CONTROL_BYTES=0

pnpm run audit:orphans
PASS (no new blocking entry)

bash tests/render-templates.sh
PASS

bash tests/lint-templates.sh
PASS

git diff --check
PASS
```

The focused real-PostgreSQL test verifies the parked-run projection after the
single-CTE refactor and verifies that the API role does not receive
`shadow_decision SELECT`. The differential run includes byte-identical product
membership/agent-count behavior, narrow evaluator grants, the UNBOUND
seat-share receipt, and zero selector/allocator/shadow-dispatch production call
sites.

Comments read through: reviewer A and reviewer B review 1 through EOF on
2026-08-15. All four round-1 findings are resolved; no earlier finding remains
open.

READY FOR PEER REVIEW: codex/eval-11-devmenu
