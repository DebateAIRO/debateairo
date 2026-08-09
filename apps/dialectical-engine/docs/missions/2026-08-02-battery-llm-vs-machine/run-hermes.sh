#!/bin/bash
cd "$(dirname "$0")"
echo "=== HERMES SEAT (gpt-5.6-sol) — REQ-BATTERY-PARTITION-R1 ==="
hermes --yolo -z "/goal You are the Hermes research seat. Read the goal packet at $(pwd)/goal-packets/hermes-goal.md and execute it fully. All paths in the packet are relative to $(pwd). Write ONLY the artifact the packet allows." 2>&1 | tee logs/hermes.log
echo "=== HERMES SEAT FINISHED ==="
