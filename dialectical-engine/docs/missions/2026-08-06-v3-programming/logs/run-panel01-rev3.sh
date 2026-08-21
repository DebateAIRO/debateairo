#!/bin/zsh
set -u
MISSION_DIR="/Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3"
LOG="${MISSION_DIR}/docs/missions/2026-08-06-v3-programming/logs/PANEL-01-codex.log"
SESSION="019ff5ab-8e6e-7fb3-a433-6a06956f07d6"
cd "${MISSION_DIR}" || exit 1
if pgrep -f "codex exec.*(/goal|resume)" >/dev/null 2>&1; then print "REFUSING: codex seat busy" | tee -a "${LOG}"; exit 1; fi
print "=== PANEL-01 rev3 resuming ${SESSION} $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
codex exec resume "${SESSION}" -c model='"gpt-5.6-sol"' -c sandbox_mode='"danger-full-access"' \
  "/goal PANEL-01 rev2 diamond: Grok APPROVED, Opus 5 CHANGES REQUESTED with ONE narrow blocking, about 2 lines. Read reviews/panel01-opus-rev2.md. All three ruled closures are VERIFIED CLOSED by mutation — do not touch them. B-4: makeEnvelopeTerminal at apps/runner/src/index.ts:944 REASSIGNS the record array and discards the DR-161 ConditionMarkRecord, while createEnvelopeExhaustedResult (packages/serve/src/index.ts:375) inherits the marks — so UNSERVED-MAKER-POSITION reaches the serve gate recordless and serve:910's own new enforcement THROWS: an M=2 run that exhausts its envelope CRASHES instead of serving components-only, the exact graceful hard stop DR-161's A-3 note promised. Fix: preserve the record through the envelope-terminal path, plus ONE serve-unit test driving an M=2 envelope-exhausted persist (the only existing envelope-exhausted test is M=1). Fold advisory 4 (assert the serve node set has exactly one member) and advisory 2 (reword the raw rule token 'first-configured-provider' out of the human reason prose) while you are in those files. Re-run the gates, paste real output, same session, back to review with 'REWORK READY FOR HERMES REVIEW - PANEL-01 rev3'." \
  </dev/null 2>&1 | tee -a "${LOG}"
print "=== PANEL-01 rev3 exited $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
