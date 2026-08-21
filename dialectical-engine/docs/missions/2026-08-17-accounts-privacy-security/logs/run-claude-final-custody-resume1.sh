#!/bin/zsh
# Resume the same Claude Opus S3d final-custody session after its first turn
# returned while an incomplete background full-suite task was still running.
set -u

MISSION="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
REL="docs/missions/2026-08-17-accounts-privacy-security"
SCRIPT="${MISSION}/${REL}/logs/run-claude-final-custody-resume1.sh"
SESSION="7322b639-6250-4c95-9eee-03f96c31e8e3"
LOG="${MISSION}/${REL}/logs/S3d-claude-final-custody-resume1.log"
RESULT="${MISSION}/${REL}/logs/S3d-claude-final-custody-resume1-result.json"

if [[ "${1:-}" == "--run" ]]; then
  cd "${MISSION}" || exit 1
  PROMPT="/goal Resume S3d final custody in this SAME Claude Opus session. Your prior turn ended after the Monitor tool was denied while a background pnpm test was incomplete. That process was terminated with no Test Files/Tests summary and no EXIT_CODE, so it is NOT evidence and MUST NOT be called green. Candidate HEAD, index, and eight paths remain unchanged. Continue the existing packet authority. Re-run the complete pnpm test as a FOREGROUND Bash call with timeout at least 900000 ms; do not use Task, Monitor, backgrounding, nohup, or ampersand. Stay in this turn until it exits and capture its exact summary and exit code. On green only, run pnpm typecheck, pnpm lint, git diff --check, post-hash all eight paths, write the required verdict and self-report, stage only the exact eight literal paths, inspect the exact cached set/diff/check, commit locally with the packet message, post the Claude custody receipt, complete/read back t_cc197ed2, and print exactly CLAUDE OPUS FINAL CUSTODY DONE. On any failure, do not stage, commit, or complete; write/post CLAUDE CUSTODY CHANGES REQUESTED. Never launch Hermes or Fable. Never push."
  print "=== S3d Claude Opus final custody resume1 starting $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
  /Users/vladmihaimiron/.local/bin/claude --resume "${SESSION}" -p "${PROMPT}" --model claude-opus-5 --permission-mode acceptEdits --allowedTools "Bash,Read,Write,Edit,Glob,Grep" --output-format json 2>&1 | tee "${RESULT}" | tee -a "${LOG}"
  RESUME_STATUS=${pipestatus[1]}
  print "=== S3d Claude Opus final custody resume1 exited $(date -u +%FT%TZ), status ${RESUME_STATUS} ===" | tee -a "${LOG}"
  exit "${RESUME_STATUS}"
fi

osascript <<APPLESCRIPT >/dev/null
tell application "Terminal"
  do script "printf '\\\\033]0;CLAUDE OPUS S3d CUSTODY RESUME 1\\\\007'; '${SCRIPT}' --run"
  activate
end tell
APPLESCRIPT

print "resumed Claude Opus S3d final-custody session ${SESSION} in a visible Terminal"
print "log: ${LOG}"
