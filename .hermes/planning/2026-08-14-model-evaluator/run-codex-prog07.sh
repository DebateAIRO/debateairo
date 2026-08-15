#!/bin/zsh
cd /Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-07-profiles/DebateAI-V3
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/.hermes/planning/2026-08-14-model-evaluator/logs/PROG-07-codex.log
echo "=== PROG-07 codex launch $(date) ===" | tee -a "$LOG"
/Applications/ChatGPT.app/Contents/Resources/codex exec -c model='"gpt-5.6-sol"' -s danger-full-access "$(cat /Users/vladmihaimiron/Documents/DebateAIRO/.hermes/planning/2026-08-14-model-evaluator/pointer-prog07.txt)" < /dev/null 2>&1 | tee -a "$LOG"
echo "=== codex exited $(date) ===" | tee -a "$LOG"
