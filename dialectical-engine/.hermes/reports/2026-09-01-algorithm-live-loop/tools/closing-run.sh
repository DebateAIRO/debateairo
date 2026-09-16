#!/bin/bash
# closing-run.sh — the acceptance ceremony on the REAL relays, run ONCE, everything captured (D60) before anything else touches it.
# Usage:  ACCEPTANCE_SERVICE_CREDENTIAL='<43 chars, minted by V>' bash closing-run.sh [--serve]
# The credential is READ FROM THE ENVIRONMENT of whoever runs this; this script never prints, stores or logs it (D18).
# HOST-INDEPENDENT (2026-09-16, Task 18): the mission dir comes from this script's own location, the
# engine from the mission dir, and the repo root from git. Export R=<checkout> to run against another
# checkout; note that inside a linked worktree `--show-toplevel` is that WORKTREE's root, which is the
# tree the ceremony should measure.
set -u
M="$(cd "$(dirname "$0")/.." && pwd)"; DE="$(cd "$M/../../.." && pwd)"
R="${R:-$(git -C "$DE" rev-parse --show-toplevel)}"; OUTDIR=$M/logs/closing-run
: "${ACCEPTANCE_SERVICE_CREDENTIAL:?export ACCEPTANCE_SERVICE_CREDENTIAL in this shell first (43 chars, [A-Za-z0-9_-]); this script never writes it}"
printf '%s' "$ACCEPTANCE_SERVICE_CREDENTIAL" | grep -qE '^[A-Za-z0-9_-]{43}$' || { echo "the credential is not 43 chars of [A-Za-z0-9_-]"; exit 2; }
# Maker binaries: DISCOVERED on PATH, never a hard-coded home directory. An ACCEPTANCE_*_BINARY the
# operator already exported wins. A lookup that finds nothing leaves the key blank, and a
# present-but-blank key is a loud typed refusal in the relays by design (D10) — never a silent default.
CLAUDE_BIN="${ACCEPTANCE_CLAUDE_BINARY:-$(command -v claude || true)}"
CODEX_BIN="${ACCEPTANCE_CODEX_BINARY:-$(command -v codex || true)}"
GROK_BIN="${ACCEPTANCE_GROK_BINARY:-$(command -v grok || true)}"
mkdir -p "$OUTDIR"; STAMP=$(date '+%Y%m%d-%H%M%S'); LOG="$OUTDIR/ceremony-$STAMP.log"
COMMIT=$(git -C "$R" rev-parse HEAD); TREE=$(git -C "$R" rev-parse HEAD^{tree}); DIRTY=$(git -C "$R" status --porcelain | grep -v '^??' | wc -l | tr -d ' ')
[ "$DIRTY" = "0" ] || { echo "dev has tracked changes — refusing to run the ceremony on a dirty tree"; exit 3; }
{
  echo "commit=$COMMIT tree=$TREE  gate=closing-run  $(date '+%F %T %Z')"
  echo "node $(node --version) · pnpm $(pnpm --version) · claude $(claude --version 2>/dev/null | head -1) · codex $(codex --version 2>/dev/null | head -1) · grok $(grok --version 2>/dev/null | head -1)"
  echo "binaries: ACCEPTANCE_CLAUDE_BINARY=$CLAUDE_BIN ACCEPTANCE_CODEX_BINARY=$CODEX_BIN ACCEPTANCE_GROK_BINARY=$GROK_BIN"
  echo "ports: DB 55432 · API 58080 · SHIM 58090 · GROK RELAY 58091 · stranger sample rate 0"
  echo "credential: present in the environment (length $(printf '%s' "$ACCEPTANCE_SERVICE_CREDENTIAL" | wc -c | tr -d ' ')); never logged"
  echo "\$ ./node_modules/.bin/tsx acceptance/run-acceptance.ts --service-credential <env> $*"
  echo "<<<OUTPUT"
} > "$LOG"
cd "$DE" || exit 4
ACCEPTANCE_DB_PORT=55432 ACCEPTANCE_API_HOST=127.0.0.1 ACCEPTANCE_API_PORT=58080 ACCEPTANCE_SHIM_PORT=58090 ACCEPTANCE_GROK_RELAY_PORT=58091 \
ACCEPTANCE_STRANGER_SAMPLE_RATE=0 ACCEPTANCE_BATTERY_VERSION=acceptance-v1 ACCEPTANCE_SETTLEMENT_WATCH_HANDLE=acceptance:standing-watch \
ACCEPTANCE_CLAUDE_BINARY="$CLAUDE_BIN" ACCEPTANCE_CODEX_BINARY="$CODEX_BIN" ACCEPTANCE_GROK_BINARY="$GROK_BIN" \
./node_modules/.bin/tsx acceptance/run-acceptance.ts --service-credential "$ACCEPTANCE_SERVICE_CREDENTIAL" "$@" >> "$LOG" 2>&1
rc=$?
{ echo "OUTPUT>>>"; echo "EXIT = $rc"; echo "finished $(date '+%F %T %Z')"; echo "porcelain AFTER: [$(git -C "$R" status --porcelain | grep -v '^??' | tr '\n' ';')]"; } >> "$LOG"
# capture any artifacts the ceremony wrote under the engine tree (untracked files) — copy, never move
git -C "$R" status --porcelain | grep '^??' | awk '{print $2}' | grep -v '\.hermes/' | while read -r p; do mkdir -p "$OUTDIR/artifacts-$STAMP/$(dirname "$p")"; cp -R "$R/$p" "$OUTDIR/artifacts-$STAMP/$p" 2>/dev/null; done
echo "closing run finished: exit=$rc · log $LOG"
exit $rc
