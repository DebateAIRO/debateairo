#!/bin/zsh
# REQ-OBS-CODEX — Codex gpt-5.6-sol @ xhigh requirements research seat (parallel blind, seat 3 of 3).
set -u
MISSION_DIR="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
LOG="${MISSION_DIR}/docs/missions/2026-08-21-observability-loop/logs/codex.log"
export PATH="/Applications/ChatGPT.app/Contents/Resources:${PATH}"
cd "${MISSION_DIR}" || exit 1
print "=== REQ-OBS Codex seat (gpt-5.6-sol @ xhigh) starting $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
codex exec \
  -c model='"gpt-5.6-sol"' \
  -c model_reasoning_effort='"xhigh"' \
  -c sandbox_mode='"danger-full-access"' \
  "/goal Read docs/missions/2026-08-21-observability-loop/goal-packets/codex.md in full and execute it. It is your complete contract. It points you at a shared research brief; answer every RQ id in that brief and write your artifact to docs/missions/2026-08-21-observability-loop/research/codex-requirements.md. You are one of three seats working independently and blind: do not read or wait on any other seat, and ignore other files in that research directory. Play adversarial systems rigor: red-team the capture layer, the trace procedure, and above all the permanent fix-agent (wrong-fix cascades, flapping, injection through error payloads, runaway spend); every guardrail names the failure it prevents. Cite path:line for repo claims or mark UNVERIFIED; never fabricate. Requirements only, no code; your file contract allows writing ONLY your artifact and your self-report. File the self-report to .hermes/reports/2026-08-21-observability-loop/agent-reports/codex.md, then emit the READY FOR HERMES STAGE REVIEW packet and stop." \
  </dev/null 2>&1 | tee -a "${LOG}"
print "=== REQ-OBS Codex seat exited $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
