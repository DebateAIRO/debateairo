#!/bin/zsh
# REQ-OBS-GROK — Grok 4.6 requirements research seat (parallel blind, seat 2 of 3).
set -u
MISSION_DIR="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
LOG="${MISSION_DIR}/docs/missions/2026-08-21-observability-loop/logs/grok.log"
cd "${MISSION_DIR}" || exit 1
print "=== REQ-OBS Grok seat (grok-4.6) starting $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
"${HOME}/.grok/bin/grok" \
  -p "/goal Read docs/missions/2026-08-21-observability-loop/goal-packets/grok.md in full and execute it. It is your complete contract. It points you at a shared research brief; answer every RQ id in that brief and write your artifact to docs/missions/2026-08-21-observability-loop/research/grok-requirements.md. You are one of three seats working independently and blind: do not read or wait on any other seat, and ignore other files in that research directory. Use live search for 2026 ground truth on error-tracking schemas, LISTEN/NOTIFY vs polling reliability, and agentic auto-fix guardrail precedents; ground every repo claim in path:line evidence. Cite checkable sources or mark UNVERIFIED; never fabricate. Requirements only, no code. Defensive only. File your self-report to .hermes/reports/2026-08-21-observability-loop/agent-reports/grok.md, then emit the READY FOR HERMES STAGE REVIEW packet and stop." \
  -m grok-4.6 \
  --permission-mode bypassPermissions \
  </dev/null 2>&1 | tee -a "${LOG}"
print "=== REQ-OBS Grok seat exited $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
