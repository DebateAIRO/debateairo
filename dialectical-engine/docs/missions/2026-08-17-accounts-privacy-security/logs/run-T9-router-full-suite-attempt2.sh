#!/bin/zsh
# Router-owned exclusive visible T9 full-suite attempt 2 after harness rework.
set -u

MISSION="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
REL="docs/missions/2026-08-17-accounts-privacy-security"
SCRIPT="${MISSION}/${REL}/logs/run-T9-router-full-suite-attempt2.sh"
LOG="${MISSION}/${REL}/logs/T9-router-full-suite-attempt2.log"
STATUS_FILE="${MISSION}/${REL}/logs/T9-router-full-suite-attempt2.status"
HASH_BEFORE="${MISSION}/${REL}/logs/T9-router-full-suite-attempt2.before.sha256"
HASH_AFTER="${MISSION}/${REL}/logs/T9-router-full-suite-attempt2.after.sha256"
EXPECTED_HEAD="dc9fd57f6adc10f24907f64f795951cbc2cee28a"
EXPECTED_IDENTITY="1454c7445a127cdf7b2258df1ee7d6875c445cd4a1bbfbc842abfa8d48322c70"
EXPECTED_TEST="c0a177397dd95e82b99c633d252d3a7a0e1e7ef0b9f42444682f1a79ede4359f"
PATHS=(
  packages/db/src/identity.ts
  tests/integration/registration-database.test.ts
)

if [[ "${1:-}" == "--run" ]]; then
  cd "${MISSION}" || exit 1
  : > "${LOG}"
  : > "${STATUS_FILE}"
  print "T9_ROUTER_FULL_SUITE_ATTEMPT2_START=$(date -u +%FT%TZ)" | tee -a "${LOG}"
  print "HEAD=$(git rev-parse HEAD)" | tee -a "${LOG}"
  print "INDEX_ENTRIES=$(git diff --cached --name-only | wc -l | tr -d ' ')" | tee -a "${LOG}"
  shasum -a 256 "${PATHS[@]}" | tee "${HASH_BEFORE}" | tee -a "${LOG}"

  IDENTITY_HASH=$(shasum -a 256 packages/db/src/identity.ts | awk '{print $1}')
  TEST_HASH=$(shasum -a 256 tests/integration/registration-database.test.ts | awk '{print $1}')
  if [[ "$(git rev-parse HEAD)" != "${EXPECTED_HEAD}" ]] \
    || ! git diff --cached --quiet \
    || [[ "${IDENTITY_HASH}" != "${EXPECTED_IDENTITY}" ]] \
    || [[ "${TEST_HASH}" != "${EXPECTED_TEST}" ]]; then
    print "T9_ROUTER_FULL_SUITE_ATTEMPT2_PRECHECK_FAILED=1" | tee -a "${LOG}"
    print -r -- "97" > "${STATUS_FILE}"
    exit 97
  fi

  pnpm test 2>&1 | tee -a "${LOG}"
  SUITE_STATUS=${pipestatus[1]}
  shasum -a 256 "${PATHS[@]}" | tee "${HASH_AFTER}" | tee -a "${LOG}"
  print "T9_ROUTER_FULL_SUITE_ATTEMPT2_EXIT=${SUITE_STATUS}" | tee -a "${LOG}"
  print "T9_ROUTER_FULL_SUITE_ATTEMPT2_END=$(date -u +%FT%TZ)" | tee -a "${LOG}"
  print -r -- "${SUITE_STATUS}" > "${STATUS_FILE}"
  exit "${SUITE_STATUS}"
fi

osascript <<APPLESCRIPT >/dev/null
tell application "Terminal"
  do script "printf '\\\\033]0;T9 ROUTER EXCLUSIVE FULL SUITE ATTEMPT 2\\\\007'; '${SCRIPT}' --run"
  activate
end tell
APPLESCRIPT

print "launched exclusive T9 Router full suite attempt 2 in a visible Terminal"
print "log: ${LOG}"
print "status: ${STATUS_FILE}"
