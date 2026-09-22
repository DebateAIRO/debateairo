# T1 CODEX SELF-REPORT — case file

Seat: Codex peer review, T1 r1. This review was static by packet law; I ran no pnpm,
install, typecheck, or test command and did not read the 1,959-line spine.

## Cause and price

The load-bearing failure began in dispatch, not implementation. The worker packet quoted
the repo-wide rule — the 1–5 bound is defined once and there is no second literal 5 — but
then limited implementation to `packages/contract`, the runner import, generated artifacts,
and tests. A pre-dispatch tree scan would have shown that `packages/budget/src/index.ts:40`
and `apps/ui/app/new/page.tsx:76` already enforced the same ceiling outside that surface.
That contradiction forced the worker to choose between scope law and DoD law, produced an
exception-based "single source" test, and now costs at least one rework/packet correction.
The worker prices its own associated search at roughly 15k tokens for the unanchored
contract file and 10 minutes for the killed full-suite attempt.

## What nearly went wrong

I nearly accepted the worker's proposed distinction between a definition and a consumer
literal. Tracing behavior refuted it. `costEnvelopeBasisSchema` independently validates
`.min(1).max(5)`. The UI expression sets `ready`, and `submit()` returns early when it is
false; the same file also enumerates `[1, 2, 3, 4, 5]`. If the contract ceiling changes,
both consumers retain 5. Under a single-source rule, a consumer that hard-codes the value
is another source even when it is called presentation logic.

## Evidence trap and dead end

The exact-set assertion looked stronger than an allowlist, but it encoded known breaches
as the expected green state. Its same-line regex also did not surface the UI option list at
`page.tsx:195`; only reading the caught file's context did. "Exact set of files on record"
is therefore not equivalent to "no duplicate bound sites." The reusable lesson is to make
the negative invariant's expected result empty outside the owning module, then broaden the
scanner with independent controls instead of recording exceptions in the passing oracle.

The other dead end was treating the existence of `test-run1.log` as suite evidence. That
log has no Vitest totals, duration, or explicit exit marker, and the required `## SUITES`
section is empty. `test-nonintegration-run1.log` is also incomplete. File presence is not
completion evidence.

## Packet friction and one-prompt upgrades

The packet's constants and paths were otherwise unusually good: base `1c9578a`, runner
lines 987–996, generator command, branch, goal hash, and writable outputs all checked out.
Two omissions still caused avoidable work: it demanded the exact validation machine code
without naming `MALFORMED_REQUEST`, and it cited a pre-generation T0 baseline after the
environment had been provisioned, so post-generation failures were not directly
classifiable against that pin.

Three mechanical upgrades would prevent this round:

1. Before dispatch, run every negative DoD grep repo-wide and reconcile every hit with the
   packet's allowed surface. Expand/split the ticket before a worker starts.
2. Add a pre-marker report validator: all mandated headings must be non-empty; every suite
   log must contain an exit marker and passed/total summary (or an explicit BLOCKED marker).
3. For single-source tasks, generate the regression oracle as "zero non-owner definitions"
   and forbid exception lists unless V explicitly changes the requirement.

## Review efficiency

The highest-yield probes were small: one broad shipped-code scan returned contract,
budget, and UI; line-context tracing settled whether the latter two enforce behavior; and
summary greps over the named logs established RED 1/1, cluster GREEN 16/16 three times,
typecheck exit 0, and the absence of a completed full-suite result. Those probes avoided
re-running prohibited commands and made the verdict depend on artifacts rather than the
worker's narrative.

## r2

### Cause and price

The main r1 defects converged: J6 reconciled scope with the repo-wide DoD; the three known
duplicates now derive from the contract; the shipped-tree scan is empty; D14 has paired
base/HEAD evidence; the suite placeholder is gone; and the two N1 transcripts now contain
the evidence they claim. The remaining failure is a contaminated baseline comparison.

The worker's "base" zone probe restored four source files but did not restore
`apps/runner/package.json` or `packages/budget/package.json`. The architecture audit reads
those manifests, so its base run still contained both T1-added `→ contract` edges. That is
why the report could call the HEAD and base signatures identical: the supposed base retained
the causal inputs. The HEAD failure payload itself also names a second T1-only delta —
`packages/contract/src/index.ts exports a numeric source literal` — which is absent from
the base payload but was omitted from the classification table. Price: the last lawful
rework round is now needed for evidence that a clean base comparison would have exposed in
one run.

### What nearly went wrong

The r2 checklist was easy to mark green item by item, and I nearly approved after the J6,
D14, and provenance spot-checks. Reading the zone failure bodies, rather than only their
13/1292 summary, exposed the owned deltas. This is the same evidence lesson at a deeper
level: equal test names do not imply equal failure signatures.

The rewritten scanner also improved substantially but its positive controls mirror only
the exact historical spellings. Independent controls showed ordinary equivalents remain
invisible: Zod `.lte(5)`, `refine(value <= 5)`, and the reversed comparison `5 >= depth`.
The cause is test-author coupling: the same author chose both the regex and the only strings
used to validate it. A positive control that restates the implementation's expected syntax
does not establish coverage of the named validator/comparison class.

### Dead ends and upgrades

- Dead end: reverting "shipped source files" is not a base experiment when the subject
  reads manifests, lockfiles, generated state, or configuration. The experiment must revert
  every file in `git diff --name-only <base>..HEAD` that the probe can read, or run in a
  genuinely clean base tree.
- Upgrade: compare failure payloads as sets, not only test names/counts. Any HEAD-only item
  is owned until independently disproved.
- Upgrade: generate scanner controls adversarially — alternate validator methods and both
  comparison operand orders — rather than copying the three original code spellings.
- Packet defect: r2 names D13 but omits the later D15 amendment even though it points to the
  DECISIONS tail. The report consequently places the authoritative suite in the lane
  worktree before merge; D15 places it on integration after a disjoint merge batch.

### Efficiency

No prohibited test/build was needed. Three static checks settled the round: the exact J6
path diff; a standalone scanner with planted alternate syntax; and a line-by-line comparison
of the HEAD/base architecture failures. The latter was the decisive probe and should become
the standard rework-review check whenever a report says a red is "byte-identical" or
"pre-existing."

## r3

### Convergence and remaining cause

J10 resolves the audit conflict cleanly. The two contract dependency edges are declared,
the source-purity exception recognizes only `EXPANSION_DEPTH_MIN` and
`EXPANSION_DEPTH_MAX` in the one contract file, and a third numeric export remains illegal.
The worker also repaired the base fixture and now compares failure payloads rather than test
names. My current static audit returned the same three obs-capture architecture rows and
three obs-capture source rows as the recorded true base; the logged payload diff is empty.
The D15 amendment is now stated correctly.

The final residue is in the purported broad-by-construction single-source oracle. It splits
each file into lines and requires the word `depth` and the ceiling literal to occur on the
same line. Ordinary formatting can therefore separate the semantic validator from its
receiver. Applying the committed detector to a multiline Zod chain and a multiline
refinement returned empty arrays. The exact r2 evasions are fixed, but the root cause —
line-local syntax standing in for a source-level invariant — remains.

### What nearly went wrong

The three packet-named plants all discriminate now, and the exact owner text is pinned. That
made approval look justified. Reading the implementation instead of stopping at the mutant
logs exposed the remaining assumption at `source.split("\n")`: "broad" applies only within
one physical line. This matters because formatter-driven method chains are ordinary shipped
TypeScript, not an exotic obfuscation.

### Price and reusable upgrade

There is no lawful r4, so this becomes one V-packet-ready blocking residue rather than
another worker rework request. The durable upgrade is to test the semantic unit the rule is
about: mask the exact owning declaration, then scan statements/token windows (or an AST)
across whitespace, with multiline positive controls. Future scanner reviews should vary
layout as well as operator spelling.

This round remained static: no tests, builds, installs, or git mutations. The decisive probe
was an in-memory application of the committed regexes; the worktree remained clean at
`386efd3`.

## T1B

# T1 codex reviewer case file — V-authorized micro-ticket T1B

## Cause and price

T1B fixed the exact r3 failure I filed: all three published multiline evasions are now RED at the
parent and GREEN at the tip, and the retained line pass makes the change genuinely additive. The
remaining blocker is the same scope-axis defect one level deeper. The new lexer calls its windows
declaration units, but an own-depth `&&` ends the unit. A same-line
`isDepthField(v) && v <= 5` is rescued by the old line scan; inserting a newline after `&&` makes
both passes return no site. The price is T1B rework round 1, another RED/GREEN pair, and another
complete gate restamp. Frozen T1 product semantics do not need to move.

The process cause is accepting a measured false positive as sufficient justification for a global
boundary. The `page.tsx` case proves a whole-declaration co-occurrence rule is too broad; it does
not prove every conjunct is semantically independent. The robust review question remained the one
from r3: if only whitespace changes, can the oracle's answer change?

## What nearly fooled me

The worker disclosed df4 prominently, which made it tempting to classify honesty as adequacy.
Comparing df4 with df1-df3 changed the verdict. Constant indirection and alternate numeric syntax
need new semantic or predicate reach, outside this unit-only ticket. df4 requires neither: it is
one boolean declaration and a newline alone disables the retained r3 rescue path. Disclosure made
the defect easy to find; it did not close it.

The symmetric merge hashes were a second near-miss. I reproduced every equality and initially
read that as preservation proof. Sorting `+`/`-` lines destroys position, order and context, so it
cannot prove meaning. Direct combined-diff inspection, the final locations of the three overlapping
files' additions, and the fact that integration changed neither T1 test file are what established
that this particular 102-commit merge is sound.

## Evidence boundary and dead ends

Static-only law meant I did not rerun the oracle, mutants, typecheck or suites. The highest-yield
evidence was deterministic source tracing plus the worker's own df4 failure transcript. That was
enough to locate the root cause at the own-depth logical-operator flush without pretending a fresh
runtime result.

The rotating-suite story also needed narrower language. Four wide-suite transcripts are retained,
although the report claims six and itself indexes `unit+arch ×4`. Those four do show two different
extra names across tips, and both names pass three isolated invocations. They establish that one
full run is not a reliable ownership classifier. They do not reconstruct two missing runs or prove
"Neither is mine"; additional concurrent test work can alter load without importing either test.
The correct static conclusion is CANNOT-ASSESS causality while retaining the honest worst verdict
`14 failed / 1431`.

An AST design was a dead end for this review. The finding does not need a chosen implementation;
it needs a RED-first formatting pair and a fix that also keeps the real `page.tsx` negative
control. Re-litigating arithmetic, hexadecimal constants or generic cross-statement indirection
would violate the V-frozen predicate boundary.

## Packet friction and one-prompt upgrades

The packet was unusually discriminating: it forced an explicit ruling on the disclosed defeat
inputs, the merge method and the rotating failure rather than presenting disclosure as automatic
closure. Its one evidence claim that could not be reconstructed was “six runs”; naming the four
retained paths would have exposed that gap before dispatch.

Three mechanical upgrades follow:

1. Every claimed layout-independent oracle gets a metamorphic fixture: insert newlines at every
   whitespace/operator boundary and require the finding set to remain invariant.
2. Merge preservation tooling must compare position-aware parent patches and combined conflict
   hunks; sorted line multisets are a cross-check, never the proof.
3. A suite-history claim counts only retained stamped transcripts. When causality is not paired
   against the other parent under comparable load, the classification is CANNOT-ASSESS rather
   than “not mine.”

Skills actually loaded for T1B: `superpowers:using-superpowers`, `heartbeat-protocol`,
`heartbeat-reviewer`, `superpowers:systematic-debugging`, and
`superpowers:verification-before-completion`.

## T1B 2

### Cause and price

The rework found the right semantic distinction and stopped one abstraction too soon. An
exclusive `6` needs to remain attached to its own comparison; that rules out a whole-declaration
window, but it does not make a physical line the right unit. The correct middle is a
comparison/conjunct that spans whitespace. Keeping `6` line-local preserves the original defect:
`depth < 6` is detected and `depth <` newline `6` is not. The price is T1B rework round 2, still
confined to the test oracle; frozen T1 product code and all four r3 regexes can remain untouched.

### What nearly fooled me

m6 is unusually strong evidence: widening the `6` arm to the declaration breaks both fixture
orders and both real-tree assertions. I nearly read that as proof of the implementation. It proves
only that one alternative is too wide. The missing question was whether there is a unit between
line and declaration. Once phrased that way, the answer is immediate: split conjuncts for the
exclusive arm, but let each conjunct span newlines.

The negative control exposes the same error in reverse. Its two orders are both multiline, so they
test commutativity but not layout invariance. On one line, the unchanged r3 pass sees unrelated
`> 6` and `depth` in the same candidate and reports a false site. A metamorphic control must vary
line breaks in both positive and negative cases; operand-order symmetry is a different axis.

### Evidence trap

The replacement assembly proof improved on sorted line multisets, but its input was not the commit
it printed. The script echoes `integration=19bbb4c4` while reading the mutable mission branch. At
the recorded time that branch had already advanced to `152ed7ed`. The two proven files happen to
have identical blobs at both revisions, so their conclusion survives static corroboration; the
method does not. Every evidence script should resolve and print the exact object it reads, then use
that object for every `git show`.

The runner was handled honestly: NOT-APPLICABLE is not PROVEN, and the four conflict-line versions
show the correct import resolution. That is evidence for the conflict line only, not a whole-file
reconstruction.

### Efficiency and reusable upgrade

Two source-level metamorphic checks settled the round without executing the oracle: split the
operator from `6` in a true depth comparison, then join the lines of the known false-positive
declaration. Both answers follow directly from the retained line pass plus the `6`-free unit pass.
This is the cheapest durable review pattern for layout claims: inspect one positive and one
negative while independently varying line breaks, token order, and semantic grouping.

## PREDICTIONS

A subsequent fix may add df5 alone and still leave the page-shaped negative dependent on whether a
formatter joins its lines. The first review probe should therefore be a four-cell matrix: true
comparison one-line/wrapped and unrelated comparison one-line/wrapped. A merge-tool correction may
pin only the displayed label; the falsifier is whether every content read uses the resolved commit
ID rather than a moving branch name.

## T1B 3

### The repair converged; the integration argument did not

The worker closed the exact blocker from review 2. The exclusive-`6` arm now spans a conjunct,
not a line, and the any-depth split is unconditional in the lexer. The positive and inverse
negative RED/GREEN pairs are discriminating, and m10's one fixture victim is accurately described
rather than inflated into real-code proof. The corrected assembly script also uses the resolved
IDs it prints and labels its runner output as inspection rather than proof.

The remaining blocker came from a different axis: the integration drift tool equated “semantic
hazard” with “path changed by both sides.” Its loop starts from the lane's changed-file list, so it
cannot see an incoming-only file that violates a repo-wide invariant. Integration `58c4715e`
contains exactly such a file: `packages/register/src/algorithm-policy.ts:257` seeds
`maxDepth: 5`. T1's oracle scans `packages`, and J6 permits only the contract declaration. A
textually conflict-free merge is therefore semantically red before any dynamic command is run.

### What nearly fooled me

The reported overlap result is true: runner and budget are the only lane paths also touched by the
23 incoming commits, and their diffs change no line containing `depth`. That made the orchestrator's
“hazard measured absent” ruling initially look defensible. The decisive question was not which
lane files incoming work touched, but which incoming files the lane's invariant reads. Comparing
those two sets exposed `packages/register`, an integration-only path and a direct scanner victim.

This is the same review lesson as the original T1 scope failure, one level later. A repo-wide
negative invariant cannot be evaluated from an author-selected intersection. The read set, not the
write set, defines the integration hazard surface.

### Evidence boundary and routing

The review remained static: no test, typecheck, build, provider call, merge, or git mutation. The
blocker follows deterministically from the incoming line, the committed regexes, the `packages`
walk, and the exact-owner filter. Exact post-merge test counts remain CANNOT-ASSESS until V resolves
the T17B/T1 ownership conflict and integration performs the merge.

There is no fourth worker round, so I did not frame this as another T1B oracle rework. The review
files a V-row-ready decision: derive the sealed register seed from the contract owner and reconcile
the new dependency, or explicitly narrow/supersede J6 for that sealed value. The stale
“line-scoped” comment beside the retained negative control is separately non-blocking cleanup.

### One-prompt upgrade

Every integration-drift tool for a repo-wide invariant should report two surfaces:

1. textual collision candidates — paths changed by both lane and integration; and
2. invariant-impact candidates — every incoming changed path inside the invariant's read roots,
   regardless of whether the lane touched it.

The second surface should be checked with the same predicate the lane ships. An overlap-only report
may prove merge mechanics are quiet while missing the exact semantic regression the lane exists to
forbid.
