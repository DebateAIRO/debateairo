# S1 dual-diamond verdict — Opus lens (packages/crypto + KEK foundation)

**VERDICT: GREENLIGHT**

Ticket t_34cfa3c0, board accounts-phase1. Reviewed against the working tree
(recency confirmed by mtime: crypto cluster touched 2026-08-19 11:59–12:03;
Aug-17 rename churn in `git diff` ignored per packet). All live-world commands
run and green.

## Live world (RUN, not asserted)
- `./node_modules/.bin/vitest run tests/unit/crypto.test.ts` → **7/7 passed**.
- `pnpm typecheck` (`tsc --noEmit`) → **exit 0**.
- `pnpm lint` → `audit:architecture` **edgeRowsChecked 28, violations []**; `audit:source` **blocking []**.
- `pnpm test` → **105 files / 739 tests passed** (matches Codex's reported figures).

## Claim-by-claim findings (file:line evidence)

1. **AEAD is correct — VERIFIED.** `packages/crypto/src/index.ts`: AES-256-GCM
   (`createCipheriv("aes-256-gcm", …)` :116); fresh random 96-bit nonce drawn
   *inside* every `encrypt` call (`randomBytes(NONCE_BYTES)`, NONCE_BYTES=12) :115,
   never reused (test asserts `first.nonce !== second.nonce` crypto.test.ts:44);
   the full AAD tuple is bound into GCM AAD via `setAAD(authenticatedData(1, keyId, aad))`
   :117, where `authenticatedData` serializes `[version, keyId, aad]` :94-97; envelope
   carries `v:1` + `keyId` :124-130. `decrypt` THROWS `CryptoAuthenticationError` on
   GCM auth failure or any AAD mismatch and returns no plaintext :136-160 — `decipher.final()`
   throws before `Buffer.concat` returns, so the transient `update()` plaintext never
   reaches the caller. Extra binding check `envelope.keyId !== aad[5]` :141. Strict
   base64 round-trip guard :99-104. Tests prove flipped-byte and relocated-AAD both
   reject (crypto.test.ts:48-62).

2. **Shred proof is real (F1) — VERIFIED, not trivially passable.**
   `tests/unit/crypto.test.ts:100-121`. Traced: line 114 requires
   `unwrapDek(kek, wrapped)` to return the *exact* original DEK, because
   `retainedCiphertext` was encrypted under that DEK and AES-GCM only authenticates
   with the correct key — a no-op/constant/zero-key unwrap makes line 114 (and line 70)
   THROW and the test FAIL. Line 118 proves a fresh random DEK cannot decrypt the
   retained ciphertext (`CRYPTO_AUTHENTICATION_FAILED`), a genuine AEAD property. So
   "wrapped blob destroyed ⇒ ciphertext unrecoverable" rests on real crypto, not on
   the Map-delete bookkeeping alone.

3. **KEK isolation (A2-3) — VERIFIED.** `grep process.env` across packages/apps/tools:
   only `packages/register/src/runtime-environment.ts:5` (generic env reader) plus
   pre-existing unrelated `apps/ui/*` (Next.js). The crypto package reads **no**
   `process.env`. `KEK_PATH` appears only in `runtime-environment.ts:52,72` and the two
   `main.ts`. `loadKek` takes a path/buffer param and validates `isFile()` + mode
   exactly `0o600` + 32-byte length, throwing `KekUnresolvedError` (code `KEK_UNRESOLVED`)
   on absent/short/bad-perm key (index.ts:163-175); `RuntimeKekUnresolvedError`
   (code `KEK_UNRESOLVED`) on absent/empty env (runtime-environment.ts:9-23).

4. **Refuse-to-boot — VERIFIED.** `apps/api/src/main.ts:27-28` and
   `apps/runner/src/main.ts:12-13` call `loadApiEnvironment`/`loadRunnerEnvironment`
   (both require KEK_PATH) then `loadKek(environment.KEK_PATH)` before pool creation /
   `api.listen`. Test asserts both compositions throw `KEK_UNRESOLVED` on missing
   KEK_PATH (crypto.test.ts:123-131) and that both roots wire `loadKek(environment.KEK_PATH)`
   (crypto.test.ts:133-140).

5. **KEK never touches the DB (A2-1) — VERIFIED.** crypto imports only `node:crypto`
   and `node:fs` — no `@debateai/db`, pool, or INSERT anywhere. No migration added:
   newest migration is `0029_evaluator_dev_menu_grants.sql` (2026-08-15); none in the
   ticket window. Shred point stays in the file store, out of the cluster.

6. **Test touches are env-fixture plumbing only — VERIFIED, no assertion weakened.**
   `tests/unit/evaluator-dev-menu-api.test.ts:29` adds `KEK_PATH` to an otherwise
   complete env fixture; the behavioural assertion `loadApiEnvironment()` throws
   `EVALUATOR_DEV_MENU_PRODUCTION_FORBIDDEN` (:40) is PRESERVED — the addition is
   exactly what keeps that assertion reachable now that `loadApiEnvironment` requires
   KEK_PATH. `tests/unit/api.test.ts` contains no KEK reference (mtime 11:11, outside
   the ticket window; builds `buildApi` directly, never calls `loadApiEnvironment`) —
   its auth/identity assertions are intact and NOT inverted: provisional-identity
   surface without SSR privilege (:164), `provisional_identity_model: true` (:175,:213),
   unauthenticated → `401` (:190), tier-source preservation matrix (:69-90). No inversion.

7. **No new runtime dependency — VERIFIED.** `packages/crypto/package.json` declares
   **zero** dependencies (pure `node:crypto`/`node:fs`). The only lockfile delta
   attributable to this ticket is the empty workspace-importer stanza
   `packages/crypto: {}` (pnpm-lock.yaml:386) — expected registration of the new
   workspace package, **not** a third-party dependency. No app added a package.json
   dep on crypto. (Note: `git diff HEAD` shows the lockfile as all-new because HEAD is
   mid-restructure with no committed lockfile — the packet-flagged Aug-17 churn, not a
   content change.)

8. **Nonce-misuse residual documented — VERIFIED.** `packages/crypto/src/index.ts:121-123`
   comment states GCM-SIV/XChaCha20 as the future nonce-misuse-resistant upgrade and
   that per-DEK use must stay below the nonce birthday bound. Reasonable; non-blocking.

9. **Architecture gate green — VERIFIED.** `tests/architecture/scaffold.test.ts:21,23`
   at `edgeRowsChecked` 28. New edge row `["crypto", "packages/crypto", []]`
   (`tools/orphan-audit/src/index.ts:11`) — allowed deps empty, correct (crypto depends
   on nothing). Lint reports 0 violations, 0 blocking.

## Non-blocking observation (does NOT change the verdict)

- **Undeclared consumer edges bypass the gate.** `apps/api/src/main.ts:2` and
  `apps/runner/src/main.ts:2` import crypto via a relative deep path
  (`../../../packages/crypto/src/index.js`) rather than the `@debateai/crypto`
  workspace specifier, and neither app declares `@debateai/crypto` in its
  `package.json`. The orphan-audit gate resolves edges only from `@debateai/*`
  package.json deps (`tools/orphan-audit/src/index.ts:41,56`), so the two new
  consumer edges (api→crypto, runner→crypto) are invisible to it — which is *why* the
  gate legitimately reports 0 violations. This is an inconsistency with every other
  cross-package import in the tree and should be formalized (workspace dep + updated
  edge rows) when real consumers are wired. It does not affect the cryptographic
  correctness, the boot gate, or key isolation, so it is advisory only.

## Bottom line
The AEAD is sound, the shred proof is genuine, KEK isolation and refuse-to-boot are
real, no key material or migration reaches Postgres, the test touches are pure
env-fixture plumbing with no weakened assertion, and no runtime dependency was added.
Live world is fully green (7/7 crypto, typecheck 0, gate 28/0, 739/739 suite).
**GREENLIGHT.**
