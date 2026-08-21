#!/bin/zsh
set -u
MISSION_DIR="/Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3"
LOG="${MISSION_DIR}/docs/missions/2026-08-06-v3-programming/logs/UI-01-rework-codex.log"
SESSION="019ff552-cb5b-7a00-bd59-1428e42c9d87"
cd "${MISSION_DIR}" || exit 1
if pgrep -f "codex exec.*(/goal|resume)" >/dev/null 2>&1; then print "REFUSING: codex seat busy" | tee -a "${LOG}"; exit 1; fi
print "=== UI-01 rework rev3 resuming ${SESSION} $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
codex exec resume "${SESSION}" -c model='"gpt-5.6-sol"' -c sandbox_mode='"danger-full-access"' \
  "/goal UI-01 rework rev2 diamond: Grok APPROVED, Opus 5 CHANGES REQUESTED with 2 blocking - B1 and B2 are VERIFIED CLOSED, what remains is the DR-160 half. Read docs/missions/2026-08-06-v3-programming/reviews/UI-01-rework-rev3-directive.md in full, plus reviews/ui01-rework-opus-rev2.md. B4 is a rev2 REGRESSION you introduced: at 640px with a NORMAL-length question, four top-bar actions render outside the viewport because your ported phone CSS kept V2's grid but DROPPED its two display rules (.debateInlineActions display:none and .debateOverflow display:block, debate-chrome.css:434-436 and :459-463), and your need-measurement at DebatePageClient.tsx:760-763 uses getBoundingClientRect on the SHRUNK row so action overflow is undetectable by construction - measure intrinsic content width instead. B5: your DR-160 ratchet only unit-calls the 3-line predicate; four mutations survive the full suite (neededWidth always 0, title width times 0, observers removed, always-collapse) and the lens applied the first one LIVE and got the crushed title back at 1280px with tests green - assert through the measurement path and state which enforced assertion kills which of the four mutations. Fold A8 (Approve button overlaps its reason copy at 640px), A9 (correct the false AC rows), A11 (whitespace-fragile anchor). Re-run every gate, paste real output, same session, back to review with 'REWORK READY FOR HERMES REVIEW - UI-01 rework rev3'." \
  </dev/null 2>&1 | tee -a "${LOG}"
print "=== UI-01 rework rev3 exited $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
