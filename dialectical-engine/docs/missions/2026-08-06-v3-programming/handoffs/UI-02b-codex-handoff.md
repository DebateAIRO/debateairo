# UI-02b Codex handoff — per-node maker attribution

Ticket: `t_35a2b742` · worker: Codex GPT-5.6 Sol · session: `019ff472-4d9c-7bd1-9bb9-a345f3f32984`

Disposition: `READY FOR PEER REVIEW — UI-02b`. Working tree only; no commit, push, branch, reset, merge, service restart, production build, or product-data write was performed.

## Delivered

1. `NodeSchema` now requires `maker_lineage`, either a strict recorded identity (`maker`, `model_id`, nullable `model_version`, `provider`, `provider_ref`) or explicit `null`.
2. `ServeRepository.readNodesForRun` left-joins `ledger.raw_artifact` on the node's recorded `provenance_ref`. `projectNodeMakerLineage` relays a complete identity exactly and returns `null` if any required join member is unresolved. It never guesses from the model-id string.
3. The V3 adapter populates the existing `node.active_generation.model_id` surface with a model-id-only `GenerationPresentation`. `active_generation_id` remains null and no `role`, `argument`, `worker_id`, `created_at`, or placeholder value is invented. The neutral question/root and unresolved nodes remain null.
4. V2's existing `ModelBadge`, `ModelMetaLine`, colour, canvas, tree, thread, split, map, and outline presentation code is unchanged.

## Contract-boundary choice and cost

I chose an additive node field rather than a dedicated inspection resource. Maker identity belongs to the same node/provenance aggregate, is needed by every existing card view, and therefore should travel on the answer/node reads already made by the browser; a separate resource would add a second fetch, ownership path, cache seam, and partial-loading state for no new domain boundary.

- Generated types: `Node` remains inferred from the single Zod contract (AC-59); no hand-maintained wire mirror was added. `generate:contract` was run. Its ignored field inventory now includes `maker_lineage`; no tracked generated file changed.
- Architecture dependency table: no package edge changed; the 27-row audit remains green.
- Orphan audit: no declaration row is needed because `projectNodeMakerLineage` has a production caller in `readNodesForRun`; the orphan audit exits green.
- Migration: none. `ledger.raw_artifact` already stores every projected field and `core.node.provenance_ref` already carries the artifact reference.

## TDD RED → GREEN

Initial RED, before contract/serve/adapter implementation:

```text
$ pnpm vitest run tests/unit/contract.test.ts tests/unit/v2ui-data-layer.test.ts
Test Files  2 failed (2)
Tests       1 failed | 4 passed (5)
ZodError: Unrecognized key: "maker_lineage"
```

Initial GREEN:

```text
$ pnpm vitest run tests/unit/contract.test.ts tests/unit/v2ui-data-layer.test.ts
Test Files  2 passed (2)
Tests       49 passed (49)
```

Typed-absence RED before the resolver existed:

```text
$ pnpm vitest run tests/unit/s14-ui.test.ts
Test Files  1 failed (1)
Tests       1 failed | 13 passed (14)
TypeError: projectNodeMakerLineage is not a function
```

Typed-absence GREEN after the smallest resolver and production attachment:

```text
$ pnpm vitest run tests/unit/s14-ui.test.ts tests/unit/contract.test.ts tests/unit/v2ui-data-layer.test.ts
Test Files  3 passed (3)
Tests       63 passed (63)
```

The first real-PostgreSQL run also correctly falsified my test fixture's assumption that `model_version` would be null: the gateway had actually recorded `test-layer/model`. The expectation was corrected to the real persisted value; production code was not weakened.

## Required gates — exact output

Root TypeScript and V2 TypeScript, rerun after the final code change:

```text
$ npx tsc --noEmit
[no output]
exit 0

$ pnpm --dir apps/v2-ui typecheck
$ tsc --noEmit -p tsconfig.json
exit 0
```

Root Vitest, including real embedded PostgreSQL:

```text
$ npx vitest run --reporter=dot --silent
Test Files  60 passed (60)
Tests       418 passed (418)
Duration    20.92s
exit 0
```

Acceptance Vitest:

```text
$ npx vitest run --config acceptance/vitest.config.ts --reporter=dot --silent
Test Files  9 passed (9)
Tests       34 passed (34)
Duration    6.70s
exit 0
```

Focused real-PostgreSQL serve path:

```text
$ pnpm vitest run tests/integration/database.test.ts
Test Files  1 passed (1)
Tests       29 passed (29)
Duration    2.74s
exit 0
```

Audits and diff hygiene:

```text
$ npx tsx tools/orphan-audit/src/cli.ts architecture
{ "edgeRowsChecked": 27, "violations": [] }

$ npx tsx tools/orphan-audit/src/cli.ts source
{ "blocking": [] }

$ npx tsx tools/orphan-audit/src/cli.ts orphans
[full declared inventory printed]
exit 0

$ git diff --check
[no output]
exit 0
```

## Real product-data proof

The standing stack was kept up and untouched. Because its API process predates this edit and is not watch-reloading, I ran the current serve repository and adapter read-only against the same standing PostgreSQL database. The latest real two-maker debate produced:

```json
{
  "run_id": "c19d2eea-8caf-41a4-ad1e-e424bad127ae",
  "answer_id": "f32937a9-e9aa-411d-b3d9-a345cd4f1b61",
  "nodes": [
    {
      "node_id": "5332a6f0-aafa-438c-8a96-d873148326ea",
      "maker_lineage": {
        "maker": "OpenAI",
        "model_id": "gpt-5.6-sol",
        "model_version": "gpt-5.6-sol",
        "provider": "openai-compatible-http",
        "provider_ref": "acceptance:codex-cli"
      }
    },
    {
      "node_id": "6e71e13a-513f-44ce-8a3b-34e0e8f40343",
      "maker_lineage": {
        "maker": "Anthropic",
        "model_id": "claude-opus-5",
        "model_version": "claude-opus-5",
        "provider": "openai-compatible-http",
        "provider_ref": "acceptance:claude-cli"
      }
    }
  ]
}
```

Those actual adapter-projected card model ids were rendered through the unchanged V2 `ModelBadge` component:

```text
<span class="badge modelBadge" ... data-model-id="gpt-5.6-sol" ...>gpt-5.6-sol</span>
<span class="badge modelBadge" ... data-model-id="claude-opus-5" ...>claude-opus-5</span>
```

This proves the position and counter-position visibly carry their distinct recorded makers. No raw provider payload or private data was read or printed.

## File inventory and dirty-tree attribution

UI-02b-owned edits:

- `packages/contract/src/index.ts`
- `packages/serve/src/index.ts`
- `apps/v2-ui/lib/types.ts`
- UI-02b hunk only in `apps/v2-ui/lib/v3/adapter.ts` (the score formatter and model-ledger-key hunks are pre-existing UI-02a work)
- `tests/integration/database.test.ts`
- `tests/support/v2uiFixtures.ts`
- `tests/unit/contract.test.ts`
- UI-02b resolver/fixture hunks only in `tests/unit/s14-ui.test.ts` and `tests/unit/v2ui-data-layer.test.ts` (score tests are pre-existing UI-02a work)
- `docs/missions/2026-08-06-v3-programming/handoffs/UI-02b-progress.log`
- `docs/missions/2026-08-06-v3-programming/handoffs/UI-02b-codex-handoff.md`

Pre-existing UI-02a edits in `DebateCanvas.tsx`, `NodeDetailDrawer.tsx`, `v2ui-pages.test.ts`, the score-related portions of `adapter.ts` / `v2ui-data-layer.test.ts`, dev-server `.next-dev` files, ledger/goal/review artifacts, and all other unrelated dirt were left untouched and are not claimed here.

## Environment tail and acknowledged deferrals

- No production `next build` was run; `.next-dev` stayed owned by the running dev server.
- The optional package command `pnpm --dir apps/v2-ui test` is currently broken before test discovery because `apps/v2-ui/scripts/run-node-tests.mjs` does not exist. This is pre-existing package-script drift and is not one of the packet's gates. V2 typecheck, both required Vitest suites, focused DB coverage, and the live render proof are green.
- The long-lived API/UI process must be restarted by its owner before an ordinary browser request sees the new contract; this worker did not violate the packet's “full stack must stay up” constraint. The read-only current-code proof above covers the same real database without a restart.

## Questions for V

None. No new label, identifier, normalization, number, architecture expansion, or important operation is requested.

Comments read through: `2026-08-12 08:30` Codex `WORKER CLAIM` (latest ticket comment at final scan).
