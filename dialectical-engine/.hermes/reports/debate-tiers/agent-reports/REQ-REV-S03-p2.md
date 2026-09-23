# Self-report — REQ-REV-S03 pass 2 (scoped re-review, slice S03, ticket `t_580ac829`, 2026-09-13)

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Verdict filed: **REWORK pass 2** — 1 blocking (new, introduced by the fix), 5 non-blocking; B1/B2/B3 of pass 1 all CLOSED.
Artifact: `docs/missions/debate-tiers/reviews/REQ-REV-S03-p2.md`.
Probes kept: `probes/REQ-REV-S03/{p2-v2-r8-oracle.mjs,.out, p2-v2-claims.sh,.out}`; pass-1 probes unedited.

## 1. The cause, named

**The one blocking finding is a fix-shaped defect, and that is the pattern worth naming.** R23's
clause — *"minus any slot absent under R31"* — was written to carry the new R31 through an existing
sentence. The existing sentence happened to list **five** surfaces (panel, register version, api.env,
discovery targets, `/new`), and the qualifier attached to all five. For one of them (`/new`) it
contradicts two explicit sentences elsewhere and re-breaks acceptance step 8 — the very step the pass
was convened to repair. For three of them it opens a question nothing answers.

The cause is not carelessness; the seat's work is the most careful I have reviewed in this mission. The
cause is **structural: a new requirement was threaded into an old sentence by adding a qualifier
instead of by re-writing the sentence per surface.** A qualifier appended to a list distributes over
every member, and nobody re-reads the list member by member at that point — because the diff looks
like five words.

*Upgrade, mechanical:* when a REQ-FIX adds a concept (here: "absent"), every requirement that names a
SURFACE must say what the concept does to **that surface, one line per surface**. A list plus a
qualifier is the anti-pattern. This is checkable by a reviewer in seconds and would have prevented the
only finding of this pass.

## 2. What repeatedly costs tokens — and what got cheaper

**Cheaper this pass, measurably.** Pass 1 cost ~25k tokens re-opening ~40 citations that were all
exact. This pass I re-opened **six** lines (`cards.ts:27-28`, the log's line 28,
`tiers-s02-rosters.test.ts:8-9`, `main.ts:65-71`) plus one scripted oracle, because the seat's handoff
told me exactly which claims were new measurements and which were carried. **A handoff that separates
"measured this pass" from "carried from the last pass" is worth more tokens than any tooling I have
asked for.** The seat did that unprompted; it should be in the template.

**Still expensive:** re-deriving the acceptance table row by row (12 rows) by hand. That is the second
time I have done it for this slice. It is exactly the work the `step | requires | blocked-by` column I
proposed at pass 1 would make mechanical — and note the seat *did* build that table (`:369-383`), which
is why checking it was possible at all rather than a re-derivation from scratch. Ship it as a template,
not as one seat's good idea.

**The probe paid for itself twice.** `p2-r8-declaration-oracle.mjs` from pass 1 was re-run with a
one-line `sed` to change the id list. Total cost this pass: one command. Probes that take their inputs
as a list, not as hard-coded values, survive into later passes; probes that inline their subject do
not.

## 3. What I nearly got wrong

- **I nearly passed it.** B1/B2/B3 were closed well, the measurements checked out one after another, and
  the pull toward "PASS, with five N" was strong — I had already written most of a PASS in my head by
  the time I reached R23. What saved it was a habit, not insight: I re-read R14 and R23 **next to each
  other** because both mention the slot set, and only then did the contradiction appear. Reading a SPEC
  section by section cannot find a contradiction between sections 176 and 276; only reading by
  *concept* can.
- **I nearly tiered B1(p2) as N.** A one-line fold in DECISIONS would technically resolve it, and pass 2
  of 3 makes a REWORK expensive. I tiered it B because the packet's own test is the honest one — two
  builds true — and because the seam it governs (the register / `api.env` drift guard, contradiction
  C14) is the most expensive thing in the slice to get wrong. But I want it on record that this was the
  closest call of either pass.
- **I nearly missed that the positive limb was a real hole rather than scope creep.** My first instinct
  on an unrequested requirement is to rule it OUT. The measurement flipped me: no suite in R27's table
  reads `config/models.yaml`, so the negative limb alone permits a build where V's file is decorative.
  *Lesson: rule a flagged addition by asking which test fails without it — never by asking whether a
  finding asked for it.*

## 4. Dead ends — do not re-derive

- **The quoted-exact rule is sound and B1 is closed.** Seven ids, both matchers, 413 files, measured
  twice now (pass 1 and pass 2). `packages/contract/src/plan-tiers.ts` is the only quoted-exact hit for
  every id; the three support files and both `cards.ts` hits are bare-only. Nobody needs to re-run this.
- **`cards.ts`'s allow-list really is unnecessary** under quoted-exact — measured, not argued.
- **Step 8 composes correctly** under V-38's default: R31(a) → exit 0 → R16 keeps the list → R15 fires
  the 422 naming both ids. I walked it against the admission code. Do not re-walk it unless R23 changes.
- **The duplicate `grok-4.6-build` across tiers is parseable** (only `provider_ref` must be unique) —
  settled at pass 1, re-confirmed as correctly cited in R14.1.

## 5. Where THIS packet fought me — and where it helped

- **It helped more than any packet in this mission.** Naming the scope ("B1–B3 as ADDRESSED, V's folds,
  your own §8 predictions") meant I did not re-review 29 unchanged requirements, and the charge that
  told me to **rule the seat's flagged judgement call IN or OUT with a measurement** is the single best
  instruction I have been given: it converts a seat's honest uncertainty into a decision with evidence,
  instead of leaving it to be re-discovered by a third node.
- **One friction:** the packet's line map for SPEC-v2 (`## 1. Requirements` :33, `### The file` :35 …)
  is a convenience that becomes a liability the moment the file is re-frozen — I checked three of them
  and they were right, which cost tokens to learn nothing. A section map is worth having; it should be
  generated, not typed.
- **A contradiction between packet and handoff went unflagged by both:** the packet says SPEC-v2 is 454
  lines, the seat's READY says 430. `wc -l` says 454. Neither side checked the other. The packet-check
  script the orchestrator runs could compare every number a handoff states against the artifact it
  names, and that would also have caught pass 1's stale baseline row.

## 6. Toward the one-prompt machine

1. **Ban "list + qualifier" in a REQ-FIX.** A new concept gets one line per surface it touches. This
   pass's only blocking finding is that pattern, and it is the cheapest rule on this list to enforce.
2. **Make the handoff separate "measured this pass" from "carried".** The seat did it voluntarily and it
   cut my verification cost by roughly an order of magnitude against pass 1.
3. **Ship the acceptance table with `requires` / `blocked-by`** (proposed at pass 1, built by this seat
   by hand at `:369-383`). It turned B3 from an argument into a 12-row check.
4. **Write probes that take their subject as a list.** One `sed` re-ran the whole B1 oracle a pass later.
5. **Have packet-check compare handoff numbers against the artifacts** (N4(p2)): line counts, suite
   totals, commit ids. Three of the seven N-findings across both passes were numbers that disagreed with
   a file anyone could have measured.
6. **A scoped re-review is the right instrument.** Pass 1 read everything and produced 3 B + 7 N; pass 2
   read the delta and produced 1 B + 5 N at a fraction of the cost — and the 1 B was created by the fix,
   which is exactly the class a scoped pass exists to catch. Keep the scoping; do not let pass 2 become
   a second pass 1.

## 7. Price of this pass

Wall-clock ~25 minutes, one resumed session, no retries, no dead ends. Two probes written (one derived
from a pass-1 probe by a single `sed`), four artifact reads, six product lines re-opened. Roughly a
third of pass 1's tokens for a review that covered the whole delta — the saving came from the seat's
handoff discipline and the packet's scoping, not from me.
