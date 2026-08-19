#!/bin/zsh
set -u
MISSION="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
LOG="${MISSION}/docs/missions/2026-08-17-accounts-privacy-security/logs/S3-codex.log"
cd "${MISSION}" || exit 1
if pgrep -f "codex exec" >/dev/null 2>&1; then print "REFUSING: codex alive" | tee -a "${LOG}"; exit 1; fi
print "=== S3 REWORK (resume 01a019e7) $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
codex exec resume 01a019e7-e36f-7131-b509-5dcb8d52b8b6 \
  -c model='"gpt-5.6-sol"' -c model_reasoning_effort='"xhigh"' -c sandbox_mode='"danger-full-access"' \
  "/goal REWORK ROUND 3: W1/W2/W3 are confirmed done and frozen. One new V ruling (VR-7) only. Read docs/missions/2026-08-17-accounts-privacy-security/logs/S3-rework3-packet.md in full. Implement ONLY VR-7: replace the HMAC-SHA-256 audit source-IP hash with a memory-hard argon2id KDF (hash-wasm is already a declared dependency — if it is not, STOP and post CODEX BLOCKED rather than adding one), with cost parameters as ruled register rows, the salt still in the 0600 secret store, correlation and zero-raw-IP properties preserved, password hashing untouched, and a RED test that fails against the current HMAC plus an asserted per-call timing bound. Do NOT rework anything both lenses passed — especially the VR-3 name-erasure work, which is verified green. Append progress lines. Do NOT commit or push. Post REWORK READY FOR HERMES REVIEW when gates pass." \
  </dev/null 2>&1 | tee -a "${LOG}"
print "=== S3 REWORK exited $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
