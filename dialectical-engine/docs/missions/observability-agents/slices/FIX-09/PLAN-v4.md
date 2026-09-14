# FIX-09 Per-writer Ed25519 Audit Chain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to execute this plan, `superpowers:test-driven-development` for each RED/GREEN cycle, and `superpowers:verification-before-completion` before every completion or commit claim. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an activation-gated, per-writer Ed25519 audit chain to every current occurrence/action writer, then add a separate read-only watchdog with a V-authorized witness key and append-only journal.

**Architecture:** A shared `@debateai/obs-capture/chain` package owns one literal tagged RFC 8785 row protocol, signer/keyring/activation validation, partition locks, append gateways, and read verification. Migration `0064` adds nullable chain material, action ordering/source, uniqueness, immutable activation, trigger gates, and least-privilege grants. C3.5 converts all current writers before C4 adds the watchdog. Private keys stay in process-specific filesystem inputs under symbolic `OBS_CONTROL_DIR`; PostgreSQL and the watchdog see row public keys only.

**Tech Stack:** TypeScript 7, Node.js 22 `node:crypto`, PostgreSQL 18.4/`pg`, Drizzle schema declarations, Vitest 4, `fast-check`, launchd plist files.

**Spec:** `docs/missions/observability-agents/slices/FIX-09/SPEC-v4.md`, preserving `SPEC-v3.md` → `SPEC-v2.md` for C2 and the frozen C1-C3 surfaces except where v4 expressly supersedes chain authority.

## Global constraints

- Execute implementation in an isolated integration worktree containing reviewed FIX-09 HEAD `8619b9ab4dbc01fdd166337a641193675b24380a` plus the then-current reviewed occurrence writer/detail line. The audited occurrence references are FIX-01 `24d0b3e5de84876b6b46fa84b13a0a42aa2640a4` and FIX-02 `e7b9f6812cafc8808cf5e188cd6440f19beda831`; these three commits are not ancestors of one another, so their composition requires a separately reviewed integration instruction and conflict evidence. Do not pretend one head contains the other. STOP if any C1 hash in SPEC-v4 §2 differs.
- Claim only `migrations/0064_fix09_audit_chain.sql`, after repeating the collision audit in Task 0 immediately before file creation.
- Use ephemeral per-test Ed25519 keys and an embedded/local test PostgreSQL only. Never read, generate, copy, print, or infer a production key or live control root.
- Do not apply a migration outside test PostgreSQL. Do not quiesce, activate, start launchd jobs, run production acceptance, merge, push, or mark the slice Done.
- Do not modify frozen `SPEC.md`, `PLAN.md`, FinalPlan, L2, S21, live `PLAN-FixAgent.md`, C1 contract files, or an earlier decision row.
- Keep C2 delivery order and C3 tracer contracts byte-stable. Keep occurrence/detail/receipt atomicity and existing direct-capture spool behavior.
- Use no installer-graph import in the chain package, no model call, no `identity.*`, raw `core.run`, retention/deletion, symmetric row-verification secret, raw production occurrence/action insert, or watchdog action write.
- The words prohibited by COMMON §4 must not appear in new mission code, tests, docs, comments, or commit messages.
- STOP and report the exact evidence on any migration collision, authority mismatch, unknown writer, schema drift, chain ambiguity, key leakage, ACL widening, un-killed mutation, or production-only input.

---

### Task 0: Freeze the baseline and re-claim migration 0064

**Files:**
- Read: `docs/missions/observability-agents/slices/FIX-09/SPEC-v4.md`
- Read: `docs/missions/observability-agents/slices/FIX-09/DECISIONS.md`
- Read: `migrations/0034_obs_foundation.sql`
- Read: `migrations/0062_fix09_listener_fold.sql`
- Read: all four writer functions listed in SPEC-v4 §2
- Do not modify a file in this task

- [ ] **Step 1: Prove repository and implementation identity**

Run:

```bash
git rev-parse --show-toplevel
git rev-parse HEAD
git status --short
git show -s --format='%H %s' 8619b9ab4dbc01fdd166337a641193675b24380a
```

Record the exact worktree, branch, HEAD, pre-existing dirt, the three audited source heads, and the separately authorized composed base as shell-local `C35_BASELINE`. Preserve all pre-existing dirt. If no composition instruction exists, STOP before implementation.

- [ ] **Step 2: Recompute the C1 pins**

Hash `tracer-hook.ts`, `dispatch-arm.ts`, and the C1 interface fixture as raw files and independently recompute the canonical bundle hash. Require every value in SPEC-v4 §2. A mismatch is STOP; do not refresh a pin.

- [ ] **Step 3: Repeat the full migration collision audit**

Enumerate all refs, all reachable objects, all registered worktrees, and tracked/untracked `migrations/0064*.sql` files. Search all ref heads and worktree Markdown/SQL for `0064` claims, allocations, or reservations. Record ref/worktree counts and matching paths. Any competing file or independent claim is STOP.

- [ ] **Step 4: Re-enumerate raw writers**

Search all production TypeScript/SQL for `INSERT INTO obs.occurrence`, `INSERT INTO obs.agent_action`, ORM inserts into either table, and dynamic table-name variants. Require exactly the four baseline call sites plus migration/test fixtures. Search proposed/frozen FIX-10 contracts and confirm no landed FIX-10 database writer exists.

- [ ] **Step 5: Create a local evidence note**

Record baseline, pins, collision result, writer map, and forbidden actions in the normal implementation report. Do not edit a frozen authority file.

---

### Task 1: Add migration 0064 under real-PostgreSQL RED tests

**Files:**
- Create: `migrations/0064_fix09_audit_chain.sql`
- Modify: `packages/db/src/obs-schema.ts`
- Create: `tests/integration/fix09-chain-migration.test.ts`
- Create: `tests/architecture/fix09-chain-grants.test.ts`
- Read: `migrations/0034_obs_foundation.sql`
- Read: repository migration runner and embedded-PostgreSQL helpers

**Interfaces:**
- Produces the exact schema, constraints, indexes, triggers, activation singleton, and ACLs in SPEC-v4 §3.
- Does not insert the activation row or any chain bytes.

- [ ] **Step 1: Write failing populated-legacy and empty-schema tests**

Apply migrations through `0062` to fresh embedded PostgreSQL fixtures. In one fixture insert multiple occurrences/actions, including distinct action times/ids; in another keep both tables empty. Assert that `0064` is absent and the required new columns/table/indexes do not exist.

Run:

```bash
pnpm vitest run tests/integration/fix09-chain-migration.test.ts
```

Expected RED: `0064` and new catalog objects are absent.

- [ ] **Step 2: Write failing stop tests**

Create one pre-`0064` fixture with a non-NULL occurrence `prev_link`, another with a non-NULL action `prev_link`, and another with duplicate `action_ref`. Assert migration failure with stable typed exception markers. Assert the failed migration leaves no partial catalog change and deletes/updates no source row.

- [ ] **Step 3: Implement the migration preflight and additive objects**

In one transaction:

1. raise on either non-NULL legacy `prev_link`;
2. raise on duplicate `action_ref` groups;
3. create `obs.agent_action_seq` and add `action_seq` with its sequence default/positive/unique contract;
4. add action `source` with legacy default and closed check;
5. add all five new fields to each table while retaining `prev_link`;
6. add exact byte/id/version/positive and all-or-none constraints;
7. create both partial `(source,writer_identity,chain_seq)` unique indexes and the global action-ref unique index;
8. create the empty immutable activation singleton;
9. install pre/post-activation insert validation and activation immutability triggers;
10. execute the exact revoke-first ACL block.

Do not disable the existing append-only triggers. PostgreSQL's ADD-COLUMN sequence assignment for old action rows is legacy order only; do not update chain material.

- [ ] **Step 4: Update Drizzle declarations**

Mirror columns, checks, indexes, sequence-backed action order, and activation read shape in `packages/db/src/obs-schema.ts`. The schema declaration must not expose a runtime activation insert helper.

- [ ] **Step 5: Make schema and stop tests GREEN**

Assert catalog types/defaults/check expressions/index predicates; zero/positive legacy counts; old rows with NULL chain tuple; action `source='legacy'`; stable action-seq uniqueness; activation table empty; and rerun idempotency only to the degree repository migration conventions permit.

- [ ] **Step 6: Prove exact roles**

Authenticate direct connections as writer, listener, watchdog, and human. Prove the SPEC-v4 §3.2 matrix, including watchdog action INSERT denial with SQLSTATE `42501`, writer/listener required tail reads, required sequence use, activation SELECT, and absence of DELETE/TRUNCATE. Compare catalog ACLs, not only successful happy-path statements.

- [ ] **Step 7: Prove pre/post activation trigger modes locally**

In a rolled-back/local-only fixture, exercise: preactivation NULL accepted/non-NULL rejected; test activation inserted by migration owner; postactivation NULL rejected, `legacy` rejected, complete tuple accepted, partial tuple rejected; activation UPDATE/DELETE/TRUNCATE rejected. The test activation uses ephemeral digests and never persists.

Run:

```bash
pnpm vitest run tests/integration/fix09-chain-migration.test.ts tests/architecture/fix09-chain-grants.test.ts
```

- [ ] **Step 8: Commit the isolated migration slice**

Stage only Task 1 files after reviewing `git diff --check` and the staged diff. Suggested subject: `feat(obs): add dormant audit-chain schema`.

---

### Task 2: Implement canonical bytes, domains, keys, keyring, and activation readers

**Files:**
- Modify: `packages/obs-capture/package.json`
- Create: `packages/obs-capture/src/chain/types.ts`
- Create: `packages/obs-capture/src/chain/canonical.ts`
- Create: `packages/obs-capture/src/chain/protocol.ts`
- Create: `packages/obs-capture/src/chain/private-key.ts`
- Create: `packages/obs-capture/src/chain/keyring.ts`
- Create: `packages/obs-capture/src/chain/activation.ts`
- Create: `packages/obs-capture/src/chain/index.ts`
- Create: `tests/unit/fix09-chain-canonical.test.ts`
- Create: `tests/unit/fix09-chain-keys.test.ts`
- Create: `tests/unit/fixtures/fix09-chain-vectors.json`
- Create: `tests/unit/fixtures/fix09-independent-chain.mjs`

**Interfaces:**
- Exports the types and two gateway names in SPEC-v4 §6; gateway bodies arrive in Tasks 3-4.
- Internal functions produce/verify exact `C`, signature, link, genesis, keyring, and activation values.

- [ ] **Step 1: Write independent protocol vectors first**

Create an independent Node script using only `node:crypto` and literal byte assembly. With ephemeral seeded fixture keys, emit fixed vectors for both table schemas, NULL fields, every scalar tag, nested JSONB, multi-byte key sorting, signature, link, and genesis. Commit public fixture keys only; never commit a private fixture key. Generate signatures at test runtime from a deterministic test-only seed held as obvious fixture bytes.

- [ ] **Step 2: Write canonical RED tests**

Assert byte-for-byte equality with the independent vectors and field-order arrays. Add `fast-check` determinism cases. Add hostile values for fraction/exponent, unsafe integer, duplicate decoded key, lone surrogate, accessor, proxy, cycle, symbol, bigint runtime value, non-plain prototype, and depth/node/byte caps. Assert stable typed rejection codes and no partial bytes.

Run:

```bash
pnpm vitest run tests/unit/fix09-chain-canonical.test.ts
```

Expected RED: chain modules do not exist.

- [ ] **Step 3: Implement literal canonicalization**

Implement tagged scalars, recursive JSONB tags, unsigned UTF-8 key comparison, fixed caps, exact occurrence/action ordered descriptors, RFC 8785 serialization, and UTF-8 output. Do not use schema reflection, locale sort, default `JSON.stringify`, or C1 policy canonical code.

- [ ] **Step 4: Implement protocol byte functions**

Implement unsigned 32-bit big-endian length prefixes, the exact NUL-separated domains, Ed25519 sign/verify, SHA-256 link, SHA-256 genesis, SPKI-derived lowercase key id, and legacy digest. Reject oversized length inputs before allocation.

- [ ] **Step 5: Write key-file and metadata RED tests**

Use a temporary directory to cover PKCS#8 DER success; PEM/raw/wrong-algorithm/trailing-byte failure; wrong mode; link count two; wrong owner where the test platform permits; leaf symlink; intermediate symlink; traversal; relative root; derived-key mismatch; and no secret in error/inspect/stringification output.

- [ ] **Step 6: Implement fail-closed key loading**

Resolve and validate symbolic-root containment without embedding a production root. Open with no-follow semantics, inspect descriptor metadata, parse Ed25519 PKCS#8, derive SPKI/key id, bind exact writer/table/source allowlist, and keep the key object private. Add explicit zero/dispose paths for raw buffers.

- [ ] **Step 7: Write and implement keyring/activation validation**

Test canonical document grammar, array order/duplicates, key ids, V signature, keyring generations/prior digest, cumulative historical keys, row/witness domain separation, inclusive non-overlapping chain-sequence authorizations, activation signature/unsigned-body digest, DB/file parity, and file-only/DB-only/mismatch states. Then implement read-only validators for exact SPEC-v4 §§9-10 documents.

- [ ] **Step 8: Export only the public subpath**

Add the package export `./chain`. Keep private key/keyring constructors internal unless a test-only entry already follows repository convention. Prove that installer graphs are absent from the import closure.

Run:

```bash
pnpm vitest run tests/unit/fix09-chain-canonical.test.ts tests/unit/fix09-chain-keys.test.ts
pnpm typecheck
```

- [ ] **Step 9: Commit the protocol slice**

Review staged bytes and confirm no private material. Suggested subject: `feat(obs): define Ed25519 chain protocol`.

---

### Task 3: Implement the occurrence gateway and convert both occurrence writers

**Files:**
- Create: `packages/obs-capture/src/chain/occurrence-gateway.ts`
- Create: `packages/obs-capture/src/chain/locks.ts`
- Modify: `packages/obs-capture/src/chain/index.ts`
- Modify: `packages/obs-capture/src/runtime/config.ts`
- Modify: `packages/obs-capture/src/runtime/index.ts`
- Modify: `packages/obs-capture/src/runtime/sink.ts`
- Modify: `packages/obs-capture/src/runtime/drain.ts`
- Create: `tests/integration/fix09-chain-occurrence.test.ts`
- Create: `tests/architecture/fix09-chain-writers.test.ts`
- Preserve: occurrence envelope wire schema unless a failing identity test proves an authority-required additive discriminator is unavoidable

**Interfaces:**
- Implements `appendChainedOccurrences(client, envelopes, signer)`.
- One call owns one transaction and preserves occurrence/detail/receipt/notification atomicity.

- [ ] **Step 1: Write transaction/ordering RED tests against PostgreSQL**

Cover empty partition genesis; existing tail continuation; two rows in one partition; one call spanning multiple partitions; same-partition concurrent clients; fixed different-partition clients; advisory-hash collision as conservative serialization where injectable; rollback after allocation/signing/occurrence/detail/receipt/notification; retry reuse of chain sequence; and allowed gaps in global occurrence sequence.

Assert locks are acquired in unsigned-UTF-8 partition order and held to transaction end. Assert the stored UUID, sequences, timestamps/defaults, chain prefix, body fields, signature, and link equal independently recomputed bytes.

- [ ] **Step 2: Implement lock and materialization helpers**

Use the exact length-prefixed advisory tokens and lock order from SPEC-v4 §6. Acquire all source-event idempotency locks before chain locks; reject duplicate batch keys; remove exact already-present events before allocating a chain position; reject inconsistent identity/content. Query exact partition `(chain_seq,chain_link,chain_key_id)` tails while locked. Materialize UUID, the return from `obs.occurrence_seq_nextval_notify()`, millisecond `captured_at`, all defaults, and chain fields before signing. Bind explicit SQL column lists and values; do not let an ORM/default substitute a signed value or use `ON CONFLICT DO NOTHING` after allocation.

- [ ] **Step 3: Implement the occurrence gateway**

Own BEGIN/COMMIT/ROLLBACK, group and order partitions, validate signer scope, append caller-order rows with gapless per-partition sequence, insert optional details, insert spool receipts where supplied, and publish the existing notification transactionally. Preactivation mode writes all-NULL chain tuples only when DB and file activation are both absent. Required mode demands exact parity and a valid signer.

- [ ] **Step 4: Convert `writeOccurrences`**

Replace the direct batch INSERT with `appendChainedOccurrences`. Preserve queue order, `capture_status='PERSISTED'`, `ON CONFLICT`/idempotency semantics only if they do not allocate and discard a committed chain position, existing detail insertion, fallback spool decision, and typed health results. A duplicate source event must return the existing row without appending another chain position.

- [ ] **Step 5: Convert `ingestSpooledOccurrence`**

Replace the raw SPOOLED insert with the same gateway and preserve occurrence/detail/spool-receipt atomicity. Bind replay to the envelope's exact writer identity and to a signer authorized for that identity; never choose a signer from a spool filename alone. A mismatched runtime/writer/key leaves the spool item pending and emits a typed safe diagnostic.

- [ ] **Step 6: Add configuration without defaults**

Require `OBS_CONTROL_DIR`, explicit `PRE_ACTIVATION|REQUIRED`, and expected writer identity at process composition. Installer modules pass values but never read key bytes. Test missing, empty, relative, traversal, and mode/parity failures.

- [ ] **Step 7: Add raw-writer architecture enforcement**

Parse/search production TypeScript and fail if occurrence insertion appears outside `occurrence-gateway.ts`. Permit named migration/test fixtures only. Assert `sink.ts` and `drain.ts` import the public chain subpath and no installer graph enters the package.

Run:

```bash
pnpm vitest run tests/integration/fix09-chain-occurrence.test.ts tests/architecture/fix09-chain-writers.test.ts
pnpm vitest run tests/unit/obs-capture*.test.ts tests/integration/obs-capture*.test.ts
pnpm typecheck
```

- [ ] **Step 8: Commit the occurrence writer slice**

Review that both baseline occurrence sites are converted. Suggested subject: `feat(obs): chain occurrence writers`.

---

### Task 4: Implement the action gateway and convert both daemon action writers

**Files:**
- Create: `packages/obs-capture/src/chain/agent-action-gateway.ts`
- Modify: `packages/obs-capture/src/chain/index.ts`
- Modify: `tools/obs-listener/src/daemon/poison.ts`
- Modify: `tools/obs-listener/src/daemon/fold.ts`
- Modify: `tools/obs-listener/src/daemon/main.ts`
- Create: `tests/integration/fix09-chain-action.test.ts`
- Modify: `tests/integration/fix09-daemon.test.ts`
- Modify: `tests/architecture/fix09-chain-writers.test.ts`

**Interfaces:**
- Implements `appendChainedAgentAction(client, action, signer)` on an existing transaction.
- Listener actions inherit the selected occurrence's source and use the daemon's exact configured writer identity.

- [ ] **Step 1: Write action gateway RED tests**

Cover genesis/tail, exact action field order, action-sequence materialization, same-partition concurrency, different sources under one daemon identity, duplicate action-ref replay, rollback/retry, wrong transaction state, signer/source/identity mismatch, and preactivation/required modes.

- [ ] **Step 2: Implement the action gateway**

Require a transaction-state assertion, acquire one exact action partition lock, select its tail, allocate UUID/action sequence/millisecond time, sign and insert exact bytes, and return a typed inserted-or-existing result for an identical unique `action_ref`. If an existing action ref has unequal semantic fields, return a collision error. Never begin, commit, or roll back the caller transaction.

- [ ] **Step 3: Convert skip and poison actions**

Route `appendSkipReceipt` and `appendPoisonReceipt` through the public gateway. Derive action `source` from the occurrence already selected inside the locked C2 delivery transaction. Use the configured daemon signer. Keep action before ACK and cursor; any signing/insertion error rolls the transaction back.

- [ ] **Step 4: Prove the C2 contract remains exact**

Test global leader ownership, concurrency cap one, transaction occurrence advisory lock before plain SELECT/ACK recheck, fold/action/ACK/cursor order, poison health, rollback/replay, and terminal typed actions. Assert no signature failure can leave an ACK or cursor advance.

- [ ] **Step 5: Complete raw-writer enforcement**

Require no action INSERT outside `agent-action-gateway.ts` in production source. Confirm all four SPEC-v4 baseline writers are absent from the raw-write report.

Run:

```bash
pnpm vitest run tests/integration/fix09-chain-action.test.ts tests/integration/fix09-daemon.test.ts tests/architecture/fix09-chain-writers.test.ts
pnpm vitest run tests/unit/fix09-fold.test.ts tests/unit/fix09-tier-gate.test.ts tests/architecture/fix09-no-model.test.ts
pnpm typecheck
```

- [ ] **Step 6: Commit the action writer slice**

Suggested subject: `feat(obs): chain listener actions`.

---

### Task 5: Prove activation, rotation, recovery, rollback, and privacy as one C3.5 system

**Files:**
- Create: `tests/integration/fix09-chain-lifecycle.test.ts`
- Create: `tests/architecture/fix09-chain-privacy.test.ts`
- Modify: chain modules only when a new failing test identifies a SPEC-v4 violation

- [ ] **Step 1: Add the complete activation interruption matrix**

Using temporary control roots and rolled-back/local activation rows, test both absent, file only, DB only, digest mismatch, field mismatch, invalid V signature, stale generation, missing signer, wrong signer, and exact parity. Assert every inconsistent state refuses a write.

- [ ] **Step 2: Add planned rotation tests**

Append with key A, quiesce its test writer, capture every partition tail, install a V-signed cumulative keyring closing A at each tail and opening key B at each `tail+1`, then switch to B and append the next sequence/link. Verify old A and new B rows, inclusive non-overlapping sequence bounds, no genesis reset, no missing sequence, and rejection of A above its closed maximum.

- [ ] **Step 3: Add compromise/loss tests**

Remove or corrupt the private file and prove direct occurrence capture spools while action delivery rolls back. Resume with a newly authorized key at the next chain position. Mark the post-last-witness suspect interval in verifier output; never edit old rows.

- [ ] **Step 4: Add rollback tests**

Before activation, prove the local down path is allowed only with empty activation and no chained row and restores prior ACL/schema expectations without deleting source rows. After activation, prove down migration refuses. Prove an older unchained application release cannot write after activation.

- [ ] **Step 5: Add privacy/static tests**

Scan PostgreSQL, logs, thrown errors, snapshots, fixtures, and process diagnostics for PKCS#8 bytes, private seeds, symmetric verification keys, payload/template/frame values, user-linked identifiers, and an absolute operator root. Assert closed safe codes only.

Run:

```bash
pnpm vitest run tests/integration/fix09-chain-lifecycle.test.ts tests/architecture/fix09-chain-privacy.test.ts
pnpm vitest run tests/unit/fix09-chain-canonical.test.ts tests/unit/fix09-chain-keys.test.ts tests/integration/fix09-chain-migration.test.ts tests/integration/fix09-chain-occurrence.test.ts tests/integration/fix09-chain-action.test.ts
```

- [ ] **Step 6: C3.5 review gate**

Run the entire C3.5 focused suite three fresh times, typecheck, architecture/source/text-byte audits, and adjacent C1-C3 suites. Request a fresh independent review of schema/protocol/writers/grants/recovery/privacy. C4 is STOP until the review reports no unresolved P0-P3 finding.

- [ ] **Step 7: Commit only review corrections, if any**

Apply review feedback under `superpowers:receiving-code-review`, rerun affected plus full C3.5 evidence, and use narrow local commits. Do not merge or push.

---

### Task 6: Land the separately authorized FIX-10 C0 dependency before C4

**Files:**
- Create: `tests/architecture/fix09-fix10-chain-contract.test.ts`
- Read: frozen/current FIX-10 SPEC/PLAN/DECISIONS and its V-selected successor when available
- Do not modify FIX-10 production code unless a separately authorized FIX-10 implementation plan says to do so

- [ ] **Step 1: Add consumer contract tests**

Pin future database actions to `source='ops'`, `writer_identity='obsctl'`, the public action gateway, and globally unique deterministic `action_ref`. Pin marker-only verbs to zero database sockets, zero row-key reads, and zero witness-journal writes.

- [ ] **Step 2: Gate rather than invent missing FIX-10 authority**

If no V-selected FIX-10 successor specifies the keyring/activation/bootstrap/rotation commands, outbox record, reconciliation state machine, signer injection, and action-ref construction, make the consumer gate fail with typed `FIX10_C0_AUTHORITY_REQUIRED` and STOP before Task 7. Do not choose paths or production storage in FIX-09.

- [ ] **Step 3: When separately authorized, run the consumer proof before FIX-10 DB code**

The later FIX-10 executor makes this test RED/GREEN before adding reconciliation. A failed action append must leave the outbox pending; replay must observe the same action ref and never append a second action.

- [ ] **Step 4: Require landed/reviewed C0 before C4**

Record the exact FIX-10 successor authority, local implementation commit, focused test evidence, and fresh independent PASS/PASS review. Task 7 is STOP without all four. This gate authorizes no FIX-10 edit by the FIX-09 executor.

---

### Task 7: Implement the read-only verifier core

**Files:**
- Create: `packages/obs-capture/src/chain/verify.ts`
- Modify: `packages/obs-capture/src/chain/index.ts`
- Create: `tools/obs-listener/src/watchdog/verify.ts`
- Create: `tools/obs-listener/src/watchdog/types.ts`
- Create: `tests/integration/fix09-watchdog-verify.test.ts`

**Interfaces:**
- Produces only `VERIFIED | CHAIN_BREAK | VERIFY_UNAVAILABLE | KEYRING_INVALID | WITNESS_INVALID` plus partition evidence and `LEGACY_WITNESSED_UNVERIFIED` labels.
- Database transaction is `READ ONLY ISOLATION LEVEL REPEATABLE READ` as `debateai_obs_watchdog`.

- [ ] **Step 1: Write a fully chained RED fixture**

Through gateways and ephemeral keys, create legacy boundaries plus multiple occurrence/action partitions and a key rotation. Assert an independent expected partition/tail summary. Start the verifier test before implementation and require RED.

- [ ] **Step 2: Write the mutation matrix**

In isolated fixtures bypass immutability only as test owner to mutate one field, source, writer, chain order, sequence, prior link, signature, key id, row presence, legacy placement, activation digest, keyring signature/generation/prior digest, and key interval. Assert the exact closed result for each mutation.

- [ ] **Step 3: Implement snapshot verification**

Begin exact isolation/read-only mode, read and validate activation/keyring, recompute legacy digests, enumerate partitions, scan by chain sequence, recompute canonical/signature/link/genesis, verify key time/scope, and return summaries. Commit the read-only transaction even for a semantic chain result; roll back on SQL failure. Never request a row lock or write from the scan client.

- [ ] **Step 4: Prove least privilege**

Run the scan as the real watchdog role. Assert SQL transaction flags from PostgreSQL and prove attempts to insert action/occurrence or mutate a chain row fail.

Run:

```bash
pnpm vitest run tests/integration/fix09-watchdog-verify.test.ts
```

- [ ] **Step 5: Commit the verifier core**

Suggested subject: `feat(obs): verify Ed25519 audit chains`.

---

### Task 8: Implement the separately signed append-only witness journal

**Files:**
- Create: `tools/obs-listener/src/watchdog/config.ts`
- Create: `tools/obs-listener/src/watchdog/journal.ts`
- Create: `tools/obs-listener/src/watchdog/health.ts`
- Create: `tools/obs-listener/src/watchdog/main.ts`
- Create: `tests/unit/fix09-watchdog-journal.test.ts`
- Create: `tests/integration/fix09-watchdog.test.ts`
- Modify: `tests/architecture/fix09-chain-privacy.test.ts`

- [ ] **Step 1: Write journal protocol RED tests**

Create independent fixture vectors for witness canonical bytes, signature, and record hash. Cover first record zero prior hash, subsequent link, wrong witness key/scope/time, signature bit flip, line edit, removal, reordering, duplicate sequence, partial final line, noncanonical JSON, and keyring prior-digest failure.

- [ ] **Step 2: Write filesystem atomicity RED tests**

Using temporary roots, cover missing pre-provisioned directory/file, symlink leaf/intermediate, wrong mode/owner/link count, two appenders, short write, fsync failure, process interruption before fsync, and restart tail validation. Require no truncation/repair and no PASS health before durable append.

- [ ] **Step 3: Implement journal append**

Validate the complete existing journal from its last trusted checkpoint or from record one, take an exclusive file lock, revalidate tail, canonicalize/sign the next record with the distinct witness key, append exactly one line via append-only flags, fsync, and unlock. Validate keyring witness authorization. Never include row bodies or filesystem paths.

- [ ] **Step 4: Implement watchdog composition and health order**

Load config/public artifacts/witness key, run the read-only snapshot verifier, append+fsync a record, then write the exact typed component health result. On DB/keyring/journal/signing/fsync failure, emit a non-PASS closed result when a safe health connection remains; otherwise exit nonzero with safe diagnostics. The process never receives a row private key.

- [ ] **Step 5: Prove journal privacy and watchdog denials**

Assert the JSONL field allowlist, no action payload/content/template/frame/user id/private byte/root, watchdog action INSERT denial, no FIX-10 outbox write, and no direct action gateway import from the watchdog graph.

Run:

```bash
pnpm vitest run tests/unit/fix09-watchdog-journal.test.ts tests/integration/fix09-watchdog.test.ts tests/architecture/fix09-chain-privacy.test.ts
```

- [ ] **Step 6: Commit the witness slice**

Suggested subject: `feat(obs): add signed watchdog witness journal`.

---

### Task 9: Add dormant launchd/configuration artifacts and operator-safe documentation

**Files:**
- Create: `tools/obs-listener/launchd/com.debateai.fixagent-daemon.plist`
- Create: `tools/obs-listener/launchd/com.debateai.fixagent-watchdog.plist`
- Create or modify: `tools/obs-listener/README.md`
- Create: `tests/architecture/fix09-launchd.test.ts`

- [ ] **Step 1: Write plist/config RED tests**

Assert two distinct valid plists, KeepAlive, separate program arguments/labels/log targets, required symbolic environment inputs, no embedded root/default secret, no private-key crossover, and watchdog use of its witness path only. Tests parse plist data; they never load a job.

- [ ] **Step 2: Add dormant artifacts**

Create the two plist templates with placeholders for V-later uid/group, `OBS_CONTROL_DIR`, database DSNs/role credentials, writer identities, and activation mode. Do not fill a host path or operational identity. README lists prerequisites, fail-closed states, local-only test commands, and V-only ceremony/acceptance boundaries; it is not an activation runbook executable by the implementation agent.

- [ ] **Step 3: Prove launchd is untouched**

Record `launchctl print` only if an existing non-privileged repository convention requires it; otherwise use static plist validation. Do not load, unload, bootstrap, bootout, kickstart, or signal any job.

Run:

```bash
pnpm vitest run tests/architecture/fix09-launchd.test.ts
```

- [ ] **Step 4: Commit the dormant deployment slice**

Suggested subject: `docs(obs): add dormant audit-chain service templates`.

---

### Task 10: Final local verification and handoff

**Files:**
- Modify only files already authorized above if verification finds a defect
- Write: the required normal implementation/review reports outside the product commit when directed by the lane

- [ ] **Step 1: Inspect scope before tests**

Run:

```bash
git status --short
git diff --check
git diff --stat "$C35_BASELINE"...HEAD
git diff --name-status "$C35_BASELINE"...HEAD
```

Require only authorized paths, preserved unrelated dirt, no frozen authority change, and no private/control-root artifact.

- [ ] **Step 2: Run focused C3.5/C4 tests three fresh times**

Run the complete `fix09-chain-*` and `fix09-watchdog-*` unit/integration/architecture list from Tasks 1-9 three separate times. Record command, exit status, test/pass counts, duration, and PostgreSQL version for each run. No cached result is evidence.

- [ ] **Step 3: Run adjacent and repository gates**

Run:

```bash
pnpm vitest run tests/unit/fix09-bundle.test.ts tests/unit/fix09-fold.test.ts tests/unit/fix09-tier-gate.test.ts tests/integration/fix09-daemon.test.ts tests/architecture/fix09-no-model.test.ts
pnpm typecheck
pnpm run audit:architecture
pnpm run audit:source
pnpm run audit:text-bytes
```

Also run the current obs-capture direct/spool/detail integration set and migration suite. Record any unrelated pre-existing failure separately; do not relabel it PASS.

- [ ] **Step 4: Run explicit forbidden-surface searches**

Search changed production files for raw occurrence/action INSERTs, HMAC/symmetric chain verification, private bytes in SQL/logs, installer-graph imports, model imports, `identity.*`, raw `core.run`, deletion/truncation, an absolute control root, watchdog action/outbox writes, and direct filesystem topology outside SPEC-v4. Require zero unauthorized matches.

- [ ] **Step 5: Recompute freezes and collision state**

Recompute every C1 raw/canonical hash, prove v4 authority files unchanged from the implementation baseline, repeat the `0064` all-ref/worktree/untracked collision audit, and prove exactly one implementation migration owns the claim.

- [ ] **Step 6: Request fresh independent review**

Provide the reviewer SPEC-v4, PLAN-v4, exact commit range, migration/ACL output, protocol vectors, writer scan, test logs, key/privacy scan, and forbidden-action statement. Require explicit SPEC verdict and code-quality verdict with P0-P3 findings. Resolve feedback under review discipline and rerun evidence.

- [ ] **Step 7: Prepare the handoff without production acts**

Report commit SHAs, migration claim, writer conversions, schema/protocol/key lifecycle, test counts, reviewer verdict, open V-later provisioning inputs, and explicit pending operations: real keys, root, migration application, quiesce, activation, launchd start, acceptance, merge, and push. Do not claim Done; ask V for the next separately authorized act.
