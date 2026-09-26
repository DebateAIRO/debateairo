#!/bin/zsh
# stagnation watchdog (orchestrator §4): exits (→ harness notification) after 20 min with no change in seat logs, lanes or probes.
R=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine; RP=$R/.hermes/reports/provider-env-selection
sig(){ { ls -l $RP/logs/*.log $RP/agent-reports 2>/dev/null; for s in 1 2 3; do git -C $R/.worktrees/pes-s0$s/dialectical-engine status --porcelain 2>/dev/null; git -C $R/.worktrees/pes-s0$s/dialectical-engine rev-parse HEAD; done; find $RP/probes $R/docs/missions/provider-env-selection -newer $RP/LEDGER.md -type f 2>/dev/null | wc -l; ls -l ~/.claude/projects/*/*/subagents 2>/dev/null | tail -3; } | shasum | cut -c1-12; }
last=$(sig); quiet=0
while true; do sleep 60; now=$(sig); if [[ $now == $last ]]; then quiet=$((quiet+1)); else quiet=0; last=$now; fi
  echo "$(date '+%T') quiet=${quiet}m" > $RP/logs/watchdog.status
  (( quiet >= 20 )) && { echo "STAGNATION 20m at $(date '+%F %T')"; exit 0; }; done
