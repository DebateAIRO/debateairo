#!/bin/zsh
set -u
MISSION_DIR="/Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3"
LOG="${MISSION_DIR}/docs/missions/2026-08-06-v3-programming/logs/PROV-01-codex.log"
SESSION="019ffb0e-551c-7090-be45-58536ec75cfc"
cd "${MISSION_DIR}" || exit 1
if pgrep -f "codex exec.*(/goal|resume)" >/dev/null 2>&1; then print "REFUSING: codex seat busy" | tee -a "${LOG}"; exit 1; fi
print "=== PROV-01 rev2 resuming ${SESSION} $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
codex exec resume "${SESSION}" -c model='"gpt-5.6-sol"' -c sandbox_mode='"danger-full-access"' \
  "/goal PROV-01 rev1 diamond: Grok APPROVED, Opus 5 BLOCKING with TWO small local items — your behaviour is verified CORRECT in both directions (the lens drove the real page and could not make the system lie); what fails is the proof and one DB guard. Read the newest orchestrator comment on t_779f40b3 and reviews/prov01-opus-rev1.md. B1: apps/api/src/main.ts:43-45 is the entire mechanism carrying MACHINE_DEFAULT through admission and has zero behavioural coverage — replacing the clause with 'return resolved;' reinstates the exact original defect with 529 green; lift the decision into an importable function and test the full {ASKER, MACHINE_DEFAULT} x {escalates, does-not} matrix behaviourally. B2: migration 0020 left MACHINE_DEFAULT outside the row invariant — on real PG the identical row rejected as ASKER is ACCEPTED as MACHINE_DEFAULT, including effective-below-asker; fix the CHECK to (tier_source = 'DEPLOYMENT_POLICY' OR risk_tier = asker_risk_tier) via migration, and prove both directions on real PG. Fold A1: one rendered assertion that the drawer emits the plain-words machine provenance. Re-run every gate, paste real output, same session, back to review with 'REWORK READY FOR HERMES REVIEW - PROV-01 rev2'." \
  </dev/null 2>&1 | tee -a "${LOG}"
print "=== PROV-01 rev2 exited $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
