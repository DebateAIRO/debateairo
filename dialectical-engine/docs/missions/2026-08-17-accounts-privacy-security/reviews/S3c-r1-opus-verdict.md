# S3c REWORK 1 — Opus lens verdict

Ticket t_86938dd1, board `accounts-phase1`. Author: Codex, session 01a019e7.
Reviewed at HEAD cff3dd5 + working tree. Blind lens: no other lens's verdict or
review log opened. Round-0 blocker author under P8.

## VERDICT: **BLOCK**

**All three of my round-0 blockers are genuinely fixed** — I reproduced each fix
independently, on the real stack, with my own harness. B1 restores the mail ceiling
to the pre-S3c baseline exactly; B2's route isolation is exact in all six directions;
B3's proofs are non-vacuous and die under the mutant that killed the old ones. The
six new VR-10 mutants are all real and reproduce Codex's exact numbers.

One new blocker: **the memory cost published in the ruled register row is wrong by
5.5×–12.1× in the units an operator provisions from**, and the sizing decision was
justified by that arithmetic. A second, pre-existing but newly load-bearing defect
(concurrent-resend deadlocks that leak address existence) must be ticketed before
this closes.

---

## Change set (mtimes, not `git diff`)

Files written in the rework window (02:19–02:32 EEST 2026-08-20):

| mtime | file |
|---|---|
| 02:19:10 | `tests/unit/registration.test.ts` |
| 02:21:06 | `packages/db/src/identity.ts` — **byte-identical to HEAD** (VR-10 mutant W2, restored) |
| 02:22:37 | `packages/register/src/auth-policy.ts` |
| 02:22:56 | `apps/api/src/registration.ts` |
| 02:29:23 | `tests/integration/registration-database.test.ts` |
| 02:32:30 | `reports/orphan-audit.json` (untracked lint artifact) |

**Frozen scope clean.** `packages/db/src/identity.ts` carries a rework-window mtime
but its content is identical to HEAD — B1 is *not* a repository change. `migrations/`,
`pnpm-lock.yaml`, `packages/crypto`, identity schema and tests: all pre-date the run.
My restored hashes match Codex's recorded pre-mutation SHA-256s exactly
(`64a3cb4b…`, `dbb248ef85…`, `349dcb165f…`), confirming the tree I reviewed is theirs.

Tree verified **byte-identical** to the pre-review baseline after every mutation
(400-file sha256 manifest diff empty). No commit, no push. Scratch probes deleted.

---

## BLOCKING FINDING

### N1 — the published `storage_upper_bound` understates real memory by 5.5×–12.1×, and the resized structure is a reachable memory-exhaustion vector

`packages/register/src/auth-policy.ts:158-163` publishes, in the ruled register row:

```
storage_upper_bound: { slot_references: 1_572_864, expiry_timestamps: 17_301_504,
                       primitive_payload_bytes: 150_994_944,
                       excludes_runtime_object_overhead: true }
```

The arithmetic is right (1,572,864×8 + 17,301,504×8 = 150,994,944 = 144.0 MiB). The
number is also, as a description of what a process costs, wrong by an order of
magnitude — because every occupied slot is a frozen object wrapping a frozen array
(`registration.ts:172-186`), not eight bytes.

**Measured, `--expose-gc`, isolated processes, production policy:**

| state | live heapUsed | RSS delta | process RSS | vs published 144.0 MiB |
|---|---|---|---|---|
| construct only (boot) | +12.0 MiB | +13.1 MiB | 105.9 MiB | — |
| stated threat model (20 000 sources × full budget, ×3 routes) | +19.2 MiB | +198.1 MiB | — | — |
| **worst case — every slot at its route limit** (exact object shape, 1 572 864 slots / 17 301 504 timestamps) | **+796.0 MiB** | +860.5 MiB | **940.2 MiB** | **5.53×** |
| **reached by real traffic** — 4 800 000 requests, 1 per source, 99.8 % occupancy | +543.7 MiB | +1 652.3 MiB | **1 744.4 MiB** | **12.1×** |

The 5.5× ratio is structural, not noise: repeating the worst-case fill at HEAD's
4,096/route sizing gives **5.54×** (6.2 MiB actual vs 1.1 MiB claimed) — a constant
**~531 bytes per occupied slot** against the ~96 bytes the arithmetic assumes.

**It is reachable, and cheaply.** The cheapest path to occupancy is one request per
source (each source claims two slots regardless of how many requests it makes):
1.6 M register + 1.6 M verify + 1.6 M resend requests → 99.8 % occupancy and
**1.70 GiB RSS**, i.e. ~1 780 rps on register and verify for one 15-minute window plus
~445 rps on resend for one 60-minute window. 1.6 M distinct sources is one IPv6 /64.
Under the identical 8 M-request load HEAD's limiter reaches **135.8 MiB** total RSS;
r1 reaches **523.3 MiB**. The structure whose purpose is to bound memory is now the
largest attacker-controlled allocation in the process, and it is per-process — a
multi-worker deployment multiplies it.

**The sizing decision rests on the wrong cost model.** `slots_per_route` was chosen as
the power of two above the required row width of 189,825 (`auth-policy.ts:154-156`),
with 144 MiB presented as the price. The real price at that setting is ~940 MiB
worst case. An operator sizing a container from the ruled row would be OOM-killed.

**What is fine, measured, and should be recorded as such:**
- **No boot stall.** Construction is 1.49 ms (HEAD: 0.22 ms); first `consume()`
  0.25 ms; steady state 3.3–4.1 µs/request. Building 17.3 M timestamps never happens
  at boot — the array is allocated empty and fills only under attack.
- **T7 is not worsened.** Real-stack concurrent registration, r1 sizing vs HEAD sizing:

  | | N=1 | N=2 | N=4 | N=8 | N=16 | N=32 |
  |---|---|---|---|---|---|---|
  | 524 288/route | 209 | 468 | 965 | 1 986 | 3 741 | **6 912 ms** |
  | 4 096/route | 187 | 426 | 975 | 1 990 | 3 603 | **6 545 ms** |

  The ~5 % difference at N=32 is inside the noise of the pre-existing
  `pg_advisory_xact_lock` serialisation (`identity.ts:107`). **The resize did not add
  to the T7 curve.** Throughput is likewise unchanged (3.7 vs 3.8 µs/req at 8 M
  requests).

So the limiter is correct and fast. It is the **published cost** that is wrong, and
the packet's own standard applies: *"A correct-but-unaffordable limiter is a finding,
not a pass. If the real figure materially exceeds 144 MiB, that is a finding."*
12.1× is material.

---

## MUST BE TICKETED BEFORE THIS CLOSES

### N2 — concurrent resend deadlocks, returns 500, and leaks address existence (pre-existing; not introduced by r1)

The packet asked me to interrogate the row lock. It does deadlock, and the deadlock
is observable.

`prepareVerificationResend` takes row locks (`FOR UPDATE OF c,u`,
`packages/db/src/identity.ts:400-406`) held to COMMIT, then `appendAudit` takes the
**global** `pg_advisory_xact_lock` (`identity.ts:107`) inside the same transaction.
The asynchronous `recordVerificationDelivery` updates `channel_binding` first and then
takes the same advisory lock — the opposite order. Measured, 32 concurrent resends
against one existing address:

| cooldown | rejected | error code | `pg_stat_database.deadlocks` delta |
|---|---|---|---|
| **r1 (20 min)** | 7/32 | `40P01` (deadlock_detected) | +8 |
| **HEAD (60 s)** | 7/32 | `40P01` | +8 |

**Identical at HEAD's cooldown → pre-existing, not an r1 regression.** But two
consequences matter:

1. A raw `pg` error is not an `AuthFlowError`, so `buildApi`'s handler
   (`apps/api/src/index.ts:184-190`) returns **500 `INTERNAL_ERROR`**, not the fixed
   202 envelope.
2. It is a **deterministic address-existence oracle**. Measured:
   - existing address, 32 concurrent resends → **8/32 untyped 500s**, 8 deadlocks
   - missing address, 32 concurrent resends → **0/32**, all 202, 0 deadlocks

   A missing address takes no row lock (`row === undefined`), so it cannot deadlock.
   That reopens the enumeration property S3b closed and was dual-greenlit for — by a
   status-code channel rather than the timing channel S3b equalised.

B1 places the send cap directly on this row lock and makes *concurrent contention on a
single victim row* the expected attack shape, so this ticket materially increases the
exposure even though it did not create the bug. I am not asking for it to be fixed
inside S3c — S3b/S3d are frozen — but it must be recorded with these numbers before
S3c closes, because nothing in the tree currently says it exists.

---

## NON-BLOCKING (fix with the rework)

### N3 — the published collateral table is a single hash-key draw presented at 4-significant-figure precision
`auth-policy.ts:167-178` publishes per-cell ppm values pinned by
`expect(publishedRefusalPpm).toEqual(measuredRefusalPpm)`
(`tests/integration/registration-database.test.ts:996`) to one deterministic hash key.
The sampling error at n=2 000 is ±50 %. For register/20 I ran **12 independent hash
keys**: draws `[2500, 3500, 4000, 4000, 4500, 4500, 5500, 6000, 6000, 6500, 7000, 7000]`
ppm around a theory of **5 395.81 ppm**; the published 4 500 is a valid draw. With
three of my own keys per cell every cell sat at or below 9 000 ppm — under the
10 000 ppm ceiling — but the published `verify: {"20": 9500}` vs `register: {"20": 4500}`
implies verify/20 is twice as bad as register/20 when the two are identical by
construction (my draws: verify/20 `[5500,4500,3000]`, register/20 `[5500,6000,5500]`).
The theoretical figure published alongside is accurate and reproducible; the per-cell
measured table is noise presented as signal. Publish a multi-key mean or an interval,
and make the gate assert a bound rather than exact equality.

### N4 — the token-rotation residual is not in the ruled row
The only `residual` string (`auth-policy.ts:181`) covers collision refusal. The
residual that an attacker still invalidates the owner's held token up to 3×/hour
appears nowhere in the register row or in a code comment — only implicitly in the B1
test's `expect(tokenVersions.size).toBeLessThanOrEqual(3)`.

### N5 — the beyond-threat residual states direction but no magnitude
I measured the resend-route curve past the 20 000-source model: **50 k → 2.55 %,
100 k → 11.15 %, 200 k → 28.10 %, 400 k → 60.40 %, 800 k → 91.40 %** of innocents
refused. Publishing that curve would make the residual actionable; the current string
tells an operator only that it degrades.

### N6 — "3 sends in any half-open hour" names a counter that does not exist
`outbound_send_window_ms` / `outbound_send_max` are declarative only; nothing counts
sends in a window. Enforcement is the pre-existing per-row cooldown timestamp plus the
derived policy invariant `cooldown × max ≥ window` (`auth-policy.ts:273-280`). The
behaviour is correct — I verified it is genuinely rolling, below — but the naming
invites a future maintainer to believe a windowed counter is doing the work.

---

## ROUND-0 BLOCKERS: ALL THREE FIXED (verified independently)

### B1 fixes my F1 — the mail ceiling is back to the pre-S3c baseline, and the bound is genuinely rolling
Re-running **my own round-0 harness** on the r1 tree, N=20 attacker sources, one hour,
real PostgreSQL:

| | attacker requests admitted | register-path mails | **total mails to one victim in 1 h** |
|---|---|---|---|
| HEAD cff3dd5 | 3/60 | 1 | **4** |
| **round 0 (my BLOCK)** | 60/60 | 1 | **61** |
| **r1** | **60/60** | 1 | **4** |

Admission is unchanged, as designed — all 60 attacker requests are still admitted; the
bound is on the outbound side only. Ceiling restored exactly to HEAD's 4.

**Boundary — genuinely rolling, no fixed-window edge.** Driving resends every minute
for **four hours**: sends land at minutes `0,20,40,60,80,…,240`; minimum gap **20 min**
= the cooldown; **maximum sends in ANY rolling 60-minute window = 3**. There is no
window to straddle because enforcement is a per-row `verification_last_sent_at`
timestamp, not a windowed counter — a ≥20-minute gap caps every half-open hour at 3 by
construction. Clock handling is the repository's own `occurredAt`, so no skew surface.

**PQ2.1 — the owner does get in, but not with the token they hold.** With the attacker
consuming the full cap (59/59 admitted, 3 victim mails):

```
[E1] own_registration_token = VERIFICATION_TOKEN_INVALID
     latest_mailed_token    = active
```

The owner completes activation, and their own resend is never refused. But a token
they legitimately hold **is** invalidated — only the newest mailed token verifies. The
rate is exactly the ruled 3/hour (2 rotations, 3 token versions measured), so it is
**no worse than the ruled bound**, which is the standard the packet set. It is,
however, not recorded (N4).

### B2 fixes my F2 — route isolation is exact in every direction
Structurally, each route owns a disjoint region: `offset = routeIndex × bucketCapacity`
(`registration.ts:101-112`), two rows of 262 144 within it. Measured, **all six ordered
pairs**, 20 000 full-budget attacker sources, 2 000 innocent probes:

```
register->verify 0/2000   register->resend 0/2000
verify->register 0/2000   verify->resend   0/2000
resend->register 0/2000   resend->verify   0/2000
```

with `occupiedSlotsByRoute` confirming containment (attacked route ~38 500, others
~3 985 = my own probes). My round-0 measurement in the same state was **resend
40/40 = 100 % refused**; it is now 0.

Per-route collateral at the stated threat, **my own three random hash keys**, all
twelve cells: every value ≤ 9 000 ppm against the 10 000 ppm ceiling, consistent with
theory 5 395.81 ppm. (Per-cell agreement with the published table is another matter —
see N3.)

### B3 fixes my F3 — the proofs are no longer vacuous
Both flood proofs now establish refusal **before** saturation (`occupied=2/1 572 864`
measured), and both die under exactly the mutant that left the old ones green:
mutant **W6** (per-key guard no-op) → unit `S3c B3 …` RED (`post_limit_allowed=60`),
real-Postgres `S3c B3 …` RED (`['ALLOWED','ALLOWED']` vs `['AUTH_RATE_LIMITED', …]`).

### F4 fixed — legacy ruled values retired
`perIp`/`perAddress` are gone from `AuthRouteLimit` (`auth-policy.ts:209-212`); the
register row keeps the raw fields with `legacy_limits_status: "RETIRED_NOT_ENFORCED"`
and provenance.

---

## THE REPLACED TEST — coverage increased, not reduced

Deleted: `S3c D1 lets a fresh real registration through after many-source
production-capacity saturation` (the single-innocent full-occupancy test I disproved).
Replaced by `S3c B2 isolates route budgets and bounds per-route collision refusal
under the stated threat` (`tests/integration/registration-database.test.ts:850`).

The original's intent was *"a fresh innocent under its own limit is admitted"*. The
replacement asserts that for **2 000 innocents × 3 routes × 4 intensities**, plus a
**real service call** per cell (`real=ADMITTED`), plus exact cross-route isolation.
The packet required me to confirm the undersized-capacity mutant still dies:
**mutant W4** (capacity 4 096/route) → RED, collateral register up to 100 %, verify up
to 100 %, resend 99.65–100 % — reproducing Codex's figures exactly. Coverage is
strictly larger. The one property genuinely no longer tested is behaviour at *full*
occupancy, which now requires ~66 M HMACs and lies beyond the stated threat model;
that is a defensible trade, and I measured the beyond-threat curve myself (N5).

## SIX NEW VR-10 MUTANTS — ALL RE-DERIVED RED BY ME

| mutant | guarding test | result |
|---|---|---|
| W1 cooldown back to 60 s | integration `S3c B1 …` | RED — **60 mails / 60 token versions / 59 rotations** (Codex's exact figures) |
| W2 repository rotates on ignored resends | integration `S3c B1 …` | RED — `VERIFICATION_TOKEN_INVALID` |
| W3 all routes forced onto register slots | integration `S3c B2 …` | RED — **14/2 000** for both verify and resend (exact match) |
| W4 capacity reduced to 4 096/route | integration `S3c B2 …` | RED — register→100 %, verify→100 %, resend 99.65–100 % (exact match) |
| W5 published register-20 ppm 4 500→4 501 | integration `S3c B2 …` | RED — operator-policy assertion |
| W6 per-key guard no-op | unit + integration `S3c B3 …` | RED — unit admitted 60; real route calls 2/2 ALLOWED |

Product, policy and repository files restored byte-for-byte after each.

## D1 / D3 RE-VERIFIED ON THE RESIZED STRUCTURE

- **Property 1 (bounded memory): holds.** Fixed `new Array(1 572 864)`; per-slot depth
  bounded by the *route's own* limit — 600 k many-source requests gave measured max
  depth `{register: 8, verify: 8, resend: 3}` against ruled 20/10/3, and a 200 k
  single-source flood occupies 2 slots. (The *cost* of that bound is N1.)
- **Property 2 (never forgiven early): holds on all three routes.** Under 18 000
  concurrent-churn requests, an at-limit key reopened at **exactly** the ruled window
  — register 900 000 ms, verify 900 000 ms, resend 3 600 000 ms. No metastable slide.
- **Property 4 (over-count only): holds.** 60 trials × 60 000 mixed-route requests:
  **maximum admissions above the ruled budget = 0.**
- **Window / straddle: exact.** Max admissions in any sliding window measured at
  **20 / 10 / 3** — the ruled values, no double budget.
- **New occupancy counter is exact.** The incremental `occupiedSlotsByRoute`
  (`registration.ts:128, 174`) matched a brute-force recount through fill, full
  expiry-and-re-touch, and fresh-key phases (11 193 / 11 193, 11 193 / 11 193,
  11 530 / 11 530). No drift.
- **D3 unchanged.** Object-graph walk after traffic on all three routes: **exactly one**
  raw-IP occurrence, `limiter.refusalAggregates[register].source.ip` — the documented
  residual. Slot fields `["expiries","saturatedUntil"]`, types `["number[]","number"]`.

## GATES AND FROZEN SCOPE

- `pnpm test` → **110 files / 799 tests passed**, 167.12 s, exit 0.
- `pnpm typecheck` → PASS. `pnpm lint` → **28 architecture edges / 0 violations / 0 blocking**.
- **VR-3** green (`audit_rows=642 forbidden_matches=0 actor_ciphertext_nonnull=0 chain_valid=true`).
- **S3b re-run and green** after the send-cap change: commit gate
  (`committed_at_response=1`), 100-burst durability (`successes=100 committed_at_response=100`),
  F3 ordering (`before_commit_calls=0 persisted_accounts=0`), and the equal-work
  enumeration oracle (`auc_ceiling_pct=80.0`, N=1/4/8 all under it).

---

## WHAT LIFTS THE BLOCK

**N1 — make the published cost true, or make the true cost small.** Either:
1. Replace/augment `storage_upper_bound` with a **measured resident bound**: run the
   structure to ≥99 % occupancy at the ruled sizing and publish the observed
   `heapUsed` and RSS, plus the statement that it is per-process and multiplies per
   worker. Proof required: a live measurement showing the published figure is an upper
   bound on what is actually measured — not only on primitive payload; **or**
2. re-size against the true ~531 bytes/slot so the resident cost meets a stated budget
   (and re-derive the row-width arithmetic against that budget); **or**
3. flatten the representation — a `Float64Array` of expiries plus a count array
   instead of a frozen object wrapping a frozen array per slot — so the real cost
   converges on the published arithmetic. This also removes the per-request array
   allocation that produces the 1.65 GiB RSS delta.

In all three cases, restate the sizing justification against whichever cost model
is published, since 524 288 slots/route was selected under the wrong one.

**N2** — record the deadlock and the 500-vs-202 existence oracle with the measured
numbers (7–8/32 `40P01`, existing 8/32 untyped 500s vs missing 0/32) on the owning
S3b/S3d/T-series ticket. No fix required inside S3c.

**Also fix N3, N4, N5, N6** with the rework — all are edits to the ruled row's
published strings and one test assertion.

---

*Read-only on product source apart from restored mutations. Tree verified
byte-identical to the r1 baseline (400-file sha256 manifest); restored hashes match
Codex's recorded `64a3cb4b…` / `dbb248ef85…` / `349dcb165f…`. No commit, no push.*
