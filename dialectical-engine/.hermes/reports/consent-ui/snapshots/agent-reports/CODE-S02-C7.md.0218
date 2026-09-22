# Self-report — CODE-S02-C7 (Claude Opus 5, worker, mission `consent-ui`, slice S02, cluster C7 + the C3 and C1 follow-ups)

**Round 0. Session date 2026-09-07. Lane `.worktrees/consent-s02/dialectical-engine`, branch
`slice/consent-s02`, base `44744d8d`, commits `e0666a79` · `511d30b6` · `9cc81351`.**
This file is NEW — checked with `ls` before writing (`No such file or directory`), per COMMON §10.33.

> treat it like a murder case. I want to get a nice report on what can be done better. What we
> must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How
> can we turn this into a one prompt machine even better.

---

## 1. The body on the floor: a BINDING, measured constant that is wrong where it is placed

**What happened.** Packet constant (3), marked BINDING and "measured R0–R3", ordered:
*"in the cancelling branch assign `privacyInputRef.current.checked = false`"*. I transcribed it
literally. The first C7 case then failed:

```
 FAIL … > opens the policy from the unchecked check square, leaving box and mirror false
AssertionError: the box must stay unticked: expected true to be false
```

**Root cause, measured not reasoned.** jsdom 30.0.1's canceled-activation behaviour for a
checkbox is a **TOGGLE**, not the spec's restore:

```js
// jsdom/living/nodes/HTMLInputElement-impl.js:179-182
_legacyCanceledActivationBehavior() {
  if (this.type === "checkbox") { this.checked = !this.checked; … }
```

The spec says *"set the checkedness back to the value it had before the pre-click activation
steps"*. jsdom's toggle is equivalent **only if nothing else writes `.checked` during dispatch**
— and the resync is exactly such a write. So `false` written inside the handler is inverted to
`true` after dispatch. Traced with a scratch listener at three points:

```
NATIVE listener (bubble on input): checked=true  defaultPrevented=false cancelable=true
NATIVE listener (document):        checked=false defaultPrevented=true
AFTER:                             checked=true  dialog=true
```

**Why the constant was not wrong when it was measured.** The reviewer's oracle
`code-rev-s02-c3c4-r1-recovery.test.tsx:57-64` assigns `.checked = false` **after the whole
dispatch has finished** (`await cancelledClick(); field(…).checked = false;`). The packet's
sentence relocated it into the handler. That is COMMON §10.22's documented failure mode arriving
a third time in this mission: *a remedy measured in one position, restated in another, and
carried forward as a constant.*

**The fix keeps the CLASS and corrects the placement:** a plain instance assignment (never the
prototype setter, never a synthesised `.click()` — both measured dead by the same oracle) in a
`queueMicrotask`, which runs after the activation steps in every environment. Mutant M10 puts
the packet's literal placement back: **6 of 14 cases RED.**

**Price:** ~25 minutes, one scratch trace file, one jsdom source read. **Price had the case not
existed:** a sign-up box that ticks itself the moment the policy opens — the single behaviour
V's goal forbids — shipped behind a green cluster command.

---

## 2. The second body: an ARCH assertion measured against a stand-in

`S02-S71` asserts `document.activeElement` is *still the privacy input* after the policy opens,
and carries `**Measured, all four** … activeElement=privacy-accepted`. Against the SHIPPED modal
that is false and must stay false: `SPEC.md` R16 puts initial focus on the `×` control,
`modalSemantics.useModalSurface` implements it, and `consent-policy-modal-behaviour.test.tsx:256`
already pins it. Written the step's way:

```
AssertionError: expected <button type="button" …(2)></button> to be <input class="consentBox" …(4)></input>
```

**The class, and it is the same one as §1:** *a figure measured against a MODEL of the system,
restated as a fact about the system.* The ARCH probe modelled the row and the mirror; it had no
modal semantics in it, so `activeElement` was whatever the probe left focused. TOOLING-TRAPS
already carries "A probe answers the question for the world it MODELS, and probes do not say what
that is" (`:1254`) — written by ARCH-REV-S02, in this mission, before this step was authored.

**What I shipped instead** is the property the step exists to establish, made stronger: the
keyboard **round trip** — activation moves focus INTO the policy (R16), and dismissing it returns
focus to the box the reader started from. Both halves are asserted; the `Space` keystroke itself
is still V's (jsdom does not implement Space-activates-checkbox).

**The generalisable upgrade (highest value in this report):** *a step whose acceptance names a
measured VALUE also names the ARTEFACT it was measured against.* `Measured on
arch-s02-rework-r1-c7-mirror-fixed.mjs (a component built from this plan's prose, no modal)`
would have told me in one line that `activeElement` was out of that probe's world. One clause per
measured figure; it would have saved ~15 minutes here and, on the evidence, a round somewhere
else.

---

## 3. What repeatedly cost tokens

### 3.1 Six consecutive "RED" runs that had not run anything (~12 min)
`run S02-C7 5 $C7` with the file list in a variable: **zsh does not word-split an unquoted
parameter**, so vitest received ONE filter string, matched nothing, and exited 1. Six runs
printed `S02-C7 | vt=1 guard=1 VERDICT=1 | |` — which reads as a genuine failure. The tell is the
**empty summary fields**; a real red always prints `Tests N failed | M passed`. This is variant 8
of the acceptance-command family (variant 7 was the silently-dropped missing path). **The guard
should carry a BROKEN arm — `[ -n "$sum" ]` — so it can say "did not run" instead of "failed".**
Appended to TOOLING-TRAPS.

### 3.2 A count in the packet that no edit could produce (~8 min to measure, and it is a trap for the reader)
The packet says twice that after commit 1 the C3 command's *"TEST count rises by one"*. The
ordered edit is *"one attribute assertion added to the S02-S18 case; nothing else"*. Measured
either side of that exact edit, `Tests 28 passed (28)` both times. Only a new `it()` moves that
number. The cost is not the eight minutes — it is that a seat which trusts the packet **reports a
delta that never happened**, and the reviewer who checks it finds a fabrication where there was
only an unmeasured constant. **Rule: a packet predicting a count change names the UNIT it changes
— a case, a file, a diagnostic, an array element.**

### 3.3 Reading 5,700 lines of mission documents to find eleven constants (~35 min, unavoidable today)
COMMON (134 lines, of which §10 is 38 numbered amendments), INSTRUCTIONS (99), SPEC v3 (757),
PLAN (2,224), DECISIONS (197), BASELINE (45), TOOLING-TRAPS (2,013), the C5C6 self-report (243),
two reviewer probes. **The packet's §2 is what made this survivable** — eleven numbered constants
with their ticket ids and their measurements, so the long documents were CONFIRMATION reading
rather than discovery reading. See §5.1 for the one thing that would cut it further.

---

## 4. What we must upgrade (ranked by expected saving)

### 4.1 Every measured figure carries the artefact it was measured on
§2's rule. One clause. It closes the class behind BOTH bodies in this report (§1 and §2) and
behind REQ-REV-01 B4/B5 and ARCH-S02-REWORK-R1 N3 — five instances in one mission of *a figure
that was true of a model and false of the product*. Nothing else in this report is worth as much.

### 4.2 The chain arm earned its keep, measurably, for the first time
A JSX comment containing the literal `<form>` took `authRoutes.source-test.mjs`'s form count from
3 to 4:

```
not ok 14 - every credential-bearing auth form has an explicit query-free POST fallback
  expected: 3   actual: 4
```

The cluster's OWN file was `Tests 14 passed (14)` throughout. The failure surfaced only in
`tests/unit/v2ui-node-runner.test.ts`, which is in C7's command **solely** because of the N7
chain rule. Without it this ships and C9 finds it. **Keep the chain rule; it has now paid for
itself once, and the payment is a whole cluster's rework.**

### 4.3 Declare RED-first vs GREEN-on-arrival per step — adopt CODE-S02-C5C6 §5.1
I used it and it is right. Of C7's fourteen cases, **three were RED-first** (S02-S49, S02-S50,
S02-S52) and eleven were GREEN-on-arrival, because the PLAN's steps are finer-grained than the
handler they describe: one `onClick` on the row satisfies three entry-point steps at once. That
is not a defect of the plan — the three entry points genuinely need three cases — but it means
**most of C7's proof is in the mutant matrix, not in the RED frames**, and a reviewer needs to be
told that in the handoff rather than counting three frames and wondering about eleven.

### 4.4 Price each remedy with the other removed — and say when one is inert
Measured on the two mirror-safety members:

| mutant | verdict |
|---|---|
| M5 acknowledgement sets the DOM only (member 2 still present) | **`Tests 14 passed (14)` — not caught** |
| M7 member 2 removed (acknowledgement still sets the mirror) | **`Tests 14 passed (14)` — not caught** |
| M8 both removed | `Tests 4 failed \| 10 passed (14)` |

So the two writes are individually redundant and jointly necessary, exactly as the PLAN predicts
for member 2 ("changes no observable outcome"). **And the same measurement applies to the tracker
resync of §1: mutant M11 removes it entirely and all fourteen cases stay green.** After C7's click
rule the only writes to the box are the acknowledgement's assignment and the checked branch's
`.click()`, and neither depends on the tracker — so the resync is defence in depth with no
observable consequence in this component. I shipped it because the packet binds it, and I am
saying plainly that **nothing in this slice pins it**, rather than implying coverage that does not
exist (`heartbeat-worker` §2).

---

## 5. Dead ends and near-misses, so nobody re-derives them

1. **Do not put the tracker resync in the handler** (§1). Six cases RED under jsdom.
2. **Do not assert focus stays on the input after the policy opens** (§2). R16 owns that.
3. **`input.value = x` cannot "type" into the card's controlled fields.** React's instance setter
   updates the value TRACKER as well as the DOM, so the `input` event that follows finds no
   change, `onChange` never runs, and the next render wipes the text. The PROTOTYPE setter is
   required — the exact opposite of the checkbox case, where the prototype setter is the trick
   that does NOT work. Both directions are now in the test file's comments.
4. **The re-entrancy is real and the guard is one clause.** The checked branch drives
   `input.click()`, which bubbles back through the same row handler. It terminates only because
   the predicate reads the React MIRROR (still `true` in the nested dispatch) and the branch is
   guarded by `event.target !== input`. A predicate reading the DOM would both invert the branch
   AND recurse.
5. **A neighbouring mutant that is semantics-preserving proves nothing.** My first "neighbour"
   was `checked && true`; green, and worthless. The neighbours that carry information are the ones
   that change behaviour somewhere the case under test does not look — N1 (a handler that ignores
   button-originated clicks) fails **only** S02-S51, which is what "the three entry points are
   pinned separately" is supposed to mean.

---

## 6. How to make this more of a one-prompt machine

### 6.1 The packet was the best I have been given; two additions would finish it
It named the two follow-up commits FIRST with their ticket ids, the eleven constants with their
tickets and measurements, the three "Orchestrator addition" blocks, and the forbidden files with
the reason (`consumed unchanged; a needed change is a finding, not an edit`). I never had to guess
what I owned. **Add:** (a) §4.1's artefact clause on every measured figure; (b) a line saying
which steps the packet EXPECTS to be green on arrival, so the seat and the reviewer agree in
advance about where the proof lives. The `allowed` list also declared itself exhaustive while the
second follow-up's files arrived two sections later — harmless because both were explicit, but
one list should carry all three commits' surfaces.

### 6.2 Give the standing `run()` a BROKEN arm
Three lines, and it closes variants 7 and 8 of a family this mission has now met twice:

```sh
[ -n "$sum" ] || { echo "$id | BROKEN: no summary line — the command ran nothing"; return 2; }
```

### 6.3 The single biggest structural cost is TOOLING-TRAPS.md as one 2,100-line scroll
CODE-S02-C5C6 said this and it bit again: the entries that would have saved me §1 and §3.1 are
both **in the file**, at `:1799` and `:1266`, and I read past them because 2,100 lines of
append-only prose has no index. It has now grown 96 lines in one session, mine included.
**Cheapest fix that keeps the append-only law: a generated index at the top — one line per entry,
`<anchor> · <one-sentence trap> · <date> · <seat>` — regenerated by whoever appends.** A seat
greps the index (100 lines) instead of skimming the scroll (2,100). Second-cheapest: tag every
entry with the SURFACE it belongs to (`#jsdom`, `#vitest`, `#shell`, `#react`), so a packet can
say "read the `#react` traps" and mean something mechanical.
