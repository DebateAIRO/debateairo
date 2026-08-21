#!/bin/zsh
# CONT-01 rework seat — same-terminal law: resume the original session.
set -u
MISSION_DIR="/Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3"
LOG="${MISSION_DIR}/docs/missions/2026-08-06-v3-programming/logs/CONT-01-codex.log"
cd "${MISSION_DIR}" || exit 1
if pgrep -f "codex exec" >/dev/null 2>&1; then
  print "REFUSING: a codex exec process is already alive." | tee -a "${LOG}"; exit 1
fi
print "=== CONT-01 REWORK Codex seat (resume 01a00eb9) starting $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
codex exec resume 01a00eb9-a62c-73c1-ad19-c8dd6aa4b44c \
  -c model='"gpt-5.6-sol"' \
  -c sandbox_mode='"danger-full-access"' \
  "/goal Read docs/missions/2026-08-06-v3-programming/logs/CONT-01-rework-packet.md in full and execute it. It is your rework contract for ticket t_0b9a22a0 (read the newest DIAMOND OUTCOME comment on the ticket first). Reproduce-first: RED test per finding before its fix. Append progress lines to the CONT-01 progress log. Post REWORK READY FOR HERMES REVIEW as a ticket comment when gates pass." \
  </dev/null 2>&1 | tee -a "${LOG}"
print "=== CONT-01 REWORK Codex seat exited $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
