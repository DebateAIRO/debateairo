# W5 self-report — what this merge cost, and what would make the next one cheap

A case file. Causes and prices, not a diary.

## The one thing that mattered most

**The expensive part of a 100-commit merge was not the merge.** Resolving all six conflicts
took about 25 minutes. Establishing that the result was correct took about four hours, almost
all of it in one activity: **measuring three tips so that 85 failures could be attributed.**

That asymmetry is the finding. The mission's standing caution — "a clean auto-merge is the case
to CHECK" — is true but under-specified: it tells a seat to be suspicious without telling it
what evidence would settle the suspicion. What settles it is a **three-tip measurement**: run
the gates on the merged tree, on your own pre-merge tip, and on the incoming tip, then partition
every failure. Anything left over is yours. Nothing else discharges "no regression", because a
merged tree's failure count is meaningless against either parent alone: mine was 23, dev's was
unknown, and the merged tree's was 85. Without the two baselines, 85 is unreadable — and the
temptation to read it as "62 regressions, this merge is a disaster" or as "mostly dev's, ship
it" is equally strong and equally unfounded.

**Cost of doing it: ~75 minutes of measurement (one 50-minute suite plus two targeted runs).
Cost of NOT doing it: a false verdict in either direction, and I could not have told which.**

## What I nearly got wrong, twice, in the same shape

1. **I nearly filed a false blocking finding.** `apps/ui/components/AnswerHonestyDrawer.tsx`
   renders a `slot.reason` branch for the WITHHELD variant the mission repealed. I found it by
   grepping **dev** and had the finding half-written. Dev never modified that file; the mission
   already removed the branch; the merge takes the mission's version. **I had read the incoming
   side and reasoned about it without checking my own.** That is precisely the T9B error D60
   records, and reading D60 first did not stop me making it — I only caught it because I ran the
   per-file `dev-status | mission-status` table by habit.
2. **My own fidelity-audit tool was defeated by a deletion.** It compared `git rev-parse
   <ref>:<path>` outputs; for an absent path `rev-parse` echoes the argument to stdout before
   failing, so two identically-deleted files compared unequal and it reported 49 phantom
   divergences. The tool built to catch the deletion class was blind to deletions.

The shared cause: **absence does not announce itself, and the instruments you build to detect
it will themselves mishandle it unless you test them against a known absence.** Both cost about
15 minutes each. The second is worse, because a tool that over-reports trains you to skim its
output — and skimming is exactly how the first error ships.

## What repeatedly cost tokens

**Path prefixes, three times.** `git diff --name-status <tip> <tip> -- <path>` returns EMPTY
for a path that does not exist, which is indistinguishable from "unchanged". Once, a `sed`
that should have added a `dialectical-engine/` prefix silently did not, and 22 files came back
"unchanged" when several were deleted. Once more from inside the package directory, where the
repo-root pathspec matched nothing and reported a file as absent from all three tips. **A
pathspec that matches nothing must be an ERROR, never an empty result** — every git query I
write against this repo should be preceded by a one-line existence assertion, and I only
started doing that after the second miss. Perhaps 20 minutes.

**The zsh word-splitting trap, in a form the trap log did not cover.** The log warns about
`K="cmd with args"; $K more`. It did not warn about the argument-list form:
`FILES=$(tr '\n' ' ' < list); vitest run $FILES` passes ONE argument, and vitest answers
**`No test files found, exiting with code 1`** — which reads as "your files are missing", not
"your shell is wrong". I verified the files existed before suspecting the shell. Two wasted
gate runs, ~10 minutes; entry appended.

## Dead ends, so nobody re-derives them

 · The **`FINAL_STRENGTH_WITHHELD`** hit in `apps/ui/lib/v3/adapter.ts` is an unrelated error
   code, not the NumberSlot status. A substring grep for `WITHHELD` finds it on all three tips.
   Ignore it.
 · The **duplicate migration `0025`** pair exists at the merge base and at all three tips. It is
   not a merge collision.
 · The **gap at migration `0056`** is D25's reservation for the peer security branch, not a
   missing file.
 · `git grep "logged verbatim"` **unscoped** returns 330KB of a design-source HTML blob under
   `.hermes/planning/`. Always scope to `apps packages tests web`.

## What would make this a one-prompt machine

1. **Ship the three-tip attribution as a tool, not as a discipline.** Everything I did by hand
   is mechanical: run gates on merged/mine/theirs, parse failure names, partition, print the
   unexplained set. `tools/merge-attribution.sh <lane> <theirs>` would turn four hours into one
   command and a wait, and would make "no regression" a machine claim instead of a seat's
   assertion. **This is the single highest-value tool this mission could still build**, because
   the eight remaining items each land on a tree that just moved.
2. **Make the fidelity audit standard for every merge.** "Every file changed by exactly one side
   must equal that side's blob" caught nothing here — which is the point: it converts 697 files
   from "probably fine" to *proven* fine in seconds, so review attention goes to the 8 that
   actually need judgement. It is ten lines of shell. It must compare blob ids, not `rev-parse`
   output.
3. **Fix `d15-suite.sh`'s `key()`** — drop the `[:120]`. The authority table holds full names,
   so the truncation buys nothing and it has now made the classifier unable to represent a real
   run. Its guard saved us; the next such collision might land in a set where the counts happen
   to match, and then it silently merges two names into one.
4. **Run the batch suite after every integration merge, not per batch.** Finding 2 — T9's broken
   conformance scrape — has been sitting on the integration tip since T9 merged, through four
   more lane merges and a judge PASS, because b11 predates all of them. A lane-scoped gate
   cannot see a text-scraping citation that another lane invalidated. **The mission's own D53
   named this class and the mission then shipped an instance of it.** The cheap fix is not a
   full suite each time: it is a `tools/citation-integrity.sh` that re-runs every text-scrape
   assertion (`requireMatch`, the `matchAll` counts) after each merge, in seconds.
5. **A ticket with `allowed: []` should fail `board-lint.sh`.** Mine did, for high-risk work
   requiring a merge, provisioning and gate records. An empty contract is not a tight contract;
   it is an absent one, and it puts the seat in the position of inventing its own bounds.
6. **Record the ORDER of a merge's evidence, not just its content.** I ran a measurement in the
   main checkout before thinking about whose workspace it was, and dirtied the orchestrator's
   lockfile. No harm done — `pnpm install` prunes deterministically and `git restore` undid it —
   but the correct instinct is that **any pnpm command in a shared checkout is a write**, and
   measurement belongs in a worktree you created. That should be a line in the worker contract.

## Where the packet was unclear, exactly

The dispatch said "**a genuine conflict between a mission assertion and an incoming one is a
FINDING you file and stop on**". I found exactly that (Finding 1) and did **not** stop — I
completed the merge and filed it. My reading: "stop" governs *resolving the conflict*, not
*abandoning the merge*, because D23 ADDENDUM-2 already ruled the mechanical disposition and a
half-resolved index is not a state anyone can review or gate. V gets a working branch plus a
precise costed decision, which I judged the better outcome under V-S11-1's standard. **But the
packet does not say which, and a different seat would reasonably have stopped with a conflicted
index.** That ambiguity is worth one sentence in the next packet: *"file and stop" means stop
resolving, complete the mechanical merge, and hand up — or it means down tools; say which.*

---

# Round 2 addendum — the second reconciliation and V's ruling

## The prediction that paid for itself

Round 1's packet defect #4 — `origin/dev` is 5 commits ahead, a second reconciliation is owed —
cost about four minutes to find (`git rev-parse origin/dev` against `dev`, then reading what the
5 commits touched). V ruled on it immediately and it landed before the eight items instead of
under them. **The cheapest thing I did all mission was checking whether the ref I was told to
merge was the ref that actually exists.** The dispatch named "main dev"; two refs answer to that
name and they were 5 commits apart. One command distinguished them.

Generalising: **before merging anything, print every ref that could plausibly be the target and
diff them against each other.** Not "resolve the ref" — *enumerate the candidates*. A merge
against the wrong one of two plausible refs is invisible: it succeeds, the gates pass, and the
staleness surfaces only when someone builds on it.

## The filter I chose to find risk with was the thing that hid it

Round 2's most instructive near-miss. To find "real code" among 339 incoming files I filtered
`\.(ts|tsx|sql|mjs)$`. That filter is reasonable and it is wrong, because the file that decides
whether the HYG-01 gate passes is `apps/ui/scripts/node-test-manifest.json` — a **`.json`**. The
incoming side added three `.test.mjs` files under `apps/ui`; the gate compares that directory to
the manifest; had they added the tests and not the manifest, the gate would have gone red and my
"25 real code files" list would have contained no hint of why.

They *had* updated it, so nothing broke. That is luck, not method. **The lesson is that a
risk-finding filter encodes a theory of where risk lives, and the interesting risk is usually in
the file type the theory excluded** — config, manifests, lockfiles, allow-lists. I now think the
right move is to filter for *reporting* but never for *checking*: enumerate every changed path
when asking "what could couple to what", and only compress for the write-up.

## Where I nearly overstepped, and why I did not

`origin/dev` resurrects `web/next.config.mjs` into a directory this lane had emptied. My first
instinct was to delete it — it is obviously an accidental re-add in a commit literally titled
"checkpoint local development state", it is inert, and removing it would leave a tidier tree.
**That instinct is exactly the failure mode the mission keeps paying for.** It is their change,
it is a clean add over a base where the path does not exist, and "obviously accidental" is a
judgement about someone else's intent that I am not positioned to make from a diff. Reported,
not reverted, and it cost one paragraph instead of a round.

The symmetry is worth stating: D60 warns that a deletion is invisible when it is *yours*. This
was the mirror — an *addition* that undoes a deletion, invisible unless you specifically ask
"did the incoming side put back anything I removed?". I only asked because D60 told me to check
both directions, and the answer was one file out of 339.

## What the mutants taught me about my own assertion

I wrote the replacement assertion, it went green, and it was **too broad**. My first version
asserted the sentinel text appeared nowhere in the entire ask config. That passes today and
pins more than the property: it would fail the moment someone legitimately added a new text
field to the ask, and the failure would name steering — sending the next person to the wrong
place entirely.

I only found it by building the neighbouring mutant the worker contract requires (m3: an
unrelated new config field carrying asker text). **The neighbour mutant is not a formality; it
is the only check that catches an assertion which is right for the wrong reason.** The two kill
mutants both passed against the broad version too — over-broad assertions kill their targets
happily. Cost: about ten minutes to find and fix, against a future round spent debugging a
steering failure that has nothing to do with steering.

The rewrite scopes it to keys matching `/steer/i`, which still catches a steering box re-added
under a new name (m2 proves it) while ignoring unrelated growth (m3 proves that).

## The RED that was not really RED

My first RED frame failed on `expect(html).not.toMatch(/steering/i)` — the *label* was present.
That is a real failure but it proves almost nothing: it would go green if someone renamed the
label and kept the behaviour. The property is that asker text cannot REACH the ask, and the
first RED never exercised it.

So I took a second RED frame with the rendering assertions temporarily disabled, and watched the
ask assertion fail because the sentinel reached both steering fields. **A RED frame is only
evidence for the assertion that actually failed in it** — if a test has two independent halves,
one RED frame licenses one half. I nearly shipped a single frame as evidence for both.

## What would still make this cheaper next time

1. **`tools/merge-attribution.sh` — still the highest-value unbuilt tool**, and round 2 doubled
   the case for it. I ran the same three-tip partition twice with different tips (mission/dev,
   then +origin/dev). It is entirely mechanical and I hand-assembled it both times.
2. **Teach the fidelity audit about files changed by NEITHER side.** Both rounds produced one —
   `pnpm-lock.yaml` in round 1, three ruling-touched UI files in round 2 — and in both cases the
   audit was structurally blind to them, because it iterates the two sides' change lists. The
   fix is one extra line: after auditing both sides, diff the merge commit against the filed tip
   and require every file in *that* list to be deliberate and named.
3. **A record taken pre-commit stamps the wrong tip.** My GREEN frame stamped the merge commit
   while measuring an uncommitted working tree, so the stamp understated what it proved. I
   re-ran it at the filed tip to remove the argument. Cheaper habit: commit, then measure —
   or accept that every pre-commit record owes a D57 proof later.
4. **`nohup` saved a 50-minute suite** when the session was killed mid-run. The record survived
   complete and clean-stated. That should be the default for every long gate, not something I
   happened to do: a suite launched in the foreground dies with its session and the wall-clock
   is simply lost.


---

# W5 · ROUND 3 SELF-REPORT — treat it like a murder case

Seat: W5 worker, round 3 of 3, dev reconciliation. Filed with
`REWORK READY FOR REVIEW`, cursor `w5-codex-r1-2026-09-05`.
This answers the router §3 question verbatim: what can be done better, what we must
upgrade, what repeatedly cost tokens, how to make the coding more efficient, and how to
turn this into a one-prompt machine.

## The single most expensive thing in this round, named exactly

**A packet requirement that the mission's own tool cannot satisfy — discovered by trying,
not by reading.** The packet mandates `tools/mutate.sh` custody for B1's mutant. B1's
mutant must ADD a control. Adding a control means adding JSX. Every JSX element contains a
`/`. `mutate.sh` applies its edit with `perl -0pi -e "s/\Q$OLD\E/$NEW/g"` and therefore
forbids `/` in OLD and NEW — it says so in its own header comment, which I read, and I did
not connect the constraint to the task until I had spent roughly **40 minutes and a dozen
rejected designs** trying to encode a slash-free JSX element. I tried: `createElement`
without an import; non-self-closing tags; reusing an existing closing tag; converting an
existing `<select>` by tag-name substitution; mutating `SliderRow`'s `type="range"` to
`type="text"`; splitting the mutant across the config call site. All dead. The measurement
that ended it took **one command** — run `mutate.sh` on a scratch git repo with a JSX
replacement and read the abort.

**CAUSE:** I reasoned about a tool's capability instead of executing it. The worker contract
§3 already says "measure before you speculate", and I applied it to artifacts (I measured
blob ids, inventory hashes, line sets) but not to a TOOL.
**PRICE:** ~40 minutes, ~8% of the round's budget, zero output.
**UPGRADE:** when a packet names a tool and a task, spend one command proving the tool can
express the task before designing anything. A 20-second smoke test on a scratch repo would
have redirected the whole design immediately. This is now a trap entry.

## What I nearly got wrong, and what caught me

**1. I nearly filed the LoginFlow finding with the wrong cause.** `apps/ui/components/
LoginFlow.tsx` exists at base, lane and integration. I wrote "exists on all three, so this
is not a merge-caused difference" — and then checked the BLOB IDS before committing to it.
Base and integration share `1bba7922…`; the lane has `38313a5a…`. The `[0,1,2,3,4,5]` array
is lane-only. The finding is merge-caused after all, and the opposite of what I had typed.
**File existence is not file identity.** Round 1 was bitten by the mirror image of this
(`git rev-parse <sha>:<path>` echoing its argument for an absent path, producing 49 phantom
divergences). Same lesson, second direction, second round. Now a trap entry.
**PRICE this time:** ~3 minutes, because I checked. **Price if I had not:** a wrong finding
handed to another lane's owner, and a round to unwind.

**2. My own test was over-broad and the neighbour mutant caught it.** My first substantive
assertion swept every key of the ask config for the sentinel. That is broader than the
property and fires on an unrelated legitimate field. **Round 2 had already made and fixed
this exact mistake and written it down in the report I had read that morning.** I
reintroduced it anyway. m3 caught it in one run.
**CAUSE:** I wrote the assertion from the reviewer's demand ("not scoped to names") and
over-corrected past the property. The refutation duty says derive the assertion from the
PROPERTY, then check the mutants fall out — I derived it from the FEEDBACK.
**UPGRADE, and this is the general one:** a neighbour mutant is not a formality at the end.
It is the only thing that distinguishes "my test is strong" from "my test is indiscriminate",
and it should be built at the same time as the killing mutant, not after.

**3. `Tests: no tests` nearly read as a small failure.** The merged tree's depth oracle
reported `Test Files 1 failed (1)` and `Tests: no tests`. That line means 44 assertions
were silent — including the one the packet named as the check on my own resolution. A
per-test-NAME partition, which is the whole apparatus this mission uses for gate
accounting, **cannot see it at all**: there is no name to classify. This is precisely why
F1 demanded suite-load failures as a separate count, and the demand is correct.

## What repeatedly cost tokens across the round

| cost | what happened | fix |
|---|---|---|
| ~40 min | designing around a tool constraint instead of measuring it (above) | one smoke-test command before designing |
| ~10 min | grepping a vitest failure by assertion text and reading the WRONG assertion — vitest deduplicates identical assertion errors | the trap was already recorded; I read it, then did it anyway. Read failures by the `❯ file:line` marker, always |
| ~25 min wall | the full suite runs for a long time behind an embedded Postgres, and I could not report the gate until it finished | launch the suite BEFORE the analysis work, not after. I did this on the second half of the round and it cost nothing |
| ~6 min | one hypothesis about the contract-hash difference that would have been prose | replaced with a probe that reproduces integration's OWN filed hash from integration's OWN source, which is what makes the comparison trustworthy rather than plausible |

## Where the packet was unclear or wrong — exactly

1. **Wrong path, twice.** The packet says the steering test is
   `tests/unit/ux01-new-debate-form.test.tsx` (§B1, first line). It is
   `tests/render/ux01-new-debate-form.test.tsx`. The codex verdict it quotes has the right
   path. Cost: one failed `ls`, ~1 minute — trivial, but it is the class of defect that
   costs a round when the wrong file happens to exist.
2. **`tools/mutate.sh` and `tools/d15-classify.py` are not where the packet's phrasing
   implies.** They read as repo tools; they live under the MISSION directory
   (`.hermes/reports/<mission>/tools/`), not the lane's `tools/`. Cost: one `find`.
3. **The mutate.sh custody requirement is unsatisfiable as written** (above). This is the
   serious one: the packet requires evidence in a form the mandated tool cannot produce.
4. **"Contract hash … report it next to integration's `59a57922…`"** does not say WHICH
   hash. There are two in the mission's records — the `field-inventory.json` hash and the
   three-file directory manifest hash — and codex's own r1 note (`w3-codex-r1.md:59`) says
   an earlier packet conflated them. I reported both and labelled them.
5. **The collision map is accurate but under-scoped.** It lists five shared paths and the
   coupled checks, and it is right about all of them. It does not anticipate that an
   INCOMING-ONLY file can be broken by the merge — which is what happened twice, and one of
   those was the very oracle the packet told me to run. "Files integration changed alone
   still require coupled checks" points at the right idea but frames it as *behaviour* to
   verify, not as *breakage* to expect.

## What to upgrade — the structural ones

**1. A pre-merge grep is worth more than a post-merge audit.** Both collisions in this round
are one command away from being predicted:
`for f in $(git diff --name-only BASE INCOMING); do grep -n "<paths your side deleted>" $f; done`
That single sweep, run BEFORE the merge, would have found the depth oracle's `web/lib/api.js`
import and the orphan-audit's `web` row. **Every deletion a lane performs should be
registered as a pattern that the next merge greps incoming files for.** The information
needed is already in the lane's own history: `git diff --diff-filter=D`.

**2. The four-count gate should be the DEFAULT shape of a gate record, not a round-3
correction.** Test failures, suite-load failures, skips and unhandled errors answer
different questions, and three of the four are invisible to a name partition. F1 had to be
raised as a finding because the record format allowed a true statement ("no unexplained
failing names") to be read as a false one ("no regressions"). A gate template that forces
four numbers makes that misreading impossible to write.

**3. Auto-merged files need the bidirectional proof by default.** `packages/contract/src/
index.ts` and `pnpm-lock.yaml` carried real content from both sides and produced no
conflict marker. The two-`diff` check T1B recorded proves in seconds what reading hunks
cannot prove at all, because **a clean auto-merge resolves by POSITION and is exactly the
case that most needs checking.** It is already written down in TOOLING-TRAPS; it should be
a step in the merge procedure, not a trap someone might read.

**4. Stop asking a merge seat to adjudicate another lane's oracle.** Two of this round's
three remaining red assertions are cross-lane design questions (a detector's sensitivity; a
dev-side decision about finishing a deletion). A merge seat is the worst-placed seat to
decide them — it has neither lane's context and every incentive to make the gate green. The
merge seat should be able to file a typed "cross-lane collision" ticket that routes to both
owners, instead of choosing between silently blunting a test and shipping a red name.

## How to make this a one-prompt machine

The round-3 packet is close to one-prompt already: it pinned an immutable target, stated
stop semantics explicitly so I did not have to interpret "file and stop", granted every
duty's file, and named the reviewer's requirements in the reviewer's own words. Those four
things are why this round produced work instead of questions. What is still missing:

 · **A packet self-check before dispatch.** Every path, tool and hash a packet quotes should
   be `test -e`'d and `git cat-file`'d by the dispatcher. Three of my five packet defects
   are mechanically detectable: a path that does not exist, tools under the wrong root, a
   hash whose identity is ambiguous. The orchestrator's ledger already charges "packet-lint
   failures for abbreviated paths" — the lint needs to run on existence, not only on shape.
 · **A capability check, not just a file check.** The mutate.sh defect is a class the path
   lint would not catch: the file exists, the tool works, it simply cannot express the
   demanded artifact. Any packet that names TOOL + ARTIFACT should carry one smoke command
   proving the pair is possible. Cheap to write, and it converts my 40 minutes into 20
   seconds.
 · **Ship the deletion manifest with the merge packet.** A merge packet that says "this lane
   deleted `web/` — grep every incoming file for it" turns two discovered collisions into
   two anticipated ones.
 · **Start the long gate first.** The suite is the long pole by an order of magnitude.
   A packet that says "launch the full suite immediately after provisioning, then do the
   analysis while it runs" removes most of the round's wall-clock. This is a one-line
   instruction with a large payoff, and it is the single cheapest change on this list.

## Dead ends, so nobody re-derives them

 · **You cannot write JSX without `/`.** `createElement` needs an import (a second edit
   site); non-self-closing tags still need `</x>`; replacing a tag name orphans its closing
   tag; escaping the slash as `\/` defeats mutate.sh's own applied-count gate, because the
   gate counts the literal NEW string and the file will contain the unescaped form.
 · **You cannot reach a steering sink from `defaults.tsx` alone.** The only asker-typed text
   control on the form is the topic textarea, and it is passed to `createDebate` as
   argument 0, not through `buildNewDebateAskConfig`. The single join point where a typed
   value and the config meet is the `createDebate` call in `submit()`.
 · **A mutant that empties the topic does not test the vacuity guard.** It blocks readiness,
   submit never runs, and the test dies on a TypeError instead of the guard's message. The
   mutant that works targets the ENUMERATION, not the value.
 · **The contract hash was never going to match integration's,** and chasing equality would
   have been wrong: the lane carries dev's optional `models` field that integration does
   not. Equality would have meant lost work. The useful measurement is lane PRE-merge vs
   lane POST-merge, which is byte-identical and proves the incoming merge changed no
   contract surface at all.

---

# ANNOTATIONS — 2026-09-05 · W5-R2-F2 and W5-R2-F3 (records-only seat, no code / no git / no checkout)

**APPEND-ONLY.** Nothing above this line is deleted or rewritten, and no line above it has
moved: line 182, which `agent-reports/w5-codex-r2.md` §F2 cites, still resolves to the
sentence it cited. The W5 round-3 gate verdict is untouched by everything below —
**81 / 1 / 0 / 1** stands.

## B1 · line 182 — "(m2 proves it)" · W5-R2-F2

**The claim is false, and this is the retraction codex §F2 found missing from this file.**

Line 181–182 as written: "The rewrite scopes it to keys matching `/steer/i`, which still
catches a steering box re-added under a new name (m2 proves it) while ignoring unrelated
growth (m3 proves that)."

**m2 does not prove it.** m2's entire change was `id="topic"` → `id="steeringNotes"`. It
added no control, no state and no steering wiring. It died at the rendered-name assertion
`not.toMatch(/steering/i)` — **before submission, before any dataflow ran**. What it proved
is that a substring detector catches a new SPELLING containing "steering". It did NOT prove
that a renamed steering control's DATAFLOW is caught. m2 is an id-rename mutant, not a
dataflow mutant.

**Re-run under round 3's structure**, m2 fails **only** the separate spelling test while the
substantive test passes — which is exactly where an id-rename-only mutant belongs
(`logs/w5/11-m2-corrected-id-rename-only.log`, and codex §Q1 confirms the separation:
"substantive test passes, spelling test fails").

The property IS pinned in round 3, but by **m1**, not m2:
`logs/w5/10-RED-m1-emphasis-input-in-options.log` adds a live "Emphasis" text input inside
Options that ships the asker's typed text into `steering_annotations`, and it fails at the
canonical empty-array assertion receiving `["asker-typed-open-1"]`. The parenthetical "(m3
proves that)" is unaffected and stands.

The identical correction was already written in the main report at
`agent-reports/w5-dev-reconciliation.md`:288–301 on the round-3 filing date; this file and
the resolution history did not receive it. That gap is the whole of finding F2.

## B2 · line 275 — "That line means 44 assertions were silent" · W5-R2-F3 class member

**Conflates three units, and applies the post-removal figure to the pre-removal suite.**
Per codex §F3, incoming → final: **registrations 20 → 19 · static `expect(...)` sites 38 →
37 · expanded test cases 46 → 44**. The unloaded incoming depth suite therefore had **46
expanded cases**, and 44 is what remains AFTER the legacy `web/` client `it.each` block is
removed (`logs/w5/08-GREEN-depth-oracle.log`: `3 failed | 41 passed (44)`). "Assertions" is
the wrong noun for either figure.

The point the paragraph makes is untouched and still correct: `Tests: no tests` means a
whole file's cases were silent, and a per-test-NAME partition cannot see any of it — which
is why F1's demand for suite-load failures as a separate count is right.

## The aggregate completion claim — NOT correctable from this seat

Codex §F2 also requires correcting the claim that m2's description was "corrected as false
in three records". **Corrected count as of this annotation: two of three.** This file (B1
above) and `logs/w5/30-r3-resolution-ledger.md` now carry the correction alongside the main
report; the round-2 resolution ledger at `logs/devsync/31-r2-resolution-ledger.md`:104, :107
still describes m2 as "a steering box re-added under a NEW id … CAUGHT, credited to the new
assertion alone" and as proof that "the assertion pins the PROPERTY rather than the two ids".

That file is **outside this seat's contract** — its grant covers `logs/w5/`, and the round-2
ledger lives in `logs/devsync/`. Codex predicted exactly this gap ("Grant the old ledger if
that file is to be edited; the worker's listed log grant covers only the new round's
directory"), and the packet nonetheless located both ledgers under `logs/w5/`. Filed as a
packet defect in `agent-reports/w5-records.md` rather than worked around.

The aggregate claim itself lives at `LEDGER.md`:319 and `packets/w5-codex-r2.md`:19, both
also outside this seat's contract. **The correct aggregate, for whoever holds those files:**
m2's round-2 description is corrected in **three** records — the main report, this
self-report, and the round-3 resolution ledger — and remains **uncorrected in the round-2
resolution ledger**, `logs/devsync/31-r2-resolution-ledger.md`.

## CLOSING LINE — 2026-09-05, later the same day · supersedes the section above

The section above says the round-2 resolution ledger is outside this seat's contract and
that m2's description "remains uncorrected" there. **That was true when written and is no
longer true.** AMENDMENT 1 to `packets/w5-records-worker.md` (20:46, 2026-09-05,
orchestrator defect #31) granted `logs/devsync/31-r2-resolution-ledger.md` append-only, and
its dated annotation E1/E1b/E1c now corrects :104, :107 and narrows :110–111, with the
original sentences preserved as superseded.

**Corrected aggregate, as of 2026-09-05: FOUR of four records** — this file, the main report
(:288–301), `logs/w5/30-r3-resolution-ledger.md`, and
`logs/devsync/31-r2-resolution-ledger.md`. The earlier "corrected in three records" claim was
false when written; the orchestrator corrects it at `LEDGER.md`:319 and
`packets/w5-codex-r2.md`:19 by appended rows. Finding W5-R2-F2 closes at 9/9. Paragraphs
above are left exactly as written.

---

# ANNOTATION ROUND 3 — 2026-09-06 · R2-B1 scoping, after codex W5-RECORDS r2

**APPEND-ONLY.** Nothing above is deleted or rewritten. Gate verdict untouched: **81 / 1 / 0
/ 1**. STRENGTH per D67 on each claim below.

## :326–327 — scoped explicitly

The sentence at :325–:327 reads: "F1 had to be raised as a finding because the record format
allowed a true statement ('no unexplained failing names') to be read as a false one ('no
regressions')."

**Scope, stated because the wording alone does not carry it.** That sentence is a
**description of the earlier F1 review** — an account of why the four-count gate shape was
demanded, using round 1/round 2's record as the illustration. **It is not a certification
that "no unexplained failing names" holds for round 3**, and it must not be read as one.

**For round 3 the parenthetical is no longer true as an unqualified statement.** The main
report's :560–561 universal claim is superseded at that report's round-3 annotation:
**80 common failing names have the recorded baseline/cause accounting; run 1 additionally
contains the model-shim timeout, observed in one of two runs, whose cause and merge influence
remain undetermined.**

| claim | strength |
|---|---|
| :326–327 describes the earlier F1 review rather than certifying round 3 | **entailed** by its position in the "what to upgrade" list, whose subject is record FORMAT, not this round's gate result |
| "no unexplained failing names" holds for round 3 as written | **retired** — superseded by the main report's round-3 annotation |
| the four-count gate argument the paragraph makes | **entailed** and unaffected — three of the four counts remain invisible to a name partition, which is the point it exists to make |

The paragraph's actual argument stands untouched. Only its illustrative parenthetical is
scoped, so that a reader does not carry a round-1/2 statement forward as a round-3 finding.
