# S3 Grok-lens verdict

**GREENLIGHT**

Ticket t_3c875ffb / S3 registration, verification, pseudonym, first audit
writes. Blind lens: this file does not cite or open the other diamond
verdict. True scope is the mtime window **15:04–15:30 on 2026-08-19
(EEST)**, confirmed with `find -newermt '2026-08-19 15:04:00' ! -newermt
'2026-08-19 15:30:00'` plus `stat` (not `git diff` as the scope oracle).
Reviewed tree: workspace
`/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine`, branch
`dev`, HEAD `40791b8e99c86f6d9de3e88a18a239adcb6f80e2`, plus the
uncommitted S3 files below. Aug-17 rename churn is ignored.
`pnpm-lock.yaml` is outside the window (mtime 2026-08-19 12:03:55, S1)
and is treated as deliberately untouched.

S3-window files:

| mtime | path |
|---|---|
| 15:11:24 | `tests/unit/registration.test.ts` |
| 15:13:54 | `packages/register/src/auth-policy.ts`, `packages/register/src/index.ts` |
| 15:14:41 | `packages/crypto/SECRET_STORE_LAYOUT.md` |
| 15:14:50 | `pnpm-workspace.yaml` (allowBuilds hygiene only; not packet-listed) |
| 15:15:16 | `packages/crypto/package.json` |
| 15:15:51 | `migrations/0031_registration_verification.sql`, `packages/db/src/schema.ts` |
| 15:17:33 | `packages/db/package.json`, `packages/db/src/index.ts` |
| 15:17:58 | `apps/api/src/mail-channel.ts` |
| 15:19:22 | `apps/api/src/registration.ts` |
| 15:19:59 | `apps/api/package.json`, `apps/api/src/index.ts`, `tools/orphan-audit/src/index.ts` |
| 15:20:30 | `apps/api/src/main.ts`, `packages/crypto/src/index.ts`, `packages/register/src/runtime-environment.ts`, `tests/unit/identity-crypto.test.ts` |
| 15:20:41 | `tests/unit/evaluator-dev-menu-api.test.ts` (env plumbing only) |
| 15:23:50 | `packages/db/src/identity.ts` |
| 15:27:00 | `tests/integration/registration-database.test.ts` |
| 15:29:16 | `docs/missions/2026-08-17-accounts-privacy-security/logs/S3-progress.log` |

Ignored inside the same clock range: `apps/ui/node_modules/.bin/*` and
`web/node_modules/.bin/*` (toolchain symlink mtimes, not product).
`pnpm-lock.yaml` is **not** in the window.

This review did not edit product or test files.

## Findings

1. **VR-3 — THE NAME MUST BE GONE (F1: rows exist; search is whole-row text). HOLD.**
   Mutable `identity."user"` carries an independently random
   `audit_token` (`migrations/0031_registration_verification.sql:7-19`;
   Drizzle `packages/db/src/schema.ts:25`). Registration draws
   `userId = randomUUID()` and `auditToken = randomUUID()` as separate
   calls (`apps/api/src/registration.ts:221-222`); the integration
   asserts they differ (`tests/integration/registration-database.test.ts:113`).
   The writer stores **only** that token in `actor_key_ref` and
   `target_id`, and writes `actor_ciphertext` NULL always
   (`packages/db/src/identity.ts:82-88`, INSERT `:100-104` with a
   literal `NULL` bind). Migration 0031 drops the NOT NULL on
   `actor_ciphertext` (`:36-37`) so that write is legal.
   **F1:** the live VR-3 case is not a vacuous empty-table pass. This
   lens ran it on embedded PostgreSQL 18.4:
   `[S3 VR-3] audit_rows=27 forbidden_matches=0 actor_ciphertext_nonnull=0 chain_valid=true`.
   After `DELETE FROM identity."user"` (`:281`) the test searches
   `position(lower($1) in lower(audit_row::text))` over
   `identity.audit_event AS audit_row` (`:283-288`) — that is the
   composite record text of **every column** of **every** audit row —
   for user id, email, blind-index hex, and pseudonym, and expects
   zero hits. It also requires `actor_ciphertext === null` on every
   row (`:295`), `actor_key_ref === auditToken` on at least one row
   (`:296`, so a zero-row table cannot pass), `target_id ===
   actor_key_ref` on every row (`:297`), and `verifyChain` over the
   chain reconstructed from bytes read back out of Postgres
   (`:300-340`). `expect(chain).not.toHaveLength(0)` (`:338`) is a
   second empty-table fuse. Codex's `27` / `0` / `true` numbers
   reproduced on this run.

2. **Enumeration resistance: byte-identical existing vs new, ruled 500 ms floor. HOLD.**
   Both register and resend return the frozen public objects
   (`apps/api/src/registration.ts:18-24`) from every non-error path,
   including duplicate email (`:217`, `:251`) and cooldown / missing
   resend (`:350`). The floor is
   `policy.verification.enumerationResponseFloorMs`, seeded from the
   ruled row `enumeration_response_floor_ms: 500`
   (`packages/register/src/auth-policy.ts:80`, mapped at `:170`),
   applied in `holdEnumerationFloor` (`registration.ts:134-138`) from
   `finally` on both register (`:266-268`) and resend (`:351-353`).
   Duplicate register still runs argon2id before the early return
   (`:216-217`). Live: `[S3 ENUMERATION] new_ms=501.8
   duplicate_ms=502.0 byte_equal=true floor_ms=500` on the focused
   run; the full suite logged `duplicate_ms=504.0`. Equality is
   `JSON.stringify(duplicate) === JSON.stringify(first)` (`:184`).
   HTTP inject of the same frozen body is 202 for register/resend
   (`tests/unit/registration.test.ts:145-152`).
   **Residual (not BLOCK):** a slow-path outlier that exceeds the
   500 ms floor (argon2id + encrypt + INSERT + wrapDek + mail) can
   still beat a duplicate that finishes at the floor. At this
   argon2id setting both paths sat on the floor in live evidence.

3. **No plaintext email / recovery email / phone / password / verification token. HOLD.**
   `identity.user` has `email_ciphertext` / `recovery_email_ciphertext`
   / optional `phone_ciphertext` / `password_hash` — no plaintext
   contact or password columns (`packages/db/src/schema.ts:17-29`).
   Insert writes AEAD envelopes and `phone_ciphertext=NULL`
   (`packages/db/src/identity.ts:126-131`). Passwords are argon2id
   via `hash-wasm` (`packages/crypto/src/index.ts:12`, `:348-365`)
   with ruled params m=65536,t=3,p=1,hashLength=32
   (`auth-policy.ts:65-70`); live row matches
   `/^\$argon2id\$v=19\$m=65536,t=3,p=1\$/`
   (`registration-database.test.ts:116`). Tokens are
   `randomBytes(32).toString("base64url")` (`crypto/src/index.ts:376-378`)
   stored as `sha256:` hex (`:380-385`;
   `registration-database.test.ts:347-359`). Live plaintext search
   over `identity.user`, `channel_binding`, and `audit_event` as
   `string_agg(...::text)` (`:202-213`) reported
   `[S3 PLAINTEXT] searched_identity_values=4 leaks=0`. Phone is not
   collected at registration; the column stays NULL.

4. **VR-4: unique, stable, non-derived pseudonyms from fresh randomness. HOLD.**
   `generatePseudonym` picks adjective and noun with `randomInt` and
   a 3-byte `randomBytes` discriminator
   (`packages/crypto/src/index.ts:387-402`). It takes **no** email,
   user id, or secret argument. Registration generates the
   candidate before insert (`registration.ts:223`) and retries on
   unique-index collision (`:219-250`,
   `identity.ts:143-149`). Column is `text unique`
   (`schema.ts:24`). Unit: 200 candidates, 200 unique, none contain
   planted identity fragments (`tests/unit/registration.test.ts:89-95`).
   Independent scratch probe of the shipped generator produced eight
   distinct values (e.g. `verdant-comet-8119a6`). Stability is
   storage, not regeneration: one column, no rotation API in this
   ticket.

5. **VR-5: own transport, spam guidance, resend cooldown, operator-visible failures, tests do not send real mail. HOLD.**
   Ruled `channelPolicy.transport` is the literal `"own_sendmail"`
   with `sender_local_part: "noreply"` and a spam notice
   (`auth-policy.ts:96-105`, `:177-181`). Production wires
   `SendmailMailSender` spawning a local executable, `From:
   noreply@…` (`apps/api/src/mail-channel.ts:32-89`;
   `apps/api/src/main.ts:48-52`; env
   `packages/register/src/runtime-environment.ts:56-58`). No
   third-party relay import exists in `mail-channel.ts`. Public
   responses tell the user to check spam
   (`registration.ts:18-24`; unit `:147`, `:152`). Resend cooldown
   is the ruled `resend_cooldown_ms: 60_000` (`auth-policy.ts:79`)
   enforced in `prepareVerificationResend` (`identity.ts:324-326`,
   `:337`). Delivery failure records `delivery_status='failed'` plus
   `delivery_error`, logs
   `[AUTH_MAIL_DELIVERY_FAILED] attempt=<uuid> code=…`
   (`registration.ts:173-183`; `identity.ts:233-247`), and still
   returns the public 202 body
   (`registration-database.test.ts:217-237`). Tests use
   `MemoryMailSender` (`mail-channel.ts:24-30`;
   `tests/unit/registration.test.ts:186-197`) which never `spawn`s.

6. **Per-IP / per-address rate limits as ruled register rows; refusals audited. HOLD.**
   Thresholds live in `AUTH_POLICY_REGISTER_ROWS` `rateLimitPolicy`
   (`auth-policy.ts:84-95`), not as magic numbers in the limiter.
   `InProcessAuthRateLimiter` reads `perAddress` / `perIp` /
   `windowMs` from that policy (`registration.ts:55-86`). Unit
   proves independent address and IP exhaustion for register, verify,
   and resend (`tests/unit/registration.test.ts:159-184`). Refusals
   write `identity.auth.rate_limit_refused` with
   `target_type=auth.{route}` (`identity.ts:355-372`). Live VR-3
   case forced per-address=1, then asserted
   `register,verify,resend` in `target_type`
   (`registration-database.test.ts:246-279`) and logged
   `rate_limit_routes=register,verify,resend`.

7. **Wrapped DEKs in the file secret store, never Postgres (A2-1). HOLD.**
   `FileUserDekStore.store` wraps with `wrapDek` (AES-256-GCM under
   the KEK, `packages/crypto/src/index.ts:201-208`) and writes
   `users/<uuid>/dek.v1.json` under mode 0700/0600 (`:408-444`).
   Layout is documented in `packages/crypto/SECRET_STORE_LAYOUT.md`.
   Registration calls `dekStore.store` inside the identity
   transaction's `beforeCommit` (`registration.ts:249`;
   `identity.ts:179`). Identity tables have no DEK / wrapped-key
   column (`schema.ts:17-96`). Unit asserts 0700/0600 and that the
   file does not contain the DEK's base64 (`tests/unit/registration.test.ts:98-114`);
   integration stats the 0600 file next to the new user
   (`registration-database.test.ts:119-120`). `dek.fill(0)` in
   `finally` (`registration.ts:261-263`).

8. **`hash-wasm@4.12.0` lockfile gap — FOLLOW-UP, not BLOCK.**
   `packages/crypto/package.json:8` declares `"hash-wasm": "4.12.0"`.
   `pnpm-lock.yaml` has **no** `hash-wasm` string at all; the
   importer is still the empty S1 object `packages/crypto: {}`
   (lockfile line 386; lockfile mtime 12:03:55, outside this
   window). This lens resolved
   `node_modules/.pnpm/hash-wasm@4.12.0/node_modules/hash-wasm`
   (store `package.json` version `4.12.0`) — **the current suite
   passes only because that module is already in `node_modules`**.
   `pnpm install --frozen-lockfile` on a clean checkout would fail.
   **View:** this is install-reproducibility, not a defect in the
   argon2id path. `hash-wasm` is a reasonable choice for argon2id
   (pure WASM, no native compile, no `argon2` binding in the
   architecture edge table — workspace edges stay 28). The packet
   forbade touching the lockfile, so the author complied with a
   disclosed gap rather than smuggling a lockfile edit. A follow-up
   that adds the importer to `pnpm-lock.yaml` (and only that) closes
   it. It would become BLOCK if this ticket were the last frozen-CI
   install gate; it is not.

9. **Unseeded auth-policy rows fail closed; serializer seeding is a disclosed follow-up. HOLD.**
   `authPolicyFromRegisterRows` throws `TypedDomainError
   AUTH_POLICY_UNRESOLVED` if any of
   `passwordPolicy` / `verificationPolicy` / `rateLimitPolicy` /
   `channelPolicy` is missing (`auth-policy.ts:137-143`).
   `readAuthPolicy` feeds whatever the register table returns
   (`:185-198`) into that parser. API boot awaits `readAuthPolicy`
   **before** `listen` (`apps/api/src/main.ts:45-57`, `:112`). There
   is no default limiter and no silent empty-policy path: missing
   rows mean the process does not start, so it cannot run with no
   limits. Independent `tsx` probe of the shipped function:
   `[]` → `AUTH_POLICY_UNRESOLVED Missing ruled passwordPolicy`;
   partial password-only row → `Missing ruled verificationPolicy`.
   `persistBootstrapRegister` still only seeds
   `nodeRuntimeVersion`…`vllmImageDigest`
   (`packages/register/src/index.ts:358-364`, `:462-473`) and does
   **not** insert `AUTH_POLICY_REGISTER_ROWS`. That is the disclosed
   serializer follow-up. It is operational, not a silent-open
   limiter.

10. **Untrusted user-agent / request id hashed before immutable persistence. HOLD.**
    The HTTP layer still *receives* the raw UA
    (`apps/api/src/index.ts:199-202`), but the audit writer persists
    `userAgentSha256` and `requestIdSha256` as SHA-256 hex and never
    the raw strings (`packages/db/src/identity.ts:90-94`). Every S3
    audit event goes through `appendAudit` (`:169`, `:238`, `:287`,
    `:336`, `:362`). IP is stored in the clear as a structured
    forensic field, not as an untrusted free-text blob. The VR-3
    whole-row search would also catch a raw email/id in
    `source_context`; it reported zero hits. Residual: no dedicated
    assertion that the UA string `vitest-registration` is absent
    from `audit_row::text`. The persist path is hashed regardless.

## Live commands (this lens; not the author log)

| Command | Result |
|---|---|
| `./node_modules/.bin/vitest run tests/unit/registration.test.ts tests/integration/registration-database.test.ts` | 2 files, **15/15**, exit 0; embedded PostgreSQL 18.4; `[S3 ENUMERATION] new_ms=501.8 duplicate_ms=502.0 byte_equal=true floor_ms=500`; `[S3 PLAINTEXT] searched_identity_values=4 leaks=0`; `[S3 VR-3] audit_rows=27 forbidden_matches=0 actor_ciphertext_nonnull=0 chain_valid=true rate_limit_routes=register,verify,resend` |
| `pnpm typecheck` | exit 0 |
| `pnpm lint` | exit 0; `edgeRowsChecked: 28`; `violations: []`; `blocking: []` |
| `pnpm test` (`vitest run`) | 110 files, **766/766**, exit 0; VR-3 line reproduced (`audit_rows=27`, `duplicate_ms=504.0`) |
| shipped-module probes | `hash-wasm` resolves to 4.12.0 in `node_modules` and is **absent** from `pnpm-lock.yaml`; `authPolicyFromRegisterRows([])` throws `AUTH_POLICY_UNRESOLVED`; `generatePseudonym()` returns distinct random `adj-noun-hex` values |

## Residual (not BLOCK)

- Claim 8 lockfile gap, as judged above: follow-up pin of `hash-wasm@4.12.0` in `pnpm-lock.yaml`.
- Claim 9: `AUTH_POLICY_REGISTER_ROWS` is not yet inserted by `persistBootstrapRegister`. Production start fails closed until a serializer follow-up seeds those four keys.
- Fixed 500 ms enumeration floor is defeatable if the new-account path's extra work exceeds the floor under load. Live runs sat on the floor.
- Drizzle `channelBinding` (`packages/db/src/schema.ts:59-68`) does not yet mirror migration 0031's verification/delivery columns. Runtime writers use raw SQL in `identity.ts`, so this is schema-mirror drift, not a missing column on Postgres.
- `pnpm-workspace.yaml` in-window `allowBuilds.argon2: set this to true or false` is leftover native-argon2 scaffolding; it is not a workspace edge and did not affect the 28-row architecture gate.
- No dedicated test asserts the raw user-agent string is absent from `audit_event` (persist path hashes it).
- Rate limiter is in-process; multi-instance deployments do not share buckets. Acceptable at this scale per the packet.

## What would have flipped this to BLOCK

- VR-3 search passing on zero audit rows, searching the wrong columns, `actor_ciphertext` non-NULL, `actor_key_ref` derived from `user_id`, or `verifyChain` false on the bytes read back from Postgres.
- Existing vs new register responses that differ in body or status, or a timing floor that is a source constant rather than a ruled row.
- A plaintext email / recovery / password / raw token column, or a password hash that is not argon2id.
- A pseudonym derived from email or user id.
- Mail going through a third-party relay, tests invoking `spawn`, or delivery failures swallowed with no operator log / `delivery_error`.
- Rate-limit thresholds as source literals, or refusals not written to `identity.audit_event`.
- Wrapped DEKs (or raw DEKs) landing in any Postgres table.
- Unseeded auth-policy rows defaulting to unlimited traffic instead of `AUTH_POLICY_UNRESOLVED`.
- Raw user-agent or request-id strings written into `identity.audit_event`.
- Live `pnpm typecheck` / `pnpm lint` / `pnpm test` failing, or the focused registration suites failing to write the VR-3 / plaintext / enumeration evidence lines.

Claim 8's missing lockfile pin would flip this lens to BLOCK only together with a requirement that this ticket be the frozen-install release gate. That is not this ticket.
