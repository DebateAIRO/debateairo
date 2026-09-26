# ARCH-REV-S03 pass 2 — closures of pass 1

Seat ARCH-REV-PES-S03-p2 · node ARCH-REV(S03) · ticket t_e0cce6ce · pass 2 of 3. Lane `.worktrees/pes-s03/dialectical-engine` @ 776359c3, dirty 0 at exit. Plan under review is Revision 2, freeze `1b87e211..5108aa89` (PLAN.md 503 → 729 lines, DECISIONS.md appended). The orchestrator's PROGRESS lines and the F1 fold at `DECISIONS.md:76` are not under review. ARCH-FIX READY on t_2913aad6 is quoted as claims.

## Findings

### B1 — the EXACT guard-order sentence is false against the hosted boot, and the new gate accepts it

Class: an order sentence marked EXACT whose words place a code before every hosted rule, while a hosted rule in the same table runs earlier. Two members a BUILD seat copies into `deploy/vps/README.md`. Fixing one and leaving the other is a failed fix.

1. `docs/missions/provider-env-selection/slices/S03/PLAN.md:332` (C1-3). The required sentence says `` `PROVIDER_DISCOVERY_TARGET_PRICE_INVALID` is raised while the targets are parsed, before any hosted rule runs ``. Hosted boot does not do that.
   - `apps/api/src/main.ts:97` calls `assertHostedCostEnvelopesSealed` and `:230` calls `assertHostedSupportAdmissionSealed` before `parseProviderDiscoveryTargets` at `:300`. `packages/register/src/runtime-environment.ts:157-158` throws `COST_ENVELOPES_NOT_SEALED` when the mode is hosted and the status is not `SEALED`. `:199-202` throws `SUPPORT_ADMISSION_SCOPES_NOT_SEALED` in hosted mode when a support scope is absent.
   - `apps/runner/src/main.ts:38` calls `assertHostedCostEnvelopesSealed` before `parseProviderDiscoveryTargets` at `:74`.
   - Concrete input: hosted mode, cost envelopes not sealed, one price member missing. The process throws `COST_ENVELOPES_NOT_SEALED` at the seal and never reaches `packages/providers/src/index.ts:278`. The sentence says the price code is raised before any hosted rule runs.
2. `PLAN.md:289` (C1-2 Meaning cell). The same phrase, "before any hosted rule runs", is the condition the seat writes into the `PROVIDER_DISCOVERY_TARGET_PRICE_INVALID` row. It was already in the pass-1 plan (`b57409e2` line 159). Revision 2 copied it into the EXACT sentence. `PLAN.md:352` quotes the cell and does not add a third string.

`PLAN.md:340-342` says the revision narrowed pass 1's wording because the environment loader raises `DEPLOYMENT_MODE_*` before any target is parsed. The EXACT sentence still says "before any hosted rule runs". The three-call order the next lines measure is real and is not this claim: api `:300` → `:305` → `:312`, runner `:74` → `:81` → `:87`. `PRICE_REQUIRED` at `:687` and `PRICE_ZERO` at `:700` do run after parse. The false conjunct is "any hosted rule".

The N1 gate does not stop the false sentence. C1-1 assertion (3) (`PLAN.md:242-245`) checks that the text below the last `|` line contains the two code names and `\bbefore\b`. On simulated READMEs (`probes/ARCH-REV-PES-S03-p2/closure.log` §F): six rows and no sentence fail with `guard-order sentence below the table: PROVIDER_DISCOVERY_TARGET_PRICE_INVALID`; six rows plus the EXACT sentence PASS; a different sentence that keeps those tokens also PASSES. The omission case from pass 1 is closed. The text the case accepts is not what the boot does.

### N1 — the duplicate-ref citation names a call site, and the code thrown there is a different one

`PLAN.md:141` and `DECISIONS.md:70`. Both say `buildConfiguredProviderSetDeploymentRow`'s shape check at `packages/register/src/configured-provider-set.ts:155-162` refuses a duplicate ref, so `CONFIGURED_PROVIDER_DUPLICATE` (`packages/providers/src/index.ts:255`) is a second guard. `:159` and the builder at `:184` call `assertConfiguredProviderSetShape`. The throw is `:82`, and the code is `CONFIGURED_PROVIDER_SET_INVALID`, not `CONFIGURED_PROVIDER_DUPLICATE`. A stranger who opens `:155-162` does not see the boot code. The decision to leave `CONFIGURED_PROVIDER_DUPLICATE` out of the table can stand: publish refuses a duplicate ref first, under the other code. WHEN: the orchestrator folds `:82` and the name `CONFIGURED_PROVIDER_SET_INVALID` into that row. Not a seventh table row, and not a V question.

## Closures that hold

Re-measured in the lane. ARCH-FIX logs were not treated as evidence. Pass-1 `measure.mjs` §1 still counts the unedited README (pipe-space 12 and 5); it cannot see a closure that changes the pattern. The simulated files are `probes/ARCH-REV-PES-S03-p2/scratch/states/`. Commands are the plan's `/usr/bin/grep` lines.

| closure | result on the revision |
|---|---|
| B1.1 C1-2 count | base `^|` = 13; six rows = 19; six rows plus the sentence = 19; five rows = 18; pass-1 `^| ` on the six-row file = 18 (`closure.log` §J) |
| B1.2 C2-5 count | base `^|` = 6; two rows, both prose variants = 8; one row = 7; pass-1 `^| ` on a correct edit = 7. First-cell commands print 1 and 1, and 1 and 0 on the one-row file |
| B1.3 C2-6 position | base 0 and 0; both prose variants print 1 and 1; an api line that drops `output_price_micros_per_million` prints 1 and 0. The count does not read bullet B1 |
| N1 omission case | after six rows and no sentence, assertion (3) fails on `PROVIDER_DISCOVERY_TARGET_PRICE_INVALID`. The whole-span check would not: the Meaning cell is a `\|` line. See B1 for the sentence that then passes |
| N2 C2-3 / C2-8 | `\b600_?000\b` passes `600000` and `600_000` and "no recommended value". After the strip, `\brecommend\w*` fails "The recommended value is 600000." `\bsuggest\w*` and `\bshould be\b` fail the other two violations. `6000000` fails the seed pattern. `\brecommend\b` does not match `recommended` (`closure.log` §G). The pushback on the pass-1 WHEN is right |
| N3 counts | own scan and replayed `measure.mjs` §6: 16 distinct `throw new TypeError` codes in `packages/providers/src/index.ts`, 9 absent from §11. Anchor union 12, absent set equals R3.3's six (`closure.log` §B, §C, §O). "No leftover" is scoped to the eight anchors at `PLAN.md:124-132` |
| N4 angle guard | unedited refusal span has 0 matches of `/<[a-z-]+>/` and no `<`. A `<ref>` row fails assertion (1) with `no angle-bracket placeholder in §11's refusal table`. Base, with no angle hit, fails on `PROVIDER_TARGET_PRICE_REQUIRED`, so (1) does not steal the C1-1 message. `:378` inspects ` ```sh ` blocks only (`tests/architecture/vps-deployment-baseline.test.ts:378-384`). The plan no longer credits it for a table cell |
| trace | own parser and replayed `trace.sh`: 9 requirements, 14 steps, zero gaps both ways, every forward row reciprocated (`closure.log` §H, §N) |
| cluster commands | unchanged text, re-run at base. Agree with the ARCH-FIX claim. Not BROKEN |

`run-suites.sh:23-26` clears `ok` only when the measured pair differs from the expected pair, then prints `CLUSTER_GREEN` while `ok` holds. Pass 1's `v9:23:1` on a real 23 passed / 1 failed would match and print GREEN. This pass's C1-1 command expects `24:0`. At base the file is 23/0, so the marker is RED. A 23/1 suite was not built (UNVERIFIED).

## Named, not re-reviewed

- Pass-1 N5, `packets/ARCH-S03.md:10`, still says the REQ-REV N-findings on S03 bind the plan. Pass 1 found none do. The orchestrator owns it. No new packet defect in the quoted base, the freeze pair, or the comment cursor.
- Steps the revision did not change (C2-1, C2-2, C2-4, C2-7, C2-9, C2-10) and the PROGRESS.md recording lines. `DECISIONS.md:76` is the orchestrator's fold.

## Verification

Lane `776359c3`, `export PATH="/opt/homebrew/bin:$PATH"`, scripts under `probes/ARCH-REV-PES-S03-p2/`. Markers agree with the ARCH-FIX claim. No BROKEN.

| command | this pass | ARCH-FIX claim |
|---|---|---|
| S03-C1 `run-suites.sh` v9 `:24:0` + baseline `:31:0` | `passed=23 failed=0 (expect 24/0)` · `passed=31 failed=0` · `CLUSTER_RED` (`c1-cluster.log`) | `CLUSTER_RED`, same three facts |
| S03-C2 `run-suites.sh` v9 `:28:0` + baseline `:31:0` | `passed=23 failed=0 (expect 28/0)` · `passed=31 failed=0` · `CLUSTER_RED` (`c2-cluster.log`) | `CLUSTER_RED`, same three facts |

Rows V-1..V-9, default applied: no runtime hostname check, no second credential path, base stays `776359c3`, the worked example is `vendor:acme` and two file paths (no real key), the slice writes the README gap, the cost paragraph states no floor, the four run-time spend codes stay out (V-8), the four parse-time discovery codes stay out (V-9). V-3 does not touch the plan. The four RED-at-base pairs at `PLAN.md:643-647` match `logs/baselines.tsv` (9/10, 5/10, 3/4, 20/21). A grep of those four files finds no `README.md` and no `v9-provider-credential-files` (`closure.log` §M). No fixture endpoint is planned; `PLAN.md:625-627` starts no listener. `ui: no`; no `## Screens` block is owed. This seat opened no port.

## PREDICTIONS

A lens that re-runs only the count oracles will PASS: 19, 8, and 1/1 all hold, and the N1 omission case really does go RED. A product-truth lens that starts from `assertHostedCostEnvelopesSealed` will call the EXACT sentence false on the first read. The check to run first on a pass-3 diff is `PLAN.md:332` and `:289` against `apps/api/src/main.ts:97` and `:230` and `apps/runner/src/main.ts:38`, and that assertion (3) fails the old sentence.

## UNVERIFIED

- C1-1's case and C2-3's assertions under real vitest. They were executed here as the same `expect` conditions in node (`closure.mjs` §F, §G), not by `pnpm vitest`.
- `run-suites.sh` printing GREEN when a suite's failed count equals the expected failed count. The branch is `run-suites.sh:23-26`. The runs above are mismatches on a green file.
- The four RED-at-base suites were not re-executed. §M is the grep, not a run.
- The ARCH-FIX skill-tool transcript body was not opened.
- No listener was started, so a free port above 4400 was not measured. The plan starts none.
- `closure.mjs` §E reports import lines (api 24, 25, 70–73). The call sites are §P of the same log.

VERDICT REWORK / CONFIDENCE high / STRONGEST COUNTER: the three-call order parse → `assertDeploymentProviderTargets` → `assertPricedProviderTargets` is true, the sentence's second clause (before `PRICE_REQUIRED` and `PRICE_ZERO`) is true, and a seat can go green by copying the EXACT text, so a wording fix could be folded as N without a third pass. The text is marked EXACT, the slice exists so §11 says what the code does, and a hosted boot with unsealed envelopes throws `COST_ENVELOPES_NOT_SEALED` at `apps/api/src/main.ts:97` and `apps/runner/src/main.ts:38` and never reaches the price code. That is the rework. Pass 3 is the last lawful pass; a REWORK there is a V row.

## V-ROW

None.
