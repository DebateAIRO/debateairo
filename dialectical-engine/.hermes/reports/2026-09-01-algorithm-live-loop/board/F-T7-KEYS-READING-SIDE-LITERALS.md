# [unassigned] F-T7-KEYS-READING-SIDE-LITERALS · the envelope version bytes are named on the write side only

```yaml
state:
  ticket: F-T7-KEYS-READING-SIDE-LITERALS
  risk_tier: high
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [], readonly: [], forbidden: all_others, human_review: no }
  authority_epoch: 1
  rework_round: 0
  escalation_target: v_packet
```

Filed 2026-09-16 by RECORDS(CONT-T19) from BUILD(CONT-T7) (SDD ledger :86–:90).

Task 7's packet ordered four sites routed to `EXPANSION_DEPTH_MAX`. **Three of them are AES-GCM cipher
envelope version bytes** and applying the remedy would have written byte 5 into every wrapped key. The
seat measured it, refused the remedy, and NAMED the constants instead, values unchanged:
`WRAPPED_KEY_VERSION_TAG = 1`, `CONTENT_ENVELOPE_VERSION_TAG = 1`, `SEMANTIC_ENVELOPE_VERSION_TAG = 2`
(`03f9edf4`). That refusal is the single most valuable thing any seat did in this continuation.

**What is left:** only the WRITE side is named. `packages/**/keys.ts` still carries **bare version
literals on the READING side at `:217`, `:235`, `:237`, `:415`, `:472`** — out of Task 7's contract, so
untouched. A version bump therefore has to be made in two places that no compiler relates to each other,
on a code path where a mismatch is a decryption failure.

**Charge:** route the reading-side comparisons through the same three named constants. Mechanical, but it
touches crypto, so it is `high` and wants its own RED. STRENGTH: entailed.
