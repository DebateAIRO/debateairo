#!/bin/zsh
# Launch the visible Claude Opus board-custody seat for S3 parent closure.
set -u

MISSION="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
REL="docs/missions/2026-08-17-accounts-privacy-security"
SCRIPT="${MISSION}/${REL}/logs/run-claude-S3-parent-close.sh"
SESSION="fc8270c5-a617-467e-916a-22cd390de00b"
LOG="${MISSION}/${REL}/logs/S3-claude-parent-close-session.jsonl"
EXIT_LOG="${MISSION}/${REL}/logs/S3-claude-parent-close-launcher.log"

if [[ "${1:-}" == "--run" ]]; then
  cd "${MISSION}" || exit 1
  PROMPT="/goal Act as the visible Claude Opus board-custody seat for S3. Read ${REL}/logs/S3-claude-parent-close-packet.md in full and obey it exactly. This is board closure only: no product/test edits, no stage/commit/push. Never launch Hermes, Fable, or Grok agents/models; hermes kanban is only the local board client. Return the packet's exact terminal marker."
  print "=== Claude Opus S3 parent close starting $(date -u +%FT%TZ), session ${SESSION} ===" | tee -a "${EXIT_LOG}"
  /Users/vladmihaimiron/.local/bin/claude --session-id "${SESSION}" -p "${PROMPT}" --model claude-opus-5 --permission-mode acceptEdits --allowedTools "Bash,Read,Write,Edit,Glob,Grep" --output-format stream-json --verbose 2>&1 | tee "${LOG}"
  CLAUDE_STATUS=${pipestatus[1]}
  print "=== Claude Opus S3 parent close exited $(date -u +%FT%TZ), status ${CLAUDE_STATUS} ===" | tee -a "${EXIT_LOG}"
  exit "${CLAUDE_STATUS}"
fi

osascript <<APPLESCRIPT >/dev/null
tell application "Terminal"
  do script "printf '\\\\033]0;CLAUDE OPUS S3 PARENT CLOSE\\\\007'; '${SCRIPT}' --run"
  activate
end tell
APPLESCRIPT

print "launched visible Claude Opus S3 parent-close session ${SESSION}"
print "stream log: ${LOG}"
