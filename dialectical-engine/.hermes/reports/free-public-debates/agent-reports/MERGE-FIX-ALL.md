# MERGE-FIX-ALL self-report

## Case result

MERGE-FIX-ALL resolved 52 conflict hunks across 13 files, preserved the models.yaml-driven development provider set and the support-conversation topology, reconciled the public-only Assistant, restored the frozen S01 verification profile, and committed the merge as `53d877e1`. No push, desktop action, database mutation, process launch, or write to another mission worktree occurred.

## What happened

The merge joined histories that had diverged at `b7ca2c41`: the integration side had hundreds of later commits for plan tiers, dynamic provider identities, publication, and observability; the support side had its relay, topology, knowledge/navigation, and Assistant changes. Most conflicts were not line-choice conflicts. They were schema joins: a fixed support topology had to become a profile over the dynamic provider catalogue, and the Assistant had to retain AI disclosure and citations while discarding private-context behavior.

A second-order clean-merge break appeared in S7. The support commit carried evaluator-ranking inventory rows from a half-finished integration that the integration side had explicitly reverted. Git combined the rows with the reverted API, producing a second authorization failure. The final resolution kept the explicit revert and retained the support route changes, restoring the frozen 30/1 S7 baseline without introducing a missing-module TypeScript diagnostic.

## Ranked token and time costs

1. **No machine-readable semantic merge map.** Fifty-two hunks required separate base/ours/theirs and history archaeology. A generated table containing each hunk's introducing commits, capability labels, and expected post-merge invariant would have removed the largest reasoning cost.
2. **Baselines reported counts instead of failing test identities.** The database-principal suite's 15/1 result had to be rerun in isolation to prove the same role-isolation assertion already failed on ours. Baselines should record suite, case name, status, and diagnostic fingerprint.
3. **The broad source-reader gate mixed signal with unrelated repository debt.** Thirty-eight files ran for roughly three minutes and returned 450 passes, 18 failures, and one todo. Nine failing files then needed attribution. A baseline diff tool should classify unchanged failure fingerprints automatically and print only deltas.
4. **The packet's claimed HEAD was stale.** It named `49580f52`, while the assigned lane started at `971e938c`. The 13 target files were byte-identical and the named commit was an ancestor, so work could proceed, but proving that and filing a claim addendum cost avoidable checks. Packet generation should read the lane immediately before dispatch and include per-target blob IDs.
5. **Semantic deletions were not carried as tombstones.** The evaluator ranking detour initially looked like a clean-path feature omission. Only commit history and the missing type module exposed the explicit cleanup. A merge manifest should list deliberate removals that stale branches must not resurrect.
6. **The claim format was not enforced.** The first claim omitted required session/head/dirty metadata and needed an addendum. A `hermes claim` command should populate and validate those fields.

## Near misses

- A fixed five-provider support roster nearly displaced the integration side's models.yaml catalogue. The correct shape was a support topology profile applied to dynamic provider identities.
- The merged API-process fixture initially lacked `config/models.yaml` and still asserted legacy ports, causing six failures. Copying the real catalogue and deriving profile-aware targets repaired all ten cases.
- The Assistant could have regained private debate consent/context behavior. The resolution retained public guidance, sources/actions, citation disclosure, and follow-latest scrolling without private attachments.
- The evaluator ranking route was briefly restored to satisfy the cleanly merged inventory. Final typecheck and history review showed that would undo an explicit revert and add a missing-module diagnostic, so the stale inventory rows were removed instead.

## Dead ends and useful evidence

- Rechecking the database-principal failure did not produce a merge fix, but it proved the failure was inherited from ours and outside the allowed migration scope.
- Making S7 pass 31/31 was incorrect for this node because the frozen cluster intentionally includes a known authorization-inventory failure. The exact-count oracle correctly rejected that over-fix.
- The 38-suite source-reader run was valuable as a regression census but inefficient for diagnosis without named side baselines.
- Three repeated conflict-suite runs were stable: 71/72 each time, with only the inherited database-principal assertion failing.

## Upgrades toward a one-prompt machine

1. Generate packets from live lane state with target blob hashes, merge-base proof, conflict counts, and a validated claim command.
2. Attach a capability matrix: rows are target hunks; columns are ours behavior, theirs behavior, required invariant, and owning tests.
3. Ship one packet-owned `verify.sh` that installs offline, generates contracts, runs exact suites, compares named-case fingerprints against both sides, checks conflict markers, and emits the eight-line handoff data.
4. Record deliberate feature removals in a tombstone ledger consumed by merge preparation.
5. Replace hand-built integration fixtures with shared catalogue/topology fixture builders so runtime configuration and tests cannot drift.
6. Have the verifier write the self-report evidence table automatically, leaving the coding seat only the causal analysis and lessons.

These changes would turn the workflow from repeated forensic reconstruction into one prompt plus a deterministic, evidence-producing merge program.
