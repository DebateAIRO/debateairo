# Morning packet for V — night of 2026-08-12 → 13

## The two things waiting for YOUR eye (both ready now)

### 1. The visual gate (DR-145) — UI-01

Open **http://localhost:3000/debate/5f6a88f1-fc34-4135-b546-e7479df8b5cf**
(token `v-dev` if locked). This is the fresh ceremony debate on the fully
landed stack: 8 nodes, 4 attack edges, both houses.

What to judge (your DR-146 rulings, all implemented and dual-approved):
- the NEWER canvas + viewport (pinch/zoom/Fit/1:1),
- the top bar collapses into the overflow menu WHENEVER the title lacks room
  (your DR-160 content-aware rule — try narrowing the window),
- V2-only actions (Regenerate etc.) visible but greyed with truthful
  tooltips,
- house tags (OpenAI / Claude) and percentage scores on every card,
- the `UNSERVED-MAKER-POSITION` chip on the answer — your DR-161 mark telling
  you which house's root was composed and that the other's position is in
  the graph.

Pass it or fail it — your word closes UI-01 either way.

**One display note before you judge the tree (UI-02c A-6):** the card badge
now reads house + family ("OpenAI · GPT"), and the verbatim model id
(`gpt-5.6-sol`) appears in no rendered text — it lives in the tooltip/drawer.
Cost of the single-source label design. Say if you want the raw id surfaced.

### 2. Your depth-3 question (the DR-162 test: "same quality when I ask")

`/new` → type a question you actually care about → risk tier `standard` →
Tree depth **3** → Start. Expect ~19-24 real calls, 15 authored nodes per
maker root, and the answer composed from one root with the honesty chip
disclosing the other. If XREV-01 lands overnight (see below), each node will
also carry a cross-maker review verdict.

## What ran overnight

- **XREV-01 dispatched** — each node reviewed by the OTHER maker, typed
  agree/dispute/cannot-assess, reviewer lineage, V2-vocabulary UI. The last
  substantive ticket. Its diamond fires on submission; if it double-greens it
  closes; if it walls, it parks with the reason here.
- **UI-02d** cut (six test pins + aria-label — small) — queued after XREV-01
  per the file-overlap law.

## Questions for the morning (none blocked the night)

1. **A-6 above:** raw model id in rendered text — want it back anywhere?
2. **Reviews at depth 3+:** cross-maker reviews fit inside your ratified
   ceilings at depth 1 (~24 of 42) but at depth 3 reviews would push past 114
   (15×2 nodes + reviews + serve ≈ 100+; exact arithmetic will be in
   XREV-01's handoff). If you want per-node reviews on DEEP debates, the
   envelope needs a re-ruling — the alternative is reviews only at depths
   1-2. Your numbers to rule, with the table in the handoff.
3. **Your improvements list** — you said you'd propose them after this
   stage. The board will be clean to receive them.

## Board at the time of writing

49 done · XREV-01 coding · UI-01 awaiting your eye · UI-02d ready · S15
parked by you. Stack UP (API 200 / UI 200), fresh DB, ceremony settled.

---

## UPDATED overnight (post-XREV-01 diamond)

**Your review-coverage ratification question got sharper.** The Opus lens
recomputed everything (all numbers exact) and found the honest framing: with
total review coverage, XREV halves the safety headroom of your ratified
ceilings at EVERY depth, not just 3+. Two candidate member sets, V picks:

| depth | current | set A — restore 3× headroom | set B — full reservation |
|---:|---:|---:|---:|
| 1 | 42 | 60 | 69 |
| 2 | 66 | 108 | 117 |
| 3 | 114 | 204 | 213 |
| 4 | 210 | 396 | 405 |
| 5 | 402 | 780 | 789 |

(Set A keeps your ruled "ceiling ≈ 3× healthy spend" regime; set B reserves
the absolute worst case. Healthy spend itself: ~20/36/68/132/260.)

**Expectation before you judge the visual gate:** after the next ceremony
restart applies XREV's migration, your two EXISTING debates (Messi, four-day
week) will show "REVIEW N/A" on every node — they ran before reviews existed.
Honest, not a bug. Your NEXT debate gets full review verdicts.

**Mono-maker tension for you to rule (DR-137 vs DR-165(3)):** DR-137 made
mono-model runs lawful; your coverage law says no opinion goes unjudged — but
a mono-maker run HAS no second maker to judge. Overnight conservative path:
mono-maker runs carry a typed disclosure mark (every opinion visibly
unjudged) rather than being banned. Say if you want them banned instead.
