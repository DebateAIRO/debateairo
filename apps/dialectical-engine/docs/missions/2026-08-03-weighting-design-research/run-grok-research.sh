#!/bin/zsh
cd /Users/vladmihaimiron/Documents/DebateAIRO/apps/dialectical-engine
mkdir -p docs/missions/2026-08-03-weighting-design-research/logs
echo "[launch] Grok 4.5 research seat (freshest-literature + MCDA/UX lens) — $(date)"
"$HOME/.grok/bin/grok" \
  -p "Read the goal packet at docs/missions/2026-08-03-weighting-design-research/goal-packets/grok-research.md and execute it exactly. Work to the handoff marker; write only your single allowed artifact." \
  -m grok-4.5 --permission-mode bypassPermissions \
  2>&1 | tee docs/missions/2026-08-03-weighting-design-research/logs/grok-research.log
echo "[done] Grok research seat — $(date)"
