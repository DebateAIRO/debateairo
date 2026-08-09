#!/bin/bash
cd "$(dirname "$0")"
echo "=== HERMES REPORT SEAT (gpt-5.6-sol) — REQ-BATTERY-PARTITION-R2 (human report) ==="
hermes --yolo -z "/goal You are the Hermes report seat. Read the goal packet at $(pwd)/goal-packets/hermes-report-goal.md and execute it fully. All paths in the packet are relative to $(pwd). Write ONLY the artifact the packet allows." 2>&1 | tee logs/hermes-report.log
echo "=== HERMES REPORT SEAT FINISHED ==="
