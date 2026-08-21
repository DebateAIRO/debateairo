#!/bin/zsh
set -u
ROOT="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/2026-08-21-docker-hatchet"
ART="${ROOT}/architecture/Plan.md"
STAMP="${ROOT}/logs/watch-stamps/c2-rework3.handoff"
mkdir -p "${ROOT}/logs/watch-stamps"
while true; do
  if [[ -f "${ART}" ]] && grep -q 'C2-rework-3' "${ART}"; then
    if [[ ! -f "${STAMP}" ]]; then
      touch "${STAMP}"
      print "HANDOFF C2-DOCKER-OPUS-REWORK3"
    fi
    print "DONE"
    exit 0
  fi
  sleep 20
done
