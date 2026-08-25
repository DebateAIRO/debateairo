#!/bin/zsh
# L1/S01 rework round 1 — SAME codex session (same-terminal law, spine preserved law 4).
set -u
REPO="/Users/vladmihaimiron/Documents/DebateAIRO"
MISSION_DIR="${REPO}/dialectical-engine"
LOG="${MISSION_DIR}/docs/missions/2026-08-21-observability-loop/logs/lane-1-s01-rework1.log"
SESSION="01a0260a-f3e6-7870-a7de-a97f569520ba"
export PATH="/Applications/ChatGPT.app/Contents/Resources:${PATH}"
cd "${MISSION_DIR}" || exit 1
print "=== L1/S01 REWORK 1 resuming session ${SESSION} $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
codex exec resume "${SESSION}" \
  -c model_reasoning_effort='"xhigh"' \
  -c sandbox_mode='"danger-full-access"' \
  "/goal REWORK ROUND 1 of 3 on your ticket t_1fde033d. All three independent review lenses returned RED. Read docs/missions/2026-08-21-observability-loop/reviews/L1-S01-rework-1.md IN FULL — it is the Router's unioned finding set with ids E1,E2 (evidence integrity), B1,B2 (blocker), H1,H2,H3 (high), M1-M5, L1-L4, plus a 'held under attack' list you must NOT churn. Post REWORK ACKNOWLEDGED on the ticket naming the triggering findings, then address every id one by one in the SAME worktree .worktrees/obs-lane-1 on the same branch. REPRODUCE-FIRST IS MANDATORY on every finding: demonstrate the exact reported defect against current code and attach that output BEFORE fixing it. Two of the findings (E1, E2) are that assertions were weakened after RED to reach green — do not do that again; if the product cannot satisfy an acceptance claim, report it as a finding rather than moving the assertion. Your file contract is unchanged: exactly the five allowed paths; if a fix seems to need a sixth, STOP and post a blocker. You may NOT push, merge, or mark Done. End with REWORK READY FOR HERMES REVIEW posted as a ticket comment, addressing every finding id, with exact reproduce-then-fix output. Then stop." \
  </dev/null 2>&1 | tee -a "${LOG}"
print "=== L1/S01 REWORK 1 exited $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
