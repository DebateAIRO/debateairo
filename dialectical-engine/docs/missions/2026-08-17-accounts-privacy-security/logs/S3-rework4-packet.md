# S3 REWORK ROUND 4 — seven blockers from the exhaustive verification

Ticket t_3c875ffb, same session 01a019e7. An 11-agent verification (5 lanes,
each attacked by an independent refuter, then synthesis) returned
**DO-NOT-CLOSE**. Full verdict: `reviews/S3-FINAL-VERIFICATION.md` — **read it
before starting**; it carries file:line and measured numbers for every item.

**Two of these are regressions in our own fixes.** B1 is the LRU protection from
round 2 turning the limiter fail-OPEN; B2 is the enumeration oracle from round 1
returning through a different branch. Treat both as first-class defects, not
touch-ups.

**VR-3 (the name is gone) HOLDS** — verified twice, including a lane that stood
up its own isolated Postgres, created and deleted real accounts, and searched
every audit column across 12 encodings. **Do not touch that work.**

---

## B1 (BLOCKER) — the rate limiter fails OPEN and stays open
`apps/api/src/registration.ts:96-123`. `retain` runs twice per `consume` (IP then
address). At capacity the second call finds the IP bucket the first just created
as the only below-limit candidate and evicts it, so counters can never
accumulate. Measured against the real exported class: **one IP got 200/200
register (policy 20), 500/500 verify (policy 10), 500/500 resend (policy 3)**.
Reached with ~820 IPs / 16.4k requests, or by simply overshooting a flood. The
fail-*closed* state is **metastable**: `sweepExpired` (`:85-94`) drops one bucket
below limit and the map slides open.
**Fix must follow the general rule** — the refuter proved only
`floor(belowLimit/2)` distinct keys can retain state; "evict at most once per
consume" alone does NOT repair the two-rotating-keys case. Design for: a key that
is at/over limit is never evicted, eviction cannot cannibalise the key being
served, and a saturated map fails **closed** on new keys.
**Proof:** a saturating flood from one IP must be refused at the ruled policy
(20/10/3), sustained, with the map at capacity — and a two-rotating-keys probe.

## B2 (BLOCKER) — the enumeration oracle is reopened, wider than before
`registration.ts:255-259` pads but never **clamps**. The new-address branch does
strictly more *blocking* work than the duplicate branch: a second argon2id
(`packages/db/src/identity.ts:88`, ~25-28 ms), the global
`pg_advisory_xact_lock('identity:audit-chain')` (`:89`), a DEK file write inside
that lock, and five extra round trips — while the duplicate branch returns at
`registration.ts:407`. **At 4 concurrent registrations the distributions are
disjoint** (existing 513-615 ms, non-existent 904-971 ms): one request classifies
an address with zero error, and 4 in-flight requests fit inside one IP's own
ruled budget. The ruled `enumeration_tolerance_ms: 100` is **read by no product
code** — only by tests.
**Fix:** equalise the *blocking* work between branches (do the expensive work
off the response path, or make both branches perform it), and make the floor a
real clamp enforced in product code against the ruled tolerance.
**Proof (must be a REAL-STACK repro, not in-memory — the verification's harnesses
were in-memory and it flagged this):** under N=1 and N=4 concurrency against
Postgres, existing vs non-existent distributions must overlap within the ruled
tolerance.

## B3 (BLOCKER) — resend cooldown inert; first email ships a dead link
`prepareVerificationResend` reads `verification_last_sent_at` (`identity.ts:341`)
but the only writer is `recordVerificationDelivery` (`:252`), which runs
post-floor, post-response, off `setImmediate`. Register → resend 200 ms later
sends 2 mails where the cooldown intends 1, and the resend UPDATE
(`identity.ts:346-351`) rotates the token hash **before** the registration mail
is dispatched, so the user's first email arrives already invalid. And
`dispatchVerification` swallows record failures (`registration.ts:333-335`), so
one failure leaves the column NULL **permanently** and the cooldown inert for
that account forever.
**Fix:** set `verification_last_sent_at` in the same transaction that mints the
token hash. **Proof:** register→immediate-resend is refused by the cooldown; the
first email's token still validates; a failed delivery record cannot permanently
disable the cooldown.

## B4 (BLOCKER) — unsalted SHA-256 of the user agent in the immutable table
`packages/db/src/identity.ts:107-111` stores `userAgentSha256` (and
`requestIdSha256`) as **bare SHA-256**. A deleted person's exact browser/OS
string is recoverable free and forever from a public UA corpus, and the table can
never be repaired. **This is exactly the argument V accepted for VR-7** (append-
only ⇒ unrotatable ⇒ fast hash over a small domain is fatal), applied to the one
field VR-7 did not name. The production table is still empty — this is the only
moment the fix is free.
**Fix:** hash the user agent with the same salted, memory-hard construction VR-7
established for the IP (reuse the primitive; separate domain tag). **Delete
`requestIdSha256` entirely** — it hashes fastify's `req-<n>` counter and is
redundant with the plaintext `occurred_at` in the same row.
**Proof:** no bare-SHA-256 identity-adjacent field remains; UA correlation still
works within a salt epoch; zero raw UA strings.

## B5 (BLOCKER, one line) — a refusal can become a 500 leaking Postgres text
`registration.ts:322` awaits `recordRefusalAggregate` unguarded, while the timer
path (`:293-296`) has `.catch()` + operator log. `index.ts:185-190` returns
`message: knownError.message` for non-`AuthFlowError`. A DB fault on window
rollover turns a 429 into a 500 that leaks driver text to an unauthenticated
caller and silently loses the audit. **Fix:** guard it the same way the timer
path is guarded.

## B6 (BLOCKER, six lines) — Drizzle model/migration drift
`migrations/0031_registration_verification.sql:21-27` adds six verification/
delivery columns to `identity.channel_binding`; `packages/db/src/schema.ts:42-47`
declares all six on `mfaFactor`, and `channelBinding` (`:59-68`) has none. Green
only because `identity.ts` uses raw SQL and the contract test pins migration 0030.
**S4 (MFA) hits this first.** Move them.

## B7 (BLOCKER, one line) — stray workspace placeholder
`pnpm-workspace.yaml:11` contains `argon2: set this to true or false`, left by an
abandoned `pnpm add argon2` (`argon2` appears 0 times in the lockfile). Delete
the line. It is also outside the file contract and falsifies the progress log's
scope-audit claim — note that in your handoff rather than repeating it.

## Fold in (one-liners, same commit, no separate review)
- `"--"` before the recipient at `apps/api/src/mail-channel.ts:71`, plus reject a
  leading `-` in `validEmail` (`registration.ts:214`). *(Hardening only — the
  verification adjudicated this is NOT a remote-file-write class bug.)*
- `.max()` bounds on `memory_cost_kib`/`iterations` in
  `packages/register/src/auth-policy.ts:22-29`.
- Re-read the clock after the repository await in `verifyEmail` (`:473`) and
  `resendVerification` (`:506`).
- Correct the false claim in `migrations/0031` lines 4-5 and the stale "HMAC key"
  wording in `packages/crypto/SECRET_STORE_LAYOUT.md:14`.
- **Seed the five auth-policy rows** in `persistBootstrapRegister`
  (`packages/register/src/index.ts:462-487`) — without them `readAuthPolicy`
  throws and **the API cannot boot at all**.
- Add `CHECK (actor_ciphertext IS NULL)` and a CHECK forbidding `@` in
  `target_id` so VR-3 is structural rather than test-dependent (new migration
  0032; additive only).

## Explicitly OUT of scope (ticketed separately per VR-8)
Moving argon2id off the request thread; real client-IP/trustProxy handling;
graceful shutdown with audit drain; refusal-audit forensics (cardinality +
attacker-chosen actor token); `UserDekStore.destroy()`. Do NOT attempt these.

## Gates before REWORK READY
`pnpm typecheck` + `pnpm test` + `pnpm lint` green, plus a RED-first proof per
blocker (B1 and B2 need real-stack repros). Post `REWORK READY FOR HERMES REVIEW`
with per-blocker RED→GREEN evidence and the measured numbers.

## Return rule
Return at REWORK READY, `CODEX BLOCKED` (+ exact reason), or an IMPORTANT
OPERATION. Same session. Do NOT commit or push.
