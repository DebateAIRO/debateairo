#!/bin/zsh
# Visible two-phase T1 recalibration: Claude preflight -> five fresh-process filters -> readback.
set -u

REPO="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
REL="docs/missions/2026-08-17-accounts-privacy-security/logs"
PACKET="${REL}/T1-claude-recalibration1-packet.md"
PREFIX="${REPO}/${REL}/T1-recalibration1"
MODEL="claude-opus-5"

cd "${REPO}" || exit 1

initial_goal="/goal T1 RECALIBRATION1 PHASE A ONLY. Read ${PACKET} and every FINAL2 receipt it names. Perform its read-only frozen-custody preflight, write the PRE receipt, and return exactly PREFLIGHT READY: T1 RECALIBRATION1. Do not run any test or background job."
claude -p "${initial_goal}" --model "${MODEL}" --permission-mode acceptEdits \
  --allowedTools 'Bash,Read,Write,Edit,Glob,Grep' --output-format json \
  2>&1 | tee "${PREFIX}-claude-preflight-result.json"
initial_rc=${pipestatus[1]}

python3 -c "import json; d=json.load(open('${PREFIX}-claude-preflight-result.json')); print(d.get('session_id',''))" \
  > "${PREFIX}-claude-session.txt" 2>/dev/null
session_id="$(tr -d '\r\n' < "${PREFIX}-claude-session.txt")"

if [[ ${initial_rc} -ne 0 || -z "${session_id}" ]] \
  || ! grep -q 'PREFLIGHT READY: T1 RECALIBRATION1' "${PREFIX}-claude-preflight-result.json" \
  || [[ ! -f "${PREFIX}-custody-pre.txt" ]]; then
  print "RECALIBRATION1 REFUSED: Claude preflight did not produce the exact ready marker/session/PRE receipt"
  exit 1
fi

titles=(
  'S3d rework3 B1/B3 probes deep-queue slack and the following audit window'
  'S3d rework2 B4 measures healthy-MTA burst cost and the frozen S3b margin'
  'keeps new-vs-existing timing within the ruled tolerance for slow 0/400/1000ms transports'
  'S3b keeps live-mail N=1/N=4/N=8 PostgreSQL arms below the separation ceiling'
  'S3 rework4 B4 derives stable domain-separated IP and UA Argon2id hashes without request-id hashes'
)
labels=(deep_queue capacity slow_transport live_mail audit_kdf)

for index in {1..5}; do
  label="${labels[$index]}"
  title="${titles[$index]}"
  host_file="${PREFIX}-${label}-host.txt"
  log_file="${PREFIX}-${label}.log"
  status_file="${PREFIX}-${label}.status"
  {
    print "=== label: ${label} ==="
    print "=== title: ${title} ==="
    print "=== utc: $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
    print "=== uptime ==="
    uptime
    print "=== vm_stat ==="
    vm_stat
    print "=== memory_pressure ==="
    memory_pressure -Q
    print "=== top ==="
    top -l 1 -n 12 -o cpu -stats pid,command,cpu,mem,time
  } > "${host_file}" 2>&1
  {
    print "=== command: node_modules/.bin/vitest run tests/integration/registration-database.test.ts -t ${title} ==="
    print "=== start_utc: $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
  } > "${log_file}"
  node_modules/.bin/vitest run tests/integration/registration-database.test.ts -t "${title}" \
    >> "${log_file}" 2>&1
  gate_rc=$?
  {
    print "=== end_utc: $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
    print "=== raw_exit_status: ${gate_rc} ==="
  } >> "${log_file}"
  print "${gate_rc}" > "${status_file}"
done

{
  print "=== T1 RECALIBRATION1 POST-SHELL ==="
  print "utc: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  print "--- HEAD ---"
  git rev-parse HEAD
  print "--- INDEX ---"
  git diff --cached --name-only
  print "--- STATUS ---"
  git status --short
  print "--- MANIFEST ---"
  shasum -a 256 \
    apps/api/src/index.ts apps/api/src/main.ts apps/api/src/registration.ts \
    packages/crypto/src/index.ts packages/crypto/src/argon2-worker.ts \
    packages/crypto/src/argon2-worker-pool.ts packages/db/src/identity.ts \
    packages/register/src/auth-policy.ts tests/integration/registration-database.test.ts \
    tests/unit/registration.test.ts tests/unit/argon2-worker-pool.test.ts \
    tests/architecture/t1-argon2-worker-contract.test.ts
  print "--- STAT ---"
  stat -f '%z %m %N' \
    apps/api/src/index.ts apps/api/src/main.ts apps/api/src/registration.ts \
    packages/crypto/src/index.ts packages/crypto/src/argon2-worker.ts \
    packages/crypto/src/argon2-worker-pool.ts packages/db/src/identity.ts \
    packages/register/src/auth-policy.ts tests/integration/registration-database.test.ts \
    tests/unit/registration.test.ts tests/unit/argon2-worker-pool.test.ts \
    tests/architecture/t1-argon2-worker-contract.test.ts
} > "${PREFIX}-custody-post-shell.txt"

resume_goal="/goal T1 RECALIBRATION1 PHASE B. Re-read ${PACKET}, then read every ${REL}/T1-recalibration1-* receipt. Do not run or rerun any command. Perform the packet's read-only comparison and attribution, write the durable progress log, and return RECALIBRATION1 FRESH CONDITION GREEN or RECALIBRATION1 FRESH CONDITION RED."
claude --resume "${session_id}" -p "${resume_goal}" --model "${MODEL}" \
  --permission-mode acceptEdits --allowedTools 'Bash,Read,Write,Edit,Glob,Grep' \
  --output-format json 2>&1 | tee "${PREFIX}-claude-final-result.json"
final_rc=${pipestatus[1]}
print "RECALIBRATION1 wrapper exit: preflight=${initial_rc} final_claude=${final_rc}"
exit ${final_rc}
