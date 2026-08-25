#!/bin/zsh

set -u
unsetopt BG_NICE 2>/dev/null || true

MISSION="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
REL="docs/missions/2026-08-17-accounts-privacy-security"
PACKET="${REL}/logs/T1-claude-rework8-packet.md"
PACKET_SHA="346434cba790c56985c72e4d761f698c0d1ceb7b8c823d5005f0a4cba73b11fa"
SESSION="4023662a-acdd-4153-b849-5f02357a2c99"
PREFIX="${MISSION}/${REL}/logs/T1-rework8-${SESSION}"
STREAM_LOG="${PREFIX}-claude.jsonl"
EXIT_LOG="${PREFIX}-launcher.log"
STATUS_FILE="${PREFIX}.status"
PID_FILE="${PREFIX}.pid"
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

fail_preflight() {
  print "REWORK8_PREFLIGHT_BLOCKED: $1" >&2
  printf '%s\n' 74 > "${STATUS_FILE}"
  exit 74
}

if [[ "${1:-}" != "--run" ]]; then
  print "Launch this author wrapper with --run in a visible Terminal." >&2
  exit 64
fi

cd "${MISSION}" || exit 74

if [[ -e "${STREAM_LOG}" || -e "${STATUS_FILE}" || -e "${PID_FILE}" ]]; then
  print "Refusing duplicate Rework8 author launch." >&2
  exit 75
fi

printf '\e]0;Claude Opus — T1 Rework8\a'
printf '%s\n' "$$" > "${PID_FILE}"

[[ "$(git rev-parse HEAD)" == "${EXPECTED_HEAD}" ]] \
  || fail_preflight "HEAD mismatch"
[[ -z "$(git diff --cached --name-only)" ]] \
  || fail_preflight "index not empty"
[[ "$(sha_of "${PACKET}")" == "${PACKET_SHA}" ]] \
  || fail_preflight "packet hash mismatch"

for entry in "${EXPECTED_MANIFEST[@]}"; do
  expected="${entry%%  *}"
  governed_path="${entry#*  }"
  [[ -f "${governed_path}" ]] || fail_preflight "missing ${governed_path}"
  [[ "$(sha_of "${governed_path}")" == "${expected}" ]] \
    || fail_preflight "governed drift ${governed_path}"
done

GOAL="/goal Act as the sole fresh visible Claude Opus 5 author for T1 Rework8. Read ${PACKET} completely and verify sha256 ${PACKET_SHA}. Two fresh GPT-5.6 Sol xHigh reviewers returned CHANGES REQUESTED on frozen Rework7 bytes: started KDF work can outlive the admission token after reservation rejection; queued password cancellation is unproved and lacks its own mutant; M15 mutates only occupancy reporting rather than the actual admission predicate; and the capacity margin mislabels an 18-second diagnostic as a registration margin. Follow the packet exactly: verify custody and no prior heavy child, post the Kanban worker claim, reproduce every required RED before product edits, implement the smallest scoped lifecycle repair, add non-vacuous queued and started-KDF tests, correct the metric names, run the final expanded fail-closed VR set, focused/static gates and three fresh capacity repeats, then hand the exact 25-minute full registration-file command back to Router. Confine writes to the packet allowlist and mission evidence. Do not launch nested agents, Grok, Hermes model, Fable, local models, or overlapping heavy processes. Do not stage, commit, push, move Done, run repo-wide pnpm test, edit frozen governed paths, or execute retired three-worker A/B artifacts. Return only ROUTER FULL SUITE REQUIRED, REWORK READY FOR PEER REVIEW, or CODEX BLOCKED after every author/test/mutant child exits and final hashes are durable."

print "=== Claude Opus T1 Rework8 starting $(date -u +%FT%TZ), session ${SESSION} ===" \
  | tee -a "${EXIT_LOG}"
/Users/vladmihaimiron/.local/bin/claude --session-id "${SESSION}" -p "${GOAL}" \
  --model claude-opus-5 --permission-mode acceptEdits \
  --allowedTools "Bash,Read,Write,Edit,Glob,Grep" \
  --output-format stream-json --verbose 2>&1 | tee "${STREAM_LOG}"
CLAUDE_STATUS=${pipestatus[1]}
printf '%s\n' "${CLAUDE_STATUS}" > "${STATUS_FILE}"
print "=== Claude Opus T1 Rework8 exited $(date -u +%FT%TZ), status ${CLAUDE_STATUS} ===" \
  | tee -a "${EXIT_LOG}"
exit "${CLAUDE_STATUS}"
