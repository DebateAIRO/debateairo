# [unassigned] F-T17-RUNTIME-EMISSION-SEAM · "the MAKER ABSENT line precedes any runtime emission" is unmeasured

```yaml
state:
  ticket: F-T17-RUNTIME-EMISSION-SEAM
  risk_tier: high            # acceptance-ceremony path (spine §9 floor)
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [], readonly: [], forbidden: all_others, human_review: no }
  authority_epoch: 1
  rework_round: 0
  escalation_target: v_packet
```

Filed 2026-09-16 by RECORDS(CONT-T19) from FIX(CONT-T17) round 1 (SDD ledger :145).

F-GROK's outcome (1) requires the absence to be announced **before the debate starts**. What is pinned
today is **source order** — the announce call precedes `createAcceptanceRuntime(` — with mutant **MF2**
as the falsifier. What is NOT pinned is the runtime claim: that the line reaches stdout before the
runtime EMITS anything.

**Honest statement of the gap, as the seat made it:** F2 had no RED because the property already held.
The source-order pin is an interim guard, and a refactor that keeps the call order while moving the
emission would pass it.

**Charge:** a runtime-injection seam on `runAcceptanceCeremony` so the ordering can be OBSERVED rather
than inferred from the source. Then MF2 can be retired for a real mutant. STRENGTH: entailed.
