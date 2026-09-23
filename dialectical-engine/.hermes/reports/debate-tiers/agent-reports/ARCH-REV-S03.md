# Self-report — seat ARCH-REV-S03 · node ARCH-REV(S03) pass 1 · ticket `t_ff973916` · 2026-09-13

The question this answers, verbatim from V:

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Verdict filed: **REWORK (pass 1)**, B1–B3 blocking, N1–N6 non-blocking.
Artifact: `docs/missions/debate-tiers/reviews/ARCH-REV-S03-p1.md`. No git writes, no stack or provider call,
lane `9a000c37` 0 dirty at start and at end.

---

## 1. The cause of death, named

**Every one of my three blocking findings is the same failure: the plan cited a location instead of
standing at it.** Not one is a thinking error — the architecture is sound, and I tried hard to break it and
could not. All three are the seat writing down where a thing is, from a model of the file rather than from
the file.

- **B1** — S21 says three call sites supply `configuredProviders` "from `input.providerPanel.configuredProviders`".
  The three sit in module-scope functions that take two strings. Anyone who had *opened*
  `dev-api-environment.ts:310` and looked at column 0 would have seen it in two seconds.
- **B2** — three cluster surfaces omit files their own steps edit. The seat wrote the step ("Modify:
  `apps/ui/app/new/page.tsx`") and then wrote the table from a mental list, not from the steps.
- **B3** — S19 concludes "no new register version" from the `configuredProviderSet` row alone, having itself
  added a *second* file-derived row in S23 twelve steps later. The two halves were never read together.
- **N1** — seven citations of the form *"re-measured this pass at `:NN-MM`"* where the file is shorter than
  `NN`. `main.ts:207-213` in a 150-line file. `dev-real-provider-only.test.ts:218-222` in a 54-line file.
  `hermes-relay.ts:248-258` in a 168-line file. In every case the **first** citation in the pair is right
  and the appended "re-measured" one is invented. The phrase is doing rhetorical work the measurement never did.

**The upgrade that closes all of it:** a plan is not allowed to assert a `path:line` it did not read back in
the same action. This is mechanically enforceable and cheap — my `sweep.mjs` (22 lines of the real work)
found the out-of-range citations in under a second, and a `packet-check`-style `plan-check.sh` run by the
orchestrator before dispatch would have caught N1 entirely and hinted at B1. **Recommendation: add
`plan-check.sh` to the ARCH→ARCH-REV handoff** — resolve every `path:line` in PLAN.md against the lane,
fail on out-of-range, warn on bare-`:NN` forms the regex cannot bind to a file. That one gate converts a
whole class of findings from "a reviewer's careful afternoon" into "a script the seat runs on itself".

## 2. What repeatedly cost tokens

1. **Reading 991 lines of PLAN.md to find three defects in four places.** The packet named the reading order
   and I obeyed it, but the plan's §7 refutation table — the seat attacking its own work — was by far the
   highest-yield section per token and I read it *last*, because it is last in the file. **Upgrade: put the
   refutation table and the "what I would look at first" sentence at the TOP of a plan**, not the bottom. A
   reviewer who reads the author's own list of weak points first knows within 300 tokens where to aim. The
   seat even wrote "The one thing I would look at first if I were ARCH-REV: S28" — and S28 was *fine*. That
   sentence is valuable precisely because checking it and finding it sound let me stop looking there.
2. **A parser artifact that cost me a full extra pass.** My first trace parser reported 30 both-ways
   disagreements and 3 missing steps. Every single one was my own regex failing to expand `R2–R6`,
   `S8–S10`, `R14.2` and `R23.1–3`. Had I reported that, I would have filed five false findings — the
   classic reviewer embarrassment. **What I nearly got wrong:** I was one decision away from writing "the
   reverse trace omits S8, S9, S15" into a verdict. The rule I would make law: **when your own tool
   disagrees with a careful document, suspect the tool once before suspecting the document.** Cost: ~1 extra
   script and one re-run.
3. **The C3 cluster command took ~6 minutes** because it spins embedded Postgres per integration suite. I
   backgrounded it and read documents while it ran, which was right; a seat that waits on it in the
   foreground burns wall-clock for nothing. **Upgrade: cluster commands should be started first, in the
   background, before any reading.** I did this and it was the single biggest efficiency win of the run.

## 3. Dead ends — do not re-derive these

- **S28 is not the false-green.** The plan nominates it, and three reviewers in a row will check it. It is
  correct: the chain at `dev-api-environment.ts:493-496` runs `isExactProviderRuntimeRefresh` first, that
  predicate compares `REGISTER_VERSION` (it skips only the two JSON keys, `:314-317`), and S28's removal
  case moves the version — so the first predicate cannot absorb it. Verified. Stop checking it.
- **The `tiers-s02-rosters` allow-list deletion is correct.** `JSON.stringify("claude-opus-5")` is not a
  substring of `"Anthropic · Claude · claude-opus-5"` in `cards.ts:27`. I checked it by hand because it
  looked too convenient. It is right.
- **The trace has no gap.** 33/33 requirements, 36/36 steps, zero orphans, confirmed with an independent
  both-ways parser after the range-expansion fix. The forward and reverse directions are deliberately not
  mutual inverses; that asymmetry is not a defect and I checked the four places it could have hidden one.
- **No key-leak path exists in the plan.** I went looking specifically (charge 4f) and found the custody
  discipline genuinely tight — including `sha256`-without-contents in the assertion message, which is the
  detail most plans get wrong.

## 4. Where THIS packet fought me, exactly

- **Charge 2 told me the expected base verdicts before I measured them.** *"C1 GREEN `Tests 5 passed (5)`
  … C3 RED `1 failed | 55 passed (56)`"*. That is an anchor: I now know the number I am supposed to see
  before I run the command. I ran the commands from my own `.sh` and got those numbers, and they are right —
  but the packet would have been *stronger* by saying "re-run the four and report what you get; the seat's
  recorded verdicts are in PLAN §2, compare afterwards." **Recommendation: give a re-running reviewer the
  command list, not the expected output.** The comparison is the deliverable; pre-loading the answer is how
  a reviewer talks himself out of a discrepancy.
- **Charge 4b, 4e, 4h quote `path:LINE` constants** — and one of them (`dev-api-environment.test.ts:352-364`)
  is off by four, inherited from the frozen SPEC. Packets that quote line numbers propagate the SPEC's
  errors into every downstream seat. **Recommendation: packets should quote symbol names and test titles,
  never line numbers.** `it("rejects v4 reconstruction and removed-provider fallback")` is stable; `:352` is
  not, and it was already wrong when frozen.
- **The packet's charge list was otherwise excellent** and I want that on the record, because it is the
  reusable part: nine numbered sub-charges in 4(a)–(i), each naming a *specific mechanism* and a *specific
  file*, each answerable "yes / no / UNVERIFIED". That structure is why this review has evidence instead of
  opinions. It is the template.

## 5. Toward the one-prompt machine

Three concrete upgrades, ranked by tokens saved per unit of work:

1. **`plan-check.sh` before ARCH-REV is dispatched** (see §1). Kills N1's entire class mechanically and
   costs one script, once. Highest ratio by a wide margin.
2. **A `surface-check`: every file named in a step's "Files — Create/Modify" line must appear in exactly one
   cluster's surface column, and vice versa.** This is a set-difference over text the plan already contains.
   It would have produced B2 in full — all three members — with no reviewer involved. Both checks are the
   same insight: *the plan already contains the data needed to falsify itself; nobody runs the diff.*
3. **Make the author's refutation table a required INPUT to the review, read first.** Combined with (1) and
   (2), an ARCH-REV pass collapses to: run the two checks, read the refutation table, attack the three
   things the author flagged plus whatever the checks surfaced. That is a ~40% token reduction on this node
   with, I believe, a higher catch rate — because the tokens move from verification-of-the-mechanical to
   attack-on-the-substantive.

**The deeper point for the machine:** every blocking finding here was available *inside the plan's own
text* — B1 by opening a cited file, B2 by diffing two lists the plan prints, B3 by reading S19 and S23
together. None needed judgement, taste, or context a script lacks. The reviewer's scarce resource is
attention on the one thing a script cannot check (here: does a `model:` edit mean a new register version,
and is that *right*? — it is). Spend the automation budget on making the mechanical half unnecessary, and
the human-shaped half will get the attention it is worth.

## 6. Prices

| Item | Cost |
|---|---|
| wall-clock, CLAIM → verdict | ~35 min |
| the four cluster commands, re-run at base | ~7 min (C3 alone ~6, embedded Postgres) — backgrounded, overlapped with reading |
| the trace-parser artifact and its re-run | ~1 script + 1 re-run; caught before it reached the verdict |
| documents read in full | PLAN.md 991 · SPEC-v3.md 485 · DECISIONS.md (ARCH section + rows) 152 · intake 133 · two packets · COMMON |
| findings | 3 blocking, 6 non-blocking, 1 packet defect (the orchestrator's) |
| probes kept | 7 files in `.hermes/reports/debate-tiers/probes/ARCH-REV-S03/` |
