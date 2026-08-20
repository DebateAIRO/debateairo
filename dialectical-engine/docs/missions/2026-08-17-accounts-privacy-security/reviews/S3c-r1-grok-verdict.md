# S3c-r1 Grok-lens verdict

**GREENLIGHT**

Ticket t_86938dd1 / S3c rework 1 (outbound send bound, route-isolated
sketches, non-vacuous flood proofs). Blind lens: this file does not cite
or open the other diamond. Scope authority is
`reviews/S3c-r1-review-packet.md` only. True change set is from
`find -mmin` / `stat` / sha256 (not `git diff` as the inventory oracle).
Aug-17 rename churn, `node_modules`, `.next`, `.pgdata`, toolchain noise,
and sibling-lens `zz-opus-r1-*.test.ts` files (mtime 02:46/02:49, during
this review) are ignored. Author progress-log numbers are claims; live
numbers below were produced by this lens against the working tree and
real embedded PostgreSQL 18. Temporary VR-10 mutants were applied one at
a time and restored to the pre-mutant sha; product/test files are
byte-identical to the pre-review inventory. Nothing was committed or
pushed.

## Live mtime inventory (S3c-r1)

First `stat` at 02:39 EEST, 2026-08-20. HEAD
`cff3dd553cbce2d66160df6b8cfd49686ece7217`. Author r1 product window is
**02:19–02:29 EEST** (progress-log envelope 02:05–02:33). After VR-10
restore, hashes match the pre-review inventory.

S3c-r1 product / test set (in-window):

| mtime (EEST) | sha256 (first 8) | path |
|---|---|---|
| 02:19:10 | `ec0e9d02…` | `tests/unit/registration.test.ts` |
| 02:21:06 | `349dcb16…` | `packages/db/src/identity.ts` (content identical to frozen S3b) |
| 02:22:37 | `dbb248ef…` | `packages/register/src/auth-policy.ts` |
| 02:22:56 | `64a3cb4b…` | `apps/api/src/registration.ts` |
| 02:29:23 | `40af3154…` | `tests/integration/registration-database.test.ts` |

`identity.ts` content is the S3b durability/oracle file
(`349dcb165f…`, same first 8 as round-0 frozen). The 20-minute send cap
is `resend_cooldown_ms: 20 * 60_000` plus
`outbound_send_max: 3` (`auth-policy.ts:138-140`) with the invariant
`cooldown * max >= window` (`auth-policy.ts:274-280`). The row lock is
the pre-existing `FOR UPDATE OF c,u` (`identity.ts:405`). Author
"empty forbidden diff for `packages/db`" is **content-true**; mtime
moved because r1 VR-10 mutated and restored this file.

Frozen packet surfaces **not moved in content** (mtime Aug-19 except
identity as above):

| mtime | sha256 (first 8) | path | surface |
|---|---|---|---|
| 20:06:46 2026-08-19 | `7e35e6f8…` | `apps/api/src/mail-channel.ts` | S3d mail channel |
| 20:06:46 | `30df2812…` | `packages/crypto/src/index.ts` | crypto / token generator |
| 20:06:46 | `4351de21…` | `packages/db/src/schema.ts` | identity schema |
| 20:06:46 | `f7883bde…` | `migrations/0031_registration_verification.sql` | identity schema |
| 12:42:11 2026-08-19 | `04a380ae…` | `migrations/0030_identity_foundation.sql` | identity foundation |
| 22:23:19 2026-08-19 | `bdf5c856…` | `migrations/0032_registration_audit_erasure_checks.sql` | S3a / VR-3 erasure |
| 15:19:59 2026-08-19 | `d6863247…` | `apps/api/src/index.ts` | T4 refusal attribution |
| 16:42:18 2026-08-19 | `71ed6444…` | `pnpm-lock.yaml` | lockfile |
| 20:11:11 2026-08-19 | `2a796238…` | `tests/integration/identity-database.test.ts` | identity tests |

Scope **holds**.

## Live gates (restored tree)

| command | capture | claimed | observed |
|---|---|---|---|
| `pnpm typecheck` | `{SCRATCH}/pnpm-typecheck.log` | green | `tsc --noEmit` **exit 0** |
| `pnpm test` | `{SCRATCH}/pnpm-test.log` | 110 files / 799 tests | **111 passed / 805 passed**, exit 0. Sibling `zz-opus-r1-probe.test.ts` (6 tests) appeared mid-run; excluding it is **110 / 799**. Duration 265 s. |
| `pnpm lint` | `{SCRATCH}/pnpm-lint.log` | 28 edges / 0 violations | **edgeRowsChecked 28, violations []**, `blocking: []`, exit 0 |
| `git diff --check` | `{SCRATCH}/git-diff-check.log` | green | exit 0 (whitespace only; not inventory) |
| S3b durability + equal-work | `{SCRATCH}/s3b-oracle-durability.log` | S3b hold | targeted **13 passed / 18 skipped**. Burst 100/100. Live-mail AUC N=1/4/8 **75.0 / 69.5 / 57.7** all ≤80. |
| VR-3 | `{SCRATCH}/vr3.log` | 0 forbidden | targeted `audit_rows=470 forbidden_matches=0`. Full-suite `audit_rows=642 forbidden_matches=0`. |

## PRIMARY QUESTION 1 — what ~144 MiB actually costs

Driven on the shipped `InProcessAuthRateLimiter` at production
`bucket_capacity = 524_288` (`auth-policy.ts:150`, constructor
`registration.ts:101`). Captures `{SCRATCH}/pq1-rss-heap.log`,
`{SCRATCH}/pq1-startup.log`, `{SCRATCH}/pq1-t7-concurrency.log`.

The published 150 994 944 primitive bytes is exact arithmetic:
1 572 864 slot references × 8 + 17 301 504 timestamps × 8, and it
**already includes all three routes**. The constructor does **not**
allocate 17.3 million timestamps. It allocates one holey array of
length 1 572 864.

| phase | RSS | heapUsed | time |
|---|---|---|---|
| import baseline (separate proc) | 90.6 MiB | 13.4 MiB | — |
| construct capacity 4 096 (HEAD-sized, same class) | 80.0 MiB | 11.3 MiB | **0.11 ms** |
| construct production 524 288 | 91.4 MiB | 23.2 MiB | **1.78 ms** |
| first `consume` | 92.6 MiB | 23.3 MiB | **0.28 ms** |
| 5× construct samples | — | — | 1.48, 3.80, 3.89, 9.58, 1.38 ms |
| 20 000 sources × 20 register | 146.5 MiB | 52.2 MiB | 1.35 s; occupied 38 546 / 1 572 864 |
| + verify 10 + resend 3 (full-budget 3-route) | **177.2 MiB** | **81.8 MiB** | +0.75 s; occupied 115 541 |
| steady `consume` after attack (n=200) | — | — | p50 **0.0036 ms**, p99 0.031 ms, max 0.066 ms |
| 80 000 1-req register occupancy | 153.8 MiB | 55.6 MiB | 0.22 s; occupied 137 942 |

Idle extra versus a 4 096-capacity instance of the same class is
**~12 MiB heap** (1.57 M × 8-byte holes), not 144 MiB. A 20 000-source
full-budget attack on all three routes grows process RSS by ~86 MiB
above the import baseline, still under the 144 MiB primitive ceiling
because only ~7% of slots are occupied. JS object overhead is real and
is disclosed (`excludes_runtime_object_overhead: true`,
`auth-policy.ts:168`). Filling every slot to the route limit was not
reached and is beyond the stated 20 000-source threat.

T7 registration concurrency (this lens, enumeration floor stubbed so
argon2id + `pg_advisory_xact_lock` are visible;
`identity.ts:107`): N=1 wall **208 ms** / N=8 **1 926 ms** / N=16
**3 844 ms** / N=32 **7 628 ms**, 32/32 succeeded. Floored N=1 on this
same tree is the live S3b oracle **602 ms**. Round-0's 5 940 ms at N=32
is the same global-lock serialisation; the sketch's 1.8 ms construct
and 0.0036 ms consume are not the driver. The limiter is not a
correct-but-unaffordable boot stall.

The 144 MiB figure, the 20 000-source model, the measured ppm table,
and the beyond-threat residual are on the ruled register row
(`auth-policy.ts:146-195`, `sourceRef` names S3c rework1 B2). An
operator who reads the register sees the cost before it is a surprise.
It is **not** `144 MiB × 3 routes`; that would triple-count.

## PRIMARY QUESTION 2 — does the owner still get in?

Driven on shipped `register` / `resendVerification` /
`prepareVerificationResend` with N=20 sources over a one-hour fake
clock. Captures `{SCRATCH}/pq2-owner-verify.log`,
`{SCRATCH}/pq2-window-boundary.log`, `{SCRATCH}/pq2-row-lock.log`.

| probe | measured |
|---|---|
| attacker sources / attempts | 20 / 59 |
| attacker admission | **59/59 ALLOWED** |
| victim-bound mails (incl. register) | **3** |
| token versions / rotations | **3 / 2** |
| owner resend admission at t=59 | ALLOWED |
| original register token | `VERIFICATION_TOKEN_INVALID` |
| latest mailed token | **`active`**, user `active` |
| cooldown | 1 200 000 ms |

B1 claim matches. Admission is unchanged (`consume` still charges only
`` `${route}:source:${ip}` ``, `registration.ts:265-273`). The owner's
own resend at t=59 does not mint a new mail (cooldown from the t=40
send); it is not a verification denial if they hold the latest mailed
token. The original token is dead after two rotations. That residual is
the pre-existing S3d "attacker can rotate a pending victim's token up
to the cap", now **no worse than 3 sends / 2 rotations / hour**. Codex
recorded the 3/3/2 ceiling in the B1 test
(`registration-database.test.ts:658-726`) and the handoff; the sketch
`residual` string (`auth-policy.ts:181`) is the collision residual,
not this S3d sentence.

**Boundary.** Sends on the live path at minutes 0, 20, 40, 60, 80.
Attempts at 19/39/59/79 do not send. Max in any half-open 60-minute
window = **3**. A 50/51/52 then 60/61/62 burst across a calendar-hour
boundary sent **once** (t=50) and then cooled. The bound is
**genuinely rolling via 20-minute spacing**, not a fixed-window
counter that would allow 3+3 across a boundary. Server `clock()` is
the only time source.

**Row lock.** `prepareVerificationResend` takes `FOR UPDATE OF c,u`
(`identity.ts:405`) then `appendAudit`, which hashes the source with
argon2id (19 456 KiB, t=2) and then
`pg_advisory_xact_lock('identity:audit-chain')` (`identity.ts:107`).
20 concurrent resends to one victim: all 20 admitted, wall **1 081 ms**,
per-request min/p50/max 70 / 607 / 1 081 ms, serial singles ~53 ms —
the victim row **fully serialises**. Owner resend after the burst
**54 ms ALLOWED**. No deadlock. This lock is pre-existing S3b/identity
behaviour; r1 did not add it. Cooling requests still take the lock
(they still audit), so the 20-minute cooldown does not reduce lock
acquisitions.

## Also-attack

**Replaced test.** The single-innocent full-occupancy test is gone. Its
replacement is the 2 000-innocent per-route population proof
(`registration-database.test.ts:850-997`), which asserts rate ≤ 1% and
that the published ppm table equals the measurement under the test's
hash keys. That is at least the *threat-model* intent of the old
property 3 (innocents must not be mass-refused). Full slot-occupancy
fill at 524 288 is no longer tested; the packet dropped D1 property 3
from the required post-resize re-check. The undersized-capacity mutant
still dies (below).

**Independent collateral (this lens's hash keys, 20 000 sources / 2 000
innocents)** — `{SCRATCH}/collateral-population.log`:

| route | 1 | 5 | 10 | 20 req/source |
|---|---|---|---|---|
| register | 0 | 0 | 0 | **0.50%** (10/2 000) |
| verify | 0 | 0 | 0.65% | 0.50% |
| resend | 0 | 0.70% | 0.35% | 0.90% |

Author-published table (test keys, B2 live): register 0/0/0/**0.45%**,
verify 0/0/0.40/0.95%, resend 0/0.45/0.60/0.40%. Author's B2 run on
this tree reproduced that table exactly. This lens's keys differ by a
few thousand ppm, as `hash_keys: 1` predicts; **every cell stays
< 1%**. Theoretical full-budget rate on the row is 5 395.83 ppm
(`auth-policy.ts:163`). Beyond-threat residual is stated
(`auth-policy.ts:181`).

**Cross-route, all six directions** (20 000 full-budget attackers,
2 000 innocents) — `{SCRATCH}/cross-route.log`: **0 refused** in every
direction (register→verify/resend, verify→register/resend,
resend→register/verify). Author's one-direction 0/2 000 is not a
special case.

**Mail/rotation ceiling at N≥20** (this lens) —
`{SCRATCH}/also-attack.log`: N=20 → 59 admitted, **3 mails**; N=60 →
59 admitted, **3 mails**. N=1 and N=5 bind on source admission during
the 20-minute cooldown and send only the register mail. Never above 3.

**D1 properties 1/2/4 and D3 after the resize**
(`{SCRATCH}/d1-properties.log`, `{SCRATCH}/d3-object-graph.log`):

1. Memory bounded: 250 000 mixed requests → occupied 428 384 / 1 572 864,
   array length 1 572 864, max expiries/slot 7 (≤ register 20). Unit
   200 k single-source flood: occupied 2 / 1 572 864, refused 199 980.
2. At/over-limit never forgiven: 20 admits, 21st refused; still refused
   after 8 000-source churn and at `windowMs-1`; admitted at
   `windowMs+1`.
4. Over-count only: solo key at 20 has both slots at 20 and is refused.
   Sliding window: 10 + 10 at half-window stays blocked, then exactly
   10 more, not 20.

D3: after 25 consumes of a distinctive raw IP, `rawIpInSketchSlots=false`.
Aggregate retains the IP; map size 1.

## VR-10 — six independently re-derived mutants

Each mutant broke one product/policy/repository file, ran the guarding
test, showed RED, then restored. Captures `{SCRATCH}/vr10-<name>-red.log`.
Post-restore `cmp` is byte-identical to `{SCRATCH}/pre-mutant/`.

| mutant | guarding test | RED |
|---|---|---|
| cooldown 60 s (invariant dropped so policy still loads) | integration B1 | `expected 60 to be less than or equal to 3` |
| all routes forced onto `slotRowsByRoute.register` | integration B2 | cross-route **14/2 000** verify and **14/2 000** resend; `expected false to be true` |
| capacity 4 096/route | integration B2 | register 0/97.75/99.75/100%; verify 33.6/99.9/100/100%; resend 99.65/100/100/100%; `expected false to be true` |
| `if (false && estimatedCount >= limit)` | unit B3 | `post_limit_allowed=60`; `expected false to be true` |
| published register-20 ppm 4 500 → 4 501 | unit policy row | `toEqual` measured_collateral |
| ignored resends still `UPDATE` token hash | integration B1 | owner `VERIFICATION_TOKEN_INVALID` at `registration.ts:652` |

The 4 096/route mutant is the proof that the replaced 2 000-innocent
test still kills undersized capacity.

## Findings

None blocking. Round-0 PQ1 (60 mails/hour at N≥20) and PQ2 (catastrophic
same-route collateral, unstated) are lifted on this tree: 3 mails / 2
rotations at N=20 with 59/59 admission, and <1% collateral at the stated
20 000-source full-budget model, published on the register row.

## Records (non-blocking)

1. **Published ppm is a one-key sample.** `hash_keys: 1`
   (`auth-policy.ts:174`). This lens's keys moved register-20 from 0.45%
   to 0.50% and resend-20 from 0.40% to 0.90%; all still under the 1%
   target and near the theoretical 0.54%. The B2 test pins the published
   table to the author's keys, so it cannot silently drift.

2. **S3d token-rotation residual remains**, capped at 2 rotations/hour.
   Original token does not verify; latest mailed token does. Recorded in
   B1, not in `sketch_design.residual`.

3. **Victim-row `FOR UPDATE` serialises same-address resends** at ~53 ms
   each (argon2id inside the transaction). Pre-existing; r1 did not add
   it. Unbounded distinct IPs can still queue that lock.

4. **Sibling-lens `zz-opus-r1-*.test.ts`** inflated the live suite to
   111/805. Author-attributed gates are 110/799.

5. **`identity.ts` mtime is in-window with S3b content.** Treat the
   empty `packages/db` forbidden-diff claim as content-identity, not as
   "the send cap lives in identity.ts".
