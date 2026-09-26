#!/bin/zsh
# ARCH-FIX-PES-S01-p3 probe q1 — the class sweep of C3-F1 ("a registry test that enumerates source files and must list a
# new one"): tests/unit/s1-1-depth-contract.test.ts reads tests/support/shipped-corpus.manifest.txt. Run at the S01 lane
# as it stands (HEAD 3e6f438b5 + C3's 4 uncommitted paths) and at the planning lane pes-base (776359c3). Read-only runs.
export PATH="/opt/homebrew/bin:$PATH"
unset SHIPPED_CORPUS_MANIFEST_UPDATE
for L in /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s01/dialectical-engine /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-base/dialectical-engine; do
  echo "===== $L HEAD $(git -C $L rev-parse --short HEAD) dirty $(git -C $L status --porcelain | wc -l | tr -d ' ')"
  (cd $L && LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-FIX-PES-S01-p3/q1-$(basename $(dirname $L)).log zsh /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh tests/unit/s1-1-depth-contract.test.ts:0:0)
  echo "dirty after $(git -C $L status --porcelain | wc -l | tr -d ' ')"
done
