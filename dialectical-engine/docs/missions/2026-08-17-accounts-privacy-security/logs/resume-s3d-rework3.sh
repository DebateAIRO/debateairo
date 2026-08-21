#!/bin/zsh
# S3d rework 3 — resume the original Codex coding session in visible Terminal.
set -u

MISSION="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
REL="docs/missions/2026-08-17-accounts-privacy-security"
PACKET="${REL}/logs/S3d-rework3-packet.md"
LOG="${MISSION}/${REL}/logs/S3-codex.log"
SESSION="01a019e7-e36f-7131-b509-5dcb8d52b8b6"
SCRIPT="${MISSION}/${REL}/logs/resume-s3d-rework3.sh"

if [[ "${1:-}" == "--run" ]]; then
  cd "${MISSION}" || exit 1
  GOAL="/goal S3d REWORK 3, SAME ORIGINAL SESSION. Read ${REL}/reviews/S3d-r2-grok-verdict.md and ${REL}/reviews/S3d-r2-opus-verdict.md in full, then read ${PACKET} in full; the packet is your only rework-3 scope authority. Reproduce B1-B3 RED or rigorously refute them before changing code. Honor the touch-only contract and frozen scopes; STOP and report worker-blocked rather than widen. Use real PostgreSQL and the ruled 5000 ms transport. Mutation-test every security assertion, restore and hash-check every mutant, run full gates, append progress, and post REWORK READY FOR PEER REVIEW. Do not commit or push."
  print "=== S3d REWORK 3 starting $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
  codex exec resume "${SESSION}" -c 'model="gpt-5.6-sol"' -c 'model_reasoning_effort="xhigh"' -c 'sandbox_mode="danger-full-access"' "${GOAL}" </dev/null 2>&1 | tee -a "${LOG}"
  RUN_STATUS=${pipestatus[1]}
  print "=== S3d REWORK 3 exited $(date -u +%FT%TZ), status ${RUN_STATUS} ===" | tee -a "${LOG}"
  exit "${RUN_STATUS}"
fi

cd "${MISSION}" || exit 1
[[ -f "${MISSION}/${PACKET}" ]] || {
  print "REFUSING: packet ${PACKET} missing" | tee -a "${LOG}"
  exit 1
}
if pgrep -f "codex exec resume ${SESSION}" >/dev/null 2>&1; then
  print "REFUSING: S3d coding session already alive" | tee -a "${LOG}"
  exit 1
fi

osascript <<APPLESCRIPT >/dev/null
tell application "Terminal"
  do script "printf '\\\\033]0;CODEX S3d REWORK 3\\\\007'; '${SCRIPT}' --run"
  activate
end tell
APPLESCRIPT

print "launched S3d REWORK 3 in a visible Terminal window; log ${LOG}"
