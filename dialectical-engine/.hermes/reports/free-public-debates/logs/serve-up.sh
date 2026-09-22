#!/bin/bash
# serve-up.sh — V's "launch the stack on port 3000": the product's OWN full stack command (pnpm dev:auth:up, DEFAULT profile:
# front door :3000, UI :3001, API :8790, relays :8791-8796, postgres :55432 in compose project debateai-v3) from the one-commit
# tree .worktrees/all @ integration/all. Detached in its own session under caffeinate; stop with serve-stop.sh (SIGTERM — the CLI
# stops every stage it owns). Never touches the support-preview stack (:3100/:3101/:8890-8896/:55433).
set -u
LANE=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.hermes/reports/free-public-debates/logs/serve-up.log; PIDF=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.hermes/reports/free-public-debates/logs/serve-up.pid
[ -d "$LANE/.local/dev-auth" ] || { echo "custody missing"; exit 1; }
unset DEBATEAI_DEV_AUTH_STACK_PROFILE
export PNPM_EXECUTABLE=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.hermes/reports/free-public-debates/logs/pnpm-quiet.sh
cd "$LANE" || exit 1
python3 - <<PY
import subprocess,os
log=open("$LOG","ab")
p=subprocess.Popen(["caffeinate","-s","-i","pnpm","dev:auth:up"],cwd="$LANE",stdin=subprocess.DEVNULL,stdout=log,stderr=log,start_new_session=True)
open("$PIDF","w").write(str(p.pid))
print("dev:auth:up launched pid",p.pid)
PY
