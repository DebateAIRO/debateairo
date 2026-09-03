# CODE-T3C1 — Wave 1, cluster T3-C1: signed-in library chrome + ☾ mount + anonymous TopBar suppression

You are a fresh codex coding seat for mission `ui-overhaul` (board `ui-overhaul`, ticket
**t_9d3f1f2d**, authority marker on the ticket). T9-C1 is merged-ready (commits 3aefb2d +
f017e12): anonymous `/` renders the landing; signed-in `/` keeps the library; landing pins
are scoped to `[data-landing-section]` subtrees. You are the second and last Wave-1 cluster.

## 0. Read order (paths relative to the workspace root, your cwd)
1. This packet, fully.
2. `docs/missions/ui-overhaul/architecture/dispatch-order.md` — row 3 (your writes + the
   10-file verify command), §"Landing query convention (AM6/charge 3)", and the T3-C1-4 cell
   (AM6/charge 2: the two-toggles adjudication — read its WHOLE rationale).
3. `docs/missions/ui-overhaul/slices/T3/SPEC.md` — R1, R2, R8 + the S1–S4 surface table.
4. `docs/missions/ui-overhaul/slices/T3/PLAN.md` — the T3-C1 section (cells + HOW). NOTE:
   its 3-file verification command is SUPERSEDED by dispatch-order row 3's 10-file command.
5. `docs/missions/ui-overhaul/architecture/ADR-002-mode-mechanism.md` (ModeToggle contract,
   JSX import law, the THREE-mount enumeration — yours is the TopBar mount),
   `ADR-001` (colour law + AM3 range-pair oracle), `ADR-006` (canonical compile gate — run
   from the workspace root; it is fail-loud from wrong directories now).
6. `.hermes/TOOLING-TRAPS.md` — rg absent, tee-in-sandbox, dual-compiler notes apply to you.

Skills floor: heartbeat-protocol + heartbeat-worker (repo copies), superpowers:
test-driven-development, verification-before-completion, systematic-debugging,
receiving-code-review. Open every board write with `SKILLS LOADED: <list>`. Post a CLAIM
comment on your ticket before coding.

## 1. The charge (cells verbatim-sourced; RED first on every one)
- **T3-C1-1 (R1):** signed-in `/` shows the library, not the landing: `Your debates` or
  `+ New debate` present AND the hero headline absent.
- **T3-C1-2 (R2):** composer visible: `Type a debatable claim or question…` and
  `Start debate →` present. (Q-04: `Start debate →` here, `Start a debate` on the landing,
  `Start run →` on the form are three DELIBERATELY different strings — do not unify.)
- **T3-C1-3 (R8):** mode toggle present on the signed-in library; toggling flips the
  Terracotta/Chamber marker.
- **T3-C1-4 (AM6 + REV2-N2, all three halves):** the anonymous-`/` TopBar suppression rule —
  in `tests/render/t3-library.test.tsx`, inject globals.css per ADR-006 and assert:
  (a) `getComputedStyle(.topBar).display === "none"` with a `[data-landing-section]` element
  present; (b) `!== "none"` without one; (c) REAL-RENDER premise pin: on the actual
  signed-in render, `document.querySelectorAll("[data-landing-section]").length === 0`.
  (Measured 0 today — probe P1 on t_4487f9b1; your assertion makes it law.)
- **Routed one-liner (t_3c8f699b):** `tests/unit/pda-s03-keyboard-accessibility.test.ts:147`
  — scope the toggle query: `document.querySelector('[data-landing-section="chrome"]
  [data-mode-toggle]')`. One line; everything else in that file stays as T9-C1 left it
  unless your re-anchoring requires a mock update (state any such change explicitly).

## 2. The mechanism (PLAN HOW + AM6 — implement, do not redesign)
- `apps/ui/components/TopBar.tsx`: mount `<ModeToggle />` in `topBarActions` AND in the
  `authTopBar` branch — `<ModeToggle />` and NOTHING else (mount rule: all storage access
  stays inside ModeToggle.tsx; `auth-front-door-parity` and `pol01-policy` assert ABSENCE of
  storage references and if either goes red you fix your code, never the test). Add the
  asker chip beside the existing `⚙` link.
- `apps/ui/app/page.tsx` (library half only, BELOW T9-C1's early return): eyebrow
  `A REASONING INSTRUMENT`, headline `What should we debate?`, existing lede. Copy, not
  structure — `.eyebrow`, `.display`, `.lede` classes already exist and consume tokens.
  The s8 pins slice this file between `published.items.map` and `</article>` — move NO JSX.
- `apps/ui/components/LibraryComposer.tsx`: placeholder `Type a debatable claim or
  question…`, helper `Models argue · you judge`, submit `Start debate →`.
- `apps/ui/app/globals.css`: EXACTLY ONE new rule, verbatim from the T3-C1-4 cell:
  `.appShell:has([data-landing-section]) > .topBar { display: none; }` (with its two-line
  comment). You are the DECLARED second writer of this file, bounded three ways: one named
  rule; the cell fails if your diff contains a second; token blocks untouched. No colour
  literal (neither ADR-001 oracle may move).
- `tests/render/t3-library.test.tsx`: CREATE with two describes — `chrome` (yours) and
  `lists` (empty placeholder, T3-C2's) — so the two clusters never edit the same hunk.
- JSX law: any new TSX annotating `JSX.Element` imports the type from react.

## 3. TDD + refutation duty
- RED first on every cell; paste the RED runs.
- Placement law (MOVE/REMOVE/REFORMAT for positional properties) — required mutants, each
  reproduced then reverted with SHA-256 proof:
  1. ☾ mount REMOVED from topBarActions → T3-C1-3 RED.
  2. The :has() rule REMOVED → T3-C1-4(a) RED.
  3. The :has() rule SELECTOR BROADENED to hide .topBar unconditionally → T3-C1-4(b) RED
     (this is AM6's own stated failure mode — prove your pin catches it).
  4. A `data-landing-section` marker ADDED to signed-in chrome → T3-C1-4(c) RED.
  5. Composer submit label changed → T3-C1-2 RED.
  6. One NEIGHBOR control (benign edit, e.g. reorder TopBar's non-toggle children) → GREEN.
- pda-s03 after your changes: if your re-anchoring adds TopBar to its harness, the scoped
  query (your one-liner) must keep pinning the LANDING mount — state what the harness
  renders either way.

## 4. Acceptance at handoff (paste outputs; worst of three on vitest runs)
1. Cluster verify command (dispatch-order row 3 post-AM5, verbatim — 10 files), 3x:
   `pnpm exec vitest run tests/architecture/s8-publication-contract.test.ts tests/render/auth-flow-integration.test.tsx tests/render/bug03-home-buffer.test.tsx tests/render/pda-s02-honesty-export.test.tsx tests/render/pda-s02-public-page.test.tsx tests/render/pda-s02-public-tree.test.tsx tests/render/pda-s02-scoring-chrome.test.tsx tests/render/t3-library.test.tsx tests/unit/pda-s03-keyboard-accessibility.test.ts tests/unit/s8-publication-ui.test.tsx`
   (Orchestrator pre-verified the nine standing files at 9 passed / 36 tests.)
2. ADR-006 canonical compile gate (fail-loud form, from the workspace root): 0-new over the
   two named baselines.
3. AM3 range-pair oracle over YOUR product files (TopBar.tsx, page.tsx, LibraryComposer.tsx,
   globals.css beyond the token blocks): residual 0.
4. `pnpm exec vitest run tests/render`: all green (expect 20 files after yours lands).
5. Root `pnpm run typecheck`: exit 0.
6. Mutant table per §3 with SHA-256 restore proofs.

## 5. File contract (writes — exactly these, nothing else)
`apps/ui/components/TopBar.tsx` · `apps/ui/app/page.tsx` (library half) ·
`apps/ui/components/LibraryComposer.tsx` · `apps/ui/app/globals.css` (the ONE T3-C1-4 rule) ·
`tests/render/t3-library.test.tsx` · `tests/unit/pda-s03-keyboard-accessibility.test.ts` ·
`tests/architecture/s8-publication-contract.test.ts` (ONLY if re-anchoring forces it — state
why, else untouched) · `.hermes/reports/ui-overhaul/agent-reports/CODE-T3C1-codex.md`
(self-report before FULLY DONE) · board comments on t_9d3f1f2d. NO git commands.
Pre-existing-dirt manifest (not yours): `web/app/public/debate/[id]/page.tsx`.

## 6. Handoff
Final board comment on t_9d3f1f2d (LAST write — freeze law): `READY FOR PEER REVIEW` +
per-cell RED→GREEN evidence + §4 gate outputs + mutant table + `SKILLS LOADED: <list>` +
`comments read through: <timestamp>`. Rework rounds: max 3, same session.
Return control at that handoff, a genuine blocker, or an IMPORTANT OPERATION, but keep the
unfinished goal/session alive and resumable. Silence is normal; unchanged state needs no
message. Termination requires the spine's goal-specific FULLY DONE condition.
