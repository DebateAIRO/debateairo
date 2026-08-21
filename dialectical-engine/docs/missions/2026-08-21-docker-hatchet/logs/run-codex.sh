#!/bin/zsh
# REQ-DOCKER-CODEX — gpt-5.6-sol @ xhigh requirements research (parallel blind).
# Visible Terminal window. Inner script owns the exec so AppleScript never quotes it.
set -u
MISSION="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
REL="docs/missions/2026-08-21-docker-hatchet"
PACKET="${REL}/goal-packets/codex.md"
INNER="${MISSION}/${REL}/logs/run-codex-inner.sh"
PROMPTFILE="${MISSION}/${REL}/logs/codex-goal.txt"
cd "${MISSION}" || exit 1
[[ -f "${MISSION}/${PACKET}" ]] || { print "REFUSING REQ-DOCKER-CODEX: packet missing"; exit 1; }
[[ -x "/Applications/ChatGPT.app/Contents/Resources/codex" ]] || { print "REFUSING REQ-DOCKER-CODEX: codex binary missing"; exit 1; }
mkdir -p "${MISSION}/${REL}/logs" "${MISSION}/${REL}/research" "${MISSION}/${REL}/agent-reports"
print -r -- "/goal Read ${PACKET} in full and execute it. It is your complete contract. Write ONLY the allowed artifact paths. Independent and blind: do not read other seats. Requirements only, no code, no compose edits. Freeze: do not touch accounts-privacy-security WIP. Emit READY FOR HERMES STAGE REVIEW when done. Do NOT commit or push." > "${PROMPTFILE}"
chmod +x "${INNER}"

osascript <<APPLESCRIPT >/dev/null
tell application "Terminal"
  do script "printf '\\\\033]0;REQ-DOCKER-CODEX gpt-5.6-sol xhigh\\\\007'; echo '(this window IS the seat — closing it stops the seat)'; '${INNER}'"
  activate
end tell
APPLESCRIPT
print "launched REQ-DOCKER-CODEX in a visible Terminal window; inner ${INNER}"
