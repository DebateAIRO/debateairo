# ARCH-01 — REDACTION-CORRECTNESS thread, ROUND 3 of 3 (FINAL)

**Ticket:** `t_3d2c21e9` (REDACT-02, BLOCKING). **Last round on this thread.** If it does not
close here it becomes a V DECISIONS PACKET row.
**Your file:** `S01/PLAN.md` + `DECISIONS.md`. SPECs FROZEN. No product code, no tests, no
worktrees — the coding seat implements.

Open your handoff with `SKILLS LOADED: <list>`.

## A second alias leak, reproduced by the Router

    node_provenance_ref     REDACTED_OWNER_ONLY
    base_score_provenance_ref REDACTED_OWNER_ONLY
    base_score_replay_handle  REDACTED_OWNER_ONLY
    base_score_source       <the raw artifact id>      <-- LEAKS
    secret_still_in_json    true
    VERDICT_SIGNAL: SOURCE_ALIAS_LEAK

`redactLabeledNumber` redacts `provenance_ref` and `replay_handle` and copies `source: n.source`
verbatim. **The PLAN specifies exactly that.** The code is faithful; the classification is wrong.

Probe at `.hermes/reports/public-debate-access/probes/source-alias-probe.mts`. Run it first.

## The finding is the MECHANISM, not the field. Read this twice.

Your own rule: *a field is REDACTED iff its producer assigns it a value identical to, or
derivable from, **an already-redacted field's** source value or any owner-only ledger pointer.*

**That rule is RECURSIVE — the already-redacted set is an INPUT to it.** Round 1 redacted
`node.provenance_ref`, correctly. The instant it did, `base_score.source` entered the class,
because it carries the same `raw_artifact_id`. Nothing re-ran the sweep against the enlarged set.

So this is not "one more field was missed." **A recursive rule was applied in a single pass.**
At the moment of round 1's sweep, `base_score.source` genuinely was NOT in the class. It became
a member *as a consequence of round 1's own decision.*

## What round 3 must produce

1. **Iterate to a FIXED POINT.** Sweep; if the redacted set grew, sweep again; repeat until a
   pass adds nothing. State in DECISIONS.md how many passes it took and what each one added —
   that number is the evidence the rule was applied recursively rather than once.
2. **Write the fixed-point requirement INTO the rule**, so the next seat cannot repeat this. The
   rule as written is correct but its application procedure was not stated, and an unstated
   procedure is how this recurred.
3. **N1, same pass:** `S01-C2-9`'s fixtures keep `source: "test source"` and do not mirror
   `source_ref = rawArtifactRef`, so the residual test cannot fail against production shape on
   this arm. Same fixture-realism defect as the original finding. The reviewer showed a
   production-shaped fixture DOES catch it.
4. **Close or declare the enumeration gap.** The reviewer said plainly it did not exhaustively
   enumerate every `sourceRef` writer beyond the judgement/serve path it cited, and could not
   establish the live DB frequency of the alias. Either close that enumeration or record it as
   an open gap with the exact query — do not let it evaporate.

## Do not re-derive what the re-review confirmed sound

Both original probes now report `NO_ALIAS_LEAK` and `NODE_PREFIX_SAFE`; the explicit projections
contain no source spreads; the upstream-new-field compile-error property holds via the `: Node`
return types; the `MakerLineage` and abstention-register COPIED-VERIFIED traces held at the
producers checked. Baselines 24/24, 3/3, 4/4, tsc clean — explicitly not condemned.

## Standing

- Reproduce first. RUN every command you touch against the CODER'S worktree, which holds the
  implementation; the main tree has no product change and would mislead you.
- Round 3 of 3. There is no round 4 on this thread.
- Say plainly what you could not do.

Return control at `REWORK READY FOR REVIEW` or a genuine blocker.
