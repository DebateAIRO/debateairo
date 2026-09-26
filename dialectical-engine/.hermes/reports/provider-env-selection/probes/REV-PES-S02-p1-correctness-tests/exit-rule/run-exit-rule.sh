#!/bin/zsh
# 8(c): V-12/V-13 exit rule through REAL pnpm, FORCE_COLOR/NO_COLOR unset. Stimuli: UNVERIFIED by occupying 4460-4499
# (own listener, killed by PID); FAIL and thrown by TEMPORARY mutants of acceptance/pes-s02-hosted.ts restored from
# captured bytes. Usage: WORKTREE=<lane dialectical-engine dir> zsh run-exit-rule.sh <outdir>
export PATH="/opt/homebrew/bin:$PATH"; unset FORCE_COLOR NO_COLOR
O=${1:?}; D=$(cd "$(dirname "$0")" && pwd); cd "${WORKTREE:?}" || exit 2
H=acceptance/pes-s02-hosted.ts; cp $H $O/hosted.captured
show() { echo "exit=$1"; echo "  last line: $(tail -1 $2)"; echo "  line before last: $(tail -2 $2 | head -1)"; echo "  ESC bytes: $(grep -c $'\e' $2)"; }
echo "== UNVERIFIED (ports occupied)"; lsof -nP -iTCP:4460-4499 -sTCP:LISTEN; echo "  pre lsof rc=$?"
node $D/REV-PES-S02-p1-correctness-tests-portblock.mjs > $O/portblock.out 2>&1 &
BP=$!; echo $BP > $O/REV-PES-S02-p1-correctness-tests.portblock.pid
until grep -q BLOCKED $O/portblock.out; do sleep 0.2; done; cat $O/portblock.out
pnpm pes:accept-hosted > $O/unverified.log 2>&1; show $? $O/unverified.log; cat $O/unverified.log
kill $BP; wait $BP 2>/dev/null; lsof -nP -iTCP:4460-4499 -sTCP:LISTEN; echo "  post-kill lsof rc=$?"
echo "== FAIL (temporary mutant: refused-price expected text)"
python3 -c "import sys;p='$H';s=open(p).read();o='expected: \"PROVIDER_TARGET_PRICE_REQUIRED:vendor:a\"';assert s.count(o)==1;open(p,'w').write(s.replace(o,'expected: \"PROVIDER_TARGET_PRICE_REQUIRED:vendor:b\"'))"
pnpm pes:accept-hosted > $O/fail.log 2>&1; show $? $O/fail.log; cp $O/hosted.captured $H; git status --porcelain; echo "  (restore status above)"
echo "== THROWN (temporary mutant: runHostedAcceptance throws first)"
python3 -c "p='$H';s=open(p).read();o='): Promise<HostedAcceptanceResult> {\n';assert s.count(o)==1;open(p,'w').write(s.replace(o,o+'  throw new Error(\"rev-thrown-secret-message\");\n'))"
pnpm pes:accept-hosted > $O/thrown.log 2>&1; show $? $O/thrown.log; echo "  thrown message leaked: $(grep -c rev-thrown-secret-message $O/thrown.log)"; cp $O/hosted.captured $H; git status --porcelain; echo "  (restore status above)"
echo "== PASS again after restore"; pnpm pes:accept-hosted > $O/pass.log 2>&1; show $? $O/pass.log
lsof -nP -iTCP:4460-4499 -sTCP:LISTEN; echo "  final lsof rc=$?"
