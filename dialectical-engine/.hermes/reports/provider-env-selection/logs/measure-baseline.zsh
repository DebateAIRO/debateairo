#!/bin/zsh
# measure-baseline.zsh <lane> <tag> — the orchestrator's baseline at the lane's HEAD: every suite that READS the provider
# surface (grep -l over tests/ at intake), through the capture runner with placeholder pairs (per-suite passed/failed lines are
# the measurement; the marker is not a verdict here), then node source-tests if any, then `pnpm typecheck` captured.
set -u
export PATH="/opt/homebrew/bin:$PATH" LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
LANE=${1:?lane}; TAG=${2:?tag}
R=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine; L=$R/.hermes/reports/provider-env-selection/logs; SK=$R/.claude/skills/heartbeat-orchestrator/scripts
cd "$LANE" || exit 9
echo "measure-baseline $TAG at $(git rev-parse --short HEAD) dirty=$(git status --porcelain | wc -l | tr -d ' ') $(date '+%F %T')"
SUITES=("${(@f)$(git grep -l -I -E 'provider-discovery|dev-provider-panel|dev-provider-set|providers/src|configuredProviderSet|PROVIDER_DISCOVERY|provider-topology|dev-secret-files|deploy/vps' HEAD -- tests | sed 's#^HEAD:##' | grep -E '\.test\.ts$' | sort)}")
echo "suites: ${#SUITES[@]}"; printf '  %s\n' "${SUITES[@]}"
pairs=(); for s in "${SUITES[@]}"; do pairs+=("$s:0:0"); done
LOG=$L/baseline-$TAG-suites.log zsh $SK/run-suites.sh "${pairs[@]}" > $L/baseline-$TAG-suites.out 2>&1; echo "suites rc=$? marker=$(grep -o -E 'CLUSTER_(GREEN|RED|BROKEN)' $L/baseline-$TAG-suites.out | tail -1)"
grep -E "rc=|Tests  " $L/baseline-$TAG-suites.out | head -60
LOG=$L/baseline-$TAG-typecheck.log zsh $SK/run-capture.sh pnpm typecheck > $L/baseline-$TAG-typecheck.out 2>&1; echo "typecheck rc=$? diagnostics=$(grep -c -E 'error TS[0-9]+' $L/baseline-$TAG-typecheck.log)"
grep -o -E '^[^( ]+\([0-9]+,[0-9]+\): error TS[0-9]+' $L/baseline-$TAG-typecheck.log | cut -d'(' -f1 | sort | uniq -c | sort -rn | head -25
echo "done $(date '+%F %T')"
