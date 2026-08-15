#!/bin/zsh
cd /Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-03-domains/DebateAI-V3
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/.hermes/planning/2026-08-14-model-evaluator/logs/PROG-03-codex-rework1.log
echo "=== PROG-03 rework1 launch $(date) ===" | tee -a "$LOG"
/Applications/ChatGPT.app/Contents/Resources/codex exec resume 01a001d2-7041-7480-b14b-c1f7b6040163 -m gpt-5.6-sol -c sandbox_mode='"danger-full-access"' "$(cat /Users/vladmihaimiron/Documents/DebateAIRO/.hermes/planning/2026-08-14-model-evaluator/pointer-prog03-rework1.txt)" < /dev/null 2>&1 | tee -a "$LOG"
echo "=== codex exited $(date) ===" | tee -a "$LOG"
