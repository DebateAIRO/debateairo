#!/bin/zsh
# Visible Claude Opus diagnostic seat for uncensored 103-registration timing.
set -u

REPO="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
REL="docs/missions/2026-08-17-accounts-privacy-security/logs"
PACKET="${REL}/T1-claude-deadline-diagnostic-packet.md"
PREFIX="${REPO}/${REL}/T1-deadline-diagnostic"
MODEL="claude-opus-5"

cd "${REPO}" || exit 1
print "$$" > "${PREFIX}-wrapper.pid"
print "VISIBLE CLAUDE OPUS T1 DEADLINE DIAGNOSTIC"
print "Packet: ${PACKET}"
print "Started: $(date -u +%Y-%m-%dT%H:%M:%SZ)"

goal="/goal T1 DEADLINE DIAGNOSTIC. Read ${PACKET} completely and obey it as the sole authority. Perform the frozen preflight, add only the temporary diagnostic test, run its exact three fresh-process repeats in the foreground, restore the test byte-for-byte, write all named receipts and the durable progress log, and return exactly the packet's final diagnostic marker. Do not implement product code, stage, commit, push, run the full suite, or use any agent/model."

claude -p "${goal}" --model "${MODEL}" --permission-mode acceptEdits \
  --allowedTools 'Bash,Read,Write,Edit,Glob,Grep' --output-format json \
  2>&1 | tee "${PREFIX}-claude-result.json"
seat_rc=${pipestatus[1]}
print "${seat_rc}" > "${PREFIX}-claude.status"
print "Claude seat raw status: ${seat_rc}"
print "Finished: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
exit ${seat_rc}
