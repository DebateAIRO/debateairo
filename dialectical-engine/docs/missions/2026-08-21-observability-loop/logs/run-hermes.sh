#!/bin/zsh
# REQ-OBS-H1 — Hermes handoff-integrity gate. NOTE: no leading "/goal" (Hermes slash-parser ate it in MFA -> provider 500).
set -u
MISSION_DIR="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
LOG="${MISSION_DIR}/docs/missions/2026-08-21-observability-loop/logs/hermes-integrity.log"
cd "${MISSION_DIR}" || exit 1
print "=== REQ-OBS Hermes integrity gate starting $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
"${HOME}/.local/bin/hermes" --yolo -z \
  "Your goal packet is the file docs/missions/2026-08-21-observability-loop/goal-packets/hermes-integrity.md. Read it in full and execute it. It is your complete contract: an INTEGRITY-ONLY gate over three blind requirements artifacts (opus, grok, codex) — existence, RQ-id coverage presence, citations named, self-reports filed, handoff markers evidenced, blindness, file-contract sweep. You do NOT substantively review content and you edit nothing you review. Write your verdict to exactly docs/missions/2026-08-21-observability-loop/reviews/H1-integrity-hermes.md with one RESEARCH HANDOFF INTEGRITY line per seat and a final HERMES STAGE REVIEW PASS or CHANGES REQUESTED line, then stop." \
  </dev/null 2>&1 | tee -a "${LOG}"
print "=== REQ-OBS Hermes integrity gate exited $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
