# REV(WHOLE) p1 — acceptance-grok-4.6

SKILLS LOADED: `/Users/vladmihaimiron/.claude/plugins/cache/claude-plugins-official/superpowers/6.3.0/skills/using-superpowers/SKILL.md` · `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-protocol/SKILL.md` · `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.grok/skills/heartbeat-protocol/SKILL.md` · `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-reviewer/SKILL.md` · `/Users/vladmihaimiron/.claude/plugins/cache/claude-plugins-official/superpowers/6.3.0/skills/verification-before-completion/SKILL.md` · `/Users/vladmihaimiron/.grok/bundled/skills/long-running-background-tasks/SKILL.md`

- seat: WHOLE-REV-grok-4.6 · node: REV(WHOLE) lens acceptance-grok-4.6 · pass: 1 of 3 · ticket: t_8a444c53 · session: `01a09555-4166-7ef3-8049-ef182c2fb5d7`
- worktree HEAD: `f85cbe8053de4a91563a5b1de5e1ccd9cc3fef82` (detached = `integration/debate-tiers`) · range under review: `24c7e644..f85cbe80`
- freeze pair (cwd-relative): `git diff --stat 27144e77..19b79d18 -- docs/missions/debate-tiers` → `RESUME-HERE.md | 1 +`
- lens verdict: **PASS** (pass 1)
- V line: **YES, ALL AC ARE CORRECT**

## Packet review

Checked the dispatch packet against the board, the worktree, the freeze pair, and the review package.

| Claim | Source | Measured | Verdict |
|---|---|---|---|
| comment cursor at dispatch = 1 | packet §1 | `hermes kanban show t_8a444c53` had exactly the DISPATCHED comment | holds |
| detached HEAD `f85cbe80`, dirty 0 | packet §1 | `git rev-parse HEAD` = `f85cbe80…`; porcelain 0 at CLAIM | holds |
| product range `24c7e644..f85cbe80` = 26 files, 2620/37 | README + `diffstat.txt` | `git diff --stat 24c7e644..f85cbe80 -- apps packages tests migrations` matches | holds |
| freeze `27144e77..19b79d18` is the mission-tree record of this pass | packet §1 | cwd-relative diff is **1 insertion** in `docs/missions/debate-tiers/RESUME-HERE.md`. Packets, folds, and `review-packages/WHOLE` live under `.hermes/`, which that pathspec does not see. | **N1** (orchestrator): the command is the right trap-avoiding spelling and is not empty; the sentence that says the diff *is* the packets/folds/review package overstates what the pathspec contains. Not an AC demand. |
| `:3000=1` others 0 | README listener baseline | `lsof` at CLAIM and at handoff: only `node 77509` on `127.0.0.1:3000` (MAIN tree, not mine) | holds |
| Precondition V-7 not in place | oracle S02 §2 + COMMON §6 | no seat may edit `.local/**`; steps 1–4 and 8–9 of S02 are code-path + suite only | holds |

No packet constant was false in a way that would make a worker build the wrong thing. N1 is folded, not blocking.

## What I re-ran

Runner: `LOG=<abs> zsh .claude/skills/heartbeat-orchestrator/scripts/run-suites.sh` for S01 clusters; S02 cluster commands from `review-packages/S02-p1/cluster-map-PLAN-section-5.md`. Three runs each, 2026-09-12 14:29–14:33 EEST, HEAD `f85cbe80`. Logs: `/private/tmp/debate-tiers-WHOLE-REV-grok-4.6/`.

### S01-C1 (PLAN command; expect `api` 25/0)

`generate:contract` rc=0 × 3. Worst = all three runs identical:

| suite | passed/failed (expect) | dated |
|---|---|---|
| `tests/unit/contract.test.ts` | 8/0 (8/0) | this feature |
| `tests/unit/api.test.ts` | **26/0 (25/0)** | S02 added one case on the integration branch; PLAN's pair is stale. Not a product failure. Causes CLUSTER_RED. |
| `tests/unit/load01-live-proof.test.ts` | 1/0 (1/0) | this feature (one `plan_tier` literal) |
| `tests/unit/s7-authorization.test.ts` | 31/0 (31/0) | |
| `tests/integration/evaluator-database.test.ts` | 21/0 (21/0) | |
| `tests/architecture/tier01-roster.test.ts` | 1/0 (1/0) | this feature |
| `tests/architecture/s7-authorization-contract.test.ts` | 5/1 (5/1) | pre-existing |
| `tests/architecture/s8-publication-contract.test.ts` | 4/1 (4/1) | pre-existing |

Marker × 3: `CLUSTER_RED` solely because `api` 26 ≠ expect 25. README already records 26/0.

### S01-C2 × 3 — `CLUSTER_GREEN`

| suite | passed/failed (expect) | dated |
|---|---|---|
| `tests/unit/tier01-ask-wire.test.ts` | 3/0 (3/0) | this feature |
| `tests/unit/v2ui-data-layer.test.ts` | 57/0 (57/0) | |
| `tests/unit/pol01-policy.test.ts` | 8/0 (8/0) | |
| `tests/architecture/s14-contract.test.ts` | 2/3 (2/3) | pre-existing (same three S14 names as S02-C3) |
| `tests/render/prov01-honesty-drawer.test.tsx` | 1/0 (1/0) | |
| `tests/render/bug02-debate-effects.test.tsx` | 4/0 (4/0) | |
| `tests/render/evaluator-dev-menu-controls.test.tsx` | 1/0 (1/0) | |
| `tests/unit/s10-erasure-ui.test.ts` | 3/0 (3/0) | |
| `tests/unit/v2ui-ownership.test.ts` | 3/0 (3/0) | |

### S01-C3 × 3 — `CLUSTER_RED` (named pre-existing)

| suite | passed/failed (expect) | dated |
|---|---|---|
| `tests/render/tier01-new-plan-tier.test.tsx` | 22/0 (22/0) | this feature |
| `tests/unit/v2ui-pages.test.ts` | 36/5 (36/5) | pre-existing (MUT-A/MUT-C/DR-160/UI-02d/XREV-01; none mention plan tier) |
| `tests/render/ux01-new-debate-form.test.tsx` | 1/7 (1/7) | pre-existing |
| `tests/render/sup-04-widget.test.tsx` | **7/1 (8/0)** | **dev's own** at `24c7e644` without this feature (README). Failure: `expands on Enter, focuses the message control, and follows the Romanian override` (`tests/render/sup-04-widget.test.tsx:91`) |
| `tests/architecture/sup-04-mounts.test.ts` | 0/2 (0/2) | pre-existing |
| `tests/unit/evaluator-dev-menu-ui.test.ts` | 2/0 (2/0) | |

### S01-C4 × 3 — `CLUSTER_GREEN`

| suite | passed/failed (expect) | dated |
|---|---|---|
| `tests/unit/tier01-style-contract.test.ts` | 8/0 (8/0) | this feature |
| `tests/unit/t9-mode-tokens.test.ts` | 7/2 (7/2) | pre-existing |
| consent / t3 / role-token / pda suites | match expect (7/0, 10/0, 11/0, 7/0, 7/0, 14/0, 11/4, 46/3, 3/2) | pre-existing where failed |

### S02 clusters × 3

| cluster | command | worst | dated |
|---|---|---|---|
| S02-C1 | `pnpm exec vitest run tests/integration/tiers-s02-run-plan-tier.test.ts tests/integration/evaluator-database.test.ts` | Test Files 2 passed (2) · Tests 27 passed (27) · rc=0 | this feature + inherited 21 |
| S02-C2 | `… tiers-s02-admission.test.ts tests/unit/api.test.ts tests/integration/evaluator-database.test.ts` | Test Files 3 passed (3) · Tests 61 passed (61) · rc=0 | this feature |
| S02-C3 | `… tiers-s02-rosters.test.ts tests/architecture/s14-contract.test.ts` | Test Files 1 failed \| 1 passed (2) · Tests 3 failed \| 6 passed (9) · rc=1 | the 3 failures are pre-existing `s14-contract` (same names as README) |
| S02-C4 | `… tiers-s02-wire.test.ts load01-live-proof s7-authorization contract` | Test Files 4 passed (4) · Tests 42 passed (42) · rc=0 | this feature |

S02-C3 named failures (all three runs): `uses the generated contract client…` · `FX-ORPH-04 walks web consumers…` · `carries the S04 orphan-audit wording fix…` — pre-existing, not this feature.

### typecheck

With temporary fixtures deleted: `pnpm typecheck` rc=1, **70** `error TS` lines, the same 22 files the package lists (`integrated-f85cbe80/typecheck-files.txt`). No diagnostic in `apps/ui/app/new/**`, `apps/api/src/index.ts`, `packages/contract/src/plan-tiers.ts`, `packages/db/**`, or `migrations/0061_plan_tier_on_run.sql`. R21 / S02-R14 hold.

## Own probes and mutants

Promoted under `.hermes/reports/debate-tiers/probes/WHOLE-REV-grok-4.6-*`. Ran from this worktree; copies in `/private/tmp/debate-tiers-WHOLE-REV-grok-4.6/`.

| property | probe | outcome |
|---|---|---|
| S01 §2 steps 1–12 + R1–R10, R13, R18, M6/M9, SupportWidget still mounts | `tests/render/WHOLE-REV-grok-4.6-s01-ac.test.tsx` (jsdom, own fixtures) | **12/12 passed** (2026-09-12 14:28) |
| S01 R11–R14 wire + `createDebate` guard before network | `tests/unit/WHOLE-REV-grok-4.6-s01-wire.test.ts` | **3/3 passed** |
| S02 R3–R9 + HTTP 422/400/202 | `tests/unit/WHOLE-REV-grok-4.6-s02-admission.test.ts` | **8/8 passed** |
| DONE.md M1–M8, M13, M15 colour/geometry vs `globals.css` `:root` and `html[data-mode="chamber"]` | `css-done-md-probe.mjs` | **PASS** |
| S01 R16 source-shape (submit region, DEPTH_MIN/MAX, ready region) | in-process python over `page.tsx` | all R16 pins present; `planTier` is **not** in `ready` (R18) |
| S01 R11 / S02 R1 uniqueness | grep `apps/` + `packages/` excluding `*.test.*` | roster declaration only in `packages/contract/src/plan-tiers.ts:8-11`. `gpt-5.6-sol` / `claude-opus-5` also appear in `apps/ui/components/landing/cards.ts` as landing copy, **not** as a roster. |
| S02 R2 (no `if` on a tier name selects models) | grep `planTier ===` / `plan_tier` in `apps/` | UI lock/copy only (`page.tsx`); admission uses `PLAN_TIER_ROSTERS[planTier]` (`apps/api/src/index.ts:1214-1217`) |
| S02 R9 production `startRun` callers | grep `startRun(` in `apps/` `packages/` excluding tests | exactly one: `apps/api/src/index.ts:1321` |
| Mutant A — drop `disabled={planTier === "free"}` on the risk pills (`page.tsx` SegmentedRow) | restore FROM captured copy | probe **FAIL 2** (S01-4/5 and S01-9/10). Native `disabled` is load-bearing. `cmp` equal after restore; `git status --porcelain -- apps/ui/app/new/page.tsx` empty. |
| Mutant B — move the missing-roster check **after** `assertMakerAdmission` (`apps/api/src/index.ts:1218-1242`) | restore FROM captured copy | empty Free panel returns **`MAKER_INVENTORY_UNSATISFIED`**, not `ASK_PLAN_TIER_MODEL_UNAVAILABLE` (R6 order). HTTP 422 body follows. `cmp` equal after restore. |

Independent probes + both mutants: **23 passed / 23** on the unmutated tree; mutants fail in the direction the AC names. Fixtures deleted before handoff; worktree product paths byte-clean.

## AC table

Verdict key: **HOLD** = code implements it and a suite or my probe proves it. **HOLD-CODE** = code path + suite/probe prove it; the live browser step is UNVERIFIED because its precondition is V-7 or because the README forbids a browser / live DB. UNVERIFIED does not block YES (packet charge 2).

### S01 §2 steps (once per mode: attributes + CSS tokens; live Chamber/Terracotta pixels UNVERIFIED — README: no browser)

| id | where | proof | verdict |
|---|---|---|---|
| S01-1 | `apps/ui/app/new/page.tsx:184-213` radiogroup above `#topic` | own render probe + `tier01-new-plan-tier` 22/0 | HOLD |
| S01-2 | `page.tsx:77` `useState("free")`; DONE.md Q1 yes | own probe "fresh /new opens with Free" | HOLD |
| S01-3 | `page.tsx:200` maps `PLAN_TIER_ROSTERS`; page has **no** model-id literals | own probe; `plan-tiers.ts:8-11` | HOLD |
| S01-4 | `page.tsx:85,87,116` + R7 pins | own probe: Standard / Low / 2 / empty | HOLD |
| S01-5 | native `disabled={planTier === "free"}` on the nine collapsed locks `page.tsx:251-307` | own probe + mutant A | HOLD |
| S01-6 | OPTIONS toggle `page.tsx:324-333` not disabled; knobs `351-392` disabled in Free | own probe | HOLD |
| S01-7 | `#topic` has neither `disabled` nor `readonly` `page.tsx:220-233`; `ready` `page.tsx:130-137` ignores plan tier | own probe | HOLD |
| S01-8 | Premium clears `disabled`; values accept edits | own probe | HOLD |
| S01-9 | `choosePlanTier` `page.tsx:111-125` resets R7 on Free; question kept | own probe | HOLD |
| S01-10 | Premium-again does not restore the pre-Free edits | own probe | HOLD |
| S01-11 | `buildNewDebateAskConfig` `defaults.tsx:70-71` + `createDebate` `api.ts:375-388`; HTTP 202 via `POST /v1/asks` `apps/api/src/index.ts:906-916` | own wire + admission probes (`plan_tier:"free"` → 202). Live Network-tab on `:3000` UNVERIFIED (README). | HOLD-CODE |
| S01-12 | same path, `plan_tier:"premium"` | own probe 202 | HOLD-CODE |

### S01 requirements (SPEC-v2 §1)

| id | where | proof | verdict |
|---|---|---|---|
| R1 | `page.tsx:184-196` | own probe | HOLD |
| R2 | `page.tsx:77`; DONE.md Q1 | own probe | HOLD |
| R3 | `page.tsx:200` + `PLAN_TIER_ROSTERS` | own probe; page source has no model-id literals | HOLD |
| R4 | native `disabled` on the listed ids | own probe + mutant A | HOLD |
| R5 | `.ndOptionsToggle` not disabled | own probe | HOLD |
| R6 | `#topic` editable both tiers | own probe | HOLD |
| R7 | Free values + `machine:plan-tier-free` `defaults.tsx:73-74` | own render + wire probes | HOLD |
| R8 | reset on Free; leave-as-is on Premium | own probe | HOLD |
| R9 | Premium unlocks | own probe | HOLD |
| R10 | `#treeDepth` min=1 max=5 both tiers `page.tsx:49-50,272-273` | own probe | HOLD |
| R11 | `packages/contract/src/plan-tiers.ts:8-11` re-exported `packages/contract/src/index.ts:3` | grep + `tier01-roster` 1/0 + `tiers-s02-rosters` | HOLD |
| R12 | `AskRequestSchema` `packages/contract/src/index.ts:109-120` `.strict()` + required `plan_tier` | own wire probe; `contract.test.ts` 8/0 | HOLD |
| R13 | `defaults.tsx:52,70` optional member; `api.ts:375-376` guard `ASK_FIELD_REQUIRED:` | own wire probe (no `submitAsk` call) | HOLD |
| R14 | `apps/api/src/index.ts:906` parse + 202; gold / missing → 400 `MALFORMED_REQUEST` | own inject probe | HOLD |
| R15 | `generate:contract` rc=0 × 3; `packages/contract/generated/field-inventory.json` contains `plan_tier` | generate logs | HOLD |
| R16 | `page.tsx` source-shape | python probe of the named regions | HOLD |
| R17 / M13 | S01 CSS block `globals.css:6311-6374` uses only existing vars; no hex/rgba in the block; tokens in both `:root` and chamber | css probe PASS; `t9-mode-tokens` still 7/2 (pre-existing, no new token) | HOLD |
| R18 | `ready` `page.tsx:130-137` has no `planTier` | python + own probe (Start run enables from the question) | HOLD |
| R19 | cluster three-run table above vs BASELINE; no feature suite lost cases | this seat's runs | HOLD |
| R20 | class A/B literals now carry `plan_tier` (grep of the five + two files named in R20) | `contract`/`api`/`load01`/`s7-authorization`/`evaluator-database`/`v2ui-data-layer:757`/`pol01-policy:51`. `LibraryComposer.tsx:29-37` still tier-less, still swallowed — named out of scope. | HOLD |
| R21 | typecheck 70/22, no new files | clean typecheck after fixture delete | HOLD |

### S01 DONE.md measurements

| id | where | proof | verdict |
|---|---|---|---|
| M1 group | `page.tsx:184` + `.ndTier` `globals.css:6312-6317` | css probe + render | HOLD |
| M2/M3 chosen/unchosen | `.ndTierOption` / `[aria-checked="true"]` `6318-6334` | css probe; tokens match DONE.md terracotta **and** chamber hex/rgba | HOLD |
| M4/M5 name pills | `.ndTierName` `6335-6347` | css probe | HOLD |
| M6 promises | `page.tsx:42-45` + `.ndTierPromise` `6348-6351` | own probe copy + css | HOLD |
| M7 ids + dots + nowrap | `page.tsx:200-208` `modelMeta`; `.ndTierModel` `6357-6366`; `--m-gpt/#B4552D`, `--m-claude/#8A63C9`, `--m-grok/#5F6670` identical in both modes `globals.css:40-41,146-147` | css probe + render | HOLD |
| M8 lock | `.ndSegItem:disabled,.ndSlider:disabled,.ndSteerInput:disabled,.ndSelect:has(select:disabled)` `6367-6373` = `opacity: 0.45; cursor: not-allowed` only | css probe + native disabled | HOLD |
| M9 three Free lines | `page.tsx:238-248,260-262` | own probe | HOLD |
| M10 Free values | same as R7 | own probe | HOLD |
| M11 Start run | existing `.ndStart:disabled` `globals.css:6296`; `page.tsx:405` `disabled={!ready \|\| submitting}` | own probe | HOLD |
| M12 OPTIONS | toggle not in the lock rule; panel dashed `--line-strong` is pre-existing `.ndLegacy` | own probe + source | HOLD |
| M13 no new colour | S01 block has no hex/rgba | css probe | HOLD |
| M14 chrome | no restyle of eyebrow/title/bezel/gauges beyond the lock rule | diffstat: only the S01 fence added to `globals.css` | HOLD |
| M15 type | `--font-mono` includes `"JetBrains Mono"`; name pill inherits page sans at 10.5px | css probe | HOLD |

Live artboard overlay in a real browser, both modes: **UNVERIFIED** (README: no browser). Tokens + DOM attributes were measured.

### S02 requirements

| id | where | proof | verdict |
|---|---|---|---|
| R1 | reads S01 `PLAN_TIER_ROSTERS`; grep uniqueness as above | `tiers-s02-rosters` 6 passed of the cluster (the 3 fails are s14) + grep | HOLD |
| R2 | data, not `if` on tier name for models | grep + architecture suite | HOLD |
| R3 | `apps/api/src/index.ts:1213-1257` filter then makers/panelSize/return from `filteredPanel` | own probe (order + extras dropped) | HOLD |
| R4 | `panelSize: filteredPanel.length` `:1248`; admitted asks have the full roster so 2 / 3 | own probe sizes `[2]` / `[3]` | HOLD |
| R5 | both rosters two makers; check lives next to the declaration (architecture suite), not in admission | own probe `confidenceBandCapRequired === false` | HOLD |
| R6 | missing check `:1218-1228` **before** `assertMakerAdmission` `:1238-1242`; `markAskRefusal` `:300-303` is `never` | own probe + **mutant B** (empty Free → `MAKER_INVENTORY_UNSATISFIED` if reversed) | HOLD |
| R7 | 422 `{ error, message }` `:531-533`; message names the tier and every missing id `:1223-1226` | own HTTP inject | HOLD |
| R8 | `evaluateAskAdmission` `:1312` before `startRun` `:1321`; 422 path never increments submit-after-admission | own probe `started === 0` | HOLD |
| R9 | filter is roster-map + find; extras dropped; partial → refuse, not shrink. Production `startRun` is one call site. Runner claim-time drop is **V-29**, not R9. | own probe + grep | HOLD |
| R10 | `page.tsx:161-162` renders `exc.message`; `ContractHttpError` carries server `message` (`client.ts:82-91`) with the V-28 prefix. Step 6 needs the names, not a prefix-free string. | code path; V-28 default binds | HOLD |
| R11 | column `packages/db/src/schema.ts:121`; encrypted write `packages/db/src/index.ts:1228` + `migrations/0061_plan_tier_on_run.sql:59-67`; `planTier: ask.plan_tier` `apps/api/src/index.ts:1332` | `tiers-s02-run-plan-tier` 27/27 with evaluator-database (includes "persists plaintext free beside encrypted content") | HOLD |
| R12 | command in `slices/S02/PROGRESS.md:79` and the C1 handoff: `docker exec debateai-v3-postgres-1 psql … SELECT plan_tier FROM core.run WHERE run_id='…'` | command exists. Live exec against `127.0.0.1:55432` is forbidden. | HOLD-CODE |
| R13 | cluster three-runs above | this seat | HOLD |
| R14 | typecheck 70 lines / 22 files, no new files | clean typecheck | HOLD |
| R15 | seven RED properties: free filter, premium filter, all-missing, single-missing, several-missing, no-run-on-refusal, read-back | own probes cover 1–6; read-back is `tiers-s02-run-plan-tier` ("persists plaintext free…", "persists premium through the legacy-principal…") 27/27 | HOLD |

### S02 §2 steps

| id | where | proof | verdict |
|---|---|---|---|
| S02-1..4 | admission filter + UI Start run | code path + suites. Live fleet (V-7) **not** configured. | HOLD-CODE / UNVERIFIED live |
| S02-5..7 | today's stack: Free all-missing, Premium `grok-4.6` missing | own 422 probe + mutant B; names every missing id; error ≠ `MAKER_INVENTORY_UNSATISFIED` | HOLD (in-process). Live `/new` error block UNVERIFIED (no browser). |
| S02-8 | restore + rerun | V-7 | UNVERIFIED live; same code path as S02-1 |
| S02-9 | R12 command | command present; live DB forbidden | HOLD-CODE / UNVERIFIED live |

## Demands

none.

## UNVERIFIED

1. **S02 steps 1–4, 8–9 in a browser on `:3000` with a HEALTHY five-model fleet** — Precondition A / row V-7 is V's operation; README forbids `.local/**`, the live `:3000` stack, and `127.0.0.1:55432`. Code path + suites prove the filter, the 202 face, and the persisted column.
2. **S01 steps 11–12 Network-tab on the real stack** — same README. Proven with `buildApi().inject` 202 and with the page calling `createDebate` with `plan_tier`.
3. **DONE.md artboard overlay, live pixels, both modes** — README: no browser. Proven from compiled `globals.css` (both token blocks) + jsdom DOM/ARIA/disabled. Chamber vs Terracotta is token substitution; the S01 block uses only those tokens.
4. **R12 `psql` against the live dev database** — forbidden. Proven by the integration write/read cases and by the command existing in `PROGRESS.md:79`.
5. **Hover, focus ring, keyboard movement between the two options** — DONE.md §5: nothing drawn; not an acceptance step.

UNVERIFIED items do not contradict the code path.

## V-28 / V-29

I do not disagree with the binding defaults. V-28 (error-code prefix on `/new`) does not fail step 6 (the ids are in the string). V-29 (runner may shrink an admitted panel at claim time, `apps/runner/src/index.ts`) is outside R9 (starting a run) and is a later slice.

## Findings (this lens)

- **B:** none.
- **N1 (orchestrator, packet):** freeze pair `27144e77..19b79d18 -- docs/missions/debate-tiers` is 1 line in `RESUME-HERE.md`, not the packets/folds/review package the sentence claimed. File: packet `WHOLE-REV-grok-4.6.md:10`.
- **N2 (orchestrator, cluster command):** S01-C1 still expects `api.test.ts` 25/0; integration is 26/0 because S02 added a case. Marker CLUSTER_RED is the pair, not the product. File: `slices/S01/PLAN.md` C1 row (expect 25) vs README integrated table (26/0).

## Shared surfaces

- `/new` still mounts `SupportWidget` (`page.tsx:416`).
- `LibraryComposer.tsx:29-37` still posts a tier-less `createDebate` and swallows; falls back to `/new?topic=` — S01 R20 out of scope; behaviour unchanged.
- App-shell mode toggle is unused by this page's logic; colour dual-mode is the two token blocks.

## Predictions (blind)

The sibling lens will either treat **V-29** as a demand against S02 steps 2 and 4 ("exactly two / exactly three models argue") — I would not, because R9 is the start-time panel and V-29 already binds — or treat the **S01-C1 CLUSTER_RED** (26 vs 25) as a product defect, or treat **R10** as failed because `client.ts:88-91` prefixes the code. I would open V-29 first if I were hunting a live-stack fail: an admitted Premium run can still argue with two models after claim-time reprobes, and every S02 suite would still be green.

YES, ALL AC ARE CORRECT
