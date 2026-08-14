#!/bin/zsh
set -u
MISSION_DIR="/Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3"
LOG="${MISSION_DIR}/docs/missions/2026-08-06-v3-programming/logs/UX-01-codex.log"
SESSION="019ff9a3-86e1-7912-9afb-8ba10ad44736"
cd "${MISSION_DIR}" || exit 1
if pgrep -f "codex exec.*(/goal|resume)" >/dev/null 2>&1; then print "REFUSING: codex seat busy" | tee -a "${LOG}"; exit 1; fi
print "=== UX-01 rev2 resuming ${SESSION} $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
codex exec resume "${SESSION}" -c model='"gpt-5.6-sol"' -c sandbox_mode='"danger-full-access"' \
  "/goal UX-01 rev1 diamond: Grok APPROVED, Opus 5 BLOCKING with six findings — and B1 is LIVE-URGENT: your agent_count default reads deployment.model_ledger, whose only writer has zero production callers, so on the LIVE stack /new renders Start DISABLED with a no-configured-agents banner — worse than before your change. Read the newest orchestrator comment on t_b2f82786 and reviews/ux01-opus-rev1.md. Fixes: B1 switch the carrier to the configuredProviderSet register row on the SAME readDeployment response, via the readDeploymentMakerCapability vocabulary — the engine's own maker count (live: 2, OpenAI + Anthropic); B2 split the three deployment derivations so each fails independently; B3 dies with B1 (the ledger's task-class cardinality was the wrong semantics entirely — fix your fixture too); B4 render the REAL NewDebatePage in tests/render per LOAD-01's precedent, and make deleting the seeding calls go red; B5 guard the failure path — fabricating defaults on derivation failure must go red; B6 pin TZ in the as_of test. A5 conservative path: riskTier may default to the DEPLOYMENT FLOOR (machine fact, cite it); budget-tier defaulting is a VALUE — drop it back to user-owned OR carry it with an explicit QUESTION FOR V; do not invent a selection rule. Verify against the LIVE stack read-only (the standing deployment endpoint) that the form now derives 2 and Start enables. Re-run every gate, paste real output including vitest list, same session, back to review with 'REWORK READY FOR HERMES REVIEW - UX-01 rev2'." \
  </dev/null 2>&1 | tee -a "${LOG}"
print "=== UX-01 rev2 exited $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
