#!/bin/zsh
# PLAN §4 V5 static checks (a)-(h) + capability controls. Usage: WORKTREE=<lane dialectical-engine dir> zsh run-v5.sh
export PATH="/opt/homebrew/bin:$PATH"; cd "${WORKTREE:?}" || exit 2
echo "HEAD $(git rev-parse --short HEAD)"
echo "(a)"; git grep -n 'pes-s02-fake-vendor-token'; echo "  lines=$(git grep -n 'pes-s02-fake-vendor-token' | wc -l | tr -d ' ')"
echo "(b)"; git grep -n -E 'NODE_TLS_REJECT_UNAUTHORIZED|NODE_EXTRA_CA_CERTS|rejectUnauthorized: *false' -- 'acceptance/pes-s02-*'; echo "  rc=$?"
echo "(b-control: pattern can print)"; git grep -n -E 'rejectUnauthorized' -- 'acceptance/pes-s02-*' | head -3
echo "(c)"; git grep -n 'http://' -- 'acceptance/pes-s02-*'; echo "  rc=$?"
echo "(c-control)"; git grep -n 'https://' -- 'acceptance/pes-s02-*' | wc -l
echo "(d)"; git grep -n -E 'createServer|\.listen\(' -- 'acceptance/pes-s02-*.ts' ':!*.test.ts'
echo "(e)"; git grep -n -E 'from "pg"|createPool|startTestDatabase|55432' -- 'acceptance/pes-s02-*'; echo "  rc=$?"
echo "(e-F10 extension)"; git grep -n -E 'embedded-postgres|standing-db|@debateai/db"|testDatabase' -- 'acceptance/pes-s02-*'; echo "  rc=$?"
echo "(f)"; git diff --stat 776359c3 -- packages/register/src/runtime-environment.ts packages/register/src/configured-provider-set.ts packages/providers/src/index.ts packages/providers/src/provider-probe.ts packages/crypto/src/index.ts apps/api/src/main.ts apps/api/src/provider-discovery.ts; echo "  (f) end"
echo "(f-control: pathspec can print)"; git diff --stat 4b825dc642cb6eb9a060e54bf8d69288fbee4904 HEAD -- packages/register/src/runtime-environment.ts packages/register/src/configured-provider-set.ts packages/providers/src/index.ts packages/providers/src/provider-probe.ts packages/crypto/src/index.ts apps/api/src/main.ts apps/api/src/provider-discovery.ts | tail -1
echo "(f+ other §5 forbidden)"; git diff --stat 776359c3 -- deploy/vps pnpm-lock.yaml tests/integration/support-config-principals.test.ts; echo "  end"
echo "(f+ control)"; git diff --stat 4b825dc642cb6eb9a060e54bf8d69288fbee4904 HEAD -- deploy/vps pnpm-lock.yaml tests/integration/support-config-principals.test.ts | tail -1
echo "(g)"; git diff --name-only 776359c3...HEAD; echo "  count=$(git diff --name-only 776359c3...HEAD | wc -l | tr -d ' ')"
echo "(h)"; grep -c 'declares DEBATEAI_DEPLOYMENT_MODE=local' tests/unit/v9-deployment-mode.test.ts
for L in 248 255 264 273; do sed -n "${L}p" tests/unit/v9-deployment-mode.test.ts; done
