#!/bin/zsh
# Claude coding-seat launcher for inverted missions (Codex-Router orchestrates).
#   usage: run-claude-seat.sh <SEAT-ID> <MODEL> <PACKET-REL-PATH> [--resume <session-id>]
# Visible Terminal window (visible-launch law). Captures the claude session id to
# logs/<SEAT-ID>-claude-session.txt for the board WORKER CLAIM (session ids come
# from the board, never logs). The PACKET is the only scope authority; this
# script carries no file list of its own.
set -u
MISSION="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
REL="docs/missions/2026-08-17-accounts-privacy-security"
SEAT="${1:?seat id required, e.g. T1}"
MODEL="${2:?model required, e.g. claude-opus-5}"
PACKET="${3:?packet path required, relative to repo root}"
RESUME_FLAG="${4:-}"; RESUME_ID="${5:-}"
LOG="${MISSION}/${REL}/logs/${SEAT}-claude.log"
SESSION_FILE="${MISSION}/${REL}/logs/${SEAT}-claude-session.txt"
cd "${MISSION}" || exit 1
[[ -f "${MISSION}/${PACKET}" ]] || { print "REFUSING ${SEAT}: packet ${PACKET} missing" | tee -a "${LOG}"; exit 1; }

if [[ "${RESUME_FLAG}" == "--resume" && -n "${RESUME_ID}" ]]; then
  GOAL="/goal S3-family rework, SAME SESSION. Re-read ${PACKET} in full; it is your contract. Reproduce the reported defect RED against current code before any fix. Do NOT commit or push. Append progress; post REWORK READY FOR PEER REVIEW at the handoff."
  INVOKE="claude --resume ${RESUME_ID} -p \\\"\$(cat '${MISSION}/tmp-goal-${SEAT}.txt')\\\" --model ${MODEL} --permission-mode acceptEdits --output-format json"
else
  GOAL="/goal Read ${PACKET} in full and execute it as the ${SEAT} coding seat. It is your only scope authority. Mandatory RED->GREEN->REFACTOR with reproduce-first. Honor the touch-only file contract and frozen scopes; STOP and post CODEX BLOCKED (worker-blocked) rather than widen. VR-10: mutation-test every security assertion and show it RED against broken code. Real ruled timeouts in any timeout test; no harness that cannot fail. Do NOT commit or push. Append progress to ${REL}/logs/${SEAT}-progress.log; post READY FOR PEER REVIEW when gates pass."
  INVOKE="claude -p \\\"\$(cat '${MISSION}/tmp-goal-${SEAT}.txt')\\\" --model ${MODEL} --permission-mode acceptEdits --output-format json"
fi
print -r -- "${GOAL}" > "${MISSION}/tmp-goal-${SEAT}.txt"

osascript <<APPLESCRIPT >/dev/null
tell application "Terminal"
  do script "printf '\\\\033]0;CLAUDE ${SEAT} (${MODEL})\\\\007'; cd '${MISSION}'; echo '=== ${SEAT} Claude coding seat (${MODEL}) ==='; echo '(this window IS the seat)'; echo; { echo \\"=== ${SEAT} starting \$(date -u +%FT%TZ) ===\\"; ${INVOKE} | tee '${MISSION}/${REL}/logs/${SEAT}-claude-result.json'; echo \\"=== ${SEAT} exited \$(date -u +%FT%TZ) ===\\"; } 2>&1 | tee -a '${LOG}'; python3 -c \\"import json,sys; d=json.load(open('${MISSION}/${REL}/logs/${SEAT}-claude-result.json')); print(d.get('session_id',''))\\" > '${SESSION_FILE}' 2>/dev/null; rm -f '${MISSION}/tmp-goal-${SEAT}.txt'"
  activate
end tell
APPLESCRIPT
print "launched ${SEAT} Claude seat (${MODEL}) in a visible window; log ${LOG}, session -> ${SESSION_FILE}"
