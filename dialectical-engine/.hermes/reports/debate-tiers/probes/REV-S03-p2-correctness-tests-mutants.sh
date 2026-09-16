#!/bin/zsh
# REV-S03-p2-correctness-tests — refutation mutants at d35a9634.
# Content-matched (never line-numbered), restored from MY byte copy, sha256-verified.
set -u
export PATH="/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
# Worktree root: $WORKTREE, else argv[1], else the cwd. NEVER hard-coded.
# Written against head d35a9634. A mutant's direction can invert between heads:
# mutants A-D assume the FIXED relay contract (a typed `model` option reaching the argv).
WT="${WORKTREE:-${1:-$PWD}}"
OUT="${PROBE_OUT:-${TMPDIR:-/tmp}/rev-s03-p2-correctness-mutants}"
BAK="$OUT/backups"
REPL_PY="$(cd "$(dirname "$0")" && pwd)/REV-S03-p2-correctness-tests-repl.py"
cd "$WT" || { echo "NO SUCH WORKTREE: $WT"; exit 9; }
mkdir -p "$BAK"

dirty=$(git status --porcelain | grep -v 'REV-S03-p2-correctness-tests-probe.test.ts' | wc -l | tr -d ' ')
if [ "$dirty" != "0" ]; then echo "REFUSING: tree dirty beyond my probe"; git status --porcelain; exit 8; fi

flat() { echo "$1" | tr '/' '_'; }
capture() { cp -p "$WT/$1" "$BAK/$(flat $1)"; }
restore() {
  cp -p "$BAK/$(flat $1)" "$WT/$1"
  local a=$(shasum -a 256 "$BAK/$(flat $1)" | cut -d' ' -f1)
  local b=$(shasum -a 256 "$WT/$1" | cut -d' ' -f1)
  if [ "$a" = "$b" ]; then echo "  restored $1 sha256=${a:0:16}… OK"; else echo "  !! RESTORE MISMATCH $1"; fi
}
vt() { env LANG=en_US.UTF-8 npx vitest run "$@" 2>&1 | grep -E '^ Test Files|^      Tests|^ *× ' ; }

CLAUDE=acceptance/claude-relay.ts
GROK=acceptance/grok-relay.ts
APIIDX=apps/api/src/index.ts
S7=tests/unit/s7-authorization.test.ts
CONTRACT=packages/contract/src/index.ts
PROBE=tests/unit/REV-S03-p2-correctness-tests-probe.test.ts

exec > "$OUT/mutants.log" 2>&1
echo "MUTANTS at $(git rev-parse --short HEAD)  $(date '+%Y-%m-%d %H:%M:%S %Z')"

echo; echo "=== MUT-A  claude-relay.ts argv: request.value -> the literal \"opus\" (pass-1 B1's defect, reintroduced)"
capture $CLAUDE
python3 "$REPL_PY" "$WT/$CLAUDE" '"--model", request.value' '"--model", "opus"'
vt acceptance/claude-relay.test.ts tests/unit/dev-cli-provider-panel.test.ts $PROBE
restore $CLAUDE

echo; echo "=== MUT-B  claude-relay.ts precedence inverted: a present modelAlias beats the full id"
capture $CLAUDE
python3 "$REPL_PY" "$WT/$CLAUDE" 'options.model === undefined
    ? { kind: "alias", value: options.modelAlias ?? CLAUDE_MODEL_ALIAS }
    : { kind: "model", value: options.model };' 'options.modelAlias !== undefined
    ? { kind: "alias", value: options.modelAlias }
    : { kind: "model", value: options.model ?? CLAUDE_MODEL_ALIAS };'
vt acceptance/claude-relay.test.ts $PROBE
restore $CLAUDE

echo; echo "=== MUT-C  grok-relay.ts: drop the --model spread from the argv"
capture $GROK
python3 "$REPL_PY" "$WT/$GROK" '...(model === undefined ? [] : ["--model", model])' '...[]'
vt acceptance/grok-relay.test.ts tests/unit/dev-cli-provider-panel.test.ts $PROBE
restore $GROK

echo; echo '=== MUT-D  claude-relay.ts: delete the typed model member -> does the compiler still guard the panel?'
capture $CLAUDE
python3 "$REPL_PY" "$WT/$CLAUDE" '  /** The full model id asked of the CLI (`--model`); takes precedence over modelAlias. */
  readonly model?: string;
' ''
echo "--- tsc diagnostics in dev-cli-provider-panel.ts:"
env LANG=en_US.UTF-8 npx tsc --noEmit 2>&1 | grep 'dev-cli-provider-panel' | head -5
echo "--- (count: $(env LANG=en_US.UTF-8 npx tsc --noEmit 2>&1 | grep -c 'dev-cli-provider-panel'))"
restore $CLAUDE

echo; echo "=== MUT-E  are the two missing observability rows the ONLY cause of the route-pin RED?"
capture $S7
capture $CONTRACT
capture $APIIDX
python3 "$REPL_PY" "$WT/$S7" '  { route: "POST /v1/asks", auth: "user", resource: "run-owner", action: "create" },' '  { route: "GET /v1/obs/client-report/enums", auth: "public", resource: "observability", action: "read-client-enums" },
  { route: "POST /v1/obs/client-report", auth: "public", resource: "observability", action: "write-client-report" },
  { route: "POST /v1/asks", auth: "user", resource: "run-owner", action: "create" },'
python3 "$REPL_PY" "$WT/$CONTRACT" '    "POST /v1/asks",' '    "GET /v1/obs/client-report/enums",
    "POST /v1/obs/client-report",
    "POST /v1/asks",'
echo "--- route pins with the pair supplied:"
vt tests/unit/s7-authorization.test.ts tests/unit/contract.test.ts

echo; echo "=== MUT-E2  with the pair supplied, drift S03's OWN row (auth user -> operator): does the pin bite?"
python3 "$REPL_PY" "$WT/$APIIDX" '{ route: "GET /v1/plan-tiers", auth: "user", resource: "plan-tier-rosters", action: "read" }' '{ route: "GET /v1/plan-tiers", auth: "operator", resource: "plan-tier-rosters", action: "read" }'
vt tests/unit/s7-authorization.test.ts
restore $APIIDX
restore $S7
restore $CONTRACT

echo; echo "=== FINAL STATE"
git status --porcelain
echo "porcelain excluding my probe: $(git status --porcelain | grep -v 'REV-S03-p2-correctness-tests-probe.test.ts' | wc -l | tr -d ' ')"
echo "DONE $(date '+%H:%M:%S')"
