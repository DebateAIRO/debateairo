MERGE-IN COMPLETE (152ed7ed) — S11 r5 (rework 2/3 unchanged; r5 is a merge-in, not a rework round) · comments read through: s11-merge-152ed7ed-2026-09-03
report sha256: 136b6546db96b5f45df3b4afa2b4053b35b09fc604056106edeece80212d37be  (over the file with line 2 removed)
SKILLS LOADED: heartbeat (loader), heartbeat-protocol, heartbeat-worker, superpowers:using-superpowers, superpowers:test-driven-development, superpowers:verification-before-completion, superpowers:receiving-code-review, superpowers:systematic-debugging

# T15 · synthesizer/evaluator eval harness + T15b role decision — r3

**Filed tip `33fc01de1cbe75d710e1dbb85ec34023361f5fd0`** (lane/s11), tree
`be4a96f80705f9f2eb19db8524054486cc90dd1d`, integration `152ed7ed` (T17B) merged in.
**Behind integration by 0. No provider call was made; none is authorized.**

The lane PASSED at `1ac3b8b6`. §13 below is the merge-in owed before merge, plus the two comment
fixes and the correction to my own credit claims.

r3 closes codex r2's three blocking findings. All three were correct. **N4 first, because it is
about this report:** my r2 declaration omitted `superpowers:systematic-debugging` while r2 did
diagnose two defects. It is loaded and declared above, and r3's diagnosis was run through its
Phase 1 — reproduce before touching anything. The reproduction is filed at
`logs/s11/base-r3-repro-b1.log` and is quoted in §1.

## 1 · B1 — the one-model path, reproduced before it was fixed

**Root cause, and it is not where I fixed things in r2.** `deriveCandidateConfigs` threw
`EVAL_CANDIDATE_CONFIGS_INSUFFICIENT` **upstream** of `assignBlindGraders`, so the corrected
grader logic was never consulted on the deployment V's ruling was about. Reproduced first, at
the pre-change tip `725875ae`:

```
INPUT: one configured identity 'solo'; both sealed role refs = 'solo'; requested arms = 3
THREW code = EVAL_CANDIDATE_CONFIGS_INSUFFICIENT | message = 1 configured provider identities yield only 1 distinct role configs; the goal's matrix needs 3

REACHED assignBlindGraders? no — the throw is upstream of it.
relationOf on a dual-role identity (the second half of B1):
  seats : [{"graderRoleRef":"solo","relation":"CANDIDATE_SYNTHESIZER",...},{...,"repeatOfEarlierSeat":true}]
  NOTE  : GRADER-IS-CANDIDATE-EVALUATOR is absent although 'solo' IS the evaluator ref.
```

**I was wrong to route F-S11-4 rather than close it.** V's words are general — "also for other
places where this rule is in place", "this strict rule should not be followed to the bone" — and
I read a general ruling as a narrow one. That reading cost a round.

**The fix.** `deriveCandidateSet` derives the **maximal meaningful** arm set the constraint
allows: the sealed pair first, then distinct-ref ordered pairs, then same-ref arms — which goal
91-93 makes lawful and J7 warns about rather than refusing. One identity yields **ONE** arm, and
no arm is duplicated to reach the numeral three. The reduction and any non-distinct roles are
marked. Only an **empty** pool refuses (`EVAL_CANDIDATE_POOL_EMPTY`) — an absence, not a
capacity limit. `EVAL_ROLE_REF_NOT_CONFIGURED` stays: a broken seal is not a capacity limit
either (J24).

**The matrix is qualified, not silently shrunk.** The goal-matrix projection still prints first —
it is the ceiling V approves — and the harness then emits a REVISED figure computed from the arms
that exist. It can only ever be smaller, so approving the ceiling stays safe.

**The disclosure shape.** `GraderSeat.relations` is now a **set**. A dual-role identity carries
`["CANDIDATE_EVALUATOR", "CANDIDATE_SYNTHESIZER"]` and raises both marks.

**The coherent one-provider path, end to end** (`logs/s11/r3-one-model-path.md`, generated from
the harness):

```
REVISED matrix: 1 configured provider identity yields 1 candidate arm; the goal's matrix asks for 3. The comparison runs on what the deployment can express and no arm is duplicated to reach the requested count.
REVISED projected provider calls (nominal): 30
REVISED projected provider calls (worst case): 60
CONDITION MARK CANDIDATE-SET-REDUCED · …
CONDITION MARK CANDIDATE-ARM-ROLES-NOT-DISTINCT · …
CONDITION MARK BLIND-GRADING-DEGRADED · C1: the candidate's own identities grade it — solo as CANDIDATE_EVALUATOR+CANDIDATE_SYNTHESIZER, solo as CANDIDATE_EVALUATOR+CANDIDATE_SYNTHESIZER; …
CONDITION MARK GRADER-IS-CANDIDATE-EVALUATOR · C1
CONDITION MARK GRADER-IS-CANDIDATE-SYNTHESIZER · C1
CONDITION MARK CROSS-ARM-COMPARISON-UNAVAILABLE · a single arm is not a comparison
REFUSED EVAL_HARNESS_NOT_APPROVED: …

decision            : REFUSED_AWAITING_APPROVAL
provider calls made : 0
provider calls spied: 0
arms derived        : 1 (requested 3, reduced=true)
approved ceiling    : 180 worst-case calls
effective worst case: 60 calls
```

## 2 · B2 — the artifact no longer offers a comparison it cannot support

The reviewer's principle: **a warning discloses invalid comparability; it does not restore it.**
Complement selection makes grader identity a function of the arm, and repeating that grader gives
the arm-specific model two correlated observations and twice the apparent grade count.

`assessComparability` now decides, structurally, whether the arms faced one panel. When they did
not, `renderComparisonTable` renders **no pooled mean and no ranking at all** — only per-grader
observation counts, under a leading statement. The generated artifact
(`logs/s11/r3-T15b-comparison-table.md`) now opens with:

```
NO CROSS-ARM COMPARISON IS POSSIBLE FROM THIS RUN — the arms were graded by different panels, so an arm's mean confounds the grader with the role configuration and no cross-arm ranking can be inferred. No role choice can be inferred from this artifact.

| config | synthesizer role ref | evaluator role ref | arm | grader | observations |
```

A test feeds it two recorded scores (5 and 1) and asserts that **neither appears** as a
statistic and that the string `mean blind score` is absent from the whole artifact.

**The estimator side is not abandoned — it is now expressible, and the fixture proved how.**
Comparability holds exactly when every arm faces the identical panel, which requires the ARM refs
and the PANEL refs to be **disjoint**. I found that by measurement, not design: my first
"shared panel" fixture drew arms from all four identities, which put a grader into an arm's
evaluator seat and split the panels. Arms drawn from the role-capable pair and graded by a
reserved pair is comparable, and that case is pinned. It is also the concrete instruction for a
deployment that wants a valid T15b comparison: **seal a grading pair that never fills a role
seat.**

## 3 · B3 — the artifact states what it knows and marks the rest UNKNOWN

Provider identity, maker family, exact model and session freshness are **four different facts**;
the register carries the first two. r2 asserted the third and fourth anyway.

- `sameModelAsCandidate` is now `ProvenanceFact` = `YES | NO | UNKNOWN`. **YES** when the grader
  ref *is* a candidate ref (same ref is necessarily the same model), or when both models are
  reported and equal. **NO** only when both models are reported and differ. Otherwise
  **UNKNOWN** — never NO. The exact wrong outcome B3 named (two refs backed by one model
  reported as not-same-model) is pinned by a test that seats a different ref carrying the same
  reported model and asserts `YES`.
- `sameProviderIdentityAsCandidate` is the boolean that *is* observable, reported separately.
- The disclosure no longer claims fresh instances. It says: *"Instance freshness is UNVERIFIED:
  no per-call instance reference is recorded."*
- The table carries `EVAL_PROVENANCE_UNSETTLED_NOTICE`, and
  `EVAL_PROVENANCE_ADAPTER_REQUIREMENTS` states the four things an adapter must do before either
  fact may be claimed — a checklist, taken from the reviewer's own list.
- The CLI **deliberately does not synthesise a model field**; inventing one would let the
  artifact claim a relationship it never observed.

## 4 · The non-blocking five

| finding | disposition |
|---|---|
| **N1** only the umbrella mark was ordered against the gate | Now every emitted `CONDITION MARK ` line's index must precede the gate, and the exact **distinct mark set** is pinned. Killed by mutant m17 among others. |
| **N2** `anyDegraded:false` beside a degradation mark | `anyDegraded` now includes run-level degradation. The four-identity/three-arm case the reviewer described is asserted directly, and mutant m20 kills the old behaviour. |
| **N3** bad-before-good order not self-authenticating | One ordered driver, `logs/s11/r3-cite-ordered-driver.log`: both commands, nanosecond timestamps, both exits, in sequence — `[1/2] … EXIT = 1`, `[2/2] … EXIT = 0`. |
| **N4** skill declaration omitted the debugging floor | Loaded and declared; r3's diagnosis ran through its Phase 1, with the reproduction filed before any change. |
| **N5** hand-copied spend ceiling | `assertSpendCeilingWithinSealedBound` refuses when the stated ceiling exceeds the deployment's sealed organ bound, and marks `SPEND-CEILING-UNVERIFIED` when the bound was not read. Wired into the CLI against `policy.bounds.JUDGE`. Mutant m22 kills the check. |

## 5 · RED and GREEN

**RED** — `logs/s11/base-r3-RED-b1-b2-b3.log`, stamped `commit=725875ae…`, EXIT 1, clean:
`TypeError: deriveCandidateSet is not a function` · `Tests  no tests`.

**GREEN** — `logs/s11/r3-gate-cluster-S11-C1-run1.log`, stamped the filed tip, EXIT 0:
`Tests  44 passed (44)`.

## 6 · Cluster verification — three runs, worst run wins

| cluster | command | run 1 | run 2 | run 3 | **verdict (worst)** |
|---|---|---|---|---|---|
| S11-C1 | `./node_modules/.bin/vitest run tests/unit/t15-eval-harness.test.ts` | 44/44 | 44/44 | 44/44 | **44/44 GREEN** |

## 7 · Suites

| gate | result | record |
|---|---|---|
| root `pnpm run typecheck` | **EXIT 0** | `r3-gate-typecheck-root.log` |
| cluster S11-C1 x3 | **44/44, 44/44, 44/44** | `r3-gate-cluster-S11-C1-run{1,2,3}.log` |
| `pnpm run lint` | **EXIT 1 — 3 failures, all PRE-EXISTING** | `r3-gate-lint-audits.log` |
| one-command projection | **EXIT 0** | `r3-gate-projection-output.log` |
| `git diff --summary 44836ecf..HEAD \| grep -c "mode change"` | **0** | §9 |

**Every lint failure named:** `apps/api -> obs-capture is not a declared edge` ·
`apps/runner -> obs-capture is not a declared edge` ·
`apps/scheduler -> obs-capture is not a declared edge`. **All three predate me**, with the causal
claim generated rather than narrated (D51) in `r3-classify-lint-preexisting.log`: the audit reads
workspace package manifests, and the only manifest in my diff is the ROOT `package.json`
(`1 file changed, 2 insertions(+), 1 deletion(-)` — one `scripts` entry), which is not one of the
audit's 28 edge rows. D14/D16 surface gates are not triggered (§9 diff surface). The
authoritative full `pnpm test` is judge-stage per D13/D15.

## 8 · Refutation duty — the r3 campaign

Twenty mutants at the filed tip, transcripts by `tools/mutate.sh`, index by
`tools/mutant-index.py` v2 against a manifest written **before** the index ran:

```
TALLY: transcripts=20  killed=19  survived=1  invalid=0
CLEAN: every transcript well-formed, every outcome matches the manifest
```

Each mutant is credited to the assertion that killed it, extracted from the transcripts
themselves (`logs/s11/r3-mutant-assertion-credit.txt`).

**CORRECTION, carried from the judge's own check of that artifact — my r3 count and one of my
claims were wrong.** The file has 82 lines beginning `killed by`, but one is the survivor
sentinel, so the transcript-matched count is **81**. Worse, four of those are not D43 credits at
all: the projection-order test hard-coded the refusal's index, so **m14, m17, m18 and m19** were
credited to it merely because changing the NUMBER of emitted marks moved that index — the test
never discriminated their mutation. The r3 claim that "m17 is killed by 18 assertions" is
**withdrawn**; its real discriminating kills are the grader-relation assertions. The cause is
fixed in r4 (§13), so the artifact can no longer mint this kind of credit.

This is the third wrong-credit case of the evening against a campaign the index called clean
(S07 twice, T17B once, these four). **The index proves FORM and cannot prove CREDIT** — a
transcript can be perfectly well-formed, its gates all green, and still attribute a kill to a
test that only counts lines.

The mutants that pin the three blocking fixes:

| id | property | mutation | outcome |
|---|---|---|---|
| m15 | a reduced arm set is REPORTED reduced | `configs.length < requested` → `false` | KILLED by the one-arm test and the end-to-end one-provider path |
| m16 | same-ref arms are lawful arms | `[true, false]` → `[true]` | KILLED — two identities would yield 2 arms, not 3 |
| m17 | a dual-role identity carries BOTH relations | drop the evaluator push | KILLED — this is the B1 defect reintroduced; credited discriminatingly by the dual-role and grader-relation assertions, NOT by the projection-order test (see the correction above) |
| m18 | differing panels are NOT comparable | `signatures.size > 1` → `> 99` | KILLED |
| m19 | an unobservable model relation is UNKNOWN, never NO | `"UNKNOWN"` → `"NO"` | KILLED |
| m20 | run-level degradation counts | drop `\|\| panelsVary` | KILLED |
| m21 | the matrix is revised when the arms differ | `!==` → `>` | KILLED |
| m22 | the stated ceiling cannot exceed the sealed bound | `stated > sealed` → `> 9999` | KILLED |
| m9 | **NEIGHBOUR, must NOT be caught** | reworded a doc comment | **SURVIVED (intended)** |

**One gate abort worth recording, because it is the tooling working.** m12's first NEW token
(`marks: Object.freeze([]),`) already occurred twice in the file; `mutate.sh` refused with
`GATE pre = 2 … ABORT: NEW token already present` and left the tree clean. Re-run with a distinct
token, it kills. A mutation that silently edited the wrong site would have credited a kill to the
wrong assertion.

## 9 · Custody

```
$ tools/stamp-check.sh .worktrees/lane-s11 logs/s11/r3-
TIP=1ac3b8b66df95006d58045eee0014783ad017c8c
records compared: 31 · failures: 0
OK: every record stamps the filed tip

$ git diff --summary 44836ecf..HEAD | grep -c "mode change"
0
$ git diff --name-only 44836ecf..HEAD
dialectical-engine/acceptance/eval-harness-cli.ts
dialectical-engine/acceptance/eval-harness.ts
dialectical-engine/package.json
dialectical-engine/tests/unit/t15-eval-harness.test.ts
```

Five `base-` records bind the pre-change tips they measured (`bd884934`, `2f42eba4`, `725875ae`)
by design; `index-` is derived from records; `input-` is what a check consumes. **Citations
re-derived at this tip** (D53 — this lane changed files it cites): 12 anchors, 12 unique, exit 0,
inside the ordered driver. **Location:** `logs/s11/` holds 47 files; the lane worktree has no
`logs/` directory.

## 10 · DoD

| DoD row (verbatim) | state |
|---|---|
| one-command harness | **CLOSED** — `pnpm run eval:roles`, EXIT 0 |
| table produced | **CLOSED** — `logs/s11/r3-T15b-comparison-table.md`, with provenance, and honest about what it cannot support |
| V decision recorded and seeded | **OPEN — V's** by construction (S6-1); the register row is untouched |
| spend gate demonstrated | **CLOSED** — RED + GREEN + mutants m1, m2; V-S11-3 |

**Carried findings:** F-S11-1 (`node` engine pin vs host, pre-existing, mission-wide).
F-S11-2/N5 now has a check and a test; the remaining step is binding the value to the sealed row
rather than checking it, which is a register change outside this lane. **F-S11-4 is CLOSED** by
this round.

**New finding, named not fixed — F-S11-5.** The comparison is only valid when the arm refs and
the grader panel are disjoint (§2). Nothing in the harness *asks* a deployment to seal such a
pair; it detects the absence and suppresses. Making that a seeding recommendation is register
work (T16's surface), not mine.

## 11 · Artifacts

```
logs/s11/base-r3-repro-b1.log             B1 reproduced BEFORE the fix, @725875ae
logs/s11/base-r3-RED-b1-b2-b3.log         r3 RED @725875ae, EXIT 1
logs/s11/r3-gate-typecheck-root.log       EXIT 0
logs/s11/r3-gate-cluster-S11-C1-run{1,2,3}.log   44/44 x3
logs/s11/r3-gate-projection-output.log    THE PROJECTED COUNT, EXIT 0
logs/s11/r3-gate-lint-audits.log          EXIT 1, 3 pre-existing
logs/s11/r3-classify-lint-preexisting.log the generated causal claim
logs/s11/r3-mut-m*.log                    20 transcripts
logs/s11/index-r3-mut-DERIVED.txt         19 killed / 1 intended / 0 invalid, CLEAN
logs/s11/input-r3-mut-EXPECTED.txt        the manifest, written first
logs/s11/r3-mutant-assertion-credit.txt   81 transcript-matched credits; 4 are index artifacts (see §8)
logs/s11/r3-cite-ordered-driver.log       N3: bad-then-good, timestamped, both exits
logs/s11/input-r3-cite-anchors.tsv        12 anchors
logs/s11/r3-T15b-comparison-table.md      THE COMPARISON TABLE
logs/s11/r3-one-model-path.md             THE ONE-MODEL DEPLOYMENT, end to end
```

Absolute prefix:
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/`

## 12 · What I did not do

No provider call. No credential minted, read or passed (D18). No push, no merge out, no board or
DECISIONS edit, no sub-delegation, no T9 adapter written against an unmerged shape (T9B is
authorized and those signatures are changing). No edit outside the lane worktree, my two reports,
`logs/s11/**`, and the shared `TOOLING-TRAPS.md` append D32 authorizes. Register rows unchanged.


---

## 13 · r4 — merge-in, the N2 comments, and the false-credit cause

### 13.1 · The merge

`git merge --no-ff 19bbb4c4` into `lane/s11` (`1ac3b8b6` → `ca070e28`, then the r4 content commit
`7bb22db4`): **exit 0, no conflicts**, 21 commits, 15 files, +1612/−91.
Record: `logs/s11/merge-r4-integration.log`. No landed assertion was weakened; none needed to be.

**A clean auto-merge with no overlapping files is the T17B shape, so it was checked rather than
waved through.** Four checks, each answerable from the diff:

| question | answer |
|---|---|
| did anything my code READS change? | **No.** `acceptance/seed-register.ts` and `acceptance/runtime-policy.ts` are the two modules the CLI reads through, and neither is in the merge. |
| did build inputs change? | **No.** No `pnpm-lock.yaml`, no `packages/contract/src` — so no reinstall and no contract regeneration were owed. |
| did shared configuration gain a required knob? | **No.** The merge adds `PROVIDER_PROBE_TIMEOUT_MS` to the runner environment schema, and it carries `.default(5_000)`. A *required* knob is the T17B shape; a defaulted one is not. |
| would my cluster even see a coupling? | **No** — which is why I ran a wider sweep. Four files that read no settings cannot detect a settings break. |

### 13.2 · The wider sweep, and its one non-authority name

`vitest run tests/unit tests/architecture` at the merged tip (`r4-gate-unit-architecture-sweep.log`):
**14 failed / 1425 passed (1439), EXIT 1.** Not the authoritative full suite — D13/D15 assigns
that to judge stage on integration — but the smallest run that could see a settings coupling.

Classification is derived by set-comparison against `logs/integration-suite-b11.log`, not narrated
(`r4-classify-sweep.log`):

```
STABLE-RED, present in the b11 authority record — PREDATE ME: 13
PASSED in b11, therefore NOT stable-red — discriminated SOLO:  1
UNEXPLAINED (absent from b11 entirely):                        0
```

The thirteen are exactly the b11 authority names that fall in this scope. **The fourteenth passed
in b11**, so I did not assume it: `tests/unit/registration.test.ts > … S3c B4 keeps the isolated
production RSS curve below the published measured bound`. J19's F22 extension rules that
discrimination is **by solo pass, not by load number**:

```
r4-solo-rss-curve-run1.log -> Tests  1 passed | 57 skipped (58)
r4-solo-rss-curve-run2.log -> Tests  1 passed | 57 skipped (58)
```

Solo ×2 PASS. The reported COUNT is quoted because a `-t` filter matching zero tests exits 0 and
proves nothing. D30 ADDENDUM-3 measured this bound at 247–252 MiB locally against a 256 MiB seal,
so it is a **measurement under memory pressure**, not a behaviour — an F22-family load coupling
from a 1439-test parallel sweep. **Zero unexplained names; zero attributable to this lane or to
the merge.**

### 13.3 · Gates re-run at the merged tip

| gate | result | record |
|---|---|---|
| root `pnpm run typecheck` | **EXIT 0** | `r4-gate-typecheck-root.log` |
| cluster S11-C1 ×3 | **44/44, 44/44, 44/44** | `r4-gate-cluster-S11-C1-run{1,2,3}.log` |
| unit + architecture sweep | **14 failed / 1425 passed**, all classified | `r4-gate-unit-architecture-sweep.log` |
| one-command projection | **EXIT 0** | `r4-gate-projection-output.log` |
| `pnpm run lint` | **EXIT 1 — the same 3 pre-existing** | `r4-gate-lint-audits.log` |
| `git diff --summary 19bbb4c4..HEAD \| grep -c "mode change"` | **0** | — |
| `stamp-check.sh … logs/s11/r4-` | **12 records · 0 failures** | — |
| citations re-derived at the merged tip | **12 anchors, 12 unique, exit 0** | `r4-cite-ordered-driver.log` |

### 13.4 · The N2 comments, and a third stale reference beside them

Both introductory comments described the retired strict policy above code implementing V's. The
module header now states the degrade-and-disclose rule and enumerates the refusals that remain;
the matrix comment now says the harness never *exceeds* the goal's four numbers but may fall
short of them under V-S11-1, with `recordedDebateCount` named as the one figure that still
refuses. **Found while fixing those two:** the header referenced `applyApprovalGate`, which is
not a function in this file or anywhere in the repo — `grep -c` returns 0 now, and returned 1
before, that one being the comment itself.

### 13.5 · The credit correction, and its cause removed

§8 carries the correction in full: the count is **81**, not 82, and **m14, m17, m18 and m19 were
index artifacts**, not D43 credits. The r3 claim that m17 was killed by 18 assertions is
withdrawn.

**The cause is now removed rather than annotated.** The projection-order test hard-coded
`expect(refusalIndex).toBe(12)`, so any mutation changing the *number* of emitted marks failed it
without discriminating anything. It now pins `expect(refusalIndex).toBe(emitted.length - 1)` —
the refusal is the LAST line emitted, which is the property the assertion was always reaching for
and which no unrelated mark can move. The distinct mark set and its ordering keep their own test.
That artifact can no longer mint this kind of credit.

I did not re-run the r3 campaign to regenerate credits under the fixed test: the r3 transcripts
remain the record of that tip, the four affected entries are named here and in the artifact index,
and re-running would replace evidence the judge has already verified. **The generalisable rule, if
it is wanted for the tooling:** a credit is only a credit when the failing test's assertion
mentions something the mutation changed — a test asserting an *index* or a *count* can be moved by
any upstream mutation and should never appear in a credit list.

### 13.6 · One more instance of my own dominant defect, caught at filing

My first attempt at `r4-classify-lint-preexisting.log` printed the command output and then a
narrated line reading "(empty above = this lane changed no manifest)" — while the output directly
above it listed `dialectical-engine/package.json`. The record contradicted itself in two adjacent
lines. Regenerated: the lane *does* change the ROOT manifest by one `scripts` entry, the root is
not one of the audit's 28 edge rows, a scripts entry declares no dependency edge, and a second
command shows no workspace MEMBER manifest changed at all. This is the D51 class again, in a
record I generated specifically to satisfy D51.


---

## 14 · r5 — merging T17B, the one merge whose surface actually touches mine

### 14.1 · Why this merge was the risky one, checked before it was made

T17B changed `packages/register/src/algorithm-policy.ts`, `packages/register/src/index.ts` and
`acceptance/runtime-policy.ts` — **all three of the modules this lane's CLI reads through**, and
T17B's own merge is the case that broke a suite with zero overlapping files. So the incoming diff
was read against my two read points *before* merging, not after:

| my read point | verdict |
|---|---|
| `readSynthesisRoleControls` (role refs + loop bound, J8) | **untouched** — `grep` over the diff for `readSynthesisRoleControls` and `SYNTHESIS_ROLE` returns nothing |
| `policy.bounds.JUDGE.{maxAttempts,tokenCeiling}` (N5 ceiling check) | **untouched** — `costBoundSchema` and `acceptanceOrganCostBounds` are not in the diff |
| `policy.providers[].{providerRef,maker}` | **untouched** |
| `AcceptanceRuntimePolicy` shape | **additive** — gains `envelopeFormulaInputs`; nothing removed or renamed |

### 14.2 · The merge

`git merge --no-ff 152ed7ed` (`7bb22db4` → `33fc01de`): **exit 0, no conflicts**, 13 commits,
18 files, +1796/−64. Record `logs/s11/merge-r5-integration.log`. No landed assertion weakened;
none needed to be. No `pnpm-lock.yaml` and no `packages/contract/src` change, so no reinstall and
no contract regeneration were owed. **Behind integration: 0.**

### 14.3 · Gates at the merged tip

| gate | result | record |
|---|---|---|
| root `pnpm run typecheck` | **EXIT 0** | `r5-gate-typecheck-root.log` |
| cluster S11-C1 ×3 | **44/44, 44/44, 44/44** | `r5-gate-cluster-S11-C1-run{1,2,3}.log` |
| unit + architecture sweep | **13 failed / 1465 passed (1478)** | `r5-gate-unit-architecture-sweep.log` |
| one-command projection | **EXIT 0** | `r5-gate-projection-output.log` |
| `pnpm run lint` | **EXIT 1 — the same 3 pre-existing** | `r5-gate-lint-audits.log` |
| `git diff --summary 152ed7ed..HEAD \| grep -c "mode change"` | **0** | — |
| `stamp-check.sh … logs/s11/r5-` | **10 records · 0 failures** | — |
| citations re-derived at this tip | **12 anchors, 12 unique, exit 0** | `r5-cite-ordered-driver.log` |

Typecheck passing at EXIT 0 is itself the mechanical proof that the four read points above still
resolve: my CLI destructures `policy.bounds.JUDGE` and calls `readSynthesisRoleControls`, so a
renamed or removed member would be a compile error rather than a runtime surprise.

### 14.4 · The sweep, classified against both the previous sweep and the authority

`r5-classify-sweep.log`, derived by set-comparison — no prose input:

```
r5: 13 failed / 1465 passed (1478), EXIT 1
r4: 14 failed / 1425 passed (1439), EXIT 1   <- +39 tests, all passing

NEW failing names vs r4 — anything attributable to me or the merge: 0
VANISHED vs r4: 1
   tests/unit/registration.test.ts > … S3c B4 keeps the isolated production RSS curve below the published measured bound
STABLE-RED present in the b11 authority: 13
PASSED in b11, would need solo discrimination: 0
UNEXPLAINED (absent from b11 entirely): 0
```

**Zero new names.** T17B's 39 new tests all pass here. Nothing is attributable to this lane's
diff or to the merge.

**The one vanished name is worth a sentence, because it is evidence rather than noise.** It is the
RSS-curve measurement I solo-discriminated in r4 and attributed to memory pressure. It failed
under the r4 sweep and **passes here on the same host at a larger test count** — a second,
independent observation of the same coupling, rather than a re-assertion of the first. That is
what an F22-family load flake looks like from the outside, and it is the outcome the r4 diagnosis
predicted.

### 14.5 · One finding from this merge, named not fixed — F-S11-6

`readAcceptanceRuntimePolicy` now also reads the sealed `envelopeFormulaInputs` row
(`acceptance/runtime-policy.ts`, via `readEnvelopeFormulaInputs`). My CLI calls that function for
the provider set and the organ bound, so **its preflight now additionally requires that row to be
seeded**. This is not a break — the shape I read is unchanged, the requirement is additive, and my
preflight already refuses loudly on any register read failure — but it is a new precondition on a
path nobody re-derives when the row list grows. It belongs to whoever owns the acceptance seeding
list, not to this lane. Recorded so it is not discovered at the first V-approved run.
