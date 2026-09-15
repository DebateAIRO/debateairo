# REQ-REV-01 — scoped re-review of REQ-01's rework round 1 (mission `consent-ui`, ticket `t_5916299b`) · ROUND 2 of max 3

SKILLS LOADED: superpowers:using-superpowers, heartbeat-protocol, heartbeat-reviewer, superpowers:verification-before-completion, superpowers:receiving-code-review

**Verdict: REWORK** — **12 of 12 findings ADDRESSED, 0 NOT ADDRESSED** (N5 contested and the
author is right; my round-1 finding is **WITHDRAWN**), but **2 new blocking defects were
introduced by the fix itself** (B4, B5) plus 2 non-blocking (N10, N11).

Seat REQ-REV-01, Opus 5, fresh session — my round-1 verdict file was my memory.
Re-reviewed `2026-09-06 18:33–19:1x EEST`, main tree `2b670d30` / branch `dev` / 90 dirty
entries (pre-existing, other missions, untouched). Read-only; no git writes; nothing under
review edited. Probes in
`/private/tmp/claude-501/-Users-vladmihaimiron-Documents-DebateAIRO/009d21d4-3595-46d3-b2b0-d763ebe8900d/scratchpad/req-rev-01-r2/`.

**Round 2 of max 3, so REWORK is lawful — but this is the second-to-last round.** B4 and B5 are
two sentences. If a round 3 is spent on anything wider than them, the next REWORK is unlawful and
becomes a V DECISIONS PACKET row.

**The one-line summary.** The author fixed B2's *implementation* correctly and provably — my probe
confirms the pinned shape is the only one of three that survives — and then, in the sentence that
states the remedy, prescribed a second test idiom it never executed. That idiom does nothing. B2
was "the SPEC prescribes a test idiom that cannot work"; its fix re-committed the same crime in a
narrower place.

---

## Per-finding table

| Id | Verdict | Evidence (v2 `file:line`, probe output verbatim) |
|---|---|---|
| **B1** | **ADDRESSED** | `slices/S01/SPEC.md:225-233` (R14): *"on close without a decision, the bar returns iff no valid `v: 1` decision is stored — from EITHER entry point"*; *"The discriminator is the stored decision, never the entry point."* Hook added at `:248-254` (the B1 pin at `:251-253`: seed nothing → Settings opener → Esc → assert the bar is in the document and the key is `null`) — v1 had none. States table `:495-512` re-read row by row: I enumerated every `Silent` destination (`:497,499,500,503,504,510,511`) and **each one either writes a decision (R04 rows 1-4) or requires a valid one already stored**, so the invariant asserted at `:519-521` holds. Two rows added (`:509`, `:512`), one narrowed (`:511`). V step 11 split into 11a/11b at `:676-688` with the storage precondition named. **Class swept and I re-ran the sweep:** `grep -in 'settings entry\|first-visit entry'` over the v2 SPEC returns 7 lines, and **none** is a discriminator — `:249-250` and `:291` condition on stored state, `:234` and `:282` are historical notes, `:303` and `:357` are descriptive (`:357`: *"the Settings entry has no privileged state"*). R17 (`:274-282`) and R21 (`:354-357`) were the two further members; both correct. **I found no fourth member.** |
| **B2** | **ADDRESSED** (substance) — **but see B4/B5** | Implementation pinned as three numbered clauses at `slices/S02/SPEC.md:322-334`; R18's truth source pinned at `:361-370`. **My own probe, built from the v2 SPEC's hooks, React 19.2.8 / jsdom 30.0.1, three runs, deterministic** (`b2-repin-probe.mjs`): under the **pinned** shape 9/10 hooks pass; under v1's controlled shape and under the mirror-truth shape v2 forbids, `EXIST-3` fails (`register()` calls `0`, want `1`). So the pin is load-bearing and correct. Verbatim, run 1: `[PASS] R17-h4 both via .click() -> button ENABLED` · `[PASS] R17-h5a assign .checked, NO dispatch -> button still disabled` · `[PASS] EXIST-3 assign both + bare submit -> register called once` · `[PASS] R18-p1/R18-p2 ... register NOT called`. The one failure is `R17-h5b`, which is **B4/B5 below**. The states-table rows added at `:460,463` are both probe-confirmed. Every citation the fix rests on re-measured exact: `SignUpFlow.tsx:63` `const data = new FormData(form);`, `:72` `data.get("adult-affirmed") === "on"`, `:186` uncontrolled input; `auth-flow-integration.test.tsx:35-39` `field()`, `:41-48` `submit()`, `:324/:448/:466` the idiom. |
| **B3** | **ADDRESSED** | The Esc-stack sentence is **inside the shared paragraph**, which is the only text neither slice can change alone: `slices/S01/SPEC.md:334-335` = `slices/S02/SPEC.md:236-237`, *"**The Esc stack: the topmost open surface consumes Esc and no other surface acts on the same event.**"* **md5 of both paragraphs, measured by me: `a00b4e7620e47a0bfe47ebbbc16b5330` (S01:324-335) and `a00b4e7620e47a0bfe47ebbbc16b5330` (S02:226-237); `diff` empty.** Owner named in the same paragraph (`modalSemantics.ts`). Unconditional statements qualified at `slices/S01/SPEC.md:294-303` (R18) and `slices/S02/SPEC.md:126-129` (R08), `:290-312` (R16). Hooks on **both** sides: S01 `:347-350`, S02 `:250-258`; plus the helper-level pin at `slices/S02/SPEC.md:313-318` (two surfaces, ONE `keydown`, outer close callback not invoked) — **that one fails only if the stack is broken**, which is what B3 asked for. States tables `:507` / `:463`; accessibility `:629-639` / `:587-594`; V steps `:701-706` (17b) and `:622-626`. |
| **N1** | **ADDRESSED** | `slices/S01/SPEC.md:46` and `:242` both now read `R21`; **my own parse** puts R21's definition at `:354` (*"`settings/page.tsx` gains one `Privacy` panel…"*) and R18's at `:294` (the focus trap), so both references now resolve to what their sentences claim. **My own re-scripted sweep** (`xref_r2.py`, a *lexical-overlap* heuristic deliberately different from the author's topic vocabulary): `TOTAL REFERENCES: 277   UNRESOLVED: 0`. N1 as I wrote it named exactly two instances and I asserted they were the whole class — the author discharged it exactly. **A third member exists and my round-1 sweep missed it: see N10.** Not chargeable to this discharge. |
| **N2** | **ADDRESSED** | Corrected to `:376-377` at `slices/S01/SPEC.md:414`, `:417`, `:713` and `slices/S02/SPEC.md:431-432`. The two **correct** raw-value citations are untouched, exactly as N2 demanded: `slices/S01/SPEC.md:391` still reads `` `tests/unit/t9-mode-tokens.test.ts:380,383` ``. Append-only files handled by appending, not editing: `slices/S01/DECISIONS.md:63,68`, `slices/S02/DECISIONS.md:58`, `requirements/REQ-01-handoff.md:239-241`. **`.hermes/TOOLING-TRAPS.md` verified append-only by me:** `git diff --numstat` = `57  0` (57 insertions, **0 deletions**), first change is `1034a1035,1091`, and **line 1064 is byte-identical to the text I cited in round 1** (still the original wrong `:380-383` trap), with the correction appended at `:1087`. |
| **N3** | **ADDRESSED** | `slices/S01/SPEC.md:613-619`. **All four claims re-measured by me in `tests/unit/t9-mode-tokens.test.ts`:** `:40` = `const contrastSupportPath = resolve(root, "tests/support/contrast.ts");` ✓ · `:324-326` = `contrastContract()` with `return vi.importActual<ContrastModule>("../support/contrast.js");` ✓ · `:411` = `const { contrastRatio, relativeLuminance, worstRatios } = await contrastContract();` ✓ · `:306-309` = the four string literals `"--muted", "--muted-2", "--pro-text", "--con-text"` ✓. |
| **N4** | **ADDRESSED** (move, not renumber — correct call) | **My own parse, both slices:** `S01: 29 defs -> R01..R29  contiguous=True / page order ascending = True / definitions OUTSIDE '## Requirements': none` and `S02: 24 defs -> R01..R24  contiguous=True / ascending=True / none outside`. R28 now at `slices/S01/SPEC.md:465-477`, between R27 and R29; §Copy keeps a pointer at `:583-586`. Renumbering would have invalidated every existing `S01-R28` reference; moving cost nothing and my sweep confirms all 277 references still resolve. |
| **N5** | **CONTESTED — the author is RIGHT. My round-1 finding is WITHDRAWN.** | I re-measured in **both** trees. `tests/unit/v2ui-node-runner.test.ts`, md5 `dae7cd12705f1d7c885030ceefdbd433` in the main tree **and** in `.worktrees/consent-s01/dialectical-engine`, 35 lines, clean, unmodified since commit `3e7d83e9` (2026-09-01): `` 16| .map((entry) => relative(...)) `` · `` 17| .sort(); `` · `` 18| `` · **`` 19| expect(activeTests).toEqual([...manifest].sort()); ``** · `` 20| }); `` · `` 21| `` (blank). **`:19` IS the assertion; `:16` is the `.map(...)`; `:21` is blank.** My round-1 measurement was wrong. The citation at `slices/S02/SPEC.md:656` is correct and must not be "fixed"; the defensive note the author added beside it is the right remedy. **N5's substance was never in dispute and remains true** (a new `consent/*.source-test.mjs` must be registered in `apps/ui/scripts/node-test-manifest.json`). |
| **N6** | **ADDRESSED** | `INSTRUCTIONS.md:39` is a TOC row: *"Measured baseline — the authority for every 'is it green?' claim; assert the DELTA, never the absolute → `docs/missions/consent-ui/BASELINE.md`"*. The inlined "Measured red at base" rows are gone; `:66-67` is a pointer sentence only. `:61` now disambiguates the other mission's `TYPECHECK-BASELINE.md`. **Pointers-only re-checked by me across `:55-96`: no restated measured content survives.** |
| **N7** | **ADDRESSED** | `INSTRUCTIONS.md:38`: *"every row's default binds until V rules on that row (rows are appended over time; **do not cite a range**)"*. Range-free, and structurally unable to go stale again. |
| **N8** | **ADDRESSED** (see N11 for one loose count) | `slices/S01/SPEC.md:556-568` and `slices/S02/SPEC.md:529-541`, plus R20's clause at `:393-399`. **Re-measured by me with `cat -v`:** `design-data.js:89` contains the literal six characters `’` — the raw bytes, not the character — while U+2014 and U+00B7 in the same line ARE raw UTF-8. The v2 rule is correct and is the one that matters: an escape copied into a TS/JS string literal decodes; the same escape in `.json`, a raw template or JSX text ships six visible characters; hooks assert `textContent`, never source bytes. |
| **N9** | **ADDRESSED**, stronger than asked | The `Close` button is now in the **shared** paragraph (`slices/S01/SPEC.md:329-330` = `slices/S02/SPEC.md:231-232`, inside the md5-identical block): *"renders exactly one `Close` button in the primary position"*. S01-R20's hook at `:344-345` asserts *"present with a `Close` button and with no `I have read it` button"*, so the consumer pins the whole contract it depends on. V step 17 at `:697-700` observes it. |

**Counts: ADDRESSED 11 · CONTESTED-and-upheld 1 (N5, withdrawn) · NOT ADDRESSED 0.**

### Packet review of `REQ-01-REWORK-R1.md` (a rework packet is a packet)

Every constant it quotes checks out: P4's ruling matches `COMMON.md:103`; `:376-377` matches the
test; the `allowed` list at `:21` contains every deliverable §3 demands (`SPEC-v1.md` ×2, the
rework handoff, both tickets). Paths resolve from the seat's cwd. **One defect, and it is the
cause of B4/B5 — see the block below.**

### Author's `SKILLS LOADED`

Declared on the handoff line 3 and on `t_5916299b` comment 7: `superpowers:using-superpowers,
heartbeat-protocol, heartbeat-requirements, superpowers:receiving-code-review,
superpowers:brainstorming`. My packet's §2.3 requirement — that it include
`superpowers:receiving-code-review` — is **met**, and the skill visibly shaped the round (N5 was
contested with a measurement rather than performed agreement, and every finding's premise was
re-measured before editing). The orchestrator has already ticketed the overstatement of
`superpowers:brainstorming` (`t_27e5bc12`, comment 8, transcript-grep evidence). **I did not
re-derive it — I have no transcript access — and I do not re-file it.** The self-report is
**continued, not restarted** (`Part II` at `.hermes/reports/consent-ui/agent-reports/REQ-01.md:311`,
459 lines) and it **prices** what the review caught (§12 F5, §15 cost table).

---

## New breakage in the fix

### B4 — BLOCKING. The `change`-dispatch idiom the v2 SPEC offers as equivalent to `.click()` **does nothing**, and a seat that picks it reproduces B2 exactly.

`slices/S02/SPEC.md:352-353` (R17's hook):

> *"Every assertion about the **button's** state therefore dispatches a real event inside `act`:
> `field(name).click()` (or `field(name).dispatchEvent(new Event("change", { bubbles: true }))`)"*

`slices/S02/SPEC.md:653` (§Tests, the idiom rule) repeats it verbatim as an equal alternative;
`slices/S02/PLAN.md:166` carries the same instruction as *"dispatch a real `change`/click"*.

**Measured — my probe `b2-idiom-matrix.mjs`, React 19.2.8 / jsdom 30.0.1, against the v2-PINNED
implementation, three identical runs:**

```
### preAssign .checked=true first ? false   (this is R17 hook cases 1-4)
  idiom                                             DOM checked   button ENABLED?   verdict
  .click()                                           true/true     true              OK
  dispatchEvent(new Event('change',{bubbles}))       false/false   false             *** DOES NOT ENABLE THE BUTTON ***
  dispatchEvent(new Event('click',{bubbles}))        false/false   false             *** DOES NOT ENABLE THE BUTTON ***
  dispatchEvent(new MouseEvent('click',{bubbles}))   true/true     true              OK
```

**Mechanism.** React routes `onChange` for checkbox and radio inputs through the **click** event,
not `change`. A synthetic `change` never reaches the handler, the R17 mirror never updates, and
the button stays `disabled`. (`new Event("click")` also fails — React requires a real
`MouseEvent`; only `.click()` and `new MouseEvent("click")` work.)

**What gets built wrong.** A coding seat reads two options presented as equivalent, picks the
second, and lands on a red assertion whose failure mode the SPEC itself has already told it to
misdiagnose — `slices/S02/SPEC.md:653`: *"A pin that gets this wrong fails in a way that looks
like an implementation bug: the button is disabled, the test blames the component."* This is B2's
failure, verbatim, delivered by B2's fix.

**Remedy (one edit, three places).** Delete the `new Event("change", …)` alternative at
`slices/S02/SPEC.md:353` and `:653`; make `field(name).click()` the single named idiom (adding
`field(name).dispatchEvent(new MouseEvent("click", { bubbles: true }))` if an alternative is
wanted — measured working). Narrow `slices/S02/PLAN.md:166` from *"a real `change`/click"* to the
same single idiom.

### B5 — BLOCKING. R17's **fifth** hook case — the one added to pin the mechanism — cannot pass under **any** idiom the SPEC offers.

`slices/S02/SPEC.md:355-357`:

> *"A fifth case pins the mechanism itself: **assign `.checked = true` on both WITHOUT
> dispatching, assert the button is still `disabled`, then dispatch and assert it enables**"*

**Measured, same probe, same three runs:**

```
### preAssign .checked=true first ? true   (this is R17's FIFTH hook case)
  idiom                                             DOM checked   button ENABLED?   verdict
  .click()                                           false/false   false             *** DOES NOT ENABLE THE BUTTON ***
  dispatchEvent(new Event('change',{bubbles}))       true/true     false             *** DOES NOT ENABLE THE BUTTON ***
  dispatchEvent(new Event('click',{bubbles}))        true/true     false             *** DOES NOT ENABLE THE BUTTON ***
  dispatchEvent(new MouseEvent('click',{bubbles}))   false/false   false             *** DOES NOT ENABLE THE BUTTON ***
```

**Mechanism.** `.click()` on a checkbox **toggles**: from the pre-assigned `true` it goes to
`false`, `onChange` fires with `false`, and the button correctly stays disabled. The two `change`
dispatches are ignored (B4). So the box is either flipped back or never announced — four idioms,
zero that enable the button. The first half of the case (assert still disabled) passes; the
second half (assert it enables) is unsatisfiable as written.

**This is worse than B4** because the case is the SPEC's *deliberate* mechanism pin — the test
whose whole purpose is to break if a later seat makes the inputs controlled. As written it breaks
immediately, against the correct implementation.

**Remedy.** State the reset explicitly: *"…assert the button is still `disabled`; then set both
`.checked = false`, `click()` both, and assert it enables"* — or split the case in two so the
second half starts from a fresh mount. Either is one sentence.

**The CLASS, swept.** Both are members of *"a test idiom prescribed in a SPEC without being
executed"* — B2's own class. I swept it mechanically: `grep -n 'dispatchEvent\|new Event(\|new
KeyboardEvent\|\.click()\|fireEvent\|\.checked = '` over both v2 SPECs, both PLANs and the
compass returns **14 lines** (12 in `S02/SPEC.md`, 2 in `S02/PLAN.md`), and I read `S02/PLAN.md:162-169` in full besides, since its wording carries no matchable token. **Only these two are defective.** Per member: `slices/S02/SPEC.md:339`
(quotes the existing idiom, correct), `:350-351` (states what the idiom cannot do, correct and
probe-confirmed), `:370` (bare `new Event("submit")` bypasses constraint validation — correct,
`EXIST-3` confirms), `:374-377` (mirror-truth would take the suite 18→15 — confirmed: my variant
C gives `register()` 0 calls for all three cases), `:379` (R18's pins use assignment — **correct**,
`R18-p1`/`R18-p2` PASS), `:463` (states row: assigned-without-dispatch → still disabled but a
programmatic submit still registers — **both halves confirmed**, `R17-h5a` and `EXIST-3`),
`:651` (the three existing cases keep their one-line idiom — confirmed), `slices/S02/PLAN.md:157,163`
(descriptive, correct). **`:352-353`, `:355-357`, `:653` and `PLAN.md:166` are the only members
that prescribe an idiom that does not work.** The S01 Esc hooks prescribe no constructor
(*"press Esc"* / *"dispatch ONE `keydown` with `key: \"Escape\"`"*) and are not affected.

**Root cause, and it is a packet defect, not an author defect.** My round-1 verdict proved B2 by
execution and left `controlled-probe.mjs` on disk by path. `REQ-01-REWORK-R1.md:15` quoted my
*conclusion* — *"pin the only implementation that survives the reviewer's probe"* — and never told
the author to **run** it. The author obeyed the packet exactly, re-measured every *premise* at
`path:line` (visible and correct), and never executed the *remedy*.
**Standing fix for every future packet:** *a finding proved by a probe is discharged only by
re-running that probe against the fix; the rework packet names the probe file and the handoff
prints its output.*

### N10 — NON-BLOCKING. A third member of N1's class survives, in `slices/S01/SPEC.md:167`.

R08's hook reads: *"the five tokens appear in `:root` and in the test's `MODE_INDEPENDENT` map
with these exact string values **(R21)**"*. **R21 is the Settings `Privacy` panel**
(`slices/S01/SPEC.md:354`). The requirement that makes that map assertion binding is **R24** —
*"S01 is the sole writer of the two `globals.css` token blocks and of [the token test]"*
(`:388`). A seat following the pointer lands on the Settings panel and finds nothing about tokens.

**Pre-existing, not introduced:** `slices/S01/SPEC-v1.md:147` carries the identical sentence.
**My round-1 sweep missed it and I wrongly asserted the class was complete** (round-1 verdict
N1: *"those two are the only remaining mis-resolving references in either SPEC"*); the author's
rework sweep missed it too. Found this round only because I re-scripted with a **different**
heuristic — zero lexical overlap between the referencing line and the target's own heading —
rather than re-running the same one. Fix: `(R21)` → `(R24)`.

### N11 — NON-BLOCKING. Counts stated in the changed text disagree with the outputs they cite.

Three members, one class:
1. `slices/S01/SPEC.md:16` (frozen v2 supersession header): *"swept mechanically (**125 references**
   across both SPECs and both PLANs); the sweep output is in `requirements/REQ-01-rework-r1-handoff.md`"*
   — the handoff it names prints, at `:154`, `TOTAL REFERENCES: **221**`. My own sweep counts
   **277**. Three numbers for one sweep and no stated counting rule, in the artifact a reader
   cannot re-derive from.
2. `requirements/REQ-01-rework-r1-handoff.md:230` says S02's header is *"**8 rows**"* and then
   lists seven ids; the table at `slices/S02/SPEC.md:13-19` has **7** data rows.
3. `slices/S01/SPEC.md:559` and `slices/S02/SPEC.md:532`: *"the `\uXXXX` form appears **about
   twenty times** across the file"*. Measured by me: **15** (`—` ×12, `’` ×2, `→`
   ×1). The same sentences list U+00B7 among the characters involved; U+00B7 is **never** escaped
   in the extract (raw ×4, alongside raw U+2014 ×4).

`COMMON.md` §10.3 already requires a pinned number to carry its derivation in the same sentence;
it currently reads as being about geometry constants. Extend it to counts, or drop the counts.

---

## Deferred (out of scope) — for the orchestrator's ledger, NOT this loop

1. **Seats share one scratchpad namespace.** The author's `xref_sweep.py` sits at
   `…/scratchpad/xref_sweep.py`, the root of the same directory tree I work in. I did not open it
   and re-scripted independently — but blindness enforced by good manners is not blindness. The
   one-worktree-per-lens law should extend to `scratchpad/<seat>-<round>/`.
2. **`slices/S01/SPEC.md:716`** now says *"Every jsdom hook named in R01-R29 (R29 has one too — v1
   said R01-R28)"*. Correct, and it arrived through N1's sweep rather than through a named row of
   the supersession header. Header hygiene only; the text is right.
3. **Contrast, geometry, token values, typecheck baseline** — still unmeasured by anyone, exactly
   as my round-1 `## Not verified` recorded. `slices/S01/SPEC.md:619` still correctly marks the
   `--muted`/`--muted-bg` ratio UNVERIFIED and hands it to the slice.
4. **`slices/S02/SPEC.md:656`** now carries a defensive note recording *my* wrong N5 measurement,
   frozen into the SPEC. Correct defensively, but it is review metadata living in a product
   requirement. A `## Corrections` block would be a better home if a v3 is written anyway.

---

## Verified — how

Everything below is my own output, run by me this round, verbatim.

**1. Supersession headers, and "nothing changed that is not named."** `diff -u SPEC-v1.md SPEC.md`
for both slices: S01 **18 hunks** (+204/-69), S02 **13 hunks** (+183/-52). I read every hunk and
mapped it to a header row. S01's header (`:11-21`, 9 rows) names B1, B3, P4, N1, N2, N3, N4, N8,
N9; S02's (`:11-19`, 7 rows) names B2, B3, P4, N2, N5-contested, N8, N9. **Every hunk maps to a
named finding; I found no unnamed change** (the one marginal case is item 2 of Deferred, which is
an N1-sweep by-product).

**2. `SPEC-v1.md` byte-identity with what I reviewed in round 1.** Not taken on trust: I re-read my
round-1 citations *at their round-1 line numbers* in the archives.

```
S01/SPEC-v1.md md5 5ed31e65917d2d48cdfff30a4c3141af   (640 lines)
S02/SPEC-v1.md md5 251e3ac37afa5eaf1d339e65d897c9c3   (587 lines)

interface paragraph at MY round-1 line numbers:
  S01-v1 275-280 -> 0ea21132edfdfff5e6da37dc0d0556dc   <- the md5 recorded in my round-1 verdict
  S02-v1 203-208 -> 0ea21132edfdfff5e6da37dc0d0556dc   <- identical, as round 1 recorded

S01-v1:205-208 = "...on close without a decision from the FIRST-VISIT entry the bar returns; from
                  the SETTINGS entry nothing returns."          <- B1's quote, verbatim
S01-v1:426     = "| Card (settings) | Esc / backdrop | Silent | none |"
S01-v1:26      = "...which is why R18 exists"                   <- N1 instance 1
S01-v1:210     = "**The Settings re-entry (R18) eliminates the" <- N1 instance 2
S01-v1:480     = "**S01-R28 — The three category records live in one exported constant,"  <- N4
S02-v1:270-274 = "...the component holds both in React state rather than reading them only from
                  `FormData` at submit time..."                 <- B2's quote, verbatim
S02-v1:536     = "...`tests/unit/v2ui-node-runner.test.ts:19` fails on the manifest equality..."
S02-v1:567-571 = the exhaustive owned-file list with no helper  <- P4's premise
```

**Every one matches my round-1 citation exactly. The archives are what I reviewed.**

**3. The B2 re-probe** (`b2-repin-probe.mjs`) — my own, built from the v2 SPEC's hooks, not from
the author's tests. React 19.2.8 + jsdom 30.0.1 from `apps/ui/node_modules`, `createRoot` + `act`,
the exact `field()`/`submit()` helpers of `tests/render/auth-flow-integration.test.tsx:35-48`.
Three runs, identical each time:

```
================ A: v2 AS PINNED  (uncontrolled + onChange mirror, FormData truth) ================
  [PASS] R17-h1     neither box -> button disabled
  [PASS] R17-h2     only adult via .click() -> button disabled
  [PASS] R17-h3     only privacy via .click() -> button disabled
  [PASS] R17-h4     both via .click() -> button ENABLED
  [PASS] R17-h5a    assign .checked, NO dispatch -> button still disabled
  [FAIL] R17-h5b    then dispatch new Event('change') -> button ENABLED  [SPEC's alternative idiom]
           got=true  want=false
  [PASS] EXIST-3    assign both + bare submit -> register called once
  [PASS] STATE-ROW  ...and the button was still disabled at that moment
  [PASS] R18-p1     assign adult only + submit -> register NOT called
  [PASS] R18-p2     assign privacy only + submit -> register NOT called
  ---> 9/10 hooks satisfied   FAILING: R17-h5b

================ B: v1's shape    (CONTROLLED inputs, React-state truth)  [must still break] ================
  ---> 8/10 hooks satisfied   FAILING: R17-h5b, EXIST-3     (EXIST-3: got=0 want=1)

================ C: the shape v2 R18 explicitly FORBIDS (uncontrolled, but handler reads the mirror) ================
  ---> 8/10 hooks satisfied   FAILING: R17-h5b, EXIST-3     (EXIST-3: got=0 want=1)
```

**Verified in the failure direction:** B and C are the two shapes the v2 SPEC rules out, and both
fail the existing suite exactly as v2 predicts — including R18's stated consequence *"18 passed to
15"* (three cases, `register()` 0 calls each). **The pin is correct and load-bearing.** The idiom
matrix (`b2-idiom-matrix.mjs`, 4 idioms × pre-assign on/off, 3 runs) is quoted in B4/B5.

**4. My own cross-reference sweep** (`xref_r2.py`) — independent heuristic:

```
  S01: 29 defs -> R01..R29  contiguous=True   page order ascending = True
       definitions OUTSIDE '## Requirements': none
  S02: 24 defs -> R01..R24  contiguous=True   page order ascending = True
       definitions OUTSIDE '## Requirements': none

  S01: SPEC defs 29  PLAN trace rows 29  equal=True  in SPEC not PLAN=[]  in PLAN not SPEC=[]
  S02: SPEC defs 24  PLAN trace rows 24  equal=True  in SPEC not PLAN=[]  in PLAN not SPEC=[]

  TOTAL REFERENCES: 277   UNRESOLVED: 0
  LEXICAL-OVERLAP FLAGS: 49
```

I adjudicated all 49 by hand. 48 are benign shapes my heuristic cannot distinguish — id
enumerations (`PLAN.md:10` "R08, R14, R16, R17, R18 and R22"), states-table cells (`R04 row 1`),
pointer sentences (*"stated in full in R14"*), paired citations (`(R12, R13)`), ranges (`R01-R29`)
and cross-slice references. **The 49th is N10.** Banned words: `S01/SPEC.md 0 · S02/SPEC.md 0`;
the only PLAN hits are `:18,:27,:28` in each, where the law quotes its own banned list.

**5. Interface byte-identity and the compass.**
`sed -n '324,335p' S01/SPEC.md | md5` = `a00b4e7620e47a0bfe47ebbbc16b5330`;
`sed -n '226,237p' S02/SPEC.md | md5` = `a00b4e7620e47a0bfe47ebbbc16b5330`; `diff` empty.
`wc -l INSTRUCTIONS.md` → **96** (cap 100), and `:55-96` re-read for pointers-only.

**6. Append-only law.** `git diff --numstat -- dialectical-engine/.hermes/TOOLING-TRAPS.md` →
`57  0`; removal lines in the diff → **0**; first change `1034a1035,1091`. Line 1064 re-read in
full and byte-identical to my round-1 citation. Corrections at `:1070` (mine, round 1) and
`:1087` (the author's).

**7. N5, ruled on measurement** — output in the table above. Both trees, same md5, file clean and
unmodified since `3e7d83e9`.

**8. N8's premise, re-measured.** `cat -v` on `design-data.js:89` shows the literal `’`
alongside raw `M-bM-^@M-^T` (U+2014) and `M-BM-7` (U+00B7). Escape inventory across the file:
`—` ×12, `’` ×2, `→` ×1 = 15; raw non-ASCII: U+2014 ×4, U+00B7 ×4.

**9. Citations behind the B2 fix, re-measured:** `SignUpFlow.tsx:63,72,186`;
`auth-flow-integration.test.tsx:35-39,41-48,324,448,466`; `t9-mode-tokens.test.ts:40,306-309,324-326,411`;
`v2ui-node-runner.test.ts:16-21`. **All exact.**

---

## Not verified

- **I did not re-run the four vitest suites.** Round 1 measured them and nothing in this round's
  diff touches a test file — the author made no code, CSS or test change (`git diff` over
  `tests/**` and `apps/**` is empty for this seat's surface). `BASELINE.md` remains the authority.
- **The seven surviving lexical-overlap flags the author adjudicated in its own handoff §2** — I
  adjudicated my own 49 independently and reached the same conclusion on the overlapping ones;
  I did not audit the author's six-flag table row by row.
- **Contrast, rendered geometry, both-mode token values, the typecheck baseline** — unchanged from
  my round-1 `## Not verified`. Nobody has measured them yet.
- **Whether ARCH can cut clusters from these SPECs** — still out of scope.
- **The author's transcript** (the `superpowers:brainstorming` declaration). No access; the
  orchestrator ticketed it as `t_27e5bc12`.
- **The Esc stack in a real browser.** Both SPECs now specify it and pin it in jsdom on both
  sides; no one has run it. It is V acceptance step 17b / step 7.
- **Business facts in the policy.** Dead end — do not re-run.

---

## Predictions (falsifiable)

1. **B4 and B5 will be fixed in under ten minutes and will be the only content of round 3.** If
   round 3 touches anything else, that is the signal the loop has lost its scope, and the next
   REWORK is unlawful — a V DECISIONS PACKET row.
2. **The coding seat would have hit B5 before B4**, because the fifth hook case is the one a
   TDD-first seat writes first (it is the mechanism pin) and it fails against a *correct*
   implementation. My bet: it would have spent a round blaming its own `SignUpFlow.tsx` — which
   is precisely what `slices/S02/SPEC.md:653` warns about, in the sentence that causes it.
3. **A lens that read the v2 SPECs without running React found neither B4 nor B5.** Both sentences
   are *more* careful than v1's, not less; they name the right mechanism ("`.checked` fires no
   React change") and then draw the wrong operational conclusion. Only execution separates them.
4. **N10 will turn out to have a fourth sibling somewhere in the PLANs**, and if it does it will be
   in a hook or source line rather than in prose — that is where both my heuristics are weakest
   (short sentences, mostly ids and paths). I would run a *third* heuristic before anyone declares
   this class closed: for every reference, does the target's requirement id appear in the PLAN
   trace row that covers the referencing section?
5. **Most likely thing I got wrong this round:** the severity of B5. If ARCH or the coding seat
   reads "then dispatch" as "then set up the state properly and dispatch", it is a non-issue and
   B5 collapses to an N. I file it blocking because the case is written as a *sequence* on one
   mounted component, because it is the only hook whose stated purpose is to fail on a future
   regression, and because a hook that cannot pass against the correct implementation is worse
   than no hook. I would not fight a ruling that it is an N.
6. **What I got wrong last round, on the record:** N5 (my line number was wrong; the author
   refuted it correctly) and the completeness of N1's sweep (N10). Both are in my self-report
   §10 with causes. A reviewer that never reports its own misses is not running a second heuristic.

---

comments read through: 8
