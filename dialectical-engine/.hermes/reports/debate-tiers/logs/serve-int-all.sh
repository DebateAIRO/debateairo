#!/bin/bash
# serve-all.sh — ONE idempotent "launch" for V's S01 test point. Checks every stage of the product's own
# stack order and starts only what is missing (each detached + supervised through its own logs/serve-*.sh),
# warms the UI, prints the status, then stays alive tailing the watch log so a desktop-app launch entry can
# own it (the app opens https://localhost:3000 once :3000 answers). Re-running it never duplicates a stage.
set -u
LOGDIR=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/debate-tiers/logs
LANE=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine
up()   { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }
alive(){ kill -0 "$(cat "$LOGDIR/$1.pid" 2>/dev/null)" 2>/dev/null; }
say()  { echo "$(date '+%H:%M:%S') $*"; }
# 1) panel + api.env + API :8790
if up 8790; then say "API :8790 up (serve-stack)"; else say "starting serve-stack (panel + env + API)"; "$LOGDIR/serve-int-stack.sh"; for i in $(seq 1 90); do up 8790 && break; sleep 2; done; up 8790 && say "API :8790 up" || { say "API FAILED — see $LOGDIR/serve-int-stack.log"; exit 1; }; fi
# 1b) RUNNER (executes accepted asks)
if alive serve-int-runner; then say "runner up (pid $(cat "$LOGDIR/serve-int-runner.pid"))"; else say "starting runner"; "$LOGDIR/serve-int-runner.sh"; sleep 8; alive serve-int-runner && say "runner up" || { say "RUNNER FAILED — see $LOGDIR/serve-int-runner.log"; exit 1; }; fi
# 2) UI :3001 (supervised)
if up 3001; then say "UI :3001 up"; else say "starting UI :3001 (supervised)"; nohup "$LOGDIR/serve-int-ui-3001-supervised.sh" >/dev/null 2>&1 & echo $! > "$LOGDIR/serve-int-ui-3001-supervised.pid"; for i in $(seq 1 60); do up 3001 && break; sleep 2; done; up 3001 && say "UI :3001 up" || { say "UI FAILED — see $LOGDIR/serve-int-ui-3001.log"; exit 1; }; fi
# 3) warm (the front door probes /login and /api/v1/session; the dev server compiles on first hit)
curl -s -o /dev/null --max-time 90 http://127.0.0.1:3001/login; curl -s -o /dev/null --max-time 30 http://127.0.0.1:3001/api/v1/session; say "UI warmed"
# 4) TLS front door :3000
if up 3000; then say "front door :3000 up"; else say "starting front door"; "$LOGDIR/serve-int-frontdoor.sh"; for i in $(seq 1 30); do up 3000 && break; sleep 2; done; up 3000 && say "front door :3000 up" || { say "FRONT DOOR FAILED — see $LOGDIR/serve-int-frontdoor.log"; exit 1; }; fi
code=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 20 https://localhost:3000/new)
say "READY: https://localhost:3000/new answers $code — sign in (click 'Use a recovery code' BEFORE pasting), then /new"
touch "$LOGDIR/run-watch.log"; exec tail -n 5 -f "$LOGDIR/run-watch.log"
