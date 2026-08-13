# UI-02d Codex handoff — exact maker identity and terminal surface pins

Ticket: `t_94ac4a9d` · worker session: `019ffa6b-23b6-7c80-83cd-970beddc4385` · run: `78`

Disposition: `READY FOR PEER REVIEW - UI-02d`. Working tree only; no commit, push, merge, branch/worktree mutation, service restart, destructive operation, provider call, or product-data write was performed.

## Delivered

1. **DR-165(2), exact recorded model id.** `makerIdentityLabel` remains the single text-composition seam and now renders house + friendly family + the verbatim recorded `model_id`, for example `OpenAI · GPT · gpt-5.6-sol`. It does not infer or rewrite the recorded id. Unknown-family ids are not duplicated when the friendly family is byte-identical to the id.
2. **Six remaining maker surfaces pinned.** The enforced render suite invokes the real tree, thread, outline, split, map, and drawer components and requires the recorded house/family/id text plus `data-maker`. The source floor pins all eight `maker` call sites: tree 1, thread 1, outline 1, split 2, map 1, drawer 2.
3. **Render ratchet scoped per function.** The existing `ModelPresentation.tsx` ratchet now isolates the `ModelMetaLine` and `ModelBadge` function bodies and requires exactly one seam call and exactly one `{label.text}` render in each. Moving the badge render into the meta-line function no longer satisfies the test.
4. **Accessible typed absence.** Both shared absence pills retain visible `House unavailable`, their explanatory title, suppressed identity styling/dot, and now expose the same explanation through `aria-label`.
5. **Vitest collection is explicit.** `tests/render/ui02d-model-identity.test.tsx` is included by the enforced root config and all seven tests are enumerated by `vitest list`.

Typed absence is unchanged at the domain seam: `maker === null` still returns exactly `{ text: "House unavailable", absence: true }`. The frozen V3 score formatter and NUL ratchets were not edited.

## TDD RED → GREEN

RED after adding the enforced render/source tests, before production edits:

```text
$ pnpm vitest run tests/render/ui02d-model-identity.test.tsx tests/unit/v2ui-pages.test.ts --reporter=verbose
Test Files  2 failed (2)
Tests       8 failed | 43 passed (51)

Six rendered surfaces received `OpenAI · GPT` instead of
`OpenAI · GPT · gpt-5.6-sol`.
The shared absence render and source pin found no aria-label.
```

GREEN after the smallest product changes, including the existing pure seam test:

```text
$ pnpm vitest run tests/render/ui02d-model-identity.test.tsx tests/unit/v2ui-pages.test.ts tests/unit/v2ui-data-layer.test.ts --reporter=dot --silent
Test Files  3 passed (3)
Tests       100 passed (100)
Duration    571ms
```

## Mutation proof

Every mutation was applied alone in the shared worker tree, its focused command was run, and the original bytes were restored before the next mutation (DR-163/DR-163-A serialization).

| Mutation | Killing assertion / observed RED |
|---|---|
| Remove exact `modelId` from `makerIdentityLabel` composition | Real-render test: 6 failed / 1 passed; every surface received `OpenAI · GPT` instead of `OpenAI · GPT · gpt-5.6-sol`. |
| Drop `maker={node.maker}` from tree | Named tree render failed and the six-surface/8-call-site source test failed: 2 failed. |
| Drop `maker={node.maker}` from thread | Named thread render failed and source floor failed: 2 failed. |
| Drop `maker={node.maker}` from outline | Named outline render failed and source floor failed: 2 failed. |
| Drop both split maker props | Named focused-card render failed and source count (`2`) failed: 2 failed. |
| Drop map maker prop | Named readout render failed and multiline source pin failed: 2 failed. |
| Drop both drawer maker props | Named drawer render failed and source count (`2`) failed: 2 failed. |
| Transplant badge `{label.text}` into `ModelMetaLine`, leaving two global occurrences | Per-function ratchet failed: `ModelMetaLine ... expected length 1 but got 2`; the former global count would have passed. |
| Remove both absence `aria-label` attributes | Rendered accessible-name assertion and source pin both failed: 2 failed. |

Post-restoration receipt:

```text
$ pnpm vitest run tests/render/ui02d-model-identity.test.tsx tests/unit/v2ui-pages.test.ts tests/unit/v2ui-data-layer.test.ts --reporter=dot --silent
Test Files  3 passed (3)
Tests       100 passed (100)
```

## Collection and required gates — real output

```text
$ pnpm vitest list tests/render/ui02d-model-identity.test.tsx
tests/render/ui02d-model-identity.test.tsx > ... > pins the tree maker prop through the rendered card
tests/render/ui02d-model-identity.test.tsx > ... > pins the thread maker prop through the rendered card
tests/render/ui02d-model-identity.test.tsx > ... > pins the outline maker prop through the rendered card
tests/render/ui02d-model-identity.test.tsx > ... > pins the split maker prop through the rendered focused card
tests/render/ui02d-model-identity.test.tsx > ... > pins the map maker prop through the rendered readout
tests/render/ui02d-model-identity.test.tsx > ... > pins the drawer maker prop through the rendered identity line
tests/render/ui02d-model-identity.test.tsx > ... > keeps typed absence visible and gives both shared pills an accessible name

$ pnpm run typecheck
$ tsc --noEmit
exit 0

$ pnpm --dir apps/v2-ui typecheck
$ tsc --noEmit -p tsconfig.json
exit 0

$ pnpm --dir apps/v2-ui test
V2_UI_NODE_TESTS_DISCOVERED=1
tests 27 · pass 27 · fail 0
exit 0

$ pnpm vitest run tests/unit/v2ui-node-runner.test.ts --reporter=verbose
Test Files  1 passed (1)
Tests       2 passed (2)
exit 0

$ pnpm vitest run --reporter=dot --silent
Test Files  74 passed (74)
Tests       520 passed | 1 skipped (521)
Duration    23.47s
exit 0

$ pnpm vitest run --config acceptance/vitest.config.ts --reporter=dot --silent
Test Files  9 passed (9)
Tests       35 passed (35)
Duration    5.86s
exit 0

$ pnpm vitest run tests/integration/database.test.ts --reporter=dot --silent
Test Files  1 passed (1)
Tests       37 passed (37)
Duration    2.83s
exit 0

$ pnpm run audit:architecture
{ "edgeRowsChecked": 27, "violations": [] }

$ pnpm run audit:source
{ "blocking": [] }

$ pnpm run audit:text-bytes
REPOSITORY_TEXT_CONTROL_BYTES=0

$ pnpm run audit:orphans
[full declared inventory printed]
exit 0

$ git diff --check
[no output]
exit 0
```

The root-provided skeleton gates `tests/render-templates.sh` and `tests/lint-templates.sh` are absent in this checkout, as are the skeleton-specific files noted by prior mission handoffs. No `skeleton/` behavior was changed.

## UI-02d-owned file inventory

- `apps/v2-ui/lib/makerIdentity.ts` — exact-id extension to the existing UI-02c pure seam (the file itself was already untracked shared-tree work before UI-02d).
- `apps/v2-ui/components/ModelPresentation.tsx` — two absence `aria-label` attributes.
- `tests/render/ui02d-model-identity.test.tsx` — enforced real-render behavior for all six surfaces and typed absence.
- `tests/unit/v2ui-pages.test.ts` — per-function ratchet and eight-call-site source floor; unrelated pre-existing UI-01/UI-02c/XREV-01 hunks preserved.
- `docs/missions/2026-08-06-v3-programming/handoffs/UI-02d-progress.log`.
- This handoff.

No production changes were made to the six surface components: their correct existing maker props are now pinned. The heavily dirty shared mission tree contains substantial earlier-ticket work; UI-02d claims only the hunks/files listed above and did not revert or absorb unrelated dirt.

## Completion audit

| Packet requirement | Direct evidence | Verdict |
|---|---|---|
| House + family + verbatim model id | Six real rendered surfaces assert `OpenAI · GPT · gpt-5.6-sol`; exact-id removal makes all six RED | proven |
| Six surfaces / eight call sites pinned | Six named render tests plus source counts 1/1/1/2/1/2; each surface mutation independently RED | proven |
| Ratchet scoped per function | Function-region assertions; adversarial transplant RED | proven |
| Absence aria-label, typed absence unchanged | Real shared-component render requires two accessible labels and two visible absence texts; existing pure absence equality test remains green | proven |
| Vitest collection | `vitest list` enumerates all seven new render tests | proven |
| Every gate + durable artifacts | Outputs above; progress log and this handoff exist | proven |

No deferred implementation item and no question for V.

Comments read through: `2026-08-13 12:22` Codex resumed `WORKER CLAIM` (latest comment at the final pre-handoff scan).
