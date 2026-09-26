#!/bin/zsh
# REV-PES-S03-p2-security-data-safety — re-run every PLAN §3 cluster command at the slice head.
# usage: WORKTREE=<abs dialectical-engine dir of a checkout> zsh clusters.sh   (or pass it as $1)
# written against slice head 60993d2db; logs land beside this script, one per run, suffix = $TAG (default run1)
set -u
export PATH="/opt/homebrew/bin:$PATH"
WT="${WORKTREE:-${1:?WORKTREE or argv root}}"
HERE="${0:A:h}"; TAG="${TAG:-run1}"
RS=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh
cd "$WT" || exit 2
echo "HEAD $(git rev-parse --short HEAD) dirty $(git status --porcelain | wc -l | tr -d ' ')"
for c in C1:24 C2:28 C3:31; do
  n=${c%%:*}; x=${c#*:}
  echo "== $n (v9 expect $x/0, baseline 31/0)"
  LOG="$HERE/$n-$TAG.log" zsh "$RS" tests/unit/v9-provider-credential-files.test.ts:$x:0 tests/architecture/vps-deployment-baseline.test.ts:31:0
done
echo "END dirty $(git status --porcelain | wc -l | tr -d ' ')"
