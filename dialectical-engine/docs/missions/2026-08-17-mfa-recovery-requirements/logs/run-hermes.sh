#!/bin/zsh
# REQ-MFA-HERMES — RETRY. Fix: no leading "/goal" (Hermes slash-parser ate it -> provider 500).
set -u
MISSION_DIR="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
LOG="${MISSION_DIR}/docs/missions/2026-08-17-mfa-recovery-requirements/logs/hermes.log"
cd "${MISSION_DIR}" || exit 1
print "=== REQ-MFA Hermes seat RETRY starting $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
"${HOME}/.local/bin/hermes" --yolo -z \
  "Your goal packet is the file docs/missions/2026-08-17-mfa-recovery-requirements/goal-packets/hermes.md. Read it in full and execute it. It is your complete contract. It points you at a shared research brief; answer every RQ id in that brief and write your artifact to docs/missions/2026-08-17-mfa-recovery-requirements/research/hermes-requirements.md. You are one of four seats working independently and blind: do not read or wait on any other seat, and ignore the other files already present in that research directory. Cite checkable sources or mark UNVERIFIED; never fabricate a citation, price, or API behaviour. Requirements only, no code. Defensive only, no offensive testing. Emit the READY FOR HERMES STAGE REVIEW packet when done." \
  </dev/null 2>&1 | tee -a "${LOG}"
print "=== REQ-MFA Hermes seat RETRY exited $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
