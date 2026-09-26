#!/bin/zsh
# REV-PES-S02-p1-security-data-safety — PLAN §4 V5 static gates (a)-(h) verbatim, plus the F10 extension this seat proposes.
# Usage: zsh rev-sd-v5.sh <worktree dialectical-engine dir>
set -u
export PATH="/opt/homebrew/bin:$PATH"
cd "${1:?worktree}" || exit 2
echo "HEAD $(git rev-parse --short HEAD)"
echo "(a)"; git grep -n 'pes-s02-fake-vendor-token'
echo "(b)"; git grep -n -E 'NODE_TLS_REJECT_UNAUTHORIZED|NODE_EXTRA_CA_CERTS|rejectUnauthorized: *false' -- 'acceptance/pes-s02-*'
echo "(c)"; git grep -n 'http://' -- 'acceptance/pes-s02-*'
echo "(d)"; git grep -n -E 'createServer|\.listen\(' -- 'acceptance/pes-s02-*.ts' ':!*.test.ts'
echo "(e)"; git grep -n -E 'from "pg"|createPool|startTestDatabase|55432' -- 'acceptance/pes-s02-*'
echo "(f)"; git diff --stat 776359c3 -- packages/register/src/runtime-environment.ts packages/register/src/configured-provider-set.ts packages/providers/src/index.ts packages/providers/src/provider-probe.ts packages/crypto/src/index.ts apps/api/src/main.ts apps/api/src/provider-discovery.ts
echo "(f-control: pathspec can print)"; git ls-files -- packages/register/src/runtime-environment.ts packages/register/src/configured-provider-set.ts packages/providers/src/index.ts packages/providers/src/provider-probe.ts packages/crypto/src/index.ts apps/api/src/main.ts apps/api/src/provider-discovery.ts | wc -l
echo "(g)"; git diff --name-only 776359c3...HEAD | wc -l; git diff --name-only 776359c3...HEAD
echo "(h)"; grep -c 'declares DEBATEAI_DEPLOYMENT_MODE=local' tests/unit/v9-deployment-mode.test.ts
echo "(e-proposed: F10 + exclusion datum)"; git grep -n -E 'embedded-postgres|standing-db|testDatabase|from "pg"|createPool|startTestDatabase|postgres(ql)?://' -- 'acceptance/pes-s02-*'; echo "rc=$?"
echo "(e-proposed 55432 outside the excluded-port set)"; git grep -n '55432' -- 'acceptance/pes-s02-*' | grep -v 'FAKE_VENDOR_EXCLUDED_PORTS\|^acceptance/pes-s02-fake-vendor.ts:12:'; echo "rc=$?"
