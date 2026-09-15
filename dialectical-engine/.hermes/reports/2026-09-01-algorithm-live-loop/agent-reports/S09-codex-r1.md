CODEX REVIEW S09 r1 — CHANGES · comments read through: s09-r1-2026-09-02
VERDICT: REWORK — filing r1 = rework 0/3; 4 blocking findings, 0 non-blocking findings

# Scope and method

I read the packet in full with its rulings first, then the reviewer contract, heartbeat protocol, frozen T17 goal/board, worker report and self-report, committed source, filed logs, and the unmerged lane-s07 serve implementation. This was a **static review only**: I ran no tests, builds, installs, provider calls, or mutating git commands. The reviewed S09 tip is `0412689d9731a7c7c123f4408e4980d969bbdd86`, tree `da267bdcc4ae1b61debef64843209b5248e5d748`.

# Findings

## B1 — The required maximum-path same-ledger test does not exist

`tests/unit/t17-envelope.test.ts:73-121` constructs an in-memory list of sites and sums declared worst-case attempt counts. Its coverage checks at `:149-169` compare the closed form with that second arithmetic model; they do not run the topology or read a ledger. `acceptance/run-acceptance.ts:271-275` does read a ceremony's total `MODEL_CALL` rows, and `acceptance/panel01-depth1-proof.ts:27-44` plus `acceptance/xrev01-depth1-proof.ts:27-44` compare that total with the ceiling, but the filing itself says at `agent-reports/s09-envelope.md:361-373` that this is a clean run spending one attempt per site, not a maximum-attempt path. Those proofs also merely comment that panel calls are included; they do not query or assert any `PANEL:` rows.

Concrete escape: if panel calls cease to be ledgered, or a live retry limb spends more than the modeled attempts, the in-memory enumeration still agrees with the formula and a clean ceremony can remain below the generous ceiling. The exact DoD—an observed maximum-path attempt count from the same ledger, with panel attempts included—is therefore unproved. Add a deterministic maximum-topology run whose controlled provider outcomes consume every allowed sequence while succeeding late enough to finish the topology; assert the ceiling against that run's ledger total and assert the expected panel-namespace count from the same ledger.

## B2 — The “over-bound” admission test contains no over-bound input, and depth 6 is admitted

The cases at `tests/unit/t17-envelope.test.ts:305-316` exercise zero, fractional, and negative values only. None is above a sealed maximum. `packages/contract/src/index.ts:107-118` accepts `depth_params` as an arbitrary record; `packages/register/src/index.ts:231-235` checks only that every formula member is an integer at least one; and `apps/api/src/index.ts:1177-1187` accepts the resolver result without applying the live depth bound. The actual `1..5` rule exists later at `apps/runner/src/index.ts:1315-1323` and in the stored-basis parser at `packages/budget/src/index.ts:43-69`.

Concrete failure: an ask with `depth_params.depth = 6` mints a positive depth-6 ceiling and passes ask admission, then stops later when the runner parses or resolves the depth. That violates the T17 DoD's loud refusal **at admission**. Enforce the upper bound in the admission/formula path and pin depth 6 as a typed `AskRefusal` at `evaluateAskAdmission`.

## B3 — Three new required disclosure fields are absent from the individual refusal matrix

The v3 receipt schema requires nine newly disclosed nested members at `packages/budget/src/index.ts:48-64`: two additions under `per_site_attempts`, four `call_sites`, and three `serve_leg` members. The “each disclosure field” matrix at `tests/unit/t17-envelope.test.ts:241-263` covers only six. It omits `call_sites.author`, `call_sites.serve`, and `serve_leg.composition_sites`, while the filing claims complete individual coverage at `agent-reports/s09-envelope.md:323-326`.

Concrete escape: changing any omitted member to `.optional()` still lets the producer's complete-object assertions pass, the stale-v2 fixture still fails for other missing fields, and none of the six deletion cases exercises the weakened member. Extend the one-field-at-a-time matrix to all nine new disclosure members and rerun the discriminating mutant check against the complete set.

## B4 — The paired evidence and scope accounting were not refreshed after the final commit

`logs/s09/PREEXISTING-paired-base-head.log:14` records HEAD `44834a6c`, while the filed tip is `0412689d`; the latter adds 24 lines to `tests/unit/t17-envelope.test.ts`. D27 makes a stale-tip verification record inadmissible even when the intervening change appears harmless. The same missed refresh is visible in `agent-reports/s09-envelope.md:378-395`: it reports `+570/-49` and 294 T17-test lines, whereas the filed diff is 14 files, `+594/-49`, with 318 T17-test lines.

Refile the paired base/head proof at base `e040b1ee` and exact head `0412689d`, including commit/tree/clean stamps, then refresh the report's diff accounting and hash. I enumerated the other filed gate records: typecheck, all three green-cluster records, zone, and mutant evidence are stamped at the filed tip/tree; the stale pair and its stale report accounting are the exceptions.

# Verified claims

## Cost arithmetic

The corrected arithmetic is sound in source. `buildCrossRootExchangePlan` creates `M(M-1)` **nodes**, not panel calls. All materialized nodes receive an author call; `runJudgePanel` skips the author and calls the other `M-1` makers; the reviewer visits each materialized node; author and reviewer use `withCooldownRetry`, whose two provider sequences spend `2*judgeMaxAttempts + finalRetryAttempts`; panel members spend `judgeMaxAttempts`; and provider repair remains inside the site's `maxAttempts` loop. Thus:

`nodesPerRoot = 1 + Σ(2^level)`, `materializedNodes = M*nodesPerRoot + M*(M-1)`, author sites = reviewer sites = `materializedNodes`, panel sites = `(M-1)*materializedNodes`, and serve sites = `max(maxRecompose*fixedOrgansPerComposition, synthesizerMaxRounds+evaluatorMaxRounds)`.

For `M=2`, depth `1`: nodes/root `3`, materialized nodes `8`, author/panel/reviewer sites `8/8/8`, cooldown attempts `7`, panel attempts `3`, and serve sites `8` at three attempts each. Total: `8*7 + 8*3 + 8*7 + 8*3 = 160`, replacing v2's 88.

## Unmerged T9 serve leg and W12 merge re-verification

At the unmerged lane-s07 tip, `packages/serve/src/synthesis.ts:465-516` runs at most three rounds, with one unconditional synthesizer call and one unconditional evaluator call per round; the only loop exit is after a satisfied evaluator verdict. The maximum loop is therefore six call sites, and the S09 `max(composition=8, synthesis-loop=6)` serve term is correct in both the current and intended post-T9 worlds.

After merging T9, W12 must re-verify all of the following: the old composition/conformance provider chain was removed rather than duplicated; each round still has exactly one unconditional synthesizer and evaluator call; early exit remains only after the evaluator verdict; the runtime loop-round policy and the two envelope-row round values have the same sealed provenance/value; composer and conformance attempts remain bounded by `organMaxAttempts`; the J22 production entry-point changes combine additively; and `maxRecompose` truly has no runner reader before retiring or simplifying the composition arm.

## Sealed inputs, entry points, and loud stop

No policy constant was introduced. The formula reads T16's existing sealed `envelopeFormulaInputs`; the eight ENGINE/RUNNER call-site declarations were removed without changing values. Both production entry points now read the row before provider spend: API boot resolves it before provider discovery/ask handling, and acceptance resolves it before relay startup. Missing input stops loudly at claim/admission setup, satisfying J12's placement requirement.

## Worker findings and authority meaning

All five disclosed worker findings are materially accurate:

- F-S09-1 is a real deploy-boundary consequence of strict v3 receipt parsing and is correctly routed for drain/migration/accepted-refusal choice.
- F-S09-2 is a real omission-to-`NaN` defect fixed by validating declared members rather than `Object.entries(input)`.
- F-S09-3 correctly attributes the two stable-red failures to fake clients matching `pg_advisory_lock` while production issues `pg_try_advisory_lock`. Under D30 these names are historical baseline evidence only: after the fixtures are fixed and the merged base is rederived, the names must be removed from authority/allowlists, not preserved as authorized red.
- F-S09-4 correctly identifies `maxRecompose` as dead only on the unmerged T9 future, not on S09's base; W12 must recheck before simplifying.
- F-S09-5 correctly discloses the acceptance claim-lease increase caused by the maximum M=2/depth-5 ceiling moving from 1048 to 2200.

The filed mutant record satisfies the D24 OLD/NEW, application, restoration, result, diff, and dual-hash structure and reports five caught mutants plus one intentionally uncaught neighbour. B3 limits the breadth of the repaired M5 assertion; it does not contradict the logged result for the two fields actually mutated. The packet's marker, allowed paths, report hash convention, tip/tree, and requested review scope are internally consistent; I found no packet defect.

# PREDICTIONS

These are falsifiable consequences of the findings. Before B2 is fixed, a static admission probe with depth 6 will resolve a v3 basis rather than reject at `evaluateAskAdmission`, with rejection deferred to runner/basis parsing. Before B3 is fixed, making any one of `call_sites.author`, `call_sites.serve`, or `serve_leg.composition_sites` optional will leave the six-case deletion matrix green. A controlled M=2/depth-1 maximum-attempt run will ledger 160 attempts only if all eight panel sites contribute their three attempts; omitting panel ledger rows yields 136, which the current `<=160` ceremony assertion still accepts. Refiling the paired record at `0412689d` should reproduce the same two fake-pool failures, while refreshed scope accounting will report 14 files, `+594/-49`, and 318 added T17-test lines.
