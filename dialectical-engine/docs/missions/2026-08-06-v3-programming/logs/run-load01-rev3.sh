#!/bin/zsh
set -u
MISSION_DIR="/Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3"
LOG="${MISSION_DIR}/docs/missions/2026-08-06-v3-programming/logs/LOAD-01-codex.log"
SESSION="019ff813-cfdc-7e12-aa4a-11864e128012"
cd "${MISSION_DIR}" || exit 1
if pgrep -f "codex exec.*(/goal|resume)" >/dev/null 2>&1; then print "REFUSING: codex seat busy" | tee -a "${LOG}"; exit 1; fi
print "=== LOAD-01 rev3 resuming ${SESSION} $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
codex exec resume "${SESSION}" -c model='"gpt-5.6-sol"' -c sandbox_mode='"danger-full-access"' \
  "/goal LOAD-01 rev2 confirmations: Grok APPROVED its finding; Opus CHANGES REQUESTED with 2 blocking — ALL FIVE of your code fixes were verified real by execution; what blocks is ENFORCEMENT. Read the newest orchestrator comment on t_4020ac7b and reviews/load01-opus-rev2.md. R1: your render config is a DEAD RUNNER — the root vitest include is tests/**/*.test.ts and your file is .test.TSX, so vitest collects 71 files with none under tests/render/, and three of your five mutation kills (the 40 percent bar, the terminal transition, the 404 guard) SURVIVE the enforced suite; you also DELETED rev1's page-source regex so B4 is now less protected than before your rework. Fix: wire the render tests into the ENFORCED gate — widen the root include to cover .test.tsx or register the render project in the root vitest config; prove it with vitest list output showing the render file collected AND the three surviving mutations going red under plain pnpm test; do NOT create another sidecar config that nothing runs (that is HYG-01's dead-runner pattern, third occurrence this mission). R2: your B2 assertion calls debateAfterRunTerminalFailure DIRECTLY — removing only the handler's call to it keeps everything green; move the assertion to the wiring seam. Your five fixes are right — touch nothing else. Re-run every gate, paste real output including the vitest list proof, same session, back to review with 'REWORK READY FOR HERMES REVIEW - LOAD-01 rev3'." \
  </dev/null 2>&1 | tee -a "${LOG}"
print "=== LOAD-01 rev3 exited $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
