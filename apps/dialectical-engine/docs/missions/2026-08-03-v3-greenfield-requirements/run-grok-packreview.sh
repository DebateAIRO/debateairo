#!/bin/zsh
cd /Users/vladmihaimiron/Documents/DebateAIRO/apps/dialectical-engine
mkdir -p docs/missions/2026-08-03-v3-greenfield-requirements/logs
echo "[launch] Grok map-review lens — $(date)"
"$HOME/.grok/bin/grok" \
  -p "Read the goal packet at docs/missions/2026-08-03-v3-greenfield-requirements/goal-packets/grok-packreview.md and execute it exactly. Work to the handoff marker; write only your single allowed artifact." \
  -m grok-4.5 --permission-mode bypassPermissions \
  2>&1 | tee docs/missions/2026-08-03-v3-greenfield-requirements/logs/grok-packreview.log
echo "[done] Grok map-review lens — $(date)"
