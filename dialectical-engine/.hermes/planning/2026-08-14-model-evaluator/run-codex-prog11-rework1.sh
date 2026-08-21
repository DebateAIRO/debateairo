#!/bin/zsh
cd /Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-11-devmenu/DebateAI-V3
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/.hermes/planning/2026-08-14-model-evaluator/logs/PROG-11-codex-rework1.log
echo "=== PROG-11 rework1 launch $(date) ===" | tee -a "$LOG"
/Applications/ChatGPT.app/Contents/Resources/codex exec resume 01a00622-8fcc-7441-bec4-064c0137cb79 -m gpt-5.6-sol -c sandbox_mode='"danger-full-access"' "$(cat /Users/vladmihaimiron/Documents/DebateAIRO/.hermes/planning/2026-08-14-model-evaluator/pointer-prog11-rework1.txt)" < /dev/null 2>&1 | tee -a "$LOG"
echo "=== codex exited $(date) ===" | tee -a "$LOG"
