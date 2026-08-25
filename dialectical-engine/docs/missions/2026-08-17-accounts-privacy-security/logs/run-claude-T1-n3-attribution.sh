#!/bin/zsh
# Visible Claude Opus N=3 attribution seat with fail-closed test custody.
set -u
unsetopt BG_NICE

REPO="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
REL="docs/missions/2026-08-17-accounts-privacy-security/logs"
PACKET="${REL}/T1-claude-n3-attribution-packet.md"
PACKET_SHA="b71135b0289dc3e98208bc9a2c453690e4655a6ad23dcdf2120653f970fc3f75"
PREFIX="${REPO}/${REL}/T1-n3-attribution"
MODEL="claude-opus-5"
TEST_FILE="${REPO}/tests/integration/registration-database.test.ts"
TEST_SHA="7f8a048afaa415f49f340fe2ef15aa2d4140af1bbf3916bddf5353797a295c58"
seat_pid=""
backup_dir=""
backup_file=""
typeset -a seat_tree_pids

collect_tree() {
  local target_pid="$1"
  local child_pid
  for child_pid in ${(f)"$(pgrep -P "${target_pid}" 2>/dev/null)"}; do
    [[ -n "${child_pid}" ]] && collect_tree "${child_pid}"
  done
  seat_tree_pids+=("${target_pid}")
}

kill_tree_if_needed() {
  [[ -z "${seat_pid}" ]] && return 0
  if kill -0 "${seat_pid}" 2>/dev/null; then
    seat_tree_pids=()
    collect_tree "${seat_pid}"
    local owned_pid attempt any_alive
    for owned_pid in "${seat_tree_pids[@]}"; do
      kill -TERM "${owned_pid}" 2>/dev/null || true
    done
    for attempt in {1..50}; do
      any_alive=0
      for owned_pid in "${seat_tree_pids[@]}"; do
        if kill -0 "${owned_pid}" 2>/dev/null; then
          any_alive=1
          break
        fi
      done
      [[ "${any_alive}" == "0" ]] && break
      sleep 0.1
    done
    for owned_pid in "${seat_tree_pids[@]}"; do
      kill -0 "${owned_pid}" 2>/dev/null \
        && kill -KILL "${owned_pid}" 2>/dev/null || true
    done
  fi
  wait "${seat_pid}" 2>/dev/null || true
  seat_pid=""
}

restore_and_verify() {
  [[ -n "${backup_file}" && -f "${backup_file}" ]] || return 1
  cp -p "${backup_file}" "${TEST_FILE}" || return 1
  local observed_sha observed_size observed_mtime backup_size backup_mtime
  observed_sha="$(shasum -a 256 "${TEST_FILE}" | awk '{print $1}')"
  observed_size="$(stat -f '%z' "${TEST_FILE}")"
  observed_mtime="$(stat -f '%m' "${TEST_FILE}")"
  backup_size="$(stat -f '%z' "${backup_file}")"
  backup_mtime="$(stat -f '%m' "${backup_file}")"
  [[ "${observed_sha}" == "${TEST_SHA}" \
    && "${observed_size}" == "${backup_size}" \
    && "${observed_mtime}" == "${backup_mtime}" ]] || return 1
  cmp -s "${backup_file}" "${TEST_FILE}"
}

exit_guard() {
  local requested_rc="$?"
  trap - EXIT INT TERM HUP
  kill_tree_if_needed
  local final_rc="${requested_rc}"
  if ! restore_and_verify; then
    final_rc=74
    print "CODEX BLOCKED (custody): wrapper restore verification failed"
  fi
  print "${final_rc}" > "${PREFIX}-claude.status"
  print "Claude seat raw status: ${final_rc}"
  print "Finished: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  exit "${final_rc}"
}

signal_guard() {
  local signal_rc="$1"
  trap - INT TERM HUP
  kill_tree_if_needed
  exit "${signal_rc}"
}

cd "${REPO}" || exit 1

observed_packet_sha="$(shasum -a 256 "${PACKET}" | awk '{print $1}')"
observed_test_sha="$(shasum -a 256 "${TEST_FILE}" | awk '{print $1}')"
if [[ "${observed_packet_sha}" != "${PACKET_SHA}" \
  || "${observed_test_sha}" != "${TEST_SHA}" \
  || -n "$(git diff --cached --name-only)" ]]; then
  print "CODEX BLOCKED (custody): packet/test/index preflight mismatch"
  exit 74
fi

backup_dir="$(mktemp -d /tmp/t1-n3-attribution.XXXXXX)" || exit 74
backup_file="${backup_dir}/registration-database.test.ts.bak"
cp -p "${TEST_FILE}" "${backup_file}" || exit 74
if [[ "$(shasum -a 256 "${backup_file}" | awk '{print $1}')" != "${TEST_SHA}" ]] \
  || ! cmp -s "${backup_file}" "${TEST_FILE}"; then
  print "CODEX BLOCKED (custody): fresh backup verification failed"
  exit 74
fi
export T1_N3_BACKUP_DIR="${backup_dir}"

trap exit_guard EXIT
trap 'signal_guard 130' INT
trap 'signal_guard 143' TERM
trap 'signal_guard 129' HUP

print "$$" > "${PREFIX}-wrapper.pid"
print "${backup_dir}" > "${PREFIX}-backup-path.txt"
print "VISIBLE CLAUDE OPUS T1 N=3 ATTRIBUTION"
print "Packet: ${PACKET}"
print "Packet SHA: ${observed_packet_sha}"
print "Fresh backup: ${backup_dir}"
print "Started: $(date -u +%Y-%m-%dT%H:%M:%SZ)"

goal="/goal T1 N3 ATTRIBUTION. Read ${PACKET} completely and obey it as the sole authority. The wrapper has exported its verified fresh backup directory as T1_N3_BACKUP_DIR. Perform frozen preflight, add only the temporary instrumented test, run exactly three fresh foreground repeats, restore byte-for-byte, write every named durable receipt/progress artifact, and return exactly the packet's final attribution marker. Do not implement product/policy, run a full suite, stage, commit, push, or use any agent/model."

claude -p "${goal}" --model "${MODEL}" --permission-mode acceptEdits \
  --allowedTools 'Bash,Read,Write,Edit,Glob,Grep' --output-format json \
  > "${PREFIX}-claude-result.json" 2>&1 &
seat_pid="$!"
wait "${seat_pid}"
seat_rc="$?"
seat_pid=""
sed -n '1,240p' "${PREFIX}-claude-result.json"
exit "${seat_rc}"
