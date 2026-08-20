# S3c-r2 Grok-lens verdict

**GREENLIGHT**

Ticket t_86938dd1 / S3c rework 2 (flat typed storage, measured RSS bound,
exact-binomial operator row). Blind lens: this file does not cite or
open the other diamond. Scope authority is
`reviews/S3c-r2-review-packet.md` only. True change set is from
`find -mmin` / `stat` / sha256 (not `git diff` as the inventory oracle).
`git diff --check` was used only as the packet whitespace gate.
Aug-17 rename churn, `node_modules`, `.next`, `.pgdata`, toolchain
noise, and sibling-lens `s3c-r2-opus-mem.mts` (mtime 03:33, during this
review) are ignored. Author progress-log numbers are claims; live
numbers below were produced by this lens against the working tree and
real embedded PostgreSQL. Temporary VR-10 mutants were applied one at a
time and restored; `apps/api/src/registration.ts` remains byte-identical
to the 03:19 pre-mutant. After that restore, the author folded C1/C2
into `auth-policy.ts` and `tests/unit/registration.test.ts` at 04:08
(new mtimes). Those two files were **not** rolled back — that would
erase later author work. They were re-hashed and re-tested at handoff.
Nothing was committed or pushed.

**T9 (`t_6ff49601`, resend deadlock / untyped-500) is out of scope.**
The author did not touch it. Not re-reported.

## Live mtime inventory (S3c-r2)

First `stat` at 03:36 EEST, 2026-08-20. Handoff re-stat at 04:14 EEST.
HEAD `cff3dd553cbce2d66160df6b8cfd49686ece7217`. Author r2 limiter
window is **03:18–03:23 EEST**. Author C1/C2 fold-in window is
**04:08 EEST**. Live hashes below are the handoff working tree.

S3c-r2 product / test set (in-window **and** content differs from the
HEAD blob):

| mtime (EEST) | sha256 | path |
|---|---|---|
| 03:18:59 | `0db439026352cbae…` | `tests/integration/registration-database.test.ts` |
| 03:19:59 | `8f4f9fb4bdc95645…` | `apps/api/src/registration.ts` |
| 04:08:17 | `feb4d69e35e20645…` | `packages/register/src/auth-policy.ts` |
| 04:08:33 | `87490dd6b032589b…` | `tests/unit/registration.test.ts` |

`packages/db/src/identity.ts` mtime 03:00:19 is a **touch only** — HEAD
blob `82ad32e8` equals the working-tree `git hash-object`. Frozen S3b
content. T9's `prepareVerificationResend` surface was not rewritten.

Frozen packet surfaces (HEAD blob == working tree):

| mtime | HEAD blob | path |
|---|---|---|
| 2026-08-19 20:06:46 | `e6df7755` | `apps/api/src/mail-channel.ts` |
| 2026-08-19 20:06:46 | `34849391` | `packages/db/src/schema.ts` |
| 2026-08-19 20:06:46 | `40a6d624` | `packages/crypto/src/index.ts` |
| 2026-08-19 16:42:18 | `201228e2` | `pnpm-lock.yaml` |
| 2026-08-19 20:06:46 | `1057927a` | `migrations/0031_registration_verification.sql` |
| 2026-08-19 22:23:19 | `05465d30` | `migrations/0032_registration_audit_erasure_checks.sql` |

No `t_6ff49601` / untyped-500 / resend-deadlock files appear in the
author mtime set.

## Live gates

| command | result | capture |
|---|---|---|
| `pnpm typecheck` | exit 0 | `{SCRATCH}/pnpm-typecheck.log` |
| `pnpm test` | **802 tests / 110 files**, 201.39 s, exit 0 | `{SCRATCH}/pnpm-test.log` |
| `pnpm lint` | **28 edges / 0 violations**, source `blocking: []`, exit 0 | `{SCRATCH}/pnpm-lint.log` |
| `git diff --check` | exit 0 | `{SCRATCH}/git-diff-check.log` |

Claimed 802/110 reproduces on this tree. No sibling-lens test files
inflated the suite. Claimed 193 s was 201 s here; count, not wall, is
the gate.

S3b durability + equal-work and VR-3 re-run on the restored tree
(`{SCRATCH}/s3b-oracle-durability.log`, `{SCRATCH}/vr3.log`, targeted
re-run `{SCRATCH}/s3b-oracle-durability-targeted.log`):

- commit-gate: settled_while_commit_blocked=0, committed_before_release=0, committed_at_response=1
- durability burst: concurrent=100 successes=100 committed_at_response=100
- equal-work live-mail N=1/4/8: median_gap 0.3 / 31.8 / 36.3 ms (ceiling 100); AUC 68.8 / 63.7 / 57.5% (ceiling 80)
- VR-3 (full suite): audit_rows=642 forbidden_matches=0 chain_valid=true; targeted re-run audit_rows=468 (fewer preceding tests), same zeros

## PRIMARY QUESTION 1 — memory is bounded where it was measured, and past that envelope

Shipped storage (`registration.ts:72-116`, `230-231`): four preallocated
typed arrays. Independent arithmetic:

- 1 572 864 `Uint8` counts + 1 572 864 `Uint8` heads
- 1 572 864 `Float64` saturation deadlines = 12 582 912 B
- 17 301 504 `Float64` expiries (524 288 × (20+10+3)) = 138 412 032 B
- **allocated = 154 140 672 B (147 MiB)** against the ruled 160 MiB
  typed-storage budget (`auth-policy.ts:214-226`)

Minimum row width 189 825 still forces power-of-two 262 144, so
**524 288 slots/route is the correctly priced choice.** Occupancy model:
n = 1 600 000 → E[occupied] = 99.78% of 524 288; n ≈ 3.4 M is
coupon-collector for the last slots.

### Isolated production-capacity RSS (this lens)

Fresh isolated Node process, `--expose-gc`, shipped
`InProcessAuthRateLimiter` at bucket_capacity 524 288, distinct
single-/64 IPv6-style sources, same fill algorithm as the in-suite
harness but **not** the author's recorded numbers
(`{SCRATCH}/pq1-rss-curve.log`):

| occupancy | RSS MiB | occupied | sources register / verify / resend |
|---|---|---|---|
| 0% | **94.0** | 0 | 0 / 0 / 0 |
| 25% | **250.1** | 393 218 | 75 388 / 75 422 / 75 435 |
| 50% | **250.3** | 786 434 | 181 709 / 181 582 / 181 818 |
| 100% | **249.6** | 1 572 864 | **3 416 876 / 3 669 727 / 3 434 706** |

Max 250.3 MiB ≤ published 256. Flat from 25%: spread **0.7 MiB**.
Allocated bytes stay 154 140 672 at every point. Heap used stays
~12 MiB; the resident jump is the typed-array external/arrayBuffers
~151 MiB plus V8 baseline, not per-slot JS objects.

In-suite curve from this lens's `pnpm test`
(`{SCRATCH}/pq1-rss-suite.log`): **83.9 / 238.5 / 239.0 / 239.3**.
Author isolated 93.7 / 249.5 / 250.0 / 248.6 and in-suite 81.4 / 236.6
/ 237.1 / 237.4 sit on the same plateau. Sources at 100% are
deterministic under hash key `0xb4` and match the author's
3 416 876 / 3 669 727 / 3 434 706 exactly.

### Past the tested envelope

Three fill/drain/refill cycles at `windowMs+` then refill to 100%:
RSS **249.7 / 249.7 / 249.8** — no creep. Simultaneous 30 000 × 3-route
burst after expiry: 90 000 admitted (prior population expired; correct
sliding-window reuse), RSS 249.9. Final RSS 249.9, bound holds.

### Whole-process retainers

- `refusalAggregates`: `Map` capped at three routes
  (`registration.ts:88`, `247-269`). Not occupancy-proportional.
- Slot state: typed arrays only. `retained_objects_per_occupied_slot: 0`
  (`auth-policy.ts:226`).
- `pendingMailDispatches` / `pendingRefusalAuditFlushes` live on
  `RegistrationService`, not the limiter. Walk under load
  (`{SCRATCH}/pq2-d3-graph.log`): pendingMail=0, pendingAudit=0.
  Mail set is in-flight-concurrency-proportional, not slot-occupancy-
  proportional, and is deleted in `finally` (`registration.ts:503`).
- Constructor rejects `admissionPerSource > 255`
  (`registration.ts:99-101`). Live max `Uint8` count under 20/10/3
  flood = 20; max head = 0 after a burst (head reset on empty).
  Cannot wrap at the ruled limits.
- `Float64` expiry: `expiresAt <= now` is expired
  (`registration.ts:150`). At-limit key refused at `windowMs-1`,
  admitted at exactly `windowMs` on all three routes
  (`{SCRATCH}/pq2-d1-window.log`).

### Is 256 MiB an honest per-process operator figure?

On the 03:21 row it was labelled `storage_resident_bound` /
`published_bound_mib: 256` / `per_process: true`. The 04:08 fold-in
splits that (`auth-policy.ts:250-277`):

- `isolated_limiter_resident_measurement` — ceiling 256 MiB,
  `operator_provisioning_field: false`, instruction not to provision
  an API process from it. This lens's isolated curve (94.0 / 250.1 /
  250.3 / 249.6) still sits under that ceiling.
- `booted_process_resident_bound` — `published_provisioning_bound_mib:
  384`, measured 368.7 (independent_verification) / 295 (worker),
  `operator_provisioning_field: true`.

This environment still cannot boot `apps/api/src/main.ts` (Hatchet
token, Postgres URL, secret files). **This lens did not independently
produce 368.7 or 384.** C1 unit tests pass as schema/arithmetic on
those published numbers (`{SCRATCH}/pq2-unit-handoff.log`, 22/22).
The isolated bar is the measured one; the booted provisioning figure
is now labelled as such rather than implied by 256.

The 3.4 M-sources-to-100% figure is cheap in IPv6: 3 416 876 addresses
is **1.85 × 10⁻¹³ of one /64**. An attacker who can source a /64 can
fill the sketch. The bound holding at 256 MiB is what makes that cheap
fill operationally acceptable.

## PRIMARY QUESTION 2 — r1 properties survived the storage rewrite

Re-driven on the new arrays, not assumed from r1.

**D1 property 1 — bounded memory.** 250 000 mixed-route requests →
occupied 413 980 / 1 572 864, array length 1 572 864, max count 7
(≤ register 20), allocated 154 140 672. 200 k single-source flood:
refused 199 980, occupied 2 / 1 572 864.

**D1 property 2 — never forgiven early.** Register/verify/resend: burst
to 20/10/3, 21st refused; still refused after 8 000-source churn and at
`windowMs-1`; admitted at exactly `windowMs`.

**D1 property 4 — only over-counts.** Colliding pair shares one budget
(allowed = limit, remainder refused) on all three routes. Sliding
straddle: 10 + 10 at half-window stays blocked; at `windowMs` exactly
10 more, not 20.

**Exact 20/10/3 window bound** holds at the limiter and on the real
Postgres path. Unit B3: post_limit_allowed=0, occupied 2 / 1 572 864
before saturation. Integration B3: real route calls
AUTH_RATE_LIMITED 2/2 on each route, occupied 2 / 1 572 864.

**12-cell collateral** (3 hash keys × 2 000 innocents, this lens's
`pnpm test`; `{SCRATCH}/pq2-collateral.log`). Means in ppm:

| | 1 | 5 | 10 | 20 |
|---|---|---|---|---|
| register | 0 | 0 | 0 | **4667** (3000–5500) |
| verify | 0 | 0 | **7167** (7000–7500) | 4833 (3500–5500) |
| resend | 0 | 4667 (3000–6000) | 7833 (6500–10000) | 5667 (5000–6000) |

All 12 means < 10 000 ppm. One resend-10 key hit 20/2 000 = 10 000 ppm
exactly, still `<=` the 1% ceiling. Cells did not move past the sizing
target. Theoretical register-20 = verify-10 = resend-5 = 5 395.83117
ppm (see binomial below).

**Route isolation, all six directions** (20 000 full-budget attackers,
2 000 innocents; `{SCRATCH}/pq2-six-direction.log`): **0 refused** in
register→verify/resend, verify→register/resend, resend→register/verify.

**B1 mail/rotation ceiling.** Integration, N=20 over an hour: 59/59
attacker admissions, **3 victim mails, 3 token versions, 2 rotations**,
owner resend admitted, owner verifies `active`.

**B3 pre-saturation still non-vacuous.** One-source flood refused at
20/10/3 with occupied ≪ capacity. Memory mutant (below) is the
orthogonal RSS proof; the no-per-key class of mutant remains the B3
guard from r1 and was not re-litigated as an original defect.

**D3.** After 25 consumes of a distinctive raw IP: 0 hits in slot state.
After `aggregateRefusal`: **exactly one** occurrence,
`root.refusalAggregates.MapVal.source.ip`. Service walk sees the same
single residual through `dependencies.limiter`.
(`{SCRATCH}/pq2-d3-graph.log`)

## Exact-binomial model and beyond-threat curve

Independent Decimal log-space binomial
(`{SCRATCH}/binomial.py`, `{SCRATCH}/binomial.log`).
Model: X ~ Binomial(20 000, 1/262 144);
threshold = ceil(limit / min(rps, limit));
ppm = P(X ≥ threshold)² × 10⁶.

Every published 12-cell theoretical ppm matches this derivation to the
printed decimals (register 1/5/10/20 = 0 / 0.000002 / 7.652853 /
5 395.83117; verify and resend identically as published). The
exact-binomial replacement for the r1 one-key draw is **correct**.

Beyond-threat on the 03:21 row was a one-key 2 000-innocent sample
(50 k → 2.55%, 800 k → 91.4%). The 04:08 fold-in replaces it with
`model: exact_binomial_two_independent_rows_full_budget` and ppm
30 154 / 100 580 / 284 843 / 612 417 / 907 684
(`auth-policy.ts:296-307`). Those integers match this lens's
independent Decimal derivation **and** the C2 JS `Math.round(P(X≥1)²×1e6)`
guard (`{SCRATCH}/binomial.log`, `{SCRATCH}/pq2-unit-handoff.log`).
Residual now states 3.0154% → 90.7684% and near-total refusal beyond
800 k. This lens's live 2 000-innocent measures on the old curve
(50 k: 2.90 / 3.50 / 3.55%; 800 k: 91.3%) sit on that binomial.

## VR-10 — independently re-derived, RED, restored

Each mutant broke one product/policy file, ran the guarding test, showed
RED, then restored. `cmp` against `{SCRATCH}/pre-mutant/` is
byte-identical. Captures `{SCRATCH}/vr10-*-red.log`.

| mutant | guarding test | RED |
|---|---|---|
| register-20 theory 5 395.83117 → 5 396.83117 | unit B5 | `expected 5396.83117 to be 5395.83117`; **5/5 repeats**, not flake |
| 50 000 residual 25 500 → 25 501 | unit B5 | `expected { '50000': 25501 } to match object { '50000': 25500 }`; **5/5 repeats** |
| enforcement mechanism → `fixed_window_counter` | unit B5 | deep-equal on `outbound_send_enforcement` fails |
| erase "newest mailed token" residual | unit B5 | `to match /newest mailed token/i` |
| one retained `Object.freeze({slot})` per newly occupied slot | unit B4 RSS | curve **95.9 / 292.7 / 314.8 / 361.5 MiB**; `expected 361.5 to be <= 256` |

Memory mutant exceeds 256 MiB from 25% occupancy (292.7). Author's
339.3 at 100% is the same class; this lens measured 361.5 with a
one-field frozen object.

## Findings

None blocking. r1 PQ1 (published computed 144 MiB that excluded JS
overhead and diverged past the tested point) is lifted on this tree:
typed storage is 154 140 672 B, isolated RSS is flat ~250 MiB from 25%
to 100%, stays under the published 256 MiB measured bound, and a
per-slot-object mutant drives RSS to 361.5 and fails that bound. r1
properties  B1/B2/B3/D1-1/2/4/D3 survive the rewrite.

## Records (non-blocking)

1. **Beyond-threat 50 k one-key sample is lifted on the 04:08 row.**
   Published ppm now equal this lens's exact-binomial integers. Live
   2 000-innocent measures remain noisy around that model (50 k
   2.90/3.50/3.55%).

2. **256 MiB is no longer the operator provisioning field** (04:08 C1).
   Isolated ceiling stays 256 and this lens measured it. Booted
   provisioning is published as 384 MiB from claimed 368.7 / 295 RSS;
   this lens did not independently produce those booted-process
   numbers (`main.ts` not bootable here).

3. **3.4 M sources to 100% is IPv6-cheap** (1.85 × 10⁻¹³ of a /64).
   That makes the resident bound holding more important, not less.

4. **T9 is out of scope.** `identity.ts` content-identical to HEAD.
   Not re-reported.

5. **Handoff tree ≠ 03:36 pre-mutant for two files.**
   `auth-policy.ts` and `tests/unit/registration.test.ts` moved at
   04:08 after VR-10 restore. `registration.ts` is still
   `8f4f9fb4bdc95645…`. Unit handoff 22/22 green.

## What would lift a BLOCK

Not applicable — verdict is GREENLIGHT.
