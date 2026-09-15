# PACKET — T1 (depth enforced at the contract door) · four elements per spine §4

## 1. Ticket-state block
Authoritative typed state in
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/board/T01-depth-contract.md
(status ready · rework_round 0 · risk_tier medium · writable: lane worktree
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1
on branch lane/t1 — local commits yes, push never — plus your report, self-report,
logs/t01/**). Working directory for all commands:
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1/dialectical-engine
(dependencies installed and verified).

## 2. Immediate upstream artifacts
- THE SPEC (frozen; your task is the T1 block quoting goal-v4 lines 97–106 byte-identically):
  /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/slices/S02-hygiene/SPEC.md
  Substance (from that text): the 1–5 integer bound is defined ONCE in packages/contract
  (exported constant + depth_params schema requiring integer depth 1–5);
  resolveExpansionDepth (apps/runner/src/index.ts:987-996) IMPORTS that constant and keeps
  throwing RUN_DEPTH_PARAMS_INVALID as defence in depth. No second literal 5 — the DoD
  greps for it.
- Mission baseline (pre-existing failures you must never absorb):
  /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t00-baseline.md
- Contract generation note (harness fact): package.json has `generate:contract`
  (tsx packages/contract/src/generate.ts) — discover whether your schema change flows
  through generation and keep generated artifacts in sync; the DoD's "both clients" means
  the two API client surfaces that submit asks (live apps/ui client and legacy web/
  client) — verify acceptance of depth 1 and 5 through both submission paths at the
  contract-validation level (test-level proof; no UI redesign).
Deliverable: changes committed on lane/t1 + agent-reports/t01-depth.md under headings
`# T1 DEPTH r1`, `## RED` (the test expecting HTTP 400 with the parseRequest validation
envelope — EXACT machine code asserted in the test — for depth 9, shown FAILING on the
unmodified base: command + failure line + log path), `## GREEN` (that test passing, plus
rejection tests for 0, 6, missing, fractional, string, unknown-key; 1 and 5 accepted
through both clients; runner guard intact test; single-source grep test — each with
passed/total + log path), `## SUITES` (pnpm run typecheck + pnpm test: exit codes,
passed/total, every failure named PRE-EXISTING (cite T0) or yours), `## COMMITS`.

## 3. Handoff marker
First line of agent-reports/t01-depth.md:
`READY FOR PEER REVIEW — T1 r1 · comments read through: packet-t01-2026-09-01`

## 4. Stop conditions
- RED before GREEN (router §2.5): the depth-9→400 test is written FIRST and its failing
  run on the unmodified base is captured to logs/t01/ before any implementation.
- Superpowers floor: `superpowers:test-driven-development` before the first test;
  `superpowers:verification-before-completion` before claiming done;
  `superpowers:systematic-debugging` on any bug.
- Scope: packages/contract + the runner guard import + whatever generated-contract
  artifacts the generator owns + tests. NO web/ edits (T2 owns web/), no register work,
  no UI redesign.
- Token hygiene: tee suite output to logs/t01/*.log; quote counts/names only.
- Commits prefixed `T1:`.
- Blocked/unsure → marker variant `BLOCKED — T1 r1 · <waiting_* status> · comments read
  through: packet-t01-2026-09-01` + reason; never guess.
- ~75 minutes; rework rounds: max 3.
- Self-report at agent-reports/t01-depth-self.md BEFORE the marker.
- Final message = `FILED: <report path>` + marker line + `## SUITES` lines verbatim.
