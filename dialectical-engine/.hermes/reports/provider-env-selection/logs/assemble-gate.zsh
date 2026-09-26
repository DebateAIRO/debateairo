#!/bin/zsh
# assemble-gate.zsh <S> <pass> <lane> <branch> — GATE(S): the review package every REV lens reads (orchestrator §6), assembled by the
# orchestrator when every BUILD(S-*) is done. review-packages/<S>-p<pass>/{README.md, commits.txt, diff-stat.txt, diff.patch, handoffs/,
# frames/, listeners.txt}; the orchestrator's READING goes BESIDE the package (review-packages/<S>-p<pass>-ORCHESTRATOR-READING.md, written
# by hand afterwards — no lens packet names it). Every count/sha is measured here, never copied from a handoff. Frames only, no verdicts.
set -u
export PATH="/opt/homebrew/bin:$PATH" LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
S=${1:?S}; P=${2:?pass}; LANE=${3:?lane}; BR=${4:?branch}
R=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine; M=$R/docs/missions/provider-env-selection; RP=$R/.hermes/reports/provider-env-selection; SK=$R/.claude/skills/heartbeat-orchestrator/scripts; H=~/.local/bin/hermes; B=provider-env-selection
BASE=${BASE:-776359c3}; PKG=$RP/review-packages/$S-p$P; mkdir -p $PKG/handoffs $PKG/frames
cd "$LANE" || exit 9
HEAD=$(git rev-parse --short HEAD); DIRTY=$(git status --porcelain | wc -l | tr -d ' ')
git log --oneline $BASE..HEAD > $PKG/commits.txt
git diff --stat $BASE..HEAD -- . ':!.codex/skills' > $PKG/diff-stat.txt
git diff $BASE..HEAD -- . ':!.codex/skills' > $PKG/diff.patch
n=${S#S}; n=${n#0}
for pair in ${(f)"$(python3 -c 'import pathlib,sys;ids=dict(l.split("=") for l in pathlib.Path(sys.argv[1]).read_text().split());p="B"+sys.argv[2];[print(k[len(p):]+" "+v) for k,v in sorted(ids.items()) if k.startswith(p) and k[len(p):].isdigit()]' $RP/logs/board-ids.env $n)"}; do
  c=${pair%% *}; T=${pair#* }; SEAT=BUILD-PES-$S-C$c
  $H kanban --board $B show $T --json | python3 -c '
import json,sys
d=json.load(sys.stdin); seat=sys.argv[1]
for c in d.get("comments") or []:
    b=str(c.get("body",""))
    if c.get("author")==seat and (b.startswith("SKILLS LOADED") or "READY" in b[:400]) and "READY" in b[:4000]:
        print(b)' "$SEAT" > $PKG/handoffs/$SEAT.md
  echo "handoff $SEAT: $(wc -l < $PKG/handoffs/$SEAT.md | tr -d ' ') lines (ticket $T)"
done
# re-run every cluster command of PLAN §3 at the head (frames, one log per cluster)
python3 $RP/logs/cluster-pairs.py $S | while read -r cn pairs; do
  LOG=$PKG/frames/$cn-gate.log zsh $SK/run-suites.sh ${=pairs} > $PKG/frames/$cn-gate.out 2>&1
  echo "frame $cn: $(grep -o -E 'CLUSTER_(GREEN|RED)|BROKEN' $PKG/frames/$cn-gate.out | tail -1) — $(grep -E 'rc=' $PKG/frames/$cn-gate.out | tr '\n' ' ')"
done
LOG=$PKG/frames/typecheck-gate.log zsh $SK/run-capture.sh pnpm typecheck > $PKG/frames/typecheck-gate.out 2>&1
echo "typecheck: $(head -1 $PKG/frames/typecheck-gate.out) diagnostics=$(grep -c -E 'error TS[0-9]+' $PKG/frames/typecheck-gate.log)"
for port in 3000 3001 8790 4310 8793 8795 8796 55432; do printf '%s: %s\n' $port "$(lsof -nP -iTCP:$port -sTCP:LISTEN 2>/dev/null | tail -n +2 | awk '{print $1"/"$2}' | tr '\n' ' ')"; done > $PKG/listeners.txt
{
  echo "# Review package $S pass $P — assembled $(date '+%F %T') by the orchestrator (frames only; the reading lives beside this package, in no lens's inputs)"
  echo
  echo "- slice head: \`$HEAD\` on \`$BR\` in \`$LANE\` (dirty $DIRTY at assembly) · base: \`origin/dev\` @ \`$BASE\`"
  echo "- range: \`git diff --stat $BASE..$HEAD -- . ':!.codex/skills'\` run from the lane's \`dialectical-engine/\` → \`diff-stat.txt\`, \`diff.patch\` (the PRODUCT range only); commits: \`commits.txt\` ($(wc -l < $PKG/commits.txt | tr -d ' ') commits)"
  echo "- files changed (measured): "; sed 's/^/    /' $PKG/diff-stat.txt
  echo "- cluster map (PLAN §3 rows, verbatim):"; python3 $RP/logs/cluster-pairs.py $S | sed 's/^/    /'
  echo "- BUILD handoffs (each seat's READY comment, verbatim, with its three-run table and refutation matrix): \`handoffs/*.md\`"
  echo "- orchestrator's re-run of every cluster command at the head (\`frames/<Cn>-gate.out\`, full logs beside):"; for f in $PKG/frames/*-gate.out; do echo "    $(basename $f): $(grep -E 'rc=|CLUSTER_|BROKEN' $f | tr '\n' ' ')"; done
  echo "- typecheck at the head: \`frames/typecheck-gate.out\` — $(grep -c -E 'error TS[0-9]+' $PKG/frames/typecheck-gate.log) diagnostic(s); the baseline is 1 (\`apps/ui/lib/v3/answerExport.ts(2,38) TS2835\`, intake §5b) — judged by DELTA per file, never by rc"
  echo "- acceptance oracle: \`$M/slices/$S/$(ls $M/slices/$S | grep -E '^SPEC(-v[0-9]+)?\.md$' | sort -t v -k2 -n | tail -1) §5\` (numbered steps V runs alone); base answers for its greps: \`$RP/probes/ARCH-PES-$S/accept-base.log\`"
  echo "- the four RED-at-base suites and their pairs: \`$M/00-intake.md\` §5b / \`$RP/logs/baselines.tsv\` (unchanged is the expectation)"
  echo "- dev-stack recipe: ${RECIPE:-this slice starts NO process and opens NO port (PLAN §3);} a lens that needs a listener for its own probe takes a port ABOVE 4400 measured free with \`lsof -nP -iTCP:<port> -sTCP:LISTEN\`, names its processes \`<seat>-<what>.mjs\`, writes \`\$!\` to \`$RP/logs/<seat>.<proc>.pid\` and kills by that PID — never \`pkill -f\` a shared filename"
  echo "- listener baseline of every NO-TOUCH port at assembly (\`listeners.txt\`): "; sed 's/^/    /' $PKG/listeners.txt
} > $PKG/README.md
echo "package: $PKG (README $(wc -l < $PKG/README.md | tr -d ' ') lines) head=$HEAD"
