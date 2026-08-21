#!/bin/zsh
# Resume the same Claude Opus custody session after its successful commit tool
# call returned the commit but failed to return control to the agent.
set -u

MISSION="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
REL="docs/missions/2026-08-17-accounts-privacy-security"
SCRIPT="${MISSION}/${REL}/logs/run-claude-final-custody-resume3.sh"
SESSION="7322b639-6250-4c95-9eee-03f96c31e8e3"
LOG="${MISSION}/${REL}/logs/S3d-claude-final-custody-resume3.log"
RESULT="${MISSION}/${REL}/logs/S3d-claude-final-custody-resume3-result.json"

if [[ "${1:-}" == "--run" ]]; then
  cd "${MISSION}" || exit 1
  PROMPT="/goal Resume S3d final custody in this SAME Claude Opus session for BOARD-ONLY completion. Your prior git commit tool call succeeded but its tool transport stalled after HEAD advanced, so Router terminated only that stalled Claude CLI and orphaned launcher pipes. The authoritative local commit is dc9fd57f6adc10f24907f64f795951cbc2cee28a with message feat(auth): harden verification mail flow; Router independently verified it contains exactly the eight frozen candidate paths and the index is empty. Your GREENLIGHT verdict and self-report were already written. Do not rerun tests, typecheck, lint, or diff gates. Do not edit product code or tests. Do not stage or make another commit. Do not push. First read and verify HEAD equals dc9fd57f6adc10f24907f64f795951cbc2cee28a, the commit has exactly the packet's eight paths, the index is empty, and both artifacts state CLAUDE CUSTODY GREENLIGHT. Then use ~/.local/bin/hermes only as the kanban client to post the required durable Claude-Opus receipt with marker CLAUDE OPUS FINAL CUSTODY DONE: commit SHA, full gate 110/110 files and 820/820 tests in 1490.45s exit 0, typecheck/lint/diff green, exact before/after manifests and hashes, Grok and Claude reviewer evidence paths, verdict/report paths, accepted V rulings/residuals, and no-push statement. Complete t_cc197ed2 with the packet-required result, summary, and metadata. Read it back and prove status done. If it is already done, do not mutate again; just verify its receipt/readback. Never launch Hermes or Fable agents/models. Return exactly CLAUDE OPUS FINAL CUSTODY DONE only after board Done readback; otherwise return CLAUDE CUSTODY CHANGES REQUESTED with the exact board failure."
  print "=== S3d Claude Opus final custody resume3 starting $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
  /Users/vladmihaimiron/.local/bin/claude --resume "${SESSION}" -p "${PROMPT}" --model claude-opus-5 --permission-mode acceptEdits --allowedTools "Bash,Read,Glob,Grep" --output-format json 2>&1 | tee "${RESULT}" | tee -a "${LOG}"
  RESUME_STATUS=${pipestatus[1]}
  print "=== S3d Claude Opus final custody resume3 exited $(date -u +%FT%TZ), status ${RESUME_STATUS} ===" | tee -a "${LOG}"
  exit "${RESUME_STATUS}"
fi

osascript <<APPLESCRIPT >/dev/null
tell application "Terminal"
  do script "printf '\\\\033]0;CLAUDE OPUS S3d BOARD CUSTODY RESUME 3\\\\007'; '${SCRIPT}' --run"
  activate
end tell
APPLESCRIPT

print "resumed Claude Opus S3d board-only custody session ${SESSION} in a visible Terminal"
print "log: ${LOG}"
