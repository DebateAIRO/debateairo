# [unassigned] F-T7-ORACLE-EVALUATOR-PRECISION · the S1-1 oracle counts comment text as a definition

```yaml
state:
  ticket: F-T7-ORACLE-EVALUATOR-PRECISION
  risk_tier: medium
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [], readonly: [], forbidden: all_others, human_review: no }
  authority_epoch: 1
  rework_round: 0
  escalation_target: v_packet
```

Filed 2026-09-16 by RECORDS(CONT-T19) from BUILD(CONT-T7) (SDD ledger :90). Precision follow-up to
**F-T1-ORACLE-EVALUATOR** (D68 — V ruled a sound evaluator be built; this is what the built one still
cannot do).

Two measured imprecisions, both found by Task 7 while satisfying the oracle:
1. **It cannot model `Buffer.from`,** so a depth-bearing expression routed through it is invisible.
2. **It counts COMMENT TEXT as a definition.** Task 6 wrote a comment at `packages/serve/src/synthesis.ts:109`
   describing the 1–5 depth bound; the oracle read the comment as a **duplicate definition** of the depth
   law and went red. Task 7's remedy was to reword the comment — which is the wrong direction of repair
   and is recorded as such.

**Why this matters beyond the two cases:** an oracle that reads comments makes accurate documentation a
gate failure, so the cheapest way to keep it green is to document less. That is the opposite of what the
single-source depth law is for. STRENGTH: entailed.
