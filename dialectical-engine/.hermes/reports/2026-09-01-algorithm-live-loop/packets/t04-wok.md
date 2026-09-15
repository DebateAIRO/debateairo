# PACKET — T4 (way-of-knowing simplification + disclosure) · four elements per spine §4

## 1. Ticket-state block
Authoritative typed state in
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/board/T04-way-of-knowing.md
(status ready · rework_round 0 · risk_tier high · writable: lane worktree
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t4
on branch lane/t4 — local commits yes, push never — plus report, self-report, logs/t04/**).
Working directory:
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t4/dialectical-engine

## 2. Immediate upstream artifacts
- THE SPEC (frozen; your task is the T4 block quoting goal-v4 lines 112–118):
  /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/slices/S02-hygiene/SPEC.md
  Substance: remove RAN from the judge output schema
  (packages/judgement/src/index.ts:26-29,130); normalization (locator-less LOOKED_UP →
  REASONING) records condition mark WAY-OF-KNOWING-DOWNGRADED naming node + claimed value.
  DoD: RED first — a test expecting the schema to REJECT RAN fails on baseline; mark
  emitted on normalization (test); Q51 semantics unchanged.
- GUARD (board F5, mission DECISIONS J4): after your change, serve's RAN band bucket
  (packages/serve/src/index.ts:562) becomes structurally dead. It is inside T12's rewrite
  span and OUT OF YOUR SCOPE — do not delete or tidy it; if you believe it must go, that
  is a ticket, never a silent cleanup in your diff.
- Mission baseline: /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t00-baseline.md
Deliverable: changes committed on lane/t4 + agent-reports/t04-wok.md under headings
`# T4 WOK r1`, `## RED` (schema-rejects-RAN test failing on the unmodified base: command +
failure line + log path), `## GREEN` (that test + the normalization-mark test naming node
id and claimed value + the Q51-semantics-unchanged evidence — passed/total + log paths),
`## SUITES` (typecheck + pnpm test: exit codes, passed/total, failures named PRE-EXISTING
(cite T0) or yours), `## COMMITS`.

## 3. Handoff marker
First line of agent-reports/t04-wok.md:
`READY FOR PEER REVIEW — T4 r1 · comments read through: packet-t04-2026-09-01`

## 4. Stop conditions
- RED before GREEN (router §2.5); failing run captured to logs/t04/ before implementing.
- Superpowers floor: `superpowers:test-driven-development`,
  `superpowers:verification-before-completion`; `superpowers:systematic-debugging` on any bug.
- Scope: packages/judgement schema + normalization + condition-mark records + tests.
  NO serve/ edits (F5 guard above), no register work, no runner reduce/select changes
  (T3's surface).
- Token hygiene: tee to logs/t04/; quote counts only. Commits prefixed `T4:`.
- Blocked → `BLOCKED — T4 r1 · <waiting_*> · comments read through: packet-t04-2026-09-01`.
- ~75 minutes; rework rounds: max 3.
- Self-report at agent-reports/t04-wok-self.md BEFORE the marker.
- Final message = `FILED: <report path>` + marker line + `## SUITES` lines verbatim.
