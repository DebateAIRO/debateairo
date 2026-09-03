#!/bin/zsh
WT=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/prog-a-s01/dialectical-engine
SID=01a04d0e-67d4-7fc0-88e1-c16b7d4025bf
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/public-debate-access/logs/S01-CODE-redact3-codex.log
[ -d "$WT" ] || { echo "FATAL: worktree missing"; exit 1; }
cd "$WT" || exit 1
echo "S01-CODE second alias fix · Codex · ticket t_3d2c21e9 · session $SID"
codex exec -s danger-full-access resume "$SID" "SECOND ALIAS LEAK, ticket t_3d2c21e9 — post your handoff THERE. Peer review returned REWORK again, and this one is subtle enough to be worth understanding before you touch code.

WHAT LEAKS. base_score.source still carries the exact raw-artifact-id that node.provenance_ref now redacts. Probe output: node_provenance_ref, base_score_provenance_ref and base_score_replay_handle all REDACTED_OWNER_ONLY, while base_score_source holds the secret and secret_still_in_json is true. Your redactLabeledNumber redacts provenance_ref and replay_handle and copies source verbatim — and the PLAN told you to. Your code is faithful; the classification was wrong.

WHY NOBODY MISSED IT THROUGH CARELESSNESS. The redaction rule is RECURSIVE: it redacts a field whose value is identical to, or derivable from, AN ALREADY-REDACTED FIELD'S source value. node.provenance_ref was not redacted when the first sweep began — it BECAME redacted as an output of that same sweep. The instant it did, base_score.source entered the class. But the sweep had evaluated every row against the set it STARTED with, not the set it ENDED with. At the moment base_score.source was checked, it genuinely was not yet in the class. A recursive rule was applied once instead of to a fixed point.

Architecture has now iterated to convergence and recorded the passes as evidence: Pass 0 started with two members; Pass 1 added four and STOPPED, which was the defect; Pass 2 added one more — LabeledNumberSchema.source on base_score and final_strength; Pass 3 added nothing. It also confirmed the EDGE site's .source is genuinely different and must NOT be redacted — a different producer, a StrengthSource enum. Do not over-correct there; there is now an acceptance that asserts the edge .source is untouched, and an arm that catches over-correction as well as under-correction.

YOUR WORK, small and precise. Redact LabeledNumberSchema.source on base_score and final_strength ONLY, leaving the edge strength site alone. Implement test D added to S01-C2-9, whose fixtures alias source_ref to rawArtifactRef the way production does. RED before GREEN: run source-alias-probe.mts first and see owner_only_value_reached_via_source true, then fix, then see it false. All four probes are in your worktree at .hermes/reports/public-debate-access/probes/ and all four must end clean: NO_ALIAS_LEAK, NODE_PREFIX_SAFE, no SOURCE_ALIAS_LEAK, and the hostile-copied-fields probe.

Then the full sweep again: mutants must still fail before restoration, and C1 through C4 under the three-run law with the worst run as the verdict. Do not re-litigate what review confirmed sound — the legacy answer-only path, back-compat, the cost_envelope and tier_provenance_ref exclusions, mutations staying auth user, and the explicit projections having no source spreads.

Your PLAN is synced and byte-verified at your path; the pre-dispatch gate reports no blocking defect. Handoff opens with SKILLS LOADED, then READY FOR PEER REVIEW on t_3d2c21e9." \
  < /dev/null 2>&1 | tee "$LOG"
echo "=== S01-CODE second alias fix exited. Log: $LOG ==="
