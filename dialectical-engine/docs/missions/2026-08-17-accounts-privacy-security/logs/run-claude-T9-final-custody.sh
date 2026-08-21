#!/bin/zsh
# Launch a fresh, visible Claude Opus seat for T9 final custody and local commit.
set -u

MISSION="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
REL="docs/missions/2026-08-17-accounts-privacy-security"
SCRIPT="${MISSION}/${REL}/logs/run-claude-T9-final-custody.sh"
LOG="${MISSION}/${REL}/logs/T9-claude-final-custody-session.jsonl"
EXIT_LOG="${MISSION}/${REL}/logs/T9-claude-final-custody-launcher.log"

if [[ "${1:-}" == "--run" ]]; then
  cd "${MISSION}" || exit 1
  PROMPT="/goal Act as a FRESH visible Claude Opus FINAL CUSTODY seat for Kanban ticket T9 t_6ff49601 only. Do not implement or edit anything. Read in full ${REL}/logs/T9-bounded-lock-order-packet.md, the T9 sections of ${REL}/logs/T9-progress.log, ${REL}/logs/T9-router-full-suite-attempt2.log and .status and .before.sha256 and .after.sha256, plus ${REL}/logs/T9-final-repeat-1.log/.status, -2, and -3. Router reports two independent GPT-5.6 Sol xHigh final reviews: CODE APPROVED with no blocking production-reachable T9/S3 finding; the future account-deletion lock-order risk is durably assigned as a binding S10 t_8664dd93 prerequisite and is not T9 scope. TEST APPROVED after independently confirming the three final receipts are separate consecutive invocations, exact custody, raw and embedded exit 0, 11 passed each, zero Errors/Unhandled/WeakSet/ELIFECYCLE/failed/40P01/nonzero-deadlock signals, and all statistical thresholds satisfied. Fail closed unless you independently verify: current HEAD dc9fd57f6adc10f24907f64f795951cbc2cee28a; empty git index; packages/db/src/identity.ts sha256 1454c7445a127cdf7b2258df1ee7d6875c445cd4a1bbfbc842abfa8d48322c70; tests/integration/registration-database.test.ts sha256 c0a177397dd95e82b99c633d252d3a7a0e1e7ef0b9f42444682f1a79ede4359f; working-tree candidate scope exactly those two tracked paths; attempt-2 full suite exit 0 with 110/110 files, 831/831 tests, 1700.94s, zero error/unhandled banners, byte-identical before/after manifests; every final repeat status exactly 0, 11/11 pass, clean signals, and exact pre/post custody. Do not run Vitest, pnpm test, typecheck, lint, mutants, PostgreSQL, or any dynamic/heavy lane; all evidence is already reviewed. You may run only read-only custody/diff/receipt checks plus git diff --check. If and only if every check is exact, stage ONLY the two literal paths packages/db/src/identity.ts and tests/integration/registration-database.test.ts. Verify the cached name set contains exactly those two paths accounting for the repository-root dialectical-engine/ prefix; inspect cached diff and run git diff --cached --check. Commit locally with message: fix(auth): serialize verification resend lock order. Verify the new commit contains exactly those two paths and the index is empty. Never push. Then use /Users/vladmihaimiron/.local/bin/hermes ONLY as the kanban client on board accounts-phase1: post a durable Claude-Opus final-custody comment with marker CLAUDE OPUS T9 FINAL CUSTODY DONE, commit SHA, exact changed paths, attempt-2 full-suite receipt, three final-repeat receipts, both Sol xHigh approvals, S10 residual carry, and no-push statement; complete t_6ff49601 with concise --result, --summary and valid JSON --metadata; show/read back the card and prove status done. Do not complete or edit S3 parent or any other ticket. If any custody, evidence, stage, commit, or board check fails, do not complete the ticket; post CLAUDE CUSTODY CHANGES REQUESTED with exact evidence and stop. Do not launch Grok, Hermes, Fable, or any other model/agent. Print exactly CLAUDE OPUS T9 FINAL CUSTODY DONE only after commit plus Kanban Done readback; otherwise print CLAUDE CUSTODY CHANGES REQUESTED."
  print "=== Claude Opus T9 final custody starting $(date -u +%FT%TZ) ===" | tee -a "${EXIT_LOG}"
  /Users/vladmihaimiron/.local/bin/claude -p "${PROMPT}" --model claude-opus-5 --permission-mode acceptEdits --allowedTools "Bash,Read,Glob,Grep" --output-format stream-json --verbose 2>&1 | tee "${LOG}"
  CLAUDE_STATUS=${pipestatus[1]}
  print "=== Claude Opus T9 final custody exited $(date -u +%FT%TZ), status ${CLAUDE_STATUS} ===" | tee -a "${EXIT_LOG}"
  exit "${CLAUDE_STATUS}"
fi

osascript <<APPLESCRIPT >/dev/null
tell application "Terminal"
  do script "printf '\\\\033]0;CLAUDE OPUS T9 FINAL CUSTODY\\\\007'; /bin/zsh '${SCRIPT}' --run"
  activate
end tell
APPLESCRIPT

print "launched fresh visible Claude Opus T9 final-custody seat"
print "stream log: ${LOG}"
