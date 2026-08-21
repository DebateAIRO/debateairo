#!/bin/zsh
# REQ-DOCKER-GROK — Grok 4.6 requirements research (parallel blind, NEW session).
# Visible Terminal window. Never --fork-session. Prompt via file.
set -u
MISSION="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
REL="docs/missions/2026-08-21-docker-hatchet"
PACKET="${REL}/goal-packets/grok.md"
LOG="${MISSION}/${REL}/logs/grok.log"
PROGRESS="${MISSION}/${REL}/logs/grok-progress.log"
PROMPTFILE="${MISSION}/${REL}/logs/grok-goal.txt"
cd "${MISSION}" || exit 1
[[ -f "${MISSION}/${PACKET}" ]] || { print "REFUSING REQ-DOCKER-GROK: packet missing"; exit 1; }
mkdir -p "${MISSION}/${REL}/logs" "${MISSION}/${REL}/research" "${MISSION}/${REL}/agent-reports"

print -r -- "/goal Read ${PACKET} in full and execute it. It is your complete contract. Write ONLY the allowed artifact paths. You are NOT the orchestrator. Independent and blind: do not read other seats. Use live search for current Hatchet compose/env facts. Requirements only, no code, no compose edits. Freeze: do not touch accounts-privacy-security WIP. Self-report usage or mark UNVERIFIED. Emit READY FOR HERMES STAGE REVIEW when done. Do NOT commit or push." > "${PROMPTFILE}"

osascript <<APPLESCRIPT >/dev/null
tell application "Terminal"
  do script "printf '\\\\033]0;REQ-DOCKER-GROK grok-4.6\\\\007'; cd '${MISSION}'; echo '=== REQ-DOCKER-GROK grok-4.6 (fresh session) ==='; echo '(this window IS the seat — closing it stops the seat)'; echo; { echo \\"=== REQ-DOCKER-GROK starting \$(date -u +%FT%TZ) ===\\"; '${HOME}/.grok/bin/grok' -p \\"\$(cat '${PROMPTFILE}')\\" -m grok-4.6 --permission-mode bypassPermissions --cwd '${MISSION}' </dev/null; echo \\"=== REQ-DOCKER-GROK exited \$(date -u +%FT%TZ) ===\\"; } 2>&1 | tee -a '${LOG}' | tee -a '${PROGRESS}'"
  activate
end tell
APPLESCRIPT
print "launched REQ-DOCKER-GROK in a visible Terminal window; log ${LOG}"
