#!/bin/zsh
WT=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/prog-a-s01/dialectical-engine
SID=01a04d0e-67d4-7fc0-88e1-c16b7d4025bf
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/public-debate-access/logs/S01-CODE-redact4-codex.log
[ -d "$WT" ] || { echo "FATAL: worktree missing"; exit 1; }
cd "$WT" || exit 1
echo "S01-CODE UNBLOCKED under V Row 7 · Codex · ticket t_3d2c21e9 / t_956bde4a · session $SID"
codex exec -s danger-full-access resume "$SID" "UNBLOCKED BY A V RULING — your seventh block, and correct like the six before it. The Router verified your finding at the SQL level and agrees: packages/serve/src/index.ts line 2095 binds node.provenance_ref to raw_artifact_id, line 2161 sets base_score.source from source_ref which the judgement producer sets from rawArtifactRef, and line 2079 sets base_score.provenance_ref from reduced_judgement_id. Production therefore aliases base_score.source with NODE.PROVENANCE_REF, and the PLAN's test D aliased it with BASE_SCORE.PROVENANCE_REF, a different id. You were right that implementing it literally would encode the very fixture-realism defect this round exists to remove.

THE REDACTION THREAD IS EXHAUSTED at round 3 of 3, so this went to V rather than to another architecture round. V RULED: the coding seat corrects it IN PLACE. That is a new precedent and it is recorded as V-DECISIONS-PACKET Row 7, which narrowly reverses the earlier rule that only PLAN.md's owner may author a fix to it. Read its bounds and stay inside them:
 - It applies to a DEMONSTRABLY FACTUAL error in a spec, one you can show is contradicted by the code, with the evidence on the ticket. It is not licence to disagree with design, scope, or approach.
 - You must RECORD THE DEVIATION ON YOUR TICKET so architecture ratifies it afterwards. Your correction is provisional until then.
 - You still may not change SPECs, scope, or acceptance CATEGORIES, and still may not commit, push, merge, or mark Done.

SO, CONCRETELY. Correct test D and its final_strength arm to the TRUE production shape: alias base_score.source with node.provenance_ref, and final_strength.source with the analogous production partner rather than with its own sibling provenance_ref. Keep the edge arm as specified — edge strength.number.source comes from a different producer, a StrengthSource enum, and must stay COPIED; the over-correction arm that asserts the edge .source is untouched stays exactly as it is. Post the corrected fixture shape and your SQL evidence on t_3d2c21e9 so architecture can ratify.

THEN FINISH THE ROUND: redact LabeledNumberSchema.source on base_score and final_strength ONLY. RED before GREEN — source-alias-probe.mts must show owner_only_value_reached_via_source true before your change and false after. All four probes in .hermes/reports/public-debate-access/probes/ must end clean. Mutants must still fail before restoration. C1 through C4 under the three-run law, worst run is the verdict.

Do not re-litigate what review confirmed sound: the legacy answer-only path, back-compat, the cost_envelope and tier_provenance_ref exclusions, mutations staying auth user, and the projections having no source spreads. Handoff opens with SKILLS LOADED, then READY FOR PEER REVIEW on t_3d2c21e9." \
  < /dev/null 2>&1 | tee "$LOG"
echo "=== S01-CODE redact4 exited. Log: $LOG ==="
