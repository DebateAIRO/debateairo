#!/bin/zsh
set -u
unsetopt BG_NICE

REPO="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
REL="docs/missions/2026-08-17-accounts-privacy-security/logs"
PACKET="${REL}/T1-claude-n3-report-correction2-packet.md"
PROGRESS="${REPO}/${REL}/T1-n3-attribution-progress.log"
PREFIX="${REPO}/${REL}/T1-n3-report-correction2"
MODEL="claude-opus-5"
seat_pid=""
backup_dir=""
backup_file=""

finish() {
  local rc="$1"
  if [[ "${rc}" != "0" && -n "${backup_file}" && -f "${backup_file}" ]]; then
    cp -p "${backup_file}" "${PROGRESS}" || rc=74
  fi
  print "${rc}" > "${PREFIX}-claude.status"
  exit "${rc}"
}

signal_guard() {
  local rc="$1"
  trap - INT TERM HUP
  if [[ -n "${seat_pid}" ]] && kill -0 "${seat_pid}" 2>/dev/null; then
    kill -TERM "${seat_pid}" 2>/dev/null || true
    wait "${seat_pid}" 2>/dev/null || true
    seat_pid=""
  fi
  finish "${rc}"
}

cd "${REPO}" || exit 1
[[ -z "$(git diff --cached --name-only)" ]] || exit 74
backup_dir="$(mktemp -d /tmp/t1-n3-report-correction2.XXXXXX)" || exit 74
backup_file="${backup_dir}/T1-n3-attribution-progress.log.bak"
cp -p "${PROGRESS}" "${backup_file}" || exit 74
cmp -s "${backup_file}" "${PROGRESS}" || exit 74

trap 'signal_guard 130' INT
trap 'signal_guard 143' TERM
trap 'signal_guard 129' HUP

print "$$" > "${PREFIX}-wrapper.pid"
print "VISIBLE CLAUDE OPUS T1 N3 REPORT CORRECTION 2"
print "Packet: ${PACKET}"
print "Backup: ${backup_dir}"
print "Started: $(date -u +%Y-%m-%dT%H:%M:%SZ)"

goal="/goal T1 N3 REPORT CORRECTION 2. Read ${PACKET} completely and obey it as sole authority. Edit only the named classification paragraph, verify exact scope/custody, run no tests, and return a concise summary."

claude -p "${goal}" --model "${MODEL}" --permission-mode acceptEdits \
  --allowedTools 'Bash,Read,Edit,Grep' --output-format json \
  > "${PREFIX}-claude-result.json" 2>&1 &
seat_pid="$!"
wait "${seat_pid}"
seat_rc="$?"
seat_pid=""
sed -n '1,200p' "${PREFIX}-claude-result.json"
finish "${seat_rc}"
