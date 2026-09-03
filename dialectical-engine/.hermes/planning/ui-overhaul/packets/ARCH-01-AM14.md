# ARCH-01-AM14 — fidelity cells: the design becomes the acceptance (ticket t_5864f48f)

Same ARCH session (bb69b040). V reviewed the live landing tonight and found the design
compressed away twice: the chrome bar shipped UNSTYLED (LandingChrome.tsx carries zero
classNames; globals.css has zero chrome rules), and the sample cards shipped as a token
checklist (no claim prose, no model pills, no glyphs, no tints, no turn counters, flat
grid instead of the deck). Every gate was green because every pin asserted strings and
attributes. **F11 (t_16d44323) predicted this at REQ intake — "design elements in no
SPEC" — and was never routed. Route it through this amendment.**

## V's rulings this session (verbatim intent, binding)
1. "This pill component can be made generic by the way" — ONE `ModelPill` component:
   maker-tinted dot + `Maker · Family · model-id` (e.g. `Anthropic · Claude ·
   claude-opus-5`), used by the landing sample cards, the debate canvas
   (ModelPresentation already carries the maker→`--m-*` map from T1-C2 RW1 — the pill
   GENERALIZES it, no third vocabulary), and review-by lines.
2. "What is so hard in taking the CSS from one side and strapping it to the next?" —
   the method law for this round: **PORT, do not reinterpret.** The porting source is
   `.hermes/planning/ui-overhaul/design-source.html` (extracted tonight: the design's
   3 style blocks, the template renderer with exact values — stance tab
   `border-radius: 0 0 5px 5px`, pill `999px`, the shadow system — and the card DATA:
   claim prose, authors, reviewers, base/final, turn numbers). Colors tokenize per
   ADR-001 (the palette already matches — wave-0 ported the values); geometry, spacing,
   radii, shadows, composition port as written.

## Charges
1. **FID-1 cell(s) — the landing chrome bar.** Wordmark left, nav center/right, actions
   + ModeToggle right, one horizontal bar per the design source. Machine-checkable half:
   classes exist + real-browser fixture (the T1C2-REV pattern: shipped markup against
   real globals.css in Chromium) asserts the header lays out as one row (children on one
   line, bar height bounded). V-half: final look. LandingChrome.tsx + a bounded
   globals.css write (declare it — globals is a controlled file; enumerate the rules).
2. **FID-2 cell(s) — sample cards, FULL anatomy.** From V's Exhibit A + the design
   source, every element: stance chips WITH glyphs (`↑ PRO`, `↓ CON`, `◆ REASONING`);
   TINTED BASE/FINAL pills; the `ModelPill` (real names from the design data — OpenAI ·
   GPT · gpt-5.6-sol / Anthropic · Claude · claude-opus-5 / Google · Gemini ·
   gemini-3-ultra); **the claim prose VERBATIM from the design data** (this is the card's
   soul and it is entirely absent today); divider; review chip (`REVIEW AGREED BY:` /
   `REVIEW DISPUTED BY:`) + reviewer's ModelPill; `Turn 01..04` counters; the stacked
   deck composition. State which parts are landing-static vs the canvas-shared pill.
   **Write two V-visible DECISIONS rows:** (a) design prose + real third-party model
   names ship verbatim on the landing (V's exhibits are the ruling); (b) the generic
   ModelPill is the single model-identity rendering, both surfaces.
3. **FID-3 spec — the sweep.** Method for a review-class seat to diff EVERY shipped
   surface against the design source in a real browser, producing a per-element gap
   table (so V never finds gap #3). Name what it reads, how it renders, the output form.
   It runs after FID-1/2 land.
4. **FID-4 — one line in the FID worker's contract:** next.config devIndicators off.
5. **The class cure, stated as law:** every VISUAL cell from now on names (a) its
   machine-checkable half — real-browser fixture assertions — and (b) its V-QA half,
   explicitly. A cell with neither is not a visual cell. Add to dispatch-order as the
   FIDELITY LAW; the remaining slices (T5, T3-lists, T4, T6, T7, T8) inherit it BEFORE
   their dispatch.
6. **Root-cause paragraph** (V asked where it went wrong — write it in the changelog):
   the two-step compression (design→SPEC checklist→cell string-assertions), the
   vocabulary law's chilling effect on porting, the token law turning copy into
   uncharged translation, jsdom blindness, and F11 unrouted by the router (orchestrator
   defect, named).

## Bounds
- Writes: `docs/missions/ui-overhaul/architecture/dispatch-order.md` (FID cells +
  changelog "AM14" + fidelity law), `slices/T9/DECISIONS.md` (the two V-visible rows),
  `slices/T9/SPEC.md` is FROZEN — supersede via dispatch cells per AM7/AM10 practice,
  `.hermes/reports/ui-overhaul/agent-reports/ARCH-01-claude.md` ("AM14" append).
  NO product/test/config files; no git.
- Read `design-source.html` yourself — quote exact values into cells (radii, tab
  heights, pill shapes) rather than "per the design".
- AM5 invariant if any Writes column moves (FID-1 adds a globals.css write — declare
  the writer row). Live lane: CODE-T1C2-ADD2 runs on scrutiny/DebateMap/t1-canvas:479 —
  none of your files.

## Handoff
Final board comment on t_5864f48f (LAST write — freeze law): `AMENDMENT COMPLETE: AM14 —
<per charge>` + the FID cells verbatim + the fidelity law text + invariant +
`SKILLS LOADED:` + `comments read through:`.
Return control at that handoff, a genuine blocker, or an IMPORTANT OPERATION, but keep
the unfinished goal/session alive and resumable. Silence is normal; unchanged state
needs no message. Termination requires the spine's goal-specific FULLY DONE condition.
