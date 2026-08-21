#!/bin/zsh
set -u
MISSION_DIR="/Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3"
LOG="${MISSION_DIR}/docs/missions/2026-08-06-v3-programming/logs/UI-02d-codex.log"
SESSION="019ffa6b-23b6-7c80-83cd-970beddc4385"
cd "${MISSION_DIR}" || exit 1
if pgrep -f "codex exec.*(/goal|resume)" >/dev/null 2>&1; then print "REFUSING: codex seat busy" | tee -a "${LOG}"; exit 1; fi
print "=== UI-02d resume (packet restored) $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
codex exec resume "${SESSION}" -c model='"gpt-5.6-sol"' -c sandbox_mode='"danger-full-access"' \
  "/goal PACKET RESTORED — the orchestrator's fault: the goal packet was written seconds after your claim. It now exists at docs/missions/2026-08-06-v3-programming/goal-packets/UI-02d-codex-goal.md — read it in full and proceed. The ticket t_94ac4a9d is unblocked and reassigned to you. Your CODEX BLOCKED call was correct procedure. Scope: DR-165(2) exact model id in rendered card text via the makerIdentityLabel seam; pin the six unpinned maker surfaces (prefer rendered-behaviour pins under the now-enforced render layer); scope the render ratchet per function; aria-label on the absence pill. Mutation-proof per house standard, vitest list collection proof, every gate with real pasted output. Progress log handoffs/UI-02d-progress.log, handoff handoffs/UI-02d-codex-handoff.md, then review with 'READY FOR PEER REVIEW - UI-02d'." \
  </dev/null 2>&1 | tee -a "${LOG}"
print "=== UI-02d resume exited $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
