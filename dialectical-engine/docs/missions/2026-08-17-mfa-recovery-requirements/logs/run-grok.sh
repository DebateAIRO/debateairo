#!/bin/zsh
# REQ-MFA-GROK — Grok 4.6 requirements research seat (parallel blind, seat 3 of 4).
set -u
MISSION_DIR="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
LOG="${MISSION_DIR}/docs/missions/2026-08-17-mfa-recovery-requirements/logs/grok.log"
cd "${MISSION_DIR}" || exit 1
print "=== REQ-MFA Grok seat (grok-4.6) starting $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
"${HOME}/.grok/bin/grok" \
  -p "/goal Read docs/missions/2026-08-17-mfa-recovery-requirements/goal-packets/grok.md in full and execute it. It is your complete contract. It points you at a shared research brief; answer every RQ id in that brief and write your artifact to docs/missions/2026-08-17-mfa-recovery-requirements/research/grok-requirements.md. You are one of four seats working independently and blind: do not read or wait on any other seat. Use live search to establish current ground truth on messaging-app OTP products, country availability, and real pricing. Cite checkable sources or mark UNVERIFIED; never fabricate a citation, price, or API behaviour. Requirements only, no code. Defensive only, no offensive testing. Emit the READY FOR HERMES STAGE REVIEW packet when done." \
  -m grok-4.6 \
  --permission-mode bypassPermissions \
  </dev/null 2>&1 | tee -a "${LOG}"
print "=== REQ-MFA Grok seat exited $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
