# UI-02e Codex handoff — real DebateCanvas rendered-behaviour pin

Ticket: `t_c75654bd` · worker session: `019ffafa-c547-7691-8337-29b3e6bef875` · run: `80`

Disposition: `READY FOR PEER REVIEW — UI-02e`. Tests only. No final product-code change, commit, push, merge, branch/worktree mutation, service restart, provider call, or product-data write was performed.

## Delivered

- `tests/render/ui02e-debate-canvas.test.tsx` renders the real `DebateCanvas` through `react-dom/server` under the enforced root Vitest render layer.
- One contract-valid answer fixture exercises the contentful maker call site, a deliberately empty card exercises the empty-state maker call site, and a typed-absence card exercises missing maker and missing V3 score records.
- Rendered assertions pin exactly two `OpenAI · GPT · gpt-5` identities and two `data-maker="OpenAI"` attributes, `BASE 62%`, `FINAL 41%`, both V3 score data attributes, two distinct maker-absence pills on the absence card, and the visible/explanatory `NO SCORE` pill.
- Production files were mutated only transiently and serially for RED evidence, then restored byte-for-behaviour before the final GREEN gates.

## TDD and mutation ledger

The protected behavior already existed, so this tests-only slice establishes RED by applying each named production mutation alone after authoring the test, running the focused test, and restoring before the next mutation.

| Mutation | Assertion that killed it | Observed RED |
|---|---|---|
| Remove `maker={node.maker}` from the empty-state call site | Exactly two rendered identity strings and two `data-maker` attributes | maker test failed: expected 2, received 1; 1 failed / 2 passed |
| Remove `maker={node.maker}` from the contentful-card call site | Same two-call-site cardinality assertion | maker test failed: expected 2, received 1; 1 failed / 2 passed |
| Delete the `V3ScoreBadges` JSX render site | Rendered `BASE 62%`, `FINAL 41%`, and both `data-v3-score` attributes | score test and typed-score-absence test failed; 2 failed / 1 passed |
| Suppress `ModelMetaLine` when the contentful card's maker is `null` | Typed-absence card must contain two `House unavailable` pills (author plus reviewer) | absence test failed: expected 2, received 1; 1 failed / 2 passed |
| Return `null` from the `V3ScoreBadges` ABSENT branch | Typed-absence card must contain `NO SCORE` and its recorded explanation | absence test failed on missing `NO SCORE`; 1 failed / 2 passed |

Post-restoration focused GREEN:

```text
$ npx vitest run tests/render/ui02e-debate-canvas.test.tsx --reporter=verbose
Test Files  1 passed (1)
Tests       3 passed (3)
Duration    293ms
exit 0
```

## Vitest collection proof

```text
$ npx vitest list tests/render/ui02e-debate-canvas.test.tsx
tests/render/ui02e-debate-canvas.test.tsx > UI-02e renders the real DebateCanvas gate surface > pins maker identity at both the empty-state and contentful-card call sites
tests/render/ui02e-debate-canvas.test.tsx > UI-02e renders the real DebateCanvas gate surface > pins V3 score badges as rendered percentage text
tests/render/ui02e-debate-canvas.test.tsx > UI-02e renders the real DebateCanvas gate surface > keeps typed maker and score absence visible instead of collapsing to silence
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

$ pnpm --dir apps/v2-ui test
V2_UI_NODE_TESTS_DISCOVERED=1
tests 27 · pass 27 · fail 0
exit 0

$ pnpm vitest run tests/unit/v2ui-node-runner.test.ts --reporter=verbose
Test Files  1 passed (1)
Tests       2 passed (2)
exit 0

$ pnpm vitest run tests/render --reporter=dot --silent
Test Files  4 passed (4)
Tests       30 passed | 1 skipped (31)
Duration    1.13s
exit 0

$ pnpm vitest run --reporter=dot --silent
Test Files  75 passed (75)
Tests       525 passed | 1 skipped (526)
Duration    25.85s
exit 0

$ pnpm vitest run --config acceptance/vitest.config.ts --reporter=dot --silent
Test Files  9 passed (9)
Tests       35 passed (35)
Duration    6.45s
exit 0

$ pnpm vitest run tests/integration/database.test.ts --reporter=dot --silent
Test Files  1 passed (1)
Tests       37 passed (37)
Duration    3.20s
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

The root skeleton gates named by the parent `AGENTS.md` are absent in this checkout, as documented by the preceding UI lane; no `skeleton/` file or target-project behavior was changed.

## File inventory and scope attribution

- `tests/render/ui02e-debate-canvas.test.tsx` — UI-02e's only executable change.
- `docs/missions/2026-08-06-v3-programming/handoffs/UI-02e-progress.log` — required major-step log.
- `docs/missions/2026-08-06-v3-programming/handoffs/UI-02e-codex-handoff.md` — this evidence handoff.

The shared mission tree was heavily dirty before claim. Existing product changes, disabled legacy `.mjs` files, mission artifacts, and other test files belong to earlier lanes and were neither reverted nor claimed. The final `DebateCanvas.tsx` behavior is restored: both maker conditions use `node.maker !== undefined`, both maker props are present, the `V3ScoreBadges` render site is present, and its ABSENT branch renders the unavailable pill.

No deferral and no question for V.

Comments read through: Codex `WORKER CLAIM` comment at `2026-08-13 14:57` (the only ticket comment at the final pre-handoff scan).
