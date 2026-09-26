#!/bin/zsh
# ARCH-FIX-PES-S01-p2 probe d5 — every Revision-2 guarantee watched FAILING on a mutant before its PASS is quoted.
#  m1-no-role-check        : library without step (6)                 -> expect FAIL role-provider-dropped, rc=1
#  m2-refuse-any-role-row  : step (6) refuses whenever a role row exists -> expect FAIL role-provider-dropped, rc=1
#  m3-exitcode-not-exit    : m1 + the entry ends with process.exitCode  -> expect FAIL line but rc=0 (the d3 trap)
#  m4-two-row-seed         : the role seed of SPEC-v4 R1.12 as worded (2 rows) -> expect FAIL role-provider-dropped
export PATH="/opt/homebrew/bin:$PATH"
D=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-FIX-PES-S01-p2
mk() { rm -rf $D/$1; cp -R $D/proposed $D/$1; }
mk m1-no-role-check;  perl -0pi -e 's/\n  assertHostedRoleProvidersKept\(baseRows, roster\);//' $D/m1-no-role-check/hosted-provider-set.ts
mk m2-refuse-any-role-row; perl -0pi -e 's/if \(row === undefined\) continue;/if (row === undefined) continue; throw new TypeError(`PES_PUBLISH_ROLE_PROVIDER_DROPPED:\$\{rowKey\}`);/' $D/m2-refuse-any-role-row/hosted-provider-set.ts
mk m3-exitcode-not-exit; cp $D/m1-no-role-check/hosted-provider-set.ts $D/m3-exitcode-not-exit/; perl -0pi -e 's/process\.exit\(exitCode\);/process.exitCode = exitCode;/' $D/m3-exitcode-not-exit/p8-acceptance-dry-run.ts
mk m4-two-row-seed; perl -0pi -e 's/\.\.\.others\.map/...[].map/' $D/m4-two-row-seed/pes-s01-publish-set-acceptance.ts
for m in m1-no-role-check m2-refuse-any-role-row m3-exitcode-not-exit m4-two-row-seed; do
  echo "== $m: diff vs proposed"; diff -r $D/proposed $D/$m | grep '^[<>]' | cut -c1-160
  zsh $D/d1-acceptance-dry-run.sh $m $D/$m
  echo "   $(head -1 $D/$m-rc.txt) · verdict: $(tail -1 $D/$m-stdout.txt) · role line: $(grep 'role-provider-dropped' $D/$m-stdout.txt | head -1) · $(grep dirty $D/$m-rc.txt)"
done
