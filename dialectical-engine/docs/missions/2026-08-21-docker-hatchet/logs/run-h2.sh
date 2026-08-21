#!/bin/zsh
set -u
MISSION="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
REL="docs/missions/2026-08-21-docker-hatchet"
PACKET="${REL}/goal-packets/h2-planreview.md"
INNER="${MISSION}/${REL}/logs/run-h2-inner.sh"
PROMPTFILE="${MISSION}/${REL}/logs/h2-goal.txt"
cd "${MISSION}" || exit 1
[[ -f "${MISSION}/${PACKET}" ]] || { print "REFUSING H2-DOCKER-CODEX: packet missing"; exit 1; }
[[ -x "/Applications/ChatGPT.app/Contents/Resources/codex" ]] || { print "REFUSING H2: codex missing"; exit 1; }
mkdir -p "${MISSION}/${REL}/logs" "${MISSION}/${REL}/architecture" "${MISSION}/${REL}/agent-reports"
print -r -- "/goal Read ${PACKET} in full and execute it. It is your complete contract. H2 Plan review recut (Hermes Agent forbidden). Blind to G3. Do NOT commit or push." > "${PROMPTFILE}"
chmod +x "${INNER}"
osascript <<APPLESCRIPT >/dev/null
tell application "Terminal"
  do script "printf '\\\\033]0;H2-DOCKER-CODEX Plan review\\\\007'; echo '(this window IS the seat — closing it stops the seat)'; '${INNER}'"
  activate
end tell
APPLESCRIPT
print "launched H2-DOCKER-CODEX in a visible Terminal window"
