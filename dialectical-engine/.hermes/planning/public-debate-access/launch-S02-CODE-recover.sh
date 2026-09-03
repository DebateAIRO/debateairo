#!/bin/zsh
WT=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/s02-code/dialectical-engine
SID=01a04eee-a632-75f3-9790-78ffb25e7b0a
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/public-debate-access/logs/S02-CODE-recover-codex.log
[ -d "$WT" ] || { echo "FATAL: worktree missing"; exit 1; }
cd "$WT" || exit 1
echo "S02-CODE RECOVERY · Codex · ticket t_83443bb1"
codex exec -s danger-full-access resume "$SID" "Checking in, not re-tasking you. Your session stopped producing output at 22:56 and sat at zero CPU for twenty-four minutes, so I killed the process and am resuming this same session. Nothing you wrote was touched: your worktree still has all sixteen files, including PublicDebatePageClient.tsx, PublicHonestyDrawer.tsx, publicAnswerExport.ts and the four render tests.

Three questions before you continue, and answer them first:

1. What were you doing when you went quiet? The last thing in your log was two apply_patch verification failures, one on DebateSplit.tsx looking for an onChallengeNode button block, and one on tests/unit/pda-s02-affordance-drift.test.ts looking for an expect on topbarInteractiveCount of 21. Were you stuck retrying those?

2. Are those two edits still outstanding, or did you land them another way? Tell me what state you believe each of your six clusters is in right now, from your own re-check rather than from memory.

3. Is anything about the task blocking you that you have not said? If an acceptance cannot discriminate, block again - you were right the last time and it cost you no rework rounds.

Then carry on where you left off. Nothing about the task has changed since your last packet. RED before GREEN on every feature-assertion, three-run law with the worst run as the verdict, and remember C6-1 and C6-2 state their acceptance in prose so no gate could check them - confirming those two actually discriminate is yours. Handoff opens with SKILLS LOADED, then READY FOR PEER REVIEW on t_83443bb1." \
  < /dev/null 2>&1 | tee "$LOG"
echo "=== S02-CODE recovery exited. Log: $LOG ==="
