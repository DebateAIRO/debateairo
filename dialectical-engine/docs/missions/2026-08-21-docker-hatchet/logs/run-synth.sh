#!/bin/zsh
set -u
MISSION="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
REL="docs/missions/2026-08-21-docker-hatchet"
PACKET="${REL}/goal-packets/synth.md"
INNER="${MISSION}/${REL}/logs/run-synth-inner.sh"
PROMPTFILE="${MISSION}/${REL}/logs/synth-goal.txt"
cd "${MISSION}" || exit 1
[[ -f "${MISSION}/${PACKET}" ]] || { print "REFUSING REQ-DOCKER-SYNTH: packet missing"; exit 1; }
mkdir -p "${MISSION}/${REL}/logs" "${MISSION}/${REL}/research" "${MISSION}/${REL}/agent-reports"
print -r -- "/goal Read ${PACKET} in full and execute it. It is your complete contract. You are a NEW Opus session synthesizing the three blind RE artifacts. Write ONLY the allowed artifact paths. Requirements only. Do NOT commit or push." > "${PROMPTFILE}"
chmod +x "${INNER}"
osascript <<APPLESCRIPT >/dev/null
tell application "Terminal"
  do script "printf '\\\\033]0;REQ-DOCKER-SYNTH claude-opus-5\\\\007'; echo '(this window IS the seat — closing it stops the seat)'; '${INNER}'"
  activate
end tell
APPLESCRIPT
print "launched REQ-DOCKER-SYNTH in a visible Terminal window"
