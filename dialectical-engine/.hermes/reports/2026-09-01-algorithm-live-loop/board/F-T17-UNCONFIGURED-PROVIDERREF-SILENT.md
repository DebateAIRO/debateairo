# [unassigned] F-T17-UNCONFIGURED-PROVIDERREF-SILENT · `announceAbsentMakers` skips an unconfigured providerRef silently

```yaml
state:
  ticket: F-T17-UNCONFIGURED-PROVIDERREF-SILENT
  risk_tier: high            # acceptance-ceremony path (spine §9 floor)
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [], readonly: [], forbidden: all_others, human_review: no }
  authority_epoch: 1
  rework_round: 0
  escalation_target: v_packet
```

Filed 2026-09-16 by RECORDS(CONT-T19) from FIX(CONT-T17) round 1 (SDD ledger :145).

`announceAbsentMakers` is keyed by `providerRef`. A providerRef that is not configured is skipped
**without a word** — which is the exact failure mode F-GROK existed to abolish, one level further in.

**It cannot fire today, and the record should say why:** both entry paths (the ceremony and the boot)
start only CONFIGURED relays, so an unconfigured ref never reaches the announcer. The defect is latent,
not live.

**Charge:** make the skip loud, or assert at the call site that the ref set is exactly the configured set.
This is cheap and it closes the shape rather than the instance — the lesson of this whole ticket family
is that a silent skip survives until someone changes the caller. STRENGTH: entailed.
