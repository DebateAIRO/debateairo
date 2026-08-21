# UI-02a dual-diamond review — Grok lens (rev2)

**Ticket:** `t_d4d7d993` · **Author:** Codex (gpt-5.6-sol) rev2 rework  
**Reviewer:** Grok (independent read-only dual-diamond lens, rev2)  
**Date:** 2026-08-11  
**Packet:** `reviews/UI-02a-rev2-review-packet.md`  
**Scope:** rev2 delta only — B1 (NUL escapes + identity-key neutrality), A3 drawer ratchet, A1 banner surface rename, A7 provenance assert; scoring formatter/absence frozen from rev1.  
**Inputs verified against shipped source (not handoff trust):** `apps/v2-ui/lib/v3/adapter.ts` (**binary-safe**), `NodeDetailDrawer.tsx`, `DebateCanvas.tsx` (`V3ScoreBadges`), `scoringStatusCopy.ts` / `scoringResponse.ts` call-order spot-check, `tests/unit/v2ui-data-layer.test.ts`, `tests/unit/v2ui-pages.test.ts`, handoff remaining-advisories section (hypotheses only).

**Mode:** read-only. This seat wrote only this verdict file. No product code edits, no git mutations, no board mutations. Did not read any peer Opus UI-02a rev2 verdict. Did not re-run orchestrator-green full gates (root/v2-ui `tsc`, 60/416 vitest, architecture, source audit). Did not re-run the 2M formatter property suite. Scoring work was **not** re-litigated.

## Verdict

**APPROVED**

B1 is closed and behaviour-neutral: source carries escaped `\u0000` only (raw NUL count **0**), the file is plain-text greppable again, and the runtime identity key remains byte-identical `a\0b\0c` (`hex 6100620063`) with collision resistance preserved against printable separators. The formatter and typed-absence paths match the rev1-approved rule and live sample outputs. A3 now fails the concrete drawer drift (raw `{v3.base_score.value}`) and the drawer renders through an executable `v3NodeScoreDetails` projection. A1 names badge tooltip and claim drawer — surfaces that actually paint the percentage text. Record-only A2/A4/A5/A6/A8 remain named in the handoff; A7 is closed. Nothing blocking.

---

## Decision table (packet Q1–Q5)

| # | Question | Result | Source proof |
|---|---|---|---|
| **1** | B1 closed and behaviour-neutral? | **PASS** | raw NUL = 0; 2× `\u0000` escapes at `adapter.ts:629`; `file` → UTF-8 text; plain `grep v3ScorePercentage` → 4 hits; identity-key test + live import prove `hex 6100620063` / `a\u0000b\u0000c`; space-separator collision avoided |
| **2** | Rework disturb scoring? | **PASS** (untouched) | `v3ScorePercentage` body ~306–317 matches rev1 rule; live samples `0.98→98%`, `0.88→88%`, `0.41000000000000003→≈41%`, `0.3333…→≈33.33%`; absence union ~252–255 + switch ~369+; card path still `labeledNumberBadge` → formatter |
| **3** | A3 ratchet real for described drift? | **PASS** | `v2ui-pages.test.ts:200–201` requires `v3NodeScoreDetails(v3)` and forbids `/\{v3\.(base_score\|final_strength)\.value\}/`; drawer ~363/383/392 uses projection; behavioural `v2ui-data-layer.test.ts:276–303` asserts `≈41%` on the failure value |
| **4** | A1 copy names a real score surface? | **PASS** | `SCORING_ABSENCE_REASON` ~465–469: “each badge tooltip and claim drawer”; badge `title={badge.title}` embeds `percentage.detail`; drawer paints `baseScore.percentage.text` / `finalStrength.percentage.text` |
| **5** | Record-only A2/A4/A5/A6/A8 honest; not silent drops? | **PASS** | Handoff “Remaining rev1 advisories” names A2, A4, A5, A6, A8 out of scope; A7 closed in production tests (`v3ScorePercentage(…).text` at data-layer ~272) |

---

### Q1 — B1 genuinely closed and behaviour-neutral?

**Source textability** (binary-safe inspection this review; never plain-grep alone as sole evidence):

| Check | Observed |
|---|---|
| raw NUL byte count (`Path.read_bytes().count(b"\x00")`) | **0** |
| escaped `\u0000` count in source text | **2** (both on the identity-key line) |
| `file(1)` | `Java source, Unicode text, UTF-8 text` |
| plain `grep -n v3ScorePercentage` (no `-a`) | **4 hits** (lines 306, 336, 344, 358) — no longer silent-skip |
| `grep -a` same | same 4 hits |

**Shipped delimiter** (`apps/v2-ui/lib/v3/adapter.ts:628–629`):

```ts
export function modelLedgerIdentityKey(entry: ModelLedgerIdentity): string {
  return `${entry.model_id}\u0000${entry.model_version}\u0000${entry.provider}`;
}
```

Used at `settingsViewFromDeployment` ~654 as the `Map` key. Delimiter is still U+0000 at runtime — not a space, colon, or other printable separator.

**Runtime byte identity** (shipped export + unit test `v2ui-data-layer.test.ts:659–668`):

| Assertion | Result |
|---|---|
| `Buffer.from(key).toString("hex")` for `("a","b","c")` | `6100620063` = `a` `NUL` `b` `NUL` `c` |
| `key === "a\u0000b\u0000c"` | true |
| `("a b","c","d")` vs `("a","b c","d")` distinct | true (NUL delimiter cannot occur inside the three field strings under the same collision class as a space) |

Independent live import of `modelLedgerIdentityKey` reproduced the same hex and equality. A printable separator would reintroduce the packet’s named collision between `("a b","c")` and `("a","b c")`; that was not done.

**Failing case that would re-open B1:** re-embedding raw `0x00` bytes in source (file becomes binary to plain grep again), or swapping `\u0000` for `" "` / `":"` while keeping the same join shape (key collision + behavioural test fail on hex / distinctness).

### Q2 — Did the rework disturb the scoring?

**No.** Independent source comparison (not hash trust alone):

- `v3ScorePercentage` (~306–317): still `value * 100` → round nearest 0.01 pp → strip trailing zeroes → exact iff `rounded / 100 === value` else `≈` with recorded probability in detail. No clamp/default.
- Card badges still go `v3NodeScoreState` → `v3ScorePresentation` → `labeledNumberBadge` (~352–365) → **same** formatter.
- New `v3NodeScoreDetails` (~331–349) is additive drawer projection; it **calls** `v3ScorePercentage` rather than re-implementing it.
- Typed absence union (~252–255) and `v3ScoreAbsenceCopy` switch remain the closed three-reason set with no default.

**Live samples on the shipped function** (tsx import this review):

| Input | text |
|---|---|
| `0.98` | `98%` |
| `0.88` | `88%` |
| `0.41000000000000003` | `≈41%` (detail retains full recorded probability) |
| `0.3333333333333333` | `≈33.33%` |
| `1` / `0` | `100%` / `0%` |

Author’s frozen hash `59049c36…a48a4` was **not** independently reproduced as a particular line-slice SHA here (extraction boundary unknown); that does not reopen scoring — the body and samples match the rev1-approved rule. Per packet: do not re-litigate the 4-dp / 2M property suite.

**Failing case:** a second inline percentage path on card or drawer that omits `≈` or drops the recorded probability from detail.

### Q3 — Is the A3 ratchet real?

**Yes, for the concrete drift the rework directed.**

**Before (rev1 hole):** drawer source-text only pinned `v3ScorePercentage(v3.base_score.value)` as a string present somewhere; swapping the visible span to `{v3.base_score.value}` left that string intact and re-showed `0.41000000000000003` with all gates green.

**After (shipped):**

| Layer | Where | What fails on the described drift |
|---|---|---|
| Negative source ratchet | `v2ui-pages.test.ts:201` | `expect(drawer).not.toMatch(/\{v3\.(base_score\|final_strength)\.value\}/)` — the swap to `{v3.base_score.value}` matches and fails |
| Positive wiring | `v2ui-pages.test.ts:200` | drawer must still contain `v3NodeScoreDetails(v3)` |
| Executable projection | `adapter.ts:331–349` + `v2ui-data-layer.test.ts:276–303` | drawer-ready records go through `v3ScorePercentage`; failure value `0.41000000000000003` must yield text `≈41%` |
| Consumer | `NodeDetailDrawer.tsx:363, 383, 392` | visible spans are `{baseScore.percentage.text}` / `{finalStrength.percentage.text}` with detail in `title` |

Simulated this review: the exact bad JSX from the directive matches the forbid regex; the good path does not.

**Honest limit (not blocking):** the negative regex alone is pattern-specific — e.g. `{String(v3.base_score.value)}` would not match that one pattern. That is not the hole rev1 named, and the preferred directive fix (move formatting into an adapter function the behavioural suite executes) **was** taken. Combined layers close the described regression for the right reason, not only a single brittle “string still present” pin.

**Failing case that re-opens A3:** drawer paints contract `.value` for base/final while gates stay green (regex weakened without a behavioural substitute, or projection bypassed).

### Q4 — A1 banner names a surface that renders the scores?

**Yes.**

`SCORING_ABSENCE_REASON` (`adapter.ts:465–469`) now says the full labels and replay handles live **“in each badge tooltip and claim drawer”** — not the Honesty drawer.

| Named surface | Renders percentage / provenance? |
|---|---|
| Badge tooltip | `DebateCanvas.tsx` `V3ScoreBadges`: `title={badge.title}` and `aria-label={badge.title}`; title built in `labeledNumberBadge` with `percentage.detail` + kind/producer/source/replay |
| Claim drawer | `NodeDetailDrawer.tsx` `NodeHonestyDetails`: `baseScore.percentage.text` / `finalStrength.percentage.text` with detail titles |

Behavioural pins: `absent.reason` matches `/badge tooltip/i` and `/claim drawer/i`, and must **not** match `/Honesty drawer/i` (`v2ui-data-layer.test.ts:399–401`).

**Failing case:** restoring “Honesty drawer” as the place to find per-node base score / final strength / replay, or naming a surface that never paints those fields.

### Q5 — Record-only items stated honestly?

Handoff section **“Remaining rev1 advisories — recorded, out of scope”** names:

| Id | Handoff substance | Independent spot-check |
|---|---|---|
| **A2** | “each card” exact for default tree/canvas; thread/split/map lack V3 score nodes | Consistent with rev1/directive; out of scores-only rework |
| **A4** | insights-strip still source-wiring rather than root-Vitest behavioural coverage (module options) | Item not dropped. Package fact still true: `apps/v2-ui/package.json` `"test": "node scripts/run-node-tests.mjs"` and `apps/v2-ui/scripts/` **missing**, so `lib/scoringResponse.test.mjs` still cannot run via that script — handoff emphasizes the coverage gap rather than restating the missing `scripts/` path; not a silent drop of A4 as a whole |
| **A5** | other `LabeledNumber` displays in `AnswerHonestyDrawer` still raw notation | Recorded; cross-surface notation out of scope |
| **A6** | tiny positive can display `≈0%`; `≈` + detail distinguish exact zero | Recorded; formatter frozen after rev1 hard verification |
| **A8** | neighbouring V2 `formatScorePercent` clamps/defaults; V3 path forbids it | Recorded; not imported on V3 badges |
| **A7** | claimed **closed** | **Verified closed:** provenance assert is `v3ScorePercentage(number.value).text` (`v2ui-data-layer.test.ts:272`), not `` `${number.value * 100}%` `` |

Grok rev1 advisory on non-probability/non-finite direct formatter inputs remains record-only as the handoff states.

---

## Findings

### BLOCKING

Nothing blocking.

### ADVISORY

None new that reopen acceptance. Residual record-only items A2/A4/A5/A6/A8 stay out of scope as directed; they are not silent drops and are not converted to blocking here.

---

## Evidence captured (this lens)

- Binary-safe NUL / escape / `file` / plain-grep vs `grep -a` on `adapter.ts`
- Live `modelLedgerIdentityKey` hex + collision check; live `v3ScorePercentage` samples via tsx import of shipped module
- Focused vitest: `tests/unit/v2ui-data-layer.test.ts` + `tests/unit/v2ui-pages.test.ts` → **2 files / 71 tests passed** (scratch `ui02a-rev2-focused.log`)
- Simulated A3 bad JSX against the forbid regex
- Handoff remaining-advisories cross-check vs package.json / missing `scripts/` fact

Orchestrator-reported full gates were **not** re-run per packet.

---

## Closing

**APPROVED.** The rev2 delta does what the directive required: escape the load-bearing NUL without changing runtime keys, make the drawer drift fail for the right reason, point the banner at surfaces that actually show the scores, and keep the hard-verified percentage work frozen. Record-only advisories remain on the record. Browser visual sign-off remains V’s under DR-145; absence of browser in this seat is not treated as product BLOCKING.
