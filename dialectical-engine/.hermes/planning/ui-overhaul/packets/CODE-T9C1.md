# CODE-T9C1 — Wave 1, cluster T9-C1: anonymous `/` vs signed-in `/` + landing skeleton

You are a fresh codex coding seat for the ui-overhaul mission (board `ui-overhaul`,
ticket **t_4487f9b1**, authority marker on the ticket). Wave 0 (design tokens, fonts, mode
mechanism, `ModeToggle`) is merged-ready at commit 77441de — you build ON it. T3-C1 runs
AFTER you and edits `apps/ui/app/page.tsx` too: your work is serialized first; finish clean.

## 0. Read order (all paths relative to repo root, your cwd)
1. This packet, fully.
2. `docs/missions/ui-overhaul/architecture/dispatch-order.md` — row 2 (T9-C1: your writes +
   verify command) and the §"T9-C1 additional acceptance — CH1" block (row T9-C1-3 + V QA).
3. `docs/missions/ui-overhaul/slices/T9/SPEC.md` — R1, R2, R3 and the S1–S6 surface table.
4. `docs/missions/ui-overhaul/slices/T9/PLAN.md` — the T9-C1 section (rows T9-C1-1, T9-C1-2
   + the HOW block) and the "known surviving mutant" table near the end (T9-C1 row).
5. `docs/missions/ui-overhaul/architecture/ADR-003-landing-route-split.md` (the mechanism),
   `ADR-002-mode-mechanism.md` (ModeToggle contract INCLUDING the `import type { JSX } from
   "react"` law), `ADR-001-token-surface.md` (colour-literal law), `ADR-006-ui-test-contract.md`
   (the canonical compile gate).
6. `.hermes/TOOLING-TRAPS.md` — rg absence, tee-in-sandbox, dual-compiler notes apply to you.

Skills floor: heartbeat-protocol + heartbeat-worker (repo copies), superpowers:
test-driven-development, verification-before-completion, systematic-debugging,
receiving-code-review. Open every board write with `SKILLS LOADED: <list>`. Post a CLAIM
comment on your ticket before coding (worker/session id, plan, comments read through).

## 1. The charge (three acceptance rows, verbatim sources rule)
- **T9-C1-1 (R1):** logged-out `/` renders the landing; the document contains the exact hero
  headline `Find the weakest claim in your own argument.`
- **T9-C1-2 (R2):** signed-in `/` keeps the library surface: includes `Your debates` or
  `+ New debate` AND excludes the hero headline as primary body. (Pre-verified satisfiable
  today: `+ New debate` ships in `apps/ui/components/TopBar.tsx:85`, which renders on `/`.)
- **T9-C1-3 (R3, dispatch-order §CH1):** the anonymous `/` document contains an element
  carrying `data-mode-toggle` whose accessible name matches
  `/Switch to (Chamber|Terracotta) mode/`. Glyph-only = RED; import-only = RED — assert the
  RENDERED anonymous document.
- **T9-C1-4 (pin migration — AM5 ownership law, adjudicated on t_707a9ac6):** you now OWN
  `tests/unit/pda-s03-keyboard-accessibility.test.ts` because your charge changes the surface
  it reads. All 5 cases currently render anonymous `/` via ONE module-level next/headers mock
  (`get: () => undefined`) and assert the library markup. The migration is:
  (a) for 4 of 5 cases — a MOCK CHANGE, not an assertion rewrite: point them at a
  session-cookie render (`USER_TOKEN_COOKIE = "__Host-debateai-session"`, serverApi.ts:14;
  add `listDebatesPageServer` to the existing `@/lib/serverApi` mock) — the library
  assertions then hold VERBATIM against signed-in `/`, whose markup you do not touch;
  (b) the 5th (`.tabEmptyHint`, anonymous-only) re-points to the route-split property.
  Your anonymous pins are BOUNDED to: absence of the library nav/hint on anonymous `/`, the
  exact hero headline, and the mode control's keyboard reachability — nav labels are C2's,
  content is C4's. Measured baseline before your change: 1 file, 5/5 green.

## 2. The mechanism (ADR-003 / PLAN HOW — implement, do not redesign)
- `apps/ui/app/page.tsx`: after the existing first-statement cookie read, add ONE early
  return: `if (token === null) return <LandingPage />;`. Everything below stays untouched.
  Do NOT import `AuthGate` into page.tsx (R1 forbids login-replacing-landing); add a SOURCE
  assertion in your test that page.tsx does not reference AuthGate.
- `apps/ui/components/landing/LandingPage.tsx`: SERVER component (no `"use client"`), so the
  landing ships in initial HTML and `renderToStaticMarkup` can assert it. Composes
  `LandingChrome`, `LandingHero`, `LandingSample`, `LandingMethod`, `LandingPricing` — in
  that order.
- The four non-chrome children are EMPTY STUBS this cluster (content is T9-C4's) — except
  `LandingHero`, which must render the exact T9-C1-1 headline (your own acceptance forces
  it). `LandingChrome` gets the `ModeToggle` mount (T9-C1-3) — mount only; labels/CTAs are
  T9-C2's.
- **JSX law (Wave 0's blocking finding, applied forward):** every new TSX file that
  annotates `JSX.Element` carries `import type { JSX } from "react"` (ADR-002 amended
  contract). @types/react 19 has no global JSX namespace.
- **Colour law:** zero colour literals in your product files — tokens only (ADR-001; the
  oracle in §4 enforces it).
- **s8 constraint (AM5):** `tests/architecture/s8-publication-contract.test.ts` slices
  `app/page.tsx` between `published.items.map` and `</article>` — your split may move NO
  JSX out of page.tsx (the early return ADDS a branch; it relocates nothing). It is in your
  verify command; if it goes red you moved something you must not.
- **Mount rule (AM5, defuses two absence-clause security pins):** every ModeToggle mount is
  `<ModeToggle />` and NOTHING else — all storage access stays inside
  `components/ModeToggle.tsx`. `pol01-policy.test.ts:92` forbids localStorage references in
  DebatePageClient; `auth-front-door-parity.test.ts:80` forbids them in LoginFlow/SignUpFlow.
  Those two tests assert ABSENCE: if either goes red, fix your code — never the test.

## 3. TDD + refutation duty
- CREATE `tests/render/t9-landing.test.tsx` with per-cluster structure: three top-level
  describes — `T9-C1 route split & chrome` (yours), `T9-C2 chrome labels & CTAs` (empty
  placeholder), `T9-C4 landing content` (empty placeholder) — so C2/C4 later own their
  blocks without touching yours (test-migration.md splits this file by cluster).
- RED first: write your assertions before the components exist; paste the RED run.
- PLAN's own "known surviving mutant" for T9-C1 is *"right strings, wrong section ORDER —
  no step asserts DOM order on the landing"*. Your refutation duty: add a DOM-order
  assertion (Chrome → Hero → Sample → Method → Pricing in document order), then BUILD that
  mutant (swap two sections), prove RED, revert, prove GREEN.
- Placement law (this mission's REV3): for any positional/boundary assertion, the required
  mutants are MOVE/REMOVE/REFORMAT, not value edits. Run at least: ModeToggle mount removed
  (T9-C1-3 RED), early return moved below the library render (T9-C1-1 RED or the source
  assertion RED), plus one neighbor control (a benign edit that must stay GREEN) — all
  reverted before handoff.

## 4. Acceptance at handoff (paste outputs; worst of three on the vitest runs)
1. Cluster verify command (dispatch-order row 2 post-AM5, verbatim):
   `pnpm exec vitest run tests/architecture/auth-front-door-parity.test.ts tests/architecture/s8-publication-contract.test.ts tests/render/t9-landing.test.tsx tests/unit/pda-s03-keyboard-accessibility.test.ts tests/unit/v2ui-pages.test.ts` — 3x, all green.
   (Orchestrator pre-verified the four standing files at 4 passed / 54 tests before your
   dispatch; t9-landing is yours to create.)
2. ADR-006 canonical compile gate FROM REPO ROOT (verbatim from the ADR; two named baselined
   errors, tickets t_d9066400/t_4e59ee34; the tee /dev/stderr warning in your sandbox is
   known and harmless — use the capture-first variant and say so): required 0.
3. ADR-001 shell oracle (AM3 range-pair form, from the ADR) scoped to YOUR product files:
   residual 0.
4. `pnpm exec vitest run tests/render` — the standing suite plus your new file, all green.
5. Root `pnpm run typecheck`: exit 0.
6. Mutant evidence per §3 (RED runs + reverts).

## 5. File contract (writes — exactly these, nothing else; dispatch-order row 2 post-AM4, verbatim)
`apps/ui/app/page.tsx` · `apps/ui/components/landing/LandingPage.tsx` ·
`apps/ui/components/landing/LandingChrome.tsx` (the `ModeToggle` mount only) ·
`apps/ui/components/landing/LandingHero.tsx` · `LandingSample.tsx` · `LandingMethod.tsx` ·
`LandingPricing.tsx` (**empty stubs only — content is T9-C4's**; exception per the stub
rule: `LandingHero` renders exactly the T9-C1-1 headline and nothing more — adding further
copy is a violation in the other direction, owned by T9-C4) ·
`tests/render/t9-landing.test.tsx` ·
`tests/unit/pda-s03-keyboard-accessibility.test.ts` (the §1 T9-C1-4 migration ONLY — AM5
ownership law)
Plus: `.hermes/reports/ui-overhaul/agent-reports/CODE-T9C1-codex.md` (self-report, 10–20
honest lines: went well / fought me / would change — required before FULLY DONE) and board
comments on your ticket. NO git commands (the orchestrator commits after its mechanical
gate). Transient mutant surfaces: your own files only; anything else you touch for a mutant
must end byte-identical (prove by SHA-256 like RW2 did).
Pre-existing dirt manifest (not yours, do not touch, do not count):
`web/app/public/debate/[id]/page.tsx` (modified, PDA lane).

## 6. Handoff
Final board comment on your ticket (your LAST write — freeze law; the orchestrator waits for
your process exit + this comment): `READY FOR PEER REVIEW` + per-row evidence (T9-C1-1/2/3
RED→GREEN), §4 gate outputs, mutant table, `SKILLS LOADED: <list>`,
`comments read through: <timestamp>`. Rework rounds: max 3, same session.
Return control at that handoff, a genuine blocker, or an IMPORTANT OPERATION, but keep the
unfinished goal/session alive and resumable. Silence is normal; unchanged state needs no
message. Termination requires the spine's goal-specific FULLY DONE condition.
