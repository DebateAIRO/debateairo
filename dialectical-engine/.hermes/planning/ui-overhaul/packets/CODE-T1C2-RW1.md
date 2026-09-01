# CODE-T1C2-RW1 — rework round 1 of 3 (ticket t_ff92db49, epoch=25)

Same codex seat, same session (01a05b25). The blind review CONFIRMED all four cells,
every gate, your trap mutant, and your discarded-run discipline — and found three
blockers in territory your tools cannot see: real-browser layout, resolved token
values, and the contract union your fixture's own hand-typed helper made unreachable.
Two of the three were CELL defects, now amended (AM12a, commit 28c4af22): you implement
the amended cells. B3 was a token-choice defect: the review's words — painting an
OpenAI dot with `--pro-line` "is the stance token this very commit installs three feet
away on the same card", with `--m-grok`/`--m-default` unused.

## 0. Read order
1. This packet. 2. The verdict on t_ff92db49 (07:51) — B1/B2/B3 + N2/N4/N5/N6 with the
   mutant table. 3. `dispatch-order.md` — row 8 AS AMENDED (writes now include
   `tests/support/v2uiFixtures.ts`, review-helper type ONLY; verify is now 12 files) and
   §"T1-C2 rework cells — T1-C2-5 and T1-C2-6 (AM12a)" — implement those cells
   character-for-character, including their in-cell RED-proof requirements.

## 1. The charge
- **B1 — make the review dot exist.** `.nodeReviewDot` renders 0×0 (browser-measured):
  its inline style sets only `background`. Give it size in YOUR surface (inline
  width/height/border-radius — the sibling `.scrutinyDot` precedent is 5×5). Pin the
  MECHANISM in t1-canvas (assert the dot element's inline/style size properties are
  present and non-zero) and state the honest boundary in the test comment: jsdom has no
  layout — the rendered-size proof is V's browser QA (t_187bbd93). Do NOT touch
  globals.css (not your surface).
- **B2 — cell T1-C2-5 verbatim:** the `data-review` mapping made TOTAL over
  `agree | dispute | cannot-assess` (fourth rendered value per the cell; the fold was
  REFUSED — a completed cannot-assess is a recorded finding, not a gap). Widen the
  `v2uiFixtures.ts` review helper BOUND TO `NodeReview["outcome"]` — not a hand-copied
  union (the hand-copy is WHY no RED existed). RED-proof per the cell: a cannot-assess
  fixture under the OLD ternary → the collision the reviewer measured → GREEN under the
  new arm.
- **B3 — model-identity palette off stance/wrong-maker tokens.** Bind each maker to its
  OWN `--m-*` token (`--m-grok`/`--m-default` exist unused; openai must NOT be
  `--pro-line`; xai/alibaba must not share `--m-gemini`; mistral not `--m-gpt`). If a
  maker has no dedicated token, `--m-default` is the honest fallback — never a stance
  token. Mutant: whole-palette-collapse (the reviewer's MH) must go RED under your new
  pin (add one: assert ≥N distinct resolved tokens across the rendered model dots, or
  per-maker attribute→token pairs).
- **N4 — cell T1-C2-6 verbatim:** root stance binds `--line-strong`; the stance ternary
  made exhaustive over the four declared values; RED-proof per the cell.
- **N2 fold — pin the bezel rim:** the shell's `padding: 4` is the double bezel's only
  visible feature; RM1a (padding→0) ships one bezel all-green today. Assert the shell
  wrapper's inline padding (or equivalent inset mechanism) in t1-canvas; reproduce RM1a
  → RED → restore.
- **N5 fold — restore `--surface-sunken`** on empty/abandoned/failed card fills (PLAN
  mandated `--core` for the BEZEL, not the deletion of the state surface) + one pin
  (state fill ≠ healthy fill at the token level).
- **N6 fold — one line:** DebateMap hub ring stroke `--text-strong` → `--line-strong`.

## 2. Refutation duty (each reproduced then reverted; SHA-256 pairs; apply-patch only)
1. Old ternary restored (B2) → cannot-assess collision RED. 2. Palette collapsed onto
one token (MH) → RED. 3. Root arm removed (falls to catch-all) → T1-C2-6 RED.
4. RM1a padding→0 → rim pin RED. 5. Sunken fill → `--core` (N5 regression) → RED.
6. Dot size removed (B1 regression) → mechanism pin RED. 7. One NEIGHBOR control → GREEN.

## 3. Acceptance at handoff (worst of three)
1. Row-8 verify command AS AMENDED (12 files), verbatim from dispatch-order, 3x — the
   four added files were pre-verified green at dispatch (4 files / 64 tests).
2. ADR-006 line-agnostic gate (TS2322 ×1 @1490, TS2882 ×1, residual 0). 3. ADR-001
   scoped oracle over your product files: 0 — AND, per N7's lesson, run its
   discrimination proof (plant one literal, expect nonzero, remove) so the 0 is proven
   live. 4. `pnpm exec vitest run tests/render` green. 5. Root typecheck 0. 6. Mutant
   table per §2 with SHA pairs. 7. Scope proof via apply-patch ledger (NO git commands).

## 4. File contract (writes — exactly these)
`apps/ui/components/DebateCanvas.tsx` · `DebateMap.tsx` · `ModelPresentation.tsx` ·
`apps/ui/lib/scrutiny.ts` (only if B3/N5 touch it) · `apps/ui/lib/debatePresentation.ts`
(only if B3 touches it) · `tests/render/t1-canvas.test.tsx` (card-anatomy block) ·
`tests/support/v2uiFixtures.ts` (review-helper type ONLY) ·
`.hermes/TOOLING-TRAPS.md` (append-only, if you hit a new trap) ·
`.hermes/reports/ui-overhaul/agent-reports/CODE-T1C2-codex.md` ("RW1" append) · board
comments on t_ff92db49. NO git commands.
Dirt manifest: product-side — `web/app/public/debate/[id]/page.tsx` (V's), untracked
GPT-ORCH-HANDOFF.md + ui_designs HTML; PLUS the `.hermes/` subtree as a declared-dirty
class. PARALLEL LANE LIVE: ARCH-01-AM12b writes `docs/missions/**` + ADRs — none of it
yours; your cells (T1-C2-5/6) are FROZEN for this round and AM12b is barred from row 8.

## 5. Handoff
Final board comment on t_ff92db49 (LAST write — freeze law): `REWORK READY FOR HERMES
REVIEW` + per-blocker/per-fold RED→GREEN + §3 outputs + mutant table + `SKILLS LOADED:`
+ `comments read through:`. Rounds used after this: 1 of 3.
Return control at that handoff, a genuine blocker, or an IMPORTANT OPERATION, but keep
the unfinished goal/session alive and resumable. Silence is normal; unchanged state
needs no message. Termination requires the spine's goal-specific FULLY DONE condition.
