# Self-report — seat `REV-S01-p2-product-truth` · REV(S01) lens product-truth, pass 2 (scoped) · mission `debate-tiers`

The question, verbatim from V:

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Session `9b3e06e9-75fb-4fd0-8561-04ca8aec6886` · 05:23 → 05:48 EEST, 2026-09-10 · ~25 min wall clock ·
worktree `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/rev-s01-p1-product/dialectical-engine`
@ `53b903d2`, 0 dirty at entry and 0 dirty at exit, no git write.

---

## 1. The body — what actually happened here

**The cause of this pass's blocking finding is not a bad fix. It is a node boundary drawn on FILE
surfaces instead of BEHAVIOUR surfaces.** FIX F1 owned `page.tsx` + the render suite; FIX F2 owned
`globals.css` + the style-contract suite. The Free lock is ONE behaviour that lives in both files.
F1, told it could not touch `globals.css`, did the only thing its contract allowed: it moved the lock's
paint into an inline `FREE_LOCK_STYLE` in `page.tsx:46`. The stylesheet's four lock selectors
(`globals.css:6264-6267`) went dead the moment it did, and `tier01-style-contract.test.ts:163` kept
asserting them — a green test over CSS the page no longer reaches. Nobody was wrong; the cut was.

The orchestrator caught this itself (packet defect `F21_P2` / `t_0b2afbff`, class fixed in `ce7677ba`:
split by FINDING surface, not by file) and handed me the seam as a named probe. That is the system
working — but it cost a FIX round, a review pass and a blocking finding, and the class fix landed
*after* the damage. **Upgrade: a packet that splits one slice across two concurrent seats must state
the BEHAVIOURS each seat owns, and packet-check must refuse a split where one named behaviour appears
in both seats' file lists.** That check is mechanical and would have fired here.

**What I nearly got wrong — and it is the expensive lesson.** I measured `getComputedStyle` on the
element I *believed* was locked and got `opacity 0.45; cursor: not-allowed` on all fourteen, in both
modes. That is exactly what my own pass-1 lens reported, and it is exactly what DONE.md M8 asks for.
It is also wrong for the two dropdowns: `.ndSelect select` (`globals.css:6150-6160`) is an
`inset: 0`, `opacity: 0`, `cursor: pointer` overlay, so **every pointer that reaches the "locked" box
reaches a live `<select>` instead**. I only saw it because I additionally ran
`document.elementFromPoint(centre)` and read the cursor of *what the mouse actually hits*. Pass 1
missed it — my own lens, same oracle line — because it read the element, not the hit point.
**Upgrade: for any M-line phrased as a POINTER affordance (`cursor`, hover, click target), the
measurement of record is `elementFromPoint` at the control's centre, never `getComputedStyle` on the
element the author names.** One line in the reviewer contract; it would have caught this a pass earlier.

**The second near-miss: I almost accepted a green DOM as a locked control.** Steps 5 and 6 both end
"nothing moves / nothing is typed", and the end state is indeed unchanged. It is unchanged because a
JavaScript guard rolls it back, not because the control is inert. A trusted `ArrowRight` on the locked
Tree depth slider produces `input` at value **3** and then `change` at **2**, every press. A trusted
`p` on the locked steering box produces `input` with value `"p"`. The only reason this is invisible is
React's controlled-input restore. **Reading the end state would have passed this slice.** The probe
that caught it is nine lines and is now promoted.

---

## 2. What repeatedly cost tokens — priced

| Cause | Price here | The fix |
|---|---|---|
| **The harness browser pane's coordinate frame.** The screenshot frame and the emulated viewport differ by a scale factor (measured 0.662) that no tool reports. I spent 6 tool calls and ~2 failed clicks discovering it, then had to calibrate it with a click-recorder. Pass 1 recorded the same trap in its UNVERIFIED section and it was NOT carried into `dev-stack.md`. | ~8 calls, ~6 min | `dev-stack.md` must carry the calibration recipe verbatim: install a capture-phase click recorder, click two known screenshot points, solve for scale, then aim. Three lines. It is a permanent property of this pane. |
| **Trusted mouse events do not reach a background tab.** Two clicks silently produced no events at all — not an error, just silence. Pass 1 hit this too. | ~4 calls | Same file, one line: *trusted mouse input requires `tabs_select` on your tab first; trusted KEY input does not.* That asymmetry is not guessable and I verified both halves. |
| **`computer{action:"type"}` steals focus.** It re-focuses (the page's `autoFocus` topic box won) instead of typing into the focused element. `computer{action:"key"}` goes to `document.activeElement` correctly. I lost one probe and had to reload to clear a stray "a" from the question box. | ~3 calls | Same file: *to type into a specific control, `.focus()` it and send `key` per character; `type` is only safe when the page's own focus target is the one you want.* |
| **Re-deriving the cluster runner.** Pass 1 recorded that the shared runner "is not tracked in git, so I could not reuse the file — I rewrote it". I rewrote it again, from `cluster-map-PLAN-section-4.md:19-28`. Two review seats, two transcriptions of the same 10 lines, each a chance to mistype the very guard the map spends a 15-line callout defending. | ~1500 tokens, twice | **Commit the runner.** `.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh` exists and the map names it; the review package should ship a copy so a lens runs `zsh run-suites.sh <pairs>` instead of retyping it. This is the single cheapest fix in the list. |
| **A native `<select>` picker cannot be observed over CDP on macOS.** I burned ~6 calls trying (ArrowDown, typeahead, Enter-commit, screenshot) before accepting it and rebuilding the finding on what IS observable. | ~7 calls, ~5 min | Record it as a known limit in `dev-stack.md`, with the replacement evidence chain that does work: trusted `mousedown → focus → click` on the element plus the `:focus-within` ring, and the native-`disabled` mutant as the contrast. |

**Not a cost, and worth saying: the review package was excellent.** Every constant in the packet
checked out against its source (DONE.md 168 lines, design README 33, 14 artboards, SPEC-v2 232–266,
`globals.css:6262` and `:6264-6267` verbatim, diffstat 4 files +148/−66, patch 436 lines, probes-p1
17 entries). Package README §3 named the seam, named the four sub-probes, and told me what to refute.
**I found zero packet defects.** That is the first pass in this mission's record with none, and it is
because the orchestrator ticketed its own defect and rewrote the class before dispatching me.

---

## 3. Dead ends — do not re-derive these

- **`select.value` after a trusted key is not evidence.** React restores controlled values inside the
  same event dispatch, so the *end* value is always the props value. The signal is the `input` event's
  `target.value`, captured by a capture-phase listener. Read the event, not the element.
- **Screenshots are not a lock oracle.** The macOS `<select>` popup is an OS widget and never appears
  in a CDP capture. Do not keep screenshotting.
- **`read_page` does not list `<select>` elements** on this page (the 14 locked controls come back as
  10 refs, both selects absent), so `find`/`ref` cannot reach them. Use `getElementById` + calibrated
  coordinates.
- **The consent bar's absence is not evidence of no overlap.** It is `localStorage["debateai.consent"]`
  gated; a stray calibration click dismissed it and my first cross-surface mount silently measured
  nothing. Clear the key and re-mount.

---

## 4. Toward the one-prompt machine

1. **Make the oracle machine-checkable, one M-line at a time.** DONE.md M8 says "`opacity: 0.45;
   cursor: not-allowed` on each locked control and nothing else". Three seats have now measured that
   sentence three different ways and got three answers (F1: inline style set; pass-1: computed style on
   the element; me: computed style at the hit point). **An M-line should carry its own measurement
   expression** — `elementFromPoint(centre) => cursor === "not-allowed"` — written once by the seat that
   transcribes the artboards. Then "measured against the oracle" stops being a judgement call. This is
   the highest-leverage change I can name from this seat.
2. **"and nothing else" needs an enumeration.** M8's *nothing else* is what B1 turns on, and it took a
   mutant to prove the focus ring is new. If M8 listed the properties that must be identical to the
   unlocked control (`outline`, `pointer-events`, `tabindex`, `disabled`), the assertion writes itself
   and no reviewer has to litigate whether an outline counts as a "border change".
3. **Give the FIX seat the reviewer's probe as a FILE, not a paraphrase.** F1's packet described my
   pass-1 findings; F1 then re-derived a browser measurement for each. The probes were already promoted
   to `.hermes/reports/debate-tiers/probes/`. Naming the path in the FIX packet turns "reproduce RED"
   from an act of authorship into an act of execution.
4. **Blind lenses paid for themselves again.** My pass-1 predictions were falsifiable and the record
   shows the blindness held. Keep it. But the two pass-2 lenses were handed overlapping seam items
   ((c)/(d) to correctness, (a)/(b)/(d) to me) — (d) is in both. One item, two seats, no contact: either
   we duplicate or we both assume the other did it. **Assign every sub-probe to exactly one lens.**

## 5. Where THIS packet fought me — precisely

- **§2 `allowed` is still exhaustive and still excludes `DECISIONS.md`, while COMMON §4 orders any seat
  with a contested product question to write a `V-ROW: NEW` block into the slice's `DECISIONS.md`.**
  This is pass-1 product-truth N4 (`t_dcf9531e`'s sibling) unchanged. My packet §3 *does* resolve it
  ("A row for V goes in the LAST section of your artifact"), and COMMON §4 now carries the same carve-out
  — so the contradiction is fixed in substance but the two sentences still read against each other on a
  first pass. Cost me one re-read, not a cycle. Say it once, in one place.
- **§1 says "pass: 2 of 3 · rework rounds: max 3".** Two different caps in one line, and neither is the
  one I needed: what I wanted to know is whether a REWORK here consumes the last pass. §3 answers it
  ("A REWORK at pass 3 is a V row"), so pass 3 exists. Fine — but put the pass budget in one sentence.
- **The package README §5 line "the assertion is arithmetic and bites in jsdom (the seat's refutation:
  step 32 → 128 made S01-34 RED)"** is a claim about the author's own mutant. I could not re-run the
  author's mutant without a git write, so I verified the property directly in Chrome instead
  (`(value−min) % step === 0` for all four sliders, and 800/128/4000 all reachable). Worth stating in
  the packet that a reviewer verifies the PROPERTY, not the author's RED frame, when the RED frame
  needs a working-tree change the reviewer is forbidden to make.

## 6. Honest shortfalls

- I did not observe the native `<select>` picker opening. The finding rests on the trusted
  `mousedown → focus → click`, the `--focus` ring, and the `disabled` mutant — all measured — plus the
  UA rule that a non-disabled, hit-testable `<select>` opens on click, which is inferred.
- No pixel diff against the artboards, for the reason pass 1 gave: the pane rescales. Geometry and
  computed style only.
- The real API was never touched; all 202s came from my stub on `:8811`.
