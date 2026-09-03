#!/bin/zsh
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine || exit 1
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/ui-overhaul/logs/CODE-T9C2-R1-codex.log
PACKET=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/ui-overhaul/packets/CODE-T9C2.md
echo "[launch] $(date '+%F %T') CODE-T9C2-R1 codex resume 01a05a3c" | tee "$LOG"
/Applications/ChatGPT.app/Contents/Resources/codex exec resume -c model='"gpt-5.6-sol"' -c sandbox_mode='"workspace-write"' -c 'sandbox_workspace_write.writable_roots=["/Users/vladmihaimiron/.hermes"]' 01a05a3c-42d1-7772-a3a6-ddae54b9447f "Your CODEX BLOCKED was CORRECT and the contract is repaired (ARCH-01-AM8, commit 8fc6480): T9-C2-2 is narrowed to the chrome primary CTA in your subtree; the hero pair moved to T9-C4. Fresh authority on t_3c187757: authority_epoch=11, HERMES AUTHORIZED. RE-READ your packet fully — it changed in place: $PACKET. Then proceed: RED first, implement, mutants, gates, handoff." < /dev/null 2>&1 | tee -a "$LOG"
echo "[exit] $(date '+%F %T') CODE-T9C2-R1 exited rc=$?" | tee -a "$LOG"
