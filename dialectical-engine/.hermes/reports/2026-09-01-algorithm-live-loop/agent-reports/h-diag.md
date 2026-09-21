READY FOR HERMES STAGE REVIEW · comments read through: sealedrows-postcap-2026-09-04

# H-DIAG — round 1

Ticket `F-SEALEDROWS-H`. Lane `lane/h-diag`, worktree
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-h-diag/dialectical-engine`,
HEAD `7dda3cc0d3305c96e62dadb77f1eb941165d633a` (matches the packet), porcelain clean before
and after every measurement. DIAGNOSIS ONLY — no product or test file was edited.

## Which arm fired, with the persisted evidence

Rung 0, trigger `BASIS_INCOMPLETE`, with **BOTH** limbs absent. Read from
`ledger.propagation_run.served_root_selection` for the failing fixture's own run
(`logs/h-diag/r1-instrumented-basis.log`, probe `H-DIAG|served_root_selection|`):

```
"margin":      { "kind": "ABSENT", "reason": "SINGLE_SERVABLE_ROOT" }
"runnerUp":    null
"candidateCount": 1
"servedStrength": 0.72
"verdictLabel": { "rung": 0, "label": "CONTESTED", "trigger": "BASIS_INCOMPLETE",
                  "basisAbsence": ["MARGIN", "DISAGREEMENT"],
                  "disagreement": { "kind": "ABSENT",
                                    "reason": "FEWER_THAN_TWO_PARSEABLE_JUDGEMENTS" } }
```

Corroborating persisted rows from the same run:

```
H-DIAG|core.node_count|1
H-DIAG|nodes_length|1
H-DIAG|reduced_judgement|[{ "node_id": "33275410-…", "tau": 0.72, "dispersion": null,
   "disagreement": { "kind": "NOT_MEASURED", "reason": "SINGLE_JUDGE_WALKING_SKELETON", … } }]
H-DIAG|verdict_state|CONTESTED
```

The served disclosure names both limbs in its own words:

> "The three-state label was derived without a margin (no runner-up root exists to measure one
> against) and without a disagreement measure (the winning root's panel returned fewer than two
> parseable judgements); the label is CONTESTED because a basis this thin can never print
> SUPPORTED"

**Why both limbs are absent is the fixture's own request, not a degradation.**
`createRunnerWork("happy-path")` (tests/integration/database.test.ts:359) calls `createRun`
(:245) with its defaults `agentCount = 1, depth = 1`. One maker gives one root, so
`selectServedRootByStrength` (apps/runner/src/index.ts:1368-1378) finds `ranked[1] === undefined`
and returns `margin: ABSENT/SINGLE_SERVABLE_ROOT`. One judge leaves
`ledger.reduced_judgement.dispersion` NULL, so the runner maps the disagreement limb to
`ABSENT/FEWER_THAN_TWO_PARSEABLE_JUDGEMENTS` (apps/runner/src/index.ts:3413-3415).
`deriveVerdictLabel` (packages/serve/src/index.ts:1198-1208) returns rung 0 on either.

**Packet correction (§1 duty).** The packet reads the three provider calls as "one author call
plus a two-member panel". They are **judge + SYNTHESIZER + EVALUATOR** — the test says so at
:3866-3869 (T9 retired the composer and the two conformance calls). There is exactly ONE judge
and ONE panel voice, which is measured, not inferred: a single `reduced_judgement` row with
`dispersion: null`. The packet's conclusion (arm 0 by design) is right; its mechanism is not,
and it named margin OR disagreement where the measurement shows margin AND disagreement.

## Does the expectation predate T11

Yes, by eleven days, and T11 never revisited it.

| fact | measurement |
|---|---|
| expectation's file-path origin | `9801f85d` 2026-08-21 (`git log -S 'verdict_state: "SUPPORTED"' -- tests/integration/database.test.ts` returns this and nothing else) |
| test name's true origin | `f59aaf5c` — the original V3 S00-S14 build, older still |
| T11 ladder landing | `7e5ac0d7` 2026-09-01 23:47 "T10+T11: propagation picks the served root; the label is a code-derived ladder" |
| ordering | `git merge-base --is-ancestor 9801f85d 7e5ac0d7` → **true** |
| what T11 did to this file | `git show --numstat 7e5ac0d7` → **201 added, 0 removed**. It added new tests and touched no existing `verdict_state` line |

**What `SUPPORTED` meant when it was written.** At `7e5ac0d7^`, `packages/serve/src/index.ts:662`:

```ts
export function deriveHonestVerdict(input: { readonly usableBasis: boolean; readonly reasonRef: string }):
  return input.usableBasis
    ? { verdictState: "SUPPORTED", confidenceBand: null, unavailable: null }
    : { verdictState: null, confidenceBand: null, unavailable: { reasonRef: input.reasonRef } };
```

`SUPPORTED` was a **constant returned whenever the basis was usable** — a binary "an answer was
served", carrying no claim about how the debate came out. The frozen goal's own DoD names that
function by address as the thing to delete: *"replace the binary derivation at
packages/serve/src/index.ts:662-668"* (goal-prompt.md:214, sha256 verified
`78238eeb…6381986`). The information content of the retired assertion is today carried exactly
by `verdict_unavailable: null`, which the same test asserts and which still passes:
current `deriveHonestVerdict` returns a non-null `unavailable` **iff** `!usableBasis`
(packages/serve/src/index.ts:1264-1266). So the old assertion pinned a property the test
still pins by other means.

**The frozen goal puts this fixture's class in rung 0 by name** (goal-prompt.md:199-202):

> 0. margin ABSENT (single root: no runner-up exists) OR disagreement ABSENT (dispersion
>    reports fewer-than-two parseable judgements … — **the mono-maker skeleton** and the
>    PANEL-DEGRADED-SINGLE-VOICE path both land here) → CONTESTED + mark
>    `LABEL-BASIS-INCOMPLETE` (confirm-item 6: **a solo voice can never print SUPPORTED**)

## VERDICT: STALE TEST — the one deciding measurement

**`basisAbsence: ["MARGIN", "DISAGREEMENT"]` with `candidateCount: 1`.**

`SUPPORTED` is returned at exactly one place in the ladder, rung 3, and rung 3 is reachable only
after rung 0 declines — which requires **both** limbs `MEASURED`. This run has neither. So
`SUPPORTED` is not merely unmet here, it is **unreachable by construction**: no register tuning
of gamma, the high cut, the low cut or the disagreement threshold can reach a rung that rung 0
returns before, and no judgement confidence can help — the sibling T11 test proves that
separately by driving fidelity to 0.95 and still printing CONTESTED (:4826-4828).

The expectation is therefore **internally contradictory with the rest of its own test**. The
same `toMatchObject` block asserts `SINGLE-LINEAGE / MONO_MAKER_RUN` and
`CRITIQUE-UNAVAILABLE / MONO_LINEAGE_DEPTH_NOT_EXPANDED:requested_depth=1`, and those assertions
**pass**. A test cannot assert one maker at depth 1 and also assert the label that only a
multi-root, multi-voice run can produce.

**Falsifiers I tried, and how each died:**

| falsifier | result |
|---|---|
| the fixture seeds two roots and one was dropped after review | REFUTED — `core.node_count = 1`, `candidateCount = 1`, and `createRun`'s defaults are `agentCount=1, depth=1`. There was never a second root |
| a panel ran but its dispersion was not recorded | REFUTED — `dispersion: null` with `disagreement: NOT_MEASURED/SINGLE_JUDGE_WALKING_SKELETON`, and the test's **own** assertion of exactly that value passes at :3897 |
| rung 0 over-fires; it should need BOTH limbs, not either | REFUTED and moot — `basisAbsence` is `["MARGIN","DISAGREEMENT"]`. Both. Even the stricter reading gives rung 0 |
| the ladder is stuck at rung 0 for every run | REFUTED — the mission's own multi-root cases assert `margin.kind === "MEASURED"`, `runnerUp` non-null, and the mark ABSENT (database.test.ts:5548-5556; acceptance/ceremony.test.ts:555-556) |

The product is correct. It served the label the frozen goal ordered for the run the fixture
asked for, and it discriminates correctly on the other side of the same predicate.

## What the fix lane needs

**1. The label edit — necessary, and provably not sufficient.** Two unique-in-file lines:

```
:3909   verdict_state: "SUPPORTED",                                        →  "CONTESTED",
:3913   condition_marks: ["SINGLE-LINEAGE", "CRITIQUE-UNAVAILABLE"]        →  … , "LABEL-BASIS-INCOMPLETE"]
```

(`condition_marks` needs the third entry because `toMatchObject` compares arrays by length and
position; observed order is SINGLE-LINEAGE, CRITIQUE-UNAVAILABLE, LABEL-BASIS-INCOMPLETE.)

**2. A SECOND, INDEPENDENT FAILURE HIDES BEHIND THE FIRST — this is the finding that matters.**
I applied the edit above in a scratch copy only (`logs/h-diag/r1-candidate-fix-probe.log`,
nothing landed) and the test still fails, further down, on a different property:

```
FAIL … claims, judges through the HTTP gateway, propagates, serves, and settles
AssertionError: expected { …(36) } to match object { staleness_state: 'ARCHIVED_REVIVED' }
-   "staleness_state": "ARCHIVED_REVIVED",
+   "staleness_state": "UNDER_REVIEW",
 ❯ tests/integration/database.test.ts:3990:23
```

A fix lane that stops at the label will hand back a still-red test. Where it lives:
`ServeRepository.readAnswerProjection` returns the liveness projection
(packages/liveness/src/index.ts:56-70). It returns `ARCHIVED_REVIVED` only when the latest
`core.staleness_state` row for the subject is `ARCHIVED_REVIVED`; that row is written by
`recordQuery` (:230-233) **only** for subjects whose latest state is exactly `ARCHIVED`
(:227-228). The run-level archive did happen — `expect(archivedRuns).toContain(work.runId)`
passes at :3985. So the gap is between the run-level sweep and the per-subject
`core.staleness_state` row for the ANSWER subject. **I did not diagnose this further; it is
outside my charge and needs its own lane.**

**3. Two causes, not one — the ticket's "stable-red since T0" is true of the NAME only.**
T11 (`7e5ac0d7`, 2026-09-01) is **not** an ancestor of the T0 baseline
`1c9578a24d5aedd0302fbda5593f66277cd87b98` (2026-08-28) — verified by
`git merge-base --is-ancestor`. At the T0 baseline the binary derivation was still in place
(`deriveHonestVerdict` at :662 of that tree), so `verdict_state` would have been `SUPPORTED`
and the label assertion would have **passed**. The T0 redness therefore had a different cause,
and the staleness failure in (2) is the strong candidate: the staleness/revival assertions are
**byte-identical** between the T0 tree and HEAD, and `packages/liveness/` is **unchanged**
across `1c9578a..HEAD` (empty `git diff --stat`). Reading it as one continuous cause is the
D60 trap; the honest statement is **one red name, two stacked causes, the older one still
undiagnosed**.

**4. Ticket shape I would file.** Two tickets, not one: (a) STALE EXPECTATION — the label edit
above, a test-only change whose reviewer checks it against goal:199-202 and confirm-item 6;
(b) NEW DIAGNOSIS — the `ARCHIVED_REVIVED` → `UNDER_REVIEW` regression, product-side, pre-dating
the mission, which must be diagnosed before anyone can claim this test green. (a) cannot be
verified green until (b) is resolved, so (b) is the blocking one.

## Evidence index — all under `logs/h-diag/`, every run through `tools/gate-run.sh` (D45/D49/D52)

| log | what it establishes |
|---|---|
| `r1-reproduce-red.log` | RED reproduction, run 1 of 3 |
| `r1-reproduce-red-run2.log` · `r1-reproduce-red-run3.log` | runs 2 and 3 (three-run law) |
| `r1-instrumented-basis.log` | the persisted label basis — the deciding measurement |
| `r1-candidate-fix-probe.log` | the second failure behind the first |
| `instrument-run.sh` · `candidate-fix-probe.sh` | the scratch-copy wrappers, retained so both runs are re-derivable |

**Three-run law (worker contract §3 — worst run wins).** Cluster = the single named test.

| run | result | exit | clean state | assertion |
|---|---|---|---|---|
| 1 | Tests 1 failed \| 83 skipped (84) | 1 | unchanged | `expected { …(36) } to match object { verdict_state: 'SUPPORTED', …(4) }` |
| 2 | Tests 1 failed \| 83 skipped (84) | 1 | unchanged | identical |
| 3 | Tests 1 failed \| 83 skipped (84) | 1 | unchanged | identical |

**Worst run = RED, deterministically, on the same assertion.** Byte-identical to the filed
`integration-suite-b11.log:41183` and `integration-suite-b12.log:40804` signatures, so b11, b12
and today share one cause (the post-T11 one).

**Custody.** No product or test file was edited. Both instrumented runs made a scratch COPY
inside the worktree, ran only `-t "claims, judges through the HTTP gateway"`, and deleted the
copy in a shell `trap`; `gate-run.sh` brackets each with porcelain BEFORE and AFTER, both `[]`.
Final state: porcelain empty, HEAD `7dda3cc0`, no `hdiag*` file in `tests/integration/`,
`git diff --summary 7dda3cc0..HEAD | grep -c "mode change"` = **0** (J16 filing law).

## Not verified

- **The T0-era failure was never reproduced at `1c9578a`.** No raw T0 suite log was filed
  (`logs/` has only `t00-codex-r{1,2,3}.log`; `t00-baseline.md:196` records the name and
  `X | X | X` but no assertion text). Establishing it would need a fresh provisioned checkout at
  that commit, which my packet forbids ("do NOT re-provision") and the stall guard discourages.
  My claim that the T0 cause was the staleness assertion is a **strong inference from three
  measured facts** (the binary derivation was present at that commit; the staleness assertions
  are byte-identical between the two trees; `packages/liveness/` has zero diff across the range)
  — it is not a measurement.
- **The `ARCHIVED_REVIVED` root cause.** Located to the `recordQuery` revival guard; not traced
  to whether the sweep fails to write a per-subject `ARCHIVED` row or a later row outranks it.
  Out of charge.
- **Everything after database.test.ts:3990 is still unmeasured.** The candidate-fix probe got
  ~80 lines further and stopped there. A third failure behind the second is not excluded.
- **The suite was never run whole**, per the stall guard, so I make no claim about the other
  known-red names.

## PREDICTIONS

1. Editing only :3909 and :3913 leaves the test RED at :3990. **Already measured**, not
   predicted — `r1-candidate-fix-probe.log`.
2. The `ARCHIVED_REVIVED` failure reproduces at the T0 baseline `1c9578a` if anyone provisions
   there, and is not mission-caused. Confidence high: `packages/liveness/` has zero diff across
   `1c9578a..HEAD` and the assertions are byte-identical.
3. The other six "new (was masked)" integration names in T0's authority are worth checking for
   the same shape — a first failure masking a second. The class, not the instance, is the
   finding: nothing in the record forces a diagnosis past the FIRST failed assertion, so a
   stable-red name can hide an arbitrary number of causes.
4. If the fix lane changes the fixture instead of the expectation — seeding a second maker to
   "earn" SUPPORTED — `provider.calls()).toBe(3)` at :3870 and both mono-maker condition-mark
   assertions at :3915-3925 break, and the test stops testing the mono-maker lifecycle it was
   written for. The expectation is the thing to change, not the fixture.

## Contract conflict I did not resolve unilaterally

Worker contract §6 tells me to **append** any trap that cost me time to
`.hermes/TOOLING-TRAPS.md`, and D32 says seats append to the shared file rather than a lane
copy. My packet's `allowed` list contains three paths and that is not one of them
("readonly: everything else"). I did not write it. Two reasons beyond the contract: the file is
**currently modified by another lane** (`M dialectical-engine/.hermes/TOOLING-TRAPS.md` in the
main checkout at session start), and D52 ADDENDUM's standing rule is that editing a shared file
is only safe when no seat is mid-run.

The trap, for whoever owns the append: **`grep -rn PATTERN . --include=*.ts` fails under this
zsh with `no matches found: --include=*.ts` before grep runs** — zsh globs the unquoted
`*.ts`. Use `--exclude-dir` plus a path list, or quote it as `--include='*.ts'`. Cost me three
calls. The file records several zsh traps already (:30, :818) but not this one.

**Packet defect to fix at the source:** every worker packet that carries §6 as a duty must
carry `.hermes/TOOLING-TRAPS.md` in its `allowed` list, or say explicitly that the seat reports
traps in its handoff instead. Mine did neither, so the duty and the contract contradict.

---

# H-DIAG — F-H-2 · round 1

READY FOR HERMES STAGE REVIEW · comments read through: h-diag-r1-2026-09-05

Ticket `F-H-2`. Same seat, same worktree, HEAD `7dda3cc0`, porcelain clean before and after
every measurement. DIAGNOSIS ONLY — no product or test file edited.

## Which transition fired, with the persisted evidence

**No transition fired. `recordQuery` returned `0` and wrote nothing at all.**
(`logs/h-diag/f-h-2-r1-instrumented-liveness.log`, 13 probes either side of the call.)

The persisted tables are byte-identical before and after `recordQuery`:

```
BEFORE / staleness_state   ANSWER … STALE     test-layer:q58-condition   at_seq 193
                           NODE   … STALE     test-layer:q58-condition   at_seq 194
                           ANSWER … ARCHIVED  COMPOSITE_RETIREMENT       at_seq 199
                           NODE   … ARCHIVED  COMPOSITE_RETIREMENT       at_seq 200
recordQuery_returned       0
AFTER  / staleness_state   (identical — no ARCHIVED_REVIVED row was written)
AFTER  / liveness_event    QUERY 2026-09-05…  at_seq 28
                           ARCHIVED 2030-01-01T00:00:00.000Z  at_seq 201
                           (no QUERY event at 2030-01-02 — recordQuery never reached its insert)
```

So the latest stored state for the ANSWER subject stays `ARCHIVED`, and the branch that produces
the observed value is `foldStaleness`, **packages/liveness/src/index.ts:65-67**:

```ts
if (latestState?.state === "UNDER_REVIEW" || latestState?.state === "ARCHIVED") {
    return { state: "UNDER_REVIEW", badge: "UNDER-REVIEW", …, basis: "RECORDED_STATE" };
}
```

A stored `ARCHIVED` **projects as `UNDER_REVIEW`**. Confirmed by direct probe, which also rules
out the TTL arm:

```
readSubjectStaleness_ANSWER  { "state": "UNDER_REVIEW", "badge": "UNDER-REVIEW",
                               "basis": "RECORDED_STATE" }
```

`basis` is `RECORDED_STATE`, not `TTL_EXPIRED` — so this is the stored-state arm, not the review
clock (whose `due_at` was 2026-09-06, in the future, and irrelevant).

**Why `recordQuery` returned 0 — the gate, isolated**
(`logs/h-diag/f-h-2-r1-gate-isolation.log` and `f-h-2-r1-predicate-comparison.log`):

```
this_run   { question_line: "happy-path", asker_id: "asker:happy-path",
             content_encryption_version: null, plaintext: true,
             owned: true,          ← ownership passes
             live:  false }        ← THIS is the gate that closes
candidates_count               0   ← so recordQuery returns 0 at its early exit (:154)
lock_returned                  [ the run ]      ← the LOCK function accepts it
inner_guarded_erasure_gate     { live: true }   ← the gate INSIDE the loop accepts it
PRE_REGRESSION_predicate_matches  1             ← the code this replaced accepted it
```

`core.run_private_content_is_live` is not a general liveness predicate. Its body
(`migrations/0040_account_erasure.sql:3576-3604`) ends `WHERE run.run_id=p_run_id AND
run.content_encryption_version=1`, wrapped in `COALESCE(…, false)`. For a run with
`content_encryption_version = NULL` the inner select returns no rows and the function returns
**false**. It answers "is this v1-encrypted run's content still live", and its name reads as
though it answers "is this run live".

`recordQuery`'s candidate query calls it **unguarded** —
**packages/liveness/src/index.ts:144** — so every unencrypted run is invisible to `recordQuery`.
Content encryption is off by default, so this is the ordinary path, not an edge case.

## Has this assertion ever passed

Yes — and I can date the window and the commit that closed it.

| fact | measurement |
|---|---|
| assertion origin | `f59aaf5c` **2026-08-09**, the original V3 S00-S14 build |
| erasure feature adds the gate CORRECTLY | `970870f3` **2026-08-25** wrote the candidate query with two explicit `NOT EXISTS` clauses on `private_run_key_cleanup_intent` and `private_run_erasure_tombstone` — no encryption-version precondition |
| the regression | `2d1f86b8` **2026-08-28** "chore: checkpoint all local mission artifacts and in-flight tree" replaced exactly those two clauses with `AND core.run_private_content_is_live(run.run_id)` |
| present at the T0 baseline | `git merge-base --is-ancestor 2d1f86b8 1c9578a` → **true**; the T0 tree carries it at the same line 144 |
| unchanged today | line 144 identical at `7dda3cc0` |

The regressing hunk is four lines removed and one added:

```diff
-        AND NOT EXISTS (
-          SELECT 1 FROM serve.private_run_key_cleanup_intent AS erased
-          WHERE erased.run_id=run.run_id
-        )
-        AND NOT EXISTS (
-          SELECT 1 FROM serve.private_run_erasure_tombstone AS tombstone
-          WHERE tombstone.run_id=run.run_id
-        )
+        AND core.run_private_content_is_live(run.run_id)
```

It reads as a clean extraction of duplicated logic into the named helper. It is not equivalent:
the helper carries an extra precondition the inlined pair never had, and for every unencrypted
run the predicate flips from TRUE to FALSE.

**This is not an UNIMPLEMENTED EXPECTATION.** The measurement that rules that out is
`PRE_REGRESSION_predicate_matches = 1`: on the identical live row, the code this commit deleted
still matches the run, while the code that replaced it does not. The transition was implemented,
was reachable, and was made unreachable by a dated refactor.

## VERDICT: PRODUCT DEFECT — the deciding measurement

**On one row, in one function, the same question is answered both ways:**

```
liveness/src/index.ts:144  (unguarded)  core.run_private_content_is_live(run) → false
liveness/src/index.ts:205  (guarded)    CASE WHEN content_encryption_version=1
                                          THEN …(run) ELSE true END           → true
```

The candidate filter at :144 and the erasure gate at :205 are twenty lines apart in the **same
method**, written in the **same commit** (`970870f3`), and disagree about whether this run is
live. The guarded one is right. Everything else on the path succeeds — `owned: true`, the
question line matches exactly after normalization, and `lock_owned_live_runs` returns the run
(its own predicate is correctly written as `content_encryption_version IS DISTINCT FROM 1 OR …`).
:144 is the single point of failure, and flipping it is sufficient: the loop's own re-check
(`owned`) and erasure gate (`live: true`) both already pass.

The test is right. The product is wrong, has been wrong since 2026-08-28, and was wrong at T0 —
which is what T0 recorded.

## What the fix lane needs

**1. The fix is at packages/liveness/src/index.ts:144.** Either restore the two `NOT EXISTS`
clauses, or guard the helper the way its eleven other call sites do:

```sql
AND (run.content_encryption_version IS DISTINCT FROM 1
     OR core.run_private_content_is_live(run.run_id))
```

I state that as an example, not a mechanism — D58: the seat reading the code chooses. The
OUTCOME required is that an owned, unencrypted, non-erased run is a `recordQuery` candidate.

**2. The blast radius is wider than this test, and worse than a stale label.** `recordQuery` is
the "the owner asked this question again" path. Because it returns 0 for every unencrypted run
it also never writes its `QUERY` liveness event — and that event feeds `sweep`'s
`HAVING max(query.occurred_at) IS NOT NULL` and `decideRetirement`'s `lastQueriedAt`
(`packages/liveness/src/index.ts:437-460`). **In the default deployment, re-asking a question
never refreshes its liveness and never revives an archived run.** That is a live product
behaviour on the lifecycle path, not a test-only concern, and it is why I would raise this above
the medium tier the ticket carries.

**3. Call-site enumeration (D28 — the class, not the instance).** Twelve call sites of
`core.run_private_content_is_live` outside its definition. **Eleven are guarded**, by
`CASE WHEN content_encryption_version=1 … ELSE true` (memory:484,503,651,950 · db:326 ·
liveness:205) or by `… IS DISTINCT FROM 1 OR …` / `OR …` (memory:613 · serve:2720,2732,2744 ·
`lock_owned_live_runs`). **One is unguarded: liveness:144.** The guard is the convention; this
is the single deviation from it.

**4. Latent hazard, not a live defect (§5 finding).** `assertPrivateContentLive`
(`packages/db/src/index.ts:480-491`) calls the helper unguarded and would throw
`PRIVATE_CONTENT_ERASED` for any unencrypted run. It currently has **zero callers** — grep
across `packages`, `apps` and `acceptance` returns only its own definition. It is dead code
shaped exactly like the defect, waiting for its first caller. Worth deleting or guarding in the
same lane; not blocking.

**5. Ticket sequencing.** F-H-2 is the blocker. F-H-1's label edit cannot be verified green until
:3990 passes, and :3990 needs a product change. The two are still separate tickets — one
test-only, one product — but F-H-2 lands first.

## Evidence index — `logs/h-diag/`, every run through `tools/gate-run.sh`

| log | what it establishes |
|---|---|
| `f-h-2-r1-instrumented-liveness.log` | 13 probes: `recordQuery` returns 0, writes nothing, `basis: RECORDED_STATE` |
| `f-h-2-r1-gate-isolation.log` | `owned: true`, `live: false`, `candidates_count: 0`, lock accepts |
| `f-h-2-r1-predicate-comparison.log` | the pre-regression predicate matches the same row (1); the inner guarded gate says live |
| `f-h-2-r1-red-run{1,2,3}.log` | three-run law |
| `f-h-2-r0-CORRUPTED-two-runs-one-log.log` | retained: my own overlapped-runs error, see below |
| `f-h-2-instrument-run.sh` · `f-h-2-gate-probe.sh` | the scratch-copy wrappers, re-derivable |

**Three-run law (worst run wins).** Cluster = the named test with F-H-1's label fix applied in
the scratch copy, isolating the F-H-2 failure.

| run | result | exit | clean state | failure |
|---|---|---|---|---|
| 1 | Tests 1 failed \| 83 skipped (84) | 1 | unchanged | `expected { …(36) } to match object { staleness_state: 'ARCHIVED_REVIVED' }` @ :3990 |
| 2 | Tests 1 failed \| 83 skipped (84) | 1 | unchanged | identical |
| 3 | Tests 1 failed \| 83 skipped (84) | 1 | unchanged | identical |

**Worst run = RED, deterministically, same assertion, same line.**

**Custody.** No product or test file edited. Every run made a scratch COPY, ran only
`-t "claims, judges through the HTTP gateway"`, and deleted the copy in a shell `trap`. Final
state: porcelain empty, HEAD `7dda3cc0`, no `hdiag*` file under `tests/integration/`.

## Not verified

- **I did not observe this test green.** I proved the pre-regression predicate matches the live
  row; I did not provision a checkout at `2d1f86b8^` and run it. "The assertion was satisfiable
  before 2026-08-28" is measured on the predicate; "the whole test passed then" is not, and
  other assertions in this 130-line test could have been failing for other reasons.
- **The window before `970870f3`** (2026-08-09 → 2026-08-25) used a blind-index `recordQuery` of
  a different shape. I did not examine whether revival worked there.
- **Everything after :3990 is still unmeasured.** With F-H-1's label fix the test reaches :3990
  and stops. A third failure behind the second is not excluded — the same caution I filed on
  F-H-1, and the reason I would not promise this test green after one product fix.
- **I did not run the suite whole or by cluster**, per the stall guard, so I make no claim about
  what else the liveness defect turns red.

## PREDICTIONS

1. Guarding :144 makes `recordQuery` return 1 for this fixture, write the `QUERY` event and the
   `ARCHIVED_REVIVED` row, and :3990 passes. Confidence high — every other gate on the path is
   already measured passing, including the loop's own re-check.
2. Other tests that call `LivenessRepository.recordQuery` and assert an effect are red or
   vacuous today. I have not enumerated them (stall guard); the fix lane should, because a fix
   at :144 may turn currently-passing vacuous assertions into real ones.
3. `git log -S` on the regressing string will show `2d1f86b8` is a bulk "checkpoint" commit that
   swept several such extractions. **The commit message "chore: checkpoint all local mission
   artifacts and in-flight tree" describes no behaviour change, and it changed behaviour.** If
   the fix lane finds a second regression in the same commit, that is the class finding, and
   D28's sweep-and-publish rule applies to the commit rather than to the predicate.
