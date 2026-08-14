# UI-02c Codex handoff — visible house identity and honest lineage contract

Ticket: `t_0829cf81` · worker session: `019ff616-0a32-74f3-bcf8-9b4a8dc3d88f` · run: `72`

Disposition: `READY FOR PEER REVIEW — UI-02c`. Working tree only; no commit, push, merge, branch/worktree mutation, service restart, destructive operation, or product-data write was performed.

## Delivered

1. **A1 — HOUSE visible.** The V3 adapter carries the recorded `maker_lineage.maker` alongside `model_id`. Every V2 card/readout (canvas, tree, thread, outline, split, map, and node drawer) now uses the existing `ModelBadge` / `ModelMetaLine` / `modelColor` vocabulary. Colour identity is keyed by the maker when recorded, so equal model strings from OpenAI and Anthropic remain visibly distinct. Legacy V2 callers keep their prior model metadata colour.
2. **Typed absence.** A V3 node whose lineage join is absent carries `maker: null`; shared model presentation renders the visible text `House unavailable` with `data-maker-absence="true"`, rather than silence or an inferred house.
3. **A2 — honest wire names.** Served `maker_lineage` is now `{ maker, model_id, transport, provider_ref }`. The raw ledger fields remain unchanged: resolver input `provider` is mapped to served `transport`; redundant `model_version` is not served. Strict schema tests reject the misleading legacy `provider` member. Contract generation was run.
4. **A5 — mutation hole closed.** The resolver behavioral test now asserts `provider: null` maps the entire lineage to typed absence. Removing that guard makes the test fail with an observed `{ transport: null }` projection; restoring it returns green.

No maker is inferred from a model-id string, and no runtime value is fabricated (DR-115).

## TDD RED → GREEN

Initial RED before production edits:

```text
$ pnpm vitest run tests/unit/contract.test.ts tests/unit/s14-ui.test.ts tests/unit/v2ui-data-layer.test.ts
Test Files  3 failed (3)
Tests       2 failed | 17 passed (19)
exit 1

contract: model_version/provider required; transport rejected
serve: received legacy model_version/provider instead of transport
adapter fixture: transport rejected and maker not projected
```

Focused GREEN after implementation and contract generation:

```text
$ pnpm run generate:contract
$ pnpm vitest run tests/unit/contract.test.ts tests/unit/s14-ui.test.ts tests/unit/v2ui-data-layer.test.ts
Test Files  3 passed (3)
Tests       64 passed (64)
exit 0
```

A5 red-under-mutation proof (temporarily deleted only `recorded.provider === null ||`):

```text
$ pnpm vitest run tests/unit/s14-ui.test.ts -t 'relays a complete ledger identity exactly and maps an unresolved join to typed absence'
Test Files  1 failed (1)
Tests       1 failed | 13 skipped (14)
AssertionError: expected { maker: 'maker:test-layer', model_id: 'model:test-layer',
provider_ref: 'provider:test-layer', transport: null } to be null
exit 1
```

After restoring the guard:

```text
Test Files  1 passed (1)
Tests       1 passed | 13 skipped (14)
exit 0
```

## Required gates — real output

```text
$ pnpm run typecheck
$ tsc --noEmit
exit 0

$ pnpm --dir apps/v2-ui typecheck
$ tsc --noEmit -p tsconfig.json
exit 0

$ node --test apps/v2-ui/lib/debateStatusPresentation.source-test.mjs
tests 3 · pass 3 · fail 0
exit 0

$ pnpm vitest run --reporter=dot --silent
Test Files  65 passed (65)
Tests       461 passed (461)
Duration    20.63s
exit 0

$ pnpm vitest run --config acceptance/vitest.config.ts --reporter=dot --silent
Test Files  9 passed (9)
Tests       35 passed (35)
Duration    5.89s
exit 0

$ pnpm run audit:architecture
{ "edgeRowsChecked": 27, "violations": [] }

$ pnpm run audit:source
{ "blocking": [] }

$ pnpm run audit:orphans
[full declared inventory printed]
exit 0

$ git diff --check
[no output]
exit 0
```

The first full root run failed only two stale UI-01 source pins that required inline `modelMeta(generation.model_id)`. UI-02c intentionally replaces that inline presentation with the shared V2 helper; the pins were updated to require `ModelMetaLine` plus `maker={node.maker}`. The immediately repeated full run produced the 65/65 and 461/461 result above.

## UI-02c file inventory

- Contract/serve: `packages/contract/src/index.ts`, `packages/serve/src/index.ts`
- Adapter/types: `apps/v2-ui/lib/v3/adapter.ts`, `apps/v2-ui/lib/types.ts`
- Existing V2 vocabulary and consumers: `apps/v2-ui/components/ModelPresentation.tsx`, `DebateCanvas.tsx`, `DebateTree.tsx`, `DebateThread.tsx`, `DebateOutline.tsx`, `DebateSplit.tsx`, `DebateMap.tsx`, `NodeDetailDrawer.tsx`
- Ratchets/fixtures: `apps/v2-ui/lib/debateStatusPresentation.source-test.mjs`, `tests/unit/contract.test.ts`, `tests/unit/s14-ui.test.ts`, `tests/unit/v2ui-data-layer.test.ts`, `tests/unit/v2ui-pages.test.ts`, `tests/support/v2uiFixtures.ts`, `tests/integration/database.test.ts`
- Durable worker artifacts: `docs/missions/2026-08-06-v3-programming/handoffs/UI-02c-progress.log`, this handoff

These files already contained substantial uncommitted work from UI-02a/UI-02b/PANEL-01 and other tickets. UI-02c owns only the maker/transport/typed-absence/test hunks described above; unrelated dirty-tree content was preserved.

## Environment tail and questions

- Per the packet, the orchestrator owns stack restart and live browser verification. This worker did not restart the standing stack. Root integration and acceptance suites, including embedded PostgreSQL paths, are green.
- No deferred implementation item and no question for V.

Comments read through: `2026-08-12 16:09` Codex `WORKER CLAIM` (latest comment at final pre-handoff scan).

---

## Rev2 — Opus B1 correction after HYG-01

Trigger: orchestrator comment `2026-08-12 16:37` and
`reviews/ui02c-opus-rev1.md`. Same original worker session. Grok approved rev1;
Opus requested one blocking correction. A2 and A5 were independently verified
closed and were not touched during rev2.

### B1 delivered

- Added the pure `makerIdentityLabel({ maker, modelId })` seam in
  `apps/v2-ui/lib/makerIdentity.ts`. It returns the human-readable text plus an
  explicit `absence` discriminator.
- Both shared V2 renderers, `ModelMetaLine` and `ModelBadge`, now render
  `label.text`; the enforced root Vitest source ratchet requires both calls and
  both render sites.
- Added `buildSameModelDifferentMakerAnswer()` to
  `tests/support/v2uiFixtures.ts`: OpenAI and Anthropic both report the exact
  model id `test-layer/model`.
- Added behavioral assertions that those two records produce different labels,
  each naming its own recorded house, and that `maker: null` produces exactly
  `{ text: "House unavailable", absence: true }`.
- Folded A-1: typed absence has the same muted/sunken/strong-border treatment as
  unavailable scoring pills, carries the title `No recorded house is available
  for this argument.`, suppresses the identity dot, and suppresses the badge's
  identity color data/style.
- `apps/v2-ui/lib/models.ts` received non-null type assertions on its closed
  model metadata tables. This is runtime-neutral and was needed because the new
  pure `.ts` seam makes the previously TSX-only helper reachable from the root
  strict/noUncheckedIndexedAccess test graph.

No new `.mjs` test was added. HYG-01's explicit runner manifest therefore did
not need a new entry; the manifest-completeness assertion and maintained Node
suite both pass.

### Rev2 TDD and requested mutation proof

RED before the pure seam/render ratchets existed:

```text
$ pnpm vitest run tests/unit/v2ui-data-layer.test.ts tests/unit/v2ui-pages.test.ts --reporter=verbose
Test Files  2 failed (2)
Tests       2 failed | 39 passed (41)
Error: Cannot find module '../../apps/v2-ui/lib/makerIdentity.js'
UI-02c renderer/source and absence-style assertions failed
exit 1
```

Focused GREEN after the seam, fixture pair, render wiring, and A-1 styling:

```text
$ pnpm vitest run tests/unit/v2ui-data-layer.test.ts tests/unit/v2ui-pages.test.ts --reporter=dot --silent
Test Files  2 passed (2)
Tests       88 passed (88)
exit 0
```

Component mutation requested by the review: replaced both `{label.text}` render
sites with `{modelId}`, leaving the pure function calls, props, absence title,
CSS, and data attributes intact:

```text
$ pnpm vitest run tests/unit/v2ui-data-layer.test.ts tests/unit/v2ui-pages.test.ts -t 'UI-02c' --reporter=verbose
Test Files  1 failed | 1 passed (2)
Tests       1 failed | 2 passed | 85 skipped (88)
FAIL routes ModelMetaLine and ModelBadge through makerIdentityLabel
Target cannot be null or undefined at the assertion requiring two {label.text} render sites
exit 1
```

After restoring both render sites:

```text
Test Files  2 passed (2)
Tests       3 passed | 85 skipped (88)
exit 0
```

This mutation is the reviewer-described mono-model regression: the behavioral
function remains correct, but deleting the last human-readable composition from
both components is now caught by an enforced root-suite test.

### HYG-01 re-baseline and rev2 gates — real output

Pre-edit HYG-01 re-baseline:

```text
$ pnpm vitest run --reporter=dot --silent
Test Files  67 passed (67)
Tests       471 passed (471)
Duration    24.31s
exit 0
```

Post-edit full root gate (four new rev2 tests):

```text
$ pnpm vitest run --reporter=dot --silent
Test Files  67 passed (67)
Tests       475 passed (475)
Duration    24.97s
exit 0
```

Contract and type gates:

```text
$ pnpm run generate:contract
$ tsx packages/contract/src/generate.ts
exit 0

$ pnpm run typecheck
$ tsc --noEmit
exit 0

$ pnpm --dir apps/v2-ui typecheck
$ tsc --noEmit -p tsconfig.json
exit 0
```

HYG-01 Node runner, manifest, and control-byte gates:

```text
$ pnpm --dir apps/v2-ui test
V2_UI_NODE_TESTS_DISCOVERED=1
tests 27 · pass 27 · fail 0
exit 0

$ pnpm vitest run tests/unit/v2ui-node-runner.test.ts --reporter=verbose
Test Files  1 passed (1)
Tests       2 passed (2)
exit 0

$ pnpm run audit:text-bytes
REPOSITORY_TEXT_CONTROL_BYTES=0
exit 0
```

Acceptance and focused real-PostgreSQL gates:

```text
$ pnpm vitest run --config acceptance/vitest.config.ts --reporter=dot --silent
Test Files  9 passed (9)
Tests       35 passed (35)
Duration    6.58s
exit 0

$ pnpm vitest run tests/integration/database.test.ts --reporter=dot --silent
Test Files  1 passed (1)
Tests       32 passed (32)
Duration    2.91s
exit 0
```

Architecture and hygiene:

```text
$ pnpm run audit:architecture
{ "edgeRowsChecked": 27, "violations": [] }

$ pnpm run audit:source
{ "blocking": [] }

$ pnpm run audit:orphans
[full declared inventory printed]
exit 0

$ git diff --check
[no output]
exit 0
```

### Recorded advisories (not silently fixed)

- **A-2 — house-color collision.** The existing seven-bucket character-sum
  `modelColor` hash maps this repository's own `Primary test maker` and
  `Secondary test maker` fixtures to the same `#6f5d9a`. Text is the guaranteed
  distinction; color alone is not. Fixing the V2 color policy is outside this
  bounded B1 correction.
- **A-3 — inferred model half.** `makerIdentityLabel` deliberately preserves
  V2's existing vocabulary by deriving the friendly model family through
  `modelMeta(modelId)`. A mismatched alias can therefore read, for example,
  `OpenAI · Claude`; the house half remains recorded, while the model-family half
  is inferred from the id string. Replacing that vocabulary requires a separate
  ruled design decision rather than silently expanding this rework.

### Rev2 inventory and environment tail

Rev2 added/changed only:

- `apps/v2-ui/lib/makerIdentity.ts`
- `apps/v2-ui/components/ModelPresentation.tsx`
- `apps/v2-ui/app/globals.css`
- `apps/v2-ui/lib/models.ts` (type-only non-null assertions)
- `tests/support/v2uiFixtures.ts`
- `tests/unit/v2ui-data-layer.test.ts`
- `tests/unit/v2ui-pages.test.ts`
- the UI-02c progress log and this handoff

HYG-01 disabled the former scattered `*.source-test.mjs` files and installed
the explicit Node manifest before rev2. Rev2 re-baselined after that work and
added its render mutation ratchet to enforced root Vitest, not to a disabled or
unmanifested `.mjs` file. Stack restart and live browser verification remain
orchestrator-owned per the goal packet.

Comments read through: `2026-08-12 20:17` Codex `REWORK ACKNOWLEDGED` (latest
ticket comment at the final pre-handoff scan pending below).
