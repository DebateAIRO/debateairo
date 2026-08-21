#!/bin/zsh
set -u
MISSION="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
REL="docs/missions/2026-08-21-docker-hatchet"
LOG="${MISSION}/${REL}/logs/synth.log"
PROGRESS="${MISSION}/${REL}/logs/synth-progress.log"
PROMPTFILE="${MISSION}/${REL}/logs/synth-goal.txt"
cd "${MISSION}" || exit 1
print "=== REQ-DOCKER-SYNTH starting $(date -u +%FT%TZ) ===" | tee -a "${LOG}" | tee -a "${PROGRESS}"
/Users/vladmihaimiron/.local/bin/claude -p "$(cat "${PROMPTFILE}")" \
  --model claude-opus-5 \
  --permission-mode acceptEdits \
  --allowedTools 'Bash,Read,Write,Edit,Glob,Grep' \
  --output-format json \
  2>&1 | tee -a "${LOG}" | tee -a "${PROGRESS}"
print "=== REQ-DOCKER-SYNTH exited $(date -u +%FT%TZ) ===" | tee -a "${LOG}" | tee -a "${PROGRESS}"
