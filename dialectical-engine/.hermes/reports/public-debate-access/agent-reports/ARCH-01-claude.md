# ARCH-01 self-report — public-debate-access — Claude, 2026-08-29

## DISAGREEMENT SCHEMA-SPLIT DESIGN, addendum (filed same day, ticket `t_83df0d9c`)

**SKILLS LOADED this round:** `heartbeat-protocol`, `heartbeat-architecture`.

**Applying the previous round's lesson forward, not just citing it.** The brief said plainly that
this round exists to test whether the compile-time lesson from `t_cc34ba78` actually changed how I
work, not just what I write in a DECISIONS entry. I ran a genuine both-halves blast-radius sweep
before proposing anything — 15 runtime call sites and 13 compile-time type-position sites, every
one traced to its actual content, not categorized by how risky its name sounded. The one file that
looked highest-risk by pattern (`s8-publication-http.test.ts:41`, a direct `: PublicDebate` literal)
turned out to be safe only because I read it field-by-field and found it omits `nodes` entirely —
exactly the kind of thing "looks risky" pattern-matching would have either wrongly flagged or,
worse, wrongly cleared without checking.

**The design choice that mattered most: derive, don't duplicate.** Choosing `.omit().extend()` over
a hand-written `PublicNodeSchema` was not a stylistic preference — it's the direct reason this
round's compile-time blast radius came back at zero instead of one. Tightening the SHARED schema
(what Row 9 did, correctly, for `stranger_restatement`) put both the owner and public inferred types
through the same narrowing, and one owner-side fixture broke as a result. This design deliberately
leaves `NodeSchema`/`Node` completely untouched and introduces a new derived schema instead — I want
to be honest that this isn't a deeper insight so much as noticing that THIS field's redaction is
call-site-conditional (owner side genuinely needs the wide shape) in a way `stranger_restatement`
never was, and picking the mechanism that matches that difference.

**The narrow-vs-wide ruling was the part I spent the most time on, and I want to record why.** It
would have been easy to rule wide by default — "close the whole class while I'm here" is this
mission's own repeated lesson, and ruling narrow risks reading as the same mistake again. I did not
rule narrow to avoid work; I ruled narrow because investigating the wide option surfaced a REAL
asymmetry (`LabeledNumberSchema`'s conditional `redactSource` flag, shared with `EdgeSchema`) that a
wide split would have to resolve non-trivially, and because `disagreement`'s unbounded-record type is
a genuinely different KIND of exposure than the five bounded-string sentinel fields, not merely a
smaller version of the same risk. I tried to make that argument checkable rather than asserted — the
DECISIONS entry names the specific schemas a wide version would need and the specific asymmetry it
would have to encode, so a reviewer can judge whether that argument holds without taking my word for
it.

**A near-miss in my own step, caught by the balance check, worth naming precisely.** I wrote the
entire acceptance-test specification in prose without ever using the literal `**Acceptance test:**`
marker this file's balance invariant depends on — not a formatting slip like the `Category:` vs
`Category (...):` mistake from earlier rounds, but a genuinely MISSING marker, invisible until the
mechanical grep count caught it (22 Category lines against 21 Acceptance lines). This is a different
failure shape than the prior near-misses: those were "wrote the right marker, wrong format"; this was
"described the acceptance thoroughly enough that I forgot to actually mark it as one." Fixed
immediately by inserting the proper marker at the exact sentence that already stated the command.

**What I did not do.** Wrote no product code — `packages/contract/src/index.ts` and
`apps/api/src/publications.ts` are specified precisely enough for the coding seat to implement
without further judgment calls, not edited here. Verified the `.omit().extend()` mechanism and its
exact rejection/acceptance behavior with a scratch script against the real Zod 4.4.3 in this repo,
deleted after, `git status --porcelain` clean before and after. Disclosed the wide option's real cost
to V explicitly, per the brief's own instruction, rather than either silently picking narrow or
silently gold-plating to wide without flagging the tradeoff.

## BLAST-RADIUS REFUTED, addendum (filed same day, ticket `t_cc34ba78`)

**SKILLS LOADED this round:** `heartbeat-protocol`, `heartbeat-architecture`.

**The mistake, plainly, in my own words, not the brief's.** I wrote "measured zero" and I meant it —
I did grep every real call site and trace every producer, and none of that work was fabricated or
lazy. But I asked the grep one question (who parses this at runtime) when the change I was
measuring the blast radius OF has two effects, not one: `.strict()` narrows a runtime parser AND a
compile-time inferred type, because they're the same Zod schema producing both. I checked the
runtime half thoroughly and never asked whether the compile-time half had its own, completely
separate set of consumers — fixtures, in this case, which never call `.parse()` at all and were
therefore invisible to every grep I ran. A "measured, not assumed" claim that only measures half of
the actual mechanism is not more honest than an assumption; it's an assumption with better
production values.

**Why this one stings more than most of this mission's other misses.** Most of this mission's
"checking half of X" defects (the for-loop finding, the escaped-pipe class) were about SYNTACTIC or
MECHANICAL incompleteness — reading half a diff, running half a command. This one is about not
having the right MENTAL MODEL of what `.strict()` actually does. I know, and have always known,
that Zod schemas produce both a validator and an inferred type from the same declaration — this
isn't a fact I was missing. I just didn't apply it at the moment the blast-radius question was
actually being asked, because "does this break anything" defaulted, in my head, to "does this break
at RUNTIME" without my ever noticing that substitution happened. That is a more concerning failure
mode than a missed grep pattern, because there's no obvious mechanical fix for "apply the fact you
already know" the way there is for "run the loop over every element."

**The verification for the fix itself tried to hold to a higher bar than the mistake did.** I didn't
just assert the cast would compile — I wrote an isolated minimal reproduction of the excess-property
rule first (does `as` bypass it, checked against a toy type, confirmed yes), THEN applied the same
pattern to a full reproduction of the real fixture against the REAL `.strict()`'d contract in the
seat's own worktree, ran both the broken and fixed forms, and separately confirmed the runtime
object still carries all three keys after the cast (so the leak-prevention test itself needs no
change). Three separate empirical checks for one two-line fix, because the whole point of this
round is that reasoning about type-checker behavior from memory is exactly what failed the first
time.

**What I did not do.** Did not touch the s01-strict worktree — the tsc verification ran from a
scratch file written to and deleted from the main repo root, importing the worktree's contract
source read-only; `git status --porcelain` confirmed clean in both trees before and after. Did not
edit `tests/unit/s8-publication.test.ts` — specified the exact cast and import addition for the
coding seat's own ticket. Did not treat this as a defect in the coding seat's work anywhere in the
writeup — its RED/GREEN/three-run results and its separation of the pre-existing database-test
failure were all correct, and said so explicitly rather than leaving it to be inferred.

## PLAN RECONCILIATION, addendum (filed same day, tickets `t_d40a86f1`/`t_ddee6473`)

**SKILLS LOADED this round:** `heartbeat-protocol`, `heartbeat-architecture`.

**What made this round different.** Every prior round this mission, divergence was something I
found by comparing a claim against evidence. This round, the divergence was between two versions
of MY OWN FILE — one I had been actively editing for five rounds, one I had never looked at because
nothing told me it existed. Diffing my own document against a stranger's copy of it, not knowing in
advance which parts were mine, is a different kind of check than anything else this mission has
asked for, and it is worth naming as its own category rather than folding it into "another stale-
record fix."

**The actual mechanics of a correct 2-way reconciliation without a saved base.** With no dispatch-
time snapshot preserved, I could not run a real three-way merge — I had to look at each diff hunk
and decide, from memory of my own five prior rounds' work, which side was "newer" for that specific
paragraph. That worked here because I could name the round that produced almost every remaining
hunk (CLASS-FIX, STALE-RECORD FIX, FOUR-ITEMS bundle) — but I want to be honest that this is a
fragile method. A reconciler without my specific memory of this mission's last six rounds would
have had to guess, or would have needed to read every DECISIONS.md entry chronologically to
reconstruct the same picture I already had loaded. That fragility is the actual argument for the
standing check I recommended, not just an abstract "process improvement" — I personally got lucky
that the diff landed on a session that still remembered writing every piece of it.

**Verification discipline held here specifically because the cost of skipping it was so visible.**
The brief itself said "verify by grepping, not by assuming the edit worked" — and I did the byte-
identical diff check on the carried-over B3 block specifically because "close enough" on a
blind-lens-validated, already-reviewed paragraph is not actually close enough; a single dropped
word in the miss-list would have been a worse outcome than not attempting the merge at all, since
it would look correct while quietly weakening exactly the claim B3 exists to bound honestly.

**What I did not do.** Did not touch either worktree — read-only inspection only, confirmed via
each worktree's own `git status --porcelain` before treating their content as ground truth. Did not
edit the test file for `t_ddee6473` — specified the corrected PROPERTY comment text in DECISIONS.md
for the Router to route, per the brief's own instruction that the test file is a coder surface. Did
not comment on or investigate the unrelated S02 product-file changes visible in the main working
tree's `git status` during this round's scope checks — clearly a separate, concurrent process (S03's
own `page.tsx` shows zero pending changes, confirming S03 itself is cleanly merged) and squarely
outside this round's S03-only scope.

## `.strict()` STEP, addendum (filed same day, ticket `t_a00a162e`)

**SKILLS LOADED this round:** `heartbeat-protocol`, `heartbeat-architecture`.

**What this round actually required.** V ruled; my job was execution, not argument — a
different posture than most rounds this mission, where I was usually the one weighing options.
The discipline here was staying inside that posture: author the step correctly, don't relitigate,
don't add scope V didn't ask for.

**The RED-before-GREEN verification was the most mechanically careful thing I did this round.**
I could not touch product code, so "verify GREEN by running it" required reconstructing
`NodeSchema` field-for-field in a scratch script, importing every real sub-schema live rather than
guessing at their shapes, changing only the one line under test. This is more work than asserting
"Zod's `.strict()` obviously rejects unknown keys," but the brief's own framing — three attempts to
build a valid fixture, an invalid fixture proving nothing — is exactly this mission's recurring
lesson, and I had no standing to exempt myself from it just because the underlying mechanism
(schema strictness) is well-understood in the abstract. Reused an ALREADY-proven-valid fixture from
`tests/unit/contract.test.ts` rather than building one from scratch, specifically to avoid
reproducing the "three attempts" cost the brief warned about.

**The blast-radius measurement surfaced one near-miss worth naming.** `tests/unit/s8-publication.
test.ts`'s fixture with `secret_extra`/`owner_note` under `stranger_restatement` LOOKS exactly like
something `.strict()` would break — extra keys, typed as `Answer`. It doesn't, because
`publish()`'s input is duck-typed and never schema-validated; only its freshly-projected output is.
I traced this to source rather than pattern-matching on "has extra keys therefore breaks," which
is the same discipline this mission has demanded of every acceptance-command fix this session — a
fixture or a caller LOOKING risky is not evidence; tracing what actually calls `.parse()` is.

**A third near-repeat of the bold-marker mistake, caught inline again.** Wrote `**Category:**`
instead of `**Category (...):**` on the new step, same slip as the FOUR-ITEMS round's S02-C1-6 and
an earlier round's S01/S02 breaks — caught immediately by running the exact balance check before
calling the step done, not after. Recording this a third time because the pattern itself is now
data: the mistake keeps happening at the exact same moment (writing a new step's Category line
fast, then fixing it fast) rather than stopping. The reflex to check is solid; the reflex to get it
right the first time is not, and three instances is enough to say so plainly rather than treat each
one as isolated.

**What I did not do.** Did not touch any product file — the scratch verification scripts (both the
RED probe re-run and the GREEN reconstruction) were copied into the repo root temporarily, run, and
deleted, `git status --porcelain` confirmed clean before and after each. Did not touch
`.worktrees/s02-code` (read-only checks only, confirmed via its own `git status --porcelain` showing
only the coding seat's own pre-existing changes, none of mine). Did not re-litigate V's ruling —
the brief was explicit that the decision is made, and nothing in this round's writeup treats it as
open.

## FOUR-ITEMS BUNDLE, addendum (filed same day, tickets `t_5d2a4e79`/`t_63f6e7e6`/`t_7539734e`/`t_899df0d3`)

**SKILLS LOADED this round:** `heartbeat-protocol`, `heartbeat-architecture`.

**Item 1, the one that matters.** S02's correct refactor broke a standing assertion in a file no
slice owns. Ruled the instance by MERGING two of the brief's three offered options rather than
picking one: narrowly widened S02's write surface to exactly the one loop the refactor actually
affects (`s8-publication-contract.test.ts:168-174`, not the whole file — S04 keeps its read-only
relationship to lines 120-138 untouched), and specified the concrete fix (concatenate the split
composition's two files for the `apps/ui` iteration only). Rejecting the refactor was considered
and ruled out on the merits, not by default: the assertion was using file-location as an incidental
proxy for "the disclosure renders somewhere," and that proxy broke, not the actual requirement.
Verified the fix would work by SIMULATING it against the real worktree files before writing it
down — all five checks pass against the concatenated content, including the bonus: the same fix
extends forbidden-string coverage to the new client component, which the old single-file check
never scanned at all.

**The class ruling is the one I take most seriously.** "Disjoint write surfaces don't imply
independent effects" is a genuinely new axis of failure this mission hadn't named before, and I
answered it concretely: a required addition to every slice's Single-writer check — grep the
standing test suite for references to each write-surface file, and for every hit, check EVERY
target a `for` loop iterates, not just the one that seems relevant. I did not present this as
someone else's oversight. My own S02/PLAN.md had already performed HALF of this exact check for
this exact test block, before this round, and drew a true conclusion (`web/`'s iteration is
unaffected) that answered a narrower question than the one that mattered (does ANY iteration
break), then stopped. A partial check that looks complete is arguably worse than no check, because
it reads as diligence rather than as the gap it is.

**A near-miss, self-caught.** Writing S02-C1-6's Category line, I dropped the parenthetical
citation format (`**Category:**` instead of `**Category (...):**`) that this file's balance
invariant depends on — caught immediately by re-running the exact balance check rather than
assuming the edit was clean, the same reflex noted in an earlier round's self-report. Worth
recording again: this is now the third time this specific mechanical slip has happened across this
mission (twice fully landed and caught after the fact, this time caught inline) — the reflex is
holding, but the underlying habit (writing the bold-marker line fast, before checking its exact
required shape) has not gone away just because the catch has gotten faster.

**Items 3 and 4, ratified, not rubber-stamped.** Both corrections were exactly what they claimed
to be, but I did not take either on the ticket's word: re-ran t_7539734e's corrected command against
the coding seat's actual finished worktree (clean OK/exit-0, not just "no syntax error in the
abstract"), and re-read both `PublicDebatePageClient.tsx` and `PublicHonestyDrawer.tsx` for
t_899df0d3 to confirm the corrected oracle's `role="dialog"` element genuinely exists, genuinely
gates on the same state the trigger button sets, and genuinely discriminates the failure mode the
original oracle couldn't see. Applied t_7539734e's ratified fix to the live PLAN.md by hand, since
the coding seat's worktree copy had been synced before my own CLASS-FIX round and a wholesale merge
would have clobbered that round's work — a small but real reminder that "ratify a worker's in-place
correction" sometimes means re-deriving the edit against a moving base, not applying their diff.

**What I did not do.** Did not touch either worktree beyond read-only inspection (`git status
--porcelain` clean before and after in both). Did not write or edit any product file or test file —
S02-C1-6 describes the exact new test body but leaves it for the coding seat's own future ticket.
Did not extend the new standing-test-blast-radius check to S01 or S04's own write surfaces this
round — that is the Router's ticket to open, per the brief's own instruction, not mine to
pre-empt.

## CLASS-FIX ROUND 1 (the fifth variant came back), addendum (filed same day, tickets `t_7539734e`/`t_b81ee2b2`)

**SKILLS LOADED this round:** `heartbeat-protocol`, `heartbeat-architecture`.

**The finding, plainly.** V waived the rework cap in Row 6 specifically to close a CLASS, and I
reported that round closed. It wasn't. My very next round (REV-05/B2, same file even) introduced
a fresh instance of the identical generating condition — a markdown-escaped pipe surviving into a
raw JS operator, inside a table cell — because I fixed the INSTANCES round 4 found and never
removed the CONDITION that produces them. That is as direct a counter-example to my own claim of
closure as this mission has produced: not a new defect shape discovered by adversarial review, but
the SAME shape, recurring in my own next round's own output, in the same file, one table over.

**Why the round-4 fix looked complete and wasn't.** I checked S02/S03/S04 for the ONE variant I'd
just found (`vitest -t`'s JS regex) and reported them clean. That check was real, not fabricated —
but it answered a narrower question than the one that mattered. "Does this specific known shape
exist elsewhere" is not the same question as "can this file's authoring mechanism produce this
shape again," and I reported the narrow answer as if it settled the broad one. The sweep this
round found the broad question's answer was no: `S01-C4`, sitting in the SAME table as the three
sites I fixed in round 4, one row below them, had the same generating condition (a raw pipe forced
into a table cell) wearing a different interpreter (a shell pipe, not a JS regex) — proven broken
by extraction and execution, not assumed. I had never run it; round 4's own "run every command"
sweep ran what existed then, correctly, and could not have caught a command's NEXT edit.

**A mistake inside this round's own fix, self-caught.** Drafting the replacement for `S03-C2`'s
`curl | grep` command, I initially unescaped BOTH pipes — the real shell connector AND the
grep-internal alternation — producing `grep -c "Sign in to start|Your debate workspace|tabEmptyHint"`.
That is wrong: unescaped, BRE `|` is a literal character, not alternation, and the command silently
stopped matching (confirmed: it returned `0` against a live server response that plainly contained
one of the three target strings). I caught this only because I ran the corrected block before
writing it down as fixed, not because I reasoned it out first. This is the same lesson the whole
mission keeps teaching from different angles: "unescape the pipe" is not one operation, it is a
per-site judgment call about what each specific pipe means to its specific interpreter, and getting
it wrong is exactly as easy in the fix as it was in the original defect.

**What actually closes the class, argued and applied, not just proposed.** No executable command
lives in a table cell — full stop, not "unless the escape happens to be safe for this command's
language." `S03-C2`/`S03-C3` moved to labelled fenced blocks this round; `S01-C4` likewise, in
`S01/PLAN.md`, since the sweep proved it broken and this PLAN's own scope covers that. `S03-C1` was
deliberately left untouched — the coding seat owns that exact cell right now, fixing the instance
REV-05 found, under Row 7 authority pending my ratification — and I recorded a follow-up: it should
also move to a fenced block once ratified, or the table keeps exactly one bare command and the
class keeps one foothold.

**What I did not do.** Did not touch `.worktrees/s03-code`, any product file, or any test file. Did
not re-fix S03-C1's own pipe (the coding seat's, in progress). Did not extend the fenced-block
restructuring to S02 or S04 — their sweep came back clean (every `\|` in both is grep-internal
alternation, confirmed by running it, not read), and the round's scope authorizes touching a PLAN
only where the sweep PROVES it broken.

**Balance, checked:** S03 stayed 13/13, S01 stayed 20/20 — this round changed command SHAPE, not
step COUNT, so neither should have moved, and I verified rather than assumed that.

## REV-05 FINDINGS, ROUND 1 (B2, N1), addendum (filed same day, tickets `t_57891ca5`/`t_a9d1deeb`)

**SKILLS LOADED this round:** `heartbeat-protocol`, `heartbeat-architecture`.

**What this round actually was.** Two findings from a blind lens against S03's already-shipped
code, both against my OWN Architecture decisions, not a coder's fidelity to them — a different
flavor of self-correction than most rounds this mission: the coding seat "implemented exactly
what it was told" (the Router's own words), so there was no implementation bug to find, only a
design decision to re-examine under adversarial pressure it hadn't faced before.

**B2, plainly.** I wrote `role="tablist"`/`role="tab"`/`aria-selected` onto plain navigation
links, defended it with an argument about generic keyboard reachability, and never checked that
argument against the ARIA tab role's actual behavioral contract (tabpanels, `aria-controls`,
arrow-key roving tabindex). That is the same shape of mistake as every prior round's defect in
this mission — a signal (here, an ARIA role) asserting something (full tab-widget behavior) that
nothing behind it actually provides — now surfacing in a THIRD distinct technical domain beyond
test-filtering and field-redaction/line-numbering: markup semantics. The exclusive-provenance
invariant holds here too, restated for accessibility: an ARIA role's PASS (a screen reader
announcing "tab") must trace to actual behavior matching that announcement, or the role is a
false claim, and Rule 1 says a false claim is worse than no claim. Fixed by dropping the role
entirely for `aria-current`, which claims only what the markup actually does. I found no citation
defending the original choice, so I did not manufacture one — Option 3 is recorded as ruled out
for lack of evidence, not argued down.

**N1, plainly.** I wrote decision 4 (the banner is not part of any tab's switched surface) and
decision 5 (the banner satisfies R3 for the Your Debates tab) in the same document, and did not
notice they contradict each other until REV-05's matrix forced the click-by-click accounting.
That is a cheaper category of miss than B2 — an internal consistency check I could have run on my
own prose without any external review — and I should have run it before handoff the first time.
Fixed with one new step, S03-C2-3, rather than re-opening the SPEC: SPEC R3's carve-out for
logged-out visitors was already correct and is not what REV-05 found wrong.

**What I did not do.** Did not touch `.worktrees/s03-code`, `tests/unit/pda-s03-keyboard-
accessibility.test.ts`, or any product file — both fixes are PLAN.md prose describing markup for
the coding seat to implement on separate future tickets, per the brief's own instruction and this
round's scope. Did not open a V DECISIONS row for N1, having concluded (and argued in
DECISIONS.md) that it is a HOW question already answerable within Architecture's own authority,
not a WHAT question SPEC R3 left open.

**Balance and scope, checked:** `S03/PLAN.md` acceptance/category markers moved from 12/12 to
13/13 (one new step, S03-C2-3) — checked mechanically, not assumed, given this exact bold-marker
convention has bitten me twice before in this mission. `git status --porcelain` clean on all
product/test paths and `.worktrees/s03-code` before this handoff.

## S02-C5 CORRECTION ROUND, addendum (filed same day)

**SKILLS LOADED this round:** `heartbeat-protocol`, `heartbeat-architecture`.

**This is the sixth or seventh instance of the mission's core defect
family, now in a slice I had not touched before today (S02), which is
itself informative: the family is not specific to S01's redaction logic
or to vitest's regex semantics — it recurs anywhere an acceptance command
is written without first asking "what OTHER state of the world could
produce this exact signal." A directory scan for forbidden strings is a
different mechanism from a `-t` filter or a line-numbered `sed`, and it
carried the same shape of defect anyway.**

**What I did right this round, worth keeping:** I did not implement the
coding seat's proposed fix. The brief was explicit that the category
decision was mine, and the seat's proposal (assert-then-scan) was a
reasonable ENGINEERING answer to "how do I make this catch the bug" but
not an authorized answer to "what KIND of claim should this step make."
Before writing anything, I checked whether the seat's own justification
for its proposal held — it didn't fully; the citation naming which OTHER
steps already guaranteed the artifact's existence (`C2-4/C2-5/C5-2`) was
wrong, and I would have propagated that error forward if I had trusted it
and moved straight to picking a shape. Reading `C2-4`/`C2-5`/`C5-2`
myself, then finding the REAL guarantee lives in `C1`'s own render test
(and confirming it's genuinely RED today by running it against the
parked worktree, not assuming), is what let me argue the category
decision from evidence rather than from the ticket's framing.

**A concrete self-correction this round, small but the same shape as last
round's:** I again wrote `**Acceptance test (guarded, ...):**` with the
annotation inside the bold marker, and again broke S02's own 22/22
balance invariant — caught immediately this time, by habit rather than
by surprise, since I ran the balance check as a matter of course before
considering the edit finished, exactly per last round's own
recommendation to myself. Recording this not because it is new
information but because it is evidence the recommendation actually
changed my behavior, not just my prose — the same mistake happened
again, but the DETECTION was now reflexive rather than discovered.

**The class sweep (S01/S03/S04) was a genuine, bounded piece of work,
not a formality:** confirming that S02-C5-1 is the ONLY member of this
specific shape (recursive directory scan anchored to a root rather than
an artifact) required checking not just for the same LITERAL pattern
(`grep -r`) elsewhere, but for a structurally similar risk in every OTHER
grep-based acceptance in three other PLAN files — including verifying,
empirically, that `grep -c` on a missing single file behaves differently
(no stdout output at all) than on an existing file with zero matches
(prints `0`), which is WHY the mission's other single-file `grep -c`
checks were never at risk of this same conflation even though I had
never explicitly reasoned about it before this round. A "clean" report
needed that positive check, not just an absence of matches to the
original defect's literal grep pattern.

## REDACTION-CORRECTNESS thread, ROUND 3 OF 3 — FINAL, addendum (filed same day)

**SKILLS LOADED this round:** `heartbeat-protocol`, `heartbeat-architecture`.

**Closing this thread at 3 of 3.** This is the round I would point to if
asked which finding, across the whole mission, actually taught me
something I did not already believe I knew. I wrote "the redacted set is
an input to the rule" as a description of round 1's OWN mechanism at the
time — `node.provenance_ref` became redacted DURING round 1's sweep, not
before it — and I did not notice that this made the rule self-referential
in a way that required iteration. I evaluated every field once, against
the set I started with, and treated "I checked every field" as
equivalent to "I found the fixed point." Those are not the same claim,
and this round is the proof: `base_score.source` was genuinely, honestly
NOT in the redacted class at the moment I checked it in round 1 — the
sweep was not sloppy, it was INCOMPLETE BY CONSTRUCTION, because a single
pass through a recursive rule cannot be complete regardless of how
carefully each field is examined.

**CAUSE, stated as precisely as I can:** I have applied "trace by value
provenance, not name" correctly, twice now (rounds 1 and 3), and gotten
it right both times as a STATIC classification exercise. What I had not
built into my own process was the recognition that a classification pass
over a mutually-referential set (fields whose risk depends on OTHER
fields' redaction status) needs a CONVERGENCE CHECK, the way a
fixed-point computation does in any other domain — I know this pattern
from other contexts (dataflow analysis, cache invalidation, dependency
resolution) and did not recognize its shape here until the brief named
it explicitly. That is the actual gap: not missing a rule, missing a
PROCEDURE class I already had available and did not reach for.

**PRICE:** one round, no retries, but real — a second live probe had to
be constructed and run by the Router before this was caught, meaning the
mission absorbed a second full reproduce-trace-fix-verify cycle for what
is, in retrospect, the same underlying oversight (evaluate once, declare
done) as the presence-arm mistake from the ACCEPTANCE-COMMAND thread's
round 3-into-4 arc. Two different threads, two different technical
domains (test filtering vs. field redaction), the same shape of mistake:
write a correct rule, apply it once, ship the output of that one
application as though it were the fixed point.

**What I did differently this round that I should keep doing:** after
finding `base_score.source`, I did not stop at fixing that one field. I
explicitly asked "does redacting THIS field change what else is now in
the class" and ran a THIRD pass to check — which found nothing, but the
value was in RUNNING the check, not in trusting that two passes were
probably enough. I also deliberately checked for the mirror-image error
(over-redaction: does `edge.strength.number.source` also need touching)
rather than reflexively applying the same fix to every reachable site of
a shared function, which is what round 1's own precedent would have
suggested by pattern-matching alone. Tracing `edge.strength.number.source`
to `StrengthSource`, an enum, and confirming it is genuinely different
from `judgement.source_ref`, took real time and found nothing — a
negative result, but the RIGHT kind of check to run before writing code
that would have deleted legitimate content for no security reason.

**Recommendation for `heartbeat-architecture`, distinct from rounds 1 and
2's:** any classification rule whose criterion references "the already-X
set" (already-redacted, already-approved, already-anything) should be
flagged, at the moment it is FIRST STATED, as requiring a fixed-point
application — not discovered as a gap two rounds later when a probe
catches the first missed instance. This is a general property of
self-referential rules, not specific to redaction; the next mission that
writes a rule shaped like this should get the "state your pass count"
requirement for free, in the rule's own first draft, rather than earned
the hard way as this one was.

## REDACTION-CORRECTNESS thread, round 2, addendum (filed same day)

**SKILLS LOADED this round:** `heartbeat-protocol`, `heartbeat-architecture`.

**This is now the SIXTH round this mission where the defect this seat is
fixing was, in part, this seat's own doing.** Round 1's full-projection
remedy — correct, and I still believe it was the right shape — is exactly
what expanded `publications.ts` far enough to move S01-C2-1's own
acceptance line off target. I did not cause the S01-C1 relocation (that
was decided round 0), but I compounded it: two of my own PLAN mandates,
landed different rounds, moved the same file in the same direction, and
neither acceptance test was written to survive either change, let alone
both. The brief's framing — "an acceptance whose correctness depends on
the file not changing, whose purpose is to verify the file did change" —
is a description of something I built, twice, without noticing the
tension between the two builds.

**A concrete near-miss THIS round, worth recording because it is exactly
the kind of thing this thread's own family of bugs is about:** while
converting three acceptance lines to add a round-2 explanation inline, I
wrote the explanation INSIDE the `**Acceptance test:**` bold marker
(`**Acceptance test (round 2: ...):**`), which broke this PLAN's own
mechanically-checked invariant — `grep -c '^**Acceptance test:**'` must
equal `grep -c '^**Category ('` — from 20/20 to 17/20. I caught it myself,
immediately, by running the SAME balance check I run after every batch of
edits this mission, before treating the round as done. I am naming this
not because it is a large mistake (it took one command to catch and one
edit each to fix) but because of WHAT it is: a self-inflicted instance of
"a small, well-intentioned text change silently breaks a mechanical
contract nobody re-checks by eye." That is this entire six-variant
family's shape, at the smallest possible scale, caught only because the
balance check is now a reflex rather than a step I remember to do.

**What this round cost:** one round, no retries, but required an
UNUSUALLY thorough sweep — the brief's own table sampled 6 of 8 fixed-
range citations, and finding the other 2 (plus discovering the "MEASURED
ground truth" section's own separate, dated drift, which is real but not
one of the 8) meant grepping every `sed -n`/`file:line` citation in all
four PLAN.md files, not just the ones named. That sweep also surfaced a
genuine discrepancy with the brief's own table (the `252,260` row, which
this seat's own re-run found still accurate, contradicting the brief's
"broken" label) — reported plainly rather than "fixed" against a claim
that would not reproduce, consistent with this seat's standing practice
of re-verifying a brief's enumeration rather than trusting it as
exhaustive or infallible.

**Recommendation, distinct from round 1's:** a PLAN that anchors
acceptance criteria on line numbers should be treated as carrying a
STANDING LIABILITY equal to however many future PLAN mandates are likely
to touch the same file — this mission's own S01/PLAN.md accumulated 8
such liabilities across 6 rounds, most added by THIS seat, without
anyone (including this seat) noticing the accumulation until a Router
measurement forced the count. A cheap structural fix for future missions:
`heartbeat-architecture` could require that any acceptance test citing a
specific line number be flagged at WRITE TIME (a lint-style self-check
before the round closes: does this PLAN contain `sed -n '[0-9]`-shaped
acceptance text?) rather than discovered later by a seat that has to
sweep the whole file after the fact.

## REDACTION-CORRECTNESS thread, round 1, addendum (filed same day)

**SKILLS LOADED this round:** `heartbeat-protocol`, `heartbeat-architecture`
(both already loaded this session).

**The defect this round found is a repeat of a mistake I already named in
my own ledger receipt earlier today, one thread over.** Today's earlier
receipt said the classification I wrote in round 1 (B1) — "COPIED-AND-FLAGGED"
for `provenance_ref` because it is "not action-granting by name unlike
`*_handle` fields" — was exactly the kind of NAMED-LEAD reasoning spine
item 16 warns against. I wrote that classification myself, in the SAME
mission, before I had fully internalized the rule I was already quoting
back at other seats. A Grok blind lens asked to CONSTRUCT a leak against
my own table found one on the first try: for edges, `provenance_ref` is
`replay_handle`, verbatim, under a different producer call. The two
findings — round 3's presence-arm mistake and this one — are the same
shape: I wrote a rule correctly in prose and then produced an artifact
(a test pattern; a classification table) that violated it, because I
checked the RULE against existing content but not against the NEW content
I was writing in the same sitting.

**What this round cost:** one round, no retries, but a wide blast radius
— 6 field classifications re-derived, 3 redaction functions rewritten
from spread to full projection, 2 existing tests' assertions corrected
(they asserted the OLD, now-wrong classification), 1 new test step
written, and 1 now-stale cross-reference found in S04's PLAN (flagged,
not fixed — out of this round's file scope). The reproduction alone
required tracing six different fields to their actual SQL/producer
call sites across `packages/serve`, `packages/providers`,
`packages/memory`, and `packages/db` — considerably more research than
any single prior round in this mission, because "trace by value
provenance" cannot be done by reading the schema file alone the way
"trace by name" could.

**What I nearly got wrong in the trace itself, worth naming:** my first
hypothesis for `maker_lineage.provider_ref` was that it was ALSO a secret
(reasoning: "another opaque ID next to a bunch of already-risky fields,
better safe than sorry"). Tracing it properly — following `providerRef`
through `packages/providers/src/index.ts` to `apps/runner/src/dev-provider-panel.ts`'s
literal example values (`"development:claude-cli"`) — showed it is a
static deployment-config identifier, not a per-call secret, and reversed
that hypothesis. I flag this because the brief's whole point this round
was "don't classify by assumption, trace the producer" — and my first
instinct, even while executing that exact instruction, was still a named
guess ("looks risky, sits near risky fields") until I actually ran the
grep. The rule is easy to state and still easy to almost violate a second
time in the same round you're applying it.

**Recommendation, distinct from the presence-arm one from earlier today:**
a classification table like S01-C2-0B's should be reproducible from a
single mechanical sweep, not from memory of "which fields I already
checked." This round found the gap by literally diffing the table's
reasoning against a probe's measured output. A future mission doing this
kind of field-by-field disclosure audit should write the trace as a
script (grep the producer, print the value, compare against a
known-redacted-value set) BEFORE writing the table, not after — so the
table is generated evidence, not prose a reviewer has to spot-check by
constructing an adversarial case, which is what actually happened here.

## LEDGER RECEIPT — SCOPE-BOUNDARY round, ACCEPTANCE-COMMAND round 3 (FINAL), and
ACCEPTANCE-COMMAND round 4 (cap waived), filed retroactively same day

**SKILLS LOADED for this receipt:** `heartbeat-protocol`, `heartbeat-architecture`
(both already loaded this session; no new skill needed — this is a ledger entry, not a
rework round: no ticket, no PLAN edit, no product code).

This report was three rounds stale. The spine says receipts are cheapest at the moment a
seat reports; I let that moment pass three times. Filing it now, in full, per the murder-
case bar: CAUSE, PRICE, upgrade — not a summary of outcomes, which the tickets already
carry.

### 1. What each round actually cost, and what I got wrong before I got it right

**SCOPE-BOUNDARY round (S03/S04, round 1 of 3, closed there — no rework needed).**
CAUSE of the round existing at all: two acceptance steps (S03/PLAN.md, S04/PLAN.md) were
boundary STATEMENTS wearing an `Acceptance test: N/A` field, uncategorized by my own
round-4 taxonomy, plus a live gap the S03-CODE seat had already named — a positive
presence probe cannot prove tab mutual exclusion. PRICE: one round, no retries; the
categorization half was cheap because the brief was explicit that 60 of 62 steps were
already correctly categorized and re-measured by the Router, so I did not re-derive that
work — the round's actual cost was reading both PLAN files closely enough to choose a
remedy by the SHAPE of the two remaining steps (added a 4th category rather than
deleting-and-moving, since a boundary statement is a real, load-bearing fact about the
slice, not dead weight) and to fix ONE direction of the mutual-exclusion gap. **What I
did not get wrong, but should name as a genuine limitation rather than a clean close:**
the OTHER direction of tab mutual exclusion could not be verified from Architecture's
seat — it needs a session cookie, which means either product code or a live authenticated
run, both out of bounds here. I left it honestly UNVERIFIED rather than inferring a pass.
**As of this receipt I do not know whether that direction was later closed by another
seat** — I have not re-read S03/S04 since (this ledger task is explicitly no-PLAN-edit,
so I am not checking now either) — and I am flagging that as a possibly-still-open gap
rather than assuming it resolved itself.

**ACCEPTANCE-COMMAND round 3 of 3, FINAL (anchored guard + presence-arm gap,
`t_f910328a` / `t_ffcb2df1`).** This is the round with the real mistake in it, and it is
the one worth the most attention in this report.

CAUSE (Finding 1, not mine — Grok's): a blind lens was asked to construct a case where my
own round-2 capture-then-check idiom passes while verifying nothing, and found one — the
guard was unanchored and matched a test's TITLE, not just vitest's summary line. I
reproduced it myself (a polluting-title probe file) before touching anything, then
verified the Router's proposed 3-part anchored fix against its full 7-case hostile matrix
myself rather than taking it on trust. That part of the round cost what it should have —
one round, no retries, no surprises.

**Finding 2 (non-blocking) is where I introduced the defect that became round 4.** S01-C2
and S01-C3's cluster commands ran whole-file with no presence arm, so they could go GREEN
on pre-existing tests alone before the new feature tests existed. The fix I chose —
correctly, in shape — was to add a second, `-t`-filtered presence arm to each cluster's
ONE command, and the brief itself suggested "reusing each cluster's own already-
established step-level `-t` patterns — not a new mechanism." I took that suggestion and
copied the existing step-level patterns verbatim, including their `\|`-escaping, into two
NEW multi-pattern presence arms (S01-C2's five-pattern arm, S01-C3's two-pattern arm) —
**without ever running either one live.** I trusted that the escaping convention I had
been copying since round 1 (escape a pipe because a bare pipe breaks a markdown table
cell) was also correct vitest `-t` syntax, because every SINGLE-pattern step-level line
had always passed. I never had occasion to test a MULTI-pattern line I had just written,
because the ones I was copying from had themselves been quietly rescued by the coder
naming tests with literal pipe characters — a fact I had no way to see at round-3-writing
time, since the coder had not started yet.

PRICE: this is not a hypothetical cost. The S01-C2 presence arm I wrote in round 3 was
measured one round later at `Tests 21 skipped (21)` — completely unpassable, not merely
fragile — against the coder's finished implementation. It took a Router measurement, a
V cap-waiver (V-DECISIONS-PACKET Row 6, an explicit exception to standing law), a full
reproduction cycle, and a 9-site class-wide fix in round 4 to close. Stated plainly: I
spent a NON-BLOCKING finding's fix-round writing a NEW instance of the exact defect
family I had already fixed three times by then, and it took a fourth waived round to
undo. Had I run either new pattern once, live, at the moment I wrote it — a five-second
check — round 4 would not exist as its own round; at most it would have been folded into
round 3 as a fourth sub-finding.

UPGRADE, concrete: never write a `-t` pattern containing ANY special regex construct
(alternation, escaping, groups) into a PLAN without running it live at the moment of
authoring — not "next round," not "it matches the established convention." Writing an
acceptance command is itself a claim, and claims get RED-before-GREEN like anything else.
This generalizes past this mission: copying an existing pattern's SYNTAX because it has
"always worked" is exactly how a silent, load-bearing defect propagates — the thing that
made every prior instance work was never the syntax, it was the accident of the input.

**ACCEPTANCE-COMMAND round 4, cap waived (`t_e1208546`) — just closed, own receipt.**
CAUSE: the round-3 mistake above, surfaced by Router measurement against the coder's
finished worktree. PRICE: one round, no retries — but the highest per-round cost of the
five-round family: reproduction at two levels (JS-semantics + live worktree), a self-
found fourth contorted test title the brief's own list did not name, a genuinely
two-shaped fix (unescape-in-place for 4 step-level code spans, extract-to-labeled-block
for 5 table-cell sites, collapsing a pre-existing duplication between the compact and
detail tables in the process), two DECISIONS.md entries, and this receipt. **Dead end,
named so it is not re-derived:** I considered carrying each cluster's pattern in a shell
variable defined once outside the table, with each cell referencing `$C1_PATTERN` etc.
Rejected before writing it — it would have required a reader to source an environment
block before the table cell's command becomes runnable, breaking the file's own promise
of "ONE verification command" per cluster into a two-step ritual. The labeled-fenced-
block-by-reference shape I used instead keeps each block independently copy-paste-
runnable, which a variable-reference approach does not.

### 2. The through-line: is round 4 a counter-example to the exclusive-provenance
invariant, or an instance of it?

An instance — and an uncomfortable one, because I violated it in the same round I wrote
it down. The round-3 DECISIONS.md entry states the invariant (a PASS must trace to the
one real-world fact it claims, such that no other state of the world can also produce a
PASS) as the answer to "what property stops a fifth variant." In that SAME round, before
that entry was even written, I had already added the S01-C2 five-pattern presence arm —
a command whose eventual PASS (once the coder wrote matching tests) would be produced by
the SHAPE of a contrived test title, not by the feature working. The invariant did not
fail to predict this; it defines exactly this as a violation. What it tells me about the
invariant's usefulness is narrower than I credited it at the time: **stating an invariant
in prose is necessary but does nothing on its own — it does not enforce itself against
the person who just wrote it.** I only ever applied it as an AUDIT tool (checking existing
commands against it under a reviewer's pressure), never as an AUTHORING gate (checking a
new command against it the moment I wrote it). The round-3 DECISIONS.md close already
concluded "no single expression carries it, a process does" — this round sharpens that:
the process has to run at write-time, on the author's own new output, not only at review-
time on someone else's. An invariant a reviewer checks and an invariant an author runs
against their own draft are not the same control, and I only had the first one running.

### 3. Recommendation for `heartbeat-architecture`: key presence arms on the PLAN's own
stable cluster ID, not on prose

Concrete shape: the coding seat groups each cluster's new tests under `describe("S01-C2",
...)` (or prefixes each title with the cluster ID), and the presence arm filters on
`-t "S01-C2"` alone — the PLAN's own vocabulary, never freeform English describing the
feature.

**Benefit:** removes alternation from presence-arm patterns entirely — a single stable
identifier never needs a `|` or `\|`, so the markdown-table-vs-regex tension this round
spent its whole budget on cannot occur again for this class. It also detaches the
acceptance from any English rewording of a test's own description; only renaming the
CLUSTER ID itself would break it, and cluster IDs are the mission's most stable currency —
they appear in tickets, DECISIONS.md, self-reports, and the PLAN's own cluster map, so a
worker has far more reason to notice a cluster-ID rename than a prose one.

**Cost, stated plainly, not hidden under the benefit:** it is a new convention every
future coding-seat packet must specify explicitly, or workers will keep naming tests in
plain English by default (which is otherwise the right instinct). It is a small
readability cost on the test file itself — `describe("S01-C2", () => { it("redacts
ledger_unknown_ref's abstention value", ...) })` reads slightly more like tooling
scaffolding than prose. And it cannot be retrofitted into S01 without editing test files —
out of this seat's bounds and the coding seat's own ticket, so it is a recommendation for
the NEXT slice or mission, not a fix I could apply here.

**What it would NOT fix:** it does nothing for the other members of this five-round
family — a REGRESSION-baseline command's own risks (whole-file scope, missing-file
silent-drop, unguarded `grep -q` exit-masking) are a different defect shape and need their
own guards regardless of how the presence arm is keyed. It also does not reduce a
title-based filter to zero risk, only to a much smaller and much more stable one: a
cluster ID can still be renamed by accident (far less likely than prose, not impossible),
and a genuinely composite presence arm spanning two clusters in one command would still
need `-t "S01-C2|S01-C3"` — real alternation over two IDs instead of five phrases, a
strictly smaller surface, not a zero one.

### 4. What the Router got wrong, stated plainly

Two are already on record from earlier rounds and I am not re-deriving them here: a brief
that named the EPIPE crash itself as the round-2 defect's mechanism when the actual,
deterministic defect was the stolen exit status (the EPIPE symptom never reproduced in
this environment even though the underlying defect did, every time); and a ticket that
overstated an S03 pre-fix-GREEN finding.

**A third, found this round:** the round-4 brief (`ARCH-01-rework8.md`) quoted three
contorted test titles and referred to them as "the three contorted tests," phrasing that
reads as an exhaustive count. A fourth exists — `"round-trip|read restores the published
public tree"` at `tests/unit/s8-publication.test.ts:958` — produced by the exact same
S01-C3 pattern the brief was describing, missed by the brief's own enumeration. The cost
was not large (an independent full-file grep sweep for the literal-pipe shape, rather than
trusting the brief's list as complete, caught it before I wrote the "what should these
titles become" guidance) but the shape of the miss is worth naming: a brief that presents
a list of examples in language implying completeness should be treated as a sample unless
it says "exhaustive" or I verify it is. Had I trusted "three" and only produced renaming
guidance for three, the coding seat's own future ticket would have shipped one title still
carrying a non-English literal pipe, silently reintroducing a smaller version of the same
defect class this whole round existed to close.

### 5. What I could not do, or chose not to, and why

- Could not verify the second direction of S03/S04 tab mutual exclusion (needs a session
  cookie / authenticated run) — Architecture has no product-code or live-session bounds
  to close this; left honestly UNVERIFIED, and I do not know its current status as of this
  receipt.
- Did not rename any of the four contorted test titles — explicitly the coding seat's own
  ticket; I named what they should become as guidance in S01/PLAN.md, but touched no test
  file.
- Did not implement the cluster-ID/`describe`-block recommendation above — it requires
  editing test files, out of this round's (and this seat's standing) bounds; recorded as a
  recommendation for a future slice or round, not carried out.
- Chose not to re-open or re-verify S02/S03/S04 as part of writing this ledger receipt —
  this task was explicitly scoped as a self-report addendum only, no PLAN edits, no ticket
  comment, and I held to that rather than expanding scope on my own judgment.

## ACCEPTANCE-COMMAND THREAD, round 4 (cap waived by V), addendum (filed same day)

**SKILLS LOADED this round:** `heartbeat-protocol`, `heartbeat-architecture`
(both already loaded this session; no new skill needed).

**This round exists only because V waived the 3-round cap; the fix had to
close the CLASS, not the instance, and I believe it does.** The defect
(`vitest -t`'s `\|` is an escaped literal pipe, not alternation) was
reproduced myself before any change, both at the JS-semantics level and
live against the coding seat's finished worktree — read-only, no writes,
matching the Router's measured `Tests 21 skipped (21)` exactly. Beyond the
brief's own three quoted contorted test titles, I found a fourth
(`"round-trip|read restores the published public tree"`,
`tests/unit/s8-publication.test.ts:958`) while confirming scope — reported
in DECISIONS.md since it wasn't named in the brief.

**Why this is the round I'd point to if asked "when did the invariant
actually get tested":** round 3 closed with an invariant ("exclusive
provenance") and an honest admission that no single expression enforces
it — only a process (adversarial verification before trusting a command)
does. This round is that invariant's first live case, and it held: the
process (reproduce first, verify the fix against natural non-contorted
titles via a temp probe, don't trust that "unescaping" alone is sufficient)
is what caught that the fix needed to be class-wide (9 sites, 2 different
shapes for table-cell vs. code-span contexts) rather than a single
find-replace.

**Recommendation for `heartbeat-architecture`, concrete, for the NEXT
mission rather than this one (would require editing test files, out of
this round's scope):** when a presence-arm acceptance needs `-t`
filtering, prefer keying the pattern on a STABLE identifier the PLAN
itself defines (the cluster ID, e.g. `-t "S01-C2"` via a `describe("S01-C2",
...)` block in the test file) over prose drawn from the feature's English
description. This removes alternation from presence-arm patterns entirely
— no `-t` pattern would ever need a `|` again — which would have made
this entire five-round defect family structurally impossible rather than
caught by vigilance each time. Full reasoning in S01/DECISIONS.md's
round-4 entries.

## ACCEPTANCE-COMMAND THREAD, round 3 of 3 — FINAL, addendum (filed same day)

**SKILLS LOADED this round:** `heartbeat-protocol`, `heartbeat-architecture`
(both already loaded this session; no new skill needed).

**Closing this thread at 3 of 3, not carrying an unresolved row to V.** Both
findings (the unanchored-guard defect and the whole-file scope gap) were
reproduced myself before any fix, the brief's own proposed replacement was
independently re-verified against its full 7-case matrix rather than taken
on trust, and the DECISIONS.md closing question was answered honestly
rather than forced into a false single-expression invariant.

**Recommendation for `heartbeat-architecture`, concrete and specific, not
a restatement of "be careful":** add a required step to the plan-authoring
contract — **before an acceptance command is written into a PLAN, its
author constructs and runs at least one adversarial case designed
specifically to make the CHECKING MECHANISM lie, not the feature under
test, and records that run.** This is RED-before-GREEN applied one level
up: existing law already requires a worker to show a product test fails
before the fix and passes after; nothing previously required an
Architecture seat to show an ACCEPTANCE COMMAND can be fooled before
trusting it. Four rounds on this one thread, each finding a different way
a plausible-looking command could pass while verifying nothing, is the
direct, measured cost of that gap. Had this practice existed at round 0,
the gitignored-path defect (round 3 of the mission), the dead-reporter-flag
defect (this thread's round 1), the live-pipe exit-masking defect (round
2), and this round's unanchored-text defect would each have been caught
by their OWN author, in one pass, rather than by three successive review
rounds (a Grok blind lens finding this round's defect on the FIRST attempt
when asked "construct a case where this passes while verifying nothing" is
itself the proof the practice works — it is exactly the exercise being
recommended, just performed by a reviewer instead of the author).

**Price, stated plainly, across the whole acceptance-command arc (mission
round 3 through this thread's round 3):** four blocking findings, four
full round-trips (brief → reproduce → fix → re-annotate up to ~85
acceptance lines across four PLANs → re-post), on a single underlying
cause each time named differently. The fifth-variant question this round
poses is not rhetorical — a fifth variant IS possible, in a layer none of
the four already found (a JSON-formatted reporter's field ordering, a
locale-dependent number format, a CI environment where `2>&1` merges
streams differently) — which is exactly why the answer had to be "no
single expression, a required adversarial-verification STEP" rather than
a fifth patch that would only close this specific hole.

---

## ACCEPTANCE-COMMAND THREAD, round 2 of 3, addendum (filed same day)

**SKILLS LOADED this round:** `heartbeat-protocol`, `heartbeat-architecture`
(re-confirmed loaded, same session as round 1 of this thread; no new skill
needed for a targeted repair of an already-written idiom).

**Why three successive attempts to make acceptance commands rigorous each
introduced a NEW way for them to lie — the actual mechanism, named once,
not per-instance.** Laid side by side:

1. **Round 3** (`git diff --stat` on a gitignored path): the signal is
   ALWAYS empty, whether the step ran or not — a proxy that never carried
   the real information in the first place.
2. **Round 1 of this thread** (`--reporter=basic`): the signal is ALWAYS
   an error, whether the feature is built or not — a proxy that stopped
   carrying real information the moment the tool version changed under it.
3. **Round 2 of this thread, now** (`\| grep -qE ...`): the signal is
   SOMETIMES a different process's exit code entirely — a proxy that
   silently substitutes itself for the real one on exactly the runs where
   the real one would have mattered most (a crash mid-write).

Each fix, at the moment I wrote it, felt like it closed the previous gap
completely — and in the narrow sense it did: round 4's flag-strip made
the RIGHT tests pass and the WRONG ones fail, on every run I actually
tried. What I did not do, each time, was ask a question ORTHOGONAL to
"does this discriminate pass from fail": **does the SIGNAL I am about to
assert on actually originate from, and faithfully carry, the specific
process doing the real work — or could something between that process
and my assertion produce the same-looking signal for a DIFFERENT reason
(a gitignored path always reads empty; a piped grep's exit status is
its own, not upstream's)?** I checked "does it turn red when I break the
feature" three times. I never checked "does it turn red when I break the
MECHANISM CHECKING the feature" until this round's brief named that
question directly. Those are different tests, and only the second one
would have caught rounds 3, 4, and 5's defects, because all three are
defects in the checking mechanism, not in what it was checking.

**The single check that would have caught all three at authoring time,
stated as a rule:** before trusting any command's exit code or output as
an acceptance signal, trace it back to its literal source — name the
exact process and exit code it comes from — and then DELIBERATELY BREAK
THAT PROCESS (not the feature under test) to confirm the breakage is
visible through to the final assertion. Concretely, for a shell pipeline,
this means: does anything between the real work and my `$?` have its own
exit status that could override the real one (a downstream `grep`,
`head`, `tail`)? Does the check even reach the real work at all, or does
it read a proxy (a gitignored directory, a `.strict()` schema instead of
the live output) that could report the SAME value regardless of whether
the work happened? This is the same discipline as RED-before-GREEN
applied one level up — not "does the test fail before the feature exists"
but "does the TEST MECHANISM ITSELF fail visibly when it is broken,
rather than reporting a plausible-looking default." I did this
deliberately for the first time this round (the `printf 'Tests 5 passed
(5)\n'; exit 7` probe, proving the pipeline's `$?` cannot reveal an
upstream crash, independent of whether the specific EPIPE race
reproduces on a given run) — it should have been the first thing I did
for every acceptance-command fix, not the third.

**Price, stated plainly:** three blocking rounds on the exact same cause,
each one a full round-trip (Router finds it → brief written → I
reproduce, fix, re-annotate ~60-85 acceptance lines, re-post). The first
two rounds cost that price because the underlying question ("is this
check's own health separated from what it's checking") was never posed in
general form until this round's brief posed it. Round 3 (the gitignored
path) was ALSO an instance of this same family and was fixed in isolation
rather than recognized as the first data point — a pattern I should have
generalized from at the time, one round earlier than the brief eventually
did it for me.

---

## NEW THREAD — ACCEPTANCE-COMMAND REPAIR, round 1 of 3, addendum (filed same day)

**SKILLS LOADED this round:** `heartbeat-protocol`, `heartbeat-architecture`
(both re-loaded at the start of this new thread, since it is a genuinely
separate rework cap from the S01-design thread that closed 3-of-3 PASS,
not a continuation of it). `superpowers:brainstorming` and
`superpowers:writing-plans` were not re-invoked — this thread is a
mechanical repair against an already-brainstormed, already-written set of
four PLANs, not a new design; no new direction needed settling.

**Why "author a command" and "run the command" stayed separate acts across
three rounds — the actual mechanism, not a restatement of the symptom.**
Every prior round's rework brief told me to reproduce THE REVIEWER'S
FINDING myself before patching it, and I did — B1, B2, and PLAN-01 were
all reproduced live, on the real files, before any fix. What none of those
three rounds asked me to do was reproduce MY OWN ACCEPTANCE COMMANDS —
the artifact I write at the END of designing a step, after the
investigative work is already done and the "real" question (is this field
safe, does this test discriminate against the specific regression I just
found) already feels answered. Writing an acceptance line reads, in the
moment, as transcription — copying down the command that verifies the
work I already convinced myself of — not as a claim that itself needs
verifying. That is the exact mechanism: reproduction discipline was
consistently applied to the FINDING, and consistently NOT applied to the
LAST LINE OF THE STEP that records how to check it, because the last line
felt like bookkeeping, not a result. `--reporter=basic` alone would not
have taught me this — a removed CLI flag is closer to bad luck than a
process failure. What makes it a real finding is that the SAME session,
fixing that one flag, found two MORE unrun-command defects on its own
(S01's multi-file silent-drop, S01's nine `-t`-zero-match vacuous passes)
plus a THIRD kind in S04 (a baseline number asserted once at round 0 and
never re-checked in three subsequent rounds) — three different shapes of
the identical cause, none named by any brief, all found only because this
round finally ran every line instead of reading it.

**What would have closed the gap at round 0, stated as a rule, not a
promise:** an acceptance line is not finished when it reads correctly —
it is finished when its author has actually executed it against the
CURRENT tree and written down the real output next to it, the same
RED-before-GREEN discipline `heartbeat-protocol` already requires for
product tests, extended to the PLAN's own verification commands. This
round did that for all ~85 acceptance lines across all four PLANs (S01
17×`--reporter=basic` + S02 6× + S03 2× + S04 7× just for the dead flag,
and every line got a category and an observed result regardless of
whether it used the flag at all) — the discipline is now visibly present
in the artifact itself (`**Category (REWORK ROUND 4...): ... observed
pre-fix result ...**` on every line), not just asserted in this report,
so a reviewer can mechanically check it rather than take my word for it.

**Price of the gap, stated plainly:** three prior rounds, one blocking
finding on this exact cause each time (B1 round 1, B2 round 2, PLAN-01
round 3), all converging on a single mechanism — and this round's Router
brief was the first to name the mechanism itself rather than another
instance of it. Naming the class, not just the instance, is what let this
round find two of its own three additional defects unprompted rather than
waiting for a fourth rework round to surface them one at a time.

---

## REWORK ROUND 3 addendum (filed same day) — THE LAST LAWFUL ROUND

**SKILLS LOADED this round:** none newly invoked — same session as
rounds 0-2, same four skills already loaded and already verified by the
Router (`heartbeat-protocol`, `heartbeat-architecture`,
`superpowers:brainstorming`, `superpowers:writing-plans`).

**The cause: I verified a check EXISTS and never verified it
DISCRIMINATES.** This is a third, distinct cause in the same family as
rounds 1 and 2, but it sits one level further back than either. Round 1's
cause was searching by named lead instead of risk class. Round 2's cause
was applying the wrong remedy class (flag) to a correctly-identified risk
class (open shape). Both of those were failures in the FIX. This round's
defect was never in a fix at all — `S01-C1-2`'s acceptance test
(`git diff --stat packages/contract/generated/`) was wrong from the
moment I wrote it in round 0, and it survived two full review rounds
untouched because "does this step have an acceptance test" is a
presence check, and presence is not the same property as discrimination.
I wrote a command that read as plausible — it looks like exactly the
kind of check a diff-based workflow uses everywhere else in this same
PLAN — without running it against a real broken state to see it fail.
The brief's framing is exactly right and I want it in my own words too:
**a command that is present but never executed is indistinguishable from
a working one**, and that indistinguishability is invisible to review
because review, like authoring, tends to check for the command's
presence and plausibility, not its behavior.

**What actually caught it, and why that matters more than the fix
itself.** The Router ran the command. Not re-derived it, not reasoned
about `.gitignore` semantics abstractly — ran it, against the real repo,
and got empty output. That is the same discipline this contract has
been demanding of me for three rounds (§2/§10: verify yourself, tag
MEASURED, do not inherit a plausible-sounding claim) applied to MY
artifact instead of INTAKE's. I had the discipline pointed outward
(at INTAKE claims, at REV-01's findings) and not inward at my own
written acceptance tests. This round I applied it inward: before
writing the replacement, I tried the brief's own suggested alternatives
(grep the artifact for new field names; hash it across the run) on the
real file first, rather than assuming they'd work because the brief
suggested them — and found both fail for this specific change too
(`client.ts` is a fixed re-export barrel, invariant regardless of
schema content; `field-inventory.json`'s resource walk is one level
deep, and this widening is nested inside `.answer`). Only then did I
settle on exit-code-of-generation, and only after demonstrating it
fails on a deliberately broken version (`ReferenceError`, exit 1) and
passes on the correct one (exit 0), both applied to and reverted from
the real tracked file.

**The near-miss, which I want on the record as a sign the rule is
generalizing, not just being followed once.** While designing the
replacement I drafted a second, weaker check — "`PublicDebateSchema` is
a key in `field-inventory.json`'s resources" — and caught it myself,
before it reached this report, by testing it against today's completely
unwidened source and finding it passes regardless. That is the exact
same defect class this round exists to remove (a check that cannot
fail), self-applied to my OWN draft rather than needing a fourth review
round to find it. I removed it rather than shipping it flagged.

**What would prevent this recurring, stated as a rule, not a promise:**
an acceptance test is not complete when written — it is complete when
its author has watched it fail against a real broken state and pass
against the real fixed one, in that order, at authoring time, not at
review time or audit time. "I can see why this command would fail if
the step didn't happen" is an argument; "I ran it and it failed" is
evidence, and only the second is admissible for a step to close. This
is the same RED-before-GREEN law `heartbeat-protocol` already states
for product tests; this round's finding is that it applies with equal
force to the PLAN's own acceptance-test commands, which I had been
treating as documentation of intent rather than as a test with its own
red/green obligation.

## Efficiency / one-prompt-machine recommendation (round 3)

**Add a mandatory "show it red, show it green" gate to
`heartbeat-architecture`'s acceptance-test authoring step**, not just to
product-code testing. Concretely: a PLAN step's acceptance test is not
admissible until the author's own handoff cites the failing run and the
passing run for it, the same evidentiary bar this fleet already applies
to B1/B2-style code defects. This would have caught `S01-C1-2` at round
0 — before either review round spent a pass on it — because writing
"here is the failing run" forces the author to actually attempt a
failing run, and `git diff --stat` on a gitignored path fails that
attempt immediately and visibly, rather than silently returning empty
and reading as a pass. The cost is small (one extra command per
acceptance test, run once, at authoring time) against the cost actually
paid here (two review rounds plus a Router sweep across 21 paths to
find the one member of this class).

---

## REWORK ROUND 2 addendum (filed same day)

**SKILLS LOADED this round:** none newly invoked — same session as rounds
0 and 1, same four skills already loaded and already verified by the
Router (`heartbeat-protocol`, `heartbeat-architecture`,
`superpowers:brainstorming`, `superpowers:writing-plans`).

**The cause of treating a wildcard as closeable by a checklist entry.**
This is a DIFFERENT cause than round 1's ("searched by named lead, not by
risk class") — round 1's cause explains why the SECOND leak was missed;
round 2's finding is that the ONE leak I did name (twice — `stranger_restatement`
and `disagreement`, both correctly identified as "the SAME open-ended-bag
risk class" in my own round-1 text) was still shipped unfixed. Naming the
class was not the failure. **The failure was applying the wrong REMEDY
CLASS to a correctly-identified RISK CLASS.** I had two remedy patterns
available from round 1's own work: (a) VALUE REDACTION — keep the object
shape, swap one known field's value (this closed `ledger_unknown_ref` and
`replay_handle` correctly, because both are FIXED, NAMED, required
string fields — there is exactly one thing to swap, and swapping it closes
the whole risk). (b) COPIED-AND-FLAGGED — keep the object as-is, note the
uncertainty for QA to sample (this is correct for a fixed-shape field
whose VALUE safety is merely unproven, like `provenance_ref`). I applied
remedy (b) to `stranger_restatement`/`disagreement` because they were
"fields I wasn't sure about," pattern-matching on MY OWN UNCERTAINTY
rather than on the STRUCTURAL PROPERTY that actually determines which
remedy applies: **is the set of keys FIXED (redact/flag one known value)
or OPEN (no value-level fix exists — the field must be reshaped, not
patched)?** A checklist row is a valid closure for uncertainty about a
KNOWN field's value. It is never a valid closure for a field whose key
set is unbounded, because "QA samples today's data" proves nothing about
tomorrow's — the shape itself is the vulnerability, not any value in it
today. **I wrote the sentence that names this distinction correctly in
round 1** ("open-ended-bag risk class") **without drawing the operational
conclusion that follows from it** (open shape → must reshape, cannot be
value-patched or merely flagged). The gap was between naming a risk and
neutralising it, exactly as this round's brief states — and the
mechanism of that gap, specifically, was substituting "how confident am I"
for "what kind of defect is even possible here" when choosing a remedy.

**What would prevent this recurring, stated as a rule, not a promise:**
whenever a field's schema uses `.passthrough()`, `.catchall(`, `z.record(`,
`z.any()`, or an unconstrained `z.unknown()` at the field's OWN level (not
merely somewhere nested inside a fixed-shape value), COPIED-AND-FLAGGED is
categorically not an available classification — the only two available
treatments are PROJECT (name the keys you keep, reconstruct fresh, never
spread) or REDACT WHOLESALE (replace the entire field with a schema-valid
empty value). This is now a written rule in S01/PLAN.md's B2 finding
note, not just an implicit lesson in this report — the artifact is where
a future session will actually encounter it.

---

## REWORK ROUND 1 addendum (filed same day)

**SKILLS LOADED this round:** none newly invoked — this rework continues
the same session as round 0 (`heartbeat-protocol`, `heartbeat-architecture`,
`superpowers:brainstorming`, `superpowers:writing-plans` all remain loaded
from round 0's launch; the Router's N6 finding already confirmed their
order at transcript lines 296/305/346). No new skill was needed for a
targeted rework against an existing, already-brainstormed design.

**The CAUSE of stopping at the first leak (`ledger_unknown_ref`) and not
finding the second (`replay_handle`) in the same pass.** Not carelessness
in the redaction fix itself — the cause is narrower and mechanical:
round 0's investigation found `ledger_unknown_ref` because REV-01's review
comment NAMED it explicitly, in a specific sentence, as a field to check.
I verified that ONE named field, confirmed the risk, fixed it, and then
**stopped at the boundary of what had been explicitly pointed at**, rather
than treating the DISCOVERY MECHANISM (a field with a required, string-typed,
owner-only-semantic value, reachable through the wholesale node/edge copy)
as a CLASS to search for systematically. `replay_handle` is structurally
identical in every way that matters — required, string, dereferences into
the ledger/execution system, rendered to any reader who opens a node card
— and was reachable through the EXACT SAME code path
(`redactNodeForPublic`'s wholesale spread) I had just finished editing. I
read `AbstentionSchema` end-to-end (because REV-01 pointed at it) but never
read `NodeSchema.base_score`/`.final_strength` end-to-end, despite having
JUST established that "node fields reachable via the wholesale copy" was
exactly the risk category in play. **The cause is: I searched by NAMED
LEAD, not by RISK CLASS.** A named lead is a sample of the class, not the
class itself, and treating it as the whole class is the actual defect —
not a slip in the fix I did make.

**What would have caught it at design time (not review time).** A
mechanical rule, not a vigilance rule: whenever a wholesale-copy decision
is made for a schema-typed value (S01's "copy `nodes`/`edges` verbatim"),
the SAME investigation that decides to copy it wholesale should walk EVERY
field the copied schema reaches — not stop once ANY one risky field is
found and fixed. Concretely: S01-C2-0B's enumeration table (now written,
21+ rows, every field classified copied/redacted/flagged) is the artifact
that should have existed in round 0, produced by the SAME reasoning that
produced the `ledger_unknown_ref` fix, not produced only after a second
review round forced it. **The general lesson for this fleet, not just this
mission: "found one instance of a risk class, fixed it" is not evidence
the class is closed — closing the class requires enumerating its full
membership BEFORE declaring the finding resolved, and the enumeration
belongs in the artifact (the PLAN), not in the fixer's head.** I have
since applied this same discipline proactively in this rework round to
catch an unrelated defect (S01-C3's cluster-table step-count also
undercounted, same pattern as the ticketed N2, but never named by the
reviewer) — checking every cluster's table against its body once I had
the PATTERN, not just fixing the one instance that was pointed at.

---

Filed per `heartbeat-protocol` §3 / packet §9, verbatim question: *treat it
like a murder case... what repeatedly costed us tokens... how can we make
the coding more efficient... turn this into a one prompt machine even
better.*

## The case file

Four PLAN.md files, four DECISIONS.md appendices, one mission graph, zero
rework rounds spent (this is round 1 of a max-3 budget, unused). The
interesting facts are not in what shipped clean — they are in the three
places this session almost shipped something wrong, and the one place a
PRIOR session already did.

## CAUSE, not symptom, of the mission's four pre-existing corrections (N1-N4)

INTAKE's corrections log shows four findings, all against the Router
(also Claude, also Opus 5 — my own model), all caught by a Grok lens that
does not share my training data or reasoning habits. The SYMPTOM each
time was "INTAKE said X, X was wrong." The CAUSE is narrower and repeats:
**the Router inferred a causal MECHANISM from a correct OBSERVATION, and
the inferred mechanism was the mechanism that would occur to another
same-model instance too** — N4 is the sharpest example: `.strict()` and
`catch→null→404` are BOTH true and BOTH present in the code, so "the
mechanism is `.strict()`" is a plausible, checkable-feeling story that
happens to be wrong (the real mechanism is required-vs-optional keys,
independent of `.strict()`). A same-model architecture seat reading that
sentence would find it persuasive for the same reason the Router found it
persuasive writing it — the reasoning that produces the error and the
reasoning that would catch it are the same reasoning. **This is why I ran
my own three-trial back-compat probe from scratch (importing the REAL
schema, not inheriting REV-01's byte-for-byte replica) instead of citing
REV-01's already-correct result** — not because I doubted the conclusion,
but because a MEASURED tag inherited from a same-model source is weaker
evidence than the packet's decorrelation law credits it as being if it's
just re-stated. **PRICE if I had inherited instead of re-measured and
this mission's real mechanism ever DID drift back toward `.strict()`-only
thinking in a later rework round: a full round (schema edit, ship,
discover the 404 against the one live publication, revert, re-fix) — call
it 1 rework round plus the wall-clock to notice the regression in a
system with exactly one real row to notice it against.** My own probe
cost about 10 minutes (write script, run three-trial, delete, confirm
clean tree) and is now itself a second, independent, re-runnable
MEASURED citation in S01/PLAN.md.

## What I NEARLY got wrong

**S03's standing-test assumption.** My first-pass reasoning, writing
S03/PLAN.md, was: replacing `<h2>Published debates</h2>` with a "Public
Debates" tab control will break
`tests/architecture/s8-publication-contract.test.ts:159`'s
`expect(home).toContain("Published debates")`, so S03 needs an
Architecture-ADR'd test amendment (the same pattern SPEC S01's own
acceptance sketch explicitly pre-authorizes for a DIFFERENT assertion in
the same file). I was about to write that amendment into the PLAN as a
step. Before doing so I re-read the assertion's actual scope — it checks
the WHOLE FILE's text, not the heading specifically — and found the
retained per-card disclosure sentence ("Published debates may be indexed
by search engines...") already satisfies it, untouched, for a reason
having nothing to do with the heading I was about to delete. **The
lesson, now written directly into S03/PLAN.md's "what I nearly got wrong"
section so a later session doesn't re-derive it: a `.toContain()`
assertion is a claim about the WHOLE FILE, and checking what ELSE in the
file could already satisfy it is cheaper than proposing a test amendment.**
Caught before it left this session — cost was my own 10 minutes, not
Grok's review round, but it is exactly the kind of near-miss the packet
asks to be named rather than quietly self-corrected and forgotten.

**The `as Answer` cast I almost used.** S02's public tree rendering needs
to call `apps/ui/lib/v3/adapter.ts`'s `debateDetailFromAnswer(answer:
Answer)` with data that is NOT a full `Answer` (the public envelope is
deliberately narrower). The cheap fix — build a partial object and cast
`as Answer` — type-checks cleanly and would have looked finished. I only
avoided it by grepping every `answer.*` dereference across all four
helper functions this call chain touches and finding 9 distinct fields
read, 6 of which don't exist on the public schema at all. **The `as
Answer` cast's actual defect is invisible until someone edits
`adapter.ts` later and reads a 10th field** — no test written today could
catch it, because the bug doesn't exist yet; it is pre-loaded into the
CHOICE of cast over a structural type. I used a `Pick<Answer, ...>`
narrowing instead, which converts "someone reads a new field" from a
silent runtime `undefined` into a compile error at both call sites.
Recorded in S02/PLAN.md and S02/DECISIONS.md. This is the single most
expensive-if-missed finding in this handoff — the kind of defect that
survives code review because nothing about it LOOKS wrong.

## The one real catch: `ledger_unknown_ref` (found late, while re-verifying board state before writing this report)

This is the most consequential finding in this handoff, and it was
NOT caught by my own investigation — it was already sitting, unresolved,
in REV-01's SPEC-review comment on `t_2a279210` (2026-08-29 11:08, under
"what I did NOT check"): *"Whether `answer.abstention.register_row_key` /
`answer.abstention.ledger_unknown_ref`... should also be added to S01 R2's
exclusion list — they read as ledger-adjacent but aren't literally named
`ledger_digest_handle`; UNVERIFIED whether they carry the same risk."* I
had already written S01's PLAN by the time I re-read that ticket's full
thread to finalize this report's "comments read through" section, and my
PLAN as first drafted did NOT address it — my "copy nodes wholesale"
decision would have silently shipped a real owner-only ledger pointer
(`AbstentionSchema.ledger_unknown_ref`, `packages/contract/src/index.ts:389`,
REQUIRED on every node's `abstention` object) to anonymous readers for any
published debate containing an abstained node. **No existing test would
have caught it** — the standing `s8-publication-contract.test.ts` only
checks top-level/answer-level forbidden keys, never node-level ones (a gap
I separately name in S04's PLAN). I fixed S01's PLAN (a `redactNodeForPublic`
value-redaction step, S01-C2-0/1/4) and S04's evidence checklist (item
3b) before finalizing this handoff — see both PLAN.md files and both
DECISIONS.md files. **PRICE if this had shipped**: a genuine, low-visibility
security regression (one ticket-comment sentence away from being caught,
buried under "what I did NOT check" in an 18KB review comment) — the kind
of thing that would surface as a NEW S04-style finding weeks after mission
close, at full incident-response cost, rather than a PLAN-writing-time
fix. **CAUSE:** the packet's own board-scoping instruction ("comments
read through" as a mandatory self-report field) is what forced the
re-read that caught this — it worked exactly as designed, but it worked
LATE (after the PLAN was otherwise complete) rather than at the START of
the investigation. **Recommendation:** a future architecture packet should
tell the seat to read every comment on its in-contract tickets (not just
the latest "READY FOR PEER REVIEW" summary) BEFORE beginning investigation,
specifically flagging that review comments often contain "what I did NOT
check" sections that are exactly the seeds of the next seat's findings —
reading them early would have caught this without a late re-verification
pass, and without depending on this seat happening to re-check board state
carefully enough at the end.

## DEAD ENDS (named so nobody re-derives them)

- **Reusing `DebatePageClient.tsx` wholesale behind a flag.** Considered
  and costed explicitly (see S02/PLAN.md's dedicated section) — rejected
  because it is wrapped unconditionally in `<AuthGate>`, has ~20
  cookie-authenticated call sites, and mounts `PublicationControl`
  (delete/unpublish/step-up mutations) with no ownership check at the
  call site at all (it self-authenticates via step-up token, meaning a
  flag bug wouldn't even be the FIRST line of defense against a leaked
  mutation — it would be the ONLY one). Do not revisit this path without
  new evidence; the cost analysis is written down.
- **Adding `risk_tier`/`tier_source` to the public envelope while leaving
  out `tier_provenance_ref`.** Both fields are individually NOT on the
  forbidden-carrier list, so a partial-parity reading of R2 could
  justify shipping them. Rejected because V-DECISIONS-PACKET Row 4 is
  still OPEN specifically about this triplet, and shipping 2 of 3 fields
  pre-empts that ruling in one direction without asking. If V rules Row 4
  "include all three," this becomes a small additive PLAN change, not a
  redesign — do not add them piecemeal before that ruling lands.
- **Migrate/re-encrypt the one existing publication (V-DECISIONS-PACKET
  Row 2, option a).** Considered, costed, rejected as disproportionate
  engineering for a blast radius of 1 — see S01/DECISIONS.md. Do not
  revisit unless the blast radius changes (more legacy publications
  accumulate before this mission ships, which would change the cost math).

## Where THIS packet was unclear (a finding against the Router/packet author, wanted per §9)

- **Packet §4 item 3** frames the S02 reuse question as binary ("sharing
  the owner's components behind a read-only mode, VERSUS a parallel
  public component tree"). The actual correct answer was neither pole —
  a hybrid, decided per-COMPONENT rather than per-PAGE (the four view
  components and `NodeDetailDrawer` are pure enough to share directly;
  `DebatePageClient.tsx` itself and `AnswerHonestyDrawer.tsx` are not).
  The binary framing cost me one extra reasoning pass recognizing the
  question needed decomposing before it could be answered well. A future
  packet asking this class of question should explicitly invite a
  per-component answer, not just "which one."
- **`web/` is never mentioned anywhere in the packet, INTAKE, or any of
  the four SPECs**, despite being a REAL, currently-passing, test-enforced
  constraint on exactly the files this mission touches
  (`tests/architecture/s8-publication-contract.test.ts:140-175` reads
  both `apps/ui/**` and `web/**` files and asserts on their content).
  INTAKE's "Serving UI tree is apps/ui... NOT web/" is true but
  incomplete — it answers "which tree do users see" and silently implies
  "so web/ doesn't matter," which is false for this mission's test
  surface specifically. I discovered this by independently reading the
  full standing test file, not from anything the packet pointed me at.
  **PRICE if undiscovered:** a Codex worker implementing S01, S02, or S03
  from my PLANs without this note would hit a failing
  `s8-publication-contract.test.ts` at verification time with no
  proximate cause in their own diff — a classic "test fails, diff looks
  right" debugging session, probably 15-30 minutes per slice, times up to
  three slices if each worker re-discovers it independently rather than
  reading a sibling slice's PLAN first. I centralized the finding once,
  in all three affected PLAN.md files' "Boundaries" sections, so it costs
  nothing three more times.
- **The "no line cap" instruction (heartbeat-architecture) and the "do
  not gold-plate" instruction (packet §6) are in real tension** with no
  stated tie-breaker. I resolved it by using "does this step name a
  concrete failure its acceptance test would catch" as the actual
  admission criterion (packet §5's refutation duty) rather than "could I
  think of one more step" — but a less careful seat could read "no line
  cap" as license and a future packet should state the tie-breaker
  explicitly rather than leave it to each seat's judgment to independently
  arrive at the same one.

## Efficiency / one-prompt-machine recommendations

1. **Pre-authorize (or pre-dispatch) an Explore-agent survey in the
   packet itself, for any slice touching a component file over ~500
   lines.** I delegated `DebatePageClient.tsx` (1906 lines) to an Explore
   agent rather than reading it directly, which was the right call and
   kept it out of my own context — but that was my judgment call, made
   mid-investigation, not something the packet primed me to do
   immediately. A packet that names the large files up front and
   pre-authorizes delegation would remove that judgment call entirely and
   make the pattern reliable across seats of varying discipline.
2. **Add a mandatory "cross-file test dependency scan" to the Router's
   INTAKE process**: one grep (`grep -rl "apps/ui\|web/" tests/**/*.test.ts`
   or equivalent) run once, at intake, with hits folded into each
   affected SPEC's Ground Truth section. This is exactly the class of
   fact (the `web/` twin constraint) that cost real investigation time
   this session and would cost it again next mission if not
   institutionalized as a standing intake step rather than something each
   architecture seat re-discovers.
3. **State the "no line cap" vs "do not gold-plate" tie-breaker
   explicitly** in `heartbeat-architecture`: something like "a step earns
   its place by naming a failure its acceptance test would catch that no
   OTHER step already catches — that is the stopping rule, not step
   count." This session used exactly that rule without it being written
   down; writing it down removes the ambiguity for the next seat.
4. **Decorrelation is working and is worth its cost.** Every one of this
   mission's four pre-existing corrections and both of my own
   near-misses were caught by re-deriving rather than inheriting. The
   packet's explicit "verify yourself and tag it MEASURED with your own
   command" instruction (§2/§10) is not ceremony — it produced this
   session's single most load-bearing finding (the `TreeProjectableAnswer`
   narrowing) as a side effect of taking it seriously rather than trusting
   a plausible-looking inherited claim.

## Comments read through

Board: `t_f864a84b` (own ticket, created 2026-08-29 10:41, no comments
prior to this handoff), `t_5c7a1e7f` (parent/requirements, read in full),
`t_2a279210` (SPEC review, read through the REV-01 comment posted
2026-08-29 11:08, the third comment on that ticket — no comments after it
existed at read time). No sibling-ticket disclosure needed: no ticket
outside this contract's set (`t_f864a84b`, `t_5c7a1e7f`, `t_2a279210`) was
read.

---

# Self-report addendum — S05, ticket `t_e8c6c083` (2026-08-30)

**SKILLS LOADED: heartbeat-architecture, heartbeat-requirements.** Both, in
direct response to the ticket's explicit dual-authorship exception for a
brand-new slice with no prior Requirements dispatch (SPEC normally frozen
and never Architecture-edited; this round is the named exception).

## What this round was

V ruled, from two screenshots, that "Done" for this mission looks
different from what shipped: a full owner-fidelity tree/map/split/canvas
view on the public route, reached via an explicit button, "same UI as if
published by the user." Five items to rule on, verbatim in the ticket:
what the button means, fidelity gaps, whether the census numbers can be
truthfully computed publicly, the owner-only-affordance invariant
(specifically QA-N2's Regenerate-button concern), and scope discipline.
Deliverable: SPEC.md + PLAN.md (+ DECISIONS.md, PROGRESS.md skeleton) for
a new slice S05.

## What I found, and why it changes the shape of the answer

The investigation was almost entirely read-only (no product code touched,
per Architecture's bound) and produced one dominant, load-bearing fact:
**the owner-fidelity canvas V described in Screenshot 1 already exists,
verbatim, on the public route.** Not "similar" — the literal same
component files. `PublicDebatePageClient.tsx` imports `DebateCanvas`,
which imports `CanvasViewport` (the file that turned out to hold the
entire zoom cluster — Zoom in, Zoom out, Fit, 1:1, live `%` readout — none
of which I initially found because it lives one component layer below
where I first grepped). The public page's default view state is
literally `useState<DebateView>("tree")`. The only reason V has only ever
seen the flat verdict-only fallback is that the sole existing publication
predates the commit that introduced tree data into publications at all —
a data-availability accident, not an unbuilt feature.

That fact reframes all five items:
- **Item 1** rules to reading (a): the button is a discoverability
  addition to an existing page, not a new screen. I checked this against
  V's own words before ruling, not just the code — "the verdict and
  debate state can be kept for now" reads, in context, as an approving
  description of the CURRENT top-of-page section, asking for something
  ADDED below it. That textual reading and the structural evidence agree,
  which is the strongest form of confirmation available here short of an
  actual tree-bearing publication rendering (which does not yet exist to
  look at — I said so plainly rather than pretending certainty I didn't
  have, then specified exactly what a real render would additionally
  confirm: visual density parity with Screenshot 1, and that the
  corrected census header reads truthfully).
- **Item 2** (fidelity) resolved into three buckets by direct comparison
  of both files, not assumption: identical-and-shared (canvas/map/split/
  thread/zoom/set-aside-checkbox — no work needed), genuinely-missing-
  but-envelope-blocked (SynthesisPanel, needs `debate.synthesis.*` which
  doesn't exist publicly), and correctly-already-suppressed
  (Challenge, real generation history — verified by reading
  `NodeDetailDrawer.tsx` in full, not trusting the brief's line numbers).
- **Item 3** confirmed decisively by re-reading `PublicDebateSchema`'s
  complete, `.strict()`-enforced field list: no `condition_mark_records`,
  no substitute possible even per-node. Ruled: omit the three counts,
  never render zero.
- **Item 4**: QA-N2 is real as an *untested precondition*, not a live
  defect — the Regenerate button is unconditionally disabled on BOTH
  routes today (a `V3_MISSING_CAPABILITIES` stub, not an ownership gate),
  and the actual owner-only affordances are already correctly prop-gated.
  I designed a test (S05-C3-1, category VERIFICATION-ONLY, expected to
  pass on first run) rather than a code change, and said so explicitly —
  this is one of the "already done, needs proving" cases the ticket gave
  explicit permission to name plainly.
- **Item 5**: both routed-envelope gaps (`condition_mark_records`,
  `debate.synthesis.*`) named precisely enough that a future
  contract-touching slice does not have to re-derive this investigation,
  with a mechanical `git diff --quiet` check proving this slice's own
  diff never touches the contract or publish-path files.

## What I nearly missed, and how it was caught

My first pass at locating V's "zoom controls (+, -, Fit, 1:1, 37%)"
grepped `DebateCanvas.tsx` directly for literal strings like "Fit"/"zoom"/
"1:1" and found nothing — I recorded this as "unconfirmed, remains open"
rather than concluding the controls didn't exist. The correct next step
(broadening the search to the whole `apps/ui` tree rather than one file)
surfaced `CanvasViewport.tsx` as a separate component `DebateCanvas`
delegates to. Recorded here because the near-miss itself is the lesson:
absence of a hit in one file is evidence about that file, not about the
feature — the fix was widening the search surface, not concluding "not
built" from a negative grep in the wrong place.

## Balance-invariant discipline applied

Per the two near-misses in the immediately prior round (`t_83df0d9c`), I
ran the `**Acceptance test:**` / `**Category` / `**Failure it CATCHES:**` /
`**Failure it MISSES:**` count check on S05/PLAN.md before handoff: 11 =
11 = 11 = 11 across 11 numbered steps. Also checked the full R1–R6 trace
was textually present in PLAN.md (found R4 and R6 missing an explicit
citation on first pass — both were substantively covered by S05-C3-1 and
S05-C4-1 respectively, just not cited by name — added one sentence to
each step closing the citation gap rather than treating it as
substantively uncovered).

## Scope held

No product code written or edited. No product test run. Files touched:
`docs/missions/public-debate-access/slices/S05/{SPEC,PLAN,DECISIONS,
PROGRESS}.md` (PROGRESS.md left as an empty heading skeleton, orchestrator-
write-only per its own header) and this self-report. `packages/contract/
src/index.ts` and `apps/api/src/publications.ts` were read, not edited —
confirmed via `git diff --quiet` on both before handoff.

## Comments read through

`t_e8c6c083` (own ticket, read in full, no prior comments — this is the
first response). No sibling ticket outside this contract's set was read.
