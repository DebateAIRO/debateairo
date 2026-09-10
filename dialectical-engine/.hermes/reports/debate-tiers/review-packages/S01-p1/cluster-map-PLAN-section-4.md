## 4. Clusters — BUILD units, one verification command each

One command per cluster, run three times, worst run wins. The review unit is the whole slice at
`REV(S01)`, never a cluster. Every command below was **RUN at base by `ARCH(S01)`** from a `.sh`
file in the S01 lane; the base verdict column records what it did.

Each command follows the capture-first idiom (`TOOLING-TRAPS` §"A guard that steals the exit
status") and runs **one path per `vitest` invocation**, so a missing or renamed file reports
`No test files found` loudly instead of being silently dropped from a multi-path filter
(§"A multi-path `vitest run` SILENTLY DROPS paths that do not exist"). `PT` is a `suite:expected-passed:expected-failed`
triple, so each suite asserts its own delta rather than a pooled total. Run from
`/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/tiers-s01/dialectical-engine`
— the level holding `package.json`, one below the worktree root (`TOOLING-TRAPS` §"The worktree root
is NOT the project root here").

**The shared runner**, written once into the seat's own `.sh` file and reused by C1–C4:

```sh
run_suites() { ok=1; for p in "$@"; do f=${p%%:*}; r=${p#*:}; xp=${r%%:*}; xf=${r##*:};
  o=$(pnpm exec vitest run "$f" 2>&1); rc=$?;
  s=$(printf '%s\n' "$o" | grep -E '^[[:space:]]*Tests[[:space:]]+' | tail -1);
  if printf '%s\n' "$o" | grep -q 'No test files found' || [ -z "$s" ]; then
    echo "BROKEN $f (no summary line)"; ok=0; continue; fi
  ap=$(printf '%s' "$s" | sed -n 's/.*[^0-9]\([0-9][0-9]*\) passed.*/\1/p'); ap=${ap:-0};
  af=$(printf '%s' "$s" | sed -n 's/.*[^0-9]\([0-9][0-9]*\) failed.*/\1/p'); af=${af:-0};
  echo "$f rc=$rc passed=$ap failed=$af (expect $xp/$xf)";
  [ "$ap" = "$xp" ] && [ "$af" = "$xf" ] || ok=0; done;
  [ $ok -eq 1 ] && echo CLUSTER_GREEN || echo CLUSTER_RED; }
```

`No test files found` is classified BROKEN, never RED (`TOOLING-TRAPS` §"zsh + vitest"). The
expected pair is asserted for **both** numbers, so a suite that gains a passing case while losing
another cannot slip through on a pooled count.

> **`ap=${ap:-0}` and the empty-summary arm are not decoration — they are a defect this node
> shipped and then caught.** The first version of this runner defaulted only `af`. Run at base it
> printed, verbatim:
>
> ```
> tests/architecture/sup-04-mounts.test.ts rc=1 passed= failed=2 (expect 0/2)
> CLUSTER_RED
> ```
>
> because vitest prints `Tests  2 failed (2)` — with **no `passed` field at all** — for a suite where
> nothing passes. `sup-04-mounts` is 0/2 at base and stays 0/2, so cluster C3's command would have
> reported RED forever, on a correct tree, for a fault in the command. That is
> `TOOLING-TRAPS` §"Do not let the gate condemn the fix it mandates". The `[ -z "$s" ]` arm is
> paired with the default so the default cannot rescue an unrun suite into a `0/0` pass.
> Both versions were run against six inputs — a 0-passing suite at its true pair, an all-passing
> suite, a mixed suite, a 0-passing suite at a wrong pair, a green suite at a wrong pair, and a
> nonexistent path — and v2 answers all six correctly.

| Cluster | Steps | What it builds | Verification command (one) | Base verdict, run by `ARCH(S01)` | Depends on |
|---|---|---|---|---|---|
| **S01-C1** | S01-1 … S01-11 | `plan_tier` on the ask, the two tier rosters, the 13 ask literals, the API 202/400 cases | `g=$(pnpm run generate:contract 2>&1); grc=$?; [ $grc -eq 0 ] && run_suites tests/unit/contract.test.ts:8:0 tests/unit/api.test.ts:25:0 tests/unit/load01-live-proof.test.ts:1:0 tests/unit/s7-authorization.test.ts:31:0 tests/integration/evaluator-database.test.ts:21:0 tests/architecture/tier01-roster.test.ts:1:0 tests/architecture/s7-authorization-contract.test.ts:5:1 tests/architecture/s8-publication-contract.test.ts:4:1` | **GREEN at the pre-C1 expectations.** `generate:contract` rc=0. Measured at base: `contract` 7/7, `api` 24/24, `load01-live-proof` 1/1, `s7-authorization` 31/31, `evaluator-database` 21/21, `s7-authorization-contract` 5 passed \| 1 failed (6), `s8-publication-contract` 4 passed \| 1 failed (5). `tests/architecture/tier01-roster.test.ts` **does not exist at base** — the path was omitted from the base run and its first run is S01-1's RED. The expected pairs in the command are the POST-cluster values (contract 7→8, api 24→25, roster 0→1); at base the command reports `CLUSTER_RED` on exactly those three rows, which is the TDD-RED this cluster starts from. | — |
| **S01-C2** | S01-12 … S01-19 | the builder's tier and provenance, the `createDebate` guard, the two sub-class B literals | `run_suites tests/unit/tier01-ask-wire.test.ts:3:0 tests/unit/v2ui-data-layer.test.ts:57:0 tests/unit/pol01-policy.test.ts:8:0 tests/architecture/s14-contract.test.ts:2:3 tests/render/prov01-honesty-drawer.test.tsx:1:0 tests/render/bug02-debate-effects.test.tsx:4:0 tests/render/evaluator-dev-menu-controls.test.tsx:1:0 tests/unit/s10-erasure-ui.test.ts:3:0 tests/unit/v2ui-ownership.test.ts:3:0` | **GREEN at base for every existing path.** Measured: `v2ui-data-layer` 57/57, `pol01-policy` 8/8, `s14-contract` 2 passed \| 3 failed (5), `prov01-honesty-drawer` 1/1, `bug02-debate-effects` 4/4, `evaluator-dev-menu-controls` 1/1, `s10-erasure-ui` 3/3, `v2ui-ownership` 3/3. `tests/unit/tier01-ask-wire.test.ts` does not exist at base; its first run is S01-12's RED. | C1 |
| **S01-C3** | S01-20 … S01-39 | the selector, the fourteen locks, the Premium unlock, the repaired region guard | `run_suites tests/render/tier01-new-plan-tier.test.tsx:20:0 tests/unit/v2ui-pages.test.ts:36:5 tests/render/ux01-new-debate-form.test.tsx:1:7 tests/render/sup-04-widget.test.tsx:8:0 tests/architecture/sup-04-mounts.test.ts:0:2 tests/unit/evaluator-dev-menu-ui.test.ts:2:0` | **GREEN at base for every existing path.** Measured: `v2ui-pages` 36 passed \| 5 failed (41), `ux01` 1 passed \| 7 failed (8), `sup-04-widget` 8/8, `sup-04-mounts` 0 passed \| 2 failed (2), `evaluator-dev-menu-ui` 2/2. `tests/render/tier01-new-plan-tier.test.tsx` does not exist at base; its first run is S01-20's RED. The `20` is the case count S01-20…S01-39 write and is restated by the seat if a step lands more. | C2, `DONE.md` |
| **S01-C4** | S01-40 … S01-43 | the selector's rules, the disabled treatment of the four locked control families, any token `DONE.md` fixes | `run_suites tests/unit/tier01-style-contract.test.ts:1:0 tests/unit/t9-mode-tokens.test.ts:7:2 tests/render/consent-bar.test.tsx:7:0 tests/unit/consent-s02-style-contract.test.ts:10:0 tests/render/consent-card.test.tsx:11:0 tests/render/consent-cross-slice.test.tsx:7:0 tests/render/consent-guards.test.tsx:7:0 tests/render/consent-policy-link.test.tsx:14:0 tests/render/t3-library.test.tsx:11:4 tests/architecture/role-token-map.test.ts:46:3 tests/unit/pda-s03-keyboard-accessibility.test.ts:3:2` | **GREEN at base for every existing path.** Measured: `t9-mode-tokens` 7 passed \| 2 failed (9), `consent-bar` 7/7, `consent-s02-style-contract` 10/10, `consent-card` 11/11, `consent-cross-slice` 7/7, `consent-guards` 7/7, `consent-policy-link` 14/14, `t3-library` 11 passed \| 4 failed (15), `role-token-map` 46 passed \| 3 failed (49), `pda-s03-keyboard-accessibility` 3 passed \| 2 failed (5). `tests/unit/tier01-style-contract.test.ts` does not exist at base. | `DONE.md`; parallel with C3 |
| **S01-C5** | S01-44 … S01-46 | the `DONE.md` measurements | **filled after V writes `DONE.md`** — one assertion per `DONE.md` line, added to the C3 and C4 suites, then C3's and C4's commands re-run with their pair counts restated | not runnable at base: `DONE.md` does not exist yet | C3, C4, V |

### Gating


---
## Commits per cluster (`git log 7f89f7b7..f6c147cc`, oldest first)

```
f6c147cc 2026-09-10 03:09 feat(tiers S01-C5): map done measurements
e57624a8 2026-09-10 02:31 feat(tiers S01-C3): add plan tier selector and locks
5e3e4bcf 2026-09-10 02:10 feat(tiers S01-C4): style plan tier selector and locks
b866191f 2026-09-10 01:23 feat(tiers S01-C2): wire plan tier into asks
7658e997 2026-09-10 00:50 feat(tiers S01-C1): add plan tier ask contract
```

## The shared class vocabulary (orchestrator ruling, `slices/S01/DECISIONS.md`)

- **Shared class vocabulary for C3 ∥ C4 (orchestrator ruling, the interface between two concurrent nodes):** the page renders and the stylesheet styles the SAME names — `.ndTier` (the `role="radiogroup"` grid, DONE.md M1) · `.ndTierOption` (each `role="radio"` button; chosen = `[aria-checked="true"]`, M2/M3) · `.ndTierName` (the pill, M4/M5) · `.ndTierPromise` (M6) · `.ndTierModels` (the wrapping row) and `.ndTierModel` (one id, M7) · the existing `.modelDot` for the 7px identity dot (its colour by the id's family through `modelKey`, `apps/ui/lib/models.ts`). The locks: `.ndSegItem:disabled`, `.ndSlider:disabled`, `.ndSteerInput:disabled`, `.ndSelect:has(select:disabled)` (MOCK F1 — no page-side hook needed). Cost if wrong: one rename in one file at REV(S01).

## The `modelColor` domain fold (`slices/S01/DECISIONS.md`, F2 of BUILD-S01-C3)

- **F2 (BUILD-S01-C3).** `modelColor(identity)` (`apps/ui/components/ModelPresentation.tsx:5-18`) switches on a MAKER identity (`anthropic`, `openai`, `xai`, …), not on a model id; my class-vocabulary ruling said `modelColor(id)`. The built page maps id → maker locally (`page.tsx:65-70`, `modelIdentity`) and pins each `--dot` in the render suite. `apps/ui/lib/models.ts` already carries id → family (`modelKey`) and the dot colour (`modelMeta(modelId).dot`, what `ModelMetaLine` uses). **REV(S01) probe (correctness lens):** whether the local adapter duplicates `modelMeta` and should read `modelMeta(modelId).dot` instead — a finding for the review, not a change here.
