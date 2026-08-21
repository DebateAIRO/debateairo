#!/bin/zsh
# Inner seat body — run inside the visible Terminal window. No AppleScript quoting.
set -u
MISSION="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
REL="docs/missions/2026-08-21-docker-hatchet"
LOG="${MISSION}/${REL}/logs/codex.log"
PROGRESS="${MISSION}/${REL}/logs/codex-progress.log"
PROMPTFILE="${MISSION}/${REL}/logs/codex-goal.txt"
CODEX="/Applications/ChatGPT.app/Contents/Resources/codex"
export PATH="/Applications/ChatGPT.app/Contents/Resources:${PATH}"
cd "${MISSION}" || exit 1
print "=== REQ-DOCKER-CODEX starting $(date -u +%FT%TZ) ===" | tee -a "${LOG}" | tee -a "${PROGRESS}"
"${CODEX}" exec \
  -c model='"gpt-5.6-sol"' \
  -c model_reasoning_effort='"xhigh"' \
  -c sandbox_mode='"danger-full-access"' \
  "$(cat "${PROMPTFILE}")" \
  </dev/null 2>&1 | tee -a "${LOG}" | tee -a "${PROGRESS}"
print "=== REQ-DOCKER-CODEX exited $(date -u +%FT%TZ) ===" | tee -a "${LOG}" | tee -a "${PROGRESS}"
