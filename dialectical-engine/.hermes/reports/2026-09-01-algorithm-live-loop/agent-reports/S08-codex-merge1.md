CODEX MERGE REVIEW S08 1 — APPROVE · comments read through: s08-merge1-2026-09-02

# S08 T12+T13 merge review 1

VERDICT: APPROVE. The merge product is correct and fit to merge into the mission
integration branch. Finding count: 0 blocking, 2 non-blocking. Product findings:
0. Landed assertions weakened, relaxed, deleted or renamed: 0.

## Scope and method

Static review only. I ran no tests, builds, installs, migrations, mutation
commands, provider calls or mutating git commands. I read the two-parent merge,
both parent diffs, the merged source and tests, the mission tools, and the raw
merged-tip records. I also ran read-only git/diff/grep/awk comparisons, the
read-only stamp comparator, and a read-only re-derivation of the mutation index.

Fresh identity checks establish:

- merged tip `f3c7f74fd449ec58ca77f69bac6d35862639d18c`, tree
  `4c0748731bacc10cd5690ec83eb0d863f4f3fd39`, clean branch `lane/s08`;
- parents `e60e0296f3702e26b40d378f3bdf5cfff7f669e7` and
  `44836ecf101066c822f317233912c0c99beab2dc`;
- their merge base is exactly `e040b1ee5322b3343987632659509e963d0ccd05`;
- the only paths modified on both sides are the three paths named in the packet.

No conflict marker exists in any of the three shared files. The incoming side
adds 435, 24 and 77 lines respectively to the runner, serve and database-test
files; a fresh multiset presence check finds zero missing non-trivial incoming
line occurrences at the merged tip. The conclusions below go beyond that
presence floor.

## Combined-file correctness

### Serve

The S08 cited-set computation remains intact at
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s08/dialectical-engine/packages/serve/src/index.ts:587`:
verified segment ids feed cited node ids, `citedNodes` controls both the T13 form
decision and the T12 basis, and the empty cited set still stops loudly. The
incoming change is the T7 mark-union member at
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s08/dialectical-engine/packages/serve/src/index.ts:1076`
plus the T6 comment correction above `resolveTrueUnjudgedReasons` at
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s08/dialectical-engine/packages/serve/src/index.ts:1257`.
The incoming added/deleted lines name none of `citedNodes`,
`verifiedSegmentIds` or `assertedNodeRefs`. The merge-only change is the promised
comment explaining why the every-conforms guard makes the verified-state
predicate sound; it changes no expression or control flow.

### Runner

T7's stopping path is upstream of the final propagation and served-root
selection. It derives the expansion plan at
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s08/dialectical-engine/apps/runner/src/index.ts:2926`,
then the surviving graph is propagated and selected before
`buildFixedSingleRootServeNodes` is called at
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s08/dialectical-engine/apps/runner/src/index.ts:3189`.
S08's F30 helper remains at
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s08/dialectical-engine/apps/runner/src/index.ts:1742`,
and the band chain still calls it at
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s08/dialectical-engine/apps/runner/src/index.ts:3605`.
The composer still maps only `node_refs: ["primary"]` to the selected root at
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s08/dialectical-engine/apps/runner/src/index.ts:3686`.

A fresh zero-context diff search confirms that the incoming runner patch changes
none of `node_refs`, `buildFixedSingleRootServeNodes`, `answerCarriesLabel`,
`servedCandidateConfidenceBand`, `applySingleLineageBandCap`,
`verdictLabelBasis` or `servedNodes`. T7 can lawfully change which graph reaches
selection and can add branch-freeze condition marks, but it neither changes the
citation mapping nor bypasses/reorders S08's band and label seams. The combined
control flow is semantically coherent.

### Database integration test

The merge is a direct union here: T7 adds `stoppingPolicy` to `runnerSettings()`
at
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s08/dialectical-engine/tests/integration/database.test.ts:166`
and adds its own assertions elsewhere; S08's persisted tuple remains at
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s08/dialectical-engine/tests/integration/database.test.ts:4529`.
Blame at the merged tip attributes `CONTESTED`, null unavailability, the
mono-capped band and `{LOOKED_UP: 0, RAN: 0, REASONING: 1}` to `e60e0296`, not
to the merge. No expected value was adjusted to accommodate T7.

One report claim about this fixture is overstated, as non-blocking ticket N1
records below: policy provisioning is present, but this particular fixture is
mono-maker and therefore executes no adaptive-stopping boundary.

## Assertion-preservation law

The law is satisfied. Fresh base-to-filing and integration-to-merge test diffs
contain no removed line naming `expect`, a matcher, `it`, `test` or `describe`,
and no test file is deleted. The incoming T7 assertions remain byte-present;
the merge adds S08 assertions without weakening or renaming an incoming one.
The TERM-01 expected tuple is unchanged from the reviewed filing tip.

## Merged-tip gate and mutation binding

All eight gate records under
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/s08/r5-*.log`
carry the exact merged commit and tree, empty porcelain before and after, and
`CLEAN-STATE: unchanged across the run`:

- `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/s08/r5-root-typecheck.log`
  records the unpiped root typecheck and `EXIT = 0`.
- `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/s08/r5-cluster-run{1,2,3}.log`
  each records `Tests  3 failed | 202 passed (205)`, i.e. `202/205`, with the
  same three failure names. All three names occur in
  `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/s08/zone-failure-set-BASE.txt`
  at `e040b1ee`.
- `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/s08/r5-persisted-tuple-run{1,2,3}.log`
  each records `Tests  1 passed | 76 skipped (77)`, i.e. `1/77`
  passed/total with 76 skipped, and `EXIT = 0`.
- `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/s08/r5-mode-change-count.log`
  records zero mode changes and lists 16 changed files.

The mutation rerun also binds the merged tip. A fresh structural census of the
21 files matching
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/s08/r5-mut-*.log`
finds 21/21 exact commit+tree headers identifying the mission mutation emitter,
gates `0/1/0`, matching
before/after hashes and empty final porcelain. The OLD/NEW blocks match the 21
accepted r4 pairs exactly. Nineteen product mutants exit non-zero; the two named
neighbours `n1` and `n2` exit zero.

A fresh read-only invocation of
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/tools/stamp-check.sh`
again reports `records compared: 29 · failures: 0`. The 29 are exactly the eight
gate records plus 21 raw mutant records.

The derived index at
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/s08/mut-INDEX-DERIVED-r5.txt`
is honest bookkeeping, not evasion. Its rows name the `r5-mut-*` sources whose
headers carry the commit/tree; its filename/exit/gates/outcome tuples and tally
reproduce from those raw records. It is a projection rather than a measurement,
so excluding its unstamped bytes from a comparator whose contract requires a
commit stamp is correct. The binding is transitive and inspectable, not hidden.

## Non-blocking findings, tickets and fixes

### S08-M1-N1-REPORT — provisioning was mistaken for stopping execution

**Evidence:**
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/s08-band-downgrade.md:982-991`
says T7's rule is live in every fixture, including TERM-01. But TERM-01 calls
`createRunnerWork`, which calls `createRun` without overriding the default
`agentCount = 1` at
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s08/dialectical-engine/tests/integration/database.test.ts:205-208`.
The runner sets `expansionPlan = []` when `effectiveMakerCount <= 1` at
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s08/dialectical-engine/apps/runner/src/index.ts:2926-2928`,
so `closeGlobalRound` is never called.

**Price:** report accuracy only. The three records still prove that S08's
persisted tuple is unchanged under the merged configuration; they do not prove a
T7 stopping-boundary interaction. This does not alter the source verdict.

**Fix and when:** orchestrator-owned same-day correction immediately after the
merge and before S08 ticket closure. Replace the “LIVE in every fixture” claim
with the mono-maker fact above and narrow the three-run claim accordingly. No
product edit or rerun is required.

### S08-M1-N2-TOOLING — the derived-index tool advertises but ignores expectations

**Evidence:**
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/tools/mutant-index.sh:3`
advertises an optional expected file, but the implementation at lines 8-28 never
reads a second argument. If one product mutant became GREEN while one neighbour
became RED, the total could remain 19/2 and the tool would still print the same
confirmation. Its 70-character first-frame preview is also locale-sensitive; a
fresh run reproduced every substantive column and the tally but not every final
preview byte.

**Price:** future campaign enforcement, not this campaign's truth. I checked the
current mapping directly: the 19 product-mutant names are the non-zero exits and
only `n1`/`n2` survive.

**Fix and when:** mission-tooling owner before the next mutation campaign. Make
the expected manifest real, fail on any expected/observed or malformed-gate
mismatch, and pin the output locale (or remove locale-sensitive truncation).
This S08 campaign needs no rerun.

## Answers to the packet's five questions

1. Yes. The auto-merge's combined source is semantically correct, not merely
   conflict-free.
2. No landed assertion was weakened, relaxed, deleted or renamed.
3. No S08 expected value was adjusted for T7. The expected tuple remains from
   `e60e0296`; the report merely overstates whether TERM-01 executes stopping.
4. Yes. The eight gates and all 21 raw mutants bind `f3c7f74f` and tree
   `4c074873`; the derived index binds through those named transcripts.
5. Yes. S08 is fit to merge as it stands; N1 and N2 are scheduled non-blocking
   record/tooling repairs, not product holds.

No requested question remains CANNOT-ASSESS.

## PREDICTIONS

Another lens may equate a populated `stoppingPolicy` with an executed stopping
boundary and miss that TERM-01 is mono-maker. The opposite bookkeeping error is
also likely: rejecting the unstamped derived index without following its rows to
the 21 stamped raw sources. A stronger tooling lens may notice the real residual
instead—the advertised expected manifest is unused, so the current 19/2 mapping
is correct because it was checked, not because the index tool enforces it.
