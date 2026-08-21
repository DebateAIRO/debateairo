# UI-02a dual-diamond review — Grok lens (rev1)

**Ticket:** `t_d4d7d993` · **Author:** Codex (gpt-5.6-sol) + earlier unreviewed Claude seat (DR-140 roster)  
**Reviewer:** Grok (independent read-only dual-diamond lens, rev1)  
**Date:** 2026-08-11  
**Packet:** `reviews/UI-02a-review-packet.md`  
**Scope:** original scores-only implementation **and** DR-154(4) percentage delta (neither had a prior lens).  
**Inputs verified against shipped source (not handoff trust):** `apps/v2-ui/lib/v3/adapter.ts` (binary-safe), `DebateCanvas.tsx`, `NodeDetailDrawer.tsx`, `DebatePageClient.tsx`, `scoringStatusCopy.ts`, `scoringResponse.ts`, `packages/contract` `LabeledNumberSchema`, `tests/unit/v2ui-data-layer.test.ts`, `tests/unit/v2ui-pages.test.ts`, handoff spot-check only.

**Mode:** read-only. This seat wrote only this verdict file. No product code edits, no git mutations, no board mutations. Did not read any peer Opus UI-02a verdict. Did not re-run orchestrator-green full gates. Did not claim browser-rendered visual proof (environment has no browser; packet assigns final visual to V under DR-145).

## Verdict

**APPROVED**

Percentage restatement is honest under DR-154(4) / AC-76: one shared formatter feeds card pills, tooltip titles, and the honesty drawer; rounding loss is marked with `≈` and retains the exact recorded probability in detail. Typed absence is a closed three-reason set that never paints `0%`. The repaired scoring banner/copy names V2’s missing per-node scoring **endpoint** and states that V3 scores live on the graph. Behavioural unit coverage exercises the real shipped formatter, absence, and banner decision; page/component suites are source-text wiring ratchets and are defensible as such. Residual notes below are **ADVISORY** only.

---

## Decision table (packet Q1–Q5)

| # | Question | Result | Source proof |
|---|---|---|---|
| **1** | Honest percentage restatement; one formatter; misleading inputs? | **PASS** (with A2 advisory on non-probability / non-finite inputs) | `v3ScorePercentage` adapter ~306–316; sole consumers: `labeledNumberBadge` ~325 and `NodeDetailDrawer` ~363–364; card renders only `badge.pillText` / `badge.title` |
| **2** | Typed absence never `0%`; closed reasons; exhaustiveness? | **PASS** | `V3NodeScoreAbsence` union ~252–255; `v3NodeScoreState` ~268–282; `v3ScoreAbsenceCopy` switch ~336–353 (no default; non-void return); pills `NO SCORE` / `NO SCORE YET` |
| **3** | Banner names V2 endpoint absence without claiming V3 unscored? | **PASS** | `SCORING_ABSENCE_REASON` ~432–436; `V3_SCORING_STATUS_LABEL` ~451; `v3ScoringStatusLabel` ~453–454; `scoringStatusCopy.ts` ~26–37; `scoringResponse.ts` `formatScoringVisibilityState` ~262–274 |
| **4** | Tests behavioural vs source-text; source-text defensible? | **PASS** (with A3 advisory) | Behavioural: `v2ui-data-layer.test.ts` UI-02a + scoring-endpoint blocks; source-text: `v2ui-pages.test.ts` UI-02a + scoring-copy wiring |
| **5** | NUL-byte hazard fixed this revision? | **NOT FIXED** (A1 advisory) | Still 2 NULs in model-key template ~611; plain `grep -n` → `Binary file … matches` (no lines); `grep -a` shows symbols |

### Q1 — Honest percentage restatement / single formatter?

**Shipped rule** (`apps/v2-ui/lib/v3/adapter.ts` ~296–316):

- `percentage = value * 100`
- round to nearest **0.01** percentage point (`Math.round(percentage * 100) / 100`)
- strip trailing zeroes in the display decimal
- **exact** iff `rounded / 100 === value` → bare `N%` + detail `… (exact percentage restatement)`
- otherwise **`≈N%`** + detail that quotes the **recorded probability** and the rounding rule

**One formatter, three surfaces:**

| Surface | Path |
|---|---|
| Card badge pill | `v3NodeScoreState` → `v3ScorePresentation` → `labeledNumberBadge` → **`v3ScorePercentage`** → `pillText` (`BASE …` / `FINAL …`) |
| Card tooltip / `aria-label` | same badge’s `title` embeds `percentage.detail` + kind / producer / source / replay_handle |
| Honesty drawer | `NodeHonestyDetails` calls **`v3ScorePercentage`** on `v3.base_score.value` and `v3.final_strength.value` (`NodeDetailDrawer.tsx` ~363–396); visible text = `.text`, `title` = `.detail` |

`DebateCanvas` `V3ScoreBadges` (~543+) only renders precomputed presentation fields — no local `* 100`, `toFixed`, or `formatScorePercent` on the V3 path. Wiring: `DebatePageClient.tsx` ~725, ~1302 (`v3NodesById={v3NodeById}` with `answer === null ? null : contractNodesById(answer)`).

**Orchestrator live samples re-checked on the shipped function** (tsx import of `adapter.ts`):

| Input | Output text |
|---|---|
| `0.98` | `98%` |
| `0.88` | `88%` |
| `0.41000000000000003` | `≈41%` (detail retains full recorded probability) |
| `0.3333333333333333` | `≈33.33%` |
| `1` / `0` | `100%` / `0%` |

**Misleading-input cases:**

| Case | Behaviour | Honest? |
|---|---|---|
| Two close probs (e.g. `0.410001` vs `0.410002`) | same pill `≈41%`; **distinct** details with each recorded probability | Yes — not presented as an exact tie |
| Equal inputs | identical format | Yes — no fake difference |
| Outside [0,1] (e.g. `-0.1`, `1.5`) | restated as `-10%` / `150%` (no clamp) | Faithful to DR-115 “never clamp”; contract allows any **finite** number (`LabeledNumberSchema.value: z.number().finite()` — not unit-interval). See A2 |
| Non-finite (`NaN`, `Infinity`) | `≈NaN%` / `Infinity%` | Contract `.finite()` blocks parse; formatter itself is unguarded → A2 |
| Tiny non-zero `1e-6` | `≈0%` with detail retaining probability | Marked approximate; not identical to exact present `0%` |

**Failing case that would re-open Q1:** a second inline percentage path on card or drawer that omits `≈` or drops the recorded probability from detail; or defaulting/clamping contract numbers before display.

### Q2 — Typed absence (DR-115)?

Closed union (`adapter.ts` ~252–255):

1. `QUESTION_CARD_IS_NOT_A_NODE` — ROOT_CLAIM question line  
2. `NO_SERVED_ANSWER` — `nodesById === null` (live / no projection yet)  
3. `NODE_ABSENT_FROM_SERVED_ANSWER` — id missing from map  

Resolution order in `v3NodeScoreState` (~268–282) is explicit and non-overlapping. PRESENT always copies **both** required contract fields (`base_score`, `final_strength`) with no defaulting.

Absence copy (`v3ScoreAbsenceCopy` ~336–353): switch covers all three cases, **no `default`**, declared non-void return type → a fourth union member fails TypeScript control-flow checking rather than rendering an unnamed string. Pills are `NO SCORE` / `NO SCORE YET` only — behavioural test asserts `/^NO SCORE/`, no digit/dash/em-dash in pill text (`v2ui-data-layer.test.ts` ~292–314).

Card render (`V3ScoreBadges` ABSENT branch): `scoreBadge unavailable` with absence `pillText` / `title` — never a numeric pill.

**Failing case:** rendering `0%` / `—` / `N/A` for any of the three absence reasons, or collapsing all three into one anonymous message (titles are three distinct sentences today).

### Q3 — Repaired banner / insights strip?

| Symbol | Value / behaviour |
|---|---|
| `SCORING_ABSENCE_REASON` (~432–436) | States V3 scores every claim on the graph (base score + final strength + labels/replay in Honesty drawer); names **“V2's separate per-node scoring endpoint”** as what is missing (no refresh / holes / fatal flags / score feedback) |
| `V3_SCORING_STATUS_LABEL` (~451) | `"Scored on the graph — no V2 scoring endpoint"` — short strip label; does **not** say “Scoring unavailable” |
| `v3ScoringStatusLabel` (~453–454) | Returns that label **only** when reason exactly matches `SCORING_ABSENCE_REASON`; else `null` (V2 copy wins) |
| `scoringUnavailable()` (~457–464) | Serves `status: "unavailable"` with that reason |
| Top-bar path | `scoringStatusCopy.ts` ~26–37: on `unavailable`, consults `v3ScoringStatusLabel` **before** “Scoring check failed” |
| Insights strip | `scoringResponse.ts` `formatScoringVisibilityState` ~262–274: same consult **before** provider-required and generic `"Scoring unavailable"` fall-throughs; `title` = V3 label, `detail` = full reason |

Behavioural proof: `v2ui-data-layer.test.ts` ~352–377 (label match, no “scoring unavailable”, reason names base score / final strength / V2 endpoint, non-V3 reasons return null).

**Failing case:** restoring title `"Scoring unavailable"` for the V3 absence reason, or copy that claims V3 has no scores.

### Q4 — Can the tests FAIL for the right reason?

**Behavioural** (`tests/unit/v2ui-data-layer.test.ts` — drives shipped exports):

| Test (paraphrase) | What breaks it |
|---|---|
| carries both recorded numbers | state not PRESENT or numbers not contract identity |
| restates FP noise as `BASE ≈41%` | pill still shows raw float or omits rounding language / recorded probability |
| close probs share `≈41%` but distinct details | collision without `≈`, or details equalized |
| provenance in title | missing kind/producer/source/replay or percentage restatement |
| three typed absence reasons | wrong reason codes |
| never digit/dash on absence pills; three distinct titles | placeholder digit or collapsed copy |
| scoring ENDPOINT label precise | label says unavailable/unscored, or reason omits endpoint / graph scores |

**Source-text** (`tests/unit/v2ui-pages.test.ts`):

| Guard | Role |
|---|---|
| page passes `v3NodesById` / `contractNodesById` | wiring ratchet |
| canvas uses `v3ScorePresentation(v3NodeScoreState(…))` and no inline `.base_score.` / `.final_strength.` | projection owns absence |
| `V3ScoreBadges` uses `scoreBadge` vocabulary + `badge.pillText` / `title` | no new widget |
| ABSENT branch + no literal `0`/`—`/`N/A` in badge block | structural DR-115 |
| no `formatScorePercent` / `toFixed` / `Math.round` / `* 100` inside V3 badge block | forbids second formatter on the card |
| drawer contains `v3ScorePercentage(v3.base_score.value)` (+ final) and producer lines | drawer wiring |
| scoringStatusCopy / scoringResponse consult `v3ScoringStatusLabel` **before** failure titles | copy-order ratchet |

These source-text checks are **defensible wiring ratchets**: pure percentage/absence/banner decisions execute in the data-layer suite; pages only pin that the React surfaces still call those decisions and do not re-derive scores. They will not catch a behavioural drift **inside** `v3ScorePercentage` (that is the data-layer’s job). They **will** catch a card that formats locally again or drops the adapter call — the EXEC-01 class of “page stopped calling the pure rule.”

**Gap (A3):** `formatScoringVisibilityState` itself is not imported under root vitest (file is V2-legacy / stricter options); only the pure `v3ScoringStatusLabel` decision is behavioural, plus source-order ratchet on the strip. Not blocking for UI-02a’s score presentation core.

Focused evidence this review: `npx vitest run tests/unit/v2ui-data-layer.test.ts tests/unit/v2ui-pages.test.ts` → **2 files / 68 tests passed**.

### Q5 — NUL-byte hazard fixed?

**No.** `apps/v2-ui/lib/v3/adapter.ts` still contains **2 embedded NUL bytes** used as intentional separators in the settings model-row key:

```text
const key = `${entry.model_id}\0${entry.model_version}\0${entry.provider}`;
```

(~line 611 in NUL-stripped numbering; absolute bytes ~22773 / ~22796).

Observed this review:

```text
$ grep -n "v3ScorePercentage" apps/v2-ui/lib/v3/adapter.ts
Binary file apps/v2-ui/lib/v3/adapter.ts matches

$ grep -an "v3ScorePercentage" apps/v2-ui/lib/v3/adapter.ts
306:export function v3ScorePercentage(value: number): ...
```

`file(1)` reports `data`. The live review hazard from EXEC-01 A6 / this packet remains: a plain `grep`/`rg` without binary/text mode can silently omit line hits and produce a phantom “symbol absent” conclusion. **This revision did not remove or relocate the NULs.** Classified **ADVISORY** (review/tooling hazard on a central file), not a product defect in score presentation itself.

---

## Handoff spot-check (not trusted; verified)

| Claim | Verified? |
|---|---|
| One formatter `v3ScorePercentage` shared by badges / drawer / tooltips | Yes |
| Typed absence never `0%` | Yes |
| Banner names V2 endpoint; not “V3 unscored” | Yes |
| RED→GREEN percentage tests; 68 focused tests green | Yes (re-ran 68 pass) |
| Maker/model out of scope | Yes (no UI-02b work in scope) |
| Browser proof still open; Codex correctly BLOCKED visual claim | Accepted; not re-opened as product BLOCKING |

---

## Findings

### BLOCKING

Nothing blocking.

### ADVISORY

#### A1 — Adapter NUL bytes still live (packet Q5 / EXEC-01 A6 residual)

- **Where:** `apps/v2-ui/lib/v3/adapter.ts` model-key template (~611), 2× `\0`
- **Law / scenario:** review hazard — plain grep silently treats file as binary
- **Failing case for reviewers:** `grep -n v3ScorePresentation adapter.ts` → no line hits despite symbol present
- **Disposition:** not a score-render defect; fix is use a non-binary delimiter (or document `grep -a` as mandatory) in a dedicated hygiene pass

#### A2 — Formatter accepts non-probability / non-finite numbers without a typed refuse

- **Where:** `v3ScorePercentage` (~306–316); contract `LabeledNumberSchema.value` is `z.number().finite()` only (`packages/contract/src/index.ts` ~176–177), not unit-interval
- **Scenario:** out-of-range finite values render as `-10%` / `150%` (faithful restatement, no clamp — aligned with DR-115); non-finite would render `≈NaN%` / `Infinity%` if ever injected past parse
- **Why not blocking:** parse path rejects non-finite; UI-02a law is restatement not invention; no evidence engine serves non-finite scores into cards
- **Optional harden:** refuse non-finite / out-of-unit at the presentation boundary with typed absence rather than digit-shaped garbage (would be a new product decision, not required to approve this ticket)

#### A3 — Insights-strip function not behaviourally imported under root vitest

- **Where:** `formatScoringVisibilityState` in `scoringResponse.ts`; covered by source-order ratchet + pure `v3ScoringStatusLabel` behavioural tests
- **Scenario:** strip could stop using the V3 title while still importing the helper under a dead path that the string test still matches, or could reorder via aliasing
- **Why not blocking:** pure decision + call-site order are pinned; same residual class accepted on prior tickets for V2-legacy files that cannot load under root tsc

---

## Evidence captured (this lens)

- Binary-safe vs plain grep on `adapter.ts` (scratch `ui02a-adapter-grep.txt`)
- Real shipped `v3ScorePercentage` / absence / banner via `tsx` import (scratch `ui02a-real-formatter.txt`)
- Focused vitest: 2 files, 68 tests passed (scratch `ui02a-vitest.txt`)
- Packet notes (scratch `ui02a-packet-notes.md`)

Orchestrator-reported full gates (root/v2-ui `tsc`, 60/413 vitest, architecture/source audits) were **not** re-run per packet; focused score suites above were re-executed for independent confirmation of the percentage delta.

---

## Closing

**APPROVED.** Original unreviewed scores wiring and the DR-154(4) percentage delta both hold under source inspection: one honest formatter, typed absence, and a banner that finally tells the truth about what is missing. Advisories A1–A3 do not reopen the ticket’s acceptance criteria. Browser visual sign-off remains V’s under DR-145; absence of browser in this seat is not treated as a product BLOCKING invent.
