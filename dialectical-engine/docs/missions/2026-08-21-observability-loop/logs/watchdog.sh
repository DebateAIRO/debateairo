#!/bin/zsh
# Stagnation liveness watchdog (v3.2.0 law 3) — REQ loop, 2026-08-21-observability-loop.
# Fingerprints seat logs + research artifacts every 5 min; 4 consecutive unchanged
# checks (20 min) => liveness report + exit 2 (freeze signal to orchestrator).
# Exit 0 = both CLI seats exited cleanly. Exit 3 = 5h hard cap.
setopt null_glob
set -u
MDIR="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/2026-08-21-observability-loop"
LOGS="$MDIR/logs"
WLOG="$LOGS/watchdog.log"
start=$(date +%s)
last_fp=""
consecutive=0
while true; do
  sleep 300
  now=$(date +%s); elapsed=$(( now - start ))
  g_done=$(grep -c "REQ-OBS Grok seat exited" "$LOGS/grok.log" 2>/dev/null); g_done=${g_done:-0}
  c_done=$(grep -c "REQ-OBS Codex seat exited" "$LOGS/codex.log" 2>/dev/null); c_done=${c_done:-0}
  if [ "$g_done" -ge 1 ] && [ "$c_done" -ge 1 ]; then
    echo "$(date -u +%FT%TZ) BOTH_CLI_SEATS_EXITED elapsed=${elapsed}s" >> "$WLOG"; exit 0
  fi
  fp=$(stat -f "%N %z %m" "$LOGS"/grok.log "$LOGS"/codex.log "$MDIR"/research/*.md 2>/dev/null | shasum | cut -d' ' -f1)
  procs=$(pgrep -f "grok|codex exec" 2>/dev/null | wc -l | tr -d ' ')
  if [ "$fp" = "$last_fp" ]; then consecutive=$((consecutive+1)); else consecutive=0; fi
  last_fp="$fp"
  echo "$(date -u +%FT%TZ) fp=${fp:0:12} stagnant=${consecutive}/4 grok_done=$g_done codex_done=$c_done procs=$procs elapsed=${elapsed}s" >> "$WLOG"
  if [ "$consecutive" -ge 4 ]; then
    {
      echo "LIVENESS REPORT $(date -u +%FT%TZ): 20+ minutes with ZERO change across CLI seat logs and research artifacts."
      echo "grok_done=$g_done codex_done=$c_done procs=$procs elapsed=${elapsed}s"
      echo "--- grok.log tail ---"; tail -5 "$LOGS/grok.log" 2>/dev/null
      echo "--- codex.log tail ---"; tail -5 "$LOGS/codex.log" 2>/dev/null
    } > "$LOGS/watchdog-liveness-report.txt"
    exit 2
  fi
  if [ "$elapsed" -gt 18000 ]; then echo "$(date -u +%FT%TZ) HARD_TIMEOUT_5H" >> "$WLOG"; exit 3; fi
done
