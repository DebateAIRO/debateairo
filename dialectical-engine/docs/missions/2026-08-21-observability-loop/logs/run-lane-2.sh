#!/bin/zsh
# L2 (capture package) — Codex coding seat. Five slices, one lane, in-lane order.
set -u
REPO="/Users/vladmihaimiron/Documents/DebateAIRO"
MISSION_DIR="${REPO}/dialectical-engine"
LOG="${MISSION_DIR}/docs/missions/2026-08-21-observability-loop/logs/lane-2-capture.log"
export PATH="/Applications/ChatGPT.app/Contents/Resources:${PATH}"
cd "${MISSION_DIR}" || exit 1

# Dependency gate: L1 must be merged into the base before L2 starts.
if ! (cd "${REPO}" && git log --oneline -20 | grep -q "L1/S01 store foundation"); then
  print "GATE FAILED: L1/S01 is not merged into the base. Not dispatching." | tee -a "${LOG}"; exit 2
fi
print "=== L2 capture seat starting $(date -u +%FT%TZ) (HEAD $(cd "${REPO}" && git log --oneline -1)) ===" | tee -a "${LOG}"
codex exec \
  -c model='"gpt-5.6-sol"' \
  -c model_reasoning_effort='"xhigh"' \
  -c sandbox_mode='"danger-full-access"' \
  "/goal Read docs/missions/2026-08-21-observability-loop/goal-packets/lane-2-capture.md in full and execute it. It is your complete contract. It assigns you LANE L2 — five slices in ONE lane, worked in this exact in-lane order: S03a t_489ecbcc package scaffold, then S02 t_8e040ec2 code registry + safe templates, then S03b t_9b5ca941 capture core, then S04 t_d1e18a14 zone classifier and S05 t_6e99d607 installers (those last two are independent of each other). Read each ticket with: hermes kanban --board observability-loop show <id> — always --board BEFORE the verb, never boards switch. Each ticket body is your authoritative file contract, tests glob, RED->GREEN obligation and forbidden list. Create your worktree .worktrees/obs-lane-2 on branch obs-lane-2-capture (lawful: LANE PLAN approved at authority_epoch 1). Post WORKER CLAIM per slice. The merged L1 store foundation (migrations/0034, packages/db/src/obs-schema.ts) is your dependency: READ it, never modify it. THE PACKET CONTAINS SIX LESSONS FROM L1 THAT COST THREE REVIEW ROUNDS — read them before you write a single test; the two that mattered most were exercising claims over the REAL role rather than the superuser pool, and never strengthening a test by weakening the system. You may NOT push, merge, or mark Done, and you never choose between conflicting plan properties — that is a blocker. End each slice at READY FOR PEER REVIEW posted as a ticket comment with exact RED->GREEN output, file:line frames intact. Then stop." \
  </dev/null 2>&1 | tee -a "${LOG}"
print "=== L2 capture seat exited $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
