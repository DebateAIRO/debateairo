#!/bin/zsh
# Resume the visible Claude Opus T9 author with the Router-ratified bounded lock-order packet.
set -u

MISSION="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
REL="docs/missions/2026-08-17-accounts-privacy-security"
SCRIPT="${MISSION}/${REL}/logs/run-claude-T9-bounded-resume.sh"
SESSION="41c00784-3135-46ff-8094-4aa66c27611e"
LOG="${MISSION}/${REL}/logs/T9-claude-bounded-session.jsonl"
EXIT_LOG="${MISSION}/${REL}/logs/T9-claude-bounded-launcher.log"

if [[ "${1:-}" == "--run" ]]; then
  cd "${MISSION}" || exit 1
  PROMPT="/goal Resume T9 as the same visible Claude Opus implementation author after the ruled wider-lock-graph stop. Read ${REL}/logs/T9-bounded-lock-order-packet.md in full and obey it exactly. Refresh Kanban ticket t_6ff49601 and confirm the latest Router authority comment binds packet sha256 f4e94e1440a4fd42c515b81d547c7a7e6ae049fcd72ca79d1650fea46f65a387. Verify continuation HEAD dc9fd57f6adc10f24907f64f795951cbc2cee28a and entry hashes identity 79dbf53024cc9933c4916777b4e2604fe2e0d937bd1dca0f71f0dc6265e9fbed and test 10f2b268f9637164783f94c02bff88e123a661eccb87e8cac9bce3853bdf34b8 before any edit. Add the deterministic real-HTTP A/B1/B2 regressions first and prove the current continuation candidate RED with real 40P01/database-error evidence, then implement the explicit sequential channel -> user -> token lock/revalidation design and the two duplicate-path reorderings. Preserve pruning, duplicate equal work, the first delivery fix, every frozen response/audit/token/statistical gate, and the two-file boundary. Run the explicit-order proof, sibling-token case, mutants 8-10 plus the original seven, final focused repetitions and all adjacent/static/scope gates. Append durable evidence to T9-progress.log and post Kanban heartbeats at phase transitions and at least every 10 minutes. Do not launch Grok, Hermes, or Fable agents/models; hermes kanban is board-client-only. Do not stage, commit, complete, or push. Do not run the 25-minute full suite inside a capped Claude Bash call: after all pre-full-suite gates are green, post ROUTER FULL SUITE REQUIRED with exact hashes and stop for Router's exclusive durable visible lane. After consuming that exit-0 receipt in a later resume, post READY FOR PEER REVIEW for two fresh Sol xHigh reviewers. Fail closed with T9 CHANGES REQUESTED on any bounded-packet stop condition."
  print "=== Claude Opus T9 bounded continuation starting $(date -u +%FT%TZ), session ${SESSION} ===" | tee -a "${EXIT_LOG}"
  /Users/vladmihaimiron/.local/bin/claude --resume "${SESSION}" -p "${PROMPT}" --model claude-opus-5 --permission-mode acceptEdits --allowedTools "Bash,Read,Write,Edit,Glob,Grep" --output-format stream-json --verbose 2>&1 | tee "${LOG}"
  CLAUDE_STATUS=${pipestatus[1]}
  print "=== Claude Opus T9 bounded continuation exited $(date -u +%FT%TZ), status ${CLAUDE_STATUS} ===" | tee -a "${EXIT_LOG}"
  exit "${CLAUDE_STATUS}"
fi

osascript <<APPLESCRIPT >/dev/null
tell application "Terminal"
  do script "printf '\\\\033]0;CLAUDE OPUS T9 BOUNDED CONTINUATION\\\\007'; '${SCRIPT}' --run"
  activate
end tell
APPLESCRIPT

print "launched visible Claude Opus T9 bounded continuation session ${SESSION}"
print "stream log: ${LOG}"
