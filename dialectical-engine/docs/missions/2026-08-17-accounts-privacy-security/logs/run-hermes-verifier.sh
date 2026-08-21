#!/bin/zsh
# Visible Hermes-Verifier launcher for the accounts mission.
# usage: run-hermes-verifier.sh <SEAT-ID> <PACKET-REL-PATH>
set -u

MISSION="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
REL="docs/missions/2026-08-17-accounts-privacy-security"
SCRIPT="${MISSION}/${REL}/logs/run-hermes-verifier.sh"

if [[ "${1:-}" == "--run" ]]; then
  shift
  SEAT="${1:?seat id required}"
  PACKET="${2:?packet path required}"
  LOG="${MISSION}/${REL}/logs/${SEAT}-hermes-verifier.log"
  USAGE="${MISSION}/${REL}/logs/${SEAT}-hermes-usage.json"
  cd "${MISSION}" || exit 1
  PROMPT="/goal Read ${PACKET} in full and execute it as the independent Hermes-Verifier. The packet is your sole scope, verification, commit, and board-custody authority. Finish only at its exact HERMES DONE or HERMES CHANGES REQUESTED return marker."
  print "=== ${SEAT} Hermes-Verifier starting $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
  /Users/vladmihaimiron/.local/bin/hermes --yolo --usage-file "${USAGE}" -z "${PROMPT}" 2>&1 | tee -a "${LOG}"
  VERIFY_STATUS=${pipestatus[1]}
  print "=== ${SEAT} Hermes-Verifier exited $(date -u +%FT%TZ), status ${VERIFY_STATUS} ===" | tee -a "${LOG}"
  exit "${VERIFY_STATUS}"
fi

SEAT="${1:?seat id required, e.g. S3d-final}"
PACKET="${2:?packet path required, relative to repo root}"
LOG="${MISSION}/${REL}/logs/${SEAT}-hermes-verifier.log"

[[ -f "${MISSION}/${PACKET}" ]] || {
  print "REFUSING ${SEAT}: packet ${PACKET} missing" | tee -a "${LOG}"
  exit 1
}

if ! osascript <<APPLESCRIPT >/dev/null
tell application "Terminal"
  do script "printf '\\\\033]0;HERMES VERIFIER ${SEAT}\\\\007'; '${SCRIPT}' --run '${SEAT}' '${PACKET}'"
  activate
end tell
APPLESCRIPT
then
  print "REFUSING ${SEAT}: Terminal launch failed" | tee -a "${LOG}"
  exit 1
fi

print "launched ${SEAT} Hermes-Verifier in a visible window; log ${LOG}"
