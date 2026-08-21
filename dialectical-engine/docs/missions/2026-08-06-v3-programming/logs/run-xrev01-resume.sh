#!/bin/zsh
set -u
MISSION_DIR="/Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3"
LOG="${MISSION_DIR}/docs/missions/2026-08-06-v3-programming/logs/XREV-01-codex.log"
SESSION="019ff7d3-d99a-7212-9bd3-33271c577712"
cd "${MISSION_DIR}" || exit 1
if pgrep -f "codex exec.*(/goal|resume)" >/dev/null 2>&1; then print "REFUSING: codex seat busy" | tee -a "${LOG}"; exit 1; fi
print "=== XREV-01 resume (authorization) $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
codex exec resume "${SESSION}" -c model='"gpt-5.6-sol"' -c sandbox_mode='"danger-full-access"' \
  "/goal AUTHORIZATION, from the Main Orchestrator (Claude-Router seat, spine 5.1): your /goal packet IS your route authorization — the orchestrator launches every worker directly (the /goal launch law), the lane plan is DR-153 (Codex implements, dual diamond reviews), your workspace is the shared working tree (no worktree on this mission; DR-163-A serialisation is the orchestrator's job and no mutating lens is active now), and the canonical typed state is board ticket t_b8750870 plus the ledger through DR-164. You are fully authorized to proceed. NIGHT MODE stands: questions go in the handoff's QUESTIONS FOR V section. Operational note: the standing ceremony is currently EXECUTING a live user debate in-process — do NOT restart any service; iterate on provider doubles only, as your packet orders. Unblock the ticket if you moved it, work docs/missions/2026-08-06-v3-programming/goal-packets/XREV-01-codex-goal.md, and proceed to READY FOR PEER REVIEW - XREV-01." \
  </dev/null 2>&1 | tee -a "${LOG}"
print "=== XREV-01 resume exited $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
