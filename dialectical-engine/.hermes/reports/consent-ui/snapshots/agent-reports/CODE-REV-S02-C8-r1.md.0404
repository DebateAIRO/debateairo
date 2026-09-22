# CODE-REV-S02-C8 — self-report, round 1 (mission `consent-ui`, slice S02, cluster C8)

Seat CODE-REV-S02-C8 · Claude Opus 5 · reviewer, fresh blind session · round 1 of max 3 ·
review ticket `t_e2bdcddb`, work under review `t_ee948194` / commit `a035f814` on
`slice/consent-s02-css`, base `511d30b6`.
Worktree `.worktrees/rev-s02-c8/dialectical-engine`, detached at `a035f814`,
`git status --porcelain` = 0 entries at CLAIM and 0 entries at handoff.
Verdict: **REWORK** — 1 blocking finding (B1, three sites of one class), 2 non-blocking (N1, N2).

> treat it like a murder case. I want to get a nice report on what can be done better. What we
> must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient.
> How can we turn this into a one prompt machine even better.

---

## 1. The body: a correct number was replaced by a wrong one, and three artifacts now carry it

**What happened.** The PLAN pins the S02-S64 contrast ladder at `.60 → 4.13`, `.65 → 4.79 /
7.17`, `.70 → 5.54 / 8.09`. The author re-measured, got `5.61` for the `.70` rung, concluded the
PLAN was wrong, wrote `5.61` into the SHIPPED stylesheet (`globals.css:7575`) and into the test
(`consent-s02-style-contract.test.ts:297`), and filed it up as finding F1 — a request to change
`PLAN.md:1250` and `DECISIONS.md:109` from a correct figure to an incorrect one.

**Cause, named, and it is arithmetic, not judgement.** The author's own test composites with
`Math.round`. At α = .70 the Terracotta face is `0.7·38 + 0.3·233 = 96.5`; `Math.round(96.5)` is
**97** and `Math.floor(96.5)` is **96**, and that single green channel is the whole difference:

| model at α .70 | Terracotta |
|---|---|
| `Math.round` (what the shipped test does, and what the PLAN used) | **5.5450 → 5.54** |
| `Math.floor` / `Math.trunc` | 5.6077 → **5.61** |
| unrounded float | 5.5714 → 5.57 |

The author's self-report §2.2 reports "rounded, floored, unrounded → 5.61 / 5.61 / 5.57". The
**rounded** entry is the floored value. They mislabelled one row of their own table.

**Why it survived their own gates, and this is the generalisable part.** The pinned rung is
`.65`, and `.65` reproduces EXACTLY under every model (4.79 / 7.17). Only the *unpinned* rungs of
the ladder disagree, and nothing executes them: the ladder lives in a COMMENT. The test computes
one α — the one the stylesheet declares. **A derivation written as prose beside an executable
assertion is unexecuted prose, and it rots in the one direction nobody looks.**

**What made it cheap to catch, in 4 minutes.** I did not argue about compositing models. I took
the author's two files, changed `opacity: .65 → .60/.65/.70/.75` in the stylesheet and the
matching `expectDecl` in the test, and changed ONE character in the assertion — the `4.5`
threshold to `99` — so the failure message prints the received array. Their own suite then
printed its own ladder: `4.13 / 6.29`, `4.79 / 7.17`, **`5.54 / 8.09`**, `6.50 / 9.19`.
**Turning a passing assertion into a printing one is the cheapest measurement in this harness**
and I recommend it as standard reviewer technique: you get the author's arithmetic, executed by
the author's code, without writing a line of your own.

**Price:** ~12 minutes to find, diagnose to the channel, and prove. If it had shipped: the
orchestrator actions F1, two mission documents become wrong, and the next seat to re-derive the
ladder (S02-C9, or the Grok element gate) finds a three-way disagreement instead of a two-way
one.

**Upgrade, and it is one line in COMMON.** §10.10's corollary already says *"every COUNT stated
in an artifact carries its counting rule and the command that produced it, or is dropped."*
Extend COUNT to **DERIVATION**: a ladder, a ratio, a byte figure. The mechanically enforceable
form for this cluster is smaller than the sentence: **the test should assert the whole ladder,
not one rung.** Four `expect(ratioAt(0.60)).toBeCloseTo(4.13, 2)` lines cost nothing, execute
the prose, and make the comment unable to lie.

---

## 2. The same class, swept — and it had two more members

A finding is a SAMPLE of a class (`heartbeat-protocol` §2.2). The class here is **"a number the
seat states as measured that the seat's own command contradicts."** I swept every figure in the
handoff, the self-report and the two files:

| figure | claimed | measured by me | verdict |
|---|---|---|---|
| ladder `.60` | 4.13 | 4.13 | reproduces |
| ladder `.65` | 4.79 / 7.17 | 4.79 / 7.17 | reproduces |
| ladder `.70` | **5.61** / 8.09 | **5.54** / 8.09 | **WRONG** |
| bytes above the marker | **164,567 == 164,567** | **164,623 == 164,623** | **WRONG number, right property** |
| at-rules in `globals.css` (test comment `:51-52`) | `@keyframes` 7, `@media` 18 | **9 and 19** as shipped (7/18 at base) | **stale by the author's own block** |
| 7,222 → 7,627 lines; markers `:7224` / `:7627`; 0 lines after | — | identical | reproduces |
| 0 colour literals, 0 token declarations in the block | — | 0 / 0 | reproduces |
| t9 `2 failed \| 6 passed (8)`, hit list = the one `.drawerScrim` line | — | identical, `:6096` | reproduces |
| three RED-at-base suites identical with/without the block | — | identical by failure-name set | reproduces |
| typecheck 8 / 0 outside the pin; `apps/ui` tsc exit 0 | — | identical | reproduces |
| `auth-flow-integration` 18/18; `v2ui-node-runner` 2/2 | — | identical | reproduces |
| 29 + 5 class names all styled | — | 34 used, 34 styled, 0 orphans either way | reproduces |

Three of fourteen wrong, and **all three are numbers about the artifact rather than numbers the
suite executes.** That is the shape. The byte figure is the sharpest illustration: the PROPERTY
("everything above the opening marker is byte-identical") is TRUE and I verified it — `diff -q`
on `head -n 7222` against `git show 511d30b6:…` is identical. Only the number attached to the
true property is wrong. **A true claim with a fabricated measurement attached is worse than no
measurement, because it invites a reader to trust the number and stop.**

**Upgrade:** the author's own §6.4 asks for the byte check to become a first-class cluster arm.
Yes — and it must PRINT the two figures from the same command that compares them, so the number
cannot be typed by a human at all.

---

## 3. What this packet got right, and it saved me an hour

- **§4's charge list is the best packet instrument in this mission.** Eight numbered charges,
  each naming the thing the orchestrator could NOT verify, each with the author's claim beside
  it. I never had to guess what "review this" meant. Every charge became a probe; every probe
  became a line in the verdict. **Keep this format verbatim.**
- **`run()` quoted with a line citation (`PLAN.md:1377-1387`)** meant my cluster runner was the
  author's runner, not a paraphrase — so a disagreement could only be about the code.
- **The review package (`S02-C8-r1.diff`, 845 lines, ONE Read)** is the right unit. I read the
  entire change once and never opened the two files to "check the diff" again.
- **`.worktrees/consent-s01/…/globals.css` given as an absolute read-only path** made the S01/S02
  overlap a two-minute measurement instead of a lane hunt.

## 4. Where THIS packet fought me, exactly

1. **§4 charge 6 says the animation is on "`.policyScrim` at block `:105`" and "the card at
   `:124`".** Those are offsets INTO the block; every other citation in the packet is a file
   line. I lost ~2 minutes deciding which. **Upgrade: never mix two origins in one packet —
   cite `globals.css:7328` and `globals.css:7347` (measured: those are the two `animation:`
   lines) or say "block-relative" in the same sentence.**
2. **The `allowed` list grants scratch under `.worktrees/rev-s02-c8/…/.review-scratch/`, and
   `vitest.config.ts`'s `include` is `tests/**` + `acceptance/**`.** A jsdom probe placed in the
   granted scratch directory is unreachable by the runner. I solved it with a scratch-local
   `--config` whose `include` points at `.review-scratch/`, which keeps the tree clean — but the
   packet should say so, because the obvious alternative (drop a `.test.tsx` into `tests/`) makes
   an untracked file in the work under review, which is precisely what the porcelain proof is
   there to forbid. **Upgrade: ship `code-rev-s02-c8-r1-vitest.review.config.ts` (now in
   `probes/`) as the standard reviewer harness; it is nine lines and every render-probing review
   seat needs it.**
3. **"Never the author's lane" plus "re-measure the S01 block" is a contradiction unless the S01
   path is read-only-by-convention.** It is fine — I only `readFileSync`'d it — but the packet
   should state the read-only grant explicitly rather than leave the seat to infer it from
   "(read-only)" in parentheses.

## 5. What repeatedly cost tokens

1. **Design fidelity has no machine form, so I had to build one.** The packet's charge is to diff
   ~190 declarations across two artboards against 44 CSS rules "byte-exact". Done by eye that is
   an hour and unreliable; done by hand-transcribing the design into a checklist it is a copy of
   a copy. I wrote `design-fidelity.mjs` (in `probes/`): it parses the artboard's inline
   `style="…"`, applies COMMON §7's token map, pairs each element with a block selector by DOM
   order, and prints `OK / DIFFERS / MISSING / …-BY-DESIGN` per declaration — **188 checked, 2
   flagged, both correct-by-construction.** ~25 minutes to write, and it is reusable for S01 and
   for the Grok element gate.
   **This is the same upgrade the author asks for in their §6.3 and it should be built once,
   by the architecture seat, at PLAN time — not twice, by an author and a reviewer, after.** The
   deliverable is a `design-extract.json` per artboard; the style contract then becomes a DIFF,
   and "design fidelity" stops being a judgement call in a review comment.
2. **My first pairing of artboard elements to selectors was off by five**, because I anchored on
   `width:760px` and the extract's earlier artboards contain the same string. Cost ~4 minutes and
   one wasted run. **Dead end, so nobody re-derives it: anchor on `<div id="10c"` and index from
   there; indices 0-5 are the extract's caption chrome, 6-35 are the design, 36+ is the next
   artboard.**
3. **The jsdom render probe returned a null element on its first run** and looked like a real
   defect for about 90 seconds. It is not: jsdom reports `scrollTop`/`clientHeight`/`scrollHeight`
   as 0, `0 + 0 >= 0 - 8` is true, so the scroll-to-end gate OPENS at mount and the disabled
   button never renders. The existing behaviour test documents this at its `:18-21` and patches
   `HTMLElement.prototype`. **Dead end recorded: any render probe of `PrivacyPolicyModal` in
   `mode="consent"` that does not stub those three metrics tests the gate-OPEN branch and will
   pass vacuously on anything asserted about the disabled state.**

## 6. What I nearly got wrong

- **I nearly filed the `.policyScrim` background as a design deviation.** The artboard says
  `rgba(10,8,6,.42)`; the block says `var(--scrim)`. I checked the S01 lane before writing it up:
  `--scrim: rgba(10,8,6,.42)` at `globals.css:65`, byte-identical. **A token substitution is only
  a deviation if you have not read the token.**
- **I nearly filed `box-shadow: var(--shadow-pop)` as a deviation too** — the artboard writes a
  literal `0 30px 70px -25px rgba(0,0,0,.55)` and `--shadow-pop` is a different value in both
  modes. It is correct: S02-S60 forbids literals, and COMMON §7 maps the design's own `shadowBig`
  to `--shadow-pop`. The artboard hard-codes where its own token map has an entry. **Judged
  correct and recorded, because the next lens will have the same reflex.**
- **I nearly reported the focus-ring gap as blocking.** SPEC:637 says "focus rings visible on
  every control"; four of the block's six controls have no rule. But no rule sets `outline: none`
  either, so the UA ring is still painted and "visible" holds. It is the TOKEN clause (SPEC:612,
  `--focus`) and the mode-following claim that break, not visibility. **N1, not B2** — and the
  distinction is only available because I checked for an `outline` reset instead of assuming one.

## 7. How to make this more of a one-prompt machine

1. **Assert the whole derivation, not the pinned point.** The single change that would have made
   B1 impossible: four `toBeCloseTo` lines instead of a four-rung ladder in a comment. Generalise
   it into the requirements contract — *"a step that pins a value chosen from a measured range
   asserts the whole range."*
2. **Ship the reviewer harness with the packet, exactly as the author asks for the worker's.**
   `run()` in a `.sh`, the mutation helper, and the scratch `vitest --config`. I wrote all three
   from scratch this session; every review seat before me wrote the first two. They are now in
   `.hermes/reports/consent-ui/probes/code-rev-s02-c8-r1-*` — promote them to a fleet-level
   `probes/lib/` and have the packet name the path.
3. **Make "print instead of assert" a named reviewer move in `heartbeat-reviewer` §2.** Alongside
   "probe, never read", add: *when the author's suite computes the number you doubt, mutate the
   THRESHOLD so the assertion prints it.* It converts an argument about models into one command.
4. **A packet that quotes a claim should quote the command that produced it.** §4 gave me the
   author's figures but not their commands; for the byte count I had to guess at six different
   `head -n` cuts before concluding no cut yields 164,567. **~6 minutes** on a number that is not
   load-bearing. The rule that removes this: *a claim enters a packet as `<command> → <output>`
   or not at all.*
5. **Duplicate-detection belongs in the style contract.** N2 (a five-line comment block shipped
   twice) exists because the author's parser strips comments before every assertion — correct for
   CSS semantics, blind to duplication. One `expect(new Set(comments).size).toBe(comments.length)`
   would have caught it during the same TDD cycle that created it.

---

## 8. What I did NOT verify

- **Rendered geometry.** jsdom computes no layout. Every geometry claim here is about the
  stylesheet's TEXT and about `getComputedStyle` on a single element; whether the modal LOOKS
  right at 680px, whether `92vh` is the right height on V's screen, and whether the mode toggle
  repaints both surfaces live are V's acceptance steps 1-2, 5, 13, 14.
- **Browser reality of `prefers-reduced-motion`.** I proved the rule's selector list covers both
  animated selectors and that dropping either half fails; I did not run a browser with the OS
  setting on.
- **The C9 merge itself.** I measured that the two blocks share no class token, no full selector
  and no `@keyframes` name, and that S01 declares all four tokens S02 references. I did not
  perform or simulate the merge.
- **Whether `--ok-edge`, `--scrim`, `--z-policy-scrim`, `--z-policy-card` will still exist at
  merge time.** They exist in the S01 lane's working tree today; S01 is not yet merged.
