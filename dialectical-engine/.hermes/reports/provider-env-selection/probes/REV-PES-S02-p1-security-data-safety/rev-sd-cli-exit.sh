#!/bin/zsh
# REV-PES-S02-p1-security-data-safety — run `pnpm pes:accept-hosted` as V types it (FORCE_COLOR/NO_COLOR unset),
# with the module-load recorder preloaded; print exit, the acceptance's own last line, and the F10 facts.
# Usage: zsh rev-sd-cli-exit.sh <worktree dialectical-engine dir> <label>
set -u
export PATH="/opt/homebrew/bin:$PATH"
WT="${1:?worktree}"; L="${2:?label}"
P="$(cd "$(dirname "$0")" && pwd)"
cd "$WT" || exit 2
ACC="$P/scratch/accept-$L.log"; LL="$P/scratch/loads-$L.log"; : > "$LL"
lsof -nP -iTCP:4460-4499 -sTCP:LISTEN >/dev/null; echo "ports 4460-4499 before: lsof rc=$?"
env -u FORCE_COLOR -u NO_COLOR NODE_OPTIONS="--import=$P/rev-sd-loadlog.mjs" REV_LOAD_LOG="$LL" pnpm pes:accept-hosted > "$ACC" 2>&1; echo "exit=$?"
echo "--- log ($ACC)"; cat "$ACC"
own=$(grep -v '^\[ELIFECYCLE\]' "$ACC" | tail -1); echo "--- acceptance's own last line: $own"
echo "--- step7 grep token: $(grep -c 'pes-s02-fake-vendor-token' "$ACC")"
S=$(sed -n 's/^PES-S02 SCRATCH-DIR //p' "$ACC"); echo "--- step7 grep custody: $(grep -cF "$S/custody.d" "$ACC")"
echo "--- step7b grep Bearer: $(grep -cE 'Bearer [^ ]' "$ACC")"
[ -n "$S" ] && { test -e "$S"; echo "--- step9 test -e scratch: $?"; }
echo "--- F10 modules: $(grep -ciE 'embedded-postgres|async-exit-hook|standing-db|/pg/|node_modules/pg' "$LL") hits"; grep -iE 'embedded-postgres|async-exit-hook|standing-db|node_modules/\.pnpm/pg@|/node_modules/pg/' "$LL" | sort -u | head
echo "--- F10 exit record:"; grep '^EXIT' "$LL"
echo "--- distinct modules loaded: $(grep '^LOAD' "$LL" | sort -u | wc -l | tr -d ' ')"
lsof -nP -iTCP:4460-4499 -sTCP:LISTEN; echo "ports 4460-4499 after: lsof rc=$?"
echo "dirty $(git status --porcelain | wc -l | tr -d ' ')"
