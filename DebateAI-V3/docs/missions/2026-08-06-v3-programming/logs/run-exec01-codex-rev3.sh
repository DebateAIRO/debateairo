#!/bin/zsh
# EXEC-01 rev3 — red root typecheck found by the orchestrator's independent gate
# run. SAME session (heartbeat v3.2.0 §4). Session recovered from the BOARD.
set -u
MISSION_DIR="/Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3"
LOG="${MISSION_DIR}/docs/missions/2026-08-06-v3-programming/logs/exec01-codex.log"
SESSION="019fefbd-4fcb-7d22-97f9-cedaddcb2fd3"
cd "${MISSION_DIR}" || exit 1

print "=== EXEC-01 rev3 resuming session ${SESSION} $(date -u +%FT%TZ) ===" | tee -a "${LOG}"

codex exec resume "${SESSION}" \
  -c model='"gpt-5.6-sol"' \
  -c sandbox_mode='"danger-full-access"' \
  "/goal STOP - rev2 root typecheck is RED and reviewers were not fired. Read the newest orchestrator comment on ticket t_6fae713b (hermes kanban --board debateai-v3 show t_6fae713b). Two TS2345 errors at tests/unit/v2ui-data-layer.test.ts lines 456 and 464: expect.objectContaining with an explicit TypedDomainError generic forces the full error shape while you supply only the code property. Your progress log claimed root typecheck green at 08:10:19Z; it is not. Note vitest does not typecheck, so 411 passing tests do not evidence a green typecheck - the TDD law requires REAL pasted output per gate. Fix the assertions so they still fail when the typed code is wrong, then re-run EVERY gate yourself and paste exactly what each prints: npx tsc --noEmit at the root, the v2-ui typecheck, both vitest suites, and the architecture and source audits. Update the handoff with the real output, append to docs/missions/2026-08-06-v3-programming/handoffs/EXEC-01-progress.log, set the ticket back to review and comment 'REWORK READY FOR HERMES REVIEW - EXEC-01 rev3'." \
  </dev/null 2>&1 | tee -a "${LOG}"

print "=== EXEC-01 rev3 exited $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
