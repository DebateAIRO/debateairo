#!/bin/zsh
# Grok review-lens launcher for the accounts mission.
#   usage: run-grok-review.sh <SLICE> [--headless]
# Reads reviews/<SLICE>-review-packet.md, writes reviews/<SLICE>-grok-verdict.md.
#
# VISIBLE-LAUNCH LAW (spine v3.2.0 amendment 2): the seat runs in a real
# Terminal window the human can watch, titled with the slice. The window is the
# seat itself — closing it DOES stop that review (unlike open-viewer.sh, which
# is a decoupled read-only tail). Pass --headless to run detached instead.
#
# The packet is the ONLY scope authority; this script states no file list of its
# own (a stale hard-coded list once misled a lens — it recovered via mtimes, but
# the script should never have carried it).
set -u
MISSION="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
SLICE="${1:?slice id required, e.g. S4}"
MODE="${2:-visible}"
REL="docs/missions/2026-08-17-accounts-privacy-security"
PACKET="${REL}/reviews/${SLICE}-review-packet.md"
LOG="${MISSION}/${REL}/logs/${SLICE}-grok-review.log"
cd "${MISSION}" || exit 1
[[ -f "${MISSION}/${PACKET}" ]] || { print "REFUSING ${SLICE}: packet ${PACKET} missing" | tee -a "${LOG}"; exit 1; }

GOAL="/goal Read ${PACKET} in full and execute it as the Grok lens of the ${SLICE} dual diamond. The packet is your only scope authority; establish the author's true change set yourself from file mtimes (find -mmin / stat), never from git diff, and ignore the Aug-17 rename churn. Verify claims against the working tree and RUN the listed test commands — a blocking lens must have run the live world. Write your verdict to ${REL}/reviews/${SLICE}-grok-verdict.md and print GREENLIGHT or BLOCK to stdout."

if [[ "${MODE}" == "--headless" ]]; then
  print "=== ${SLICE} Grok review (headless) starting $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
  "${HOME}/.grok/bin/grok" -p "${GOAL}" --permission-mode bypassPermissions </dev/null 2>&1 | tee -a "${LOG}"
  print "=== ${SLICE} Grok review exited $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
  exit 0
fi

# Visible window. The prompt goes via a temp file so quoting can never mangle it
# (PS/AppleScript quoting has broken inline prompts before — spine amendment 2).
PROMPTFILE="$(mktemp -t grok-${SLICE})"
print -r -- "${GOAL}" > "${PROMPTFILE}"
osascript <<APPLESCRIPT >/dev/null
tell application "Terminal"
  do script "printf '\\\\033]0;GROK REVIEW ${SLICE}\\\\007'; cd '${MISSION}'; echo '=== ${SLICE} Grok review lens ==='; echo '(this window IS the seat — closing it stops the review)'; echo; { echo \\"=== ${SLICE} Grok review starting \$(date -u +%FT%TZ) ===\\"; '${HOME}/.grok/bin/grok' -p \\"\$(cat '${PROMPTFILE}')\\" --permission-mode bypassPermissions </dev/null 2>&1; echo \\"=== ${SLICE} Grok review exited \$(date -u +%FT%TZ) ===\\"; } | tee -a '${LOG}'; rm -f '${PROMPTFILE}'"
  activate
end tell
APPLESCRIPT
print "launched ${SLICE} Grok review in a visible Terminal window; log: ${LOG}"
