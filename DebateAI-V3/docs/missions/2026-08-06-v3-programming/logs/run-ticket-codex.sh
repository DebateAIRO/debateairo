#!/bin/zsh
# Generic Codex coding seat launcher — PROG-V3-R1, roster DR-153.
#   usage: run-ticket-codex.sh <ticket-id> <goal-packet-path> <label>
#
# INVOCATION LAW (DR-168-A): the orchestrator runs THIS SCRIPT as a
# harness-tracked background process — never inside a detached Terminal
# window. The script exits when codex exits, and that exit is the
# orchestrator's wake-up. V watches via logs/open-viewer.sh on ${LABEL}'s
# log (a decoupled tail -f window; closing it kills nothing).
#
# OPS LAW (learned 2026-08-11, EXEC-01): concurrent codex sessions wedge each
# other — three resumes of one session filled the log with
# "Orphan function call output" and made zero progress. This guard refuses to
# launch while any codex exec is alive.
set -u
MISSION_DIR="/Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3"
TICKET="${1:?ticket id required}"
PACKET="${2:?goal packet path required}"
LABEL="${3:?label required}"
LOG="${MISSION_DIR}/docs/missions/2026-08-06-v3-programming/logs/${LABEL}-codex.log"
cd "${MISSION_DIR}" || exit 1


if [[ ! -f "${PACKET}" ]]; then
  print "REFUSING TO LAUNCH ${LABEL}: goal packet ${PACKET} does not exist. Write it first (this exact miss has now happened four times)." | tee -a "${LOG}"
  exit 1
fi

if pgrep -f "codex exec.*(/goal|resume)" >/dev/null 2>&1; then
  print "REFUSING TO LAUNCH ${LABEL}: a codex exec process is already alive." | tee -a "${LOG}"
  pgrep -lf "codex exec.*(/goal|resume)" | tee -a "${LOG}"
  exit 1
fi

print "=== ${LABEL} Codex seat starting $(date -u +%FT%TZ) ===" | tee -a "${LOG}"

codex exec \
  -c model='"gpt-5.6-sol"' \
  -c sandbox_mode='"danger-full-access"' \
  "/goal Read ${PACKET} in full and execute it. It is your complete goal packet. Board debateai-v3, ticket ${TICKET}. Claim it first (hermes kanban --board debateai-v3 claim ${TICKET} --ttl 43200), then work it TDD per docs/missions/2026-08-06-v3-programming/CODING-LOOP-PROTOCOL.md. Append a progress line per major step to the progress log named in the packet." \
  </dev/null 2>&1 | tee -a "${LOG}"

print "=== ${LABEL} Codex seat exited $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
