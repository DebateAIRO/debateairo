#!/bin/zsh
# ARCH-FIX-PES-S02-p2 — every lane path:line Revision 2 adds or leans on, re-measured in the lane (read-only).
set -u
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s02/dialectical-engine || exit 2
echo "== apps/runner/src/dev-api-environment.ts:284-287 (N1: the DRIFT throw case (b) expects)"; sed -n '284,287p' apps/runner/src/dev-api-environment.ts
echo "== apps/runner/src/dev-api-environment.ts:76-78 (N1: the last key, so ROW-length slice cuts into its row)"; sed -n '76,78p' apps/runner/src/dev-api-environment.ts
echo "== tests/integration/dev-api-environment.test.ts:52-54 (N1: fixture root under mkdtemp, so the last row is longer than ROW)"; sed -n '52,54p' tests/integration/dev-api-environment.test.ts
echo "== ROW length"; printf 'DEBATEAI_DEPLOYMENT_MODE=local\n' | wc -c | tr -d ' '
echo "== tests/integration/dev-api-process.test.ts:208 (N2: the support-preview case whose mock body is quoted)"; sed -n '208p' tests/integration/dev-api-process.test.ts
grep -n "SESSION_REQUIRED" tests/integration/dev-api-process.test.ts | head -3
echo "== node_modules/@types/node/net.d.ts LookupFunction (B1: the callback shape)"; n=$(grep -n 'type LookupFunction' node_modules/@types/node/net.d.ts | cut -d: -f1); echo "net.d.ts:$n"; sed -n "$n,$((n+4))p" node_modules/@types/node/net.d.ts
echo "lane: HEAD $(git rev-parse --short HEAD) dirty $(git status --porcelain | wc -l | tr -d ' ')"
