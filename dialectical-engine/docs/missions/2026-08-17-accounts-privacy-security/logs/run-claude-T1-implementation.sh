#!/bin/zsh
# Launch the visible Claude Opus implementation-author seat for T1.
set -u

MISSION="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
REL="docs/missions/2026-08-17-accounts-privacy-security"
SCRIPT="${MISSION}/${REL}/logs/run-claude-T1-implementation.sh"
SESSION="1e41b5f5-613b-4fc2-91c1-21fb27892b93"
LOG="${MISSION}/${REL}/logs/T1-claude-implementation-session.jsonl"
EXIT_LOG="${MISSION}/${REL}/logs/T1-claude-implementation-launcher.log"

if [[ "${1:-}" == "--run" ]]; then
  cd "${MISSION}" || exit 1
  PROMPT="/goal Implement T1 as the visible Claude Opus author. Read ${REL}/logs/T1-claude-implementation-packet.md in full and obey it exactly. Refresh Kanban board accounts-phase1 ticket t_b225b2f2; verify the latest Codex-Router comment binds packet sha256 96d54da0b7737b010efe9765e9a0f29e0ade307bc4070689f8487ce33a0b49ff, assign it to claude-opus if needed, claim it for 43200 seconds, and post WORKER CLAIM with session ${SESSION}. Work in this mission checkout, not the empty Kanban scratch workspace. Verify entry HEAD 694b8c06d7194ef5f3c3da5dee745beae847e605, empty index, and every packet gold hash before editing. Reproduce the direct Argon2 event-loop freeze first and append durable evidence to logs/T1-progress.log. Then implement only the bounded packet architecture using the validated strip-only TypeScript worker with execArgv empty, one shared two-worker pool, fair bounded lanes, IP-only privacy-safe cache, and audit KDF completion before database transaction entry. Preserve all frozen auth policy values and accepted approximately-103 capacity. Emit Kanban heartbeats at least every 10 minutes and phase transitions. Do not launch Grok, Hermes, or Fable agents/models; hermes kanban is board-client-only. Do not stage, commit, complete, or push. Treat 2 workers, lane caps 32/96, cache cap 4096 and TTL 60 seconds as provisional engineering bounds pending V ratification and measured RSS; stop rather than silently change them. The full suite exceeds a normal Claude Bash ceiling: after all pre-full-suite gates are green, post ROUTER FULL SUITE REQUIRED with exact hashes and stop. Router will run the exclusive durable visible lane and resume this same session. On complete pre-review green evidence, post READY FOR PEER REVIEW and return T1 CLAUDE READY FOR PEER REVIEW. Fail closed with T1 CHANGES REQUESTED on any packet stop condition."
  print "=== Claude Opus T1 implementation starting $(date -u +%FT%TZ), session ${SESSION} ===" | tee -a "${EXIT_LOG}"
  /Users/vladmihaimiron/.local/bin/claude --session-id "${SESSION}" -p "${PROMPT}" --model claude-opus-5 --permission-mode acceptEdits --allowedTools "Bash,Read,Write,Edit,Glob,Grep" --output-format stream-json --verbose 2>&1 | tee "${LOG}"
  CLAUDE_STATUS=${pipestatus[1]}
  print "=== Claude Opus T1 implementation exited $(date -u +%FT%TZ), status ${CLAUDE_STATUS} ===" | tee -a "${EXIT_LOG}"
  exit "${CLAUDE_STATUS}"
fi

osascript <<APPLESCRIPT >/dev/null
tell application "Terminal"
  do script "printf '\\\\033]0;CLAUDE OPUS T1 IMPLEMENTATION\\\\007'; '${SCRIPT}' --run"
  activate
end tell
APPLESCRIPT

print "launched visible Claude Opus T1 implementation session ${SESSION}"
print "stream log: ${LOG}"
