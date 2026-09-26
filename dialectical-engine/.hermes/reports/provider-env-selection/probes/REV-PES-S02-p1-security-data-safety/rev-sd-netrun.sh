#!/bin/zsh
# REV-PES-S02-p1-security-data-safety — run the slice's eleven cluster suites with rev-sd-netlog.mjs preloaded; summarise ports.
# Usage: zsh rev-sd-netrun.sh <worktree dialectical-engine dir> <label>
set -u
export PATH="/opt/homebrew/bin:$PATH"
WT="${1:?worktree}"; L="${2:?label}"; P="$(cd "$(dirname "$0")" && pwd)"
cd "$WT" || exit 2
NL="$P/scratch/net-$L.log"; : > "$NL"
env -u FORCE_COLOR -u NO_COLOR NODE_OPTIONS="--import=$P/rev-sd-netlog.mjs" REV_NET_LOG="$NL" pnpm exec vitest run \
  tests/unit/v9-deployment-mode.test.ts tests/integration/dev-api-environment.test.ts tests/integration/dev-api-process.test.ts \
  tests/unit/dev-runner-process.test.ts tests/unit/dev-api-environment-cli.test.ts tests/architecture/dev-custody-root.test.ts \
  tests/architecture/dev-real-provider-only.test.ts tests/architecture/register-support-publication.test.ts \
  acceptance/pes-s02-fake-vendor.test.ts acceptance/pes-s02-hosted.test.ts > "$P/scratch/net-$L-vitest.log" 2>&1
echo "vitest rc=$?"; grep -E '^ +(Test Files|Tests) ' "$P/scratch/net-$L-vitest.log"
echo "preloads: $(grep -c '^PRELOAD' "$NL") (distinct pid/tid)"
echo "connect targets:"; grep '^CONNECT' "$NL" | awk '{print $4}' | sort | uniq -c
echo "listen targets:"; grep '^LISTEN' "$NL" | cut -d' ' -f4- | sort | uniq -c
echo "55432 mentions: $(grep -c 55432 "$NL")"
echo "dirty $(git status --porcelain | wc -l | tr -d ' ')"
