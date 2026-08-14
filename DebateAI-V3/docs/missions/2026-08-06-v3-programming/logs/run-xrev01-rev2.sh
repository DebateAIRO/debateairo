#!/bin/zsh
set -u
MISSION_DIR="/Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3"
LOG="${MISSION_DIR}/docs/missions/2026-08-06-v3-programming/logs/XREV-01-codex.log"
SESSION="019ff7d3-d99a-7212-9bd3-33271c577712"
cd "${MISSION_DIR}" || exit 1
if pgrep -f "codex exec.*(/goal|resume)" >/dev/null 2>&1; then print "REFUSING: codex seat busy" | tee -a "${LOG}"; exit 1; fi
print "=== XREV-01 rev2 resuming ${SESSION} $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
codex exec resume "${SESSION}" -c model='"gpt-5.6-sol"' -c sandbox_mode='"danger-full-access"' \
  "/goal XREV-01 rev1 diamond: Grok APPROVED, Opus 5 BLOCKING with three SMALL items — no paid run and no service restart needed, and your M=2 path was called the best work reviewed on this mission. Read the newest orchestrator comment on t_b8750870 and reviews/xrev01-opus-rev1.md. B-1: a mono-maker run serves 100% unjudged opinions with no mark and skips the depth guard (runner:878, :525, :1015 all gate on effectiveMakerCount>1), and the SHIPPED Hatchet bootstrap is permanently M=1 — take the conservative night-mode path: mono-maker runs get a TYPED DISCLOSURE mark with required record per the applyCriticUnavailableCap and DR-161 precedents (not a ban — DR-137 makes mono-model lawful; the tension is flagged for V), and the depth guard must be called UNCONDITIONALLY. B-2: deleting the depth-refusal call site leaves 484 tests green — add ONE integration test: depth-3 M=2 refuses NODE_REVIEW_COVERAGE_ENVELOPE_UNRATIFIED with ZERO MODEL_CALL rows persisted. B-3: handoff-only — your arithmetic is exact but the framing understates: present the full regime picture (XREV halves ratified headroom at EVERY depth; on the 3x basis NONE fit) and BOTH candidate member sets for V, 60/108/204/396/780 and 69/117/213/405/789, without recommending (AC-76 discipline: V picks). Also fold advisory A-2 (the bare catch launders PRODUCER_GRADING_FORBIDDEN into NODE_REVIEW_UNAVAILABLE — preserve the typed code per the POL-01 precedent). Re-run every gate, paste real output, same session, back to review with 'REWORK READY FOR HERMES REVIEW - XREV-01 rev2'." \
  </dev/null 2>&1 | tee -a "${LOG}"
print "=== XREV-01 rev2 exited $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
