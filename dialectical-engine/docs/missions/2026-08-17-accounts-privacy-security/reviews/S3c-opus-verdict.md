# S3c — Opus lens verdict

Ticket t_86938dd1, board `accounts-phase1`. Author: Codex, session 01a019e7, run 7.
Reviewed at HEAD cff3dd5 + working-tree changes. Blind lens: no other lens's verdict
or review log was opened.

## VERDICT: **BLOCK**

Three findings block. F1 and F2 are the two primary questions; both are measured, not
argued. F3 is an evidence-integrity failure of the same class the packet warned about.
The implementation is *better* than what it replaced — D1 properties 1, 2 and 4 hold,
D3 holds exactly as documented, and all six VR-10 mutants are real. But the property
D1 exists for (#3) is measurably false on the resend route, and D2's own stated proof
property is measurably still false.

---

## Method and change set

**Change set established from mtimes**, not `git diff` (the repo root is
`/Users/vladmihaimiron/Documents/DebateAIRO`, and the Aug-17 move into
`dialectical-engine/` leaves 4,467 dirty paths — `git status` is useless here).
Files written inside the S3c run window (01:10–01:31 EEST 2026-08-20):

| mtime | file |
|---|---|
| 01:13:38 | `packages/register/src/auth-policy.ts` |
| 01:20:10 | `tests/unit/registration.test.ts` |
| 01:20:39 | `apps/api/src/registration.ts` |
| 01:26:07 | `tests/integration/registration-database.test.ts` |
| 01:28:45 | `reports/orphan-audit.json` (untracked lint artifact; byte-identical to the one my own `pnpm lint` regenerated) |

`packages/db/src/identity.ts` carries mtime 00:49:08 — **outside** the S3c window (that
is the S3b-r1 review period) — and is **byte-identical to HEAD**. Not a scope breach.
Everything else on the frozen list predates the run: `packages/crypto/src` 08-19 20:06,
`apps/api/src/mail-channel.ts` 08-19 20:06, `migrations/0030–0032` 08-19,
`pnpm-lock.yaml` 08-19 16:42, identity schema/tests 08-19. **Frozen scope: clean.**

All numbers below are mine, produced live. Product source was mutated only under a
restore harness; the tree is **byte-identical** to the pre-review baseline
(400-file sha256 manifest diff empty; `apps/api/src/registration.ts` back to
`1bdfa938…f0a99b67`). No commit, no push. My scratch probe files were deleted.

---

## BLOCKING FINDINGS

### F1 — PRIMARY QUESTION 1: removing per-address admission raised the per-victim mail ceiling **15×**, and D2's own proof property is still false

**(a) Maximum verification emails deliverable to ONE victim address per hour.**
Measured on real embedded PostgreSQL, production policy, attacker holding **N = 20
source addresses** (20 = ceil(60 / resend admission 3), the minimum N that saturates
the cooldown):

| | register-path mails | resend requests issued | refused | resend mails sent | **total mails to victim in 1 h** |
|---|---|---|---|---|---|
| **S3c (working tree)** | 1 | 60 | 0 | 60 | **61** |
| **HEAD cff3dd5** | 1 | 60 | 57 | 3 | **4** |

That is the measured ceiling the packet asked for: **61/hour vs 4/hour, a 15.25×
regression**, and it is sustained indefinitely (60/hour every hour, 1,440/day) because
the resend entries and the pending state both renew. At N = 1 the two designs are equal
(3/hour); the regression scales linearly with N up to the 60 s cooldown ceiling at
N ≥ 20. IPv6 makes N = 20 free (one /64 is 2^64 sources).

Registration path checked as instructed: a **duplicate** address dispatches **0** mail
(measured `duplicate_path_mails: 0`; `registration.ts:483-490` → `recordDuplicateRegistrationPostwork`,
no delivery). An **unregistered** victim address dispatches exactly **1** — and that
one request is what creates the `pending_verification` account the attacker then bombs
for as long as it likes. The attacker does not need the victim to have an account.

**(b) The victim is still denied verification — the mechanism just moved.**
`prepareVerificationResend` (`packages/db/src/identity.ts:413-419`) overwrites
`verification_token_hash` on every send. Measured over one hour:

| | rotations of the victim's token in 1 h | victim verifying with the token they hold |
|---|---|---|
| **S3c** | **60** | `VERIFICATION_TOKEN_INVALID` |
| **HEAD** | 3 | `VERIFICATION_TOKEN_INVALID` |

D2's stated proof property is *"an attacker naming a victim's address cannot prevent
that victim from registering, verifying, or resending"* (`logs/S3c-packet.md:90-92`).
The victim's registration is now safe (that part is genuinely fixed and I confirmed it),
but **verification is still denied**, now 20× more cheaply, through token rotation
rather than budget exhaustion. The shipped D2 test
(`tests/integration/registration-database.test.ts:904`) only exercises `consume()` calls
with a victim `addressKey` — which is now an ignored parameter — so it cannot see this.

**(c) The cooldown is not the compensating control it was assumed to be.**
The packet was explicit: *"'the cooldown handles it' is an assertion that must be
tested, not accepted"* (`reviews/S3c-review-packet.md:42-43`). The progress log states
*"leaving outbound cooldown behavior unchanged"* and *"relying on unchanged channel
cooldown for outbound throttling"* (`logs/S3c-progress.log:1,3`) — the resulting
ceiling was never computed or measured. A 60 s cooldown permits 60 mails/hour, which
is not a throttle against a mail bomb; and the cooldown throttles *sends*, so every
send is also a token rotation.

**(d) Token guessing — NOT a regression. Cleared.** `generateVerificationToken()` is
`randomBytes(32).toString("base64url")` (`packages/crypto/src/index.ts:427-429`) = **256
bits**, validated as 43 base64url chars at `registration.ts:596`; TTL 24 h. Source-only
verify budget is 10/15 min = 40/h/source. Even at N = 10^8 sources that is 9.6×10^10
attempts over the whole TTL, P(hit a specific live token) ≈ **8.3×10^-67**. The removed
per-address bound of 10 is irrelevant at this entropy. The verify per-source budget in
fact **tightened**, from `per_ip 30` to `admission_per_source 10`; resend tightened from
15 to 3; register unchanged at 20.

**(e) Other per-address protection lost:** none beyond (a)/(b). The verify route's
`addressKey` was already `identity?.addressKey ?? tokenHash`, so it never protected an
address an attacker could name without the token.

### F2 — PRIMARY QUESTION 2: D1 property 3 is false, the collateral rate is up to **100%**, and the single-sample proof tested the one route that survives

The four slot rows are shared across all three routes — the key is
`` `${route}:source:${ip}` `` (`registration.ts:238`) but the 4,096-slot array is one
global structure (`registration.ts:93-100`). A slot's count is compared against the
*calling route's* limit, and `maximumEventsPerSlot` — the value a saturated slot reports
— is `max(20, 10, 3) = 20` (`registration.ts:102-104, 147-149`). So a register flood
(limit 20) fills slots to a depth that closes the **resend** route (limit 3) at 3 entries
and **verify** (limit 10) at 10, long before it closes register.

**Measured on the real PostgreSQL stack, production policy, in the author's own
saturation state** — their fill shape (route=register, one request per source), their
own fixed hash key `Buffer.alloc(32, 0x5c)` from
`tests/integration/registration-database.test.ts:800`, fill converging at **18,722
sources / occupied 4,096/4,096** (identical to their logged
`[S3c D1 SATURATION] many_source_fill=18722`), then 40 fresh innocent sources making
real service calls:

```
[OPUS Q2 REAL INNOCENT] backend=postgres fill_sources=18722 occupied=4096/4096
  register = 0/40 refused      (0%)   <-- the only route the author sampled
  verify   = 6/40 refused     (15%)
  resend   = 40/40 refused   (100%)
```

Population probe (3,000 fresh zero-request innocents, three hash keys including the
author's):

| hash key | fill sources | register | verify | **resend** |
|---|---|---|---|---|
| `5c5c5c5c` (author's) | 18,722 | 0.0% | 18.7% | **98.1%** |
| `47474747` (author's other) | 20,503 | 0.0% | 30.4% | **99.5%** |
| random | 17,119 | 0.0% | 10.3% | **97.9%** |

The claim in `logs/S3c-progress.log:3` — *"saturation cannot refuse an under-limit key
merely because it is new"* — and packet property 3 (`logs/S3c-packet.md:47-48`) are
**false**. The proof offered (*"a fresh innocent registration after 18,722-source
saturation succeeded"*) is a single sample on the single route that is immune.

**Attacker cost.** Cheapest sustained availability attack on the resend route — fill
with `resend`-route requests so entries live 60 min, one request per source:

| sources | requests/hour | sustained rate | innocent resend refusal |
|---|---|---|---|
| 4,096 | 4,096 | 1.1 req/s | 11.0% |
| 8,192 | 8,192 | 2.3 req/s | 58.9% |
| 12,288 | 12,288 | 3.4 req/s | 87.9% |
| **16,384** | **16,384** | **4.6 req/s** | **97.1%** |
| 24,576 | 24,576 | 6.8 req/s | 99.9% |

Register and verify stay at 0.0% under that attack. To close *all three* routes the
attacker instead spends each source's full 20-request register budget (all occupied
slots then read 20 ≥ every limit), and every route degrades identically:

| sources | requests | register | verify | resend |
|---|---|---|---|---|
| 196 (the old attack size) | 3,920 | 0.8% | 1.0% | 0.8% |
| 1,000 | 20,000 | 15.8% | 14.7% | 14.9% |
| 2,000 | 40,000 | 40.2% | 38.9% | 37.9% |
| 4,000 | 80,000 | 72.8% | 73.3% | 74.4% |

For comparison I ran the **HEAD limiter verbatim**: **196 sources / 3,901 requests**
fills the map to 4,096/4,096 and then refuses **200/200** innocent registrations —
reproducing Codex's corrected figure exactly. So the *register* outage genuinely got
~32× more expensive (196 → ~6,367 sources for 90%). That is a real improvement and
D1's headline is partly met. But the *resend* outage is now reachable at 4.6 req/s, and
the design converted a deterministic, obvious, total lockout into a partial one whose
magnitude nobody measured.

**Adversarial both-row collisions** (asked for explicitly): with a **known** hash key,
a targeted both-row collision took **2,458,945** candidate keys (theory 2048² ≈ 4.19 M);
the first colliding *pair* appears at **m = 1,529** keys (birthday theory ≈ 2,567). In
production `slotHashKey` is `randomBytes(32)` per process (`registration.ts:86`) and is
never exposed, so an attacker cannot precompute either; they would need a live refusal
oracle at ~4.2 M requests per targeted victim. **Targeted collision is not the practical
attack — undifferentiated volume is.** The two-row minimum works as designed; it is the
route-blind slot sharing and the depth-3 resend limit that do the damage.

**Not documented anywhere an operator would see.** The only statement of the trade is
the code comment at `apps/api/src/registration.ts:128-142` ("information loss can
over-count/refuse"), which gives no rate and does not mention that a register flood
closes resend. Nothing in `docs/`, no ruled register row, no runbook. The packet asked
whether the rate is *"stated anywhere an operator would see"* — it is not.

### F3 — the headline D1 flood proof is vacuous: both sustained-flood tests stay GREEN against a limiter with no per-key rate limiting at all

Mutant **V7**, replacing the per-key check at `registration.ts:150`

```ts
-    if (estimatedCount >= limit) return false;
+    if (this.memoryOccupancy().occupiedSlots >= this.bucketCapacity) return false;
```

i.e. **no rate limiting whatsoever** below full saturation. Result:

- `tests/unit/registration.test.ts:391` `S3c D1 keeps a one-source flood refused at 20/10/3 after full slot saturation` → **PASSES** ✓
- `tests/integration/registration-database.test.ts:718` `S3c D1 keeps real route calls refused at production 20/10/3 after full saturation` → **PASSES** ✓

Both saturate the sketch *first* and then assert the flood source is refused. At
4,096/4,096 **every** key is refused, so the assertion carries no information about the
flood key's own budget — which is exactly what F2's measurement shows independently
(40/40 fresh zero-request sources refused on resend in that same state). These two tests
are the evidence the progress log advertises as the D1 flood proof
(`logs/S3c-progress.log:5`: *"source floods stayed refused after 4,096/4,096 occupancy at
register 60/60 beyond limit 20, verify 30/30 beyond 10, resend 9/9 beyond 3"*).

To be fair to the author: the suite as a whole is **not** blind to V7 — it kills 4 unit
tests (`:269`, `:301`, `:338`, `:430`) and 4 integration tests. The implementation is
sound. But the specific assertion cited as the D1 proof violates the packet's proof
discipline (`logs/S3c-packet.md:116-121`, "no harness that suppresses the very effect
under test").

---

## NON-BLOCKING (fix with the rework)

### F4 — `per_ip` and `per_address` are now dead ruled values that will mislead an operator
`perIp`/`perAddress` survive in the register row (`auth-policy.ts:119-126`), the
member type (`:147-148`) and the parser (`:207-208`), but **no product code reads them**
— those four lines are the only non-test references in `apps/`, `packages/`, `tools/`.
An operator raising verify `per_ip` from 30 to 100 would get no effect; the governing
value is `admission_per_source: 10`. Consequently `RefusalAggregate.addressCount` is
permanently 0 and `recordRateLimitRefusal`'s `scope` is permanently `"ip"`
(`registration.ts:347`). Either retire the two fields additively with provenance, or
document them as reserved.

### F5 — "three legacy audit-only fixtures" is four, and one is not audit-only
Modified fixtures: `tests/integration/registration-database.test.ts:1290`, `:1416`,
`:1496` (the three audit ones) **plus** `tests/unit/registration.test.ts:338`
(`does not evict an active at-limit bucket…`, a limiter test). I read all four closely
for the F1-relaxation pattern and **found none**: each change only *adds*
`admissionPerSource: 1` alongside the existing `perIp: 1`, preserving the original
one-request-then-refuse intent, and no assertion was weakened. In `:1496` the refusal
reason moves from address-scope to source-scope, but that test asserts only the presence
of `auth.register|verify|resend` refusal rows, absence of user material, and chain
validity — all preserved. Separately, two unit tests were replaced outright (`:269`,
`:391`) and one lost its D2 half (the old `victimFromFreshIp` assertion that an
IP-refused request must not burn the address budget) — legitimate, since address buckets
no longer exist. **No fixture was relaxed to make the change pass.**

---

## CONFIRMED SOUND (my own measurements)

- **D1 property 1 — bounded memory: HOLDS.** `slots` is a fixed `new Array(4096)`
  (`registration.ts:93`), each slot ≤ 20 expiries (`:156`). Measured: 200k single-source
  requests → occupied **2/4096**, max slot depth 20, array length 4096; 200k many-source
  → **4096/4096**, max depth 20. Hard bound under any traffic.
- **D1 property 2 — never forgiven early: HOLDS, including the metastable slide.** An
  at-limit resend key (3/60 min) reopened at **exactly t+3600 s** = the ruled window,
  while 144,000 unrelated churn requests hammered the structure in between. Two rotating
  keys: A admitted **exactly 20**, no laundering. `activeSlot` only clears a slot when
  *both* the expiry log and `saturatedUntil` are past (`:119-122`), and `saturatedUntil`
  is monotone (`Math.max`, `:159`). No amnesty path found.
- **D1 property 4 — only over-counts: HOLDS.** 200 randomized trials × 40,000 mixed-route,
  mixed-clock requests across 500 sources: **maximum admissions above the ruled budget = 0.**
- **Window / boundary straddle: correct.** Sliding expiry log, not fixed tiers. Max
  admissions in **any** 15-minute sliding window measured at **20** = ruled. Probe at
  t+899,999 ms → REFUSE, t+900,000 ms → ALLOW. No double budget.
- **D3: HOLDS exactly as documented.** Full object-graph walk of a limiter after real
  traffic found **exactly one** raw-IP occurrence:
  `limiter.refusalAggregates[register].source.ip` — the documented residual, capped at
  3 routes. Slot field names are `["expiries","saturatedUntil"]`, value types
  `["number[]","number"]`. No raw key, no digest, no IP retained in the sketch.
- **All six VR-10 mutants re-derived RED by me**, with the author's own numbers
  reproduced: V1 remove at/over protection → unit `:391` RED; V2 evict served key →
  `:430` RED (*"expected 60 to be 20"*, exactly the logged figure); V3 refuse newcomers
  at capacity → integration `:800` RED; V4 restore address charging → `:871` and `:904`
  RED; V5 retain raw keys → `:458` RED; V6 grow storage per request → `:301` RED
  (*"204096"* vs 4096, exactly the logged figure). Product file restored to
  `1bdfa938…` after every mutant.
- **Gates reproduce.** `pnpm test` → **110 files / 798 tests passed**, exit 0.
  `pnpm typecheck` → PASS. `pnpm lint` → **28 architecture edges / 0 violations /
  0 blocking**. VR-3 audit-chain test green (`audit_rows>0, forbidden_matches=0,
  chain_valid=true`).
- **S3a/S3b unperturbed by the limiter change.** Re-ran and confirmed green:
  `S3b keeps a success pending until its real PostgreSQL transaction commits`
  (committed_at_response=1), `S3b returns 100 burst successes only after all 100
  accounts are committed` (100/100), `S3b F3 rejects an audit-invalid account before the
  DEK write`, and the equal-work enumeration oracle
  `S3b keeps live-mail N=1/N=4/N=8 arms below the separation ceiling`
  (AUC 53.1 / 60.2 / 52.9 % against an 80 % ceiling).

---

## What lifts the BLOCK

**For F1** — one of:
1. Move the per-address protection to the **outbound** side as the packet suggested:
   an address-owned cap on *messages delivered* per hour that never refuses the request,
   so the owner is never locked out; **or**
2. stop rotating `verification_token_hash` on a resend the owner did not request (keep
   the outstanding token valid), which removes the denial-of-verification even if the
   mail volume stays; **or**
3. post `CODEX BLOCKED` on the grounds that this cannot be separated from S3d's
   cooldown/mail semantics — which `logs/S3c-packet.md:83-84` explicitly authorises.

Proof required: a real-stack measurement of mails-to-one-victim-address-per-hour at
**N ≥ 20 sources** showing a number **≤ 4** (the HEAD baseline), *and* a real-stack proof
that the victim's own held token still verifies after an hour of attacker resends.

**For F2** — bound and state the collateral rate:
1. Stop letting one route's flood close another: partition the slot array per route, or
   make the saturated-slot sentinel route-relative instead of the global
   `max(admissionPerSource) = 20`, so a depth-3 resend limit is not tripped by a
   register flood; and/or size the sketch so the measured rate is acceptable.
2. Proof required: a **population** measurement (≥ 500 fresh innocent sources) on **all
   three** routes, at the same saturation states the D1 tests create, reporting the
   fraction refused per route — not one sample on one route.
3. Write the resulting bound where an operator sees it: a ruled register row or a
   documented operating limit, not only a code comment.

**For F3** — replace the saturate-then-flood assertion with one that isolates the flood
key's own budget: in the same saturated state, assert the flood source is refused **and**
that a control source under its own limit is still admitted; then show that test goes
**RED** under a "no per-key limiting" mutant (V7 above).

**Also fix F4** with the rework.

---

*Read-only on product source apart from restored mutations. Tree verified byte-identical
to the pre-review baseline (400-file sha256 manifest). No commit, no push.*
