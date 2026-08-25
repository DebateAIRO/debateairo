#!/bin/zsh
set -u
unsetopt BG_NICE

REPO="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
REL="docs/missions/2026-08-17-accounts-privacy-security/logs"
PACKET="${REL}/T1-claude-3worker-ab-artifact-correction1-packet.md"
PACKET_SHA="90734f6a1e8fc85f04c65406daacd678dc7cfcec2299665cfe2118dc5be3c595"
DESIGN="${REL}/T1-claude-3worker-ab-draft-packet.md"
DESIGN_SHA="a1cef6fb53a178607db9eb84036c7677d9aa0b8dffbb738b8da1873f4c047503"
AUTHOR_PACKET="${REL}/T1-claude-3worker-ab-artifact-authoring-packet.md"
AUTHOR_PACKET_SHA="6e1f45085946be5024a88717337b95493ce04b7053197a57a17a5d666b5e17a2"
PREFIX="${REPO}/${REL}/T1-3worker-ab-artifact-correction1"
MODEL="claude-opus-5"
EXPECTED_GIT_ROOT="/Users/vladmihaimiron/Documents/DebateAIRO"
EXPECTED_HEAD="9801f85d97e4263a7c8311304e29d6a03c4a6d15"

sha_of() {
  shasum -a 256 "$1" | cut -d ' ' -f 1
}

require_sha() {
  local file_path="$1"
  local expected="$2"
  [[ -f "${file_path}" && "$(sha_of "${file_path}")" == "${expected}" ]]
}

governed_hashes_exact() {
  require_sha "apps/api/src/index.ts" "0172fc7e1dd44de560d467743f3e5ab7f6406bf52a5bbb302dd68685d64d679a" \
    && require_sha "apps/api/src/main.ts" "4dae1f79496a0a8cca7b2ee03a30f922564ce6cace3331539d0406e60973b26f" \
    && require_sha "apps/api/src/registration.ts" "0b75f99df102d9a7915a22f1d5b28e278352dfcb2936ac5bffe7b3f3afc01fd7" \
    && require_sha "packages/crypto/src/index.ts" "66b20d2170a35667e75e4ba15e8adc016d44d252958527e2877b99bf9f6871e6" \
    && require_sha "packages/crypto/src/argon2-worker.ts" "c610b06ee13a87ec8d9a47c88b552edb5398b30cd9b49509d547eda36fdcb11b" \
    && require_sha "packages/crypto/src/argon2-worker-pool.ts" "b990c3f866f9697b158e4040ffd9bb832341e31853a40d30e70deb57394c526d" \
    && require_sha "packages/db/src/identity.ts" "2d92223b58c6f1af7c6b9bc544df5f2518e8e20404bf982fbabb0a50bc90e17f" \
    && require_sha "packages/register/src/auth-policy.ts" "06056093071e7905342e3030b14c0ac11f14f4ee72a8bce11d7accf34bf5eb52" \
    && require_sha "tests/integration/registration-database.test.ts" "7f8a048afaa415f49f340fe2ef15aa2d4140af1bbf3916bddf5353797a295c58" \
    && require_sha "tests/unit/registration.test.ts" "ebfbfce79c0bdb5de9d2bb0855deabd7a1f95b29cc69667060d55feaa549e25b" \
    && require_sha "tests/unit/argon2-worker-pool.test.ts" "93f1a3357ffe5b45fac047f77c16c9ae80322123a3eff97c30a7d7e7d2afb55b" \
    && require_sha "tests/architecture/t1-argon2-worker-contract.test.ts" "3548b93282011be73310efe8a2eec31638133dc69a1d92a0cf4ffbc36f253ca1"
}

cd "${REPO}" || exit 1
if [[ "$(pwd -P)" != "${REPO}" \
  || "$(git rev-parse --show-toplevel)" != "${EXPECTED_GIT_ROOT}" \
  || "$(git rev-parse HEAD)" != "${EXPECTED_HEAD}" \
  || -n "$(git diff --cached --name-only)" ]] \
  || ! require_sha "${PACKET}" "${PACKET_SHA}" \
  || ! require_sha "${DESIGN}" "${DESIGN_SHA}" \
  || ! require_sha "${AUTHOR_PACKET}" "${AUTHOR_PACKET_SHA}" \
  || ! require_sha "${REL}/T1-3worker-ab-booted-rss-harness.mjs" "e417fea6322877b3b977c80aa33dd9918538fbd2eb3eac813abbe96c95f2d5ec" \
  || ! require_sha "${REL}/T1-3worker-ab-adjudicator.mjs" "dc4c0243f9cf059fa41cba518b05323baac4ff4401ee008071f2a77cce72a7cb" \
  || ! require_sha "${REL}/T1-3worker-ab-command-matrix.md" "9483470ed9c05969bff43bc1bfc6eb7df445ef22fd8be44ee69aa3dc29b63595" \
  || ! governed_hashes_exact; then
  print "CODEX BLOCKED (custody): correction/design/author/index preflight mismatch"
  print 74 > "${PREFIX}-claude.status"
  exit 74
fi

print "$$" > "${PREFIX}-wrapper.pid"
print "VISIBLE CLAUDE OPUS T1 THREE-WORKER A/B ARTIFACT CORRECTION 1"
print "Correction packet SHA: ${PACKET_SHA}"
print "Approved design SHA: ${DESIGN_SHA}"
print "Started: $(date -u +%Y-%m-%dT%H:%M:%SZ)"

goal="/goal T1 THREE-WORKER A/B SUPPORT ARTIFACT CORRECTION 1. Read ${PACKET} completely and obey it as sole authority. Read the approved design and prior author packet named there. Correct/write only the eight named mission-log artifacts. This is static authoring only: do not run the experiment, tests, harness, adjudicator, builders, workers or PostgreSQL. Use only the packet's explicit static command allowlist. Verify custody and return exactly the packet handoff marker."

claude -p "${goal}" --model "${MODEL}" --permission-mode acceptEdits \
  --allowedTools 'Read,Write,Edit,Glob,Grep' --output-format stream-json --verbose \
  > "${PREFIX}-claude-result.jsonl" 2>&1
seat_rc="$?"
verify_rc=0

if [[ "${seat_rc}" == 0 ]]; then
  node --check "${REL}/T1-3worker-ab-booted-rss-harness.mjs" || verify_rc=74
  node --check "${REL}/T1-3worker-ab-adjudicator.mjs" || verify_rc=74
  node --check "${REL}/T1-3worker-ab-mutation-helper.mjs" || verify_rc=74
  node --check "${REL}/T1-3worker-ab-manifest-builder.mjs" || verify_rc=74
  zsh -n "${REL}/run-claude-T1-3worker-ab-diagnostic.sh" || verify_rc=74
  git apply --check "${REL}/T1-3worker-ab-integration.patch" || verify_rc=74
  git apply --check "${REL}/T1-3worker-ab-architecture.patch" || verify_rc=74
  [[ "$(git rev-parse HEAD)" == "${EXPECTED_HEAD}" ]] || verify_rc=74
  [[ -z "$(git diff --cached --name-only)" ]] || verify_rc=74
  governed_hashes_exact || verify_rc=74
fi

final_rc="${seat_rc}"
if [[ "${verify_rc}" != 0 ]]; then
  final_rc="${verify_rc}"
  print "CODEX BLOCKED (custody): static correction verification failed"
fi
print "${final_rc}" > "${PREFIX}-claude.status"

for artifact in \
  "${REL}/T1-3worker-ab-booted-rss-harness.mjs" \
  "${REL}/T1-3worker-ab-adjudicator.mjs" \
  "${REL}/T1-3worker-ab-command-matrix.md" \
  "${REL}/T1-3worker-ab-integration.patch" \
  "${REL}/T1-3worker-ab-architecture.patch" \
  "${REL}/T1-3worker-ab-mutation-helper.mjs" \
  "${REL}/T1-3worker-ab-manifest-builder.mjs" \
  "${REL}/run-claude-T1-3worker-ab-diagnostic.sh"; do
  if [[ -f "${artifact}" ]]; then
    shasum -a 256 "${artifact}"
    wc -lc "${artifact}"
  else
    print "MISSING ${artifact}"
  fi
done

sed -n '1,320p' "${PREFIX}-claude-result.jsonl"
exit "${final_rc}"
