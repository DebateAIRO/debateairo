# CODE-T9C5 — T9 slice-close bind: pda-s03 audit vs the final T9 surface (ticket t_ea07b5dc, epoch=16)

You are a fresh codex coding seat for mission `ui-overhaul` (board `ui-overhaul`, ticket
t_ea07b5dc, authority marker on the ticket). T9 is content-complete: T9-C1/C2/C3/C4 are
merged-ready on dev. You are row 6 — the slice-close owner. This is a CONFIRM+BIND
cluster: the 4-file verify command was pre-verified GREEN (4 files / 54 tests) at
dispatch, and **a zero-diff outcome is LEGAL** — but only a handoff carrying the full
audit table earns it. Two parallel light seats work OTHER surfaces
(`tests/render/t9-landing.test.tsx` and `docs/missions/**`) — not yours.

## 0. Read order
1. This packet, fully.
2. `docs/missions/ui-overhaul/architecture/dispatch-order.md` — row 6 (writes + verify)
   and the AM5 §"T9-C1's `pda-s03` migration" section.
3. `docs/missions/ui-overhaul/slices/T9/PLAN.md` §"T9-C5 — Render-pin migration bind"
   (cells T9-C5-1/2 + HOW: the 4-of-4 pin-file table).
4. `docs/missions/ui-overhaul/slices/T9/DECISIONS.md` — rows 37 (the pin list — T9-C5-1
   is ALREADY satisfied there; confirm, don't duplicate) and 46/47 (AM5's laws).
5. `tests/unit/pda-s03-keyboard-accessibility.test.ts` — every line.
6. `.hermes/TOOLING-TRAPS.md`.

Skills floor: heartbeat-protocol + heartbeat-worker (repo copies), superpowers:
test-driven-development, verification-before-completion, systematic-debugging,
receiving-code-review. Open every board write with `SKILLS LOADED: <list>`. Post a CLAIM
comment (with your session id) before working.

## 1. The charge
- **T9-C5-1 (confirm):** the DECISIONS:37 list named 4 pin files when the table was made.
  Re-measure its completeness NOW: which standing tests read T9's product surface
  (`apps/ui/app/page.tsx`, `layout.tsx`, `globals.css`, plus the T9-C2 auth files)?
  Mission-authored tests (`t9-*`, `t3-library`) are NEW pins, not OLD-UI pins — R9's
  sentence is about OLD pins; state the distinction and whether any OLD pin is missing
  from the list. Measured (grep/awk over tests/), not asserted.
- **T9-C5-2 (audit + bind):** audit `pda-s03-keyboard-accessibility.test.ts` line by line
  against the SHIPPED surface. Per case: what it renders NOW (which route, which session
  state via the module mock), what it asserts, and whether it MEASURES the final surface
  or MASKS it (AM5's class: a mock that renders a composition the product no longer
  emits). Known history you verify rather than trust: T9-C1 migrated 4 cases mock→session,
  re-pointed the anonymous-only `.tabEmptyHint` case to the route-split property; T3-C1
  scoped the toggle query at :147 to `[data-landing-section="chrome"] [data-mode-toggle]`.
  Sanity checks that MUST hold and be shown: the signed-in cases render ZERO
  `[data-landing-section]` elements; the anon case's rendered document contains the
  landing (markers = 5). If any case is stale, re-anchor it — your ONLY writable
  product-test surface is this one file. Tab labels `Your Debates`/`Public Debates`
  recasing is T3-C2's (row 14) — do NOT pre-empt it.
- **The bind:** row-6 verify command verbatim, three runs, worst run is the verdict:
  `pnpm exec vitest run tests/architecture/auth-front-door-parity.test.ts tests/architecture/s8-publication-contract.test.ts tests/unit/pda-s03-keyboard-accessibility.test.ts tests/unit/v2ui-pages.test.ts`

## 2. Refutation duty (only if you re-anchor; else state N/A per mutant with the reason)
Any case you change: reproduce the staleness first (show what the old form measured),
then the re-anchored RED under a product mutant that breaks the property it now pins,
revert with SHA-256 proof. If zero-diff: instead run ONE probe mutant proving the suite
is live (e.g. break the route split in page.tsx transiently → which pda-s03 cases go
RED? → revert byte-exactly, SHA proof). A bind seat that never saw RED proved nothing.

## 3. Acceptance at handoff (worst of three)
1. Row-6 command 3x all green. 2. Audit table (per-case: renders / asserts / verdict
MEASURES|MASKS|RE-ANCHORED). 3. T9-C5-1 completeness re-measurement. 4. Probe-mutant
RED/revert proof. 5. `git diff` net-touches at most
`tests/unit/pda-s03-keyboard-accessibility.test.ts`. 6. Root typecheck 0 (tests-only
cluster: workspace compile gate exempt per dispatch-order §exemptions).

## 4. File contract
Writes: `tests/unit/pda-s03-keyboard-accessibility.test.ts` (only if re-anchoring) ·
`.hermes/reports/ui-overhaul/agent-reports/CODE-T9C5-codex.md` (self-report before FULLY
DONE) · board comments on t_ea07b5dc. Transient probe: one product file, net zero, SHA
proof. NO git commands.
Parallel lanes LIVE (not yours): `tests/render/t9-landing.test.tsx` (CODE-T9C4-N1),
`docs/missions/ui-overhaul/architecture/**` + ADR-004 (ARCH-01-AM11). Pre-existing dirt:
`web/app/public/debate/[id]/page.tsx` (V's — NEVER touch), untracked
`docs/missions/2026-08-21-docker-hatchet/GPT-ORCH-HANDOFF.md` + `ui_designs/DebateAI
Design Document.html`.

## 5. Handoff
Final board comment on t_ea07b5dc (LAST write — freeze law): `READY FOR PEER REVIEW` +
audit table + §3 outputs + `SKILLS LOADED:` + `comments read through:`. Rework rounds:
max 3, same session.
Return control at that handoff, a genuine blocker, or an IMPORTANT OPERATION, but keep
the unfinished goal/session alive and resumable. Silence is normal; unchanged state
needs no message. Termination requires the spine's goal-specific FULLY DONE condition.
