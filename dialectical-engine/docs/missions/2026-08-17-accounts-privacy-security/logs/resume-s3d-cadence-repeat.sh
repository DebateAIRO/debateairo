#!/bin/zsh
# S3d cadence lower-bound repeat — resume original Codex worker visibly.
set -u

MISSION="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
REL="docs/missions/2026-08-17-accounts-privacy-security"
PACKET="${REL}/logs/S3d-cadence-repeat-packet.md"
LOG="${MISSION}/${REL}/logs/S3-codex.log"
SESSION="01a019e7-e36f-7131-b509-5dcb8d52b8b6"
SCRIPT="${MISSION}/${REL}/logs/resume-s3d-cadence-repeat.sh"

if [[ "${1:-}" == "--run" ]]; then
  cd "${MISSION}" || exit 1
  GOAL="/goal S3d CADENCE LOWER-BOUND REPEAT, SAME ORIGINAL SESSION. Refresh ticket t_cc197ed2 through the latest Router decision-memo comment, read ${REL}/reviews/S3d-v-decision-advisor-opus.md and ${PACKET} in full, then execute only the packet. Post CADENCE REPEAT ACKNOWLEDGED before checks. Freeze all eight hashes; make no product/policy/test edits. Repeat the exact 30ms cadence PostgreSQL sensitivity check twice, confirm the default 45ms check once, append only to S3d-progress.log, and return worker-blocked with the actual data. Do not commit, push, post READY, review, or mutate Done state."
  print "=== S3d CADENCE REPEAT starting $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
  codex exec resume "${SESSION}" -c 'model="gpt-5.6-sol"' -c 'model_reasoning_effort="xhigh"' -c 'sandbox_mode="danger-full-access"' "${GOAL}" </dev/null 2>&1 | tee -a "${LOG}"
  RUN_STATUS=${pipestatus[1]}
  print "=== S3d CADENCE REPEAT exited $(date -u +%FT%TZ), status ${RUN_STATUS} ===" | tee -a "${LOG}"
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

print "launched S3d CADENCE REPEAT in a visible Terminal window; log ${LOG}"
