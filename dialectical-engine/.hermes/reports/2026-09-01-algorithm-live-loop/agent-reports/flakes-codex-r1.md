CODEX REVIEW FLAKES r1 — CHANGES · comments read through: flakes-r1-2026-09-08
SKILLS LOADED: superpowers:using-superpowers (including Codex reference); codex-security:assess-patch-risk (including rubric and schema); superpowers:verification-before-completion.
Counts: 2 blocking review findings (P2 ×2; P0/P1/P3 ×0). POL-03 cleared. T9 requires rework. One acknowledged worker workflow charge, distinguished below from code findings.

Reviewed the complete reviewer packet, worker packet and identical dispatch, worker report and self-report, the immutable diff, affected source and callers, and the saved evidence described below. Source paths below are relative to `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-flakes/dialectical-engine`; mission paths beginning `logs/`, `packets/` or `agent-reports/` are relative to `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop`. Source line numbers are at the reviewed head unless marked base.

Patch identity: base `169941c6f1d9d2e50019550f78cb48d89288c49c`; head `b1c9ee33e6c5d10359063ce9479ceea512537216`; one commit on clean `lane/flakes`. The exact bytes from `git diff --no-ext-diff --no-textconv --binary <base> <head>` are 11,406 bytes, SHA-256 `a1249a632da3d7053a864ec46ad30f22298b3306f2547212ecfa2905e0f5ce10`. Changed files: `tests/support/poolFailureChild.ts`, `tests/integration/registration-database.test.ts`, and an append to `.hermes/TOOLING-TRAPS.md`. STRENGTH: entailed by Git inspection.

## Findings

### F1 — P2: an unresolved product signal is unconditionally converted to a successful skipped gate

**File/line:** `tests/integration/registration-database.test.ts:7038` and `:7046`; rationale at `:6732` and `:7039`; deciding predicate at `:6674–6688`.

**Input → wrong outcome:** a family-rejected result without two locally significant, same-sign AUC replicates now calls `context.skip`, so the command can exit 0 without establishing equivalence or a measurement-invalid condition. `replicatedDirection` incorporates local significance as well as signs; false does not mean that signs flipped, nor does it identify the origin of the difference. For example, a repeatable arm-dependent change in distribution spread can reject through the accuracy endpoint while directed AUC remains tied. Its zero signs cannot satisfy `:6678–6683`, even if the effect repeats in all three replicates. A state-dependent effect confined to one replicate also lacks the required replication. Both can have median gaps below 100 ms. The new branch skips these unresolved signals without testing any independent measurement condition.

This is a reduction in the existing guard: the base assertion at `:6980` kept every such result red. The existing contract deliberately includes **both** AUC and accuracy (`:6506`, `:6592`, `:6630–6641`); its arm-effect control requires PRODUCT_REPAIR even with median gaps below 100 ms (`:6797–6801`). Those controls establish that the median bound alone is insufficient. The sibling row's “Permanent GREEN contract” at `:6214` covers opacity, response bytes and deadlocks in that row; it does not waive this row's separate distribution assertion. Neither the three enum names nor the existing design comments establish that all nonreplicating signals are environmental failures.

The observed dev case is correctly classified INCONCLUSIVE: `logs/dev-merge/09-full-suite-dev-70647e7e.log:2654` has `p_fwer=0.006348`, local rejects `false,true,true`, constituent signs `1/-1,-1/-1,1/1`, and pair gaps `0.045,0.558,0.456` ms. That evidence supports an undecided result; it does **not** entail the worker's claim that a product defect is absent. In particular, `agent-reports/flakes.md:93–94` (“DIRECTION FLIPS”; “A product-side timing leak has one direction”) overstates what the predicate proves.

**Required fix:** retain a non-successful unresolved disposition unless a separately evidenced measurement-invalid condition authorizes the typed skip. Keep its diagnostic cause, the 0.01 threshold and PRODUCT_REPAIR failure. Document the actual acceptance policy without asserting that nonreplication proves noise. Add deterministic controls for the nonreplication/accuracy-only boundary through the disposition being changed, including a naturally INCONCLUSIVE evaluator result; the present forced-label transcript is insufficient to establish this distinction. If the intended policy is instead to waive every statistically inconclusive run, the contract must explicitly accept that narrower regression coverage; the supplied test comments do not already do so.

**STRENGTH:** entailed for the predicate, the newly successful skip path, and the missing measurement-condition check; consistent-with for the described product-origin scenarios, which were not reproduced against the product. This is a test-contract regression finding, not a claim of a newly validated production vulnerability.

### F2 — P2: the cause does not identify the statistical endpoints it reports

**File/line:** `tests/integration/registration-database.test.ts:6743–6746`; cause assertions at `:6807–6821`.

**Input → wrong outcome:** an INCONCLUSIVE row carries six anonymous `raw_p`, `observed` and `q99` values, but three anonymous `holm_local` values. There is no endpoint legend or replicate identifier. A reader cannot tell from the receipt which value belongs to AUC versus accuracy, or which pair it describes, without reconstructing `endpointKinds` and the nested loop. For the dev failure, the second and third replicate pairs reject locally, but that association is absent from the cause itself. This misses worker-packet outcome 2's explicit “which endpoints failed” requirement. “Endpoint” here means the six statistical endpoints, not six HTTP routes.

**Required fix:** attach stable endpoint identities to the output, for example `r1.auc`, `r1.accuracy`, through `r3.accuracy`, with each endpoint's raw p and observed statistic; label the replicate-level Holm/sign data separately. An explicit ordered legend is also sufficient. Pin these identities and the required observed-statistic content in the cause contract. Observe the cause actually delivered to the INCONCLUSIVE disposition: removing it only from the `context.skip` call currently leaves the deterministic `blockedCause` assertions untouched. Preserve the existing PRODUCT_REPAIR and bound failure messages.

**STRENGTH:** entailed by the formatter, assertions and saved skip row (`logs/flakes/r1-06-mut4-t9-forced-inconclusive-skips.log:205`).

## POL-03 assessment

The harness diagnosis and minimal fix are sound. At base `poolFailureChild.ts:47`, the caller held the transformed query promise across `delay(50)` and `terminateBackend`. At head `:53`, calling `expectFailure` immediately installs the handler before either await. Its returned receipt promise resolves for the expected rejection and is awaited at `:56`. Even an unexpectedly successful query becomes a sentinel receipt that fails the unchanged typed-code assertions; the fix does not turn success into an acceptable database-failure receipt.

`packages/db/src/index.ts:649` catches the original pg promise and returns the resulting chain. The rejected promise returned inside the callback is adopted by that chain. Correctly awaiting/catching the returned client query therefore observes the typed failure; there is no detached promise in that path. The pool-query wrapper at `:683` and promise connect path at `:704–707` follow the same ownership pattern; the idle pool error listener at `:663–666` records a terminal failure, and subsequent query/connect calls return their failure to the caller. No source-visible unhandled-rejection path was found in these termination paths for a caller who handles the returned promise promptly. This is scoped static reasoning, not a universal guarantee about every pg usage or client event.

The unchanged shipped row at `pol03-pool-resilience.test.ts:27–39` still checks exit 0, the idle-failure diagnostic, `survived: true`, and both `TypedDomainError`/`DATABASE_POOL_FAILED` receipts. No product file changed. STRENGTH: entailed for the promise ownership and preserved assertions; consistent-with for attributing every historical crash to that timing window.

I recounted the individual `run=` records, rather than accepting only their summaries:

| Saved observation | Runs | Nonzero child exits | Missing receipt / escape at :649 | Evidence |
|---|---:|---:|---:|---|
| Base, unloaded | 40 | 0 | 0 / 0 | `logs/flakes/03-red-pol03-childloop-unloaded.log:318` |
| Base, 8 burners | 120 | 30 | 30 / 30 | `logs/flakes/04-red-pol03-childloop-load8.log:1251` |
| Working-tree fix, 8 burners | 120 | 0 | 0 / 0 | `logs/flakes/05-green-pol03-childloop-load8-fixed.log:802` |
| Final-head escape-restoring mutant, 8 burners | 60 | 13 | 13 / 13 | `logs/flakes/r1-06-mut1-pol03-escape-restored.log:649` |

STRENGTH: entailed as saved observations. The 25% rate is specific to those samples. The 0/120 capture explicitly says the fix was uncommitted (`05-…:1–3`); it is not an immutable final-head loaded gate. Its attribution to the same final fix is consistent-with, not independently sealed by the base commit/tree stamp. Final-head POL-03 gates and the shipped-row mutant provide additional support. The crash frames and code match the historical failures after normalizing the checkout path (`04-…:74–86`, dev `02-…:44444–44456`, evaluator `97-…:45569–45581`).

## Saved gates, mutants and custody

All 15 acceptance records have one final-head header, the correct tree, a named project-local tool, and empty tracked porcelain before and after. The three baseline and three head typechecks contain exactly the same eight diagnostics, all in `tests/unit/s14-ui.test.ts`; all six diagnostic bodies have SHA-256 `b4602fbc2fd076c4528a006b8b7d70299042153cda597d584def2b471b66a3be` when joined with newlines without a trailing newline. These are identity passes, not successful typechecks. STRENGTH: entailed from records.

| Gate group | Saved exits | Observation | Wrapper wall seconds from `r1-00-GATE-SUMMARY.log` |
|---|---|---|---|
| Typecheck ×3 | 1, 1, 1 | Eight unchanged baseline diagnostics | 5, 3, 4 |
| POL-03 file ×3 | 0, 0, 0 | Three tests pass each time | 10, 9, 8 |
| T9 isolated ×3 | 0, 0, 0 | T9 GREEN; 68 other rows filtered | 327, 327, 330 |
| T9 under 8 burners ×3 | 0, 0, 0 | T9 GREEN; 68 other rows filtered | 386, 367, 396 |
| Registration whole file ×3 | 1, 1, 1 | 68 passed / 1 failed each time; T9 GREEN | 1971, 2026, 2000 |

The whole-file Vitest durations are 1967.04, 2019.73 and 1995.18 seconds; wrapper durations above include overhead. All nine unmutated live T9 runs are GREEN. There is no naturally occurring typed skip in this record set.

The sole whole-file failure is `S3d post-hash main-process secondary RSS tripwire stays flat and counts every refusal`, at `registration-database.test.ts:4237:40`: 4, 3.484375 and 4.515625 MiB versus 2. The earlier dev `02-…:44478–44483`, dev `09-…:45219–45224`, and evaluator `97-…:45603–45608` have the same row and assertion, with 3.5, 3.484375 and 3.390625 versus 2. Thus membership in the previously observed failure set is entailed. Attribution as unchanged at the exact base remains consistent-with: no whole-file `169941c6` baseline is supplied. This is not charged as a new failure caused by the patch.

All five final mutant transcripts contain one header, pre=0, applied=1, restored=0, matching before/after SHA-256 and empty porcelain. I compared both hashes against the head blobs: child `bb9948682a87106ce49d1dd3baa49d5e631380aff47c4f619cf14613af9f8610`; registration test `0ca81f245a1ec0675321ec044f04688b2dc3c717be9676d23e426fca9395a877`.

- `mut1`: 13/60 child failures; exit 1. The direct driver measures child exits, not the full typed receipt.
- `mut5c`: the shipped POL-03 assertion at `:27:42` fires on iteration 3 (`:546`, `:556`); iterations 1 and 2 pass. This is the intended original failure, not a fixture timeout.
- `mut2`: removing the shared `replicated_direction` clause kills `registration-database.test.ts:6821`; exit 1, 55.86 seconds. This pins that shared formatter clause on PRODUCT_REPAIR control data, not delivery of the entire INCONCLUSIVE cause at its call site.
- `mut3`: the local rename survives, three tests passed, exit 0.
- `mut4`: at `:7` the mutant bypasses the live GREEN condition. The resulting row at `:205` is genuinely skipped with its cause; `:255` says 69 skipped and `:259` exit 0. But the cause says **`family_rejected=false p_fwer=0.934082 local_reject_count=0`**. This state is impossible for INCONCLUSIVE under the unmutated evaluator. It proves Vitest skip wiring and rendered cause, not a real measurement-condition failure or the safety of F1's policy.

The aborted timeout transcript ends `RESULT: FAIL interrupted`; it does not seal successful post-restore gates. The other aborted attempt is explicitly annotated as a database-start hook timeout, not a pin. Neither was counted among the five accepted mutant records. The worker's prose that the first interruption occurred “during its post-restore gates” is not supported by its transcript: iteration 4 exits 143 at `:616` before the restore step, followed by the trap message at `:630`. This custody-description correction does not invalidate the subsequent successful `mut5c`.

I reran the read-only canonical comparator, with exit 0:

```text
records compared: 21 · failures: 0
OK: every record stamps the filed tip
```

Population: 15 acceptance records, five final mutant records and the summary note. This establishes record identity and completion framing, not independent re-execution. The mutant hashes and outcomes above were inspected separately. STRENGTH: entailed for the recorded custody and fresh comparator result.

## Packet audit

- **Contract reach — clear for the actual diff.** The worker packet explicitly grants the child and the T9 output/assertion/disposition changes, plus an append to TOOLING-TRAPS. No product, dependency, unrelated test, board or DECISIONS edit appears in the commit. The older POL-03 board contract is narrower, but the explicit dispatched packet supplies the expanded scope. If a product cause had been found, the nominal `:600–660` grant would not cover the actual idle listener and pool wrappers at `:663–707`; that boundary did not impede this harness fix.
- **Records block — clear.** The canonical `## Records and gates (binding)` section matches verbatim, including all bullets. The canonical file's introductory title is not part of that section. Worker packet and filed dispatch are byte-identical. The initial comparison including the canonical title was deliberately corrected before this conclusion.
- **Provisioning and baseline handoff — qualified clear.** `01-provision.log:10` is the required last line at the base. All three baseline gates are at the exact base and contain the expected compiler identity. The baseline note discloses and corrects a prefix comparison that included itself without a stamp. Contrary to the block's generic “separate base worktree” wording, the records identify the lane worktree, measured while still at the base; this is a packet/handoff description discrepancy, not evidence that the worker reset the lane. A whole-file baseline was not supplied. The worker's restricted S3d attribution is acceptable at consistent-with strength; it cannot become an exact-base proof.
- **Facts and locations — correct the imprecision.** Base T9's `:6980` is the final assertion, not the test declaration (`:6461`); the current callback remains `:6461`, not the worker report's `:6462`; `replicatedDirection` returns at `:6719`, not `:6733`. The evaluator/rule offsets in the worker packet refer to the base and become `:6590`/`:6684` at the head. POL-03's base `:47` becomes head `:53`, correctly. The registration file has 8,450 lines at head and 8,382 at base; the worker self-report repeats the base count, and the packet's “7,000-line file” is approximate. More materially, “direction flips” is not the classifier's full condition; see F1.
- **Evidence limits — clear when stated narrowly.** The archived 0/120 working-tree probe is outside final-head records and disclosed as such. It is not an exact-head strength claim. Nine GREEN T9 runs meet the requested repeated observations, but do not prove skip behavior on naturally inconclusive data. The forced transcript supplies only the wiring demonstration described above. No extra lucky-run search was required.
- **Skills — one acknowledged workflow charge.** The worker explicitly did not load `using-superpowers`, required by its router/protocol. That admission stands. Do not add a second charge merely for `receiving-code-review`: the worker/protocol skill scopes it to rework, and this was round 1 without received rework. These are workflow observations, not an inferred failure of the POL-03 code.
- **Tool identities — clear with platform limitation.** Gates identify Node 25.7.0, pnpm 11.20.0, Vitest 4.1.10 and TypeScript 7.0.2. The declared engine is Node 22.23.1. No new programmatic compiler check was added, so the `typescript-classic` 5.9.3 rule was not exercised by this patch.

## Tickets to file

Rework the existing **F-FLAKE-T9-RESEND** ticket for F1 and F2; no new production-vulnerability ticket is established here. POL-03 is clear for this round.

The unattended `issued` array at `registration-database.test.ts:6872–6886` is an optional separate test-hardening task, outside the granted T9 output/disposition edit. Its promises are joined only after the issuance loop. `injectResend` converts ordinary API failures to observations at `:5574–5596`, and the following mapper constructs a plain result, so no currently occurring rejection was demonstrated. Do not file it as a confirmed second POL-03 crash. Also avoid the absolute “catches everything” claim: code in a catch/formatter can itself throw. The previously observed S3d failure needs no duplicate ticket from this review.

## Landing

**Textual landing: clean. Semantic recommendation: CHANGES / revise.** `dev` still resolves to `169941c6f1d9d2e50019550f78cb48d89288c49c`, which is the head's sole parent and merge base. `git merge-tree --write-tree <base> <head>` ran with a disposable `GIT_OBJECT_DIRECTORY` and the source object database read through `GIT_ALTERNATE_OBJECT_DIRECTORIES`; exit 0, no conflicts. The temporary object directory was removed. No source Git objects, index, branches, worktrees or refs were mutated.

Result tree: **`bc9408474e473f2cad7a23aa7ebed4183181de5e`**, identical to the lane's head tree. HEAD and empty porcelain were rechecked afterward. STRENGTH: entailed. A clean merge tree does not resolve F1/F2.

Patch-risk dimensions: impact **moderate** (test acceptance can miss unresolved product behavior; no production state changes); likelihood **high** (the skip's contract and missing boundary coverage are material); protection **partial** (good POL-03 evidence and existing positive controls, incomplete T9 disposition protection); recoverability **easy** (isolated test/docs revert); confidence **moderate** (static analysis plus saved runs, with the exact limitations below). Risk of not merging: the known POL-03 child race and T9 red-row ambiguity persist. The validated structured assessment is embedded in the companion self-report, keeping output to the two requested files.

## Not verified

- No tests, typechecks, mutations, load probes or full suites were rerun by this reviewer. The packet permits static review plus saved artifacts; the optional one POL-03 execution was not used. Consequently there is no reviewer-observed sandbox `listen()` refusal or fresh test pass to claim.
- No exact-base whole-registration-file run; no Node 22.23.1 run; no unwrapped-pool comparison; no naturally INCONCLUSIVE final-head live T9 run.
- F1's product-origin cases are static counterexamples to the claimed inference, not reproduced product defects. The review does not supply new permutation p-values for them.
- Saved records establish their printed observations and custody, not independent attestation of historical execution or a universal zero flake rate. The 0/120 working-tree probe lacks an immutable hash of the changed source at measurement time.
- The evaluator report states POL-03 occurred in two of its five runs (`agent-reports/t1-oracle-evaluator.md:1752–1755`); those five complete raw suites were not independently recounted here. The granted evaluator gate's crash was inspected directly.

REVIEW: changes — retain the supported POL-03 fix, but resolve T9's unconditional inconclusive waiver and identify the endpoints in its diagnostic receipt before landing.
