#!/bin/zsh
# Launch the visible Claude Opus rework-author seat for T1.
set -u

MISSION="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
REL="docs/missions/2026-08-17-accounts-privacy-security"
SCRIPT="${MISSION}/${REL}/logs/run-claude-T1-rework1.sh"
SESSION="44891cbe-5012-48a4-b318-51b48b139ed7"
PACKET_SHA="d18aedac586bb6d0965de6cce8fee8c90d3d43735062e53499a96a5cb33d0424"
LOG="${MISSION}/${REL}/logs/T1-claude-rework1-session.jsonl"
EXIT_LOG="${MISSION}/${REL}/logs/T1-claude-rework1-launcher.log"

if [[ "${1:-}" == "--run" ]]; then
  cd "${MISSION}" || exit 1
  PROMPT="/goal Continue T1 as the visible Claude Opus rework author. Read ${REL}/logs/T1-claude-rework1-packet.md in full and obey it exactly. Refresh Kanban board accounts-phase1 ticket t_b225b2f2 and verify the latest Codex-Router comment binds packet sha256 ${PACKET_SHA}. Claim it for 43200 seconds and post REWORK1 WORKER CLAIM with session ${SESSION}, packet hash, HEAD, empty index, and all entry candidate hashes before editing. Work only in this mission checkout. Implement every binding Sol xHigh finding and Router evidence ruling in the packet; reproduce each defect or missing gate before its fix, preserve the strict 2 MiB RSS threshold in a hermetic child with a retained-allocation positive control, and do not edit the sealed N*=2 row or ratify provisional runtime/RSS bounds. Emit board heartbeats at least every 10 minutes and durable phase evidence to logs/T1-progress.log. Do not launch Grok, Hermes, Fable, or other model agents; hermes kanban is board-client-only. Do not stage, commit, complete, or push. Do not run the full suite. When all rework gates are green, post REWORK1 ROUTER DECISION READY with exact hashes and receipts, then stop. Fail closed with T1 REWORK1 CHANGES REQUESTED on any packet stop condition."
  print "=== Claude Opus T1 rework1 starting $(date -u +%FT%TZ), session ${SESSION} ===" | tee -a "${EXIT_LOG}"
  /Users/vladmihaimiron/.local/bin/claude --session-id "${SESSION}" -p "${PROMPT}" --model claude-opus-5 --permission-mode acceptEdits --allowedTools "Bash,Read,Write,Edit,Glob,Grep" --output-format stream-json --verbose 2>&1 | tee "${LOG}"
  CLAUDE_STATUS=${pipestatus[1]}
  print "=== Claude Opus T1 rework1 exited $(date -u +%FT%TZ), status ${CLAUDE_STATUS} ===" | tee -a "${EXIT_LOG}"
  exit "${CLAUDE_STATUS}"
fi

if ! osascript <<APPLESCRIPT >/dev/null
tell application "Terminal"
  do script "'${SCRIPT}' --run"
  activate
end tell
APPLESCRIPT
then
  print "failed to launch visible Claude Opus T1 rework1 terminal" >&2
  exit 1
fi

print "launched visible Claude Opus T1 rework1 session ${SESSION}"
print "stream log: ${LOG}"
