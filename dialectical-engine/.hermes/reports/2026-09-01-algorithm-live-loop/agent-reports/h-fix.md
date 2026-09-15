READY FOR PEER REVIEW · comments read through: h-diag-r1-2026-09-05

# H-FIX — round 1

Lane `lane/h-diag` (h-fix work), base `d08ee9283244dcfb76d68820360810c7749940d6` — verified as my
first action, as the packet required. Two files changed, nothing staged, 0 mode changes.

## What changed

**Product — `packages/liveness/src/index.ts:144` (F-H-2).** The candidate filter in
`recordQuery` called `core.run_private_content_is_live(run.run_id)` bare. It is now guarded:

```sql
AND (run.content_encryption_version IS DISTINCT FROM 1
     OR core.run_private_content_is_live(run.run_id))
```

with a comment naming the defect, the commit that introduced it, and an instruction not to
"simplify" it back.

**Test — `tests/integration/database.test.ts` (F-H-1 + F-H-2 coverage).**
- `:3954` `verdict_state: "SUPPORTED"` → `"CONTESTED"`, and `condition_marks` gains
  `LABEL-BASIS-INCOMPLETE`, above a nine-line comment stating WHY (rung 0, both limbs absent,
  T11 / goal 196-221, confirm-item 6).
- A new `describe("F-H-2 · liveness refresh with content encryption off")` with two tests,
  appended at the END of the file — see "declared last" below.

**Mechanism choice (D58), and why not the other two the packet offered.**

- **Rejected: restore the two `NOT EXISTS` clauses `970870f3` wrote.** That is the
  pre-regression code, but it is not merely the pre-regression *behaviour*: the helper also
  checks `identity_user.state='active'`, which the inlined pair never did. Restoring the pair
  would silently drop the active-user check on the ENCRYPTED path — a security-relevant
  loosening. `2d1f86b8` broke the unencrypted path while tightening the encrypted one; only the
  first half should be undone.
- **Rejected: make the helper honest about its precondition.** It is `SECURITY DEFINER` with
  twelve TypeScript call sites and five more inside `migrations/0040`, several of the form
  `IF NOT core.run_private_content_is_live(...) THEN <refuse>` in erasure enforcement. Making it
  return true for unencrypted runs would flip those refusals into permits. It also needs a
  migration, which is not in my contract.
- **Chosen: guard at the call site.** For `content_encryption_version = 1` the predicate is
  bit-for-bit what it was, active-user check included; for anything else it is `true`, which is
  correct because there is no private content to have been erased. I used the `IS DISTINCT FROM 1
  OR …` spelling rather than `:205`'s `CASE … ELSE true END` because the closest sibling *by
  syntactic position* is `core.lock_owned_live_runs`, which guards the same predicate in a WHERE
  clause exactly this way. `:205` uses CASE because it is a SELECT projection.

## F-H-2 · VERDICT / CONFIDENCE / STRONGEST COUNTER

**VERDICT: fixed at the root.** The unguarded predicate was the single point of failure; every
other gate on the path was already measured passing in the diagnosis (`owned: true`, question
match, `lock_owned_live_runs` returns the run, the in-loop erasure gate returns `live: true`).

**CONFIDENCE: high**, on a reverted-mutant proof rather than on the fix passing its own test —
see MUTANT 1 below, where reverting only this one hunk drops the lifecycle test straight onto
the staleness assertion.

**STRONGEST COUNTER, and it is a real one.** My neighbouring mutant
(`IS DISTINCT FROM 1` → `IS DISTINCT FROM 2`) was caught by **no test in the repository** — not
by mine, which is correct since they only exercise unencrypted runs, and **not by the 48-test
`s6-content-encryption-database` suite either**. So the encrypted half of my own guard is
unpinned: if someone deleted the guard's left operand tomorrow, an erased or deactivated owner's
encrypted run could re-enter `recordQuery`'s candidate set and no suite would notice. My change
is correct; the property it relies on is untested. **This is a finding, not a blocker** — the
gap predates me and closing it needs the s6 identity/owner harness, which is not in my contract.
Filed below as the ticket I would open next.

## F-H-1 · VERDICT / CONFIDENCE / STRONGEST COUNTER

**VERDICT: stale expectation replaced, fixture untouched.** `agentCount=1, depth=1` is left
exactly as it was; no runner-up was manufactured.

**CONFIDENCE: high.** MUTANT 2 (revert only this expectation, keep everything else) drops the
test back onto the label assertion, so the edit is load-bearing and independent of F-H-2.

**STRONGEST COUNTER.** Changing an expectation to match observed output is how a real regression
gets papered over. What separates this from that: the frozen goal (sha256 verified
`78238eeb…6381986`) names this fixture's class in rung 0 *by name* — "the mono-maker skeleton
… → CONTESTED + mark `LABEL-BASIS-INCOMPLETE`" (goal 199-202) — and names the retired binary
function by address in T11's DoD (`packages/serve/src/index.ts:662-668`). The property the old
assertion actually pinned was `usableBasis === true`, which is still pinned on the next line by
`verdict_unavailable: null`: current `deriveHonestVerdict` returns a non-null `unavailable`
**iff** `!usableBasis`. Nothing was lost, and the comment says so in the file.

## Blast radius: the encryption-off liveness refresh, proven

The lifecycle test proves the `ARCHIVED_REVIVED` transition end to end. It does **not** prove
that a query refreshes liveness at all, and that refresh is what feeds `sweep`'s
`HAVING max(query.occurred_at)` and `decideRetirement`'s `lastQueriedAt`. Two new tests pin it:

1. **`F-H-2 counts an unencrypted run as a candidate and records its QUERY event`** —
   `recordQuery` returns `1` and a `QUERY` row exists at the asked-for instant.
   RED was `expected +0 to be 1`.
2. **`F-H-2 keeps a re-asked run out of a later retirement sweep`** — a run queried on
   2030-06-01 is not archived by a sweep on 2030-06-02 under a 180-day window, however old the
   run is. RED was `expected [ …(2) ] to not include '60f1067f-…'`.

Test 2 is the user-visible half of the defect: before the fix, **a question being actively
re-asked was archived anyway**, because `lastQueriedAt` never moved off the run's creation
timestamp.

**Why these live in `database.test.ts` rather than a new `liveness*.test.ts`** (both are in my
contract): the property needs real PostgreSQL — `core.run_private_content_is_live` is a SQL
function — and `database.test.ts` already owns the embedded-postgres harness, migrations,
register seeding and the `createRun` fixture. A new integration file would have duplicated all
of it for two tests and added a second slow suite.

**Declared last, deliberately.** Test 2 calls `sweep`, which archives *every* qualifying run in
the register version, not just its own. Vitest executes in declaration order, so the new
`describe` is appended at the end of the file where its side effect cannot reach any other test.
I did not assume that — I ran the whole file (below).

## RED evidence

| gate | log | result |
|---|---|---|
| F-H-2 RED run 1 | `r1-fh2-RED-run1.log` | Tests 2 failed \| 85 skipped (87), EXIT 1 |
| F-H-2 RED run 2 | `r1-fh2-RED-run2.log` | Tests 2 failed \| 85 skipped (87), EXIT 1 |
| F-H-2 RED run 3 | `r1-fh2-RED-run3.log` | Tests 2 failed \| 85 skipped (87), EXIT 1 |
| lifecycle RED, product untouched | `r1-lifecycle-RED-preexisting.log` | `verdict_state: 'SUPPORTED'` @ `:3953`, EXIT 1 |

Both new tests failed for the feature-missing reason, not a typo — verbatim:
`AssertionError: expected +0 to be 1` and
`AssertionError: expected [ …(2) ] to not include '60f1067f-918b-40aa-9041-e3088a07e69b'`.

## GREEN evidence

**Three-run law — worst run wins. Worst run GREEN in both clusters.**

| cluster | run 1 | run 2 | run 3 |
|---|---|---|---|
| lifecycle (`-t "claims, judges through the HTTP gateway"`) | 1 passed \| 86 skipped (87), EXIT 0 | same | same |
| F-H-2 (`-t "F-H-2"`) | 2 passed \| 85 skipped (87), EXIT 0 | same | same |

**Refutation duty — every change proven load-bearing, and one mutant that should not be caught.**

| mutant | expectation | observed | log |
|---|---|---|---|
| **1** revert ONLY the liveness guard, keep the label edit | lifecycle falls to the staleness cause | `expected { …(36) } to match object { staleness_state: 'ARCHIVED_REVIVED' }` @ `:4044`, EXIT 1 | `r1-MUTANT1-liveness-reverted.log` |
| **2** revert ONLY the label expectation, keep the product fix | lifecycle falls to the label | `expected { …(36) } to match object { verdict_state: 'SUPPORTED', …(4) }` @ `:3962`, EXIT 1 | `r1-MUTANT2-label-reverted.log` |
| **3** neighbour: `IS DISTINCT FROM 1` → `FROM 2` | my tests should NOT catch it (they are encryption-off only) | not caught: 2 passed — **correct** | `r1-MUTANT3-neighbour-fh2tests.log` |
| **3b** same mutant vs the encrypted path | s6 SHOULD catch it | **NOT caught: 48 passed** — the gap in "strongest counter" above | `r1-MUTANT3-neighbour-s6.log` |

Mutant 1 is the proof that the two causes were genuinely stacked and that one lane was right:
with the label fixed and the product reverted, the test does not pass — it moves to the next
cause, exactly as the diagnosis predicted.

Every mutant was reverted by copying a saved pristine file back, never with
`git checkout <sha> -- path` (which stages, per TOOLING-TRAPS). `git status --porcelain` after
each restore showed both files unstaged-modified and nothing staged.

## Suites

| suite | passed/total | exit | note |
|---|---|---|---|
| `tests/integration/database.test.ts` (WHOLE FILE) | **87/87** | 0 | includes the lifecycle test and both new tests |
| `tests/integration/s6-content-encryption-database.test.ts` | 48/48 | 0 | the ENCRYPTED path my guard touches — unaffected |
| `tests/unit/liveness-s11.test.ts` | 4/4 | 0 | |
| `tests/integration/evidence-database.test.ts` | 3/3 | 0 | uses `recordQuery` |
| `tests/integration/dev-database-principals.test.ts` | 9/9 | 0 | uses `recordQuery` |
| `pnpm exec tsc --noEmit` (root) | 0 errors | 0 | |

**No failures anywhere in what I ran, so there is nothing to date as pre-existing or mine.**
`tests/integration/database.test.ts` carried exactly ONE stable-red name — the lifecycle test —
in T0's authority (`t00-baseline.md:196`) and in the most recent batch
(`integration-suite-b12.log`, 1 failure in this file, same name). That name is now green, and
the file has no other failure.

## Not verified

- **The encrypted half of my own guard has no test** (mutant 3b). Stated as the strongest
  counter above; the ticket I would open is: *pin that an erased or deactivated owner's
  ENCRYPTED run is excluded from `recordQuery` candidates* — it needs the s6 identity harness,
  which is outside this contract.
- **`tests/integration/s7-authorization-database.test.ts`** also calls `recordQuery`; I ran the
  other three `recordQuery` suites but not this one. Not a claim either way.
- **The D15 batch has not been run.** My evidence is the six gates above, not a full-corpus
  measurement; whether the fix disturbs a suite I did not run is unmeasured by me.
- **`assertPrivateContentLive` (`packages/db/src/index.ts:485`) is still unguarded** with zero
  callers. Out of contract, untouched, named here as the packet instructed.
- **I diagnosed this defect and then fixed it.** That is not self-review, but the reviewer should
  know: the diagnosis in `agent-reports/h-diag.md` and this fix share an author, so the packet's
  instruction that the reviewer independently verify the diagnosis carries more weight than usual.

## PREDICTIONS

1. A D15 batch on this tree loses the lifecycle test from the known-red set and adds no new name.
   Confidence high for `database.test.ts` (measured whole-file); lower across the corpus, which I
   did not run.
2. The fix will turn some currently-vacuous assertions elsewhere into real ones — any test that
   called `recordQuery` and did not check its return value was previously exercising a no-op.
   The three suites I ran stayed green, so none of them depended on the broken behaviour, but I
   did not enumerate every caller.
3. If a reviewer proposes collapsing my guard back to a bare helper call "because the helper
   already handles it", that is the exact reasoning that produced `2d1f86b8`. The comment in the
   diff exists to stop it, and mutant 3b says no test would catch the mistake.
