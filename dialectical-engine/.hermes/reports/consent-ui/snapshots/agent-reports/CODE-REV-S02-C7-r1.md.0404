# Self-report — CODE-REV-S02-C7, round 1 (Claude Opus 5, reviewer, mission `consent-ui`, slice S02)

**Fresh blind session, 2026-09-07. Worktree `.worktrees/rev-s02-c7/dialectical-engine`, detached
at `9cc81351`, `git status --porcelain` 0 entries at CLAIM and 0 entries at handoff.**
This file is NEW — `ls` returned `No such file or directory` before writing (COMMON §10.33).

> treat it like a murder case. I want to get a nice report on what can be done better. What we
> must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How
> can we turn this into a one prompt machine even better.

---

## 1. The finding I nearly did not make, and the instrument that made it

**What I nearly got wrong.** I opened the review expecting the fight to be `queueMicrotask`
(PACKET DEFECT 1). It took four measurements to settle and then it was over. The finding that
actually matters — **N1, `input.focus()` pinned for one entry point out of three** — came from a
question the packet did not ask: *constant (5) says "whatever the entry point"; which cases prove
it?* I built mutant **R9** (`if (event.target === input) input.focus()`) on that suspicion alone.
It survives all 14 cases. My own probe P8 then showed the shipped code is right for all three
entry points — so nothing ships broken, but the a11y property that keyboard users depend on is
one careless edit from silently regressing.

**The class, named:** *a constant whose wording quantifies over N cases ("whatever the entry
point", "each of the three routes", "every dismissal path") is pinned for exactly the cases a
reviewer counts.* Three of this cluster's four coverage gaps (N1, N3, N4) are the same shape:
the code satisfies a universally-quantified sentence, and the suite tests one instance of it.

**UPGRADE — cheap, mechanical, and it would have caught all three before dispatch.** Every packet
constant written with a universal quantifier carries, in the same sentence, **the case id that
pins each member**. Constant (5) would have read: "focus return lands on the input whatever the
entry point — square `S02-S53/54/55/56`, text ??, control ??" and the two `??` would have been
visible to the ARCH seat, the coding seat and me. The PLAN already does this for the mirror arm
(it names all six steps). It does not for focus. **Price of not doing it: one N-finding that took
me ~20 minutes to build a mutant for, and a latent a11y regression with no guard.**

## 2. What repeatedly cost tokens

**2.1 The 172 KB PLAN and the 60 KB SPEC.** I read `PLAN.md:929-1180`, `:1355-1420` and
`:1440-1520` — 250 lines out of 3,000+ — plus five `grep -n` sweeps of the SPEC. That was the
right call and it was only possible because MY packet cited exact ranges. **Every range it cited
resolved** (`:929` is the cluster header, `:1475` is the C7 row, `:934-938` is the click rule).
COMMON §10.24 is working. **Keep it; it is the single highest-leverage line in COMMON.**

**2.2 A dead end that cost ~10 minutes and is worth naming so nobody re-derives it.**
To prove `modalSemantics.ts` changed in COMMENT lines only I reached for
`ts.transpileModule(..., { removeComments: true })`. **The repo's `typescript` is 7.0.2 — the
native port — and its JS entry exports only `{ version, versionMajorMinor }`.** No
`transpileModule`, no `ScriptTarget`. Two failed runs before I inspected the module. I wrote a
36-line comment-stripping state machine instead, **validated it on a known-BAD input**
(`const a = "// not a comment";` must survive) and diffed: **118 statement lines both sides,
IDENTICAL**. Kit promoted as `code-rev-s02-c7-r1-strip-comments.mjs`.
**TOOLING-TRAPS candidate:** *"`require('typescript')` in this repo gives you a version stub, not
the compiler API. Any seat writing a comments/AST probe must check `typeof ts.transpileModule`
first."*

**2.3 My own shell bug, 3 minutes.** I wrote a two-arg bash wrapper and passed three, so
`sys.argv` was off by one and Python tried to `eval` a prose label. Same family as the author's
F4 (zsh word-splitting). **The rule that would have saved both of us: a probe runner takes its
inputs by NAME, never by position.** My promoted `mutate.py` and `combo.py` do
(`<LANE> <MUTANT> [files…]` with an `assert count == 1` on the anchor), which is why every one of
the 25 mutant runs either applied exactly once or refused to run.

## 3. Where THIS packet fought me — and where it was excellent

**Excellent, and I want it kept verbatim in the next reviewer packet.** §4 handed me the exact
charges the orchestrator could not settle, each phrased as a *measurement*, not an opinion:
"re-plant M10 yourself", "judge it for jsdom AND for a spec-conformant browser", "build the route
the ticket feared and measure", "plant the mutant that removes it and say what happens". **Four
of my eight findings are direct products of those four sentences.** A charge that names the
experiment is worth ten that name a worry.

**Where it fought me — one place, and it is small.** §4's F2 charge pre-commits the remedy:
*"If dead, the remedy is a ticket to remove it."* The measurement came back **"dead as behaviour,
live at the tracker level"** — my P3 probe shows tracker `true`/DOM `false` without the resync and
`false`/`false` with it, on the very route the charge described. Neither branch of the packet's
dichotomy fits, and I had to write a third answer. **UPGRADE:** a charge that pre-commits a remedy
should end "…or say why neither fits". One clause, and the reviewer stops feeling they are
arguing with the packet instead of reporting a measurement.

**Second, smaller:** §2 ordered me to "assert the SPEC's verbatim copy and both-mode token usage".
C7 adds **no CSS and no tokens** — its two files contain 0 colour literals — so half that
instruction was vacuous for this cluster. I discharged it as "0 literals in all four touched
files" and asserted the copy from a real render (P6, byte-exact against both `SPEC.md §Copy` and
`design/turn-8a-checkbox-group.html:4,8`). **A generic §2 checklist across clusters of very
different shape spends a seat's attention on empty boxes.** Per-cluster §2 lines, or an explicit
"N/A for this cluster because …" written by the orchestrator.

## 4. The one-prompt machine — three concrete upgrades, in priority order

**4.1 Promote the CONFORMANT-ENVIRONMENT SHIM to a standing technique.** This mission has now
produced **two** findings of the identical shape, in two consecutive clusters, both invisible
under stock jsdom and both made observable by shimming ONE method to be spec-conformant:
- C5/C6 → C1: `Node.prototype.compareDocumentPosition` answers `37` in both directions; the
  detached-**incumbent** guard was called "unpinnable" until commit `511d30b6` shimmed it.
- C7: `_legacyCanceledActivationBehavior` **re-toggles** instead of restoring; the packet's
  BINDING constant (3) was measured correct in a browser and is wrong under jsdom.

**The class is: jsdom deviates from the standard in a way that makes a real property
unobservable, or an unreal one observable.** The recipe is three lines and identical both times —
save the real method, install a conformant one, **assert its consistency as a precondition inside
the case so it can never silently degrade**, restore in `afterEach`. Both my P0/P1 and the
author's commit-2 case do exactly this. **Put the recipe in TOOLING-TRAPS as a named technique
with both instances beside it, and add one line to the worker/reviewer floor: "when a property
cannot be discriminated, ask whether the ENVIRONMENT is conformant before concluding the property
is unpinnable."** That sentence alone would have saved the C5/C6 seat a whole "unpinnable" note
and this cluster its argument with a BINDING constant.

**4.2 Ship the "who pins this?" column.** §4.1 above, generalised: the PLAN's cluster map already
has a *"Mutant class the command detects"* column and it is genuinely good — every mutant it names
(`preventDefault` on one entry point, the R17 mirror left `true`, `disabled` hard-coded, the modal
inside the form) I reproduced as RED. **What it lacks is the inverse column: properties the
command does NOT detect.** The author volunteered three (F2, F3, and the type-attribute count);
I found four more (R1 re-entrancy, R3 redundant close, R9 focus, R7-masked-by-member-2). Seven
undetected properties, all discoverable in one pass, none of them written down anywhere the next
seat will look. **A "NOT detected by this command" cell, filled by ARCH and audited by the
reviewer, converts my four hours of mutant work into a checklist.**

**4.3 Defence-in-depth must be labelled with what it MASKS, not only with what it protects.**
Member 2 (the dismissal resync) is documented — correctly and honestly — as "changes no
observable outcome today". Measured, that is true at HEAD (M7: 14/14 green). What nobody wrote
down is the other half: **member 2 is what makes five of the six mirror-arm routes stop
discriminating a member-1 regression** (R7 alone: 1 RED; R7+M7 together: 6 RED), and it is what
makes the acknowledgement's own mirror write invisible (M5: 14/14 green, because
`PrivacyPolicyModal.tsx:138-139` calls `onAcknowledge?.()` **then** `onClose()`). The B1 defect
cost this mission a full architecture rework round; it is now pinned by exactly ONE case.
**Rule: every "defence in depth" line in a PLAN carries a measured sentence naming which OTHER
assertions it makes vacuous.** It is one extra mutant run per redundancy and it is the difference
between six guards and one.

## 5. Dead ends, so nobody re-derives them

- `require("typescript")` for an AST/comment probe — see §2.2. **Version stub only.**
- **`R5` (moving `input.focus()` after `setPolicyOpen(true)`) is NOT a defect** and correctly
  catches nothing: React commits the state at the END of the dispatch (measured in P2 — the
  document-bubble listener already sees `dialog=true`), so both orders focus the input before the
  helper captures the opener. Do not file it.
- **`R6` (`setTimeout` for `queueMicrotask`) catches nothing** and is not evidence that the
  microtask is wrong — it is evidence that the resync is inert (N2). Two different questions.
- **Do not try to pin the re-entrancy guard with `element.click()`.** The HTML spec's
  *click in progress* flag is set by the `click()` METHOD, so a nested `input.click()` is a no-op
  and the mutant survives. A **dispatched `MouseEvent`** does not set that flag: my P4 measured
  `handlerRuns=2, dom=true` with the guard removed and `handlerRuns=1, dom=false` with it. **That
  is the only instrument that sees this property in jsdom.**

## 6. Prices

| Item | Price |
|---|---|
| Reading (COMMON, INSTRUCTIONS, BASELINE, 250 PLAN lines, SPEC greps, both packets, ticket thread, review package) | ~35 min |
| 3 cluster commands × 3 runs × 2 arms (script + inline) + 5 standing gates | ~12 min wall clock, all VERDICT=0 |
| 25 mutant runs (16 re-planted from the author's matrix, 9 of my own) | ~45 min |
| The 9-case probe kit (P0-P8), including the two environment shims | ~50 min |
| The `typescript` dead end | ~10 min |
| Verdict + self-report | ~30 min |

**Highest return per minute:** the four §4 charges (four findings) and mutant **R9** (one finding,
built on a suspicion the packet never raised). **Lowest:** re-planting the author's 16 mutants —
every single one reproduced to the case. That is a strong signal about this author and a weak use
of a reviewer. **UPGRADE: when an author's matrix is a table of `mutant | Tests | cases RED`, a
reviewer should re-plant a stratified SAMPLE (the load-bearing ones and the NOT-CAUGHT ones) and
spend the rest of the budget on mutants the author did not write.** The NOT-CAUGHT rows are where
every one of my findings lives.

---

**Blind-lens statement.** I read no other lens's verdict on this work. I read
`CODE-REV-S02-C5C6-r1` and `CODE-REV-S02-C3C4-r1` findings **only** as they were quoted into my
own packet and the author's — prior verdicts on DIFFERENT work that these follow-up commits exist
to discharge, which COMMON §10.26's addendum makes requirements documents for them. Every
measurement in my verdict came from a probe I wrote and ran in my own worktree.
