#!/bin/zsh
# Stagnation watchdog: exits (and so wakes the orchestrator) when nothing under the watched paths
# changed for 20 minutes. Paths are re-read every minute; status goes to watchdog.status.
L="${0:A:h}"; LIMIT=1200
while true; do
  newest=0
  while IFS= read -r p; do
    [[ -e "$p" ]] || continue
    t=$(find "$p" -type f -mmin -30 -not -name 'watchdog.*' -exec stat -f %m {} + 2>/dev/null | sort -n | tail -1)
    [[ -n "$t" && "$t" -gt "$newest" ]] && newest=$t
  done < "$L/watchdog.paths"
  now=$(date +%s); idle=$(( newest == 0 ? 1800 : now - newest ))
  echo "$(date '+%Y-%m-%d %H:%M:%S') idle=${idle}s" > "$L/watchdog.status"
  if (( idle >= LIMIT )); then echo "STAGNATION idle=${idle}s at $(date '+%H:%M:%S')" | tee -a "$L/watchdog.status"; exit 3; fi
  sleep 60
done
