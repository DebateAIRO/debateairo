#!/bin/zsh
set -u
MISSION="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
REL="docs/missions/2026-08-21-docker-hatchet"
PACKET="${REL}/goal-packets/c2-rework3.md"
INNER="${MISSION}/${REL}/logs/run-c2-rework3-inner.sh"
PROMPTFILE="${MISSION}/${REL}/logs/c2-rework3-goal.txt"
cd "${MISSION}" || exit 1
print -r -- "/goal LAST rework (round 3 of 3). Read ${PACKET}. Keep G3 F-1..F-7. Fix remaining H2-03..H2-09 residuals in current H2-plan-review.md. Reproduce-first. Step C2-rework-3. Do NOT commit or push." > "${PROMPTFILE}"
chmod +x "${INNER}"
osascript <<APPLESCRIPT >/dev/null
tell application "Terminal"
  do script "printf '\\\\033]0;C2-DOCKER-OPUS rework-3 LAST\\\\007'; '${INNER}'"
  activate
end tell
APPLESCRIPT
print "launched C2 rework-3 LAST"
