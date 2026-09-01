# CODE-T9C4 — Wave 2, cluster T9-C4: method ledger, sample cards, placeholders, hero content

You are a fresh codex coding seat for mission `ui-overhaul` (board `ui-overhaul`, ticket
t_b7c114a3, authority marker on the ticket). The landing skeleton exists (T9-C1) and its
chrome is filled (T9-C2). You fill the four content stubs. Two parallel light seats are
working OTHER files (`tests/unit/t9-return-path.test.ts` and `docs/missions/**`) — neither
overlaps your surface; do not touch theirs.

## Supersessions in force
- The four landing files EXIST as stubs (AM4 stub rule): you FILL `LandingHero.tsx`
  (currently exactly the headline), `LandingSample.tsx`, `LandingMethod.tsx`,
  `LandingPricing.tsx` — do not recreate; PLAN HOW's "Create" predates AM4.
- Cells T9-C4-5 and T9-C4-6 were ADDED by AM8 (dispatch-order row 5) — the hero CTA pair
  and the method-close tertiary CTA are YOURS, with the ADR-004 auth-entry contract.
- The AM6/AM7 convention binds: PRESENCE assertions scope to the owning
  `[data-landing-section]` subtree on the REAL anonymous render; ABSENCE document-wide.

## 0. Read order
1. This packet, fully.
2. `docs/missions/ui-overhaul/architecture/dispatch-order.md` — row 5 (writes + verify
   command + cells T9-C4-5/6) and §"Landing query convention".
3. `docs/missions/ui-overhaul/slices/T9/SPEC.md` — R6, R7, R8; rows S2–S5; **§Copy in
   full** (every string is a binding literal).
4. `docs/missions/ui-overhaul/slices/T9/PLAN.md` — T9-C4 section (cells 1–4 + HOW) and
   `slices/T9/DECISIONS.md` (the vocabulary mapping V closed — `round`→`debate`,
   `joint`→`claim`, `bench`→`the graph`; the artboards' own words must NOT be copied
   through).
5. `ADR-002` (JSX law; ModeToggle is the landing's ONLY client island), `ADR-001` (colour
   law — tokens only), `ADR-006` (fail-loud canonical gate from the workspace root),
   `ADR-004` §"Landing CTA" (`/login?next=%2Fnew`).
6. `.hermes/TOOLING-TRAPS.md`.

Skills floor as every coding seat (heartbeat-protocol, heartbeat-worker, TDD,
verification-before-completion, systematic-debugging, receiving-code-review). `SKILLS
LOADED:` opens every board write. CLAIM comment before coding.

## 1. The charge (cells verbatim-sourced; RED first on each; all on the REAL anonymous render)
- **T9-C4-1 (R7):** method step titles `Models argue`, `They review each other`,
  `You challenge`, `Verdict with receipts` — scoped to `[data-landing-section="method"]`.
- **T9-C4-2 (R6):** sample block full anatomy in the sample region: stance/type chip
  (`PRO`/`CON`/`REASONING`), `BASE`, `FINAL`, a model attribution line (contains `·`), and
  `REVIEW AGREED BY:` or `REVIEW DISPUTED BY:` — BASE/FINAL alone = RED.
- **T9-C4-3 (R8):** `[PLACEHOLDER] debates argued this week` AND the pricing strip's
  literal `First [PLACEHOLDER] debates free, then [PLACEHOLDER] per month. Cancel
  whenever.` — a live counter = RED (V closed this).
- **T9-C4-4 (R7/copy):** the binding paragraphs, exact: hero body containing `softest
  point in your reasoning`; the close `weakest claim` + `Four steps, then you do it again
  tomorrow.`; the four method bodies verbatim (`Five frontier models build the tree — pro,
  con, and the reasoning that binds them.` / `Every claim is cross-reviewed by a rival
  model: agree or dispute, on the record.` / `Flag any sentence; the graph spawns a focused
  rebuttal where you pointed.` / `Scores, condition marks, and replay handles — every
  number traces to its source.`).
- **T9-C4-5 (AM8):** hero contains BOTH `Start a debate` AND `Read a scored transcript`,
  scoped to the hero subtree; the hero primary carries `/login?next=%2Fnew` — `#` or bare
  `/login` = RED.
- **T9-C4-6 (AM8):** the method-close tertiary `Start a debate`, same auth-entry contract,
  scoped to the method subtree.

## 2. Mechanism (PLAN HOW — implement, do not redesign)
- All four files stay SERVER components; the landing's only client island remains
  `<ModeToggle />` (which lives in LandingChrome — you add NO client code).
- Copy is VERBATIM from SPEC §Copy — never paraphrased, never the artboards' vocabulary.
- Sample cards use the canvas card's token/class vocabulary (`data-bezel="shell"|"core"`,
  `data-stance`, bezel classes) but are STATIC — do NOT import DebateCanvas or any scoring/
  data component onto the anonymous route.
- `[PLACEHOLDER]` is a literal in JSX. No counter, no env lookup, no price feed.
- Type scale uses the existing tokens (`--t-hero` clamp etc.) — zero colour literals, zero
  new tokens (ADR-001; the oracle enforces).
- Preserve every `data-landing-section` attribute; the hero keeps its exact headline.
- Tests: your cells go INSIDE the `T9-C4` describe block of `tests/render/t9-landing.test.tsx`
  (T9-C1/C2 blocks are not yours). The marker-order test pins the five-section list — your
  fills must not add or remove `data-landing-section` elements (nested sub-markers = RED on
  the order test; the REV2 probe proved that pin fires).

## 3. Refutation duty (reproduce → revert, SHA proofs)
1. Hero CTA `href="#"` → T9-C4-5 RED. 2. Method-close CTA removed → T9-C4-6 RED.
3. One method body paraphrased (swap a word) → T9-C4-4 RED (verbatim law is real).
4. `[PLACEHOLDER]` replaced by a number → T9-C4-3 RED.
5. `REVIEW AGREED BY:` line removed → T9-C4-2 RED (anatomy beyond BASE/FINAL is pinned).
6. One label MOVED across subtrees (method title into pricing) → scoped pin RED.
7. Neighbor control (benign: reorder two sample cards) → GREEN.

## 4. Acceptance at handoff (worst of three)
1. Row-5 verify command verbatim from dispatch-order, 3x, all green.
2. ADR-006 fail-loud canonical gate from the workspace root: 0-new (two named baselines).
3. AM3 range-pair oracle over your four product files: residual 0.
4. `pnpm exec vitest run tests/render` green. 5. Root typecheck 0. 6. Mutant table per §3.

## 5. File contract (writes — exactly these)
`apps/ui/components/landing/LandingHero.tsx` · `LandingSample.tsx` · `LandingMethod.tsx` ·
`LandingPricing.tsx` · `tests/render/t9-landing.test.tsx` (T9-C4 block only) ·
`.hermes/reports/ui-overhaul/agent-reports/CODE-T9C4-codex.md` (self-report before FULLY
DONE) · board comments on t_b7c114a3. NO git commands.
Pre-existing-dirt manifest (generated at dispatch): `web/app/public/debate/[id]/page.tsx`
(modified) · untracked `docs/missions/2026-08-21-docker-hatchet/GPT-ORCH-HANDOFF.md` ·
untracked `ui_designs/DebateAI Design Document.html` · live parallel lanes may touch
`tests/unit/t9-return-path.test.ts` and `docs/missions/**` — all NOT yours.

## 6. Handoff
Final board comment on t_b7c114a3 (LAST write — freeze law): `READY FOR PEER REVIEW` +
per-cell RED→GREEN + §4 outputs + mutant table + `SKILLS LOADED:` + `comments read
through:`. Rework rounds: max 3, same session.
Return control at that handoff, a genuine blocker, or an IMPORTANT OPERATION, but keep the
unfinished goal/session alive and resumable. Silence is normal; unchanged state needs no
message. Termination requires the spine's goal-specific FULLY DONE condition.
