#!/bin/zsh
# ARCH-FIX-PES-S02-p2 — run the B1/N1/N2 detectors on the revised PLAN, then on the reviewed copy (the failing fixture:
# every detector must FAIL there, or it guards nothing).
set -u
Q=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-FIX-PES-S02-p2
echo "== revised PLAN.md"; python3 $Q/fix-detectors.py /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/provider-env-selection/slices/S02/PLAN.md
echo "== failing fixture: PLAN-p1-as-reviewed.md (git show 37446fa0f, byte-identical to the plan ARCH-REV reviewed)"; python3 $Q/fix-detectors.py $Q/PLAN-p1-as-reviewed.md
