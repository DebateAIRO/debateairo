# R-B — Adversarial Verification of the "Encryption Cannot Be Retrofitted" Claim

Blind research seat, 2026-08-19. Read-only. Attacks Wave 3 §0.

## VERDICT: **TRUE-BUT-FOR-DIFFERENT-REASONS**

The conclusion is right; the stated reason is wrong — **and this repo contains a working script that refutes it**.

- **Arithmetic exactly correct:** 77 of 79 tables carry `core.reject_mutation()` (counted independently).
- **Mechanism claim FALSE as stated.** "There is no UPDATE to rewrite it with" is untrue. **Six viable retrofit paths** exist. One (`ALTER TABLE … DISABLE TRIGGER USER`) is **not hypothetical** — it is a committed, already-executed script at `docs/missions/2026-08-06-v3-programming/logs/rebaseline-serve-hash.mts:19`, run against a *protected* table (`register.register_row`) under V's own DR-187 ruling. Another (`ALTER TABLE … ALTER COLUMN … TYPE … USING`) bypasses the trigger entirely — table rewrites do not fire DML triggers — and the plan never considers it.
- **The correct argument is stronger.** Postgres MVCC never overwrites: UPDATE writes a new tuple and marks the old dead. Plaintext survives in dead tuples, in WAL full-page images, and in every backup. **Empirically confirmed in this tree (below).** Retrofit produces ciphertext-going-forward while leaving plaintext that DR-188(3) *requires* be preserved forever.

**Therefore the phase order SHOULD change** — §0.1 option 1 stands, on firmer ground. **§0 option 3 should be STRUCK**, not deprecated: it is technically trivial and it does not deliver erasure.

## 1. Table count — verified

79 tables created across `migrations/*.sql`; **77 protected**; zero `DROP TABLE`/`RENAME` anywhere. Attachment sites span **16** migrations (Wave 1 says 15): `0000_s00:314-331` (19 tables) · `0002:148-151` · `0003:89-92` · `0006:236-247` (5) · `0008:248-269` (8) · `0010:71-77` · `0011:90-105` (5) · `0013:81-92` (3) · `0014:71-85` (4) · `0015:118-131` (5) · `0016:100-111` (7) · `0017:29-31` · `0019:44-46` · `0022:16-19` · `0023:398-419` (14) · `0028:43-46`.

**The 2 unprotected:** `core.work_item` (`0000:97-113`, granted UPDATE at `:302` — claims/state transitions) and `ledger.sequence_allocator` (`0000:9-12`, UPDATEd by `allocate_sequence()`). Neither carries user content, so the claim's *implication* holds: **every one of the eleven content carriers in S6's coverage map is protected.**

**An 80th table the count misses:** `public.debateai_schema_migration`, created by `migrate()` itself (`packages/db/src/index.ts:130-135`), unprotected and ungranted. "79" is a migration-file artifact, not a `pg_class` fact.

## 2. What the trigger actually blocks

`0000_s00.sql:31-39` — `RAISE EXCEPTION … ERRCODE '55000'`; every attachment `BEFORE UPDATE OR DELETE … FOR EACH ROW`.

| Operation | Blocked? |
|---|---|
| INSERT | **No** (append is the point) |
| UPDATE/DELETE matching ≥1 row | Yes (55000) |
| UPDATE/DELETE matching 0 rows | **No** — succeeds silently |
| **TRUNCATE** | **No** — no `BEFORE TRUNCATE … FOR EACH STATEMENT` trigger exists anywhere |
| **ALTER TABLE** (ADD/DROP COLUMN, TYPE change, rewrite) | **No** — DDL does not fire DML triggers |
| DROP TABLE | **No** |
| COPY … FROM | No (INSERT path) |

**The REVOKE grants are inert.** Every least-privilege role is `NOLOGIN` (`0000:292,295`; `0015:137`; `0023:4-13`); nothing connects as them. The app connects as `debateai`, the **bootstrap superuser**, password in tracked source (`acceptance/standing-db.ts:7-8,37`, `compose.dev.yaml:6-8`, `tests/support/testDatabase.ts:55,100`). A superuser bypasses every GRANT/REVOKE. The privilege model is **designed and completely inert**.

## 3. Six retrofit paths — all viable

Enabler: `migrate()` (`packages/db/src/index.ts:123-151`) executes every `migrations/*.sql` **as superuser in one transaction**, with no sandbox, no statement allowlist, and no architecture test forbidding non-additive DDL.

| # | Path | Works? | DR-188? | Erases plaintext? |
|---|---|---|---|---|
| (a) | `DISABLE TRIGGER USER` → UPDATE → `ENABLE` | **Yes — proven in-repo** | Arguably compliant (row count unchanged) | **No** (MVCC) |
| (b) | `SET session_replication_role='replica'` | **Yes** (triggers are `tgenabled='O'`; superuser can set the GUC) | Same | **No** |
| (c) | DROP + UPDATE + CREATE trigger inside a migration | **Yes** | Same | **No** |
| (d) | Companion ciphertext column; later `DROP COLUMN` plaintext | Partly (populating existing rows still needs UPDATE; `DROP COLUMN` needs none) | Contentious | **No** — `DROP COLUMN` is metadata-only (`attisdropped`); bytes persist in heap tuples |
| (e) | `CREATE … v2` → `INSERT … SELECT encrypt(…)` → rename swap | **Yes** technically (trigger blocks neither INSERT nor DROP TABLE); painful FK surgery | **Violates DR-188(1)** — archetypal non-additive migration | **No** (old relfilenode + WAL) |
| **(f)** | `ALTER TABLE … ALTER COLUMN … TYPE … USING encrypt(…)` | **Yes — cleanest.** Full heap rewrite, **no DML trigger fires**, no exception needed, row count preserved. **Plan never considers it** | Superficially the *most* compliant | **No** |
| (g) | `pg_dump` → transform → restore to fresh datadir | **Yes** (restore recreates triggers after COPY) | **Self-defeating** — DR-188(3) forbids deleting the old datadir | **No, by ruling** |

Path (a) verbatim, from a script **already run against a protected table**:
```js
await c.query("BEGIN");
await c.query("ALTER TABLE register.register_row DISABLE TRIGGER USER");
const upd = await c.query("UPDATE register.register_row SET value_json=$1::jsonb WHERE …");
await c.query("ALTER TABLE register.register_row ENABLE TRIGGER USER");
await c.query("COMMIT");
```
**This system has already retrofitted a protected table once.** §0 treats it as an exotic escape hatch; it is a 35-line script anyone can copy.

## 4. The decisive argument §0 should have made

1. **MVCC** — UPDATE writes a new tuple, marks the old dead. Plaintext remains in the heap page until VACUUM prunes it and the space is reused; `VACUUM FULL`/`CLUSTER` still does not zero the old relfilenode's blocks.
2. **WAL** — every UPDATE and rewrite is logged; with `full_page_writes` on (default, not disabled in this datadir's config), the first post-checkpoint modification emits the **entire page image**, plaintext included.
3. **Empirically confirmed, in this tree, during this review:**
   - `acceptance/.pgdata` (live, 72 MB): **1,450** natural-language strings ≥24 chars; **18** ≥60-char strings ending in `?` — debate questions readable with `strings`.
   - `acceptance/.pgdata/pg_wal/`: **837** natural-language strings ≥40 chars. **Plaintext is in the WAL, not only the heap.**
   - `.pgdata-debate-091b7663-awaiting-rebaseline`: **369** hits, **9** question-shaped — the corpus DR-188(4) preserves permanently.
   - `.pgdata-backup-2026-08-14-final`: **7** question-shaped. **15 `.pgdata*` dirs total**, all gitignored, all on disk, all undeletable under DR-188(3).
4. **The collision:** DR-188(3) is an affirmative obligation to retain every datadir. A retrofit re-encrypts the live copy while fourteen plaintext copies remain, and destroying them is prohibited by the same ledger. **No retrofit produces erasure without violating DR-188.**

**Correct §0 sentence:**
> Encryption must precede the first user write because **no in-place transformation of a Postgres heap constitutes erasure**. MVCC preserves the pre-image in dead tuples; WAL preserves it in full-page images; DR-188(3) makes the plaintext backups legally undeletable. The only moment content is never plaintext is the moment before it is first written. That window closes permanently at the first registration.

This **strengthens** §0.1 — the trigger is a *deterrent*, not a guarantee, and removing the falsifiable sentence removes the one thing a reviewer holding `rebaseline-serve-hash.mts` would use to reject the reordering.

## 5. Slice-decomposition findings

### 5A. **Three slices are killed by the very trigger §0 is about — the plan's largest internal inconsistency**
`core.run` is the **first** table in the `0000_s00:314-331` protection loop. Yet:

| Slice | Stated mechanism | Problem |
|---|---|---|
| **S7** | `core.run.owner_user_id`; "existing runs get NULL" | ADD COLUMN fine, but **assigning an owner is UPDATE core.run → 55000** |
| **S9** | claim path binds `asker_id → owner_user_id` | Literally an UPDATE on `core.run`. **Impossible as written** |
| **S8** | `core.run.visibility`; "unpublish returns it to private" | Publish and unpublish are both UPDATE. **Impossible as written** |
| **§23** | legacy runs "marked legacy-plaintext" | Same, and no slice owns it |

**Fix:** ownership and visibility must be **append-only event tables with latest-wins projections** (the codebase's own pattern — `core.run_progress_event`, `memory.alias_revocation`) or **mutable side tables in the new `identity` schema deliberately left untriggered** (the pattern S2 already establishes). The choice belongs in **S2**, not S7.

### 5B. **S8's re-key-to-corpus-key is structurally impossible, and it breaks S2's key schema**
Re-keying content means rewriting ciphertext in protected tables — same wall. The only workable design is to **re-wrap the DEK, not re-encrypt the content** — but that requires a **per-run DEK**, while S2 specifies **per-user** `identity.user_data_key`. With a per-user DEK, publishing one debate under the corpus key exposes the key protecting **all** that user's private content. **Phase-1-blocking decision, currently mis-located** as an S8 "Open" item: DEK granularity must be settled in **S1/S2**.

### 5C. **S6 breaks the memory subsystem silently**
`packages/memory/src/index.ts:299` matches questions across runs with in-SQL equality on `canonical_question_text` — which S6 encrypts. Under randomized AEAD, two encryptions differ, the predicate never matches, and **memory linking, pull records, and candidate matching stop working with green tests**, because no test asserts a positive cross-run match. The plan solves exactly this for email (`email_blind_index`) and misses the recurrence. Needs a deterministic blind index — another **S2** schema decision.

### 5D. **S6 is two slices (arguably three)**
Marked L, spans 6 packages, 11 carriers, both write and read paths, and is one of two irreversible slices. Split: **S6a** envelope + write path (`crypto`, `db` run creation, `runner`, `ledger:211-221`); **S6b** read path + projections (`serve` decrypt-on-read, `memory` incl. the 5C blind index, `judgement`). The shred proof is S10's acceptance criterion — own it once, in S10.

### 5E. **S4 contradicts the Phase 2 charter**
S4 says "passkey … required for operator accounts"; the Phase 2 charter says "operator passkey enforcement". WebAuthn is a distinct subsystem (RP ID config, attestation policy, credential storage, browser API) bolted onto a slice already carrying TOTP + recovery codes. **Recommend S4 = TOTP + recovery codes only; passkeys to Phase 2.**

### 5F. **S2's immutability bullet is under-specified**
It names `audit_event` (protected) and `user_data_key`/`session` (deliberately not) but is **silent on `identity.user`, `mfa_factor`, `recovery_code`, `channel_binding`** — all four require mutation (verification transitions, factor activation, code consumption, pseudonym severance). The migration header must enumerate all seven with an explicit armed/unarmed decision and reason.

### 5G. Ordering corrections
- **S6 declares deps S1,S3** but encrypting under a *user* DEK requires the authenticated session (**S5**) and the run→owner binding (**S7**) — real deps **S1,S5,S7**, unless S6 is re-scoped to a per-run DEK (the 5B decision again).
- **S10** needs step-up (**S5**) and ownership (**S7**); transitively satisfied but the shred path's authorization is unowned in the graph.
- **S1's acceptance criterion** ("destroying a wrapped DEK makes ciphertext unreadable — proven") cannot be an integration test with `Schema/migration: none`, because wrapped DEKs live in S2. Either make the proof unit-level over an in-memory store, or move the key table into S1.
- **S2 does not actually depend on S1** (pure DDL) — they can run in parallel.

### 5H. Missing work with no owner
1. **Rate limiting / brute-force defence** — appears in S3/S4 *test* bullets, in no behaviour bullet, in no deliverable. **Nobody builds it.**
2. **KEK rotation** — a runbook item in §23; no slice implements it, and it is far cheaper designed into the envelope format now.
3. **Legacy-plaintext marking** (§23) — blocked by 5A, unowned.
4. **Secret scanning in CI** — recommended in §21 but never given a slice. The Wave 1 exposure is the argument, and the exposure is still live (plaintext read from `.pgdata` with `strings` during this review).

### 5I. Cited references spot-checked — all accurate
`apps/api/src/index.ts:113-123` ✓ · `tests/unit/api.test.ts:557-561` ✓ · `vitest.config.ts:14` ✓ · `packages/contract/src/index.ts:117` ✓ · `acceptance/run-acceptance.ts:27,72` ✓ · `apps/ui/lib/api.ts:105-111` ✓ · `apps/ui/next.config.mjs` (zero `headers`) ✓ · `migrations/0016_s13.sql` ✓.
**One correction:** `apps/ui/app/api/[...path]/route.ts:40-42` does `new Headers(request.headers)` then deletes only `host`/`expect` — so `Cookie` is forwarded by a **blanket header copy**, not an explicit cookie forward. The fix is an allowlist, not a single deletion.
