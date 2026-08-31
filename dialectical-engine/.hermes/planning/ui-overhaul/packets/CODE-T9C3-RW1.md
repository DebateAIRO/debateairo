# CODE-T9C3-RW1 — rework round 1 of 3 on Wave 0 (ticket t_4ccac5c4)

You are the same codex seat that shipped 55b18ee. The Opus 5 blind review returned
**REWORK: 1 blocking + 3 assertion gaps in files you own.** Your code was confirmed correct
on every axis the reviewer could measure (token fidelity exact, RED genuine, ADR-002
conformance character-for-character) — the blocking defect traces to ADR-002 itself, which
has now been amended. This round is four fixes, all inside your existing file contract.

## 0. Read order
1. This packet.
2. The verdict: `hermes kanban --board ui-overhaul show t_4ccac5c4` (comment dated 20:57).
3. Amended `docs/missions/ui-overhaul/architecture/ADR-002-mode-mechanism.md` (changelog AM2).
4. Amended `docs/missions/ui-overhaul/architecture/ADR-001-token-surface.md` (changelog AM2).
5. `docs/missions/ui-overhaul/slices/T9/SPEC.md` **R3** ("Mode toggle present" — the mode
   toggle's ground truth is R3; earlier packets said R7/R8, that was a packet defect, N4).

Skills floor (same as your first round): test-driven-development,
verification-before-completion, systematic-debugging, receiving-code-review, plus the
heartbeat worker contract. Open your handoff with `SKILLS LOADED: <list>`.

## 1. The four fixes

### F-B1 (BLOCKING) — ModeToggle does not compile under @types/react 19.2.18
`apps/ui/components/ModeToggle.tsx:7` — `export function ModeToggle(): JSX.Element {`
fails `TS2503: Cannot find namespace 'JSX'` (React 19 removed the global namespace).
RED first: run `pnpm exec tsc --noEmit -p apps/ui/tsconfig.json` and see TS2503 on that line.
Fix to the amended ADR-002 contract, verbatim (the import line is PART of the contract):
```tsx
"use client";
import type { JSX } from "react";

export type Mode = "terracotta" | "chamber";
export function ModeToggle(): JSX.Element;
```
GREEN: the workspace tsc command passes the 0-new gate in §4 (it currently returns exactly 1,
and that 1 is this error — verified by ARCH and re-verified by the orchestrator at 21:2x).

### F-N1 — the no-flash guard's POSITION is unpinned (reviewer mutant M1 stayed green)
`tests/unit/t9-mode-tokens.test.ts:442` pins string order (`<head>` before `{children}`),
not script placement. Reviewer moved the entire guard `<script>` to the END of `<body>` and
all 11 tests stayed green — the flash ships unnoticed.
RED first: reproduce M1 (empty `<head></head>`, guard after `{children}` in
`apps/ui/app/layout.tsx`), run acceptance, watch it stay green. Then add an assertion that
the guard sits INSIDE `<head>` (e.g. `source.indexOf("dangerouslySetInnerHTML") <
source.indexOf("</head>")` or stronger), watch M1 go RED, revert M1, watch GREEN.

### F-N2 — the oracle exclusion window was line-numbered and 85 lines stale (mutant M2 green)
The 1–199 line exclusion exempted lines 115–199 for no reason (token blocks end at 114); a
magenta literal at line 150 shipped fully green. ADR-001 is amended: the exclusion boundary
is now SYNTAX-BOUND. Implement the amended contract in the test's mirror guard, verbatim
(from ADR-001 §"The oracle pattern (corrected)" — the helper THROWS, never falls back):
```ts
/** Last line of globals.css inside the token blocks (1-indexed, inclusive). */
function tokenBlockBoundary(css: string): number {
  const lines = css.split("\n");
  const start = lines.findIndex((l) => /^html\[data-mode="chamber"\]\s*\{/.test(l));
  if (start === -1) throw new Error("chamber token block not found in globals.css");
  const end = lines.findIndex((l, i) => i > start && /^\}/.test(l));
  if (end === -1) throw new Error("chamber token block is not closed");
  return end + 1;
}
```
The per-line skip becomes
`if (path === globalsPath && lineNumber <= tokenBlockBoundary(css)) continue;`
replacing the current `index < 199`. No fixed line number may remain in the test.
(Current computed boundary is 114; do NOT hard-code 114 — that repeats the defect.)
RED first: reproduce M2 (`.appShell { background: #FF00FF; }` inserted between the end of the
chamber block and the old line 199), watch current acceptance stay green; apply the fix,
watch M2 go RED; revert M2, GREEN.

### F-N3 — suppressHydrationWarning is load-bearing and pinned by nothing (mutant M3 green)
ADR-002 requires it on `<html>` and `<body>`; removing it from `<html>` kept acceptance and
the render suite green, and in the product every returning Chamber reader takes a hydration
mismatch on the root element.
RED first: reproduce M3 (delete the attribute from `<html>` in layout.tsx), watch tests stay
green; add an assertion pinning `suppressHydrationWarning` on the `<html>` element in
layout source; watch M3 go RED; revert M3, GREEN.

## 2. Laws for this round
- Same-session rework: you fix your own work, in your original session, in the main tree.
- Reproduce-first is mandatory per finding (the REDs in §1 — each mutant applied, observed
  green-when-it-should-be-red, then made red by your new assertion, then REVERTED).
- Mutants M1/M2/M3 are TEMPORARY: every one reverted before handoff; `git status` at handoff
  shows only your contracted files modified (plus the known pre-existing PDA-lane
  `web/app/public/debate/[id]/page.tsx` dirt, which you never touch).
- Placement law (new, from this review): for any assertion whose property is "X happens
  before Y" or "X is present at Z", the refutation mutant is a MOVE or REMOVE, not a value
  edit. Your new assertions in this round are exactly that class.
- No git commands. No pushes. The orchestrator commits after mechanical verification.

## 3. File contract (writes)
- `apps/ui/components/ModeToggle.tsx` — F-B1 only.
- `tests/unit/t9-mode-tokens.test.ts` — F-N1, F-N2, F-N3 assertions.
- `apps/ui/app/layout.tsx` — ONLY transient mutant apply/revert; net diff at handoff MUST be
  empty for this file.
- `.hermes/reports/ui-overhaul/agent-reports/CODE-T9C3-codex.md` — append an "RW1" section
  (what the review taught you, honest lines).
- Board comments on t_4ccac5c4. Nothing else.

## 4. Acceptance (all must hold at handoff; run each 3x where marked, worst run counts)
1. `pnpm exec vitest run tests/unit/t9-mode-tokens.test.ts tests/unit/pda-s03-keyboard-accessibility.test.ts`
   — all tests pass, 3x, including your NEW assertions (expect >11 total now).
2. Workspace compile gate (amended ADR-006 law), 0-new against the named baseline, verbatim:
```sh
pnpm exec tsc --noEmit -p apps/ui/tsconfig.json 2>&1 \
  | grep -E 'error TS' \
  | grep -v -e 'app/debate/\[id\]/DebatePageClient\.tsx(1488,11): error TS2322' \
          -e 'app/layout\.tsx(3,8): error TS2882' \
  | tee /dev/stderr \
  | wc -l          # required: 0
```
The TWO baselined errors are pre-existing and NOT yours to fix (tickets t_d9066400 and the
css.d.ts routing ticket). Before your fix this command prints 1 (your B1); after, 0.
3. Root `pnpm run typecheck` still exits 0.
4. Amended ADR-001 wave-0 oracle (syntax-bound form from the ADR) returns 0 over your four
   product files.
5. `pnpm exec vitest run tests/render` — 18 files, 78 tests, all green (no standing-suite
   regression).
6. Each of M1/M2/M3 demonstrably RED under your new assertions (paste the three red runs in
   your handoff), then reverted.

## 5. Handoff
Final board comment on t_4ccac5c4 (your LAST write — freeze law, wait for nothing after it):
`REWORK READY FOR HERMES REVIEW` + per-finding F-B1/F-N1/F-N2/F-N3 one-liners (fix + RED
evidence), the §4 gate outputs, `SKILLS LOADED: <list>`, and
`comments read through: <timestamp>`.
Return control at that handoff, a genuine blocker, or an IMPORTANT OPERATION, but keep the
unfinished goal/session alive and resumable. Silence is normal; unchanged state needs no
message. Termination requires the spine's goal-specific FULLY DONE condition.
