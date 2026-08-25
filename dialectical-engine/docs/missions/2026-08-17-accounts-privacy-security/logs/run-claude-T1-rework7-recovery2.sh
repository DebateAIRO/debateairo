#!/bin/zsh
# Visible Claude Opus recovery launcher after interrupted VR-10 mutation.
set -u

MISSION="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
REL="docs/missions/2026-08-17-accounts-privacy-security"
SCRIPT="${MISSION}/${REL}/logs/run-claude-T1-rework7-recovery2.sh"
SOURCE_PACKET="${REL}/logs/T1-claude-rework7-draft-packet.md"
SOURCE_PACKET_SHA="72e6505c632e6e743e15c63459d81cf5125ba050a4e8e64c37b69c050696bfa8"
RECOVERY_PACKET="${REL}/logs/T1-claude-rework7-recovery2-packet.md"
RECOVERY_PACKET_SHA="635efdf89f5b57a9931d325bbcae17b9e9bf0451fca74eab017d2a12b86b2656"
SESSION="0eda8835-e796-405e-b050-ac2270f723d9"
PREFIX="${MISSION}/${REL}/logs/T1-rework7-recovery2-${SESSION}"
STREAM_LOG="${PREFIX}-claude.jsonl"
EXIT_LOG="${PREFIX}-launcher.log"
STATUS_FILE="${PREFIX}.status"
PID_FILE="${PREFIX}.pid"

if [[ "${1:-}" == "--run" ]]; then
  cd "${MISSION}" || exit 1
  print "$$" > "${PID_FILE}"
  GOAL="/goal Act as the sole fresh visible Claude Opus 5 recovery author for T1 Rework7-A. Read ${RECOVERY_PACKET} completely and verify sha256 ${RECOVERY_PACKET_SHA}; read ${SOURCE_PACKET} completely and verify sha256 ${SOURCE_PACKET_SHA}. Your mandatory first action is to verify custody and restore the interrupted M10 mutation exactly from the verified /tmp/t1r7 baseline as the recovery packet specifies. Then preserve the interruption receipt, refresh the Kanban worker claim, rerun VR-10 using per-mutant foreground interruption-safe restore supervisors, complete the three fresh 100/103 repeats, static gates, and durable handoff. Confine edits to the six governed source/test paths and authorized mission evidence. Do not launch nested agents, Grok, Hermes model, Fable, local models, or overlapping heavy processes. Do not stage, commit, push, move Done, or run repository-wide pnpm test. Do not weaken or substitute the exact full registration-file gate; if the Claude lane cannot hold it, return ROUTER FULL SUITE REQUIRED after all other work and final custody. Return only REWORK READY FOR PEER REVIEW, ROUTER FULL SUITE REQUIRED, or CODEX BLOCKED after all author/test/background children exit and final hashes are durable."
  print "=== Claude Opus T1 Rework7 recovery2 starting $(date -u +%FT%TZ), session ${SESSION} ===" | tee -a "${EXIT_LOG}"
  /Users/vladmihaimiron/.local/bin/claude --session-id "${SESSION}" -p "${GOAL}" \
    --model claude-opus-5 --permission-mode acceptEdits \
    --allowedTools "Bash,Read,Write,Edit,Glob,Grep" \
    --output-format stream-json --verbose 2>&1 | tee "${STREAM_LOG}"
  CLAUDE_STATUS=${pipestatus[1]}
  print "${CLAUDE_STATUS}" > "${STATUS_FILE}"
  print "=== Claude Opus T1 Rework7 recovery2 exited $(date -u +%FT%TZ), status ${CLAUDE_STATUS} ===" | tee -a "${EXIT_LOG}"
  exit "${CLAUDE_STATUS}"
fi

if ! osascript <<APPLESCRIPT >/dev/null
tell application "Terminal"
  do script "zsh '${SCRIPT}' --run"
  activate
end tell
APPLESCRIPT
then
  print "failed to launch visible Claude Opus T1 Rework7 recovery2 terminal" >&2
  exit 1
fi

print "launched visible Claude Opus T1 Rework7 recovery2 session ${SESSION}"
print "stream log: ${STREAM_LOG}"
print "status: ${STATUS_FILE}"
print "pid: ${PID_FILE}"

