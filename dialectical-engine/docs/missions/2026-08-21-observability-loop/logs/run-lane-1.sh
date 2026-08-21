#!/bin/zsh
# L1 / S01 — obs store foundation. Codex coding seat (sole coder, roster).
# Refuses to start unless the ROW-GIT precondition has landed.
set -u
REPO="/Users/vladmihaimiron/Documents/DebateAIRO"
MISSION_DIR="${REPO}/dialectical-engine"
LOG="${MISSION_DIR}/docs/missions/2026-08-21-observability-loop/logs/lane-1-s01.log"
export PATH="/Applications/ChatGPT.app/Contents/Resources:${PATH}"
cd "${MISSION_DIR}" || exit 1

# --- ROW-GIT ancestry gate (spine: orchestrator verifies BEFORE dispatch) ---
PENDING_D=$(cd "${REPO}" && git status --porcelain | grep -c "^ D" || true)
if [ "${PENDING_D}" -gt 100 ]; then
  print "GATE FAILED: ${PENDING_D} pending deletions — the P0 ROW-GIT reconciliation commit has not landed."
  print "A lane worktree would not contain the product tree (package.json, vitest.config.ts, apps/** are untracked)."
  print "Codex could not install, run a test, or produce RED->GREEN evidence. Not dispatching." | tee -a "${LOG}"
  exit 2
fi

print "=== L1/S01 Codex seat starting $(date -u +%FT%TZ) (HEAD $(cd "${REPO}" && git log --oneline -1)) ===" | tee -a "${LOG}"
codex exec \
  -c model='"gpt-5.6-sol"' \
  -c model_reasoning_effort='"xhigh"' \
  -c sandbox_mode='"danger-full-access"' \
  "/goal Read docs/missions/2026-08-21-observability-loop/goal-packets/lane-1-s01.md in full and execute it. It is your complete contract. It points you at Kanban ticket t_1fde033d on board observability-loop (read it with: hermes kanban --board observability-loop show t_1fde033d — always put --board before the verb, never run boards switch); that ticket body is your authoritative file contract, test glob, RED->GREEN obligation and forbidden list. Create your worktree .worktrees/obs-lane-1 on branch obs-lane-1-store (lawful: LANE PLAN approved at authority_epoch 1), post WORKER CLAIM with your session id, then do RED->GREEN TDD. You may NOT push, merge, mark Done, or touch anything outside contract.allowed. End at READY FOR PEER REVIEW posted as a ticket comment, with exact failing-then-passing output. Then stop." \
  </dev/null 2>&1 | tee -a "${LOG}"
print "=== L1/S01 Codex seat exited $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
