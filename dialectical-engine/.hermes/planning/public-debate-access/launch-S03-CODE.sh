#!/bin/zsh
WT=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/prog-b-s03/dialectical-engine
PACKET=$WT/.hermes/reports/public-debate-access/packets/S03-CODE.md
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/public-debate-access/logs/S03-CODE-codex.log
[ -f "$PACKET" ] || { echo "FATAL: packet missing at $PACKET"; exit 1; }
[ -d "$WT" ]     || { echo "FATAL: worktree missing at $WT"; exit 1; }
cd "$WT" || exit 1
echo "S03-CODE · PROGRAMMING seat · Codex · ticket t_895ef432 · mission public-debate-access · worktree $WT"
codex exec "You are the S03-CODE programming seat on mission public-debate-access, board public-debate-access, ticket t_895ef432. Your complete goal packet is at $PACKET . Read that packet IN FULL before anything else, then follow it exactly. Your handoff MUST OPEN with a SKILLS LOADED line naming every skill you actually loaded - no seat reaches FULLY DONE without it and naming one you did not load is a fabrication finding; you cannot invoke a Skill tool, so read them as markdown files and say so. Implement the PLAN as written - it was independently reviewed and reworked twice; if a step is wrong, STOP and say so on the ticket rather than silently substituting your own design. RED before GREEN on every step, and the residual leak tests MUST fail against pre-fix code first or they pin nothing. Another lane is running in parallel: touch only your own file surface. Never push, never merge, never mark Done. Return control at READY FOR PEER REVIEW, a genuine blocker, or an IMPORTANT OPERATION." \
  -s danger-full-access < /dev/null 2>&1 | tee "$LOG"
echo "=== S03-CODE seat exited. Log: $LOG ==="
