#!/bin/zsh
set -u
MISSION="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
REL="docs/missions/2026-08-21-docker-hatchet"
LOG="${MISSION}/${REL}/logs/h2-rework2.log"
PROMPTFILE="${MISSION}/${REL}/logs/h2-rework2-goal.txt"
SESSION="01a023d9-941c-7933-a618-2d944dbb51a5"
CODEX="/Applications/ChatGPT.app/Contents/Resources/codex"
export PATH="/Applications/ChatGPT.app/Contents/Resources:${PATH}"
cd "${MISSION}" || exit 1
print "=== H2 rework-2 starting $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
"${CODEX}" exec resume "${SESSION}" -c model='"gpt-5.6-sol"' -c model_reasoning_effort='"xhigh"' -c sandbox_mode='"danger-full-access"' "$(cat "${PROMPTFILE}")" </dev/null 2>&1 | tee -a "${LOG}"
print "=== H2 rework-2 exited $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
