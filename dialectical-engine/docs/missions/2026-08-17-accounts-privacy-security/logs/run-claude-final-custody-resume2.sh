#!/bin/zsh
# Resume the same Claude Opus S3d final-custody session after the Router-authorized
# external full-suite gate has completed successfully. This launcher must only be
# used after attempt 2 has a durable status 0 and exact before/after manifests.
set -u

MISSION="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
REL="docs/missions/2026-08-17-accounts-privacy-security"
SCRIPT="${MISSION}/${REL}/logs/run-claude-final-custody-resume2.sh"
SESSION="7322b639-6250-4c95-9eee-03f96c31e8e3"
LOG="${MISSION}/${REL}/logs/S3d-claude-final-custody-resume2.log"
RESULT="${MISSION}/${REL}/logs/S3d-claude-final-custody-resume2-result.json"

if [[ "${1:-}" == "--run" ]]; then
  cd "${MISSION}" || exit 1
  PROMPT="/goal Resume S3d final custody in this SAME Claude Opus session. Router has now completed the previously authorized external, exclusive full-suite gate. Read these durable artifacts in full: ${REL}/logs/S3d-final-full-suite-gate-attempt2.log, ${REL}/logs/S3d-final-full-suite-gate-attempt2.status, ${REL}/logs/S3d-final-full-suite-gate-attempt2.before.sha256, and ${REL}/logs/S3d-final-full-suite-gate-attempt2.after.sha256. First fail closed unless status is exactly 0, the log has the complete Test Files/Tests/Duration summary, the before and after manifests are byte-identical, HEAD is still 5b2471d559f1ed5705dc3b9d55525497c5882478, the index is empty, and all eight frozen candidate hashes still exactly match the custody packet. This detached gate was explicitly Router-authorized to overcome your 600-second Bash ceiling and is the final-suite evidence for your custody decision. DO NOT rerun pnpm test, do not start any background task, and do not start another heavy lane. If and only if the external gate is green and exact, run the remaining gates yourself: pnpm typecheck, pnpm lint, git diff --check, then recompute all eight hashes. Update ${REL}/reviews/S3d-claude-final-custody-verdict.md and ${REL}/agent-reports/claude-opus-S3d-final-custody.md to CLAUDE CUSTODY GREENLIGHT with the exact external gate counts/duration/status, manifest evidence, remaining-gate exits, hashes, accepted V rulings 1A/2A/3A-prime/4A, and honest residuals. Then stage only the exact eight literal paths from the packet, verify the cached name set accounts for the git toplevel prefix and contains exactly those eight and nothing else, inspect the cached diff, run git diff --cached --check, and commit locally with message feat(auth): harden verification mail flow. Verify the commit contains exactly the eight candidate paths. Post the required Claude-Opus custody receipt with marker CLAUDE OPUS FINAL CUSTODY DONE, complete/read back t_cc197ed2 as done, and never push. On any failure, divergence, unexpected staged path, or nonzero gate: unstage only your exact candidate paths if you staged them, do not commit or complete, update/post CLAUDE CUSTODY CHANGES REQUESTED with exact evidence, and return. Never launch Hermes or Fable. Print exactly CLAUDE OPUS FINAL CUSTODY DONE only after commit plus board Done readback."
  print "=== S3d Claude Opus final custody resume2 starting $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
  /Users/vladmihaimiron/.local/bin/claude --resume "${SESSION}" -p "${PROMPT}" --model claude-opus-5 --permission-mode acceptEdits --allowedTools "Bash,Read,Write,Edit,Glob,Grep" --output-format json 2>&1 | tee "${RESULT}" | tee -a "${LOG}"
  RESUME_STATUS=${pipestatus[1]}
  print "=== S3d Claude Opus final custody resume2 exited $(date -u +%FT%TZ), status ${RESUME_STATUS} ===" | tee -a "${LOG}"
  exit "${RESUME_STATUS}"
fi

osascript <<APPLESCRIPT >/dev/null
tell application "Terminal"
  do script "printf '\\\\033]0;CLAUDE OPUS S3d CUSTODY RESUME 2\\\\007'; '${SCRIPT}' --run"
  activate
end tell
APPLESCRIPT

print "resumed Claude Opus S3d final-custody session ${SESSION} in a visible Terminal"
print "log: ${LOG}"
