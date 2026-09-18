# [unassigned] F-AUTH-MEMORY-BOUNDS-MEASURED-ON-NODE-22 · the registration service's resident-memory bounds were measured on Node 22.23.1; the declared runtime is now Node 26

```yaml
state:
  ticket: F-AUTH-MEMORY-BOUNDS-MEASURED-ON-NODE-22
  risk_tier: medium
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [], readonly: [packages/register/src/auth-policy.ts], forbidden: all_others, human_review: no }
  authority_epoch: 1
  rework_round: 0
  escalation_target: v_packet
```

Filed 2026-09-18 by the orchestrator, while moving the project's declared Node runtime from 22.23.1 to
26.8.2 (D78).

**The fact.** The sealed auth policy carries two resident-memory measurements whose schema pins the
runtime they were taken on: `isolated_limiter_resident_measurement.runtime` and
`booted_process_resident_bound.runtime` are `z.literal("node_v22.23.1_darwin_arm64")`
(`packages/register/src/auth-policy.ts:100,118`, values at `:470,488`). They record the RSS of the
registration process at 100 % slot occupancy and the published provisioning bound derived from it. They
are provenance — a fact about when and where the number was measured — and were deliberately left
untouched by D78: rewriting the literal would claim a measurement nobody took. STRENGTH: entailed.

**Why it matters.** The provisioning bound is what an operator sizes the host by. The process now runs on
Node 26, whose heap and startup footprint differ from Node 22's; the bound may still hold, may have slack,
or may be short. Nobody knows until it is re-measured on the declared runtime.

**Charge.** Re-run the two measurements on Node 26.8.2 with the same procedure the policy describes (the
`measurement` and `stack` literals name it), seal a new auth-policy row version carrying
`runtime: "node_v26.8.2_darwin_arm64"` and the new numbers with the old ones kept as history, and move
the schema literal with it. Sealed rows are immutable per version (`F-REGISTER-HISTORICAL-IMPORT-CAP`
applies to the acceptance register; check which mechanism seals this family before choosing a path).
