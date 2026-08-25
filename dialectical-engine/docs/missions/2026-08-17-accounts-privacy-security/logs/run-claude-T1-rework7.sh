#!/bin/zsh
# Visible Claude Opus author launcher for approved T1 Rework7-A.
set -u

MISSION="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
REL="docs/missions/2026-08-17-accounts-privacy-security"
SCRIPT="${MISSION}/${REL}/logs/run-claude-T1-rework7.sh"
PACKET="${REL}/logs/T1-claude-rework7-draft-packet.md"
PACKET_SHA="72e6505c632e6e743e15c63459d81cf5125ba050a4e8e64c37b69c050696bfa8"
SESSION="54efe6f8-51bb-4b82-b458-f4d94db30d73"
PREFIX="${MISSION}/${REL}/logs/T1-rework7-${SESSION}"
STREAM_LOG="${PREFIX}-claude.jsonl"
EXIT_LOG="${PREFIX}-launcher.log"
STATUS_FILE="${PREFIX}.status"
PID_FILE="${PREFIX}.pid"

if [[ "${1:-}" == "--run" ]]; then
  cd "${MISSION}" || exit 1
  print "$$" > "${PID_FILE}"
  GOAL="/goal Act as the fresh visible Claude Opus 5 author for T1 Rework7-A. Read ${PACKET} completely and obey it as sole implementation authority. Verify its sha256 is ${PACKET_SHA}, HEAD is 7918f4f8bff33909792afc01dc38d402972b4ccd, the index is empty, and all 12 frozen hashes match before editing. Refresh Kanban board accounts-phase1 ticket t_b225b2f2, verify the latest Codex-Router V DECISIONS PACKET comment binds the same packet hash, claim it as claude-opus for 43200 seconds, and post WORKER CLAIM with session ${SESSION} and custody. Implement only approved Rework7-A with RED-first tests, GREEN, refactor, exact real-timeout gates, VR-10 mutants, durable raw receipts, and T1-rework7-progress.log. Emit Kanban heartbeats at phase transitions and at least every 10 minutes. Do not launch Grok, Hermes model, Fable, local models, or nested agents; hermes kanban is board-client-only. Do not stage, commit, push, move Done, or run the full suite. Return at REWORK READY FOR PEER REVIEW, ROUTER FULL SUITE REQUIRED if the packet requires Router custody, or CODEX BLOCKED with the exact stop condition. Remain in this visible terminal until every foreground child exits and final custody is written."
  print "=== Claude Opus T1 Rework7 starting $(date -u +%FT%TZ), session ${SESSION} ===" | tee -a "${EXIT_LOG}"
  /Users/vladmihaimiron/.local/bin/claude --session-id "${SESSION}" -p "${GOAL}" \
    --model claude-opus-5 --permission-mode acceptEdits \
    --allowedTools "Bash,Read,Write,Edit,Glob,Grep" \
    --output-format stream-json --verbose 2>&1 | tee "${STREAM_LOG}"
  CLAUDE_STATUS=${pipestatus[1]}
  print "${CLAUDE_STATUS}" > "${STATUS_FILE}"
  print "=== Claude Opus T1 Rework7 exited $(date -u +%FT%TZ), status ${CLAUDE_STATUS} ===" | tee -a "${EXIT_LOG}"
  exit "${CLAUDE_STATUS}"
fi

if ! osascript <<APPLESCRIPT >/dev/null
tell application "Terminal"
  do script "zsh '${SCRIPT}' --run"
  activate
end tell
APPLESCRIPT
then
  print "failed to launch visible Claude Opus T1 Rework7 terminal" >&2
  exit 1
fi

print "launched visible Claude Opus T1 Rework7 session ${SESSION}"
print "stream log: ${STREAM_LOG}"
print "status: ${STATUS_FILE}"
print "pid: ${PID_FILE}"
