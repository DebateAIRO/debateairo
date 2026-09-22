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


---

## CORRECTION 2026-09-20 — the orchestrator's filing was wrong; this is the measured text

I filed this ticket from the gate's frames alone. The seat that investigated it measured the mechanism
and refuted part of what I wrote. Its text replaces mine; the original above is kept so the correction
is legible rather than silent.

> **Row A — `registration-database.test.ts:4237`. Re-file as a test defect, not
> a bounds question.** The `2` in `expected 3.484375 to be less than or equal
> to 2` is `tunedSecondaryPlateauCeilingMib`, a **test-local constant** inside
> `s3dPlateauChildSource()` at `tests/integration/registration-database.test.ts:875`.
> It is **not** one of the sealed values at `packages/register/src/auth-policy.ts:100,118,470,488`,
> and no register re-version can touch it.
>
> It is **not a leak**. The null samples are
> `[140.8,140.3,139.8,139.3,138.8,138.3,137.8,137.3]` — monotonically
> **falling**, in a constant 0.5 MiB step, across all eight forced major GCs.
> RSS is being returned to the OS. Meanwhile the thing the test actually guards
> is flat: `plateau_spread_mib=0.094`, `heap_total` constant at 22.9,
> `external` constant at 151.7, `waves_mib` settled at 128.6 for thirteen
> consecutive waves.
>
> The overshoot is consistent with a runtime change — the 2 MiB envelope was
> tuned against Node 22.23.1's page-release cadence and Node 26.8.2 releases
> more aggressively. But the **defect is version-independent**:
> `nullEnvelopeMib = max - min` is a two-sided spread used as a one-sided
> *retention* tripwire, so a monotone **decrease** trips a detector built to
> catch **growth**. Re-tuning `2` upward would leave that inversion in place and
> the detector would keep measuring the wrong direction. The fix is a
> growth-only envelope.
>
> **Row B — `tests/unit/registration.test.ts:293`. REFUTED. Remove it from this
> ticket.** The frame is not an overshoot; it is
> `Error: Command failed: … node --expose-gc …` at **60007 ms**, the
> `execFileAsync` `timeout: 60_000` at `:298` firing. The child is SIGTERM'd and
> the RSS assertion at `:314-317` is never evaluated. Measured two ways: run
> **alone** with nothing else on the machine it still dies at 60009 ms, so it is
> not suite contention; run out-of-band with a 420 s budget it **completes,
> exit 0, in 105.8 s**, producing curve `77.6 → 231.8 → 232.3 → 199.4 MiB`,
> `occupied === capacity` at 1 572 864, `allocated_bytes` 154140672 at every
> sample, and sources 3.42 M / 3.67 M / 3.43 M — **all four of the test's
> assertions would pass**, with the maximum 232.3 MiB against the sealed
> ceiling of 256.
>
> **Do the sealed bounds need re-measuring on Node 26 at all? No.** The
> published 256 MiB ceiling is correct on Node 26.8.2 with 23.7 MiB of headroom,
> measured. **This ticket should shrink to "give the S3c B4 harness a budget
> that matches the measurement it performs"** — it needs 106 s and is being
> killed at 60. Worth noting why: 0→50 % of the fill costs 5 s and 50→100 %
> costs 100.7 s, because filling the last slots of a 1 572 864-slot table per
> route by *random* IPv6 probing is coupon-collector work (~3.4–3.7 M
> insertions for 1.57 M slots). That tail belongs to the harness's fill
> strategy, not to Node's allocator, so a runtime change only shifts it by a
> constant. Raise the budget or make the fill deterministic.
>
> The sealed bounds stay sealed either way — but for the opposite reason to the
> one originally filed.
