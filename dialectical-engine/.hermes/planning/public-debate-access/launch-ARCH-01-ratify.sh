#!/bin/zsh
REPO=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine
SID=17d6551f-b33c-4a98-bad5-8082e402dbfa
LOG=$REPO/.hermes/planning/public-debate-access/logs/ARCH-01-ratify-claude.log
cd "$REPO" || exit 1
echo "ARCH-01 RATIFICATION of the V Row 7 provisional correction · t_956bde4a"
claude --resume "$SID" -p "RATIFICATION TASK, small and bounded — ticket t_956bde4a. Not a rework round; the redaction thread stays closed at 3 of 3.

WHAT HAPPENED. Your round-3 test D specified a fixture aliasing base_score.source with base_score.provenance_ref. The coding seat blocked, its seventh block, and it was right: production aliases base_score.source with NODE.provenance_ref. Verified at the SQL in packages/serve/src/index.ts — line 2095 binds node.provenance_ref to raw_artifact_id, line 2161 sets base_score.source from source_ref which the judgement producer sets from rawArtifactRef, and line 2079 sets base_score.provenance_ref from reduced_judgement_id. So the pair you named holds two DIFFERENT ids in production, and implementing it literally would have encoded the very fixture-realism defect test D exists to remove.

The thread being exhausted, this went to V. V RULED that the coding seat corrects it IN PLACE, recorded as V-DECISIONS-PACKET Row 7 — a narrow, new precedent letting the seat holding the evidence fix a DEMONSTRABLY FACTUAL spec error and disclose it, rather than encode a known fiction or spend a round on a one-line correction. The correction is PROVISIONAL until you ratify it. That is this task.

THE SEAT'S CORRECTION, now implemented: rawArtifactRef is assigned to BOTH inputNode.provenance_ref and inputNode.base_score.source — aliased ACROSS OBJECTS, which is the production shape — with the final_strength arm analogous and the edge arm unchanged, still asserting edge strength.number.source is NOT redacted. All four probes now report clean including SOURCE_ALIAS_SAFE; suites 25/25, 3/3, 4/4; typecheck clean.

YOUR TASK: verify the corrected pairing against the producers yourself, then either RATIFY it and update test D's spec in PLAN.md to match what is now implemented, or REJECT it with evidence. Note one thing while you judge: because the aliased partner now sits on a DIFFERENT OBJECT, the corrected test is strictly STRONGER than what you specified — and that cross-object aliasing is exactly why your one-pass sweep missed this field. Say in DECISIONS.md whether that changes anything about the fixed-point rule you wrote.

Keep it bounded: PLAN.md test D spec + a DECISIONS entry. No other PLAN edits, no product code, no tests, no worktrees. Handoff opens with SKILLS LOADED. Return control when ratified or rejected." \
  --permission-mode bypassPermissions < /dev/null 2>&1 | tee "$LOG"
echo "=== ARCH ratification exited. Log: $LOG ==="
