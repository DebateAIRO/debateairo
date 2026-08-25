#!/bin/zsh
set -u
unsetopt BG_NICE

REPO="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
REL="docs/missions/2026-08-17-accounts-privacy-security/logs"
PACKET="${REL}/T1-claude-3worker-ab-artifact-authoring-packet.md"
PACKET_SHA="6e1f45085946be5024a88717337b95493ce04b7053197a57a17a5d666b5e17a2"
DESIGN="${REL}/T1-claude-3worker-ab-draft-packet.md"
DESIGN_SHA="a1cef6fb53a178607db9eb84036c7677d9aa0b8dffbb738b8da1873f4c047503"
PREFIX="${REPO}/${REL}/T1-3worker-ab-artifact-authoring"
MODEL="claude-opus-5"

cd "${REPO}" || exit 1
if [[ "$(shasum -a 256 "${PACKET}" | awk '{print $1}')" != "${PACKET_SHA}" \
  || "$(shasum -a 256 "${DESIGN}" | awk '{print $1}')" != "${DESIGN_SHA}" \
  || -n "$(git diff --cached --name-only)" ]]; then
  print "CODEX BLOCKED (custody): author/design/index preflight mismatch"
  print 74 > "${PREFIX}-claude.status"
  exit 74
fi

print "$$" > "${PREFIX}-wrapper.pid"
print "VISIBLE CLAUDE OPUS T1 THREE-WORKER A/B ARTIFACT AUTHORING"
print "Author packet SHA: ${PACKET_SHA}"
print "Approved design SHA: ${DESIGN_SHA}"
print "Started: $(date -u +%Y-%m-%dT%H:%M:%SZ)"

goal="/goal T1 THREE-WORKER A/B SUPPORT ARTIFACT AUTHORING. Read ${PACKET} completely and obey it as sole authority. Read the approved design ${DESIGN}. Write only the three named mission-log artifacts; do not execute the experiment, tests, workers, PostgreSQL or adjudicator. You may run node --check only. Verify custody and return exactly the packet handoff marker."

claude -p "${goal}" --model "${MODEL}" --permission-mode acceptEdits \
  --allowedTools 'Bash,Read,Write,Edit,Glob,Grep' --output-format json \
  > "${PREFIX}-claude-result.json" 2>&1
seat_rc="$?"
print "${seat_rc}" > "${PREFIX}-claude.status"
sed -n '1,260p' "${PREFIX}-claude-result.json"
exit "${seat_rc}"
