# SELF-REPORT — S06 (T10 + T11), seat opus-s06-w6

A case file, not a diary. Causes, prices, near-misses, dead ends, and the exact
places the packet left me guessing.

---

## 1. What repeatedly cost tokens

### 1.1 Recon before design — 18 tool calls, and every one of them earned its place
Before writing a line I read: packet, ticket, router, worker contract, four
Superpowers skills, INSTRUCTIONS, the eight DECISIONS rulings the packet names,
the SPEC, the slice PLAN, TOOLING-TRAPS, and then ~1,400 lines of product code
across runner / serve / kernel / contract / register / ledger / db / ui / web.

That is the floor, not waste — but **~40% of it was re-derivable from a fact the
packet could have carried in one line**: *where the "receipt" is*. The goal says
"margins to runner-up recorded in the receipt" and never says what a receipt is
in this codebase. I found it by grepping the word and reading two comments
(`runner:2426` "the supplying level RECORDED on the receipt" →
`ledger.propagation_run`). **UPGRADE: when the goal uses a codebase noun
metaphorically, the packet resolves it to a file:line once, for everyone.**
Cost: ~6 tool calls and one genuine risk of designing the margin into the wrong
table (I nearly put it on the condition-mark record, which only exists when
M ≥ 2 — exactly the case where the margin is NOT absent, so it would have had
no home for the arm that matters).

### 1.2 The migration-number lottery
0053 and 0054 were already claimed by lanes t6 and tint1 *in their own worktrees*,
invisible from mine. I found it only because I thought to `ls` every sibling
worktree's `migrations/`. **UPGRADE: the mission needs a migration-number
registry the orchestrator hands out at packet time** (D25 appears to have landed
exactly this while I was working — good). Cost: 1 tool call because I was
suspicious; it would have cost a full integration conflict otherwise.

### 1.3 Two redirection/shape bugs in my own evidence capture
* `npx vitest ... 2>&1 > file` sends **stderr to the terminal and stdout to the
  file** — the opposite of `> file 2>&1`. My first BASE zone log therefore
  contained no FAIL lines and my base-vs-head diff reported "0 base failures",
  which would have made me claim 14 new failures were all mine. I caught it
  because 0 was absurd. **Cost: one full 7-minute zone re-run.** This belongs in
  TOOLING-TRAPS and I have appended it.
* My first D24 mutant transcript for a **deletion** mutant grepped the token the
  mutation *removes*, so the counts read 1 → 1 instead of D24's 0 → 1 → 0. The
  evidence was correct and the shape was misleading. Re-stated as an addition
  mutant (`M2prime`). **UPGRADE: D24's shape presumes an ADDED token; for a
  deletion mutant the lawful shape is "replace with a marked constant", so the
  marker is added and the counts read in the intended direction.**

### 1.4 A non-discriminating mutant I nearly filed as evidence
My first ladder-ordering mutant hoisted rung 1 above rung 0 **but guarded it on
`margin.kind === "MEASURED" && disagreement.kind === "MEASURED"`** — which is
precisely the case where rung 0 does not fire. It was semantically equivalent to
the original, so the suite stayed green, and for about thirty seconds I read that
as "the property test does not pin ladder order". It pins it fine; my mutant was
the broken thing. Same again for `M8`: I mutated the controls object but left the
loud stop in place, so the run still refused and the suite stayed green.

**This is the single most valuable thing in this report.** The refutation duty
says "build the mutant that assertion exists to catch" — but a mutant that is
*accidentally equivalent* reads exactly like a test gap, and the natural reaction
is to go weaken or widen a test that was never wrong. **UPGRADE: every
NOT-CAUGHT mutant gets a mandatory second question before any test is touched —
"is this mutation actually observable at the seam?" — and if the answer is no,
the mutant is recorded as non-discriminating and rebuilt.** Both of mine are in
`logs/s06/refutation-d24.log` under their own names rather than deleted, because
a suppressed non-discriminating mutant is how a lens talks itself into a gap that
does not exist. Price: ~15 minutes and two extra suite runs; the alternative
price was a weakened property test.

### 1.5 OneDrive flipped the executable bit on two files I edited
`apps/runner/src/index.ts` and `apps/ui/lib/v3/labels.ts` went 644 → 755 mid-edit
and rode into my commits. `core.fileMode` was subsequently set false on the
worktree, which **hides the flip in porcelain but not in the commits** — so the
only way to see it is the coordinator's `git diff --summary <base>..HEAD | grep -c
"mode change"` check. Cured with `git update-index --chmod=-x` and a mode-only
commit (`0 insertions, 0 deletions`, proven in the commit's own `--stat`).
**UPGRADE: that grep belongs in every worker's pre-filing checklist, not in a
coordinator message** — it is invisible to the seat that caused it.

---

## 2. Near-misses — things I nearly got wrong

1. **`localeCompare` for the "lexicographic" tiebreak.** I wrote it first. Locale
   collation is host-dependent, so the "deterministic tiebreak" the goal demands
   would have changed with the machine's locale — a defect no test in this repo
   would have caught, because every test runs on one host. Replaced with code-unit
   comparison and the reason is a comment in the source. **This is the class of
   bug the goal's word "deterministic" exists to prevent, and the obvious
   implementation is the wrong one.**
2. **Silent `?? null` on the winning root's dispersion.** My first cut read the
   served root's panel dispersion with `.find(...)?.panelDispersion ?? null`. That
   turns "no such node" (impossible, a bug) into "no disagreement" (a legitimate
   runtime value that lands on rung 0 and prints CONTESTED). The answer would have
   looked honest while hiding a lookup failure. Replaced with a typed loud stop.
3. **Attaching LABEL-BASIS-INCOMPLETE to answers that carry no label.** My first
   gate was `compositionEvidenceRequired(result)`; serve's actual usable-basis
   predicate is that **and** a SERVED/DOWNGRADED terminal. On a COMPONENTS_ONLY
   terminal with coverage the answer would have carried a mark describing a label
   nobody was ever shown. Now the runner mirrors serve's predicate exactly, and
   serve stops loudly (`LABEL_BASIS_DISCLOSURE_MISMATCH`) if the two ever
   disagree — the mark and the label are one decision or the write refuses.
4. **The acceptance ceremony's `positionNode` assertions.** They pinned the served
   root to `graphPayload.nodes[0]` — the first-authored root. Under T10 that is
   re-asserting the retired rule under a new name, and it would have passed on a
   ceremony where the first maker happened to win, then failed mysteriously later.
   Rewritten to derive the expectation from the run's own recorded strengths.

---

## 3. Dead ends — do not re-derive these

* **A RED that is a clean assertion failure on the baseline for a DELETED symbol
  does not exist.** I spent real thought trying to construct one for T10's
  selector (a name-agnostic resolver over the runner module, a fallback shim, …).
  Every version leaves permanent dead code in the shipped test after GREEN. The
  answer is to get the behavioural RED from a *different* level: the repo-wide
  source scan for the retired token (a real assertion failure naming five files)
  and the production-runner seam (a real assertion failure naming the wrong node
  id). The pure-seam test's "is not a function" failure is the weakest of the
  three and should never be the only one filed.
* **Validating the new CHECK constraint.** `ALTER TABLE … ADD CONSTRAINT … CHECK`
  validates existing rows and would refuse to apply on any database that has ever
  served a multi-maker answer. `NOT VALID` is the whole mechanism: history keeps
  saying `first-configured-provider`, no new row can. A future "tidy-up" that runs
  `VALIDATE CONSTRAINT` would reject the very history it preserves — the migration
  says so in its own comment.
* **Adding a second exported derivation for the runner to call.** The runner needs
  to know whether the mark rides *before* serve derives the label. Re-implementing
  rung 0's condition in the runner would have been two sources for one rule (J6).
  The pure ladder is exported once and called from both; determinism makes them
  agree by construction, and serve asserts it rather than assuming it.

---

## 4. Where the packet was unclear — exactly

1. **"runner node-scope projection"** (packet §2, mark-mint bullet). The mark is
   about the ANSWER's label, and every sibling disclosure of that kind
   (`SINGLE-LINEAGE`, `UNSERVED-MAKER-POSITION`) is `scope: "answer"` with
   `subjectRef` = the served root. I shipped **answer-scope** and am flagging the
   deviation rather than absorbing it. If the reviewer wants node scope, it is a
   one-line change plus the seam assertion.
2. **"margin-to-runner-up in the receipt"** — "receipt" is never defined. Resolved
   to `ledger.propagation_run` (see §1.1). A reviewer who disagrees should say so
   now: the column is new and unreferenced elsewhere.
3. **The new rule string is my design decision, unreviewed.**
   `max-propagated-strength-lexicographic-tiebreak`. The packet says "design and
   document it" and nothing else. It is a DDL CHECK member and a wire literal, so
   changing it later is a migration, not a rename.
4. **Migration number.** 0055, chosen to dodge t6's 0053 and tint1's 0054, both of
   which are in flight and invisible to a reviewer reading only integration.

---

## 5. How to make this more of a one-prompt machine

1. **Give the packet a RESOLVED-NOUNS block.** Two lines here would have removed
   ~6 tool calls and one design near-miss: `receipt = ledger.propagation_run`,
   `condition-mark scope precedent = SINGLE-LINEAGE (answer)`. The goal speaks in
   design nouns; the packet is where they become file:line.
2. **Hand the seat its consumer census, not just its change site.** The packet's
   "ENUMERATE THE CLASS FIRST" instruction was the single most valuable line in
   it, and it worked — one grep sweep found all 26 references including three test
   files and one migration. It should be the DEFAULT shape of every anchor bullet,
   not an instruction the worker has to honour: *"here is the anchor; here is the
   grep that finds its class; the report lists them all."*
3. **Make "which suites will my type change break?" answerable without running
   them.** The vocabulary grew by one member and three unrelated tests broke on
   hand-written count pins (`toHaveLength(31)`). Nothing in the repo tells you
   those pins exist. A `grep -rn "CONDITION_MARKS).toHaveLength"` line in the
   mark-mint checklist would turn a discovery into a step.
4. **Ship the base-vs-tip evidence recipe as a script, not a trap entry.**
   `git diff > work.patch` → move untracked aside → `git checkout HEAD -- <dirs>`
   → run → `git apply` → `diff -q work.patch <(git diff)` is now documented in
   TOOLING-TRAPS and I used it exactly as written, with zero loss. It is
   mechanical enough to be `tools/base-run.sh <paths> -- <command>`. Every lane
   that owes a baseline comparison re-types it today.
5. **The D24 shape needs an explicit deletion-mutant clause** (see §1.3) and an
   explicit **non-discriminating-mutant clause** (see §1.4). Both are cheap edits
   to the ruling and both cost me time this round.

---

## 6. What went right and should be copied

* **The class sweep before the design.** Named in the packet, done first, and it
  is why the migration, the contract literal, the serve types, the acceptance
  ceremony and three count-pinned tests were all migrated in one pass instead of
  discovered one failing suite at a time.
* **Three levels of RED for one DoD clause** (pure seam, repo-wide scan,
  production runner). The seam-level RED is the one a reviewer trusts, and it cost
  one `git checkout` cycle plus two 12-second integration runs to get.
* **Recording the two non-discriminating mutants instead of quietly rebuilding
  them.** A campaign that only shows kills is a campaign whose failures were
  edited out.

---

## r2 — rework round 1 of 3 (codex r1: 3 blocking, 3 non-blocking)

## 1. The most expensive thing I did in r1 was write a true-sounding sentence

r1's report contained a class-sweep table with a row reading
`tests/integration/database.test.ts:2030 | 2030 migrated`. **It was not migrated.**
I had grepped the class correctly, listed the site correctly, and then written the
disposition from intention rather than from the file. The consumer still required
the retired rule and failed deterministically in the authoritative suite (codex
B2). The sweep was the thing I was proudest of in r1 and it is where the false
claim lived.

**CAUSE:** the sweep and the dispositions were produced in the same pass. I
enumerated the class from `grep`, then filled the "disposition" column while
writing the report — hours after the edits — from memory of what I had intended
to do, not from a second grep.

**PRICE:** one blocking finding, one rework round, and a reviewer having to prove
a negative for me. The fix took four minutes; the claim cost a round.

**UPGRADE (the one I would fight for):** a class table's disposition column must
be MACHINE-PRODUCED. Sweep, then re-grep at filing time and diff the two lists;
any site still matching the retired token is either in the permitted set or it is
a defect. That is exactly what
`tests/architecture/t10-first-configured-provider-removed.test.ts` does for
shipped source — and it is why B2 was found in a TEST file, the one zone that
scan deliberately excludes. **The scan should have had a second arm over tests
from the start**, not because tests are shipped, but because a test that pins a
retired literal is a landmine with a timer on it.

## 2. I filed a trap in r1 and walked into it in r2

r1's TOOLING-TRAPS entry: *"Restoring a worker's own edits with
`git checkout HEAD -- <path>` DESTROYS them — HEAD is the base, not your work."*

In r2 I ran the B1 mutant harness against an **uncommitted** fix. Its restore step
is a hard-coded `git checkout HEAD -- <file>`, so it restored the file to the r1
tip and silently deleted the B1 implementation. Porcelain went clean, which is
precisely what "restored correctly" looks like.

**CAUSE:** the harness encodes an invariant it never checks — *HEAD is my work*.
In r1 that happened to be true because I committed before every mutant. In r2 I
did not, and nothing said so.

**UPGRADE:** the mutant harness must REFUSE to run on a dirty tree, or snapshot
the file itself (`cp` before, `cp` back) instead of trusting `git checkout HEAD`.
A harness that can destroy the work it is meant to validate is worse than no
harness. This is a five-line change to `mutant.sh` and it belongs in the fleet's
copy, not mine. Recorded in the D24 log as a superseded block rather than
deleted, because a campaign that hides its own accidents is a campaign whose
failures were edited out.

## 3. Focused evidence masked the production caller (B1)

Every factory I exercised supplied `verdictLabelPolicy`: the integration
`runnerSettings()` because I added it there, and `acceptance/main.ts` because it
already read the family for T3. The one caller I did NOT touch —
`apps/runner/src/main.ts` — was the only one that ships. My "the runner stops
loudly if the family is missing" test passed for the wrong reason: it proved the
GUARD works, never that the SUPPLY exists.

**CAUSE:** I tested the failure mode I built and never asked *who constructs this
object in production?* — a one-line grep (`grep -rn "new WalkingSkeletonRunner"`)
that I ran during recon for a different purpose and did not re-read when I added
a mandatory setting.

**UPGRADE — the general rule, worth more than the fix:** *when you add a MANDATORY
setting to a long-lived constructor, the acceptance criterion is not "the guard
fires", it is "every construction site supplies it". Enumerate the construction
sites; that list is the test.* The repo already had the right instrument —
`tests/architecture/dev-runner-provider-set.test.ts` keeps a list of mandatory
entry-point settings — and I did not add my row to it. Note `panelPolicy` is
missing from that list too and from `main.ts` (F-note filed): the same class of
gap, in T3's lane, undetected for the same reason.

## 4. `NOT VALID` looked history-safe and was not (B3)

I chose `NOT VALID` in r1 for a good reason (never rewrite history) and stopped
thinking one step too early. It preserved the bytes and left every reader
asserting the bytes could not exist: the contract rejected them, the read type
denied them, and DR-184 catch-up tried to copy one into a row the CHECK refused.

**The tell I missed:** I typed the DB value as the new-only `ServedRootRule` in
the same commit that deliberately preserved old values. Two lines apart, in the
same file, I wrote "these values still exist" and "this value cannot exist". The
type system said so the instant I split the vocabulary — the compiler pointed
straight at the catch-up copy site.

**UPGRADE:** *a migration that PRESERVES a value must be accompanied by a read
type that ADMITS it, and the two belong in the same review sentence.* Concretely,
for any migration whose comment contains the word "preserve": grep every reader of
that column and show the type that admits the preserved value. I would put that
in the migration checklist.

The r2 design is also strictly better than r1's on its own terms: the CHECK is now
VALIDATED over the declared history, so every existing row is proven to be inside
it. `NOT VALID` left historical rows permanently unchecked — a weaker guarantee
that I had described in r1 as the stronger one.

## 5. Where the r2 packet was exactly right, and where I had to choose

- **Right:** ordering the findings B1/B2/B3 with the failure case spelled out for
  each. Each was reproducible from the packet text alone, and B3's three named
  failure cases became three test arms without re-derivation.
- **My call, and how it landed:** the packet authorised BLOCKING if B3's public
  wire shape needed a ruling. I did not block. The change widens a nullable string
  field from one literal to a two-member enum; I verified by grep that nothing in
  the repo switches or compares on it, so no consumer can break, and blocking would
  have cost a round for a change with zero blast radius. **J17 subsequently ruled
  the shape lawful and that no block was owed.** I record this not as vindication
  but as a calibration datum: the thing that made not-blocking defensible was the
  BLAST-RADIUS GREP, filed as evidence before the decision, not my confidence. The
  rule I would write for the next seat is *"a wire change may be taken without a
  ruling only when a filed grep shows no consumer discriminates the value"* — the
  evidence is what converts a guess into a judgement.

- **F-S06-8 became fleet law (D24 ADDENDUM-2).** The harness defect that cost me
  the B1 fix is now a standing requirement that mutant harnesses refuse a dirty
  tree. Worth noting for the fleet's self-report reading: this finding exists only
  because the accident was RECORDED. Had I quietly re-applied the fix and moved on,
  the same harness would have eaten someone else's work next week.

## 6. Costs, measured

| item | cost |
|---|---|
| B2 (the false claim) | 1 blocking finding, ~4 min to fix, 1 round |
| B1 harness destroying the fix | ~12 min (re-apply, commit, re-run mutant, write the correction block) |
| B3 test-harness iterations | 5 RED cycles before the four arms failed for their OWN reasons (append-only UPDATE → band-ceiling pairing → sequence name → FK version → fact-bundle version) |
| B3 design | the only genuinely hard thinking this round; ~30 min, and the answer came from asking what catch-up ACTUALLY does (inherits a root, never re-selects) |

The B3 harness iterations are the honest tax on seeding a state production cannot
write. Each failure was a real constraint doing its job (append-only, FK, paired
band ceiling, unique fact-bundle version) — the database refusing to let me fake
history casually. I would not remove any of them.

**UPGRADE for the fleet:** a `tests/support/` helper for "seal an answer as an
EARLIER version of itself" would have collapsed those five cycles into one. Three
lanes now need pre-migration fixtures; none has a shared way to build one.

---

## r3 — rework round 2 of 3 (codex r2: 1 blocking, 3 non-blocking)

## 1. I repaired a false claim with an assertion that proved nothing

r1's defect was a class-sweep row saying a consumer was migrated when it was not.
r2 fixed that — and shipped, in the same breath, an oracle that could not tell the
correct selector from the retired one:

```ts
for (const row of rootStrengthRows.rows) {
  expect(Number(row.strength)).toBeLessThanOrEqual(Number(servedStrength!.strength));
}
```

Over a fixture where **both roots carry the same strength**, that is a tautology.
The r3 campaign does not argue this; it measures it. Block `R3-B1-BEFORE` applies
the provider-order mutant to the r2 fixture from a clean committed tip:
`Tests 1 passed`. The same mutant against the fixed fixture (`R3-B1-AFTER`, same
mutation, same file hash `22d965b1…` on both sides): `Tests 1 failed`.

**CAUSE — and this is the one worth carrying.** In r2 I ran mutants for B1 and B3,
the two findings where I *designed* something. I ran **no mutant against the B2
repair**, because it felt like a one-line literal swap plus "an oracle". The
refutation duty exists precisely for the assertions that feel too obvious to
refute. *A test that reads real production data is not automatically a
discriminating test.* Reading `node_strength_record` made it LOOK like an oracle;
`<=` over a tie made it an ornament.

**RULE I would put in the worker contract:** *every finding you close gets a
mutant, including the ones you close by editing a test. If you cannot state the
mutation the repaired assertion now catches, you have not repaired anything.*

## 2. I asserted a property of a fixture I never measured

The worker contract's §3 says "Measure before you speculate — when the work turns
on a property of a concrete artifact, measure the artifact FIRST." My oracle turned
entirely on the relationship between two root strengths, and I never once printed
them. Two greps would have shown it: both makers used `judgementDouble(...)` with
the default fidelity, and the panel/edge inputs are symmetric.

Codex found it by reading the fixture INTO the propagation code
(`propagation/src/index.ts:374-420` ignores UNKNOWN arrows) — three files deep from
the assertion. That is the standard, and it is higher than "the query returns real
rows".

## 3. An inherited assertion is as dangerous as a new one

`expect(unservedRecord?.reason).toContain("Secondary test maker")` predates T10. I
kept it while migrating the test around it, and never asked whether it was still
*true* under the new rule. It was not: under the lawful lexicographic tiebreak with
tied strengths, which maker is named depends on which random UUID sorts first. My
three green C3 runs were, as codex put it, "compatible with three runs in which the
primary UUID happened to sort first."

**This is a specific and repeatable trap:** when you change a selection RULE, every
surviving assertion about *which* thing was selected is suspect, including — and
especially — the ones you did not write. I now derive both names from the strength
table so there is nothing left to be lucky about.

**Note on the three-run law:** it did NOT catch this, and it structurally cannot.
Three runs of a fixture whose nondeterminism is a random UUID that usually sorts
one way is three samples of a biased coin. The law is worth keeping, but its
guarantee is "not flaky under load", never "not nondeterministic in principle".
The thing that catches principled nondeterminism is removing the tie, which is
what the fix does.

## 4. What I got right this round, and would repeat

- **Ran the BEFORE mutant before touching anything.** The first thing I did after
  reading the finding was apply the provider-order mutant to the r2 fixture as
  shipped, from a clean committed tip, and record that it passed. That converted
  codex's static argument into a measurement I could put in the log — and it means
  the AFTER block proves the *delta*, not just the end state. Both blocks share the
  mutated-file hash, so they are demonstrably the same mutation.
- **Made the strict inequality an assertion, not a fixture comment.** The pin sits
  BEFORE the winner assertion, so a future fixture drift that re-ties the roots
  fails loudly at the pin instead of silently disarming everything below it. That
  is the exact failure mode I am reporting; the fix should make its own recurrence
  visible.
- **Refused the layout-sensitive validation check.** Codex noted `NOT VALID` could
  be reformatted as `NOT\nVALID` past my string assertion. Rather than harden the
  regex, I deleted the text check and read `pg_constraint.convalidated` from the
  live catalogue — then proved it discriminates with a mutant that writes exactly
  the `NOT\nVALID` form codex described. Asserting against the CATALOGUE instead of
  the SOURCE TEXT is the general lesson.

## 5. Cost

| item | cost |
|---|---|
| B1 (fixture + oracle + BEFORE/AFTER mutants) | ~25 min, 4 DB runs |
| N3 (prose + catalogue pin + its mutant) | ~10 min |
| N2 (M4-omitted re-run) | ~3 min — it was only ever a cleanliness defect |
| N1 (typecheck + C3 ×3 + C1 ×3 at the final tip) | ~6 min |

The B1 defect cost a full rework round. It would have cost nothing if r2 had run
one mutant against its own repair.

## 6. Residue, stated rather than guessed

One item is genuinely unresolvable inside this lane and is drafted as a V row in
the report rather than absorbed: **the acceptance ceremony test this lane edits has
never been executed by this seat** — it needs real CLI provider binaries. It is
typechecked at both ends and its assertions are derived from recorded strengths
rather than from provider order, but "typechecked" is not "run", and I will not
call it verified.

---

## r4 — evidence repair + integration merge (NOT a rework round; rework count stays 2/3, J19)

## 1. The harness defect codex r3 found was mine twice over

D24 ADDENDUM says the transcript's token IS the mutation's NEW text. My r3 harness
took the token as a **separate hand-passed argument** and printed only
`occurrences of mutant token: 1`. Every one of my r3 counts happened to be correct
— but nothing in the transcript established that the string counted was the string
inserted, and nothing recorded the `pre=0` gate at all.

**CAUSE:** I built the harness before the ADDENDUM existed, then patched it for
ADDENDUM-2 (dirty-tree refusal) and never re-read the ADDENDUM against it. I
treated a ruling I had helped produce as "already handled" because I had handled
*part* of it.

**UPGRADE:** when a ruling amends a tool you own, diff the tool against the ruling
line by line, not against your memory of what the ruling asked. The r4 harness now
derives the token FROM the mutation (`count()` searches for `$NEW` itself), so the
free parameter is gone by construction rather than by discipline — the only kind of
fix that survives a tired seat at 3am.

## 2. What the merge actually taught me

The merge produced **two** conflicts and **one** defect that no conflict marker
showed: T6's `resolveTrueUnjudgedReasons` took `readonly ConditionMarkRecord[]`,
and after the merge `persist` hands it the S06 union including
`PreservedConditionMarkRecord`. Git auto-merged both regions happily because they
are hundreds of lines apart. **The compiler found it; nothing else would have.**

That is the general shape worth recording: **a merge's real conflicts are type-level
and cross-file, and `git` cannot see them.** The three overlapping files git
auto-merged (`apps/runner/src/index.ts`, `tests/integration/database.test.ts`,
`acceptance/ceremony.test.ts`) got a landmark audit — a grep per lane for the
semantic markers each lane's review had established — because "auto-merged" is a
statement about text adjacency, not about meaning. I would make that audit a
standing step: *list each landed lane's landmarks from its own verdict, and grep
for all of them after any merge.*

The resolution itself was the easy part once framed correctly — though I framed the
REASON badly, and codex's merge review caught it (N1). I wrote that the resolver
reads "only `mark` and `subjectRef`". It reads four fields; `reviewOutcome` and
`terminalTransportOutcome` are decision inputs to T6's truth arm. The widening is
safe on a stronger argument I had in hand and did not use: the two union arms differ
in EXACTLY ONE field, `servedRootRule`, and the resolver never reads it — so the
read-set never needed enumerating at all. The alternative — narrowing S06's union at
the call site — would have made the catch-up path unrepresentable, i.e. would have
silently deleted J17's whole point to satisfy a signature.

## 3. A finding of mine closed itself, and I nearly missed saying so

**F-S06-6** (the `acceptance/adversarial-corpus.test.ts` TS2741 that failed the
acceptance-config typecheck at both ends in r2/r3) is **gone at the merged tip**:
TINT1's tsconfig repair brought `acceptance/**` into the ROOT config, and the root
typecheck now exits 0 covering it. So the finding I routed out of contract was fixed
by the lane I just merged, and — better — J18's closure condition ("a typecheck whose
config includes acceptance/**") is now satisfied by the *root* gate rather than by a
side config I had to justify.

I nearly filed the r4 report still carrying F-S06-6 as open, because I copied the
findings block forward. **Carried findings need re-verification at every new tip, not
transcription.** That is the same class as r1's false class-sweep row: a claim that
was true when written and was never re-checked.

## 4. Cost

| item | cost |
|---|---|
| harness rebuild + 4 refiled transcripts | ~15 min (one detached checkout for the BEFORE arm) |
| merge + 2 conflicts + 1 type seam | ~20 min; the type seam took the longest and was the only real thinking |
| verification (clusters ×3 ×4, T6/TINT1 clusters, D14 pairs, 2 zone runs) | ~35 min wall-clock, mostly waiting |

The zone had to run **twice** (merged tip and merge base) because set-equality needs
a comparand at the same base. That is unavoidable and correct, but it is 16 minutes
per merge round; a fleet that merges often would want the base zone cached per
integration commit rather than re-run per lane.

## 5. Nothing is left ambiguous from this seat

The ceremony residue is no longer an open ask: J18 answers it, and the r4 record
states J18's route rather than my draft's question. My earlier V-ROW draft V-S06-1 is
superseded on the record, with the underlying FACT (this seat never executed the
ceremony) preserved verbatim, because that fact remains true and is the reason the
route exists.

---

## r4b — merge-review repairs (no product change; rework count stays 2/3)

Four items, none a product defect. Two of them are the same mistake in different
clothes, and that is the finding.

## 1. I gave a true conclusion a false reason — twice

**N1.** I wrote that T6's `resolveTrueUnjudgedReasons` "reads only `mark` and
`subjectRef`". It reads four fields, and the two I omitted —`reviewOutcome` and
`terminalTransportOutcome` — are precisely the inputs that select T6's
review-versus-transport truth arm. The conclusion (the widening is safe) was
correct; the argument was junk.

What makes this worth recording is that **the correct argument was already in the
type I had written**: `PreservedConditionMarkRecord` is
`Omit<ConditionMarkRecord, "servedRootRule"> & { servedRootRule: … }`, so the two
arms differ in exactly one field and the resolver never reads it. That argument
needs no field enumeration and survives a fifth read of any OTHER field — but it is
bounded, and I overclaimed the bound too: it holds precisely BECAUSE the resolver
does not read `servedRootRule`. A future access that branches on that one field
would let a preserved row and a fresh row decide differently, and the proof would
need redoing. I reached for a weaker, enumerative justification, got the enumeration
wrong, and then oversold its replacement.

**CAUSE:** I wrote the rationale from memory of glancing at the function, at commit
time, instead of from the function. A four-line `grep -oE "record\.[a-zA-Z]+"`
would have produced the true set in seconds — and is what I ran to verify codex's
claim before accepting it.

**RULE:** *when a merge rationale asserts what code reads, the assertion is
generated from the code, not recalled.* And prefer the structural argument (what
differs between the types) over the behavioural one (what the body happens to
touch) — while stating the structural argument's OWN precondition, which in this
case is "and it never reads the one field that differs". A structural proof is not
automatically timeless; it is timeless *up to* the assumption that names it.

**N2.** The landmark log printed `CONDITION_MARKS length: 86`. That was
`grep -c` over source LINES matching a quoted-string pattern — a line span reported
as a vocabulary cardinality. The true structural counts are 31 / 31 / 32 / 32 across
base, integration, lane parent and merged tip. I also repeated the packet's claim
that the merge keeps "both lanes' mid-list mints"; **T6 has no kernel diff at all**,
so there is exactly one mint, mine.

Same disease as N1: a number and a claim that were *plausible* and unverified. The
recount is now a real extraction — array body between its declaration and its
terminator, quoted members counted — run at all four trees, with the DR-176 tail
printed at each so the "tail untouched" claim is shown rather than asserted.

**RULE:** *a count that appears in evidence must come from the structure it claims
to count.* `grep -c` over source lines is a line count no matter what you name the
variable.

## 2. The B1 gap is subtler and I should have seen it

My root typecheck ran at 12:42:11; the merge commit is stamped 12:42:55. Forty-four
seconds. Everything in between was me typing a commit message — but nothing in the
record proves that, and "the tree I compiled is the tree I committed" is exactly the
kind of thing a reviewer cannot take on trust. This is the same provenance class
codex raised in r2 (a compiler record predating the final tip), and I had already
been taught it once.

**RULE, now mechanical for me:** *run the acceptance-gate commands AFTER the commit,
and put the commit SHA, the tree SHA and the porcelain count in the log header.* A
record that cannot name the object it describes is a record of nothing. Cheap:
one extra run.

**And I immediately reproduced the gap while fixing it.** Running B1 first, then
committing N1's comment repair, left the filed record naming `e040b1ee` while the
lane tip had moved on. The change is 22 comment lines and nothing else — but that is
the same shape of argument that produced N1 and N2, so I bound a second typecheck to
the filed tip instead of reasoning about comments. The deeper lesson is about ORDER:
**make every content change first, commit once, then run the gates.** I followed the
coordinator's listed order (B1 first) literally and got a record that was correct and
already stale.

## 3. What went right

Codex's N1 was a correction I could verify in one command, and I ran it before
accepting — the four-field set in this report is mine, not transcribed. That matters
because two of the four findings are *my* unverified claims; accepting a third one
unverified would have been the same error a third time.

## 4. Cost

| item | cost |
|---|---|
| N1 (code comment + report + self-report) | ~8 min, one grep to establish truth |
| N2 (structural recount at four trees) | ~10 min; the recount script is reusable |
| N3 (malformed `# ## r4` headings) | ~2 min — a stray `# ` prefix in three sections of two files |
| B1 (typecheck at the committed tip) | one run |

N3 is worth one line of reflection: I wrote `# ## r4` because I was appending a
section whose text I had drafted with a `##` prefix and then added a heading marker
in front of it. A filing parser anchored on `^## r4` finds nothing. **Machine-readable
section contracts fail silently to human eyes** — the heading looked right in every
rendering I glanced at.
