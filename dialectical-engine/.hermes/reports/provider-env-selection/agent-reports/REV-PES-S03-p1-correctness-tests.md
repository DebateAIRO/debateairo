# REV-PES-S03-p1-correctness-tests — self-report

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## Cause

The widened pin checks that each enumerated code occurs somewhere in the §11 slice (`tests/unit/v9-provider-credential-files.test.ts:437`). R3.3 requires a refusal-table row. Three of the rows this slice added are repeated in the guard sentence one line below the table, so deleting the row leaves a green v9 (31/31) and a green architecture baseline (31/31). A reviewer who re-ran the cluster command and stopped would have reported PASS. The green suite is the symptom. The cause is an assertion shaped like a grep of the whole section, while the requirement is a row.

The second cause is the package. `review-packages/S03-p1/handoffs/` was an empty directory while `README.md:13` points the lens at `handoffs/*.md`. The orchestrator filled it at 14:28:26, during this pass, with the three READY comments. The PROGRESS check then ran. C1 and C2's README line numbers do not match the head (later clusters moved the rows); the source spans do. An empty directory at dispatch still forces the lens to either stop or wait. That is an orchestrator packaging miss, not a worker miss.

## Price

| finding | wall-clock | what it cost | what a repeat would cost |
|---|---|---|---|
| B1 row-deletion hole | ~15s of vitest after the shape was seen in the diff | one pass of reading `:437` plus 4 mutants (3 price rows + the unique-code control + the policy-row control) | a later lens that only re-runs `run-suites.sh` pays a full REV pass and still misses it |
| N1 empty handoffs | ~1 minute to confirm the directory and decide not to go read agent-reports outside the packet | charge 6's PROGRESS check is UNVERIFIED | every pass-2 lens re-derives the sweep from source instead of diffing a pasted record |
| cluster re-runs | ~7s for C1+C2+C3+acceptance step 2 | matched the frames; no finding | cheap, keep it |
| four RED-at-base suites | ~90s, almost all `t16` embedded postgres | pairs matched intake; no finding | the packet could quote the intake pairs and the failure names and tell the lens to re-run only if the diff touches `apps/` or `packages/` — this diff does not |
| typecheck | ~3s | one TS2835, delta zero | cheap |
| retype mutant | ~1s | confirms the pin cannot tell a literal `Set` from the source read, which PLAN §3 already says | do not make pass 2 re-prove it |

Token burn that did not move the verdict: the BUILD packets are 36 lines each but their PLAN line anchors (`:671-711` as §3) are stale against a PLAN whose §3 is now `:946`. Checking that is one `sed`. Re-reading the packets to reconstruct PROGRESS records that the package was supposed to contain is the expensive loop, and this seat stopped instead of reading agent-reports.

## Nearly got wrong

The packet parenthesis in charge 5 says the guard order is "parse → hosted rules → price". The whole boot is not that order: `assertHostedCostEnvelopesSealed` runs at `apps/api/src/main.ts:97` and `apps/runner/src/main.ts:38`, before `parseProviderDiscoveryTargets`. Filing that as a false sentence would have been a wrong REWORK. The sentence at `README.md:786` only puts `PROVIDER_DISCOVERY_TARGET_PRICE_INVALID` ahead of the two price codes. The target block is parse (`:300` / `:74`), then `assertDeploymentProviderTargets`, then `assertPricedProviderTargets`. That matches the sentence. The parenthesis is what almost became the pass test (TOOLING-TRAPS: a parenthesis that paraphrases becomes the seat's pass test).

Second near-miss: calling B1 "the case cannot fail". Deleting `SUPPORT_ADMISSION_SCOPES_NOT_SEALED` (its only mention) does turn `:437` red. The case is alive. The hole is the three price rows whose codes are repeated. A verdict that said the pin is dead would have been false.

## Dead ends

- `probes/ARCH-PES-S03/enumeration.mjs` hard-codes the `pes-s03` lane. Running it from this worktree does not read this worktree. An argv copy was used. `pes-s03` happened to be at the same sha, so the hard-code would have agreed today and lied the day the lane moves.
- `git checkout -- deploy/vps/README.md` is the documented way to undo a mutant and is also a git write this seat must not make, and the trap says it deletes other uncommitted work in that path. Restore was `cp` of a byte backup. Porcelain was 0 after every restore.
- A git-root-relative pathspec from inside `dialectical-engine/` prints an empty diff that looks like "apps did not move". The capability proof (`origin/dev~200...origin/dev -- apps packages`, 266 files) was run before the empty `origin/dev...HEAD` result was accepted.
- Do not re-run the four integration suites to "see the failure" a second time. The names are in `red-at-base.log`. They are the intake failures (premium CLI refs, `DEV_API_PROCESS_ENVIRONMENT_INVALID`, `toContain` on undefined).

## Where this packet was unclear

- Charge 4 says the mutant is "a code removed from §11's table". It does not say whether a second mention of that code elsewhere in §11 still counts as removed. The interesting mutant is "delete the row, leave every other mention". The parenthetical reads as if any row deletion must go red. It does not, and that difference is B1.
- Charge 5's parenthesis collapses two orders into one. PLAN C1-3 at `:405-431` is the precise claim. The parenthesis is the part a seat will grade.
- Charge 6 says check the handoffs' `## PROGRESS records`. Charge 2 says those handoffs are `handoffs/*.md`. The directory is empty, and `README.md:1` says the reading "lives beside this package, in no lens's inputs". Those two sentences contradict. The legal move was UNVERIFIED, not a hunt through agent-reports.
- C1 and C2's cluster commands are specified with pairs (24/0, 28/0) that are red at the slice head by construction. The charge says a disagreement with `frames/*-gate.out` is a finding. The frames are CLUSTER_RED. A seat who treats CLUSTER_RED as a product failure will file a false B. The package README explains it; the charge line does not.

## Upgrades, ranked by tokens saved

1. Copy the READY handoff, the refutation matrix, and `## PROGRESS records` into `handoffs/` before dispatch. An empty directory forces every lens to re-derive the sweep or to mark the charge UNVERIFIED. That is the largest repeat cost on this pass.
2. In the correctness-tests charge, name the mutant that must stay red as "delete the table row and change nothing else", and name the three price rows as the members. The seat then has a one-line probe instead of a discovery pass.
3. State, in the charge, that C1 and C2 at the slice head are expected CLUSTER_RED on their own pairs, and that the product pair is C3's 31/0. Saves a false REWORK and the argument about it.
4. Stamp the PLAN sha next to every `PLAN.md:line` in a BUILD packet. `671-711` as "§3" is now C2 body text. The command was duplicated in the packet, so the seats landed the right pairs, but the next reader pays to rediscover that.
5. Make `enumeration.mjs` take the worktree as argv. A hard-coded lane is a probe that reviews the wrong tree the moment the lane moves. This pass checked the sha by hand.
