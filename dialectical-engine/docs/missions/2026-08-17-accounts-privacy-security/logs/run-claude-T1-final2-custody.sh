#!/bin/zsh
# Visible two-phase T1 custody: Claude preflight -> foreground gates -> same Claude readback.
set -u

REPO="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
REL="docs/missions/2026-08-17-accounts-privacy-security/logs"
PACKET="${REL}/T1-claude-final2-custody-packet.md"
PREFIX="${REPO}/${REL}/T1-final2"
MODEL="claude-opus-5"

cd "${REPO}" || exit 1

initial_goal="/goal T1 FINAL2 PHASE A ONLY. Read ${PACKET} completely, perform its read-only preflight, write the PRE receipt, and return exactly PREFLIGHT READY: FINAL2. Do not run any gate or background job."
claude -p "${initial_goal}" --model "${MODEL}" --permission-mode acceptEdits \
  --allowedTools 'Bash,Read,Write,Edit,Glob,Grep' --output-format json \
  2>&1 | tee "${PREFIX}-claude-preflight-result.json"
initial_rc=${pipestatus[1]}

python3 -c "import json; d=json.load(open('${PREFIX}-claude-preflight-result.json')); print(d.get('session_id',''))" \
  > "${PREFIX}-claude-session.txt" 2>/dev/null
session_id="$(tr -d '\r\n' < "${PREFIX}-claude-session.txt")"

if [[ ${initial_rc} -ne 0 || -z "${session_id}" ]] \
  || ! grep -q 'PREFLIGHT READY: FINAL2' "${PREFIX}-claude-preflight-result.json" \
  || [[ ! -f "${PREFIX}-custody-pre.txt" ]]; then
  print "FINAL2 REFUSED: Claude preflight did not produce the exact ready marker/session/PRE receipt"
  exit 1
fi

{
  print "=== command: pnpm test ==="
  print "=== start_utc: $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
} > "${PREFIX}-pnpm-test.log"
pnpm test >> "${PREFIX}-pnpm-test.log" 2>&1
test_rc=$?
{
  print "=== end_utc: $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
  print "=== raw_exit_status: ${test_rc} ==="
} >> "${PREFIX}-pnpm-test.log"
print "${test_rc}" > "${PREFIX}-pnpm-test.status"

if [[ ${test_rc} -eq 0 ]]; then
  for gate in typecheck lint; do
    {
      print "=== command: pnpm ${gate} ==="
      print "=== start_utc: $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
    } > "${PREFIX}-${gate}.log"
    pnpm "${gate}" >> "${PREFIX}-${gate}.log" 2>&1
    gate_rc=$?
    {
      print "=== end_utc: $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
      print "=== raw_exit_status: ${gate_rc} ==="
    } >> "${PREFIX}-${gate}.log"
    print "${gate_rc}" > "${PREFIX}-${gate}.status"
  done

  {
    print "=== command: git diff --check ==="
    print "=== start_utc: $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
  } > "${PREFIX}-diff-check.log"
  git diff --check >> "${PREFIX}-diff-check.log" 2>&1
  diff_rc=$?
  {
    print "=== end_utc: $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
    print "=== raw_exit_status: ${diff_rc} ==="
  } >> "${PREFIX}-diff-check.log"
  print "${diff_rc}" > "${PREFIX}-diff-check.status"
fi

{
  print "=== T1 FINAL2 POST-SHELL ==="
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

resume_goal="/goal T1 FINAL2 PHASE B. Re-read ${PACKET}, then read every ${REL}/T1-final2-* receipt. Do not run or rerun any gate. Perform the packet's read-only post-custody comparison, write the durable progress verdict, and return FINAL CUSTODY PASSED or CODEX BLOCKED (custody)."
claude --resume "${session_id}" -p "${resume_goal}" --model "${MODEL}" \
  --permission-mode acceptEdits --allowedTools 'Bash,Read,Write,Edit,Glob,Grep' \
  --output-format json 2>&1 | tee "${PREFIX}-claude-final-result.json"
final_rc=${pipestatus[1]}
print "FINAL2 wrapper exit: preflight=${initial_rc} test=${test_rc} final_claude=${final_rc}"
exit ${final_rc}
