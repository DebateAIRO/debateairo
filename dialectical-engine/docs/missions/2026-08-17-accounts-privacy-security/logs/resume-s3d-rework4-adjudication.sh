#!/bin/zsh
# S3d rework 4 adjudication — resume original Codex worker in visible Terminal.
set -u

MISSION="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
REL="docs/missions/2026-08-17-accounts-privacy-security"
PACKET="${REL}/logs/S3d-rework4-adjudication-packet.md"
LOG="${MISSION}/${REL}/logs/S3-codex.log"
SESSION="01a019e7-e36f-7131-b509-5dcb8d52b8b6"
SCRIPT="${MISSION}/${REL}/logs/resume-s3d-rework4-adjudication.sh"

if [[ "${1:-}" == "--run" ]]; then
  cd "${MISSION}" || exit 1
  GOAL="/goal S3d REWORK 4 ADJUDICATION, SAME ORIGINAL SESSION. Read ${REL}/reviews/S3d-successor-refutation-opus.md in full, refresh the ticket through the latest Router continuation comment, then read ${PACKET} in full; it is your complete continuation authority. Post REWORK 4 ADJUDICATION ACKNOWLEDGED before editing. Prove the successor probe's sharp permit-gap sensitivity with the exact 25ms positive control, clean and loaded repetitions; do not apply the disauthorised 5700ms product fix. Complete the packet's N-independent retained-object proof and cadence derivation/load work. Honor the same touch-only/frozen contract, restore and hash-check each mutant, do not run a full suite, and return worker-blocked with focused data for V/Router. Do not commit, push, or mutate review/Done state."
  print "=== S3d REWORK 4 ADJUDICATION starting $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
  codex exec resume "${SESSION}" -c 'model="gpt-5.6-sol"' -c 'model_reasoning_effort="xhigh"' -c 'sandbox_mode="danger-full-access"' "${GOAL}" </dev/null 2>&1 | tee -a "${LOG}"
  RUN_STATUS=${pipestatus[1]}
  print "=== S3d REWORK 4 ADJUDICATION exited $(date -u +%FT%TZ), status ${RUN_STATUS} ===" | tee -a "${LOG}"
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

print "launched S3d REWORK 4 ADJUDICATION in a visible Terminal window; log ${LOG}"
