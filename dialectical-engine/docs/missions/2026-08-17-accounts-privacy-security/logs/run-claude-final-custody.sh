#!/bin/zsh
# Visible Claude Opus final-custody takeover for S3d.
set -u

MISSION="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
REL="docs/missions/2026-08-17-accounts-privacy-security"
PACKET="${REL}/reviews/S3d-claude-final-custody-packet.md"
SCRIPT="${MISSION}/${REL}/logs/run-claude-final-custody.sh"
LOG="${MISSION}/${REL}/logs/S3d-claude-final-custody.log"
RESULT="${MISSION}/${REL}/logs/S3d-claude-final-custody-result.json"
SESSION_FILE="${MISSION}/${REL}/logs/S3d-claude-final-custody-session.txt"

if [[ "${1:-}" == "--run" ]]; then
  cd "${MISSION}" || exit 1
  PROMPT="/goal Read ${PACKET} in full and execute it as the fresh Claude Opus final-custody subagent taking over the cancelled Hermes run. Inherit only the documented Hermes reads; independently perform every pre-hash, final gate, post-hash, exact-scope commit, receipt, and kanban readback in the packet. Do not edit product code or tests. On any failure, do not stage/commit/complete: write and post CLAUDE CUSTODY CHANGES REQUESTED. Never launch Hermes or Fable. Never push."
  print "=== S3d Claude Opus final custody starting $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
  /Users/vladmihaimiron/.local/bin/claude -p "${PROMPT}" --model claude-opus-5 --permission-mode acceptEdits --allowedTools "Bash,Read,Write,Edit,Glob,Grep" --output-format json 2>&1 | tee "${RESULT}" | tee -a "${LOG}"
  CUSTODY_STATUS=${pipestatus[1]}
  python3 -c "import json; d=json.load(open('${RESULT}')); print(d.get('session_id',''))" > "${SESSION_FILE}" 2>/dev/null
  print "=== S3d Claude Opus final custody exited $(date -u +%FT%TZ), status ${CUSTODY_STATUS} ===" | tee -a "${LOG}"
  exit "${CUSTODY_STATUS}"
fi

cd "${MISSION}"
[[ -f "${PACKET}" ]] || { print "REFUSING: missing ${PACKET}"; exit 1; }

osascript <<APPLESCRIPT >/dev/null
tell application "Terminal"
  do script "printf '\\\\033]0;CLAUDE OPUS S3d FINAL CUSTODY\\\\007'; '${SCRIPT}' --run"
  activate
end tell
APPLESCRIPT

print "launched fresh Claude Opus S3d final-custody subagent in a visible Terminal"
print "log: ${LOG}"
print "session: ${SESSION_FILE}"
