#!/bin/zsh
set -u
MISSION="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
REL="docs/missions/2026-08-21-docker-hatchet"
PACKET="${REL}/goal-packets/c2-plan.md"
INNER="${MISSION}/${REL}/logs/run-c2-inner.sh"
PROMPTFILE="${MISSION}/${REL}/logs/c2-goal.txt"
cd "${MISSION}" || exit 1
[[ -f "${MISSION}/${PACKET}" ]] || { print "REFUSING C2-DOCKER-OPUS: packet missing"; exit 1; }
mkdir -p "${MISSION}/${REL}/logs" "${MISSION}/${REL}/architecture" "${MISSION}/${REL}/agent-reports"
print -r -- "/goal Read ${PACKET} in full and execute it. It is your complete contract. C2 Plan.md only. Hermes Agent forbidden. Kanban is localhost:9119 board docker-hatchet. Do NOT commit or push." > "${PROMPTFILE}"
chmod +x "${INNER}"
osascript <<APPLESCRIPT >/dev/null
tell application "Terminal"
  do script "printf '\\\\033]0;C2-DOCKER-OPUS Plan.md\\\\007'; echo '(this window IS the seat — closing it stops the seat)'; '${INNER}'"
  activate
end tell
APPLESCRIPT
print "launched C2-DOCKER-OPUS in a visible Terminal window"
