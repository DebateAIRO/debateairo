# [unassigned] F-W10-B-CONSUMER-PROVIDER-TRUNCATION · the consumer provider path cannot name a truncation

```yaml
state:
  ticket: F-W10-B-CONSUMER-PROVIDER-TRUNCATION
  risk_tier: medium
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [], readonly: [], forbidden: all_others, human_review: no }
  authority_epoch: 1
  rework_round: 0
  escalation_target: v_packet
```

Filed 2026-09-16 by RECORDS(CONT-T19) as **T-W10-B**, drafted in `task-15-report.md` §"Ticket drafts"
(SDD ledger :131). Class member **B** of W10.

`packages/evaluator/src/public-aggregate-provider.ts:95-149` uses a fixed `max_tokens`, an **appending**
`repairPacket`, and reports every failure as `CONSUMER_PROVIDER_FAILED`. **A truncation is therefore
retried identically** — the exact defect W10 fixed in the main gateway, still live on this path. Appending
to a response that was cut off for length makes the next attempt longer than the one that failed.

**Why it was not fixed inside W10:** `KNOWN_DOMAIN_CODES` is closed and **bidirectionally pinned** —
`apps/runner/src/index.ts:4556`, its twin at `apps/api/src/index.ts:242`, and generated membership in
`tests/unit/api-operational-error.test.ts`.

**Scope:** one new code through all three lists, plus the gateway's C1/C2 treatment (classify `length`,
re-send the ORIGINAL packet under a raised bound). STRENGTH: entailed.
