#!/bin/zsh

set -u
unsetopt BG_NICE 2>/dev/null || true

ROOT="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
LOG_DIR="$ROOT/docs/missions/2026-08-17-accounts-privacy-security/logs"
LOG="$LOG_DIR/T1-rework7-router-full-registration.log"
STATUS="$LOG_DIR/T1-rework7-router-full-registration.status"
PID_FILE="$LOG_DIR/T1-rework7-router-full-registration.pid"
EXPECTED_HEAD="7918f4f8bff33909792afc01dc38d402972b4ccd"

typeset -a EXPECTED_MANIFEST
EXPECTED_MANIFEST=(
  "0172fc7e1dd44de560d467743f3e5ab7f6406bf52a5bbb302dd68685d64d679a  apps/api/src/index.ts"
  "91bf0e695ef847b0864bedd030c2ed94f4431d3864fa5e5a7e540aeec011342b  apps/api/src/main.ts"
  "5069ab7acf78c9fec7179b36695ff54a2b9f9b478417ce0598b31bb08365309e  apps/api/src/registration.ts"
  "66b20d2170a35667e75e4ba15e8adc016d44d252958527e2877b99bf9f6871e6  packages/crypto/src/index.ts"
  "c610b06ee13a87ec8d9a47c88b552edb5398b30cd9b49509d547eda36fdcb11b  packages/crypto/src/argon2-worker.ts"
  "b990c3f866f9697b158e4040ffd9bb832341e31853a40d30e70deb57394c526d  packages/crypto/src/argon2-worker-pool.ts"
  "2d92223b58c6f1af7c6b9bc544df5f2518e8e20404bf982fbabb0a50bc90e17f  packages/db/src/identity.ts"
  "f8e406f1cd35393aa20eac5ef5679ed31dd8f9213ee2c727a5aacd9d706a4216  packages/register/src/auth-policy.ts"
  "956554377863df933955b0bf1b7cb9d5975cc371094fb86dad98b98cc05c45a9  tests/integration/registration-database.test.ts"
  "cf05986d0d78c68315cca2775efcb66b4076b026ad777f59a15acbd30362cb2f  tests/unit/registration.test.ts"
  "93f1a3357ffe5b45fac047f77c16c9ae80322123a3eff97c30a7d7e7d2afb55b  tests/unit/argon2-worker-pool.test.ts"
  "4896587d1fafc0d52c2389c3bd6336a05798ea1a89cadaa42280b6a0039fb18d  tests/architecture/t1-argon2-worker-contract.test.ts"
)

sha_of() {
  /usr/bin/shasum -a 256 "$1" | /usr/bin/cut -d ' ' -f 1
}

manifest_check() {
  local phase="$1"
  local entry expected file actual
  echo "manifest_phase=$phase"
  for entry in "${EXPECTED_MANIFEST[@]}"; do
    expected="${entry%%  *}"
    file="${entry#*  }"
    if [[ ! -f "$file" ]]; then
      echo "MANIFEST_MISSING phase=$phase path=$file"
      return 1
    fi
    actual="$(sha_of "$file")"
    echo "$actual  $file"
    if [[ "$actual" != "$expected" ]]; then
      echo "MANIFEST_DRIFT phase=$phase path=$file expected=$expected actual=$actual"
      return 1
    fi
  done
}

finish_with_status() {
  local rc="$1"
  echo "end_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)" | tee -a "$LOG"
  echo "raw_status=$rc" | tee -a "$LOG"
  printf '%s\n' "$rc" > "$STATUS"
  exit "$rc"
}

signal_exit() {
  local signal_name="$1"
  local signal_number="$2"
  trap - INT TERM HUP EXIT
  echo "signal_received=$signal_name" | tee -a "$LOG"
  if [[ -n "${TEST_PGID:-}" ]]; then
    kill -TERM -- "-$TEST_PGID" 2>/dev/null || true
  elif [[ -n "${TEST_PID:-}" ]]; then
    kill -TERM "$TEST_PID" 2>/dev/null || true
  fi
  wait "${TEST_PID:-0}" 2>/dev/null || true
  cd "$ROOT" || exit 74
  manifest_check "signal-post" 2>&1 | tee -a "$LOG" || true
  finish_with_status "$((128 + signal_number))"
}

if [[ "${1:-}" != "--run" ]]; then
  echo "Launch with --run."
  exit 64
fi

cd "$ROOT" || exit 74

if [[ -e "$LOG" || -e "$STATUS" || -e "$PID_FILE" ]]; then
  echo "Refusing to rerun: a Router full-registration receipt already exists."
  exit 75
fi

printf '\e]0;T1 Rework7 — full registration gate\a'
printf '%s\n' "$$" > "$PID_FILE"
{
  echo "=== T1 Rework7 Router exact full registration-file gate ==="
  echo "start_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "wrapper_pid=$$"
  echo "command=node_modules/.bin/vitest run tests/integration/registration-database.test.ts"
  echo "required_head=$EXPECTED_HEAD"
} | tee "$LOG"

if [[ "$(git rev-parse HEAD)" != "$EXPECTED_HEAD" ]]; then
  echo "PREFLIGHT_HEAD_MISMATCH actual=$(git rev-parse HEAD)" | tee -a "$LOG"
  finish_with_status 74
fi
if [[ -n "$(git diff --cached --name-only)" ]]; then
  echo "PREFLIGHT_INDEX_NOT_EMPTY" | tee -a "$LOG"
  git diff --cached --name-only | tee -a "$LOG"
  finish_with_status 74
fi
if ! manifest_check "pre" 2>&1 | tee -a "$LOG"; then
  finish_with_status 74
fi

trap 'signal_exit INT 2' INT
trap 'signal_exit TERM 15' TERM
trap 'signal_exit HUP 1' HUP

setopt MONITOR
node_modules/.bin/vitest run tests/integration/registration-database.test.ts \
  > >(tee -a "$LOG") 2>&1 &
TEST_PID=$!
TEST_PGID="$(ps -o pgid= -p "$TEST_PID" | tr -d ' ')"
echo "test_pid=$TEST_PID test_pgid=$TEST_PGID wrapper_pgid=$(ps -o pgid= -p $$ | tr -d ' ')" | tee -a "$LOG"
if [[ -z "$TEST_PGID" || "$TEST_PGID" != "$TEST_PID" ]]; then
  echo "PREFLIGHT_TEST_PROCESS_GROUP_INVALID" | tee -a "$LOG"
  kill -TERM "$TEST_PID" 2>/dev/null || true
  wait "$TEST_PID" 2>/dev/null || true
  finish_with_status 74
fi

wait "$TEST_PID"
TEST_STATUS=$?
trap - INT TERM HUP

if ! manifest_check "post" 2>&1 | tee -a "$LOG"; then
  finish_with_status 74
fi
if [[ "$(git rev-parse HEAD)" != "$EXPECTED_HEAD" || -n "$(git diff --cached --name-only)" ]]; then
  echo "POSTFLIGHT_CUSTODY_MISMATCH" | tee -a "$LOG"
  finish_with_status 74
fi

finish_with_status "$TEST_STATUS"
