#!/bin/zsh
set -u

if (( $# < 3 )); then
  print -u2 -- "usage: $0 LOG STATUS COMMAND [ARG ...]"
  exit 64
fi

evidence_log=$1
evidence_status=$2
shift 2
governed_paths=(
  apps/api/src/index.ts
  apps/api/src/main.ts
  apps/api/src/registration.ts
  packages/crypto/src/index.ts
  packages/crypto/src/argon2-worker.ts
  packages/crypto/src/argon2-worker-pool.ts
  packages/db/src/identity.ts
  packages/register/src/auth-policy.ts
  tests/integration/registration-database.test.ts
  tests/unit/registration.test.ts
  tests/unit/argon2-worker-pool.test.ts
  tests/architecture/t1-argon2-worker-contract.test.ts
)

set -o pipefail
(
  print -- "start_utc=$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  print -- "cwd=$PWD"
  print -- "command=${(q)@}"
  print -- "head_before=$(git rev-parse HEAD)"
  print -- "staged_path_count_before=$(git diff --cached --name-only | wc -l | tr -d ' ')"
  print -- "governed_hashes_before"
  shasum -a 256 $governed_paths
  "$@"
  raw_status=$?
  print -- "raw_status=$raw_status"
  print -- "end_utc=$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  print -- "head_after=$(git rev-parse HEAD)"
  print -- "staged_path_count_after=$(git diff --cached --name-only | wc -l | tr -d ' ')"
  print -- "governed_hashes_after"
  shasum -a 256 $governed_paths
  exit $raw_status
) 2>&1 | tee "$evidence_log"
raw_status=${pipestatus[1]}
print -- "$raw_status" > "$evidence_status"
exit $raw_status
