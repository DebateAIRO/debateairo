#!/bin/zsh
set -u
MISSION="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
REL="docs/missions/2026-08-21-docker-hatchet"
PACKET="${REL}/goal-packets/c2-rework2.md"
INNER="${MISSION}/${REL}/logs/run-c2-rework2-inner.sh"
PROMPTFILE="${MISSION}/${REL}/logs/c2-rework2-goal.txt"
cd "${MISSION}" || exit 1
[[ -f "${MISSION}/${PACKET}" ]] || { print "REFUSING C2 rework-2: packet missing"; exit 1; }
print -r -- "/goal SAME SESSION rework round 2. Read ${PACKET}. Keep G3 F-1..F-7 flips. Fix only remaining H2-03..H2-09. Reproduce-first. Do NOT commit or push. Post REWORK READY FOR PEER REVIEW with step C2-rework-2." > "${PROMPTFILE}"
chmod +x "${INNER}"
osascript <<APPLESCRIPT >/dev/null
tell application "Terminal"
  do script "printf '\\\\033]0;C2-DOCKER-OPUS rework-2\\\\007'; echo '(this window IS the seat)'; '${INNER}'"
  activate
end tell
APPLESCRIPT
print "launched C2 rework-2 resume 353f7aa5-5955-4e9b-8601-812810039d2b"
