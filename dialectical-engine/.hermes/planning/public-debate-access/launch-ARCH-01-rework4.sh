#!/bin/zsh
REPO=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine
BRIEF=$REPO/.hermes/reports/public-debate-access/packets/ARCH-01-rework4.md
SID=17d6551f-b33c-4a98-bad5-8082e402dbfa
LOG=$REPO/.hermes/planning/public-debate-access/logs/ARCH-01-rework4-claude.log
[ -f "$BRIEF" ] || { echo "FATAL: brief missing"; exit 1; }
cd "$REPO" || exit 1
echo "ARCH-01 ACCEPTANCE-COMMAND REPAIR (new thread, round 1 of 3) · mission public-debate-access · ticket t_f864a84b"
claude --resume "$SID" -p "New rework thread, round 1 of 3 - NOT round 4 of the S01 design thread, which closed at 3 of 3 with a PASS. Your brief is at $BRIEF - read it IN FULL and follow it exactly. BLOCKING: vitest 4.1.10 removed --reporter=basic and dies with a Startup Error before running any test; your four PLANs use it 32 times including EVERY cluster verification command, so no cluster in this mission is currently verifiable. Reproduce that yourself first. The mechanical fix is small. The part that matters is that this is the THIRD instance of the cause your own round-3 self-report named - 'verified a check EXISTS, never verified it DISCRIMINATES' - so the remedy is procedural: RUN every acceptance command you author, at authoring time, and record its observed pre-fix result beside it, plus an explicit category (FEATURE-ASSERTION must be RED pre-fix; REGRESSION-BASELINE and VERIFICATION-ONLY are legitimately GREEN). Handoff opens with SKILLS LOADED. SPECs FROZEN; PLAN edits and DECISIONS appends only; do not touch worktrees, the Router syncs those. Return control at REWORK READY FOR REVIEW or a genuine blocker." \
  --permission-mode bypassPermissions 2>&1 | tee "$LOG"
echo "=== ARCH-01 acceptance-command repair exited. Log: $LOG ==="
