#!/bin/zsh
REPO=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine
BRIEF=$REPO/.hermes/reports/public-debate-access/packets/ARCH-01-rework3.md
SID=17d6551f-b33c-4a98-bad5-8082e402dbfa
LOG=$REPO/.hermes/planning/public-debate-access/logs/ARCH-01-rework3-claude.log
[ -f "$BRIEF" ] || { echo "FATAL: brief missing"; exit 1; }
cd "$REPO" || exit 1
echo "ARCH-01 REWORK ROUND 3 of 3 (LAST) · mission public-debate-access · ticket t_f864a84b"
claude --resume "$SID" -p "REWORK ROUND 3 of 3 - this is the LAST lawful round; round 4 does not exist and anything unresolved becomes a V DECISIONS PACKET row. Your brief is at $BRIEF - read it IN FULL and follow it exactly. One defect: S01-C1-2's acceptance test 'git diff --stat packages/contract/generated/' can never observe its own change because that directory is gitignored at .gitignore:7 - the Router ran it and it returns empty. Reproduce that yourself before fixing. The replacement must observe the actual effect (does the regenerated artifact carry the widened envelope) rather than the git index, and you must show it FAILS before regeneration and PASSES after - an acceptance test you have not seen fail is the same unverified thing you are being asked to fix. Handoff opens with SKILLS LOADED. SPECs FROZEN; S01/PLAN.md edit and S01/DECISIONS.md append only. Return control at REWORK READY FOR REVIEW or a genuine blocker." \
  --permission-mode bypassPermissions 2>&1 | tee "$LOG"
echo "=== ARCH-01 rework round 3 exited. Log: $LOG ==="
