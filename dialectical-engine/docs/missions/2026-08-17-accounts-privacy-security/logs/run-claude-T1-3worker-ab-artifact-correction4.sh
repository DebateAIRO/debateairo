#!/bin/zsh
set -u
unsetopt BG_NICE

REPO="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
GIT_ROOT="/Users/vladmihaimiron/Documents/DebateAIRO"
REL="docs/missions/2026-08-17-accounts-privacy-security/logs"
PACKET="${REL}/T1-claude-3worker-ab-artifact-correction4-packet.md"
PACKET_SHA="e50687a39fea116d976fc9f9233a897e8212da0d1887ff279111613351572c2c"
SESSION="e4f0558b-1204-4ca9-b349-59c8edc79909"
PREFIX="${REPO}/${REL}/T1-3worker-ab-artifact-correction4"
HEAD_SHA="9801f85d97e4263a7c8311304e29d6a03c4a6d15"
AUTHOR_MARKER="T1 THREE-WORKER A/B CORRECTION 4 READY FOR STATIC CHECK"
SCRIPT_PATH="${0:A}"

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
  require_sha "${REL}/T1-3worker-ab-booted-rss-harness.mjs" "7018372118b04535b59281969674355d12e228f61b8cc09d32aa19c0ac3801c4" \
    && require_sha "${REL}/T1-3worker-ab-adjudicator.mjs" "c3ff7e51c26c077daf8eeb759af66c85d7b0405bc65f9a67863c678e4bf45d46" \
    && require_sha "${REL}/T1-3worker-ab-command-matrix.md" "b32fcc44c8b17a9243c8abd0d3411361c83182e240223ebf9758686a7eb1bd8a" \
    && require_sha "${REL}/T1-3worker-ab-integration.patch" "bc69885295a97990cba2bb60d0d85c20e5ed03fff669c089455b2e1c3cfc614f" \
    && require_sha "${REL}/T1-3worker-ab-architecture.patch" "0a0be344fe433a9f0f95e7ee9a0d8d4cc4dee415ce3d7914fbc282b3bd1b0a42" \
    && require_sha "${REL}/T1-3worker-ab-mutation-helper.mjs" "600a795ddb67c52264512dd3ac58db1ffad83bbb7da232b4cab25d7c92ceb893" \
    && require_sha "${REL}/T1-3worker-ab-manifest-builder.mjs" "db90236e3962b6b817550f2f7cabe296252b43ee489a5d9aa9b80d982d94196a" \
    && require_sha "${REL}/run-claude-T1-3worker-ab-diagnostic.sh" "ef76b2a9f6cd47d3ce819aa0a7cf1d32980a8a962fec988041d0052b04361fcc"
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
    "dialectical-engine/${REL}/T1-3worker-ab-artifact-correction4-claude-result.jsonl" \
    "dialectical-engine/${REL}/T1-3worker-ab-artifact-correction4-claude.status" \
    "dialectical-engine/${REL}/T1-3worker-ab-artifact-correction4-wrapper.pid" <<'PY'
import hashlib
import os
import stat
import subprocess
import sys
root = os.path.realpath(sys.argv[1])
allowed = set(sys.argv[2:])
raw = subprocess.check_output(["git", "-C", root, "ls-files", "-z", "--cached", "--others", "--exclude-standard"])
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
            while True:
                chunk = stream.read(1024 * 1024)
                if not chunk:
                    break
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
opener = ": <<\x27T1_N3_AB_PY_SUPERVISOR_HEREDOC\x27"
begin = "# BEGIN T1_N3_AB_PY_SUPERVISOR"
end = "# END T1_N3_AB_PY_SUPERVISOR"
closer = "T1_N3_AB_PY_SUPERVISOR_HEREDOC"
for marker in (opener, begin, end, closer):
    if lines.count(marker) != 1:
        raise SystemExit(1)
oi, bi, ei, ci = (lines.index(opener), lines.index(begin), lines.index(end), lines.index(closer))
if not (oi + 1 == bi < ei and ei + 1 == ci):
    raise SystemExit(1)
body = "\n".join(lines[bi + 1:ei])
if not body.strip():
    raise SystemExit(1)
compile(body, "T1_N3_AB_PY_SUPERVISOR", "exec")
' "${REL}/run-claude-T1-3worker-ab-diagnostic.sh"
}

cd "${REPO}" || exit 1
if [[ "$(pwd -P)" != "${REPO}" \
  || "$(git rev-parse --show-toplevel)" != "${GIT_ROOT}" \
  || "$(git rev-parse HEAD)" != "${HEAD_SHA}" \
  || -n "$(git diff --cached --name-only)" \
  || ! -f "${SCRIPT_PATH}" \
  || ! -r "${SCRIPT_PATH}" \
  || ! -s "${SCRIPT_PATH}" ]] \
  || ! require_sha "${PACKET}" "${PACKET_SHA}" \
  || ! require_sha "${REL}/T1-claude-3worker-ab-draft-packet.md" "a1cef6fb53a178607db9eb84036c7677d9aa0b8dffbb738b8da1873f4c047503" \
  || ! require_sha "${REL}/T1-claude-3worker-ab-artifact-correction1-packet.md" "90734f6a1e8fc85f04c65406daacd678dc7cfcec2299665cfe2118dc5be3c595" \
  || ! require_sha "${REL}/T1-claude-3worker-ab-artifact-correction3-packet.md" "a5f4465922027e4fe6f0e5688285c676bc69736656bc838108cd300e8813dc06" \
  || ! artifacts_exact \
  || ! governed_exact; then
  print "CODEX BLOCKED (custody): correction4 entry mismatch"
  print 74 > "${PREFIX}-claude.status"
  exit 74
fi

WRAPPER_SELF_SHA="$(sha_of "${SCRIPT_PATH}")"
OUTSIDE_SCOPE_PRE="$(outside_scope_snapshot)"
snapshot_rc="$?"
if [[ "${snapshot_rc}" != 0 || -z "${OUTSIDE_SCOPE_PRE}" ]]; then
  print 74 > "${PREFIX}-claude.status"
  exit 74
fi
print "$$" > "${PREFIX}-wrapper.pid"
print "VISIBLE CLAUDE OPUS T1 A/B ARTIFACT CORRECTION 4"
print "Started: $(date -u +%Y-%m-%dT%H:%M:%SZ)"

goal="/goal T1 THREE-WORKER A/B ARTIFACT CORRECTION 4. Read ${PACKET} completely and obey it as sole authority. Continue this session and repair only the eight named support artifacts. No Bash or execution. Return exactly and only the packet marker."
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
require_sha "${REL}/T1-claude-3worker-ab-artifact-correction3-packet.md" "a5f4465922027e4fe6f0e5688285c676bc69736656bc838108cd300e8813dc06" || verify_rc=74
[[ "$(sha_of "${SCRIPT_PATH}")" == "${WRAPPER_SELF_SHA}" ]] || verify_rc=74
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
sed -n '1,420p' "${PREFIX}-claude-result.jsonl"
exit "${final_rc}"
