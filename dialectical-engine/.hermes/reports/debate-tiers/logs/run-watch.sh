#!/bin/bash
# run-watch.sh — read-only watch of V's run abbbf50a-7e60-4b0c-890c-b1a2e5e53df6 + the serve stack, one line a minute for 45 min.
for i in $(seq 1 45); do
  st=$(docker exec debateai-v3-postgres-1 psql -U debateai -d debateai -At -F'/' -c "SELECT state, coalesce(terminal_reason,'-') FROM core.work_item WHERE run_id='abbbf50a-7e60-4b0c-890c-b1a2e5e53df6';" 2>/dev/null | head -1)
  n=$(docker exec debateai-v3-postgres-1 psql -U debateai -d debateai -At -c "SELECT count(*) FROM core.node WHERE run_id='abbbf50a-7e60-4b0c-890c-b1a2e5e53df6';" 2>/dev/null)
  ph=$(docker exec debateai-v3-postgres-1 psql -U debateai -d debateai -At -c "SELECT value_json FROM core.run_progress_event WHERE run_id='abbbf50a-7e60-4b0c-890c-b1a2e5e53df6' AND kind='PHASE' ORDER BY at_seq DESC LIMIT 1;" 2>/dev/null)
  fd=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 8 https://localhost:3000/new)
  ui=$(kill -0 $(cat /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/debate-tiers/logs/serve-ui-3001.pid 2>/dev/null) 2>/dev/null && echo up || echo DOWN); rn=$(kill -0 $(cat /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/debate-tiers/logs/serve-runner.pid 2>/dev/null) 2>/dev/null && echo up || echo DOWN)
  echo "$(date '+%H:%M:%S') work_item=$st nodes=$n phase=$ph frontdoor=$fd ui=$ui runner=$rn"
  sleep 60
done
