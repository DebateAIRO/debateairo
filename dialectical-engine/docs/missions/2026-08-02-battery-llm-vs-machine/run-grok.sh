#!/bin/bash
cd "$(dirname "$0")"
echo "=== GROK SEAT (grok-4.5) — REQ-BATTERY-PARTITION-R1 ==="
grok -p "/goal You are the Grok research seat. Read the goal packet at $(pwd)/goal-packets/grok-goal.md and execute it fully. All paths in the packet are relative to $(pwd). Write ONLY the artifact the packet allows." \
  -m grok-4.5 --permission-mode bypassPermissions --output-format plain 2>&1 | tee logs/grok.log
echo "=== GROK SEAT FINISHED ==="
