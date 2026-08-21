#!/bin/zsh
set -u
MISSION="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
REL="docs/missions/2026-08-21-docker-hatchet"
LOG="${MISSION}/${REL}/logs/g3.log"
PROGRESS="${MISSION}/${REL}/logs/g3-progress.log"
PROMPTFILE="${MISSION}/${REL}/logs/g3-goal.txt"
cd "${MISSION}" || exit 1
print "=== G3-DOCKER-GROK starting $(date -u +%FT%TZ) ===" | tee -a "${LOG}" | tee -a "${PROGRESS}"
"${HOME}/.grok/bin/grok" -p "$(cat "${PROMPTFILE}")" \
  -m grok-4.6 \
  --permission-mode bypassPermissions \
  --cwd "${MISSION}" \
  </dev/null 2>&1 | tee -a "${LOG}" | tee -a "${PROGRESS}"
print "=== G3-DOCKER-GROK exited $(date -u +%FT%TZ) ===" | tee -a "${LOG}" | tee -a "${PROGRESS}"
