#!/bin/zsh
set -u
MISSION_DIR="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
TICKET="${1:?ticket id}"; PACKET="${2:?packet path}"; LABEL="${3:?label}"
LOG="${MISSION_DIR}/docs/missions/2026-08-17-accounts-privacy-security/logs/${LABEL}-codex.log"
cd "${MISSION_DIR}" || exit 1
[[ -f "${PACKET}" ]] || { print "REFUSING ${LABEL}: packet ${PACKET} missing" | tee -a "${LOG}"; exit 1; }
if pgrep -f "codex exec" >/dev/null 2>&1; then
  print "REFUSING ${LABEL}: a codex exec is already alive" | tee -a "${LOG}"; pgrep -lf "codex exec" | tee -a "${LOG}"; exit 1
fi
print "=== ${LABEL} Codex (gpt-5.6-sol xhigh) starting $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
codex exec \
  -c model='"gpt-5.6-sol"' \
  -c model_reasoning_effort='"xhigh"' \
  -c sandbox_mode='"danger-full-access"' \
  "/goal Read ${PACKET} in full and execute it. It is your complete goal packet. Board accounts-phase1, ticket ${TICKET}. Claim it first (hermes kanban --board accounts-phase1 claim ${TICKET} --ttl 43200), then work it TDD. Honour the file contract exactly. Append a progress line per major step to the progress log named in the packet. Do NOT commit or push. Post READY FOR PEER REVIEW as a ticket comment when the gates pass, then return." \
  </dev/null 2>&1 | tee -a "${LOG}"
print "=== ${LABEL} Codex exited $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
