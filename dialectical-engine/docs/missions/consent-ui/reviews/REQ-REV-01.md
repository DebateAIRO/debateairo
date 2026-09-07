# REQ-REV-01 — blind review of REQ-01 (mission `consent-ui`, ticket `t_5916299b`) · ROUND 1 of max 3

SKILLS LOADED: superpowers:using-superpowers, heartbeat-protocol, heartbeat-reviewer, superpowers:verification-before-completion

**Verdict: REWORK** — 3 blocking (B1–B3), 9 non-blocking (N1–N9), 5 packet findings (P1–P5).

Seat REQ-REV-01, Opus 5, fresh blind session (nothing of REQ-01's work seen before this packet).
Reviewed at `2026-09-06 17:45–18:4x EEST`. Main tree `2b670d30` / branch `dev` / 90 dirty entries
(pre-existing, other missions, untouched). Test probes run in the clean lane
`.worktrees/consent-s01/dialectical-engine` (`2b670d30`, `slice/consent-s01`, 0 dirty). No git
writes, no edits to anything under review.

Round 1, so REWORK is lawful. This is **not** a "pass with concerns" dressed up: B1 and B2 each
make a coding seat build something the SPEC elsewhere forbids, and B3 is exactly the S01↔S02
interface mismatch my packet §2.4 calls blocking. The rest of REQ-01's work is unusually strong
and every measured claim it made survived independent re-measurement — see §Verified.

---

## Packet findings (`REQ-01.md`, and `COMMON.md` where it now binds)

**P1 — CONFIRMED (REQ-01 raised it; I verified it). Product-file pointers mix `path:line` with
bare paths.** `REQ-01.md:22` cites `SignUpFlow.tsx` (185-188, 190-192, 68-73) and
`client.ts:215-220` with ranges, but gives `AuthShell.tsx`, `layout.tsx`, `TopBar.tsx`,
`ModeToggle.tsx`, `settings/page.tsx` bare, and `globals.css` "around lines 780-1050". Each bare
pointer costs the seat a whole-file read. **Every constant the packet DID cite, I checked and all
are exact:** `SignUpFlow.tsx:185-188` = the `.authCheck` label/input, `:190-192` = the submit
button, `:68-73` = the four-argument `client.register(...)`; `client.ts:215-220` = the four-param
`register` signature; `globals.css` `:root` 5-97 and `html[data-mode="chamber"]` 99-158.
Already fixed forward by `COMMON.md` §10.5.

**P2 — CONFIRMED. `REQ-01.md:23` names four test files as "pins that touch the surfaces you
touch" and gives none of their measured state; two are RED at base.** This is the defect that
produced REQ-01's own contradiction #3. I re-measured all four myself in the clean lane and
REQ-01's figures are exact to the character (output in §Verified). Fixed forward by
`COMMON.md` §10.4.

**P3 — CONFIRMED. `REQ-01.md:35` offers a three-way menu ("replacing the bar, centred on the
same scrim used by 10c, or growing in place — decide one") that the Settings bullet at
`REQ-01.md:36` independently eliminates two thirds of** — in Settings there is no bar to replace
or grow from, so (b) and (c) each silently require a second layout the packet never asks for.

**P4 — NEW, against `COMMON.md` §10.7, not against REQ-01. The one shared modal-semantics
helper has no owner, and every available placement violates one of the three governing
documents.** `COMMON.md:103` (§10.7) says "The architecture seats site one shared helper (**S02
owns it, S01 consumes it**)". But `slices/S02/SPEC.md:567-571` gives S02 an exhaustive owned-file
list — `SignUpFlow.tsx`, `consent/PrivacyPolicyModal.tsx`, `lib/privacyPolicy.ts`, its CSS block,
its tests — containing no helper file; and `slices/S01/SPEC.md:620-621` claims "any other new file
under `apps/ui/components/consent/` **except** `PrivacyPolicyModal.tsx`". So a helper at
`components/consent/useModalSemantics.ts` is S01's by S01's rule and S02's by COMMON's;
a helper anywhere else is outside both slices' declared surfaces. Whichever ARCH picks, one
document is broken and the two lanes have a write conflict on a file neither SPEC lists.
**Not chargeable to REQ-01:** `COMMON.md` §10 is stamped 17:47 and the SPECs were frozen at 17:39,
so REQ-01 could not have read it. **Owner: the orchestrator**, before the two ARCH seats launch.
Cheapest fix: name the file and its owner in one line of COMMON §10.7 and in the ARCH packets.

**P5 — NEW, against my own packet (`REQ-REV-01.md:8`).** It names "the V-row defaults" as ground
truth I judge REQ-01 against. But `V-DECISIONS-PACKET.md:68` records that rows **V-9…V-14 were
routed FROM REQ-01's own contested decisions at 17:45** — after REQ-01 wrote them (17:42). Judging
REQ-01 against rows derived from its own output is circular. **I judged against C1–C10 and rows
V-1…V-8 only**, and record the fact rather than quietly reinterpreting the charge. Every one of
V-9…V-14 is REQ-01's own pick, faithfully transcribed — I checked all six against
`requirements/contested-decisions.md` and they agree.

`allowed`-vs-deliverables check on `REQ-01.md`: every mandatory deliverable of charges Q1–Q8
(compass, 8 slice files, `contested-decisions.md`, `REQ-01-handoff.md`, self-report,
TOOLING-TRAPS append, ticket comments) is inside the `allowed` list at `REQ-01.md:9-16`. **No
mandatory deliverable falls outside `allowed`.** The packet path resolves from the seat's stated
cwd. Comment cursor claim ("0 at dispatch") matches the ticket history.

**Author's `SKILLS LOADED` line vs the requirements floor — PASS.** Declared on `t_5916299b`
comment 3: `superpowers:using-superpowers, heartbeat-protocol, heartbeat-requirements,
superpowers:brainstorming`. `heartbeat-protocol` §1 floors requirements at
`superpowers:brainstorming`; COMMON §1 adds the router and the role contract. All four present,
in COMMON §1 order. The CLAIM comment also floated `superpowers:writing-plans` and
`design:accessibility-review` "if the charge earns them"; neither appears in the final line — so
nothing is named that was not loaded. **No fabrication.** The declared honest shortfall
(brainstorming's "wait for a human yes" gate, discharged via the contested table + blind review)
is exactly what `heartbeat-protocol` §2.7/§3b ask for, and `COMMON.md` §10.1 has since ratified
the adaptation.

---

## Blocking

### B1 — A signed-in first-visit visitor can make the consent bar disappear **without deciding**, and the SPEC says both that this happens and that it must not

`slices/S01/SPEC.md:205-208` (**S01-R14**): "*on close without a decision from the FIRST-VISIT
entry the bar returns; **from the SETTINGS entry nothing returns**.*"
`slices/S01/SPEC.md:426` (states table): `| Card (settings) | Esc / backdrop | Silent | none |`
`slices/S01/SPEC.md:428`: "*'Silent' = neither bar nor card is rendered anywhere in the app.*"

Against, in the same frozen file:
- `slices/S01/SPEC.md:193-196` (**S01-R13**): "*The bar offers no dismissal that is not a
  decision. … It leaves only by `Accept all`, `Essential only`, or a `Save choices` /
  `Essential only` taken in the card.*"
- `slices/S01/SPEC.md:94-95` (**R05**), `:59-60` (**R02**), `:68-69` (**R03**): with no valid
  stored decision, the bar shows.
- `slices/S01/SPEC.md:115-116` (**R07**): mounted app-wide, "*shows on every route*".
- `V-DECISIONS-PACKET.md:55` (row V-7 default, binding): "*shows on whatever page a visitor first
  opens, **until they choose***".

**The state is reachable, and V's own acceptance preamble is the recipe for it.**
`slices/S01/SPEC.md:541-542` tells V: "*To clear storage: DevTools → Application → Local storage →
delete `debateai.consent`, then reload.*" Deleting a `localStorage` key does not touch the
HttpOnly session cookie, so the visitor stays signed in. Concrete failure:

> signed in → delete `debateai.consent` → reload → bar shows (R07) → navigate to `/settings`
> (auth-gated, reachable — R22) → Privacy → `Cookie preferences` → the card opens from the
> **Settings** entry → press `Esc` → **R14 and the states table both say the app goes Silent**:
> bar gone, nothing written to storage, consent never given. R13, R05 and V-7 all say that is
> impossible.

**What gets built wrong.** S01's coding seat implements one of the two, at random. If it
implements R14/the table literally it ships a one-keystroke bypass of the consent gate on a GDPR
surface. If it implements R13 it fails V acceptance step 11
(`slices/S01/SPEC.md:566-568`), which asserts "*Open it from Settings and press `Esc`. → The card
closes, **nothing returns**, storage is untouched*" — step 11 is written assuming a decision is
already stored (it follows steps 3–10) and never says so, so it is ambiguous exactly where the
bug lives.

**Remedy (one sentence, cheap).** The entry point is not the discriminator — *whether a valid v1
decision is stored* is. Make R14 read: on close without a decision, the bar returns **iff no
valid stored decision exists**, from either entry; add a states-table row `| Card (settings), no
stored decision | Esc / backdrop | Bar | none |`; and add a hook (jsdom: seed nothing, open the
card via the Settings opener, press Esc, assert the bar is in the document). Also amend V step 11
to name the storage precondition.

### B2 — S02's prescribed fix for the three existing sign-up tests **cannot work** under the implementation S02-R17 itself prescribes. Probe-proven.

`slices/S02/SPEC.md:270-274` (**S02-R17**): "*The button's `disabled` attribute reflects the two
checkbox states live, with no submit required, **which means the component holds both in React
state rather than reading them only from `FormData` at submit time** (today's shape,
`apps/ui/components/SignUpFlow.tsx:72`).*"

`slices/S02/SPEC.md:532` (§Tests): "*Three cases tick **only** `adult-affirmed` … each via the
idiom `field("adult-affirmed").checked = true;` … **The slice ticks BOTH boxes in all three.***"
`slices/S02/SPEC.md:541-543`: "*records `tests/render/auth-flow-integration.test.tsx` GREEN at base
(exit 0, `Tests 17 passed (17)`) — so S02's three edits and one addition **must leave it at 18
passed, not fewer***".

Measured today (`apps/ui/components/SignUpFlow.tsx:185-188`, `:60-81`): the `adult-affirmed`
input is **uncontrolled** (no `checked`/`onChange` prop) and the handler reads it through
`FormData` at `:72` — which is precisely why `field(x).checked = true` works today.
R17 moves the truth into React state. I built a standalone jsdom+React 19.2.8 probe that models
both lawful readings of R17/R18 and runs the *exact* house idiom and the *exact* submit helper
from `tests/render/auth-flow-integration.test.tsx:35-48`. Three runs each, deterministic:

```
  implementation = CONTROLLED (what S02-R17 prescribes)
    submit button still disabled after .checked=true : true
    DOM .checked after render                        : true/true
    register() calls                                 : 0  <-- suite would be RED

  implementation = UNCONTROLLED + onChange mirror
    submit button still disabled after .checked=true : true
    DOM .checked after render                        : true/true
    register() calls                                 : 1  [[true,true]]
```

**What gets built wrong.** A coding seat that reads R17's own sentence and makes the checkboxes
controlled, then applies the §Tests remedy verbatim, ends with `auth-flow-integration.test.tsx`
at **14 passed / 3 failed**, not the 18 the SPEC asserts as a fact — and with no clue in the SPEC
that the remedy, not the implementation, is what is wrong. `.checked = true` on a controlled
input fires no React `change`, so state stays false and R18's handler-level refusal (`:281-283`)
correctly declines to call `register`. Only the uncontrolled+mirror reading survives, and nothing
in R17, R18 or §Tests pins it.

**Second defect in the same class, from the same probe:** `btnBefore` is `true` in **both**
implementations — `field(x).checked = true` never enables the submit button, because it fires no
change event. So **S02-R17's own hook** (`slices/S02/SPEC.md:277-279`: "*asserts the submit button
is `disabled` … and **enabled with both***") cannot be satisfied with the house idiom that the
very file it lives in uses three times. The new pins need a real click/`change` dispatch inside
`act`, and the SPEC never says so.

**Remedy.** Pin the implementation in R17 (state mirrored from an `onChange`, with the submit
handler's truth read from `FormData` — the only combination that keeps all three existing cases
green under their existing idiom), and say in §Tests that any new assertion about the *button's*
enabled state must dispatch a real `change`/click inside `act`, not assign `.checked`.

### B3 — With the policy modal open over the preferences card, **Esc has no specified precedence**, and the two frozen SPECs answer it differently. This is the S01↔S02 interface mismatch my packet §2.4 calls blocking.

The shared interface paragraph itself is clean — `slices/S01/SPEC.md:275-280` and
`slices/S02/SPEC.md:203-208` are **byte-identical** (`diff` empty, both md5
`0ea21132edfdfff5e6da37dc0d0556dc`). The mismatch is in what surrounds it.

- `slices/S01/SPEC.md:253-260` (**S01-R18**): the card is a focus-trapping dialog; "*Esc and a
  backdrop click both close it per R14*" — stated without exception.
- `slices/S01/SPEC.md:423` (states table): `| Policy modal (read) | Esc / backdrop / × / Close |
  the card it came from, unchanged | none |` — i.e. Esc must close **only** the topmost surface.
- `slices/S02/SPEC.md:253-258` (**S02-R16**) and `:107-112` (**R08**): the modal traps focus and
  "`Esc` closes it", also without exception.

Neither SPEC states a stacking rule, neither assigns ownership of the keydown listener, and
**no hook anywhere exercises it**: S01-R20's hook (`:285-287`) says only "*closes it*" without
naming the dismissal route, and V acceptance step 17 (`:578-580`) likewise says "*Close it.*"
So the defect can pass every named pin and every V step.

This lands on a codebase with **zero** precedent to copy — I re-ran REQ-01's six greps over
`apps/ui/**/*.{ts,tsx}` and confirm `createPortal` 0, `Escape` 0, `focusTrap` 0, `.focus()` 0,
`document.body` 0, `addEventListener("keydown"` 0. Both slices therefore build Esc handling from
scratch, in two lanes. Two independently written document-level keydown listeners both fire on
one Esc: the visitor presses Esc to dismiss the policy and the preferences card vanishes under
it — and from the first-visit entry (R14) the bar returns, so the user is thrown two levels back.

**Remedy.** One sentence in the shared interface paragraph (which is the only text both SPECs
own): the topmost open surface consumes Esc and no other surface may act on the same event; the
shared helper of `COMMON.md` §10.7 owns the stack. Plus one hook on each side that presses Esc
with the modal open over the card and asserts the card is still in the document.

---

## Non-blocking

Every N-finding needs a fix and a ticket; the tier sets *when*, never *whether*
(`heartbeat-reviewer` §3). N1–N5 and N8 are one edit each; N6/N7 are compass edits; N9 is one
assertion.

**N1 — Two stale `R18` cross-references in S01 that should be `R21`.** `slices/S01/SPEC.md:26`
("*the 10b lede promises `Settings → Privacy`, which is why **R18** exists (intake C5 / row
V-4)*") and `:210` ("***The Settings re-entry (R18)** eliminates the other two*"). R18 is the
card's focus-trap requirement; the Settings re-entry is **R21** (`:291`). A seat following either
pointer lands on the wrong requirement and finds no Settings content at all. This is the same
class REQ-01 reported closing in its handoff ("*S01 cited the modal interface as R17 when it
landed at R20*") — the instance was fixed, the **class was not swept** (`heartbeat-protocol` §2.2).
I swept it mechanically: those two are the only remaining mis-resolving references in either SPEC
(script and full output in §Verified).

**N2 — `tests/unit/t9-mode-tokens.test.ts:380-383` is the wrong line range for the set-equality
assertion the entire single-writer parallel-safety rule rests on.** Measured: the assertion is at
**`:376-377`** (`expect(rootNames.sort(), ":root inventory names").toEqual(expectedRoot);` /
`expect(chamberNames.sort(), "Chamber inventory names").toEqual(expectedChamber);`), with its
inputs built at `:371-372`. Lines `380-383` are a *value*-equality loop
(`for (const [name, value] of Object.entries(TERRACOTTA)) … .toBe(value)`), a different assertion.
The **substance is correct** — set equality does exist and the single-writer rule is sound — only
the pointer is wrong. **It is a conflation, not a typo:** `:379-384` really is the raw
value-comparison loop REQ-01 describes elsewhere, and set equality really does exist — the
set-equality claim has simply been attached to the value-comparison line range.

```
 371|     const expectedRoot = [...Object.keys(TERRACOTTA), ...Object.keys(MODE_INDEPENDENT)].sort();
 372|     const expectedChamber = Object.keys(CHAMBER).sort();
 376|     expect(rootNames.sort(), ":root inventory names").toEqual(expectedRoot);      <- SET EQUALITY
 377|     expect(chamberNames.sort(), "Chamber inventory names").toEqual(expectedChamber);  <- SET EQUALITY
 379|     for (const [name, value] of Object.entries(TERRACOTTA)) {
 380|       expect(tokenValue(window, name as TokenName, "terracotta"), …).toBe(value);  <- raw VALUE
 382|     for (const [name, value] of Object.entries(CHAMBER)) {
 383|       expect(tokenValue(window, name as TokenName, "chamber"), …).toBe(value);     <- raw VALUE
```

**Class swept mechanically** (`grep -rn '380-383\|380,383'` over `docs/missions/consent-ui`,
`.hermes/planning/consent-ui` and `.hermes/TOOLING-TRAPS.md`). **Seven wrong occurrences**, six of
them REQ-01's: `slices/S01/SPEC.md:346`, `:588`; `slices/S02/SPEC.md:336`;
`slices/S01/DECISIONS.md:44`; `requirements/REQ-01-handoff.md:181`; **`.hermes/TOOLING-TRAPS.md:1064`**
— that last one is the costly one, because it outlives this mission and will mislead every future
seat that adds a token. Plus one outside REQ-01's surface: `COMMON.md:104` (§10.8, orchestrator's
to fix). **Explicitly NOT a finding:** `slices/S01/SPEC.md:323` and the same sentence in
TOOLING-TRAPS cite `:380,383` for "*`TERRACOTTA` and `CHAMBER` are compared raw*" — that citation
is **exactly right** and must not be "corrected". Fix the set-equality references to `:376-377`
and leave the raw-comparison ones alone.

**N3 — `tests/unit/t9-mode-tokens.test.ts:306-309` is the wrong range for the contrast helper.**
`slices/S01/SPEC.md:514-515` says the helper is "*loaded at `tests/unit/t9-mode-tokens.test.ts:306-309`*".
Measured: `:306-309` is a list of token-name string literals; the helper is resolved at `:40`,
loaded at `:324-326` (`contrastContract()` → `vi.importActual("../support/contrast.js")`) and
used at `:411`.

**N4 — `S01-R28` is defined outside the `## Requirements` section and out of page order.**
`slices/S01/SPEC.md:480` puts R28 under `## Copy — verbatim`, after R29 (`:394`). A seat reading
`## Requirements` end to end sees R01–R27 then R29 and never meets R28 — which is the
`COOKIE_CATEGORIES`-as-one-constant requirement that **V-9's entire "one-line data edit" promise
depends on** (`V-DECISIONS-PACKET.md:73`). Mitigated only by the PLAN trace row
(`slices/S01/PLAN.md:73`). Move it into `## Requirements` in R-order (or renumber), keeping the
prose where it is as a pointer.

**N5 — `tests/unit/v2ui-node-runner.test.ts:19` is the wrong line for the manifest-equality
assertion.** `slices/S02/SPEC.md:536` says a new `consent/*.source-test.mjs` must be registered
"*or `tests/unit/v2ui-node-runner.test.ts:19` fails on the manifest equality assertion*".
Measured: `:19` is a `.map(...)`; the assertion is `expect(activeTests).toEqual([...manifest].sort());`
at **`:21`**. The constraint is real and correctly described; only the line is off by two.

**N6 — `INSTRUCTIONS.md`'s table of contents omits `docs/missions/consent-ui/BASELINE.md`, the
file both SPECs and both PLANs designate "the baseline authority", and inlines a partial copy of
two of its rows instead.** Measured: `grep -i baseline INSTRUCTIONS.md` returns exactly one row
(`:60`), pointing at *another mission's* `TYPECHECK-BASELINE.md`. `INSTRUCTIONS.md:64-70`
("Measured red at base") then restates two of BASELINE.md's four rows as content — which also
trips my packet's §2.6 "pointers only" test. A seat that reads only the compass misses that
`tests/unit/t9-mode-tokens.test.ts` is red at base (the file S01 must edit) and that
`tests/unit/v2ui-node-runner.test.ts` is the live guard constraining S02's copy. Replace the
paragraph with a TOC row pointing at BASELINE.md.

**N7 — `INSTRUCTIONS.md:38` says "rows V-1…V-7"; `V-DECISIONS-PACKET.md` now carries V-1…V-14.**
Stale the moment the orchestrator appended rows at 17:44/17:45. Prefer a range-free label ("every
row's default binds until V rules") so it cannot go stale again.

**N8 — `slices/S01/SPEC.md:463-464` mis-describes the extract's encoding.** It says "*the U+2019
right single quotation mark in `debates’ text` (`design-data.js:89` **encodes it as `’`**)*".
Measured, raw: `design-data.js:89` contains the literal six-character escape `debates’ text`,
not the character. As written the parenthetical is a tautology and tells a transcriber nothing.
It matters because `slices/S02/SPEC.md:304` orders the policy data "*transcribed **byte-exact**
from `design-data.js:51` and `:57-84`*", where the same `\uXXXX` escapes appear ~20 times — a
byte-exact transcription into a `.ts` string literal happens to decode correctly, but the SPEC
should say so rather than leave it to luck. (Each SPEC's own §Copy block carries the decoded
strings and all 89 are verbatim-correct — see §Verified — so this is a note, not a copy defect.)

**N9 — S01's pin cannot catch a missing read-mode `Close` button.** `slices/S02/SPEC.md:210`
requires read mode to show "*a single `Close` button in the primary position*", but S01-R20's hook
(`slices/S01/SPEC.md:285-287`) asserts only the *absence* of `I have read it`. S01's states table
(`:423`) lists `Close` as a dismissal route, so S01 depends on it. Add "and a `Close` button" to
S01-R20's hook, so the consumer pins the whole contract it relies on.

---

## Verified — how

Everything below is my own probe output, run by me, verbatim. Scripts live in
`/private/tmp/claude-501/-Users-vladmihaimiron-Documents-DebateAIRO/009d21d4-3595-46d3-b2b0-d763ebe8900d/scratchpad/req-rev-01/`.

### 1. Copy fidelity — scripted, 89 strings, exact substring match (`copyfid.py`)

Extracts every visible string from the design extracts (de-escaping `\uXXXX`) and requires an
exact match in the SPEC that owns it: `cookieCats` × (name, tag, description, mono detail line);
all 8 `policyJump` pills; all 11 `policySections` numbers, titles and bodies plus all 12 bullet
items; and from the HTML the 10a/10b/10c eyebrows, titles, ledes, button labels, the end marker,
the contact line, and both 8a checkbox sentences.

```
STRINGS EXTRACTED: 89  (S01 24 / S02 65)

VERBATIM HITS : 89
MISSES        : 0

EXIT=0
```

**Zero paraphrases, zero omissions.** Unicode is exact by construction (the check is byte-exact):
U+2019 in `debates’ text` and `children’s`, U+00B7 middle dots, U+2014 em dashes, U+2192 in
`Settings → Privacy` all present as the design has them. `Download PDF` appears in
`slices/S02/SPEC.md:191-198` only as a **negative** requirement ("`Download PDF` is NOT rendered"
+ a hook asserting no element's text equals it) — correct treatment of intake C4 / row V-3.

### 2. Trace counts, R-id contiguity, banned words, cross-reference resolution (`trace.py`)

```
S01
SPEC requirement DEFINITIONS: 29  -> [1..29]      contiguous 1..29 ? True   gaps=[]
  page order ascending ? False -> [1..27, 29, 28]
  definitions OUTSIDE the '## Requirements' section: {28: '## Copy — verbatim'}
PLAN trace ROWS: 29 -> [1..29]        rows == defs ? True
  in SPEC not in PLAN: []             in PLAN not in SPEC: []
S02
SPEC requirement DEFINITIONS: 24  -> [1..24]      contiguous 1..24 ? True   gaps=[]
  page order ascending ? True
  definitions OUTSIDE the '## Requirements' section: none
PLAN trace ROWS: 24 -> [1..24]        rows == defs ? True
  in SPEC not in PLAN: []             in PLAN not in SPEC: []
```

**Trace counts equal per slice, every R-id present in both directions — REQ-01's claim confirmed.**
Banned words (`improve, better, robust, handle, appropriate`, whole-word, case-insensitive):
**0 hits in either SPEC**; the only PLAN hits are `PLAN.md:11,20,21` where the law quotes its own
banned list. Cross-reference resolution over 36 (S01) + 19 (S02) internal references found exactly
two that resolve to the wrong requirement — N1.

`wc -l docs/missions/consent-ui/INSTRUCTIONS.md` → **92** (cap 100). ✓

### 3. Baseline — I re-measured all four suites myself in the clean lane

Lane `.worktrees/consent-s01/dialectical-engine`, `2b670d30`, `slice/consent-s01`, 0 dirty.

```
############ tests/render/auth-flow-integration.test.tsx
EXIT=0
 Test Files  1 passed (1)
      Tests  17 passed (17)
############ tests/unit/t9-mode-tokens.test.ts
EXIT=1
 Test Files  1 failed (1)
      Tests  2 failed | 6 passed (8)
 FAIL … > renders one accessible toggle that reads the document mode, flips it, and persists it
 AssertionError: expected '☀' to be '☀ Terracotta' // Object.is equality
 FAIL … > leaves no mode-inert colour literal in the four Wave-0 product files
 AssertionError: expected [ Array(1) ] to deeply equal []
############ tests/unit/v2ui-node-runner.test.ts
EXIT=0
 Test Files  1 passed (1)
      Tests  2 passed (2)
############ tests/architecture/auth-front-door-parity.test.ts
EXIT=1
 Test Files  1 failed (1)
      Tests  2 failed (2)
   → ENOENT: … /web/package.json
   → ENOENT: … /web/components/LoginFlow.tsx
```

**Every figure REQ-01 and `BASELINE.md` state is exact, including the failure identities.**
REQ-01's discovery that `auth-front-door-parity` is red at base is real and load-bearing.

### 4. The React controlled-checkbox experiment (B2) — `controlled-probe.mjs`

Standalone jsdom 30.0.1 + React 19.2.8 (from `apps/ui/node_modules`), reproducing the exact house
idiom (`field(x).checked = true`) and the exact submit helper
(`form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))` inside `act`) from
`tests/render/auth-flow-integration.test.tsx:35-48`. Three runs per implementation; output in B2.
Deterministic: controlled → 0 `register()` calls; uncontrolled+mirror → 1.

### 5. Class sweep behind S01-R29 — REQ-01's sweep is complete

Scripted over `apps/ui/app/globals.css`: every rule block containing `position: fixed`, with its
`z-index` and `bottom`.

```
  line    z-index          bottom  selector
  2645         54               -  .drawerScrim
  2651         55               0  .drawer
  3175         60               -  .popScrim
  3180         61               -  .popAnchor
  3262         70               -  .modalScrim
  3338         80            78px  .toast
  3396         40            18px  .tokenDock  <== covered by the bar (z<45) and bottom-anchored
```

`.tokenDock` is the **only** fixed, bottom-anchored surface below `--z-consent-bar: 45`.
R29 swept the class, not just the instance.

### 6. Citation spot-check — every load-bearing `path:line` in both SPECs

All exact unless listed in N2/N3/N5. The eleven-entry z-index ladder at
`slices/S01/SPEC.md:140-144` verified line by line:

```
    78  --z-canvas-sticky: 4; --z-zoom-cluster: 5;      318  z-index: 30;  (.topBar)
  1639  z-index: 30;  (.debateTopBar)                  1765  z-index: 35;  (.debateOverflowMenu)
  3401  z-index: 40;  (.tokenDock)                     2648  z-index: 54;  (.drawerScrim)
  2658  z-index: 55;  (.drawer)                        3178  z-index: 60;  (.popScrim)
  3183  z-index: 61;  (.popAnchor)                     3265  z-index: 70;  (.modalScrim)
  3343  z-index: 80;  (.toast)
```

Also confirmed exact: `--safe-b` at `globals.css:73`; `.authCheck` 885 / `.authCheck input` 896;
`prefers-reduced-motion` blocks at exactly 269, 3663, 4681, 5244; `t3-library.test.tsx:231-237`
(`/<div className="appShell">\s*<TopBar \/>/`) and `:244`; `t9-landing.test.tsx:121-125`;
`authRoutes.source-test.mjs:45` / `:48` (the `terms|privacy notice|localStorage` ban) / `:165`
(form count 3); `vitest.config.ts:19` `fileParallelism: false`; `t9-mode-tokens.test.ts:502-503`
and `:541-560`/`:546`; `settings/page.tsx:37-39` + `:49`; `AuthGate.tsx:21-23`;
`SessionControls.tsx:166-171`; `ModeToggle.tsx:23-27` + `:41`; `layout.tsx:36-42` + `:45-48`;
`TopBar.tsx:31` + `:58` + `:60-67`; `GuideModal.tsx:32-45`; `DebatePageClient.tsx:1525-1529`
(one **non**-interactive `aria-live` pill — R29's claim holds); `client.ts:215-220`;
`SignUpFlow.tsx:185-188`/`:190-192`/`:68-73`.

Seven overlays declaring `aria-modal` — I enumerated them and the count is exactly **7**
(`DebatePageClient`, `AnswerHonestyDrawer`, `DebateWorkspaceDrawer`, `GuideModal`,
`InvestigationDrawer`, `NodeDetailDrawer`, `PublicHonestyDrawer`). The six zero-hit greps behind
"net-new machinery" all return **0**. REQ-01's F1 "one near-match" claim also checks out:
`packages/evaluator/src/index.ts:2265` (`bias.addon_grade_quality.v1` contains `de_quality`
inside `gra**de_quality**`) — an unrelated metric id, as stated.

### 7. Live product (read-only GET, no sign-in, no submission)

```
GET /            -> HTTP 200
GET /sign-up     -> HTTP 200
I affirm that I am at least 18 years old.      <- present
name="adult-affirmed"                          <- present
privacy-accepted | Privacy Policy              -> 0 hits
cookie | consent                               -> 0 hits
```

The SPECs' description of today's product is accurate.

### 8. Cross-slice interface — byte-identity

`diff` of `slices/S01/SPEC.md:275-280` against `slices/S02/SPEC.md:203-208` is empty; both md5
`0ea21132edfdfff5e6da37dc0d0556dc`. **REQ-01's claim confirmed.** The mismatch in B3 is in the
surrounding requirements, not in the shared paragraph.

### 9. Storage-contract totality (packet probe 5)

`slices/S01/SPEC.md:80-90` (R04) gives an outcome for all four writing controls (`Accept all` bar,
`Essential only` bar, `Essential only` card, `Save choices` card) and R01 pins the exact
five-member object with a sorted-key assertion. Non-writing controls (`Choose what to store`,
`Privacy notice`, the three toggles, `Cookie preferences`) each have a transition in the states
table or a requirement (R17, R20, R21). **The table is total for every state except the one B1
names**: `Card (settings)` with no stored decision has no row, and the row that exists
contradicts R13. That is the single hole.

### 10. Self-report bar (packet probe 9) — PASS, not anodyne

`.hermes/reports/consent-ui/agent-reports/REQ-01.md`, 307 lines (`wc -l`). It names **causes** (the intake
contradiction check tested promised behaviours and never displayed facts, §1 F1; the baseline
measurement ran concurrently with the seat that had to cite it, §8 F4), **prices** each finding in
minutes and counterfactual rounds (§10 cost table), names three **near-misses** (§4: copying the
pre-paint mode-guard script for consent, `IntersectionObserver` in jsdom, an un-latched scroll
gate), names **dead ends** so nobody re-derives them (§5), and locates **packet ambiguity** to the
charge (§3.1-3.3). §9 declares its own two pre-handoff edits to a frozen SPEC openly, and both are
recorded in `slices/S01/DECISIONS.md:52-54` — lawful under `COMMON.md` §10.2 as later ratified.
I have no finding against this report.

---

## Not verified

- **Contrast.** `slices/S01/SPEC.md:513-517` marks `--muted` on `--muted-bg` UNVERIFIED and hands
  it to the slice; I did not run `tests/support/contrast.ts` either. The ten new token values in
  S01-R24 are unmeasured against the 4.5:1 threshold by anyone so far. Same for S02's disabled
  `I have read it`.
- **Rendered geometry.** Nothing here (or in jsdom) checks the 720px stack, the 520/680 widths,
  92vh, or the 38×22 toggle. Correctly conceded to V by both SPECs; I did not open a browser to
  measure them.
- **The tokens' both-mode values themselves.** I verified the ten additions are internally
  consistent and derived from stated formulas, but I did not recompute `tint(okC,.28)` etc.
  against a colour library.
- **The typecheck baseline.** I did not run `pnpm run generate:contract` + `pnpm typecheck`
  (long, and another mission owns the pin). I re-measured the four vitest suites instead.
- **Whether ARCH can actually cut clusters from these SPECs.** Out of scope for round 1.
- **Business facts in the policy** (retention periods, `dezbatere.ro/subprocessors`,
  "DebateAIRO SRL", `v2.1 · EFFECTIVE 12 AUG 2026`). REQ-01 correctly marked these UNVERIFIED at
  `slices/S02/SPEC.md:430-434`; I agree and did not re-derive. **Dead end — do not re-run.**
- **The mode toggle inside an open dialog** (S01 step 18 / S02 step 14) — a live-browser check I
  did not perform.

---

## Predictions (falsifiable; evidence that blindness held)

I expect the next lens and the coding seats to hit these first, in this order:

1. **B2 is what a coding seat hits first, and it will hit it late** — after `SignUpFlow.tsx` is
   already rewritten. My bet: the seat implements R17 as literally written (controlled inputs),
   applies the §Tests one-line fix, sees `auth-flow-integration` at 14/17, and blames its own diff
   rather than the SPEC. If another lens read the SPECs without running React, I predict it either
   missed this entirely or flagged it as "watch out, tests may need updating" without the
   controlled/uncontrolled mechanism — the mechanism is only visible if you actually run it.
2. **B1 will be missed by a lens that reads the requirements in order**, because R13 and R14 are
   50 lines apart and the states table is 200 lines further on; it only surfaces if you enumerate
   *reachable* states rather than reading rows. I predict the other lenses caught the `×`/Esc
   accessibility debate (contested Q7-03) but not the missing-decision case.
3. **B3 will be raised by ARCH, not by a reviewer** — the moment one architecture seat sites the
   shared helper of COMMON §10.7 it must decide Esc precedence, and it will discover P4 (the
   helper has no owner) in the same minute. I predict P4 is the finding no other lens has, because
   it needs COMMON §10.7 and both §Parallel-safety sections held side by side, and §10 post-dates
   the SPECs.
4. **I predict a lens focused on copy fidelity found nothing** — I tried hard to break it, 89/89
   exact including every escaped codepoint, and I would be surprised by a genuine copy finding.
   If one appears, check first whether it is really the `\uXXXX` note of N8 restated.
5. **Most likely thing I got wrong:** the severity of B3. If ARCH sites a single shared helper
   that owns a surface stack (the obvious design), Esc precedence falls out for free and B3
   collapses to an N. I file it as blocking because the SPECs are frozen, R18's text says the
   opposite of the states table, and *no hook anywhere exercises it* — but I would not fight a
   ruling that it is an ARCH decision recorded in DECISIONS rather than a SPEC-v2.
6. **Not a prediction, a warning:** V-9 is the row that most deserves an early ruling, and its
   "one-line data edit" promise rests entirely on **R28**, the one requirement filed outside the
   requirements section (N4).

---

comments read through: 3
