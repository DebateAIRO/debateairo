# S3c-r3 Grok-lens verdict

**GREENLIGHT**

The two published numbers are now true. Ticket t_86938dd1 / S3c rework 3
(ruled-row metadata only: booted-process provisioning bound, exact-binomial
beyond-threat curve). Blind lens: this file does not cite or open the other
diamond. Scope authority is `reviews/S3c-r3-review-packet.md` only. True
change set is from `find -mmin` / `stat` / sha256 (not `git diff` as the
inventory oracle). `git diff --check` was used only as the packet whitespace
gate. Aug-17 rename churn, `node_modules`, `.next`, `.pgdata`, toolchain
noise, and sibling-lens `s3c-r3-opus-boot.mts` (mtime 04:16, during this
review) are ignored. Author progress-log numbers are claims; live numbers
below were produced by this lens against the working tree and a real
embedded PostgreSQL subprocess. Temporary VR-10 mutants were applied one at
a time and restored to pre-mutant byte-identity. Nothing was committed or
pushed.

**T9 (`t_6ff49601`) and `pendingMailDispatches` (S3d) are out of scope.**
Confirmed untouched. Not re-reported.

The limiter implementation and the registration integration test are
**byte-identical to rework 2**. That is why this review is narrow: frozen
r1/r2 properties were spot-checked on the restored tree rather than fully
re-litigated.

## Live mtime inventory (S3c-r3)

First `stat` at 04:18 EEST, 2026-08-20. Handoff re-stat at 04:32 EEST after
VR-10 restore. HEAD `cff3dd553cbce2d66160df6b8cfd49686ece7217`.

Author r3 metadata set (in-window **and** the claimed C1/C2 row). Content
matches this lens's r2 04:08 fold-in hashes; `auth-policy.ts` mtime is
04:26:15 only because this lens restored the VR-10 mutants:

| mtime (EEST) | sha256 | path |
|---|---|---|
| 04:26:15 (content = r2 04:08:17) | `feb4d69e35e2064575e8283d27806713779c3001936b5cc36f607d044e983870` | `packages/register/src/auth-policy.ts` |
| 04:08:33 | `87490dd6b032589bd57e8195d9f8c0f0024760808452d5fee7b436b896693c12` | `tests/unit/registration.test.ts` |

Frozen r2 implementation (byte-identical to this lens's r2 record):

| mtime (EEST) | sha256 | path |
|---|---|---|
| 03:18:59 | `0db439026352cbaeade7f3d8684747e1f0647419c26e6b6e5f99591f7a4e26a2` | `tests/integration/registration-database.test.ts` |
| 03:19:59 | `8f4f9fb4bdc95645bb05d9ff14812a66977a246b476f95fbf9ded015ede36de3` | `apps/api/src/registration.ts` |

`packages/db/src/identity.ts` mtime 03:00:19 is a **touch only** — working-tree
`git hash-object` `82ad32e8c035faf0d9fa57b2b727133522af1004` equals this
lens's r2 HEAD blob. T9's `prepareVerificationResend` surface was not
rewritten. `pendingMailDispatches` still lives at `registration.ts:370` in
the frozen r2 blob.

Frozen packet surfaces (working-tree `git hash-object` equals this lens's
r2 HEAD blobs):

| mtime | git hash-object | path |
|---|---|---|
| 2026-08-19 20:06:46 | `e6df7755` | `apps/api/src/mail-channel.ts` |
| 2026-08-19 20:06:46 | `34849391` | `packages/db/src/schema.ts` |
| 2026-08-19 20:06:46 | `40a6d624` | `packages/crypto/src/index.ts` |
| 2026-08-19 16:42:18 | `201228e2` | `pnpm-lock.yaml` |
| 2026-08-19 20:06:46 | `1057927a` | `migrations/0031_registration_verification.sql` |
| 2026-08-19 22:23:19 | `05465d30` | `migrations/0032_registration_audit_erasure_checks.sql` |

Identity, mail channel, crypto, lockfile, and migrations contain no r3
product change. No `t_6ff49601` / untyped-500 / resend-deadlock files
appear in the author mtime set.

## Implementation did not move

`apps/api/src/registration.ts` sha256 `8f4f9fb4bdc95645…` and
`tests/integration/registration-database.test.ts` sha256 `0db439026352cbae…`
are the r2 values this lens already recorded. Codex's claim that r3 is
metadata-and-proof only holds on the working tree. Frozen r1/r2 properties
were therefore spot-checked, not re-derived.

## C1 — 384 MiB is honest and unambiguous

### Operator reading of the ruled row

Exactly one field reads as "provision this much":
`sketch_design.booted_process_resident_bound.published_provisioning_bound_mib = 384`
(`auth-policy.ts:272`), with `operator_provisioning_field: true` (schema
literal `z.literal(true)` at `:114`, value at `:275`) and instruction
"Operators must provision at least published_provisioning_bound_mib per API
process; isolated_limiter_resident_measurement is not a provisioning
figure." (`:276`).

The isolated figure is named
`isolated_limiter_resident_measurement.isolated_measurement_ceiling_mib = 256`
(`:256`), `operator_provisioning_field: false` (schema `z.literal(false)` at
`:93`, value at `:259`), instruction "do not use this isolated-process
figure to provision an API process" (`:260`). It is a component
measurement, not a provisioning number.

No generic `published_bound_mib` field remains in
`packages/register/src/auth-policy.ts` or `tests/unit/registration.test.ts`.
`sourceRef` (`:322`) names "S3c rework3 C1/C2 process provisioning bound
and modelled collateral" and does not re-publish 256 as the process
figure. Other memory literals in the row (typed `allocated_mib: 147`,
`budget_mib: 160`, isolated curve 93.7/249.5/250/248.6, worker 295,
independent 368.7) are named as storage or measurements. The r2
boolean-vs-literal contradiction (isolated measurement + `per_process` +
`includes_process_baseline` + `published_bound_mib: 256`) does not survive.

Rounding on the published field is explicit:
`ceil(368.7 / 32) * 32 = 384` (`auth-policy.ts:270-272`, asserted at
`tests/unit/registration.test.ts:386-394`).

### Live booted-process RSS (this lens)

Fresh Node subprocess, `--expose-gc`, shipped stack: embedded PostgreSQL
(`mechanism: embedded-postgres`), production argon2id
`{ memoryCostKiB: 65536, timeCost: 3, parallelism: 1, hashLength: 32 }`,
`PostgresIdentityRepository`, `RegistrationService`, `FileUserDekStore`.
Ten durable registrations landed `pending_verification` with 10 mailed
tokens. Limiter then filled to exact 100% occupancy via the shipped
`consume` entry point, hash key `0xb4`. Capture `{SCRATCH}/booted-rss.log`.

| point | RSS MiB | occupied | allocatedBytes |
|---|---|---|---|
| fresh after construct | **146.7** | 0 / 1 572 864 | 154 140 672 |
| after 10 durable registrations | **169.4** | 20 / 1 572 864 | 154 140 672 |
| 100% occupancy | **304.2** | **1 572 864 / 1 572 864** | **154 140 672** |

Fill sources at 100%: **3 416 876 / 3 669 727 / 3 434 706** (register /
verify / resend). Occupancy 100.0000%. Node v22.23.1. `under_published_384:
true`. Launcher exit 0.

This lens's 100% RSS **304.2 MiB ≤ 384**. Over-publishing conservatively is
acceptable; under-publishing is not. 384 is 79.8 MiB above this
measurement and 15.3 MiB above the published `measured_100_percent_rss_mib`
368.7 (`auth-policy.ts:270-272`). That is the ruled 32 MiB rounding
increment, not a 12× lie. It is still a usable per-process figure.

Author claimed 138.7 → 161.4 → 295.0 on the same stack. This lens sits
~8–9 MiB above those three points and well below both 368.7 and 384. The
fill-source triple matches the author's isolated 100% coupon-collector
counts exactly.

## C2 — beyond-threat curve is the exact-binomial model

Independent derivation, not a draw and not the unit test's IEEE754 helper.
`X ~ Binomial(n, 1/262144)`; `ppm = round(P(X≥1)² × 1e6)` with
`P(X≥1) = 1 − (1 − 1/262144)^n`, Decimal precision 120, `ROUND_HALF_UP`.
Capture `{SCRATCH}/binomial-curve.txt`.

| n | P(X≥1) | P²×1e6 | rounded | published | match |
|---|---|---|---|---|---|
| 50 000 | 0.173648645351 | 30153.85203215 | **30 154** | 30 154 | yes |
| 100 000 | 0.317143438669 | 100579.96069100 | **100 580** | 100 580 | yes |
| 200 000 | 0.533706916648 | 284843.07287754 | **284 843** | 284 843 | yes |
| 400 000 | 0.782570760418 | 612416.99506083 | **612 417** | 612 417 | yes |
| 800 000 | 0.952724525775 | 907684.02201260 | **907 684** | 907 684 | yes |

Published values at `auth-policy.ts:300-305`. Model label
`exact_binomial_two_independent_rows_full_budget` (`:297`). Derivation
string cites `P(X>=1)^2*1e6` (`:298`). All five equal the model's
integers, not a single draw.

## VR-10 — one-unit mutants go RED, twice, not flake-tight

Applied one at a time against the shipped C1/C2 assertions; restored from
the pre-mutant blob after each. Pre/post sha256
`feb4d69e35e2064575e8283d27806713779c3001936b5cc36f607d044e983870`.

1. `published_provisioning_bound_mib` 384→385 (`auth-policy.ts:272`).
   C1 RED twice: `expected 385 to be 384` at
   `tests/unit/registration.test.ts:391`. Exits 1 and 1.
   Capture `{SCRATCH}/vr10-384.log`. Restored, hash match YES.
2. `"50000": 30_154` → `30_155` (`auth-policy.ts:301`).
   C2 RED twice: `expected { '50000': 30155, … } to deeply equal
   { '50000': 30154, … }` at `tests/unit/registration.test.ts:417`.
   Exits 1 and 1. Capture `{SCRATCH}/vr10-30154.log`. Restored, hash
   match YES.

Neither mutant is tight enough to flake: both failed the same way on both
runs.

## Frozen r2 properties (spot-check; implementation hash matches r2)

Capture `{SCRATCH}/frozen-spotcheck.log`. 14 targeted tests + the D1
never-forgiven-early eviction test, all green. This is why the review is
narrow.

- **B1 mail/rotation ceiling** (integration): attacker 59/59 admissions,
  victim_mails=3, token_versions=3, rotations=2, owner_admission=success,
  owner_verification=active.
- **Route isolation** (integration B2): register-attacker → verify
  refused **0/2000** ADMITTED, resend refused **0/2000** ADMITTED.
- **D1 property 2 never forgiven early** (unit): after churn=524 298,
  `victim_refused=true`, occupied 453 426 / 1 572 864.
- **D1 colliding share-one-budget** (unit): register allowed=20
  refused=40; verify 10/20; resend 3/6.
- **D3** (unit): `raw_bucket_key_retained=false`,
  `raw_refusal_source_retained=true`, aggregate_routes=1/3.
- **S3b durability**: success pending until commit; 100/100 burst
  successes committed at response.
- **S3b oracle** (live-mail N=1/4/8): median_gap 0.0 / 29.8 / 33.3 ms
  (ceiling 100); AUC 53.1 / 64.8 / 60.8% (ceiling 80);
  password_argon2id_kib=65536.
- **VR-3**: `audit_rows=551 forbidden_matches=0 actor_ciphertext_nonnull=0
  chain_valid=true`.

## Live gates

| command | result | capture |
|---|---|---|
| `pnpm typecheck` | exit 0 | `{SCRATCH}/pnpm-typecheck.log` |
| `pnpm test` | **804 tests / 110 files**, 193.65 s, exit 0 | `{SCRATCH}/pnpm-test.log` |
| `pnpm lint` | **28 edges / 0 violations**, source `blocking: []`, exit 0 | `{SCRATCH}/pnpm-lint.log` |
| `git diff --check` | exit 0 | `{SCRATCH}/git-diff-check.log` |

Claimed 804/110 reproduces on this tree. Claimed 194 s was 193.65 s here;
count, not wall, is the gate. C1 and C2 both passed in the full suite.

Post-review restored hashes match the pre-mutant inventory for all four
claimed files. `registration.ts` is still the 03:19 r2 blob.

## Findings

None blocking.

## Records (non-blocking)

1. **This lens's booted 100% RSS is 304.2 MiB**, not the author's 295.0 and
   not the published independent 368.7. All three sit under 384. The
   published bound is the conservative `max(295, 368.7)` rounded up by 32,
   which this live world does not refute.
2. **T9 is out of scope.** `identity.ts` content-identical to the r2 HEAD
   blob `82ad32e8`. Not re-reported.
3. **`pendingMailDispatches` is out of scope (S3d).** Present at
   `registration.ts:370` in the frozen r2 implementation. Not re-reported.
4. **3.4 M sources to 100% remains IPv6-cheap.** Fill sources matched the
   author's 3 416 876 / 3 669 727 / 3 434 706 exactly. The bound holding
   at a real booted process is what makes that cheap fill operationally
   acceptable.

## What would lift a BLOCK

Not applicable — verdict is GREENLIGHT.
