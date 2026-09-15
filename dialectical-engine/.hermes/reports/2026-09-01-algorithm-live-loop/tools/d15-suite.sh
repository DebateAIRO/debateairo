#!/bin/bash
# D15 batch suite on the integration worktree, with set-equality classification vs T0's authority.
# Usage: d15-suite.sh <batch-label>   (bash, not zsh — word-splitting traps)
set -u
M=/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop
W=/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/integration/dialectical-engine
L=${1:?batch label}; OUT="$M/logs/integration-suite-$L.log"; CL="$M/logs/integration-suite-$L.CLASSIFICATION.txt"
cd "$W" || exit 2
tip=$(git rev-parse --short HEAD); dirty=$(git status --porcelain | wc -l | tr -d ' ')
{ echo "D15 SUITE $L · tip $tip · dirty $dirty · start $(date '+%F %T %Z')"; for i in 1 2 3; do echo "load sample $i: $(uptime | awk -F'load averages?:' '{print $2}')"; sleep 20; done; } > "$OUT"
[ "$dirty" = "0" ] || { echo "DIRTY TREE — refusing" | tee -a "$OUT"; exit 3; }
pnpm test >> "$OUT" 2>&1; rc=$?
echo "EXIT STATUS: $rc · end $(date '+%F %T %Z')" >> "$OUT"
summary=$(grep -aE "^ *Tests +[0-9]+" "$OUT" | tail -1 | sed 's/^ *//'); echo "SUMMARY: ${summary:-none}" >> "$OUT"
python3 "$M/tools/d15-classify.py" "$M" "$OUT" "$CL"   # D60: standalone, full-name key
echo "classification: $CL"; exit $rc
