#!/bin/zsh
WT=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/prog-a-s01/dialectical-engine
SID=01a04d0e-67d4-7fc0-88e1-c16b7d4025bf
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/public-debate-access/logs/S01-CODE-redact-codex.log
[ -d "$WT" ] || { echo "FATAL: worktree missing at $WT"; exit 1; }
[ -f "$WT/.hermes/reports/public-debate-access/probes/leak-probe.mts" ] || { echo "FATAL: probes not synced"; exit 1; }
cd "$WT" || exit 1
echo "S01-CODE REDACTION FIX · Codex · ticket t_9e9e04ef · session $SID"
codex exec -s danger-full-access resume "$SID" "BLOCKING DEFECT IN YOUR SLICE, ticket t_9e9e04ef — post your handoff THERE. Peer review returned REWORK. This one is a real leak and it is worth understanding before you touch anything.

WHAT LEAKS. A blind Grok code review was asked to CONSTRUCT a case where an owner-only value reaches an anonymous reader, rather than to review the redaction. It built one, and the Router reproduced it independently. In packages/serve/src/index.ts, projectServeEdge assigns row.provenanceRef to THREE fields: strength.number.provenance_ref, strength.number.replay_handle, and the edge-level provenance_ref. They are the SAME STRING. Your redaction correctly replaces replay_handle with REDACTED_OWNER_ONLY and leaves the identical secret sitting on the other two. Measured end to end through your own publish and readPublicDebate path: owner_only_value_reached_anonymous_reader true, secret still present in JSON.stringify. There is a second, subtler arm on nodes: the original handle is ABSENT from the JSON yet RECONSTRUCTABLE from the published provenance_ref via a known prefix.

WHY YOUR TESTS WERE GREEN, AND THIS IS NOT A REPROACH. Your fixtures use provenance:edge, provenance:node, provenance:labeled-number — and replay_handle never shares any of those values. Production ALWAYS aliases them; your fixtures never do. The reviewer proved the point by aliasing your edge fixture to the production shape, which made the residual test FAIL against your current redaction, then restoring it, which made it pass. A fixture that cannot fail against production pins nothing. That is the same exclusive-provenance failure this mission has been chasing in acceptance commands, appearing this time in DATA.

BOTH PROBES ARE IN YOUR WORKTREE at .hermes/reports/public-debate-access/probes/ — leak-probe.mts and node-prefix-probe.mts. RUN THEM FIRST and see the leak yourself before changing a line. They are your RED.

WHAT ARCHITECTURE DECIDED, and your PLAN is already updated and byte-verified at your path. It re-derived the field table by VALUE PROVENANCE instead of by field name, and stated the rule: a field is REDACTED if and only if its producer assigns it a value identical to, or derivable via a known transform from, an already-redacted field's source value or any other owner-only ledger pointer — traced through the actual producer code, never inferred from the field's own name. Under that rule NodeSchema.provenance_ref, EdgeSchema.provenance_ref, LabeledNumberSchema.provenance_ref at all three sites, and NodeReviewSchema.provenance_ref are now REDACTED. MakerLineage and the AbstentionSchema register fields are COPIED but VERIFIED with real producer traces, not merely flagged. No row is left unsettled.

REMEDY SHAPE, which is the part that matters most: the three redaction functions move from spread-plus-override to FULL EXPLICIT PROJECTION — construct a brand new object naming every field, never spread the source. Spread-plus-override silently forwards a field the moment anyone adds one upstream; a projection forces a compile error instead. Architecture stated the limit honestly too: projection does not by itself stop an existing line from regressing, so the tests still matter.

ALSO IMPLEMENT S01-C2-9, the new residual test whose fixtures ALIAS the fields the way projectServeEdge actually does, plus the node prefix arm. RED before GREEN: it must fail against your current code and pass after.

DO NOT DISTURB what the review found sound and re-verified: the wholesale-spread mutant still failing C2-6/7/8, the legacy answer-only path with tree_included and nodes and edges undefined rather than false or fabricated, back-compat on the old shape, the cost_envelope and tier_provenance_ref exclusions, and mutations staying auth user. Re-run C1 through C4 under the three-run law, worst run is the verdict. Handoff opens with SKILLS LOADED, then READY FOR PEER REVIEW on t_9e9e04ef." \
  < /dev/null 2>&1 | tee "$LOG"
echo "=== S01-CODE redaction fix exited. Log: $LOG ==="
