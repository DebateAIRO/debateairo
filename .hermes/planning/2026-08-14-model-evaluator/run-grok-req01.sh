#!/bin/zsh
cd /Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/.hermes/planning/2026-08-14-model-evaluator/logs/REQ-01-grok.log
echo "=== REQ-01 grok launch $(date) ===" | tee -a "$LOG"
~/.grok/bin/grok -p "/goal Read the goal packet at docs/missions/2026-08-14-model-evaluator/goal-packets/REQ-01-grok-requirements.md and execute it fully. It is your bounded goal; follow its read order, constraints, and return rule exactly." -m grok-4.5 --permission-mode bypassPermissions 2>&1 | tee -a "$LOG"
echo "=== grok exited $(date) ===" | tee -a "$LOG"
