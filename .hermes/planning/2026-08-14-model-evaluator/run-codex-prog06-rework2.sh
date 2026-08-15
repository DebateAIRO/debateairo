#!/bin/zsh
cd /Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-06-addon/DebateAI-V3
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/.hermes/planning/2026-08-14-model-evaluator/logs/PROG-06-codex-rework2.log
echo "=== PROG-06 rework2 launch $(date) ===" | tee -a "$LOG"
/Applications/ChatGPT.app/Contents/Resources/codex exec resume 01a00518-248a-77c3-8489-5ca9c05f6901 -m gpt-5.6-sol -c sandbox_mode='"danger-full-access"' "$(cat /Users/vladmihaimiron/Documents/DebateAIRO/.hermes/planning/2026-08-14-model-evaluator/pointer-prog06-rework2.txt)" < /dev/null 2>&1 | tee -a "$LOG"
echo "=== codex exited $(date) ===" | tee -a "$LOG"
