# [unassigned] F-T10-S6-CARRIER-ENUMERATION · the S6 suite of record enumerates 14 of 15 carriers

```yaml
state:
  ticket: F-T10-S6-CARRIER-ENUMERATION
  risk_tier: high
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [], readonly: [], forbidden: all_others, human_review: no }
  authority_epoch: 1
  rework_round: 0
  escalation_target: v_packet
```

Filed 2026-09-16 by RECORDS(CONT-T19) from FIX(CONT-T10) round 1's F4 (SDD ledger :105; the draft is
`agent-reports/cont-t10-fix1-v-sec-1.md` §7).

`serve.answer` became the fifteenth physical content carrier when V-SEC-1 landed. The suite of record
still counts fourteen, in three places:
- `tests/integration/s6-content-encryption-database.test.ts:4389` — the case title says *"all fourteen
  logical groups"*;
- `:4927` — `expect(envelopes).toHaveLength(14)`: `serve.answer`'s envelope is not round-tripped here;
- `:5056` — `expect(plaintextMutations).toHaveLength(14)`: `serve.answer`'s plaintext-write refusal is
  not proved here.

**Both guarantees ARE proved** — but in `tests/integration/serve-answer-content-encryption.test.ts`, the
handoff suite, not in the suite of record. Nothing is unprotected today. **The enumeration is the thing a
reviewer counts**, and a carrier that is absent from the count is a carrier nobody will notice losing.
STRENGTH: entailed.
