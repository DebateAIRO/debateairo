#!/bin/zsh
cd /Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/.hermes/planning/2026-08-14-model-evaluator/logs/ARCH-01-hermes.log
echo "=== ARCH-01 hermes launch $(date) ===" | tee -a "$LOG"
~/.local/bin/hermes --yolo -z "/goal Read the goal packet at docs/missions/2026-08-14-model-evaluator/goal-packets/ARCH-01-hermes-architecture.md and execute it fully. Follow its read order, design obligations, constraints, and return rule exactly." 2>&1 | tee -a "$LOG"
echo "=== hermes exited $(date) ===" | tee -a "$LOG"
