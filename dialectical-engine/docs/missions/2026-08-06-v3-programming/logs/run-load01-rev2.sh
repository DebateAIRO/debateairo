#!/bin/zsh
set -u
MISSION_DIR="/Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3"
LOG="${MISSION_DIR}/docs/missions/2026-08-06-v3-programming/logs/LOAD-01-codex.log"
SESSION="019ff813-cfdc-7e12-aa4a-11864e128012"
cd "${MISSION_DIR}" || exit 1
if pgrep -f "codex exec.*(/goal|resume)" >/dev/null 2>&1; then print "REFUSING: codex seat busy" | tee -a "${LOG}"; exit 1; fi
print "=== LOAD-01 rev2 resuming ${SESSION} $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
codex exec resume "${SESSION}" -c model='"gpt-5.6-sol"' -c sandbox_mode='"danger-full-access"' \
  "/goal LOAD-01 rev1 diamond: BOTH lenses CHANGES REQUESTED with complementary findings — five blockers, and the core (404 dead, loading-to-settled without reload) is genuinely right. Read the newest orchestrator comment on t_4020ac7b, reviews/load01-grok-rev1.md and reviews/load01-opus-rev1.md. The five: GROK-B1 the PRODUCTION Hatchet task never records a mid-review throw as work FAILED (your handoff cited the acceptance dispatcher's catch, which does not exist on the production path) — record the typed terminal there per the EXEC-01 recordTerminalFailure precedent and kill the hang with a test. OPUS-B1 the loading view fabricates a 40 percent 'Models arguing' bar for QUEUED/CLAIMED/RUNNING alike (DebatePageClient:738) — DR-115 on the very page V's gate waits on; render typed truth, no invented percentage. OPUS-B2 a run dying mid-session shows its failure banner beside a still-live bar and stops reconnecting — the terminal event must flip the debate status. OPUS-B3 ownership is prose — 'OR 1=1' in the projection query and dropping the 401 both leave the suite green; add integration fixtures anon->401 and foreign-asker->404. OPUS-B4 the page 404 guard is a source regex defeated by 'if (0)' — make it behavioural. ENABLER, adopt it as part of this rework: the Opus lens proved a 12-line vitest config (oxc.jsx.runtime=automatic plus the @/ alias) renders the real client component in this repo — add that render-layer config and make OPUS B1/B2/B4 each a KILLED MUTATION under it; that is the durable fix. State which assertion kills which mutation. Re-run every gate, paste real output, same session, back to review with 'REWORK READY FOR HERMES REVIEW - LOAD-01 rev2'." \
  </dev/null 2>&1 | tee -a "${LOG}"
print "=== LOAD-01 rev2 exited $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
