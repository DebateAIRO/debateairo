# CODE-REV-S02-C7 — round 1 verdict (blind per-cluster code review, mission `consent-ui`, slice S02)

`SKILLS LOADED: superpowers:using-superpowers, heartbeat-protocol, heartbeat-reviewer, superpowers:verification-before-completion, superpowers:systematic-debugging, superpowers:receiving-code-review`

**Verdict: PASS**

Reviewer CODE-REV-S02-C7 (Claude Opus 5, fresh blind session), ticket `t_cc9ad596`, round 1 of
max 3. Work reviewed: seat CODE-S02-C7, ticket `t_f39d50db`, commits `e0666a79` · `511d30b6` ·
`9cc81351` on `slice/consent-s02`, base `44744d8d`, HEAD `9cc81351`.
Worktree `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/rev-s02-c7/dialectical-engine`,
detached at `9cc81351`, `git status --porcelain` **0 entries at CLAIM and 0 entries at handoff**.
`pnpm run generate:contract` exit **0**, tree still 0 entries.

Eight findings, **all non-blocking**. Nothing in the three commits is wrong; four of the eight are
coverage gaps the author could not have been asked for, three are packet/PLAN defects the author
found and I confirmed, one is a declared skills shortfall. **PASS.**

---

## 0. Packet review (`heartbeat-reviewer` §1) — the packet that dispatched ME

Every quoted constant checked against the artifact it claims to quote:

| Claim in `CODE-REV-S02-C7-R1.md` | Measured |
|---|---|
| base `44744d8d`, HEAD `9cc81351`, 3 commits | ✅ `git rev-parse HEAD` = `9cc81351318cdb10acb655dbb34eef4f87e19676` |
| review package "999 lines" | ✅ `wc -l` = 999 |
| `PLAN.md:929-1180` = §Cluster S02-C7 | ✅ `:929` is `### Cluster S02-C7 …`; the range overruns the section end by ~8 lines into C8's heading — harmless |
| `PLAN.md:1475` = the C7 cluster row | ✅ `\| **S02-C7** sign-up ↔ modal wiring \| S02-S49 … ` |
| `PLAN.md:934-938` = the click rule · `:1122-1133` = the acknowledgement route | ✅ both |
| tickets `t_cc9ad596 t_f39d50db t_155968da t_131e9512 t_b7de5321 t_d9ccb5d3 t_4f97ca86 t_9ccf3598` | ✅ all eight resolve on board `consent-ui` |
| snapshot `snapshots/packets/CODE-S02-C7.md.at-dispatch` present | ✅ read in full |
| the `allowed` list covers every mandatory deliverable | ✅ verdict path, self-report path, `probes/`, scratch, the two comments |
| the author's nine reported figures (46/46, 28/28, 20/20, 19-at-base, typecheck 8/0, apps/ui exit 0, t9 2-failures/1-hit, v2ui 2/2, auth-flow 18/18) | ✅ **all nine reproduced independently** — §2 |

**P1 (packet, ADVISORY).** §4's F2 charge pre-commits its own remedy — *"If dead, the remedy is a
ticket to remove it … if live, a pin."* The measurement fits neither branch (**dead as behaviour,
live at the tracker level** — N2). A charge that pre-commits a remedy should end "…or say why
neither fits".

**P2 (packet, ADVISORY).** §2 orders "assert the SPEC's verbatim copy **and both-mode token
usage**". C7 adds no CSS and no tokens; all four touched files carry **0** colour literals
(`#hex`/`rgb(a)(`/`oklch(`), so that half was vacuous. Discharged as a literal count plus a real
render assertion (P6). Per-cluster §2 lines, or an explicit "N/A because …".

---

## 1. The three seat-specific charges the orchestrator could not verify

### 1.1 PACKET DEFECT 1 — the value-tracker resync relocated into a `queueMicrotask`. **ACCEPTED.**

**(a) M10 re-planted, by me, in my own worktree** (the packet's literal wording — the assignment
inside the cancelling branch):

```
MUTANT M10_resync_inline | vitest exit=1
      Tests  6 failed | 8 passed (14)
  FAIL … > closes on a backdrop click, leaving the box unchecked and the mirror false
  FAIL … > closes on one Escape and nothing else acts on that event
  FAIL … > closes on the close control, leaving the box unchecked and the mirror false
  FAIL … > opens the policy from an activation of the focused empty box, and returns focus
  FAIL … > opens the policy from the unchecked check square, leaving box and mirror false
  FAIL … > resets the read gate on every reopen, because the policy is mounted per open
```

**6 of 14 RED — the author's figure exactly.** The jsdom citation is exact: at
`node_modules/.pnpm/jsdom@30.0.1/…/living/nodes/HTMLInputElement-impl.js:179-182`,
`_legacyCanceledActivationBehavior()` for a checkbox is `this.checked = !this.checked` — a
**re-toggle**, where HTML's legacy-canceled-activation behaviour is *"set this element's
checkedness … back to the values they had before the legacy-pre-activation behavior was run"* —
a **save/restore**. The two agree **iff nothing writes `.checked` between the two steps**. The
packet's placement is exactly such a write.

**(b) Judged for BOTH environments — measured, not reasoned.** I built a spec-conformant
canceled-activation shim (save the pre-click checkedness in `_legacyPreActivationBehavior`,
restore it in `_legacyCanceledActivationBehavior`) by reaching jsdom's impl through the wrapper's
own symbol, and **validated the shim on known-GOOD and known-BAD input before relying on it**:

```
P0 jsdomPlain=false  jsdomWritten=true  conformantWritten=false
```

Read it: with no mid-click write both environments end `false`; **with a mid-click
`.checked = false`, jsdom ships the box CHECKED and a conformant UA ships it unchecked.** Then,
with the shim installed and **M10 planted**, the shipped card is correct:

```
P1 dialog=true domChecked=false tracker=false      ← M10 planted, conformant cancel: PASSES
```

**Ruling.** The packet's constant (3) was *correct for a browser and wrong for the test
environment*; the author's relocation is correct in **both**. At HEAD, P1 passes under the
conformant shim and the full cluster passes 46/46 under stock jsdom. The class the packet bound
(a PLAIN instance assignment, never the prototype setter, never a synthesised `.click()`) is
preserved. **CODE-REV-S02-C3C4 r1 N1's remedy R1, as relocated: ACCEPTED.**

**(c) Does the microtask leave an observable window? Measured — yes to the ordering, no to the
consequence.** My P2 probe instruments a document CAPTURE listener (before React's delegated
root listener), a document BUBBLE listener (after it, still inside the dispatch) and a microtask:

```
P2 ORDER: capture(dom=true,dialog=false) -> bubble-doc(dom=true,dialog=true)
          -> after-dispatch-returns(dom=false,dialog=true)
          -> microtask-after(dom=false,dialog=true,tracker=false)
```

So **React commits `setPolicyOpen(true)` while `input.checked` is still `true`** (pre-activation
has fired, canceled-activation has not), and the microtask runs after *both* the commit and the
restore. It does not matter, for two measured reasons: (i) commit → restore → microtask all sit
inside **one task**, so no style/layout/paint can be interleaved and no frame ever shows a ticked
box; (ii) by the time the microtask runs the DOM is already `false`, so the assignment is a no-op
on the DOM and touches only React's private tracker. The same instrumentation under M10 shows the
defect directly: `bubble-doc(dom=false…) -> after-dispatch-returns(dom=**true**…)`.

*Latent coupling, advisory, not a finding:* the microtask is safe **because the input is
uncontrolled**. A `checked={privacyAccepted}` prop would have React write `checked` during the
commit at `bubble-doc` time and jsdom's toggle would invert it — M10 by another route. `S02-S30`
already pins the inputs uncontrolled; no action.

### 1.2 F2 — is the resync dead code after C7's click rule? **DEAD AS BEHAVIOUR, LIVE AT THE TRACKER.**

M11 re-planted: `Tests 14 passed (14)`, **not caught** — the author's figure. I then built the
route ticket `t_d9ccb5d3` feared and read React's private `_valueTracker` at every step
(probe P3). **At HEAD:**

```
00 mount:              dom=false tracker=false dialog=false btnDisabled=true
01 cancelled-click-1:  dom=false tracker=false dialog=true  btnDisabled=true
02 dismissed-by-close: dom=false tracker=false dialog=false btnDisabled=true
03 cancelled-click-2:  dom=false tracker=false dialog=true  btnDisabled=true
04 acknowledged:       dom=true  tracker=true  dialog=false btnDisabled=true
05 adult-ticked:       dom=true  tracker=true  dialog=false btnDisabled=false
06 unchecked-via-row:  dom=false tracker=false dialog=false btnDisabled=true
```

**With M11 planted (resync removed), same route:**

```
01 cancelled-click-1:  dom=false tracker=TRUE  …   ← the desync the ticket named. It is REAL.
03 cancelled-click-2:  dom=false tracker=TRUE  dialog=true   ← the open route still works
04 acknowledged:       dom=true  tracker=true  …   ← repaired incidentally by the assignment
06 unchecked-via-row:  dom=false tracker=false btnDisabled=true   ← the uncheck still announces
```

**Ruling, in two parts.** (1) **The desync is real and the resync genuinely fixes it** — tracker
`true` over DOM `false` without it, `false`/`false` with it. It is not a no-op. (2) **No
observable outcome depends on it after C7's click rule.** I could not construct a route where the
stale tracker swallows an `onChange` that matters, and here is why, exhaustively: an `onChange`
swallowed on the OPEN branch is a no-op write (member 1 computes
`checked && !defaultPrevented` = `false`, and the open branch runs only when the mirror is already
`false`); the only route that ticks the box is `acknowledgePolicy`'s instance assignment, which
goes through React's own tracker-aware setter and re-syncs the tracker itself; and the uncheck
branch therefore always enters with tracker `true` over DOM `true`, so the toggle to `false` is
always detected. **See N2 for the remedy.**

### 1.3 F3 — the acknowledgement's mirror write and member 2 hide each other. **Right, and the mechanism is sharper than stated.**

Confirmed: M5 `14 passed (14)`, M7 `14 passed (14)`, M8 (both) `4 failed | 10 passed (14)` —
the author's three figures to the case. **The mechanism, which the author did not name:**
`apps/ui/components/consent/PrivacyPolicyModal.tsx:138-139` calls `onAcknowledge?.()` **and then**
`onClose()`, so member 2 (`closePolicy`'s `setPrivacyAccepted(privacyInputRef.current?.checked ?? false)`)
runs on the acknowledgement route too and re-derives `true` from the DOM the acknowledgement just
wrote. The pair is **right** — each is independently correct and the redundancy is deliberate
defence in depth — but it is redundancy, not two guards, and see **N3** for what else it masks.

---

## 2. Verification — what I ran, and its output verbatim

All three cluster commands, **×3 from a `.sh` under `/bin/bash` AND ×3 inline** (COMMON §10.16),
using my own transcription of the PLAN's `run()` idiom (`PLAN.md:1377-1389`), lane from `argv`:

```
===== SCRIPT RUN 1/2/3 (identical) =====
S02-C7 | commit=9cc81351 | vt=0 guard=0 VERDICT=0 |  Tests  46 passed (46) |  Test Files  5 passed (5)
S02-C3 | commit=9cc81351 | vt=0 guard=0 VERDICT=0 |  Tests  28 passed (28) |  Test Files  3 passed (3)
S02-C1 | commit=9cc81351 | vt=0 guard=0 VERDICT=0 |  Tests  20 passed (20) |  Test Files  1 passed (1)
===== INLINE RUN 1/2/3 (identical) =====
S02-C7 | commit=9cc81351 | vt=0 guard=0 VERDICT=0 |  Tests  46 passed (46) |  Test Files  5 passed (5)
S02-C3 | commit=9cc81351 | vt=0 guard=0 VERDICT=0 |  Tests  28 passed (28) |  Test Files  3 passed (3)
S02-C1 | commit=9cc81351 | vt=0 guard=0 VERDICT=0 |  Tests  20 passed (20) |  Test Files  1 passed (1)
```

**WORST RUN of six per command = `VERDICT=0`.**

Standing gates, reported as deltas (`PLAN.md §Standing gates`, `BASELINE.md`):

```
G1  pnpm typecheck            exit 1 · ran-arm `^\$ tsc --noEmit$` = 1 · 8 diagnostics, ALL in
                              tests/unit/s14-ui.test.ts · diagnostics OUTSIDE the pin = 0
                              → "no diagnostic outside the pin". DELTA = 0.
    apps/ui project typecheck  cd apps/ui && npx tsc --noEmit -p tsconfig.json → exit 0, 0 diagnostics
G2  t9-mode-tokens            exit 1 · Tests 2 failed | 6 passed (8) · FAIL count on the anchored
                              `^ FAIL +tests/unit/t9-mode-tokens\.test\.ts > ` = 2, and they are
                              exactly the pinned pair (the toggle label; the colour-literal gate).
                              Colour-literal HIT LIST counted at exactly 1 and it is the pinned
                              element: `…/apps/ui/app/globals.css:6096:background: color-mix(in srgb, #0a0806 32%, transparent);`
G3  v2ui-node-runner          exit 0 · Test Files 1 passed (1) · Tests 2 passed (2)
G4  auth-flow-integration     exit 0 · Test Files 1 passed (1) · Tests 18 passed (18)
```

**Boundaries.** `git diff --name-only 44744d8d 9cc81351` = exactly five files, one per commit's
grant: `e0666a79` → `consent-signup-group.test.tsx` (+5); `511d30b6` → `modalSemantics.ts` (10±)
+ `consent-modal-semantics.test.tsx` (+124); `9cc81351` → `SignUpFlow.tsx` (+94) +
`consent-signup-modal.test.tsx` (+524, new). **Zero diff lines** across the range in every
forbidden surface I checked: `PrivacyPolicyModal.tsx`, `privacyPolicy.ts`, `globals.css`,
`consent-signup-gate.test.tsx`, `auth-flow-integration.test.tsx`, `t9-mode-tokens.test.ts`,
`packages/contract/src/client.ts`, `layout.tsx`. **Nothing outside `apps/ui/` and `tests/render/`.**

**`modalSemantics.ts` is COMMENT LINES ONLY — proved at statement level, not by grep.** I
stripped comments from both versions with a byte-level state machine (validated on known-BAD
input: `const a = "// not a comment";` survives, real comments do not) and diffed:

```
=== statement-only diff, base vs head ===   IDENTICAL -- 0 statement lines changed
statement line counts: base=118 head=118        raw file: base=202 head=202
=== exported surface diff ===  EXPORT LINES IDENTICAL (line numbers included)
```

The narrowed `:29-37` comment is **TRUE of the mechanism** as read at `topmostSurface()`
(`:121-124`): `CONTAINED_BY` ⇒ above, `FOLLOWING` ⇒ above, and no `--z-*` term anywhere; the
z-ladder sentence is gone. Its arrangement premise is measured (P5): in the sign-up card the
policy modal sits at `relation=20` from `.authCard` = `FOLLOWING|CONTAINED_BY`, so it wins on
**both** clauses — see N5.

**Commit-1 and commit-2 pins, re-planted by me:**

```
m09 (type="button" removed) → exit 1 | Tests 1 failed | 7 passed (8)
  FAIL … consent-signup-group.test.tsx > … > carries the design's two sentences and the two-word policy control verbatim
MN4 (the four-line detached-INCUMBENT clause :117-120 ONLY) → exit 1 | Tests 1 failed | 19 passed (20)
  FAIL … > never lets a DETACHED INCUMBENT stand, under a conformant compareDocumentPosition
consent-modal-semantics.test.tsx AT 44744d8d, run against HEAD's helper → Tests 19 passed (19)
  → 19 → 20; the author's "the count rises by the one new case" is exact.
```

**Author's PACKET DEFECT 3 confirmed against the orchestrator's claim.** The C3 group file is
`Tests 8 passed (8)` at `44744d8d` **and** at HEAD; the C3 row is `28 passed (28)` either side.
An assertion added inside an existing `it()` moves no count. The packet's "its TEST count rises
by one", stated twice, is wrong (COMMON §10.28's class).

**Author's F1 re-planted.** I put a literal `<form className="authForm">` back inside the JSX
comment:

```
C7's OWN test file      exit=0 | Tests 14 passed (14)      ← blind to it
the source-text guard   exit=1 | Tests 1 failed | 1 passed (2)   ← the only thing that sees it
```

So **the chain arm is what caught it**, exactly as claimed. The guard is
`apps/ui/components/authRoutes.source-test.mjs:159-165`, which counts `<form\b[^>]*>` matches in
the raw source of both auth routes and asserts `3`. **The comment-spelling class is real and now
has two instances in this mission** (cf. CODE-S01-C5 F1): *a grep-based guard does not know what a
comment is, so a comment must never spell a token the guard counts.* At HEAD: exactly one `<form`
in `SignUpFlow.tsx`. R21 banned substrings all **0** (`localStorage`, `sessionStorage`, `Bearer`,
`Google`, `Model API`, `terms`, `privacy notice`). Request shape (R19) unchanged — `register(` is
called with the same four arguments and `packages/contract/src/client.ts` has 0 diff lines.

**My own jsdom fixture** (9 cases, `probes/code-rev-s02-c7-r1-probe.test.tsx`, built from the
SPEC/PLAN claims, never from the author's file) — `Tests 9 passed (9)` at HEAD:

```
P6 row1="I am 18 or over."
P6 row2="I agree to the Privacy Policy, including that my debates may be published publicly."
P6 control="Privacy Policy" type=button
```

byte-exact against `SPEC.md:503-504` **and** `design/turn-8a-checkbox-group.html:4,8`.
`disabled={busy || sent || !adultAffirmed || !privacyAccepted}` byte-identical to `44744d8d`.

**V-16 survives, measured** (P7): `clickEventsSeenFromSpace=0` — jsdom 30 turns no `Space`
keystroke into activation, so nothing opens from `Space` here and the final observation is V's
(acceptance step 14). The card installs **no keydown handler of its own**; the browser's
`Space`-activation reaches the same click path, which my probe drives directly: dialog opens, box
stays `false`. V-16's own worked example ("the policy opens, focus lands on its close button")
corroborates §3's PLAN DEFECT 2 ruling below.

**Mutant matrix — 25 runs, all reverted, `git status --porcelain` printed after every restore.**
The author's 16 reproduced **to the case**: M1 12R · M2 1R · M3 1R · M4 1R · M5 0 · M6 4R · M7 0 ·
M9 4R · M10 6R · M11 0 · M12 3R · M14 6R · N1 1R · M8 4R · m09 1R · MN4 1R. My nine: R1 0 · R2 1R ·
R3 0 · R4 8R · R5 0 · R6 0 · R7 1R · R8 6R · R9 0.

**What I did NOT verify.** The real browser: no measurement in this verdict was taken in Chrome,
Safari or Firefox — P0/P1's "conformant" environment is a shim over jsdom, not a UA, and V's
acceptance steps 7, 8 and 14 remain V's. I did not run the S02-C8 style contract (does not exist
yet), the dev stack at `https://localhost:3000`, either mode visually, the C9 merge arms, or
`auth-front-door-parity` (RED at base, inherited, untouched). I did not audit
`PrivacyPolicyModal.tsx`, `privacyPolicy.ts` or `modalSemantics.ts`'s statements beyond the
`topmostSurface()` clause commit 2 pins — those are C5/C6/C1's, unchanged here.

---

## 3. Findings

### N1 · `input.focus()` is pinned for ONE of the three entry points, and constant (5) quantifies over all three
**`apps/ui/components/SignUpFlow.tsx:134`** (`input.focus();`), against the PLAN's
`S02-S49/S50/S51` and constant (5) *"FOCUS RETURN LANDS ON THE INPUT WHATEVER THE ENTRY POINT"*.

**Concrete inputs → wrong outcome.** Mutant **R9**, `if (event.target === input) input.focus();`
— focus only when the click started on the check square:

```
R9 | exit=0 | Tests 14 passed (14)      ← NOT CAUGHT by any case in the slice
```

A user who activates the `Privacy Policy` control (or the row sentence) and then presses `Esc`
lands focus on **`<body>`** instead of the privacy box. Keyboard and screen-reader users lose
their place in the form; the mouse path is unaffected, so it is invisible without an assertion.
This ships green.

**Evidence.** The shipped code is **correct** — my probe P8 drives all three entry points and
dismisses each:
`P8 square: focusAtOpen=policyClose returnsToInput=true | text: … returnsToInput=true | control: … returnsToInput=true`.
The gap is in the suite: M9 (`input.focus()` removed entirely) reds `S02-S53/54/55/56`, and **all
four of those open from the square**. `S02-S50` and `S02-S51` open from the text and the control
but never dismiss, so they assert nothing about focus.

**CLASS.** *A constant whose wording quantifies over N routes is pinned for exactly the routes a
case exercises.* Sweep of this cluster's universally-quantified constants, per member:
(5) focus return — square ✅ pinned, text ❌, control ❌ · the mirror arm — all six ✅ pinned
(the PLAN names each step) · (1) the click rule's three entry points — all three ✅ pinned
(`S02-S49/S50/S51`, and N1's mutant reds exactly one) · (8) "every dismissal route" — `×` ✅,
backdrop ✅, `Esc` ✅.

**Remedy — `BINDING (measured: R9 survives 14/14; P8 shows all three routes are correct today)`.**
Extend `S02-S50` and `S02-S51` with the dismissal + `document.activeElement` assertion the square
cases already carry (three lines each), **or** add one case that loops the three openers. Then
R9 must go RED. `probes/code-rev-s02-c7-r1-probe.test.tsx` case **P8** is the oracle; the author
runs it against the fix and pastes its output (COMMON §10.10).
**Ticket:** *"S02-C7 N1 — pin focus return for the text and control entry points"*.

### N2 · The tracker resync is dead code for behaviour, live for the tracker, and pinned by nothing
**`apps/ui/components/SignUpFlow.tsx:150-153`** (the `queueMicrotask` block).

**Concrete inputs → wrong outcome.** M11 deletes it: `Tests 14 passed (14)`, and every one of my
nine probes still passes. Delete it and nothing anywhere in the slice notices — yet with it gone,
after one cancelled click React's tracker holds `"true"` over a DOM `false` (P3 step 01). So the
code is simultaneously **unpinned** and **not inert**.

**Evidence.** §1.2's two P3 tables, and R4 (`box.checked = true` instead of `false`) → **8 RED** —
i.e. what the suite pins is the DOM value the assignment writes, never the tracker it exists to
repair. R6 (`setTimeout` for `queueMicrotask`) → 0 RED, confirming the same.

**CLASS.** *Code shipped under a BINDING constant, whose property no case can observe, is an
undeclared liability.* The author discharged the honesty duty exactly right (F2, "declared
unpinned rather than implying coverage") — this finding is against the **packet/PLAN**, not the
seat. Other members of the class in this cluster: member 2 (declared, PLAN-labelled), and
`acknowledgePolicy`'s `setPolicyOpen(false)` (see N4).

**Remedy — `ADVISORY on which branch, BINDING on "it must not stay both unpinned and
unexplained" (measured: M11 14/14 green, P3 tracker true→false)`.** Two lawful outcomes, V's or
the orchestrator's to pick: **(a)** a ticket to remove it, with the P3 table in `DECISIONS.md` as
the measurement that made it safe; **(b)** keep it as declared defence in depth and pin the
property directly — my P3 already is that pin (`_valueTracker.getValue() === "false"` after a
cancelled click is GREEN at HEAD and RED under M11). **Not lawful: keeping it because the packet
binds it.** **Ticket:** *"S02-C7 N2 — resolve the unpinned tracker resync: remove it or pin it"*.

### N3 · Member 2 masks a member-1 regression on five of the six mirror-arm routes
**`apps/ui/components/SignUpFlow.tsx:175`** (`closePolicy`'s resync) vs **`:299-302`** (member 1's
`checked && !defaultPrevented` guard on the privacy input's `onChange`), against `PLAN.md`
§"THE MIRROR ARM … added by the B1 correction to all six route steps".

**Concrete inputs → wrong outcome.** Mutant **R7** drops member 1's guard
(`setPrivacyAccepted(event.currentTarget.checked)`) — the exact B1 defect that cost this mission
an architecture rework round:

```
R7 alone           → 1 failed | 13 passed (14)   only "opens the policy from the unchecked check square"
R8 = R7 + M7 (member 2 also removed) → 6 failed | 8 passed (14)
```

So **five** of the six mirror arms (`S02-S54` `×`, `S02-S55` backdrop, `S02-S56` `Esc`, `S02-S71`
round trip, and the reopen case) do not discriminate B1: each dismisses before the arm reads the
button, and member 2 repairs the mirror from the DOM on the way out. `S02-S50`/`S02-S51` cannot
see it either — clicking the text or the control fires no `onChange` at all. **`S02-S49` is the
sole discriminator of the mission's most expensive defect.**

**CLASS.** *A "defence in depth" line is documented by what it protects and never by what it makes
vacuous.* Members found: member 2 masks member 1 on 5 routes (here) and masks
`acknowledgePolicy`'s mirror write entirely (F3/N4).

**Remedy — `BINDING (measured: R7 1 RED, R8 6 RED)`.** One sentence in `PLAN.md` and in
`DECISIONS.md` recording that the mirror arm discriminates member 1 **only on `S02-S49`**, so a
future edit knows which case is load-bearing; optionally one case that runs the arm before any
dismissal on the `Esc`/`×` routes. `probes/code-rev-s02-c7-r1-combo.py R8` is the oracle.
**Ticket:** *"S02-C7 N3 — record that S02-S49 is the sole member-1 discriminator"*.

### N4 · `acknowledgePolicy`'s own writes are both invisible, because the modal calls `onClose` after `onAcknowledge`
**`apps/ui/components/SignUpFlow.tsx:161-166`**, against
**`apps/ui/components/consent/PrivacyPolicyModal.tsx:138-139`** (`onAcknowledge?.(); onClose();`).

**Concrete inputs → wrong outcome.** M5 (drop `setPrivacyAccepted(true)`) → `14 passed (14)`.
**R3** (drop `setPolicyOpen(false)`) → `14 passed (14)`. Both survive because `closePolicy` runs
immediately afterwards and re-derives the mirror from the DOM and closes the modal. `S02-S53`'s
stated property — *"the acknowledgement handler must set **both**"* — is therefore **not** pinned
by `S02-S53`; only M8 (both members gone) reds it.

**CLASS.** Same as N3 — this is F3's mechanism, now named at `path:line`. The shipped pair is
**correct**: if `PrivacyPolicyModal` ever stopped calling `onClose` after `onAcknowledge`, the
card still works. It is redundancy, and it should be labelled as redundancy rather than as a
pinned requirement.

**Remedy — `ADVISORY`.** A `DECISIONS.md` line stating the measured dependency
(`PrivacyPolicyModal.tsx:138-139` makes member 2 run on the acknowledgement route, so `S02-S53`'s
"both halves" property is pinned only jointly, by M8). **Ticket:** *"S02-C7 N4 — record the
onAcknowledge→onClose coupling behind M5/R3"*.

### N5 · The narrowed `modalSemantics.ts` comment names one arrangement; the sign-up card is the other one
**`apps/ui/components/consent/modalSemantics.ts:35-36`** — *"what makes that right for this
product is its ARRANGEMENT: the policy modal renders AFTER the card"*.

**Concrete inputs → wrong outcome.** Measured (P5) in the sign-up card:
`relation=20` = `DOCUMENT_POSITION_FOLLOWING | DOCUMENT_POSITION_CONTAINED_BY` — the modal is
rendered **inside** `.authCard`, after the `<form>` (`SignUpFlow.tsx:339-347`, inside
`<AuthShell>`), not as a following sibling of it. `topmostSurface()` scores it topmost on the
**CONTAINED_BY** clause here and on the **FOLLOWING** clause in S01's arrangement, so the
behaviour is right either way — but a reader who takes the comment literally will look for a
sibling that does not exist, and a future edit that moves the modal out of the card would be
judged against the wrong sentence.

**CLASS.** *A shared helper's comment states the arrangement of one consumer as if it were the
contract.* Members: S01's card (sibling, the sentence is exact) and S02's sign-up card
(contained). The commit-2 correction fixed the **false** clause (the `--z-*` ladder); this is the
remaining **imprecise** one.

**Remedy — `ADVISORY`** (comment text in a file this seat may only touch for commit 2's grant —
not a rework of the work under review). One clause: *"…the policy modal renders after the card in
S01's surface and inside it in the sign-up card; either relation puts it on top."*
**Ticket:** *"S02-C1 N5 — the topmost comment names one consumer's arrangement"*.

### N6 · The re-entrancy guard is load-bearing in a browser and unpinnable with `.click()`
**`apps/ui/components/SignUpFlow.tsx:128`** (`if (event.target !== input) input.click();`) —
the author's disclosed constant.

**Concrete inputs → wrong outcome.** Mutant **R1** (unconditional `input.click()`) →
`14 passed (14)`, **not caught**. It is not caught because every case reaches the DOM through
`HTMLElement.click()`, and the HTML spec's *click in progress* flag — set by the `click()`
**method** — makes the nested call a no-op. A real user click sets no such flag. My probe **P4**
uses a **dispatched `MouseEvent`**, which does not set it either:

```
HEAD  →  P4 handlerRuns=1  dom=false      ← one handler run, the box unchecks
R1    →  P4 handlerRuns=2  dom=TRUE       ← re-entry, two toggles, the box stays TICKED
```

So with the guard removed, a user clicking a ticked privacy box in a browser **fails to untick
it** — and no test in the slice would say so.

**CLASS.** *jsdom's `element.click()` cannot exercise any property that depends on the
click-in-progress flag.* One member found (this one). The shipped guard is **correct**; this is a
coverage gap plus a technique the mission should keep.

**Remedy — `BINDING (measured: R1 14/14 green under .click(); P4 handlerRuns 1 → 2 and dom
false → true under a dispatched MouseEvent)`.** One case in
`tests/render/consent-signup-modal.test.tsx` that reaches the ticked state lawfully, dispatches a
`MouseEvent("click", {bubbles:true, cancelable:true})` on the input, and asserts the row handler
ran once and the box unchecked. `probes/code-rev-s02-c7-r1-probe.test.tsx` case **P4** is the
oracle, ready to lift. **Ticket:** *"S02-C7 N6 — pin the re-entrancy guard with a dispatched
MouseEvent"*.

### N7 · `superpowers:systematic-debugging` was in the worker floor and was not loaded
**`t_f39d50db` handoff, the `SKILLS LOADED` block.** The author declares:
*"superpowers:systematic-debugging — NOT loaded this session … the one thing that broke … was
root-caused inside the TDD loop by reading jsdom's own source before any fix was tried."*

**Ruling, plainly, as charged.** **Yes, it was a bug in the floor's sense.** The floor reads
`systematic-debugging (any bug)`, not *any bug I get stuck on*: a RED case whose cause lived in a
dependency's source is the paradigm case. `heartbeat-protocol` §3b and COMMON §10.25 leave the
seat exactly one lawful move when the floor is not loaded — declare the shortfall in §10.9's form
— and the author took it, in that form, unprompted, in the first block of the handoff. So this is
**a finding against the seat that costs a line and nothing more**. Two things are worth saying
beside it: the seat's honesty is not in question and I do not question it; and the *substance* of
the skill was met — error read in full, reproduced, dependency source read, single hypothesis,
minimal change, verified with a mutant that puts the defect back. **The declaration is the gap,
not the method.**

**CLASS.** *Floor skills are loaded on the trigger, not on the difficulty.* Sweep of the author's
line: `using-superpowers` ✅ · `heartbeat-protocol` ✅ · `heartbeat-worker` ✅ ·
`test-driven-development` ✅ · `verification-before-completion` ✅ · `systematic-debugging` ❌
(declared) · `receiving-code-review` — correctly `not loaded, round 0, no review received`.
Orchestrator's body-grep at exit agrees with all seven.

**Remedy — `ADVISORY`.** No rework. **Ticket:** *"CODE-S02-C7 N7 — floor-skill shortfall, declared;
one line in the ledger"*.

### N8 · Packet defects 3, 4, 5 confirmed — against the orchestrator's packet, not the author
`e0666a79`'s "TEST count rises by one" is measurably false (8/8 and 28/28 either side, §2) —
COMMON §10.28's class. The `allowed` list calls itself exhaustive while commits 2 and 3's
surfaces are granted three sections later (harmless: both grants are explicit; one list should
carry all three). And `probes/code-rev-s02-c3c4-r1-mutant-m09_no_type_button.py` still carries a
hard-coded `.worktrees/rev-s02-c3c4` path against COMMON §10.35 — the author declined to run it
and wrote lane-from-`argv` mutators instead, which is the right call. **My own kit is clean:
`grep -rn '\.worktrees/'` over the promoted `.py`/`.sh`/`.mjs`/`.tsx` returns nothing.**
**Remedy — `ADVISORY`**, all three already acknowledged by the orchestrator on the ticket.

---

## 4. Rulings the packet asked for, in one place

| Charge | Ruling |
|---|---|
| PACKET DEFECT 1 — the microtask relocation | **ACCEPTED.** Correct in jsdom *and* under a spec-conformant canceled-activation (P0/P1). The packet's literal placement is broken **only** in jsdom (M10 6 RED; conformant + M10 passes). |
| Microtask vs React's commit | React commits **first**, inside the dispatch, with the box momentarily `true`; the restore and the microtask follow. **No observable window** — one task, no paint, DOM already `false` when the microtask runs (P2). |
| F2 — dead or live | **Dead for behaviour, live at the tracker.** No route swallows an `onChange` that matters. Neither branch of the charge's dichotomy fits → **N2**, two lawful outcomes. |
| F3 — is the pair right | **Yes**, and the masking mechanism is `PrivacyPolicyModal.tsx:138-139` → **N4**. |
| PLAN DEFECT 2 — `S02-S71` vs R16 | **The author is right and the round trip is strictly stronger.** SPEC R16 (`:294-297`) puts initial focus on `×`; `useModalSurface:168-171` implements it; `consent-policy-modal-behaviour.test.tsx:255-256` already pins it; **V-16's own worked example says "focus lands on its close button"**. The PLAN's third assertion is unsatisfiable and must not be made true. The round trip asserts initial focus on `×` **and** return to the input, which subsumes the step's intent. **V-16's default survives**: no keydown handler of the card's own, the browser's `Space` reaches the same click path, box stays empty, and jsdom produces no activation from `Space` (P7, `clickEventsSeenFromSpace=0`) — acceptance step 14 remains V's. → orchestrator's docs residue `t_4f97ca86`. |
| The eleven constants | All probed in my own fixture. (1) click rule ✅ (M2/M3/M4 each 1 RED) · (2) predicate reads the mirror ✅ (**M1 = 12 of 14 RED**) · (3) resync ✅ + N2 · (4) member 1 byte-identical at `:299-302` ✅ (R7 1 RED) · (5) focus ✅ code / ❌ coverage → **N1** · (6) V-16 ✅ · (7) V-18 ✅ (`S02-S28/S29` via the acknowledgement route, incl. the assignment-announces-nothing reset) · (8) outside the form ✅ (`S02-S57`), `mode="consent"` ✅ (M14 6 RED) · (9) `type="button"` ✅ (m09 1 RED) · (10) `disabled` byte-identical ✅, R19 ✅, R21 all 0 ✅ · (11) count claim **refuted** → N8. Conditional mount + reopen: **R2 1 RED**, the reopen case is the only one that sees it. Re-entrancy guard → **N6**. |

---

## 5. Predictions (falsifiable evidence that blindness held)

I expect a parallel lens to have re-planted M10 and M11 and stopped there, because the packet
frames both as the review's centre of gravity — and to have reported F2 as a flat "dead code,
remove it", missing that the tracker **is** measurably repaired (my P3 table) and that the
charge's own dichotomy therefore does not close. I expect **N1** (focus pinned for one entry point
of three) and **N6** (the re-entrancy guard, invisible to `.click()` and visible to a dispatched
`MouseEvent`) to be the two findings another lens most likely missed, because neither is named
anywhere in the packet and both need a mutant nobody asked for; **N3** (member 2 masking member 1
on five of six routes) needs a *combined* mutant, which a single-mutant matrix will not produce. I
also expect a lens to have accepted "the policy modal renders AFTER the card" without measuring it
and so to have missed **N5** (it is `CONTAINED_BY|FOLLOWING`, not a sibling). Conversely, I expect
another lens may have gone further than I did on `PrivacyPolicyModal.tsx`'s own behaviour under
the conditional mount — I treated that file as C5/C6's and unchanged, and I did not re-audit it.
**What I would check first if I were re-reviewing my own verdict:** whether N1's remedy can be
satisfied by extending `S02-S50`/`S02-S51` without making them assert two properties at once, and
whether N6's dispatched-`MouseEvent` case is stable across `fileParallelism: false` re-runs — I
ran it four times (three at HEAD, once under R1) and it was deterministic each time.

---

**Round 1 of 3.** This is a PASS: no rework round opens, and the eight N-findings carry tickets
per `heartbeat-reviewer` §3 (non-blocking sets WHEN, never WHETHER). `git status --porcelain` in
`.worktrees/rev-s02-c7/dialectical-engine` = **0 entries**; every mutant restored with
`git checkout HEAD -- <path>` and the porcelain printed after each; `.review-scratch/` deleted.
Probe kit promoted to `.hermes/reports/consent-ui/probes/code-rev-s02-c7-r1-*` (7 files, lane
from `argv`, `grep -rn '\.worktrees/'` clean) **before** this verdict was posted.

`comments read through: all` (`t_f39d50db` 6 comments, `t_cc9ad596` 2).
