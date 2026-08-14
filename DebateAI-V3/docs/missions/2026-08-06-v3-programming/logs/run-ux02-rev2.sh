#!/bin/zsh
set -u
MISSION_DIR="/Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3"
LOG="${MISSION_DIR}/docs/missions/2026-08-06-v3-programming/logs/UX-02-codex.log"
SESSION="019ffacc-335c-76e1-a91a-5f00992b82a7"
cd "${MISSION_DIR}" || exit 1
if pgrep -f "codex exec.*(/goal|resume)" >/dev/null 2>&1; then print "REFUSING: codex seat busy" | tee -a "${LOG}"; exit 1; fi
print "=== UX-02 rev2 resuming ${SESSION} $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
codex exec resume "${SESSION}" -c model='"gpt-5.6-sol"' -c sandbox_mode='"danger-full-access"' \
  "/goal UX-02 rev1 diamond: Grok APPROVED, Opus 5 CHANGES REQUESTED with 3 blocking — and V has RULED the surface question (DR-166-C), so everything is decided. Read the newest orchestrator comment on t_e795a52c and reviews/ux02-opus-rev1.md. The ruled default form: QUESTION, RISK TIER, BUDGET TIER, THE DEPTH DIAL, START — risk and budget stay visible (V: they are user selected); the DEPTH DIAL comes OUT of the Options panel onto the default surface (your rev1 silently left it buried — B1); the five machinery fields stay collapsed in Advanced as you delivered. B2: your disclosure test writes the state slot directly and never clicks — a dead onClick keeps 521 green; click the REAL button in the test (this also retires A1's hook-order coupling). B3: assert Start is ready COLLAPSED and drive one behavioural submit from the never-opened state — inverting ready to require Advanced-open must go red. Fold A2 (fix the dangling aria-controls when collapsed; give the Options toggle ARIA) and A3 (make the helper copy match the ruled surface). Your conditional mount, MUT-1 kill, DR-166-A guard and layout-only discipline all HOLD — do not rework them. Re-run every gate, paste real output, same session, back to review with 'REWORK READY FOR HERMES REVIEW - UX-02 rev2'." \
  </dev/null 2>&1 | tee -a "${LOG}"
print "=== UX-02 rev2 exited $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
