#!/bin/zsh
# REV-PES-S03-p2-correctness-tests — re-run every PLAN §3 cluster command at the slice head,
# then C3 twice more (three runs, worst wins). Root: $WORKTREE or argv[1]. Logs beside this script.
# Written against head 60993d2db. C1/C2 are expected CLUSTER_RED at the head (their pairs are
# their own cluster boundary, 24 and 28; the head carries 31 cases) — PLAN §3 note.
set -u
export PATH="/opt/homebrew/bin:$PATH"
WT="${WORKTREE:-${1:?usage: cluster-commands.sh <worktree root>}}"
cd "$WT"
OUT="${0:A:h}"
RUNNER=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh
echo "start $(date '+%F %T %Z') HEAD $(git rev-parse --short HEAD) dirty $(git status --porcelain | wc -l | tr -d ' ')"
run() { local n="$1"; shift; LOG="$OUT/$n.log" zsh "$RUNNER" "$@" | grep -E 'rc=|CLUSTER_|BROKEN'; }
run c1 tests/unit/v9-provider-credential-files.test.ts:24:0 tests/architecture/vps-deployment-baseline.test.ts:31:0
run c2 tests/unit/v9-provider-credential-files.test.ts:28:0 tests/architecture/vps-deployment-baseline.test.ts:31:0
for i in 1 2 3; do run c3-run$i tests/unit/v9-provider-credential-files.test.ts:31:0 tests/architecture/vps-deployment-baseline.test.ts:31:0; done
echo "end $(date '+%F %T %Z') dirty $(git status --porcelain | wc -l | tr -d ' ')"
