#!/bin/zsh
cd /Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-11-devmenu/DebateAI-V3
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/.hermes/planning/2026-08-14-model-evaluator/logs/PROG-11-codex.log
echo "=== PROG-11 codex launch $(date) ===" | tee -a "$LOG"
/Applications/ChatGPT.app/Contents/Resources/codex exec -c model='"gpt-5.6-sol"' -s danger-full-access "$(cat /Users/vladmihaimiron/Documents/DebateAIRO/.hermes/planning/2026-08-14-model-evaluator/pointer-prog11.txt)" < /dev/null 2>&1 | tee -a "$LOG"
echo "=== codex exited $(date) ===" | tee -a "$LOG"
