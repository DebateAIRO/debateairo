# ARCH-REV-S03 pass 3 — closures of pass 2

Seat ARCH-REV-PES-S03-p3 · node ARCH-REV(S03) · ticket t_343e672e · pass 3 of 3 (last). Lane `.worktrees/pes-s03/dialectical-engine` @ 776359c3, dirty 0 at exit. Plan under review is Revision 3, freeze `5108aa89..fcf430d0` (working tree matches `fcf430d0` for `slices/S03`: `git diff --stat` empty). ARCH-FIX READY on t_f54b7505 is quoted as claims. A REWORK here would be a V row. It is not.

## Findings

### N1 — C2-7's pointer to the V-ROW says "at run time"

`docs/missions/provider-env-selection/slices/S03/PLAN.md:604`. The sentence says the Revision 3 V-ROW asks whether the support-chat sentence should also name "the refusal an operator meets at run time."

The row it points at does not ask that. `DECISIONS.md:117-119` and V packet row V-11 ask whether R3.4 should name `COST_ENVELOPE_POLICY_UNRESOLVED` / `COST_ENVELOPE_POLICY_INVALID`. Those are thrown while the process is still booting: `readCostEnvelopePolicy` at `apps/api/src/main.ts:242` and `apps/runner/src/main.ts:111`. In this mission "run time" is the other bucket — the four spend codes row V-8 keeps out of §11 (`PLAN.md:160`).

Concrete failure: a seat who amends R3.4 from `:604` alone, and who uses V-8's split, goes looking for a code raised during a run. Those four codes are the ones the table must not gain.

The write C2-7 actually orders is the frozen SPEC sentence (`PLAN.md:605-606`: unreachable with the shipped source, default applies, sentence unchanged). A BUILD seat who follows `:605-606` does not write the wrong code. WHEN: the orchestrator folds the phase word before BUILD, so the pointer names the two boot codes. Not a rework, and not a new V row — V-11 already asks the real question.

## Closures that hold

Re-measured in the lane. ARCH-FIX logs were not treated as evidence. The pass-2 probe was copied to `probes/ARCH-REV-PES-S03-p3/` and retargeted; the original `closure.sh` mtime is still Sep 24 20:06 and its `scratch/states` still has 10 files. Commands below are this seat's, in `probes/ARCH-REV-PES-S03-p3/`.

### B1 — both members, and the gate

The prescribed sentence and the prescribed cell no longer say the price code is raised before every hosted rule.

- C1-3's EXACT sentence (`PLAN.md:380`) is byte-identical to the string C1-1 assertion (3) pins (`PLAN.md:271-273`): 224 bytes, `rev3-check.log` §1 `equal true`. It claims the parse raises `PROVIDER_DISCOVERY_TARGET_PRICE_INVALID` before `PROVIDER_TARGET_PRICE_REQUIRED` or `PROVIDER_TARGET_PRICE_ZERO` can be, for a malformed price.
- That order is the call order, not the import order. API calls: seal `apps/api/src/main.ts:97`, support admission `:230`, cost-envelope policy `:242`, parse `:300`, `assertPricedProviderTargets` `:312`. Runner calls: seal `apps/runner/src/main.ts:38`, parse `:74`, priced `:87`, policy `:111` (after the price rules, as `PLAN.md:400-401` says). `PROVIDER_DISCOVERY_TARGET_PRICE_INVALID` is thrown at `packages/providers/src/index.ts:278` (one member without the other) and `:195` (not an integer in `[0, MAX_SAFE_INTEGER]`), the second reached from `:283` and `:285`, both inside the parse. `PROVIDER_TARGET_PRICE_REQUIRED` is `:687` and `PROVIDER_TARGET_PRICE_ZERO` is `:700`, both inside `assertPricedProviderTargets`, which returns immediately when the mode is not hosted (`:683`). A malformed price throws before that function runs. A price of `0` is an integer in range, so it is not this code; it reaches `:700`. The sentence matches that.
- C1-2 row 1 (`PLAN.md:335`) states only those two throw conditions. It does not say "before any hosted rule."
- The third member the sweep removed, "refuses with the first code," is not in the sentence. Putting it back fails (3).

The gate, run as the plan's own `(1)` / `(1b)` / `(2)` / `(3)` against simulated READMEs (`rev3-check.log` §3, §4):

| state | got |
|---|---|
| base, unedited README | `FAIL PROVIDER_TARGET_PRICE_REQUIRED` |
| six new rows, no sentence | `FAIL guard-order sentence below the table, EXACT (C1-3)` |
| six new rows + the EXACT sentence | `PASS` |
| same sentence hard-wrapped | `PASS` |
| Revision 2's cell + Revision 2's sentence | `FAIL no 'before any hosted rule' order claim in §11's refusal span` |
| Revision 2's cell + the new sentence | same `(1b)` fail |
| the pass-2 "true but different" wording | `FAIL` on (3) |
| "refuses with the first code" put back | `FAIL` on (3) |
| the new sentence written only into row 1 | `FAIL` on (3) |
| the `(1b)` mutant line alone, at the C1-1 boundary | `FAIL` on (1b), before the missing-code check |
| a `<ref>` row at that same boundary | `FAIL` on (1) |

`(1b)` does not match the EXACT sentence (`(1b) matches the EXACT sentence false`). The only plan lines that still contain `before any hosted rule` are the assertion message (`PLAN.md:260`, `:308`) and the mutant the seat inserts and then deletes (`:305`). None of them is the row C1-2 tells the seat to leave in the README. Union size is 12. Base message is unchanged, so C1-1's done-when still names `PROVIDER_TARGET_PRICE_REQUIRED`. No pair moves.

The replayed pass-2 detector does not show this. `closure-p2-replay.log` §E prints `EXACT sentence present false` and `meaning-cell copies 1` (that one hit is the mutant line, counted above). §E's order numbers are imports (`api … 24`, runner parse/deployment/priced all `23`). §F prints `C1-2 + EXACT sentence PASS` because §F hardcodes Revision 2's sentence and Revision 2's token check. It cannot see Revision 3. The rows in the table above are the measurement on the revision.

One wording outside `(1b)` still passes: a Meaning cell "raised before a hosted rule runs" plus the EXACT sentence below (`M_outside_pattern got=PASS`). `PLAN.md:428-430` already says (3) does not catch a false order claim worded outside that pattern inside a cell, and C1-2 gives the cell no order claim to copy. That is the disclosed gap, not the sentence pass 2 rejected.

### N1 (pass 2) — the duplicate-ref citation

`PLAN.md:162`. Publish goes through `buildConfiguredProviderSetDeploymentRow` at `packages/register/src/configured-provider-set.ts:177`. `assertConfiguredProviderSetShape` is declared at `:64`, called by the builder at `:184`, and called by the hosted check at `:159`. The duplicate throw on that path is `:82`, code `CONFIGURED_PROVIDER_SET_INVALID`. `packages/register/src/register-publication.ts:557` calls `assertHostedConfiguredProviderSetVetted`. `CONFIGURED_PROVIDER_DUPLICATE` remains the boot throw at `packages/providers/src/index.ts:255`. Lines `:155-162` are not cited as the throw. The decision to keep that code out of the table stands. The verdict's `PLAN.md:141` was `:140` in freeze `5108aa89`; Revision 3 identifies the row by its content.

The citation class the sweep names, re-opened at the cited lines:

| site | line opened | what is there |
|---|---|---|
| C1-2 row 6, `PLAN.md:340` | `runtime-environment.ts:202` | the throw. Mode test `:199`. Budgets `:200`. Row members `session-policy.ts:134-136` are `support_reads`, `support_sessions`, `support_model_calls` |
| C2-7, `PLAN.md:600` | `runtime-environment.ts:157-158` | hosted return, then `throw new CostEnvelopesNotSealedError()`. Called at api `:97` and runner `:38` |
| C2-5, `PLAN.md:538-539` | `index.ts:193-194` | `Number.isInteger` and `value > Number.MAX_SAFE_INTEGER`. Floor of 1 is `:699`, as the step says. `:278` is the one-member throw |
| `:112-114` in the V-ROW | `runtime-environment.ts:113` | `` `COST_ENVELOPES_NOT_SEALED` is unreachable at ``. The checker's first pass asked `:112` alone and missed it; the word is on `:113`, inside the span |

### Neighbours of the edited steps

Count oracles on the new six row texts (`rev3-check.log` §8): base `^|` = 13; six rows = 19; six rows plus the sentence, wrapped or not = 19; five rows = 18. The replayed pass-2 oracles (`closure-p2-replay.log` §J) still print 19, 8, and 1/1 on their own fixtures. C2-5's and C2-6's commands were not retargeted. Trace, own parser (`rev3-check.log` §7) and the replayed one (§H, §N): 9 requirements R3.1–R3.9, 14 steps C1-1–C2-10, zero gaps, reciprocity breaks 0.

## Cluster commands

Re-run at base in the lane from `.sh` files, using the plan's relative `zsh .claude/skills/heartbeat-orchestrator/scripts/run-suites.sh` (the file is in the lane). Markers agree with the ARCH-FIX claim. Not BROKEN. Full vitest output is in the `*.log` next to each script; `c1-cluster.log` records `Tests  23 passed (23)` / `Duration  336ms` and `Tests  31 passed (31)` / `Duration  170ms`.

| command | this pass | ARCH-FIX claim |
|---|---|---|
| S03-C1 `v9:24:0` + `baseline:31:0` | `passed=23 failed=0 (expect 24/0)` · `passed=31 failed=0` · `CLUSTER_RED` (`clusters-driver.log`) | `CLUSTER_RED`, same three facts |
| S03-C2 `v9:28:0` + `baseline:31:0` | `passed=23 failed=0 (expect 28/0)` · `passed=31 failed=0` · `CLUSTER_RED` | `CLUSTER_RED`, same three facts |
| base pairs `v9:23:0` + `baseline:31:0` | `passed=23 failed=0` · `passed=31 failed=0` · `CLUSTER_GREEN` | `CLUSTER_GREEN`, same |

`run-suites.sh:23-26` still prints `CLUSTER_GREEN` when the measured pair equals the expected pair. This pass observed that on the base pair (23/0 equals 23/0). A suite whose failed count is non-zero and equals the expected failed count was not built.

## V rows, keys, ports

V-1..V-11, default applied. No runtime hostname check is added (V-1). The worked example stays `vendor:acme` and two `authorization_file` paths (V-2, V-5); `rev3-check.log` §10 counts `sk-` hits 0 and `listen(` hits 0. Base stays `776359c3` (V-4). The slice still only writes the README gap and the pin (V-6). C2-8 still states no floor (V-7). The four run-time spend codes stay in the OUTSIDE table (`PLAN.md:160`, V-8). The four parse-time discovery codes stay there (`PLAN.md:161`, V-9). V-10 is S01 and this plan does not touch it. V-11's default is what C2-7 writes: the SPEC sentence unchanged, with `COST_ENVELOPE_POLICY_UNRESOLVED` and `COST_ENVELOPE_POLICY_INVALID` already in C1-2's six rows. The four RED-at-base pairs at `PLAN.md:723-727` match `00-intake.md:41` and `logs/baselines.tsv` (9/10, 5/10, 3/4, 20/21). None of those four files contains `README`, `deploy/vps`, or `v9-provider-credential-files` (`rev3-check.log` §9). No fixture endpoint is planned; `PLAN.md:705-707` starts no listener. This seat opened no port. `ui: no` (`SPEC.md:2`); no `## Screens` block is owed. Banned words in `PLAN.md`: none of improve, better, robust, handle, appropriate.

## Packet

`packets/ARCH-S03.md:10` still says the REQ-REV N-findings on S03 bind the plan. That is pass-1 N5, named and not re-reviewed. This packet's base `776359c3`, the freeze pair, and the dispatch cursor (1) match what was measured. Charge 5's phrase "the ARCH seat's own V-ROW" is V-11 from ARCH-FIX `t_f54b7505`. The check did not change, so it is not filed.

## Named, not re-reviewed

- Pass-1 N5, above.
- Steps Revision 3 did not change: C2-1, C2-2, C2-3, C2-4, C2-6, C2-8, C2-9, C2-10, and the orchestrator's PROGRESS lines and folds.

## PREDICTIONS

A lens that replays only `closure.mjs` §F will say the old sentence still PASSES and call B1 open. That function never reads Revision 3's assertions. The check to run first is the string at `PLAN.md:380` against `PLAN.md:272`, then `(1b)` on a README that still carries "before any hosted rule": it fails, and the EXACT sentence does not trip `(1b)`. A product-truth lens that stops at `COST_ENVELOPES_NOT_SEALED` being unreachable will re-open V-11; the default is already applied and C2-7 writes the frozen sentence.

## UNVERIFIED

- C1-1's case under real vitest and under `pnpm typecheck`. The conditions were executed here in node, on simulated README text, not by `pnpm vitest`. The cluster commands re-run above are the suites as they exist at base, before that case exists.
- `run-suites.sh` printing GREEN when a suite's failed count is non-zero and equals the expected failed count. The GREEN observed here is the base pair, 23/0 against 23/0.
- The four RED-at-base suites were not re-executed. §9 is the grep. They can reach `127.0.0.1:55432`, which this seat does not touch.
- The ARCH-FIX transcript body was not opened. The READY comment on t_f54b7505 is the claim.
- No listener was started, so a free port above 4400 was not measured. The plan starts none. This seat bound nothing.

VERDICT PASS / CONFIDENCE high / STRONGEST COUNTER: a Meaning cell can still say "before a hosted rule runs" and pass both (1b) and (3), measured as `M_outside_pattern got=PASS`. C1-2's prescribed cell does not say that, (3) pins the one sentence below the table, and `PLAN.md:428-430` already sends the cells to `REV(S03)`. The sentence pass 2 rejected now fails the gate, and the sentence the plan now requires matches the call order above.

## V-ROW

None.
