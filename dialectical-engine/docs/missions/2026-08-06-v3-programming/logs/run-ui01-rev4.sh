#!/bin/zsh
set -u
MISSION_DIR="/Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3"
LOG="${MISSION_DIR}/docs/missions/2026-08-06-v3-programming/logs/UI-01-rework-codex.log"
SESSION="019ff552-cb5b-7a00-bd59-1428e42c9d87"
cd "${MISSION_DIR}" || exit 1
if pgrep -f "codex exec.*(/goal|resume)" >/dev/null 2>&1; then print "REFUSING: codex seat busy" | tee -a "${LOG}"; exit 1; fi
print "=== UI-01 rework rev4 resuming ${SESSION} $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
codex exec resume "${SESSION}" -c model='"gpt-5.6-sol"' -c sandbox_mode='"danger-full-access"' \
  "/goal UI-01 rework rev3 diamond: Grok APPROVED, Opus 5 CHANGES REQUESTED with ONE blocking, and it is four lines. Read reviews/ui01-rework-opus-rev3.md. B4 is CLOSED (verified live across six viewport/question combinations) and B5 is CLOSED at the library — all five mutations on debateHeaderOverflow.ts go RED. B6: the SAME four mutations applied at the DebatePageClient.tsx WIRING SEAM survive 38/38 green — setHeaderActionsCollapsed(false) at :790, titleIntrinsicWidth times zero at :784, measure no-op at :799, availableWidth 1e9 at :778. Nothing pins those four lines. Fix exactly as the lens prescribes: four toContain assertions in the test that already has six of that shape (tests/unit/v2ui-pages.test.ts:299-304 region), each naming which wiring mutation it kills — or extract readDebateHeaderGeometry for a behavioural kill if that is cleaner. Also correct the two handoff rows A9 inherits (the MUT-E/G/F/H acceptance row is true only for lib-site application) and fold the A13 naming nit if trivial. Re-run the enforced suite and paste real output. Same session, back to review with 'REWORK READY FOR HERMES REVIEW - UI-01 rework rev4'." \
  </dev/null 2>&1 | tee -a "${LOG}"
print "=== UI-01 rework rev4 exited $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
