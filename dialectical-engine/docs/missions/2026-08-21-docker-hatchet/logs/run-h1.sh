#!/bin/zsh
# H1 recut onto Grok. Do not invoke Hermes Agent.
set -u
MISSION="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
REL="docs/missions/2026-08-21-docker-hatchet"
PACKET="${REL}/goal-packets/h1.md"
INNER="${MISSION}/${REL}/logs/run-h1-inner.sh"
PROMPTFILE="${MISSION}/${REL}/logs/h1-goal.txt"
cd "${MISSION}" || exit 1
[[ -f "${MISSION}/${PACKET}" ]] || { print "REFUSING H1-DOCKER-GROK: packet missing"; exit 1; }
mkdir -p "${MISSION}/${REL}/logs" "${MISSION}/${REL}/reviews" "${MISSION}/${REL}/agent-reports"
print -r -- "/goal Read ${PACKET} in full and execute it. It is your complete contract. Fresh Grok session, not the orchestrator. H1 integrity only. Do not use Hermes Agent. Do NOT commit or push." > "${PROMPTFILE}"
chmod +x "${INNER}"
osascript <<APPLESCRIPT >/dev/null
tell application "Terminal"
  do script "printf '\\\\033]0;H1-DOCKER-GROK integrity\\\\007'; echo '(this window IS the seat — closing it stops the seat)'; '${INNER}'"
  activate
end tell
APPLESCRIPT
print "launched H1-DOCKER-GROK in a visible Terminal window"
