#!/bin/zsh
# ARCH-PES-S01 · runs the four cluster commands at base, one after another (one lane, whole-tree scanners), then
# re-checks the lane is still clean. Each cluster writes its own log; this wrapper's stdout is the frame.
D=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-PES-S01
for c in C1 C2 C3 C4; do echo "===== $c $(date '+%F %T')"; zsh $D/base-$c.sh; echo "rc=$?"; done
echo "===== lane dirty count after: $(git -C /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s01/dialectical-engine status --porcelain | wc -l | tr -d ' ') · HEAD $(git -C /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s01/dialectical-engine rev-parse --short HEAD) · $(date '+%F %T')"
