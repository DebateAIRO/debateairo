# [unassigned] F-ENUMERATION-TIMING-GATES-SPIKE · the sign-up timing gates spike under full-suite load, and a spike is indistinguishable from the leak they exist to catch

```yaml
state:
  ticket: F-ENUMERATION-TIMING-GATES-SPIKE
  risk_tier: medium
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [], readonly: [tests/integration/registration-database.test.ts, packages/register/src/auth-policy.ts], forbidden: all_others, human_review: no }
  authority_epoch: 1
  rework_round: 0
  escalation_target: v_packet
```

Filed 2026-09-20 by the orchestrator, from the D79 closing gate.

**What these gates are for.** `registration-database.test.ts` carries several wall-clock gates that prove
a stranger cannot tell a registered email address from an unregistered one by how long the service takes
to answer — a user-enumeration side channel. The tolerance is the sealed
`basePolicy.verification.enumerationToleranceMs` = 100 ms, and it is a security property, **not a
threshold to be relaxed**.

**The observation.** At the first D79 full sample `b1c57927`, `S3b keeps live-mail N=1/N=4/N=8 PostgreSQL arms below
the separation ceiling` failed at `:5168` with `medianGapMs` **123.86 ≤ 100**. The measured gaps, five
arms per run:

| run | the five `median_gap_ms` values |
|---|---|
| `31f6e25b` (pre-upgrade) | 0.9 · 0.8 · 12.9 · 6.5 · 15.6 |
| `53a09658` quiet (D78 gate) | 4.0 · 4.6 · 5.0 · 3.4 · 9.8 |
| `b1c57927` (D79 gate) | 3.3 · 2.5 · **123.9** · 0.8 · **84.7** |
| `b1c57927`, the row alone | 1.5 · 0.8 · 0.6 · 30.3 · 7.4 — **PASSES** |
| `a61206dc` (the D79 closing gate, the next full run on the same host; row added 2026-09-21) | not extracted — the row is **not red** there (absent from `closing-runs/four-count-a61206dc-failures.txt`), and the permutation row of `F-S3D-SEPARATION-PERMUTATION-FLAKE` was red instead |

**Why it is a spike and not a leak.** A real timing channel is a property of the code and would show in
every arm and every run; here three of five arms in the failing run are under 4 ms, three earlier full
runs show no arm above 16 ms, and the row passes in isolation. The distribution is "almost always under
16 ms, occasionally tens or hundreds" — the shape of a scheduling stall landing inside one of the two
measurements, which is also what the sibling enumeration gate did under CPU contention at D78 (h)
(617 ms contended, 14.7 / 15.2 / 4.0 quiet). STRENGTH: entailed.

**Why it is not attributable to the D79 fixes.** The only product file outside `apps/ui` that the round
touched is `apps/runner/src/index.ts`, and `registration-database.test.ts` imports neither the runner nor
`obs-capture` (`grep` returns nothing). There is no path from the change to the measurement. STRENGTH:
entailed.

**Charge — do NOT raise the tolerance.** 100 ms is the property. Make the MEASUREMENT robust enough to
carry it:
- take the decision from repeated independent draws rather than one median per arm, so a single stalled
  sample cannot decide a security gate;
- or run these gates under a declared quiescence condition and record it with the number, since D78 (h)
  already established that a timing four-count is measured on a quiet host and that the project's own
  agents count as load;
- and report the observed gap alongside the verdict either way, so a future reader sees the distribution
  rather than a bare pass.

Related, same file, different mechanisms, both already filed:
`F-S3D-SEPARATION-PERMUTATION-FLAKE` (a per-run permutation ceiling that rejects ~6 % of the time) and
`F-AUTH-MEMORY-BOUNDS-MEASURED-ON-NODE-22` as corrected (a harness budget, not a bounds question). Three
tickets on one file is itself the finding: **this file's gates measure real properties with instruments
that have no noise discipline.**
