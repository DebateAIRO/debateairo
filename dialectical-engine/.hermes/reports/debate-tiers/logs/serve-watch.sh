#!/bin/bash
# serve-watch.sh — arms the S01 serve for V (2026-09-10). Observes only; touches nothing of V's.
# When the custody env has been regenerated (41 keys), no dev-stack CLI is running and :8790 has
# been free for three checks 10 s apart, it runs serve-api.sh ONCE and records the outcome.
set -u
M=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine
ENVF=$M/.local/dev-auth/api.env
LAUNCH=$M/.hermes/reports/debate-tiers/logs/serve-api.sh
ST=$M/.hermes/reports/debate-tiers/logs/serve-watch.status
LOG=$M/.hermes/reports/debate-tiers/logs/serve-api.log
free=0
for i in $(seq 1 4320); do
  keys=$(wc -l < "$ENVF" 2>/dev/null | tr -d ' ')
  stack=$(pgrep -f dev-auth-stack-cli | wc -l | tr -d ' ')
  if lsof -nP -iTCP:8790 -sTCP:LISTEN >/dev/null 2>&1; then busy=1; else busy=0; fi
  if [ "${keys:-0}" = "41" ] && [ "$stack" = "0" ] && [ "$busy" = "0" ]; then free=$((free+1)); else free=0; fi
  echo "$(date '+%Y-%m-%d %H:%M:%S') keys=${keys:-0} stack_cli=$stack 8790_busy=$busy free_streak=$free" > "$ST"
  if [ "$free" -ge 3 ]; then
    bash "$LAUNCH" >> "$ST" 2>&1
    for j in $(seq 1 60); do
      grep -q 'DEV_AUTH_API_READY\|DEV_API_PROCESS_' "$LOG" 2>/dev/null && break
      sleep 1
    done
    echo "$(date '+%Y-%m-%d %H:%M:%S') LAUNCHED: $(grep -o 'DEV_AUTH_API_READY[^ ]*\|DEV_API_PROCESS_[A-Z_]*' "$LOG" | head -1)" >> "$ST"
    exit 0
  fi
  sleep 10
done
echo "$(date '+%Y-%m-%d %H:%M:%S') TIMEOUT after 12 h, not launched" >> "$ST"
