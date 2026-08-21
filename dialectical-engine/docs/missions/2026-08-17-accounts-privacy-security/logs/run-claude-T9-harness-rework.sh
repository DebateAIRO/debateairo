#!/bin/zsh
# Resume visible Claude Opus for the T9 full-suite harness-only rework.
set -u

MISSION="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
REL="docs/missions/2026-08-17-accounts-privacy-security"
SCRIPT="${MISSION}/${REL}/logs/run-claude-T9-harness-rework.sh"
SESSION="41c00784-3135-46ff-8094-4aa66c27611e"
LOG="${MISSION}/${REL}/logs/T9-claude-harness-rework-session.jsonl"
EXIT_LOG="${MISSION}/${REL}/logs/T9-claude-harness-rework-launcher.log"

if [[ "${1:-}" == "--run" ]]; then
  cd "${MISSION}" || exit 1
  PROMPT="/goal Resume T9 as the same visible Claude Opus author for a harness-only rework after Router's full-suite exit-1 receipt. Read ${REL}/logs/T9-bounded-lock-order-packet.md, ${REL}/logs/T9-progress.log, and the complete receipt files ${REL}/logs/T9-router-full-suite.log, .status, .before.sha256, and .after.sha256. Refresh ticket t_6ff49601 and its latest Router CHANGES REQUESTED comment. Verify HEAD dc9fd57f6adc10f24907f64f795951cbc2cee28a, empty index, identity hash 1454c7445a127cdf7b2258df1ee7d6875c445cd4a1bbfbc842abfa8d48322c70, test hash 58fd57ef1d7d10d0ea6ef288d885912b90f3ae43293efb89798da0dd22041e18, and byte-identical before/after receipts before any edit. The receipt is NOT green: 110/110 files and 830/830 tests passed, but 128 unhandled TypeError Invalid value used in weak set errors at registration-database.test.ts:4132 made pnpm exit 1. Diagnose and reproduce this narrowly before fixing. Known mechanism to verify, not blindly assume: patchPoolForQueryBarriers replaces pg Pool.connect with an async Promise-only wrapper; pg Pool.query internally calls callback-form connect, whose immediate return is undefined, so barrierPatchedClients.add(undefined) throws while the callback query still succeeds. Make the smallest test-only fix in tests/integration/registration-database.test.ts; packages/db/src/identity.ts must remain byte-identical. Preserve pg callback-form connect behavior, the Promise-form transactional barrier instrumentation, and clean up/restore the pool patch after the T9 describe if needed. Add a deterministic harness regression if necessary; do not weaken any product or statistical gate. Prove the old harness RED via the focused callback/query sequence and the fixed harness GREEN with zero unhandled errors, then run the complete T9 battery once, the exact adjacent 5-test and 17-test subsets, typecheck, architecture/source/text-byte audits, git diff --check, scope/hash/index checks. Do not rerun the full suite. If all are green, append durable evidence and post ROUTER FULL SUITE REQUIRED ATTEMPT 2 with the exact new test hash and unchanged identity hash, then stop. Do not stage, commit, complete, or push. Do not launch Grok, Hermes, or Fable agents/models; hermes kanban is board-client-only. On any real product failure or required scope beyond the test file, post T9 CHANGES REQUESTED and stop."
  print "=== Claude Opus T9 harness rework starting $(date -u +%FT%TZ), session ${SESSION} ===" | tee -a "${EXIT_LOG}"
  /Users/vladmihaimiron/.local/bin/claude --resume "${SESSION}" -p "${PROMPT}" --model claude-opus-5 --permission-mode acceptEdits --allowedTools "Bash,Read,Write,Edit,Glob,Grep" --output-format stream-json --verbose 2>&1 | tee "${LOG}"
  CLAUDE_STATUS=${pipestatus[1]}
  print "=== Claude Opus T9 harness rework exited $(date -u +%FT%TZ), status ${CLAUDE_STATUS} ===" | tee -a "${EXIT_LOG}"
  exit "${CLAUDE_STATUS}"
fi

osascript <<APPLESCRIPT >/dev/null
tell application "Terminal"
  do script "printf '\\\\033]0;CLAUDE OPUS T9 HARNESS REWORK\\\\007'; '${SCRIPT}' --run"
  activate
end tell
APPLESCRIPT

print "launched visible Claude Opus T9 harness rework session ${SESSION}"
print "stream log: ${LOG}"
