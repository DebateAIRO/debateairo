#!/bin/zsh
# CONT-01 Grok review seat — dual diamond lens 2 (DR-153).
set -u
MISSION_DIR="/Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3"
LOG="${MISSION_DIR}/docs/missions/2026-08-06-v3-programming/logs/CONT01-grok-review.log"
cd "${MISSION_DIR}" || exit 1
print "=== CONT-01 Grok review seat starting $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
"${HOME}/.grok/bin/grok" \
  -p "/goal Read docs/missions/2026-08-06-v3-programming/reviews/CONT-01-review-packet.md in full and execute it as the Grok lens of the CONT-01 dual diamond. Verify the author's claims against the actual working tree diff rather than trusting the handoff. You may run the listed test commands. Write your verdict to docs/missions/2026-08-06-v3-programming/reviews/cont01-grok-verdict.md and print it to stdout." \
  --permission-mode bypassPermissions \
  </dev/null 2>&1 | tee -a "${LOG}"
print "=== CONT-01 Grok review seat exited $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
