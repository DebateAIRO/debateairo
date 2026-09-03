#!/bin/zsh
WT=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/rev-02/dialectical-engine
PACKET=$WT/.hermes/reports/public-debate-access/packets/REV-02.md
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/public-debate-access/logs/REV-02-grok.log
[ -f "$PACKET" ] || { echo "FATAL: packet missing at $PACKET"; exit 1; }
[ -d "$WT" ]     || { echo "FATAL: worktree missing at $WT"; exit 1; }
cd "$WT" || exit 1
echo "REV-02 · PLAN REVIEW seat · Grok · ticket t_7ee9aed5 · mission public-debate-access · worktree $WT"
~/.grok/bin/grok -p "You are the PLAN REVIEW seat on mission public-debate-access, board public-debate-access, ticket t_7ee9aed5. Your complete goal packet is at $PACKET . Read that packet IN FULL before anything else, then follow it exactly. NEW BINDING LAW: your handoff must OPEN with the line 'SKILLS LOADED:' naming every skill you actually loaded - no seat reaches FULLY DONE without it, and naming a skill you did not load is a fabrication finding. You are a BLIND lens in an isolated worktree; you did not write the plan and the plan's author did not write the SPEC. V has already approved the lane plan, so programming starts on whatever survives you - a step you let through unverifiable becomes the coder's problem and then QA's. Default posture REFUTE. Return control at your verdict, a genuine blocker, or an IMPORTANT OPERATION; otherwise keep working and keep the session alive and resumable." \
  -m grok-4.5 --permission-mode bypassPermissions 2>&1 | tee "$LOG"
echo "=== REV-02 seat exited. Log: $LOG ==="
