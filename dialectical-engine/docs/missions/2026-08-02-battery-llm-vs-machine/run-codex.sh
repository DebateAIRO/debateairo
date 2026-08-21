#!/bin/bash
cd "$(dirname "$0")"
echo "=== CODEX SEAT (gpt-5.6-sol) — REQ-BATTERY-PARTITION-R1 ==="
/Applications/ChatGPT.app/Contents/Resources/codex exec \
  -c model='"gpt-5.6-sol"' \
  -c sandbox_mode='"workspace-write"' \
  "/goal You are the Codex research seat. Read the goal packet at $(pwd)/goal-packets/codex-goal.md and execute it fully. All paths in the packet are relative to $(pwd). Write ONLY the artifact the packet allows." 2>&1 | tee logs/codex.log
echo "=== CODEX SEAT FINISHED ==="
