CODEX REVIEW T3C r2 — CHANGES · comments read through: t3c-r2-2026-09-02
VERDICT: REWORK — filing r2 = rework 1/3; 2 blocking findings

# Static review

I reviewed the packet first, then the named rulings, ticket, prior verdict, complete `056e2784..HEAD` history/diff, worker report and self-report, source paths, and T3C records. Per the packet, I ran no test, build, fixture, mutant, provider call, or mutating Git command.

The current product trace closes r1 B1. `observeProviderTarget` returns without recording; `probeTarget` delegates to it and records once; apps/api still calls `probeTarget`; shipped `main.ts` calls only the observe form; and the runner records exactly once in its configured-HEALTHY, configured-ABSENT/throw, and unconfigured-ABSENT branches. The F34 query now pins exactly two rows, the two provider identities, ABSENT state, two evidence IDs, and non-null failure codes. I found no double-write or zero-write branch on the shipped claim-time composition.

The history closes the chronological core of r1 B2. Git objects show `04cebe3c` (tree `7de46258`) with the F34 source arm present and `claimTimeProbe` absent from `main.ts`; its record fails on the missing setting. `49ab5f16` (tree `774762fd`) restores the production wiring. The second RED, `expected 4 to be 2`, is separately and correctly a B1 cardinality RED; it is not evidence for missing F34 wiring, and the report now says so.

The final class sweep closes r1 B4: its thirteen rows match every optional member of `WalkingSkeletonSettings`, and each is present in `main.ts`. The appended r2 report/self-report also correct the stale two-file claim to the actual eight-file `e040b1ee..HEAD` diff, including `packages/register/src/runtime-environment.ts`.

## Findings

### B1 — M3′ catches an identifier token, not a valid double-write regression

Files: `tests/architecture/dev-runner-provider-set.test.ts:42-77`; `logs/t3c/r2-mut-M3prime.log:2-36`; `apps/runner/src/main.ts:13,114-127`.

Failure scenario: import the persisting helper under the locally expected name—for example, `probeTarget as observeProviderTarget`—restore a `ProviderProbeRepository`, and pass it as `probes` at the call. That buildable composition writes once in `probeTarget` and once again in `WalkingSkeletonRunner`, recreating four rows for two members. The architecture arm still sees `observeProviderTarget(` and never sees `probeTarget({`, while the DB arm composes the real observe-only helper itself; both filed protections can therefore stay green over the shipped double-write.

M3′ does not refute this scenario. Its complete mutation changes only the call token to `probeTarget({`; it adds neither an import for that identifier nor the required `probes` member. The selected architecture test merely reads `main.ts` as text and fails 1/5 on the changed substring, so the recorded result never establishes a compilable or executable B1 recreation. Replace the token guard with a typed composition seam that the behavioural arm can instantiate, or otherwise bind the imported symbol and validate a compilable persisting-variant mutant in the failure direction.

### B2 — the final evidence set still violates D27

Files: `agent-reports/t3c-panel-policy.md:201-219,236-248`; `logs/t3c/r2-scaffold-edges.log:1-16`; `logs/t3c/r2-f33-f34-GREEN.log:1-5`; `logs/t3c/r2-mut-M1.log:44-59`; `logs/t3c/r2-mut-M2.log:44-59`; `logs/t3c/r2-mut-M3prime.log:2-18`.

Failure scenario: accept the lane at filed tip `ca5a3161` / tree `bf86a674` using the report's statement that every gate was rerun and stamped after the last content commit. The cited scaffold set-equality record actually names preceding commit `49ab5f16` / tree `774762fd`, and the cited full F33/F34 record does too. The later cluster summary cannot replace the scaffold gate: its 3 files / 16 tests are exactly the 5-case runner-entry arm plus the 8-case DR-181 discovery arm and 3-case ceiling arm; the separate eight-test `scaffold.test.ts` run is absent. In addition, the final M1, M2, and M3′ records stamp the commit but no tree at all.

This is the same D27 class as r1 B3: the final commit changed an architecture assertion, and D27 explicitly rejects reasoning that the intervening content could not affect a gate. After fixing B1, make the next content commit final, rerun the complete gate set—including scaffold set-equality—and stamp every acceptance/mutant record with that exact full commit and tree. Cite only those final-tip records in the filing.

## Packet audit

No packet-owned finding. Both writable paths resolve and are the only files written. The base/tip, three-commit history, final tree, clean porcelain, zero mode changes, eight-file `+583/-79` lane stat, and ruling references match the artifacts. Hashing the worker report with line 2 removed reproduces the packet's `d824a097a203853e411c193cd3a74bf74d382aaa3bf3845236030d4320f8227b` value.

## Not independently verified

Because this seat was STATIC-only, all runtime outcomes remain transcript evidence. I did not independently establish typecheck, Vitest, PostgreSQL, scaffold, or mutant results. I verified the current persistence ownership, SQL assertions, commit/tree identities, diffs, test counts, transcript contents, and D24/D27 envelope fields statically.

## PREDICTIONS

Another lens will probably accept M3′ because its D24 envelope is complete, without noticing that the mutation cannot compile into the claimed double-write. A second likely miss is treating the final cluster label's word “edges” as proof that the eight-test scaffold gate ran at `bf86a674`; its file/test cardinality says otherwise. I would check a valid import-alias regression first, then compare every final evidence record's commit and tree to the filed tip.
