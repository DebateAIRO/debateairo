#!/bin/zsh
# ARCH-FIX-PES-S02-p2 — the trace checker (plan-selfcheck.sh check 3) watched FAILING: a copy of the revised PLAN whose
# §10 row for S02-S13 is renamed must print reverse=0 and GAP. The copy is removed afterwards.
set -u
Q=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-FIX-PES-S02-p2
M=$Q/trace-mutant-PLAN.md
python3 -c "
s=open('/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/provider-env-selection/slices/S02/PLAN.md').read()
i=s.index('## 10.'); t=s[i:].replace('| S02-S13 | R2.5, R2.6, R2.11 |','| S02-SXX | R2.5, R2.6, R2.11 |',1)
assert t!=s[i:]; open('$M','w').write(s[:i]+t)"
sed "s#^PLAN=\$M/PLAN.md#PLAN=$M#" $Q/plan-selfcheck.sh | sed 's#; SPEC=#\nSPEC=#' | zsh 2>&1 | sed -n '/== 3/,/== 4/p' | grep -E 'S02-S13|GAP|all 20'
rm -f "$M"
