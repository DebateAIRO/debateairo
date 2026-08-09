#!/bin/zsh
cd /Users/vladmihaimiron/Documents/DebateAIRO/apps/dialectical-engine
mkdir -p docs/missions/2026-08-03-v3-greenfield-requirements/logs
echo "[launch] Codex map-review lens — $(date)"
/Applications/ChatGPT.app/Contents/Resources/codex exec \
  -c model='"gpt-5.6-sol"' -c sandbox_mode='"workspace-write"' \
  "Read the goal packet at docs/missions/2026-08-03-v3-greenfield-requirements/goal-packets/codex-packreview.md and execute it exactly. Work to the handoff marker; write only your single allowed artifact." \
  2>&1 | tee docs/missions/2026-08-03-v3-greenfield-requirements/logs/codex-packreview.log
echo "[done] Codex map-review lens — $(date)"
