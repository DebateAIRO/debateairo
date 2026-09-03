#!/bin/zsh
# Stagnation watchdog — 20-minute law. Ground truth is DISK and BOARD state, never a log string.
REPO=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine
LOGDIR=$REPO/.hermes/planning/public-debate-access/logs
STATUS=$REPO/.hermes/planning/public-debate-access/WATCHDOG.md
DB=$HOME/.hermes/kanban/boards/public-debate-access/kanban.db
prev=""; same=0; tick=0
while [ $tick -lt 288 ]; do
  # fingerprint: every seat log's size, every mission doc's size, board comment count, live agent pids
  logs=$(cd "$LOGDIR" 2>/dev/null && for f in *; do [ -f "$f" ] && printf '%s:%s ' "$f" "$(wc -c < "$f")"; done)
  docs=$(cd "$REPO/docs/missions/public-debate-access" 2>/dev/null && find . -type f -exec wc -c {} \; 2>/dev/null | sort | tr -s ' ')
  comments=$(sqlite3 "$DB" "select (select count(*) from task_comments)||'/'||(select count(*) from task_events);" 2>/dev/null || echo NA)
  # Scope to THIS mission's seats only. pgrep -x grok/codex also matches an unrelated
  # user grok session and ChatGPT.app's bundled codex, which never exit — that made
  # agents_live permanently nonzero and turned the PARKED branch into dead code.
  pids=$(ps -Awwo pid,command | grep "public-debate-access" | grep -E "[g]rok -p|[g]rok --resume|[c]laude -p|[c]laude --continue|[c]laude --resume|[c]odex exec" | grep -v watchdog | awk '{print $1}' | tr '\n' ',')
  fp="$logs|$docs|$comments|$pids"
  if [ "$fp" = "$prev" ]; then same=$((same+1)); else same=0; fi
  prev="$fp"
  # A watchdog that cannot tell HUNG from PARKED-AT-A-HUMAN-GATE cries wolf, and an alarm
  # nobody trusts is worse than no alarm. Dead air with zero live agents AND open V rows is
  # the DESIGNED state, not a stall: the mission is waiting on V by law, not stuck.
  vopen=$(grep -c '^\*\*V ruling:\*\* _(pending)_' "$REPO/docs/missions/public-debate-access/V-DECISIONS-PACKET.md" 2>/dev/null || echo 0)
  agents_live=$(printf '%s' "$pids" | tr -d ',' | wc -c | tr -d ' ')
  {
    echo "# WATCHDOG — public-debate-access"
    echo "last check: $(date -u +%Y-%m-%dT%H:%M:%SZ)  ·  tick $tick  ·  unchanged intervals: $same (alarm at 4 = 20 min)"
    echo "board comments: $comments"
    echo "live agent pids: ${pids:-none}"
    echo "logs: ${logs:-none}"
    echo "open V rows: $vopen  ·  agent bytes live: $agents_live"
    if [ $same -ge 4 ]; then
      echo
      if [ "$vopen" -gt 0 ] && [ "$agents_live" -eq 0 ]; then
        echo "## PARKED AT V GATE — not a stall."
        echo "Zero live agents and $vopen open row(s) on V-DECISIONS-PACKET.md. The mission is"
        echo "waiting on V by design. No session is unfinished; nothing to preserve or kill."
        echo "This is the correct resting state. Watch continues; no action required."
      else
        echo "## STAGNATION ALARM — 20 minutes with zero change across logs, mission docs, board and pids,"
        echo "with agents ALIVE or no open V row. This is real dead air."
        echo "Law: freeze new dispatch, preserve and park every unfinished session, halt the loop pending V."
      fi
    fi
  } > "$STATUS"
  if [ $same -ge 4 ] && { [ "$vopen" -eq 0 ] || [ "$agents_live" -gt 0 ]; }; then exit 3; fi
  perl -e 'select(undef,undef,undef,300)'
  tick=$((tick+1))
done
