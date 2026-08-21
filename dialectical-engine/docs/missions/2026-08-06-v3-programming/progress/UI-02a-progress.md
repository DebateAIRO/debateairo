# UI-02a progress — per-node scores on V2's cards (board t_d4d7d993)

Lane DR-140: Claude worker codes, Grok reviews. Scope narrowed by DR-149(3):
SCORES ONLY. Maker attribution is UI-02b and requires a served-contract change
— **the contract is not touched by this ticket.**

## PLAN RECORDED — 2026-08-11, before any edit

### Facts verified first-hand (not taken on trust)

1. `packages/contract/src/index.ts:262-278` — `NodeSchema` is `.strict()` and
   carries `base_score: LabeledNumberSchema` (L266) and
   `final_strength: LabeledNumberSchema` (L267). `LabeledNumberSchema`
   (L176-183) = `{ value, kind, source, producer, provenance_ref,
   replay_handle }`, all required. **Neither field is nullable**, so a node that
   parses always has both numbers.
2. `packages/serve/src/index.ts:1616-1631` populates them from
   `ledger.reduced_judgement` (tau) and the propagation strength row, carrying
   `number_kind` / `source_ref` / `producer` / `replay_handle` verbatim. In the
   acceptance ceremony (`acceptance/main.ts:180-182`) the kinds are
   `base-probability` and `propagated-probability`.
3. `apps/v2-ui/lib/v3/adapter.ts` — confirmed ZERO references to `base_score`
   or `final_strength`; `debateDetailFromAnswer` hardcodes `scoring: null`,
   `models: []`, `workers: []` (L210, L223-224).
4. Only ONE rendered surface already reads them:
   `apps/v2-ui/components/NodeDetailDrawer.tsx:379-392` (the UI-01 "V3 honesty"
   section) shows `value`, `source`, `replay_handle` — but NOT `kind` (the
   contract's own label for the number) and NOT `producer`.
5. The node CARD (`apps/v2-ui/components/DebateCanvas.tsx`, `CanvasCard`) shows
   no V3 number at all. V2's own number vocabulary is the `scoreBadge` pill
   (`STR 72` / `UNC 48` / `IMP 60`) inside a `scoreBadgeButton` that opens the
   node drawer, with the full explanation in `title` + `aria-label`
   (`DebateCanvas.tsx:461-511`, CSS `app/globals.css:1386-1437`).
6. Two producers of the misleading "Scoring unavailable":
   - `lib/v3/adapter.ts:307-309` `v3ScoringStatusLabel()` → top bar, via
     `lib/scoringStatusCopy.ts:34-37`.
   - `lib/scoringResponse.ts:268-274` `formatScoringVisibilityState()` →
     scoring-insights strip title.
   `DebateOutline.tsx` also renders the string, but for a real per-node
   `scoringError`, and `DebateOutline` is imported by nothing (dead surface) —
   left alone.

### What I will change

1. **`apps/v2-ui/lib/v3/adapter.ts`** — add a typed per-node score projection:
   - `V3NodeScoreState` = `{status:"PRESENT", base_score, final_strength}` |
     `{status:"ABSENT", reason}` over a CLOSED reason set
     (`QUESTION_CARD_IS_NOT_A_NODE` | `NO_SERVED_ANSWER` |
     `NODE_ABSENT_FROM_SERVED_ANSWER`). These are the only three ways a V2 card
     can lack a V3 number, given (1) above.
   - `v3ScorePresentation(state)` → the V2 badge shapes (`pillText` + `title`),
     exhaustive switch so a new reason fails typecheck rather than rendering
     unnamed.
   - **Value rendered VERBATIM.** V2's `formatScorePercent` clamps to [0,1] and
     multiplies by 100; V3 rules NO scale for `base_score`/`final_strength`, so
     rescaling or rounding would publish a number the run never recorded
     (AC-76/DR-039). Question for V recorded below.
2. **`apps/v2-ui/components/DebateCanvas.tsx`** — new optional
   `v3NodesById?: ReadonlyMap<string, ContractNode> | null` prop
   (`undefined` = caller supplies no V3 data at all → render nothing, keeping
   V2 callers byte-identical; `null` = V3 caller with no served answer yet →
   typed absence). Renders the badges in the existing `nodeHeader`, in the
   existing `scoreBadge`/`scoreBadgeButton` vocabulary, inside the existing
   `ScoringErrorBoundary`. No new widget, no redesign.
3. **`apps/v2-ui/app/debate/[id]/DebatePageClient.tsx`** — pass the already-
   computed `v3NodeById` memo into `DebateCanvas`.
4. **`apps/v2-ui/components/NodeDetailDrawer.tsx`** — carry `kind` and
   `producer` on the two existing V3 honesty lines (the drawer keeps the fuller
   numeric detail; a `LabeledNumber` is not a bare float).
5. **Banner repair** — `SCORING_ABSENCE_REASON` updated so it stays true after
   (2) (the numbers are now on the cards as well as the drawer);
   `v3ScoringStatusLabel` no longer returns "Scoring unavailable" but a label
   that says V3 IS scored and names precisely what is absent (V2's per-node
   scoring endpoint + its feedback loop); `formatScoringVisibilityState` gains
   a narrow V3 branch ahead of its generic `unavailable` branch so the strip
   title matches. V2's own "Scoring unavailable" copy for REAL failures is
   untouched (its `.mjs` source-tests pin it).
6. **Tests** — `tests/unit/v2ui-data-layer.test.ts`: pin PRESENT projection
   (values + labels + provenance), all three ABSENT reasons, verbatim value
   (no rescaling), and the repaired banner strings.

### Out of scope, deliberately

- No contract edit (UI-02b owns that).
- No maker/model label.
- `DebateDetail.scoring` stays `null`: filling V2's `DebateScoringResponse`
  would require inventing `uncertainty`, `impact`, `labels`, `holes` and
  `fatal_flags` that V3 does not record (DR-115).
- `DebateThread` / `DebateSplit` / `DebateMap` get no badges — V2 itself passes
  scoring only to `DebateCanvas`, and adding score surfaces V2 never had would
  be a redesign (DR-145).

### Verification plan (constrained)

Acceptance backend cannot boot (Claude CLI OAuth expired; DR-143(3) refusal),
so NO live browser gate this pass. Suite-only: root `tsc --noEmit`, v2-ui
`tsc --noEmit -p tsconfig.json`, `pnpm test` (root vitest), plus the two audits.
Anything not verifiable that way is reported as unverified, not claimed.

---

## LOG

- 2026-08-11 — plan recorded above; beginning edits.
- 2026-08-11 — all edits landed as planned, with ONE deviation, forced by a
  finding: the root suite CANNOT import `apps/v2-ui/lib/scoringResponse.ts` to
  exercise `formatScoringVisibilityState` at runtime. That file is V2-legacy,
  sits outside the root tsconfig `include`, and produces ~30 errors under the
  root program's stricter options (extensionless relative imports under
  NodeNext, `noImplicitAny`, `noUncheckedIndexedAccess`). Importing it turned
  root typecheck red. Rather than refactor a V2 design-authority file
  (DR-145) far outside this ticket, the DECISION was kept where it is already
  root-strict clean — `v3ScoringStatusLabel` in the adapter, covered
  behaviourally — and the strip is pinned by a SOURCE guard, exactly the
  pattern UI-01 established for `lib/scoringStatusCopy.ts`. Recorded as a
  finding, not fixed.

### Gates run (2026-08-11)

| Gate | Command | Result |
|---|---|---|
| Root typecheck | `npx tsc --noEmit` | exit 0, no output |
| v2-ui typecheck | `npx tsc --noEmit -p tsconfig.json` (in `apps/v2-ui`) | exit 0 |
| Root vitest | `npx vitest run` | exit 0 — **58 files / 398 tests passed** (385 at UI-01; +13 here) |
| Architecture audit | `npx tsx tools/orphan-audit/src/cli.ts architecture` | exit 0, `violations: []` |
| Source audit | `npx tsx tools/orphan-audit/src/cli.ts source` | exit 0, `blocking: []` |
| Next compile | dev server compiled `/debate/[id]` (966 modules) → `GET … 200` | passes |

**NOT verified, and why:**
- **No live data.** The acceptance API is down (Claude CLI OAuth expired,
  DR-143(3)); every proxied call returns 500 `ECONNREFUSED 127.0.0.1:8790`,
  reproduced in the dev-server log. The badges are therefore proven by suite
  and by compile, NOT by seeing real numbers on run `8d2b4e5a`. No fixture was
  dressed up as live data and no screenshot was taken of a state I did not see.
- **`next build` could not complete** — for an environment reason, not a code
  one: `app/layout.tsx` loads `next/font/google` and this sandbox has no egress
  to `fonts.gstatic.com`, so the build dies in the font loader before compiling
  any of my components (`An error occurred in next/font` /
  `Cannot read properties of null (reading '1')`). Run with
  `NEXT_DIST_DIR=.next-build`; the temporary dist dir was deleted afterwards
  and `.next-dev` was never touched.

### Questions for V (nothing was chosen unilaterally)

1. **Scale/precision.** The card prints the recorded number verbatim
   (`BASE 0.62`, `FINAL 0.41`). V2's own presentation would show `62` on a
   0–100 scale, but V3 rules NO scale for `base_score`/`final_strength`, so
   applying it would assert a range the register never ruled (AC-76/DR-039).
   Verbatim, or a ruled display scale/precision as a register row?
2. **Badge wording.** `BASE` / `FINAL` abbreviate the contract's own field
   names in V2's `STR`/`UNC`/`IMP` idiom; the full name, the `kind`
   (`base-probability` / `propagated-probability`), the producer, the source
   and the replay handle all ride in the tooltip and the accessible name.
   Confirm or rename.
3. **Live-run absence.** While a run streams there is no served answer, so
   every card shows `NO SCORE YET` with the reason in its tooltip. Honest, but
   it is a badge on every card during generation — keep it visible, or suppress
   until the answer lands?
4. **Other views.** Thread / Split / Map carry no score badges, because V2
   itself feeds scoring only to the canvas; adding them would be new surface,
   not restoration (DR-145). Confirm that is the wanted scope.

### Findings outside this ticket (reported, not fixed)

- `apps/v2-ui/lib/scoringResponse.ts` (and, by extension, most V2-legacy `lib/`
  files) does not compile under the root TypeScript program. Nothing catches it
  today because `apps/v2-ui` is in the root tsconfig `exclude` and only files
  reached by an import are checked.
- The production build is not hermetic: `next/font/google` needs network at
  build time. A self-hosted font would make the build gate work offline.
- `apps/v2-ui/components/DebateOutline.tsx` (129 lines, renders score badges)
  is imported by nothing — dead surface in the restored workspace.
- The bare-500 proxy behaviour (PAUSED-STATE UPDATE 4, Cause A) reproduced
  again in the dev log; already owned by POL-01.
