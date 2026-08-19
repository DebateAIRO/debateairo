# Amendments — corrections forced by the adversarial review (2026-08-19)

Source: `RESEARCH-CONCLUSIONS.md` and `research/RA|RB|RC`. **These amended positions supersede the original wave text wherever they conflict.** Nothing here changes any V ruling.

## Wave 2 (architecture)

| # | Original | Amended |
|---|---|---|
| A2-1 | Wrapped DEKs in `identity.user_data_key` (in Postgres) | **BLOCKING — move the shred point OUT of the backed-up/archived cluster** into the secret store. §19's "backups contain ciphertext only" is FALSE and is withdrawn |
| A2-2 | §9.3 rejects per-debate keys; per-user DEK only | **BLOCKING — three-level hierarchy: `KEK → user DEK → per-debate content key`, plus `corpus KEK → per-publication key`.** §9.3's rejection is reversed: it assumed a flat hierarchy, and §11/§15 already promise per-debate deletion that a flat DEK cannot deliver |
| A2-3 | KEK as a file the API reads | **BLOCKING — isolate from LLM subprocess reach**: separate unprivileged UID for relays, `KEK_PATH` excluded from every child env, wrap/unwrap ideally behind its own process/socket |
| A2-4 | Encryption unspecified beyond "envelope" | **AEAD with associated data = (schema, table, PK, run_id, owner_user_id, key_id, envelope_version)**; key_id/version in the envelope; nonce-misuse-resistant mode. Closes ciphertext relocation, which append-only *enables* via INSERT |
| A2-5 | §15 "content is re-encrypted under the corpus key" | **"Dual-written"** — append-only permits nothing else. The user-DEK copy remains forever unless per-publication keys land |
| A2-6 | §15 unpublish-then-delete = counsel question | **Technically impossible under a shared corpus key** — becomes a real policy choice only with per-publication keys |
| A2-7 | §15 "author link severed" | **False as written.** `core.run.owner_user_id` is plaintext C4 in an append-only table; the public corpus stays partitionable by author. Encrypt it + add a per-run random join surrogate, or withdraw the claim |
| A2-8 | §13.2 audit chain + §19 24-month retention | **Unresolved conflict named:** tamper-evident hash chain OR author-link severance — not both. Must be ruled |
| A2-9 | §12.1 encrypts C2 identity data under the user DEK | **Split C2 out of crypto-shredding** — `identity` is already mutable; DELETE the rows. Encrypting deletable data adds a KEK dependency to the login path and the blind-index rotation problem for nothing. State explicitly whether `identity.user`/`email_blind_index` survive erasure |
| A2-10 | Blind index unspecified | **Separate, independently rotatable key** (never the KEK); rotation runbook must cover shredded users (whose plaintext is gone, so their index rows can never be re-keyed); document small-domain enumeration exposure conditional on key compromise. Construction is blessed by EDPB 01/2025 ¶89/¶107 |
| A2-11 | §12.5 "sealed offline copy held by V" | **Shamir 2-of-3**, geographically separated, with **reconstruction** drilled quarterly. §25 R3's "requires discipline" is not a control at n=1 — and KEK loss is a NOVEL DR-188 violation this design introduces |
| A2-12 | §9.2 "DR-188 forbids deletion" | **Overstated.** Per our own `research/S2:83-89`, DR-188 governs **migrations and datadirs, not rows**; row immutability is `core.reject_mutation()`, an independent and amendable mechanism. Recommended shape is the **hybrid**: DELETE for C2, crypto-shredding for C3 only, shred point outside the cluster |
| A2-13 | §9.2 "the only design in which both are true" | Soften. The real justification is **Wave 1 H4**: the corpus contains verbatim echoes of the question, so personal data cannot be separated from it. That argument is far stronger than the DR-188 one |
| A2-14 | Shred = delete a row | **`DELETE` is not physical erasure** — MVCC dead tuples, WAL, replicas, PITR. Add `VACUUM FULL`/`pg_repack` to the shred ceremony and **disclose a bounded WAL/PITR window as the true erasure latency**. A shred receipt issued while the wrapped DEK is recoverable from WAL is a false statement to a data subject |
| A2-15 | §24 counsel list | Add: EDPB 01/2025 ¶22 (key destruction ≠ automatic anonymity) and ¶21 (public sources count); C-413/23 P (identifiability from the controller's viewpoint); **third-party Art. 17 requests against published debates whose author deleted**. **Do NOT cite EDPB Guidelines 5/2019 — it is search-engine delisting only; the widely repeated claim is false** |
| A2-16 | §25 residual risks | Add **R14** archived-datadir copies of the shred point · **R15** corpus-key content unerasable by anyone incl. its subject · **R16** KEK reachable by the LLM subprocess UID |

## Wave 3 (roadmap)

| # | Original | Amended |
|---|---|---|
| A3-1 | §0 "there is no UPDATE to rewrite it with" | **Withdrawn — six retrofit paths exist**, one already executed in-repo (`logs/rebaseline-serve-hash.mts:19`). Replace with: **no in-place transformation of a Postgres heap constitutes erasure** (MVCC pre-images, WAL full-page images, and DR-188(3) making plaintext backups undeletable). Empirically confirmed: 1,450 plaintext strings in the live datadir, 837 in the WAL |
| A3-2 | §0 option 3 (grant a migration exception) | **STRUCK.** Technically trivial, and it does not deliver erasure |
| A3-3 | S7 assigns `owner_user_id`; S8 sets/clears `visibility`; S9 binds legacy runs; §23 marks legacy-plaintext | **All four are `UPDATE core.run` — impossible.** Redesign as append-only event tables with latest-wins projections (the codebase's own pattern) or mutable side tables in `identity`. **The choice belongs in S2, not S7** |
| A3-4 | S6 encrypts `question_line`, `canonical_question_text` | **Breaks equality-matching lookups** in `packages/memory:285-299` and `packages/liveness:121-127` — silently, with green tests. Needs deterministic blind indexes (an S2 schema decision). **Found independently by two seats** |
| A3-5 | S6 deps = S1, S3 | Real deps **S1, S5, S7** (the DEK comes from the session and the run→owner binding) — unless S6 is re-scoped to a per-run DEK, which A2-2 requires anyway |
| A3-6 | S6 size L | **Split: S6a** write path (`crypto`, `db`, `runner`, `ledger`) **S6b** read path + projections (`serve`, `memory` incl. blind index, `judgement`, **`liveness`**, **`evidence`**) |
| A3-7 | S4 "passkey required for operator accounts" | **Contradicts the Phase 2 charter.** S4 = TOTP + recovery codes only; passkeys to Phase 2 |
| A3-8 | S2 immutability bullet | Under-specified — silent on `identity.user`, `mfa_factor`, `recovery_code`, `channel_binding`, all of which require mutation. The migration header must enumerate **all seven** tables with an explicit armed/unarmed decision and reason |
| A3-9 | S1 acceptance "destroying a wrapped DEK…proven" | Cannot be an integration test with `Schema/migration: none` — wrapped DEKs live in S2. Make the proof unit-level, or move the key table into S1 |
| A3-10 | — | **Unowned work now owned:** rate limiting/brute-force (appears only in test bullets — *nobody builds it*), KEK rotation, legacy-plaintext marking, secret scanning in CI |
| A3-11 | 77 of 79 tables, 15 migrations | 77/79 correct; **16** attachment migrations; an **80th** table exists (`public.debateai_schema_migration`, created by `migrate()`); **TRUNCATE is blocked nowhere**; REVOKE grants are **inert** (roles are `NOLOGIN`; app connects as superuser) |

## Wave 4 (topology)

| # | Original | Amended |
|---|---|---|
| A4-1 | "`apps/api/src/index.ts`, one 311-line file" | **638 lines.** §2 described only `buildApi` (`:125-311`) and missed `PostgresAskApplication` (`:408-638`) |
| A4-2 | S6 does not edit the API file | **It does** (`:428`, `:430-432`, `:447-454`, `:457-465`, `:516-518`). **Lane A and Lane B are NOT file-disjoint** — the schedule's step-4 "first true parallelism" is invalid as drawn |
| A4-3 | "migrations are new files per slice → no contention" | **FALSE and dangerous.** `readdir().sort()`, no manifest, conflicts invisible to git, applied-set keyed on filename. **Already failed in-tree: two `0025_` migrations exist** |
| A4-4 | Matrix omits the architecture audit | **`tools/orphan-audit/src/index.ts:9-37` and `tests/architecture/scaffold.test.ts:23` are the highest-contention files** once `packages/crypto` exists (`edgeRowsChecked === 27` → 28 turns **every lane red**) |
| A4-5 | `packages/register` rated `none` | **`acceptance/seed-register.ts:298-323` throws `ACCEPTANCE_REGISTER_VERSION_CONFLICT`** on any added row — shared DB state, **worktree-proof** |
| A4-6 | Matrix omits packages | Add **`packages/liveness`** and **`packages/evidence`** (S6 carriers; liveness is a functional break) and **`runtime-environment.ts` = S1 AND S6** (runner-side KEK) |
| A4-7 | `web/` invisible | **`web/lib/api.ts:28-44` and `web/app/api/[...path]/route.ts:40-42` duplicate exactly the two vulnerabilities S5 removes**, in a live workspace member whose proxy test is live while `apps/ui`'s is disabled. Fixing only `apps/ui` ships the hole |
| A4-8 | Critical path 8, "nothing shortens it" | **A slicing artifact.** Split S5a/S5b → 7; split S7b → 6 |
| A4-9 | Ceiling = 3 lanes | **Instantaneous ceiling 5–6** once S6 splits by package and a UI lane runs ahead against contract schemas — **but only if the three unlisted serializers are managed out-of-band.** The binding constraint is not a lane count; it is that three files must be edited by one lane, first, alone |
| A4-10 | Take S0 (split the API file) | **Do not.** It fixes the three cheap conflicts and **doubles** the file count for S5/S7/S9 (one idiom × 15 sites becomes 15 sites × 5 files). **Replaced by S0′:** (1) land the deny-by-default `preHandler` first under existing semantics; (2) land `packages/crypto` + edge row + scaffold count as one standalone commit; (3) migration-number allocator; (4) register-row freeze window |
| A4-11 | Phase 4 "fully independent" | **Mostly.** It needs `vitest.config.ts:14`, and once the acceptance suite joins the default run, **S9's dev-token removal breaks both boards' test runs simultaneously** |

---

## V rulings — 2026-08-19 (binding; gate S2/S10)

**VR-1 · The erasure hybrid, refined.** Identity data (C2: email, recovery
email, phone/WhatsApp number, pseudonym map, risk signals) gets **real row
DELETE** — the `identity` schema is mutable and real deletion needs no counsel
opinion. Debate content (C3) gets **crypto-shredding ONLY WHILE PRIVATE.**
Publication is the exit from shreddability: at publish, content leaves the
per-user/per-debate private key envelope and joins the permanent public record
under the corpus key (consistent with public-forever / private-per-account).
So: **private debate → crypto-shreddable; published debate → not shreddable,
persists as public record.** This resolves A2-2 and A2-9 and the Front-4
publication design together — the per-publication key wraps under the corpus
KEK, and "delete my account" shreds all private content + severs the author
link while published debates stand.

**VR-2 · Audit vs erasure: severance wins.** On account deletion the actor
identifier in `identity.audit_event` rows is **shredded/tombstoned and the hash
chain re-anchored from that point.** The chain still proves events happened and
weren't tampered; it no longer proves WHO before the deletion. Erasure wins;
forensic attribution is time-boxed to before the erasure request. Resolves A2-8.

**Consequences for the slices:**
- S2 identity schema: C2 tables are DELETE-capable (NOT under `reject_mutation`);
  `identity.audit_event` keeps the append-only trigger BUT its actor column must
  be a shreddable reference (tombstone-able) with chain re-anchor support.
- S6/S10: the shred boundary is **private content only**; publication re-keys
  out of the shred envelope. Per-publication key wrapped by the corpus KEK.
- S10 account deletion = DELETE C2 rows + shred private-content keys + sever
  audit actor + re-anchor chain; published debates untouched.

---

## Post-S2 corrections (2026-08-19) — from the S2 dual diamond

**A-R1 · VR-2's wording was self-contradictory; the implementation is right.**
VR-2 as recorded above says the actor is "shredded/tombstoned and the hash chain
re-anchored". Both a tombstone-write and a re-anchor are **UPDATEs on an
append-only table** — the Opus lens confirmed live that both raise SQLSTATE
55000. Codex resolved it correctly: the actor is stored as ciphertext under a
per-user audit key, and deletion destroys the key, so the actor becomes
unreadable **with zero row mutation** (proven at storage level: `md5(row::text)`
and `xmin` unchanged after severance, chain still verifies from bytes read back
out of Postgres). **The mechanism, not the wording, is authoritative.**
`ACTION: V ratifies this so S10 is not built against impossible wording.`

**A-R2 · BINDING CONSTRAINT on S3/S7/S8/S10 — severance is currently defeated
for login events.** Shredding the audit key hides `actor_ciphertext`, but
`actor_key_ref` and `target_id` are **plaintext**. The repo's only instantiation
is `actor_key_ref = "audit-key:user:<id>"` and `target_id = "user:audit"` — and
for authentication events **the target IS the actor**, so a shredded user's
identity is still readable from the plaintext columns. That is the most common
event class, so severance fails exactly where it matters most.
**Required of every future audit-event writer:**
- `actor_key_ref` MUST be an **opaque random reference** (e.g. a per-user random
  uuid stored only in the mutable `identity` row that gets DELETEd), never a
  value derived from or containing `user_id`.
- `target_id` MUST NOT contain a raw user identifier for auth/account events;
  use the same opaque reference, or a per-event random target token.
- A test must assert: after account deletion, **no column of any audit row
  contains the user's id, email, blind index, or pseudonym** — plaintext or
  otherwise.
The schema itself is fine (`text` accommodates opaque values); this is a writer
discipline that S3 must adopt from its first audit write.

**A-R3..R6 · Advisory, non-blocking (recorded so they are not rediscovered):**
owner `TRUNCATE` bypasses the `FOR EACH ROW` trigger (pre-existing repo-wide;
the runtime role is correctly denied, 42501); `verifyChain([])` is vacuously
true and no head anchor is persisted, so truncation is currently unfalsifiable;
chain validity is application-enforced and the table is structurally a forest;
`source_context`/`justification` are shape-unconstrained. Fold the Opus lens's
`xmin`-stability severance proof into CI (the delivered severance test is
in-memory only).

---

## V rulings — 2026-08-19 (round 2; supersede where they conflict)

**VR-3 · THE NAME MUST BE GONE.** V: *"when the user deletes their account their
name has to be gone too from our databases."* Binding and literal.
Implementation (supersedes the encrypted-actor design from S2):
- `identity.*` rows are **really DELETEd** (already built, VR-1) — email,
  pseudonym, phone genuinely gone.
- `identity.audit_event` **never stores the name or any user identifier at all**,
  encrypted or otherwise. It stores an **opaque random token** (a per-user uuid
  with no derivation from user_id). `actor_ciphertext` is written NULL always;
  a later migration may drop the column.
- The ONLY token→person mapping lives in the mutable `identity.user` row, which
  is deleted on account deletion. After deletion the audit token resolves to
  nothing, permanently. **Nothing to decrypt, because nothing was encrypted.**
- The hash chain is untouched — no row is ever mutated, so tamper-evidence is
  fully preserved. This satisfies VR-2's intent AND VR-3's literal requirement,
  and it subsumes A-R2 (opaque refs) automatically.
- **Test required:** after account deletion, no column of any audit row contains
  the user's id, email, blind index, or pseudonym — and the chain still verifies.

**VR-4 · Pseudonyms: one stable pseudonym per account** (Reddit-style), used on
every published debate. Generated at registration, never derived from email or
user id. (Rotation is not in launch scope.)

**VR-5 · Mail: own mail service, NO relays.** V accepts the deliverability risk.
Required handling: sign-up and code screens tell users to check spam; a
**resend** control with cooldown; delivery failures logged and visible to the
operator so bounces are diagnosable. No third-party mail processor enters the
vendor register.

**VR-6 · Commit hygiene: commit each dual-greenlit ticket locally** (ticket id +
both verdicts referenced in the message). **Never pushed** — V's push law stands.

**VR-7 · Memory-hard KDF for the audit source IP.** The audit table is
append-only, so the IP salt can never be rotated; with a fast hash a leaked salt
retroactively exposes every historical IP (2^32 IPv4 space = sub-second GPU
sweep), permanently and unfixably. V ruled for defence in depth: use a
memory-hard KDF (argon2id, already in-tree via hash-wasm) with **ruled cost
parameters**, keyed by the secret-store salt. Correlation and no-raw-IP
properties preserved; password hashing untouched.

**VR-8 · Side-finding policy.** Reviewer findings outside the current ticket:
**fold in if small** (a one-line predicate, a mechanical fix); **cut a board
ticket if larger**, so it is visible and scheduled rather than forgotten. Applied
this round: the LRU eviction bypass was folded in (one predicate); the lockfile
gap was folded in once proven to be the ticket's own work.

**VR-9 · Split S3.** After four rework rounds — each fixing its findings while
introducing new ones — V ruled the ticket is too large to review to a safe state.
It bundles seven subsystems. **Land the verified-safe parts; re-cut the rest into
tickets with one concern each.** Verified safe and retained: the crypto
foundation, the identity schema, VR-3 erasure (verified twice incl. an isolated
Postgres + 12 encodings), pseudonyms, blind index, argon2id password hashing.
Re-cut: registration durability, rate limiting, mail/cooldown, and migration 0032
(which as written **bricks any database holding audit rows** — 0030 declares
`actor_ciphertext NOT NULL`, 0032 adds `CHECK (actor_ciphertext IS NULL)` without
`NOT VALID`, and migrate() runs all pending migrations in one transaction).

**VR-10 · Mutation-test every security assertion (STANDING RULE).** All three of
round 4's proof tests passed against deliberately broken implementations — rate
limiting entirely deleted, the timing attack permitted by the assertion itself,
weak hashing for any string over 32 chars (i.e. every real browser). Green gates
therefore carried no information. **From now on, before any security ticket
closes, the implementation is deliberately broken and each guarding test must be
shown to FAIL.** A test that passes against a broken implementation is a defect
in its own right and blocks the ticket.

**Carried into S3b (from the S3a diamond):** the audit-context hashing still runs
*inside* the transaction (`packages/db/src/identity.ts:89-92`), so the
"throw rolls back the audit row" mechanism survives structurally. It is safe today
only because every route funnels through `sourceContext`, which now clamps blanks.
**S3b must normalise at the repository boundary** so a future writer cannot
reintroduce audit evasion by bypassing `sourceContext`.
