## r1

# CODEX REVIEWER SELF-REPORT — T3C r1

## Cause and price

The expensive failure mode was not the F33 wiring itself; that path is short and statically coherent. The cost came from treating evidence production as a tail activity. D27 had already made the order mechanical—change, commit once, then run and stamp every gate—yet the filing promoted a pre-commit typecheck into a table headed “at the committed tip.” Repair now costs another review cycle and another gate pass even if no product code changes.

The second recurring cause was assertion repair at the query surface rather than at the event model. The F34 test discovered that one network probe creates two append-only `core.provider_probe` rows, but replaced `LIMIT 2` with `SELECT DISTINCT provider_ref`. That made the membership assertion green while preserving a false history: two probe IDs for one probe. The near miss was accepting the worker’s “corrected assertion” disclosure without tracing both writers.

## What nearly went wrong

- I nearly treated the F34 clean-tip mutant as a full substitute for the required pre-implementation RED. It proves that the source assertion can fail, but it cannot repair the recorded ordering violation.
- I initially compared the report’s embedded SHA to the literal whole-file SHA. D21’s convention hashes the report with line 2 removed; `sed '2d'` reproduces `1f46e1c9…`, so this is not a packet defect.
- `git diff -M` cannot express a function extracted from a file that remains in place. Comparing the old and new `probeTarget` bodies was the useful static check; it supports the pure-move claim.

## Dead ends and upgrades

The reviewer contract normally requires an independent probe, but this packet expressly prohibited tests and builds. I did not try to approximate runtime evidence with an unauthorized command; I used source ordering, committed artifacts, hashes, and transcript structure, and marked runtime outcomes not independently rerun.

Three upgrades would make this closer to a one-prompt machine:

1. Make the D27 recorder reject any gate artifact lacking both `commit=` and `tree=` and reject a timestamp earlier than the commit timestamp.
2. Generate the final optional-settings enumeration from the filed tip. The current sweep is a discovery snapshot that still says `claimTimeProbe NO`, while the report says it proves the final all-13 state.
3. When a test encounters unexpected cardinality, require an event-count assertion before allowing `DISTINCT`, grouping, or deduplication. That would have turned the double-write into a product finding during implementation rather than review.

Packet friction: the scope was precise and both writable paths were valid, but “~30 minutes” was not calibrated to the requested packet audit, eight-file diff, seven ruling checks, five mutant records, and source-to-sink trace. The STATIC restriction also conflicts with the reviewer contract’s default probe-first method; the packet correctly wins, but should say explicitly that transcript inspection replaces independent execution for this seat.

## PREDICTIONS

Another lens is likely to accept the `DISTINCT` query as a harmless correction and miss that it conceals duplicate append-only probe evidence. A source-focused lens may instead flag the permissive provenance prefix check; I expect that concern to be real but pre-existing, while the new double-write is directly caused by this composition. I would check the one-probe/one-record invariant first.

## r2

# CODEX REVIEWER SELF-REPORT — T3C r2

## Cause and price

The product correction is short and coherent: the observe-only function does not write, the API wrapper writes once, and every shipped runner branch writes once. The expensive residue is evidence discipline. The final assertion-only commit changed the filed tree, but the standalone scaffold set-equality record remained at the preceding commit, while the final mutant records named only a commit and omitted D27's required tree. This is the same provenance class that caused r1 B3 and now costs a second rework pass.

The other blocker came from confusing a textual tripwire with a semantic catcher. M3′ changes one call token to an unimported function and omits the recorder argument required by the persisting API. The architecture test fails before any compilable double-write exists. A valid alias of `probeTarget` to the locally expected name can retain both asserted strings and restore the product defect. Repair costs a real composition seam or an import/binding-aware contract plus a compilable failure-direction mutation.

## What nearly went wrong

- I nearly let the final cluster label, "entry point + edges + DR-182," rescue the stale scaffold record. Its 3 files / 16 tests are exactly the provider-entry test plus the two DR-181 unit files; the eight-test scaffold suite is not in that cluster. Labels are not an executable manifest.
- I nearly treated M3′ as valid because its D24 transcript has the token gates, mutation diff, hashes, restore, and a failing result. Reading the mutation itself showed that the failure only demonstrates string matching; it does not recreate B1 in a buildable program.
- I checked the apparent four-row RED separately from the missing-wiring RED. They are correctly different properties: the source arm is F34's chronological RED, while `expected 4 to be 2` is B1's cardinality RED. Combining them would have obscured which change makes which arm green.

## Dead ends and upgrades

STATIC-only remained binding, so I did not run typecheck, Vitest, PostgreSQL, scaffold, or mutants. I also did not mutate the worktree to manufacture the alias counterexample; the current source assertions and the recorded M3′ diff settle the binding gap statically.

Three upgrades would remove most of this round's review cost:

1. Generate a gate manifest after the final commit and reject every acceptance artifact whose `commit` and `tree` fields do not equal the manifest tip. Historical RED records can be explicitly classified rather than accidentally cited as final evidence.
2. Make cluster summaries print the exact command and file list. A prose label must not be the only evidence that a named gate was included.
3. Test composition through a typed, side-effect-free factory. A valid mutant must compile, bind the persisting implementation, and fail on the duplicate-row property; identifier substrings are insufficient for this high-risk regression.

Packet friction was limited but real: "checking out those two commits' recorded logs" sits awkwardly beside STATIC/no-Git-change. I inspected the commit objects with `git show` and read the records without switching the worktree. The packet's explicit prompts about separate RED properties and M3′ were otherwise well targeted and prevented both near misses.

## PREDICTIONS

Another lens will probably accept the final cluster's word "edges" as a substitute for the stale scaffold transcript, or accept M3′ because its D24 envelope is formally complete. I expect both misses to come from trusting record labels over their payloads. I would first compare every final gate's stamped tree to `bf86a674`, then ask whether the mutant can compile while recreating the claimed failure.

## r3

# CODEX REVIEWER SELF-REPORT — T3C r3

## Cause and price

The worker repaired the exact alias mutant from r2, but the guard still models the double write as two forbidden spellings rather than as one persistence owner. The providers-import assertion forbids `probeTarget`; the probe-block assertion forbids `probes:`. Neither forbids the observe-only result from being recorded explicitly before it is returned. Importing and constructing `ProviderProbeRepository`, calling `observeProviderTarget`, then adding `await providerProbes.record(observation)` is type-compatible with the filed `M3full` ingredients and recreates two append-only rows because the runner records the returned observation again. Both new assertions remain green. The third review round therefore spent another cycle on the same cause: deriving the catcher from an imagined mutation rather than exposing the ownership property through a typed seam or the shipped behavioral composition.

J25 exposed a second evidence-boundary gap. The lane does assert the two `core.provider_probe` rows after persistence, and the pre-existing partial-panel arm asserts `CLAIM_PANEL_REVISED` on the served answer projection. For the all-absent branch, however, the test calls `executeWorkItem` directly and asserts its rejected value. Production catches that error in `declareHatchetWalkingSkeletonTask` and persists `RUNNER_EXECUTION_FAILED:RUN_DISCOVERED_PANEL_EMPTY_AT_CLAIM` to `core.work_item.terminal_reason`, but no test asserts this exact refusal at that row or projection. Repair now requires V routing because r3 is the worker's last lawful round; opening r4 is forbidden.

## What nearly went wrong

- I nearly accepted `M3full` as proof of the full property. Its transcript does prove its exact alias-plus-recorder mutation compiles and is caught. It does not prove the two textual assertions cover every second writer.
- I initially treated the probe rows as sufficient persistence for the refusal. They prove which providers were absent, not that the work item durably refused with the empty-panel reason. That state belongs in `core.work_item.terminal_reason`.
- I checked the ten r3 records mechanically rather than inferring from the D28 table. All ten carry the filed commit and tree; the content commit predates every gate; `scaffold.test.ts` has its own eight-test record. The r2 B2 class is genuinely closed.

## Dead ends and upgrades

STATIC-only remained binding, so I did not run typecheck, Vitest, PostgreSQL, scaffold, mutants, or a worktree mutation. The useful static counterexample was smaller than another alias exercise: an explicit `record(observation)` between the observe call and return. Source types and the filed `M3full` typecheck establish the required repository/import compatibility; the current runner source establishes the second writer.

Three upgrades would prevent recurrence:

1. Move claim-time composition behind a typed factory whose return type exposes observation but no recorder, and run the behavioral exact-cardinality arm through that shipped factory.
2. Generate mutation campaigns from invariants: enumerate every write site that can reach `core.provider_probe`, then mutate ownership at each site. Do not enumerate callee names or object-literal spellings.
3. For every typed refusal, make the acceptance arm invoke the production failure wrapper and query the exact persisted `terminal_reason` or public projection. Returned exceptions are intermediate values, not disclosures.

Packet friction was productive but real. The reviewer contract says to build an independent failure-direction probe, while the packet prohibits tests, builds, and mutation; the packet wins, leaving compilability dependent on source signatures plus the worker's transcript rather than a fresh run. The packet's explicit questions about a compilable double write and J25 were precise enough to expose both remaining gaps. The only authorized handoff is a V DECISIONS PACKET row for each; no fourth worker round is lawful.

## PREDICTIONS

Another lens will likely accept the import guard because it catches the exact r2 alias example, while missing an explicit second `record` after the approved observe call. A second likely miss is to conflate persisted provider absences with persisted refusal state. I would first enumerate every writer reachable between `claimTimeProbe` and `core.provider_probe`, then query the work item's terminal projection after the all-absent branch.

## merge

# CODEX REVIEWER SELF-REPORT — T3C merge

## Cause and price

The merge repair itself is small and sound: T7's reader is passed through without
restating schema or values, and the shipped constructor finally receives
`stoppingPolicy`. The expensive defect is in the mechanism meant to close the
class. The gate enumerates the interface at depth 1, but searches for composed
keys at every depth of the constructor argument. That asymmetry turns any nested
name collision into false evidence. Adding the perfectly ordinary optional member
`readonly clock?: () => Date` leaves it unwired at the constructor boundary, yet
the gate accepts the existing nested `clock:` inside `claimTimeProbe`. The price is
another merge-review correction and a fresh mutation/gate pass for a class that
J27 required this round to close.

The evidence tail repeated the lane's other root cause: a claim was generated from
metadata adjacent to the artifact, not from the artifact. D27 ADDENDUM-3 specifies
comparison of each record's `commit=<40hex>` field to the resolved tip. The filing
instead compares file mtimes to the commit time. All fifteen current `f-*.log`
records contain no commit field and no tree field, so the ruled comparator reports
all fifteen as `NO-STAMP`; the four D14/D16 records are empty files. Repair means
rerunning or truthfully rewrapping the complete gate set after the final content
commit, not another argument that their mtimes are late enough.

## What nearly went wrong

- I nearly accepted M2 because `futureUnwiredPolicy` is genuinely novel and the
  gate kills it. That mutant varies only the interface; it does not vary whether
  the same name already exists below depth 1 in the settings expression. `clock`
  does, and exposes the false positive without changing production code.
- I nearly treated the report's printed tip and the files' post-commit mtimes as a
  D27 stamp. Reading ADDENDUM-3 first made the mismatch mechanical: the prescribed
  command extracts commit fields, and these records have none.
- The static merge audit did not turn the missing mutant transcripts into a guess.
  The report says all gate records live in the named scratchpad, but its inventory
  contains the final gate logs and JSON only; none carries D24's mutation, token
  gates, hashes, restore, and discriminating result.

## Dead ends and upgrades

STATIC-only remained binding. I did not run tests, builds, typecheck, mutants,
database fixtures, provider calls, or a mutating revert. A reverse `git apply
--check` was enough to verify that the four-file wiring patch can be removed from
the current tree, and direct source tracing settled the gate counterexample.

Three upgrades remove the recurrence:

1. Parse both the interface and the constructor expression structurally, and
   compare only semantic top-level properties (including conditional spreads).
2. Give the class campaign a collision mutant such as optional `clock`, not only a
   fresh name that appears nowhere else in the constructor expression.
3. Make the gate harness write commit/tree headers before the command output, then
   run D27 ADDENDUM-3 verbatim against the current-round prefix. D24 mutant
   transcripts belong in the same durable inventory.

Packet friction was low on scope and high-value on review targeting: its explicit
questions led directly to the class-gate counterexample and the corrected D27
comparator. The one misleading phrase is the packet's assertion that the gate is
scoped to the settings literal; that is true only at the outer boundary and hides
the absence of depth control inside that literal.

## PREDICTIONS

Another lens will likely repeat M2 with a fresh, collision-free name and conclude
the class is closed. A log-focused lens may accept the mtime inventory because all
files are newer than the commit, despite D27 requiring embedded commit identity.
I would first add optional `clock` without wiring it, then run the prescribed
commit-field comparator over `f-*.log`; the expected bad outcomes are a green class
gate and fifteen `NO-STAMP` lines.

## merge2

# CODEX REVIEWER SELF-REPORT — T3C second merge review

## Cause and price

The product-side correction converged: the gate now distinguishes top-level settings
from nested object keys, resolves the artifact's conditional spread, and pins both
rules against live source text. The costly residue is again evidence generated beside
the artifact rather than from it. The six files called D24 transcripts contain a
mutation sketch and claimed result, but omit the literal NEW token, all three token
count gates, the restore command, and both-side file hashes. The D14/D16 records repeat
the same class: a header was added, but the command, exit/result, clean state, and
baseline tree were not recorded. Another merge pass is therefore spent distinguishing
a true source repair from runtime claims that still cannot be independently audited.

The measurable price is one additional reviewer cycle and another evidence-only
correction before approval. No product-code rework is justified by this review: the
static gate defect from the first merge verdict is closed.

## What nearly went wrong

- I nearly treated `restored : 0 changed paths` as D24 restoration evidence. It is only
  an outcome claim; without the restore command, NEW-token post-count, and after hash,
  it cannot prove what was restored or whether the mutant ever applied.
- I nearly let D41's successful provenance work rescue the empty D14/D16 payloads. The
  mission comparator verifies a commit field, not that a command ran or exited zero.
  A one-line stamped file can pass provenance while proving no gate result.
- I initially read the packet's “two zone .json files declared as sidecars” as an
  inventory statement. Only `r6-zone-mine.log` declares a JSON sidecar; there is no
  `r6-zone-base.log`, and the set-equality record names neither JSON file.
- I tried to refute the revised scan with every packet-requested shape. Nested keys and
  computed keys fail closed, comments and strings are blanked, and an inline spread of
  a spread is recursively traversed. The live `clock`/`critique` assertions also make
  deletion and depth/spread regressions non-vacuous. Filing another source finding
  would have contradicted that evidence.

## Dead ends and upgrades

STATIC-only remained binding, so I did not execute Vitest, TypeScript, PostgreSQL,
mutants, builds, or provider calls. The official D41 stamp comparator is a read-only
artifact check; its reproduced `19 records / 1 failure` result is exactly the packet's
expected self-output exception and is not a finding.

Three upgrades would prevent this recurrence:

1. Make the mutant harness itself refuse to emit a transcript until it has recorded
   OLD/NEW, literal NEW token, `pre=0 -> applied>0 -> restored=0`, restore command,
   before/after SHA-256, exact discriminating command, and output.
2. Give every silent gate a wrapper that prints the exact command, measured checkout
   commit/tree, pre/post clean state, and exit status. A zero-byte tool body is not an
   admissible success record even when its wrapper is stamped.
3. Extend the evidence manifest to pair every JSON payload with one named stamped log
   and reject unpaired sidecars before packet generation. The packet should be produced
   from that manifest rather than describing the intended inventory by hand.

Packet friction: the routing and static restriction were precise, and J30/D40/D41
removed ambiguity from the source decision. The packet nevertheless asserted that both
zone JSON files had stamped sidecar declarations when only one did, and its N1 closure
summary did not check the D24 fields explicitly required by the first verdict. Those
two assertions steered attention toward counts instead of admissibility.

## PREDICTIONS

Another lens will likely see six mutation files, an index, and six red assertions and
declare D24 closed without checking for the token gates and hashes. A provenance-focused
lens may likewise stop after the D41 comparator and miss that the four D14/D16 records
contain no result at all. I would check transcript field completeness first, then ask
whether each zero-output gate record distinguishes “command succeeded” from “command
never ran.”

## merge3

# CODEX REVIEWER SELF-REPORT — T3C third merge review

## Cause and price

D42's executable emitter closed the mutation-evidence loop that prose failed to close
twice: all six transcripts now contain the mutation, gates, command/output/exit,
restoration, equal hashes and clean post-state. The remaining recurrence is the opposite
case. The compiler wrappers added exactly the fields summarized by the merge3 packet but
not every field required by my merge2 verdict. Both baseline records still omit the
measured baseline tree, and all four omit pre/post clean state. The packet narrowed B2 to
compiler version, command, output, diagnostics and exit, so a reviewer following only its
checklist would approve evidence that still fails the controlling closure bar.

The price is another evidence-only correction cycle; no source rework is justified. A
second filing defect also remains: the artifacts are physically durable now, but the
worker report cites `.hermes/...` and `logs/t3c/...`, while the packet abbreviates them as
`.../logs/t3c/...`. D44 requires absolute mission paths, not paths a reader must infer.

## What nearly went wrong

- I nearly treated the packet's five-field B2 summary as the whole requirement. Reading
  merge2 first exposed the omitted baseline-tree and pre/post-clean requirements.
- I nearly treated current clean status in both the lane and integration worktrees as
  historical proof. It corroborates the checkouts now; it cannot show their state before
  and after the four 18:14 compiler runs.
- I nearly rejected M1 because renaming a key is not textually the same as commenting out
  its line. The runtime defect is the same: the settings object no longer contributes the
  recognized `stoppingPolicy` key, and the targeted assertion names exactly that member.
- I nearly conflated the worktree paths printed inside test output with the artifacts'
  present location. The decisive D44 check was a literal listing of the mission directory;
  the remaining defect is the filing's non-absolute citation, not physical absence.

## Dead ends and upgrades

STATIC-only remained binding. I ran no tests, builds, TypeScript, PostgreSQL, mutation,
provider, or source-changing command. The official stamp comparator is a read-only content
check; fresh runs returned 18/0 for `r7-` and 6/0 for the transcript directory. Comparing
the retained lane transcripts with the mission set showed different hashes and 18:12 vs
18:32 emitter timestamps, so the mission transcripts were not byte-moved copies.

Three upgrades would remove the remaining recurrence:

1. Add a mission-owned compiler-evidence emitter analogous to `tools/mutate.sh`; it should
   print the measured checkout's commit/tree, exact command/output/compiler exit and
   pre/post porcelain itself.
2. Generate the packet's closure checklist from the prior verdict's required-correction
   fields, so a prose summary cannot silently drop part of the bar.
3. Generate report and packet evidence links from a mission manifest containing canonical
   absolute paths, then verify those exact paths with `ls` as D44 requires.

Packet friction was material in two places: lines 37-41 restated only part of B2, and
lines 25/29 used ellipses for the very evidence whose location D44 made a first-class
contract. The remaining packet constants, report hash, tip/tree, counts and writable
surface checked out.

## PREDICTIONS

Another lens will likely approve after seeing four explicit `EXIT = 0` fields and will
not compare them with merge2's longer field list. A location-focused lens may stop at the
successful mission-directory `ls` and miss that the filing still supplies no absolute
artifact citation. I would check the baseline-tree/porcelain fields first and then try to
follow every evidence path literally from the dispatched working directory; the expected
failures are four incomplete compiler records and non-resolving abbreviated citations.

## merge4 — 2026-09-02

# CODEX REVIEWER SELF-REPORT — T3C fourth merge review

## Cause and price

The fourth evidence pass repaired the visible Git-state fields and the path index, but
then treated those two repairs as stronger than they are. The generic emitter records a
commit, tree and normal porcelain; it does not bind ignored dependencies or ignored
generated inputs. Replacing the specialized compiler records with that generic envelope
also discarded the compiler version the prior set carried. The same category appeared in
the zone gate: every result file was moved into durable mission storage, while the small
program that decided the result remained in private temporary storage and outside both
the mission index and the measured tree.

The price is a fifth evidence touch despite an unchanged and still-closed product diff.
The worker must either recapture the current set with a real provisioning manifest or
narrow the claims to what the records actually bind, restore four compiler identities,
and refile one durable zone comparator. The packet adds a cheaper but avoidable repair:
one hash-row annotation or one corrected whole-file hash.

## What I nearly got wrong

- I nearly approved after the mechanical checks came back clean: every one of 18 logs
  had the full D45 shape, the lane comparator had zero failures, and the baseline passed
  when checked against the integration checkout. Checking ignored paths was the step that
  separated tracked-tree identity from actual provisioning.
- I nearly accepted the zone comparator because its command path was absolute. Absolute
  private temporary storage is still not durable mission evidence, and the surviving
  script's predicate proved weaker than its “set-equality” label.
- I initially treated the self-report hash mismatch as evidence that the artifact moved
  after packet creation. Deleting its blank second line reproduced the packet value
  exactly. The defect is an undisclosed transform, not stale content.
- I did not let the generic evidence defects leak back into the product decision. The
  lane tip, tree and product diff remain unchanged, and the new records disclose no
  product contradiction.

## Dead ends and upgrades

The first normal file inventory respected ignore rules and omitted most evidence files;
an explicit filesystem inventory was required. That is itself a warning for future packet
generation: evidence discovery must not depend on repository ignore behavior.

Three upgrades would remove most of this recurrence:

1. Make the gate emitter produce a shared, durable environment manifest: locked-input
   hash, runtime/package-manager versions, resolved executable fingerprints, and hashes
   for ignored inputs or outputs that can affect each result.
2. Generate the evidence index from both record files and every external executable or
   script named by their commands. Refuse a final filing when any dependency resolves
   outside the Git-bound checkout or durable mission tools directory.
3. Have the packet generator emit an explicit hash recipe beside every hash. Never apply
   a line-removal convention to a row whose text does not state it.

Packet friction was productive on the prior N1 correction: the full earlier findings and
the two incompatible checkout contracts were finally stated clearly. It was costly where
the packet asserted that Git identity and porcelain meant no record asserted its own
provisioning; that phrasing hid ignored state. The self-report hash row then applied the
neighboring row's transform without saying so.

## PREDICTIONS

Another lens will likely equate empty porcelain with a hermetic checkout and accept the
four silent compiler runs without noticing the lost version field. A second lens will
check that every indexed file is absolute but not follow the zone record's executable
dependency into private temporary storage. The first useful cross-checks are ignored-path
classification for every gate input and recursive resolution of every command dependency
from record to durable source.

## merge5 — 2026-09-02

# CODEX REVIEWER SELF-REPORT — T3C fifth merge review

## Cause and price

The product merge is cleaner than its “auto-merge” label suggests: the parent deltas touch
disjoint path sets, each parent's changed files survive byte-for-byte, and the only material
cross-file interaction is the intended one — T3C supplies the panel policy S08 consumes.
The blocking residue is a verifier that narrates a property it never tests. D53's helper
uses `head -1`, then the report says every anchor is unique. Three are not. The same gap is
visible in the prose: several unchanged citations were listed in the sweep but never gained
the promised anchor and tip in place.

The price is one more evidence-only correction. No product edit, gate rerun or mutant
campaign is justified. A cardinality assertion around thirteen citation searches and a
mechanical prose update are enough.

## What I nearly got wrong

- I nearly treated correct current line numbers as D53 closure. The ruling is about silent
  future expiry, so uniqueness and failure-on-ambiguity matter as much as today's number.
- I nearly called mutant re-emission inflated evidence. The worker's line-shift rationale is
  technically weak because the scanner is position-independent and its relevant inputs are
  unchanged. The old transcripts still bind the wrong commit/tree, so re-emission remains
  the cleanest current-tree proof.
- I initially accepted “S08/T6B” as a harmless aggregate label. Comparing `ee1afadd` with
  `53c4ccf9` isolates the only removed baseline failure to T6B's deletion of the sealed
  `0.25` comment literal. The authority change is legitimate but deserves exact ownership.
- I kept runtime claims separate from static conclusions. Reading a filed `14/14` is not a
  fresh run; the static-only packet permits classification of that record, not reproduction.

## Dead ends and upgrades

Broad mission-log searches were noisy because the launch transcript contains mirrored tool
output and large JSON payloads. Narrowing to exact report ranges, named records and Git
objects was the useful path.

Three upgrades would prevent recurrence:

1. Make the citation tool accept `(absolute file, unique literal anchor, expected old line)`
   rows and refuse zero or multiple matches before printing a current line.
2. Generate in-text citation updates from that row set, then scan the report for residual
   `file:line`, `file line N`, and abbreviated `name:N` forms not carrying the tip.
3. When an authority set changes between historical bases, compare the intermediate commits
   and name the exact fixing commit before assigning the change to a bundle of lanes.

Packet friction was low on source scope and useful on the two new rulings. The most helpful
prompt was the explicit warning that D53 has no prose-line gate; it led directly to checking
the derivation rather than trusting the corrected numbers. The static-only restriction also
kept the distinction between classifying records and reproducing runtime results explicit.

## PREDICTIONS

Another lens will likely approve because all thirteen displayed numbers are current. A
second may reject the fresh mutants as redundant because the parser is line-independent,
missing that evidence provenance changed even when parser semantics did not. I would first
replace `head -1` with exact match-cardinality checks, then attribute the baseline fix by
diffing S08's merged tip against T6B's merged tip.
