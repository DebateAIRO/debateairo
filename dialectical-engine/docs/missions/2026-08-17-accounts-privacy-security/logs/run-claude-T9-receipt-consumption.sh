#!/bin/zsh
# Resume visible Claude Opus to consume Router's clean T9 full-suite receipt.
set -u

MISSION="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
REL="docs/missions/2026-08-17-accounts-privacy-security"
SCRIPT="${MISSION}/${REL}/logs/run-claude-T9-receipt-consumption.sh"
SESSION="41c00784-3135-46ff-8094-4aa66c27611e"
LOG="${MISSION}/${REL}/logs/T9-claude-receipt-consumption-session.jsonl"
EXIT_LOG="${MISSION}/${REL}/logs/T9-claude-receipt-consumption-launcher.log"

if [[ "${1:-}" == "--run" ]]; then
  cd "${MISSION}" || exit 1
  PROMPT="/goal Resume T9 as the same visible Claude Opus author to consume Router's full-suite attempt-2 receipt and hand the frozen candidate to peer review. Read ${REL}/logs/T9-bounded-lock-order-packet.md, ${REL}/logs/T9-progress.log, the current T9 Kanban card t_6ff49601, and the complete attempt-2 receipt files ${REL}/logs/T9-router-full-suite-attempt2.log, .status, .before.sha256, and .after.sha256. Fail closed unless all of these are exact before doing anything else: status file is exactly 0; log has Test Files 110 passed (110), Tests 831 passed (831), T9_ROUTER_FULL_SUITE_ATTEMPT2_EXIT=0, and no unhandled/errors summary; before and after manifests are byte-identical with sha256 67f3f0a84e94eb15a18703d3ddf68a8f0117837984fa85e38c5057ee53fe91c0; HEAD is dc9fd57f6adc10f24907f64f795951cbc2cee28a; git index is empty; packages/db/src/identity.ts is 1454c7445a127cdf7b2258df1ee7d6875c445cd4a1bbfbc842abfa8d48322c70; tests/integration/registration-database.test.ts is c0a177397dd95e82b99c633d252d3a7a0e1e7ef0b9f42444682f1a79ede4359f. Do not edit either product or test path. Do not run pnpm test, Vitest, embedded PostgreSQL, or any heavy/dynamic test lane. After receipt verification, rerun only the bounded static and custody checks: tsc --noEmit, orphan-audit architecture, orphan-audit source, check-text-control-bytes, git diff --check, exact hashes, exact two-path scope, HEAD and empty index. Use the exact commands already documented in T9-progress.log rather than inventing variants. If all checks are green, append an accurate receipt-consumption section to T9-progress.log, post a detailed READY FOR PEER REVIEW comment and heartbeat to t_6ff49601 with exact hashes and receipt facts, then stop. Do not stage, commit, complete, or push. Do not launch Grok, Hermes, or Fable agents/models; hermes kanban is board-client-only. If any check fails or scope/hash changes, post T9 CHANGES REQUESTED and stop."
  print "=== Claude Opus T9 receipt consumption starting $(date -u +%FT%TZ), session ${SESSION} ===" | tee -a "${EXIT_LOG}"
  /Users/vladmihaimiron/.local/bin/claude --resume "${SESSION}" -p "${PROMPT}" --model claude-opus-5 --permission-mode acceptEdits --allowedTools "Bash,Read,Write,Edit,Glob,Grep" --output-format stream-json --verbose 2>&1 | tee "${LOG}"
  CLAUDE_STATUS=${pipestatus[1]}
  print "=== Claude Opus T9 receipt consumption exited $(date -u +%FT%TZ), status ${CLAUDE_STATUS} ===" | tee -a "${EXIT_LOG}"
  exit "${CLAUDE_STATUS}"
fi

osascript <<APPLESCRIPT >/dev/null
tell application "Terminal"
  do script "printf '\\\\033]0;CLAUDE OPUS T9 RECEIPT CONSUMPTION\\\\007'; '${SCRIPT}' --run"
  activate
end tell
APPLESCRIPT

print "launched visible Claude Opus T9 receipt-consumption session ${SESSION}"
print "stream log: ${LOG}"
