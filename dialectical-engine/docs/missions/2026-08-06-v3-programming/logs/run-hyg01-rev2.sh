#!/bin/zsh
set -u
MISSION_DIR="/Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3"
LOG="${MISSION_DIR}/docs/missions/2026-08-06-v3-programming/logs/HYG-01-codex.log"
SESSION="019ff620-9189-7af1-9116-74797062db9e"
cd "${MISSION_DIR}" || exit 1
if pgrep -f "codex exec.*(/goal|resume)" >/dev/null 2>&1; then print "REFUSING: codex seat busy" | tee -a "${LOG}"; exit 1; fi
print "=== HYG-01 rev2 resuming ${SESSION} $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
codex exec resume "${SESSION}" -c model='"gpt-5.6-sol"' -c sandbox_mode='"danger-full-access"' \
  "/goal HYG-01 rev1 diamond: Grok APPROVED, Opus 5 BLOCKING with three narrow items — the centerpiece is accepted by both, do not touch it. Read the newest orchestrator comment on t_4a1f8654 and reviews/hyg01-opus-rev1.md. B1: FIXED_SINGLE_ROOT_SERVE_VIOLATED has no witness but itself — the fixture exhausts the envelope and takes HARD_STOP so servedNodes is never consumed; add a second M=2 case that does NOT exhaust (queue composer/conformance doubles) asserting exactly one served member, or extract runner:816-827 as a pure function and unit-test it. The D-prime proof must go RED: widen servedNodes to both roots with the guard deleted. B2: 49 phantom .mjs files remain — QUARANTINE them (do not fix stale tests) and add a manifest-completeness assertion so the glob of apps/v2-ui/**/*.test.mjs must equal the runner manifest. B3: the control-byte guard scans the index only — switch to git ls-files -z --cached --others --exclude-standard so untracked files (including this ticket's own sources) are covered; the live NUL the lens found is already repaired by the orchestrator; also fold ADV-6 (dotfiles never scanned — extname of .gitignore is empty string). Fold ADV-5 with B2. Record ADV-1, ADV-2 (add the effectiveMakerCount ternary at runner:458 to the DR-162-A record — the deepest 2-assumption), ADV-3 in the handoff. Re-run every gate, paste real output, same session, back to review with 'REWORK READY FOR HERMES REVIEW - HYG-01 rev2'." \
  </dev/null 2>&1 | tee -a "${LOG}"
print "=== HYG-01 rev2 exited $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
