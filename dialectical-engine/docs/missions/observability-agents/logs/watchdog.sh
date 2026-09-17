#!/bin/zsh
# Stagnation watchdog for mission observability-agents (20-minute law; disk + board are ground truth).
# Exits 3 on 20 min of no change (orchestrator then decides HUNG vs PARKED), 0 at the hard cap.
set -u
REPO="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
MISSION="$REPO/docs/missions/observability-agents"
REPORTS="$REPO/.hermes/reports/observability-agents"
DB="$HOME/.hermes/kanban/boards/observability-agents/kanban.db"
STATUS="$MISSION/logs/watchdog.status"
STAGNATION_S=1200
HARD_CAP_S=${1:-14400}
start=$(date +%s); last_change=$start; last_sig=""
while true; do
  now=$(date +%s)
  newest=$(find "$MISSION" "$REPORTS" -type f -not -name 'watchdog.status' -newer "$STATUS" 2>/dev/null | wc -l | tr -d ' ')
  files=$(find "$MISSION" "$REPORTS" -type f -not -name 'watchdog.status' 2>/dev/null | wc -l | tr -d ' ')
  bytes=$(find "$MISSION" "$REPORTS" -type f -not -name 'watchdog.status' -exec stat -f %z {} + 2>/dev/null | awk '{s+=$1} END {print s+0}')
  comments=$(sqlite3 "file:$DB?immutable=1" "SELECT count(*) FROM task_comments;" 2>/dev/null || echo "na")
  sig="$files:$bytes:$comments"
  if [[ "$sig" != "$last_sig" ]]; then last_change=$now; last_sig="$sig"; fi
  idle=$(( now - last_change ))
  printf '%s | files=%s bytes=%s board_comments=%s | idle=%ss | elapsed=%ss\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$files" "$bytes" "$comments" "$idle" "$(( now - start ))" > "$STATUS"
  if (( idle >= STAGNATION_S )); then echo "STAGNATION: no disk/board change for ${idle}s (sig $sig) at $(date '+%H:%M:%S')"; exit 3; fi
  if (( now - start >= HARD_CAP_S )); then echo "HARD CAP reached"; exit 0; fi
  sleep 60
done
