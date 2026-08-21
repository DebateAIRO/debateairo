#!/bin/zsh
set -u
MISSION="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
REL="docs/missions/2026-08-21-docker-hatchet"
PACKET="${REL}/goal-packets/g3-planreview.md"
INNER="${MISSION}/${REL}/logs/run-g3-inner.sh"
PROMPTFILE="${MISSION}/${REL}/logs/g3-goal.txt"
cd "${MISSION}" || exit 1
[[ -f "${MISSION}/${PACKET}" ]] || { print "REFUSING G3-DOCKER-GROK: packet missing"; exit 1; }
mkdir -p "${MISSION}/${REL}/logs" "${MISSION}/${REL}/architecture" "${MISSION}/${REL}/agent-reports"
print -r -- "/goal Read ${PACKET} in full and execute it. It is your complete contract. Fresh Grok G3 PlanReview, not the orchestrator. Blind to H2. Hermes Agent forbidden. Do NOT commit or push." > "${PROMPTFILE}"
chmod +x "${INNER}"
osascript <<APPLESCRIPT >/dev/null
tell application "Terminal"
  do script "printf '\\\\033]0;G3-DOCKER-GROK PlanReview\\\\007'; echo '(this window IS the seat — closing it stops the seat)'; '${INNER}'"
  activate
end tell
APPLESCRIPT
print "launched G3-DOCKER-GROK in a visible Terminal window"
