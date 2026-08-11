#!/bin/zsh
# EXEC-01 rev2 rework — SAME session (heartbeat v3.2.0 §4: rework returns to the
# exact original session, never a fresh one). Session recovered from the BOARD.
set -u
MISSION_DIR="/Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3"
LOG="${MISSION_DIR}/docs/missions/2026-08-06-v3-programming/logs/exec01-codex.log"
SESSION="019fefbd-4fcb-7d22-97f9-cedaddcb2fd3"
cd "${MISSION_DIR}" || exit 1

print "=== EXEC-01 rev2 rework resuming session ${SESSION} $(date -u +%FT%TZ) ===" | tee -a "${LOG}"

codex exec resume "${SESSION}" \
  -c model='"gpt-5.6-sol"' \
  -c sandbox_mode='"danger-full-access"' \
  "/goal EXEC-01 rev1 came back from the dual diamond SPLIT: Grok APPROVED, Opus 5 CHANGES REQUESTED with 3 blocking. Read docs/missions/2026-08-06-v3-programming/reviews/EXEC-01-rework-directive.md in full and execute it. Read both verdicts too: reviews/exec01-opus-rev1.md and reviews/exec01-grok-rev1.md. Both lenses reached the SAME facts on all three items and differed only on severity, so none of it is arbitrary. Reproduce-first is mandatory: for each of R1, R2, R3 write the RED test demonstrating that exact defect against current code BEFORE fixing it. Do not redesign the dispatcher - both lenses cleared its design, P8, the DDD placement, the 27-row edge table and the non-blocking 202. Append progress lines to docs/missions/2026-08-06-v3-programming/handoffs/EXEC-01-progress.log, UPDATE the existing handoff rather than rewriting it, then set the ticket back to review and comment 'REWORK READY FOR HERMES REVIEW - EXEC-01 rev2'." \
  </dev/null 2>&1 | tee -a "${LOG}"

print "=== EXEC-01 rev2 exited $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
print "Window left open deliberately: read the tail above, then close it yourself."
