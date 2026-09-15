# REQ-REV-01 — scoped re-review of REQ-01's rework round 2 (mission `consent-ui`, ticket `t_5916299b`) · ROUND 3 of max 3 — THE LAST LAWFUL ROUND

SKILLS LOADED: superpowers:using-superpowers, heartbeat-protocol, heartbeat-reviewer, superpowers:verification-before-completion

`superpowers:receiving-code-review` — **not loaded this session; not needed, because nothing was
contested.** The author contested no finding this round; it applied every ordered remedy and
declared its one extension for me to rule on, which is a ruling, not a dispute. (Per-session
declaration, `COMMON.md` §10.9. My round-2 session loaded it; that is not mine to claim.)

**Verdict: PASS** — **4 of 4 findings ADDRESSED, 0 NOT ADDRESSED. Zero new BLOCKING breakage.**
Three new non-blocking findings (N12, N13, N14), all in the changed text, all ticketed below.
**N12 and N14 live in a FROZEN document and cannot be repaired without a `SPEC-v4`, which would
be a fourth author round and is not authorized — they are written as a proposed V DECISIONS
PACKET row (§V-row below) with my recommendation, exactly as my packet requires.**

Seat REQ-REV-01, Opus 5, fresh session — my round-2 verdict file was my memory. Re-reviewed
`2026-09-06 19:25–20:0x EEST`, main tree `2b670d30` / branch `dev` / **90** dirty entries
(pre-existing, other missions, untouched). Read-only; no git writes; nothing under review edited.

**Scratch:** `/private/tmp/claude-501/-Users-vladmihaimiron-Documents-DebateAIRO/009d21d4-3595-46d3-b2b0-d763ebe8900d/scratchpad/req-rev-01-r3/`.
**Packet deviation, declared:** `REQ-REV-01-R3.md:8` grants scratch under `…/req-rev-01-r2/` —
round 2's directory. `COMMON.md` §10.11 (written in answer to my own round-2 deferred item)
requires `<seat>-<round>`. I obeyed §10.11 and used `req-rev-01-r3/`.

**The one-line summary.** Round 1 found 3 blocking defects; round 2 found 2 more, created by the
fix; round 3 finds none. The difference is `COMMON.md` §10.10 — *a finding proved by a probe is
discharged only by re-running that probe against the fix*. This is the first round in which the
author executed the remedy before freezing it, and the first with no new blocking defect. **And
the remedy I dictated in round 2 turned out to be the incomplete thing** — the author measured
it, found it detects nothing, said so, and extended it. My probe confirms the author is right.

---

## Per-finding table

| Id | Verdict | Evidence (v3 `file:line`, my own probe output verbatim) |
|---|---|---|
| **B4** | **ADDRESSED** | Deleted in all three sites and replaced by ONE idiom. `slices/S02/SPEC.md:353-357`: *"**The single idiom for every assertion about the BUTTON's enabled state is `field(name).click()`, wrapped in `await act(async () => { … })`.** There is no second idiom, and all six cases below use only that one."* · `:692` (§Tests): *"uses exactly one idiom — `field(name).click()` … **No second idiom is offered.** Two forms that a seat might reach for are measured dead and must not be used"* · `slices/S02/PLAN.md:169-176`: *"**Button-state steps use exactly one idiom: `field(name).click()` inside `await act(async () => { … })`.** Not a `change` dispatch: … are **measured dead**"*. **My own sweep of the class, re-run over the v3 files** (`grep -n 'dispatchEvent\|new Event(\|new KeyboardEvent\|new MouseEvent\|\.click()\|fireEvent\|\.checked = '`): `S01/SPEC.md 0 · S02/SPEC.md 18 · S01/PLAN.md 0 · S02/PLAN.md 6 · INSTRUCTIONS.md 1` = **25 lines**; I read all 25. **Not one prescribes a form the matrix marks failing.** The three surviving mentions of `new Event("change"` (`S02/SPEC.md:19`, `:363`, `:692`) and of `new Event("click"` (`:363-364`, `:692`, `PLAN.md:171-172`) are all sentences saying the form does not work. **My re-run of my own probe** `b2-idiom-matrix.mjs`, React 19.2.8 / jsdom 30.0.1, is byte-identical to my round-2 capture and confirms the matrix the SPEC now quotes at `:361-364` verbatim (see `## Verified — how` §1). |
| **B5** | **ADDRESSED** — ordered remedy applied verbatim, **and the extension is IN SCOPE and CORRECT (I rule for the author)** | `slices/S02/SPEC.md:373-379` is the ordered sentence, word for word, with the mechanism stated in it: *"assign `.checked = true` on both WITHOUT dispatching and assert the button is still `disabled`; **then set both back to `.checked = false`, then `click()` both** inside `act`, and assert it enables. **The reset is load-bearing, not tidiness: `.click()` toggles, so clicking a box already assigned `true` drives it to `false` …**"*. **My own probe, built from the v3 SPEC's words and not from the author's** (`v3-cases-probe.mjs`, 6 cases × 4 implementation variants × 3 runs, plus a 7th row testing the *other* reading of where the reset sits): case 5 **PASS under all four variants, both readings, all three runs.** The case that could not pass under any idiom now passes. **The extension:** the same v2 sentence also claimed the case exists *"so a future seat that switches to controlled inputs breaks a test that names the reason"* — and my probe shows the fixed case 5 is green under controlled inputs too, i.e. **it detects nothing**. v3 moves that guarantee to a new **case 6** (`:380-385`), which my probe measures **RED under exactly the two controlled variants and PASS under the two uncontrolled ones**, and my `case6-diag.mjs` confirms it is the *second* assertion that discriminates, exactly as `:383-385` states. **Ruling: in scope.** Case 6 repairs the truth of the very sentence B5 charges; deleting it would leave the SPEC asserting a measurably false guarantee, which is B2's own class. My round-2 prediction 1 ("nothing but B4/B5 in round 3") is **falsified, and rightly so.** |
| **N10** | **ADDRESSED** | `slices/S01/SPEC.md:165-168`: *"these exact string values (R24 — S01 is the sole writer of the two `globals.css` token blocks and of `tests/unit/t9-mode-tokens.test.ts`; R21 is the Settings `Privacy` panel and has nothing to say about tokens)"*. **My own parse** puts R24's definition at `:389` (*"S01-R24 — S01 is the sole writer of the two `globals.css` token blocks and of…"*), so the pointer now resolves to what its sentence claims, and the wrong target is named as wrong in the same parenthesis. **Class re-swept by ME with BOTH heuristics over the v3 files, not read from the author's output:** my `xref_r2.py` (zero-lexical-overlap) → `TOTAL REFERENCES: 257 · UNRESOLVED: 0 · LEXICAL-OVERLAP FLAGS: 44`; the predecessor's `xref_sweep.py` (topic vocabulary) → `TOTAL REFERENCES: 204 · UNRESOLVED: 0 · TOPIC MISMATCHES: 7`. **The N10 site is flagged by NEITHER** (it was flag 49 of 49 in my round-2 run). I adjudicated all 44 + 7: every one is an id enumeration, a states-table cell, a pointer sentence, a paired citation, a range, a cross-slice reference, or the author's own new sentence at `S01/PLAN.md:14` that names R21 in order to say it is the wrong target. **No mis-resolution survives.** |
| **N11** | **ADDRESSED**, four members, every number re-measured by me | **(1) "125 references" REMOVED, not restated** — `slices/S01/SPEC.md:19` states the rule instead (a sweep total measures a moving corpus and belongs in a round's handoff). Confirmed: `grep '125 references' slices/S01/SPEC.md` → nothing; the v2 header still carries it in the archive at `SPEC-v2.md:16`, correctly untouched. My own two scripts return 257 and 204 today against the same corpus — four numbers for one sweep, which is the proof the removal was right. `UNRESOLVED: 0` is the property, and it is stable across both scripts. **(2) "8 rows" → 7, by APPEND** — `requirements/REQ-01-rework-r1-handoff.md:230` is **byte-unchanged** (still reads *"the same, **8 rows**"*), with the correction appended at the end of the file, carrying its counting rule, its command, **and the author's wrong first attempt left on the record beside the right one**. File grew 291→329 lines; nothing above the block edited. **(3) "about twenty times" → 15, with the command.** I ran the SPEC's own command myself, from `docs/missions/consent-ui/design/`: `grep -o '\\u[0-9A-Fa-f]\{4\}' design-data.js \| sort \| uniq -c \| sort -rn` → `12 \u2014` · `2 \u2019` · `1 \u2192`; total `15`. `grep -c -i 'u00b7' design-data.js` → `0`. Raw census by codepoint (my own python): `U+2014 raw ×4 · U+00B7 raw ×4`. **Every number in `slices/S01/SPEC.md:560-577` and `slices/S02/SPEC.md:563-571` is exact.** (One imprecision in the *location* phrase → N14.) **(4) the self-caught fourth member** — v2 promised the *literal six-character escape* and printed the decoded character in both slots. Measured by me: literal-escape count in `SPEC-v2.md` = **0** for both slices; in v3 = **9** (S01) and **7** (S02), and `S01:560` / `S02:563` now print `` `\u2019` `` where the sentence says escape and `` `’` `` where it says decoded. |

**Counts: ADDRESSED 4 · NOT ADDRESSED 0 · CONTESTED 0.**

### Packet review of `REQ-01-REWORK-R2.md` (a rework packet is a packet)

Every constant it quotes checks out against the artefacts. `:352-353`, `:355-357`, `:653` and
`PLAN.md:166` are exactly where those defects sat in `SPEC-v2.md` — I re-read all four in the
archive. The two probe paths in §2 resolve and both probes run unmodified from the repo root, as
§2 promises. The `allowed` list in §3 contains every deliverable §3 and §4 demand
(`SPEC-v2.md` ×2, the rework handoff, comments on both tickets). **Two defects:**

1. **§1 permits `new MouseEvent("click", …)` as a kept alternative.** The author declined it and
   recorded the rejection, which is the right call: B4's cause was *two idioms presented as
   equivalent*, so a packet that re-offers a second one re-opens the cause it is closing. **The
   author's judgement was better than the packet's.** No harm done; recorded so the pattern is
   not repeated.
2. **§4 says "comments 1-16 on `t_5916299b`"; the ticket had 9 at dispatch** (12 now). The
   author measured it, said so, and priced the hunt at ~4 minutes. Same class as the R1 packet's
   count defects. **Charge to the packet, not the seat.**

### Author's `SKILLS LOADED`

`superpowers:using-superpowers, heartbeat-protocol, heartbeat-requirements,
superpowers:receiving-code-review, superpowers:test-driven-development,
superpowers:brainstorming, superpowers:verification-before-completion` — declared on the handoff
(`:3-6`) and on `t_5916299b` comment 12, **as a per-session list**, with predecessor sessions'
loads on a separate line and the round-1 overstatement named against its own ticket
(`t_27e5bc12`). That is `COMMON.md` §10.9 obeyed to the letter. The requirements floor
(`brainstorming`) is present *and* the author explains it loaded it although the packet omitted
it, because B5's remedy needed a choice between measured alternatives — and the human-gate
discharge per §10.1 is visible on disk (rejected alternatives recorded at `S02/DECISIONS.md:69`,
`S01/DECISIONS.md:75`). `test-driven-development` visibly shaped the round: the `writing-good-tests.md`
gate — *name the production change that would make this test fail* — is what caught that case 5
discriminates nothing. **I have no transcript access and do not re-derive the declaration.**
Self-report is **continued, not restarted** (`PART III` at
`.hermes/reports/consent-ui/agent-reports/REQ-01.md:463`) and it **prices** what the review
caught (§16 "THE MURDER: what the unrun probe cost, priced", §24 cost accounting).

---

## New breakage in the fix

**No BLOCKING breakage.** Three non-blocking findings, all in text this round changed.

### N12 — NON-BLOCKING. The SPEC's two absolute statements about the idiom are contradicted by two of its own six cases, and the exception list that would have saved them omits them.

`slices/S02/SPEC.md:356` (**new text this round**):

> *"There is no second idiom, and **all six cases below use only that one**."*

`slices/S02/SPEC.md:692` (§Tests; the clause is byte-identical to v2's `:653`, the row around it
rewritten this round):

> *"**Any new assertion about the button's enabled/disabled state uses exactly one idiom —
> `field(name).click()` …** — and **must never assign `.checked` and then assert on the button**.
> … Assignments remain correct for **the three existing SUBMIT cases and for R18's new refusal
> pins**, because those exercise the handler and `FormData`, not the button."*

**Cases 5 and 6 do exactly what those two sentences forbid, and they are right to.**
`:373-374` — *"Assign `.checked = true` on both WITHOUT dispatching **and assert the button is
still `disabled`**"*. `:380-383` — *"Assign `.checked = true` on `adult-affirmed` only, WITHOUT
dispatching; then `click()` `privacy-accepted` …; then assert **both that the button is still
`disabled`** and that `field("adult-affirmed").checked` is still `true`"*. Both are assertions
about the button's disabled state reached by assignment, not by the one idiom. The states-table
row at `:495` is a third member of the same shape (pre-existing, unchanged since v2).

**Why the exception list does not cover them:** `:692` enumerates precisely where assignment
stays correct — *the three existing SUBMIT cases* and *R18's refusal pins* — and R17's own cases
5 and 6 are in neither category.

**Concrete failure scenario.** A coding seat writes R17's hook TDD-first. It reaches case 5's
first half, checks it against §Tests, reads *"must never assign `.checked` and then assert on the
button"*, and either (a) drops the two mechanism pins — losing case 6, the only hook in the slice
that goes red when someone makes the inputs controlled, which is the entire point of two review
rounds — or (b) writes them and files a finding against the SPEC. Either costs a round.

**Provenance, stated honestly.** The `never assign …` clause is **not new** — it is byte-identical
to v2's `:653`, and v2's fifth case already sat under it, so I could have found this in round 2 and
did not. What is new is `:356` ("all six cases below use only that one") and case 6, a second
member. **I file it as a finding against the changed text and record that I missed its first
member.**

**Severity: N, not B.** R17's own case text is unambiguous, self-explaining and probe-correct; a
seat that follows R17 writes six working cases. Only a seat that resolves the conflict in favour
of §Tests loses them. **Strongest counter:** it is arguably B — it is the same shape as B2/B4/B5
(a SPEC sentence that makes a required hook unwritable), and this loop has now paid twice for
under-calling that shape. I keep it at N because nothing here is *unrunnable*: the hook works,
only the prose disagrees with itself.

**Remedy (one clause, in the frozen document):** at `:356` — *"…and every assertion about the
button's **enabled** state uses only that one; cases 5 and 6 assign `.checked` deliberately, and
what they assert is that the button did **not** change"*; at `:692`, add *"and for R17's cases 5
and 6, whose assertions are that the assignment changed nothing"* to the exception list.
**Requires `SPEC-v4` → see the V-row proposal.**

### N13 — NON-BLOCKING. Two counts in this round's own handoff are wrong under the handoff's own commands.

1. `requirements/REQ-01-rework-r2-handoff.md:363` (§2.4, the class re-sweep) prints
   `→ S01/SPEC.md 0 · S01/PLAN.md 0 · INSTRUCTIONS.md 0 · S02/PLAN.md 6 · S02/SPEC.md 18   (24 lines)`.
   **I re-ran the author's exact command and got `INSTRUCTIONS.md 1`, total 25.** The missed
   member is `INSTRUCTIONS.md:88` — *"names exactly ONE test idiom (`field(name).click()` inside
   `act`)"* — which is **correct content**, so nothing is wrong in the compass; the sweep that
   proves the class closed is off by one, in the one file it reports as containing zero members.
2. `requirements/REQ-01-rework-r2-handoff.md:558` and `t_5916299b` comment 12 both state the
   self-report is **666 lines**. Measured: `wc -l` → **672** (672 newlines, file ends with one).

**Neither touches a frozen document**; both are in the round's evidence record. Both are the
N11 class (`COMMON.md` §10.10 corollary: *every count carries its counting rule and the command
that produced it*), one round after N11 was raised — which is itself the finding: the corollary
is a rule stated in prose, and prose has no enforcement surface. **Fixable without a SPEC edit**
(append a correction to the handoff, exactly as the author did for the r1 handoff's "8 rows").

### N14 — NON-BLOCKING. The changed §Copy sentence attributes both `\u2019` escapes to one string; only one is there.

`slices/S01/SPEC.md:573-574` (**new text this round**):

> *"ESCAPED in the extract: U+2019 right single quotation mark in `debates’ text` (×2), U+2014 em
> dash (×12), U+2192 right arrow in `Settings → Privacy` (×1)."*

**Measured by me:** the two `\u2019` escapes are at `design/design-data.js:89`
(*"…your debates\u2019 text."* — the one the sentence names) and at `design/design-data.js:83`
(*"…we do not knowingly process children\u2019s…"*, policy §11), which the sentence does not name.
The `\u2192` claim is exact (one escape, at `:74`, in `Settings \u2192 Privacy`).

**The count is correct under its own stated rule** (`:560-562`: *"every occurrence of the
six-character ASCII sequence `\uXXXX` in the whole file, tallied by codepoint"*) — so the ×2 is
right and only the location phrase is loose. **Severity: low N.** It matters only to a seat
hunting for the second occurrence, and §Copy's operative rule (*decode-then-compare*) is
unaffected. I would not spend a round on it; it rides along with N12 if a `SPEC-v4` is ever
authorized. **Remedy:** *"U+2019 ×2 — `debates’ text` at `design-data.js:89` and `children’s` at
`:83`"*.

---

## Proposed V DECISIONS PACKET row (round-3 residue — a fourth author round is NOT authorized)

**Row: `V-CU-1` — Two non-blocking prose defects sit inside a document that is frozen, and every
repair path costs a round.**

- **What it is.** `slices/S02/SPEC.md` (v3, FROZEN) contains two sentences (`:356`, `:692`) that
  literally forbid what its own hook cases 5 and 6 require, and `slices/S01/SPEC.md:573` (v3,
  FROZEN) attributes two escapes to a string holding one. Neither blocks a build; both are
  N-findings, and `COMMON.md` §3 says a non-blocking finding sets **when** it is fixed, never
  whether.
- **Why it needs V.** `COMMON.md` §4 freezes a SPEC at the author's handoff marker; a correction
  is a `SPEC-v4` written by REQ-01, which is **rework round 4** and `heartbeat-protocol` §2.3
  does not authorize it. The findings are real, the only author who may fix them may not be
  dispatched, and the residual-with-no-ticket class is abolished (`heartbeat-protocol` §2.2).
  This is exactly the gap the round cap creates, and it will recur on every mission.
- **Example.** A coding seat writes R17's hook TDD-first, reaches case 5's first half
  (`assign .checked; assert the button is still disabled`), checks §Tests (`must never assign
  .checked and then assert on the button`), and drops cases 5 and 6 — losing the only pin in the
  slice that goes red when a later seat makes the checkboxes controlled, which is the finding two
  review rounds were spent producing.
- **Options.**
  - **(a) Authorize a single narrow `SPEC-v4`** — REQ-01, three clause edits (N12 ×2, N14 ×1),
    no new content, no re-review beyond a byte-diff by the orchestrator. Cost ≈ 15 minutes.
  - **(b) Route N12/N14 to the ARCHITECTURE seat** as PLAN-level clarifications: the ARCH seat
    writes the exception into `S02/PLAN.md`'s step for R17 so the coding seat never has to
    reconcile the two SPEC sentences. Cost ≈ 0 extra dispatch; leaves the SPEC self-contradictory
    on the record.
  - **(c) Ticket both against the S02 slice** and let the coding seat resolve in favour of R17,
    with the reviewer's ruling on this ticket as the authority. Cost 0; risks the seat resolving
    the other way.
  - **(d) Do nothing.** Rejected: it re-creates the residual-with-no-ticket class.
- **My recommendation: (a), with (b) as the fallback.** (a) is fifteen minutes against a defect
  that can cost a coding round, and the edit is mechanically checkable — three clauses, byte-diff,
  no re-review. (b) is acceptable if V would rather not re-open a frozen document, because the
  ARCH seat is dispatched anyway and the PLAN is not frozen; it just leaves the SPEC saying two
  things at once. **N13 needs no V row**: it is a handoff correction, appendable today.
  **CONFIDENCE: high** that the defect is real (mechanical, quoted above). **STRONGEST COUNTER:**
  option (c) costs nothing and the R17 text is clear enough that a competent seat resolves it
  correctly — under which reading N12 is documentation debt, not a defect, and V should not be
  asked at all.

---

## Deferred (out of scope) — for the orchestrator's ledger, NOT this loop

1. **The `A11Y-OVERLAYS` retrofit (`t_8962842f`)** and the four items I deferred in round 2 —
   contrast, rendered geometry, both-mode token values, the typecheck baseline — remain
   unmeasured by anyone. Unchanged from round 2's list.
2. **`slices/S02/SPEC.md:656`** still carries the note recording my *wrong* round-1 N5
   measurement, frozen into a product requirement. Round 2 deferred it "if a v3 is written
   anyway"; a v3 was written and it stayed. If V authorizes option (a) above, a `## Corrections`
   block is a better home. Cosmetic.
3. **`slices/S02/SPEC.md:344`'s "14/17"** (unchanged v2 text, outside every v3 hunk) — I measured
   it anyway: `tests/render/auth-flow-integration.test.tsx` holds exactly **17** `it(`/`test(`
   cases, so 14/17 is correct. Recorded so nobody re-derives it.
4. **My round-2 prediction 4 — a third cross-reference heuristic keyed on the PLAN trace row** —
   the author declined it as out of scope and marked it `UNVERIFIED` rather than silently
   expanding the round. **Correct call.** If the orchestrator wants it, it is a separate ticket;
   two independent heuristics now agree at `UNRESOLVED: 0`.
5. **`.hermes/reports/consent-ui/probes/` is the most reused artefact in this mission.** Round 3
   built a new probe on top of it in ~6 minutes that would have cost ~30 from scratch. Promote
   the pattern: every mission gets a probe directory, and re-review packets name it.

---

## Verified — how

Everything below is my own output, run by me this round, verbatim.

**1. The idiom matrix, re-run** (`node .hermes/reports/consent-ui/probes/b2-idiom-matrix.mjs`,
my own probe from round 2). Byte-identical to my round-2 capture:

```
react 19.2.8 · jsdom 30.0.1

### preAssign .checked=true first ? false   (this is R17 hook cases 1-4)
  idiom                                             DOM checked   button ENABLED?   verdict
  .click()                                           true/true     true              OK
  dispatchEvent(new Event('change',{bubbles}))       false/false   false             *** DOES NOT ENABLE THE BUTTON ***
  dispatchEvent(new Event('click',{bubbles}))        false/false   false             *** DOES NOT ENABLE THE BUTTON ***
  dispatchEvent(new MouseEvent('click',{bubbles}))   true/true     true              OK

### preAssign .checked=true first ? true   (this is R17's FIFTH hook case)
  idiom                                             DOM checked   button ENABLED?   verdict
  .click()                                           false/false   false             *** DOES NOT ENABLE THE BUTTON ***
  dispatchEvent(new Event('change',{bubbles}))       true/true     false             *** DOES NOT ENABLE THE BUTTON ***
  dispatchEvent(new Event('click',{bubbles}))        true/true     false             *** DOES NOT ENABLE THE BUTTON ***
  dispatchEvent(new MouseEvent('click',{bubbles}))   false/false   false             *** DOES NOT ENABLE THE BUTTON ***
```

Line by line against `slices/S02/SPEC.md:361-364`: `click()` **enables** ✓ · `MouseEvent("click")`
**enables** ✓ · `Event("change")` **does not**, DOM `false/false` ✓ · `Event("click")` **does
not**, DOM `false/false` ✓. **The SPEC's quoted matrix is exact.** I did **not** re-run
`b2-repin-probe.mjs`: its `R17-h5b` case hard-codes the deleted `change` idiom and is expected
RED for the life of that probe; nothing else in it is affected by a text-only change, and my new
probe supersedes it against the v3 wording.

**2. My OWN probe of the six v3 cases as v3 words them** — `v3-cases-probe.mjs`, written by me
from `slices/S02/SPEC.md:370-391`, not from the author's probe or handoff. 4 implementation
variants × 3 runs; row 6 is a second reading of case 5 (reset **inside** `act`) that I added
because the SPEC's sentence is ambiguous about where the reset sits. Identical all three runs:

```
react 19.2.8 · jsdom 30.0.1

  case                                                                            A     B     C     D
  case 1  neither box -> disabled                                                 PASS  PASS  PASS  PASS
  case 2  only adult-affirmed via click() -> disabled                             PASS  PASS  PASS  PASS
  case 3  only privacy-accepted via click() -> disabled                           PASS  PASS  PASS  PASS
  case 4  both via click() -> NOT disabled                                        PASS  PASS  PASS  PASS
  case 5  assign true both/no dispatch -> disabled; reset false; click both -> enables   PASS  PASS  PASS  PASS
  case 5' (reset INSIDE act — alternative reading of the same sentence)           PASS  PASS  PASS  PASS
  case 6  assign adult only/no dispatch; click privacy; button still disabled AND adult .checked still true
                                                                                  PASS  RED   PASS  RED
  legend: A=uncontrolled+FormData (PINNED)  B=controlled+mirror  C=uncontrolled+mirror  D=controlled+FormData
```

**Three claims of the changed text tested and confirmed:** (i) case 5 is satisfiable against the
correct implementation — B5 discharged; (ii) *"only case 6 goes red; cases 1-5 stay green under
all four variants"* (`:388-390`) is **true**; (iii) case 5's ambiguity about the reset's placement
is harmless — both readings pass under all four variants.

**3. Which assertion discriminates** — `case6-diag.mjs`, mine:

```
A/C uncontrolled     assertion1 button.disabled === true -> true   assertion2 adult .checked === true -> true
B/D controlled       assertion1 button.disabled === true -> true   assertion2 adult .checked === true -> false
```

`slices/S02/SPEC.md:383-385` claims *"The second assertion is the discriminating one."* **Exactly
right** — the button assertion passes in every variant; only `.checked` separates them.

**4. Both cross-reference sweeps, run by ME over the v3 files.**

```
mine (xref_r2.py, zero-lexical-overlap):
  S01: 29 defs -> R01..R29  contiguous=True   page order ascending = True   defs OUTSIDE '## Requirements': none
  S02: 24 defs -> R01..R24  contiguous=True   page order ascending = True   defs OUTSIDE '## Requirements': none
  S01: SPEC defs 29  PLAN trace rows 29  equal=True  in SPEC not PLAN=[]  in PLAN not SPEC=[]
  S02: SPEC defs 24  PLAN trace rows 24  equal=True  in SPEC not PLAN=[]  in PLAN not SPEC=[]
  TOTAL REFERENCES: 257   UNRESOLVED: 0
  LEXICAL-OVERLAP FLAGS: 44

predecessor's (xref_sweep.py, topic vocabulary):
  TOTAL REFERENCES: 204   UNRESOLVED: 0
  TOPIC MISMATCHES: 7   (the N1 defect shape; 0 = swept clean)
```

All 44 + 7 adjudicated by me. **No mis-resolution.** Banned words: `S01/SPEC.md 0 ·
S02/SPEC.md 0`; the only PLAN hits are `:21-22` / `:30-31`, where the quantifiability law quotes
its own banned list.

**5. The N11 numbers, re-measured with the SPEC's own commands** (from
`docs/missions/consent-ui/design/`):

```
$ grep -o '\\u[0-9A-Fa-f]\{4\}' design-data.js | sort | uniq -c | sort -rn
  12 \u2014
   2 \u2019
   1 \u2192
$ grep -o '\\u[0-9A-Fa-f]\{4\}' design-data.js | wc -l
      15
$ grep -c -i 'u00b7' design-data.js
0
raw codepoint census (python): U+2014 raw x4 · U+00B7 raw x4
escape sites: \u2019 at :83 and :89 · \u2192 at :74
```

Literal-escape inventory across the artefacts (python, `\\u[0-9A-Fa-f]{4}`):
`S01/SPEC.md 9 · S02/SPEC.md 7 · S01/SPEC-v2.md 0 · S02/SPEC-v2.md 0` — the v2→v3 correction is
real and measurable.

**6. Supersession headers, and "nothing changed that is not named."**
`diff -u SPEC-v2.md SPEC.md`: **S01 3 hunks (+34/-22)** at `@@ -1,28 +1,27 @@` (header),
`@@ -164,7 +163,9 @@` (N10), `@@ -556,16 +557,24 @@` (N11); **S02 4 hunks (+68/-26)** at
`@@ -1,26 +1,29 @@` (header), `@@ -347,16 +350,45 @@` (B4/B5), `@@ -528,8 +560,15 @@` (N11),
`@@ -650,7 +689,7 @@` (B4, §Tests). **I read every hunk and every one maps to a named header
row. No unnamed change.** Header row counts by the author's own rule, run by me
(`awk '/^\| Finding \|/{t=1;next} t&&/^$/{exit} t&&/^\|/&&!/^\|---/{n++} END{print n+0}'`):
`S01/SPEC.md 3 · S02/SPEC.md 4 · S01/SPEC-v2.md 9 · S02/SPEC-v2.md 7` — the v2 counts match my
round-2 record exactly.

**7. The archives are what I reviewed.**

```
S01/SPEC-v1.md md5 5ed31e65917d2d48cdfff30a4c3141af   <- my round-2 verdict's own record
S02/SPEC-v1.md md5 251e3ac37afa5eaf1d339e65d897c9c3   <- my round-2 verdict's own record
S01/SPEC-v2.md md5 2ce809cf6e35523e29118db970e9bca8   <- matches S01 v3 header :7
S02/SPEC-v2.md md5 836570df829135cee501998fd8e1a7ea   <- matches S02 v3 header :7
```

My packet asks me to check `SPEC-v2.md` against "md5s from your round-2 verdict" — **my round-2
verdict records no whole-file md5 for the v2 SPECs** (they were `SPEC.md` then). I substituted a
stronger check and re-read my round-2 citations **at their round-2 line numbers** inside the
archives:

```
S02-v2:352-353 = "…`field(name).click()` (or `field(name).dispatchEvent(new Event("change", { bubbles: true }))`)…"   <- B4's quote, verbatim
S02-v2:355-357 = "A fifth case pins the mechanism itself: assign `.checked = true` on both WITHOUT dispatching…"      <- B5's quote, verbatim
S02-v2:653     = "…`field(name).click()`, or `field(name).dispatchEvent(new Event("change", …))`…"                    <- B4 site 2
S01-v2:16      = "…swept mechanically (125 references across both SPECs and both PLANs)…"                             <- N11 member 1
S01-v2:167     = "these exact string values (R21); the CSS rules reference them via `var()`; V acceptance"            <- N10
S01-v2:559     = "…and the same `\uXXXX` form appears about twenty times"                                             <- N11 member 3
S02-v2:532     = "…the `\uXXXX` form appears about twenty times across the file. So a"                                <- N11 member 3
interface paragraph, at my round-2 line numbers:  S01-v2 324-335 -> a00b4e7620e47a0bfe47ebbbc16b5330
                                                  S02-v2 226-237 -> a00b4e7620e47a0bfe47ebbbc16b5330
```

**Every one matches my round-2 citation exactly.** `SPEC-v1.md` unchanged in both slices.

**8. The shared interface paragraph is still byte-identical, and did not grow.** Not taken from
the author's line numbers: I computed the **maximal identical block** between the two v3 SPECs by
expanding outward from the claimed range until the lines diverge → `S01 324-337 / S02 228-241`
(14 lines, the paragraph plus its two boundary blanks). Inside it:
`sed -n '325,336p' S01/SPEC.md | md5` = `a00b4e7620e47a0bfe47ebbbc16b5330`;
`sed -n '229,240p' S02/SPEC.md | md5` = `a00b4e7620e47a0bfe47ebbbc16b5330`; `diff` **empty**;
**identical to the v2 md5 I recorded in round 2** — the paragraph moved by one line and its bytes
did not change. B3's Esc-stack sentence and N9's `Close` button survive intact at `:331` and
`:335-336`.

**9. Append-only law.** `git diff --numstat -- dialectical-engine/.hermes/TOOLING-TRAPS.md` →
`66  0` (66 insertions, **0 deletions**); deletion lines in the diff → **0**; first change
`@@ -1032,3 +1032,69 @@`. **Line 1064 re-read and byte-identical to my round-1 citation** (still
the original wrong `:380-383` trap). The 9-line growth since round 2's `57 0` is exactly my own
round-2 append at `:1092-1100`; the author added nothing this round, as its handoff §5 states.
`requirements/REQ-01-rework-r1-handoff.md`: `:230` byte-unchanged, correction appended at the end as
a `## SUPERSEDED` block opening at `:297`, file now 329 lines. `DECISIONS.md` both slices: round-2 blocks appended under a dated heading
(`S01:70-78`, `S02:63-71`), including the author's self-correction at `S01:78` and the line at
`S02:66` that **supersedes** rather than edits the round-1 idiom decision.

**10. The compass.** `wc -l INSTRUCTIONS.md` → **99** (cap 100). `:83-89` re-read: pointers only,
naming `SPEC.md` v3, the archives, and one sentence warning S02 seats off inventing a second
idiom. No measured content restated (my round-1 N6 still holds).

**11. Class sweep of the changed idiom text** — my grep over all five live artefacts, 25 lines,
all read: `S02/SPEC.md 18 · S02/PLAN.md 6 · INSTRUCTIONS.md 1 · S01/SPEC.md 0 · S01/PLAN.md 0`.
Case counts consistent at **six** everywhere (`:356` "all six", `:370` "The six cases", `:386`
"6 cases x 4 … x 3 runs", `:389` "cases 1-5"); the only "fifth case" left is `:21`, the header row
describing **v2's** case, correctly historical. No stale count survives the 5→6 growth.

**12. `requirements/contested-decisions.md` untouched** (mtime 17:37, before round 1's verdict);
nothing in B4/B5/N10/N11 is a V question, so nothing should have been added, and nothing was.

---

## Not verified

- **I ran no vitest suite.** The author changed no code, CSS or test file this round (its own
  §5 "Not touched" list, and the v2→v3 diff is confined to four mission documents plus two PLANs,
  two DECISIONS and the compass). `BASELINE.md` remains the authority; I make no claim about any
  suite's colour.
- **`b2-repin-probe.mjs` not re-run** — reasoned above (§Verified 1), not measured.
- **The author's three scratch probes** (`b5-remedy-probe.mjs`, `b5-discriminator-probe.mjs`,
  `v3-r17-cases-probe.mjs`). **Deliberately not opened.** I wrote my own from the SPEC text; my
  matrix agrees with the one it reports, which is the point of writing a second one.
- **The author's transcript** (the seven-skill declaration). No access; I do not re-derive it.
- **Contrast, rendered geometry, both-mode token values, the typecheck baseline** — unmeasured by
  anyone, unchanged across all three rounds.
- **The Esc stack in a real browser** — specified and pinned in jsdom on both sides; nobody has
  run it. V acceptance step 17b / step 7.
- **Whether ARCH can cut clusters from these SPECs** — still out of scope.
- **Business facts in the policy** — dead end, do not re-run.

---

## Pins for the next round (so the next lens can re-check me mechanically)

```
main tree 2b670d30 / dev / 90 dirty
S01/SPEC.md    (v3) md5 ebb223421b5f9fd872c0f13dabcbb533   784 lines   header rows 3
S02/SPEC.md    (v3) md5 ad060bda81db71f00f4c70b1dbf63f2f   757 lines   header rows 4
S01/SPEC-v2.md      md5 2ce809cf6e35523e29118db970e9bca8   775 lines   header rows 9
S02/SPEC-v2.md      md5 836570df829135cee501998fd8e1a7ea   718 lines   header rows 7
S01/SPEC-v1.md      md5 5ed31e65917d2d48cdfff30a4c3141af   640 lines
S02/SPEC-v1.md      md5 251e3ac37afa5eaf1d339e65d897c9c3   587 lines
INSTRUCTIONS.md     md5 82d9cdf691e8fac95e9000fa31dbfbca    99 lines
shared interface paragraph  S01:325-336 = S02:229-240  md5 a00b4e7620e47a0bfe47ebbbc16b5330
trace counts  S01 29/29  S02 24/24   UNRESOLVED 0 (both heuristics)   refs 257 (mine) / 204 (predecessor)
design-data.js escapes: 15 = \u2014 x12, \u2019 x2 (:83,:89), \u2192 x1 (:74); raw U+2014 x4, U+00B7 x4, u00b7 escaped 0
TOOLING-TRAPS.md 1100 lines, numstat 66/0, line 1064 untouched
probes: .hermes/reports/consent-ui/probes/ (b2-idiom-matrix.mjs, b2-repin-probe.mjs, xref_r2.py, …)
        + this round's, in scratch: v3-cases-probe.mjs, case6-diag.mjs
```

---

## Predictions (falsifiable)

1. **N12 will be resolved in favour of R17, not §Tests, whoever touches it** — and if a coding
   seat hits it, it will file a finding rather than drop the cases, because case 6 is the one the
   SPEC most loudly explains. If instead cases 5 and 6 are silently missing from the delivered
   hook, that is N12 collecting, and this ticket is the receipt.
2. **The next defect in this slice will not be in R17.** R17 has absorbed three review rounds and
   is now the most-measured paragraph in the mission. My bet for where the next one lands: the
   **Esc stack across two surfaces**, which both SPECs specify, both pin in jsdom, and **nobody
   has ever run** — the exact profile B2/B4/B5 had before someone executed them.
3. **A lens that read the v3 SPEC without running React would rule case 6 out of scope** — it
   reads as the author exceeding its packet, and only the 4-variant matrix shows that the ordered
   remedy alone ships a false guarantee. If another lens files "case 6 is scope creep", that lens
   did not execute.
4. **The `S02/SPEC.md:344` "14/17" and every other unchanged v2 number will survive unchallenged
   and are correct** — I spot-measured 14/17 (17 `it(` cases, exact) precisely because it is the
   kind of number nobody re-checks after a version bump.
5. **Most likely thing I got wrong this round:** the severity of N12. If ARCH writes the exception
   into `S02/PLAN.md`'s R17 step, N12 never reaches a coding seat and my finding is documentation
   debt, not a defect. I file it at N with the remedy priced at three clauses precisely because I
   do not think it is worth a fourth author round on its own — which is why option (b) is in the
   V row.
6. **What I got wrong across three rounds, on the record:** N5 (my line number was wrong; the
   author refuted it with a measurement in two trees), the completeness of N1's sweep (N10), the
   first member of N12's contradiction (present in v2, unfound in round 2), and **my round-2
   remedy for B5, which was incomplete and would have shipped a false guarantee had the author
   applied it literally.** The fourth is the expensive one, and it is the one this loop should
   learn from: **a remedy dictated in a verdict is itself an unrun claim.** `COMMON.md` §10.10
   binds the author; it should bind the reviewer symmetrically.

---

comments read through: 12 on `t_5916299b` · 6 on `t_12513808` · 1 on `t_579bcf46`
