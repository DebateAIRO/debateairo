# PACKET — TREL (relay binary env overrides) · four elements per spine §4

## 1. Ticket-state block
Authoritative typed state in
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/board/TREL-relay-binaries.md
(status ready · rework_round 0 · risk_tier high · writable: lane worktree
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-trel
on branch lane/trel — local commits, never push — plus report, self-report, logs/trel/**).
Working directory:
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-trel/dialectical-engine
(installed + contract generated; verify `ls packages/contract/generated/client.ts` before
suites and say so in your report).

## 2. Immediate upstream artifacts
- Mission DECISIONS.md D10 — the authorization and its EXACT bounds:
  /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/DECISIONS.md
  Design: ACCEPTANCE_CLAUDE_BINARY / ACCEPTANCE_GROK_BINARY / ACCEPTANCE_CODEX_BINARY
  environment overrides; when unset, behavior is BYTE-IDENTICAL to today (the existing
  constants remain the defaults — acceptance/claude-relay.ts:27, grok-relay.ts:12,
  model-shim.ts:15); typed-loud failure paths unchanged; NO live provider calls in this
  lane (the live proof belongs to T0's ceremony re-pin).
- The finding evidence: board F8 + T0's report (finding 3) at
  /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t00-baseline.md
- The existing test seams (read them before designing): acceptance/claude-relay.test.ts,
  acceptance/model-shim.test.ts, acceptance/relay-core.test.ts, test-fixtures/ fake CLIs —
  the repo's own pattern for testing relay spawning without real providers.
Deliverable: changes committed on lane/trel + agent-reports/trel-relay.md under headings
`# TREL r1`, `## RED` (a test asserting the env override changes the resolved binary,
FAILING on the unmodified base — command + failure line + log path), `## GREEN` (that test
+ default-unchanged tests + existing relay suites passing — passed/total + log paths),
`## SUITES` (typecheck + pnpm test: exit codes, passed/total, every failure named
PRE-EXISTING — cite T0's 16-test union and its post-provisioning re-pin when it lands — or
yours), `## COMMITS`.

## 3. Handoff marker
First line of agent-reports/trel-relay.md:
`READY FOR PEER REVIEW — TREL r1 · comments read through: packet-trel-2026-09-01`

## 4. Stop conditions
- RED before GREEN; failing run captured to logs/trel/ first.
- Superpowers floor: `superpowers:test-driven-development`,
  `superpowers:verification-before-completion`; `superpowers:systematic-debugging` on any bug.
- Scope: the three binary constants' resolution + tests. Nothing else in acceptance/,
  nothing in the algorithm surface. NO live CLI handshakes, NO ceremony runs, NO provider
  spend of any kind.
- Token hygiene: tee to logs/trel/; quote counts only. Commits prefixed `TREL:`.
- Blocked → `BLOCKED — TREL r1 · <waiting_*> · comments read through: packet-trel-2026-09-01`.
- ~45 minutes; rework rounds: max 3.
- Self-report at agent-reports/trel-relay-self.md BEFORE the marker.
- Final message = `FILED: <report path>` + marker line + `## SUITES` lines verbatim.
