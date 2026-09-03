# CODE-T3C1-REV case file — blind review of T3-C1 at af50e34

Seat: fresh Opus 5 blind review · ticket `t_9d3f1f2d` · verdict **REWORK (round 1)**.
SKILLS LOADED: heartbeat-protocol, heartbeat-reviewer, superpowers:verification-before-completion.

## Cause, not symptom

**The mission keeps shipping mechanisms whose PREMISE is supplied by the test.** This is the
third instance in four rounds and it has a name now:

| Instance | Premise the test supplied instead of measured | Round cost |
|---|---|---|
| AM6/N1 | "the anonymous landing does not render `TopBar`" — asserted in ADR-002, never rendered | 1 ARCH amendment + this whole cluster |
| T9-C1 B1 | `document.querySelector('[data-mode-toggle]')` — the document was assumed to have one mount | 1 rework round |
| **T3-C1 (here)** | `t3-library.test.tsx` **hand-builds** `<div class="appShell"><TopBar/>…</div>` in BOTH helpers. `layout.tsx` — the file that actually decides that shape — is read by no UI test | this round |

The suppression rule is a CSS selector over a DOM SHAPE. Every arm of `T3-C1-4` validates it
against a shape the test author wrote by hand. I nested `<TopBar />` one `<div>` deeper in
`layout.tsx`: the anonymous landing gets its duplicate header back (jsdom over the real
`globals.css`: `display = flex`), and **22 UI test files / 102 tests stay green**. Nothing in
the mission observes the product's own chrome shape.

The upgrade is one line of law, not a new tool: **when the mechanism is a selector, the
acceptance renders the REAL document, or it pins nothing.** I proved it costs ~10 lines — my
P1/P2 probe rendered the real anonymous and real signed-in `/` against the real stylesheet and
passed first try (`markers=5 chrome,hero,sample,method,pricing · .topBar display=none`;
signed-in `display=flex`, ☾ `inline-flex`, label `Switch to Chamber mode`).

## The second cause: mount ownership is asserted, never counted

ADR-002 §"Where it mounts" says *"each of the three is pinned by a different cluster's
acceptance."* That sentence is false and nobody had counted. The "Global chrome" row is **two
code sites** — `topBarActions` and the `authTopBar` branch — and only the first is pinned.
Deleting the `authTopBar` ☾ leaves the full 12-path row-3 command at **12/12, 92/92**.

The aggravating fact took one `awk` over the dispatch table: **T3-C1 is the ONLY row of 32
that writes `TopBar.tsx`.** So (a) nobody after this cluster can add the pin, and (b) anything
wrong with that file's chrome inventory — including the pre-existing `Account → /login` link
sitting in the *signed-in* library chrome, which T3-S1 does not list — has no owner at all.
**A per-file writer census is cheap and would have caught both.** Recommend the orchestrator
run `awk` over the Writes column at packet-build time and paste the result into any packet
whose cluster is a file's sole or last writer, with the sentence: *"you are the last writer of
X — every pin X will ever have, you own."*

## What cost tokens

- **The packet's stale command count.** §4 says "10 files"; the canonical row 3 has 12
  (`t9-mode-tokens`, `v2ui-pages` added by AM6). The worker caught it, declared it at CLAIM,
  ran the superset — correct behaviour, and it still cost them a source re-read and six extra
  file-runs, and cost me a reconciliation before I could trust any number. **The packet
  generator must read the row, not paraphrase it.** This is the worker's own top
  recommendation and I confirm it independently.
- **The full suite is not runnable as a control.** `pnpm exec vitest run` timed out at 10 min
  with ~25 pre-existing failures (needs PostgreSQL). I burned a 10-minute wall-clock slot
  discovering that. Dead end, recorded: for mutant scoring in this mission the widest usable
  net is `tests/render tests/unit/pda-s03… tests/unit/t9-mode-tokens…` (22 files / 102 tests),
  not the repo suite. **Put that line in the reviewer packet.**
- **HEAD moved under me mid-review** (`0817aa8`, receipts-only, after the session-start
  snapshot). I had to prove af50e34's six files were untouched by it before any probe meant
  anything. Cheap here; expensive if a product file had ridden along. **Reviewer packets
  should name the frozen SHA *and* state whether the orchestrator intends to commit during
  the review window.**

## Near misses — mine

- I nearly filed the `authTopBar` gap as non-blocking on the grounds that T7-C1-2 and T8-C4-1
  pin it later. Then I checked *who writes the file between rows 3 and 25* — nobody — and
  realised that cuts the other way: the pin is unaddable after this cluster closes, so "later"
  means "by a seat with no write access to the subject." Almost inverted a blocking finding.
- I nearly charged the worker for the synthetic-shape gap. The acceptance cell `T3-C1-4`
  **prescribes** the hand-built document verbatim. The worker obeyed. The defect is the
  ARCH cell's; the remedy just happens to land in a file T3-C1 owns. Filing severity against
  the wrong seat is how a fleet learns the wrong lesson.

## Dead ends, so nobody re-derives them

- **`display:none` vs `visibility:hidden` IS pinned** — arm (a) reads computed `display`, so
  concealment-instead-of-suppression goes RED. ADR-002's "suppression, not concealment"
  requirement is safe. Don't re-probe it.
- **The `[data-landing-section]` attribute IS protected** inside T3-C1's own command: stripping
  it from all five landing roots turns `pda-s03` RED via the routed one-liner (and 3 more in
  `t9-landing`). ADR-002's "a seat that drops it silently restores the duplicate header" warning
  is covered. The routed one-liner also discriminates on its own subject (removing
  `LandingChrome`'s ☾ → RED). Both were worth checking once; neither needs checking again.
- **A `[data-landing-section]` element outside `.appShell` is not reachable** — `layout.tsx`
  puts `{children}` inside `.appShell`, so the packet's suggested edge case cannot be built
  from product code. Closed.
- `rg` **is** on this machine (`ripgrep 14.1.1`). `TOOLING-TRAPS.md` correctly hedges
  ("may be absent"); the worker's self-report hardens it to "this machine lacks rg", which is
  false for this shell and will send the next seat to a slower tool for no reason.

## Toward the one-prompt machine

1. **Generate the verify command from `dispatch-order.md` at packet-build time.** Never retype
   it. Every stale count so far has been a retype.
2. **Emit a writer census per packet** (sole writer / last writer / serialised-after). Two of
   my three structural findings fall straight out of it.
3. **Add one acceptance clause to the mission's law:** *a cell whose subject is a CSS selector,
   a DOM position, or a mount site must render the product's own document — `layout.tsx`
   included — not a document the test composes.* Three defects in four rounds share this shape;
   nothing else in the record is close.
4. **Give reviewers the usable-suite line.** "Full suite" is not a control in this repo and
   every fresh reviewer will spend ten minutes learning that.

---

# REV2 append — re-review of rework round 1 (af2d590), verdict PASS

Same seat, same session (6cf246a8). Skills carried from round 1; nothing new loaded.

## What actually closed, and why it closed cheaply

Both round-1 blockers died to the exact mutants that found them, one round, two test-only
edits plus one product line:

```
M1b  authTopBar ☾ deleted   round 1: 12/12 92/92 NOT CAUGHT -> round 2: RED (T3-C1-5)
M6   TopBar nested in div   round 1: 22/22 102/102 NOT CAUGHT -> round 2: RED (P3)
```

The cheapness is the lesson, not a footnote. **A blocking finding delivered as a runnable
artifact costs one round; the same finding delivered as a paragraph costs an argument first.**
I built P1/P2/P3 during round 1 as a throwaway probe and pasted its measured output into the
verdict. ARCH re-derived it, adopted it verbatim into the T3-C1-4 cell, and the worker shipped
it — no negotiation anywhere in the chain, because there was nothing to negotiate about. Same
for B1: the remedy was four lines of assertion in the verdict body and it shipped unchanged.
**Recommend this as law for reviewers: if your finding has a remedy, ship the remedy as
executable text in the verdict, with its RED already measured.**

## The one thing I got wrong, recorded because it was nearly a REWORK

My round-2 probe was a hypothesis that AM7 had opened an AM5 verify-survivability hole: the
amended cell makes `t3-library.test.tsx` render the REAL anonymous landing, so the file now
reads all five `landing/*` components — written at rows 2, 4 and 5 — while `t3-library` runs
only at rows 3 and 14. On paper that is textbook: a pin reading files that later clusters write,
with no later cluster running it.

Measured instead of argued, and **REFUTED**. I simulated row 5's own charge (T9-C4 filling
`LandingSample` with a nested marked sub-section) and ran the writing clusters' own commands:

```
T3-C1 row-3 command : P1 RED  (markers 6 != 5)
T9-C4 row-5 command : RED     t9-landing "composes the five landing sections in contract order"
T9-C2 row-4 command : RED     same case
```

`t9-landing.test.tsx` already pins the marker LIST document-wide, and both writing rows run it.
The break is caught at the cluster that causes it, which is where the AM5 law wants it. **The
read-set grew and the invariant still holds** — by prior construction, not by luck.

Two things I would have gotten wrong by reasoning alone: (1) I would have filed a blocking
survivability finding on a hole that does not exist, at round 2 of 3, on the cluster that closes
Wave 1; (2) I would have credited AM7 with a defect that is actually T9-C1's foresight. **A
survivability hypothesis is a query over the whole 32-row table, not over the two rows you are
looking at — and it is cheaper to run the mutation than to read the table.** That is the single
most reusable thing in this append.

## What still costs the fleet

- **The verify-command read-set is maintained by hand and re-derived by whoever notices.** AM7
  changed what a pin file READS without any mechanical re-check of which rows must run it; the
  answer turned out fine, but nobody could state that without my mutation. A `vitest --related`
  style read-set dump per pin file, regenerated at packet-build time, would turn a 20-minute
  probe into a diff. **This is the highest-leverage automation left in the mission.**
- **The codex sandbox and the review shell disagree about `rg`.** Round 1 I flagged the worker's
  "this machine lacks rg" as false; the worker re-checked and it IS absent in their sandbox and
  present in mine. Both of us were right about our own shell and the trap file's hedge ("may be
  absent") is the only correct statement. Cost: two round-trips over a non-issue. **Environment
  claims in a self-report should name the shell, not "this machine."**
- **`{children}`-hoist**: correctly tiered to V (`t_ec4d5b5f`) rather than folded into a rework
  the contract did not authorise. This is the residual discipline working — round 1's own case
  file predicted that a residual dropped on the floor comes back as a blocker, and this one was
  named, routed and repeated in the handoff instead. No action; recorded as a positive control.

## One-prompt machine — what round 2 adds to round 1's list

5. **Reviewers ship remedies as runnable artifacts, with measured RED.** Both blockers closed in
   one round because the remedy needed no interpretation. This is now measured, not asserted.
6. **Probe hypotheses about dispatch topology by mutation, never by reading.** My one round-2
   probe cost ~20 minutes and its value was entirely in being WRONG cheaply. A verdict that had
   argued it instead would have cost a round and been incorrect.
