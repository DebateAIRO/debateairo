#!/bin/zsh
# ARCH-FIX-PES-S01-p3 probe q4 — pair_check.py watched FAILING, then PASSING, then FAILING on two mutants.
L=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s01/dialectical-engine
M=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-FIX-PES-S01-p3/mirror/dialectical-engine
fresh() { rsync -a --delete --exclude node_modules --exclude .hermes --exclude .git $L/ $M/; }
echo "== lane as it stands (C3-F1 present)"; python3 /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-FIX-PES-S01-p3/pair_check.py $L
echo "== base lane pes-base @ 776359c3 (no hosted CLI)"; python3 /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-FIX-PES-S01-p3/pair_check.py /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-base/dialectical-engine
fresh; python3 /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-FIX-PES-S01-p3/proposed/apply_s01_27.py $M test >/dev/null; python3 /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-FIX-PES-S01-p3/proposed/apply_s01_27.py $M manifest >/dev/null
echo "== mirror + S01-27"; python3 /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-FIX-PES-S01-p3/pair_check.py $M
perl -0pi -e 's#"sourceFile": "apps/runner/src/hosted-provider-set-publish-cli.ts"#"sourceFile": "apps/runner/src/hosted-provider-set.ts"#' $M/docs/missions/2026-08-17-accounts-privacy-security/P3-01-production-database-principals.json
echo "== mutant: entry names the library file instead of the entry"; python3 /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-FIX-PES-S01-p3/pair_check.py $M
fresh; python3 /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-FIX-PES-S01-p3/proposed/apply_s01_27.py $M manifest >/dev/null
perl -0pi -e 's#("purpose": "HOSTED_PROVIDER_SET_PUBLICATION",\n\s*"binding": )"WIRED"#$1"REQUIRED_NOT_WIRED"#' $M/docs/missions/2026-08-17-accounts-privacy-security/P3-01-production-database-principals.json
echo "== mutant: binding REQUIRED_NOT_WIRED (not executable)"; python3 /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-FIX-PES-S01-p3/pair_check.py $M
echo "lane dirty: $(git -C $L status --porcelain | wc -l | tr -d ' ')"
