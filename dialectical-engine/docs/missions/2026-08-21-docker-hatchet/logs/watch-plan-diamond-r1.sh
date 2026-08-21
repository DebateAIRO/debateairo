#!/bin/zsh
set -u
ROOT="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/2026-08-21-docker-hatchet"
STAMPDIR="${ROOT}/logs/watch-stamps"
mkdir -p "${STAMPDIR}"
while true; do
  all=1
  if [[ -f "${ROOT}/architecture/PlanReview.md" ]] && grep -q 'G3-rework-1' "${ROOT}/architecture/PlanReview.md"; then
    if [[ ! -f "${STAMPDIR}/g3-r1.handoff" ]]; then
      touch "${STAMPDIR}/g3-r1.handoff"
      print "HANDOFF G3-DOCKER-GROK-REWORK1"
    fi
  else
    all=0
  fi
  if [[ -f "${ROOT}/architecture/H2-plan-review.md" ]] && grep -q 'H2-rework-1' "${ROOT}/architecture/H2-plan-review.md"; then
    if [[ ! -f "${STAMPDIR}/h2-r1.handoff" ]]; then
      touch "${STAMPDIR}/h2-r1.handoff"
      print "HANDOFF H2-DOCKER-CODEX-REWORK1"
    fi
  else
    all=0
  fi
  if (( all == 1 )); then
    print "DONE"
    exit 0
  fi
  sleep 20
done
