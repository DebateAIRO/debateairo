#!/bin/zsh
set -u
MISSION="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
REL="docs/missions/2026-08-21-docker-hatchet"
PACKET="${REL}/goal-packets/g3-rework1.md"
INNER="${MISSION}/${REL}/logs/run-g3-rework1-inner.sh"
PROMPTFILE="${MISSION}/${REL}/logs/g3-rework1-goal.txt"
cd "${MISSION}" || exit 1
[[ -f "${MISSION}/${PACKET}" ]] || { print "REFUSING G3 rework-1: packet missing"; exit 1; }
print -r -- "/goal SAME SESSION re-review. Read ${PACKET} in full. Confirm F-1..F-7 against current Plan.md. Blind to H2. Hermes Agent forbidden. Do NOT commit or push." > "${PROMPTFILE}"
chmod +x "${INNER}"
osascript <<APPLESCRIPT >/dev/null
tell application "Terminal"
  do script "printf '\\\\033]0;G3-DOCKER-GROK rework-1\\\\007'; echo '(this window IS the seat)'; '${INNER}'"
  activate
end tell
APPLESCRIPT
print "launched G3 rework-1 resume 01a023d9-93d0-71d0-a5dd-e04a280efc85"
