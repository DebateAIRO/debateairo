# S3a — Opus lens verdict

Ticket t_7fb9880c, board `accounts-phase1`. Author: Codex, session 01a019e7.
First ticket under VR-10. Reviewed blind against the working tree; every claim
below was re-derived locally, not taken from the handoff.

## VERDICT: **GREENLIGHT**

The primary claim — that the 12 killed mutants are real — **holds**. I broke the
implementation myself nine different ways and every guarding assertion went RED,
each with the exact failure signature the defect predicts. This is the opposite
of round 4, where three tests passed against broken code.

---

## 1. Mutation evidence — independently reproduced (the primary claim)

I mutated the working tree myself, ran the real-Postgres suite against each
mutant, and restored from pre-mutation SHA-256 backups after every run. Nine
mutants, nine kills, zero survivors.

| # | Mutation | Result | Failure signature observed |
|---|---|---|---|
| M1a | `0032:18` drop `NOT VALID` from actor check | **RED** | `23514 check constraint "audit_event_actor_ciphertext_null" ... violated by some row`, raised from `ATRewriteTable` inside the migration's `DO` block |
| M1b | `0032:28` drop `NOT VALID` from target check | **RED** | `23514 ... "audit_event_target_id_no_email" ... violated by some row` |
| M5 | `0032:18,28` neuter both predicates to `CHECK (true)`, keep `NOT VALID` | **RED** | forbidden INSERTs `resolved ... instead of rejecting` |
| M2 | `registration.ts:224` drop the `"unknown"` fallback | **RED** | `CryptoInputError: CRYPTO_KEY_INVALID` — reproduces the original 500 exactly |
| M3 | `registration.ts:221` drop `.trim()`, keep the `=== ""` fallback | **RED** | `expected false to be true` — the UA-hash equality assertion |
| M4-full | all three `input.requestedAt` sinks → `this.clock()` | **RED** | `expected 2026-08-19T14:00:12.700Z to deeply equal ...T14:00:00.000Z` |
| M4a | `registration.ts:398` `adultAffirmedAt` only | **RED** | same 12.700 s drift |
| M4b | `registration.ts:401` audit `occurredAt` only | **RED** | same 12.700 s drift |
| M4c | `registration.ts:379` `verificationExpiresAt` base only | **RED** | `2026-08-20T14:00:12.700Z` vs `...T14:00:00.000Z` |

Two points make this evidence materially stronger than round 4's:

- **M3 fails on a semantic assertion, not a crash.** Removing only the `trim`
  leaves the route working — no 500 — yet the test still fails, because
  `tests/integration/registration-database.test.ts:276` asserts every audit row's
  `userAgentArgon2id` equals the hash of the literal `"unknown"`. The test proves
  *normalisation*, not merely "did not throw". That is precisely the property
  round 4's tests lacked.
- **M4a/b/c isolate each sink.** All three timestamp destinations are
  independently guarded (`:335`, `:336`, `:337`), so no single sink is riding on
  another's assertion.

The A1 test is also double-guarded: `:160-163` asserts `convalidated: false` on
both constraints, so `NOT VALID` is load-bearing for two independent reasons
(migration success *and* the recorded catalog state), and `:164-194` proves a new
row is still rejected on both predicates while the legacy row survives (`:195-198`).

## 2. Gates — reproduced independently

| Gate | Codex claimed | I measured |
|---|---|---|
| `pnpm test` | 110 files / 787 tests | **110 passed / 787 passed**, 89.29 s |
| registration Postgres file | 21/21 | **21/21** (baseline, and again on the restored tree) |
| `pnpm typecheck` | green | **green**, exit 0 |
| `pnpm lint` | 28 edges, 0 violations | **28 `edgeRowsChecked`, `violations: []`, `blocking: []`** |

Working tree restored to pre-review content; all three touched files SHA-256-match
their pre-mutation backups, and the final confirmation run is 21/21.

## 3. Scope — confirmed by mtime, clean

Files modified after the S3a session opened (packet written 21:59):

- `migrations/0032_registration_audit_erasure_checks.sql` (22:10)
- `apps/api/src/registration.ts` (22:13)
- `tests/integration/registration-database.test.ts`
- `reports/orphan-audit.json` — gitignored lint output (`.gitignore:6`), not a source edit

Sibling-ticket surfaces are all untouched, at 20:06 or earlier:
`apps/api/src/index.ts` (15:19), `apps/api/src/mail-channel.ts`,
`packages/db/src/identity.ts`, `packages/crypto/src/index.ts`,
`packages/register/src/auth-policy.ts`. **No S3b/S3c/S3d leakage** — registration
durability, the rate limiter and the mail channel are all as they were.

Corroborating the narrower claim that only three regions of `registration.ts`
changed: the packet's pre-fix line citations reconcile exactly with the current
file under a +1/+1/+1 line-growth arithmetic (`PendingRegistration` 208-214 →
208-215; `sourceContext` 216-225 → 217-227; `provisionPendingAccount` 369-417 →
371-420). Nothing was inserted before line 208, so `InProcessAuthRateLimiter`
(lines 71-191) is positionally identical — the frozen limiter was not edited.

`packages/crypto/src/index.ts:365` still throws on `value.length === 0` and
`apps/api/src/index.ts:194-204` (`sourceFor`) still substitutes `"unknown"` only
for an absent header. Both were left alone; the clamp was placed solely at the
shared `sourceContext` ingress, which every route funnels through. That is a
legitimate reading of the packet's "and anywhere else a blank can reach the hash".

## 4. Adversarial attack on the fixes — all vectors came back clean

I probed the four vectors the packet names, empirically rather than by reading.

**4a. Empty request id → audit evasion (the A2-equivalent via a different header).**
This was my strongest hypothesis: `sourceContext` (`registration.ts:218`) throws
`AUTH_INPUT_INVALID` on a blank `requestId`, which returns 400 and writes **no**
audit row — the same evasion shape as A2 if the value were attacker-controlled.
It is not. `sourceFor` takes `request.id`, and against a real Fastify 5.11.2
server over real sockets, `request-id: ""`, `request-id: "   "`, `x-request-id: ""`
and a `request-id: attacker-supplied` spoof **all** yielded server-generated
`req-1`…`req-4`. Fastify 5 defaults `requestIdHeader` to `false`. Vector closed.

**4b. Missing IP behind a proxy.** `Fastify({ logger: false })` at
`apps/api/src/index.ts:143` sets no `trustProxy`, so `request.ip` is
socket-derived (`127.0.0.1` in probe) and `X-Forwarded-For` is ignored. Not
header-controllable, never empty for a live connection.

**4c. Unicode-whitespace UA that survives `trim()`.** `U+200B` ZWSP, `U+180E` and
`U+0000` do *not* trim to `""` — but none is reachable over HTTP: header values
are ByteStrings, and `fetch` rejects `U+200B`/`U+3000` outright. Every value that
*can* traverse an HTTP header and looks blank does trim: SPACE, TAB, VT, FF, CR,
LF and latin-1 `U+00A0` NBSP all returned `trim() === "" → true`, so all clamp to
`"unknown"`. The reachable blank-UA input space is fully covered.

**4d. Can any input still roll back an audit row?** Not through any reachable
path. The only in-transaction throw sites are `assertOpaqueToken`
(`identity.ts:88`, satisfied because `actorToken` is always a v4 UUID — either
`randomUUID()` or the column's `gen_random_uuid()` default) and the two hashes
(`identity.ts:89-92`), which `sourceContext` now guarantees non-empty. Note the
`ip`/`requestId` slices use the *untrimmed* source, but validation is on `trim()`,
so a surviving value always contains a non-whitespace character and cannot be
length-zero.

**4e. Is `requestedAt` genuinely immutable?** Yes. `registration.ts:452` takes
`new Date(this.clock().getTime())` — a defensive copy, so a clock returning a
shared mutable `Date` cannot retroactively rewrite it. It is frozen into
`PendingRegistration` (`:485-487`) and only ever read downstream:
`createPendingAccount` (`identity.ts:140-199`) passes it straight through as a
query parameter and mutates nothing.

**4f. VR-3 erasure — no regression.** `registration-database.test.ts:838-886`
(deletes the user, then scans the whole `audit_event` row text for user id, email,
blind index and pseudonym, and verifies the chain) passes on the restored tree.

## 5. Findings — all advisory, none blocking

1. **`NOT VALID` does leave legacy rows permanently exempt.** Answering the
   packet's question directly: yes. Pre-0031 rows keep non-NULL
   `actor_ciphertext` and may keep `@`-shaped `target_id`, they can never be
   updated or deleted (0030's `reject_mutation` trigger), and the constraints will
   never validate them. For any account deleted afterwards, a plaintext address
   in a legacy `target_id` would outlive the erasure. This is disclosed honestly
   in the migration header (`0032:1-7`) and the open decision is already recorded
   at `reviews/S3-REWORK4-VERIFICATION.md:42` (item 6). It is not, however,
   carried by any of S3b/S3c/S3d. **Recommend it get an explicit ticket** rather
   than living only in a verification document. Not a blocker: `NOT VALID` is the
   correct escape hatch, the alternative bricks the fleet, and new rows are fully
   constrained.

2. **The audit-rollback mechanism is unchanged; only the input is clamped.**
   Hashing still happens inside the transaction (`identity.ts:89-92`), so the
   A2 escalation shape survives structurally — `PostgresIdentityRepository` trusts
   its caller and does not normalise at its own boundary. No reachable input
   triggers it today because all three routes funnel through `sourceContext`, but
   a future caller that forgets that call reintroduces audit evasion. Suggest
   S3b either normalise at the repository boundary or hoist the two hashes above
   `BEGIN`. Out of scope here — the packet explicitly froze `identity.ts`'s
   transaction structure.

3. **Fleet constraint state is now non-uniform (benign).** `migrate()`
   (`packages/db/src/index.ts:136-143`) keys on filename only, with no checksum,
   so editing 0032 in place — rather than adding an additive 0033 as the packet's
   file contract worded it — causes no drift error. A database that already
   applied the old 0032 keeps `convalidated: true`; one applying the new file gets
   `convalidated: false`. Both end states are safe (the former is strictly
   stricter, and it can only exist on a database that had no violating rows), and
   the in-place edit is what actually unwedges a stuck database. I judge the
   deviation from "additive" correct on the merits; flagging only so the divergence
   is on the record.

4. **A1 test fidelity is slightly narrower than the real upgrade path.** The test
   (`:129-206`) reaches its legacy state by fully migrating, then dropping the two
   constraints and deleting 0032's ledger row — so only 0032 is pending. A genuine
   S2-carried-forward database would have 0031 *and* 0032 pending in the same
   transaction. 0031's only `audit_event` change is `DROP NOT NULL`, which is safe
   against legacy rows, so the conclusion is unaffected. (Unrelated to S3a: 0031's
   `channel_binding_user_channel_unique` index would fail against a database with
   pre-existing duplicate `(user_id, channel_type)` rows — that is 0031's exposure,
   not this ticket's.)

## Bottom line

All three defects are genuinely fixed, the tests genuinely guard them, and — the
thing that actually mattered this round — the mutation evidence survives
independent reproduction. Nine self-authored mutants, nine kills. Gates match the
handoff exactly. Scope is clean by mtime with no sibling-ticket leakage. The four
adversarial vectors the packet raised are closed, with the request-id vector
closed by Fastify's default rather than by this ticket's code — worth knowing, but
closed. Findings 1 and 2 are follow-ups, not blockers.
