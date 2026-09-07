# REQ-01 — REWORK READY FOR REVIEW (mission `consent-ui`, ticket `t_5916299b`, rework ticket `t_579bcf46`) · ROUND 1 of max 3

`SKILLS LOADED: superpowers:using-superpowers, heartbeat-protocol, heartbeat-requirements, superpowers:receiving-code-review, superpowers:brainstorming`

Those five, in the order the rework packet states, and no others. Notes on two of them, so the
line is auditable rather than decorative:

- **`superpowers:receiving-code-review`** is the one that shaped this round. Its rule — verify
  each finding against the artifact before implementing, contest with technical reasoning
  rather than perform agreement — is why **N5 is contested with a measurement** and why B1's
  and B2's premises were re-measured by me at `path:line` before I changed a word.
- **`superpowers:brainstorming`** was loaded for the two findings that reopened a design
  question: B1's discriminator (entry point vs stored decision) and B3's Esc-stack rule. Its
  human-approval gate is **discharged per `COMMON.md` §10.1** — alternatives rejected are
  recorded in `DECISIONS.md`, V-only questions go to the contested table, and the blind review
  follows. No seat waited for a human yes.

Seat REQ-01 · role requirements · model `claude-opus-5[1m]` · **fresh session** (the harness
cannot resume the original REQ-01 session; SendMessage is disabled, so my predecessor's memory
was read from disk: its handoff, its self-report and the eight artifacts). Main tree
`2b670d30`, branch `dev`, 90 dirty entries — **no git writes, no code, no CSS, no test
changes.** Answering `docs/missions/consent-ui/reviews/REQ-REV-01.md` (REWORK: B1–B3 blocking,
N1–N9 non-blocking, P1–P5 packet findings; P4 closed by the orchestrator in `COMMON.md` §10.7,
P5 is against the reviewer's own packet).

---

## 1. Per finding: ADDRESSED at `file:line`, or CONTESTED with evidence

### Blocking

**B1 — ADDRESSED.** *A signed-in first-visit visitor could make the consent bar disappear
without deciding.* The discriminator is now **whether a valid `v: 1` decision is stored**,
never the entry point.

| Where | What changed |
|---|---|
| `slices/S01/SPEC.md:225-247` (**R14**, heading at `:225`) | Statement rewritten: "on close without a decision, the bar returns **iff no valid `v: 1` decision is stored** — from EITHER entry point"; the source note states the reachable failure and why the entry point was the wrong condition. |
| `slices/S01/SPEC.md:248-255` (R14 hook) | **The pin v1 had no hook for:** seed NOTHING, mount the Settings panel, open the card via `Cookie preferences`, press Esc, assert the bar IS in the document and `localStorage.getItem("debateai.consent")` is still `null`. |
| `slices/S01/SPEC.md:493-521` (§States; heading `:493`, the v2 note at `:516`) | Row added `| Card (settings), no stored decision | Esc / backdrop | Bar | none |`; the existing settings row narrowed to `valid stored decision`; row added `| Bar showing, in Settings | Cookie preferences | Card (settings), no stored decision, at R17's defaults |`; a paragraph states the table's invariant — `Silent` appears as a destination only when a valid decision is stored. |
| `slices/S01/SPEC.md:679-688` (**V step 11**, `11a` at `:681`, `11b` at `:686`) | Split into **11a** (nothing stored: Esc from the bar entry AND from the Settings entry both return the bar) and **11b** (a decision stored: Esc from Settings returns nothing). The storage precondition is now named, which v1 left implicit. |

**And the CLASS, not the instance** (`heartbeat-protocol` §2.2). The proxy is *"which entry
point did the visitor come from" standing in for "is a decision stored"*. Sweeping every
sentence that branches on it found **two more members the review did not name**:

| Member | v1 text | v2 |
|---|---|---|
| `slices/S01/SPEC.md:273-282` (**R17**) | "When the card opens **from Settings**, or re-opens with a stored decision present, both reflect the stored booleans" — no answer for the Settings entry with nothing stored | defaults apply "whenever the card opens with no valid `v: 1` decision stored, **from EITHER entry point**"; stored booleans apply when one exists, again from either entry. Hook at `:286-292` asserts the Settings opener with nothing seeded shows the same defaults. |
| `slices/S01/SPEC.md:354-362` (**R21**) | "opens the same card **pre-filled from storage**" — same gap | "pre-filled from a valid stored decision, **or at R17's defaults when none is stored**"; explicit that the panel exists whether or not a decision is stored and that the bar may be showing behind it. Hook at `:363-367` adds the B1 pin. |

**B2 — ADDRESSED.** *S02's prescribed test remedy cannot work under the implementation
S02-R17 itself prescribed.* I re-verified the reviewer's premises before changing anything:
`apps/ui/components/SignUpFlow.tsx:186` has no `checked`/`onChange` prop (**uncontrolled**);
`:63` builds `new FormData(form)` and `:72` reads `data.get("adult-affirmed") === "on"`; the
house idiom is at `tests/render/auth-flow-integration.test.tsx:324,448,466` and its submit
helper at `:41-48`. The reviewer's probe result follows mechanically: assigning `.checked`
dispatches no React `change`, so a controlled input's state stays `false`.

| Where | What changed |
|---|---|
| `slices/S02/SPEC.md:322-360` (**R17**, heading `:322`) | The implementation is now **pinned as three numbered clauses**: (1) both inputs stay uncontrolled; (2) each carries an `onChange` that mirrors `checked` into React state **used only for the button's `disabled`**; (3) **`FormData` remains the truth at submit**. The source note carries the probe's numbers (controlled → 0 `register()` calls, suite 14/17; uncontrolled+mirror → 1 call) and the mechanism. The rejected alternative (controlled + rewrite the three cases to click) is recorded with its cost. |
| `slices/S02/SPEC.md:350-360` (R17 hook) | Rewritten: **every assertion about the button dispatches a real event inside `act`** — `field(name).click()` or `dispatchEvent(new Event("change", { bubbles: true }))`. Four cases plus a **fifth that pins the mechanism itself**: assign `.checked` on both WITHOUT dispatching, assert the button is still disabled, then dispatch and assert it enables — so a future seat that switches to controlled inputs breaks a test that names the reason. |
| `slices/S02/SPEC.md:361-385` (**R18**) | Now names its truth source: the two `FormData` reads (`data.get("adult-affirmed") === "on"`, `data.get("privacy-accepted") === "on"`), **never R17's React mirror** — with the consequence spelled out: reading the mirror would take `auth-flow-integration.test.tsx` from 18 passed to 15. |
| `slices/S02/SPEC.md:653` (§Tests, new row) | **The idiom rule**, stated as its own table row so it cannot be missed: assignments stay correct for the three existing SUBMIT cases and for R18's refusal pins (they exercise the handler and `FormData`); assignments are never valid for a claim about the button. "A pin that gets this wrong fails in a way that looks like an implementation bug." |
| `slices/S02/SPEC.md:651` (§Tests) | The three existing cases keep their exact one-line idiom — one added line each, `field("privacy-accepted").checked = true;` — and the row now says **why that is sufficient**. |
| `slices/S02/SPEC.md:460` and `:463` (§States) | Two rows added distinguishing "both set by a real change/click → button enabled" from "both assigned with no change event → button still disabled, but a programmatic submit still registers". |
| `slices/S02/PLAN.md:162-169` (refutation note) | Both failure modes named for ARCH: what a button-state step must dispatch, and why a handler step need not. |

**B3 — ADDRESSED.** *Esc precedence between the stacked modal and the card underneath.* The
rule went **into the shared interface paragraph** — the only text neither slice can change
alone — plus one hook on each side.

- Shared paragraph: `slices/S01/SPEC.md:324-335` and `slices/S02/SPEC.md:226-237`, **12 lines,
  byte-identical, both md5 `a00b4e7620e47a0bfe47ebbbc16b5330`** (v1 was 6 lines, md5
  `0ea21132edfdfff5e6da37dc0d0556dc`). It now ends: *"**The Esc stack: the topmost open surface
  consumes Esc and no other surface acts on the same event.**"*, preceded by the sentence
  naming `apps/ui/components/consent/modalSemantics.ts` as the owner of the stack and of focus
  trap / initial focus / focus return / backdrop close / `prefers-reduced-motion`.
- **S01 hook** — `slices/S01/SPEC.md:344-352` (R20's hook): with the policy modal open over the card, press
  Esc once and assert (a) the dialog is gone, (b) **the card is still in the document**, (c)
  the bar is still absent.
- **S02 hook** — `slices/S02/SPEC.md:250-260` (R14's hook): with the modal open over the sign-up card, press
  Esc once and assert the dialog is gone, the form and both inputs are still present, and no
  second surface acted (`privacy-accepted` still `false`, focus back on that input).
- **A hook that only a broken stack fails** — `slices/S02/SPEC.md:313-318` (R16's hook): mount two
  surfaces through the helper, one over the other, dispatch ONE `keydown` with `key: "Escape"`,
  assert the outer surface's close callback was **not** invoked.
- The unconditional statements are qualified: `slices/S01/SPEC.md:294-311` (R18) and
  `slices/S02/SPEC.md:126-136` (R08), `:290-318` (R16). States tables:
  `slices/S01/SPEC.md:507`, `slices/S02/SPEC.md:460`. Accessibility sections:
  `slices/S01/SPEC.md:629-639`, `slices/S02/SPEC.md:587-594`.
- **V acceptance, both sides:** `slices/S01/SPEC.md:701-706` (step **17b** — one Esc closes the
  modal, the card stays open, a second Esc closes the card) and `slices/S02/SPEC.md:622-626`
  (step 7 — the one Esc closed the modal and nothing else; the typed fields are still filled).

### Packet finding built on

**P4 (orchestrator ruling, `COMMON.md` §10.7) — APPLIED.** The ONE shared helper is
`apps/ui/components/consent/modalSemantics.ts`, **owned and written by S02, consumed unchanged
by S01**.

| Where | What |
|---|---|
| `slices/S02/SPEC.md:689-697` | Added to S02's owned-file list (v1 declared that list exhaustive and named no helper at all — the reason every placement broke one document). |
| `slices/S02/SPEC.md:290-312` (R16) | S02 writes it; it is "the only place any of this is implemented in this mission"; retrofitting the seven existing overlays is ticket `A11Y-OVERLAYS` (`t_8962842f`), outside this mission. |
| `slices/S01/SPEC.md:758-762` | Added to S01's "reads but never edits" list. |
| `slices/S01/SPEC.md:748-752` | S01's "any other new file under `apps/ui/components/consent/`" rule now excludes it **in the same clause and the same words** as `PrivacyPolicyModal.tsx`. |
| `slices/S01/SPEC.md:641-648`, `slices/S02/SPEC.md:298-312` | Both "ARCH should place a shared helper" paragraphs replaced: the placement is no longer an open question. |
| `slices/S01/SPEC.md:733-741`, `slices/S02/SPEC.md:675-684` | §Out of scope on both sides: no second Esc listener, no second focus trap; S02 does not retrofit the seven. |
| `slices/S01/PLAN.md:110-112`, `:123-126` · `slices/S02/PLAN.md:114-119`, `:123-131`, `:89-95` | Boundaries updated on both sides, plus the sequencing note: **`modalSemantics.ts` is the mission's first artefact** — S01's card cannot satisfy `S01-R18` or the Esc stack until it exists, and the policy modal consumes it too. |

### Non-blocking

| Id | Verdict | Where |
|---|---|---|
| **N1** | ADDRESSED + **class swept** | `slices/S01/SPEC.md:46` and `:242` now read `R21`. The mechanical sweep is §2 below; it found **two further defects, both introduced by me in this round**, and I fixed them. |
| **N2** | ADDRESSED | `slices/S01/SPEC.md:391` (the **correct** `:380,383` raw-value citation — deliberately unchanged, as N2 instructs), `:414-419` (R24, now `:376-377` with `:371-372` named), `:713` (§Tests); `slices/S02/SPEC.md:430-435` (R22). Append-only files got appended corrections instead of edits: `.hermes/TOOLING-TRAPS.md:1087` (**line 1064 untouched**), `slices/S01/DECISIONS.md:63,68`. The superseded `requirements/REQ-01-handoff.md` got a corrections note appended at its end (`:230-246`) rather than an edit to `:181`, so the record the review audited is intact. |
| **N3** | ADDRESSED | `slices/S01/SPEC.md:613-620`: resolved at `:40`, loaded at `:324-326`, used at `:411`; `:306-309` named as the `TEXT_TOKENS` string list it actually is. |
| **N4** | ADDRESSED, by **move not renumber** | `S01-R28` now at `slices/S01/SPEC.md:465-477`, in `## Requirements` between R27 and R29. §Copy keeps a pointer at `:583-586`. Renumbering would have broken every existing `S01-R28` reference in the PLAN, DECISIONS, the contested table and the review itself; moving costs nothing. Sweep confirms **page order ascending = True, definitions outside `## Requirements` = none, for both slices.** |
| **N5** | **CONTESTED — see §3** | The citation stays `:19`; a re-measurement note is added beside it (`slices/S02/SPEC.md:656`) and in the v2 supersession header. |
| **N6** | ADDRESSED | `INSTRUCTIONS.md:39` — a TOC row pointing at `docs/missions/consent-ui/BASELINE.md`, labelled as the authority; the inlined "Measured red at base" section is gone, replaced by one pointer sentence at `:66-67`. |
| **N7** | ADDRESSED | `INSTRUCTIONS.md:38` — range-free: "**every row's default binds until V rules on that row** (rows are appended over time; do not cite a range)". |
| **N8** | ADDRESSED, both slices | `slices/S01/SPEC.md:556-568` and `slices/S02/SPEC.md:529-541`: the extract holds the **literal six-character escape**; byte-exact is measured on the **decoded** character; a `\uXXXX` copied into a TS/JS string literal is correct, the same escape in `.json` or raw JSX text is not; hooks assert `textContent`, never source bytes. `slices/S02/SPEC.md:393-399` (R20) carries the same clause on "transcribed byte-exact". |
| **N9** | ADDRESSED, **stronger than asked** | The `Close` button moved **into the shared interface paragraph** (both md5-identical copies), so both slices own it, and S01-R20's hook at `:344-352` asserts its presence alongside the absence of `I have read it`. V step 17 (`slices/S01/SPEC.md:698-700`) observes it too. |

P1, P2, P3 were already fixed forward in `COMMON.md` §10.3–§10.5 by the orchestrator; P5 is
against the reviewer's own packet. Nothing there is mine to change.

---

## 2. The N1 class sweep — mechanical, and what it caught

Script: `xref_sweep.py` in this session's scratchpad
(`/private/tmp/claude-501/-Users-vladmihaimiron-Documents-DebateAIRO/009d21d4-3595-46d3-b2b0-d763ebe8900d/scratchpad/xref_sweep.py`),
run over `slices/S0{1,2}/{SPEC,PLAN}.md`. It does three things: resolves **every** `S0x-Rnn`
and bare `Rnn` mention to the requirement heading that defines it and prints the pair;
cross-checks SPEC definitions against PLAN trace rows; and applies a **topic guard** — both the
referencing sentence and the target's full body are classified into a fixed 11-topic
vocabulary, and a pair is flagged only when both carry a topic and the sets are disjoint. That
is exactly the shape of the reported defect (a sentence about the *Settings re-entry* pointing
at the *focus-trap* requirement), with no noise from table cells or id enumerations.

```
REQUIREMENT DEFINITIONS
  S01: 29 defs -> R01..R29  contiguous=True
      page order ascending = True
      definitions OUTSIDE '## Requirements': none
  S02: 24 defs -> R01..R24  contiguous=True
      page order ascending = True
      definitions OUTSIDE '## Requirements': none

CROSS-REFERENCE RESOLUTION
  TOTAL REFERENCES: 221   UNRESOLVED: 0

TRACE COUNTS
  S01: SPEC defs 29  PLAN trace rows 29  equal=True  in SPEC not PLAN=[]  in PLAN not SPEC=[]
  S02: SPEC defs 24  PLAN trace rows 24  equal=True  in SPEC not PLAN=[]  in PLAN not SPEC=[]

N1 SEMANTIC GUARD (topic of sentence vs topic of target)
  TOPIC MISMATCHES: 6   — all six adjudicated below as correct references
```

**Before the fixes, the guard flagged 8. Two were real, and both were mine, introduced in
this round:**

1. `slices/S02/SPEC.md` — "S01's card cannot satisfy **R18** or the Esc stack": a bare `R18`
   inside an S02 document resolves to **S02**-R18 (the submit-handler refusal), while the
   sentence means **S01**-R18 (the card's focus trap). Fixed to `S01-R18` (now `slices/S02/SPEC.md:711-712`).
2. `slices/S02/PLAN.md` — the identical defect in the sequencing note. Fixed to `S01-R18`
   (now `slices/S02/PLAN.md:117-118`).

That is the N1 class exactly — a reference that resolves to a real requirement and the wrong
one — reproduced by me while fixing N1, and caught only because the sweep is mechanical. It is
the single strongest argument for running it at every handoff rather than once.

**The six surviving flags, adjudicated one by one (all correct):**

| Flag | Why it is correct |
|---|---|
| `S01/SPEC.md:365 → R17` | "opens the dialog at R17's defaults **and that closing it with Esc**…" — R17 is where the defaults live; the Esc clause is a second assertion in the same hook. |
| `S01/SPEC.md:472 → R29` | "in v1 it was defined … **after R29**" — a statement about page order, not about R29's content. |
| `S01/SPEC.md:510 → R04` | A states-table cell, "`R04` row 4 / row 3" — R04 is the write table those rows index. |
| `S01/SPEC.md:625 → R12` | "role=region, aria-label, natural tab order, no focus trap, no Esc dismissal **(R12, R13)**" — a paired citation: R12 covers everything before the comma, R13 the Esc. |
| `S01/SPEC.md:716 → R28` | "Every jsdom hook named in **R01-R29**" — a range, not a single reference. (v1 said R01-R28 and R29 has a hook too; corrected in v2.) |
| `S02/PLAN.md:128 → R22` | The forbidden-list line; R22 is cited for the token blocks, the `layout.tsx` / `settings/page.tsx` paths sit on the same physical line. |

---

## 3. CONTESTED: N5

**Finding as written:** "`tests/unit/v2ui-node-runner.test.ts:19` is the wrong line for the
manifest-equality assertion… `:19` is a `.map(...)`; the assertion is
`expect(activeTests).toEqual([...manifest].sort());` at **`:21`**."

**Measured — main tree AND the clean lane `.worktrees/consent-s01/dialectical-engine`, same
md5 `dae7cd12705f1d7c885030ceefdbd433`, file is 35 lines, `git diff HEAD` empty:**

```
 16|       .map((entry) => relative(v2UiDirectory, join(entry.parentPath, entry.name)).replaceAll("\\", "/"))
 17|       .sort();
 18|
 19|     expect(activeTests).toEqual([...manifest].sort());
 20|   });
 21|
```

`:16` is the `.map(...)`. **`:19` IS the assertion.** `:21` is a blank line. The original
citation in `slices/S02/SPEC.md` was correct and is **unchanged**; a one-clause note recording
the re-measurement now sits beside it (`:656`) so a third seat does not "correct" it back, and
the v2 supersession header marks N5 as contested rather than applied. **N5's substance is
accepted in full** — the constraint is real, and a new `consent/*.source-test.mjs` must be
registered in `apps/ui/scripts/node-test-manifest.json` or that assertion fails.

Everything else in the verdict I checked and could not refute. B1, B2 and B3 are all real, and
B1's class had two more members than the review found.

---

## 4. The two supersession headers

Both SPECs are **v2**. Both v1 files were copied to `SPEC-v1.md` **before any edit** and are
byte-identical to what the reviewer read — verified after all edits: `slices/S01/SPEC-v1.md`
md5 `5ed31e65917d2d48cdfff30a4c3141af`, `slices/S02/SPEC-v1.md` md5
`251e3ac37afa5eaf1d339e65d897c9c3`. They are never edited.

- **`slices/S01/SPEC.md:1-25`** — version, date, author, `supersedes SPEC-v1.md`, and a
  **9-row table naming the finding id behind each change** (B1, B3, P4, N1, N2, N3, N4, N8, N9)
  with the requirements it touched.
- **`slices/S02/SPEC.md:1-23`** — the same, **8 rows** (B2, B3, P4, N2, N5-contested, N8, N9).

Both close with: a further correction is a `SPEC-v3` with its own header, and this version is
archived first.

---

## 5. Charge Q8, re-run end to end

| Q8 check | Result |
|---|---|
| SPEC↔PLAN trace counts equal, both directions | **S01 29/29, S02 24/24**, `in SPEC not PLAN=[]`, `in PLAN not SPEC=[]` |
| Requirement ids contiguous, in page order, inside `## Requirements` | **Both slices: contiguous, ascending, none outside** (N4 closed) |
| Shared interface paragraph byte-identical **including the Esc sentence** | `slices/S01/SPEC.md:324-335` and `slices/S02/SPEC.md:226-237`, 12 lines each, **both md5 `a00b4e7620e47a0bfe47ebbbc16b5330`**, `diff` empty; Esc-stack sentence present in both; `Close` button present in both |
| Every `Rnn` reference resolves to a heading that says what the sentence claims | **221 references, 0 unresolved, 6 topic flags all adjudicated correct** (§2); 2 real defects found and fixed |
| Banned words in any criterion or requirement | **S01/SPEC.md 0 · S02/SPEC.md 0.** The only PLAN hits are `:18,:27,:28` in each, where the law quotes its own banned list. (v1's `S02/SPEC.md:263` "Esc **handling**" is gone — that requirement was rewritten for P4.) |
| No hook asserting a state `BASELINE.md` contradicts | **0 candidate sentences.** Scripted over both SPECs, both PLANs and the compass: no sentence pairs a red-at-base suite (`t9-mode-tokens.test.ts`, `auth-front-door-parity.test.ts`, `pnpm typecheck`) with a green claim. Every mention of the two green-at-base suites carries its measured figure (`Tests 17 passed (17)` / `Tests 2 passed (2)`). |
| `INSTRUCTIONS.md` under 100 lines | **96** |

---

## 6. Paths changed

| Path | What |
|---|---|
| `docs/missions/consent-ui/slices/S01/SPEC-v1.md` | **NEW** — v1 archived byte-identical before any edit; never to be edited |
| `docs/missions/consent-ui/slices/S02/SPEC-v1.md` | **NEW** — same |
| `docs/missions/consent-ui/slices/S01/SPEC.md` | **v2**, 775 lines — B1 (+2 unreported class members), B3, P4, N1, N2, N3, N4, N8, N9 |
| `docs/missions/consent-ui/slices/S02/SPEC.md` | **v2**, 718 lines — B2, B3, P4, N2, N5-contested, N8, N9 |
| `docs/missions/consent-ui/slices/S01/PLAN.md` | v2-tracking note; 7 trace rows re-described; boundaries carry `modalSemantics.ts` |
| `docs/missions/consent-ui/slices/S02/PLAN.md` | v2-tracking note; 6 trace rows re-described; boundaries + sequencing carry `modalSemantics.ts`; B2's two failure modes added to the refutation note |
| `docs/missions/consent-ui/slices/S01/DECISIONS.md` | **appended** 11 lines, one per change, incl. the supersession pointer for the append-only `:380-383` line |
| `docs/missions/consent-ui/slices/S02/DECISIONS.md` | **appended** 9 lines, one per change, incl. the N5 contest with its measurement |
| `docs/missions/consent-ui/INSTRUCTIONS.md` | N6 (BASELINE.md TOC row, inlined rows removed), N7 (range-free V-row label), v2 + `modalSemantics.ts` in Order of work — **96 lines** |
| `docs/missions/consent-ui/requirements/REQ-01-handoff.md` | **appended** a SUPERSEDED note at the end; nothing above it altered |
| `docs/missions/consent-ui/requirements/REQ-01-rework-r1-handoff.md` | **NEW** — this file |
| `.hermes/reports/consent-ui/agent-reports/REQ-01.md` | **CONTINUED** (Part II appended, not a new report) — 416+ lines |
| `.hermes/TOOLING-TRAPS.md` | **appended** a REQ-01-rework section: the N2 self-correction (line 1064 untouched), the ~17% two-directional line-range error rate, the React `.checked` trap, the per-slice-SPEC blind spot, and how to sweep a class from a named proxy |

Nothing outside the rework packet's `allowed` list was written. No git write, no code, no CSS,
no test file touched. `contested-decisions.md` was read and needed no change — none of its six
rows is affected by this round.

---

## 7. What a reviewer should attack first

1. **The B1 class sweep is my claim, not the reviewer's.** If a fourth member of the class
   exists, it is in the states table or in R05/R07's interaction with the Settings panel. The
   invariant I assert — `Silent` is a destination only when a valid decision is stored — is one
   grep over `slices/S01/SPEC.md:493-521` (the states table) to falsify.
2. **The shared paragraph grew from 6 lines to 12.** Byte-identity is verified, but a longer
   shared text is a larger surface for future skew. If a reviewer prefers the Esc rule in a
   separate shared sentence, that is a legitimate ranking I would not fight.
3. **N5.** If my measurement is wrong, the file to run is
   `awk 'NR>=16 && NR<=21{printf "%4d| %s\n", NR, $0}' tests/unit/v2ui-node-runner.test.ts`.
4. **R17's fifth hook case** (assign `.checked` without dispatching, assert the button is still
   disabled) pins a *mechanism* rather than a *behaviour*. It is deliberate — it is what breaks
   if a later seat makes the inputs controlled — but a reviewer may reasonably call it a test
   of React rather than of the product.

---

**comments read through: 5**

---

## SUPERSEDED — appended 2026-09-06 by REQ-01, rework round 2 (nothing above this line is edited)

This handoff describes **SPEC v2** of both slices. **Both SPECs are now v3**
(`slices/S01/SPEC.md`, `slices/S02/SPEC.md`; the v2 files are archived byte-identical as
`slices/S01/SPEC-v2.md` md5 `2ce809cf6e35523e29118db970e9bca8` and `slices/S02/SPEC-v2.md`
md5 `836570df829135cee501998fd8e1a7ea`). The round-2 handoff is
`requirements/REQ-01-rework-r2-handoff.md`; the verdict that produced it is
`reviews/REQ-REV-01-r2.md`. **Read the round-2 handoff for anything about the checkbox test
idiom.**

**Two corrections to the text above, appended per the append-only law rather than rewritten
(REQ-REV-01 N11):**

1. **`:230` says S02's supersession header is "8 rows"; it is 7** — and the same sentence then
   lists exactly seven ids (B2, B3, P4, N2, N5-contested, N8, N9). Counting rule: data rows in
   the table, excluding the header row and the `|---|` separator. Command and output, run from
   `docs/missions/consent-ui/`:
   `awk '/^\| Finding \|/{t=1;next} t&&/^$/{exit} t&&/^\|/&&!/^\|---/{n++} END{print n+0}' slices/S02/SPEC-v2.md`
   → **7** (and **9** for `slices/S01/SPEC-v2.md`, so the "9-row table" in the line above it is
   correct by the same rule). **A first attempt at this command — `awk '/^\| \*\*/ {n++}'` over the
   whole file — returned 8 and 11, because rows of the STATES table also begin with `| **`. That is
   N11 in one line: a number is only as good as its counting rule, and a counting rule is only as
   good as the domain it is applied to. I am leaving the wrong first attempt on the record rather
   than quietly shipping the right one.**
2. **`:154`'s `TOTAL REFERENCES: 221`, and the "125 references" that quoted it in the v2
   supersession header, are both withdrawn as stated numbers** — not because either was
   miscounted, but because a sweep total measures a moving corpus. The same script re-run
   today over the v3 files returns **204**, and the reviewer's independent script returns
   **257**; the three numbers differ because the scripts count different reference shapes and
   because the files changed underneath them. **The number is removed from the frozen SPEC
   headers entirely** (S01 v3 header, row N11) and lives only in a round's handoff, beside the
   command that produced it. What is load-bearing and unchanged in both rounds is
   `UNRESOLVED: 0`, which is a property, not a count.
