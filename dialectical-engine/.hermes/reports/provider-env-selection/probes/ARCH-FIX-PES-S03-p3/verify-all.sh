#!/bin/zsh
# ARCH-FIX-PES-S03-p3 · every re-run and checker for Revision 3, in order, each to its own log.
# Order: each checker's failing fixtures FIRST (planted SELFTEST, and its Revision 3 expectations run
# against Revision 2's plan), then its pass. Lane read-only; nothing is written outside this dir.
set -u
export PATH="/opt/homebrew/bin:$PATH"
P3=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-FIX-PES-S03-p3
P2=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-FIX-PES-S03-p2
L=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s03/dialectical-engine
cd $P3 || exit 2
r() { local log=$1; shift; "$@" > $P3/$log 2>&1; local rc=$?; printf '%-40s rc=%s  %s\n' "$log" "$rc" "$(tail -1 $P3/$log)"; }
echo "== failing fixtures first"
r boot-order-selftest.log env SELFTEST=1 node boot-order.mjs
r gate-selftest.log env MODE=rev3 SELFTEST=1 node gate.mjs
r gate-rev3-on-rev2-plan.log env MODE=rev3 PLAN=$P3/PLAN-at-rev2.md node gate.mjs
r citations-selftest.log env MODE=rev3 SELFTEST=1 node citations.mjs
r citations-rev3-on-rev2-plan.log env MODE=rev3 PLAN=$P3/PLAN-at-rev2.md node citations.mjs
r consistency-p2-rerun-selftest.log env SELFTEST=1 zsh $P2/consistency.sh
echo "== reproduction on Revision 2"
r reproduce-rev2.log env MODE=rev2 PLAN=$P3/PLAN-at-rev2.md node gate.mjs
r citations-rev2.log env MODE=rev2 node citations.mjs
echo "== the revision"
r boot-order.log node boot-order.mjs
r gate.log env MODE=rev3 node gate.mjs
r oracles-p3-selftest.log env SELFTEST=1 zsh oracles-p3.sh
r oracles-p3.log zsh oracles-p3.sh
r citations.log env MODE=rev3 node citations.mjs
r consistency-p2-rerun.log zsh $P2/consistency.sh
r oracles-p2-rerun.log zsh $P2/oracles.sh
r closure-p3.log zsh closure-p3.sh
echo "== cluster commands as they stand"
for n in c1-cluster c2-cluster base-pairs; do r $n-driver.log zsh $n.sh; grep -E 'rc=|CLUSTER_' $P3/$n-driver.log; done
echo "lane HEAD $(git -C $L rev-parse --short HEAD) dirty $(git -C $L status --porcelain | wc -l | tr -d ' ')"
