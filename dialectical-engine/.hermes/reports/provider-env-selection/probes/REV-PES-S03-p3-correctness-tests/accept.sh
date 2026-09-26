#!/bin/zsh
# REV-PES-S03-p3-correctness-tests — SPEC-v3 §5 steps 2–7 at the head, and the same greps over the a6d6382ba README (the pass-3 base).
W="${1:-${WORKTREE:?}}"; export PATH="/opt/homebrew/bin:$PATH"; cd "$W" || exit 2
HERE="${0:A:h}"; BASE=a6d6382ba
SIX='PROVIDER_TARGET_PRICE_REQUIRED|PROVIDER_TARGET_PRICE_ZERO|PROVIDER_DISCOVERY_TARGET_PRICE_INVALID|COST_ENVELOPE_POLICY_UNRESOLVED|COST_ENVELOPE_POLICY_INVALID|SUPPORT_ADMISSION_SCOPES_NOT_SEALED'
echo "HEAD $(git rev-parse --short HEAD) dirty $(git status --porcelain | wc -l | tr -d ' ')"
echo "## headings: §11 / refusal / credential-file / publisher"; grep -n '^## 11\.\|^### What the hosted mode refuses\|^### The credential-file contract\|^### Publishing the settings register' deploy/vps/README.md
echo "## STEP 2"; pnpm vitest run tests/unit/v9-provider-credential-files.test.ts tests/architecture/vps-deployment-baseline.test.ts 2>&1 | grep -E '✓|×|FAIL|Test Files|Tests ' | grep -vE '^\s+✓ .* [0-9]+ms$' | tail -8
echo "## STEP 3 head"; /usr/bin/grep -nE "$SIX" deploy/vps/README.md | cut -c1-90
echo "## STEP 3 base $BASE"; git show $BASE:dialectical-engine/deploy/vps/README.md | /usr/bin/grep -nE "$SIX" | cut -c1-90
echo "## STEP 4 head"; /usr/bin/grep -n 'input_price_micros_per_million' deploy/vps/README.md | cut -c1-90
echo "## STEP 4 base"; git show $BASE:dialectical-engine/deploy/vps/README.md | /usr/bin/grep -n 'input_price_micros_per_million' | cut -c1-90
echo "## STEP 5 head (sed 14,40p)"; sed -n '14,40p' deploy/vps/README.md
echo "## STEP 5 known-stale anywhere head / base"; grep -c 'Known-stale' deploy/vps/README.md; git show $BASE:dialectical-engine/deploy/vps/README.md | grep -c 'Known-stale'
echo "## STEP 6 head"; /usr/bin/grep -n 'max_tokens' deploy/vps/README.md | cut -c1-160
echo "## STEP 6 base"; git show $BASE:dialectical-engine/deploy/vps/README.md | /usr/bin/grep -n 'max_tokens'; echo "rc=$?"
echo "## STEP 7 (SPEC spelling origin/dev...HEAD, and $BASE...HEAD)"; echo "origin/dev = $(git rev-parse --short origin/dev)"
git diff --stat origin/dev...HEAD -- apps packages; echo "rc=$? (empty = pass)"
git diff --stat $BASE...HEAD -- apps packages; echo "rc=$? (empty = pass)"
echo "-- capability: same pathspec over 776359c3...$BASE"; git diff --stat 776359c3...$BASE -- apps packages | tail -2
echo "## baseline suite byte-identical to base"; git diff --quiet $BASE HEAD -- tests/architecture/vps-deployment-baseline.test.ts; echo "rc=$? (0 = identical)"; git diff --stat $BASE HEAD -- tests/architecture tests/unit/v30-support-provider.test.ts; echo "## whole-slice files"; git diff --stat $BASE HEAD
echo "END dirty $(git status --porcelain | wc -l | tr -d ' ')"
