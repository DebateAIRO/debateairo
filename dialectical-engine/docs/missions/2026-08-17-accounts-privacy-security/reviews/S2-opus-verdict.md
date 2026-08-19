# S2 dual-diamond verdict — Opus lens

Ticket t_8e24b1c0, board accounts-phase1. Lens: Opus (blind to the Grok lens).
Reviewed 2026-08-19. Source treated as read-only; every claim re-derived against
the working tree and a real PostgreSQL instance. No commit, no push.

## VERDICT: **GREENLIGHT**

All nine packet claims verified. The single explicit BLOCK trigger — "if severance
required mutating rows, that breaks append-only" — is **disproven**: severance
provably requires zero writes to `identity.audit_event` (§3 below, byte- and
xmin-level evidence). Six residuals are recorded; R1 and R2 are binding
pre-conditions on S7/S10, not defects in S2.

I did not accept the author's gate numbers. I re-ran everything and additionally
wrote two independent adversarial harnesses (24 assertions) that go beyond the
delivered test suite.

---

## Evidence — gates re-run by this lens

| Gate | Result |
|---|---|
| `pnpm typecheck` | exit 0 |
| `pnpm lint` | `edgeRowsChecked: 28`, `violations: []`, `blocking: []` |
| `pnpm test` | **108 files / 751 tests passed**, exit 0 — matches the author's report exactly |
| `vitest run` identity/crypto/architecture | 3 files / 15 tests passed |
| `vitest run tests/integration/identity-database.test.ts` (real Postgres) | 4/4 passed |
| Independent F1 probe (mine, 12 checks) | 12/12 |
| Independent Postgres probe (mine, 13 checks) | 12/12 + 1 self-inflicted false positive (see §6) |

---

## Findings

### 1. VR-1 — the five identity tables are genuinely MUTABLE. **CONFIRMED.**

`migrations/0030_identity_foundation.sql:140-143` arms `reject_mutation` on
`identity.audit_event` **only**. I did not take the DDL's word for it — I queried
the live catalog after migrating:

```
SELECT DISTINCT event_object_table FROM information_schema.triggers
WHERE event_object_schema='identity' AND trigger_name='reject_mutation'
  -> ["audit_event"]        (exactly one row)
```

I then executed a real UPDATE **and** a real DELETE against each of the five
tables and asserted `rowCount === 1` on all ten statements: `identity."user"`
(`:33`), `mfa_factor` (`:48`), `recovery_code` (`:71`), `channel_binding`
(`:85`), `session` (`:98`). All succeeded. Cascade erasure also verified: deleting
a user removes its child rows (`ON DELETE CASCADE`, `:49/:72/:86/:99`) and the
user row itself is gone — real deletion, not a soft state flip. Erasure of
identity data is real row DELETE, exactly as VR-1 requires.

Grants corroborate the intent: `:145-148` grants
`SELECT, INSERT, UPDATE, DELETE` on the five, and `:149` grants only
`SELECT, INSERT` on `audit_event`.

### 2. VR-2 — `identity.audit_event` is append-only. **CONFIRMED, six vectors.**

Against real Postgres I attempted every mutation route I could construct, all
rejected with SQLSTATE **55000** (`core.reject_mutation`,
`migrations/0000_s00.sql:31-38`):

- `UPDATE ... SET success=false` → 55000
- `UPDATE ... SET decision=decision` (semantic no-op) → 55000
- `UPDATE ... SET actor_ciphertext='{}'` (severance-by-mutation) → 55000
- `UPDATE ... SET actor_key_ref='x'` (re-pointing the key) → 55000
- `DELETE ... WHERE audit_id=$1` → 55000
- `DELETE FROM identity.audit_event` (unqualified bulk) → 55000

Structural integrity beyond the trigger, also verified live:
- **No forks.** `audit_event_one_successor` (`:138-139`) rejected a second row
  sharing a `prev_hash` with SQLSTATE 23505.
- **No dangling anchors.** The self-FK `prev_hash → this_hash` (`:136`) rejected
  a fabricated predecessor with SQLSTATE 23503.

### 3. The severance design — **needs no row mutation. PROVEN.** (highest-value check)

This was the most likely place for a subtle flaw, so I proved it at the storage
layer rather than in memory. Sequence: insert an audit row whose
`actor_ciphertext` is AEAD ciphertext under a per-user key; snapshot the row;
perform account deletion (real DELETE of `identity."user"`); destroy the key
buffer **issuing no SQL at all**; re-read the row.

```
md5(row::text)  before == after     (row bytes byte-identical)
xmin            before == after     (no new tuple version — Postgres never rewrote it)
verifyChain([row rebuilt from stored columns]) == true
```

`xmin` equality is the decisive evidence: an UPDATE in Postgres writes a new
tuple with a new `xmin`. It is unchanged, so no mutation occurred — not even a
HOT update. The chain verifies from the bytes read back out of Postgres, with no
key material in scope.

The mechanism is sound because `actor_ciphertext` is inside the hashed payload
while the key lives outside Postgres entirely. `packages/crypto/src/index.ts:250-259`
hashes `canonicalJson(payload)`, and I confirmed by deletion test that removing
`actorCiphertext` from the payload breaks verification — so the digest genuinely
covers the ciphertext envelope, not the plaintext actor. Destroying the key
therefore cannot affect verifiability. Severance and tamper-evidence are
compatible here; there is no hidden UPDATE.

The audit row also correctly has **no FK to `identity."user"`** (contrast
`:49/:72/:86/:99`), so account deletion cannot cascade audit rows away. I
verified the row survives the user DELETE.

### 4. F1 — `verifyChain` does not pass for the wrong reason. **CONFIRMED.**

`packages/crypto/src/index.ts:277-297`. My independent probe:

- **Tamper: 14 distinct single-field mutations** of a mid-chain row — `decision`,
  `success`, `targetId`, `targetType`, `eventType`, `occurredAt`,
  `sourceContext`, `actorKeyRef`, `justification`, `auditId`, and four separate
  corruptions inside the ciphertext envelope (`ct`, `tag`, `nonce`, `keyId`).
  **All 14 broke verification**, both in a 3-chain and a 2-chain.
- **Tamper + reseal:** forging a row *and* recomputing its hash produces a
  self-consistent prefix, but the successor link breaks (`verifyChain([e1,forged,e3]) === false`)
  and a retained head catches it even without the successor.
- **Gap:** dropping a middle row → false. Dropping genesis → false.
- **Reorder:** all three tested permutations → false.
- **`prev_hash` is genuinely bound into `this_hash`.** Answering the packet's
  question directly: the same payload anchored at genesis vs. at `e1` yields
  different digests. I reconstructed `e2.thisHash` byte-for-byte with an
  independent `createHash("sha256").update(prevHashBytes).update(canonicalJson)`
  — exact match. `prev_hash` is not decorative.
- **Counterfactual, as the packet asked.** I built the weakened design where
  `this_hash = H(payload)` only, and demonstrated the concrete attack it admits:
  a mid-chain row can be **detached and replayed as its own genesis** and the
  weak verifier accepts it. The real `verifyChain` rejects the identical move
  (`verifyChain([{...e2, prevHash: null}]) === false`). So the prev-hash binding
  is load-bearing, and the delivered chain is strictly stronger than the
  counterfactual.

Canonicalization is correct: `canonicalJson` (`:224-247`) sorts keys, rejects
non-plain prototypes and non-finite numbers, and the delivered test confirms
key-order independence. `auditHash` (`:250-259`) rejects payloads that smuggle in
`prevHash`/`thisHash`, closing the obvious self-reference attack.

### 5. Blind index (A2-10) and email confidentiality. **CONFIRMED.**

`createEmailBlindIndex` (`packages/crypto/src/index.ts:311-319`) is
HMAC-SHA-256 under a key parameter that is structurally separate from the KEK:
`loadApiEnvironment` (`packages/register/src/runtime-environment.ts:52-54`)
carries `KEK_PATH`, `BLIND_INDEX_KEY_PATH`, and `AUDIT_KEY_STORE_PATH` as three
independent paths. The blind-index function never touches `KekHandle`.

Verified: 32-byte output; deterministic across NFKC/trim/lowercase normalization
(`:300-307`); same email → same index; different email → different; different key
→ different; rejects a non-email and rejects a non-256-bit key; output contains
no substring of the input.

**No plaintext contact column exists anywhere.** I checked every schema in the
live database, not just `identity`:

```
SELECT table_schema,table_name,column_name FROM information_schema.columns
WHERE table_schema NOT IN ('pg_catalog','information_schema')
  AND column_name ~ '^(email|recovery_email|phone|phone_number|email_address)$'
  -> 0 rows
```

Contact data exists only as `email_ciphertext` / `recovery_email_ciphertext` /
`phone_ciphertext` jsonb (`:36-38`), each constrained to a JSON object.

### 6. A2-1 — no key material persisted to Postgres. **CONFIRMED.**

Live catalog scan for key-material columns in `identity` returned only
`mfa_factor.public_key` (`:53`) — a WebAuthn/passkey **public** key, which is
public by definition and is the correct thing to store. That was a false
positive from my own deliberately over-broad regex, not a finding. No
`content_key` / `user_data_key` / `data_key` table exists in any schema. The
migration states the intent explicitly at `:28-29`, and the architecture test
`tests/architecture/identity-foundation-contract.test.ts:23` enforces it.
Secrets are stored only as hashes (`password_hash:39`, `code_hash:73`,
`token_hash:99`) or ciphertext; keys live behind file-store paths.

### 7. A3-8 and A3-3 — header decisions present. **CONFIRMED.**

`migrations/0030_identity_foundation.sql:16-24` enumerates **all six** tables
with an ARMED/UNARMED verdict and a specific reason each — including the
"deliberate — do not fix" guard against a future agent helpfully arming the five.
A3-3 is at `:26-27`: S7/S8 must use append-only event tables with latest-wins
projections and must never `UPDATE core.run`. Both are locked by
`tests/architecture/identity-foundation-contract.test.ts:11-18`, so they cannot
silently rot.

### 8. Scope — **CLEAN. No dependency-formalization breach.**

Every `package.json` and `pnpm-lock.yaml` mtime predates the 12:29 boundary:

```
2026-08-15 11:08:09  package.json                    (root, untouched today)
2026-08-19 11:59:09  packages/crypto/package.json
2026-08-19 12:03:55  pnpm-lock.yaml
```

I then established *why* they are dated today, rather than just accepting the
timestamp. `packages/crypto/{package.json,tsconfig.json}`, `tests/unit/crypto.test.ts`,
and `pnpm-lock.yaml` are **S1 artifacts**, not S2 — `S1-review-packet.md:17,21`
lists them as S1 deliverables, and `tests/unit/crypto.test.ts` is titled
"S1 crypto foundation". S2's own writes all fall inside the 12:33–12:46 window:

```
12:37:24  tests/integration/identity-database.test.ts
12:40:26  packages/crypto/src/index.ts, packages/db/src/index.ts, packages/register/src/runtime-environment.ts
12:41:03  packages/db/src/schema.ts
12:42:11  migrations/0030_identity_foundation.sql, tests/unit/identity-crypto.test.ts
12:42:23  tests/architecture/identity-foundation-contract.test.ts
```

No file outside the declared scope was modified in the S2 window. Corroborating
evidence that no dependency work occurred: `@debateai/crypto` is **not** linked
into `node_modules/@debateai/`, the lockfile entry is the inert `packages/crypto: {}`
with no deps, and all consumers import the package by relative path. Dependency
formalization is genuinely still deferred to S6.

(Note for the S1 lens, not S2's concern: the S1 packet asserted `pnpm-lock.yaml`
was unchanged, but it does carry an S1-era `packages/crypto: {}` importer entry.)

### 9. Drizzle mirror fidelity and env discipline. **CONFIRMED.**

`packages/db/src/schema.ts:15-88` mirrors all six tables; I compared column
names, types, nullability, defaults, uniques and cascade behaviour against the
DDL line by line — faithful, with no plaintext contact column and no key column.
Exports wired at `packages/db/src/index.ts:588-592`. Migration 0030 is picked up
by `migrate()` (the integration run created the schema from scratch).
No new `process.env` access was introduced outside
`packages/register/src/runtime-environment.ts`; the only hits are pre-existing
Next.js `NEXT_PUBLIC_*`/frontend reads in `apps/ui` and `web`, untouched by S2,
and `audit:source` reports `blocking: []`.

---

## Residuals — recorded, not blocking

**R1 (must be ratified by V before S10). The implementation deviates from the
literal text of VR-2, and is right to.** `AMENDMENTS.md:75-79` says the actor is
"shredded/tombstoned and the hash chain **re-anchored** from that point", and
`:83-85` requires "a shreddable reference (tombstone-able) with chain re-anchor
support"; `:89-90` repeats "sever audit actor + re-anchor chain". As literally
written this is **self-contradictory**: tombstoning the actor column is an
UPDATE, and re-anchoring rewrites `this_hash` on existing rows — both are
UPDATEs on an append-only table, and I confirmed live that both are rejected
with 55000 (§2). Codex resolved the contradiction the only self-consistent way,
and `migrations/0030_identity_foundation.sql:5-10` states the refinement plainly
("without changing audit row bytes and without chain re-anchoring"). The
orchestrator's review packet already adopts the refined reading. **The code is
correct; `AMENDMENTS.md` is now stale and should be amended to match, so S10 is
not built against the impossible wording.**

**R2 (binding constraint on S7/S8/S10). Severance conceals the actor ciphertext,
but two plaintext columns can still identify the user.**
- `actor_key_ref` (`:126`) is only constrained to be non-empty. The header calls
  it "an opaque secret-store locator", but nothing enforces opacity, and the only
  concrete instantiation in the repo is *not* opaque — both the delivered tests
  and the fixtures use `audit-key:user:<id>`
  (`tests/unit/identity-crypto.test.ts:21`, `tests/integration/identity-database.test.ts:159`).
  A locator of that shape survives severance and names the user in cleartext.
- `target_id` (`:129`) is plaintext and required. For identity events the target
  *is* the actor (`target_type='identity.user'`, `target_id='user:audit'` at
  `tests/integration/identity-database.test.ts:163-164`), so for logins,
  password changes and MFA events severance is defeated by the target column
  alone.

This is a writer-side constraint, not a schema defect — `text` accommodates an
opaque random locator and a pseudonymous target — and S2 ships no production
writer. But it must be nailed down before the first real row is written:
**S7/S8/S10 must use a random, non-derivable `actor_key_ref` and a pseudonymous
`target_id`, or VR-2's severance guarantee is cosmetic for the most common event
class.**

**R3. `TRUNCATE` bypasses the row trigger.** `reject_mutation` is `FOR EACH ROW`
(`:141-143`), and row triggers do not fire on TRUNCATE. I confirmed live: as the
owner, `TRUNCATE identity.audit_event CASCADE` silently wiped 4 audit rows
(rolled back). Correctly mitigated for the runtime path — as `debateai_runtime`
the same statement failed with 42501, because `:149` grants only `SELECT, INSERT`.
This is a **pre-existing repo-wide convention**, not an S2 regression: no
migration in the repo installs TRUNCATE-level protection on any armed table. Fix
belongs at the ops/role layer or in a future `BEFORE TRUNCATE` statement trigger.

**R4. Total or tail truncation is undetectable without an external head anchor.**
`verifyChain([])` returns `true` vacuously, and dropping the tail verifies
(`verifyChain([e1,e2]) === true` when `e3` existed). The `expectedHeadHash`
parameter (`packages/crypto/src/index.ts:279`) is the correct mitigation and it
works — with a retained head both cases return `false` — but **S2 persists no
head anchor anywhere.** Combined with R3, an owner-level TRUNCATE is currently
unfalsifiable. S6/S10 should persist or externally publish the chain head.

**R5. Chain validity is application-enforced, not database-enforced.** Nothing in
the DDL requires `this_hash = H(prev_hash || payload)`; a buggy or hostile writer
with INSERT rights can store an arbitrary hash. Related: multiple genesis rows
are permitted, since `audit_event_one_successor` (`:138-139`) is partial on
`prev_hash IS NOT NULL`, so the table is structurally a *forest*, not a chain,
and there is no `chain_id` or ordinal to define read order. Acceptable for a
hash-chain design, but verification must be a first-class scheduled job, not an
optional call.

**R6. "No secrets in audit rows" is writer-enforced.** No column can hold a
password, token, TOTP seed, recovery code, prompt or debate text by design — the
schema deliberately provides no generic payload field, which is the right call.
But `source_context` (jsonb, `:130`) and `justification` (free text, `:132`) are
shape-unconstrained. The prohibition at `:12-15` is a comment plus an
architecture-test string match, not a CHECK constraint. Consider constraining
`source_context` keys in S7.

**Coverage gap (informational).** The delivered suite proves severance only
in-memory (`tests/unit/identity-crypto.test.ts:63-79`), where the chain object
never round-trips through Postgres. The DB-level proof that no tuple is rewritten
(§3) is mine, not the author's. Worth folding an `xmin`-stability assertion into
`tests/integration/identity-database.test.ts` so the property is defended by CI.

---

## Why not BLOCK

The packet defines one BLOCK trigger: severance secretly requiring an UPDATE on
an append-only table. I attacked that specifically and it does not hold —
severance touches no row, proven by `xmin` and `md5` stability under real
Postgres. Every other claim (1–9) verified, all gates green at the exact numbers
reported, and the two adversarial harnesses I wrote found no way to make
`verifyChain` pass for the wrong reason. R1 and R2 are conditions on downstream
slices and on the amendment text, not defects in the delivered DDL.

Had any of the following been true, this would have been a BLOCK — for the
record, each was tested and each came back negative:
- a `reject_mutation` trigger on any of the five identity tables;
- severance requiring `UPDATE identity.audit_event`, or the audit row's `xmin`
  changing during account deletion;
- `this_hash` failing to incorporate `prev_hash`;
- a tampered row, gap, or reordering that `verifyChain` accepted;
- any plaintext email/phone column, or key material persisted in Postgres;
- a `package.json` or `pnpm-lock.yaml` mtime at or after 12:29.
