#!/bin/zsh
# EXEC-01 rev4 — one blocking regression from the rev3 diamond, orchestrator-verified live.
# SAME session (heartbeat v3.2.0 §4). Session recovered from the BOARD.
#
# OPS LAW LEARNED 2026-08-11 (the hard way): `codex exec resume <id>` does NOT
# replace a still-running resume of the same session — it runs CONCURRENTLY.
# Three of them piled up on this ticket and the log filled with
# "ERROR codex_core::util: Orphan function call output for call id: ...",
# a wedge with zero progress. NEVER resume a session while another resume of it
# is alive. This guard enforces that.
set -u
MISSION_DIR="/Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3"
LOG="${MISSION_DIR}/docs/missions/2026-08-06-v3-programming/logs/exec01-codex.log"
SESSION="019fefbd-4fcb-7d22-97f9-cedaddcb2fd3"
cd "${MISSION_DIR}" || exit 1

if pgrep -f "codex exec" >/dev/null 2>&1; then
  print "REFUSING TO LAUNCH: a codex exec process is already alive." | tee -a "${LOG}"
  print "Concurrent resumes of one session wedge it. Kill the existing one first:" | tee -a "${LOG}"
  pgrep -lf "codex exec" | tee -a "${LOG}"
  exit 1
fi

print "=== EXEC-01 rev4 (clean relaunch) resuming ${SESSION} $(date -u +%FT%TZ) ===" | tee -a "${LOG}"

codex exec resume "${SESSION}" \
  -c model='"gpt-5.6-sol"' \
  -c sandbox_mode='"danger-full-access"' \
  "/goal rev3 diamond: Grok APPROVED, Opus 5 CHANGES REQUESTED with ONE blocking. NOTE: three concurrent resumes of this session were accidentally launched by the orchestrator and wedged it with orphan-function-call errors; they were killed and no rev4 edit had landed. This is a CLEAN restart of rev4 - verify the current file state yourself before editing rather than assuming your last turn applied. Read docs/missions/2026-08-06-v3-programming/reviews/EXEC-01-rev4-directive.md in full and execute it, plus reviews/exec01-opus-rev3.md and reviews/exec01-grok-rev3.md. Your R1, R2 and R3 closures were VERIFIED GENUINELY CLOSED and no false factual claim was found in rev3 - do not touch them, this is narrow. The blocking defect: apps/v2-ui/app/new/page.tsx lines 68 and 74 filter run-cost envelope members by the ASKER risk tier, while the engine resolves the envelope by the EFFECTIVE tier after escalating to the deployment floor, so choosing casual empties the member list and Start never enables with a false explanation. The orchestrator verified live that POST /v1/asks with risk_tier casual returns HTTP 202 QUEUED, so the form refuses an ask the engine accepts - a regression from rev1. Fix by selecting on the effective tier, and put the selection in a PURE FUNCTION in apps/v2-ui/lib/ rather than inline in the component so the divergence test can sit where the divergence is. Reproduce-first: write the RED that reproduces the casual-tier refusal BEFORE fixing. Then re-run EVERY gate and paste real output - the orchestrator re-runs all of them independently and has already caught one claimed-green gate in this ticket. Update the handoff in place, append to handoffs/EXEC-01-progress.log, set the ticket to review and comment 'REWORK READY FOR HERMES REVIEW - EXEC-01 rev4'." \
  </dev/null 2>&1 | tee -a "${LOG}"

print "=== EXEC-01 rev4 exited $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
