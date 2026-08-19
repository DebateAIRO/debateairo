# S1 Grok-lens verdict

**GREENLIGHT**

Ticket t_34cfa3c0 / S1 key foundation (`packages/crypto` + KEK). Blind lens:
this file does not cite or open the other diamond verdict. True scope is the
mtime window 11:53–12:04 on 2026-08-19, confirmed with `find -mmin` / `stat`
(not `git diff` as the scope oracle). Reviewed tree: workspace
`/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine`, branch `dev`,
HEAD `b278fadcadb3bdbeed5add1fb1343c0c18f39d11`, plus the uncommitted S1 files
below. Aug-17 rename churn (`apps/v2-ui` → `apps/ui` inside
`tools/orphan-audit/src/index.ts` and `pnpm-lock.yaml`) is ignored.

S1-window files:

| mtime | path |
|---|---|
| 11:59:09 | `packages/crypto/package.json`, `packages/crypto/tsconfig.json` |
| 11:59:09 | `packages/register/src/runtime-environment.ts` |
| 11:59:09 | `tools/orphan-audit/src/index.ts` |
| 11:59:09 | `tests/architecture/scaffold.test.ts` |
| 11:59:09 | `apps/api/src/main.ts`, `apps/runner/src/main.ts` |
| 11:59:09 | `tests/unit/evaluator-dev-menu-api.test.ts` |
| 12:02:33 | `packages/crypto/src/index.ts`, `tests/unit/crypto.test.ts` |
| 12:03:55 | `pnpm-lock.yaml` (empty `packages/crypto: {}` importer + rename churn) |

Packet leftovers outside the window, **not** this ticket: `tests/unit/api.test.ts`
11:11:42, `apps/api/src/index.ts` 11:15:23,
`tests/integration/evaluator-addon-database.test.ts` 11:20:13. Extra recent
non-source: `reports/orphan-audit.json` (lint/test writer).

This review did not edit product or test files.

## Findings

1. **AEAD is AES-256-GCM with a fresh 96-bit nonce and bound AAD. HOLD.**
   `encrypt` at `packages/crypto/src/index.ts:110-134` draws
   `randomBytes(NONCE_BYTES)` (`NONCE_BYTES = 12` at `:9`) per call, constructs
   `createCipheriv("aes-256-gcm", key, nonce, { authTagLength: 16 })` (`:116`),
   and binds `authenticatedData(1, envelopeKeyId, aad)` via `setAAD` (`:117`).
   The AAD tuple is the A2-4 7-tuple (`AeadAad` at `:12-20`); GCM AAD is
   `JSON.stringify([envelopeVersion, envelopeKeyId, aad])` (`:94-97`). Envelope
   is `{ v: 1, keyId, nonce, ct, tag }` (`:124-130`). `decrypt` (`:136-161`)
   rejects `envelope.v !== 1` or `envelope.keyId !== aad[5]` (`:141-143`) and
   any GCM/`aad` failure through `CryptoAuthenticationError` (`:154-157`) — the
   `return` is only the successful `concat` at `:153`. Live unit cases:
   fresh-nonce inequality (`tests/unit/crypto.test.ts:39-45`); relocated AAD
   and one-byte `ct` flip both throw `CRYPTO_AUTHENTICATION_FAILED` (`:48-61`).
   Independent probe against the shipped module (scratch `aead-probe.ts`):
   `PROBE_OK`, `nonceFresh`, `aadReject`, `byteFlipReject`; no plaintext leak
   on either reject.

2. **Shred proof is real enough for A3-9 (F1). HOLD.**
   `tests/unit/crypto.test.ts:100-121` encrypts under a DEK, wraps that DEK
   into an in-memory `Map`, then `dek.fill(0)` / `dek = undefined` (`:106-107`)
   before the first `recover()`. `recover()` (`:109-113`) unwraps the map blob
   and decrypts the retained ciphertext. That first `expect(recover())` **fails
   if unwrap returned a zero key** — GCM would not authenticate
   `retained ciphertext`. After `wrappedDeks.delete` (`:116`) `recover()`
   throws `WRAPPED_DEK_DESTROYED` on map miss (`:111`) without calling unwrap.
   **F1 residual (not BLOCK):** if `unwrapDek` ignored the blob and returned a
   *side-cached copy* of the original DEK, the map-delete arm would still pass.
   A true no-op that returned the same `Buffer` would fail after `fill(0)`.
   Wrap/unwrap AEAD is independently pinned at `:64-77` (wrong KEK and wrong
   AAD reject). A3-9 asked for a unit-level in-memory store; this is that
   store, not a tautological `decrypt` of a freshly generated key alone.

3. **KEK isolation (A2-3). HOLD.**
   `packages/crypto/src/index.ts` contains no `process.env`. `loadKek`
   (`:163-175`) takes `string | Uint8Array`, `statSync`s a file, requires
   regular file + mode `0600` (`:167`), and converts absent/short/wrong-mode
   to typed `KEK_UNRESOLVED` (`:44-48`, `:171-173`). `KEK_PATH` is parsed only
   in `packages/register/src/runtime-environment.ts` (`kekPath` `:18-23`,
   `loadApiEnvironment` `:52`, `loadRunnerEnvironment` `:72`). Source audit
   hard-gate at `tools/orphan-audit/src/index.ts:455-456` still forbids
   `process.env` anywhere else under `packages/` / `apps/` / `tools/` (UI
   surface exempt). Live `pnpm lint` source report: `{ "blocking": [] }`.
   Pre-existing `process.env` in `apps/ui` / `web/` / `acceptance/` is outside
   this ticket and outside the engine loader rule.

4. **API and runner refuse to boot without `KEK_PATH`. HOLD.**
   Both process roots load env then the file KEK before opening a pool:
   `apps/api/src/main.ts:27-28`, `apps/runner/src/main.ts:12-13`. Missing /
   empty `KEK_PATH` throws `RuntimeKekUnresolvedError` with `code:
   "KEK_UNRESOLVED"` (`runtime-environment.ts:9-16`, `:18-23`). Live test
   `tests/unit/crypto.test.ts:123-131` stubs `KEK_PATH` undefined and asserts
   both `loadApiEnvironment` and `loadRunnerEnvironment` throw that code.
   `:133-140` pins the `loadKek(environment.KEK_PATH)` call sites by reading
   the shipped mains (source pin, not a spawned listen). Unreadable /
   wrong-length file is the `loadKek` path already tested at `:79-98`.

5. **KEK never touches Postgres; no migration. HOLD.**
   `packages/crypto` has no db import and no SQL. `wrapDek`/`unwrapDek`
   (`:177-198`) operate on `KekHandle` + `CryptoEnvelope` buffers. Newest
   migration file is still `migrations/0029_evaluator_dev_menu_grants.sql`
   (2026-08-15 20:12:12). `packages/db/src/{index,schema}.ts` mtimes are
   Aug-15. Nothing in this window persists a key, wrapped or otherwise.

6. **Test-fixture plumbing only; no auth inversion. HOLD.**
   In-window test edit is one line:
   `tests/unit/evaluator-dev-menu-api.test.ts:29` adds
   `KEK_PATH: "/run/secrets/debateai-kek"` to the existing
   `loadApiEnvironment` stub so the production-forbidden case still reaches
   `EVALUATOR_DEV_MENU_PRODUCTION_FORBIDDEN` (`:40`). Auth assertions at
   `:86-101` still expect 401 without a token and 200/201 with
   `x-user-dev-token`. `tests/unit/api.test.ts` and
   `tests/integration/evaluator-addon-database.test.ts` have no `KEK_PATH`
   and sit outside the S1 window (S0′-1 leftovers). No provisional-identity
   expect was inverted.

7. **No new runtime dependency. HOLD.**
   `packages/crypto/package.json` has name/version/private/type/exports only
   — no `dependencies` / `devDependencies`. Crypto uses `node:crypto` +
   `node:fs`. Lockfile S1 hunk is `packages/crypto: {}` (empty importer). The
   other lockfile hunk is Aug-17 `apps/v2-ui` → `apps/ui` rename churn.
   `apps/api/package.json` and `apps/runner/package.json` were not retouched
   (mtimes Aug-15 / Aug-10); mains import via relative
   `packages/crypto/src/index.js`.

8. **Nonce-misuse residual is documented. HOLD (non-blocking).**
   Comment at `packages/crypto/src/index.ts:121-123` states AES-GCM-SIV /
   XChaCha20 as the future nonce-misuse-resistant upgrade and that every call
   draws a fresh 96-bit nonce that must stay below the birthday bound.

9. **Architecture gate green at 28 / 0. HOLD.**
   New row `["crypto", "packages/crypto", []]` at
   `tools/orphan-audit/src/index.ts:11`. `edgeRowsChecked` is `rows.length`
   (`:93`). Scaffold pin: `tests/architecture/scaffold.test.ts:21-24`
   (`toBe(28)`, `violations` `[]`). Live `pnpm lint` architecture JSON:
   `{ "edgeRowsChecked": 28, "violations": [] }`. Full suite includes
   `matches all 28 dependency-edge rows` passing. Empty allowed-deps list is
   correct for a node-builtins-only package.

## Live commands (this lens; not the author log)

| Command | Result |
|---|---|
| `./node_modules/.bin/vitest run tests/unit/crypto.test.ts` | 1 file, **7/7**, exit 0 |
| `pnpm typecheck` | exit 0 |
| `pnpm lint` | exit 0; `edgeRowsChecked: 28`; `violations: []`; `blocking: []` |
| `pnpm test` (`vitest run`) | 105 files, **739/739**, exit 0 |
| shipped-module AEAD probe (`aead-probe.ts`) | `PROBE_OK` (fresh nonce, AAD reject, byte-flip reject) |

## Residual (not BLOCK)

- Shred destroy is `Map.delete` plus “wrong random DEK cannot decrypt”. A
  wrap/unwrap that cached a DEK copy beside the blob would still pass the
  delete arm. Separate wrap/unwrap AEAD tests close the crypto hole; A3-9
  allowed the in-memory store.
- Boot wire-up of `main.ts` is a source-contains pin, not a spawned process.
- `apps/api` / `apps/runner` consume crypto via relative import, so the edge
  table does not yet constrain those consumers. Allowed for this ticket’s
  “loadKek only” wire-up; later consumers must take a declared edge.

## What would have flipped this to BLOCK

- Decrypt returning plaintext on a flipped `ct` byte or wrong AAD (failed
  claim 1 / probe `AAD_LEAK` / `FLIP_LEAK`).
- Shred test still passing if unwrap returned a zero key (first `recover()`
  succeeding without the wrapped DEK).
- `process.env` inside `packages/crypto`, or `KEK_PATH` read outside
  `runtime-environment.ts`.
- API/runner mains omitting `loadKek(environment.KEK_PATH)`, or env loaders
  accepting a missing `KEK_PATH`.
- A new migration, or wrap/unwrap persisting a key into Postgres.
- Weakened 401/identity assertion in `evaluator-dev-menu-api.test.ts` (or in
  `api.test.ts` had that file actually been in this window).
- A runtime dependency on `packages/crypto`, or lockfile adding a non-empty
  importer / third-party crypto package.
- `edgeRowsChecked !== 28`, a non-empty `violations` / `blocking` lint
  report, or a red `pnpm test` originating in this package.

**PEER REVIEW APPROVED**
