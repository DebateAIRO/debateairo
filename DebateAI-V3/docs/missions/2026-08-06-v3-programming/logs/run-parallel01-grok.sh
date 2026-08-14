#!/bin/zsh
set -u
MISSION_DIR="/Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3"
LOG="${MISSION_DIR}/docs/missions/2026-08-06-v3-programming/logs/parallel01-grok.log"
cd "${MISSION_DIR}" || exit 1
print "=== PARALLEL-01 Grok disjointness review starting $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
"${HOME}/.grok/bin/grok" \
  -p "/goal Read docs/missions/2026-08-06-v3-programming/reviews/PARALLEL-01-disjointness-analysis.md in full and execute it. V has made this a STANDING RULE: parallel Codex sessions may only run when their file footprints are genuinely disjoint, and the orchestrator's determination must be independently reviewed by you before dispatch. Your job is to FALSIFY the orchestrator's claim that UI-02b and DEPTH-01 are safe to run in parallel. Read both ticket bodies yourself with hermes kanban --board debateai-v3 show t_35a2b742 and t_d5d1a650. Attack hardest at shared runtime state - both sessions share one working tree, one live acceptance stack on ports 55432/8790/8791/3000, and one kanban SQLite database. Note: apps/v2-ui/lib/v3/adapter.ts previously contained NUL bytes making plain grep skip it silently - that is fixed now, but use grep -a on that file to be safe. Write your verdict to docs/missions/2026-08-06-v3-programming/reviews/parallel01-grok-rev1.md and print it to stdout." \
  -m grok-4.5 --permission-mode bypassPermissions </dev/null 2>&1 | tee -a "${LOG}"
print "=== PARALLEL-01 Grok exited $(date -u +%FT%TZ) ===" | tee -a "${LOG}"
