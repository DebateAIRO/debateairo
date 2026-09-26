#!/bin/zsh
# ARCH-FIX-PES-S01-p3 probe q3 — the whole tests/architecture directory on the mirror WITH S01-27 applied. Supporting
# evidence only: the mirror has no .git of its own, so a suite that shells out to git reads the MAIN repository instead.
export PATH="/opt/homebrew/bin:$PATH"
L=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s01/dialectical-engine
M=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-FIX-PES-S01-p3/mirror/dialectical-engine
rsync -a --delete --exclude node_modules --exclude .hermes --exclude .git $L/ $M/ && ln -sfn $L/node_modules $M/node_modules
python3 /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-FIX-PES-S01-p3/proposed/apply_s01_27.py $M test && python3 /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-FIX-PES-S01-p3/proposed/apply_s01_27.py $M manifest
(cd $M && LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-FIX-PES-S01-p3/q3-mirror-architecture.log zsh /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh tests/architecture:723:6 | tail -2)
grep -E '^ FAIL  tests/architecture' /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-FIX-PES-S01-p3/q3-mirror-architecture.log | sed 's/^ FAIL  //' | sort -u
