# S3 dual-diamond review packet — Registration, verification, pseudonym, first audit writes

Ticket t_3c875ffb, board accounts-phase1. Author: Codex (gpt-5.6-sol xhigh), session 01a019e7. You are ONE of two blind lenses. **Refute, don't rubber-stamp.** READ-ONLY on source; running tests is REQUIRED.

## What was built
Public registration/verification/resend routes, argon2id password hashing (via `hash-wasm`), opaque audit tokens, stable pseudonyms, a file-backed wrapped-DEK store, a local mail transport with operator-visible failure logging, per-IP/per-address rate limits as ruled register rows, migration 0031, and the first audit writes. Packet: `logs/S3-packet.md`. Authority: wave-2 §10 **as amended**, plus V rulings **VR-3/VR-4/VR-5**.

Codex-reported gates: `pnpm typecheck && pnpm test && pnpm lint` exit 0 · **110 files / 766 tests** · architecture 28 rows, 0 violations.

## Scope (establish yourself with `find -mmin`; window 15:04–15:30)
`apps/api/{package.json,src/{index,main,mail-channel,registration}.ts}` · `packages/crypto/{package.json,SECRET_STORE_LAYOUT.md,src/index.ts}` · `packages/db/{package.json,src/{index,schema,identity}.ts}` · `packages/register/src/{index,runtime-environment,auth-policy}.ts` · `migrations/0031_registration_verification.sql` · `tools/orphan-audit/src/index.ts` · tests. **`pnpm-lock.yaml` deliberately UNTOUCHED** (packet forbade it). Ignore Aug-17 rename churn.

## Claims to verify (evidence, not agreement)

1. **VR-3 — THE NAME MUST BE GONE. This is the most important claim in the ticket.**
   Codex reports: after deleting the mutable user row, 27 immutable audit rows showed `forbidden_matches=0`, `actor_ciphertext_nonnull=0`, `verifyChain=true`.
   **Verify independently:** create a user, write audit events, delete the user, then search **every column of every audit row as raw text** for the user's id, email, blind index, and pseudonym. Zero matches required. Confirm `actor_ciphertext` is NULL on every row (the old encrypted-actor design must be fully abandoned). Confirm the chain still verifies from bytes read back out of Postgres. **F1: could this test pass trivially — e.g. if no audit rows were written at all, or if the search looked at the wrong columns?** Prove the rows exist and the search covers them.
2. **Enumeration resistance.** Reported `new_ms=501.6`, `duplicate_ms=502.8`, `byte_equal=true`, ruled floor 500 ms. Verify the responses really are byte-identical for existing vs new addresses, and that the timing floor is enforced by ruled config, not a magic number. Consider: is a fixed floor defeatable by a slow-path outlier?
3. **No plaintext anywhere.** Reported 0 leaks across 4 identity values. Verify: no plaintext email, recovery email, phone, password, or verification token is queryable from any table. Passwords must be argon2id, tokens stored hashed.
4. **VR-4 pseudonyms:** unique, stable per account, and **not derived** from email/user_id/any secret. Verify the generator uses fresh randomness (a derived pseudonym would leak identity after deletion).
5. **VR-5 mail:** own transport, no third-party relay. Check-spam guidance present; resend has a cooldown; **delivery failures are recorded and operator-visible**. Tests must not send real mail.
6. **Rate limiting** (previously unowned work): per-IP and per-address on register/verify/resend, thresholds as **ruled register rows** not constants, and refusals are audited.
7. **DEK store (A2-1):** wrapped DEKs land in the **file secret store** (reported 0700/0600), **never Postgres**. Confirm no key material in any table.
8. **⚠ THE KNOWN GAP — assess its severity, don't just note it.** `hash-wasm@4.12.0` is declared in `packages/crypto/package.json` but **`pnpm-lock.yaml` was not updated** (the packet forbade touching it). So `pnpm install --frozen-lockfile` on a clean checkout would fail. Is this a BLOCK or a follow-up? Consider: does the current suite pass only because the module is already in `node_modules`? Is `hash-wasm` a reasonable choice for argon2id (pure WASM, no native build)? State your view plainly.
9. **Second disclosed follow-up:** the ruled auth-policy rows must be seeded by the register-row serializer before production start. Confirm whether anything fails closed if they're absent, or whether it silently runs with no limits.
10. **Audit hygiene:** untrusted user-agent/request context is hashed before persistence (Codex refactored this under green). Confirm no raw untrusted string lands in an immutable row.

## Live world (the blocking lens must RUN it)
`./node_modules/.bin/vitest run tests/unit/registration.test.ts tests/integration/registration-database.test.ts`, then `pnpm typecheck`, `pnpm lint`, and enough of `pnpm test` to confirm the suite (expect 110 files / 766 tests).

## Verdict
Write `reviews/S3-<lens>-verdict.md`: GREENLIGHT or BLOCK + numbered findings with file:line evidence. If BLOCK, state exactly what proof would change your mind. No commit/push.
