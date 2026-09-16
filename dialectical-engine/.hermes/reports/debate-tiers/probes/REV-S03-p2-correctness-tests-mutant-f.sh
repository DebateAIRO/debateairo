#!/bin/zsh
# MUT-F: is the route-drift detector ALIVE at the shipped head d35a9634?
set -u
export PATH="/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
# Worktree root: $WORKTREE, else argv[1], else the cwd. NEVER hard-coded.
# Written against head d35a9634, where the obs pair is MISSING from the pinned
# inventories. Re-derive before trusting: at a head where that is fixed, F0/F1 are green.
WT="${WORKTREE:-${1:-$PWD}}"
OUT="${PROBE_OUT:-${TMPDIR:-/tmp}/rev-s03-p2-correctness-mutants}"
BAK="$OUT/backups"
REPL_PY="$(cd "$(dirname "$0")" && pwd)/REV-S03-p2-correctness-tests-repl.py"
cd "$WT" || { echo "NO SUCH WORKTREE: $WT"; exit 9; }
mkdir -p "$BAK"
APIIDX=apps/api/src/index.ts; S7=tests/unit/s7-authorization.test.ts; CONTRACT=packages/contract/src/index.ts
flat() { echo "$1" | tr '/' '_'; }
capture() { cp -p "$WT/$1" "$BAK/$(flat $1)"; }
restore() {
  cp -p "$BAK/$(flat $1)" "$WT/$1"
  local a=$(shasum -a 256 "$BAK/$(flat $1)" | cut -d' ' -f1); local b=$(shasum -a 256 "$WT/$1" | cut -d' ' -f1)
  [ "$a" = "$b" ] && echo "  restored $1 sha256=${a:0:16}… OK" || echo "  !! RESTORE MISMATCH $1"
}
reason() { env LANG=en_US.UTF-8 npx vitest run tests/unit/s7-authorization.test.ts 2>&1 | grep -E 'AssertionError|→ expected' | head -3; }

exec > "$OUT/mutant-f.log" 2>&1
echo "MUT-F at $(git rev-parse --short HEAD) $(date '+%H:%M:%S')"
capture $APIIDX; capture $S7; capture $CONTRACT

echo; echo "--- F0 baseline (shipped head, no mutant): the failure reason"
reason

echo; echo "--- F1 drift ONLY (auth user->operator), obs pair still missing: is the drift REPORTED or MASKED?"
python3 "$REPL_PY" "$WT/$APIIDX" '{ route: "GET /v1/plan-tiers", auth: "user", resource: "plan-tier-rosters", action: "read" }' '{ route: "GET /v1/plan-tiers", auth: "operator", resource: "plan-tier-rosters", action: "read" }'
reason
restore $APIIDX

echo; echo "--- F2 obs pair supplied + the SAME drift: the reason the pin gives"
python3 "$REPL_PY" "$WT/$S7" '  { route: "POST /v1/asks", auth: "user", resource: "run-owner", action: "create" },' '  { route: "GET /v1/obs/client-report/enums", auth: "public", resource: "observability", action: "read-client-enums" },
  { route: "POST /v1/obs/client-report", auth: "public", resource: "observability", action: "write-client-report" },
  { route: "POST /v1/asks", auth: "user", resource: "run-owner", action: "create" },'
python3 "$REPL_PY" "$WT/$CONTRACT" '    "POST /v1/asks",' '    "GET /v1/obs/client-report/enums",
    "POST /v1/obs/client-report",
    "POST /v1/asks",'
python3 "$REPL_PY" "$WT/$APIIDX" '{ route: "GET /v1/plan-tiers", auth: "user", resource: "plan-tier-rosters", action: "read" }' '{ route: "GET /v1/plan-tiers", auth: "operator", resource: "plan-tier-rosters", action: "read" }'
reason
restore $APIIDX; restore $S7; restore $CONTRACT

echo; echo "porcelain excluding my probe: $(git status --porcelain | grep -v 'REV-S03-p2-correctness-tests-probe.test.ts' | wc -l | tr -d ' ')"
echo "DONE-F $(date '+%H:%M:%S')"
