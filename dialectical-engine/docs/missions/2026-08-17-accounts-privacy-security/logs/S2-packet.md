# Goal packet — S2 · Identity schema + tamper-evident audit

Board `accounts-phase1`, ticket t_8e24b1c0. Coder: Codex (gpt-5.6-sol, xhigh/"Max").
Progress log: `docs/missions/2026-08-17-accounts-privacy-security/logs/S2-progress.log`
Design authority: `wave-2-target-architecture.md` §9-§13 **as amended by**
`AMENDMENTS.md` (A2-1, A2-4, A2-8, A2-9, A2-10, A3-3, A3-8) **and the V rulings
VR-1 and VR-2**. Where original wave text conflicts with an amendment, the
amendment wins. Depends on S1 (`packages/crypto`) — DONE.

## ⚠ CLARIFICATION (2026-08-19, orchestrator) — resolves the CODEX BLOCKED
The S1 advisory (formalize `@debateai/crypto` as a declared workspace dependency
in api/runner package.json instead of a relative import) is **DEFERRED to S6**,
where crypto consumers are actually wired — that is where the advisory said it
belonged. **Do NOT touch any `package.json` or `pnpm-lock.yaml` in this ticket.**
S2 uses crypto primitives exactly as S1 established them (the existing import
pattern is fine for now). Everything else in this packet stands.

## What this ticket builds
The `identity` Postgres schema and the tamper-evident audit table. **Schema and
mechanism only** — no registration flow, no MFA logic, no sessions (those are
S3/S4/S5 which populate these tables). Serial execution means you own the next
migration number cleanly: create `migrations/0030_identity_foundation.sql`.

## The rulings this schema encodes (do not deviate)
- **VR-1 — the erasure hybrid.** Identity data (C2) gets **REAL ROW DELETE** —
  so the `identity` tables are **MUTABLE**: they do NOT carry the
  `core.reject_mutation()` trigger. C2 fields MAY be encrypted at rest for
  confidentiality (AEAD via `packages/crypto`, under a confidentiality key), but
  **erasure = DELETE the row**, never key-shredding. Debate content (C3) is
  crypto-shredded and ONLY WHILE PRIVATE — that is S6/S10, NOT this ticket.
- **VR-2 — audit severance wins, realized WITHOUT chain re-anchoring.**
  `identity.audit_event` is **append-only** (carries `reject_mutation`) AND
  hash-chained. Store the actor identifier as **ciphertext under a per-user audit
  key** (a DEK-style key). Account deletion (S10) shreds that per-user audit key
  → the actor becomes cryptographically unreadable while **the row bytes never
  change, so the hash chain stays intact and valid** (it still proves events
  happened, untampered). This is strictly better than the "re-anchor" phrasing in
  VR-2 — confirm it satisfies the intent (severance + tamper-evidence) and
  document it in the migration header.

## Contract (what DONE means)
1. **`migrations/0030_identity_foundation.sql`** (additive, DR-188-compliant),
   creating schema `identity` with:
   - `identity.user` — MUTABLE. Columns: `user_id` (uuid pk), `email_blind_index`
     (bytea/text, unique), `email_ciphertext` (jsonb AEAD envelope),
     `recovery_email_ciphertext`, `phone_ciphertext` (nullable),
     `password_hash` (text, argon2id — the value is written by S3, this ticket
     only defines the column), `pseudonym` (text unique), `state`
     (`pending_verification|active|suspended|deleted`), `adult_affirmed_at`,
     `created_at`. NO plaintext email/phone column ever.
   - `identity.mfa_factor`, `identity.recovery_code`, `identity.channel_binding`,
     `identity.session` — all MUTABLE (verification transitions, code
     consumption, revocation). Define columns to the shapes in wave-2 §10;
     values populated by S3/S4/S5.
   - `identity.audit_event` — **APPEND-ONLY** (`reject_mutation` trigger) +
     hash-chained: `audit_id`, `prev_hash`, `this_hash`, `actor_ciphertext`
     (AEAD under the per-user audit key), `actor_key_ref`, `event_type`,
     `target_type`, `target_id`, `occurred_at` (utc), `source_context` (ip/asn/ua),
     `decision`, `success`, `justification`. **Never** stores passwords, tokens,
     TOTP seeds, recovery codes, raw prompts, or debate text.
2. **`reject_mutation` decision, enumerated in the migration header (A3-8):** list
   ALL identity tables with ARMED (audit_event) vs UNARMED (user, mfa_factor,
   recovery_code, channel_binding, session) and one-line reason each. The next
   reader must not be able to "fix" the omission by accident.
3. **Hash-chain library** in `packages/crypto` (or a small `packages/audit` —
   your call): `appendAuditEvent`
   computes `this_hash = H(prev_hash || canonical(row-without-hash))` and
   `verifyChain` detects any break. Tests prove: a tampered row breaks
   verification; a deleted row (simulated) breaks verification; a valid chain
   verifies.
4. **Email blind index (A2-10):** `HMAC(email)` under a SEPARATE global
   blind-index key — NOT the KEK. Add `BLIND_INDEX_KEY_PATH` to
   `runtime-environment.ts` (api loader). The index enables login lookup without
   decryption. Document the small-domain enumeration exposure (conditional on
   key compromise) in a comment.
5. **Ownership/visibility PATTERN DECISION (A3-3 / R-B 5A) — record it here, do
   not implement it here.** In the migration header (or a short design note next
   to it), rule that `core.run` ownership and visibility (S7/S8) will be
   **append-only event tables with latest-wins projections** (following the
   codebase's `core.run_progress_event` pattern), NEVER `UPDATE core.run` (which
   `reject_mutation` forbids). This closes the "three impossible slices" finding
   before S7/S8 are written.
6. **NO per-user CONTENT key table in Postgres (A2-1).** Private-content DEKs live
   in the file secret store; they are wired in S6/S10, NOT here. This ticket may
   define the per-user AUDIT key handling (needed for VR-2) but the audit key,
   like the KEK, lives in the secret store, never in the DB.

## Tests (TDD, red first)
- Migration applies cleanly; `identity` schema + all tables exist; column types
  match; `audit_event` REJECTS update/delete (SQLSTATE 55000); the five MUTABLE
  tables ACCEPT update/delete.
- Hash chain: valid verifies, tamper breaks, gap breaks.
- Email blind index: same email → same index; different → different; index is
  HMAC (not reversible without the key).
- C2 confidentiality: email round-trips through AEAD; DB holds no plaintext email.
- `pnpm test`/`typecheck`/`lint` green; `scaffold.test.ts` edge count updated if
  a new package is added (bump it and add the orphan-audit row); no `process.env`
  outside runtime-environment.ts.

## File contract (touch ONLY these)
`migrations/0030_identity_foundation.sql` (new), `packages/db/src/schema.ts` +
`packages/db/src/index.ts` (mirror the new tables — remember the mirror is
authoritative-adjacent; keep it in sync), `packages/crypto/**` (or new
`packages/audit/**`) for the hash-chain + blind-index primitives,
`packages/register/src/runtime-environment.ts` (BLIND_INDEX_KEY_PATH + audit key
path), `tools/orphan-audit/src/index.ts` + `tests/architecture/scaffold.test.ts`
(only if a new package is added), and tests under `tests/`. **NO** registration/
MFA/session LOGIC, **NO** `core.run` changes, **NO** content encryption, **NO**
`web/`/`apps/ui`. If the contract must widen, STOP and post `CODEX BLOCKED`.

## Gates before READY
`pnpm typecheck` + `pnpm test` (incl. a real-Postgres integration test for the
append-only + mutable assertions) + `pnpm lint` green; post `READY FOR PEER
REVIEW` with the migration header (the reject_mutation enumeration), the chain
tamper-test output, and the blind-index test output.

## Return rule (spine §4)
Return at READY FOR PEER REVIEW, CODEX BLOCKED (+ exact reason), or an IMPORTANT
OPERATION. Keep the session resumable. Do NOT commit or push. Termination
requires the dual diamond after handoff.
