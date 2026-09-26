#!/bin/zsh
# ARCH-FIX-PES-S02-p3 — the exit-rule detectors on the revised PLAN, on the Revision 2 PLAN as committed (3acff611e — the failing
# fixture: it predates V's ruling), and on a one-number mutant of the revision (R2.8's anchor moved by 1: E10 must fail).
set -u
Q=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-FIX-PES-S02-p3
PLAN=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/provider-env-selection/slices/S02/PLAN.md
echo "== revised PLAN.md"; python3 $Q/exit-rule-detectors.py $PLAN
echo "== failing fixture: PLAN-rev2.md (git show 3acff611e)"; python3 $Q/exit-rule-detectors.py $Q/PLAN-rev2.md
M=$Q/PLAN-anchor-mutant.md; sed 's/R2\.8 `:152`/R2.8 `:153`/' $PLAN > $M
echo "== anchor mutant (R2.8 :152 → :153)"; python3 $Q/exit-rule-detectors.py $M | grep -E '^E10|ALL-PASS|FAILED'; rm -f $M
