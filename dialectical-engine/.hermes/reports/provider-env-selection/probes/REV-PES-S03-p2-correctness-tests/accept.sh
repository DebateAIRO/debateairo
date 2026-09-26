#!/bin/zsh
# REV-PES-S03-p2-correctness-tests — SPEC-v3 §5 steps 2-7 at the head + boundary checks.
# Root: $WORKTREE or argv[1]. Written against 60993d2db. Output to stdout (caller tees).
set -u
export PATH="/opt/homebrew/bin:$PATH"
WT="${WORKTREE:-${1:?usage: accept.sh <root>}}"; cd "$WT"
echo "HEAD $(git rev-parse --short HEAD) dirty $(git status --porcelain | wc -l | tr -d ' ') $(date '+%F %T %Z')"
echo "== step 2"; pnpm vitest run tests/unit/v9-provider-credential-files.test.ts tests/architecture/vps-deployment-baseline.test.ts 2>&1 | grep -E 'Test Files|Tests '; echo "rc=${pipestatus[1]}"
echo "== step 3"; grep -nE 'PROVIDER_TARGET_PRICE_REQUIRED|PROVIDER_TARGET_PRICE_ZERO|PROVIDER_DISCOVERY_TARGET_PRICE_INVALID|COST_ENVELOPE_POLICY_UNRESOLVED|COST_ENVELOPE_POLICY_INVALID|SUPPORT_ADMISSION_SCOPES_NOT_SEALED' deploy/vps/README.md | cut -c1-110
echo "== step 4"; grep -n 'input_price_micros_per_million' deploy/vps/README.md | cut -c1-110
echo "== step 5"; sed -n '14,40p' deploy/vps/README.md | grep -n '^- ' | cut -c1-110
echo "== step 6"; grep -n 'max_tokens' deploy/vps/README.md | cut -c1-160; echo "rc=$?"
echo "== step 7"; git diff --stat origin/dev...HEAD -- apps packages; echo "rc=$? lines=$(git diff --stat origin/dev...HEAD -- apps packages | wc -l | tr -d ' ')"
echo "== step 7 capable of printing: origin/dev~200...origin/dev -- apps packages"; git diff --stat origin/dev~200...origin/dev -- apps packages | tail -1
echo "== merge-base"; git merge-base origin/dev HEAD | cut -c1-9; git rev-parse --short origin/dev
echo "== baseline test vs base"; git diff --stat 776359c3 HEAD -- tests/architecture/vps-deployment-baseline.test.ts; echo "lines=$(git diff 776359c3 HEAD -- tests/architecture/vps-deployment-baseline.test.ts | wc -l | tr -d ' ')"
echo "== product range vs base"; git diff --stat 776359c3 HEAD -- . ':!.codex/skills' | tail -3
echo "== FIX range"; git diff --stat 98264a5ea 60993d2db -- . | tail -2
echo "== COST_ENVELOPES_NOT_SEALED lines"; grep -n COST_ENVELOPES_NOT_SEALED deploy/vps/README.md | cut -c1-80
