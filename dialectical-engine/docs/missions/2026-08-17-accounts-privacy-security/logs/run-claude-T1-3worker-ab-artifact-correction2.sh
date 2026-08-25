#!/bin/zsh
set -u
unsetopt BG_NICE

REPO="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
GIT_ROOT="/Users/vladmihaimiron/Documents/DebateAIRO"
REL="docs/missions/2026-08-17-accounts-privacy-security/logs"
PACKET="${REL}/T1-claude-3worker-ab-artifact-correction2-packet.md"
PACKET_SHA="873d3daf85af2fa4a169974b1404a18ce9af9ec56f9512fddf3ba25e50a7a958"
SESSION="e4f0558b-1204-4ca9-b349-59c8edc79909"
PREFIX="${REPO}/${REL}/T1-3worker-ab-artifact-correction2"
HEAD_SHA="9801f85d97e4263a7c8311304e29d6a03c4a6d15"

sha_of() { shasum -a 256 "$1" | cut -d ' ' -f 1; }
require_sha() {
  local file_path="$1"
  local expected="$2"
  [[ -f "${file_path}" && "$(sha_of "${file_path}")" == "${expected}" ]]
}
governed_exact() {
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
  || "$(git rev-parse --show-toplevel)" != "${GIT_ROOT}" \
  || "$(git rev-parse HEAD)" != "${HEAD_SHA}" \
  || -n "$(git diff --cached --name-only)" ]] \
  || ! require_sha "${PACKET}" "${PACKET_SHA}" \
  || ! require_sha "${REL}/T1-3worker-ab-booted-rss-harness.mjs" "7d0fc09a41951b15ef5c2eb1fee15b4f90a4399a13ade5cc77f7fb8f85186260" \
  || ! require_sha "${REL}/T1-3worker-ab-adjudicator.mjs" "82df221fcb109407520cf3e460c77fe9b7599e5c42f202d79d78971b33927c70" \
  || ! require_sha "${REL}/T1-3worker-ab-command-matrix.md" "53e2e99c35b54271dfd6484b10ad4f2dc533a12d303a9c49e9003146d4f9f6a1" \
  || ! require_sha "${REL}/T1-3worker-ab-integration.patch" "d495303b234947519a9486e9785efd213912283433ea9b53bedef9fd6164424d" \
  || ! require_sha "${REL}/T1-3worker-ab-architecture.patch" "0e62eddccb3c451bfa14a1fbbdaa194bc780f8ae33031f22d7ec605887836fe2" \
  || ! require_sha "${REL}/T1-3worker-ab-mutation-helper.mjs" "8e4ef8814e94e7c90e07c76dc3327459f66764a05bbdf412f79541033e5f5837" \
  || ! require_sha "${REL}/T1-3worker-ab-manifest-builder.mjs" "f6656d4ea80e3fb023f59fb447a49a69545204b6acb3a36f8c7ac90f607a7031" \
  || ! require_sha "${REL}/run-claude-T1-3worker-ab-diagnostic.sh" "4995dc993d919084fad54fb6049ffd030145d1a7bcb7e89a2ee0177742fa1a25" \
  || ! governed_exact; then
  print "CODEX BLOCKED (custody): correction2 entry mismatch"
  print 74 > "${PREFIX}-claude.status"
  exit 74
fi

print "$$" > "${PREFIX}-wrapper.pid"
print "VISIBLE CLAUDE OPUS T1 A/B ARTIFACT CORRECTION 2"
print "Started: $(date -u +%Y-%m-%dT%H:%M:%SZ)"

goal="/goal T1 THREE-WORKER A/B ARTIFACT CORRECTION 2. Read ${PACKET} completely and obey it as sole authority. Continue this session and repair only the five named files. No Bash or execution. Return exactly the packet marker."
claude --resume "${SESSION}" -p "${goal}" --model claude-opus-5 \
  --permission-mode acceptEdits --allowedTools 'Read,Write,Edit,Glob,Grep' \
  --output-format stream-json --verbose > "${PREFIX}-claude-result.jsonl" 2>&1
seat_rc="$?"
verify_rc=0
if [[ "${seat_rc}" == 0 ]]; then
  node --check "${REL}/T1-3worker-ab-mutation-helper.mjs" || verify_rc=74
  node --check "${REL}/T1-3worker-ab-manifest-builder.mjs" || verify_rc=74
  zsh -n "${REL}/run-claude-T1-3worker-ab-diagnostic.sh" || verify_rc=74
  git apply --check "${REL}/T1-3worker-ab-integration.patch" || verify_rc=74
  git apply --check "${REL}/T1-3worker-ab-architecture.patch" || verify_rc=74
  [[ "$(git rev-parse HEAD)" == "${HEAD_SHA}" ]] || verify_rc=74
  [[ -z "$(git diff --cached --name-only)" ]] || verify_rc=74
  governed_exact || verify_rc=74
fi
final_rc="${seat_rc}"
(( verify_rc == 0 )) || final_rc=74
print "${final_rc}" > "${PREFIX}-claude.status"
for artifact in \
  "${REL}/T1-3worker-ab-mutation-helper.mjs" \
  "${REL}/T1-3worker-ab-manifest-builder.mjs" \
  "${REL}/run-claude-T1-3worker-ab-diagnostic.sh" \
  "${REL}/T1-3worker-ab-integration.patch" \
  "${REL}/T1-3worker-ab-architecture.patch"; do
  shasum -a 256 "${artifact}"
  wc -lc "${artifact}"
done
sed -n '1,280p' "${PREFIX}-claude-result.jsonl"
exit "${final_rc}"
