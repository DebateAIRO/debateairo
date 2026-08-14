#!/bin/zsh
set -u
MISSION_DIR="/Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3"
LOG="${MISSION_DIR}/docs/missions/2026-08-06-v3-programming/logs/ui02a-grok.log"
cd "${MISSION_DIR}" || exit 1
print "=== UI-02a Grok review seat starting $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
"${HOME}/.grok/bin/grok" \
  -p "/goal Read docs/missions/2026-08-06-v3-programming/reviews/UI-02a-review-packet.md in full and execute it as the Grok lens of the UI-02a dual diamond. You are read-only: verify claims against the actual diff rather than trusting the handoff. IMPORTANT: apps/v2-ui/lib/v3/adapter.ts contains embedded NUL bytes so plain grep skips it silently - always use grep -a on that file or you will review a phantom. Write your verdict to docs/missions/2026-08-06-v3-programming/reviews/ui02a-grok-rev1.md and print it to stdout." \
  -m grok-4.5 --permission-mode bypassPermissions </dev/null 2>&1 | tee -a "${LOG}"
print "=== UI-02a Grok review seat exited $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
