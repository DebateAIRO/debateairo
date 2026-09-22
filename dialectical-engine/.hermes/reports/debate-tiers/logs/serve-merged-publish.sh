#!/bin/bash
# serve-merged-publish.sh — V's ONE command: publish the register version that carries S03's planTierRosters row (from config/models.yaml)
# to the dev database on 127.0.0.1:55432, through the product's own append-only publication (`pnpm dev:auth:publish-provider-set`,
# apps/runner/src/dev-provider-set-publish-cli.ts: base = the receipt's current version, new version = base + 1; history is never rewritten),
# from the MERGED tree .worktrees/all against its custody copy. Then restart stage 1 so the API reads the new REGISTER_VERSION.
# Why V runs it, not the orchestrator: it writes V's live dev database; the harness refused the orchestrator that write (2026-09-16 12:5x).
# Why it is needed: `pnpm dev:auth:up` (SPEC-v3 §2's restart command) fails on this database — its seed stage replays the sealed
# historical version 4 with S03's row set and PostgreSQL raises REGISTER_PUBLICATION_SEAL_INVALID: historical replay drift
# (logs/serve-merged-diag-seed-register.log). Until the row is published, GET /v1/plan-tiers finds no row and /new lists no ids.
set -u
LANE=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine
LOGDIR=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/debate-tiers/logs
cd "$LANE" || exit 1
before=$(python3 -c "import json;print(json.load(open('$LANE/.local/dev-auth/deployment-register-receipt.v1.json'))['registerVersion'])")
# the local migrator URL is the dev-only constant the data plane itself uses (apps/runner/src/dev-auth-data-plane.ts:17); it is never echoed
MIGRATION_DATABASE_URL="$(perl -ne 'print $1 if /LOCAL_MIGRATOR_DATABASE_URL =\s*"([^"]+)"/' apps/runner/src/dev-auth-data-plane.ts)" \
  pnpm dev:auth:publish-provider-set > "$LOGDIR/serve-merged-publish-provider-set.log" 2>&1; rc=$?
after=$(python3 -c "import json;print(json.load(open('$LANE/.local/dev-auth/deployment-register-receipt.v1.json'))['registerVersion'])")
echo "publish rc=$rc register version $before -> $after (log: $LOGDIR/serve-merged-publish-provider-set.log)"
[ "$rc" -eq 0 ] || exit "$rc"
echo "restarting stage 1 (panel + api.env + API) so the API reads REGISTER_VERSION=$after"
p=$(cat "$LOGDIR/serve-merged-stack.pid" 2>/dev/null); [ -n "$p" ] && kill "$p" 2>/dev/null; sleep 4
# the assembler refuses to rewrite an api.env whose transition it does not recognise (DEV_API_ENVIRONMENT_DRIFT, dev-api-environment.ts:273);
# a MISSING file is written fresh — so the COPY's api.env is moved aside (never V's own custody), as the 2026-09-10 stale file precedent did
[ -f "$LANE/.local/dev-auth/api.env" ] && mv "$LANE/.local/dev-auth/api.env" "$LANE/.local/dev-auth/api.env.stale-$(date '+%F-%H%M%S')"
"$LOGDIR/serve-merged.sh"
