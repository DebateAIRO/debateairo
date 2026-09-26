#!/bin/zsh
# Exceeds the authors' parameters: N concurrent vitest processes of the two fixture suites (what two parallel REV lenses,
# or V plus a seat, do on one Mac). Measures the lsof-then-bind window (PES_S02_PORT_BIND_RACED / EADDRINUSE).
# Usage: WORKTREE=<lane> N=<n> ROUNDS=<r> zsh run-concurrent.sh <outdir>
export PATH="/opt/homebrew/bin:$PATH"; unset FORCE_COLOR NO_COLOR
O=${1:?}; cd "${WORKTREE:?}" || exit 2; N=${N:-4}; R=${ROUNDS:-3}
for r in $(seq 1 $R); do
  pids=()
  for i in $(seq 1 $N); do pnpm exec vitest run acceptance/pes-s02-hosted.test.ts acceptance/pes-s02-fake-vendor.test.ts > $O/round$r-p$i.log 2>&1 & pids+=($!); done
  for p in $pids; do wait $p; done
  for i in $(seq 1 $N); do echo "round $r proc $i: $(grep -E '^ +Tests ' $O/round$r-p$i.log | tr -s ' ') $(grep -oE 'PES_S02_PORT_BIND_RACED|EADDRINUSE|bind-raced' $O/round$r-p$i.log | sort | uniq -c | tr -s ' ' | tr '\n' ' ')"; done
done
lsof -nP -iTCP:4460-4499 -sTCP:LISTEN; echo "final lsof rc=$?"
