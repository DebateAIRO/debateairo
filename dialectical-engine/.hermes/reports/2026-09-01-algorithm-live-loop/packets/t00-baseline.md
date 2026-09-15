# PACKET — T0 (baseline pin) · four elements per spine §4

## 1. Ticket-state block
Authoritative typed state in
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/board/T00-baseline.md
(status ready · rework_round 0 · risk_tier high — provider spend · allowed = your report,
self-report, and logs/t0/** only · the ENTIRE primary checkout is readonly: you run
commands in it, you edit nothing in it).
Working directory for every command:
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine

## 2. Immediate upstream artifacts
- goal-prompt.md T0 section, lines 69–79 of
  /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-08-31-algorithm-correctness/goal-prompt.md
  — the task text: pin `pnpm run typecheck`, `pnpm test` (full vitest), and the acceptance
  CEREMONY `./node_modules/.bin/tsx acceptance/run-acceptance.ts --service-credential <43>`
  with exit codes, passed/total counts, pre-existing failures NAMED individually, and the
  ceremony's settled run id / answer id. NOTE from the task text: `acceptance/main.ts` is
  the SERVER BOOTSTRAP, not the ceremony — do not pin it.
- /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/acceptance/README.md
  — the ceremony's strict environment contract (ACCEPTANCE_* list, credential format at
  run-acceptance.ts:75, `--serve` NOT used here).
- Mission DECISIONS.md D5/D6 at
  /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/DECISIONS.md
  — you run in the primary checkout; you supply dev-local operator inputs yourself:
  free local ports (probe for them), ACCEPTANCE_STRANGER_SAMPLE_RATE=1,
  ACCEPTANCE_BATTERY_VERSION=acceptance-v1, a settlement-watch handle
  `acceptance:t0-baseline`, ACCEPTANCE_GROK_RELAY_PORT=<free port> (grok CLI is absent on
  this host — a failed grok handshake with a 2-maker discovered panel is the EXPECTED,
  honest outcome per DR-182, record it as such), and a generated credential:
  `openssl rand -base64 32 | tr '+/' '-_' | tr -d '='` (43 chars, matches `[A-Za-z0-9_-]{43}`).
Deliverable: agent-reports/t00-baseline.md under headings `# T0 BASELINE r1`, `## PINS`
(three commands × exit code × passed/total or run id/answer id × log path), `## PRE-EXISTING
FAILURES` (each named with suite/file), `## CEREMONY RECORD` (panel discovered, makers,
depth, run id, answer id, probe-evidence count, condition marks printed), `## REPRO` (exact
env + commands a second worker can replay from this record alone).

## 3. Handoff marker
First line of agent-reports/t00-baseline.md:
`READY FOR PEER REVIEW — T0 r1 · comments read through: packet-t00-2026-09-01`

## 4. Stop conditions
- Token hygiene: tee every command's full output to logs/t0/{typecheck,test,ceremony}.log;
  quote ONLY counts, exit codes, failure names, ids. Never paste bulk output into your
  report or your context (vitest full run is large; use `tail`/`grep -c` on the log).
- Ceremony is ONE attempt after preflight (this is provider spend): preflight = ports
  probed free, credential format-verified, `claude -p 'ping' --output-format json`
  handshake succeeds from your shell. If the claude relay handshake fails (keychain login
  expired, nested-CLI interference): retry ONCE with a sanitized env (`env -i HOME=$HOME
  PATH=$PATH USER=$USER ...`); if still failing, write status `waiting_resource` +
  the typed error verbatim into your report, set the marker line to
  `BLOCKED — T0 r1 · waiting_resource · comments read through: packet-t00-2026-09-01`,
  and stop — typecheck and vitest pins are still delivered in the same report.
- The ceremony's own caller-owned temp resources (its temp DB) are the only thing it may
  create/destroy; you never run cleanup against the standing repo or any .pgdata you did
  not create.
- Load `superpowers:verification-before-completion` before claiming done; every count in
  `## PINS` must be re-derivable from the named log file (codex will check exactly this).
- ~90 minutes wall-clock cap; rework rounds: max 3.
- Self-report at agent-reports/t00-baseline-self.md BEFORE the marker is set.
- Final message = `FILED: <report path>` + the three PINS lines verbatim.
