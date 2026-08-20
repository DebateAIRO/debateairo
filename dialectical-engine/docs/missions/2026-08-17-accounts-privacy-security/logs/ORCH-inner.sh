#!/bin/zsh
MISSION="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
REL="docs/missions/2026-08-17-accounts-privacy-security"
CODEX="/Applications/ChatGPT.app/Contents/Resources/codex"
LOG="${MISSION}/${REL}/logs/ORCH-codex.log"
cd "${MISSION}" || exit 1
printf '\033]0;CODEX-ROUTER (orchestrator)\007'
echo '=== Codex-Router — Main Orchestrator (accounts-phase1) ==='
echo '(this window IS the orchestrator seat)'
echo
{
  echo "=== ORCH starting $(date -u +%FT%TZ) ==="
  "${CODEX}" exec \
    -c model='"gpt-5.6-sol"' \
    -c model_reasoning_effort='"xhigh"' \
    -c sandbox_mode='"danger-full-access"' \
    "$(cat "${MISSION}/${REL}/logs/ORCH-goal.txt")" </dev/null 2>&1
  echo "=== ORCH exited $(date -u +%FT%TZ) ==="
} | tee -a "${LOG}"
