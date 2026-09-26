#!/bin/zsh
# ARCH-FIX-PES-S03-p4 · every check of Revision 4, re-run on the revision as it stands. Writes only under this dir.
set -u
export PATH="/opt/homebrew/bin:$PATH"
D=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-FIX-PES-S03-p4
LANE=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s03/dialectical-engine
cd $D
echo "== date $(date '+%F %T %Z') · lane HEAD $(git -C $LANE rev-parse --short HEAD) dirty $(git -C $LANE status --porcelain | wc -l | tr -d ' ')"
echo "== gate";            node gate.mjs > gate.log 2>&1; echo "rc=$?  $(tail -1 gate.log)"
echo "== gate SELFTEST";   SELFTEST=1 node gate.mjs > gate-selftest.log 2>&1; echo "rc=$?  $(tail -1 gate-selftest.log)"
echo "== trace";           zsh trace.sh > trace.log 2>&1; grep TRACE_ trace.log
echo "== trace mutants";   zsh trace-mutants.sh > trace-mutants.log 2>&1; grep -c 'TRACE_FAIL' trace-mutants.log
echo "== citations";       node citations.mjs > citations.log 2>&1; echo "rc=$?  $(tail -1 citations.log)"
echo "== citations SELFTEST"; SELFTEST=1 node citations.mjs > citations-selftest.log 2>&1; echo "rc=$?  $(tail -1 citations-selftest.log)"
for c in c1 c2 c3; do echo "== $c cluster (command as it stands)"; zsh $c-cluster.sh 2>&1 | grep -E 'rc=|CLUSTER_|dirty'; done
echo "== frozen files"; (cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/provider-env-selection/slices/S03 && shasum -a 256 -c $D/frozen-pre.sha256)
echo "== lane dirty at end $(git -C $LANE status --porcelain | wc -l | tr -d ' ')"
