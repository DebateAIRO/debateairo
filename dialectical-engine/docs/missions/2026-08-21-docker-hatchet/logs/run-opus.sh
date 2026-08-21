#!/bin/zsh
# REQ-DOCKER-OPUS — Claude Opus 5 requirements research (parallel blind).
# Visible Terminal window (visible-launch law). Prompt via file, never inline argv.
set -u
MISSION="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
REL="docs/missions/2026-08-21-docker-hatchet"
PACKET="${REL}/goal-packets/opus.md"
LOG="${MISSION}/${REL}/logs/opus.log"
PROGRESS="${MISSION}/${REL}/logs/opus-progress.log"
PROMPTFILE="${MISSION}/${REL}/logs/opus-goal.txt"
cd "${MISSION}" || exit 1
[[ -f "${MISSION}/${PACKET}" ]] || { print "REFUSING REQ-DOCKER-OPUS: packet missing"; exit 1; }
mkdir -p "${MISSION}/${REL}/logs" "${MISSION}/${REL}/research" "${MISSION}/${REL}/agent-reports"

print -r -- "/goal Read ${PACKET} in full and execute it. It is your complete contract. Write ONLY the allowed artifact paths. Independent and blind: do not read other seats. Requirements only, no code, no compose edits. Freeze: do not touch accounts-privacy-security WIP. Emit READY FOR HERMES STAGE REVIEW when done. Do NOT commit or push." > "${PROMPTFILE}"

osascript <<APPLESCRIPT >/dev/null
tell application "Terminal"
  do script "printf '\\\\033]0;REQ-DOCKER-OPUS claude-opus-5\\\\007'; cd '${MISSION}'; echo '=== REQ-DOCKER-OPUS Claude Opus 5 ==='; echo '(this window IS the seat — closing it stops the seat)'; echo; { echo \\"=== REQ-DOCKER-OPUS starting \$(date -u +%FT%TZ) ===\\"; /Users/vladmihaimiron/.local/bin/claude -p \\"\$(cat '${PROMPTFILE}')\\" --model claude-opus-5 --permission-mode acceptEdits --allowedTools 'Bash,Read,Write,Edit,Glob,Grep,WebSearch,WebFetch' --output-format json; echo \\"=== REQ-DOCKER-OPUS exited \$(date -u +%FT%TZ) ===\\"; } 2>&1 | tee -a '${LOG}' | tee -a '${PROGRESS}'"
  activate
end tell
APPLESCRIPT
print "launched REQ-DOCKER-OPUS in a visible Terminal window; log ${LOG}"
