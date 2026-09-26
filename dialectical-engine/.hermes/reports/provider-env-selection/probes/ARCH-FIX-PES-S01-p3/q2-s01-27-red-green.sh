#!/bin/zsh
# ARCH-FIX-PES-S01-p3 probe q2 — S01-27 RED before GREEN, on a MIRROR of the lane (lane as it stands: HEAD 3e6f438b5 + C3's
# 4 uncommitted paths, rsync'd without node_modules/.git/.hermes; node_modules symlinked). The lane is never written.
# Only tests/architecture/p3-production-database-principals.test.ts runs here (it uses readFile/readdir, no git).
# Stages: s0 as-is · s1 + the two audit-test rows (RED) · s2 + the manifest entry (GREEN) ·
# m1 mutant: manifest entry with binding DEVELOPMENT_ONLY (the dev publisher's) · m2 mutant: manifest entry, test rows absent.
export PATH="/opt/homebrew/bin:$PATH"
L=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s01/dialectical-engine
M=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-FIX-PES-S01-p3/mirror/dialectical-engine
fresh() { rsync -a --delete --exclude node_modules --exclude .hermes --exclude .git $L/ $M/ && ln -sfn $L/node_modules $M/node_modules; }
run() { (cd $M && LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-FIX-PES-S01-p3/q2-$1.log zsh /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh tests/architecture/p3-production-database-principals.test.ts:2:0 | tail -2); }
fresh; echo "== s0 as-is";                                                       run s0
python3 /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-FIX-PES-S01-p3/proposed/apply_s01_27.py $M test;     echo "== s1 test rows only (RED)"; run s1
python3 /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-FIX-PES-S01-p3/proposed/apply_s01_27.py $M manifest; echo "== s2 + manifest (GREEN)";   run s2
cp $M/tests/architecture/p3-production-database-principals.test.ts /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-FIX-PES-S01-p3/proposed/p3-production-database-principals.test.ts.after
cp $M/docs/missions/2026-08-17-accounts-privacy-security/P3-01-production-database-principals.json /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-FIX-PES-S01-p3/proposed/P3-01-production-database-principals.json.after
diff -u $L/tests/architecture/p3-production-database-principals.test.ts /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-FIX-PES-S01-p3/proposed/p3-production-database-principals.test.ts.after > /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-FIX-PES-S01-p3/proposed/s01-27-test.diff
diff -u $L/docs/missions/2026-08-17-accounts-privacy-security/P3-01-production-database-principals.json /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-FIX-PES-S01-p3/proposed/P3-01-production-database-principals.json.after > /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-FIX-PES-S01-p3/proposed/s01-27-manifest.diff
sed -i '' 's/"binding": "WIRED",\n          "condition": "package script hosted/X/' $M/docs/missions/2026-08-17-accounts-privacy-security/P3-01-production-database-principals.json
perl -0pi -e 's/("purpose": "HOSTED_PROVIDER_SET_PUBLICATION",\n\s*"binding": )"WIRED"/$1"DEVELOPMENT_ONLY"/' $M/docs/missions/2026-08-17-accounts-privacy-security/P3-01-production-database-principals.json
echo "== m1 manifest binding DEVELOPMENT_ONLY (mirrors the dev publisher)"; run m1
fresh; python3 /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-FIX-PES-S01-p3/proposed/apply_s01_27.py $M manifest; echo "== m2 manifest only, test rows absent"; run m2
echo "lane dirty: $(git -C $L status --porcelain | wc -l | tr -d ' ')"
