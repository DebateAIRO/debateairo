# Goal packet — S1 · Key foundation (packages/crypto + KEK)

Board `accounts-phase1`, ticket t_34cfa3c0. Coder: Codex (gpt-5.6-sol, xhigh/"Max").
Progress log: `docs/missions/2026-08-17-accounts-privacy-security/logs/S1-progress.log`
Design authority: `wave-2-target-architecture.md` §12 **as amended by** `AMENDMENTS.md`
(A2-1, A2-3, A2-4, A3-9) and the V rulings VR-1/VR-2. **Where the original wave
text conflicts with AMENDMENTS.md, the amendment wins.**

## What this ticket builds
The cryptographic foundation everything else stands on: a KEK held OUTSIDE the
database, an AEAD envelope with associated-data binding, and DEK wrap/unwrap.
It wires NO consumers and creates NO schema — it is the primitive layer plus its
architecture-gate registration, landing as one self-contained unit so no later
lane trips the gate (RESEARCH-CONCLUSIONS §5 / research/RC recommendation).

## Binding design constraints (from the adversarial review)
- **A2-1 — shred point OUTSIDE the archived cluster.** The KEK is a file in a
  secret store (path from `KEK_PATH`), NEVER in Postgres. Wrapped DEKs will live
  in the secret store too (wired in S2) — so this package's wrap/unwrap operates
  on files/buffers, and NOTHING key-bearing is designed to land in the DB.
- **A2-4 — AEAD with associated data.** Every encrypt takes a mandatory AAD
  tuple; the envelope carries `version` and `key_id`; decrypt REJECTS on any AAD
  mismatch or tamper. This is what stops ciphertext relocation between rows/users.
- **A2-3 — KEK isolation.** `KEK_PATH` is read ONLY through
  `packages/register/src/runtime-environment.ts` (the architecture audit forbids
  `process.env` elsewhere). The crypto package itself takes a key buffer/path as
  a parameter — it never reads env directly.
- **A3-9 — S1's shred proof is UNIT-level** over an in-memory store (the real
  per-user key table is S2). Prove: destroy a wrapped DEK blob → its ciphertext
  is permanently unrecoverable, rows/blobs notwithstanding.

## Contract (what DONE means)
1. **New package `packages/crypto/`** (mirror the shape of `packages/kernel`:
   `package.json`, `tsconfig.json`, `src/index.ts`; workspace member). Exports:
   - `encrypt(dek, plaintext, aad)` / `decrypt(dek, envelope, aad)` — AEAD.
     Use Node core **AES-256-GCM**, a fresh random 96-bit nonce per call, and
     bind `aad` into the GCM AAD. Envelope = `{ v:1, keyId, nonce, ct, tag }`
     (base64 fields). Decrypt throws a typed error on GCM auth failure or `aad`
     mismatch (do NOT return plaintext on failure). Document that nonce-misuse-
     resistance (AES-GCM-SIV / XChaCha20) is a future upgrade; random 96-bit
     nonces per DEK stay well below the birthday bound — record this as the
     accepted residual in a code comment.
   - `generateDek()` → 256-bit key.
   - `wrapDek(kek, dek, aad)` → wrapped blob (AEAD-encrypt the DEK under the KEK
     with AAD binding, e.g. AAD = a key-purpose/owner tag) / `unwrapDek(kek,
     blob, aad)` → dek (throws on mismatch/tamper).
   - `loadKek(pathOrBuffer)` — reads the KEK file (expect 0600), validates
     length, returns an opaque handle; throws a typed `KEK_UNRESOLVED` (matching
     the existing `*_UNRESOLVED` idiom) if absent/malformed.
2. **`packages/register/src/runtime-environment.ts`:** add `KEK_PATH` (string,
   required) to BOTH `loadApiEnvironment` (:34) and `loadRunnerEnvironment` (:54)
   — S6 will encrypt in the runner, so adding it to both now avoids a later edit
   (A4-6). Keep the `.strict()` schema discipline.
3. **Architecture gate:** add ONE `packages/crypto` row to the `rows` table in
   `tools/orphan-audit/src/index.ts` (:9) with its allowed dependency edges
   (crypto depends on nothing but node builtins + kernel if needed), and bump
   `tests/architecture/scaffold.test.ts:23` `edgeRowsChecked` from **27 to 28**.
   These two edits MUST be in this ticket so no future crypto-consuming lane
   trips the gate (A4-4).
4. **Refuse-to-boot:** if `KEK_PATH` is missing/unreadable/wrong-length, the API
   and runner refuse to boot with the typed `KEK_UNRESOLVED` error (wire the
   check at the same place other `*_UNRESOLVED` env checks fire). A test asserts
   boot refusal without a KEK.

## Tests (TDD, red first)
- AEAD round-trip; **AAD mismatch → reject**; wrong-KEK unwrap → reject; single
  flipped ciphertext byte → auth failure (no plaintext returned).
- wrapDek/unwrapDek round-trip; unwrap with wrong AAD → reject.
- **Shred proof (unit):** encrypt under DEK, wrap DEK under KEK into a blob in an
  in-memory map, destroy the blob → the ciphertext can never be decrypted again.
- `loadKek` refuses absent/short key; API+runner refuse to boot without `KEK_PATH`.
- `pnpm test`, `pnpm typecheck`, `pnpm lint` green; `scaffold.test.ts` green at
  edgeRowsChecked 28; **no `process.env` added outside runtime-environment.ts.**

## File contract (touch ONLY these)
`packages/crypto/**` (new), `packages/register/src/runtime-environment.ts`,
`tools/orphan-audit/src/index.ts`, `tests/architecture/scaffold.test.ts`,
test files under `tests/`, and the wire-up point in `apps/api/src/main.ts` /
`apps/runner/src/main.ts` ONLY for the KEK refuse-to-boot check (minimal).
**NO** migrations, **NO** `identity` schema, **NO** consumers wired into db/serve/
memory/runner logic, **NO** `web/` or `apps/ui`. If the contract must widen,
STOP and post `CODEX BLOCKED`.

## Out of scope
Per-user DEK storage, per-debate/per-publication keys, the identity schema, the
blind index, any content encryption — all later slices. S1 is primitives only.

## Gates before READY
`pnpm typecheck` + `pnpm test` + `pnpm lint` green; post `READY FOR PEER REVIEW`
as a ticket comment with diff summary, the shred-proof test output, and a grep
proof that no `process.env` was added outside runtime-environment.ts.

## Return rule (spine §4)
Return at READY FOR PEER REVIEW, a genuine blocker (CODEX BLOCKED + exact
reason), or an IMPORTANT OPERATION. Keep the session resumable. Do NOT commit
or push. Termination requires the dual diamond greenlighting after handoff.
