#!/bin/zsh
# EXEC-01 Grok review seat — dual diamond lens 2 (DR-153).
# Prompt stays OFF argv: a short pointer to the review packet file.
set -u
MISSION_DIR="/Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3"
LOG="${MISSION_DIR}/docs/missions/2026-08-06-v3-programming/logs/exec01-grok-rev3.log"
cd "${MISSION_DIR}" || exit 1

print "=== EXEC-01 Grok review seat starting $(date -u +%FT%TZ) ===" | tee -a "${LOG}"

"${HOME}/.grok/bin/grok" \
  -p "/goal Read docs/missions/2026-08-06-v3-programming/reviews/EXEC-01-rev3-review-packet.md in full and execute it as the Grok lens of the EXEC-01 rev3 dual diamond. You are read-only: verify the author's claims against the actual diff rather than trusting the handoff. Write your verdict to docs/missions/2026-08-06-v3-programming/reviews/exec01-grok-rev3.md and print it to stdout." \
  -m grok-4.5 \
  --permission-mode bypassPermissions \
  </dev/null 2>&1 | tee -a "${LOG}"

print "=== EXEC-01 Grok review seat exited $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
print "Window left open deliberately: read the verdict above, then close it yourself."
