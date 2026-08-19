# S2 Grok-lens verdict

**GREENLIGHT**

Ticket t_8e24b1c0 / S2 identity schema + tamper-evident audit. Blind lens:
this file does not cite or open the other diamond verdict. True scope is the
mtime window 12:33–12:46 on 2026-08-19, confirmed with `find -newermt` / `stat`
(not `git diff` as the scope oracle). Reviewed tree: workspace
`/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine`, branch `dev`,
HEAD `b278fadcadb3bdbeed5add1fb1343c0c18f39d11`, plus the uncommitted S2 files
below. The launch-script “3 files” clause (`apps/api/src/index.ts`,
`tests/unit/api.test.ts`, `tests/integration/evaluator-addon-database.test.ts`)
is leftover S0′-1 wording and is **not** this ticket’s change. Aug-17 rename
churn is ignored.

S2-window files:

| mtime | path |
|---|---|
| 12:37:24 | `tests/integration/identity-database.test.ts` |
| 12:40:26 | `packages/crypto/src/index.ts` |
| 12:40:26 | `packages/db/src/index.ts` |
| 12:40:26 | `packages/register/src/runtime-environment.ts` |
| 12:41:03 | `packages/db/src/schema.ts` |
| 12:42:11 | `migrations/0030_identity_foundation.sql` |
| 12:42:11 | `tests/unit/identity-crypto.test.ts` |
| 12:42:11 | `tests/unit/evaluator-dev-menu-api.test.ts` (env plumbing only) |
| 12:42:23 | `tests/architecture/identity-foundation-contract.test.ts` |
| 12:44:45 | `reports/orphan-audit.json` (lint writer, not product) |

Every `package.json` and `pnpm-lock.yaml` predates 12:29 (root lockfile
12:03:55 from S1; `packages/crypto/package.json` 11:59:09; remaining manifests
Aug-07 through Aug-15). `tools/orphan-audit/src/index.ts` and
`tests/architecture/scaffold.test.ts` are S1 (11:59:09), not retouched.

This review did not edit product or test files.

## Findings

1. **VR-1: five C2 tables are mutable; erasure is DELETE. HOLD.**
   `migrations/0030_identity_foundation.sql` creates `identity."user"`
   (`:33-45`), `mfa_factor` (`:47-65`), `recovery_code` (`:70-80`),
   `channel_binding` (`:82-94`), and `session` (`:96-112`) with **no**
   `reject_mutation` trigger. The header states C2 erasure is real row DELETE
   (`:3-4`). Runtime GRANT is `SELECT, INSERT, UPDATE, DELETE` on those five
   (`:145-148`). Live real Postgres 18.4
   (`tests/integration/identity-database.test.ts:83-147`): each table accepts
   `UPDATE` then `DELETE` with `rowCount: 1`. Drizzle mirror:
   `packages/db/src/schema.ts:17-73`, re-exported
   `packages/db/src/index.ts:587-595`. No `user_data_key` / key-shred table
   exists for identity erasure.

2. **VR-2: `identity.audit_event` is append-only, hash-chained, actor-ciphertext; severance does not mutate rows. HOLD.**
   Trigger at `migrations/0030_identity_foundation.sql:139-142` fires
   `core.reject_mutation()` on UPDATE/DELETE. That function raises
   `ERRCODE = '55000'` (`migrations/0000_s00.sql:36-37`). GRANT on
   `audit_event` is `SELECT, INSERT` only (`:149`). Live: UPDATE and DELETE
   both reject with `code: "55000"`
   (`tests/integration/identity-database.test.ts:165-170`); embedded log
   records `audit_event rejects UPDATE` / `rejects DELETE`. Actor is
   `actor_ciphertext jsonb` plus opaque `actor_key_ref` (`:121-122`); header
   `:6-11` states S10 destroys the per-user audit key in the file secret store
   without changing row bytes and without chain re-anchoring.
   `appendAuditEvent` (`packages/crypto/src/index.ts:261-268`) hashes
   `prev_hash || canonical(payload)` via `auditHash` (`:245-254`). Independent
   probe: zero the actor key → `decrypt` throws `CRYPTO_AUTHENTICATION_FAILED`;
   `JSON.stringify(event)` bytes unchanged; `verifyChain` still true.

3. **Chain integrity (F1): tamper breaks, gap breaks, `this_hash` binds `prev_hash`. HOLD.**
   `verifyChain` (`packages/crypto/src/index.ts:274-295`) requires
   `event.prevHash === expectedPrev` (`:281`) **and**
   `auditHash(expectedPrev, payload) === event.thisHash` (`:284`). `auditHash`
   writes the predecessor digest into SHA-256 before the payload (`:250-253`).
   Unit: intact chain verifies (`tests/unit/identity-crypto.test.ts:38-48`);
   `{ ...second, decision: "DENY" }` and `[first, third]` both return false
   (`:51-58`). Those two cases would still fail on a broken `prevHash` pointer
   even if `this_hash` ignored `prev_hash`. Independent probe drives the
   shipped hasher, not a reimplemented canonicalizer: for the same DENY
   payload, `appendAuditEvent(null, denyPayload).thisHash` differs from
   `appendAuditEvent(first, denyPayload).thisHash`
   (`samePayloadGenesisHashDiffersFromChained`). A splice that keeps the
   genesis digest as `thisHash`, sets `prevHash` to `first.thisHash`, and
   relinks `third.prevHash` is rejected by shipped `verifyChain`
   (`relinkBreaksWhenThisHashIncludesPrev`). That splice is exactly what
   would verify if `digest.update(prevHash)` were removed, because then the
   two `appendAuditEvent` calls would collide.

4. **Blind index (A2-10): HMAC-SHA-256 under a key separate from the KEK; no plaintext email column. HOLD.**
   `createEmailBlindIndex` (`packages/crypto/src/index.ts:311-320`) is
   `createHmac("sha256", key)` over NFKC/trim/lower email (`:297-303`). Comment
   at `:305-309` names a global key separate from the KEK, independently
   rotatable, with small-domain enumeration if both DB and key leak. API loader
   takes `KEK_PATH`, `BLIND_INDEX_KEY_PATH`, and `AUDIT_KEY_STORE_PATH` as
   distinct fields (`packages/register/src/runtime-environment.ts:52-54`).
   Same email → same 32-byte index, different email → different, different key
   → different (`tests/unit/identity-crypto.test.ts:82-93`). Probe: index under
   a KEK-like all-`0x11` key does not equal the blind-index key. Schema has
   `email_blind_index bytea` + `email_ciphertext jsonb` only
   (`migrations/0030_identity_foundation.sql:35-38`); no `email` /
   `recovery_email` / `phone` text columns. Live `information_schema` check
   returns `[]` (`tests/integration/identity-database.test.ts:178-184`).

5. **A3-8: migration header enumerates all six identity tables ARMED vs UNARMED with a reason each. HOLD.**
   `migrations/0030_identity_foundation.sql:17-23` lists `user`, `mfa_factor`,
   `recovery_code`, `channel_binding`, `session` as UNARMED (mutation/erasure
   reasons) and `audit_event` as ARMED (append-only / SQLSTATE 55000). The
   original “seven tables” included `identity.user_data_key`, which A2-1
   removed from Postgres; the packet’s six-table enum is what shipped.
   Architecture pin: `tests/architecture/identity-foundation-contract.test.ts:10-13`.

6. **A3-3: `core.run` ownership/visibility is ruled as append-only event tables. HOLD.**
   Header `:25-26`: S7/S8 **MUST** add append-only event tables with
   latest-wins projections following `core.run_progress_event`, and must never
   `UPDATE core.run`. Architecture pin `:15-16`. `core.run` in
   `packages/db/src/schema.ts:91-112` is unchanged (no `owner_user_id` /
   `visibility` mutation). This ticket does not implement S7/S8.

7. **A2-1: no key material in Postgres; audit and blind-index keys are file-store paths. HOLD.**
   Header `:28-29` plus `actor_key_ref` comment `:11`. No `CREATE TABLE` for
   `user_data_key` / `content_key` (architecture test
   `tests/architecture/identity-foundation-contract.test.ts:23`).
   `BLIND_INDEX_KEY_PATH` and `AUDIT_KEY_STORE_PATH` are required strings on
   the API env (`runtime-environment.ts:53-54`); `loadApiEnvironment` is the
   only `process.env` reader under `packages/`. Crypto wrap/unwrap still
   operates on in-memory `KekHandle` + envelopes, not SQL.

8. **No secrets in audit rows. HOLD.**
   `identity.audit_event` columns (`:117-130`) are hashes, actor ciphertext +
   key locator, event/target metadata, `occurred_at`, `source_context` jsonb,
   `decision`, `success`, `justification`. Header `:12-15` forbids passwords,
   session/verification tokens, TOTP seeds, recovery codes, raw prompts,
   provider payloads, and debate text; `source_context` is restricted to
   IP/ASN/UA. TOTP material lives on `mfa_factor.secret_ciphertext` (`:51`),
   recovery on `recovery_code.code_hash` (`:73`), passwords on
   `identity."user".password_hash` (`:39`) — not on the audit table. No S2
   writer exists yet to violate the header.

9. **Gates: typecheck, lint 28/0, tests 108/751, `process.env` confined. HOLD.**
   `pnpm typecheck` exit 0. `pnpm lint`: `edgeRowsChecked: 28`,
   `violations: []`, `blocking: []`. Focused vitest: identity/crypto unit +
   S1 crypto + architecture contract **15/15**. Real-Postgres identity suite
   **4/4** via embedded PostgreSQL 18.4 (`startTestDatabase`, Testcontainers
   deferred by DR-121). `pnpm test`: **108 files, 751/751**, exit 0.
   `process.env` under `packages/` is only
   `packages/register/src/runtime-environment.ts:5`. `packages/crypto`,
   `apps/api`, and `apps/runner` have none. Pre-existing `process.env` in
   `apps/ui` / `web/` / `acceptance/` is outside this ticket. In-window
   `tests/unit/evaluator-dev-menu-api.test.ts:29-31` only stubs the two new
   paths so the production-forbidden case still reaches
   `EVALUATOR_DEV_MENU_PRODUCTION_FORBIDDEN` (`:42`); 401-without-token /
   200-with-token remain at `:88-92`.

## Live commands (this lens; not the author log)

| Command | Result |
|---|---|
| `./node_modules/.bin/vitest run tests/unit/identity-crypto.test.ts tests/unit/crypto.test.ts tests/architecture/identity-foundation-contract.test.ts` | 3 files, **15/15**, exit 0 |
| `./node_modules/.bin/vitest run tests/integration/identity-database.test.ts` | 1 file, **4/4**, embedded PostgreSQL 18.4, UPDATE/DELETE on five C2 tables `rowCount: 1`, audit UPDATE/DELETE SQLSTATE `55000`, exit 0 |
| `pnpm typecheck` | exit 0 |
| `pnpm lint` | exit 0; `edgeRowsChecked: 28`; `violations: []`; `blocking: []` |
| `pnpm test` (`vitest run`) | 108 files, **751/751**, exit 0 |
| shipped-module probe (`s2-probe.ts`) | `PROBE_OK`; no-prev digest = `appendAuditEvent(null, denyPayload).thisHash`; genesis≠chained for same payload; relink rejected; shred unreadability; unchanged bytes; blind-index key separation |

## Residual (not BLOCK)

- The in-repo severance unit (`tests/unit/identity-crypto.test.ts:73-77`)
  decrypts with a fresh `generateDek()` after `fill(0)`, so it would still
  pass if the `fill(0)` were deleted. The shipped AEAD path plus this lens’s
  probe (decrypt with the **zeroed** key, row JSON bytes equal) close the
  hole. Integration does not persist-then-shred a DB row; S10 owns the
  ceremony, and nothing in S2 UPDATEs `audit_event` to tombstone the actor.
- Author tamper/gap tests (`:51-58`) would still fail a broken `prevHash`
  pointer even if `this_hash` ignored `prev_hash`. The digest itself includes
  `prev_hash` (`auditHash` `:251`). The probe’s no-prev digest is the shipped
  `appendAuditEvent(null, denyPayload).thisHash`, not a `JSON.stringify`
  stand-in; that relink **would** pass `verifyChain` if `digest.update(prevHash)`
  were removed (genesis and chained hashes would collide). It does not pass
  against the tree as shipped.
- “No secrets in audit rows” is a schema + header constraint. No audit
  writer ships in this ticket.
- Nothing cryptographically stops an operator from pointing `KEK_PATH` and
  `BLIND_INDEX_KEY_PATH` at the same file; the code treats them as distinct
  required paths.
- API/runner boot requiring the new paths is enforced by `loadApiEnvironment`
  Zod, not a spawned `main.ts` listen.

## What would have flipped this to BLOCK

- Any of the five C2 tables rejecting UPDATE/DELETE on real Postgres, or
  erasure implemented by shredding a DB-resident key instead of DELETE.
- `identity.audit_event` UPDATE or DELETE succeeding, or SQLSTATE other than
  `55000`.
- Severance that UPDATEs/DELETEs audit rows (or rewrites `actor_ciphertext`)
  so the chain would have to be re-anchored.
- `verifyChain` returning true after a payload tamper, a simulated gap, or a
  middle-row splice whose `thisHash` omitted `prev_hash`.
- A plaintext `email` / `recovery_email` / `phone` column, or a blind index
  that is not HMAC under a key distinct from the KEK argument.
- Migration header missing an ARMED/UNARMED line for any of the six tables,
  or missing the A3-3 “never UPDATE core.run / append-only event tables”
  ruling.
- A Postgres content-key / wrapped-DEK / audit-key table, or key bytes stored
  in `actor_key_ref`.
- Audit DDL that carries password, token, TOTP seed, recovery-code, prompt,
  or debate-text columns.
- `process.env` inside `packages/crypto` (or anywhere under `packages/` /
  `apps/api` / `apps/runner` other than `runtime-environment.ts`).
- `edgeRowsChecked !== 28`, non-empty `violations` / `blocking`, red
  `pnpm typecheck`, or a red `pnpm test` originating in this ticket.

**PEER REVIEW APPROVED**
