#!/bin/zsh
# Visible Claude Opus recovery launcher for interrupted T1 Rework7-A authoring.
set -u

MISSION="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
REL="docs/missions/2026-08-17-accounts-privacy-security"
SCRIPT="${MISSION}/${REL}/logs/run-claude-T1-rework7-resume1.sh"
SOURCE_PACKET="${REL}/logs/T1-claude-rework7-draft-packet.md"
SOURCE_PACKET_SHA="72e6505c632e6e743e15c63459d81cf5125ba050a4e8e64c37b69c050696bfa8"
RECOVERY_PACKET="${REL}/logs/T1-claude-rework7-resume1-packet.md"
RECOVERY_PACKET_SHA="895b7c1a8c9d12f2848f28a5d0b8e0a3bb326885f49448c620b6ae38683ffc03"
SOURCE_SESSION="54efe6f8-51bb-4b82-b458-f4d94db30d73"
RECOVERY_ID="2cd54ad7-a704-4b11-845a-32a94791ea0a"
PREFIX="${MISSION}/${REL}/logs/T1-rework7-resume1-${RECOVERY_ID}"
STREAM_LOG="${PREFIX}-claude.jsonl"
EXIT_LOG="${PREFIX}-launcher.log"
STATUS_FILE="${PREFIX}.status"
PID_FILE="${PREFIX}.pid"

if [[ "${1:-}" == "--run" ]]; then
  cd "${MISSION}" || exit 1
  print "$$" > "${PID_FILE}"
  GOAL="/goal Resume the interrupted visible Claude Opus 5 author conversation ${SOURCE_SESSION} for T1 Rework7-A. Read ${RECOVERY_PACKET} completely and verify its sha256 is ${RECOVERY_PACKET_SHA}; also re-read ${SOURCE_PACKET} and verify ${SOURCE_PACKET_SHA}. Obey the recovery packet's current manifest and the source packet's approved six-term product contract. The prior Terminal/wrapper died without a status receipt or handoff after partially editing the allowed unit test and writing /tmp/t1r7/unit-append.ts. Preserve, inspect, and continue that work; do not restore it to the original entry hash. Refresh and claim Kanban accounts-phase1 ticket t_b225b2f2 as claude-opus ttl43200; post recovery WORKER CLAIM and heartbeats. Continue RED-first through GREEN/refactor/real-timeout/VR-10 durable evidence. Do not launch nested agents, Grok, Hermes model, Fable, or local models. Do not stage, commit, push, move Done, run the repo-wide full suite, or touch unrelated dirt. Return only REWORK READY FOR PEER REVIEW, ROUTER FULL SUITE REQUIRED, or CODEX BLOCKED after all foreground children exit and final custody is durable."
  print "=== Claude Opus T1 Rework7 resume1 starting $(date -u +%FT%TZ), source ${SOURCE_SESSION}, recovery ${RECOVERY_ID} ===" | tee -a "${EXIT_LOG}"
  /Users/vladmihaimiron/.local/bin/claude --resume "${SOURCE_SESSION}" -p "${GOAL}" \
    --model claude-opus-5 --permission-mode acceptEdits \
    --allowedTools "Bash,Read,Write,Edit,Glob,Grep" \
    --output-format stream-json --verbose 2>&1 | tee "${STREAM_LOG}"
  CLAUDE_STATUS=${pipestatus[1]}
  print "${CLAUDE_STATUS}" > "${STATUS_FILE}"
  print "=== Claude Opus T1 Rework7 resume1 exited $(date -u +%FT%TZ), status ${CLAUDE_STATUS} ===" | tee -a "${EXIT_LOG}"
  exit "${CLAUDE_STATUS}"
fi

if ! osascript <<APPLESCRIPT >/dev/null
tell application "Terminal"
  do script "zsh '${SCRIPT}' --run"
  activate
end tell
APPLESCRIPT
then
  print "failed to launch visible Claude Opus T1 Rework7 resume1 terminal" >&2
  exit 1
fi

print "launched visible Claude Opus T1 Rework7 resume1 from ${SOURCE_SESSION}"
print "stream log: ${STREAM_LOG}"
print "status: ${STATUS_FILE}"
print "pid: ${PID_FILE}"
