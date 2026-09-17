# SELF-REPORT — diag-bounded (Opus 5 worker, one seat, two tickets)

Tip `d797d8052c10bd095373f238d4c456064be77fe1`. Rounds 0, 1 and 2 (codex r1 = CHANGES one P2;
codex r1b = CHANGES two P2). Round 2 is the last before the ticket would go to V.
Round 0: about 28 minutes (`01-provision.log` 15:36 → last gate 16:03), commit `d6d0f69c`, **seven**
changed files — corrected from the "six" this report first claimed, per codex evidence correction 2;
`git show --stat` counts the authorized `.hermes/TOOLING-TRAPS.md` append, and I did not.
Round 1: about 20 minutes, commit `47479453`, five changed files.
Round 2: about 25 minutes, commit `d797d805`, five changed files. All three inside the contract.

## The case: what actually cost time, and why

### 1. The dominant cost was a scoping decision the packet left to me, and I paid for it three times over

The packet says "an explicit allow-list of known message constants that today reach these formatters
(find them … and cite each)". The whole round turns on one number: how many constants is "known
constants that today reach these formatters"? I circled it three times — first sizing the whole tree
(279 producers), then the app closures (137), then adding the SQL category (215) — and each pass
re-litigated the same trade-off between an honest closure and a reviewable list.

**Cause, not symptom.** The packet defines the allow-list by REACHABILITY ("on the paths these
formatters see"), and reachability is the one property that is expensive to establish and impossible
to establish exactly. Import closure is cheap and provable; call-path reachability is neither. I spent
the time trying to satisfy the literal criterion before accepting that the provable over-approximation
IS the answer and the honest thing is to say which one I computed.

**Price.** Roughly 9 of 28 minutes, and four exploratory greps that produced nothing I used.

**The upgrade.** A packet that asks for an allow-list should name the ADMISSIBLE EVIDENCE for
membership, not the ideal criterion. One clause would have removed the whole detour: *"membership is
decided by import closure, not call-path reachability; over-inclusion is expected and costs nothing —
state the closure you computed."* This generalises: whenever a packet asks for a set defined by a
property the seat cannot decide, say what evidence stands in for it, and in which direction to err.

**What made it converge in the end** was the landed pattern's own sentence — "the whole
`CryptoInputError` union is listed rather than the subset reachable today, because the union is that
type's closed contract". The precedent had already ruled on exactly my question. I found it because I
read `risk-signal-identity.ts` in full at the start rather than skimming it for its shape. Reading the
named prior art completely, before designing, is the cheapest thing I did this round.

### 2. The packet's own grep hint would have produced an allow-list missing its most important half

The packet says to grep for `new Error("[A-Z_]+")` / `TypeError("[A-Z_]+")` producers. Following only
that yields 137 constants and misses all 79 PostgreSQL `RAISE EXCEPTION … MESSAGE='CONST'` sites —
which is the category that matters most, because both formatters sit above the database and a `RAISE`
arrives as `DatabaseError.message`.

I found it by accident, not by method: the runner test's own pinned constant,
`CONTENT_ATTESTATION_INVALID`, had no TypeScript producer anywhere in the tree, and I went looking for
where it came from instead of assuming the test was stale. It is raised at
`migrations/0040_account_erasure.sql:608`.

**Cause.** A packet that supplies a search COMMAND rather than a search TARGET quietly transfers the
completeness question from the seat to the packet author. I nearly inherited the author's blind spot
whole, and the resulting fix would have degraded 79 real constants to a class category while looking
complete and passing every test.

**The upgrade, and it is a general one.** When a packet hands over a grep, the seat's first duty is to
ask *what else can produce this shape* — here: SQL, and in other systems a message from a driver, a
proxy or a serialized envelope. Better still, the packet should name the PRODUCER CATEGORIES it
believes exist and say "add any you find", which turns the seat's sweep into a check on the packet
instead of an echo of it.

**What saved it** was a rule I did not have to reason about: an unexplained artifact — a pinned
constant with no producer — is a lead, never noise.

### 3. I built a wrong list with a `sed` extractor and caught it by luck

`grep … | sed -E "s/.*'([A-Z][A-Z0-9_]*)'/\1/" | sort -u` reads as an extractor and is not one: `s///`
passes through every line it fails to match, so whole lines of SQL source were counted as constants.
Two pipelines over the same 122 matches disagreed, 85 against 79.

**I caught it only because I printed the list and read it.** No check I had planned would have caught
it, and the wrong list was minutes from being pasted into two source files, where it would have been
216 lines of plausible-looking allow-list containing six lines of raw SQL. Every test would still have
passed — the list is over-inclusive by design, so garbage entries are INERT and invisible.

**Cause.** A generated artifact was treated as trustworthy because the generator was one line long.
Price: about 6 minutes plus the near-miss. Recorded in `.hermes/TOOLING-TRAPS.md` with the rule:
extract with a matcher that can only emit matches, and shape-check the output
(`grep -vE '^[A-Z][A-Z0-9_]{1,63}$'` must be empty).

**The general lesson, which is bigger than `sed`:** when a test is over-inclusive by construction —
the safe direction — it stops being able to detect junk in its own inputs. Any generated list going
into source needs a SHAPE gate, because the behaviour gate is structurally blind to it.

### 4. The duplication the contract forces is a defect, and I nearly blocked on it

The contract forbids a shared module and the packet explicitly offers BLOCK as the escape. Two
hand-maintained 436-line copies genuinely will diverge, so BLOCK was defensible.

I did not block, because a remedy existed inside the contract: a test that reads both source files and
compares the blocks byte for byte. It is pinned by mutant (e). The general form — *when a contract
forces duplication, pin the duplication with a test instead of blocking or trusting discipline* —
is worth carrying, and this test file already had the precedent for reading source at runtime.

**Where I could have been wrong.** If the two copies had needed to differ, this would have been the
wrong call. They do not: the runner's only difference is a prefix applied to the result, so the shared
part is exactly identical and the wrapper is one line each.

### 5. What I nearly got wrong

- **I nearly accepted the packet's parenthetical** that a `TypedDomainError`'s code is "already bounded
  by its type". It is not — `code: string`. Had I trusted it, the report would have carried a false
  entailment about the first rule in both formatters. Checking a one-word aside cost one grep and
  produced a real finding.
- **I nearly fixed only the two collapsed failures the ticket names.** The same catch block throws the
  same code with the same message a THIRD time, for an ambiguous COMMIT. Router §2.2 says the reported
  finding is a sample of a class; here the third member was eight lines above the two named ones.
- **I nearly shipped the message rule second**, keeping the original code-first order out of caution.
  That would have degraded every SQL-raised constant to its SQLSTATE class — the 79 constants I had
  just worked to find. Nothing pinned the old order, so I checked rather than preserved.

### 6. Dead ends, so nobody re-derives them

- **Enumerating PostgreSQL SQLSTATE at five-character granularity.** Two hundred codes, a derived value,
  and `risk-signal-identity.ts` had already ruled against it. Class-level (43 entries, a published closed
  vocabulary) is the resolution.
- **Using a `ReadonlySet` for the message allow-list.** Half the source text of a `Map`, but on a hit you
  must return the CAUGHT string, and a reviewer then has to reason about byte-equality instead of seeing
  it. `new Map(LIST.map((c) => [c, c]))` costs one line and makes the closed-alphabet property syntactic.
- **Module-level constants in `packages/db`.** Cleaner code, outside the granted line range. Declaring
  them inside the catch block is slightly ugly and strictly in contract; the cost is one object literal
  built per failure, on the failure path only.
- **A test that regenerates the allow-list from the tree and asserts it matches.** It would convert rot
  into a test failure, but it couples this suite to every package in the workspace, so any unrelated lane
  adding a constant turns this suite red. Rejected deliberately, not overlooked.

### 7. Where the packet was unclear, exactly

- **`allowed: apps/api/src/index.ts (apiOperationalErrorDiagnostic and its call at :485 only)`** — a
  414-line lookup table is part of the function's implementation but not part of its body. I placed the
  block immediately above the function and am naming the interpretation rather than assuming it. A
  contract that grants a FUNCTION should say whether its module-scope support belongs to it.
- **Gate 3 says "the new tests ×3 each"** while the three-run law applies to clusters. I ran all three
  unit files three times each; the integration file once, as gate 3 states.
- **Gate 5 orders "commit before gate records" AFTER item 4, the mutants** — but `mutate.sh` v3 refuses a
  dirty tree, so mutants cannot run before the commit. The ordering is only apparent; item 5's rule
  decides. Worth reordering the packet template so it reads in the order it must be executed.
- The ticket's `:480` against the packet's `:485` cost nothing here because I verified both, but a seat
  that trusted the ticket would have edited the wrong line.

## Toward the one-prompt machine

1. **Define set-membership by admissible evidence, not by the ideal property.** The single largest cost
   this round. "Every constant that reaches X" is undecidable; "every constant in X's import closure" is
   a command. Say which one, and say which direction to err in.
2. **Name producer CATEGORIES, not a grep.** A supplied command transfers the packet author's blind spot
   to the seat intact. Naming the categories ("TypeScript throws, SQL `RAISE`, driver codes — add any you
   find") turns the sweep into a check on the packet.
3. **Shape-gate every generated list before it enters source.** Behaviour tests are structurally blind to
   junk in a deliberately over-inclusive input.
4. **When a contract forces duplication, require the pin.** A packet that says "duplicate, do not share"
   should also say "and pin the copies with a test", so the seat neither blocks nor relies on discipline.
5. **Order packet steps in execution order.** Tooling preconditions (a clean tree) silently reorder the
   list; a seat that follows the numbering hits the abort.
6. **Baselines are worth their cost, and the packet is right to demand BOTH files.** The one typecheck
   error I introduced myself (`as readonly string[]` on a `JSON.stringify` replacer) showed up as 9 lines
   against the baseline's 8 — the count noticed it, and the line-by-line `diff` against the saved baseline
   named which line was mine in one step, with no re-reading. A count alone would have told me something
   changed; only the saved baseline told me what. Keep that gate exactly as written.


---

# ROUND 1 — the case against my round-0 reasoning

Codex returned CHANGES with one P2: the `instanceof TypedDomainError → error.code` branch left both
alphabets open, because the kernel types `code` as `string`. **I had found that fact myself in round 0,
written it up correctly, and then declined to act on it.** That is the whole finding, and it is the most
useful thing this lane has produced.

## 1. The cause: I turned a true observation into a false conclusion, and never tested the conclusion

My round-0 report said, in plain words, "narrowing it would change 437 public codes, which the contract
forbids." That sentence is wrong in a way that should have been obvious the moment I wrote it: the
diagnostic boundary is not the throw site. Mapping `error.code` to a diagnostic changes no thrown error.
The fix is nine lines and touches nothing outside the two files I already owned.

**What produced the error.** I discovered the unbounded type while checking a packet premise — I was in
"audit the packet" mode, not "fix the defect" mode. Having classified it as a packet defect, I filed it
under findings and moved on. The classification was doing work it had no right to do: *whose mistake it
was* silently decided *whether it was mine to fix*. Those are independent questions and I collapsed them.

**Price.** One full review round: codex's review, this rework, two commits where one would have done.
Round-0 wall clock was 28 minutes; round 1 was 20. So roughly 40% overhead on the lane, all from one
unexamined sentence.

**The upgrade, and it generalises past this lane.** When a seat writes "X is out of contract" or "X would
require Y", that clause is a CLAIM and gets the same treatment as any other: state it, then check it
before it goes in the report. A one-line test — *what exactly would I have to edit, and is that file in
my allowed list?* — would have answered it here in seconds. My own report format already demands STRENGTH
on every claim, and I attached STRENGTH to the observation ("code is typed string") while leaving the
consequence ("therefore I cannot fix it") unmarked. **A finding's remedy needs a STRENGTH label as much
as the finding does.** That is a concrete change to the report template I would want adopted.

## 2. What I nearly got wrong in the rework

- **A near-repeat of the round-0 `sed` trap, in a new disguise.** My first pass at extracting the domain
  codes classified 180 sites as "dynamic" when 13 are. Cause: `new TypedDomainError\(\s*(?!")` — a
  negative lookahead after `\s*`, which backtracks to zero width so the lookahead inspects the newline of
  every wrapped call. The two patterns read as complements and are not. The tell was free and I nearly
  walked past it: 419 + 180 does not equal 432 calls. **Branch counts must sum to the total; check it.**
  Recorded in TOOLING-TRAPS.
- **A sloppier extraction that would have shipped.** My first working version took any uppercase literal
  within three lines of a helper call, which admitted `SYNTHESIZER`, `ASKER` and other role words as
  "domain codes". Harmless to the security property, but false in a citation table a reviewer audits line
  by line. I found it by grepping the output for values I knew must be absent. That negative check —
  *list the things that must NOT be in the result, and grep for them* — is now how I finish any generated
  list, and it is the single cheapest quality gate in this lane.
- **Blank exit codes filed as an improvement.** Codex noted the round-0 gate captures lacked per-run
  numeric exits, so I added them — with `${PIPESTATUS[0]}`, inside a `{ }` block, after an `echo`. Every
  value came out empty. I caught it only because I grepped my own log before moving on. Filing nine blank
  `EXIT =` lines as a response to review feedback would have been worse than not responding at all.

## 3. Dead ends from this round

- **A TypeScript union for `TypedDomainError`'s code.** Attractive and useless here: the value crosses the
  boundary at runtime out of a `string` field, so the compiler never sees it. Codex says this explicitly
  and it is right. The runtime map is the only thing that closes the branch.
- **Reusing the message allow-list for the typed branch.** The two lists overlap in five names, so merging
  looked tempting and would have saved ~400 lines of duplication. Rejected: the provenance is different
  (declared `TypedDomainError` codes against plain-`Error` messages and SQL `RAISE`), and a merged list
  cannot be re-derived or audited by either sweep. Two named lists cost text and keep the citation honest.

## 4. What worked, and should be kept

- **Reproducing the reviewer's probe before touching anything.** `DIAG_REVIEW_SENTINEL` in, unchanged out.
  Thirty seconds, and it converted a finding I might have argued with into a fact I could not.
- **Re-running all five round-0 mutants at the new tip.** Not asked for. It cost about ninety seconds and
  it means the r1 record set is self-contained rather than half-referencing a superseded commit.
- **The negative-membership check on generated lists** (§2 above), which caught a real defect this round.

## 5. Toward the one-prompt machine — additions from round 1

7. **Label the remedy, not just the finding.** Every "out of contract" / "would require" clause in a
   report is a claim with a STRENGTH. Unlabelled, it is where a correct observation goes to die. This one
   cost a full round.
8. **Separate whose defect it is from whose fix it is.** The packet was wrong about the type; that had
   nothing to do with whether the branch was mine to close. A packet clause saying *"a premise of this
   packet that you find to be false is still yours to satisfy at the boundary you own"* would have
   removed the ambiguity entirely.
9. **Make branch-count arithmetic a habit for any classifying sweep.** When a sweep partitions N things
   into buckets, the buckets must sum to N. Both of this lane's extraction bugs were visible that way,
   for free, before any output was read.


---

# ROUND 2 — one habit produced both findings

Codex returned CHANGES again: F2 (three non-code literals admitted) and F3 (two declared subclass codes
missing). They look like two defects. They are one.

## 1. The cause: mechanical validation of a generated list, never semantic

I validated `KNOWN_DOMAIN_CODES` three ways and reported all three: every entry matched
`^[A-Z][A-Z0-9_]{1,63}$`; the count matched the citation artifact exactly; and six values I knew must be
absent (`DIAG_REVIEW_SENTINEL`, `SYNTHESIZER`, `ASKER`, …) were absent. All three passed on a list
containing a grade verdict, a phase-order member and an admission decision.

**None of those checks can distinguish a code from a non-code**, because all three are questions about
FORM and membership is a question about MEANING. `UNASSESSABLE` is shaped exactly like a domain code. My
negative-membership probe only excluded values I had already thought of — it tested my imagination, not
the list. **Reading twenty randomly chosen entries and asking "is this a code, and where is it thrown?"
would have found F2 in about a minute**, and it is the one check I never ran on a 399-entry list I was
about to compile into two production files.

F3 is the same habit in the other direction. I swept for `new TypedDomainError(`, confirmed the count,
and never asked *what other syntax declares a code*. The answer is `super(...)` in a subclass, there are
exactly two such classes in the tree, and both were missing. A sweep for one form cannot report what a
second form would have found, and a count that matches the sweep's own output cannot detect the gap.

**Price.** One review round: ~25 minutes of rework plus codex's review, on top of round 1's ~20. Two of
the lane's three rounds were caused by list-membership errors that a semantic read would have caught.

**The upgrade — the concrete one I would put in the packet.** For any generated list that enters source:
> Mechanical checks (shape, count, negative membership) are necessary and never sufficient. Before the
> list ships, read a sample of at least 20 entries against the question the list claims to answer, and
> state in the report how many you read and what you asked. Separately, name the syntactic forms your
> sweep did NOT look for and say why each is empty.
Both halves are cheap. The second half is what F3 was, and I never wrote that sentence because nobody
asked me to.

## 2. The defect and its evidence had a single source

My r1 report said `requireNonblank` had "22 call sites"; the true count is 12. That number came from the
same over-matching regex that admitted the three bad values. So the wrong list and the wrong count
corroborated each other, and the citation artifact — 522 rows, every row mechanically consistent — looked
like independent confirmation of a list it was generated from.

**This is the deeper lesson of the round.** An artifact derived from the same extractor as the thing it
certifies is not evidence; it is a copy. Codex's count came from a syntax tree, which is a genuinely
different method, and that is why it disagreed. **A cross-check has to differ in METHOD, not just in
file.** The r2 sweep is still one extractor, but the round-2 tests now take their expectation from the
citations rather than from the map, so at least the test and the implementation have independent inputs.

## 3. What I nearly got wrong

- **Fixing only what was charged.** Codex named the domain positive-control loop (`api:130`,
  `runner:121`). The message loop had the identical tautology and was not named. Fixing only the named
  instance is exactly the "searching by named lead instead of by risk class" failure the router's §2.2
  describes, and the pull to do it was real because the message list is 215 more lines. I fixed both.
- **Trusting my own "the first extraction was fully discarded" claim.** My r1 report said the bad
  3-line-window pass was discarded and replaced. It was — but the replacement had a *different*
  over-match, and I presented the discard as though it settled the question of list correctness. Codex
  quoted that sentence back with the qualification it needed.
- **Breaking both source files with a bad splice.** `block.index("[", …)` after the constant name found
  the `[` of `readonly string[]`, not the array literal. Both files were written syntactically broken; the
  parse error pointed at the first array element, ~50 lines from the damage. Four minutes. Recorded in
  TOOLING-TRAPS, together with the fix that makes it a one-line failure: assert the element count before
  and after the splice (`399 -> 398`).

## 4. Dead ends from this round

- **Putting the expected list in a shared test helper.** Out of contract: the grant names two existing
  test files and one new rollback test, and nothing else. Reading the canonical arrays out of the API
  test's SOURCE TEXT is the in-contract way to keep one copy; importing that module would register its
  suites twice, which is why the obvious approach is wrong here.
- **Deriving the expected list in the test by re-sweeping the tree.** Genuinely independent and
  self-maintaining, and rejected for the same reason as in round 0: any unrelated lane adding a
  `new TypedDomainError("NEW")` would turn this suite red. Codex asked for a committed list; a committed
  list is also the one that does not break other people's builds.

## 5. Toward the one-prompt machine — additions from round 2

10. **A generated list needs a semantic sample, stated.** Shape and count checks passed on a list with
    three wrong members. Read ≥20 entries against the list's own claim and say so in the report.
11. **Name the forms you did not sweep for.** F3 was invisible to a correct sweep of the wrong question.
    One sentence — "I looked for X; the other forms that could declare this are Y and Z, and here is why
    they are empty" — converts an unknown unknown into a checkable claim.
12. **A cross-check must differ in method, not just in artifact.** My citation log agreed with my map
    because one generated the other. Codex's syntax tree disagreed because it was a different method.
13. **When a review names one instance, fix the class and say you did.** Both this round's charged
    defect and the uncharged twin were the same tautology; fixing one and shipping the other would have
    been a fourth round.
