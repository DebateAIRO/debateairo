#!/bin/zsh
# ARCH-REV-PES-S03-p1 · the three PLAN §3 suite commands, sequential, each its own log.
set -u
DIR=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-REV-PES-S03-p1
export PATH="/opt/homebrew/bin:$PATH"
echo "PID $$"
LOG="$DIR/c1-base.log" zsh "$DIR/c1-base.sh"
echo "c1-base exit=$?"
LOG="$DIR/c1-after-pair.log" zsh "$DIR/c1-after-pair.sh"
echo "c1-after exit=$?"
LOG="$DIR/c2-after-pair.log" zsh "$DIR/c2-after-pair.sh"
echo "c2-after exit=$?"
echo DONE
