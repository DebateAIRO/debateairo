#!/bin/zsh
# Resume the visible Claude Opus T9 author after the bounded continuation terminal exited.
set -u

MISSION="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
REL="docs/missions/2026-08-17-accounts-privacy-security"
SCRIPT="${MISSION}/${REL}/logs/run-claude-T9-preflight-resume.sh"
SESSION="41c00784-3135-46ff-8094-4aa66c27611e"
LOG="${MISSION}/${REL}/logs/T9-claude-preflight-session.jsonl"
EXIT_LOG="${MISSION}/${REL}/logs/T9-claude-preflight-launcher.log"

if [[ "${1:-}" == "--run" ]]; then
  cd "${MISSION}" || exit 1
  PROMPT="/goal Continue T9 as the same visible Claude Opus implementation author after your bounded continuation terminal exited status 0. Read ${REL}/logs/T9-bounded-lock-order-packet.md and the appended ${REL}/logs/T9-progress.log evidence. Refresh Kanban ticket t_6ff49601. Verify HEAD is still dc9fd57f6adc10f24907f64f795951cbc2cee28a, the index is empty, and the current candidate hashes are identity 1454c7445a127cdf7b2258df1ee7d6875c445cd4a1bbfbc842abfa8d48322c70 and test 58fd57ef1d7d10d0ea6ef288d885912b90f3ae43293efb89798da0dd22041e18 before doing anything. Your prior broad adjacent command accidentally selected the whole T9/heavy S3d file and all its background tasks were stopped when the terminal exited; it has NO verdict and must not be counted. Do not rerun that broad regex. Run the intended adjacent coverage as separate bounded commands: first S3c B1 plus S3d D2/D3/D4; then the resend/cooldown/outbound/VR-3/rate-limit/S3c D2/B2/B3 subset with a negative T9 lookahead or an equivalently exact selector so no T9 tests and no unrelated heavy S3d rework/heap tests are selected. Record exact selected test counts and exit status. Then run typecheck, architecture/source/text-byte lint and git diff --check plus final two-path scope/hash/index checks. Do not alter product or tests unless an actual gate failure requires it; fail closed and report T9 CHANGES REQUESTED if so. If all pre-full-suite gates are green, append durable evidence, post the exact Kanban comment ROUTER FULL SUITE REQUIRED with HEAD and both candidate hashes, and stop. Do not run the full suite yourself. Do not stage, commit, complete, or push. Do not launch Grok, Hermes, or Fable agents/models; hermes kanban is board-client-only."
  print "=== Claude Opus T9 preflight continuation starting $(date -u +%FT%TZ), session ${SESSION} ===" | tee -a "${EXIT_LOG}"
  /Users/vladmihaimiron/.local/bin/claude --resume "${SESSION}" -p "${PROMPT}" --model claude-opus-5 --permission-mode acceptEdits --allowedTools "Bash,Read,Write,Edit,Glob,Grep" --output-format stream-json --verbose 2>&1 | tee "${LOG}"
  CLAUDE_STATUS=${pipestatus[1]}
  print "=== Claude Opus T9 preflight continuation exited $(date -u +%FT%TZ), status ${CLAUDE_STATUS} ===" | tee -a "${EXIT_LOG}"
  exit "${CLAUDE_STATUS}"
fi

osascript <<APPLESCRIPT >/dev/null
tell application "Terminal"
  do script "printf '\\\\033]0;CLAUDE OPUS T9 PREFLIGHT CONTINUATION\\\\007'; '${SCRIPT}' --run"
  activate
end tell
APPLESCRIPT

print "launched visible Claude Opus T9 preflight continuation session ${SESSION}"
print "stream log: ${LOG}"
