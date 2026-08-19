#!/bin/zsh
# S3b REWORK 1 — same-terminal rework law: resume session 01a019e7, visible window.
# The packet is the only scope authority; this script carries no file list.
set -u
MISSION="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
REL="docs/missions/2026-08-17-accounts-privacy-security"
PACKET="${REL}/logs/S3b-rework1-packet.md"
LOG="${MISSION}/${REL}/logs/S3-codex.log"
cd "${MISSION}" || exit 1
[[ -f "${MISSION}/${PACKET}" ]] || { print "REFUSING: packet ${PACKET} missing" | tee -a "${LOG}"; exit 1; }
if pgrep -f "codex exec" >/dev/null 2>&1; then print "REFUSING: codex alive" | tee -a "${LOG}"; exit 1; fi

GOAL="/goal S3b REWORK 1. The dual diamond came back SPLIT: Grok GREENLIGHT, Opus BLOCK. Read ${REL}/reviews/S3b-opus-verdict.md IN FULL first — it carries the harness, file:line refs and every measured number — then ${PACKET} which is your contract. HEADLINE: your durability work is CONFIRMED GOOD by independent live verification (120-burst at unweakened production argon2id: 120 successes / 120 committed / 240 channels) and BOTH lenses independently reproduced your VR-10 mutants and certified them REAL. Contract items 1,3,4,5,6,7 HOLD and are NOT reopened — do not rework them. ONE item fails: item 2, the enumeration oracle. A new-address registration runs a SECOND global-audit-chain transaction via recordVerificationDelivery (two more argon2id hashes plus pg_advisory_xact_lock) that the duplicate branch never runs; and your timing test pauses the mail sender across the missing-address measurement wave only (test:827 pause, :843 release) while measuring the existing-address wave with mail live — so it certifies a configuration production never runs. With mail live the median gap is 185-205 ms and a single-threshold classifier hits 93.8-95.8 percent at N=8. Mocking ONLY recordVerificationDelivery moves the gap 189.7 to 0.7 ms: one call is the entire effect. Also note the range statistic passed while that classifier existed — ranges are not distributions. FIX IT by (a) equal post-response work on the duplicate branch, or (b) taking recordVerificationDelivery off the shared global lock or folding it into the token-minting transaction — my preferred direction, and CONTRACT WIDENING IS AUTHORISED for that restructure — or (c) proving N=4 and N=8 already overlap with mail LIVE. PROHIBITED: closing this by deferral or best-effort persistence, by making the test measure something production does not do, by widening the tolerance, or by weakening the arms until they blur. If the fix cannot be separated from S3d cooldown semantics, post CODEX BLOCKED instead of absorbing S3d. REPRODUCE FIRST: a RED test showing the reported defect against CURRENT code with mail live, before any fix. The new timing test must never pause mail across its own measurement window, must run at production auth-policy parameters, and must assert a SEPARATION STATISTIC outliers cannot rescue (best single-threshold classifier accuracy or AUC) at N=1, N=4 and N=8 — report each measured value. VR-10 STANDING RULE: reintroduce the asymmetry and show the NEW assertion goes RED. Also fold in F3 from the packet (beforeCommit now runs the DEK file write before appendAudit, widening the orphan-key window). Do NOT touch the rate limiter, S3a, crypto, the identity schema, the pendingMailDispatches Set, or the N=32 latency finding. Append progress lines to ${REL}/logs/S3b-progress.log. Do NOT commit or push. Post REWORK READY FOR PEER REVIEW with the measured classifier values when all gates pass."

PROMPTFILE="$(mktemp -t codex-s3b-rw1)"
print -r -- "${GOAL}" > "${PROMPTFILE}"
osascript <<APPLESCRIPT >/dev/null
tell application "Terminal"
  do script "printf '\\\\033]0;CODEX S3b REWORK 1\\\\007'; cd '${MISSION}'; echo '=== S3b REWORK 1 — Codex (resume 01a019e7) ==='; echo '(this window IS the seat — closing it stops the rework)'; echo; { echo \\"=== S3b REWORK 1 starting \$(date -u +%FT%TZ) ===\\"; codex exec resume 01a019e7-e36f-7131-b509-5dcb8d52b8b6 -c model='\\"gpt-5.6-sol\\"' -c model_reasoning_effort='\\"xhigh\\"' -c sandbox_mode='\\"danger-full-access\\"' \\"\$(cat '${PROMPTFILE}')\\" </dev/null 2>&1; echo \\"=== S3b REWORK 1 exited \$(date -u +%FT%TZ) ===\\"; } | tee -a '${LOG}'; rm -f '${PROMPTFILE}'"
  activate
end tell
APPLESCRIPT
print "launched S3b REWORK 1 in a visible Terminal window; log: ${LOG}"
