#!/bin/zsh
# UI-02a rev2 — SAME session (heartbeat v3.2.0 §4). Guard against concurrent resumes.
set -u
MISSION_DIR="/Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3"
LOG="${MISSION_DIR}/docs/missions/2026-08-06-v3-programming/logs/UI-02a-codex.log"
SESSION="019ff0c9-2efa-7bc0-a6d5-9cd46587ab6a"
cd "${MISSION_DIR}" || exit 1
if pgrep -f "codex exec" >/dev/null 2>&1; then
  print "REFUSING: a codex exec is already alive." | tee -a "${LOG}"; pgrep -lf "codex exec" | tee -a "${LOG}"; exit 1
fi
print "=== UI-02a rev2 resuming ${SESSION} $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
codex exec resume "${SESSION}" \
  -c model='"gpt-5.6-sol"' -c sandbox_mode='"danger-full-access"' \
  "/goal UI-02a rev1 diamond: Grok APPROVED, Opus 5 CHANGES REQUESTED with ONE blocking. Read docs/missions/2026-08-06-v3-programming/reviews/UI-02a-rework-directive.md in full and execute it, plus reviews/ui02a-opus-rev1.md and reviews/ui02a-grok-rev1.md. YOUR SCORING WORK IS RIGHT and was hard-verified - the lens executed your formatter against two million random probabilities with zero property violations and proved the absence switch exhaustive by compiler - do NOT touch it. The rework is small: B1 blocking, the two raw NUL bytes at apps/v2-ui/lib/v3/adapter.ts:611 must be escaped as backslash-u-0000 so the file stops being binary to grep - the orchestrator RULED this in scope because the file is in your diff and it already caused a wrong conclusion during the handoff. Do NOT replace the NUL with a printable separator, it is load-bearing as a delimiter that cannot occur inside the model fields, and the key must be byte-identical before and after - prove that. Then close advisories A3 (the drawer guard cannot fail for an obvious drift that would regress to the exact 0.41000000000000003 RED this ticket started from), A1 (the banner names the Honesty drawer, which has no per-node section - it is the node drawer and the badge tooltip), and A7 (a test that passes only by IEEE-754 luck). Record the remaining advisories in the handoff as out of scope. Re-run EVERY gate and paste real output. Update the handoff in place, append to handoffs/UI-02a-progress.log, set the ticket to review and comment 'REWORK READY FOR HERMES REVIEW - UI-02a rev2'." \
  </dev/null 2>&1 | tee -a "${LOG}"
print "=== UI-02a rev2 exited $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
