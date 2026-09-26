#!/bin/zsh
# ARCH-FIX-PES-S03-p4 · the adapted trace parser watched FAILING. Mutant plans are written under this probe dir.
set -u
export PATH="/opt/homebrew/bin:$PATH"
D=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-FIX-PES-S03-p4
mkdir -p $D/trace-mutants
grep -v '^| R3.4b |' /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/provider-env-selection/slices/S03/PLAN.md > $D/trace-mutants/no-R34b-row.md
sed 's/ · C3-5 → R3.4b//' /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/provider-env-selection/slices/S03/PLAN.md > $D/trace-mutants/no-C35-reverse.md
for m in PLAN-at-rev3.md:$D/PLAN-at-rev3.md no-R34b-row:$D/trace-mutants/no-R34b-row.md no-C35-reverse:$D/trace-mutants/no-C35-reverse.md; do
  echo "== mutant ${m%%:*}"; PLAN=${m#*:} zsh $D/trace.sh | grep -E 'with no|unknown|TRACE_'; echo "rc=${pipestatus[1]}"
done
