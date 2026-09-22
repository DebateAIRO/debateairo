#!/bin/bash
# serve-merged.sh — ONE idempotent launch of the app stack from the MERGED tree .worktrees/all (integration/all: S03 + FIX-S03-p2-F1 +
# every local branch, 2026-09-16). Checks every stage of the product's own stack order and starts only what is missing (each detached
# and supervised through its own logs/serve-merged-*.sh), warms the UI, prints the status and exits. Re-running it never duplicates a stage.
# Preconditions it checks: Docker's debateai-v3 postgres on 127.0.0.1:55432 (docker start debateai-v3-postgres-1 debateai-v3-hatchet-lite-1).
# Stop everything: logs/serve-merged-stop.sh.
set -u
LOGDIR=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/debate-tiers/logs
LANE=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine
up()   { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }
alive(){ kill -0 "$(cat "$LOGDIR/$1.pid" 2>/dev/null)" 2>/dev/null; }
say()  { echo "$(date '+%H:%M:%S') $*"; }
say "tree: $LANE @ $(git -C "$LANE" rev-parse --short HEAD) ($(git -C "$LANE" rev-parse --abbrev-ref HEAD))"
# 0) the dev database
if up 55432; then say "dev database :55432 up"; else say "dev database :55432 DOWN — run: docker start debateai-v3-postgres-1 debateai-v3-hatchet-lite-1"; exit 2; fi
# 1) panel + api.env + API :8790
if up 8790; then say "API :8790 up (serve-merged-stack pid $(cat "$LOGDIR/serve-merged-stack.pid" 2>/dev/null))"; else say "starting serve-merged-stack (panel + env + API)"; "$LOGDIR/serve-merged-stack.sh"; for i in $(seq 1 90); do up 8790 && break; sleep 2; done; up 8790 && say "API :8790 up" || { say "API did not come up — $LOGDIR/serve-merged-stack.log:"; tail -5 "$LOGDIR/serve-merged-stack.log"; exit 1; }; fi
# 1b) RUNNER (executes accepted asks)
if alive serve-merged-runner-supervised; then say "runner supervisor up (pid $(cat "$LOGDIR/serve-merged-runner-supervised.pid"))"; else say "starting runner"; "$LOGDIR/serve-merged-runner.sh"; sleep 8; alive serve-merged-runner && say "runner up (pid $(cat "$LOGDIR/serve-merged-runner.pid"))" || say "runner not up yet — see $LOGDIR/serve-merged-runner.log"; fi
# 2) UI :3001 (supervised)
if up 3001; then say "UI :3001 up"; else say "starting UI :3001 (supervised)"; nohup "$LOGDIR/serve-merged-ui-3001-supervised.sh" >/dev/null 2>&1 & echo $! > "$LOGDIR/serve-merged-ui-3001-supervised.pid"; for i in $(seq 1 60); do up 3001 && break; sleep 2; done; up 3001 && say "UI :3001 up" || { say "UI did not come up — $LOGDIR/serve-merged-ui-3001.log:"; tail -5 "$LOGDIR/serve-merged-ui-3001.log"; exit 1; }; fi
# 3) warm (the dev server compiles on first hit)
curl -s -o /dev/null --max-time 120 http://127.0.0.1:3001/login; curl -s -o /dev/null --max-time 30 http://127.0.0.1:3001/api/v1/session; say "UI warmed"
# 4) TLS front door :3000
if up 3000; then say "front door :3000 up"; else say "starting front door"; "$LOGDIR/serve-merged-frontdoor.sh"; for i in $(seq 1 30); do up 3000 && break; sleep 2; done; up 3000 && say "front door :3000 up" || { say "front door did not come up — $LOGDIR/serve-merged-frontdoor.log:"; tail -5 "$LOGDIR/serve-merged-frontdoor.log"; exit 1; }; fi
code=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 60 https://localhost:3000/new)
say "READY: https://localhost:3000/new answers $code — sign in (click 'Use a recovery code' BEFORE pasting), then /new"
