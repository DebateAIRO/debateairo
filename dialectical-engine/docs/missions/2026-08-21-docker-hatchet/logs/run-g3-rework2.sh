#!/bin/zsh
set -u
MISSION="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
REL="docs/missions/2026-08-21-docker-hatchet"
PACKET="${REL}/goal-packets/g3-rework2.md"
INNER="${MISSION}/${REL}/logs/run-g3-rework2-inner.sh"
PROMPTFILE="${MISSION}/${REL}/logs/g3-rework2-goal.txt"
cd "${MISSION}" || exit 1
print -r -- "/goal SAME SESSION. Read ${PACKET}. Confirm F-1..F-7 still flipped on current Plan.md. Blind to H2. Step G3-rework-2. Do NOT commit or push." > "${PROMPTFILE}"
chmod +x "${INNER}"
osascript <<APPLESCRIPT >/dev/null
tell application "Terminal"
  do script "printf '\\\\033]0;G3-DOCKER-GROK rework-2\\\\007'; '${INNER}'"
  activate
end tell
APPLESCRIPT
print "launched G3 rework-2"
