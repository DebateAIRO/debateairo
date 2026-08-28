#!/bin/zsh
# Grok — SOLE reviewer for S02 (V roster amendment A5).
set -u
MISSION_DIR="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
LOG="${MISSION_DIR}/docs/missions/2026-08-21-observability-loop/logs/grok-review-s02.log"
cd "${MISSION_DIR}" || exit 1
print "=== GROK REVIEW S02 starting $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
"${HOME}/.grok/bin/grok" \
  -p "/goal Read docs/missions/2026-08-21-observability-loop/goal-packets/grok-review-s02.md in full and execute it. It is your complete contract. You are now the mission's SOLE reviewer — V re-seated review from three blind Claude Opus lenses to you alone, so you must carry all three lenses yourself: correctness, security/data-safety, and product-truth. Nothing behind you catches what you miss. You are reviewing ticket t_8e040ec2 (S02 code registry) in worktree .worktrees/obs-lane-2. Read the ticket with: hermes kanban --board observability-loop show t_8e040ec2 — always put --board observability-loop BEFORE the verb, and never run boards switch. Recompute the pinned hash yourself from the recipe rather than trusting the test's assertion. Attack the id validator hardest: the last two rounds died there, and the previous reviewer proved it had been narrowed to its own examples rather than to the class, so construct NEW attacks it did not try. Do not review package.json or pnpm-lock.yaml — those are TP-10, owned by another slice and V-authorized. Post your verdict as a comment on the ticket using PEER REVIEW APPROVED or PEER REVIEW CHANGES REQUESTED with per-lens lines; do NOT post READY FOR HERMES REVIEW. You are read-only on the change: report findings, never write the fix. Your job is not to approve — try to break it, and approve only when you have tried and failed. Then stop." \
  -m grok-4.6 \
  --permission-mode bypassPermissions \
  </dev/null 2>&1 | tee -a "${LOG}"
print "=== GROK REVIEW S02 exited $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
