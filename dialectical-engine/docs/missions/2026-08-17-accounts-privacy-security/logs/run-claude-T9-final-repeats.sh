#!/bin/zsh
# Resume visible Claude Opus for the final-harness three-repeat evidence gate.
set -u

MISSION="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
REL="docs/missions/2026-08-17-accounts-privacy-security"
SCRIPT="${MISSION}/${REL}/logs/run-claude-T9-final-repeats.sh"
SESSION="41c00784-3135-46ff-8094-4aa66c27611e"
LOG="${MISSION}/${REL}/logs/T9-claude-final-repeats-session.jsonl"
EXIT_LOG="${MISSION}/${REL}/logs/T9-claude-final-repeats-launcher.log"

if [[ "${1:-}" == "--run" ]]; then
  cd "${MISSION}" || exit 1
  PROMPT="/goal Resume T9 as the same visible Claude Opus author for ONE evidence-only final-review rework. Read the latest T9 t_6ff49601 Router FINAL REVIEW CHANGES REQUESTED comment, ${REL}/logs/T9-bounded-lock-order-packet.md, and the final-harness/full-suite sections of ${REL}/logs/T9-progress.log. The product and test candidate are FROZEN: HEAD dc9fd57f6adc10f24907f64f795951cbc2cee28a, empty index, packages/db/src/identity.ts sha256 1454c7445a127cdf7b2258df1ee7d6875c445cd4a1bbfbc842abfa8d48322c70, tests/integration/registration-database.test.ts sha256 c0a177397dd95e82b99c633d252d3a7a0e1e7ef0b9f42444682f1a79ede4359f. Fail closed if custody differs. Do not edit any product/test/source/doc path other than append-only ${REL}/logs/T9-progress.log and new ignored receipt logs. Do not respond to or implement the separate C2 deletion finding: Router has durably assigned that later executable path to S10 t_8664dd93 and has asked the code reviewer for a scope re-ruling. Your only task is the test reviewer's missing variance-reduction evidence. Run the exact complete final T9 focused battery command node_modules/.bin/vitest run tests/integration/registration-database.test.ts -t \"T9\" THREE CONSECUTIVE TIMES on the frozen current hashes. Run them as three separate bounded invocations, not one merged test process. Persist each complete stdout/stderr and exact exit status to ${REL}/logs/T9-final-repeat-1.log/.status, -2, and -3, with pre-run and post-run exact hashes/HEAD/index evidence. Each run must independently report 11 passed, exit 0, zero Errors summary, zero Unhandled Rejection/Error, zero Invalid value used in weak set, zero ELIFECYCLE, zero failed test lines, and retain the frozen statistical/deadlock assertions. Stop immediately on the first nonzero/missing/dirty result; post T9 CHANGES REQUESTED and do not run later repeats. If all three are clean, verify final hashes, HEAD, empty index, git diff --check and exact two-path scope, append an accurate receipt section to T9-progress.log, post READY FOR FINAL RE-REVIEW and a heartbeat to t_6ff49601, then stop. Do not rerun the full suite, adjacent suites, mutants, or any unrelated test. Do not stage, commit, complete, or push. Do not launch Grok, Hermes, or Fable agents/models; hermes kanban is board-client-only."
  print "=== Claude Opus T9 final repeats starting $(date -u +%FT%TZ), session ${SESSION} ===" | tee -a "${EXIT_LOG}"
  /Users/vladmihaimiron/.local/bin/claude --resume "${SESSION}" -p "${PROMPT}" --model claude-opus-5 --permission-mode acceptEdits --allowedTools "Bash,Read,Write,Edit,Glob,Grep" --output-format stream-json --verbose 2>&1 | tee "${LOG}"
  CLAUDE_STATUS=${pipestatus[1]}
  print "=== Claude Opus T9 final repeats exited $(date -u +%FT%TZ), status ${CLAUDE_STATUS} ===" | tee -a "${EXIT_LOG}"
  exit "${CLAUDE_STATUS}"
fi

osascript <<APPLESCRIPT >/dev/null
tell application "Terminal"
  do script "printf '\\\\033]0;CLAUDE OPUS T9 FINAL REPEATS\\\\007'; '${SCRIPT}' --run"
  activate
end tell
APPLESCRIPT

print "launched visible Claude Opus T9 final-repeat session ${SESSION}"
print "stream log: ${LOG}"
