#!/bin/zsh
set -u
MISSION_DIR="/Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3"
LOG="${MISSION_DIR}/docs/missions/2026-08-06-v3-programming/logs/PANEL-01-codex.log"
SESSION="019ff5ab-8e6e-7fb3-a433-6a06956f07d6"
cd "${MISSION_DIR}" || exit 1
if pgrep -f "codex exec.*(/goal|resume)" >/dev/null 2>&1; then print "REFUSING: codex seat busy" | tee -a "${LOG}"; exit 1; fi
print "=== PANEL-01 rev2 resuming ${SESSION} $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
codex exec resume "${SESSION}" -c model='"gpt-5.6-sol"' -c sandbox_mode='"danger-full-access"' \
  "/goal PANEL-01 rev1 diamond: BOTH lenses CHANGES REQUESTED converging on the same two soul defects, and V has RULED the contract question so everything you need is decided. Read docs/missions/2026-08-06-v3-programming/reviews/PANEL-01-rework-directive.md in full, plus reviews/panel01-opus-rev1.md and reviews/panel01-grok-rev1.md, and DR-161 in the ledger. Your ENGINE WORK IS VERIFIED RIGHT by both lenses — topology, cross-root edges, lineage, arithmetic — do not touch it. The rework is the honesty layer: (1) DR-161 mints a NEW kernel condition mark UNSERVED-MAKER-POSITION — add it to the closed vocabulary, require its typed ConditionMarkRecord at packages/serve/src/index.ts:882 naming BOTH makers and which root was served, give it a plain chip label in labels.ts, stop using UNCOVERED-SCOPE for this, and add the test that fails when the mark or record is missing (the exact []-mutation that survived rev1). (2) The served root is currently providers[0] — OpenAI every run by array position, recorded nowhere; make the rule EXPLICIT and CARRIED (a named rule, its outcome recorded, a test pinning recorded-rule matches served-reality). You are NOT asked to alternate makers — only to stop hiding the rule. (3) The M-guard is correct but deleting it leaves the suite green — add the integration case agent_count 3 -> typed refusal before any model call. Fold or record the advisories per the directive, especially A-1 (the orphaned planner and its FAIR-illegal dead M=1 branch). Contract change means run generate:contract and the architecture suite. Re-run EVERY gate, paste real output, same session, back to review with 'REWORK READY FOR HERMES REVIEW - PANEL-01 rev2'." \
  </dev/null 2>&1 | tee -a "${LOG}"
print "=== PANEL-01 rev2 exited $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
