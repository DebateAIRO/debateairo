#!/bin/zsh
set -u
MISSION_DIR="/Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3"
LOG="${MISSION_DIR}/docs/missions/2026-08-06-v3-programming/logs/UI-02c-codex.log"
SESSION="019ff616-0a32-74f3-bcf8-9b4a8dc3d88f"
cd "${MISSION_DIR}" || exit 1
if pgrep -f "codex exec.*(/goal|resume)" >/dev/null 2>&1; then print "REFUSING: codex seat busy" | tee -a "${LOG}"; exit 1; fi
print "=== UI-02c rev2 resuming ${SESSION} $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
codex exec resume "${SESSION}" -c model='"gpt-5.6-sol"' -c sandbox_mode='"danger-full-access"' \
  "/goal UI-02c rev1 diamond: Grok APPROVED, Opus 5 CHANGES REQUESTED with ONE blocking. Read the newest orchestrator comment on t_0829cf81 and reviews/ui02c-opus-rev1.md. A2 and A5 are verified closed — do not touch them. B1: the house reaches the reader on exactly two lines (ModelPresentation.tsx:25 and :42) and deleting that composition keeps every gate green while the render reverts to the mono-model defect this ticket was cut for. Fix per the lens: extract makerIdentityLabel({maker, modelId}) as a pure function in apps/v2-ui/lib/, have both render sites use it, assert same-model/different-maker yields two labels each naming its own house, assert maker null yields the absence text, and add the same-model/different-maker pair to tests/support/v2uiFixtures.ts. Prove the mutation: delete the label composition from the components — the new tests must go RED. Fold advisory A-1: the typed-absence state needs styling consistent with the scoring pills (CSS for the absence state, a title, and no solid identity dot arguing against its own text). Record A-2 (colour hash collides on the repo's own fixture makers) and A-3 (the model half is inferred from the id string) in the handoff. IMPORTANT: HYG-01 landed since your rev1 — re-baseline first (the suite is now 471 tests, a control-byte guard is enforced, and a manifest-completeness assertion governs apps/v2-ui/**/*.test.mjs — if you add any .mjs test it must go in the runner manifest). Re-run every gate, paste real output, same session, back to review with 'REWORK READY FOR HERMES REVIEW - UI-02c rev2'." \
  </dev/null 2>&1 | tee -a "${LOG}"
print "=== UI-02c rev2 exited $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
