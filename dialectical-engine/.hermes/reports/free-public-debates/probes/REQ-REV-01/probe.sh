#!/bin/zsh
# REQ-REV-01 probes. cwd must be the packet cwd (dialectical-engine).
# Records facts used in the verdict. Does not start the stack.
set -euo pipefail
ROOT="${0:A:h}"
OUT="$ROOT/probe.out"
exec > >(tee "$OUT") 2>&1

echo "PROBE REQ-REV-01 $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "cwd $(pwd)"
echo "git-toplevel $(git rev-parse --show-toplevel)"
echo "HEAD $(git rev-parse --short HEAD)"

echo
echo "=== P1 publications.ts:301 is unpublish, not readPublicDebate ==="
sed -n '299,303p' apps/api/src/publications.ts
echo "--- readPublicDebate ---"
grep -n 'async readPublicDebate' apps/api/src/publications.ts
sed -n '382,407p' apps/api/src/publications.ts | head -n 26

echo
echo "=== P2 PublicationTransitionSchema is .strict() two fields ==="
sed -n '249,252p' packages/contract/src/index.ts
echo "--- client parses visibility with it ---"
sed -n '457,475p' packages/contract/src/client.ts

echo
echo "=== P3 request bodies today's API requires ==="
echo "--- AskRequestSchema ---"
sed -n '109,126p' packages/contract/src/index.ts
echo "--- grant actions ---"
sed -n '177,179p' packages/contract/src/index.ts
echo "--- publish/unpublish bodies ---"
sed -n '206,214p' packages/contract/src/index.ts

echo
echo "=== P4 unauthenticated auth:user ==="
sed -n '515p' apps/api/src/index.ts
echo "--- DELETE debates anonymous handler (not reached if preHandler 401s) ---"
sed -n '775,776p' apps/api/src/index.ts
echo "--- malformed -> 400 ---"
sed -n '554,575p' apps/api/src/index.ts | head -n 22

echo
echo "=== P5 route table count (SPEC R-23 command, from packet cwd) ==="
awk 'NR>=100 && NR<=166' apps/api/src/index.ts | grep -c '{ route: "'
echo "--- table start/end ---"
sed -n '114p;165p' apps/api/src/index.ts
echo "--- visibility handler line ---"
grep -n '/v1/runs/:id/visibility' apps/api/src/index.ts | head

echo
echo "=== P6 SPEC R-24 git check from packet cwd ==="
git diff --name-only 5b6cc9b1..HEAD -- apps/ui | wc -l | tr -d ' '

echo
echo "=== P7 freeze pathspec from packet cwd vs git root ==="
echo "cwd docs/missions/... --stat lines:"
git diff --stat 38a44dc3..06e4eceb -- docs/missions/free-public-debates | tail -n 2
echo "git-root docs/missions/... --stat lines:"
git -C "$(git rev-parse --show-toplevel)" diff --stat 38a44dc3..06e4eceb -- docs/missions/free-public-debates | tail -n 2

echo
echo "=== P8 INSTRUCTIONS line count ==="
wc -l docs/missions/free-public-debates/INSTRUCTIONS.md

echo
echo "=== P9 R-8 vs R-9: PRIVATE+outstanding=0 is required by R-8 and forbidden by R-9 ==="
python3 - <<'PY'
from pathlib import Path
p = Path("docs/missions/free-public-debates/slices/S01/SPEC.md").read_text()
assert "`PRIVATE` with nothing outstanding is a" in p
assert "violation of this requirement" in p
assert "outstanding auto-publish work for that run reaches 0 and stays 0" in p
print("both clauses present: YES")
PY

echo
echo "=== P10 SPEC never names acknowledgement literals ==="
grep -n 'warning_acknowledged\|copies_may_persist_acknowledged\|DELETE_PRIVATE_DEBATE' \
  docs/missions/free-public-debates/slices/S01/SPEC.md \
  || echo "NO_HITS"

echo "DONE"
