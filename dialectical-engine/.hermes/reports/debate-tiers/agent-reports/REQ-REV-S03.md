# Self-report — REQ-REV-S03 (REQ-REV pass 1, slice S03, ticket `t_f2364116`, 2026-09-13)

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Verdict filed: **REWORK pass 1** — 3 blocking, 7 non-blocking.
Artifact: `docs/missions/debate-tiers/reviews/REQ-REV-S03-p1.md`.
Probes kept: `.hermes/reports/debate-tiers/probes/REQ-REV-S03/{p1-cited-lines.sh, p2-r8-declaration-oracle.mjs, p2-r8-declaration-oracle.out}`.

## 1. The cause of each finding, not the symptom

**B1 (`glm-5.3-flash` already lives in three production files).** The cause is not that REQ missed a
grep. The cause is that **this repo has two different definitions of "an id is declared here" living in
two architecture suites**, and no document names the difference: `tiers-s02-rosters.test.ts:51-60` matches
the **bare** id, `tier01-roster.test.ts:43-52` matches the **quoted** id. Every id in the mission so far
(`gpt-5.6-luna`, `claude-sonnet-5`, …) is a bare word that never appears as a substring of anything else,
so the two oracles agreed on every previous slice and the divergence stayed invisible for three slices.
S03 is the first slice to introduce an id (`glm-5.3-flash`) that is a **substring of two other live
strings** (`z-ai/glm-5.3-flash`, `development:hermes-glm-5.3-flash`). The latent defect was in the test
suite the whole time; V's goal merely dialled it.

*Upgrade:* a mission that pins "exactly one declaration" must state the matcher **in the SPEC**, once,
and both suites must import it. Cost of not doing it: it will re-fire the moment any future model id is a
prefix or suffix of another (`grok-4.6` vs `grok-4.6-build` is already one pair in this repo —
`slices/S02/SPEC-v2.md:37` still spells the short form).

**B2 + B3 (the acceptance contradicts the check).** One cause: **`## 1. Requirements` and `## 2.
Acceptance` were written as two documents.** R20/R21/R23 (the check refuses, nothing is rewritten, only a
passing check restarts) sit ~100 lines above steps 7–10, and each half is internally flawless. Nobody
composed them. This is the single most repeatable REQ failure in this mission's history, and it is
mechanical to catch: **for every acceptance step, name the requirement that makes its first sentence
possible.** Three of eleven steps here have no such requirement, and two have one that forbids them.

*Upgrade (concrete, cheap):* add one column to the acceptance section — `step | requires | blocked-by` —
and make the REQ verification line check that every step's `blocked-by` is empty. That table would have
produced B2 and B3 at REQ time, at the cost of eleven table cells.

**N1/N2 (the `7188b167` vs `9a000c37` constant).** Cause: a commit that fixes a lane is made *after* the
documents that cite the lane, and nothing re-reads them. The same hour produced a correct packet
(`base: 9a000c37`) and a wrong SPEC (`@ 7188b167`) — so the mission held both truths simultaneously and
nobody noticed, because a base and a HEAD are both legitimately quotable and the prose does not
distinguish them.

*Upgrade:* never write a commit id in prose without the word `HEAD` or `base` **and** the command that
measured it. COMMON.md §6 already does this and is right; the slice documents do not and are wrong.

## 2. What repeatedly costs tokens here

1. **Line-citation verification is the single biggest spend of a review pass, and it found nothing.** I
   re-opened ~40 cited ranges in the lane (probe `p1`); **every one was exact**. That is ~25k tokens
   spent confirming a seat's care. It was still correct to spend — a prior pass in this mission (N2's
   ancestor) was caused by exactly this class — but it is the wrong shape of work for a model.
   *Upgrade:* make the citation check a **script**, not a reading. A 30-line checker that parses
   `path:line` pairs out of a SPEC and prints the cited line beside the claim turns 25k tokens of my
   attention into 2k tokens of output I skim. It is reusable by every REQ-REV and ARCH-REV in every
   mission, and it is the highest-leverage tool this fleet does not have.
2. **The same fact restated in four places.** The lane commit appears in COMMON (twice), the intake, the
   SPEC, DECISIONS and INSTRUCTIONS. Every seat reads all of them; every drift costs a finding. One
   generated header block, included by reference, would delete a whole finding class.
3. **The freeze diff cannot attribute hunks.** I had to spend a paragraph explaining that I *cannot*
   prove which seat wrote the intake correction, because the orchestrator squashes its fold and the
   seat's artifacts into one commit. Two commits (or an author line in the body) would make the
   `allowed`-list audit mechanical instead of inferential.

## 3. What I nearly got wrong

- **I nearly reported B1 as an N, then nearly dropped it entirely.** My first pass used
  `tier01-roster`'s quoted-exact matcher (it is the suite the intake quotes first, F1), which shows
  `glm-5.3-flash` in **zero** files — the SPEC looks right. I only caught it because I made myself read
  *both* helper functions before writing the row. **If I had read one suite, I would have passed a SPEC
  that cannot go green.** The general lesson: when a requirement says "the suite stays N/N", read the
  suite's **matcher**, never its assertion.
- **I nearly filed B2 as "R20 is wrong".** It is not: refusing on a model that does not answer is V's own
  sentence. Had I written the finding that way, REQ-FIX would have weakened a rule V chose, and the
  review would have overridden V through a reviewer's misreading. I caught it by going back to the
  intake's verbatim block. **Rule worth promoting: before proposing that a requirement change, find the
  V sentence it came from.**
- **I nearly tiered N4 (the entry→slot derivation) as blocking.** It is a real gap, but R14 states the
  observable and ARCH is the named owner; blowing it up would have cost a rework round for work ARCH
  does anyway.

## 4. Dead ends — do not re-derive these

- **The `/v1` rule is not the only gate.** Already corrected in the intake (F4), and SPEC R11 names both.
  I re-verified it; it holds. Nobody needs to re-check it.
- **Duplicate model ids across two slots are admissible.** I suspected acceptance step 10 (grok in both
  tiers) was impossible at the parser. It is not: `packages/providers/src/index.ts:159-161` de-duplicates
  on `provider_ref` only. Settled — do not re-open.
- **`ui: no` is correct and the DECISIONS quote of the rule is real.** I verified the quoted sentence
  against `heartbeat-requirements` SKILL.md:33-35 rather than trusting it. No further ui debate is owed.
- **`yaml@2.9.0` is in the workspace store but is no package's dependency, and `config/` does not exist.**
  Re-measured in the lane; F11 is accurate.

## 5. Where THIS packet fought me

- **The `allowed` clause vs the deliverable (N6).** `REQ-S03.md` told its seat "INSTRUCTIONS.md (append
  only)" and, four lines earlier, "the S03 row" — into a table in the middle of the file. My packet then
  made me *rule* on the conflict, which is the right move, but the conflict should not exist. Template
  fix: the `allowed` list carries write-scope words that are checkable (`append`, `insert-row`,
  `create`), or it carries none.
- **"≤ 8 lines appended" is not a measurable ceiling** — blanks and headings are not defined as lines.
  `wc -l ≤ 100` is measurable and did its job. Delete the unmeasurable one.
- **My packet gave me the answer to charge 5 before I measured it** ("tier that as N unless…"). It was
  right, and it saved a round-trip — but a reviewer told the tier in advance is a reviewer half-anchored.
  Better shape: give me the *fact* (the row is stale, folded at DECISIONS:106) and let me tier it.
- **"session id" is not a seat identifier (N7).** My CLAIM and REQ's CLAIM carry the identical id because
  the scratchpad path is keyed to the parent session. The marker asks for something the harness cannot
  give a subagent. Replace it with the ticket id + the transcript path, or drop it.

## 6. Toward the one-prompt machine

1. **Ship the citation checker** (§2.1). Highest single lever in this list: it converts the most
   expensive, least creative half of every planning review into a script, and it is mission-agnostic.
2. **Make the acceptance table carry `requires` / `blocked-by`** (§1, B2/B3). Two of my three blocking
   findings would have been impossible to write.
3. **Pin the "declaration" matcher in the SPEC, import it into both suites** (§1, B1). One sentence kills
   a class that will otherwise re-fire on the next id that is a substring of another.
4. **One generated facts header** (lane, base, HEAD, baseline path) included by every slice document
   instead of restated (§2.2) — deletes the N1 class outright.
5. **Separate the orchestrator's fold commit from the seat's artifacts** (§2.3) — makes the `allowed`
   audit mechanical, which is the audit every reviewer owes and none can currently complete.
6. **Keep the blind planning review.** It cost one seat and it caught a requirement that cannot go green
   and two acceptance steps V could not have run. All three were invisible to a reader who trusts the
   document and visible to one who ran two greps.

## 7. Price of this pass

Wall-clock ~35 minutes, one session, no rework of my own, no retries, no dead-end tool loops. Roughly
half the tokens went to the citation sweep that found nothing (§2.1) and to reading the two suites'
helper functions — the ~3k tokens that produced B1. Two probes written and kept, both re-runnable by the
next pass without me.
