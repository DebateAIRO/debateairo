# Self-report — seat REQ-FIX-S03 · node REQ-FIX (pass 3 of 3) · mission `debate-tiers` slice S03 · ticket `t_19ed95ac`

The question this answers, verbatim from V:

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Transcript `…/96555a10-dafb-468d-88b3-f6c3afd4c825.jsonl` — passes 1, 2 and 3 in one session. Opus 5,
background. Main tree `32add5db`/140 dirty at CLAIM and at READY; lane `9a000c37`, 0 dirty, read-only.
~20 tool calls, ~25 min, no retries. Output: `SPEC-v3.md` (485 lines, `wc -l` at write time).

## 1. The murder: I killed two steps with a clause I wrote to save them

The one blocking finding of pass 2 is **mine, and it is the fix from pass 2**. R31 needed the absent
slot to disappear from somewhere, so I wrote R23 as:

> …the panel, the published register version, `api.env`, the API's discovery targets and `/new` name
> the file's entries and nothing else — **minus any slot absent under R31**, which is named, not hidden.

One trailing clause, attached to a list of five nouns. It distributes. On the merge-day state my own
R32 describes, it empties the Free card on `/new` — re-breaking acceptance steps 2 and 8, **the exact
two steps pass 2 existed to repair.** And on three other surfaces it left two coherent builds with
nothing choosing between them.

- **Cause, named precisely:** I wrote a *qualifier* where the sentence needed a *distribution*. English
  attaches a trailing clause to everything in a list; requirements are read by people looking for the
  one surface they are building. The five surfaces do not behave alike — that was the whole content of
  the sentence — and I wrote them as one noun phrase.
- **The deeper cause, and it is the same one as pass 2's:** I fixed R31 by reading R31, not by reading
  every requirement R31's new concept touches. "Absent slot" was a new concept introduced at pass 2; it
  needed a sweep across every surface that names a slot, and it got a clause instead.
- **Price:** one REQ-REV pass (a full blind review with two probes) plus this pass — the third rework,
  the last one available before the question would have gone to V as a row.
- **Price to have caught it:** the same sweep I ran here in about five minutes. Listing the five
  surfaces and asking "does the subtraction hold here?" answers itself at surface 5 in one line,
  because R16 says the opposite in two places.

## 2. What I did that was right, and want kept

**I did not accept the verdict's recommendation on authority — I went looking for a measurement, and
found one that changes the argument.** The verdict recommended Build A with *medium* confidence and a
real counter (unauthenticated probes to two third parties from any keyless machine). Rather than
taking A on the reviewer's word or contesting it with rhetoric, I measured the seam:

- `isExactProviderRuntimeRefresh` (`apps/runner/src/dev-api-environment.ts:310-318`) already admits a
  change confined to `PROVIDER_DISCOVERY_TARGETS_JSON` **at the same register version**. So under A a
  key arriving is a runtime refresh; under B it is a register publication caused by no file edit —
  which makes my own R14.2 false. **A is the build the product already implements; B needs two
  requirements rewritten.** That is a stronger argument than the verdict's and it is checkable.
- `dev-provider-panel.ts:103-108` *forces* the shape of a keyless slot: a target must be either
  (healthy and credentialed) or (sentinel-model and uncredentialed), or the panel throws. So
  "configured but absent from the healthy panel" was never a design choice — the product has had the
  shape all along.
- The counter I then closed rather than accepted (R33), because the probe path
  (`provider-discovery.ts:131-141` probes every target; `:44-47` adds auth only when present) makes it
  real. **A recommendation with a live counter should be adopted *with the counter closed*, not
  adopted with the counter noted** — otherwise the next node inherits it as an unpriced cost.

**The verdict predicted ARCH would build B**, for the stated reason that R31's "configured" sat three
lines from the implementation while R14's "five slots" sat eighty lines away. That prediction is what
made me reword R31 as well as R23 — proximity, not just correctness, is what a builder reads.

## 3. What repeatedly cost tokens across all three passes

One shape, three times, and it is worth naming once:

| Pass | What I asserted without running the join |
|---|---|
| 1 | a test proving five ids are single-declared ⟹ the sixth id is too (B1) |
| 1 | the rules are right **and** the steps are right ⟹ the steps are runnable (B2, B3) |
| 2 | R31 needs a subtraction ⟹ one clause across five surfaces is that subtraction (B1(p2)) |

Every individual sentence in all three was true and measured. **What cost the mission three passes was
never a wrong fact — it was true facts placed next to each other with nobody running the join.** A REQ
seat's defects are almost entirely composition defects, and composition is exactly what a document
format hides: two correct paragraphs a hundred lines apart look like two correct paragraphs.

- **Cheapest counter-measure, and it is mechanical:** before freezing, build a small matrix — every
  *concept the slice introduces* (here: "absent slot", "shape refusal", "the file's lists") against
  every *surface or step that mentions it* — and fill each cell. A cell you cannot fill is the defect.
  Three passes of this slice die in that matrix.
- What did **not** cost tokens: reading. The floor held every pass; I never explored, never re-read the
  intake at pass 3, and the lane reads were seven `sed` ranges. The expense is entirely in the joins I
  skipped, never in the pages I opened.

## 4. Dead ends, named so nobody re-derives them

- **Do not reopen Build A vs Build B.** It is decided by `dev-api-environment.ts:310-318` plus R14.2,
  not by preference. If someone wants B, the price is stated in v3: R14.2 and R24 both change.
- **Do not write a sixth FILE fixture for R20 class 6.** R11's sixth refusal is a `cli:` slot's
  *observed* base URL; an R3 entry has exactly the keys `cli` and `model`, so no file value produces
  it. v3 asks for six file fixtures plus one panel-build case — seven tests, six classes.
- **Do not delete `PLAN_TIER_ROSTERS`.** `tiers-s02-rosters.test.ts` imports it (`:6`), asserts on it
  (`:205`, `:209`) and scans for its *name* as a selector (`:78`); deleting the export guts three of
  that suite's four cases. R8 removes the id *literals* from its source, not the export.
- **Do not re-measure F13/F14** (the GLM echo behaviour, the 64-token probe). Neither I nor the
  reviewer re-measured them; they are the orchestrator's 16:05 measurement and both verdicts say so.

## 5. Where this packet was unclear — exactly

Very little, and this packet is the best of the three. Two notes:

1. **"No requirement added beyond the finding and the folds"** vs R33. R33 is not in any finding — it
   exists to close the counter the verdict raised against the build the packet told me to choose. I
   judged it inside the finding (choosing A without closing its counter is choosing A with a known
   defect) and said so out loud rather than leaving it to be discovered. The same ambiguity bit pass 2
   with R8's positive limb, which the reviewer then ruled IN. **Fix, and it is the same one twice:
   state that closing a finding includes closing the hole the chosen fix opens.**
2. The packet's charge 3 gave me the tie, both builds, the verdict's recommendation, its counter, and
   the consequence of each — which is why this pass was 20 tool calls and not 60. **That is the packet
   format worth copying:** it named the decision, the options, the evidence for each and the cost of
   being wrong, and left the measurement to me.

## 6. How this becomes more of a one-prompt machine

- **The concept × surface matrix, above.** One mechanical gate that would have caught all three passes'
  blocking findings. If one thing from this report is adopted, this is it.
- **Never attach a qualifier to a list of nouns in a requirement.** If a clause applies to some members
  of a list and not others, the list must be numbered and each member answered. This is a lint rule a
  reviewer could run by eye in seconds, and it is the literal text of B1(p2).
- **Adopt a recommendation only with its counter closed or priced.** The verdict handed me A at medium
  confidence with a live counter; shipping A with the counter merely noted would have put an
  unauthenticated call to two third parties into the product and made it ARCH's surprise.
- **Measure your own handoff's numbers.** Pass 2's handoff said 430 lines where `wc -l` said 454
  (N4(p2)). Nothing depended on it — which is why it slipped — but a handoff's measurable facts are
  precisely what a reviewer is asked to trust. Every count in this pass's handoff was measured at write
  time and pasted.
- **Three passes of one blind reviewer against one author was worth it.** Each pass found exactly one
  class of defect, each was cheaper than the last, and the third found a defect introduced by the
  second — which is the case *for* the rework cap and the blind re-review, not against it. What the cap
  cannot fix is the author's composition habit; the matrix can.
