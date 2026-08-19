#!/bin/zsh
# Generic Grok review-lens launcher for the accounts mission.
#   usage: run-grok-review.sh <SLICE>        e.g. run-grok-review.sh S3
# Reads reviews/<SLICE>-review-packet.md, writes reviews/<SLICE>-grok-verdict.md.
# The packet is the ONLY scope authority — this script states no file list of its
# own (a stale hard-coded list previously misled a lens; it recovered by using
# mtimes, but the script should never have carried it).
set -u
MISSION="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
SLICE="${1:?slice id required, e.g. S3}"
REL="docs/missions/2026-08-17-accounts-privacy-security"
PACKET="${REL}/reviews/${SLICE}-review-packet.md"
LOG="${MISSION}/${REL}/logs/${SLICE}-grok-review.log"
cd "${MISSION}" || exit 1
[[ -f "${PACKET}" ]] || { print "REFUSING ${SLICE}: packet ${PACKET} missing" | tee -a "${LOG}"; exit 1; }
print "=== ${SLICE} Grok review starting $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
"${HOME}/.grok/bin/grok" \
  -p "/goal Read ${PACKET} in full and execute it as the Grok lens of the ${SLICE} dual diamond. The packet is your only scope authority; establish the author's true change set yourself from file mtimes (find -mmin / stat), never from git diff, and ignore the Aug-17 rename churn. Verify claims against the working tree and RUN the listed test commands — a blocking lens must have run the live world. Write your verdict to ${REL}/reviews/${SLICE}-grok-verdict.md and print GREENLIGHT or BLOCK to stdout." \
  --permission-mode bypassPermissions \
  </dev/null 2>&1 | tee -a "${LOG}"
print "=== ${SLICE} Grok review exited $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
