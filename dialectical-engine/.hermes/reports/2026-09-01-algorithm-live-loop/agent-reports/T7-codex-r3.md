CODEX REVIEW T7 r3 — CHANGES · comments read through: t07-r3-2026-09-02

# T7 codex peer review r3

## VERDICT

**REWORK / CHANGES. Finding count: 2 — B1 blocking; N1 non-blocking but
mandatory.** Worker rework 3/3 is spent. This verdict does **not** open an unlawful round 4:
B1 must become a V DECISIONS PACKET row, and N1 must be routed as a same-day evidence-refiling
ticket (or explicitly disposed by V).

The r4 work closes codex r2 B1 and the named partial-scope branch of B2: the maker-root count is
required at the exported strict API, the fallback is gone, all call sites state a count, the
compile-time omission fixture is inside the root TypeScript program, both public entry points
validate before partition-dependent returns, and the shared body records codex's exact
`1/2 -> 3/4` partial-root movement. N1's commit count is 13, and N2 now uses the true binary64
successor of `1/8`.

Approval is still blocked by another literal movement erasure in that shared body. The
`NO_MEASURED_EDGE` arm returns a real `maxRootMovement` but hard-codes an empty moved-root list.
The new arm-matrix test constructs this exact moved input and fails to assert the false field.

## FINDINGS

### B1 — `NO_MEASURED_EDGE` still erases moved roots after the shared body computed them

**Files/lines:** `dialectical-engine/packages/propagation/src/index.ts:844-857,910-925`;
`dialectical-engine/tests/unit/t07-adaptive-stopping.test.ts:1554-1584`, especially `:1562`.
Worker report `agent-reports/t07-stopping.md:688-724` and `:839-843`.

**Concrete failure:** call the exported outer boundary with the worker's own r4 counterexample,
changing only its evidence count:

```text
completedRounds = 2
depthCeiling = 5
rootNodeIds = ["root:A", "root:B"]
expectedRootCount = 2
previous root:A strength = 1/2
current root:A strength = 3/4
root:B absent from both strength sets
measuredEdgeCount = 0
delta = 0.01
```

`partitionComparableRoots` yields comparable `[A]`, uncomparable `[B]`.
`decideWithScope` then computes `maxRootMovement = 1/4` and
`moved = ["root:A"]`. The no-evidence arm at lines 910-925 returns:

```text
CONTINUE / NO_MEASURED_EDGE
maxRootMovement = 0.25
movedRootNodeIds = []
comparedRootNodeIds = ["root:A"]
uncomparedRootNodeIds = ["root:B"]
```

The reason is conservative, but the record is false: it says A was compared and that the
maximum movement was `0.25`, while denying that any root moved more than `0.01`. This is the
same fact-erasure class as codex r2 B2. Dominant reason and diagnostic truth are independent;
`NO_MEASURED_EDGE` may outrank movement without deleting it.

**Evidence:** this is direct control-flow derivation from finalized source. The test's arm array
at line 1562 constructs `boundaryInput` (A moves exactly `1/4`, B uncomparable) with
`measuredEdgeCount: 0`, but the test asserts only
`maxRootMovement === null <=> comparedRootNodeIds.length === 0`. It never checks
`movedRootNodeIds`, so it passes over the false record. A static arm scan found the other
hard-coded empties justified: no previous comparison, no comparable root, or proven
convergence. This arm alone discards a nonempty `moved` value.

**Required disposition / V-row draft:** no round 4 is lawful.

> **V-T7-codex-r3-1 · `NO_MEASURED_EDGE` erases a computed moved-root fact.**
> Decision required: authorize a post-cap correction or hold T7. Recommendation: hold until the
> arm returns `movedRootNodeIds: moved`, the exact input above is pinned, and its reported-defect
> mutant is filed in valid D24 shape. Default: do not merge T7 with a knowingly false stopping
> record.

### N1 — all eight r4 mutant transcripts fail D24's mutation-token restore requirement

**Files/lines:** `DECISIONS.md:769-775` (D24); exemplar
`logs/t07/r4-mut-MC2-partial-arm-erases-movement.log:13-14,34-39,56-64` and
`r4-mut-MC7-false-compared-record.log:13-14,32-36,55-63`; worker report
`agent-reports/t07-stopping.md:813-835`.

D24 makes a mutant transcript admissible only when it includes a token grep proving the mutation
applied and a post-restore grep whose mutation-token count is zero. The r4 harness prints the
placeholder command `grep ... '<mutation token>'`, but its output targets original or unrelated
text. In MC2 the supposed applied-token grep prints the two unchanged
`ROOT_SCOPE_INCOMPLETE` reason lines; after restore it still reports `2`. In MC7 it prints the
unchanged coverage gate rather than the changed `compared` assignment; after restore it reports
`1`.

The post-restore counts across `MC1..MC7,MN3` are, respectively:

```text
5, 2, 2, 2, 2, 1, 1, 2
```

None is D24's required zero. The mutation diffs, discriminating outputs, restore commands, clean
porcelain, and matching file hashes are present, so this is not evidence that the results were
fabricated and it adds no second product blocker. It is nevertheless a binding fleet-law defect:
the campaign may not be described as “transcripts in D24 shape” until the actual mutant-only
tokens are shown present after apply and absent after restore.

**Required disposition / routing ticket:** refile all eight r4 transcripts from a harness that
enforces `pre=0`, `applied>0`, `restored=0`, while retaining the mutation diff, discriminating
result, restore command, and both-side hash. Route as **T7 r4 D24 transcript admissibility** the
same day. This is evidence repair, not worker round 4.

## CODEX R2 DISPOSITIONS

- **r2 B1 — CLOSED.** `expectedRootCount` is required at
  `packages/propagation/src/index.ts:983`; the fallback is absent; the strict decision validates
  it and all current calls supply it. The omission fixture is at
  `tests/unit/t07-adaptive-stopping.test.ts:1443` and root `tsconfig.json` includes
  `tests/**/*.ts`. Stored MC1 records both channels: TS2578/exit 1 and one runtime failure,
  subject to N1's D24 filing defect.
- **r2 B2 — named path CLOSED, record-truth property still blocked by this round's B1.** Both
  entry points run `assertRoundDecisionInputs` first. One `decideWithScope` body computes the
  comparable subset's movement. Codex's partial A/B case returns
  `ROOT_SCOPE_INCOMPLETE`, `maxRootMovement: 0.25`, and moved root A; overfull and all requested
  invalid inputs reach the outer guards. MC6/MC7 are re-aimed at the shared body. The new B1 is a
  distinct remaining arm that the refactor retained.
- **r2 N1 — CLOSED.** Fresh read-only metadata returned `13` for
  `git rev-list --count 7433be7..HEAD`; the report quotes the same output.
- **r2 N2 — CLOSED.** `1/8 = 2^-3`; normalized binary64 spacing immediately above it is
  `2^(-3-52) = 2^-55`. The same-endian `DataView` bit increment is monotonic for this positive
  finite value and therefore returns exactly `1/8 + 2^-55`, not `0.126`.

## DISCLOSED INTEGRATION LIMIT AND V-ROW DRAFTS

I accept the worker's argument for not repeating the three-run heavy integration cluster in r4.
The actual r4 diff is only `packages/propagation/src/index.ts` plus its unit file; it does not
touch `apps/runner/src/index.ts`. On complete comparable live scopes, the shared body preserves
the old stop/continue outcomes. On partial scopes, the changed dominant reason remains
CONTINUE, and record corrections do not change expansion control. The stored focused live
fixture reports `1 passed | 65 skipped (66)` at load 27.12. This acceptance does **not** waive
D15: the ticket makes the D15 batch suite on integration the binding pre-merge measurement, and
I require that measurement before merge.

The worker's two V drafts are truthful and decision-shaped:

- **V-T7-r4-1** names a real harness gap, supplies a decision, recommendation, default, and
  residual risk. The required count makes ordinary upstream narrowing conservative even if the
  structural source pin disappears. A caller forging its semantic inputs remains honestly
  disclosed risk.
- **V-T7-r4-2** accurately states that one permanently uncomparable expected root disables
  delta convergence while the unconditional ceiling still terminates the run; under the
  accepted late boundary, epsilon/halt are the remaining adaptive savings. Its recommendation
  preserves the conservative coverage law and sends the round-major tradeoff to measured
  flagship spend.

Neither existing draft covers B1 or N1 above; the orchestrator must add the new V row and evidence
ticket rather than treating this verdict as worker round 4.

## PACKET AND STATIC EVIDENCE AUDIT

No defect was found in `packets/t07-codex-r3.md` or `packets/t07-rework-r3.md`. Rulings were
listed first; both required output paths are inside the packet's writable surface; base/tip and
prior-verdict paths resolve; the r3-tip source anchors are exact; and the current packet's marker,
report hash, count, heading, and mode-change statements match the artifacts.

Fresh read-only metadata:

```text
HEAD = b64c1d04ed1082d0dc7f27d279d48c4708e396ce
git rev-list --count 7433be7..HEAD = 13
git diff --stat 754090a..HEAD = 2 files, 396 insertions(+), 115 deletions(-)
git diff --stat 7433be7..HEAD = 14 files, 2658 insertions(+), 51 deletions(-)
git diff --summary 7433be7..HEAD | grep -c "mode change" = 0
git status --short = empty
git diff --check 7433be7..HEAD = empty
```

The worker report's line-2 hash verifies under its stated `sed '2d'` recipe as
`1343e230896235ae2035baeb8218004c8241ad9af8efd11797026762a1d6f3cc`; the r4 heading is
line 624. Stored r4 focused evidence reads `61/61`, root typecheck exit 0, and zone runs
`228/228` three times. These are readings of stored artifacts, not reviewer reruns.

D16 pairs are byte-identical: UI SHA-256
`6729556094431e66e106dbe8c340436ed2b15bdaf6bd0593e45559108c26f1e9`, web
`7692c06ab0582cb9f020d3fcc53338d9ab7d3cb72ac2287b72ea37b6a3075670`; each contains only
its pre-existing `layout.tsx(3,8): TS2882`. Architecture and source audit pairs are likewise
byte-identical at `dc0a7a867d159dc8edca62ca446087b6415322428df283210b1839ac5f494c7e` and
`93a3f80a6da26c98011f04d24c3bb2e2c5ca4ace0d78caf0548479667b3ab763`; the orphan r3/r4
pair is byte-identical at `69170c7fc3bf27683d316f60f2028ddbb6cacb8445caa7c1d0ba8c1f24ea3db4`.

## NOT VERIFIED

- I ran no tests, builds, typechecks, installs, mutation commands, database fixtures, browser
  flows, or provider calls. Runtime totals are stored worker output only.
- I did not repeat the heavy integration cluster or remeasure its base. The stored r3 three-run
  evidence remains `1 failed | 65 passed (66)` with membership set-equal to the stored base;
  D15 remains required.
- I did not build the partial-standing embedded-postgres closure fixture accepted as deferred in
  codex r2 and shaped as V-T7-r4-1.
- I did not consult another review lens, mutate board state, or change product/git state. The only
  writes are this verdict and the appended `## r3` self-report authorized by the packet.

## PREDICTIONS

Other lenses will likely approve after seeing the exact `0.25` partial-scope case and the
seven-arm nullability biconditional; I predict at least one will not inspect the no-evidence arm's
separate moved-root list, even though the fixture already supplies the discriminating movement.
I also expect the matching pre/post file hashes to make most reviewers call the mutation logs
D24-complete without noticing that every post-restore “mutation token” count is nonzero and some
applied-token greps print unrelated lines. The first cross-lens checks should therefore be the
record returned by line 918 for `{movement: 1/4, measuredEdgeCount: 0}` and the literal token
counts in MC2 and MC7—not another reading of the headline or suite totals.
