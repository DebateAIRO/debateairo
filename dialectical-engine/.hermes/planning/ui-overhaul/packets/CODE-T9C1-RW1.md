# CODE-T9C1-RW1 — rework round 1 of 3 (tickets t_4487f9b1 + t_bc667f20 + t_523e74e7)

Same codex seat, same session (01a05966). The fresh blind review CONFIRMED your product code
("correct and minimal"), your migration byte-fidelity, and all four of your strongest mutants
rebuilt independently. One blocking finding — in the PIN, not the product — plus two class
members and one precision note. The reviewer verified the fix before filing it.

## 0. Read order
1. This packet. 2. The verdict on t_4487f9b1 (00:26) — B1, the class sweep, M5/M9/M10, N5.

## 1. F-B1 — scope the CH1 pin to the landing chrome subtree
`tests/render/t9-landing.test.tsx:104` queries the WHOLE document for `[data-mode-toggle]`.
`layout.tsx:44` renders `<TopBar />` on every non-debate route, and T3-C1 (next cluster) is
CONTRACTED to mount a toggle in TopBar — reviewer mutant M9 (TopBar mount simulated + your
LandingChrome mount deleted) left your suite 5/5 GREEN. The pin dies the moment T3-C1 lands.
Fix (reviewer-verified: 5/5 on correct code, RED on mount-relocation M5):
`const toggle = document.querySelector('[data-landing-section="chrome"] [data-mode-toggle]');`
Add the `data-landing-section` attributes to your landing sections if not already present —
they are inside your write surface. Reproduce-first: rebuild M9 (add a fake TopBar toggle
via the TopBar the harness already renders — e.g. temporarily patch TopBar in a transient
mutant — AND remove your LandingChrome mount), show current pin GREEN (the defect), apply
the scoped query, show M9 RED, revert the mutant, GREEN.

## 2. Class members (same round, same file)
- The signed-in case's `+ New debate` assertion is vacuous (TopBar emits it on EVERY route —
  reviewer M10). Keep it if you wish, but the DISCRIMINATOR must be
  `.sectionHead[aria-label="Debate library"]` (already present) — add a comment marking the
  discriminating assertion, or drop the vacuous one.
- Hero-headline assertions via `document.body.textContent` (t9-landing:83, and your migrated
  pda-s03 case): scope to the hero section subtree. Same convention:
  `[data-landing-section="hero"]`.
- Absence assertions stay document-wide (stronger over a superset — reviewer adjudicated).

## 3. N5 (precision, t_523e74e7)
Your handoff bullet said T9-C1-2 was RED at RED time; your own TDD frame correctly lists it
among the 54 passers. In THIS handoff, state per-row RED status exactly as the frame has it.

## 4. Acceptance at handoff
1. Five-file cluster command 3x worst-run — all green (59/59 or new count if you split
   assertions). 2. M9 rebuilt: RED under scoped pin, reverted. 3. M5 (mount relocated to
   LandingHero): RED. 4. Render suite 19/83 green. 5. Canonical compile gate FROM
   /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine (the pnpm workspace root —
   NOT git rev-parse toplevel, which resolves to the parent and is being fixed by ARCH): 0-new
   over the two named baselines. 6. All transient mutants SHA-restored (TopBar.tsx included
   if you used it for M9 — byte-identical at handoff).

## 5. File contract
Writes: `tests/render/t9-landing.test.tsx`, `tests/unit/pda-s03-keyboard-accessibility.test.ts`
(hero-scope only), `apps/ui/components/landing/*.tsx` (ONLY to add data-landing-section
attributes if missing). Transient: TopBar.tsx for M9 (net zero, SHA-proof). Self-report
append "RW1". Board comments on t_4487f9b1. No git.

## 6. Handoff
Final board comment on t_4487f9b1 (LAST write, freeze law): `REWORK READY FOR HERMES REVIEW`
+ F-B1/class/N5 evidence, §4 outputs, `SKILLS LOADED: <list>`, `comments read through: <ts>`.
Return control at that handoff, a genuine blocker, or an IMPORTANT OPERATION, but keep the
unfinished goal/session alive and resumable. Silence is normal; unchanged state needs no
message. Termination requires the spine's goal-specific FULLY DONE condition.
