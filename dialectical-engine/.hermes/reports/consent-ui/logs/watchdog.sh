#!/bin/zsh
# Stagnation watchdog for mission consent-ui (20-minute law; disk + board are ground truth).
# Exits 3 on 20 min of no change (orchestrator decides HUNG vs PARKED — check live agents + open V rows first), 0 at the hard cap.
set -u
REPO="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
MISSION="$REPO/docs/missions/consent-ui"
REPORTS="$REPO/.hermes/reports/consent-ui"
LANES="$REPO/.worktrees/consent-s01/dialectical-engine/apps $REPO/.worktrees/consent-s02/dialectical-engine/apps"
DB="$HOME/.hermes/kanban/boards/consent-ui/kanban.db"
STATUS="$REPORTS/logs/watchdog.status"
STAGNATION_S=1200
HARD_CAP_S=${1:-21600}
start=$(date +%s); last_change=$start; last_sig=""
while true; do
  now=$(date +%s)
  files=$(find "$MISSION" "$REPORTS" ${=LANES} -type f -not -name 'watchdog.status' -not -path '*/node_modules/*' 2>/dev/null | wc -l | tr -d ' ')
  bytes=$(find "$MISSION" "$REPORTS" ${=LANES} -type f -not -name 'watchdog.status' -not -path '*/node_modules/*' -exec stat -f %z {} + 2>/dev/null | awk '{s+=$1} END {print s+0}')
  comments=$(sqlite3 "file:$DB?immutable=1" "SELECT count(*) FROM task_comments;" 2>/dev/null || echo "na")
  sig="$files:$bytes:$comments"
  if [[ "$sig" != "$last_sig" ]]; then last_change=$now; last_sig="$sig"; fi
  idle=$(( now - last_change ))
  printf '%s | files=%s bytes=%s board_comments=%s | idle=%ss | elapsed=%ss\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$files" "$bytes" "$comments" "$idle" "$(( now - start ))" > "$STATUS"
  if (( idle >= STAGNATION_S )); then echo "STAGNATION: no disk/board change for ${idle}s (sig $sig) at $(date '+%H:%M:%S')"; exit 3; fi
  if (( now - start >= HARD_CAP_S )); then echo "HARD CAP reached"; exit 0; fi
  sleep 60
done
