#!/bin/zsh
# EXEC-01 Codex coding seat — visible-launch law (heartbeat v3.2.0 §2).
# Hardened: prompt stays OFF argv (a short pointer only, repo lesson fc05bce);
# stdin is closed with </dev/null or `codex exec` hangs awaiting EOF.
set -u
MISSION_DIR="/Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3"
LOG="${MISSION_DIR}/docs/missions/2026-08-06-v3-programming/logs/exec01-codex.log"
cd "${MISSION_DIR}" || exit 1

print "=== EXEC-01 Codex seat starting $(date -u +%FT%TZ) ===" | tee -a "${LOG}"

codex exec \
  -c model='"gpt-5.6-sol"' \
  -c sandbox_mode='"danger-full-access"' \
  "/goal Read docs/missions/2026-08-06-v3-programming/goal-packets/EXEC-01-codex-goal.md in full and execute it. It is your complete goal packet: board debateai-v3, ticket t_6fae713b, EXEC-01. Claim the ticket first (hermes kanban --board debateai-v3 claim t_6fae713b --ttl 43200), then work it TDD per docs/missions/2026-08-06-v3-programming/CODING-LOOP-PROTOCOL.md. Append a progress line per major step to docs/missions/2026-08-06-v3-programming/handoffs/EXEC-01-progress.log." \
  </dev/null 2>&1 | tee -a "${LOG}"

print "=== EXEC-01 Codex seat exited $(date -u +%FT%TZ) rc=$? ===" | tee -a "${LOG}"
print "Window left open deliberately: read the tail above, then close it yourself."
