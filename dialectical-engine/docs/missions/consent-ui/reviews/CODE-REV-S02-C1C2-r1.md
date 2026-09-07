# CODE-REV-S02-C1C2 — round 1 verdict · slice S02, clusters `S02-C1` + `S02-C2`

`SKILLS LOADED: superpowers:using-superpowers, heartbeat-protocol, heartbeat-reviewer, superpowers:verification-before-completion`
`superpowers:systematic-debugging` — **not loaded this session** (COMMON §10.9 form): the packet
names it "when judging a failure"; the one failure I judged (B1) was root-caused by direct
measurement — six probes isolating React's effect-commit order — with no hypothesis stack to
manage. `superpowers:receiving-code-review` — **not loaded this session**: nothing of mine is
contested yet; I load it before answering if the author contests B1 or N2.

**Verdict: REWORK** — 1 blocking (B1), 4 non-blocking (N1–N4). Round 1 of max 3.

**Under review:** seat `CODE-S02-C1C2`, ticket `t_eab0c89f`, commits `8fe1e0bc` (C1) and
`91877847` (C2) on `slice/consent-s02`.
**My worktree:** `.worktrees/rev-s02-c1c2/dialectical-engine`, detached at `91877847`,
`git status --porcelain` = 0 entries at CLAIM and 0 at handoff. `pnpm run generate:contract`
run first (exit 0, tree unchanged).
**Probe kit (promoted BEFORE this verdict, COMMON §10.26):**
`.hermes/reports/consent-ui/probes/code-rev-s02-c1c2-r1-*` — 8 files; the cluster script
carries the re-run instructions and the expected output on both a broken and a fixed module.

---

## 0. Headline

The work is of high quality and the author's handoff is honest to the byte: **every claim
in it that I re-measured, verified.** Both cluster commands are green ×3 in both shells, the
file surface is exactly the `allowed` list, the standing gates sit exactly on BASELINE, the
policy transcription is byte-exact on the decoded characters with **zero** mismatches, and
9 of 9 well-formed mutants are killed by the author's own suite.

**One property is wrong, and it is the load-bearing one.** The Esc stack orders itself by
React's effect-commit order rather than by which surface is on top. For two surfaces that
mount in one commit with one nested inside the other, the surface UNDERNEATH consumes the
`Escape`. The author's test cannot see it because it mounts SIBLINGS, and siblings are the one
arrangement in which the bug does not fire. This is B1.

---

## 1. Packet review (`heartbeat-reviewer` §1) — the packet that dispatched the work

Checked against the artifacts they claim to quote. **Every constant verifies:**

| Packet claim | Measured by me | Result |
|---|---|---|
| base commit `2b670d30` | author's CLAIM verified it; `git log 2b670d30..91877847` = the 2 commits | OK |
| commits `8fe1e0bc`, `91877847`; HEAD `91877847` | `git rev-parse --short HEAD` in my worktree | OK |
| review package "893 lines" | `wc -l` → **893** | OK |
| `privacyPolicy.ts` exports `POLICY_JUMP`, `POLICY_SECTIONS`, `PolicyJump`, `PolicySection` | `grep -nE '^export (type\|const) '` → exactly those four | OK |
| S02-S72's three ADR arms green | re-run by me, §4 below | OK |
| `allowed` list vs the deliverables the packet demands | self-report path and TOOLING-TRAPS append are both IN `allowed`; the 5 product/test/doc files match `git diff --name-status` exactly | OK |
| packet path resolves from the seat's cwd | it does | OK |

**One defect: N4** (§6). The packet's own §4 orders me not to charge the author for a sentence
that is not in the packet.

**Author's `SKILLS LOADED` vs the worker floor** — checked, and it PASSES.
Declared: `superpowers:using-superpowers, heartbeat-protocol, heartbeat-worker,
superpowers:test-driven-development, superpowers:verification-before-completion`, with
`systematic-debugging` and `receiving-code-review` declared as **not loaded**, each with its
reason in COMMON §10.9's exact form ("nothing broke"; "this is round 0"). That is the honest
shortfall form, not a shortfall finding. The claim "nothing broke" is corroborated by §3 of the
handoff: every RED frame is a declared RED-before-GREEN or a named mutant. **No fabrication
finding.**

**Author's self-report bar** (`.hermes/reports/consent-ui/agent-reports/CODE-S02-C1C2.md`,
183 lines, written 22:48, BEFORE the 22:51 handoff): meets it. Names causes not symptoms,
prices findings, records dead ends (F8's escape-mutant no-op), and says where the packet was
unclear (F5). Not anodyne.

---

## 2. B1 — BLOCKING

**File:** `apps/ui/components/consent/modalSemantics.ts:88-100` (`handleDocumentKeydown`,
`const top = surfaceStack[surfaceStack.length - 1]`), fed by the push at `:123-136`
(`React.useEffect`).

**CLASS: "topmost" is derived from a PROXY (React effect-commit order) instead of from the
property itself (visual/DOM stacking).** `React.useEffect` runs CHILD-FIRST within one commit,
so a nested pair lands on the LIFO as `[inner, outer]` and `surfaceStack[length - 1]` is the
surface UNDERNEATH.

**Concrete inputs → wrong outcome** (probe
`code-rev-s02-c1c2-r1-esc-stack.probe.tsx` case `P1`, and
`code-rev-s02-c1c2-r1-nesting.probe.tsx` cases `Q1`/`Q2`/`Q5`):

```
render(<Surface open name="outer"><Surface open name="inner"/></Surface>)   // ONE commit
document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true,cancelable:true}))

Q1 SIBLING same-commit  -> outer=0 inner=1     (this is the shape the AUTHOR's test uses)
Q2 NESTED  same-commit  -> outer=1 inner=0     (SPEC demands outer=0 inner=1)
Q5 three nested a>b>c, ONE Escape -> closed: ["a"]     (SPEC demands ["c"])
Q3 StrictMode NESTED    -> outer=1 inner=0     depth after mount = 2 (no leak; the ORDER is the defect)
```

This violates, verbatim: `SPEC.md` S02-R14/R16 — *"the topmost open surface consumes Esc and no
other surface acts on the same event"* — and `PLAN.md` S02-S01's property.

**Reachability — measured, not argued** (`code-rev-s02-c1c2-r1-remount.probe.tsx`):

```
R1a sequential open  -> card=0 modal=1   (the normal S01 flow: the card opens, THEN the modal — CORRECT)
R1b AFTER a remount  -> card=1 modal=0   (same two surfaces, subtree re-keyed while both open — INVERTED)
R2  after ONE Escape: card in document = false, modal in document = false, depth = 0
```

`R2` is the worst of it: because S01's policy modal is a React child of the preferences card
(`slices/S01/SPEC.md` §States, *"Card (either) | `Privacy notice` | Policy modal (`mode="read"`)
over the card"*), the inverted stack calls the CARD's `onClose`, the card unmounts, and the
modal unmounts with it. **One `Escape` removes BOTH surfaces** — the exact outcome
`slices/S01/SPEC.md:350` forbids in words (*"one Esc must not throw the visitor two surfaces"*)
and the defect REQ-REV-01 B3 was raised to prevent.

The remount path is not hypothetical: `apps/ui/next.config.mjs` does **not** set
`reactStrictMode`, and Next 15.5.23 (measured) defaults it to `true`, so the dev stack V runs
acceptance in re-invokes effects; any subtree remount while both surfaces are open (a `key`
change, a Fast Refresh mid-session) reorders the stack. Measured under `StrictMode` at `Q3`.

**Why the cluster's own gate is blind to it.** The author's two-surface case mounts a fragment
of SIBLINGS. The SPEC hook (*"mount two surfaces through it, one over the other"*) and
`PLAN.md` S02-S01 (*"outer first then inner"*) are both satisfied by siblings, and the
refutation table's mutant (*"a FIFO instead of a LIFO"*) fails against siblings — so the pin
looked strong from four artifacts at once. I confirmed the blindness directly: at HEAD the
author's suite is `Tests 10 passed (10)` while my kit is `Tests 2 failed | 27 passed (29)`.

**Sweep of the class (COMMON §2.2 — the finding is a SAMPLE):** the same `top` feeds the Tab
trap at `:97-99`, so the trap is applied to the wrong surface under the same conditions —
measured at `P10`: with two surfaces open, Tab pressed while focus is inside surface `a` moves
focus into surface `b`. Members of the class: **both** consumers of this module (S01's
preferences card, S02's `PrivacyPolicyModal`) plus every future overlay, since ADR-0022
consequence 4 declares the rule law for the repository. No third mechanism in the module
derives an order, so the sweep is complete at two call sites.

**Remedy — BINDING (measured).** What binds is the CLASS: *the module must not infer "topmost"
from effect order, and the regression pin must use a NESTED pair, because a sibling pair cannot
express the property.* The specific fix below is what I measured, and any equivalent is
acceptable:

```ts
function topmostSurface(): StackEntry | undefined {
  if (surfaceStack.length === 0) return undefined;
  let top = surfaceStack[surfaceStack.length - 1]!;
  for (const candidate of surfaceStack) {
    const a = top.read().containerRef.current;
    const b = candidate.read().containerRef.current;
    if (a === null || b === null || a === b) continue;
    const rel = a.compareDocumentPosition(b);
    if (rel & Node.DOCUMENT_POSITION_CONTAINED_BY || rel & Node.DOCUMENT_POSITION_FOLLOWING) top = candidate;
  }
  return top;
}
// handleDocumentKeydown: const top = topmostSurface();
```

**Measured: what I ran.** Applied that 14-line change to `modalSemantics.ts` at `91877847`,
then, in the same worktree:

```
AUTHOR suite  pnpm exec vitest run tests/render/consent-modal-semantics.test.tsx
              exit=0   Tests  10 passed (10)                      <- NO regression
REV probes    pnpm exec vitest run --config .review-scratch/probe.vitest.config.ts
              exit=0   Tests  29 passed (29)                      <- was 2 failed | 27 passed
              P1 NESTED same-commit -> outer.onClose=0 inner.onClose=1
              Q2 NESTED same-commit -> outer=0 inner=1
              Q5 three nested a>b>c, ONE Escape -> closed: ["c"]
              R1b AFTER a remount   -> card=0 modal=1
              R2  after ONE Escape: card in document = true, modal in document = false, depth = 1
git checkout HEAD -- apps/ui/components/consent/modalSemantics.ts   # reverted; porcelain clean
```

**Discharge (COMMON §10.10):** re-run
`.hermes/reports/consent-ui/probes/code-rev-s02-c1c2-r1-esc-stack.probe.tsx`,
`…-nesting.probe.tsx` and `…-remount.probe.tsx` against the fix and print
`Tests 29 passed (29)` verbatim; add the nested-pair case to
`tests/render/consent-modal-semantics.test.tsx` so the cluster command owns it thereafter.
**Also update `ADR-0022` §Decision and `PLAN.md` §Cluster S02-C1's S02-S01, which both describe
"the last entry" — the words that produced the defect.** The exported surface does NOT change,
so S01 is not disturbed.

---

## 3. Non-blocking findings — each demands a fix; the tier sets WHEN, never WHETHER

### N1 — the pinned focusable selector admits elements that cannot take focus, and the full-Tab trap turns that into a dead Tab key

**File:** `modalSemantics.ts:56-57` (`FOCUSABLE_SELECTOR`) and `:74-86` (`trapTab`'s
unconditional `event.preventDefault()`).
**CLASS:** *the trap chooses the next element from a static ATTRIBUTE selector for a property
(focusability) that depends on element type and computed style.*
**Inputs → wrong outcome** (probes `P11`, `P12`): a surface containing
`<input type="hidden" name="csrf">` —

```
P12 pinned selector matches inside the surface:
    ["BUTTON[button]:close-s","INPUT[hidden]:","BUTTON[button]:invisible","BUTTON[button]:visible-last"]
P12 Tab from close-s -> activeElement = BUTTON/button/close-s        <- focus did NOT move
P11 Tab from close-s landed on: untabbable   (a real browser would skip tabindex="-1")
```

`preventDefault()` is called and then `focus()` is invoked on a hidden input, which is a no-op
in jsdom **and in every real browser** — so inside a `role="dialog"` the Tab key does nothing
at all. **Members of the class:** `button`/`input`/`select`/`textarea`/`a[href]` carrying
`tabindex="-1"` (the `:not([tabindex="-1"])` guard is on the `[tabindex]` arm **only**);
`input[type=hidden]`; anything under `display:none` / `visibility:hidden` / `[hidden]` /
`inert`; and positive-`tabindex` ordering (the cycle walks DOM order, browsers walk tabindex
order).
**Not the author's invention:** the selector is byte-pinned by `PLAN.md` S02-S06 and quoted in
ADR-0022; the author transcribed it exactly. The finding is against the pinned selector plus
the unconditional `preventDefault`, and it lands before C5/C6 put a form control in the modal.
**Remedy — ADVISORY.** Suggested shape: after `focus()`, if `document.activeElement` did not
change, advance to the next candidate; or filter out `[type=hidden]`, elements with no
`getClientRects()`, and non-`[tabindex]` elements carrying `tabindex="-1"`. **Advisory because
I could not measure the visibility member: jsdom's `focus()` DOES move focus onto a
`display:none` element, so no jsdom probe discriminates it** — that half is V's or a real
browser's. The `input[type=hidden]` and `tabindex="-1"` members ARE measured (P11, P12).

### N2 — `stopPropagation()` on the Escape path is implemented, is pinned by ADR-0022, and is asserted by nothing

**File:** `modalSemantics.ts:93` (`event.stopPropagation()`).
The author disclosed this as F3; I confirmed it independently and measured the consequence:

```
mutant: remove event.stopPropagation()
  AUTHOR suite: exit=0   Tests  10 passed (10)          <- blind
  MY probes   : exit=1   Tests  2 failed | 18 passed (20), one being
                "P4 Escape is preventDefault'd and stopPropagation'd; a window listener never sees it"
```

ADR-0022 §Decision states it as part of the Esc-stack shape, so a later seat may delete it as
dead code with a green suite.
**Remedy — BINDING (measured: the run above).** Add the six-line pin to
`tests/render/consent-modal-semantics.test.tsx` — register a `window` keydown listener, open one
surface, dispatch `Escape`, assert the window listener was called 0 times. **It belongs in this
cluster, not in a consumer's** (F3 proposes S02-S56 / S01-R18): the behaviour is this module's
and this file is its gate.

### N3 — an environment assertion that will fail on a dependency upgrade, not on a product regression

**File:** `tests/render/consent-modal-semantics.test.tsx:687` —
`expect(typeof window.matchMedia).toBe("undefined")`.
This asserts a property of jsdom 30.0.1, not of `prefersReducedMotion`. When jsdom implements
`matchMedia`, the case goes red and the failure will read like a modal-semantics regression.
**Remedy — ADVISORY.** Drive the absent branch explicitly (delete or stub the property to
`undefined` inside the case) instead of asserting the environment lacks it, and keep the
environment fact as a comment. **Honest disclosure: my own `P17` carries the same line**, so
this is a shared idiom worth fixing once rather than a charge against the author.

### N4 — a dispatch packet is an untracked file with no snapshot, so packet review cannot verify its own history

**Measured:** `.hermes/planning/consent-ui/packets/CODE-S02-C1C2.md` is `??` in
`git status --porcelain`, mtime `22:02:27` — **before** the author's CLAIM at `22:24:38`.
The author's F5 quotes that packet as pinning "the four-member `ModalSurface`", and my own
packet's §4 repeats the correction and forbids me to charge the author for it.
`grep -n "four\|Four"` over that file returns **0 lines**.
So the sentence is not there now, I cannot show it ever was, and I charge nobody — but
`heartbeat-reviewer` §1 makes packet review my job and this document leaves no trace of its own
history. COMMON §10.26 already mandates pre-edit snapshots for artifacts a REWORK packet may
change; the gap is the dispatch packet itself.
**Remedy — ADVISORY.** Either commit the packets, or copy each to
`.hermes/reports/consent-ui/snapshots/<packet>.at-dispatch` when the seat is launched.
*(For the record: the author's F5 substance is correct — `ModalSurface` has THREE members and
the four-member type is `PrivacyPolicyModal`'s prop type, which is C5's. Nothing is charged.)*

---

## 4. The ruling the packet asks for: the author's full-Tab focus trap (F2)

**RULING: the full-Tab approach is CORRECT. ADVISORY — no change ordered, and no SPEC/PLAN
rewording is required.** Its selector is a separate finding (N1). Reasons, measured:

1. **It is the standard implementation.** Managing every `Tab` (`preventDefault` + explicit
   focus move) is what a focus trap is; the end-only/sentinel alternative depends on the
   browser's sequential focus navigation, which jsdom does not implement. The author's claim
   that `S02-S06` is unsatisfiable under an end-only trap is **correct**, and its consequence is
   broader than they said: under an end-only trap my `P9` and `P10` cannot be written at all,
   because nothing in jsdom moves focus for them to observe.
2. **It does not fight native tab order in the harmful sense.** While a surface is open it is
   modal, so replacing document tab order inside it is the intended behaviour. It *does* discard
   the browser's positive-`tabindex` ordering — a real but narrow divergence, folded into N1.
3. **It handles `disabled` correctly**, and the "queried at the moment `Tab` is pressed, never
   cached" clause of DECISIONS is genuinely delivered — **verified by measurement, not by
   reading**: my corrected mutant (cache populated in the effect, i.e. AT OPEN) turns the
   author's case red —
   `FAIL … > recomputes the focusable set on every Tab instead of caching it at open`.
   (My first attempt at this mutant cached at first-Tab and survived; that survivor was my
   error, not a coverage gap, and I re-modelled it before reporting.)
4. **`SPEC.md` R16's sentence is a SUBSET of what ships, not a contradiction of it.** R16 pins
   the two end transitions; the implementation satisfies both and more. Nothing needs
   rewording; what needs a decision is the focusability predicate, and that is N1.

---

## 5. What I verified, and HOW — verbatim outputs

### 5.1 Both cluster commands, ×3, from a `.sh` under `/bin/bash` AND inline (COMMON §10.16)

The PLAN's `run()` idiom transcribed verbatim from `PLAN.md:1376-1388`. Script:
`.hermes/reports/consent-ui/probes/code-rev-s02-c1c2-r1-cluster.sh`.

```
=== FROM .sh UNDER /bin/bash ===            === INLINE (tool shell) ===
--- RUN 1 ---                               --- RUN 1 ---
S02-C1 | vt=0 guard=0 VERDICT=0 | sum=[      Tests  10 passed (10)] fil=[ Test Files  1 passed (1)]
S02-C2 | vt=0 guard=0 VERDICT=0 | sum=[      Tests  6 passed (6)] fil=[ Test Files  1 passed (1)]
--- RUN 2 ---   (identical)                 --- RUN 2 ---   (identical)
--- RUN 3 ---   (identical)                 --- RUN 3 ---   (identical)
```

**Three-run worst case, as I measured it:**
**`S02-C1` — WORST RUN VERDICT=0, `Tests 10 passed (10)`, `Test Files 1 passed (1)`.**
**`S02-C2` — WORST RUN VERDICT=0, `Tests 6 passed (6)`, `Test Files 1 passed (1)`.**
Both shells agree; no run differed. The author's three-run table is confirmed.

### 5.2 `S02-S72`'s three ADR arms, re-run by me

```
ARM1 EXISTS
ARM2 Status: Proposed count = 1
ARM3 useModalSurface = 1 · backdropCloseHandler = 1 · prefersReducedMotion = 1 · openSurfaceCount = 2
ARM-neg 'Status: Accepted' = 0
```

The ADR's own measured claims re-measured by me at `91877847`: `aria-modal` in **7** `.tsx`
files, exactly the seven the ADR names; `createPortal` / `Escape` / `focusTrap` / `.focus()` /
`addEventListener("keydown"` → **0 files each** excluding the new module. The ADR invents
nothing, matches the code, and is `Proposed`. **Its §Decision paragraph must be corrected under
B1** ("only the last entry's `onClose` is invoked").

### 5.3 Standing gates — the DELTA, never "green"

```
G1  pnpm typecheck            exit=1 · ran-arm `^\$ tsc --noEmit$` = 1 · 8 diagnostics,
                              ALL in tests/unit/s14-ui.test.ts · OUTSIDE THE PIN = 0.  DELTA vs BASELINE: ZERO.
G1b cd apps/ui && npx tsc --noEmit -p tsconfig.json   ->  exit 0   (COMMON §10.30's second arm)
G2  t9-mode-tokens            exit=1 · exactly 2 anchored FAIL lines, the two pinned names ·
                              colour-literal HIT LIST = 1, the pinned element
                              ".../apps/ui/app/globals.css:6096:background: color-mix(in srgb, #0a0806 32%, transparent);"
                              DELTA vs BASELINE: ZERO — no third failure, no second hit.
G3  v2ui-node-runner          exit=0 · Tests 2 passed (2)
```

### 5.4 File surface vs the `allowed` list — exact

```
A  apps/ui/components/consent/modalSemantics.ts
A  apps/ui/lib/privacyPolicy.ts
A  docs/architecture/01-decisions/ADR-0022-shared-modal-semantics.md
A  tests/render/consent-modal-semantics.test.tsx
A  tests/unit/consent-privacy-policy-data.test.ts
5 files changed, 848 insertions(+)
```

Nothing outside it. `globals.css` untouched (0 hits). `packages/` untouched (0 hits). No
`register(` / `adult_affirmed` / `privacy_accepted` line added anywhere in the diff — **the
registration request shape is unchanged**. No `#hex` / `rgb(a)(` / `oklch(` literal in either
created product file.

### 5.5 The exported surface vs the PLAN's fenced block — checked by me, byte-level

Probe `code-rev-s02-c1c2-r1-surface-check.py`, no whitespace normalisation.

```
ModalSurface type            in PLAN block: True    in MODULE (byte-for-byte): True
useModalSurface sig          in PLAN block: True    in MODULE (byte-for-byte): True
backdropCloseHandler sig     in PLAN block: True    in MODULE (byte-for-byte): True
prefersReducedMotion sig     in PLAN block: True    in MODULE (byte-for-byte): True
openSurfaceCount sig         in PLAN block: True    in MODULE (byte-for-byte): True
ALL FIVE SIGNATURES PRESENT BYTE-FOR-BYTE IN BOTH: True
DISCRIMINATOR — a one-space reflow of the PLAN block must compare FALSE: False   (i.e. it discriminates)
negative controls (comma reflow, `HTMLElement|null` reflow, param reflow): all False
```

**Answer to the packet's charge, stated precisely: YES — all five exported signatures are
byte-identical to the PLAN's block.** The one textual difference is that the PLAN carries
`// test-visible depth of the Esc stack` trailing on the `openSurfaceCount` line while the
module carries it on the preceding line; a declaration block and an implementation cannot be
byte-identical as whole blocks (`;` vs `{` plus bodies). The author's handoff licenses exactly
this difference and no other, and my independent check agrees.
**The ADR's quoted block is byte-identical to the PLAN's block** (`True`, no diff).

**S01-consumption gate:** no `export default`, five named exports and no others, and **no
import-time side effect** — module scope holds only declarations (`surfaceStack`,
`listenerAttached`, `FOCUSABLE_SELECTOR` and functions); the `document` listener is attached
only when a surface opens. **S01 can consume this unchanged.** C2 exports exactly
`PolicyJump`, `PolicySection`, `POLICY_JUMP`, `POLICY_SECTIONS`.

### 5.6 The policy copy — decoded and diffed by me, never by eye

Probe `code-rev-s02-c1c2-r1-copy-diff.mjs`: evaluates `design-data.js` as JavaScript (so the
engine decodes `\uXXXX` exactly as TypeScript does), then compares codepoint by codepoint
against the module's own array literals.

```
=== PILLS ===     design length=8   code length=8   code order === design order: true
=== SECTIONS ===  design length=11  code length=11
=== R12 ACCENT MAPPING ===  all 11 rows OK (design symbol -> SPEC token -> code accent)
=== BULLET COUNTS ===  design [3,0,0,0,0,4,0,5,0,0,0]  ==  code [3,0,0,0,0,4,0,5,0,0,0], total 12
=== DECODING ===  literal six-char \uXXXX in module strings: 0
                  U+2014 em dash 12  ·  U+2019 1  ·  U+2192 1     (design decoded: 12 · 1 · 1)
######## TOTAL MISMATCHES: 0 ########
```

The SPEC's own escape tally re-measured with its own command:
`12 — · 2 ’ · 1 →` (15 total), `grep -c -i 'u00b7'` → `0`. Matches the SPEC pin.
The pill→section mapping is `["05","01","06","03","04","07","08","11"]`, exactly R11's table.
**Only one `’` reaches `policySections`** (the second is in `cookieCats`) — the module
carries 1, correctly.
*Correctly absent from C2:* the eyebrow, end marker and contact line live in
`turn-10-cookie-consent.html`, not in `design-data.js`; they are C5's surface.
**Disclosure on my own probe:** its first run reported 69 mismatches. That was a bug in MY
extractor (it matched the `[]` of the type annotation `readonly PolicyJump[]` instead of the
initialiser). Fixed by anchoring on `= [`; the corrected run is the one above.

### 5.7 Mutation harness against the author's suite — 10 mutants

`code-rev-s02-c1c2-r1-mutants.sh`; each applied, cluster command run, `git checkout HEAD --`,
porcelain printed.

| Mutant | Author's suite | Killed? |
|---|---|---|
| M1 FIFO (`surfaceStack[0]`) | 1 failed \| 9 passed — *delivers one Escape to the topmost open surface only* | yes |
| M2 stack never pops | 2 failed \| 8 passed | yes |
| M3b focusable set cached AT OPEN | 1 failed \| 9 passed — *recomputes the focusable set on every Tab…* | yes |
| M4 focus not returned | 1 failed \| 9 passed | yes |
| M5 `matchMedia` unguarded | 1 failed \| 9 passed | yes |
| M6 Escape to EVERY surface | 1 failed \| 9 passed | yes |
| M7 Tab `preventDefault` removed | 1 failed \| 9 passed | yes |
| M8 initial focus not applied | 2 failed \| 8 passed | yes |
| M9 second `document` keydown listener | 1 failed \| 9 passed | yes |
| **M10 `stopPropagation()` removed** | **exit 0 — `Tests 10 passed (10)`** | **NO → N2** |

Nine of ten killed. The author's own 20-mutant table is corroborated everywhere it overlaps
mine. **Porcelain after every restore: only my own `.review-scratch/`, deleted at handoff.**

---

## 6. What I did NOT verify — so the next lens knows the gaps

- **The browser half of N1.** jsdom's `focus()` moves focus onto a `display:none` element, so
  no jsdom probe can discriminate the visibility member of that class. UNVERIFIED; needs a real
  browser or V.
- **Whether a real browser delivers `Escape`/`Tab` to `document` at all** in the dev stack —
  `PLAN.md`'s own refutation table hands this to V (step 7 / step 14). UNVERIFIED here.
- **Clusters C3–C9.** Nothing in `SignUpFlow.tsx`, `PrivacyPolicyModal.tsx`, `globals.css` or
  the CSS/style contract exists yet; I reviewed only C1 and C2.
- **The merged S01+S02 tree.** S01's card does not exist at `91877847`, so B1's consumer-side
  consequence is measured on a faithful reproduction of S01's documented shape, not on S01's
  code. The mechanism (React effect order) is independent of that.
- **The ADR's business claims** (retention periods, `dezbatere.ro/subprocessors`, the controller
  entity) — the SPEC declares these UNVERIFIED-by-design and I did not re-derive them.
- **Anything about the visual result in either mode** — no CSS is in these two clusters.
- **`t9-mode-tokens`'s two pre-existing failures** — inherited from BASELINE, not investigated.

---

## 7. Tickets the orchestrator must route (`heartbeat-reviewer` §3)

| id | tier | Where the fix lands | Remedy tier |
|---|---|---|---|
| B1 | blocking | `modalSemantics.ts` + a nested-pair case in `consent-modal-semantics.test.tsx` + the ADR §Decision and `PLAN.md` S02-S01 wording | **BINDING (measured)** |
| N1 | non-blocking | `modalSemantics.ts` `FOCUSABLE_SELECTOR`/`trapTab`, and `PLAN.md` S02-S06 + ADR-0022 which pin the selector — decide before C5/C6 ship a form control | ADVISORY |
| N2 | non-blocking | `tests/render/consent-modal-semantics.test.tsx` (this cluster, not a consumer's) | **BINDING (measured)** |
| N3 | non-blocking | `tests/render/consent-modal-semantics.test.tsx:687` (and my own P17 shares the idiom) | ADVISORY |
| N4 | non-blocking | orchestrator process — snapshot or commit dispatch packets | ADVISORY |

The author's own F1, F3, F4, F6, F7, F8 are all confirmed as fairly reported; F3 is promoted to
N2 with a measurement and a different home, F5's substance is right and nothing is charged.

---

## 8. Predictions (blind-lens falsifiability)

I expect the other lens on this work to **PASS it**, and to pass it for a defensible reason:
every command in the author's handoff reproduces exactly, the copy is byte-exact, the mutation
coverage is genuinely strong, and the file surface is spotless — a reviewer who re-runs the
author's commands, re-runs the author's mutants and reads the diff carefully will find nothing.
**B1 is invisible to all four of those activities.** It is only reachable by writing a two-surface
fixture in an arrangement the author's fixture does not use, and the SPEC and PLAN sentences
both read naturally as describing the sibling arrangement, so a reviewer who takes the hook's
wording as the specification will build the same shape and see the same green.

My second prediction: if another lens does raise a stack finding, it will be about the **LIFO
vs FIFO** choice or about **`stopPropagation` vs `stopImmediatePropagation`**, not about effect
ordering — both are visible from reading, and both are already correct. I would check
`stopImmediatePropagation` first if I were arguing against myself: I ruled it unnecessary
because the module guarantees exactly one `document` listener (verified by the author's case and
by my M9 mutant), but that guarantee is the module's own and a consumer that adds its own
`document` listener would defeat it — outside this cluster's surface, and worth a sentence in
`A11Y-OVERLAYS` (`t_8962842f`).

Third: I expect no other lens to have measured **`reactStrictMode`'s default in Next 15.5.23**,
which is what turns B1 from a nested-mount curiosity into something reachable in the dev stack
V will run acceptance in. If a lens argues B1 is unreachable, that measurement is the reply.

---

`comments read through: 3` (`t_eab0c89f`: the author's CLAIM, HEARTBEAT and READY FOR PEER
REVIEW; no other comment existed on it). On my own ticket `t_0b1a0110`: my CLAIM and my
HEARTBEAT.
