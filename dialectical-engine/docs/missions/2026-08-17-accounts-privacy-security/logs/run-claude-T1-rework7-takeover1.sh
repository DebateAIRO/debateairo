#!/bin/zsh
# Visible fresh Claude Opus takeover launcher for T1 Rework7-A.
set -u

MISSION="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
REL="docs/missions/2026-08-17-accounts-privacy-security"
SCRIPT="${MISSION}/${REL}/logs/run-claude-T1-rework7-takeover1.sh"
SOURCE_PACKET="${REL}/logs/T1-claude-rework7-draft-packet.md"
SOURCE_PACKET_SHA="72e6505c632e6e743e15c63459d81cf5125ba050a4e8e64c37b69c050696bfa8"
TAKEOVER_PACKET="${REL}/logs/T1-claude-rework7-takeover1-packet.md"
TAKEOVER_PACKET_SHA="d63b6abe12ac237aafe9aa652063640ea4b64d5d6df26971d9290af00e1501a1"
SESSION="53a219db-3337-45ad-838d-93fb5c4ea78f"
PREFIX="${MISSION}/${REL}/logs/T1-rework7-takeover1-${SESSION}"
STREAM_LOG="${PREFIX}-claude.jsonl"
EXIT_LOG="${PREFIX}-launcher.log"
STATUS_FILE="${PREFIX}.status"
PID_FILE="${PREFIX}.pid"

if [[ "${1:-}" == "--run" ]]; then
  cd "${MISSION}" || exit 1
  print "$$" > "${PID_FILE}"
  GOAL="/goal Act as the sole fresh visible Claude Opus 5 takeover author for T1 Rework7-A. Read ${TAKEOVER_PACKET} completely and verify its sha256 is ${TAKEOVER_PACKET_SHA}; re-read ${SOURCE_PACKET} and verify ${SOURCE_PACKET_SHA}. Verify prior Claude process groups are absent, then verify the exact takeover HEAD/index/12-path manifest. Claim Kanban accounts-phase1 ticket t_b225b2f2 as claude-opus ttl43200 and post WORKER CLAIM. Preserve and continue the current unit, architecture, and integration RED tests. Treat red1-unit as invalid collision evidence; before product/policy edits produce fresh red1b-unit and red3-integration RED receipts and classify red2. Then implement the entire approved six-term contract through GREEN/refactor/real-timeout/VR-10 durable evidence. Confine edits to the six source-packet paths and authorized mission evidence. Do not launch nested agents, Grok, Hermes model, Fable, or local models. Do not stage, commit, push, move Done, run the repo-wide full suite, or touch unrelated dirt. Return only REWORK READY FOR PEER REVIEW, ROUTER FULL SUITE REQUIRED, or CODEX BLOCKED after all foreground children exit and final custody is durable."
  print "=== Claude Opus T1 Rework7 takeover1 starting $(date -u +%FT%TZ), session ${SESSION} ===" | tee -a "${EXIT_LOG}"
  /Users/vladmihaimiron/.local/bin/claude --session-id "${SESSION}" -p "${GOAL}" \
    --model claude-opus-5 --permission-mode acceptEdits \
    --allowedTools "Bash,Read,Write,Edit,Glob,Grep" \
    --output-format stream-json --verbose 2>&1 | tee "${STREAM_LOG}"
  CLAUDE_STATUS=${pipestatus[1]}
  print "${CLAUDE_STATUS}" > "${STATUS_FILE}"
  print "=== Claude Opus T1 Rework7 takeover1 exited $(date -u +%FT%TZ), status ${CLAUDE_STATUS} ===" | tee -a "${EXIT_LOG}"
  exit "${CLAUDE_STATUS}"
fi

if ! osascript <<APPLESCRIPT >/dev/null
tell application "Terminal"
  do script "zsh '${SCRIPT}' --run"
  activate
end tell
APPLESCRIPT
then
  print "failed to launch visible Claude Opus T1 Rework7 takeover1 terminal" >&2
  exit 1
fi

print "launched visible Claude Opus T1 Rework7 takeover1 session ${SESSION}"
print "stream log: ${STREAM_LOG}"
print "status: ${STATUS_FILE}"
print "pid: ${PID_FILE}"
