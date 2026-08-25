#!/bin/zsh
set -u
unsetopt BG_NICE

REPO="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
GIT_ROOT="/Users/vladmihaimiron/Documents/DebateAIRO"
REL="docs/missions/2026-08-17-accounts-privacy-security/logs"
PACKET="${REL}/T1-claude-3worker-ab-artifact-correction3-packet.md"
PACKET_SHA="a5f4465922027e4fe6f0e5688285c676bc69736656bc838108cd300e8813dc06"
SESSION="e4f0558b-1204-4ca9-b349-59c8edc79909"
PREFIX="${REPO}/${REL}/T1-3worker-ab-artifact-correction3"
HEAD_SHA="9801f85d97e4263a7c8311304e29d6a03c4a6d15"
AUTHOR_MARKER="T1 THREE-WORKER A/B CORRECTION 3 READY FOR STATIC CHECK"

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
artifacts_exact() {
  require_sha "${REL}/T1-3worker-ab-booted-rss-harness.mjs" "7d0fc09a41951b15ef5c2eb1fee15b4f90a4399a13ade5cc77f7fb8f85186260" \
    && require_sha "${REL}/T1-3worker-ab-adjudicator.mjs" "82df221fcb109407520cf3e460c77fe9b7599e5c42f202d79d78971b33927c70" \
    && require_sha "${REL}/T1-3worker-ab-command-matrix.md" "53e2e99c35b54271dfd6484b10ad4f2dc533a12d303a9c49e9003146d4f9f6a1" \
    && require_sha "${REL}/T1-3worker-ab-integration.patch" "7392cb7642a6d7e8204ddf146886f032b23f241bc09bfe5a3083ca39d6ac7045" \
    && require_sha "${REL}/T1-3worker-ab-architecture.patch" "34887006ddafc77df1af5c33d6a848a609c4610a415b64041f8d2bb675a66e61" \
    && require_sha "${REL}/T1-3worker-ab-mutation-helper.mjs" "600a795ddb67c52264512dd3ac58db1ffad83bbb7da232b4cab25d7c92ceb893" \
    && require_sha "${REL}/T1-3worker-ab-manifest-builder.mjs" "cab7eedb8557fa695f387207094b4c8a2d3e5f1451cd3e176d2e9810cc327395" \
    && require_sha "${REL}/run-claude-T1-3worker-ab-diagnostic.sh" "179b8f524a897e5b9da50c11c7765110063eaa38c62eb55b5c35809c3804d11e"
}
artifacts_present() {
  local artifact
  for artifact in \
    "${REL}/T1-3worker-ab-booted-rss-harness.mjs" \
    "${REL}/T1-3worker-ab-adjudicator.mjs" \
    "${REL}/T1-3worker-ab-command-matrix.md" \
    "${REL}/T1-3worker-ab-integration.patch" \
    "${REL}/T1-3worker-ab-architecture.patch" \
    "${REL}/T1-3worker-ab-mutation-helper.mjs" \
    "${REL}/T1-3worker-ab-manifest-builder.mjs" \
    "${REL}/run-claude-T1-3worker-ab-diagnostic.sh"; do
    [[ -f "${artifact}" && -r "${artifact}" ]] || return 1
  done
}
outside_scope_snapshot() {
  /usr/bin/python3 - "${GIT_ROOT}" \
    "dialectical-engine/${REL}/T1-3worker-ab-booted-rss-harness.mjs" \
    "dialectical-engine/${REL}/T1-3worker-ab-adjudicator.mjs" \
    "dialectical-engine/${REL}/T1-3worker-ab-command-matrix.md" \
    "dialectical-engine/${REL}/T1-3worker-ab-integration.patch" \
    "dialectical-engine/${REL}/T1-3worker-ab-architecture.patch" \
    "dialectical-engine/${REL}/T1-3worker-ab-mutation-helper.mjs" \
    "dialectical-engine/${REL}/T1-3worker-ab-manifest-builder.mjs" \
    "dialectical-engine/${REL}/run-claude-T1-3worker-ab-diagnostic.sh" \
    "dialectical-engine/${REL}/T1-3worker-ab-artifact-correction3-claude-result.jsonl" \
    "dialectical-engine/${REL}/T1-3worker-ab-artifact-correction3-claude.status" \
    "dialectical-engine/${REL}/T1-3worker-ab-artifact-correction3-wrapper.pid" <<'PY'
import hashlib
import os
import stat
import subprocess
import sys

root = os.path.realpath(sys.argv[1])
allowed = set(sys.argv[2:])
raw = subprocess.check_output([
    "git", "-C", root, "ls-files", "-z", "--cached", "--others",
    "--exclude-standard"
])
paths = sorted(p.decode("utf-8", "surrogateescape") for p in raw.split(b"\0") if p)
digest = hashlib.sha256()
for relative in paths:
    if relative in allowed:
        continue
    full = os.path.join(root, relative)
    info = os.lstat(full)
    digest.update(relative.encode("utf-8", "surrogateescape") + b"\0")
    digest.update(str(stat.S_IFMT(info.st_mode)).encode() + b"\0")
    if stat.S_ISLNK(info.st_mode):
        digest.update(os.readlink(full).encode("utf-8", "surrogateescape"))
    elif stat.S_ISREG(info.st_mode):
        with open(full, "rb") as stream:
            while chunk := stream.read(1024 * 1024):
                digest.update(chunk)
    else:
        digest.update(b"SPECIAL")
    digest.update(b"\0")
print(digest.hexdigest())
PY
}
author_marker_exact() {
  node -e '
const fs = require("node:fs");
const [path, marker] = process.argv.slice(1);
const rows = fs.readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
const finals = rows.filter((row) => row && row.type === "result");
if (finals.length !== 1 || typeof finals[0].result !== "string" || finals[0].result !== marker) process.exit(1);
' "${PREFIX}-claude-result.jsonl" "${AUTHOR_MARKER}"
}
supervisor_source_compiles() {
  /usr/bin/python3 -c '
import pathlib, sys
lines = pathlib.Path(sys.argv[1]).read_text().splitlines()
opener = ": <<'" + "T1_N3_AB_PY_SUPERVISOR_HEREDOC'"
begin = "# BEGIN T1_N3_AB_PY_SUPERVISOR"
end = "# END T1_N3_AB_PY_SUPERVISOR"
closer = "T1_N3_AB_PY_SUPERVISOR_HEREDOC"
for marker in (opener, begin, end, closer):
    if lines.count(marker) != 1:
        raise SystemExit(1)
opener_index, begin_index, end_index, closer_index = (
    lines.index(opener), lines.index(begin), lines.index(end), lines.index(closer)
)
if not (opener_index + 1 == begin_index < end_index and end_index + 1 == closer_index):
    raise SystemExit(1)
body = "\n".join(lines[begin_index + 1:end_index])
if not body.strip():
    raise SystemExit(1)
compile(body, "T1_N3_AB_PY_SUPERVISOR", "exec")
' "${REL}/run-claude-T1-3worker-ab-diagnostic.sh"
}

cd "${REPO}" || exit 1
if [[ "$(pwd -P)" != "${REPO}" \
  || "$(git rev-parse --show-toplevel)" != "${GIT_ROOT}" \
  || "$(git rev-parse HEAD)" != "${HEAD_SHA}" \
  || -n "$(git diff --cached --name-only)" ]] \
  || ! require_sha "${PACKET}" "${PACKET_SHA}" \
  || ! require_sha "${REL}/T1-claude-3worker-ab-draft-packet.md" "a1cef6fb53a178607db9eb84036c7677d9aa0b8dffbb738b8da1873f4c047503" \
  || ! require_sha "${REL}/T1-claude-3worker-ab-artifact-correction1-packet.md" "90734f6a1e8fc85f04c65406daacd678dc7cfcec2299665cfe2118dc5be3c595" \
  || ! require_sha "${REL}/T1-claude-3worker-ab-artifact-correction2-packet.md" "873d3daf85af2fa4a169974b1404a18ce9af9ec56f9512fddf3ba25e50a7a958" \
  || ! artifacts_exact \
  || ! governed_exact; then
  print "CODEX BLOCKED (custody): correction3 entry mismatch"
  print 74 > "${PREFIX}-claude.status"
  exit 74
fi

WRAPPER_SELF_SHA="$(sha_of "$0")"
OUTSIDE_SCOPE_PRE="$(outside_scope_snapshot)" || exit 74
print "$$" > "${PREFIX}-wrapper.pid"
print "VISIBLE CLAUDE OPUS T1 A/B ARTIFACT CORRECTION 3"
print "Started: $(date -u +%Y-%m-%dT%H:%M:%SZ)"

goal="/goal T1 THREE-WORKER A/B ARTIFACT CORRECTION 3. Read ${PACKET} completely and obey it as sole authority. Continue this session and repair only the eight named support artifacts. No Bash or execution. Return exactly the packet marker."
claude --resume "${SESSION}" -p "${goal}" --model claude-opus-5 \
  --permission-mode acceptEdits --allowedTools 'Read,Write,Edit,Glob,Grep' \
  --output-format stream-json --verbose > "${PREFIX}-claude-result.jsonl" 2>&1
seat_rc="$?"
verify_rc=0
if [[ "${seat_rc}" == 0 ]]; then
  artifacts_present || verify_rc=74
  node --check "${REL}/T1-3worker-ab-booted-rss-harness.mjs" || verify_rc=74
  node --check "${REL}/T1-3worker-ab-adjudicator.mjs" || verify_rc=74
  node --check "${REL}/T1-3worker-ab-mutation-helper.mjs" || verify_rc=74
  node --check "${REL}/T1-3worker-ab-manifest-builder.mjs" || verify_rc=74
  zsh -n "${REL}/run-claude-T1-3worker-ab-diagnostic.sh" || verify_rc=74
  supervisor_source_compiles || verify_rc=74
  git apply --check "${REL}/T1-3worker-ab-integration.patch" || verify_rc=74
  git apply --check "${REL}/T1-3worker-ab-architecture.patch" || verify_rc=74
  rg -n '</?content>|</?invoke>' \
    "${REL}/T1-3worker-ab-booted-rss-harness.mjs" \
    "${REL}/T1-3worker-ab-adjudicator.mjs" \
    "${REL}/T1-3worker-ab-command-matrix.md" \
    "${REL}/T1-3worker-ab-integration.patch" \
    "${REL}/T1-3worker-ab-architecture.patch" \
    "${REL}/T1-3worker-ab-mutation-helper.mjs" \
    "${REL}/T1-3worker-ab-manifest-builder.mjs" \
    "${REL}/run-claude-T1-3worker-ab-diagnostic.sh"
  envelope_rc="$?"
  [[ "${envelope_rc}" == 1 ]] || verify_rc=74
  author_marker_exact || verify_rc=74
fi
artifacts_present || verify_rc=74
[[ "$(git rev-parse HEAD)" == "${HEAD_SHA}" ]] || verify_rc=74
[[ -z "$(git diff --cached --name-only)" ]] || verify_rc=74
git diff --check || verify_rc=74
governed_exact || verify_rc=74
require_sha "${PACKET}" "${PACKET_SHA}" || verify_rc=74
require_sha "${REL}/T1-claude-3worker-ab-draft-packet.md" "a1cef6fb53a178607db9eb84036c7677d9aa0b8dffbb738b8da1873f4c047503" || verify_rc=74
require_sha "${REL}/T1-claude-3worker-ab-artifact-correction1-packet.md" "90734f6a1e8fc85f04c65406daacd678dc7cfcec2299665cfe2118dc5be3c595" || verify_rc=74
require_sha "${REL}/T1-claude-3worker-ab-artifact-correction2-packet.md" "873d3daf85af2fa4a169974b1404a18ce9af9ec56f9512fddf3ba25e50a7a958" || verify_rc=74
[[ "$(sha_of "$0")" == "${WRAPPER_SELF_SHA}" ]] || verify_rc=74
[[ "$(outside_scope_snapshot)" == "${OUTSIDE_SCOPE_PRE}" ]] || verify_rc=74
final_rc="${seat_rc}"
(( verify_rc == 0 )) || final_rc=74
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
  shasum -a 256 "${artifact}"
  wc -lc "${artifact}"
done
sed -n '1,360p' "${PREFIX}-claude-result.jsonl"
exit "${final_rc}"
