#!/bin/zsh
# 20-minute stagnation watchdog (heartbeat-orchestrator §4): signature over the seats' write paths,
# re-read from watchdog.paths every minute; STAGNANT after 20 min without change. Read-only.
L=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/debate-tiers/logs
last_sig=""; last_change=$(date +%s)
for i in $(seq 1 240); do
  sig=$(while read -r p; do [ -e "$p" ] && find "$p" -type f -not -path '*/node_modules/*' -newermt '-25 hours' -exec stat -f '%m %z %N' {} + 2>/dev/null; done < $L/watchdog.paths | sort | md5)
  now=$(date +%s)
  if [ "$sig" != "$last_sig" ]; then last_sig=$sig; last_change=$now; fi
  idle=$(( (now - last_change) / 60 ))
  state=ACTIVE; [ $idle -ge 20 ] && state=STAGNANT
  echo "$(date '+%Y-%m-%d %H:%M:%S') $state idle_min=$idle sig=${sig[1,8]}" > $L/watchdog.status
  [ $state = STAGNANT ] && echo "$(date '+%H:%M:%S') STAGNANT idle_min=$idle" >> $L/watchdog.out
  sleep 60
done
