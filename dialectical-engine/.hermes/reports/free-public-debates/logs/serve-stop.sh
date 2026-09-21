#!/bin/bash
# serve-stop.sh — stops the stack serve-up.sh started, by its recorded PID's process group only (never pkill -f).
P=$(cat /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.hermes/reports/free-public-debates/logs/serve-up.pid 2>/dev/null); [ -n "$P" ] && kill -0 "$P" 2>/dev/null && { kill -TERM -- -"$P" 2>/dev/null || kill -TERM "$P"; echo "stopped group $P"; } || echo "not running"
