# [unassigned] F-T4-UI-1 · `apps/ui/lib/types.ts` is a hand-written wire mirror, not the generated contract

```yaml
state:
  ticket: F-T4-UI-1-TYPES-HANDWRITTEN-MIRROR
  risk_tier: medium
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [], readonly: [], forbidden: all_others, human_review: yes }
  authority_epoch: 1
  rework_round: 0
  escalation_target: v_packet
```

Filed 2026-09-16 by RECORDS(CONT-T19) from BUILD(CONT-T4) §7 (SDD ledger :81–:83). **For V's UI
program.** Red on BOTH parents by blob hash — **not merge debt**, and authoring it is UI work outside the
Scope law.

Pinned by `tests/architecture/s14-contract.test.ts:14`. `apps/ui/lib/types.ts:1` opens
`export type DebateSummary = {` and **never imports `@debateai/contract`**, while `lib/api.ts` and
`lib/serverApi.ts` already pass their halves through `createContractClient`. So half the UI reads the
generated contract and half reads a hand-maintained copy of it.

**Options.** (a) Re-point `types.ts` at the generated client and delete the mirrored types. (b) If V's UI
deliberately keeps a local view model, then **the assertion is wrong**, and it should be replaced by one
that pins the boundary V actually wants — not silently deleted. STRENGTH: entailed.
