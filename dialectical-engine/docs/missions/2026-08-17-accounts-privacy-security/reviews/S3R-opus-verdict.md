# S3 REWORK verdict — Opus lens (finder confirms its own findings)

Ticket t_3c875ffb, board `accounts-phase1`. Author: Codex, same session 01a019e7.
Rework of a split diamond; my prior verdict: `reviews/S3-opus-verdict.md` (BLOCK on
findings 2 and 6). Review date 2026-08-19.

## VERDICT: **BLOCK**

**Both of my original blocking findings are genuinely fixed at the mechanism level,
not hidden by the measurement.** I re-ran the same falsification experiments that
found them, harder than before, and they do not reproduce:

- **R1 — the enumeration oracle is gone.** My slow-transport matrix now reads
  `indistinguishable` at 0 / 400 / 1000 / **3000** ms, in both the drained shape the
  author's test uses and the **undrained** shape production actually runs. Worst
  cell across 16 cells over two full runs: **6.5 ms** (was 674 ms). ✅
- **R2(a) — the limiter is bounded.** My 200,000-request single-IP flood retains
  **21 buckets / 5.1 MiB** (was 200,001 / 82.5 MiB). ✅
- **R2(b) — refusal auditing is bounded.** 1,000,000 refusals inside one 60 s window
  produce **1** immutable row. ✅
- **R3 — no raw IP survives.** 0 hits across all 13 audit columns; same source → 1
  distinct hash; rotated salt → different hash. ✅
- **VR-3 — no regression.** 169 independent probes (13 identifier encodings × 13
  columns) after a real `DELETE`: **0 hits**; chain walks 39/39 rows and verifies. ✅

I am blocking on **two things that are not those findings**:

1. **The lockfile is still broken and was mischaracterised.** `pnpm install
   --frozen-lockfile` **still fails**. The delta is *not* "exactly the hash-wasm
   entry" — two workspace importer entries are **missing**, and both were introduced
   by this ticket, not pre-existing.
2. **The aggregated refusal audit drops the count the rework contract required**, and
   with it every refusing source after the first in each window. The security
   invariant (bounded growth of an undeletable table) holds; the *investigative*
   property the packet asked me to confirm does not.

Both fixes are small. Nothing in R1, R3 or VR-3 needs rework — do not touch them.

## Live world — every gate run by this lens

| Gate | Result |
|---|---|
| `pnpm test` | **110 files / 771 tests passed**, exit 0, 74.30 s — matches Codex exactly |
| `pnpm typecheck` | **exit 0** |
| `pnpm lint` | **exit 0** — `audit:architecture` 28 edge rows / 0 violations, `audit:source` 0 blocking |
| R1 proof test (`registration-database.test.ts:202-235`) | passed — `mail_ms=0 Δ0.5 \| 400 Δ1.1 \| 1000 Δ0.2` |
| R2 bucket proof (`registration.test.ts:198-236`) | passed — `requests=200000 refused=199980 retained_buckets=21` |
| R2 audit proof (`registration-database.test.ts:288-338`) | passed — `refusals=40 immutable_rows_added=1 chain_valid=true` |
| R3 proof (`registration-database.test.ts:340-376`) | passed — `raw_ip_hits=0 stable_hashes=1 rotated_differs=true` |
| VR-3 proof (`registration-database.test.ts:378-478`) | passed — `audit_rows=39 forbidden_matches=0 actor_ciphertext_nonnull=0 chain_valid=true` |
| `pnpm install --frozen-lockfile` (scratch tree, repo untouched) | **FAILS — ERR_PNPM_OUTDATED_LOCKFILE** (finding 1) |

Codex's claimed numbers are accurate everywhere I could check them, **except** the
lockfile row of its evidence table.

---

# Findings

## 1. Lockfile — **STILL BROKEN, and not what was reported. Blocking.** ❌

The rework packet authorised `pnpm install --lockfile-only` and required the delta to
be hash-wasm only. The lockfile in the tree is **not the output of that command.**

I reproduced this without touching the repo: copied all 38 workspace manifests plus
`pnpm-workspace.yaml`, the root `package.json` and `pnpm-lock.yaml` into a scratch
tree and installed there.

```
$ pnpm install --frozen-lockfile --ignore-scripts --lockfile-only
Scope: all 32 workspace projects
✓ Lockfile passes supply-chain policies
[ERR_PNPM_OUTDATED_LOCKFILE] Cannot install with "frozen-lockfile" because
pnpm-lock.yaml is not up to date with <ROOT>/packages/db/package.json
  Failure reason:
  specifiers in the lockfile don't match specifiers in package.json:
* 1 dependencies were added: @debateai/crypto@workspace:*
```

Then I let pnpm regenerate the lockfile in that scratch tree and diffed it against the
one in the repo. **The entire difference is six lines — two missing importer entries:**

```
128a129,131                       <-- apps/api
>       '@debateai/crypto':
>         specifier: workspace:*
>         version: link:../../packages/crypto
393a397,399                       <-- packages/db
>       '@debateai/crypto':
>         specifier: workspace:*
>         version: link:../crypto
```

So the honest statement of the delta is: **hash-wasm was added correctly
(`pnpm-lock.yaml:386-390`, `:2617`, `:4926` — I verified the regenerated file matches
byte-for-byte there), and two workspace links that the real command produces are
absent.** A clean checkout and CI still break.

**On Codex's claim that this is a "separate pre-existing `packages/db` workspace-link
mismatch" it was right to leave untouched — I disagree on all three counts:**

- **It is not one mismatch, it is two.** `apps/api` is missing the same link and was
  not reported at all. `apps/api/package.json:*` and `packages/db/package.json:*` both
  declare `"@debateai/crypto": "workspace:*"`.
- **It is not pre-existing — this ticket created it.** The committed `main.ts` at HEAD
  contains no `@debateai/crypto` import (`git show HEAD:…/apps/api/src/main.ts` → no
  match); the import arrives with this ticket at `apps/api/src/main.ts:2` and
  `apps/api/src/registration.ts:15`. On the db side, `packages/db/src/identity.ts:3`
  is the *only* file under `packages/db/src` that imports `@debateai/crypto`, and it
  is a new file from this ticket. Both manifests were last written at 15:17 and 15:19
  — inside the S3 authoring window I established in the original review (15:04–15:30).
  These are this ticket's own manifest edits, not inherited debt.
- **It was not right to leave it.** The instruction "nothing else in the lockfile may
  change" was a guard against unrelated dependency churn, not a licence to ship a
  lockfile that cannot install. The authorised command fixes all three entries in one
  shot and changes nothing else — I proved exactly that above. Leaving it means the
  ticket lands with `--frozen-lockfile` red, which is the precise failure I flagged in
  §8 of my original verdict and which the rework was authorised to close.

**Does it need its own ticket?** No. It is six lines produced by the command already
authorised for this ticket, on manifests this ticket wrote. Splitting it into a
follow-up would leave main red in between.

**Proof that would change my mind:** run `pnpm install --lockfile-only` in the repo
and show `pnpm install --frozen-lockfile` exiting 0, with the lockfile diff limited to
the hash-wasm entries plus those two importer blocks.

## 2. R1 enumeration oracle — **VERIFIED FIXED.** ✅

The mechanism is right, not just the numbers.

- The send is **out of the measured window**. `register()` stashes the delivery in
  `pendingDelivery` (`apps/api/src/registration.ts:320-327`) and the `finally` runs
  `holdEnumerationFloor` **first**, then dispatches
  (`registration.ts:334-340`); `dispatchVerification` (`:207-216`) defers through
  `setImmediate` and never returns to the caller. `resendVerification` has the
  identical, correct shape (`:414-421`, `:424-430`).
- The floor now covers only argon2id + the blind-index lookup + (on the new path) the
  account INSERT. I measured that residual asymmetry directly over 5 paired
  registrations: `new_mean=502.2 dup_mean=501.9 **delta=0.3 ms**`, `new_max=502.7`
  — the DB write is far inside the ~356 ms of headroom, so no oracle from that axis
  either.
- **My matrix, re-run harder than before** (independent probe, own service wiring,
  fresh embedded Postgres, 3000 ms added, and a second pass that deliberately does
  **not** drain the background dispatch — the production shape, where a prior request's
  mail contends with the next request):

```
mail=   0ms drained   new=503.2 dup=502.4 DELTA= 0.7 indistinguishable
mail=   0ms UNDRAINED new=501.3 dup=501.7 DELTA=-0.4 indistinguishable
mail= 400ms drained   new=502.0 dup=501.2 DELTA= 0.9 indistinguishable
mail= 400ms UNDRAINED new=501.7 dup=501.9 DELTA=-0.2 indistinguishable
mail=1000ms drained   new=504.0 dup=501.4 DELTA= 2.6 indistinguishable
mail=1000ms UNDRAINED new=501.6 dup=501.3 DELTA= 0.3 indistinguishable
mail=3000ms drained   new=502.4 dup=502.2 DELTA= 0.3 indistinguishable
mail=3000ms UNDRAINED new=502.6 dup=501.5 DELTA= 1.1 indistinguishable
```

Was `674.2 ms` at 1000 ms. I ran this matrix twice on fresh databases; the worst
single cell across both runs was **6.5 ms** (1000 ms, drained), the run above being
the second. The oracle does not reappear at any latency I could
inject, and it cannot: transport latency is no longer on the response path at all, so
the delta is latency-independent by construction rather than by tuning.

- **The timeout is a ruled register row, not a constant.** `channelPolicy.transport_timeout_ms = 5_000`
  at `packages/register/src/auth-policy.ts:109`, schema-pinned as a positive integer
  at `:51`, provenance `AMENDMENTS.md#VR-5 own mail service, no relays (2026-08-19)`
  at `:112`, surfaced as `channel.transportTimeoutMs` at `:195`, and injected at
  `apps/api/src/main.ts:55`. `SendmailMailSender` **rejects construction** if it is
  absent or non-positive (`apps/api/src/mail-channel.ts:42-44`), so it fails closed;
  the timer SIGKILLs the child and raises `SENDMAIL_TIMEOUT`
  (`mail-channel.ts:75-78`). The hang I reported (`mail-channel.ts:67-88`, promise
  settling only on `error`/`exit`) is closed.

**F1 — would the new test fail against the pre-rework code? Yes, and the assertion is
real.** `registration-database.test.ts:232` asserts `delta < enumerationToleranceMs`
against the ruled tolerance of 100 ms read from the policy (`:204`), not a literal.
Against my pre-rework measurements the 1000 ms row (Δ674.2) fails that assertion by
6.7×. One caveat for the record: the **400 ms row alone would have passed**
pre-rework (Δ70.7 < 100), so only the 1000 ms row is decisive — the test is genuinely
red against the old code, but it is one row that makes it so. The timeout probe
(`registration.test.ts:251-276`, `sleep 1` binary against `timeoutMs: 40`, asserting
`SENDMAIL_TIMEOUT` inside 500 ms) also cannot pass pre-rework, since the old
constructor had no timeout parameter at all.

**Residual, advisory only:** the 5 s bound lives inside `SendmailMailSender`, not in
`RegistrationService`. `dispatchVerification` imposes no timeout of its own and
`pendingMailDispatches` (`registration.ts:162,215`) is an **unbounded** Set with no
concurrency cap or backpressure — a transport that never settles would accumulate
entries forever. This is no longer an oracle (it is off the response path) and the
ruled 5 s timeout bounds the shipped transport, but the packet asked for "a queue the
transport drains" and what landed is unbounded fire-and-forget. Worth a bound before
public launch; not a block.

## 3. R2(a) limiter bounding — **VERIFIED FIXED.** ✅

IP-first ordering is real: `consume()` checks `${route}:ip:${ip}` and returns before
any address key is constructed or charged
(`apps/api/src/registration.ts:122-131`). `retain()` (`:74-82`) deletes then
re-inserts the key (making Map insertion order an LRU recency order) and evicts from
the front while at capacity. The cap is a ruled row —
`rateLimitPolicy.bucket_capacity = 4_096` (`auth-policy.ts:93`), schema-pinned at
`:38`, provenance at `:101`, surfaced at `:190`, injected at `main.ts:62`; the
limiter constructor throws `AUTH_RATE_LIMIT_POLICY_INVALID` on a non-integer or
non-positive value (`registration.ts:68-71`).

My original flood, re-run independently:

```
200,000 register attempts from ONE ip with distinct address keys
  -> refused=199,980
  -> retained limiter buckets: 21     (was 200,001)
  -> heap growth: 5.1 MiB             (was 82.5 MiB)
```

The unauthenticated memory-exhaustion vector is closed. Finding 6(c) of my original
verdict — the victim's address quota being burned before the IP refusal — is closed by
the same reordering.

## 4. R2(b) refusal auditing — **bounded, but the ruled count was dropped. Blocking.** ❌

The growth invariant holds. What does not hold is the packet's requirement (§R2 fix 2:
*"one row per (route, window) **with a count**"*) and my review question 3(b),
*"refusal information is not lost in a way that defeats abuse investigation."*

**The count is computed and then thrown away.** `aggregateRefusal` accumulates
`ipCount`/`addressCount` and returns `count` (`registration.ts:106-113`);
`refuseRateLimit` reads only `aggregate.shouldWriteAudit` and
`aggregate.windowStartedAt` and never passes `count` on
(`registration.ts:193-203`); `recordRateLimitRefusal` has no count parameter
(`packages/db/src/identity.ts:361-368`) and its justification string omits it
(`identity.ts:377`):

```
aggregate:route-window;scope:ip;route:register;window:2026-08-19T13:27:00.000Z
```

**Measured consequence.** Driving `aggregateRefusal` directly, one route, one 60 s
window:

```
refusals=1,000,000 within one 60s window -> rows_written=1
the single row was written at i=0, scope="ip", count_at_write=1
```

The row is emitted on the **first** refusal of the window, before any volume exists,
and nothing is written afterwards. And I confirmed the same end-to-end against
Postgres: 519 real refusals from two different sources across ~4.4 minutes produced
**6 rows** (1 per 60 s window) — correct bounding, but the rows carry no indication
that 519 happened rather than 6.

What an abuse investigation therefore cannot answer from the audit table:

- **How many.** 1 refusal and 10⁶ refusals are byte-identical in the record.
- **Who, after the first.** The row carries the *first* refuser's `actor_key_ref` and
  `source_context.ipHmacSha256` only. Every other source refused in that minute is
  invisible — including, notably, an attacker who arrives one second after a
  legitimate user tripped the window.
- **Which scope.** Only the first refusal's `scope` is recorded, so an address-scope
  attack occurring in a window opened by an IP-scope refusal leaves no trace of the
  address dimension at all.

The packet allowed an alternative — "a counter/metric outside the immutable chain" —
and **neither** was implemented: there is no metric emission anywhere in the change
set. The volume signal is simply gone. Given the packet's own framing that this slice
"establishes the audit-writing discipline every later slice inherits", the aggregated
row should carry what it aggregates.

**Answering the rest of review question 3 in the positive, for the record:**
(a) the chain still verifies — my independent recursive walk reached 39 of 39 rows and
`verifyChain()` returned `true` on buffers read back from Postgres;
(c) **an attacker cannot force unbounded growth by rotating routes or windows** —
`AuthRoute` is a closed 3-member union and `targetType` is `auth.${route}`
(`identity.ts:372`), so no attacker-supplied route can appear, and the window is
`floor(now / 60_000) * 60_000` off the clock (`registration.ts:101`), which cannot be
advanced faster than real time. Sustained-flood ceiling: **3 routes × 1,440 windows =
4,320 rows/day** (~1.6 M/year) against the previous 280 rows per 300 requests. That is
an acceptable bound; I am not blocking on it, but it is a rate bound, not a total
bound, on an undeletable table, and it is worth stating in the ticket record.

**Proof that would change my mind:** persist the aggregate. Write the row at window
*close* (or update-by-append at rollover) carrying `ipCount` and `addressCount` for the
window that just ended, plus the distinct-source count or a small bounded set of
source hashes. Show a test where N refusals from ≥2 sources across one window produce
1 row whose recorded counts equal N and which names both scopes.

## 5. R2 — the LRU cap creates a rate-limit bypass. **Real. Not a block; needs its own ticket.** ⚠

Asked to think adversarially about the new design: **yes, an attacker can evict
legitimate users' buckets and thereby reset their limits.** Proven:

```
victim at limit, refused                       -> victim_refused_before = true
attacker churns 4,106 distinct IP keys through the map
victim retried                                 -> victim_allowed_after_churn = true
=> limit_bypass = true
```

The mechanism is that `retain()` (`registration.ts:74-82`) evicts the front of the Map
**regardless of the evicted bucket's state**, including a bucket that is currently
at or over its limit. Because `retain()` re-inserts on *every* call, any active key is
permanently MRU and legitimate low-frequency users are always in the LRU tail — the cap
systematically evicts precisely the buckets that are protecting someone.

Cost to the attacker: 4,096 distinct source addresses (trivial on an IPv6 /64,
moderate via a botnet or proxy pool). The per-IP limit is only weakly bypassed this
way — an attacker holding 4,096 addresses already has 81,920 register attempts per
15 minutes without any trick — but the **per-address** limit is bypassed completely,
and that is the only control standing between an attacker and unlimited attempts
against one victim's address, including their 3/hour resend quota.

**I am not blocking on this, and I want to be explicit about why:** "cap the map with
LRU eviction" is the remedy *I* specified in §6 of my original verdict. Codex built
exactly what was asked, and the result is strictly better than the unbounded
allocation it replaced. But the cap converts a memory-exhaustion DoS into a
rate-limit bypass, and that should be recorded rather than absorbed silently.

**Recommended hardening (cheap, one predicate):** never evict a bucket whose retained
timestamp count is at or above its route limit — evict only under-limit or
window-expired buckets, and prefer time-based sweeping (drop buckets whose entire
window has expired) before pressure-based eviction. If nothing is evictable, refuse
the request rather than admitting it. **This needs its own ticket** if it is not folded
into the fix for finding 4.

## 6. R3 source-IP hashing — **VERIFIED GREEN, with a residual worth ruling on.** ✅

Implementation is correct and matches V's ruling exactly. `PostgresIdentityRepository`
takes the salt in its constructor and **refuses a salt shorter than 32 bytes**
(`packages/db/src/identity.ts:55-58`, `AUDIT_SOURCE_IP_SALT_INVALID`); every audit
write emits `ipHmacSha256: HMAC-SHA-256(salt, ip)` and no raw address
(`identity.ts:96-97`). The salt comes from the **secret store, never the database**:
`AUDIT_SOURCE_IP_SALT_PATH` (`packages/register/src/runtime-environment.ts:55`) loaded
by `loadSecretKey`, which requires a regular file at **exactly mode 0600**
(`packages/crypto/src/index.ts:188-199`) and fails closed otherwise; `main.ts:33-36`
loads it, hands it over, and zeroes the source buffer.

My independent verification, on a fresh database:

```
columns searched = 13 (enumerated from information_schema, each cast to text)
raw_ip_hits                    = 0
rows carrying ipHmacSha256     = 38  (positive control: the field is really there)
distinct hashes, same source   = 1   (correlation preserved)
rotated salt differs           = true
```

I also confirmed the raw IP does not survive anywhere else: it is used only as an
in-memory limiter key (`registration.ts:124`) and is length-clamped at the boundary
(`registration.ts:153`); it never reaches a log line, `delivery_error`, or any column.
My original finding 10 advisory is now closed.

**Residual risk, stated as asked — is a bare HMAC over the 2³² IPv4 space adequate?**

*As pseudonymisation, yes. As protection against an adversary who holds both the dump
and the salt, no — and it cannot be made so by this construction.* SHA-256 runs at
~10¹⁰ H/s on commodity GPUs, so exhausting the entire 4.3 × 10⁹ IPv4 space against a
known salt takes **well under a second**, and the IPv6 space that matters in practice
(allocated /64s, not 2¹²⁸) is likewise enumerable. The whole security of this scheme
therefore rests on the salt file never travelling with a database dump.

Two consequences the orchestrator should carry forward:

1. **The salt can never be rotated.** `identity.audit_event` is immutable by trigger,
   so rotation re-keys nothing historical — it only breaks correlation across the
   rotation boundary while leaving every old row recoverable under the old salt. The
   salt is a permanent secret whose compromise is retroactive and unfixable.
2. **Backup separation is now a security control, not hygiene.** The salt file must be
   excluded from any backup or replica path that carries the database.

If V wants defence-in-depth rather than pure key-separation, the construction to ask
for is a **memory-hard KDF keyed by the salt** (argon2id/scrypt over the address,
computed once per request and reused across that request's audit writes) — that turns
a sub-second full-space sweep into an infeasible one even after salt disclosure, at
one hash per request rather than per row. I am **not** blocking on this: the delivered
construction is precisely what V ruled, and it removes personal data from the
undeletable table, which was the point. But "the salt leaks ⇒ every IP we ever saw is
recovered" should be an accepted risk on the record, not a surprise later.

## 7. VR-3 name-erasure — **NO REGRESSION. Spot-checked green.** ✅

Not re-litigated; spot-checked as instructed. On a fresh embedded Postgres I
registered an account, exercised the routes, then `DELETE FROM identity."user"` and
probed **13 identifier encodings × 13 columns = 169 per-column searches**: `user_id`,
user_id without dashes, email, email local-part, uppercased email, blind index as hex
/ base64 / `\x` bytea literal, pseudonym, pseudonym prefix, argon2 hash, plaintext
password, and the raw source IP.

```
[OPUS VR-3 SPOT] probes=169 hits=0
[OPUS CHAIN]     walked=39 total_rows=39 valid=true
```

The chain walk reaching **39 of 39** rows means no orphan fork, and `verifyChain()`
returned `true` on buffers read back out of Postgres. The suite's own VR-3 test agrees
(`audit_rows=39 forbidden_matches=0 actor_ciphertext_nonnull=0 chain_valid=true`), and
the writer boundary is unchanged — `actor_ciphertext` still hard-`NULL` in the INSERT
column list (`packages/db/src/identity.ts:110`), `assertOpaqueToken` still rejects any
non-v4-UUID actor (`identity.ts:46-50`), `target_id` still bound to the same
`$4` placeholder as `actor_key_ref` (`identity.ts:110`). The rework introduced one new
field into `source_context` and touched nothing else that VR-3 depends on. No
plaintext identity leaked back in.

## 8. Advisory — `request.ip` and reverse proxies

Now that the IP bucket is checked **first**, the whole limiter depends on
`request.ip` being the real client. Fastify is constructed without `trustProxy`
(`apps/api/src/index.ts:143`) and `sourceFor` takes `request.ip` directly
(`index.ts:199`) — correct and non-spoofable **today**, since `deploy/` contains no
reverse proxy. But the day one is introduced, every request collapses into a single IP
bucket (20 registrations per 15 minutes for the entire internet) *and* every audit row
records one hash. Worth pinning as a deployment gate rather than discovering it in
production. Not a block; nothing in this change set is wrong.

---

# Summary

| # | Item | Verdict |
|---|---|---|
| 1 | Lockfile | ❌ **BLOCK** — `--frozen-lockfile` still fails; 2 missing importers, both this ticket's own |
| 2 | R1 enumeration oracle | ✅ **fixed** — indistinguishable at 0/400/1000/3000 ms, drained and undrained; timeout is a ruled row |
| 3 | R2(a) limiter bounding | ✅ **fixed** — 21 buckets / 5.1 MiB under my 200k flood; IP checked first |
| 4 | R2(b) refusal auditing | ❌ **BLOCK** — bounded, but the ruled count and every non-first refuser are discarded |
| 5 | R2 LRU cap side-effect | ⚠ real rate-limit bypass, proven — not a block (I specified LRU), needs its own ticket |
| 6 | R3 source-IP HMAC | ✅ **verified** — 0 raw hits/13 columns, stable, rotates; residual stated |
| 7 | VR-3 name erasure | ✅ **no regression** — 169 probes, 0 hits, chain 39/39 valid |
| 8 | `request.ip` / proxies | ⚠ advisory — deployment gate, nothing wrong in the change set |

**To lift this BLOCK:** (i) run the already-authorised `pnpm install --lockfile-only`
and show `pnpm install --frozen-lockfile` exiting 0 with the diff limited to hash-wasm
plus the two `@debateai/crypto` importer blocks; (ii) persist the aggregate — window
counts and both scopes — on the refusal audit row, with a test proving N refusals from
≥2 sources in one window yield 1 row whose recorded counts equal N. Keep all four
gates green. Findings 2, 3, 6 and 7 need no rework; the R1 and R3 work is well built
and I would greenlight it on its own.

No commit, no push. Source untouched; the probe file written for this review
(`tests/integration/zz-opus-r-probe.test.ts`) was removed, and the lockfile
experiments ran in a scratch tree outside the repo.
