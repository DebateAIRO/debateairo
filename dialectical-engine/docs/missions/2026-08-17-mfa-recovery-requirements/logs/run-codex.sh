#!/bin/zsh
# REQ-MFA-CODEX — GPT Sol 5.6 Max requirements research seat (parallel blind, seat 2 of 4).
set -u
MISSION_DIR="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
LOG="${MISSION_DIR}/docs/missions/2026-08-17-mfa-recovery-requirements/logs/codex.log"
export PATH="/Applications/ChatGPT.app/Contents/Resources:${PATH}"
cd "${MISSION_DIR}" || exit 1
print "=== REQ-MFA Codex seat (gpt-5.6-sol @ xhigh) starting $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
codex exec \
  -c model='"gpt-5.6-sol"' \
  -c model_reasoning_effort='"xhigh"' \
  -c sandbox_mode='"danger-full-access"' \
  "/goal Read docs/missions/2026-08-17-mfa-recovery-requirements/goal-packets/codex.md in full and execute it. It is your complete contract. It points you at a shared research brief; answer every RQ id in that brief and write your artifact to docs/missions/2026-08-17-mfa-recovery-requirements/research/codex-requirements.md. You are one of four seats working independently and blind: do not read or wait on any other seat. Cite checkable sources or mark UNVERIFIED; never fabricate a citation, price, or API behaviour. Requirements only, no code. Defensive only, no offensive testing. Your file contract allows writing ONLY your own artifact path. Emit the READY FOR HERMES STAGE REVIEW packet when done." \
  </dev/null 2>&1 | tee -a "${LOG}"
print "=== REQ-MFA Codex seat exited $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
