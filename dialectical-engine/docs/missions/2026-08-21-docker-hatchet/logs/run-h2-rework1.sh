#!/bin/zsh
set -u
MISSION="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
REL="docs/missions/2026-08-21-docker-hatchet"
PACKET="${REL}/goal-packets/h2-rework1.md"
INNER="${MISSION}/${REL}/logs/run-h2-rework1-inner.sh"
PROMPTFILE="${MISSION}/${REL}/logs/h2-rework1-goal.txt"
cd "${MISSION}" || exit 1
[[ -f "${MISSION}/${PACKET}" ]] || { print "REFUSING H2 rework-1: packet missing"; exit 1; }
print -r -- "/goal SAME SESSION re-review. Read ${PACKET} in full. Confirm H2-01..H2-09 against current Plan.md. Blind to G3. Put READY marker IN THE FILE. Do NOT commit or push." > "${PROMPTFILE}"
chmod +x "${INNER}"
osascript <<APPLESCRIPT >/dev/null
tell application "Terminal"
  do script "printf '\\\\033]0;H2-DOCKER-CODEX rework-1\\\\007'; echo '(this window IS the seat)'; '${INNER}'"
  activate
end tell
APPLESCRIPT
print "launched H2 rework-1 resume 01a023d9-941c-7933-a618-2d944dbb51a5"
