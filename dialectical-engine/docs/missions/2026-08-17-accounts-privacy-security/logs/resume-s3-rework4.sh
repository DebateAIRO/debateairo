#!/bin/zsh
set -u
MISSION="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
LOG="${MISSION}/docs/missions/2026-08-17-accounts-privacy-security/logs/S3-codex.log"
cd "${MISSION}" || exit 1
if pgrep -f "codex exec" >/dev/null 2>&1; then print "REFUSING: codex alive" | tee -a "${LOG}"; exit 1; fi
print "=== S3 REWORK (resume 01a019e7) $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
codex exec resume 01a019e7-e36f-7131-b509-5dcb8d52b8b6 \
  -c model='"gpt-5.6-sol"' -c model_reasoning_effort='"xhigh"' -c sandbox_mode='"danger-full-access"' \
  "/goal REWORK ROUND 4: an 11-agent exhaustive verification returned DO-NOT-CLOSE with SEVEN blockers, two of which are regressions in your own round-1 and round-2 fixes (the limiter now fails OPEN; the enumeration oracle is back through a different branch). Read reviews/S3-FINAL-VERIFICATION.md FIRST for file:line and measured numbers, then docs/missions/2026-08-17-accounts-privacy-security/logs/S3-rework4-packet.md in full. Fix ONLY B1-B7 plus the explicit fold-in list in the rework-4 packet. B1 and B2 need REAL-STACK repros against Postgres (the verification harnesses were in-memory and it flagged that). Do NOT touch the VR-3 erasure work (verified twice, holds). Do NOT attempt T1-T5 — they are separate tickets. Do NOT rework anything both lenses passed — especially the VR-3 name-erasure work, which is verified green. Append progress lines. Do NOT commit or push. Post REWORK READY FOR HERMES REVIEW when gates pass." \
  </dev/null 2>&1 | tee -a "${LOG}"
print "=== S3 REWORK exited $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
