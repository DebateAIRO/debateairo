# S1 dual-diamond review packet — Key foundation (packages/crypto + KEK)

Ticket t_34cfa3c0, board accounts-phase1. Author: Codex (gpt-5.6-sol xhigh).
You are ONE of two blind lenses (Opus + Grok); the other is invisible. **Refute,
don't rubber-stamp.** READ-ONLY on source; running tests is REQUIRED.

## What the ticket built
`packages/crypto` — the cryptographic foundation: AEAD envelope with
associated-data binding, DEK generate/wrap/unwrap, KEK loaded from a file secret
store (NEVER the DB), refuse-to-boot without `KEK_PATH`, and the architecture-gate
registration (orphan-audit edge row + `edgeRowsChecked` 27→28). No consumers
wired, no schema. Packet: `logs/S1-packet.md`. Design authority: wave-2 §12 **as
amended** (A2-1 KEK outside cluster, A2-3 KEK isolation, A2-4 AEAD+AD, A3-9
unit-level shred proof).

## True scope (orchestrator-verified by mtime, window 11:53–12:04)
`packages/crypto/{package.json,tsconfig.json,src/index.ts}` (new),
`packages/register/src/runtime-environment.ts`, `tools/orphan-audit/src/index.ts`,
`tests/architecture/scaffold.test.ts`, `apps/api/src/main.ts`,
`apps/runner/src/main.ts` (KEK boot gate), and tests:
`tests/unit/crypto.test.ts` (new), `tests/unit/api.test.ts`,
`tests/unit/evaluator-dev-menu-api.test.ts`, `tests/integration/evaluator-addon-database.test.ts`.
⚠ Ignore the Aug-17 rename churn in `git diff`; confirm recency with `find -mmin`.

## Claims to verify (evidence, not agreement)
1. **AEAD is correct.** AES-256-GCM, a FRESH random 96-bit nonce per encryption,
   `aad` bound into the GCM AAD, envelope carries `version` + `keyId`. Decrypt
   MUST throw (no plaintext returned) on GCM auth failure OR any `aad` mismatch.
   Verify: flip one ciphertext byte → auth failure; decrypt with wrong `aad` →
   reject; nonce is not reused across calls (fresh per encrypt).
2. **The shred proof is real (F1).** The unit test that destroys a wrapped DEK
   and asserts the ciphertext is unrecoverable — could it pass trivially (e.g.
   if unwrap returned a zero key that still "worked")? Trace it. Would it fail
   if wrap/unwrap were a no-op?
3. **KEK isolation (A2-3).** `KEK_PATH` is read ONLY in
   `runtime-environment.ts`; the crypto package takes a key buffer/path param and
   reads NO `process.env` itself. Grep-prove no `process.env` outside
   runtime-environment.ts. KEK loader validates length and 0600-ish expectation;
   `KEK_UNRESOLVED` typed error on absent/short key.
4. **Refuse-to-boot.** API and runner refuse to boot without `KEK_PATH`
   (`apps/api/src/main.ts`, `apps/runner/src/main.ts`) — test asserts it.
5. **KEK never touches the DB (A2-1).** Confirm nothing in this change persists a
   key, wrapped or otherwise, into Postgres. The shred point is designed to live
   in the file store. (No migration in this ticket — verify none was added.)
6. **The `api.test.ts` / `evaluator-dev-menu-api.test.ts` touches are ENV-FIXTURE
   PLUMBING ONLY** (adding `KEK_PATH` to test env setup), not logic changes and
   NOT an inversion of the provisional-identity or any auth assertion. If any
   behavioural assertion was weakened, BLOCK.
7. **No new dependency.** Codex claims a frozen-lockfile check passed (pure Node
   core crypto). Confirm `packages/crypto/package.json` adds no runtime dep and
   `pnpm-lock.yaml` is unchanged by this ticket.
8. **Nonce-misuse residual documented** — a code comment should note random
   96-bit GCM nonces stay below the birthday bound and that GCM-SIV/XChaCha is a
   future upgrade. Non-blocking if reasonable.
9. **Architecture gate green:** `scaffold.test.ts` at edgeRowsChecked 28, the new
   `packages/crypto` edge row's allowed deps are minimal/correct, 0 violations.

## Live world (the blocking lens must RUN it)
- `./node_modules/.bin/vitest run tests/unit/crypto.test.ts` — the AEAD + shred proofs.
- `pnpm typecheck` · `pnpm lint` (edgeRowsChecked 28, 0 violations) · enough of
  `pnpm test` to confirm the full suite is green (Codex reported 105 files / 739 tests).

## Verdict
Write `reviews/S1-<lens>-verdict.md`: GREENLIGHT or BLOCK + numbered findings
with file:line evidence. If BLOCK, state exactly what proof would change your
mind. No commit/push.
