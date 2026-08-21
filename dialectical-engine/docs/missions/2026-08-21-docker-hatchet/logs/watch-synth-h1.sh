#!/bin/zsh
set -u
ROOT="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/2026-08-21-docker-hatchet"
STAMPDIR="${ROOT}/logs/watch-stamps"
mkdir -p "${STAMPDIR}"
IDLE_LIMIT=1200
last_change=$(date +%s)

check() {
  local name="$1" file="$2"
  [[ -f "${file}" ]] || return 1
  grep -q 'READY FOR HERMES STAGE REVIEW:' "${file}"
}

while true; do
  now=$(date +%s)
  all=1
  if check synth "${ROOT}/research/synthesized-requirements.md"; then
    if [[ ! -f "${STAMPDIR}/synth.handoff" ]]; then
      touch "${STAMPDIR}/synth.handoff"
      print "HANDOFF REQ-DOCKER-SYNTH"
      last_change=${now}
    fi
  else
    all=0
  fi
  if check h1 "${ROOT}/reviews/h1-integrity.md"; then
    if [[ ! -f "${STAMPDIR}/h1.handoff" ]]; then
      touch "${STAMPDIR}/h1.handoff"
      print "HANDOFF H1-DOCKER-HERMES"
      last_change=${now}
    fi
  else
    all=0
  fi
  if (( all == 1 )); then
    print "DONE"
    exit 0
  fi
  if (( now - last_change >= IDLE_LIMIT )); then
    if ! pgrep -f 'run-synth-inner|run-h1-inner|claude-opus-5' >/dev/null 2>&1; then
      print "FAILED idle-20min"
      exit 1
    fi
  fi
  sleep 20
done
