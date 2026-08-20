# S3c REWORK 3 — Opus lens verdict

Ticket t_86938dd1, board `accounts-phase1`. Author: Codex, session 01a019e7.
Reviewed at HEAD cff3dd5 + working tree. Blind lens. Round-2 blocker author under P8.

## VERDICT: **GREENLIGHT**

Plainly: **both published numbers are now true.** I booted the real stack myself and
measured under the published bound; I derived the exact-binomial curve independently
and all five points are the model's own values to the ppm; exactly one field in the
ruled row reads as a provisioning number and it is the largest memory figure in the
row, so no reader can arrive at a smaller one. The r2 contradiction is gone with no
comparable one left anywhere. Both one-unit mutants are RED and neither flakes.

C1 and C2 — the two findings I blocked on in r2 — are **fixed and independently
verified**. I have no findings.

---

## 1. The implementation did not move — this is why the review is narrow

```
apps/api/src/registration.ts   8f4f9fb4bdc95645bb05d9ff14812a66977a246b476f95fbf9ded015ede36de3
rework-2 hash (my own copy)    8f4f9fb4bdc95645bb05d9ff14812a66977a246b476f95fbf9ded015ede36de3
```

**Byte-identical.** `tests/integration/registration-database.test.ts` also carries its
rework-2 content and a 03:18:59 mtime — outside the r3 window entirely.

The r3 change set by mtime is exactly three files: `packages/register/src/auth-policy.ts`
(04:08:17), `tests/unit/registration.test.ts` (04:08:33), and the untracked
`reports/orphan-audit.json` (04:12:07). Test count 802 → **804**, matching the two new
assertions. **Out of scope confirmed untouched — byte-identical to HEAD:**
`packages/db/src/identity.ts` (T9), `apps/api/src/mail-channel.ts`,
`apps/api/src/index.ts`, `packages/crypto/src/index.ts`, `pnpm-lock.yaml`, `migrations/`.
T9 and `pendingMailDispatches` are not re-reported.

Because the limiter is byte-identical, every property both lenses established in r2
carries over untouched, and a spot-check of the frozen set is sufficient rather than a
re-run of the full property battery. Spot-check, from my own 804/110 run:

| frozen item | observed |
|---|---|
| B1 mail/rotation ceiling | 59/59 admitted, **3 victim mails, 3 token versions, 2 rotations**, owner verification `active` |
| route isolation (B2 cross-route) | register→verify **0/2000**, register→resend **0/2000**, both real calls ADMITTED |
| D1 property 2 (no laundering / no early forgiveness) | two colliding rotating sources admitted exactly **20 / 10 / 3** |
| B3 non-vacuous | real route calls **2/2 refused at `occupied=2/1 572 864`** |
| D3 | `raw_bucket_key_retained=false`, one bounded aggregate residual |
| S3b durability | commit gate `committed_at_response=1`; 100-burst `successes=100 committed_at_response=100`; F3 `before_commit_calls=0 persisted_accounts=0` |
| S3b equal-work oracle | AUC **53.1 / 64.8 / 52.8 %** vs the 80% ceiling |
| VR-3 | `audit_rows=642 forbidden_matches=0 actor_ciphertext_nonnull=0 chain_valid=true` |
| B4 RSS curve (in-suite) | 81.7 → 237.3 → … , `allocated_bytes` 154 140 672 throughout |

*Resolving my r2 note:* the equal-work oracle read 76.6% at N=1 in my r2 run and 53.1%
here. N=1 carries 8 samples per arm, so that was run-to-run noise, not drift. Closed.

---

## 2. C1 — 384 MiB is honest, and my own booted measurement proves it is not merely padding

I booted the stack myself in a **standalone process, not a vitest worker** — embedded
PostgreSQL, `migrate`, `PostgresIdentityRepository`, production argon2id (64 MiB),
`RegistrationService`, `FileUserDekStore`, ten durable registrations, then the limiter
driven to **exact** 100% occupancy with distinct single-/64 IPv6 sources. Two runs:

| | run 1 | run 2 |
|---|---|---|
| after boot | 152.4 | 139.9 MiB |
| after 10 durable registrations (10 rows persisted) | 175.3 | 162.8 MiB |
| **at 1 572 864/1 572 864 slots** | **327.1 MiB** | **315.3 MiB** |
| `allocatedBytes` | 154 140 672 | 154 140 672 |
| headroom to the published 384 | **56.9 MiB** | **68.7 MiB** |

Both under 384. Four independent measurements of the same quantity now exist:

| source | figure |
|---|---|
| Codex's booted worker | 295.0 MiB |
| **my booted run 2** | **315.3 MiB** |
| **my booted run 1** | **327.1 MiB** |
| my r2 vitest-worker measurement (published as the peak) | 368.7 MiB |
| **published provisioning bound** | **384 MiB** |

**The conservative choice was load-bearing, not cautious padding.** Had Codex published
from its own 295.0 — `ceil(295/32)×32 = 320` — my booted run at **327.1 MiB would have
breached it**. Taking `max(295.0, 368.7)` is what makes the number correct. This is the
strongest evidence in the round that the published figure is right.

Nor is it inflated to uselessness: 384 is **1.17×** my highest genuine booted process,
a normal engineering margin, and 12 × 32 MiB is a natural container size. Rounding
verified: `ceil(368.7 / 32) × 32 = 12 × 32 = 384`, and the test recomputes exactly that
(`tests/unit/registration.test.ts:390-394`) rather than asserting a literal.

### The row read as an operator, field by field

I walked the whole `rateLimitPolicy` row programmatically:

```
fields with operator_provisioning_field = true : 1
  -> sketch_design.booted_process_resident_bound.operator_provisioning_field
fields declaring per_process                   : 1
  -> sketch_design.booted_process_resident_bound.per_process
largest *_mib number anywhere in the row       : 384
published_provisioning_bound_mib is that max   : true
```

- **Exactly one** field says "provision this much", and it is the only place
  `per_process` appears at all — the r2 contradiction (`per_process: true` /
  `includes_process_baseline: true` sitting beside a `published_bound_mib` on an object
  whose `measurement` literal said *isolated*) is **structurally impossible now**:
  `per_process` was removed from the isolated object entirely
  (`auth-policy.ts:250-262`).
- The isolated object is renamed `isolated_limiter_resident_measurement`, its number is
  `isolated_measurement_ceiling_mib` (no generic "bound"), and it carries
  `includes_application_stack_baseline: false`, `operator_provisioning_field: false`
  and an `operator_instruction` the schema forces to match `/not.*provision/i`
  (`:88`, `:260`) — "do not use this isolated-process figure to provision an API process."
- Every remaining memory number is inside `flat_storage` and named as a component
  (`expiry_bytes`, `saturated_until_bytes`, `count_bytes`, `head_bytes`,
  `allocated_bytes/_mib`, `budget_bytes/_mib`), with `sizing_derivation` explaining
  147 MiB against a 160 MiB **typed-storage** budget. None reads as provisioning.
- **384 is the largest `*_mib` value anywhere in the row**, so even a careless reader
  who grabs the biggest number lands on the right one. The failure mode is closed from
  both directions.
- Schema literals agree with the values (`operator_provisioning_field: z.literal(false)`
  vs `z.literal(true)`, `includes_application_stack_baseline: z.literal(false)` vs
  `z.literal(true)`), and `sourceRef` is updated with provenance
  (`:322`, "S3c rework3 C1/C2 process provisioning bound and modelled collateral").

**No comparable contradiction survives anywhere in the row.**

*One observation, not a finding.* `booted_process_resident_bound.measured_100_percent_rss_mib
= 368.7` sits in an object whose `measurement` literal is
`booted_registration_process_rss_at_100_percent_slot_occupancy`, but 368.7 was my r2
figure taken inside a **vitest worker**, which carries harness overhead a booted process
does not. It over-states rather than under-states; the row records both inputs under
their own honest names (`worker_remeasurement_100_percent_rss_mib: 295`,
`independent_verification_100_percent_rss_mib: 368.7`); and my genuine booted runs
(315.3, 327.1) land between them, so the published bound is correct either way. Under
the packet's own standard — over-publishing conservatively is fine, under-publishing is
not — this is the right side of the line.

---

## 3. C2 — every beyond-threat point is the model's value, derived independently

I computed the model **without using the published formula text**, in a separate script,
via `-expm1(n·log1p(-p))` for full floating-point precision on `1-(1-p)^n`,
p = 1/262 144, refusal = P(X ≥ 1)² × 10⁶:

| sources | my exact computation | rounded | published | |
|---|---|---|---|---|
| 50 000 | 30 153.852032 | **30 154** | 30 154 | EXACT |
| 100 000 | 100 579.960691 | **100 580** | 100 580 | EXACT |
| 200 000 | 284 843.072878 | **284 843** | 284 843 | EXACT |
| 400 000 | 612 416.995061 | **612 417** | 612 417 | EXACT |
| 800 000 | 907 684.022013 | **907 684** | 907 684 | EXACT |

All five match. Note these are the **exact binomial**, not the Poisson approximation I
used in r2 — at three of the five points they differ from my r2 figures by 1 ppm and
the published values are the more correct ones. So these are genuinely the model's, not
a draw dressed as one, and not my numbers re-labelled.

The threshold premise is also right, and I checked it rather than accepting it: at full
source budget a single colliding source contributes `min(limit, limit) = limit` entries,
which saturates the slot, so the threshold is 1 for all three routes — which is what
makes `P(X ≥ 1)²` the correct expression for this curve.

The guarding test **recomputes the model in-test** and asserts equality
(`tests/unit/registration.test.ts:409-415`) rather than pinning literals, so the values
cannot drift from the model silently. The `residual` string now carries the modelled
percentages and states that refusal approaches total beyond 800 000
(`auth-policy.ts:308`) — the magnitude gap I raised in r2 is closed.

---

## 4. Mutants — both RED, three times each, no flake

| mutant | guard | rep 1 | rep 2 | rep 3 |
|---|---|---|---|---|
| provisioning bound 384 → **385** | `S3c C1 …` | RED | RED | RED |
| curve 50 000-point 30 154 → **30 155** | `S3c C2 …` | RED | RED | RED |
| *unmutated baseline* | `S3c C1 …` | GREEN | GREEN | GREEN |
| *unmutated baseline* | `S3c C2 …` | GREEN | GREEN | GREEN |

Both assertions are pure arithmetic over frozen literals — deterministic by
construction, so a one-unit tolerance is tight without being fragile. `auth-policy.ts`
restored to `feb4d69e35e2…` after every run.

## 5. Gates

`pnpm test` → **110 files / 804 tests passed**, 194.38 s, exit 0.
`pnpm typecheck` → PASS. `pnpm lint` → **28 architecture edges / 0 violations / 0 blocking**.

---

## Verdict

**GREENLIGHT.** The limiter is byte-identical to the implementation both lenses
verified in rework 2. The two numbers I blocked on are now true: I measured a booted
real-stack process at 327.1 and 315.3 MiB against a published 384 MiB — under it, and
above the 320 that Codex's own measurement alone would have produced — and I re-derived
all five beyond-threat points to exact agreement with the published model. The ruled
row has exactly one provisioning field, it is the largest memory figure in the row, and
every other figure names itself a component or explicitly disclaims provisioning use.

Nothing outstanding from me on this ticket.

---

*Read-only on product source apart from restored mutations. Tree verified byte-identical
to the r3 baseline (400-file sha256 manifest); `registration.ts` `8f4f9fb4bdc9…`
(= rework 2), `auth-policy.ts` `feb4d69e35e2…`, `identity.ts` `349dcb165f8a…` (= HEAD).
T9 and `pendingMailDispatches` confirmed untouched and not re-reported. No commit, no push.*
