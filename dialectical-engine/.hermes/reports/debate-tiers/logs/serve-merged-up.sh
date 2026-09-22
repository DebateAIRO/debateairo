#!/bin/bash
# serve-merged-up.sh — the product's OWN full stack command (`pnpm dev:auth:up` = apps/runner/src/dev-auth-stack-cli.ts: model-config check,
# principals, secrets, register seed + provider-set publication, TLS, data plane, hatchet token, api.env, API, runner, UI, front door,
# then self-supervision) from the MERGED tree .worktrees/all against the custody COPY .worktrees/all/dialectical-engine/.local/dev-auth
# (cp -Rp of MAIN/.local/dev-auth on 2026-09-16; the product refuses a symlinked custody root). This is the restart command SPEC-v3 §2
# names for V's acceptance steps 6-10. Detached; stop by the PID file (SIGTERM — the CLI stops every stage it owns).
set -u
LANE=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine
LOGDIR=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/debate-tiers/logs
LOG=$LOGDIR/serve-merged-up.log; PIDF=$LOGDIR/serve-merged-up.pid
[ -d "$LANE/.local/dev-auth" ] || { echo "custody missing: $LANE/.local/dev-auth"; exit 1; }
cd "$LANE" || exit 1
nohup pnpm dev:auth:up >> "$LOG" 2>&1 &
echo $! > "$PIDF"
echo "dev:auth:up launched pid=$(cat "$PIDF") log=$LOG"
