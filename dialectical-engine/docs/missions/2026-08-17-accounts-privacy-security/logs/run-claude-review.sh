#!/bin/zsh
# Visible Claude review-seat launcher for Codex-Router.
# usage: run-claude-review.sh <SEAT-ID> <MODEL> <PACKET-REL-PATH>
set -u

MISSION="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
REL="docs/missions/2026-08-17-accounts-privacy-security"
SCRIPT="${MISSION}/${REL}/logs/run-claude-review.sh"

if [[ "${1:-}" == "--run" ]]; then
  shift
  SEAT="${1:?seat id required}"
  MODEL="${2:?model required}"
  PACKET="${3:?packet path required}"
  LOG="${MISSION}/${REL}/logs/${SEAT}-claude-review.log"
  RESULT="${MISSION}/${REL}/logs/${SEAT}-claude-review-result.json"
  SESSION_FILE="${MISSION}/${REL}/logs/${SEAT}-claude-review-session.txt"
  cd "${MISSION}" || exit 1
  PROMPT="/goal Read ${PACKET} in full and execute it as a fresh blind Claude review seat. The packet is your sole scope and return authority. Do not inspect the sibling r2 verdict. Work as a reviewer, not an implementer. Temporary one-at-a-time mutations must be restored and hash-verified. Do not commit, push, or mutate kanban state. Finish only after the required verdict file exists and stdout clearly says GREENLIGHT or BLOCK."
  print "=== ${SEAT} Claude review starting $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
  claude -p "${PROMPT}" --model "${MODEL}" --permission-mode acceptEdits --allowedTools "Bash,Read,Write,Edit,Glob,Grep" --output-format json 2>&1 | tee "${RESULT}" | tee -a "${LOG}"
  REVIEW_STATUS=${pipestatus[1]}
  python3 -c "import json; d=json.load(open('${RESULT}')); print(d.get('session_id',''))" > "${SESSION_FILE}" 2>/dev/null
  print "=== ${SEAT} Claude review exited $(date -u +%FT%TZ), status ${REVIEW_STATUS} ===" | tee -a "${LOG}"
  exit "${REVIEW_STATUS}"
fi

SEAT="${1:?seat id required, e.g. S3d-r2-opus}"
MODEL="${2:?model required, e.g. claude-opus-5}"
PACKET="${3:?packet path required, relative to repo root}"
LOG="${MISSION}/${REL}/logs/${SEAT}-claude-review.log"

[[ -f "${MISSION}/${PACKET}" ]] || {
  print "REFUSING ${SEAT}: packet ${PACKET} missing" | tee -a "${LOG}"
  exit 1
}

osascript <<APPLESCRIPT >/dev/null
tell application "Terminal"
  do script "printf '\\\\033]0;CLAUDE REVIEW ${SEAT} (${MODEL})\\\\007'; '${SCRIPT}' --run '${SEAT}' '${MODEL}' '${PACKET}'"
  activate
end tell
APPLESCRIPT

print "launched ${SEAT} Claude review (${MODEL}) in a visible window; log ${LOG}"
