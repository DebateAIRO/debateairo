#!/bin/zsh
set -u
MISSION="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
REL="docs/missions/2026-08-21-docker-hatchet"
LOG="${MISSION}/${REL}/logs/c2.log"
PROGRESS="${MISSION}/${REL}/logs/c2-progress.log"
PROMPTFILE="${MISSION}/${REL}/logs/c2-goal.txt"
cd "${MISSION}" || exit 1
print "=== C2-DOCKER-OPUS starting $(date -u +%FT%TZ) ===" | tee -a "${LOG}" | tee -a "${PROGRESS}"
/Users/vladmihaimiron/.local/bin/claude -p "$(cat "${PROMPTFILE}")" \
  --model claude-opus-5 \
  --permission-mode acceptEdits \
  --allowedTools 'Bash,Read,Write,Edit,Glob,Grep' \
  --output-format json \
  2>&1 | tee -a "${LOG}" | tee -a "${PROGRESS}"
print "=== C2-DOCKER-OPUS exited $(date -u +%FT%TZ) ===" | tee -a "${LOG}" | tee -a "${PROGRESS}"
