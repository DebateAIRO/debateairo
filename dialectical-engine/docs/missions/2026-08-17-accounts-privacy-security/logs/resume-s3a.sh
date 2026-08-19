#!/bin/zsh
set -u
MISSION="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
LOG="${MISSION}/docs/missions/2026-08-17-accounts-privacy-security/logs/S3-codex.log"
cd "${MISSION}" || exit 1
if pgrep -f "codex exec" >/dev/null 2>&1; then print "REFUSING: codex alive" | tee -a "${LOG}"; exit 1; fi
print "=== S3 REWORK (resume 01a019e7) $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
codex exec resume 01a019e7-e36f-7131-b509-5dcb8d52b8b6 \
  -c model='"gpt-5.6-sol"' -c model_reasoning_effort='"xhigh"' -c sandbox_mode='"danger-full-access"' \
  "/goal S3a: V ruled VR-9 (split S3) after four rework rounds each broke something new. This is the first of four replacement tickets — three surgical defects ONLY. Read reviews/S3-FINAL-VERIFICATION.md FIRST for file:line and measured numbers, then docs/missions/2026-08-17-accounts-privacy-security/logs/S3a-packet.md in full. Fix ONLY A1 (migration 0032 bricks any DB holding audit rows — 0030 says NOT NULL, 0032 adds CHECK IS NULL without NOT VALID, single-transaction migrate), A2 (blank User-Agent 500s all three routes and rolls back the audit row — clamp empty/whitespace UA to unknown), A3 (timestamps record drain time not request time; adultAffirmedAt is a legal attestation). VR-10 IS NOW A STANDING RULE: every security assertion must be mutation-tested — deliberately break the implementation and SHOW the test fails, include that evidence in the handoff. Do NOT touch registration durability, the rate limiter, or the mail channel — they are S3b/S3c/S3d. Do NOT rework anything both lenses passed — especially the VR-3 name-erasure work, which is verified green. Append progress lines. Do NOT commit or push. Post REWORK READY FOR HERMES REVIEW when gates pass." \
  </dev/null 2>&1 | tee -a "${LOG}"
print "=== S3 REWORK exited $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
