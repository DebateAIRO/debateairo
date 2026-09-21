# W3 self-report — the register derives its sealed depth from the contract owner (V-T1B3-1)

Seat: worker, lane/w3, base `d08ee9283244dcfb76d68820360810c7749940d6`.
Round 1. Outcome: **BLOCKED — the derivation target does not exist at this base.**
No product line changed. Tree returned pristine (`git status --porcelain` empty, HEAD unchanged).

---

## 1. The cause, named

**The packet describes lane/t1's tree, not mine.** Its central constant is unverifiable at my base:

> "The contract owner is `packages/contract/src/index.ts:112` `export const EXPANSION_DEPTH_MAX = 5;`"

`EXPANSION_DEPTH_MAX` does not exist in my worktree. Not tracked, not on disk, not generated.
Checked four ways: `git grep` over the tree, `grep -r` over the working directory including
`packages/contract/generated/`, `git grep` against branches `dev`, `main`, `lane/t1`, `lane/t1b`,
and `tsc`. It exists on exactly one ref — `lane/t1`, the unmerged lane this ticket exists to
unblock. Line 112 of my `packages/contract/src/index.ts` is `export const AskRequestSchema = z.object({`.

That single fact invalidates the mechanism, the acceptance check, and the sequencing:

- **the mechanism** — "the register derives the sealed value from the contract owner" needs an
  owner to derive from. `tsc --noEmit` on the forward reference:
  `packages/register/src/algorithm-policy.ts(4,10): error TS2305: Module '"@debateai/contract"'
  has no exported member 'EXPANSION_DEPTH_MAX'.`
- **the acceptance check** — "GREEN after" is unreachable. T1's oracle asserts the depth-bound
  site list over `packages`, `apps`, `web` equals exactly one entry: the owner. My tree has 9.
  Two are mine. The other 7 are `apps/runner` (3), `apps/ui` (3), `packages/budget` (1) — T1's
  conversions, all outside my contract, `apps/runner` explicitly forbidden to me. Removing my
  two leaves 7. Measured, not reasoned: 9 → 7, same 15 failed / 31 passed.
- **the sequencing** — V-T1B3-1's premise is that W3 lands so lane/t1 can *then* catch up. So at
  W3's merge the owner still does not exist. The ordering is circular as specified.

**The habit this is an instance of** is the one D61 already names — an outcome the contract cannot
reach — with a sharper edge: here the outcome could not be reached by *anyone* at this base,
because it was specified against a different tree. D61 fixed "the packet must grant the file";
this needs the neighbouring rule: **a packet that quotes a symbol must quote it from the base
commit it dispatches against.** One `git grep EXPANSION_DEPTH_MAX` in the dispatch worktree
would have caught it in under a second.

## 2. Price

| | |
|---|---|
| Wall clock | ~35 min, one session, no rework rounds spent |
| Gate runs | 5 (2 baseline, 1 RED, 2 probes) |
| Product lines changed | 0 |
| Cost of the defect had I not checked | An import that does not compile, a lane that cannot pass its own typecheck gate, and a merge that breaks integration for every other lane |

The check that saved it was cheap and is the worker contract's own §1 ("every constant it quotes
is either verifiable or a defect"). I ran it before reading the code properly, which is why the
cost was 35 minutes and not a round.

## 3. What I nearly got wrong

**I nearly reported the oracle's 15 failures as "the oracle disagrees with this tree".** The
import of a symbol that does not exist did *not* throw. Vitest's transform bound
`EXPANSION_DEPTH_MAX` to `undefined`, the file loaded, and the run produced an ordinary
`Tests 15 failed | 31 passed (46)` — which reads exactly like a substantive disagreement. It is
not; it is "the subject of this oracle is absent from this tree", a different finding with a
different owner. The compiler is what names it. Filed as a trap.

**I nearly moved the literal instead of removing it.** The tempting cheap fix is a named constant
in `packages/register/src/engine-shape.ts`. The oracle catches that correctly (`/depth/i` + a bare
`5` — `ENGINE_MAX_DEPTH = 5` matches both arms). The *next* temptation is worse: name it something
without the token "depth" (`ENGINE_MAX_EXPANSION = 5`) and the oracle goes quiet. That passes the
check and defeats the rule — a second literal ceiling surviving under a name chosen to evade
detection. **I refused it.** V chose derivation over narrowing precisely so this would not happen,
and a spelling that evades a text oracle is narrowing the rule by other means. Naming it here so
nobody re-derives it as a clever option.

## 4. Dead ends, so nobody re-walks them

1. **Derive from a sibling in `packages/register/`.** No upstream in my tree publishes the
   ceiling. Any literal I write in `packages/register/**` is inside the oracle's scan roots.
2. **Parameterise `buildAlgorithmRegisterRows` so the caller supplies the ceiling.** Legitimate
   D58 mechanism, and it fails on the same wall: the sole caller is
   `apps/runner/src/dev-deployment-register.ts:177`, outside my contract, and it would acquire
   the literal the oracle then flags. The defect relocates; it does not go away.
3. **Derive from `packages/budget`'s stored-basis schema** (`src/index.ts:47`,
   `depth: z.number().int().min(1).max(5)`). Outside my contract, and it is itself one of the 7
   sites T1 removes — deriving from a literal that is scheduled for deletion.
4. **Derive arithmetically from the `ENGINE_*` topology constants.** There is no true relation;
   it would be a fabricated derivation that happens to equal 5.
5. **Write the owner myself.** `packages/contract` is `readonly` in my contract, my packet
   forbids touching the owner's value or exports, and `lane/t1` edits that exact file — I would
   be authoring a merge conflict into the lane I am unblocking. It would also trip the audit's
   own numeric-literal-export rule, which is what T1's `GOAL_RULED_LAW_CARRIERS` exemption
   exists to settle. That exemption is not in my tree either.

## 5. What I verified that the next round should not re-derive

- **The oracle's rule, exactly.** `kindOfCeilingLiteral`: text matching `/depth/i` **and** a bare
  `5` (`(?<![\w.$])5(?![\w.$])`), over three windows (physical line, declaration unit, conjunct).
  The T17 provenance comment above `maxDepth: 5` is safe — it writes `1..5`, and the `.` kills
  the bare-five lookbehind. Only the value line matches.
- **My two sites are one physical line.** `:257` (line window) and `:252` (declaration-unit
  window, which begins at the first comment line after the preceding `,`). One edit clears both.
- **The architecture answer, in full.** The table is 28 rows — confirmed by the audit's own
  `"edgeRowsChecked": 28`. `register -> contract` is **not** currently declared; row 17 is
  `["register", "packages/register", ["kernel", "db"]]`, and an undeclared edge is reported as
  `register -> contract is not a declared edge` (`tools/orphan-audit/src/index.ts:61`). So the
  reconciliation **amends an existing row rather than adding one — the table stays 28 rows**.
  No cycle: `contract` depends on `kernel` only (row 15).
- **The baseline.** `pnpm typecheck` exit 0. `pnpm lint` exit **1**, pre-existing, three
  violations, none depth-related and none mine: `apps/api`, `apps/runner` and `apps/scheduler`
  each `-> obs-capture is not a declared edge`. Whoever lands `obs-capture` owes that row.

## 6. What to upgrade

1. **Verify the packet's symbols against the dispatch base, mechanically.** The mission already
   has `stamp-check.sh` for stale stamps and `gate-run.sh` for gate records. The same shape is
   missing for packet claims. A `packet-check.sh <packet> <worktree>` that pulls every
   `path:line` and every `` `IDENTIFIER` `` out of a packet and asserts each resolves in the
   dispatch worktree would have failed this packet in one second. This is the third mission tool
   of exactly this kind (D41, D45, D46) and the argument for it is identical each time: a rule
   stated in prose is checked inconsistently; a rule shipped as a tool is checked every time.
2. **Fix `gate-run.sh`'s working directory.** It computes `PKG` and documents it as "the package
   root the gate actually runs in", then runs `( cd "$WT" && "$@" )`. In a nested repo the
   command runs where there is no `package.json` and the record shows a plausible failing gate.
   The one-character fix is `cd "$PKG"`. Until then every packet should say to pass the ENGINE
   directory, not the git root. Two of my three traps trace to this single line.
3. **Cross-lane oracles need a home that is not a lane.** This ticket's acceptance check lives in
   an unmerged worktree and had to be hand-copied and re-anchored to run. Any repo-wide invariant
   — which is what V-T1B3-1 says the drift check was scoped too narrowly to see — should live
   where every lane runs it, not inside the lane that authored it. That is the same lesson as
   D41(b), one level up: mission evidence left in a lane worktree dies with the lane; a mission
   *invariant* left in a lane worktree is unenforceable everywhere else in the meantime.
4. **Toward one prompt.** The expensive part of this ticket was not the work — there was none. It
   was reconstructing which tree the packet was written against. A dispatch that carried, per
   ticket, `base=<sha>` plus the output of the symbol check above would make a seat's first
   action a confirmation instead of an investigation.

## 7. Where the packet was unclear, exactly

- `allowed` lists `dialectical-engine/.hermes/TOOLING-TRAPS.md` **repo-relative**, and two files
  match: the shared live one in the main checkout (1322 lines) and a frozen copy in my worktree
  at my base (211 lines). D61 says other lanes also append, so only the main-checkout copy can be
  meant, but the packet does not say so and D41(b) requires the absolute path. I appended to the
  main checkout's. This is the same relative-path defect D61's own citation records against the
  h-diag packet.
- The `logs/w3/**` entry is likewise repo-relative; D41(b) makes it the mission directory, which
  is where I wrote.
- `apps/runner/src/index.ts` is named as the forbidden runner file. The file derivation would
  actually have needed is `apps/runner/src/dev-deployment-register.ts` — also outside the
  `allowed` list, but not named, so the "STOP and name the line" instruction pointed at the wrong
  line.

---

# ROUND 2 — the same ticket, on the base that had the owner

Base `d4a3eae9` (lane/t1 tip) + catch-up merge of integration `3d137d64`.
Worktree `lane-w3b`, branch `lane/w3b`. Two commits: `38f995e1` (merge), `6c45c76e` (derivation).
Outcome: **delivered**, with one coupled 2-line pair handed up for a grant.

## 8. What round 1's block actually bought

Round 1 produced no product line and was still the cheaper half of this ticket. On the correct
base the work took ~25 minutes and the derivation was 4 lines. Everything that made round 2 fast
was measured in round 1: the oracle's exact predicate, that my two sites are one physical line in
two scan windows, that admission reads the sealed row and never a literal, that the edge table has
28 rows, and that `GOAL_RULED_LAW_CARRIERS` would satisfy the numeric-literal rule. **Every round-1
prediction held.** The one I got materially wrong is in §10.

The lesson is not "blocking was right" — it is that a block which hands up *measurements* costs a
fraction of a block that hands up an opinion. The self-report is what made round 2 a checklist.

## 9. What I nearly got wrong in round 2

**I nearly claimed the source-rule audit passed without ever running it.** `pnpm lint` is
`audit:architecture && audit:source`, the architecture half is red at integration for reasons that
predate every lane, and the `&&` short-circuits. The record looks complete — command, JSON body,
`EXIT = 1` — and says nothing about a skipped second audit. I caught it only because I was looking
for a specific string (`packages/contract/...`) and noticed it could not be absent-or-present in
output that had never been produced. Filed as a trap.

**I nearly reported two test failures as merge damage.** `pro01-runner-tree` and
`xrev01-node-review` fail on a stubbed pg client rejecting `pg_try_advisory_lock`. My diff is one
file and touches nothing in that path, but "the merge broke them" was the available story. I dated
it instead: reverted my derivation (still failing), then ran the same two suites in the untouched
integration worktree at `3d137d64` (still failing, identically, 2 failed | 14 passed of 16). They
are integration's, not mine and not the merge's. **Cost of dating it: about three minutes. Cost of
guessing either way: a false claim in a merge report, or a round spent debugging someone else's
test.**

## 10. The prediction I got wrong, and why it matters

Round 1 I wrote: *"the `packages/register` → `packages/contract` edge needs row 17 amended."*
Right about the engineering, **wrong about the trigger**, and the difference is the whole finding.

`auditArchitecture` builds its graph from each package's **`package.json` dependencies**, not from
source imports (`tools/orphan-audit/src/index.ts:52-61`). So:

- as shipped, the audit sees **no** `register -> contract` edge, `edgeRowsChecked` stays 28, and
  row 17 needs nothing;
- because `packages/register/package.json` does not declare `@debateai/contract` — yet
  `algorithm-policy.ts` now imports it.

It resolves only because pnpm links every workspace package into the repo-root `node_modules`;
`packages/register/node_modules/@debateai/` holds just `db` and `kernel`. Every other package in
this repo declares what it imports (`serve`, `budget`, both checked). So I have introduced an
**undeclared dependency that is invisible to the audit built to govern exactly this**, and the
correct fix is a coupled pair — declare it AND amend row 17 — where either half alone is wrong.
`packages/register/package.json` is not in my contract, so it is handed up rather than done.

**The general lesson, and it is D56-shaped:** I predicted the audit's *verdict* from the audit's
*subject matter* without reading what the audit *reads*. "The edge exists, therefore the edge
audit sees it" is the same move as "the check is about X, therefore the check examines X". An
audit is defined by its input, not its topic. One `sed -n '50,64p'` settled it — and I only ran
that because the audit came back quiet when I expected noise. **A check that agrees with you when
you expected it to object is evidence you do not understand the check.**

## 11. Contract reach, second instance

Round 1's §7 named a packet whose duty outran its contract. Round 2 hit the same shape from the
other side: the widened contract granted `tools/orphan-audit/**` "for row 17 and only that", which
*presupposes* the package.json edit that makes row 17 necessary — but did not grant it. The grant
was reasoned from my own round-1 prediction, and inherited its error.

This is worth D61's attention because it shows the rule is not sufficient as written. D61 says a
duty naming a file must grant that file. Here the duty named a file (`orphan-audit`) and granted
it correctly; the gap was the *other* file, the one nobody had named because the mechanism was
mispredicted. **A contract derived from a prediction is only as sound as the prediction.** The
cheap guard is the one from §6.1: have the seat verify the mechanism's file set against the tree
and report it *before* the contract is drawn, rather than deriving the contract from a plan.

## 12. Merge-resolution note, for whoever reviews `38f995e1`

Both conflicts were "one side added, the other side edited adjacent" — neither was a semantic
disagreement, and in both cases the resolution keeps both sides whole:

- `apps/runner/src/index.ts` — integration inserted `buildDigestFollowingServeNodes` directly above
  `resolveExpansionDepth`; T1 rewrote the latter's doc comment. Kept the new function verbatim and
  T1's comment; dropped only integration's one-line restatement of that same comment. **No
  executable line from either side was discarded.**
- `packages/budget/src/index.ts` — T1 replaced the literal bound with `ExpansionDepthSchema`;
  integration widened the same object (`panel_member`, `cooldown_site`, `call_sites`, `serve_leg`).
  Kept T1's schema reference and all of integration's fields; dropped only integration's
  `depth: z.number().int().min(1).max(5)` — the literal T1 exists to remove, and the one line where
  the two sides genuinely could not both win.

The reason this was safe to do quickly is that the oracle is an independent check on the half that
matters: if I had kept integration's literal by accident, the oracle would have stayed RED on
`packages/budget/src/index.ts:47`. It went GREEN, which is evidence about the merge, not only
about the register.

## 13. Upgrades, revised after round 2

Round 1's four stand. Two additions, both cheap:

5. **`pnpm lint` should not short-circuit.** Run both audits and report both. As written, one
   long-standing architecture violation makes the source-rule audit unobservable for every seat and
   every gate record in the mission — and it has been red at integration for at least two tips.
6. **A merge-resolution gate.** The mission has `gate-run.sh` for commands and `stamp-check.sh` for
   stamps; a conflict resolution has no record format at all. What a reviewer needs is exactly what
   I had to assemble by hand: per conflicted file, the two sides, which side won per hunk, and the
   confirmation that no executable line was dropped from either. `git merge-tree` already produces
   the conflict set before the merge; a small tool could emit the skeleton and the seat fills in
   the "why". This mission has now had at least two catch-up merges reviewed as prose.

**On the one-prompt goal.** Round 1 was lost to a packet written against the wrong tree; round 2
cost one wrong prediction that a two-line read of the audit would have prevented. Both are the same
failure: **a claim about the tree that was never checked against the tree.** The single highest-value
tool remains the one in §6.1 — verify every path, symbol and mechanism a packet asserts, in the
dispatch worktree, before the seat starts. It would have caught round 1 entirely and the round-2
contract gap as well.

---

# ROUND 3 — the coupled pair

Tip `e8fc0335`. One commit, three files, 5 insertions. Nothing surprising happened, which is
itself the finding: round 2 had already located the defect precisely, so round 3 was execution.

## 14. What the pair cost, and why it was cheap

~12 minutes end to end. The reason is that round 2 handed round 3 an exact two-line diff and a
stated reason for each half. The only new information was the lockfile — which the dispatch had
already anticipated and granted.

**The one thing I did that was not asked:** ran `tests/architecture/scaffold.test.ts`. I grepped
`tests/` for anything asserting the edge table before trusting that a row amendment was invisible
to the suite, found that file, and ran it. It fails 2 of 8 — pre-existing, dated at integration —
but the assertion `edgeRowsChecked === 28` **passes**, which is the cheapest possible confirmation
that I amended rather than added. Had I skipped that grep, a reviewer would have found a red
architecture suite on my branch and I would have had no dating for it.

**The general rule this instance supports:** when you change a DATA TABLE that a tool reads,
grep the test tree for assertions about that table before assuming your change is invisible. A row
count is exactly the kind of thing someone pins.

## 15. Prediction accuracy across three rounds

Worth recording because it says where my judgement was reliable and where it was not.

| Prediction | Outcome |
|---|---|
| r1: no in-contract mechanism could satisfy the outcome | **held** |
| r1: ~6-line change on the right base | **held** (10 insertions / 6 deletions, one file) |
| r1: conflicts with lane/t1 on two files | **held** |
| r1: `GOAL_RULED_LAW_CARRIERS` satisfies the numeric-literal rule | **held** |
| r1: the edge "needs row 17 amended" | **half wrong** — right fix, wrong trigger (§10) |
| r2: t17t9 catch-up conflict-free | untested (still pending) |
| r2: `pnpm lint` still exits 1 after the pair | **held** |
| r3: declared dependency would not move the contract hash | **held** |

The single miss is the one where I predicted a tool's verdict from its subject matter instead of
reading its input. That is the lesson I would most want carried forward, and it is already §10.

## 16. Final note toward the one-prompt goal

Three rounds, one ticket, 10 product lines plus a 5-line pair. The work was never the cost. The
cost was, in order: a packet written against the wrong tree (round 1, ~35 min, zero product), a
mechanism predicted without reading the tool that judges it (round 2, one wrong contract), and
nothing at all in round 3 — because by then every claim had been checked against the tree.

**The pattern is monotonic: cost fell as the ratio of verified-to-assumed claims rose.** The tool
in §6.1 — verify every path, symbol and mechanism a packet asserts, in the dispatch worktree,
before the seat starts — would have eliminated rounds 1 and 2's overhead entirely. It is the same
conclusion D41, D45 and D46 reached about comparators, gate records and campaign indices: a rule
stated in prose is checked inconsistently; a rule shipped as a tool is checked every time.

---

# ROUND 4 — two test-only items, and one instruction I refused

Tip `2d400dd5`. One commit, +10 −1, test-only. ~40 minutes. F-GATE-1 fixed; F-T1B-5 answered
with two mutant transcripts and no code change.

## 17. The refusal, and why it was the whole value of the round

The dispatch told me what to do in the branch I actually landed in: *"If ONLY the planted control
kills it — add the real-site pin and re-run until the real site kills it."* Only the planted
control killed it. So the instruction was live, and I did not follow it.

**Because there is no real site to pin.** I ran the oracle's own lexer over every shipped file
under both rules and no file's verdict differs. A "real-site pin" would therefore assert something
true under the rule AND under its mutant — a test that cannot fail for the reason it exists. It
would have looked like compliance, produced a green campaign row, and recorded the refinement as
"pinned by real code" when nothing about real code constrains it. That is a *worse* outcome than
the open ticket, because an open ticket is visible and a false green is not.

**This is the first time in four rounds that following the packet exactly would have made the
record worse rather than merely wasted time.** Rounds 1–3 cost effort; this one would have cost
truth. D58 says the seat chooses the mechanism because the seat is the one reading the code — the
corollary this round adds is that a remedy is part of the mechanism, and a remedy premised on a
fact the seat can check is the seat's to refuse.

## 18. The measurement that made the refusal safe

I would not have been entitled to refuse on reasoning alone. What made it evidence:

1. **Two mutants, not one.** "The conjunct rule" turned out to be two separable claims — the
   boundary, and its `at ANY bracket depth` refinement. The boundary IS real-code-pinned (m12
   kills both whole-tree assertions and names `apps/ui/app/new/page.tsx:73`); only the refinement
   is not. Reporting "the conjunct rule is fixture-pinned" without that split would have been
   true-sounding and wrong.
2. **A validated instrument.** My scanner returned "no real file differs" — which is also exactly
   what a broken scanner returns. So I fed it the input where the difference is known to exist
   (m10's own control string) and confirmed it saw it: `current=0 shallow=1`. **A negative result
   from an unvalidated instrument is not a measurement**, and I nearly shipped one.

Both are filed as traps. (2) is the one I would most want every seat to adopt: it costs one extra
run and it is the difference between "I found nothing" and "there is nothing".

## 19. What I nearly got wrong

**I nearly read m11's `1 failed | 45 passed` as a healthy kill.** That summary line is identical
in shape to a real-code kill, and the D24 transcript records the command's exit, not the identity
of the assertion. Only reading the `FAIL >` test NAME distinguishes a fixture defending a fixture
from real code defending a rule. A mutation campaign can report full coverage while every kill is
planted — which is, almost exactly, the finding F-T1B-5 was opened to record. The ticket was right
about its own subject and the mechanism that hid it is general.

## 20. Cheap things that paid this round

- **Reading the ticket's own history before running anything.** F-GATE-1 was already diagnosed
  down to the two commits; I re-derived nothing and the fix took minutes. A well-diagnosed ticket
  is worth more than a well-specified one.
- **Checking the oracle's citations against the file.** Not asked for. It surfaced three
  documentation findings, one of which (`:614`, "line-scoped … `kindOfCeilingLiteral`") is prose
  contradicting the code in the same file whose ticket is about prose contradicting code. Grepping
  a comment's claims against the thing it cites costs seconds.
- **Committing item 2 before starting item 1.** `mutate.sh` refuses a dirty tree (D24 ADDENDUM-2).
  Had I carried the t16 edit uncommitted into the mutant work, the first mutant would have aborted
  and I would have debugged the harness instead of the rule.

## 21. Upgrades — one new, and the standing one restated

7. **Mutant records should name the KILLING ASSERTION, not just the exit.** `mutate.sh` already
   captures the output; `mutant-index.py` already classifies "failed an assertion" versus "threw
   before one". The missing column is *which* assertion — and specifically whether it is one that
   reads real files from disk. That single column would have made F-T1B-5 visible at index time
   rather than a round later, and it generalises to every campaign this mission has run.

**The standing one, now four rounds old.** Verify the packet's asserted facts against the tree
before the seat starts. Round 1: a symbol that was not there. Round 2: a mechanism predicted
without reading the tool that judges it. Round 3: nothing — every claim had been checked. Round 4:
a remedy premised on a real site that does not exist. **Three of four rounds carried exactly one
unchecked claim each, and each time the check was seconds and the consequence was a round or a
falsehood.** The tool in §6.1 remains the highest-value fix in this file.
