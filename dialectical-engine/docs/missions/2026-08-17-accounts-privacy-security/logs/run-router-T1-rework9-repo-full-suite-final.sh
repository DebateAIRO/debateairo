#!/bin/zsh
set -u
setopt pipefail

ROOT="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
P="$ROOT/docs/missions/2026-08-17-accounts-privacy-security/logs"
LOG="$P/T1-rework9-router-repo-full-suite-final.log"
STATUS="$P/T1-rework9-router-repo-full-suite-final.status"
LOCK="$P/.T1-rework9-repo-full-suite-final.lock"
ARCHIVE="$P/T1-rework9-router-repo-full-suite-final.lock-archive"
NODE="/Users/vladmihaimiron/.hermes/node/bin/node"
VITEST="$ROOT/node_modules/.pnpm/vitest@4.1.10_@types+node@26.2.0_jsdom@30.0.1_vite@8.2.1_@types+node@26.2.0_esbuild@0.28.1_tsx@4.23.11_yaml@2.9.0_/node_modules/vitest/vitest.mjs"
OBS_TEST="tests/integration/obs-l1-s01-foundation.test.ts"

cd "$ROOT" || exit 74
if test -e "$LOCK" || test -e "$ARCHIVE" || test -e "$LOG" || test -e "$STATUS"; then
  print -r -- "FINAL_FULL_SUITE_PREFLIGHT_COLLISION" >&2
  exit 74
fi
mkdir "$LOCK" || exit 74

archive_lock() {
  if test -d "$LOCK" && ! test -e "$ARCHIVE"; then
    mv "$LOCK" "$ARCHIVE"
  fi
}
trap archive_lock EXIT INT TERM HUP

unset S3D_SUCCESSOR_CREATE_ONLY_DELAY_MS
unset S3D_SUCCESSOR_SUSTAINED_LOAD
unset T1_ARGON2_WORKER_COUNT
unset T1_ARGON2_POOL_MAX_QUEUED

{
  print -r -- "suite=T1-rework9-repository-wide-vitest-final"
  print -r -- "start_utc=$(date -u +%FT%TZ)"
  print -r -- "cwd=$ROOT"
  print -r -- "argv=$NODE $VITEST run"
  print -r -- "head_before=$(git rev-parse HEAD)"
  print -r -- "origin_dev=$(git rev-parse origin/dev)"
  print -r -- "head_vs_origin_dev=$(git rev-list --left-right --count HEAD...origin/dev | tr '\t' '/')"
  print -r -- "staged_before=$(git diff --cached --name-only | wc -l | tr -d ' ')"
  print -r -- "obs_test_sha256_before=$(shasum -a 256 "$OBS_TEST" | cut -d ' ' -f 1)"
  print -r -- "governed_before"
  shasum -a 256 \
    apps/api/src/index.ts \
    apps/api/src/main.ts \
    apps/api/src/registration.ts \
    packages/crypto/src/index.ts \
    packages/crypto/src/argon2-worker.ts \
    packages/crypto/src/argon2-worker-pool.ts \
    packages/db/src/identity.ts \
    packages/register/src/auth-policy.ts \
    tests/integration/registration-database.test.ts \
    tests/unit/registration.test.ts \
    tests/unit/argon2-worker-pool.test.ts \
    tests/architecture/t1-argon2-worker-contract.test.ts
} > "$LOG"

"$NODE" "$VITEST" run 2>&1 | tee -a "$LOG"
rc=$?

{
  print -r -- "end_utc=$(date -u +%FT%TZ)"
  print -r -- "head_after=$(git rev-parse HEAD)"
  print -r -- "staged_after=$(git diff --cached --name-only | wc -l | tr -d ' ')"
  print -r -- "obs_test_sha256_after=$(shasum -a 256 "$OBS_TEST" | cut -d ' ' -f 1)"
  print -r -- "governed_after"
  shasum -a 256 \
    apps/api/src/index.ts \
    apps/api/src/main.ts \
    apps/api/src/registration.ts \
    packages/crypto/src/index.ts \
    packages/crypto/src/argon2-worker.ts \
    packages/crypto/src/argon2-worker-pool.ts \
    packages/db/src/identity.ts \
    packages/register/src/auth-policy.ts \
    tests/integration/registration-database.test.ts \
    tests/unit/registration.test.ts \
    tests/unit/argon2-worker-pool.test.ts \
    tests/architecture/t1-argon2-worker-contract.test.ts
  print -r -- "raw_status=$rc"
} >> "$LOG"
print -r -- "$rc" > "$STATUS"
exit "$rc"
