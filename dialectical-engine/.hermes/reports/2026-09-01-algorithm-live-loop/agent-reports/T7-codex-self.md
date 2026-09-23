## r1

# T7 codex reviewer case file

## Cause and price

The lane's central defect is architectural ordering, not arithmetic. J15(a) put both
global stopping and branch freezing at a boundary that is correct for GLOBAL round
completion, but the retained plan is root-major. By the time that boundary is reached,
all earlier roots have already expanded beyond the branches that are only then declared
frozen. The worker's F-T7-8 analysis noticed this for delta stopping but asserted epsilon
freezing was unaffected. That assertion hid the same ordering defect in the other half of
adaptive stopping.

The second defect is a caller/callee contract break. `rootMovement` correctly refuses a
supplied root that lacks a strength, but the live caller filters missing roots out before
calling it and refuses only the zero-root case. A partially judged M>=2 debate can therefore
converge on a strict subset of its roots. The unit guard is sound; the integration seam
evades it.

Price if these had passed: at least one worker rework plus one additional peer-review
round, and a flagship run could spend the full earlier-root tree while publishing a false
"Branch not expanded" disclosure or could stop without measuring every root. This review
used one static source pass and two independent calculation probes; no test, build, or
provider retry was spent because the packet forbade them.

## What repeatedly cost tokens

- The packet said the diff had five commits, while `git rev-list --count 7433be7..HEAD`
  returned six. Rechecking packet metadata that can be generated mechanically is pure
  review overhead.
- The mandatory Global DoD source was named only as `goal-prompt.md`; that name does not
  resolve from the assigned cwd. Finding its actual prior-mission path required a search.
- The 796-line T7 test file proves many local properties but does not expose the two live
  seam failures. Following the values from planner -> boundary -> root projection ->
  frozen index mutation was the expensive but necessary part.

## What I nearly got wrong

I nearly accepted "epsilon freeze is unaffected" because the boundary returns correct
freeze decisions and the unit fixture shows the mark. Enumerating the M=2, depth=2 plan
showed that root 0's descendants occupy legs 2-5 before the round-1 boundary at leg 7;
the later `frozenIndices` writes cannot undo those calls.

I also nearly treated the M6 "byte-for-byte" statement as either wholly true or wholly
false. The typed error payload is byte-identical to the r1 trace, but the full failure block
is not because source line offsets changed. The precise statement is payload-identical,
not log-identical.

The round-floor example also needed care: its dyadic movement is exactly zero, but its
`completedRounds: 1` arm supplies a previous strength set that the ratified J15(c) live
caller can never supply at round 1. The arithmetic is sound; the report's "only the floor"
description is not a live-state proof.

## Dead ends

- `rg --files` against the hidden `.hermes` log path initially returned no files. An exact
  directory listing showed the logs were present; no evidence was missing.
- Comparing whole M6/r1 failure blocks produced expected source-line diffs. Restricting the
  comparison to the typed payload established the meaningful equality.
- Reading more author tests would not settle the root-major timing issue. A four-line
  independent plan enumeration did.

## One-prompt-machine upgrades

1. Generate packet base SHA, HEAD SHA, commit count, shortstat, and mandatory artifact
   paths from one script; never transcribe them.
2. For any derived boundary, require the packet to include an event-time matrix showing
   work already performed and work still preventable for every downstream action, not only
   the headline action.
3. Add a standard live-caller invariant: the cardinality of every semantic scope passed to
   a pure decision must equal the cardinality of the authoritative scope before filtering.
4. Make honesty marks test their antecedent in the integrated loop. A mark saying "nothing
   was expanded beneath it" must assert that no descendant author call preceded the mark.
5. Keep the compact exact-rational table in the packet. It made the dyadic audit quick and
   left review time for the actual seam defects.

## r2 (filed in-sandbox, copied by orchestrator)
## r2

# T7 codex reviewer case file — round 2

## Cause and price

The rework closed the live caller's old standing filter and the freeze-mark falsehood, but
split the stopping law across a strict function and a permissive partial-scope wrapper. That
split is the new root cause. `decideRoundContinuation` still lets callers omit the run's
maker-root count and silently substitutes the supplied scope length. `decideRoundBoundary`
then bypasses the strict function whenever even one root is uncomparable, which also bypasses
its validation and movement calculation. The result is safe against an early delta stop but
not closed by construction and not truthful as a decision record.

The price of passing it would be a public decision API on which a future narrowed caller can
recreate r1 B1, plus audit fields that erase an exactly `1/4` movement while claiming the root
was compared. Both are cheaper to fix in the last lawful worker rework than to rediscover after
integration or serving begins consuming the record.

## What repeatedly cost tokens

- The packet called `expectedRootCount` REQUIRED, while the worker report narrowed that claim
  to `AdaptiveStoppingRoundInput` and `decideRoundBoundary`; the exported strict decision still
  declares it optional. Reconciling those three scopes was the decisive check.
- The report's commit arithmetic was handwritten again. Six pre-checkpoint commits plus the
  checkpoint plus four r3 commits is eleven, not ten.
- The partial-root tests assert the compared/uncompared lists but never assert movement on a
  comparable root that actually moved. The truthful-looking list initially hid the untouched
  `maxRootMovement: null` and `movedRootNodeIds: []` literals.

## What I nearly got wrong

I nearly accepted `comparedRootNodeIds: ["root:A"]` as truthful merely because A occurs in both
strength maps. The interface promises roots the decision actually compared, not roots it could
compare. The partial branch performs only membership tests and never subtracts A's strengths.
Its `null` movement despite a non-null previous round is the concrete contradiction.

I also nearly treated the semantic invariant plus labelled structural source pin as insufficient
solely because the requested integration fixture was not built. For the current live closure the
substitution is proportionate: the constructor is blind to standing, the seam passes both fields,
and the downstream count gate makes narrowing conservative. The blocker is instead that the same
law is not mandatory at the exported strict API and is bypassed on the wrapper's partial branch.

## Dead ends

- The runner implementation is in `apps/runner/src/index.ts`, not the propagation package; an
  initial path probe returned no content and was discarded.
- A zsh loop used scalar splitting semantics incorrectly while pairing stored base/tip logs. The
  explicit comparisons then showed the D16 and audit hashes really are byte-identical.
- Reading only the mutation table suggested all three scope guards were pinned. Following MN2 to
  its test showed the overfull and invalid-count assertions exercise the strict helper only, not
  the live partial wrapper that bypasses it.

## One-prompt-machine upgrades

1. For every returned diagnostic field, require a mixed case: one comparable root moves and one
   expected root is uncomparable. Stable-only fixtures cannot prove movement-record truth.
2. Run every defensive-input mutant through the outermost public/live entry point as well as the
   helper that owns the guard.
3. Express required contract fields with a compile-fail omission fixture; a runtime test that
   always supplies the field cannot prove TypeScript made it mandatory.
4. Generate commit count as `rev-list --count BASE..HEAD` in the report instead of adding prose
   totals across seat handoffs.
5. When a test says “one representable step,” construct the next IEEE-754 value or state merely
   “a higher value”; for `1/8`, the next value is exactly `1/8 + 2^-55`, not `0.126`.

## r3

# T7 codex reviewer case file — round 3

## Cause and price

The product defect is another duplicated truth field, but this time inside the newly shared
decision body. `decideWithScope` computes `moved` once and correctly carries it through the
floor, ceiling, partial-coverage, and ordinary movement arms. The `NO_MEASURED_EDGE` arm then
overwrites that fact with `movedRootNodeIds: []`. The new biconditional fixture actually builds
the discriminating input—root A moves exactly `1/4`, root B is uncomparable, and
`measuredEdgeCount` is forced to zero—but asserts only the nullability of `maxRootMovement`.
The test walks directly past the false field it needed to inspect.

Price if this passed: a decision record can say A was compared and moved by `0.25` while its
moved-root list denies that A moved. That contradicts the final round's headline that the shared
body “erases nothing” and the mission's truth-record discipline. Since worker rework 3/3 is
spent, the price is now a V decision row rather than a four-minute worker correction.

The process defect is in the mutation harness. All eight r4 transcripts contain useful diffs,
discriminating results, and matching pre/post file hashes, but their placeholder “mutation
token” greps target original or unrelated text. Their post-restore counts are 5, 2, 2, 2, 2,
1, 1, and 2—not D24's required zero. Substantively the file hashes make restoration credible;
formally D24 declares the transcripts inadmissible. Price: one evidence-refiling ticket across
the whole r4 campaign, plus reviewer time checking every log after the report called them D24
shaped.

## What repeatedly cost tokens

- The 939-line cumulative worker report and 505-line self-report exceeded a combined tool
  output window. Reading them in bounded, numbered chunks avoided silently skipping the r4
  section, but packet generation should supply round-local excerpts plus hashes for unchanged
  history.
- The r4 diff likewise exceeded one display window. Reading the finalized decision body
  directly was cheaper and exposed the remaining hard-coded empty arm immediately.
- The mutant harness prints the literal label `<mutation token>` rather than the actual grep
  expression. That forced eight manual transcript audits and made a superficially complete
  six-section template misleading.

## What I nearly got wrong

I nearly accepted the `maxRootMovement === null` biconditional as a complete record-truth proof.
It proves only whether a comparison happened; it says nothing about whether the moved-root list
matches the movement already computed. The fixture's no-evidence arm at line 1562 is especially
dangerous because its `0.25` movement makes the missing assertion visible by inspection.

I also nearly required the full three-run integration cluster merely because propagation code
changed. The r4 diff does not touch the runner, and on complete comparable scopes the shared body
preserves every stop/continue outcome. Partial-scope precedence changes remain CONTINUE. The
focused live-boundary fixture is therefore a proportionate round-local check, while D15 remains
the binding pre-merge measurement.

Finally, matching pre/post file hashes tempted me to waive the token-grep defect. That would be
reasonable evidence engineering in isolation, but D24's admissibility list is explicit and the
reviewer contract makes rulings binding. The right classification is mandatory evidence refile,
not a claim that the product mutation results are fabricated.

## Dead ends

- `rg --files` returned nothing for the explicit hidden `.hermes` log directory; an exact
  directory listing showed all artifacts were present. This repeated the r1 environment trap.
- A duplicate-root scope (`[A, A]` with expected count 2) can fool a cardinality gate, but the
  live authoritative constructor obtains distinct authored node identities and the V-row draft
  already scopes caller-forged fields as residual risk. I did not turn a deliberately forged
  caller contract into a new finding when the concrete shipped caller does not produce it.
- The full heavy integration file uses a shared stopping policy in many runner fixtures, so
  “only one test names stopping” was not enough. Comparing old/new decision outcomes, rather
  than counting text references, established why the focused substitution is acceptable.

## Packet friction and one-prompt-machine upgrades

The codex-r3 packet itself was unusually effective: rulings were first, both prior verdict paths
resolved, constants checked, and the question “Does any arm still hard-code null/empty movement
fields?” pointed at the exact remaining defect. I found no packet defect in it or the worker r3
packet.

1. Add a decision-record invariant helper to every packet: whenever comparison exists,
   `movedRootNodeIds` must equal the roots whose absolute movement is strictly above delta,
   independently of the dominant reason arm.
2. Make the D24 harness accept an actual mutant-only token and enforce counts
   `pre=0 → applied>0 → restored=0`; abort transcript creation otherwise.
3. Have packet lint parse each mutant transcript and reject placeholder grep commands or
   nonzero post-restore counts before dispatching a reviewer.
4. When fresh probes are forbidden, include a round-local arm matrix listing input,
   precomputed movement, reason, and every returned record field. That turns static review into
   a finite truth-table audit instead of a prose chase.

## t7b

# T7 codex reviewer case file — V-authorized micro-ticket T7B

## Cause and price

The defect closed here was a one-line truth-record erasure: `decideWithScope` had already
computed `moved`, but the `NO_MEASURED_EDGE` arm replaced it with a literal empty array. The
micro-ticket changes that assignment to `moved` without weakening the dominant no-evidence
reason. Price of the original miss: a post-cap V authorization, a second codex review, one new
mutation transcript, and six repeated cluster runs for a correction whose product diff is one
assignment plus its comment.

The process cause was incomplete field-level coverage in r4. Its arm matrix exercised the exact
counterexample but checked only the nullability relationship between `maxRootMovement` and
`comparedRootNodeIds`; it never compared `movedRootNodeIds` with the movement already computed.
The T7B pin now asserts the complete returned record for A moving `1/2 -> 3/4`, B uncomparable,
and zero measured edges.

## What repeatedly cost tokens

- Cumulative reports made the round-local evidence expensive to locate. The packet's direct T7B
  section and eight exact log names substantially reduced that cost; future packets should keep
  supplying bounded section anchors.
- The normal reviewer contract asks for an independent failure-direction probe, while this packet
  prohibited all execution. Resolving that conflict required a static proof from control flow,
  the exact test input, and stored mutation output, plus an explicit verification limitation.
- Prose such as “nothing else changed” is easy to misread when the test file necessarily changed.
  Diff statistics and the two-file allowlist were the reliable statement of scope.

## What I nearly got wrong

I nearly treated the second no-stop test's negative assertions as too weak in isolation. On the
same concrete input, however, the immediately preceding pin already states the exact `CONTINUE /
NO_MEASURED_EDGE` outcome and all diagnostic fields; the second test can fail in both forbidden
directions and is therefore redundant but not vacuous.

I also nearly rejected the RED evidence solely because it was not pre-implementation. That would
ignore the micro-ticket's unusual host hold and the stronger relevant facts: the mutant restores
my published defect verbatim, its test fails at the moved-root assertion, token gates are
`0/1/0`, restoration hashes match, and the expected values predate the worker's implementation.
This is adequate reported-defect evidence, while still not evidence of test-first authorship.

## Dead ends

- Re-auditing unrelated historical r4 mutants would not answer T7B; the packet correctly limits
  the evidence question to T7B-M1 and the already-repaired D24 shape.
- The three remaining literal empty arrays first looked like repetitions of B1. Static branch
  conditions prove each equals `moved`: movement is absent in two arms and `moved.length === 0`
  gates the convergence arm. Uniformly returning `moved` remains a good follow-up, not a T7B
  defect.
- The all-UNKNOWN J15(b) fixture uses movement exactly zero, so it cannot pin the moved-root
  correction. It serves a different purpose: proving zero evidence still refuses convergence.

## Packet friction and one-prompt-machine upgrades

The T7B packet was internally consistent: its paths resolved, its two writable outputs matched
the deliverables, its commit/tree/stat/hash constants reproduced, and its scope matched V's
authorization. Its explicit request to rule on post-fix mutant adequacy prevented a silent
assumption about RED chronology.

1. Generate the eight-arm return matrix mechanically from source and require every diagnostic
   field to be accounted for, not just the decision reason.
2. For a reported-defect micro-ticket, make the packet declare the acceptable evidence form:
   published counterexample provenance, verbatim mutant, discriminating failure, enforced
   `pre=0 / applied>0 / restored=0`, and identical restore hashes.
3. Phrase scope checks as “no other product arm or product file changed” when a required test file
   is also part of the diff.

## merge

### Cause and price

The merge itself was disciplined: nine combined-diff hunks across eight files, with both
parents' semantics retained. The expensive ambiguity was evidence extraction. The packet
presented competing mark counts, and the only safe resolution was to delimit the literal
`CONDITION_MARKS` array and count every string entry at each named commit. That cost one focused
object-inspection pass and prevented a false review finding: the 28/29 extraction required a
trailing comma and allowed only `[A-Z-]`, silently excluding three underscore-bearing marks plus
the final no-comma array member.

The actual finding was provenance rather than product behavior. The packet and worker report
say the detached `1fad4e16` zone baseline ran its own `generate:contract`, but the baseline log
begins with Vitest and the only captured generation command is stamped at the merged tip. Static
review therefore cannot distinguish a coherent regenerated baseline from one using ignored
generated output left by the merged tip. Price: one evidence-only correction cycle; worker
rework remains 3/3 and no product change is indicated.

### What repeatedly cost tokens

- Cumulative reports and logs still require manual correlation. A gate claim split across a
  report, a self-report, and a log is testimony until one artifact captures command, exit,
  commit, tree, and clean state together.
- Merge review needs two different diffs: the combined diff identifies manual resolutions, while
  both parent-to-merge diffs identify weakened assertions. Treating either as sufficient would
  miss part of the question.
- Regex counts over source arrays are brittle when they encode style assumptions such as hyphens
  only or mandatory trailing commas. Counting syntactic entries inside explicit array bounds is
  both shorter and more accurate.

### What I nearly got wrong

I nearly accepted 28/29 because its relative arithmetic was correct. The counterexample was the
source itself: `ENVELOPE_EXHAUSTED`, `LEVERAGE_UNRESOLVED`, and `NOT_SAMPLED` are lawful array
members with underscores, while `UNAUTHORED-BRANCH-HALTED` is the lawful terminal member without
a trailing comma. Relative agreement does not validate an absolute extractor.

I also nearly treated every deleted assertion-shaped diff line as a merge weakening. Against the
T7 parent, S06 replaces the retired first-configured-root expectations with stricter live-strength
and exact-root assertions; against the integration parent, T7 replaces the leverage stub with the
implemented exact `0.125` outcome. Those are semantic upgrades inherited from the parents, not
manual-resolution losses. The combined diff narrows the actual conflict-touched test changes to
the integration helper and three exact count pins.

### Dead ends

- Grepping all uppercase-and-dash strings could not settle cardinality because it reproduced the
  extractor's assumptions instead of counting the array.
- Runtime re-execution would have violated the packet and would not repair missing historical
  provenance. The correct remedy is a newly captured detached baseline generation plus zone run.
- Re-litigating T7's stopping semantics was out of scope. The propagation source and the entire
  T7 unit file are blob-identical to parent `3ea7fd33`; the structural seam remains literal.

### Packet friction and one-prompt-machine upgrades

The packet was otherwise unusually precise: the marker, two writable outputs, hashes, parents,
conflict count, priority order, and deferred-suite question all resolved. Its baseline-generation
claim should have named a dedicated log or required one combined log containing both commands.

1. For every detached-baseline comparison, capture `generate:contract` and the comparison suite
   in the same stamped log, with both exit statuses and a clean-state line.
2. Ship a repository helper that parses the literal `CONDITION_MARKS` array and prints indexed
   entries, cardinality, and tail hash; never encode punctuation or naming-style filters.
3. Have merge packets enumerate conflict-touched test files separately from all parent-diff test
   files, so reviewers can prove both manual resolution and inherited assertion preservation
   without rediscovering the distinction.
