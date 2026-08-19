#!/bin/zsh
set -u
MISSION_DIR="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
LOG="${MISSION_DIR}/docs/missions/2026-08-17-accounts-privacy-security/logs/S2-codex.log"
cd "${MISSION_DIR}" || exit 1
if pgrep -f "codex exec" >/dev/null 2>&1; then print "REFUSING: codex alive" | tee -a "${LOG}"; exit 1; fi
print "=== S2 RESUME (unblock) $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
codex exec resume 01a01959-3db8-7fb2-9c2f-78b00d7985fc \
  -c model='"gpt-5.6-sol"' \
  -c model_reasoning_effort='"xhigh"' \
  -c sandbox_mode='"danger-full-access"' \
  "/goal UNBLOCK: the packet has been amended (re-read the top CLARIFICATION section of docs/missions/2026-08-17-accounts-privacy-security/logs/S2-packet.md). The @debateai/crypto dependency-formalization is DEFERRED to S6 — do NOT touch any package.json or pnpm-lock.yaml. Use crypto primitives via the existing import pattern S1 established. Now proceed TDD with the rest of the S2 contract (identity schema migration 0030, mutable identity tables, append-only hash-chained audit_event with crypto-shreddable actor, email blind index, reject_mutation enumeration, ownership/visibility append-only-event pattern decision). Append progress lines. Do NOT commit or push. Post READY FOR PEER REVIEW when gates pass." \
  </dev/null 2>&1 | tee -a "${LOG}"
print "=== S2 RESUME exited $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
