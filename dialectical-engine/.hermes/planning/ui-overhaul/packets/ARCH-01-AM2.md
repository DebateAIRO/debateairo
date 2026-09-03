# ARCH-01-AM2 — micro-amendment 2 (post-review of Wave 0, verdict on t_4ccac5c4)

You are the same ARCH seat (session bb69b040). Ticket: **t_c34a0214**. Board: `ui-overhaul`.
The Opus 5 blind review of Wave 0 (commit 55b18ee) returned REWORK. One blocking and two
non-blocking findings trace to YOUR documents, and one AF-1-class coverage hole needs an
ARCH-owned row. This packet charges you with exactly four amendments. ARCH docs only.

## 0. Read order
1. This packet.
2. The full verdict: `hermes kanban --board ui-overhaul show t_4ccac5c4` (comment dated 20:57).
3. Your current `docs/missions/ui-overhaul/architecture/ADR-002-mode-mechanism.md`,
   `ADR-001-token-surface.md`, `ADR-006-ui-test-contract.md`, `dispatch-order.md`.
4. `docs/missions/ui-overhaul/slices/T9/SPEC.md` — R3 only (FROZEN — read, never edit).

Open with `SKILLS LOADED: <list>` naming the protocol + architecture skills already in your
session. The line is still mandatory on resume.

## 1. The four amendments (scope is closed — these and nothing else)

### A. ADR-002 — your published contract is the source of blocking finding B1
Your contract line literally specifies `export function ModeToggle(): JSX.Element;`.
Installed `@types/react` is 19.2.18: React 19 REMOVED the global `JSX` namespace (it lives at
`React.JSX`). `pnpm exec tsc --noEmit -p apps/ui/tsconfig.json` exits 2 on exactly that line;
`next.config.mjs` has `ignoreBuildErrors: false`, so `next build` is red. The worker obeyed
your ADR faithfully — the ADR is the defect.
**Amend the contract to a form that compiles under @types/react 19.2.18** (reviewer suggested
`import type { JSX } from "react"` or `React.JSX.Element`; the choice is yours — record why in
the ADR changelog). The rework packet will quote your amended line verbatim.

### B. ADR-001 — the exclusion window is 85 lines wider than the region it protects
Your oracle (and its test mirror) exclude `globals.css` lines 1–199. The token blocks end at
line 114. Reviewer mutant M2 planted `.appShell { background: #FF00FF; }` at line 150: both
oracles returned 0, acceptance stayed 11/11 green. Latent hole, currently empty.
**Rebind the exclusion on SYNTAX, not a line number**: everything up to and including the
closing brace of the `html[data-mode="chamber"]` block is exempt; everything after it is
sweepable. Specify the exact computable procedure (e.g. awk/grep finds the boundary line at
run time, then the sweep excludes only up to it) for BOTH the oracle command in the ADR and
the mirrored guard in `tests/unit/t9-mode-tokens.test.ts` (the test edit itself is the rework
worker's; you publish the contract it implements). No fixed line number may remain anywhere.

### C. Compile-gate law — the gate that should have caught B1 does not exist
Root `tsconfig.json` excludes `apps/ui` and `web`, so the packet-mandated "repo-wide"
`pnpm run typecheck` never opened either TSX file Wave 0 wrote (verified via `tsc --listFiles`).
**Amend ADR-006 (and the acceptance defaults in dispatch-order.md) with a compile-gate law:**
- Every acceptance compile gate NAMES the tsconfig it compiles under.
- Every cluster that writes files under `apps/ui/` adds:
  `pnpm exec tsc --noEmit -p apps/ui/tsconfig.json` enforced at **0-new** against a named
  baseline. The only baselined error is `app/debate/[id]/DebatePageClient.tsx(1488,11) TS2322`
  (pre-existing, PDA lane, ticket t_d9066400). Publish the exact 0-new command (filter the
  baselined line, count remaining `error TS`, require 0) so packets can quote it verbatim.

### D. CH1 — nothing pins a mode control on the ANONYMOUS landing (SPEC T9 R3)
T9-C3 proves ModeToggle in isolation; T3-C1-3 pins the toggle on the SIGNED-IN library;
T9-C1's current rows assert only the hero. SPEC R3 requires the control on the anonymous
landing. Same unsatisfiable/uncovered-acceptance class as AF-1.
**Add to the T9-C1 cluster contract in dispatch-order.md:** (1) a vitest acceptance row —
anonymous landing render mounts the mode control (asserted in `tests/render/t9-landing.test.tsx`,
which T9-C1 owns), and (2) a human-runnable browser step for V's QA line (logged-out visit to
`/`, the mode control is visible and switches modes). SPEC/PLAN stay frozen — the pin lives in
your cluster contract, which is the dispatch source of truth.

## 2. Bounds
- Writes: `docs/missions/ui-overhaul/architecture/**` only, plus append an "AM2" section to
  `.hermes/reports/ui-overhaul/agent-reports/ARCH-01-claude.md`, plus board comments on
  t_c34a0214. Nothing else. No product code, no tests, no SPEC/PLAN, no git commands.
- Each amended ADR gets a dated changelog entry naming t_4ccac5c4 as the trigger.
- Rework rounds: max 3. This amendment is expected to take one session, no subagents.

## 3. Handoff
Final board comment on t_c34a0214 (your LAST write, freeze law):
`AMENDMENT COMPLETE: AM2` + one line per amendment (A–D) naming file + what changed, your
SKILLS LOADED line, and `comments read through: <timestamp>`.
Return control at that handoff, a genuine blocker, or an IMPORTANT OPERATION, but keep the
unfinished goal/session alive and resumable. Silence is normal; unchanged state needs no
message. Termination requires the spine's goal-specific FULLY DONE condition.
