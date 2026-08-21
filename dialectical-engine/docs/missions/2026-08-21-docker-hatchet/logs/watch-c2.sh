#!/bin/zsh
set -u
ROOT="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/2026-08-21-docker-hatchet"
STAMP="${ROOT}/logs/watch-stamps/c2.handoff"
ART="${ROOT}/architecture/Plan.md"
mkdir -p "${ROOT}/logs/watch-stamps"
while true; do
  if [[ -f "${ART}" ]] && grep -q 'READY FOR HERMES STAGE REVIEW:' "${ART}"; then
    if [[ ! -f "${STAMP}" ]]; then
      touch "${STAMP}"
      print "HANDOFF C2-DOCKER-OPUS"
    fi
    print "DONE"
    exit 0
  fi
  sleep 20
done
