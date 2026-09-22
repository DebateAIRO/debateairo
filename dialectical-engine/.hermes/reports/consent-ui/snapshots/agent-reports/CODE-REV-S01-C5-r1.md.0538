# CODE-REV-S01-C5 r1 — self-report (case file)

**Seat** CODE-REV-S01-C5 · reviewer · Claude Opus 5, fresh blind session · mission `consent-ui`
· ticket `t_f9553998` · reviewing `t_480db823` (CODE-S01-C5), commits `fd8250c0` + `d5e217f7`,
base `9dd8042e` · worktree `.worktrees/rev-s01-c5/dialectical-engine`, detached `d5e217f7`,
`git status --porcelain` = 0 at CLAIM and 0 at handoff · round 1 of max 3 · verdict **PASS with
three N-findings**.

> treat it like a murder case. I want to get a nice report on what can be done better. What we
> must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How
> can we turn this into a one prompt machine even better.

---

## 1. The one finding that matters, and its CAUSE

**A cluster's acceptance command cannot see the defect its own headline requirement forbids —
because the suite that carries the requirement pins the WEAKER of the two readings the SPEC
offers.**

S01-R14 is written as: *"the bar returns **iff no valid `v: 1` decision is stored**"*. There are
two ways to implement "is a decision stored": ask whether the KEY IS PRESENT, or ask whether the
VALUE IS VALID. `readConsent()` answers the second; `localStorage.getItem(CONSENT_KEY) !== null`
answers the first. The shipped machine uses `readConsent()` and is **correct**. But every case in
`tests/render/consent-mount.test.tsx` seeds either nothing or a valid decision, so the two
readings are indistinguishable to it. I substituted one for the other at the dismissal (RM2) and
at the mount (RM3):

| what I ran | author's `consent-mount` | my probe | `CMD-C5` |
|---|---|---|---|
| shipped (control) | 11 passed (11) | 32 passed (32) | **verdict=0** |
| RM2 dismissal keys on presence | **11 passed (11)** | 10 failed \| 22 passed | **verdict=0** |
| RM3 mount keys on presence | **11 passed (11)** | 20 failed \| 12 passed | **verdict=0** |

`CMD-C5`'s output under RM2 and RM3 is byte-identical to the control. So the cluster's ONE
verification command is blind to a defect in the exact class REQ-REV-01 **B1** exists to forbid:
under RM2 a signed-in visitor whose `debateai.consent` holds a `v: 2` value (or `essential:
false` — the very instance V-19 generalised from) opens the card from Settings, backs out, and
the consent gate never returns.

**CAUSE, named precisely.** The B1 pin was written from B1's own narrative — *the ENTRY POINT
must not be the discriminator* — and the author built exactly the mutant that narrative names
(their M1; my RM1 is a stronger, more realistic version and both suites catch it). What nobody
did was ask the second question: **if the entry point is not the discriminator, what IS, exactly,
and what are the ways to get THAT wrong?** The requirement sentence contains the answer in one
adjective — *valid* — and no case seeds a value that is present but not valid. `readConsent`'s
own strictness IS pinned, in C2's `consent-storage.test.tsx`; what is unpinned is the MACHINE's
choice to call it. A codec test cannot see its caller.

**PRICE here:** none, because the code is right. **PRICE if it regresses:** the whole point of
B1, silently, past a green cluster command, in the cluster after the one that would be blamed.

**UPGRADE (mechanical, and it generalises past this mission).** When a requirement's condition is
a PREDICATE the codebase already exports (`readConsent`, `isDecision`, any `isX`), the cluster
that CONSUMES the predicate owes at least one case per equivalence class the predicate itself
distinguishes — not per class the narrative mentions. Here that is three classes (absent /
present-and-valid / present-and-invalid) and the suite carried two. This is `heartbeat-protocol`
§2.2's "fix the CLASS, not the instance" pointed at *test* coverage rather than at fixes:
**a pin derived from a finding's NARRATIVE covers the instance; a pin derived from the
PREDICATE covers the class.**

## 2. What I nearly got wrong

**I nearly filed my own probe's two failures as findings against the author.** My first run of
`rev-copy-modes-exits.test.tsx` was 2 failed | 5 passed, and one of them read
*"card: expected '<div class="consentCard" role="dialog…' to be '<div class="consentCard"
role="dialog…'"* — a both-mode comparison failing on two apparently identical strings. The
tempting reading was "something in the card branches on mode". The actual cause, found by
printing both strings in full: React's `useId` counter advances across two `createRoot` calls in
the same document, so `aria-labelledby="_r_0_"` became `_r_1_`. Everything else was byte-identical.
The second failure was my own `??` where the switch buttons' `textContent` is `""` (the knob span
carries no text) and `""` is not nullish, so the `aria-label` fallback never fired.

**Both were MY bugs, and both would have read as plausible product findings in a verdict.**
`superpowers:systematic-debugging` Phase 1 ("read the error completely; reproduce; find the
working example") is what caught them — I ran the failing case alone with the full diff printed
instead of reasoning from the truncated message. **UPGRADE:** a reviewer's first RED in its own
probe is a hypothesis about the REVIEWER, not about the author, until the full output says
otherwise. Cheap rule, and it is the difference between a verdict and an embarrassment.

**And then I committed P1 myself, in the document that files it.** Having written up "a line
number lifted out of captured tool output describes whatever tree produced that output", I cited
`CookieConsent.tsx:414-416` and `:457-459` for the mount effect and `dismiss` — **diff** line
numbers, straight out of the review package. The real lines are `:86-88` and `:129-131`. Four
citations, all wrong, all in the finding-body of a verdict whose §5 is about exactly this. I
caught them only because I ran a mechanical sweep over every `path:line` in my own verdict before
filing, and the sweep also caught a fifth: my §1 table repeated the author's `settings/page.tsx:39`
for the AuthGate line instead of measuring it (it is `:38`).

**This is the strongest evidence I have for the upgrade in §6.4.** The rule "cite only what you
measured" is not enough on its own, because the failure is not laziness — it is that a diff and a
file both present themselves as `<path>:<number>` and the diff is the document you are reading
while you write. **The remedy has to be mechanical:** a sweep over every `path:line` in a finished
artifact, resolving each against the file it names and printing the line, run before the artifact
is filed. Mine took one `python3` heredoc and found five defects in my own text in under a minute.
It should be a standing step for every seat that writes citations — author, reviewer, orchestrator
alike — and it is the single cheapest quality gate I found in this run.

## 3. Dead ends — do not re-derive these

1. **Reaching the machine's `onDismiss` without a module mock.** The shipped card wires no gesture
   to that prop, and a component's props are not on the DOM node — you would need a fiber walk.
   The `vi.mock` pass-through is the only lawful seam and it is the right one. I made mine
   *different* from the author's (mine appends a real `<button>` wired to the prop, so the
   dismissal travels through React's own event path rather than through a recorded props object)
   — that is worth doing, because it is a second oracle rather than a copy. Do not spend time
   looking for a third.
2. **Checking out `fd8250c0` to measure the apps/ui typecheck at both commits.** A review seat
   makes no git writes. The zero-write route takes six seconds: restore the two modified files
   with `git show fd8250c0:<path> > <path>`, `mv` the two ADDED components aside, prove
   `git diff --name-only fd8250c0 -- apps/ui` is empty, run `npx tsc`, restore. Both commits
   measured, HEAD never moved.
3. **Running a promoted probe from `tests/`.** `vitest.config.ts`'s `include` is `tests/**`, so a
   file elsewhere is silently filtered out — and `.review-scratch/` is the only place a review
   seat may write. A four-line `--config` that copies the root aliases and sets
   `include: [".review-scratch/**/*.test.tsx"]` is the whole answer, and it is now in the probe
   kit as `code-rev-s01-c5-r1-rev.vitest.config.ts`. The C3C4 reviewer wrote the same file. It
   has now been written three times by three seats.

## 4. What cost tokens, and the cheapest fix for each

| What | Cost | Cause | Fix |
|---|---|---|---|
| Locating `CMD-C1/C3/C4/C5` inside `PLAN.md` (1193 lines) | ~18k tokens, ~6 min | The cluster table, the fenced commands, §A9 and the boundary rows are four regions hundreds of lines apart, and the table deliberately does NOT carry the commands | The author asked for the same thing (their §5 row 1). A **per-cluster extract at dispatch** serves the REVIEWER too, and the reviewer needs one more section than the author: the cluster's `allowed` list and the two BASELINE rows its command depends on |
| Re-deriving the review vitest config | ~8 min | Dead end 3 above — written by CODE-REV-S01-C3C4, promoted to `probes/`, and not named in my packet | My packet lists `probes/code-rev-s01-c3c4-r1-stale-initial.test.tsx` by name. It should list the **runner** beside it: `…-vitest.review.config.ts`. COMMON §10.35 already says a re-reviewer copies "the kit's runner/config"; the packet has to name WHICH |
| `\.focus()` under the tool shell's `ugrep` | ~4 min, one wasted call | `grep -E '\.focus()'` is `error: empty (sub)expression` under ugrep 7.8.4 but a valid (if unanchored) ERE under BSD grep. §10.16 warns about the glyph direction of this hazard; this is the **opposite** direction — a pattern that WORKS in a script and DIES in the tool shell | Extend §10.16 with the second direction, and the one-word remedy: **guard greps use `-F` fixed strings** wherever the pattern is a literal. Appended to TOOLING-TRAPS |
| Judging whether `receiving-code-review` was owed | ~10 min of reading the floor | See §6 N3 — the floor says "on rework"; this seat was on round 0 and yet was handed six numbered findings from another lens's verdict to discharge | One word in `heartbeat-protocol` §1 |

## 5. Where THIS packet fought me — exactly

1. **`apps/ui/lib/consent.ts:213`** (my packet §4, the N7 charge). The `@ts-expect-error`
   directive is at **:218**; `:213` is a line of JSDoc prose. `213` is the line number `tsc`
   printed in the author's M15 output *after both overloads had been deleted*, i.e. from a
   five-lines-shorter MUTATED file. A line number lifted from a captured tool output and pasted
   into a packet as a description of the shipped file is COMMON §10.24's exact prohibition. Filed
   as **P1**; the remedy is class-wide, not instance-wide.
2. **"detached at `fd8250c0 (…), d5e217f7 (…); HEAD d5e217f7`"** (§1). The commit-LIST template
   variable was substituted into the "detached at" slot, so the packet tells the seat its
   worktree is detached at two commits at once. Cosmetic, and I resolved it in one `git rev-parse`
   — but a packet that reads as if it were generated rather than written costs a seat trust it
   then spends re-verifying other constants.
3. **"lines 318–470"** for `reviews/CODE-REV-S01-C3C4-r1.md` §3's N1/N2/N3/N4/N6/N7. N1 does
   start at :318; :470 is the first line of **N8**, which is not on the list. The range should
   end at :469. Same class as (1): measured by eye, not by `grep -n`.
4. **A genuine tension the packet does not resolve.** COMMON §10.11/§10.26 keep another lens's
   CONCLUSIONS unread by a blind seat, and my packet §4 orders me to check the follow-up "value by
   value against `reviews/CODE-REV-S01-C3C4-r1.md` §3". I read §3 and nothing else of that file,
   because those six findings ARE the requirements of commit `fd8250c0` and the charge is
   unanswerable without them. **UPGRADE:** say so in the rule rather than leaving each seat to
   reason it out — *a prior round's verdict, on DIFFERENT work, that a later ticket exists to
   discharge, is a requirements document for that ticket and is read as one; a PARALLEL lens's
   verdict on the SAME work is never read.* One sentence, and it removes a decision every
   follow-up reviewer will otherwise make alone.

## 6. Toward the one-prompt machine — five concrete changes

1. **Coverage is owed per PREDICATE class, not per narrative.** (§1.) The single highest-value
   change here: it is the difference between a pin that catches the finding that was reported and
   a pin that catches the finding's whole class, and it is checkable — count the equivalence
   classes the predicate distinguishes, count the cases.
2. **Ship the per-cluster extract to the REVIEWER too, with two extra sections** (the `allowed`
   list and the BASELINE rows the command depends on). (§4 row 1.) The author asked for the
   author's half; this is the other half of the same file.
3. **Name the probe RUNNER, not only the probe.** (§4 row 2.) Three seats have now written the
   same `--config` file. Promote it once, name it in every review packet.
4. **A mechanical `path:line` sweep before any artifact is filed — by EVERY seat, not just
   packet authors.** (§2, §5.1.) COMMON §10.24 says "measure your citations"; it does not say
   where the violation comes from — **line numbers copied out of captured tool output**, which
   describe whatever tree produced that output — nor that exhortation does not work, because a
   diff and a file both look like `<path>:<number>` and the diff is what you are reading as you
   write. Ship the sweep as a promoted probe; mine found five bad citations in my own verdict in
   under a minute.
5. **`-F` for every literal guard grep.** (§4 row 3.) `.focus()`, `<script`, `addEventListener`
   are literals; writing them as EREs buys nothing and costs a shell-portability class that
   §10.16 was written to close in one direction and is still open in the other.

## 7. What I could NOT verify, stated plainly

- **Everything V's browser will judge.** jsdom computes no layout and paints nothing: the 2px the
  N1/N2 fixes recover, the hover spring, the knob shadow, the scrim's dimming and the
  reduced-motion branch are asserted as declared rule TEXT only. V's acceptance steps 1–2, 6, 14, 18.
- **`--shadow-thumb`'s other consumers.** I asserted the token's value is unchanged and that the
  S01 block no longer references it; I did not render `.ndSlider`.
- **Anything past the C6 merge.** `modalSemantics.ts` and `PrivacyPolicyModal.tsx` do not exist in
  this lane, so the two dead footer props (**N2**) are measured as dead TODAY and nothing more.
- **The dev stack.** I ran no browser; every figure in the verdict is jsdom, `tsc` or `grep`.
- **`fd8250c0` in isolation as a git state.** I reconstructed its `apps/ui` tree in the working
  directory and proved `git diff --name-only fd8250c0 -- apps/ui` empty before measuring; I never
  moved HEAD.

## 8. Evidence index

Verdict: `docs/missions/consent-ui/reviews/CODE-REV-S01-C5-r1.md`. Probe kit (17 files, every one
taking the lane from `argv`/cwd — §10.35 gate run and clean):
`.hermes/reports/consent-ui/probes/code-rev-s01-c5-r1-*`. Scratch was
`/private/tmp/claude-501/…/scratchpad/CODE-REV-S01-C5-r1/` (§10.11) and
`.worktrees/rev-s01-c5/dialectical-engine/.review-scratch/`, deleted before handoff with
`git status --porcelain` = 0 proved. TOOLING-TRAPS appended with the ugrep `-F` trap.
