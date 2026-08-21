#!/bin/zsh
# Router-authorized visible foreground gate for the S3d Claude custody seat.
# This avoids Claude Code's 600-second Bash ceiling while preserving a durable
# full-suite transcript and exact exit status for same-session readback.
set -u

MISSION="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
REL="docs/missions/2026-08-17-accounts-privacy-security"
SCRIPT="${MISSION}/${REL}/logs/run-S3d-final-full-suite-gate.sh"
LOG="${MISSION}/${REL}/logs/S3d-final-full-suite-gate.log"
STATUS_FILE="${MISSION}/${REL}/logs/S3d-final-full-suite-gate.status"
HASH_BEFORE="${MISSION}/${REL}/logs/S3d-final-full-suite-gate.before.sha256"
HASH_AFTER="${MISSION}/${REL}/logs/S3d-final-full-suite-gate.after.sha256"
PATHS=(
  apps/api/src/registration.ts
  packages/register/src/auth-policy.ts
  tests/integration/registration-database.test.ts
  tests/unit/registration.test.ts
  apps/api/src/mail-channel.ts
  packages/db/src/identity.ts
  migrations/0033_verification_token_credentials.sql
  tests/integration/identity-database.test.ts
)

if [[ "${1:-}" == "--run" ]]; then
  cd "${MISSION}" || exit 1
  : > "${LOG}"
  rm -f "${STATUS_FILE}" "${HASH_BEFORE}" "${HASH_AFTER}"
  print "S3D_FINAL_FULL_SUITE_START=$(date -u +%FT%TZ)" | tee -a "${LOG}"
  shasum -a 256 "${PATHS[@]}" | tee "${HASH_BEFORE}" | tee -a "${LOG}"
  pnpm test 2>&1 | tee -a "${LOG}"
  SUITE_STATUS=${pipestatus[1]}
  shasum -a 256 "${PATHS[@]}" | tee "${HASH_AFTER}" | tee -a "${LOG}"
  print "S3D_FINAL_FULL_SUITE_EXIT=${SUITE_STATUS}" | tee -a "${LOG}"
  print "S3D_FINAL_FULL_SUITE_END=$(date -u +%FT%TZ)" | tee -a "${LOG}"
  print -r -- "${SUITE_STATUS}" > "${STATUS_FILE}"
  exit "${SUITE_STATUS}"
fi

osascript <<APPLESCRIPT >/dev/null
tell application "Terminal"
  do script "printf '\\\\033]0;S3d FINAL FULL SUITE GATE\\\\007'; '${SCRIPT}' --run"
  activate
end tell
APPLESCRIPT

print "launched S3d full-suite gate in a visible Terminal"
print "log: ${LOG}"
print "status: ${STATUS_FILE}"
