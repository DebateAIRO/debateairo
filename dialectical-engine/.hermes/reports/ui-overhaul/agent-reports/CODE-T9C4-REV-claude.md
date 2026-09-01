# CODE-T9C4-REV — blind review self-report (Opus 5, fresh seat)

Ticket t_b7c114a3 · frozen target 174735a · verdict PASS with 3 N-findings.

## What this seat actually did differently, and why it mattered

**The one technique worth institutionalising: I parsed the binding literals OUT OF
`SPEC.md` instead of transcribing them into my probe.** A copy-fidelity cluster is
reviewed by comparing two strings; if the reviewer types the reference string, the
review's sensitivity is capped by the reviewer's own typing, and an em-dash/hyphen
slip produces either a false REWORK or — worse — a false PASS where reviewer and
worker made the *same* transcription error. My probe regex-harvested all 33 backticked
literals from SPEC §Copy and asserted each against the real anonymous render. Result:
31 present verbatim, 2 "missing" — both `bench`, which SPEC lists as the *forbidden*
design word. **The oracle's only two misses were the two that were supposed to miss.**
That is a self-checking gate: it proved the harvester was actually discriminating,
not just matching everything. Cost: ~12 minutes. Replaces an unbounded eyeball diff of
33 strings with one deterministic run. This should be the standard pattern for every
remaining copy cluster (T8, and any slice with a §Copy block).

## What repeatedly costs this mission tokens

**1. Mutants that don't mutate what you think.** My first "within-subtree permutation"
mutant (M3) came back RED and I nearly filed it as "the pin holds". It didn't hold — my
`perl` had *replaced* body 01 with body 02's text, deleting a binding string, so the pin
fired on the deletion, not on the mis-pairing. The true permutation (swap both, both
strings still present) ships GREEN. **A mutant that produces the expected colour is the
most dangerous artifact in a review**, because it terminates the investigation. I now
believe every mutant needs a positive assertion that it changed the thing intended —
mine only asserted the file bytes changed (`cmp -s`), which was not enough. Cost here:
one wasted run plus a near-miss on N2. Cheap fix for the next packet: require mutant
tables to state *what the mutated render now contains*, not just the pass/fail colour.

**2. Gates that print their pass value are not gates.** I ran the AM3 colour oracle and
got residual 0 — then injected a hex and confirmed it moved to 1. Same for ADR-006:
0-new from the workspace root, rc=2 from the git toplevel, and the baseline filter
removed to show the two dated errors were really there. This is ADR-006's own standing
rule ("a gate only ever observed printing its pass value has not been shown to be a
gate") and it is the single highest-leverage habit in this fleet. It should be lifted
out of ADR-006 into the spine, because it is not a fact about TypeScript.

**3. The dispatch manifest went stale mid-review — see N3.** My packet named four live
parallel-lane files and said my target was not among them. The parallel lane then wrote
`tests/render/t9-landing.test.tsx` — row 5's own write surface — at 04:18:24, while I
was reviewing. It was *legal* (describe-block split, it touched only T9-C2's block), but
the packet asserted the opposite. I caught it only because my final byte-clean sweep
disagreed with my own start-of-session SHA baseline. **The `cp` + SHA baseline taken at
minute one is what made this detectable at all** — without it I would have had to guess
whether the motion was mine, the worker's, or the lane's. Every review seat should take
that baseline before reading anything; it costs one command.

## What I nearly got wrong

I nearly reported "byte-clean FAILED on my target test file" as a blocking integrity
problem. The correct move was to timestamp it: `stat` said 04:18:24, my gate runs all
reported 14 tests (the frozen count; the addendum makes 15), and the frozen T9-C4 block
diffed identical. So every piece of evidence predated the write and the verdict stands.
**Reviews need a clock, not just a hash.** Had I run one gate after 04:18 without
noticing the count change from 14→15, I would have had a silently mixed evidence set.

## Dead ends, so nobody re-derives them

- Hero secondary CTA `href="#transcripts"` is pinned by **nothing** (T9-C4-5 asserts only
  that the secondary exists; T9-C2's stub-safety test is scoped to `chrome`). I chased
  this as a candidate finding and it is not one: R4 explicitly permits `#`, R5 requires
  only that the label be visible, and the shipped value actually resolves to
  `LandingSample`'s `id="transcripts"` — stronger than contract. Not a defect.
- Duplicating the hero headline into the sample subtree ships GREEN. Also not a defect:
  nothing forbids it and no requirement is violated. Recorded so the next lens doesn't
  spend a run on it.
- `METHOD` / `THE METHOD` are absent from SPEC §Copy but present in T9-S4's inventory row.
  Legitimate, not a leak.

## Where the packet fought me

The packet was unusually good — the read order, the Supersessions block, and the explicit
"which cell pins ITS href, if any?" prompt all directed effort correctly, and that last
one is what made me check R4/R5 rather than assume. Two frictions: (a) the Supersessions
manifest was wrong about my own target file (N3); (b) it asked me to confirm the cards
are "STATIC (no DebateCanvas/scoring/data imports; server components)" without naming the
oracle — I settled it in one command by observing that the only import in all four files
is `import type { JSX }`, which is a strictly stronger claim than any denylist grep and
should be the published form of that check.

## One-prompt-machine upgrades, ranked

1. **Harvest reference strings from the contract, never transcribe them.** Publish the
   harvester as a shared helper so every copy cluster's reviewer runs the same one.
2. **Mutant tables must record the post-mutation render content**, not just RED/GREEN —
   this is what would have caught my M3 error automatically.
3. **Promote "show the gate's count move" from ADR-006 into the spine** as a universal
   law about acceptance commands.
4. **Dispatch manifests should be generated at dispatch AND re-checked at verdict**, with
   the reviewer instructed to diff the two. Mine was ~9 minutes stale and named the wrong
   file set; a verdict-time regeneration would have flagged it without my noticing by luck.
5. **Give reviewers a start-of-session SHA baseline instruction explicitly** (my packet
   implied it via "cp backup + SHA restore", framed as isolation hygiene — its real value
   turned out to be concurrency detection).

---

# REV2 append — re-verdict on the AM10 pairing addendum (dd2ba147, t_131b2e6e, epoch 18)

Verdict: **ADDENDUM SOUND**, one non-blocking scope-exceeding residual (N4).

## The loop closed, and it is worth recording as a loop

N2 from my first pass became AM10, and the same worker session implemented it inside one
round. Total elapsed from my verdict (04:21) to the addendum commit: under an hour, one
file, one hunk, 22 insertions. **This is the cheapest possible shape for a finding** and
it is worth naming why it was cheap: N2 arrived with a reproduction (the exact mutant),
a diagnosis (containment vs positional), and a named remedy (extend the existing tuple,
same loop). The worker did not have to re-derive anything. Compare the mission's
expensive findings, which arrived as symptoms and cost a full seat cycle to localise.
**A finding's cost to the fleet is set by how much derivation the reporter did, not by
its severity.** That should be a line in the reviewer contract.

## What I checked that the packet did not ask for, and why

The packet asked me to rebuild M3 with a different body pair. I did (03↔04 and the
worker's 01↔02, both RED), and added a **3-cycle** because a two-element transposition is
the easiest permutation to accidentally special-case; a 3-cycle has no fixed point among
the rotated elements and would catch a pin that compared only pairs. RED as well.

Then I probed the property the new pin does NOT have: **exclusivity**. The assertions are
`toContain` against each `<li>`'s `textContent`, so they prove each body sits in its own
step — not that it is the ONLY body there. I rendered every `<li>` with all four bodies
concatenated: **16/16 GREEN**. That is N4. I am deliberately reporting it as
scope-exceeding rather than as a defect: AM10's cell says bodies must "sit beside their
own titles, not merely somewhere in the method subtree", and the addendum delivers exactly
that. Exclusivity is a strictly stronger claim nobody asked for, and the degenerate render
is not reachable from the current source shape. **I do not think it justifies a round**,
and I said so in the verdict rather than letting a reviewer's reflex to find something
convert a measured curiosity into work.

## Near-miss: my pathspec was silently returning nothing

Twice I ran `git diff <range> -- dialectical-engine/tests/...` from inside
`dialectical-engine/` and got **empty output**, which reads identically to "no changes
here". I initially recorded "0 tests added by 3a637d35" from one of those empty results —
which was wrong; it added one test to the T9-C2 block. The un-pathspec'd diff had already
shown 25 insertions in that file, and the contradiction is the only reason I caught it.
**An empty result from a filtered command is indistinguishable from a clean result**, and
this is the same class as ADR-006's anti-gate: a filter that silently matches nothing
reports the pass value. My habit fix: whenever a pathspec/filter returns empty, re-run it
without the filter once and confirm the totals move. Cost: ~4 minutes and one wrong
intermediate number that never reached a board write.

## Accounting reconciled, because the counts moved under me again

Row-5 is now **70/70** where the worker reported 69/69, and render is 107 where they
reported 106. Both deltas are exactly `3a637d35` adding one test to the **T9-C2** block
("keeps Create one query-free when next is absent"), which touches **0** T9-C4 lines. The
worker's numbers were correct for their tree. This is the second consecutive review in
which the shared test file moved under me mid-verdict — first uncommitted (REV1/N3), now
committed and declared. The declared form cost me nothing because the packet named it;
the undeclared form cost me a false integrity scare. **The fix is not fewer parallel
lanes, it is that every packet states the expected suite counts AND the commit that will
change them** — REV2's packet did the second half and should do the first half too.

## Upgrade, ranked additions to my REV1 list

6. **Findings should ship with reproduction + diagnosis + named remedy.** N2 did, and
   converted to a merged fix in one round with zero clarification traffic. Make that the
   required finding format, not prose.
7. **Packets should publish expected gate counts, not just gate commands.** "Row-5 3x"
   without "expect 70/70" makes every count change look like a possible regression and
   forces the reviewer to reconstruct the arithmetic from unrelated commits.
8. **Treat empty output from any filtered command as unverified, never as clean.**
   Generalises ADR-006's anti-gate law from compile gates to `git diff` pathspecs, greps,
   and oracles — I hit it live in this very review.
