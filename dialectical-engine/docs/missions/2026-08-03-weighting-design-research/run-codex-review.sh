#!/bin/zsh
cd /Users/vladmihaimiron/Documents/DebateAIRO/apps/dialectical-engine
mkdir -p docs/missions/2026-08-03-weighting-design-research/logs
echo "[launch] Codex gpt-5.6-sol review seat (spec-precision lens) — $(date)"
/Applications/ChatGPT.app/Contents/Resources/codex exec \
  -c model='"gpt-5.6-sol"' -c sandbox_mode='"workspace-write"' \
  -c tools.web_search=true \
  "Read the goal packet at docs/missions/2026-08-03-weighting-design-research/goal-packets/codex-review.md and execute it exactly. Work to the handoff marker; write only your single allowed artifact." \
  2>&1 | tee docs/missions/2026-08-03-weighting-design-research/logs/codex-review.log
echo "[done] Codex review seat — $(date)"
