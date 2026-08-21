#!/bin/zsh
set -u
MISSION="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
REL="docs/missions/2026-08-21-docker-hatchet"
PACKET="${REL}/goal-packets/c2-rework1.md"
INNER="${MISSION}/${REL}/logs/run-c2-rework1-inner.sh"
PROMPTFILE="${MISSION}/${REL}/logs/c2-rework1-goal.txt"
cd "${MISSION}" || exit 1
[[ -f "${MISSION}/${PACKET}" ]] || { print "REFUSING C2 rework-1: packet missing"; exit 1; }
print -r -- "/goal S3-family rework, SAME SESSION. Re-read ${PACKET} in full; it is your contract. Union G3 F-1..F-7 and H2-01..H2-09 into Plan.md. Reproduce each finding against current Plan.md before rewriting. Do NOT commit or push. Post REWORK READY FOR PEER REVIEW." > "${PROMPTFILE}"
chmod +x "${INNER}"
osascript <<APPLESCRIPT >/dev/null
tell application "Terminal"
  do script "printf '\\\\033]0;C2-DOCKER-OPUS rework-1\\\\007'; echo '(this window IS the seat — closing it stops the seat)'; '${INNER}'"
  activate
end tell
APPLESCRIPT
print "launched C2-DOCKER-OPUS rework-1 (resume 353f7aa5-5955-4e9b-8601-812810039d2b)"
