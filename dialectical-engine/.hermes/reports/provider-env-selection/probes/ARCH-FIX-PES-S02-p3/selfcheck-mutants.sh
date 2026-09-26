#!/bin/zsh
# ARCH-FIX-PES-S02-p3 — plan-selfcheck.sh watched FAILING on two mutants of the revised PLAN: (1) §10's S02-S19 row renamed
# (check 3 must print reverse=0 and GAP); (2) refused-price's fixture changed by one character (check 5 must print DIFFERS).
set -eu -o pipefail
Q=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-FIX-PES-S02-p3
PLAN=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/provider-env-selection/slices/S02/PLAN.md
M=$Q/selfcheck-mutant-PLAN.md
python3 - "$PLAN" "$M" <<'PY'
import sys, re
s = open(sys.argv[1], encoding="utf-8").read()
i = s.index("## 10.")
t = s[i:].replace("| S02-S19 |", "| S02-SXX |", 1); assert t != s[i:]
s = s[:i] + t
j = s.index("| `refused-price` (EXACT row) |"); k = s.index("\n", j)
row = s[j:k]; row2 = row.replace("fake-model", "fake-modeL", 1); assert row2 != row
s = s[:j] + row2 + s[k:]
open(sys.argv[2], "w", encoding="utf-8").write(s)
PY
test -s "$M" && echo "mutant written: $(wc -l < $M | tr -d " ") lines"
sed "s#^PLAN=\$M/PLAN.md#PLAN=$M#" $Q/plan-selfcheck.sh | sed 's#; SPEC=#\nSPEC=#' | zsh 2>&1 | grep -E 'S02-S19 defined|GAP|all 20|refused-price'
rm -f "$M"
