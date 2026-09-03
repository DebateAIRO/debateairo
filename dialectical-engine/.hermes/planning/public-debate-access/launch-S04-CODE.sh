#!/bin/zsh
WT=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/s04-code/dialectical-engine
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/public-debate-access/logs/S04-CODE-codex.log
[ -d "$WT" ] || { echo "FATAL: worktree missing"; exit 1; }
cd "$WT" || exit 1
echo "S04-CODE · Codex · ticket t_76050188"
codex exec -s danger-full-access "You are the S04-CODE seat on ticket t_76050188. Read your SKILLS first and open your handoff with SKILLS LOADED.

WHERE YOU ARE AND WHY IT MATTERS. Your worktree is /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/s04-code/dialectical-engine, detached at f8b9d5f. That commit is the FINISHED FEATURE: S01's redacted envelope, S03's Your/Public Debates tabs, and S02's anonymous detail page are all merged into it. Your slice was deliberately held blocked until they landed, because S04-C2-1 verifies state AFTER S01 and S02 land and S04's PLAN line 256 expects a count only after they land. Deps installed, contract generated. Read docs/missions/public-debate-access/slices/S04/PLAN.md IN FULL rather than trusting this summary.

I MEASURED YOUR BASE STATE SO YOU DO NOT HAVE TO GUESS. C1 is genuinely RED, No test files found exit 1, because tests/unit/pda-s04-node-carrier-audit.test.ts is yours to write. C2 is GREEN at 5 passed and C3 is GREEN at 4 passed - both are REGRESSION-ONLY with no file surface, they are correctly green and must STAY green, so do not touch them.

YOUR ONE STALE INSTRUCTION, and you may fix it yourself. Ticket t_5d00506b: your evidence checklist items 3 and 3b are STALE. They ask you to check whether COPIED-AND-FLAGGED provenance and lineage fields are safe, but S01 already answered that by tracing each field to its producer - four provenance_ref variants are REDACTED, and MakerLineage plus the AbstentionSchema register fields are COPIED-VERIFIED with cited traces. So the items ask you to re-derive a settled question and describe a disposition that no longer matches the PLAN. Under the standing rule you MAY correct a demonstrably factual error in PLAN.md IN PLACE, provisionally, with your evidence on t_5d00506b for Architecture to ratify - EXCEPT that you may not change design, scope, or acceptance CATEGORIES. Replacing a stale re-derivation request with a pointer to S01's settled value-provenance rule and its field table is factual. Converting an item into a different KIND of check would not be. Judge it, and if it crosses that line, block and say so.

WHAT IS NOT YOURS. S04-C4 has no automated command BY DESIGN - it is QA's verdict, and your C4-1 job is to ASSEMBLE the evidence set QA needs so QA does not re-derive it, not to render the verdict. Checklist item 2, the disagreement bag, is already CLOSED - S01-C2-1 sets it to null unconditionally for every published node. Item 3's open half, whether maker_lineage.provider_ref and node/edge provenance_ref are opaque-safe in PRACTICE, is resolved by reading ACTUAL SAMPLE VALUES and is explicitly QA's, not yours - record it as such.

ONE LIVE FACT WORTH KNOWING. The feature is now running and verified: the tabs work on localhost:3000, the mutual-exclusion negative probe went from 1 to 0, and an end-to-end anonymous fetch of a real published debate returned zero mutation controls and zero owner-only markers. But there is exactly ONE published debate in this database and it is a LEGACY publication without tree_included, so the argument-tree path has never been observed live. If your audit can say anything useful about that gap, say it.

HOW TO WORK. RED before GREEN on C1. Three-run law, worst run is the verdict. Rework rounds max 3. If an acceptance cannot discriminate, BLOCK AND SAY SO - four seats have blocked on this mission and all four were right, and none of them spent a rework round for it. No push, no merge, no commit. Self-report to .hermes/reports/public-debate-access/agent-reports/S04-CODE-codex.md inside this worktree. Handoff opens with SKILLS LOADED, then READY FOR PEER REVIEW on t_76050188." \
  < /dev/null 2>&1 | tee "$LOG"
echo "=== S04-CODE exited. Log: $LOG ==="
