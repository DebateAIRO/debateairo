#!/bin/zsh
cd /Users/vladmihaimiron/Documents/DebateAIRO/apps/dialectical-engine
mkdir -p docs/missions/2026-08-03-v3-greenfield-requirements/logs
echo "[launch] Hermes map-review lens — $(date)"
"$HOME/.local/bin/hermes" --yolo -z \
  "/goal Read the goal packet at docs/missions/2026-08-03-v3-greenfield-requirements/goal-packets/hermes-deltareview.md and execute it exactly. Work to the handoff marker; write only your single allowed artifact." \
  2>&1 | tee docs/missions/2026-08-03-v3-greenfield-requirements/logs/hermes-deltareview.log
echo "[done] Hermes map-review lens — $(date)"
