#!/bin/zsh
set -u
MISSION="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
REL="docs/missions/2026-08-21-docker-hatchet"
PACKET="${REL}/goal-packets/h2-rework2.md"
INNER="${MISSION}/${REL}/logs/run-h2-rework2-inner.sh"
PROMPTFILE="${MISSION}/${REL}/logs/h2-rework2-goal.txt"
cd "${MISSION}" || exit 1
print -r -- "/goal SAME SESSION P8. Read ${PACKET}. Confirm H2-03..H2-09 against current Plan.md. Marker IN THE FILE. Step H2-rework-2. Blind to G3. Do NOT commit or push." > "${PROMPTFILE}"
chmod +x "${INNER}"
osascript <<APPLESCRIPT >/dev/null
tell application "Terminal"
  do script "printf '\\\\033]0;H2-DOCKER-CODEX rework-2\\\\007'; '${INNER}'"
  activate
end tell
APPLESCRIPT
print "launched H2 rework-2"
