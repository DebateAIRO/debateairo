#!/bin/zsh
set -u
MISSION="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
REL="docs/missions/2026-08-21-docker-hatchet"
LOG="${MISSION}/${REL}/logs/c2-rework1.log"
PROGRESS="${MISSION}/${REL}/logs/c2-rework1-progress.log"
PROMPTFILE="${MISSION}/${REL}/logs/c2-rework1-goal.txt"
SESSION="353f7aa5-5955-4e9b-8601-812810039d2b"
cd "${MISSION}" || exit 1
print "=== C2-DOCKER-OPUS rework-1 starting $(date -u +%FT%TZ) resume ${SESSION} ===" | tee -a "${LOG}" | tee -a "${PROGRESS}"
/Users/vladmihaimiron/.local/bin/claude --resume "${SESSION}" -p "$(cat "${PROMPTFILE}")" \
  --model claude-opus-5 \
  --permission-mode acceptEdits \
  --allowedTools 'Bash,Read,Write,Edit,Glob,Grep' \
  --output-format json \
  2>&1 | tee -a "${LOG}" | tee -a "${PROGRESS}"
print "=== C2-DOCKER-OPUS rework-1 exited $(date -u +%FT%TZ) ===" | tee -a "${LOG}" | tee -a "${PROGRESS}"
