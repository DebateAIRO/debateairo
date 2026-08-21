#!/bin/zsh
set -u
MISSION_DIR="/Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3"
LOG="${MISSION_DIR}/docs/missions/2026-08-06-v3-programming/logs/UX-01-codex.log"
SESSION="019ff9a3-86e1-7912-9afb-8ba10ad44736"
cd "${MISSION_DIR}" || exit 1
if pgrep -f "codex exec.*(/goal|resume)" >/dev/null 2>&1; then print "REFUSING: codex seat busy" | tee -a "${LOG}"; exit 1; fi
print "=== UX-01 rev3 resuming ${SESSION} $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
codex exec resume "${SESSION}" -c model='"gpt-5.6-sol"' -c sandbox_mode='"danger-full-access"' \
  "/goal UX-01 rev2 confirmation: ALL SIX rev1 blockers verified closed — one item remains and it is V's own DR-166-A amendment, which your rev2 missed: the two-identity assertion does not exist, your only session fixture is the V-flavoured asker:v-session, and MUT-I (hardcoding owners to that person-constant — exactly what DR-166-A outlaws) passes the full suite green. Your production code is behaviourally CORRECT — the lens wrote the missing assertion itself and it passes — so this is ONLY the guard. Read the newest orchestrator comment on t_b2f82786 and reviews/ux01-opus-rev2.md. REV3, narrow, nothing else: (1) add the two-identity assertion THROUGH THE REAL RENDERED PAGE (two different tokens -> two different derived owner defaults); (2) move the fixture off asker:v-session to a neutral identity; (3) prove MUT-I goes RED. Re-run the gates, paste real output, same session, back to review with 'REWORK READY FOR HERMES REVIEW - UX-01 rev3'." \
  </dev/null 2>&1 | tee -a "${LOG}"
print "=== UX-01 rev3 exited $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
