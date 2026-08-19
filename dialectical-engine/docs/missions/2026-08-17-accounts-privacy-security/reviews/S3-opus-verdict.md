# S3 dual-diamond verdict — Opus lens

Ticket t_3c875ffb, board `accounts-phase1`. Author: Codex (gpt-5.6-sol xhigh).
Lens: Opus (blind to the Grok lens). Review date 2026-08-19.

## VERDICT: **BLOCK**

The headline claim is **sound**. VR-3 holds under adversarial, independently-written
verification — I could not find a surviving identifier by any encoding I tried, and
the chain verifies from Postgres bytes. Claims 1, 3, 4, 5, 7, 9 and 10 pass.

I am blocking on **finding 2** and **finding 6**: two concrete, empirically
reproduced, unauthenticated resource-exhaustion vectors on the first public routes
in the system — one of them irreversible — plus a ruled enumeration guarantee whose
supporting evidence was produced under a stub that structurally cannot detect its
failure mode. Finding 8 (lockfile) is a hard pre-commit gate but is *not* my reason
for blocking; see §8.

## Change set established independently

`find . -type f -mmin -35` (run at 15:32, window 15:04–15:30), excluding the Aug-17
rename churn, `node_modules`, `web/.next` and `acceptance/.pgdata`. Result matches
the packet's declared scope exactly — 19 source/test files plus
`migrations/0031_registration_verification.sql`. No undeclared files were touched.

## Live world — all gates run by this lens

| Gate | Result |
|---|---|
| `./node_modules/.bin/vitest run tests/unit/registration.test.ts tests/integration/registration-database.test.ts` | **2 files / 15 tests passed** |
| `pnpm typecheck` (`tsc --noEmit`) | **exit 0** |
| `pnpm lint` (`audit:architecture` + `audit:source`) | **exit 0** — 28 edge rows, 0 violations, 0 blocking |
| `pnpm test` | **110 files / 766 tests passed**, 68.25 s |

Codex's reported gate numbers are accurate. The 28-row architecture count is correct
and unchanged: `hash-wasm` is an *external* dependency of `packages/crypto`, not a
workspace package edge, so no orphan-audit row needed updating.

---

# Findings

## 1. VR-3 — the name is gone. **VERIFIED GREEN.** ✅

I did not accept the author's test. I wrote and ran my own probe against a fresh
embedded Postgres: register a user, consume verification, then force refusals on all
three routes, producing **14 audit rows** — `identity.registration=1`,
`identity.verification.sent=1`, `identity.verification.consumed=2`,
`identity.verification.resend_requested=2`, `identity.auth.rate_limit_refused=8`.
Then `DELETE FROM identity."user"`, then search.

Answering **F1 (could this pass trivially?)** directly — no, and here is the proof:

- **Non-vacuity.** 14 audit rows existed before deletion and **all 14 still existed
  after** it (`before=14 after=14`), every one carrying the deleted user's
  `audit_token` in `actor_key_ref`. The search had real rows to fail on.
- **Positive control.** Before asserting absence I asserted *presence*: a whole-row
  text search for the user's `audit_token` returned **14 hits**. The search harness
  demonstrably finds things.
- **Column coverage.** I enumerated `identity.audit_event`'s columns from
  `information_schema` rather than assuming them — all 13: `audit_id, prev_hash,
  this_hash, actor_ciphertext, actor_key_ref, event_type, target_type, target_id,
  occurred_at, source_context, decision, success, justification` — and searched
  **each column individually** cast to text, not just `row::text`.
- **Encoding coverage.** 14 identifier variants, not 4: `user_id`, user_id without
  dashes, email, email local-part, uppercased email, recovery email, blind index as
  hex / base64 / `\x` bytea literal, pseudonym, pseudonym prefix, plaintext password,
  argon2 hash, raw verification token.
- **Result: 14 × 13 = 182 per-column probes, zero hits.** Whole-row search: zero hits
  for all 14 values.
- `actor_ciphertext IS NULL` on **every** row (`non-null=0`). The S2 encrypted-actor
  design is fully abandoned — `packages/db/src/identity.ts:104` hard-codes `NULL` in
  the INSERT's column list, so it cannot regress by accident.
- **Chain verifies from Postgres bytes.** A recursive walk from `prev_hash IS NULL`
  reached **14 of 14** rows (no orphan fork), and `verifyChain()` returned `true` on
  buffers read back out of the database.
- **Tamper control.** Mutating one field of the reconstructed chain made
  `verifyChain()` return `false` — so the `true` above is not vacuous.
- Cascade check: `identity.{user,channel_binding,session,mfa_factor,recovery_code}`
  all retain zero rows matching the deleted `user_id`
  (`ON DELETE CASCADE`, `migrations/0030_identity_foundation.sql:49,72,84,98`).

The mechanism is right, not just the test. `identity.audit_event` gets *only* the
opaque `audit_token` (`packages/db/src/identity.ts:87-88`, written to both
`actor_key_ref` and `target_id`), the token is a fresh `randomUUID()` unrelated to
`user_id` (`apps/api/src/registration.ts:221-222`), `assertOpaqueToken`
(`identity.ts:46-50`) rejects any non-v4-UUID actor at the writer boundary, and the
token→person mapping lives only in the deletable `identity."user"` row
(`migrations/0031_registration_verification.sql:7-19`). Deletion is pure row removal
with **zero audit mutation**, so the chain stays intact by construction.

**This claim is not the reason I am blocking.** V's ruling is honoured.

## 2. Enumeration resistance — **DEFECT. Blocking.** ❌

The reported evidence (`new_ms=501.6`, `duplicate_ms=502.8`, `byte_equal=true`) is
real, and I reproduced it (`new_ms=500.1 duplicate_ms=502.5`). The responses *are*
byte-identical (`REGISTRATION_PUBLIC_RESPONSE` is a frozen constant,
`apps/api/src/registration.ts:18-24`) and the floor *is* a ruled register row, not a
magic number (`packages/register/src/auth-policy.ts:80`, consumed at
`registration.ts:135`). Those sub-claims pass.

The packet asked: *"is a fixed floor defeatable by a slow-path outlier?"* **Yes, and
it is defeated by the mail send this very ticket introduced.**

`deliverVerification` is `await`ed **inside** the window the floor measures
(`registration.ts:252-259`), and `holdEnumerationFloor` only runs afterwards in the
`finally` (`registration.ts:266-268`). The floor can pad a *fast* path; it cannot
shorten a slow one. The new-address path pays argon2id + 2 INSERTs + **a real
`sendmail` process spawn**; the duplicate-address path returns at
`registration.ts:217` and pays argon2id only.

I measured the headroom and then the oracle:

```
argon2id(m=65536,t=3,p=1) cost:  143.6 ms
floor:                           500   ms
headroom for DB + MAIL:          356.4 ms

mail latency    0 ms -> new=502.2  duplicate=501.4  DELTA=  0.8 ms  indistinguishable
mail latency   50 ms -> new=500.7  duplicate=502.0  DELTA= -1.3 ms  indistinguishable
mail latency  150 ms -> new=501.0  duplicate=501.8  DELTA= -0.8 ms  indistinguishable
mail latency  400 ms -> new=572.2  duplicate=501.5  DELTA= 70.7 ms  *** DISTINGUISHABLE ***
mail latency 1000 ms -> new=1176.1 duplicate=501.8  DELTA=674.2 ms  *** DISTINGUISHABLE ***
```

Beyond ~356 ms of transport latency the floor stops hiding anything and registration
becomes a clean account-existence oracle. That is not a hypothetical bound:

- `SendmailMailSender` has **no timeout whatsoever** (`apps/api/src/mail-channel.ts:67-88`
  — the promise settles only on the child's `error` or `exit` event). A slow or
  blocked MTA queue makes the delta arbitrarily large, and a hung `sendmail` hangs the
  HTTP request forever.
- `resendVerification` has the identical shape: mail awaited at
  `registration.ts:341-348`, skipped entirely on the `ignored` (no-such-account or
  cooling) path, floor in the `finally` at `351-353`.

The suite cannot see any of this because `MemoryMailSender`
(`mail-channel.ts:24-30`) returns in ~0 ms — the 0 ms row above. The green evidence is
green because the measurement removed the asymmetric cost.

**Proof that would change my mind:** move the send off the response path (enqueue it,
or fire-and-forget after the floor has elapsed) — or bound it with a timeout strictly
below the remaining headroom and treat expiry as a delivery failure — **and** add a
test that injects a transport slower than the floor and still asserts comparable
timing. Reproduce my table with the ≥400 ms rows reading `indistinguishable`.

## 3. No plaintext anywhere — **VERIFIED GREEN.** ✅

Covered by my 182-probe matrix in §1 (which included the plaintext password, the
argon2 hash, both email addresses, the email local-part and the raw verification
token) plus the author's cross-table search over `user`, `channel_binding` and
`audit_event` (`tests/integration/registration-database.test.ts:194-215`). Zero leaks.

Email and recovery email are AEAD envelopes with full 7-component AAD binding
(`registration.ts:230-235`); there is no plaintext email column in the schema at all
(`migrations/0030_identity_foundation.sql:33-46`). Passwords are argon2id — I
confirmed the stored prefix is literally `$argon2id$v=19$m=65536,t=3,p=1$`
(`packages/crypto/src/index.ts:356-364`, params floor-checked at `348-355` against
`memoryCostKiB < 19_456`, i.e. OWASP's minimum). Verification tokens are 256-bit
`base64url` (`crypto/src/index.ts:376-378`) stored only as
`sha256:<hex>` (`crypto/src/index.ts:380-385`) and never logged — the failure log line
prints the channel-binding id and an operator code only
(`registration.ts:175`).

## 4. VR-4 pseudonyms — **VERIFIED GREEN.** ✅

`generatePseudonym()` (`packages/crypto/src/index.ts:398-402`) draws from
`randomInt` × 2 plus `randomBytes(3)` — **fresh CSPRNG entropy, zero derivation** from
email, `user_id` or any key. This is exactly the property that makes the VR-3 deletion
irreversible, so it matters. Uniqueness is enforced by the database
(`migrations/0030_identity_foundation.sql:40`, `pseudonym text NOT NULL UNIQUE`), not
by hope, with a 5-attempt reallocation loop on collision
(`registration.ts:219,250`) and a typed `PSEUDONYM_ALLOCATION_EXHAUSTED` if that
fails (`registration.ts:265`). Stable: written once at registration, never rotated.
Space ≈ 24 × 24 × 16³ᐟ² ≈ 9.7 × 10⁹.

## 5. VR-5 mail — **GREEN, with the timeout gap folded into finding 2.** ✅

Own transport only: `SendmailMailSender` spawns a local binary
(`mail-channel.ts:68`); there is no third-party relay, SDK or HTTP client anywhere in
the change set. `MAIL_FROM` is regex-pinned to `^noreply@…` at both the env boundary
(`packages/register/src/runtime-environment.ts:57`) and the constructor
(`mail-channel.ts:38`). Check-spam guidance appears in both public responses
(`registration.ts:19,23`), in the mail body (`mail-channel.ts:64`) and in the ruled
`channelPolicy` row (`auth-policy.ts:102`). Resend cooldown is a real DB-side check
(`packages/db/src/identity.ts:324-326`), not client-trusted.

Delivery failures are genuinely operator-visible on three surfaces: persisted to
`channel_binding.delivery_status`/`delivery_error` (`identity.ts:233-237`), written
into the audit chain as the `justification` of a `success=false` event
(`identity.ts:238-247`), and logged (`registration.ts:175`). Tests never send real
mail. Header injection is not reachable — the recipient is CRLF-rejected
(`mail-channel.ts:47`) and passed as an `execFile`-style argv element with no shell.

Two sub-gaps (the first is the blocking one): **no send timeout** (see §2), and a
recipient matching `^[^\s@]+@[^\s@]+$` may begin with `-`, so it lands in `sendmail`'s
argv where it could be read as a flag — worth an anchor tightening even though I
found no exploitable path.

## 6. Rate limiting — **DEFECT, two vectors. Blocking.** ❌

The contract sub-claims pass: limits are per-IP **and** per-address on all three
routes (`registration.ts:71-86`), thresholds are ruled register rows and not constants
(`auth-policy.ts:87-93` → `main.ts:56`), and refusals are audited
(`identity.ts:355-372`). What fails is that **the refusal path is unbounded and more
expensive than the success path is capped**.

**(a) The per-IP cap does not bound memory.** `consume()` charges the *address* bucket
**before** checking the IP bucket (`registration.ts:79` then `82`), and `take()`
(`registration.ts:60-69`) writes `this.buckets.set(key, …)` on every call with **no
eviction anywhere** — entries are only pruned if that same key is consumed again.
Measured:

```
200,000 register attempts from ONE ip with distinct address keys
  -> allowed=20  refused=199,980
  -> retained limiter buckets: 200,001
  -> heap growth: 82.5 MiB
  (per-IP register cap is 20 / 900,000 ms)
```

A single unauthenticated client, allowed only 20 requests, permanently allocated
200,001 buckets. Nothing frees them. This is remote memory exhaustion on a public
route, and OOM-restarting the process also wipes all rate-limit state.

**(b) Every refused request writes a permanent, un-purgeable audit row.**
`refuseRateLimit` (`registration.ts:140-155`) calls `recordRateLimitRefusal`, which
opens a transaction and appends to the chain (`identity.ts:362-371`), taking the
**global** `pg_advisory_xact_lock('identity:audit-chain')` (`identity.ts:72`) — so
every refusal is serialized against every audit write system-wide. Measured:

```
300 unauthenticated register attempts from ONE ip
  -> 280 refused by the rate limiter
  -> 320 audit rows written, of which 280 are rate_limit_refused
  -> 3,127 ms (10.4 ms/request, each holding the global audit advisory lock)
operator purge attempt:
  -> DELETE REFUSED (SQLSTATE 55000): append-only or immutable table audit_event rejects DELETE
```

`identity.audit_event` carries a `BEFORE UPDATE OR DELETE` immutability trigger
(`migrations/0030_identity_foundation.sql:139-142` → `core.reject_mutation`,
`migrations/0000_s00.sql:31-38`). So an attacker can inflate an append-only table
**without bound and without any possibility of cleanup**, while serializing the audit
chain for everyone else. The rate limiter limits the cheap work and leaves the
expensive work uncapped. The packet says this slice "establishes the audit-writing
discipline every later slice inherits" — which is precisely why this must not land.

**(c) Related, non-blocking:** because the address bucket is charged before the IP
check, an attacker who merely knows a victim's address can burn the victim's
`resend` quota (3/hour) indefinitely and deny them account activation — while each
attempt also writes an un-purgeable row. The DB-side 60 s cooldown
(`identity.ts:324-326`) already governs real sends, so the per-address *request*
limiter is mostly redundant here and actively harmful.

**Proof that would change my mind:** (i) bound the limiter — sweep expired buckets, or
cap the map with LRU eviction — and show bucket count staying bounded under my 200k
single-IP loop; (ii) collapse refusal auditing so a sustained flood costs O(1) rows
per key per window rather than O(requests), and show ≤ a handful of rows written for
my 300-attempt loop; (iii) check the IP bucket before charging the address bucket.

## 7. DEK store (A2-1) — **VERIFIED GREEN.** ✅

Wrapped DEKs go to the file store and nowhere near Postgres. I grepped
`packages/db/src`, `apps/api/src` and **every** file under `migrations/` for
`dek`/`kek`/`wrapped_dek`: the only hits are the `FileUserDekStore` wiring in
`main.ts:2,53` and the in-memory DEK handling in `registration.ts:227-249`. No
migration defines any key-material column.

`FileUserDekStore.store` (`packages/crypto/src/index.ts:408-445`) creates
`root/`, `users/` and `users/<uuid>/` at `0700` and writes `dek.v1.json` with
`open(..., "wx", 0o600)` — `wx` also makes re-provisioning fail closed rather than
overwrite a live key. `0700`/`0600` are umask-safe (neither has group/other bits for
umask to clear). Verified live at `tests/integration/registration-database.test.ts:119-120`
and `tests/unit/registration.test.ts:106-114`. The plaintext DEK is zeroed in a
`finally` (`registration.ts:261-263`) and the store only ever persists the AEAD
envelope, bound by AAD to the user id (`crypto/src/index.ts:420-424`). The layout is
documented (`packages/crypto/SECRET_STORE_LAYOUT.md`), which correctly discloses that
**deleting** the DEK file belongs to S10 — worth carrying into S10's packet, since a
wrapped DEK surviving deletion is the one identity artefact VR-3's audit proof does
not cover.

## 8. `hash-wasm` / `pnpm-lock.yaml` — **CONFIRMED BREAK. Hard pre-commit gate, but NOT my reason for blocking.**

**The gap is real and I reproduced it**, without touching the repo. I copied all 36
workspace manifests plus `pnpm-lock.yaml` into a scratch tree and ran the install
there:

```
Scope: all 32 workspace projects
✓ Lockfile passes supply-chain policies (562 entries in 1.8s)
[ERR_PNPM_OUTDATED_LOCKFILE] Cannot install with "frozen-lockfile" because
pnpm-lock.yaml is not up to date with <ROOT>/packages/crypto/package.json
  Failure reason:
  specifiers in the lockfile don't match specifiers in package.json:
* 1 dependencies were added: hash-wasm@4.12.0
```

`packages/crypto/package.json:7-9` declares `hash-wasm: 4.12.0`; `pnpm-lock.yaml:386`
still reads `packages/crypto: {}`.

**Does the suite pass only because the module is already in `node_modules`? Yes —
confirmed by timestamps.** `node_modules/.pnpm/hash-wasm@4.12.0/` was created at
**15:15** today; `pnpm-lock.yaml` was last written at **12:03**. An install ran that
placed the package without updating the lockfile. So all 766 green tests depend on
local machine state that a clean checkout cannot reproduce.

**My plain view, as asked: this is NOT a block on Codex.** The packet explicitly
forbade touching `pnpm-lock.yaml`; Codex obeyed its contract and disclosed the
consequence accurately. It is a **mechanical, non-negotiable pre-commit gate for the
orchestrator** — run `pnpm install --lockfile-only` (or a plain `pnpm install`) and
commit the regenerated lockfile in the same commit. If this commit lands without it,
CI and every clean checkout break immediately, so it must not be deferred to a later
ticket. Note also that the supply-chain policy pass shown above verified 562 lockfile
entries — `hash-wasm` has never been through that gate and will be evaluated by it the
first time the lockfile is regenerated.

**Is `hash-wasm` a reasonable argon2id choice?** Broadly yes, with one caveat the
orchestrator should record. In its favour: pure WASM, no native toolchain or
`node-gyp`, no postinstall build, identical behaviour across dev/CI/prod, and the
encoded output is standard PHC (`$argon2id$v=19$m=65536,t=3,p=1$`), so migrating to
another argon2 implementation later needs no rehash. Against it: WASM argon2 runs
**synchronously on the main thread** despite the `async` signature. I measured it:

```
hashPassword wall = 134.6 ms
a 5 ms timer scheduled just before the hash fired after 134.7 ms
-> event-loop starvation = 129.7 ms
```

Every registration blocks the single-threaded API for ~135 ms and allocates 64 MiB.
Native `node-argon2` would run on the libuv threadpool and not block. The rate limiter
does at least gate this correctly — the limiter check precedes `hashPassword`
(`registration.ts:200-216`), so refused requests do **not** pay the argon2 cost.
Acceptable at launch scale; worth a note for S5 (login) where hashing happens on every
attempt.

## 9. Auth-policy row seeding — **VERIFIED GREEN: it fails closed.** ✅

Confirmed the disclosed gap is real: `AUTH_POLICY_REGISTER_ROWS`
(`auth-policy.ts:57-106`) is exported and used **only by tests** — nothing writes it
to `register.register_row`, and `register.bootstrap.json` contains only
`nodeRuntimeVersion, pnpmVersion, postgresMajorVersion, typescriptVersion,
vllmImageDigest`. The rows must be seeded before production start.

But the packet's real question — *does anything fail closed, or does it silently run
with no limits?* — resolves the right way. `readAuthPolicy` (`auth-policy.ts:185-198`)
selects the four keys and hands them to `authPolicyFromRegisterRows`, which throws
`AUTH_POLICY_UNRESOLVED` if any row is missing or has a blank `source_ref`
(`auth-policy.ts:139-144`) and `AUTH_POLICY_INVALID` if any row violates its strict
zod member type (`auth-policy.ts:149-151`). `main.ts:45` awaits this at module top
level, **before** `buildApi` at `104`. Missing rows kill the process at boot. There is
no default, no fallback to the in-code constant, and no path to a running API with
absent limits. Correct.

## 10. Audit hygiene — **GREEN for untrusted strings; one advisory on IP.** ✅

No raw untrusted string reaches an immutable row. The user-agent and request id are
SHA-256'd before persistence (`packages/db/src/identity.ts:90-94`, producing
`userAgentSha256`/`requestIdSha256`), and both are length-clamped upstream
(`registration.ts:107-111`). I confirmed this on the surviving row I dumped
post-deletion:

```json
{"actor_key_ref":"585da082-…","event_type":"identity.registration",
 "source_context":{"ip":"198.51.100.77",
   "requestIdSha256":"383ebfe5…","userAgentSha256":"8cc1c4b8…"},
 "decision":"ALLOW","success":true,"justification":null}
```

`justification` only ever carries writer-controlled constants
(`identity.ts:370`, `295`, `344`) or a regex-validated operator code
(`mail-channel.ts:16-18`).

**Advisory (not a block):** `source_context.ip` is stored **raw** and survives account
deletion forever in a table that cannot be deleted from. VR-3's enumerated list is
id / email / blind index / pseudonym, and an IP is none of those — so this is within
the ruling as written and I am not blocking on it. But the user's words were "gone
from our databases", and under GDPR an IP is personal data. Since `identity.audit_event`
is immutable by trigger, this is not fixable later without a migration. **Recommend V
be asked explicitly** whether the retained IP is intended, before the audit table
accumulates production rows. Hashing it (salted, like the user-agent) or truncating to
a /24 would preserve the abuse-investigation value at far lower residual risk.

---

# Summary

| # | Claim | Verdict |
|---|---|---|
| 1 | VR-3 — the name is gone | ✅ **verified independently, non-vacuous** |
| 2 | Enumeration resistance | ❌ **BLOCK** — mail send inside the floor window, no timeout |
| 3 | No plaintext anywhere | ✅ verified (182-probe matrix) |
| 4 | VR-4 pseudonyms | ✅ verified — fresh CSPRNG, DB-enforced uniqueness |
| 5 | VR-5 mail | ✅ verified (timeout gap folded into #2) |
| 6 | Rate limiting | ❌ **BLOCK** — unbounded buckets + unbounded un-purgeable audit rows |
| 7 | DEK store (A2-1) | ✅ verified — never in Postgres, 0700/0600 |
| 8 | `hash-wasm` / lockfile | ⚠ confirmed break — hard pre-commit gate, not a block on Codex |
| 9 | Auth-policy seeding | ✅ verified — fails closed at boot |
| 10 | Audit hygiene | ✅ verified — advisory on retained raw IP |

**To lift this BLOCK:** fix #2 and #6 as specified in their "proof that would change
my mind" paragraphs, keep all four gates green, and have the orchestrator regenerate
`pnpm-lock.yaml` in the landing commit (#8). Nothing in findings 1, 3, 4, 5, 7, 9 or
10 needs rework — the VR-3 core of this ticket is well built and I would greenlight it
on its own.

No commit, no push. Source untouched; all probe scripts written for this review were
removed.
