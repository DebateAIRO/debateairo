#!/bin/zsh
# Launch the visible Claude Opus implementation-author seat for T9.
set -u

MISSION="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
REL="docs/missions/2026-08-17-accounts-privacy-security"
SCRIPT="${MISSION}/${REL}/logs/run-claude-T9-implementation.sh"
SESSION="41c00784-3135-46ff-8094-4aa66c27611e"
LOG="${MISSION}/${REL}/logs/T9-claude-implementation-session.jsonl"
EXIT_LOG="${MISSION}/${REL}/logs/T9-claude-implementation-launcher.log"

if [[ "${1:-}" == "--run" ]]; then
  cd "${MISSION}" || exit 1
  PROMPT="/goal Implement T9 as the visible Claude Opus author. Read ${REL}/logs/T9-claude-implementation-packet.md in full and obey it exactly. Refresh Kanban ticket t_6ff49601; confirm it is running, assigned/claimed for Claude-Opus, and the latest Router comment binds packet sha256 e54c720f04cef926b2c1445d614eb7e8fe5efee54d41a50edef8bbd7b827040b. Work in this mission checkout, not the empty Kanban scratch workspace. Verify entry HEAD and both gold hashes before any edit. Reproduce the real HTTP 500/40P01 race first, append durable evidence to logs/T9-progress.log, implement only the minimal recordVerificationDelivery c-then-u lock-order alignment if the reproduction is real, and execute the full test/mutation/equivalence contract. Emit Kanban heartbeats at least every 10 minutes and at phase transitions. Do not launch Hermes or Fable agents/models; hermes kanban is board-client-only. Do not stage, commit, complete, or push. The full suite exceeds your Bash ceiling: once all pre-full-suite gates are green, stop and post/request ROUTER FULL SUITE REQUIRED with exact pre-gate hashes; Router will run the sole-heavy durable visible lane, then resume this same session to consume it. On complete pre-review green evidence, post READY FOR PEER REVIEW and return T9 CLAUDE READY FOR PEER REVIEW. Fail closed with T9 CHANGES REQUESTED on any packet stop condition."
  print "=== Claude Opus T9 implementation starting $(date -u +%FT%TZ), session ${SESSION} ===" | tee -a "${EXIT_LOG}"
  /Users/vladmihaimiron/.local/bin/claude --session-id "${SESSION}" -p "${PROMPT}" --model claude-opus-5 --permission-mode acceptEdits --allowedTools "Bash,Read,Write,Edit,Glob,Grep" --output-format stream-json --verbose 2>&1 | tee "${LOG}"
  CLAUDE_STATUS=${pipestatus[1]}
  print "=== Claude Opus T9 implementation exited $(date -u +%FT%TZ), status ${CLAUDE_STATUS} ===" | tee -a "${EXIT_LOG}"
  exit "${CLAUDE_STATUS}"
fi

osascript <<APPLESCRIPT >/dev/null
tell application "Terminal"
  do script "printf '\\\\033]0;CLAUDE OPUS T9 IMPLEMENTATION\\\\007'; '${SCRIPT}' --run"
  activate
end tell
APPLESCRIPT

print "launched visible Claude Opus T9 implementation session ${SESSION}"
print "stream log: ${LOG}"
