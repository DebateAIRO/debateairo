# UI-02a review — Opus 5 lens, rev 1

**Ticket:** `t_d4d7d993` · dual diamond DR-153 · READ-ONLY lens
**Verdict:** `CHANGES REQUESTED` — **one** BLOCKING item, and it is not in the
scoring behaviour. The percentage restatement, the typed absence and the
repaired banner are, on my reading, **correct**. I could not find a defect in
what this ticket set out to do.

Gates were not re-run (orchestrator's independent run stands). What I did
instead: read the whole delta and its consumers, executed the shipped formatter
against 2,000,000 random probabilities plus the entire 4-dp grid, proved the
absence switch's exhaustiveness with `tsc`, and traced every surface that
renders a V3 number.

---

## BLOCKING

### B1 — the NUL bytes are NOT fixed; `apps/v2-ui/lib/v3/adapter.ts` is still binary to `grep`

`apps/v2-ui/lib/v3/adapter.ts:611`

```ts
const key = `${entry.model_id}\0${entry.model_version}\0${entry.provider}`;
```

Two raw U+0000 bytes are embedded literally in that template literal (byte
offsets confirmed with `od`; `file` reports the file as `data`, not text).
EXEC-01 rev4 raised this as advisory A6; this revision did not close it.

Reproduced just now, on the file this ticket's entire delta lives in:

```
$ grep -n "v3ScorePercentage" apps/v2-ui/lib/v3/adapter.ts
exit=1                       # ← no output, no warning
$ grep -c -a "v3ScorePercentage" apps/v2-ui/lib/v3/adapter.ts
2
```

A repo-wide `grep -rn v3ScorePercentage apps/v2-ui` returns hits only from the
tracked `.next-dev` webpack bundles — so a reviewer gets *plausible* results
and never learns the source file was skipped. That is precisely the failure the
orchestrator hit during this handoff, and it is worse than a normal silent
failure because the search appears to succeed.

One more data point, from this review: quoting line 611 into the first draft of
*this file* carried the two raw bytes along, and made the review artifact itself
binary to `grep` until I stripped them. A byte that silently propagates into
every document that quotes the line, in a mission whose review loop is entirely
text-search, is not a cosmetic problem.

Why I am blocking on an inherited defect rather than passing it down again:

- adapter.ts is inside this ticket's diff — the formatter, the absence union
  and both banner constants are all in it. It is not out of scope.
- the packet made confirming it a REQUIRED check, i.e. the mission already
  treats it as this revision's business.
- it has now produced one demonstrably wrong conclusion about this file
  ("`v3ScorePresentation` and `percent` are absent" — both present). Every
  future UI ticket reviews this same file.
- the fix is to escape the two bytes, and is provably behaviour-neutral: write
  `${entry.model_id}\u0000${entry.model_version}\u0000${entry.provider}`. Do
  **not** substitute a printable separator — the NUL is load-bearing as a
  delimiter that cannot occur inside `model_id` / `model_version` / `provider`,
  so a space or `:` would reintroduce a key-collision ambiguity between e.g.
  `("a b", "c")` and `("a", "b c")`. Escaping preserves the exact runtime key.

Nothing else in this ticket blocks.

---

## ADVISORY

### A1 — the banner points the reader at the wrong drawer

`apps/v2-ui/lib/v3/adapter.ts:432-436`

> "…each card carries its recorded base score and final strength, **with the
> full labels and replay handles in the Honesty drawer**."

The Honesty drawer — the `◈ Honesty` button
(`DebatePageClient.tsx:1156-1158`) → `AnswerHonestyDrawer` ("Honesty &
provenance") — has **no per-node section at all**. Its twenty sections are
Answer state, Verdict, Condition marks, Abstention, Per-item freshness, Cost
envelope, Graph edges, Numbers and replay, Badges, … ; `base_score` and
`final_strength` appear nowhere in that file (verified: the only renderers of
those fields in the whole app are `NodeDetailDrawer.tsx:362-399` and the
adapter). "Numbers and replay" carries `answer.number_slots`, which come from
`serve.served_number` (`packages/serve/src/index.ts:1141-1162`) — the numbers
cited in the composed prose, a different set from node tau/strength.

Concrete failing case: open a served debate, read the scoring-insights strip,
follow it to `◈ Honesty`, look for a node's replay handle. It is not there. It
is in the *node* drawer's "V3 honesty" section, and in the badge tooltip.

Fix is a string edit: name the node drawer ("open a claim card for the full
labels and replay handles"), or say "in each card's tooltip and the claim
drawer". I did not raise this to blocking because the sentence's load-bearing
claim — V3 scores every claim, what is absent is V2's per-node scoring
endpoint — is true and precise, which is what check #3 actually asks.

### A2 — "each card carries…" is true only in the default view

Same sentence. `v3NodesById` is passed only to `DebateCanvas`
(`DebatePageClient.tsx:1302`). `DebateThread`, `DebateSplit` and `DebateMap`
(lines 1261, 1277, 1292) receive no V3 nodes, so in three of the four views no
card carries a number while the banner says every card does. The default view
is `tree` → `DebateCanvas` (`DebatePageClient.tsx:395`), so V will see the
numbers; this is a copy-vs-view mismatch, not a wiring bug. (Per-node scores
were never rendered in thread/split/map on the V2 path either — the drawer is
the cross-view home, and it does carry them.)

### A3 — the drawer's percentage rendering is guarded only by a source-text
assertion that cannot fail for the obvious drift

`tests/unit/v2ui-pages.test.ts:198-205` pins the drawer with
`expect(drawer).toContain("v3ScorePercentage(v3.base_score.value)")`.

Concrete drift that keeps every gate green: change
`NodeDetailDrawer.tsx:384` from `<span title={baseScore.detail}>{baseScore.text}</span>`
to `<span title={baseScore.detail}>{v3.base_score.value}</span>`. Line 363 is
untouched, so the pinned string is still in the file; `baseScore.detail` is
still used, so no unused-local (and `noUnusedLocals` is not set in
`apps/v2-ui/tsconfig.json` anyway); nothing renders the drawer in the root
suite. Result: the drawer shows `0.41000000000000003` again — the exact RED
this ticket started from — with tsc clean, 413 tests green.

The canvas does **not** have this hole: `v2ui-pages.test.ts:167-168` forbids
`.base_score.` / `.final_strength.` anywhere in `DebateCanvas.tsx`, which is a
proper ratchet. The drawer cannot use that same guard (it legitimately reads
those fields), so close it either with a negative ratchet
(`expect(drawer).not.toMatch(/\{v3\.(base_score|final_strength)\.value\}/)`) or
by moving the two lines into an adapter function (`v3NodeHonestyLines(node)`)
that the behavioural suite can execute.

### A4 — the repaired insights strip has **zero** executing coverage

`formatScoringVisibilityState`'s new V3 branch (`lib/scoringResponse.ts:268-275`)
is asserted only by source text and `indexOf` ordering
(`v2ui-pages.test.ts:134-149`). The test's stated reason is sound (the file
does not compile under the root program's stricter options), but the
behavioural home it implies exists does not run:

- root `vitest.config.ts` includes only `tests/**/*.test.ts`;
- `apps/v2-ui/package.json:12` declares `"test": "node scripts/run-node-tests.mjs"`
  and **`apps/v2-ui/scripts/` does not exist** — the package's test command is a
  missing file (already flagged as grok-ui01-rev1 item 5, grok-ui01-rev2
  item 5; still open);
- so `apps/v2-ui/lib/scoringResponse.test.mjs`, which *does* exercise
  `formatScoringVisibilityState` behaviourally (including a `title: "Scoring
  unavailable"` case at line 182-195), can never run.

Source-order `indexOf` is a proxy for branch order, not branch order itself: it
would still pass if the V3 branch were nested under a condition that never
holds. Given the file is genuinely unimportable from the root program, the
honest options are to fix the v2-ui runner, or to move the V3 decision out of
`scoringResponse.ts` entirely (it is already one call — `v3ScoringStatusLabel`
— which *is* behaviourally covered at `v2ui-data-layer.test.ts:352-371`).

### A5 — the same `LabeledNumber` type now renders in two notations

`AnswerHonestyDrawer.tsx:18-20` still prints raw floats
(`${number.value} · ${number.source} · replay …`) for edge strengths (line 226)
and served number slots (lines 244, 252). So the Honesty drawer can show
`0.41000000000000003` in "Graph edges" while a card shows `FINAL 41%` for a
structurally identical `LabeledNumberSchema` value. These are different
quantities, and DR-154(4) is worded as "SCORE DISPLAY", so I do not read it as
reaching them — but this is a display-consistency question only V can rule.
Worth putting in front of him with the two surfaces side by side rather than
deciding it in code.

### A6 — a real, nonzero score can display as `≈0%`

`v3ScorePercentage(1e-7)` → `≈0%` / detail "…from recorded probability 1e-7".
This is not the DR-115 hazard (typed absence renders `NO SCORE` / `NO SCORE
YET`, never a digit — verified), and the `≈` distinguishes it from an exact
`0%`, which only a true 0 produces. Flagging only so V sees the case: at a
glance, a claim the engine scored at one ten-millionth reads as zero.

### A7 — test nit: an assertion that passes by binary luck

`tests/unit/v2ui-data-layer.test.ts:270`:
`expect(badge.title).toContain(`${number.value * 100}%`)`. This holds only
because `0.62 * 100 === 62` and `0.41 * 100 === 41` exactly in IEEE-754. Change
the fixture to `0.07` (`0.07 * 100 === 7.000000000000001`) and the assertion
fails while the render is perfectly correct. Assert against
`v3ScorePercentage(number.value).text` instead. No code defect.

### A8 — a neighbouring V2 formatter is the DR-115 anti-pattern, and is one
import away

`apps/v2-ui/lib/scoringFormat.ts:8-12` — `formatScorePercent` substitutes `0`
for a non-finite score and clamps into `[0,1]`. The new code correctly does not
use it, and `v2ui-pages.test.ts:192-194` forbids it inside `V3ScoreBadges`.
Left as a note: it is exactly the "fabricate a number rather than say you don't
have one" behaviour the mission bans, sitting in the same directory.

---

## What I verified, and what came back clean

**1. Does the percentage restatement stay honest?**

One formatter, four surfaces, no duplication: `v3ScorePercentage`
(`adapter.ts:306-317`) feeds the card pill and the card tooltip through
`labeledNumberBadge` (`adapter.ts:319-333`), and the drawer's value and its
tooltip directly (`NodeDetailDrawer.tsx:363-364, 384, 393`). No component
re-derives a percentage; `DebateCanvas.tsx` contains no `toFixed` / `* 100` /
`Math.round` in the V3 path.

I executed the shipped function against the whole 4-dp probability grid
(k/10000, k = 0…10000) and 2,000,000 random doubles in [0,1), checking three
properties:

| property tested | violations |
|---|---|
| claims "exact percentage restatement" while the displayed decimal ≠ the recorded double | **0** / 2,000,000 |
| marks `≈` when the display is in fact exact (a false loss claim) | **0** / 10,001 |
| two distinct recorded values collapse to the same *unmarked* display string | **0** / 10,001 |
| trailing-zero stripping misrepresents the rounded value, whole 0…100 2-dp grid | **0** / 10,001 |

The exactness test is the subtle part and it is right: `rounded / 100 === value`
round-trips through the division, which is what makes `0.145` (whose
`×100` is `14.499999999999998`) come out as an unmarked `14.5%`, while
`0.41000000000000003` correctly gets the `≈`. A naive `value * 100 === rounded`
would have failed both ways.

Rounded ties (`0.410001` and `0.410002` → both `≈41%`) are honest: both carry
`≈`, and both tooltips carry their distinct recorded probability
(`v2ui-data-layer.test.ts:240-253` pins exactly this). Equal inputs always
format identically, so rounding cannot manufacture a difference either.

Non-finite input is unreachable: `LabeledNumberSchema.value` is
`z.number().finite()` (`packages/contract/src/index.ts:177`) and JSON cannot
carry NaN/Infinity. Out-of-`[0,1]` is *not* schema-constrained (no
`.min(0).max(1)`), so a producer bug yielding `1.5` would render
`150% (exact percentage restatement)`. I consider that the correct behaviour,
not a defect: the formatter deliberately does not clamp (`adapter.ts:304`), so
a broken number is exposed rather than laundered into `100%`. Recording it here
only so the reasoning is on the record rather than assumed.

**2. Typed absence (DR-115).** Exhaustive, and provably so. `v3ScoreAbsenceCopy`
(`adapter.ts:336-354`) is a `switch` with a declared return type and no
`default`. I built an isolated repro with a fourth union member and compiled it:

```
$ tsc --noEmit --strict x.ts
x.ts(7,65): error TS2366: Function lacks ending return statement and return
                          type does not include 'undefined'.
```

Both programs that see this file are `strict: true` — `apps/v2-ui/tsconfig.json`,
and the root program, which reaches `adapter.ts` through the test import even
though `apps/v2-ui` is in its `exclude` (exclude filters the default file list,
not imported files). So a fourth reason fails to compile; it cannot render
unnamed. The three reasons produce three distinct pill texts and three distinct
sentences, none containing a digit or a dash
(`v2ui-data-layer.test.ts:292-314`, behavioural).

Reachability of each state in the real UI: `NO_SERVED_ANSWER` renders on live
cards (the header with badges renders for `pending`/`streaming`/`done` —
`DebateCanvas.tsx:384-406`); `NODE_ABSENT_FROM_SERVED_ANSWER` on any card the
graph lost; `QUESTION_CARD_IS_NOT_A_NODE` is computed but never rendered,
because the root card takes its own branch (`DebateCanvas.tsx:333`) with no
badge row. That is the better outcome — a "NO SCORE" pill on the question line
would be noise — but the adapter's comment reads as if it renders. Not a
defect.

No V3-projected node can fall into a state that hides the badges: the adapter
sets `status: "complete"` on every node (`adapter.ts:134`) →
`toArgumentClaimStatus` → `active` → `renderStateOf` → `done`, and
`NodeSchema.claim` is `min(1)` so `empty` is unreachable.

**3. The repaired banner.** `V3_SCORING_STATUS_LABEL` = "Scored on the graph —
no V2 scoring endpoint" reaches both the top bar
(`scoringStatusCopy.ts:34-37` → `DebatePageClient.tsx:1116`) and the
scoring-insights strip (`scoringResponse.ts:268-275` →
`DebatePageClient.tsx:1188`, 1232). Both consult the V3 layer *before* their
own fall-throughs, which matters: the strip's `looksProviderOrTokenRequired`
matches on "model"/"provider"/"token", and `SCORING_ABSENCE_REASON` contains
none of those words — but the ordering makes that robust rather than lucky. The
`unavailable` `kind` is used only as a data attribute and for `ScoringVisibility
Panel`'s label/detail (`DebatePageClient.tsx:1536-1543`); nothing styles it as
a failure. No surviving "Scoring unavailable" is reachable on the V3 path:
`DebateCanvas.tsx:399` and `NodeDetailDrawer.tsx:566` both hang off
`scoringError`, and V3's scoring response carries `errors: []`.

The label is honest in both directions —
`v3ScoringStatusLabel("Model unavailable")` returns `null`, so a genuine V2
failure keeps V2's copy (`v2ui-data-layer.test.ts:368-370`).

**4. Which assertions can fail for the right reason.**

*Behavioural (execute the real code):* everything in
`tests/unit/v2ui-data-layer.test.ts:208-315` and `:352-378` —
`v3NodeScoreState` for all three absence reasons, `v3ScorePresentation`,
`v3ScorePercentage` (exact, approximate and distinctness of details),
`v3ScoreAbsenceCopy` (three distinct titles), badge id/pill/provenance,
`v3ScoringStatusLabel` positive and negative, `SCORING_ABSENCE_REASON`
content. This is real coverage and it is where the ticket's decisions actually
live. Good.

*Source-text (`tests/unit/v2ui-pages.test.ts:152-206`):*

| assertion | verdict |
|---|---|
| `canvas.not.toContain(".base_score.")` / `.final_strength.` | **defensible ratchet** — forbids a text pattern, which is what a text assertion is good at, and closes a real drift (inline field access on the card) |
| `badges` block must not contain `formatScorePercent` / `toFixed` / `Math.round` / `* 100` | **defensible ratchet**, same class. Narrow: it only scans the `V3ScoreBadges` slice, so a helper elsewhere in the file called from it would pass |
| `badges.not.toMatch(/>\s*(0|—|-{1,2}|N\/A)\s*</)` | **weak but harmless** — catches only a literal placeholder as a lone JSX child; the real guarantee comes from the behavioural `pillText).not.toMatch(/[0-9—-]/)` |
| `debatePage.toContain("answer === null ? null : contractNodesById(answer)")` | **brittle** — pins an exact expression; `answer ? contractNodesById(answer) : null` is identical behaviour and fails the test. Ratchet with a maintenance tax, not a drift risk |
| `debatePage.toContain("v3NodesById={v3NodeById}")`, `canvas.toContain("v3ScorePresentation(v3NodeScoreState(node, v3NodesById))")` | **acceptable** — no DOM renderer exists in the root suite, and these pin the one wiring hop that has no other witness |
| `drawer.toContain("v3ScorePercentage(v3.base_score.value)")` (+3 more) | **hides a drift risk — see A3.** This is the one that can stay green through the exact regression the ticket fixed |
| `scoringStatusCopy` / `scoringResponse` `indexOf` ordering | **proxy** — source order is not branch order; justified by a real import constraint, but see A4, the behavioural alternative is dead |

So: unlike EXEC-01 rev1/rev3, most of these *can* fail for the right reason, and
the decisions that matter execute. The single exception is A3.

**5. NUL-byte hazard.** Not fixed — see B1. Two NULs at `adapter.ts:611`.

---

## Also checked, nothing to report

- `:3000` is `apps/v2-ui` (`.claude/launch.json` → `pnpm --dir DebateAI-V3/apps/v2-ui dev`),
  so this delta is what V will look at. The root `build` script targets `web/`
  (`dialectical-engine-web`), which is a different, untouched app.
- `.nodeHeader` is `flex-wrap: wrap` and card heights are measured post-render
  (`DebateCanvas.tsx:112-126`), so two extra pills cannot clip or overflow the
  320px card.
- `.scoreBadge.v3 / .base_score / .final_strength` have no CSS rules, so both
  pills inherit the neutral `.scoreBadge` style (`globals.css:1386-1398`) and
  the absence pill picks up `.scoreBadge.unavailable` (`:1433`). BASE and FINAL
  are distinguished by their prefix only — deliberate-looking, and V's call.
- `NodeDetailDrawer` renders nothing at all when a node has no V3 record
  (`:278`) and `NodeScoringDetails` renders nothing when V2 scoring is absent —
  no false "unavailable" sections on the V3 path.
- The V3 badge block is inside `ScoringErrorBoundary` (`DebateCanvas.tsx:395-406`).

---

## Disposition

The scoring work is right. I found no defect in the percentage restatement, the
typed absence, the exhaustiveness, or the banner's substantive claim, and I
looked hard — this code had never been reviewed. `CHANGES REQUESTED` rests on
**B1 alone**, plus A1/A3 as the two advisories I would most want closed in the
same pass (both are string-sized edits). If the orchestrator rules the NUL
bytes out of scope for UI-02a on the grounds that they predate it, this lens
converts to `APPROVED` with advisories — but they should then be closed on a
named ticket rather than carried forward a third time.
