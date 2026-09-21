CODEX MERGE REVIEW T7 — CHANGES · comments read through: t7-merge-2026-09-02

# T7 merge review

## VERDICT

**CHANGES. Finding count: 1 — N1 evidence-only, non-product, mandatory.** The merge
resolution itself is statically sound: both lanes survive all nine conflict hunks, the three
count pins assert the true merged cardinality, no parent assertion is weakened, and T7's accepted
root-scope seam remains intact. Approval is withheld only because the packet/report assert a
detached-baseline `generate:contract` run for which no stored baseline command or exit exists.
This is merge-evidence repair, not product rework; T7's worker rework count remains 3/3.

## FINDING

### N1 — the detached zone baseline does not record its claimed baseline generation

**Files/lines:** `packets/t7-codex-merge.md:45-48`;
`agent-reports/t07-stopping.md:1343-1345`;
`logs/t07/merge-zone-base.log:1-8`;
`logs/t07/merge-generate-contract.log:1-10`.

**Concrete failure scenario:** generated contract output is gitignored. The merged-tip generation
runs, then the worktree detaches to `1fad4e16`; if baseline generation is skipped or fails, the
baseline zone can execute while still seeing ignored generated output from the merged tip. The
zone header proves the checked-out commit/tree, but not the provenance of ignored generated
artifacts. That makes “baseline measured ... with its own `generate:contract`” unproved even
though the zone itself reports 167/167.

**Evidence:** `merge-zone-base.log` is correctly stamped at commit
`1fad4e166019b027c5bbc362451b602531d58401` and tree
`d888dcf21f2d61ca5f7d77202b0ab1ceeed0f9db`, but its first command is literally:

```text
$ npx vitest run <8 zone files>
```

The only stored `$ pnpm run generate:contract` command and `exit=0` are in
`merge-generate-contract.log`, stamped at merged commit `376a614c…` / tree `0b33a0a6…`.
The worker report and self-report attest that a second generation ran; no named log verifies it.

**Required correction / routing ticket:** route **T7 merge detached-baseline generation
provenance** as same-day evidence repair. On a clean detached `1fad4e16`, capture commit, tree,
clean state, the complete baseline `pnpm run generate:contract` command and exit, then the zone
command and 167/167 result in one stamped log (or two explicitly linked stamped logs); refile the
packet/report claim against that artifact. No product or test-source change is requested, and no
fourth worker rework round is opened.

## COUNT PINS — TRUE ABSOLUTE CARDINALITY

Counting every literal entry between the `CONDITION_MARKS` array bounds gives:

| commit | true cardinality | relevant state |
|---|---:|---|
| `e040b1ee` | 32 | already carries S06's `LABEL-BASIS-INCOMPLETE` |
| `1fad4e16` | 32 | integration parent, S06 mint |
| `3ea7fd33` | 32 | T7 parent, `BRANCH-FROZEN-LOW-LEVERAGE` mint |
| `376a614c` | 33 | merged tip, both mints |

For context, lane base `7433be7` is 31. Thus the worker's arithmetic—base 31, each lane 32,
merged 33—is correct.

The 28/29 extraction is wrong. Its four-entry deficit is explained exactly by filtering out the
three lawful underscore-bearing members `ENVELOPE_EXHAUSTED`, `LEVERAGE_UNRESOLVED`, and
`NOT_SAMPLED`, plus requiring a trailing comma and therefore omitting the lawful final member
`UNAUTHORED-BRANCH-HALTED`. Relative arithmetic happened to survive because neither mint belongs
to the filtered class.

All three landed pins now assert the true merged count:

- `tests/unit/dr174-resilience.test.ts:205` — `CONDITION_MARKS` length 33.
- `tests/unit/obs-l2-s02-registry.test.ts:418` — severity-map key length 33.
- `tests/unit/s14-ui.test.ts:120` — `CONDITION_MARKS` length 33.

Each parent asserted 32 at the corresponding site. The merge raises the exact expected value; it
does not weaken any pin.

## DR-176 TAIL AND FORCED LABEL COMPLETIONS

The block from `HIDDEN-UNJUDGEABLE` through the array close hashes identically at all four named
commits:

```text
8e277ccf4e19e9d0f9cf0cd2c0a7042cdbca2b5b1a316a075f61de34436d0681
```

The positional tail is exactly `HIDDEN-UNJUDGEABLE`, `DERIVED-STANDING-UNREVIEWED`,
`HIDDEN-LOW-SCORE`, `UNAUTHORED-BRANCH-HALTED`. Both mints are mid-list: merged zero-based index 5
for `BRANCH-FROZEN-LOW-LEVERAGE` and 27 for `LABEL-BASIS-INCOMPLETE`; the tail begins at 29.

J5/J11's forced-completion discipline is satisfied. At the merged tip each mint occurs exactly
once in each exhaustive label surface: UI lines 26 and 53, web lines 123 and 150. Relative to the
S06 parent the merge adds only T7's one label branch per surface; relative to the T7 parent it
adds only S06's one condition-mark label branch per surface. S06's separate UI verdict-state
function is inherited feature work, not a second condition-mark mapping.

## NINE HUNKS AND BOTH-PARENT ASSERTION AUDIT

`git show --cc` contains eight conflict files and nine `@@@` hunks. The combined diff confirms:

- `WalkingSkeletonSettings` retains both optional policies.
- Startup guards remain J12 → T7 → T11. The T7 integration fixture removes only
  `stoppingPolicy` from `runnerSettings()`, whose merged helper supplies `verdictLabelPolicy`;
  the T11 fixture removes only `verdictLabelPolicy`, while the helper supplies
  `stoppingPolicy`. T7 also constructs M=2, whereas T11's single-maker path does not trigger the
  M≥2 stopping guard. Each fixture therefore still reaches its own expected error code.
- `ConditionMarkRecord.mark` retains both new union members.
- Acceptance composition and the database fixture retain both policy blocks and both source
  families.
- Both append-only TOOLING-TRAPS blocks survive.
- The three conflict-touched unit tests change only explanatory prose plus exact 32→33 pins.

I also inspected all assertion-shaped deletions in both parent-to-merge test diffs. None is a
weakening. S06 replaces the retired first-configured-root expectations with exact propagated
strength, subject-root, reason, and affected-root assertions. Its serve tests update the ruled
selection vocabulary and add the verdict derivation field. T7 replaces the old unresolved
leverage stub expectation with the exact resolved value `0.125`. Against `1fad4e16`, the T7 unit
file is additive and the integration fixture adds stopping coverage. No conflict resolution
deletes a parent assertion.

## T7 BOUNDARY CLOSURE SURVIVES

The propagation source blob and the complete T7 unit-test blob are byte-identical between parent
`3ea7fd33` and the merged tip. The runner diff against that parent contains no change in
`deriveGlobalRoundCompletions`, `selectPreventableBranches`, `selectAuthoritativeRootScope`,
`runAdaptiveStoppingRound`, or the `closeGlobalRound` boundary body.

The live call still contains the exact accepted structural seam at merged runner lines
2921-2922:

```text
rootNodeIds: rootScope.rootNodeIds,
expectedRootCount: rootScope.expectedRootCount,
```

The structural pin still greps those exact strings at T7 unit lines 927-928. S06's later
served-root-by-strength replacement occurs after the stopping expansion loop and does not narrow
or rewrite the authoritative maker-root scope.

## STORED GATES AND MERGE-OUT ADEQUACY

I did not execute gates. The stored merged-tip logs are all stamped at commit
`376a614c7cd4b08eecfa447d229e911f1cfb4c32`, tree
`0b33a0a6f84bb7c38d1f97bdd9cf8531cf8fa616`, and clean state, and report:

- `generate:contract`: exit 0;
- root typecheck: `tsc exit=0`;
- T7 unit runs: 63/63, 63/63, 63/63;
- S06 T10+T11 unit cluster: 30/30;
- zone runs: 230/230, 230/230, 230/230.

The zone baseline log itself is stamped at `1fad4e16` / tree `d888dcf2…` and reports 167/167;
each merged run reports 230/230. Both failure-name sets are empty, so the recorded comparison is
0 new and 0 vanished. N1 is specifically the unrecorded baseline generation prerequisite, not a
contradiction in those Vitest totals.

The D14/D16 pairs are exact: UI has only `apps/ui/app/layout.tsx(3,8): TS2882` at both tips; web
has only `web/app/layout.tsx(3,8): TS2882` at both tips. Each pair is 0 new and 0 vanished.

The absence of a fresh heavy integration run or acceptance execution does not independently
block merge-out. D15 makes lane-local cluster/zone evidence the pre-merge gate and the
authoritative full suite a serial integration-branch batch measurement after lanes merge. J18
routes acceptance execution to the W12 flagship ceremony; the merged root `tsconfig.json`
includes `acceptance/**/*.ts`, and the stored root typecheck is green. The next D15 batch remains
binding product proof and this review does not substitute for it. N1 must be repaired before this
merge review can approve its baseline-provenance claim.

## PACKET REVIEW AND LIMITS

The packet path resolves from the assigned worktree. Its two mandatory outputs are exactly its
two writable paths. The marker, board/report/log paths, report SHA-256
`05578a5e22c6df2dea31bb5d0c9932e751f4be122aaad08d3c3cae2adafea372`, merge commit, tree,
parents, 42-commit count from `7433be7`, 14-file `1fad4e16..HEAD` diff, zero mode-change counts,
and nine-hunk/eight-file conflict count reproduce. N1 is the sole packet/report evidence defect.

Per packet, I ran no tests, builds, typechecks, generation, installs, mutations, database or
provider calls, and made no product, test, Git, board, packet, worker-report, or log changes. The
only writes are this verdict and the preceding appended `## merge` self-report. I did not verify
the claimed historical baseline generation; I did not rerun the heavy integration, acceptance,
or D15 suites; runtime totals above are readings of stored artifacts only.

## PREDICTIONS

I predict another lens will accept 28/29 because the relative lane arithmetic is right, without
testing the extractor against underscore-bearing entries and the no-comma terminal member. I
also predict a report-only review will repeat “baseline had its own generate” without opening
`merge-zone-base.log`, whose first command is already Vitest. The first cross-lens checks should
be the four specifically omitted array members and whether any baseline-stamped artifact—not a
worker assertion—contains `$ pnpm run generate:contract` followed by `exit=0`.
