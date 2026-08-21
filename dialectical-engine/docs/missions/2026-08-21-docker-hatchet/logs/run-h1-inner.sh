#!/bin/zsh
# H1 recut: Grok 4.6. Hermes Agent is forbidden (V 2026-08-21).
set -u
MISSION="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
REL="docs/missions/2026-08-21-docker-hatchet"
LOG="${MISSION}/${REL}/logs/h1-grok.log"
PROGRESS="${MISSION}/${REL}/logs/h1-grok-progress.log"
PROMPTFILE="${MISSION}/${REL}/logs/h1-goal.txt"
cd "${MISSION}" || exit 1
print "=== H1-DOCKER-GROK starting $(date -u +%FT%TZ) ===" | tee -a "${LOG}" | tee -a "${PROGRESS}"
"${HOME}/.grok/bin/grok" -p "$(cat "${PROMPTFILE}")" \
  -m grok-4.6 \
  --permission-mode bypassPermissions \
  --cwd "${MISSION}" \
  </dev/null 2>&1 | tee -a "${LOG}" | tee -a "${PROGRESS}"
print "=== H1-DOCKER-GROK exited $(date -u +%FT%TZ) ===" | tee -a "${LOG}" | tee -a "${PROGRESS}"
