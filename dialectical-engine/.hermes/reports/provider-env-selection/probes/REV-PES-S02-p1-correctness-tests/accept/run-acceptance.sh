#!/bin/zsh
# SPEC-v4 §5 steps 2-10 run as V types them (PLAN §4 V6); /tmp targets replaced by $O. FORCE_COLOR/NO_COLOR unset.
# Usage: WORKTREE=<lane dialectical-engine dir> zsh run-acceptance.sh <outdir>
export PATH="/opt/homebrew/bin:$PATH"; unset FORCE_COLOR NO_COLOR
O=${1:?}; cd "${WORKTREE:?}" || exit 2
echo "HEAD $(git rev-parse --short HEAD) $(date '+%F %T')"
echo "== step 2"; pnpm vitest run tests/unit/v9-deployment-mode.test.ts -t 'declares DEBATEAI_DEPLOYMENT_MODE=local' > $O/step2.log 2>&1; echo "step2 rc=$?"; grep -E 'Tests |✓|×' $O/step2.log
echo "== step 3"; { lsof -nP -iTCP:3000 -sTCP:LISTEN; lsof -nP -iTCP:8790 -sTCP:LISTEN; } | tee $O/pes-s02-before.log; echo "  (lines=$(wc -l < $O/pes-s02-before.log | tr -d ' '))"
echo "== ports 4460-4499 before"; lsof -nP -iTCP:4460-4499 -sTCP:LISTEN; echo "  lsof rc=$?"
echo "== step 4"; pnpm pes:accept-hosted > $O/pes-s02-accept.log 2>&1; echo "exit=$?"
echo "== step 4 cat"; cat $O/pes-s02-accept.log
echo "== step 7"; grep -c 'pes-s02-fake-vendor-token' $O/pes-s02-accept.log; grep -cF "$(sed -n 's/^PES-S02 SCRATCH-DIR //p' $O/pes-s02-accept.log)/custody.d" $O/pes-s02-accept.log
echo "== step 8 last line"; tail -1 $O/pes-s02-accept.log
S=$(sed -n 's/^PES-S02 SCRATCH-DIR //p' $O/pes-s02-accept.log)
echo "== step 9"; test -e "$S" ; echo $?
echo "  tmpdir prefix: $(node -p 'require("os").tmpdir()') ; scratch=$S"
PORT=$(sed -n 's/^PES-S02 PORT-FREE \([0-9]*\) .*/\1/p' $O/pes-s02-accept.log); VP=$(sed -n 's|^PES-S02 FAKE-VENDOR https://api.localtest.me:\([0-9]*\)/v1|\1|p' $O/pes-s02-accept.log)
echo "== port PORT-FREE=$PORT FAKE-VENDOR=$VP"; lsof -nP -iTCP:$PORT -sTCP:LISTEN; echo "  lsof rc=$?"
echo "== step 10"; { lsof -nP -iTCP:3000 -sTCP:LISTEN; lsof -nP -iTCP:8790 -sTCP:LISTEN; } > $O/pes-s02-after.log; cmp $O/pes-s02-before.log $O/pes-s02-after.log && echo "step10 SAME"
echo "== line law: non-PES lines"; grep -v '^PES-S02' $O/pes-s02-accept.log
