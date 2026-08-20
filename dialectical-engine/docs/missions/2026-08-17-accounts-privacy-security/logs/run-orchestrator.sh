#!/bin/zsh
set -u
MISSION="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
REL="docs/missions/2026-08-17-accounts-privacy-security"
[[ -f "${MISSION}/${REL}/logs/ORCH-goal.txt" ]] || { print "REFUSING: ORCH-goal.txt missing"; exit 1; }
osascript -e "tell application \"Terminal\" to do script \"'${MISSION}/${REL}/logs/ORCH-inner.sh'\"" -e 'tell application "Terminal" to activate' >/dev/null
print "launched Codex-Router in a visible window; log ${MISSION}/${REL}/logs/ORCH-codex.log"
