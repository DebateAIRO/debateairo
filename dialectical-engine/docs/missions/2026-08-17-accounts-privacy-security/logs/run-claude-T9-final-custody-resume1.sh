#!/bin/zsh
# Resume the same Claude Opus custody session after the local commit succeeded
# but the CLI tool transport stopped returning control to the agent.
set -u

MISSION="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
REL="docs/missions/2026-08-17-accounts-privacy-security"
SCRIPT="${MISSION}/${REL}/logs/run-claude-T9-final-custody-resume1.sh"
SESSION="3a6bcd06-19dc-4b47-94da-1f6c83c4fe5c"
LOG="${MISSION}/${REL}/logs/T9-claude-final-custody-resume1.log"
RESULT="${MISSION}/${REL}/logs/T9-claude-final-custody-resume1-result.json"

if [[ "${1:-}" == "--run" ]]; then
  cd "${MISSION}" || exit 1
  PROMPT="/goal Resume T9 final custody in this SAME Claude Opus session for BOARD-ONLY completion. Your prior git commit tool call succeeded but its tool transport stalled immediately after the commit and never returned control. Router terminated only that exact stalled Claude CLI/launcher after confirming the durable local commit. The authoritative HEAD is now 694b8c06d7194ef5f3c3da5dee745beae847e605 with message fix(auth): serialize verification resend lock order. The index is empty. Do not run tests, typecheck, lint, PostgreSQL, receipts, or diff gates again. Do not edit any file. Do not stage or create another commit. Do not push. First verify HEAD equals 694b8c06d7194ef5f3c3da5dee745beae847e605, the commit contains exactly dialectical-engine/packages/db/src/identity.ts and dialectical-engine/tests/integration/registration-database.test.ts, and the index is empty. Preserve all unrelated pre-existing working-tree changes. Then use /Users/vladmihaimiron/.local/bin/hermes ONLY as the Kanban client on board accounts-phase1. Post a durable comment to t_6ff49601 with marker CLAUDE OPUS T9 FINAL CUSTODY DONE containing: commit SHA and exact two paths; full-suite attempt-2 exit 0 with 110/110 files and 831/831 tests in 1700.94s, zero error/unhandled banners and byte-identical before/after manifests; final repeats 1/2/3 each exit 0 with 11/11 passed and clean signals at the exact frozen hashes; independent Sol xHigh CODE APPROVED and TEST APPROVED; future concurrent account-deletion lock-order risk remains a binding S10 t_8664dd93 prerequisite; no push. Complete only t_6ff49601 with concise --result, --summary and valid JSON --metadata including commit, changed_files, full_suite, final_repeats, reviewers, residual_ticket, and pushed false. Show/read back t_6ff49601 and prove status done. Do not complete or edit S3 parent or any other ticket. If the card is already done, do not complete it again; verify its durable receipt/readback. Do not launch Grok, Hermes, Fable, or any model/agent. Return exactly CLAUDE OPUS T9 FINAL CUSTODY DONE only after Done readback; otherwise CLAUDE CUSTODY CHANGES REQUESTED with the exact board failure."
  print "=== Claude Opus T9 board custody resume1 starting $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
  /Users/vladmihaimiron/.local/bin/claude --resume "${SESSION}" -p "${PROMPT}" --model claude-opus-5 --permission-mode acceptEdits --allowedTools "Bash,Read,Glob,Grep" --output-format json 2>&1 | tee "${RESULT}" | tee -a "${LOG}"
  CLAUDE_STATUS=${pipestatus[1]}
  print "=== Claude Opus T9 board custody resume1 exited $(date -u +%FT%TZ), status ${CLAUDE_STATUS} ===" | tee -a "${LOG}"
  exit "${CLAUDE_STATUS}"
fi

osascript <<APPLESCRIPT >/dev/null
tell application "Terminal"
  do script "printf '\\\\033]0;CLAUDE OPUS T9 BOARD CUSTODY RESUME 1\\\\007'; /bin/zsh '${SCRIPT}' --run"
  activate
end tell
APPLESCRIPT

print "resumed Claude Opus T9 board-only custody session ${SESSION} in a visible Terminal"
print "log: ${LOG}"
