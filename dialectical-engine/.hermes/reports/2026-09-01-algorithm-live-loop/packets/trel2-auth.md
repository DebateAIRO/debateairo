# PACKET — TREL2 (restore relay keychain-login visibility) · four elements per spine §4

## 1. Ticket-state block
Authoritative typed state in
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/board/TREL2-relay-auth.md
(status ready · rework_round 0 · risk_tier high · writable: the lane worktree at
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-trel2
on branch lane/trel2 plus, by ABSOLUTE path, your report .../agent-reports/trel2-auth.md,
self-report .../trel2-auth-self.md, logs .../logs/trel2/).
Working directory: /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-trel2/dialectical-engine
(provisioning in background — verify node_modules + packages/contract/generated/client.ts
before suites). Base = 3409852 (batches 1-4 merged; your TREL work is in this tree).

## 2. Immediate upstream artifacts
- Ruling D18 + boards F25/F26 (the authorization, the evidence, the bounds):
  /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/DECISIONS.md
  and .../board/F25-relay-setting-sources-auth.md, .../board/F26-preflight-parity.md
- T0's ceremony evidence (the verbatim failure): .../agent-reports/t00-baseline.md
  (`Not logged in · Please run /login`, is_error:true, from claude-relay.ts:130's
  `--setting-sources ""` + the child-env allowlist).
THE TASK: (a) determine EMPIRICALLY which setting source the installed claude CLI
(2.1.247) needs to see its keychain login — auth-failure probes are FREE (the "Not logged
in" error fires before any model call); you have a budget of AT MOST 3 tiny live success
probes (one-word ping, `--output-format json`), each logged verbatim to logs/trel2/ and
counted in your report. (b) Make the NARROWEST relay change restoring login visibility
while preserving as much call-purity isolation as the CLI's granularity allows (document
what "" was protecting against and what your change re-admits — that trade-off paragraph
is a DELIVERABLE; if the CLI offers no granularity between "no settings" and "user
settings", say so and take user-settings with the consequence stated). Mirror the same
reasoning for grok-relay.ts only if its structure shares the defect (no probes — the CLI
is absent). (c) F26 IN SCOPE: refactor the ceremony preflight to call the adapter's own
buildArguments/buildCliChildEnvironment so preflight IS the relay (the third divergence
in one ticket dies here).
HARD BOUNDS (D18, repeated): never mint/read/pass any credential VALUE; never weaken the
DR-115 handshake honesty (zero-or-several-models, is_error, unparseable, deadline stay
typed-loud); TREL's env overrides and typed-loud ordering (your own r3 arms) must keep
passing.
Deliverable: commits on lane/trel2 (prefix `TREL2:`) + report at the absolute path with
`# TREL2 r1`, `## PROBE LEDGER` (every live call: command shape, purpose, outcome — ≤3
successes), `## RED` (fake-CLI arg/env-shape tests failing on the unmodified base),
`## GREEN` (those + TREL's r3 arms + relay suites, ×3 set-equal runs), `## TRADE-OFF`
(what "" protected, what is re-admitted, why this is the narrowest), `## SUITES`
(root typecheck; zone ×3; full row D15-DEFERRED unless quiet; D16 gates only if
contract/kernel touched — state it), `## COMMITS`.

## 3. Handoff marker
First line: `READY FOR PEER REVIEW — TREL2 r1 · comments read through: packet-trel2-2026-09-01`
Second line: `report sha256: <hash>` (+ reproducing command). Self-report (exact `## r1`)
BEFORE the marker; marker last; frozen after.

## 4. Stop conditions
- RED before GREEN; enumerate-the-class first (every arg/env construction site in the
  relay layer, all three makers, F23's JSONB clause n/a here but the enumeration habit is).
- Superpowers floor: `superpowers:test-driven-development`,
  `superpowers:verification-before-completion`, `superpowers:systematic-debugging`.
- If the ONLY workable fix requires provisioning a credential (e.g. an OAuth token), STOP:
  `BLOCKED — TREL2 r1 · waiting_human · <what V must provision>` — that is V's, never yours.
- ~75 minutes; rework rounds: max 3.
- Final message = FILED line + marker + the trade-off paragraph verbatim + probe count.
