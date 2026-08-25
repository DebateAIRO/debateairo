#!/bin/zsh
set -u
setopt pipefail
ROOT="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
P="$ROOT/docs/missions/2026-08-17-accounts-privacy-security/logs"
LOG="$P/T1-rework9-router-obs-portability-focused.log"
STATUS="$P/T1-rework9-router-obs-portability-focused.status"
TEST="tests/integration/obs-l1-s01-foundation.test.ts"
cd "$ROOT" || exit 74
{
  print -r -- "gate=T1-rework9-obs-portability-focused"
  print -r -- "start_utc=$(date -u +%FT%TZ)"
  print -r -- "head_before=$(git rev-parse HEAD)"
  print -r -- "staged_before=$(git diff --cached --name-only | wc -l | tr -d ' ')"
  print -r -- "test_sha256_before=$(shasum -a 256 "$TEST" | cut -d ' ' -f 1)"
  print -r -- "argv=/Users/vladmihaimiron/.hermes/node/bin/node /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/node_modules/.pnpm/vitest@4.1.10_@types+node@26.2.0_jsdom@30.0.1_vite@8.2.1_@types+node@26.2.0_esbuild@0.28.1_tsx@4.23.11_yaml@2.9.0_/node_modules/vitest/vitest.mjs run $TEST"
} > "$LOG"
/Users/vladmihaimiron/.hermes/node/bin/node /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/node_modules/.pnpm/vitest@4.1.10_@types+node@26.2.0_jsdom@30.0.1_vite@8.2.1_@types+node@26.2.0_esbuild@0.28.1_tsx@4.23.11_yaml@2.9.0_/node_modules/vitest/vitest.mjs run "$TEST" 2>&1 | tee -a "$LOG"
rc=$?
{
  print -r -- "end_utc=$(date -u +%FT%TZ)"
  print -r -- "head_after=$(git rev-parse HEAD)"
  print -r -- "staged_after=$(git diff --cached --name-only | wc -l | tr -d ' ')"
  print -r -- "test_sha256_after=$(shasum -a 256 "$TEST" | cut -d ' ' -f 1)"
  print -r -- "raw_status=$rc"
} >> "$LOG"
print -r -- "$rc" > "$STATUS"
exit "$rc"
