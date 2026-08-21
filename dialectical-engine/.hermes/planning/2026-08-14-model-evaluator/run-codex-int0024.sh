#!/bin/zsh
cd /Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/.hermes/planning/2026-08-14-model-evaluator/logs/INT-0024-codex.log
echo "=== INT-0024 codex launch $(date) ===" | tee -a "$LOG"
/Applications/ChatGPT.app/Contents/Resources/codex exec -c model='"gpt-5.6-sol"' -s danger-full-access "$(cat /Users/vladmihaimiron/Documents/DebateAIRO/.hermes/planning/2026-08-14-model-evaluator/pointer-int0024.txt)" < /dev/null 2>&1 | tee -a "$LOG"
echo "=== codex exited $(date) ===" | tee -a "$LOG"
