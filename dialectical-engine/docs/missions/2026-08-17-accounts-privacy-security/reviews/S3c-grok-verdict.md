# S3c Grok-lens verdict

**BLOCK**

Ticket t_86938dd1 / S3c rate-limiter re-cut (counting sketch + source-owned
admission). Blind lens: this file does not cite or open the other diamond.
Scope authority is `reviews/S3c-review-packet.md` only, with
`logs/S3c-packet.md` as the author's contract text. True change set is from
`find -mmin` / `stat` / sha256 (not `git diff` as the inventory oracle).
Aug-17 rename churn, `node_modules`, `.next`, `.next-dev`, `.pgdata`, and
toolchain noise are ignored. Author progress-log numbers are claims; live
numbers below were produced by this lens against the working tree and real
embedded PostgreSQL 18. Temporary VR-10 mutants were applied one at a time
and restored to the pre-mutant sha; product/test files are byte-identical to
the pre-review inventory. Nothing was committed or pushed.

## Live mtime inventory (S3c)

First `stat` at 01:39 EEST, 2026-08-20. HEAD `cff3dd553cbce2d66160df6b8cfd49686ece7217`.
Author window is **01:10–01:31 EEST**. After VR-10 restore,
`registration.ts` still hashes `1bdfa938…`.

S3c product / test set (in-window, inside the file contract):

| mtime (EEST) | sha256 (first 8) | path |
|---|---|---|
| 01:13:38 | `83b4cdbd…` | `packages/register/src/auth-policy.ts` |
| 01:20:10 | `591e2377…` | `tests/unit/registration.test.ts` |
| 01:20:39 | `1bdfa938…` | `apps/api/src/registration.ts` |
| 01:26:07 | `f8ee5a32…` | `tests/integration/registration-database.test.ts` |

`auth-policy.ts` is the packet-allowed additive change: `admission_per_source`
20/10/3 plus sourceRef `S3c D2 source-owned admission (2026-08-20)`
(`auth-policy.ts:119-129`). Leftover `per_ip` / `per_address` rows remain
and are unused by `consume`.

Docs / lint byproducts in the same hour (`S3c-packet.md` 01:01,
`S3c-progress.log` 01:31, `S3c-review-packet.md` 01:34,
`reports/orphan-audit.json` 01:28) are not product.

Frozen packet surfaces **not moved in the S3c window**:

| mtime | sha256 (first 8) | path | surface |
|---|---|---|---|
| 00:49:08 | `349dcb16…` | `packages/db/src/identity.ts` | S3b durability + equal-work (pre-S3c) |
| 20:06:46 2026-08-19 | `7e35e6f8…` | `apps/api/src/mail-channel.ts` | S3d mail channel |
| 20:06:46 | `30df2812…` | `packages/crypto/src/index.ts` | crypto / token generator |
| 20:06:46 | `4351de21…` | `packages/db/src/schema.ts` | identity schema |
| 20:06:46 | `f7883bde…` | `migrations/0031_registration_verification.sql` | identity schema |
| 12:42:11 2026-08-19 | `04a380ae…` | `migrations/0030_identity_foundation.sql` | identity foundation |
| 22:23:19 2026-08-19 | `bdf5c856…` | `migrations/0032_registration_audit_erasure_checks.sql` | S3a / VR-3 erasure |
| 15:19:59 2026-08-19 | `d6863247…` | `apps/api/src/index.ts` | T4 refusal attribution not rewritten |
| 16:42:18 2026-08-19 | `71ed6444…` | `pnpm-lock.yaml` | lockfile |
| 20:11:11 2026-08-19 | `2a796238…` | `tests/integration/identity-database.test.ts` | identity tests |

Scope **holds**: no in-window move of frozen S3a, S3b durability/oracle,
S3d mail/cooldown, T4 attribution, crypto, identity schema, or lockfile.

## Live gates (restored tree)

| command | capture | claimed | observed |
|---|---|---|---|
| `pnpm typecheck` | `{SCRATCH}/pnpm-typecheck.log` | green | `tsc --noEmit` **exit 0** |
| `pnpm test` | `{SCRATCH}/pnpm-test.log` | 110 files / 798 tests | **110 passed / 798 passed**, exit 0 |
| `pnpm lint` | `{SCRATCH}/pnpm-lint.log` | 28 edges / 0 violations | **edgeRowsChecked 28, violations []**, `blocking: []`, exit 0 |
| `git diff --check` | `{SCRATCH}/git-diff-check.log` | green | exit 0 (whitespace only; not inventory) |
| S3b durability + equal-work + VR-3 | `{SCRATCH}/s3b-oracle-durability.log`, `{SCRATCH}/vr3.log` | S3b hold; VR-3 0 forbidden | **7 passed** (23 skipped). Burst 100/100. Live-mail N=1/4/8 AUC 65.6/64.1/56.6 all ≤80. Isolated VR-3 `audit_rows=463 forbidden_matches=0`. Full-suite VR-3 `audit_rows=558 forbidden_matches=0` (more prior chain rows). |

Author progress-log numbers were not used as evidence.

## PRIMARY QUESTION 1 — email bomb / token guess

Driven on the shipped `RegistrationService` + `prepareVerificationResend` +
`InProcessAuthRateLimiter.consume` + `generateVerificationToken`
(`{SCRATCH}/pq1-email-bomb.log`, `{SCRATCH}/pq1-token-guess.log`). Old
ceilings are the packet's ruled 5/10/3 (address admission is already gone
and cannot be re-executed).

| N sources | old resend / hour | measured victim-bound mails / hour (incl. 1 register) | measured resend mails / hour | binding constraint |
|---|---|---|---|---|
| 1 | 3 | 3 | 2 | source admission 3 (one admission burned on cooldown) |
| 2 | 3 | 6 | 5 | source admission 6 |
| 5 | 3 | 15 | 14 | source admission 15 |
| 10 | 3 | 30 | 29 | source admission 30 |
| 20 | 3 | **60** | **59** | 60 s cooldown |
| 60 | 3 | **60** | **59** | 60 s cooldown |

Other per-address paths, live:

- Duplicate-address registration from 12 sources: **0 additional mails**
  (`register` `email_duplicate` post-work does not call `sendVerification`,
  `registration.ts:483-489` / `:417-427`).
- Unregistered victim **resend** from 12 sources: **0 mails**, 0 rows
  (`prepareVerificationResend` `send` requires `pending_verification`,
  `identity.ts:408-410`).
- Unregistered victim **register**: **1 mail** and a pending account
  (legitimate first-claim path).
- Already-verified victim: 10 cooldown-spaced resends → **0 additional mails**.

The only remaining per-address bound is `resend_cooldown_ms = 60_000`
(`auth-policy.ts:105`, applied at `registration.ts:654-660` /
`identity.ts:408-410`). `consume` charges only
`` `${route}:source:${ip}` `` (`registration.ts:234-241`). Leftover
`per_address` 5/10/3 (`auth-policy.ts:119-125`) is unused.

Token guessing is **not** a hole. `generateVerificationToken` is
`randomBytes(32).toString("base64url")` (`packages/crypto/src/index.ts:427-429`),
256 bits, TTL 24 h (`auth-policy.ts:104`). Live verify: 5 sources × 20
guesses → 10 `VERIFICATION_TOKEN_INVALID` then 10 `AUTH_RATE_LIMITED` per
source (admission 10 / 15 min). N=10 000 sources ⇒ 400 000 attempts/hour,
9.6×10^6 over the TTL, success probability **8.3×10⁻⁷¹**.

The cooldown does **not** cover the D2 trade. Ceiling went from **3
resend mails/hour** to **60/hour** for any attacker holding N≥20 sources.
That is a 20× per-address mail-bomb regression on the path D2 left as the
outbound throttle.

## PRIMARY QUESTION 2 — collateral refusal on a population

400 fresh innocent sources after a saturating attack, shipped sketch,
fixed hash key `0x51`. Capture `{SCRATCH}/pq2-collateral.log`.

| attack | sources | requests | innocent refused / 400 | rate |
|---|---|---|---|---|
| occupancy fill, 1 req/source | 18 920 | 18 920 | 0 | **0%** |
| occupancy fill, 5 req/source | 17 378 | 86 886 | 375 | **93.75%** |
| occupancy fill, 10 req/source | 16 588 | 165 871 | 397 | **99.25%** |
| occupancy fill, 20 req/source | 19 581 | 391 601 | 399 | **99.75%** |
| 1-req fill + 20k more 1-req | 20 537 + 20 000 | 40 537 | 113 | **28.25%** |
| 1-req fill + 50k more 1-req | 17 255 + 50 000 | 67 255 | 388 | **97%** |

The author's "fresh innocent after 18 722-source saturation succeeded" is
the **1-req occupancy-fill** cell — the only intensity in this table with
~0% collateral. Coupon-collector overlap means a 5-req/source occupancy
fill already puts ~42 increments on each 2 048-wide row (capped at 20),
so almost every innocent hashes into two saturated slots.

Adversarial two-row dual collision: with the process HMAC key known, a
pair sharing slots `(851, 3721)` appeared in **1 449** scans; with a
fresh random key, a pair appeared in **2 664** of 200 000 scans
(birthday on 4 194 304 slot-pairs). Those two sources share one budget
of 20 (`allowedAcrossTwoSources=20`). Targeted dual-collision without
the per-process key is not practical; random fill still produces the
population rates above.

No operator-visible statement of these rates exists. The design comment
at `registration.ts:128-142` says collisions over-count and names the
`RefusalAggregate` residual; it does not give a magnitude. Policy
`sourceRef` (`auth-policy.ts:129`) does not either. A 60 s refusal-audit
row does not report sketch collateral.

## Also-attack results that hold

**D1 properties** (`{SCRATCH}/d1-properties.log`), probed on the shipped
`take` (`registration.ts:144-168`), not just the tests:

1. Memory bounded: 250k mixed requests → `occupied=4096/4096`, array
   length 4096, max expiries/slot 20.
2. At/over-limit never forgiven early: 20 admits, 21st refused; still
   refused after 8 000-source churn and at `windowMs-1`; admitted at
   `windowMs+1` (window expiry, not eviction).
3. Occupancy saturation does not refuse an under-limit key: 18 372
   1-req sources to 4096/4096, fresh IP admitted. (This is occupancy,
   not count-saturation — see PQ2.)
4. Information loss only over-counts: a key at 20 has both slots at 20
   and is refused; no fresh budget is minted.

Sliding window, not double budget: 10 at t0 + 10 at t0+window/2 stays
blocked until the first half expires, then exactly 10 more, not 20.
`saturatedUntil` is 0 for a solo key that hits its own route limit by
expiry count; decay of those expiries is the window, not the round-2
metastable eviction.

**D3 object graph** (`{SCRATCH}/d3-object-graph.log`): after 25 consumes
of a distinctive raw IP/address, the only hits are
`limiter.refusalAggregates.MapVal[0].source.{ip,userAgent,requestId}`.
`rawIpInSketchSlots=false`. Documented residual is the only one
(`registration.ts:65-73`, `:137-142`). Map is one entry per route.

**Three legacy audit-only fixtures** still assert their original claims.
Each now overrides `admissionPerSource: 1` so refusals still occur after
address admission was removed (`registration-database.test.ts:1291-1298`,
`:1417-1424`, `:1496-1516`):

1. One finalized route-window refusal row, `count:40`, chain verifies.
2. B5: typed `AUTH_RATE_LIMITED` / 429 when the finalized audit write
   fails.
3. VR-3: no user id / email / blind-index / pseudonym in any audit
   column after real deletion; chain verifies.

That is an opt-in to a one-request source limit so the audit/429/erasure
assertions still fire. The assertions themselves are not relaxed.

## VR-10 — six independently re-derived mutants

Each mutant broke `apps/api/src/registration.ts`, ran the guarding test,
showed RED, then restored sha `1bdfa938…`. Captures
`{SCRATCH}/vr10-<name>-red.log`.

| mutant | guarding test | RED |
|---|---|---|
| strip `estimatedCount >= limit` | unit sustained flood 20/10/3 | `expected false to be true` |
| evict/reassign served-key slots | unit rotating dual-collision | `expected 60 to be 20` |
| refuse under-limit keys at occupancy | integration innocent newcomer | `expected 'AUTH_RATE_LIMITED' to be 'success'` |
| restore address charging | unit D2 source-owned 20/10/3 | `expected { allowed: false, scope: 'address' } to deeply equal { allowed: true }` |
| retain `rawKey` on the slot | unit D3 object graph | `expected true to be false` |
| `slots.push` on each increment | unit 200k memory bound | `length of 4096 but got 4136` |

Post-restore hashes match the pre-mutant inventory for all seven
product/test files listed there. No mutant comments remain.

## Findings

1. **BLOCK — PQ1 mail-bomb ceiling.** Removing per-address admission
   raised the maximum verification emails deliverable to one pending
   victim address from the ruled **3/hour** to the measured **60/hour**
   at N≥20 (`registration.ts:234-241`, `auth-policy.ts:105`,
   `identity.ts:408-410`). The unchanged 60 s cooldown is the only
   leftover per-address throttle and it does not cover the old bound.
   Duplicate register and unregistered resend do not mail; first
   register of an unused address still sends one mail.

2. **BLOCK — PQ2 collateral unstated and catastrophic except at 1-req
   fill.** 400-innocent population: 0% after 1-req occupancy fill,
   **93.75%** after 5-req occupancy fill, **99.75%** after 20-req
   occupancy fill (`take` min-of-two-rows, `registration.ts:147-150`).
   Author's single 18 722-source success is the 1-req cell. No operator
   surface states these rates. A design whose availability failure mode
   is a 94% registration outage at ~17 k sources × 5 requests is not
   documented and is not obviously better than the deterministic lockout
   it replaced, even though it costs more IPs than the old ~196-IP map
   fill.

3. **Record — leftover unused address/IP policy rows.**
   `per_address` 5/10/3 and `per_ip` 20/30/15 remain required by the
   schema (`auth-policy.ts:39-44`, `:119-125`) but `consume` never reads
   them. Not independently blocking; they are the "leftover" the packet
   named.

Token entropy, D1 four properties, window/straddle, D3 residual, the
three legacy fixtures, VR-10, frozen mtime scope, and the live gates
are not findings.

## What proof lifts this BLOCK

Both primary questions must be lifted.

1. **PQ1.** Restore a per-address *outbound* verification-mail cap of
   **3/hour** (or a measured replacement ≤3) that is **not**
   request-admission, so D2 stays closed. Drive the shipped
   `register` / `resendVerification` / `prepareVerificationResend` path
   with N≥20 sources over a one-hour clock and show victim-bound
   verification mails ≤3. Do not absorb a full S3d mail-channel rewrite
   unless that ticket lands first; a cooldown/row-level send budget is
   enough.

2. **PQ2.** Publish the measured false-refusal table (1/5/10/20
   req-per-source occupancy fill, several hundred innocents) on an
   operator-visible surface (policy `sourceRef` or operator runbook /
   structured residual). **And** either change the sketch so occupancy
   fill at k≥5 does not saturate slot counts to the register limit, or
   explicitly accept a ~94% registration outage at ~17 k sources as the
   residual. A single 1-req innocent sample does not lift this.

GREENLIGHT requires both lifts, plus the D1/D3/fixtures/VR-10/frozen-scope/gates
already shown here remaining green on the new tree.
