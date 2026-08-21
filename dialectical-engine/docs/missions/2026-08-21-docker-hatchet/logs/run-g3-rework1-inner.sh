#!/bin/zsh
set -u
MISSION="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
REL="docs/missions/2026-08-21-docker-hatchet"
LOG="${MISSION}/${REL}/logs/g3-rework1.log"
PROGRESS="${MISSION}/${REL}/logs/g3-rework1-progress.log"
PROMPTFILE="${MISSION}/${REL}/logs/g3-rework1-goal.txt"
SESSION="01a023d9-93d0-71d0-a5dd-e04a280efc85"
cd "${MISSION}" || exit 1
print "=== G3 rework-1 starting $(date -u +%FT%TZ) resume ${SESSION} ===" | tee -a "${LOG}" | tee -a "${PROGRESS}"
"${HOME}/.grok/bin/grok" --resume "${SESSION}" -p "$(cat "${PROMPTFILE}")" \
  --permission-mode bypassPermissions \
  --cwd "${MISSION}" \
  </dev/null 2>&1 | tee -a "${LOG}" | tee -a "${PROGRESS}"
print "=== G3 rework-1 exited $(date -u +%FT%TZ) ===" | tee -a "${LOG}" | tee -a "${PROGRESS}"
