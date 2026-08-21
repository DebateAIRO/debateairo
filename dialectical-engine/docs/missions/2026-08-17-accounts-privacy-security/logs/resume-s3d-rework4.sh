#!/bin/zsh
# S3d rework 4 — resume the original Codex coding session in visible Terminal.
set -u

MISSION="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
REL="docs/missions/2026-08-17-accounts-privacy-security"
PACKET="${REL}/logs/S3d-rework4-packet.md"
LOG="${MISSION}/${REL}/logs/S3-codex.log"
SESSION="01a019e7-e36f-7131-b509-5dcb8d52b8b6"
SCRIPT="${MISSION}/${REL}/logs/resume-s3d-rework4.sh"

if [[ "${1:-}" == "--run" ]]; then
  cd "${MISSION}" || exit 1
  GOAL="/goal S3d REWORK 4, SAME ORIGINAL SESSION. Read ${REL}/reviews/S3d-final-gate-rescue-opus.md in full, refresh every ticket comment through the latest Router rework-4 route, then read ${PACKET} in full; the packet is your complete rework-4 scope authority. Post REWORK 4 ACKNOWLEDGED before editing. Reproduce the successor-labelled shallow register channel RED or rigorously refute it before changing product code. Honor the touch-only and frozen-hash contract; STOP worker-blocked rather than widen. Mutation-test every new security assertion, restore and hash-check every mutant, and do not run the full suite until the packet's focused verification order is green. Append progress and post REWORK 4 READY FOR PEER REVIEW only when every packet gate passes. Do not commit, push, or mutate review/Done state."
  print "=== S3d REWORK 4 starting $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
  codex exec resume "${SESSION}" -c 'model="gpt-5.6-sol"' -c 'model_reasoning_effort="xhigh"' -c 'sandbox_mode="danger-full-access"' "${GOAL}" </dev/null 2>&1 | tee -a "${LOG}"
  RUN_STATUS=${pipestatus[1]}
  print "=== S3d REWORK 4 exited $(date -u +%FT%TZ), status ${RUN_STATUS} ===" | tee -a "${LOG}"
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
  do script "printf '\\033]0;CODEX S3d REWORK 4\\007'; '${SCRIPT}' --run"
  activate
end tell
APPLESCRIPT

print "launched S3d REWORK 4 in a visible Terminal window; log ${LOG}"
