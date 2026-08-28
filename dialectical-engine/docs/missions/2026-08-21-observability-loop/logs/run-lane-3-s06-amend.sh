#!/bin/zsh
set -u
REPO="/Users/vladmihaimiron/Documents/DebateAIRO"
MISSION_DIR="${REPO}/dialectical-engine"
LOG="${MISSION_DIR}/docs/missions/2026-08-21-observability-loop/logs/lane-3-s06-amend.log"
export PATH="/Applications/ChatGPT.app/Contents/Resources:${PATH}"
cd "${MISSION_DIR}" || exit 1
SESSION=$(grep -oE "session id: [0-9a-f-]{36}" "${MISSION_DIR}/docs/missions/2026-08-21-observability-loop/logs/lane-3.log" | head -1 | awk '{print $3}')
print "=== S06 AMEND resuming session ${SESSION} $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
codex exec resume "${SESSION}" \
  -c model_reasoning_effort='"xhigh"' \
  -c sandbox_mode='"danger-full-access"' \
  "/goal S06 CONTRACT AMENDMENT — NOT A DEFECT RETURN. Your S07 blocker was correct and it changed the plan, not your work. Two architecture seats were fired on it; the ruling is that NEITHER proposed route was right, because S06 ALREADY OWNS the disputed branch under your existing contract: the if(!recorded) branch sits INSIDE your allowed task-catch region, and your readonly pin never reached it. So no boundary moves and you are charged no defect. Read the ruling at planning/S07-ownership-ruling.md and the amendment comment on your ticket: hermes kanban --board observability-loop show t_5504afe0 — always put --board observability-loop BEFORE the verb, never run boards switch. WHAT IS ADDED TO S06. Your GREEN gains OBS-R064: on the !recorded path, the error LEAVING the handler must be the caught error itself, or a wrapper whose cause chain CONTAINS it; the original is never discarded, and the record-failure condition is never signalled BY discarding it; the RUNNER_FAILURE_STATE_NOT_RECORDED signal must still survive, on the capture channel. Your traceability gains OBS-R064. Your RED must demonstrate the CURRENT DEFECT first: apps/runner/src/index.ts throws a NEW TypedDomainError RUNNER_FAILURE_STATE_NOT_RECORDED that REPLACES the caught error, while throw error covers only the recorded-true path — so today, when the system fails to record a failure, it also destroys the evidence of what failed. Show that against current code, with file colon line frames intact, before you fix it. NOTHING ELSE CHANGES: every allowed, forbidden, readonly and tests list stands; the S06 then S07 lane order stands; you already wire capture emit in that catch and RUNNER_FAILURE_STATE_NOT_RECORDED is already registered in the L2 registry, so you satisfy this alone without S07. Keep everything else you built — 5 test files and 29 tests passed and are not in question. Then, once S06 is re-handed off, S07 is unblocked as written: its forbidden list retains task-catch and gateway-seam verbatim. End at READY FOR PEER REVIEW on t_5504afe0 with exact RED to GREEN output. No push, no merge, no Done. Then stop." \
  </dev/null 2>&1 | tee -a "${LOG}"
print "=== S06 AMEND exited $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
