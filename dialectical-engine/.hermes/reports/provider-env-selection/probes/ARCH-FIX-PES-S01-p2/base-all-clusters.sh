#!/bin/zsh
# ARCH-FIX-PES-S01-p2 · the four cluster commands as they now stand, one after another, then the lane re-checked.
D=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-FIX-PES-S01-p2
for c in C1 C2 C3 C4; do echo "===== $c $(date '+%F %T')"; zsh $D/base-$c.sh; echo "rc=$?"; done
echo "===== lane dirty count after: $(git -C /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s01/dialectical-engine status --porcelain | wc -l | tr -d ' ') · HEAD $(git -C /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s01/dialectical-engine rev-parse --short HEAD) · $(date '+%F %T')"
