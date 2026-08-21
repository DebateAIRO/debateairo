# UI-01 rework rev4 — Codex handoff

Disposition: `REWORK READY FOR HERMES REVIEW - UI-01 rework rev4`. Ticket `t_5f35d086`, Codex run 67 / goal `019ff552-cb5b-7a00-bd59-1428e42c9d87`. Working tree only; git remains V-gated.

Comments read through before verification: same-session rev3 handoff at `2026-08-12 14:47` and rev4 acknowledgement at `2026-08-12 15:19`. Input read in full: `ui01-rework-opus-rev3.md`. Its live lens closes B4 and its library mutations close B5; rev4 changes tests and handoff evidence only.

## Outcome

- **B1 closed:** the compact scoring branch used by V3 now mounts `AdaptiveDepthDryRunPanel`. Its unavailable state contains the visible `Approve selected expansions` control with `disabled`, `aria-disabled="true"`, the truthful `V3_MISSING_CAPABILITIES.adaptiveDepthApproval` tooltip, and the same capability reason as visible copy.
- **B2 closed:** load-bearing assertions now live in enforced `tests/unit/v2ui-pages.test.ts` and inspect render/button use sites. The exact Opus mutations MUT-A, MUT-B, and MUT-C are killed; disabled assertions now also pin feedback, adaptive approval, and settings save at their button blocks.
- **B4 closed in code and enforced tests:** the phone block again hides `.debateInlineActions` and shows `.debateOverflow`. The content-aware path now measures each item's intrinsic `scrollWidth` (with rect fallback), not its post-shrink rectangle, and computes the complete identity/control need before comparing it with `header.clientWidth`.
- **B5 closed:** the enforced suite exercises the production measurement and observation adapters. Each of Opus's four mutations was applied separately and made the suite RED; exact baseline expressions/wiring were then restored and the suite returned to 38/38.
- **B6 closed:** four enforced source assertions pin the `DebatePageClient.tsx` wiring seam: real `header.clientWidth`, intrinsic title input, `fit.collapse` state propagation, and `measureHeaderFit` as the observer callback. Each exact Opus call-site mutation now produces 1 failed / 37 passed.
- **Verified canvas render preserved:** rev3 does not edit `DebateCanvas.tsx`, its viewport, V3 badge render site, maker metadata line, or node markup.

## Exact mutation killers

| Mutation | New enforced assertion | Why it fails |
|---|---|---|
| MUT-A: delete `<V3ScoreBadges>` JSX | Slices the contentful `.nodeHeader` and requires `<V3ScoreBadges` with `presentation={v3Scores}` | A declaration/computation left elsewhere cannot satisfy the render-site check |
| MUT-B: re-enable Regenerate while keeping tooltip | Extracts every rendered Regenerate `<button>` and requires `disabled`, `aria-disabled="true"`, capability title, and no `onClick` | Retaining only the truthful title no longer keeps the test green |
| MUT-C: delete maker meta line | Slices the contentful `.nodeHeader` and requires the conditional `metaLine` containing `modelDot` and `{model.name}` | The empty-state `{model.name}` occurrence cannot satisfy this branch-local check |
| Predicate boundary (supporting assertion only) | Executes `shouldCollapseDebateHeaderActions` for needed `526` versus available `34`, `159`, and `526` | Pins the ruled comparison, but is explicitly not presented as the DR-160 measurement/wiring ratchet |
| B1 unmount: remove compact adaptive panel | Slices the compact scoring branch and requires the enabled panel mount; separately pins the unavailable button block | A dead component definition cannot satisfy the reachable-branch check |
| B5 library MUT-E: `neededWidth = 0 * (...)` | Calls `measureDebateHeaderCollapse` with synthetic intrinsic action-row geometry and requires the exact `{ neededWidth: 628, availableWidth: 420, collapse: true }` result | The library-site mutant returned needed `0`, expanded; 2 assertions failed |
| B5 library MUT-G: title intrinsic width multiplied by zero | Calls the measurement adapter with an 880px title at 1280px and requires collapse | The library-site mutant returned expanded; the crowded-title assertion failed |
| B5 library MUT-F: always collapse | Calls the same adapter with a normal 193px title at 1280px and requires expansion | The library-site mutant returned collapsed; the normal-title assertion failed |
| B5 library MUT-H: observer targets and resize listener removed | Invokes `observeDebateHeaderFit` with fakes and requires all three targets observed, a callable resize listener, and cleanup | The library-site mutant observed no targets; the wiring assertion failed |
| B6 wiring W1: `availableWidth: 1e9` | Requires `availableWidth: header.clientWidth,` in the production measurement call | The call-site mutant fails the named source assertion: 1 failed / 37 passed |
| B6 wiring W2: title input multiplied by zero | Requires `titleIntrinsicWidth: debateHeaderElementIntrinsicWidth(titleMeasure),` | The call-site mutant fails the named source assertion: 1 failed / 37 passed |
| B6 wiring W3: `setHeaderActionsCollapsed(false)` | Requires `setHeaderActionsCollapsed(fit.collapse);` | The call-site mutant fails the named source assertion: 1 failed / 37 passed |
| B6 wiring W4: `measure: () => {}` | Requires `measure: measureHeaderFit` in the production observer call | The call-site mutant fails the named source assertion: 1 failed / 37 passed |

In-memory mutation probe output from this session:

```text
MUT-A delete V3ScoreBadges render: baseline=true mutant=false => KILLED
MUT-B re-enable Regenerate, keep tooltip: baseline=true mutant=false => KILLED
MUT-C delete maker meta line: baseline=true mutant=false => KILLED
B1 unmount compact adaptive panel: baseline=true mutant=false => KILLED
MUT-E neededWidth x0: 2 failed / 36 passed => KILLED
MUT-G title width x0: 1 failed / 37 passed => KILLED
MUT-F always collapse: 2 failed / 36 passed => KILLED
MUT-H observers/listener removed: 1 failed / 37 passed => KILLED
B6-W1 availableWidth=1e9 at call site: 1 failed / 37 passed => KILLED
B6-W2 titleIntrinsicWidth x0 at call site: 1 failed / 37 passed => KILLED
B6-W3 setHeaderActionsCollapsed(false): 1 failed / 37 passed => KILLED
B6-W4 observer measure no-op: 1 failed / 37 passed => KILLED
```

## Advisories

- **A3 folded:** `DebateTree` again limits Regenerate/History chrome to token-bearing, non-abandoned nodes, restores toolbar indentation, and no longer threads the two never-called callbacks. The corresponding dead props were also removed from `ArgumentFocusView`.
- **A4 folded:** removed dead `onRegenNode` threading from `DebateCanvas`; this has no rendered effect.
- **A5 recorded:** `data-node-id` on the canvas `.nodeWrap` is an intentional V3 addition used for node-addressable inspection.
- **A6 folded:** the unavailable adaptive branch visibly prints the real missing capability instead of relying on its tooltip alone.
- **A8 folded:** the compact approval strip uses auto height and wraps at 640px, so the disabled button and capability reason no longer occupy the same line box.
- **A9 folded:** the acceptance table below now states that rev2's phone overflow and DR-160 ratchet claims were false, then separates rev3 code/test proof from unavailable fresh browser proof.
- **A11 folded:** the compact-scoring test region now anchors on the stable `data-scoring-insights-compact` attribute instead of indentation-sensitive JSX whitespace.
- **A13 folded:** renamed the synthetic 628px arithmetic case so it no longer claims to reproduce the real ≤640px DOM, where CSS hides inline actions.
- **A1/A2 recorded for HYG-01 only:** `apps/v2-ui/package.json` still points at the absent `scripts/run-node-tests.mjs`, and dormant `lib/api.test.mjs` remains stale. Per directive, neither was repaired in UI-01. The affected source contracts were still invoked directly below.

## Files changed in rev4

- `tests/unit/v2ui-pages.test.ts` — four named B6 production-wiring assertions and A13 test-name correction.
- progress log and this handoff — rev4 evidence and corrected library-site/call-site claims.

No product or library file changed in rev4. After the mutation probes, `DebatePageClient.tsx` (`4189eb4b…`) and `debateHeaderOverflow.ts` (`4febd48a…`) match the baseline hashes independently recorded by the Opus rev3 lens.

Pre-existing shared-tree changes remain attributed to their original lanes. No unrelated file was reverted or claimed.

## TDD evidence

Rev3 RED, before product implementation:

```text
$ pnpm vitest run tests/unit/v2ui-pages.test.ts --reporter=verbose
Test Files  1 failed (1)
Tests  5 failed | 33 passed (38)

FAIL ... uses DR-160 content-aware overflow instead of a fixed collapse breakpoint
FAIL ... kills B4 shrunk-rect regression and MUT-E neededWidth=0 through intrinsic phone geometry
FAIL ... kills MUT-G title width x0 and MUT-F always-collapse through the measurement path
FAIL ... kills MUT-H observer and resize-listener removal through the observation seam
FAIL ... keeps scoring feedback and adaptive-depth approval visible but disabled without refusal calls
```

The verified MUT-A/B/C and B1 assertions remained green at rev3 RED. The five failures were limited to the new B4/B5/A8 requirements.

Focused GREEN:

```text
$ pnpm vitest run tests/unit/v2ui-pages.test.ts --reporter=dot
Test Files  1 passed (1)
Tests  38 passed (38)
Duration  181ms
```

Rev4 wiring mutation RED, each applied separately to `DebatePageClient.tsx` after the four assertions were added:

```text
B6-W1 availableWidth: 1e9                         1 failed | 37 passed
B6-W2 titleIntrinsicWidth: 0 * intrinsic width    1 failed | 37 passed
B6-W3 setHeaderActionsCollapsed(false)            1 failed | 37 passed
B6-W4 measure: () => {}                           1 failed | 37 passed
```

Rev4 restored baseline, real output:

```text
$ pnpm vitest run tests/unit/v2ui-pages.test.ts --reporter=verbose
Test Files  1 passed (1)
Tests  38 passed (38)
Duration  269ms
```

## Required gates — real output from this session

Root typecheck:

```text
$ npx tsc --noEmit --pretty false
(exit 0; no output)
```

V2 UI typecheck:

```text
$ pnpm --dir apps/v2-ui typecheck
$ tsc --noEmit -p tsconfig.json
(exit 0)
```

Root Vitest, including the enforced UI-01 suite:

```text
$ npx vitest run --reporter=dot --silent
Test Files  63 passed (63)
Tests  459 passed (459)
Duration  22.91s
```

Acceptance Vitest:

```text
$ npx vitest run --config acceptance/vitest.config.ts --reporter=dot --silent
Test Files  9 passed (9)
Tests  35 passed (35)
Duration  7.61s
```

Affected source contracts, run explicitly despite HYG-01's dead package runner:

```text
$ node --test app/debate/headerToolbarResilience.source-test.mjs components/scoringFeedbackControls.source-test.mjs lib/adaptiveDepthDryRun.source-test.mjs
tests 7
pass 7
fail 0
duration_ms 92.754
```

Architecture and source audits:

```text
$ pnpm audit:architecture
{
  "edgeRowsChecked": 27,
  "violations": []
}

$ pnpm audit:source
{
  "blocking": []
}
```

Isolated production build (the standing dev `.next` was not touched):

```text
$ NEXT_DIST_DIR=.next-build pnpm --dir apps/v2-ui build
✓ Compiled successfully in 1982ms
✓ Generating static pages (7/7)
/debate/[id]  38.9 kB  175 kB first load
(exit 0)
```

Next's generated `.next-build` type include/reference edits were removed with `apply_patch`, restoring the pre-build `tsconfig.json` and `next-env.d.ts` content.

Other checks:

```text
adapter NUL bytes: none
git diff --check (UI-01 scope): exit 0, no output
200 http://127.0.0.1:3000/
200 http://127.0.0.1:3000/debate/0b53e130
200 http://127.0.0.1:3000/debate/8d2b4e5a
```

## Corrected acceptance table

| Criterion | What was actually true after rev2 | Rev3 evidence | Status now |
|---|---|---|---|
| Newer canvas and UI-02a/UI-02b survival | Live rendered pixels, badges, maker tags, viewport, and exact merge shape were verified by Opus/orchestrator | Render branches preserved; enforced MUT-A/MUT-C killers added | GREEN; prior visual proof retained |
| Overflow protects the title and actions | **Not green:** long-title collapse worked, but at 640px a normal title left four actions outside the viewport; post-shrink rect measurement could not detect it | Opus rev3 verified the fix live across short/real/long questions and 420–1920px widths; 640px normal case has 6/6 actions reachable and no horizontal scroll | GREEN by live product evidence and enforced tests |
| Dead mutations disabled-not-hidden | **Not green:** Regenerate/feedback/settings were live-disabled, but adaptive approval's only mount was unreachable in V3 | Compact V3 branch mount plus exact disabled button/capability assertions; feedback/settings buttons also pinned | GREEN by reachable source/test/build; fresh browser capture unavailable |
| Ratchets prevent silent render/action regressions | **Partly green:** MUT-A/B/C were killed; B5's library-site MUT-E/G/F/H were later killed, but the same four defects still survived at the `DebatePageClient` wiring seam | B5 library mutants and B6 call-site W1–W4 now each make enforced Vitest RED; restored baseline is 38/38 | GREEN |
| DR-115 truthful absence | Tooltip and refusal-flow removal were source-correct, but A6 left one reason tooltip-only | Adaptive missing capability is now visible copy and tooltip; no refusal/success path | GREEN |
| Adapter control bytes | Zero raw NUL bytes and two-sided enforced ratchet | Byte scan still reports none | GREEN |
| Browser visual proof for rev3 B4/A8 | Opus supplied the live 640px failing evidence | Opus rev3 re-ran the real product and verified B4 across multiple widths/question lengths and A8 with non-overlapping button/reason boxes | GREEN by independent live review |

## Environment tail

- No service was restarted and no production data was written.
- This worker's rev3 browser attempt had no connected instance; Opus rev3 subsequently supplied the missing independent live-DOM proof. Rev4 itself is test-only and makes no new browser claim.
- Do not run a production build into the dev server's `.next`. Continue to use `NEXT_DIST_DIR=.next-build`.
- No commit, push, merge, branch, reset, or board completion was performed.

## Questions for V

None. Title fit remains content-aware; at ≤640px the V2 CSS fallback deliberately hides inline actions and exposes the overflow menu regardless of the measured collapse state.
