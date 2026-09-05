# FIX-10 Materialized Gateway and Pinned-Signer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Do not dispatch subagents for this lane. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the reviewed FIX-10 v5 corrections so every outbox action reaches the shared gateway as a deeply frozen materialized JSON object and activation is gated by the exact six live processes that have pinned the authorized private keys they will use.

**Architecture:** `SPEC-v5.md` incorporates v2-v4 and changes two seams only. `databaseActionFromOutbox` returns a null-prototype frozen `ChainedAgentActionInput`, while canonical bytes remain comparison evidence. A V-coordinated inherited-descriptor barrier starts each real signer process in a sealed non-writing hold, has it load and attest its own key once, keeps that exact signer pinned across DB-first activation publication, and releases it only after durable parity.

**Tech Stack:** Node.js 22, TypeScript 7, pnpm 11, Vitest 4, PostgreSQL 18 fixture, reviewed `@debateai/obs-capture/chain`, `node:crypto` Ed25519/SHA-256, RFC 8785, POSIX descriptor/no-follow/fsync/process primitives.

**Spec:** `docs/missions/observability-agents/slices/FIX-10/SPEC-v5.md`

## Global Constraints

- `SPEC.md`, `PLAN.md`, `SPEC-v2.md`, `PLAN-v2.md`, `SPEC-v3.md`, `PLAN-v3.md`, `SPEC-v4.md`, `PLAN-v4.md`, and their existing decision rows are immutable.
- This plan incorporates every PLAN-v3/v4 task and test unless an exact v5 interface or step replaces it.
- No implementation source or test edit begins before Task 0 consumes a future exact independently PASSed `FIX09_C35_REVIEWED_REF` and a fresh independently zero-finding v5 authority review.
- Production roots, uid/gid values, groups, memberships, identities, descriptor numbers, process launch arguments, timing values, credentials, nonces, sessions, keys, canaries, and activation values are required V-later inputs with no defaults.
- No product source, existing FIX-07 source, migration, role, grant, raw action DML, model/provider, new persistent leaf, second root, signer broker, public bin, live root/database/process/service, quiescence, activation, acceptance, merge, push, board act, or Done claim is authorized.
- Tests use explicit temporary roots, runtime-generated ephemeral keys, inherited descriptor pairs, controlled child processes, disposable principal fixtures, and disposable PostgreSQL only. They persist no private input.
- Every gate is capture-first: record exact cwd/argv/environment/tool versions/start/end/raw stdout/raw stderr/exit before assertion; use exclusive non-reused evidence paths; prove exact files/names/counts, zero skip/todo, and three fresh GREEN runs.
- Any source, import graph, dependency, gateway type, reporter name/count, migration/ACL blob, authority ref, or frozen hash drift is STOP.

## Immutable evidence anchors

| Contract | Immutable source |
|---|---|
| gateway JSONB field and action idempotency | FIX-09 `SPEC-v4.md` §§5-6 and §14 |
| descriptor-only materialized gateway boundary | FIX-09 `SPEC-v5.md` §9 |
| activation order, DB-first partial state, private read-once | FIX-09 `SPEC-v4.md` §§10-12 |
| five row keys plus activation-pinned witness authority | FIX-09 `SPEC-v6.md` §2 and preservation through v9 |
| stable descriptor metadata/race precedent | FIX-09 `SPEC-v9.md` §§1-3 |
| exact six-slot inventory and all v4 closed properties | FIX-10 `SPEC-v4.md` §§2-9 |
| round-3 counterexamples | `fix10-control-authority-sol-review-round3.md`, canonical SHA-256 `b6b7d60dd381844b00d04bf468259cf07851f09d3b01d95c974cc063d8486656` |

## File structure

V4's complete file map remains. These existing authorized units own the v5 delta:

| File | Responsibility |
|---|---|
| `tools/obs-listener/src/obsctl/action-wire.ts` | exact null-prototype deep materializer and pure `databaseActionFromOutbox` |
| `tools/obs-listener/src/obsctl/reconcile.ts` | passes materialized input directly; commit-unknown replay from completed outbox |
| `tools/obs-listener/src/obsctl/signer-readiness.ts` | real-process private-key stable load, live barrier transcript, pinned signer, abort/release |
| `tools/obs-listener/src/obsctl/signer-inventory.ts` | exact five-row-plus-activation-witness authorization and session-set verification |
| `tools/obs-listener/src/obsctl/chain-bootstrap.ts` | V coordinator ordering, precommit abort, DB-first pending recovery, ordered release |
| `tools/obs-listener/src/obsctl/lifecycle-executor.ts` | composes bootstrap adapter without local-history or runtime write authority |
| `tests/unit/fix10-local-history.test.ts` | object shape/freeze/canonical-evidence mutants |
| `tests/integration/fix10-reconcile.test.ts` | real gateway JSONB readback and restart idempotency |
| `tests/integration/fix10-signer-readiness.test.ts` | six-slot byte-race/session/restart matrix |

No new public package entry exists. `tools/obs-listener/package.json` retains only `obsctl`; the barrier is internal and is reached through the reviewed signer/configuration composition.

## Exact successor capture manifest

The v5 manifest contains exactly 336 reporter assertions across the same 15 files as v4:

| File | Count |
|---|---:|
| `tests/unit/fix10-authority-gate.test.ts` | 8 |
| `tests/unit/fix10-capture-gate.test.ts` | 8 |
| `tests/unit/fix10-control-root.test.ts` | 12 |
| `tests/integration/fix10-principal-boundary.test.ts` | 8 |
| `tests/unit/fix10-authority-crypto.test.ts` | 15 |
| `tests/unit/fix10-proof-gap-window.test.ts` | 28 |
| `tests/unit/fix10-local-history.test.ts` | 21 |
| `tests/integration/fix10-chain-lifecycle.test.ts` | 40 |
| `tests/integration/fix10-signer-readiness.test.ts` | 122 |
| `tests/integration/fix10-commands.test.ts` | 12 |
| `tests/integration/fix10-status.test.ts` | 14 |
| `tests/integration/fix10-reconcile.test.ts` | 20 |
| `tests/integration/fix10-daemon-control.test.ts` | 8 |
| `tests/architecture/fix10-boundaries.test.ts` | 16 |
| `tests/integration/fix10-product-invariance.test.ts` | 4 |

The v4 300 names remain byte-exact. Append `accepts_exact_v5_authority_review` to the authority gate.

Append these five local-history names in order:

~~~text
payload_materializes_as_null_prototype_object
payload_tree_is_deeply_frozen
canonical_payload_bytes_are_evidence_only
rejects_buffer_action_payload_mutant
rejects_string_action_payload_mutant
~~~

Append these four reconciliation names in order:

~~~text
real_gateway_reads_back_action_payload_as_jsonb_object
real_gateway_commit_unknown_restart_preserves_materialized_semantics
real_gateway_replay_returns_original_action_id
real_gateway_replay_does_not_advance_chain
~~~

Append 18 signer names in exact slot-major order. Slots are `[api_occurrence,runner_occurrence,scheduler_occurrence,daemon_action,obsctl_action,watchdog_witness]`; for each slot append:

~~~text
rejects_<slot>_same_inode_same_size_replacement_before_open
rejects_<slot>_same_inode_same_size_replacement_during_read
rejects_<slot>_same_inode_same_size_replacement_after_attestation_before_activation
~~~

Then append these eight global signer names:

~~~text
rejects_preactivation_session_disconnect_before_commit
rejects_preactivation_process_crash_before_commit
rejects_stale_barrier_nonce
rejects_replayed_barrier_nonce
postcommit_session_disconnect_keeps_db_committed_file_pending_without_release
accepts_postactivation_restart_with_same_authorized_key
rejects_postactivation_restart_with_replaced_key
releases_exact_six_pinned_processes_only_after_durable_activation
~~~

Arithmetic is exact: `300 + 1 + 5 + 4 + 26 = 336`.

---

### Task 0: Admit exact reviewed FIX-09 and FIX-10 authority

**Files:**

- Modify: `tests/unit/fix10-authority-gate.test.ts`
- Modify: `tests/unit/fixtures/fix10-gate-manifest.json`
- Create outside product tree: `../.superpowers/sdd/PLAN-FixAgent/fix10-implementation-admission.report`

**Interfaces:**

- Consumes: future full `FIX09_C35_REVIEWED_REF`, independent result, migration/export/ACL/gateway/signer/configuration receipts, exact v5 commit/tree/report.
- Produces: `parseFix10Admission(bytes, expected): Fix10Admission` with immutable gateway and signer-barrier capability facts.

- [ ] **Step 1: Prove the present hard stop**

Run `test -n "$FIX09_C35_REVIEWED_REF"` in the admitted implementation worktree. The current expected result is nonzero. Run no later task while it is nonzero.

- [ ] **Step 2: Add the v5 authority RED case**

Require one independent report bound to the exact v5 ref/tree/diff with exact standalone `AUTHORITY FIDELITY VERDICT: PASS`, `SPEC VERDICT: SPEC PASS`, `PLAN VERDICT: PLAN PASS`, `UNRESOLVED: P0=0 P1=0 P2=0 P3=0`, and `FIX-10 IMPLEMENTATION AUTHORIZED: NO`. Mutate identity, path scope, ref, tree, diff, verdict, counts, or reviewer independence and require a closed refusal.

- [ ] **Step 3: Bind the materialized gateway facts**

Read the reviewed type/export and real-fixture receipt. Require materialized null-prototype `action_payload` admission, descriptor snapshotting, real JSONB object storage, original-id action-ref replay, and no chain advance. A type name, fake gateway, or documentation-only claim is insufficient.

- [ ] **Step 4: Bind the pinned-signer composition facts**

Require one reviewed C3.5 seam that accepts an already-loaded `AuditChainSigner` in each of the five row-writer processes without reopening the pathname, and the activation-pinned witness startup seam. Require all six actual entry processes to support a no-DB/no-listener/no-timer/no-journal `PREACTIVATION_HOLD`. Missing composition is exact `FIX10_C35_SIGNER_BARRIER_UNAVAILABLE` and stops before source/test edits.

- [ ] **Step 5: Capture RED, implement only the admission parser delta, and capture GREEN three times**

Run `pnpm exec vitest run --reporter=json tests/unit/fix10-authority-gate.test.ts` through the existing capture runner. Require one file, eight exact names, eight passed, zero failed/skipped/todo on each GREEN run.

- [ ] **Step 6: Commit Task 0 only after every external receipt exists**

Stage only the authority test/fixture and previously authorized parser path. Commit `test(obs): bind FIX-10 v5 admission`. The normal report remains ignored.

### Task 1: Materialize and deep-freeze the gateway object

**Files:**

- Modify: `tools/obs-listener/src/obsctl/action-wire.ts`
- Modify: `tests/unit/fix10-local-history.test.ts`

**Interfaces:**

- Produces: `materializeDatabaseActionPayload(record: CompletedOutboxV3): Readonly<Record<string, unknown>>` and `databaseActionFromOutbox(record: CompletedOutboxV3): Readonly<ChainedAgentActionInput>`.
- Invariant: both objects and nested parameters have null prototype, exact own data descriptors, deep freeze, and only verified outbox primitive/null leaves.

- [ ] **Step 1: Write the five exact RED assertions**

Assert exact top/nested key order and descriptor sets, null prototypes, recursive `Object.isFrozen`, constant-null local outcome, and that `J(...)` is produced only by an explicit evidence helper. Pass buffer and UTF-8 string mutants and require typed rejection before any gateway spy call.

- [ ] **Step 2: Capture RED**

Run `tests/unit/fix10-local-history.test.ts` alone with JSON reporter. Require all 21 exact names collected and at least one new assertion failing at the v4 bytes-valued implementation seam.

- [ ] **Step 3: Implement the schema-specific materializer**

Allocate with `Object.create(null)`, install only the SPEC-v5 ordered own data properties, freeze child then parent, and assert the final descriptors. Do not accept a caller-supplied payload, local result, serializer output, clock, marker, journal, or database value.

- [ ] **Step 4: Separate canonical evidence**

Expose `canonicalDatabaseActionEvidence(input): Uint8Array` only to signing/comparison tests and evidence code. Production reconciliation receives the object from `databaseActionFromOutbox` and never calls the evidence function to produce its gateway argument.

- [ ] **Step 5: Kill representation and drift mutants**

Kill ordinary-object, shallow-freeze, mutable nested member, extra key, omitted key, accessor, `Buffer`, UTF-8 string, reparsed JSON, local-outcome, marker, current-time, retry-result, and database-state mutants by named assertions.

- [ ] **Step 6: Capture three GREEN runs and commit**

Require 21/21 each run, no skipped/todo, typecheck success, and no raw action DML. Commit `feat(obs): materialize FIX-10 gateway actions`.

### Task 2: Prove the real reviewed-gateway replay

**Files:**

- Modify: `tools/obs-listener/src/obsctl/reconcile.ts`
- Modify: `tests/integration/fix10-reconcile.test.ts`

**Interfaces:**

- Consumes: verified completed `O`, materialized `D(O)`, reviewed `appendChainedAgentAction`, caller-owned transaction, disposable PostgreSQL fixture.
- Produces: one reconciled database id/receipt or one pending closed local result; it never mutates the database input.

- [ ] **Step 1: Write the four real-gateway RED tests**

Use the receipt-bound production gateway, not a fake. Commit one STATUS action then hide the commit result, append the local unreachable result, destroy in-memory state, restart from raw signed outbox bytes, and replay. Assert JSONB object/nested-object/null readback, original id, one row, and unchanged action-partition head/sequence.

- [ ] **Step 2: Capture RED**

Run `tests/integration/fix10-reconcile.test.ts` against disposable PostgreSQL. Require all 20 names collected and failures caused by v4's buffer-valued payload or absent real-gateway assertions.

- [ ] **Step 3: Pass the object directly**

Materialize once before `BEGIN`, pass that exact object to `appendChainedAgentAction`, commit, then append receipt. On restart rematerialize only from the same completed outbox bytes. Never serialize/reparse between materializer and gateway.

- [ ] **Step 4: Assert binding readback and replay order**

Query `jsonb_typeof` for both object levels and exact JSONB equality. Capture advisory/idempotency/partition operations and prove replay returns before a new chain allocation. Compare full materialized descriptor trees plus `J` bytes across attempts.

- [ ] **Step 5: Kill buffer/string and commit-unknown mutants**

The buffer/string forms must fail before SQL. Mutants that change id/ref/payload, allocate before idempotency lookup, return a new id, advance the head, or use local result state must fail a non-timeout assertion.

- [ ] **Step 6: Capture three GREEN runs and commit**

Require 20/20 each run plus package typecheck. Commit `feat(obs): replay materialized actions through reviewed gateway`.

### Task 3: Replace detached attestations with live pinned signer sessions

**Files:**

- Modify: `tools/obs-listener/src/obsctl/signer-readiness.ts`
- Modify: `tools/obs-listener/src/obsctl/signer-inventory.ts`
- Modify: `tests/integration/fix10-signer-readiness.test.ts`
- Modify: `tests/fixtures/fix10-principal-probe.mjs`

**Interfaces:**

- Produces: `enterSignerBarrier(request, secureRoot, barrierFd, signerAdapter): Promise<PinnedSignerSession>`, where `PinnedSignerSession` exposes only `attestation`, `commitCheck(challenge)`, `release(releaseRecord)`, and `abort()`.
- `release` returns the same pinned signer object to the reviewed writer seam; no private bytes or second load cross the boundary.

- [ ] **Step 1: Write the 18 slot-major byte-race RED cases**

For each exact slot, generate distinct same-length Ed25519 PKCS#8 A/B values. Replace A with B in place before open, synchronously during the descriptor read, and after readiness but before final commit check. Require the exact named refusal and zero activation insert/commit/final publication.

- [ ] **Step 2: Write the eight global session RED cases**

Drive precommit EOF, child crash, stale nonce, replayed nonce, postcommit disconnect, valid restart, replaced-key restart, and exact ordered release. Record PID/session/nonce/transcript and every DB/file/write-enable event.

- [ ] **Step 3: Capture RED under real distinct-principal fixture mode**

Require 122 exact names collected. If disposable uid separation is unavailable, the production-principal gate reports a closed environment refusal; same-principal substitution cannot pass it.

- [ ] **Step 4: Implement stable one-read owner loading**

Capture/open root and private descriptors with no-follow, read the private descriptor once, compare the exact `{dev,ino,uid,gid,mode,nlink,size,mtime_ns,ctime_ns}` vector before/after/readiness, parse one Ed25519 PKCS#8 with no trailing byte, derive SPKI/id, install the signer, zero transient DER, and retain the descriptor plus signer until release/abort.

- [ ] **Step 5: Implement the exact v2 attestation/session transcript**

Bind fresh 32-byte nonce, barrier/session UUIDs, V-launched PID, activation/keyring/inventory digests, slot/principal/path, full metadata, exact row-or-witness authorization, time, and key id. Sign under the pinned key and keep the process in no-write `PREACTIVATION_HOLD` while monitoring descriptor liveness.

- [ ] **Step 6: Implement commit check and same-object release**

On the one fresh 32-byte commit challenge, return the exact signed SPEC-v5 commit-check object after repeating path/descriptor metadata without rereading key bytes. `release` validates the exact session-bound record, completed DB/file activation parity, digest values, and ordinal, then returns the identical signer object to the receipt-bound C3.5 seam. Abort closes the session, zeroizes/releases key state, and enables no writer capability.

- [ ] **Step 7: Kill load/session mutants**

Kill pathname reread, second `KeyObject`, omitted ctime/mtime, same-size mutation, stale/reused nonce, copied attestation on a new fd/PID, ignored EOF, premature DB/listener/timer/journal start, signer transfer, and release-before-parity mutants.

- [ ] **Step 8: Capture three GREEN runs and commit**

Require 122/122 each run, private-material absence scans, exact process cleanup, and typecheck. Commit `feat(obs): pin activation signers in live sessions`.

### Task 4: Gate DB-first activation and release on the live barrier

**Files:**

- Modify: `tools/obs-listener/src/obsctl/chain-bootstrap.ts`
- Modify: `tools/obs-listener/src/obsctl/lifecycle-executor.ts`
- Modify: `tests/integration/fix10-chain-lifecycle.test.ts`
- Modify: `tests/integration/fix10-signer-readiness.test.ts`

**Interfaces:**

- Consumes: staged public authority, exact inventory, six `PinnedSignerSession` values, quiescence/no-open-transaction proof, reviewed admin adapter.
- Produces: precommit all-or-zero abort; or DB-committed/file-pending with no release; or durable parity followed by ordered release.

- [ ] **Step 1: Add event-order RED assertions to existing lifecycle cases**

Capture staging, quiescence, launch, nonce, attestations, commit checks, activation insert, commit, final rename, file fsync/reopen, product release, daemon/obsctl release, watchdog release, and first write. Require exact order and exact session/signer identity at first write.

- [ ] **Step 2: Capture RED**

Run lifecycle/readiness tests and prove the v4 bootstrap can still reach activation after a detached/stat-only proof.

- [ ] **Step 3: Implement the precommit barrier**

Keep the activation transaction and table locks while all six sessions attest. Immediately before insert, collect commit checks and V lstat comparisons. Any missing/changed/dead session rolls back and aborts all sessions with zero commit/publication.

- [ ] **Step 4: Preserve DB-first partial truth**

After commit, do not claim rollback. A crash/disconnect before durable publication returns `CHAIN_BOOTSTRAP_DB_COMMITTED_FILE_PENDING`, releases nobody, and keeps all write paths disabled. Recovery creates a fresh nonce/session set, checks the same committed activation and exact key ids, and publishes only byte-identical staged authority.

- [ ] **Step 5: Implement ordered release and cold restart**

After file rename/fsync/reopen and DB/file parity, release API/runner/scheduler, then daemon/obsctl, then watchdog. Each process checks public parity and its pinned id. A later process restart performs normal path-based FIX-09 validation and cannot reuse the barrier attestation.

- [ ] **Step 6: Kill activation mutants**

Kill insert before six commit checks, session-liveness omission, release after DB commit but before file fsync, release of a replacement process, signer reload, false postcommit rollback, witness authority read from row keyring, recovery with a changed activation/key id, and restart that trusts the old attestation.

- [ ] **Step 7: Capture three GREEN runs and commit**

Require lifecycle 40/40 and readiness 122/122 each run. Commit `feat(obs): bind activation to pinned signer sessions`.

### Task 5: Compose all inherited v4 work, capture evidence, and stop

**Files:**

- Modify only the v3/v4-authorized source/test/package/config/lock paths needed to compile the admitted implementation
- Modify: `tests/unit/fixtures/fix10-gate-manifest.json`
- Create outside product tree: immutable non-live evidence manifest and implementation report

**Interfaces:**

- Consumes: Tasks 0-4 and every inherited PLAN-v3/v4 task.
- Produces: exact 336-assertion evidence, dependency/import/private-material/migration/Git facts, and an independent-review candidate ref.

- [ ] **Step 1: Complete all inherited v3/v4 tasks not superseded here**

Preserve the exact single-root topology; privilege separation; KILL/ARM/status truth; source-complete W/Q proof; daemon proof seam; local lifecycle intent/result; deferred/shared-gateway reconciliation; key lifecycle; rollback; and every prior mutant.

- [ ] **Step 2: Capture three complete focused runs**

Run the 15 manifest files in manifest order with Vitest JSON. Each fresh process must report exactly 15 files, 336 tests, 336 passed, zero failed/skipped/todo, with exact full-name order.

- [ ] **Step 3: Run hostile capture controls**

Require no-match, zero-test, wrong file/name/count/order/status, duplicate id, pre-existing evidence path, forged summary, truncated stream, and nonzero-child controls to fail closed.

- [ ] **Step 4: Run package/import/schema/frozen hygiene gates**

Require package typecheck; one public `obsctl` bin; no product/model/provider import; no DB edge in kill/arm; no raw action DML; no migration/role/grant/persistent-path addition; exact five row plus activation-witness authority; no private material in repository/evidence; and byte-exact FIX-07/FIX-09/FIX-10 frozen inputs.

- [ ] **Step 5: Run every v2-v5 mutant**

Every object-representation, replay, signer-byte-race, session, activation-order, proof-window, state, privilege, lifecycle, filesystem, crypto, and capture mutant must die by a named non-timeout assertion. Restore exact bytes after each mutant and re-hash the manifest.

- [ ] **Step 6: Obtain fresh independent implementation review**

Require exact ref/tree/diff/evidence binding, `SPEC PASS`, `CODE QUALITY PASS`, `P0=0 P1=0 P2=0 P3=0`, and `FIX-10 C0 RESULT: PASS`. Self-review is invalid.

- [ ] **Step 7: Stop before C4 and all V-only acts**

Hand the reviewed C0 receipt to FIX-09. Do not claim C4 unblocked until the exact compatibility and V bootstrap receipts pass. Do not provision, launch real processes, quiesce, apply a migration, activate, rotate/recover, install services, run production commands/acceptance, merge, push, update a board, or declare Done.

## Trace matrix

| V5 contract | Plan evidence |
|---|---|
| materialized null-prototype deep-frozen `action_payload` | Task 1, five exact tests plus representation/drift mutants |
| RFC 8785 bytes are evidence only | Task 1, buffer/string/reparse mutants |
| real JSONB object and commit-unknown replay | Task 2, four real-gateway tests and chain-head trace |
| exact six current private keys pinned in actual processes | Task 3, 122-test readiness file and PID/session/signer identity |
| same-inode/same-size mutation closed | Task 3, 18 slot-major race tests |
| precommit all-or-zero, truthful postcommit partial | Task 4, event trace and disconnect/crash faults |
| release only after durable parity; restart revalidates | Tasks 3-4, exact release/restart cases |
| all v4 properties preserved | Task 5, inherited 300 tests/mutants |
| no topology/schema/privilege/product expansion | Tasks 0 and 5 architecture/Git gates |
| implementation and production remain stopped | Task 0 initial refusal and Task 5 final handoff |

## V-later boundary

Only V may later supply production root/device/principals/groups/memberships/writer identities/timing/descriptors/launcher/credentials/nonces/sessions/keys/activation values; stage keys and public authority; launch the six held processes; quiesce; apply the reviewed migration; commit/publish activation; release/restart writers; install services; run acceptance; accept/veto; merge; or push. No documentation or local green evidence transfers those acts.
