#!/bin/zsh
set -u
MISSION="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
LOG="${MISSION}/docs/missions/2026-08-17-accounts-privacy-security/logs/S3-codex.log"
cd "${MISSION}" || exit 1
if pgrep -f "codex exec" >/dev/null 2>&1; then print "REFUSING: codex alive" | tee -a "${LOG}"; exit 1; fi
print "=== S3 REWORK (resume 01a019e7) $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
codex exec resume 01a019e7-e36f-7131-b509-5dcb8d52b8b6 \
  -c model='"gpt-5.6-sol"' -c model_reasoning_effort='"xhigh"' -c sandbox_mode='"danger-full-access"' \
  "/goal S3b: registration durability. Second of four replacement tickets from the VR-9 split. S3a is CLOSED and dual-greenlit — do not touch it. Read reviews/S3-FINAL-VERIFICATION.md FIRST for file:line and measured numbers, then docs/missions/2026-08-17-accounts-privacy-security/logs/S3b-packet.md in full. Undo the fire-and-forget registration: a 2xx may ONLY be returned after the account is durably committed. PROHIBITED: closing the enumeration oracle by making registration non-durable, deferred, or best-effort — that shortcut came from an orchestrator packet error and is now forbidden. Close the oracle by EQUAL WORK in both branches with a real clamp enforced in product code. Delete the in-process Set holding plaintext email/recovery-email/IP/UA. Make failures traceable with a correlation id. Normalise audit context at the REPOSITORY boundary so a future writer bypassing sourceContext cannot reintroduce audit evasion. Preserve S3a timestamp behaviour and VR-3. VR-10 STANDING RULE: mutation-test every security assertion and show each test FAILS against broken code — at minimum prove that returning before commit goes RED, removing the clamp goes RED, and bypassing sourceContext goes RED. All proofs must be REAL-STACK against Postgres, not in-memory. Do NOT rework anything both lenses passed — especially the VR-3 name-erasure work, which is verified green. Append progress lines. Do NOT commit or push. Post REWORK READY FOR HERMES REVIEW when gates pass." \
  </dev/null 2>&1 | tee -a "${LOG}"
print "=== S3 REWORK exited $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
