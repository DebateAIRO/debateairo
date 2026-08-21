#!/bin/zsh
# S3d cadence disclosure recut — resume original Codex worker visibly.
set -u

MISSION="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
REL="docs/missions/2026-08-17-accounts-privacy-security"
PACKET="${REL}/logs/S3d-cadence-disclosure-recut-packet.md"
LOG="${MISSION}/${REL}/logs/S3-codex.log"
SESSION="01a019e7-e36f-7131-b509-5dcb8d52b8b6"
SCRIPT="${MISSION}/${REL}/logs/resume-s3d-cadence-disclosure-recut.sh"

if [[ "${1:-}" == "--run" ]]; then
  cd "${MISSION}" || exit 1
  GOAL="/goal S3d CADENCE DISCLOSURE RECUT, SAME ORIGINAL SESSION. Refresh ticket t_cc197ed2 through V FINAL RULING 2026-08-21, read ${REL}/reviews/S3d-v-decision-advisor-opus.md, ${REL}/reviews/S3d-v-cadence-addendum-opus.md, and ${PACKET} in full, then execute only the active packet. Post CADENCE DISCLOSURE RECUT ACKNOWLEDGED before editing. Preserve runtime behavior, 45ms cadence, N-star=2, integration tests, and all frozen paths. Perform the required RED-first test, minimal structured disclosure recut, mutation check, focused gates, hashes, and READY handoff. Do not commit, push, self-review, launch reviewers, or mutate review or Done state."
  print "=== S3d CADENCE DISCLOSURE RECUT starting $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
  codex exec resume "${SESSION}" -c 'model="gpt-5.6-sol"' -c 'model_reasoning_effort="xhigh"' -c 'sandbox_mode="danger-full-access"' "${GOAL}" </dev/null 2>&1 | tee -a "${LOG}"
  RUN_STATUS=${pipestatus[1]}
  print "=== S3d CADENCE DISCLOSURE RECUT exited $(date -u +%FT%TZ), status ${RUN_STATUS} ===" | tee -a "${LOG}"
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
  do script "'${SCRIPT}' --run"
  activate
end tell
APPLESCRIPT

print "launched S3d CADENCE DISCLOSURE RECUT in a visible Terminal window; log ${LOG}"
