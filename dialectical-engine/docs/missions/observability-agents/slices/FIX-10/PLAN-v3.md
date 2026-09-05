# FIX-10 Privilege-Separated Control and Lifecycle C0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. No implementation is authorized until Task 0 admission passes.

**Goal:** Implement the reviewed FIX-10 v3 single-root control plane, truthful status, replayable signed actions, daemon proof seam, and V-only FIX-09 lifecycle command surfaces without a new migration or product-source change.

**Architecture:** Four distinct symbolic OS principals enforce marker, proof, local-history, and watchdog boundaries. Kill and arm remain database-free; status alone dynamically loads the reviewed FIX-09 action gateway and replays signed KILL/ARM/STATUS intents. V-only lifecycle commands validate and publish reviewed FIX-09 public/private artifacts through injected descriptors, while all production acts remain outside implementation.

**Tech Stack:** Node 22, TypeScript 7, pnpm 11, Vitest 4, node:crypto Ed25519/HMAC/SHA-256, pg 8.22.0, reviewed @debateai/obs-capture/chain.

**Spec:** docs/missions/observability-agents/slices/FIX-10/SPEC-v3.md

## Global Constraints

- SPEC.md, SPEC-v2.md, PLAN.md, PLAN-v2.md, prior decision rows, and FIX-09 authority bytes are frozen.
- FIX09_C35_REVIEWED_REF and its independent zero-finding receipt are hard inputs; no step below may begin before Task 0 passes.
- Production OBS_CONTROL_DIR, principal ids/groups, staleness values, credentials, private keys, activation values, and canary policy have no defaults.
- No app/product source, migration, database role/grant, model/provider path, watchdog writer, board path, live root, or production service is changed.
- Kill and arm import graphs contain no pg, DB URL, row key, action gateway, lifecycle, or watchdog writer.
- Status action writes use only reviewed appendChainedAgentAction as source=ops and writer_identity=obsctl with the existing debateai_obs_listener role.
- Tests use distinct fake principals, explicit temp paths and values, runtime-generated ephemeral keys, captured descriptors, and non-live adapters.
- Every gate captures raw argv/cwd/stdout/stderr/exit before assertion; exact files/names/counts must be positive with zero skip/todo.
- Implementation remains STOP throughout this documentation packet.

## Immutable evidence anchors

| Contract | Immutable source |
|---|---|
| FIX-07 switch undefined/ENOENT/error truth | reviewed control.ts blob 2d2128597639052796ea0d44efd5e8259c79f2bc |
| FIX-07 root parsing | reviewed config.ts blob 52cf174e78218975a3beb292af6b868ad9745323 |
| FIX-07 runtime state values and health publication | reviewed runtime/index.ts blob f76b3b727a134031965d734c0c5a253fb3f64265 |
| first-party gaps close at flush | reviewed health.ts blob 886a54ed74a999fbd0704c26d68d744e795a45c8 |
| capture_gap/component_health columns and listener reads | migration 0034 blob ace8fa889f24a3d23b79cbaa78878a2238d07b76 |
| chain/keyring/activation/gateway base | FIX-09 SPEC-v4 SHA-256 3895c0feb8b4c5c0644b619f4b775f826db3600485af9917b1052358679bfc68 |
| deployed permissions/recovery refinements | FIX-09 SPEC-v5 SHA-256 881bf40c519ecb925151684ea2bb39d68cc1e2e5b0587d9b433c8da49e518c6d |
| C0 lifecycle admission requirement | FIX-09 PLAN-v5 SHA-256 8dfa8175f64a825e43c6cff89b21bf33474235382954f5be7be56ec6851780cc |
| current FIX-09 blocker | final Sol report SHA-256 19311eba2ff4431dbe1f6127469f57dfb6b8e46722d1fb59e80c80d3bba36a1a |
| seven FIX-10 corrections | Sol report SHA-256 13f5fa0ac2350bce142cdceaa6ea5353ac884d1ad0782bbb416160daadaca4e4 |

## File map

| Unit | Responsibility |
|---|---|
| src/control/types.ts | closed shared types only |
| src/control/fix07-switch-mirror.ts | exact reviewed FIX-07 capture-switch truth |
| src/control/reader.ts | read-only root/marker/public-journal snapshots |
| src/obsctl/control-root.ts | secure root/leaf opens and atomic/fsync primitives |
| src/obsctl/armed-token.ts | HMAC token mint/verify |
| src/obsctl/authority-proof.ts | v2 proof parse/verify and loss/runtime predicates |
| src/obsctl/local-history.ts | action-ref, outbox, V-journal signing/validation |
| src/obsctl/kill.ts and arm.ts | ordered database-free commands |
| src/obsctl/status.ts | local status state/wire and adapter orchestration |
| src/obsctl/reconcile.ts | shared-gateway-only pending action replay |
| src/obsctl/status-entry.ts | production status DB composition |
| src/obsctl/chain-*.ts | V-only keyring/activation/rotation/recovery commands |
| src/obsctl/lifecycle-entry.ts | lifecycle-only V/admin composition |
| src/obsctl/cli.ts and bin/obsctl.mjs | strict dispatch and compiled entry |
| src/daemon/authority-proof.ts and main.ts | KILL polls and proof publication |

## Closed test corpus

The capture manifest contains these exact file/count pairs and expanded names in declaration order:

| File | Required assertion names | Count |
|---|---|---:|
| tests/unit/fix10-authority-gate.test.ts | rejects_current_fix09_rework; rejects_missing_ref; rejects_ref_mismatch; rejects_duplicate_verdict; rejects_nonzero_finding; accepts_exact_future_receipt | 6 |
| tests/unit/fix10-capture-gate.test.ts | rejects_no_match; rejects_zero_tests; rejects_wrong_file; rejects_wrong_name; rejects_wrong_count; rejects_skip_todo; rejects_wrong_exit; captures_before_asserting | 8 |
| tests/unit/fix10-control-root.test.ts | opens_exact_symbolic_matrix; daemon_cannot_mutate_markers; daemon_cannot_read_v_keys; daemon_cannot_append_v_history; obsctl_cannot_read_daemon_key; obsctl_cannot_append_watchdog; obsctl_reads_watchdog_public_bytes; watchdog_cannot_read_obsctl_leaf; rejects_symlink_hardlink_device; rejects_writable_ancestor; atomic_replace_fsync_order; marker_fsync_order | 12 |
| tests/integration/fix10-principal-boundary.test.ts | fixture_principals_are_distinct; daemon_marker_write_denied; daemon_v_key_reads_denied; daemon_v_journal_append_denied; obsctl_daemon_key_read_denied; obsctl_watchdog_append_denied; obsctl_watchdog_read_allowed; watchdog_obsctl_leaf_denied | 8 |
| tests/unit/fix10-authority-crypto.test.ts | armed_hmac_exact; armed_freshness_exact; proof_signature_exact; proof_requires_armed_state_each_runtime; proof_rejects_fresh_invalid_state; proof_requires_distinct_runtime_canaries; proof_rejects_recent_closed_gap; proof_rejects_open_old_gap; proof_requires_fresh_watchdog; proof_rejects_canary_bypass_api; proof_rejects_canary_bypass_runner; proof_rejects_canary_bypass_scheduler; key_id_is_spki_der_sha256; key_id_rejects_wrong_encodings; proof_refuses_future_time | 15 |
| tests/unit/fix10-local-history.test.ts | action_ref_exact; outbox_status_intent_supported; outbox_genesis_uses_derived_id; journal_genesis_uses_derived_id; domains_are_distinct; partial_tail_is_permanent_invalid; replay_pending_definition_exact; semantic_collision_rejected; receipt_matches_four_fields; no_history_repair | 10 |
| tests/integration/fix10-chain-lifecycle.test.ts | keyring_generation_one; keyring_continuity; activation_snapshot_is_unsigned; bootstrap_db_then_file; bootstrap_recovers_commit_before_file; bootstrap_rejects_mismatch; row_rotation_keyring_then_key; witness_rotation_keyring_then_key; loss_uses_rotation; compromise_requires_checkpoint; recovery_rejects_bad_ranges; journal_loss_requires_new_authority | 12 |
| tests/integration/fix10-commands.test.ts | kill_success_order; kill_capture_only; kill_daemon_only; kill_not_applied; kill_durability_unknown; kill_audit_degraded; kill_final_journal_failure; kill_retry_completes; arm_auth_precedes_intent; arm_success_order; arm_rolls_back_capture_first; arm_reports_incomplete_rollback | 12 |
| tests/integration/fix10-status.test.ts | status_fix07_missing_marker_on; status_fix07_invalid_root_on; status_fix07_read_error_off; status_arming_capture_on; status_killed_partial_capture_on; status_orders_runtime_vector; status_reports_runtime_ages; status_reports_watchdog_age; status_local_invalid; status_db_unreachable; status_db_rejected; status_reconciled | 12 |
| tests/integration/fix10-reconcile.test.ts | uses_ops_obsctl; uses_unique_action_ref; current_user_exact; orders_pending_sequence; commits_before_receipt; commit_before_receipt_replays; receipt_failure_replays; replay_returns_same_id; no_raw_action_dml; status_entry_reaches_gateway | 10 |
| tests/integration/fix10-daemon-control.test.ts | kill_before_db_connect; kill_before_intake; kill_between_work_units; kill_on_executor_timer; abort_before_optional_lease; daemon_reads_markers_only; proof_all_conjuncts; no_live_proof_before_watchdog | 8 |
| tests/architecture/fix10-boundaries.test.ts | only_allowed_sources; no_product_imports; no_model_provider; no_db_in_kill_arm; no_row_key_in_kill_arm; no_watchdog_writer; status_only_gateway; lifecycle_only_admin_db; no_production_defaults; package_bin_reaches_cli | 10 |
| tests/integration/fix10-product-invariance.test.ts | scheduler_exit_equal; scheduler_stderr_equal; api_status_equal; capture_reader_unchanged | 4 |

Total: exactly 127 assertions across 13 files.

---

### Task 0: Seal dependency and authority admission

**Files:**

- Create: tests/unit/fix10-authority-gate.test.ts
- Create outside product tree: ../.superpowers/sdd/PLAN-FixAgent/fix10-implementation-admission.report
- Do not create or modify any other file

**Interfaces:**

- Consumes: exact future FIX09_C35_REVIEWED_REF, its immutable report/receipt, FIX09_CHAIN_MIGRATION_PATH/BLOB and ACL catalog, reviewed chain package exports, v3 authority commit/review.
- Produces: parseFix10Admission(bytes, expectedRefs) returning a frozen admitted dependency map or a closed rejection code.

- [ ] **Step 1: Prove the present gate is closed**

~~~bash
test -n "$FIX09_C35_REVIEWED_REF"
~~~

Expected now: nonzero. Stop here in the current repository state.

- [ ] **Step 2: After a reviewed successor supplies the ref, write the six exact RED assertions**

The parser reads raw UTF-8 with LF only, rejects unknown/duplicate/missing fields and CR, requires full SHAs, matches the five FIX-09 review lines, validates the receipt-bound chain-migration/action-gateway/ACL blob ids, and validates the independent v3 authority review.

~~~ts
expect(parseFix10Admission(passBytes, expected)).toMatchObject({
  fix09C35ReviewedRef: expected.fix09C35ReviewedRef,
  c35Result: "PASS",
  fix10AuthorityResult: "PASS",
});
~~~

- [ ] **Step 3: Capture RED**

~~~bash
pnpm exec vitest run --reporter=json tests/unit/fix10-authority-gate.test.ts
~~~

Expected: one selected file, six failed assertions because the parser is absent, zero skipped/todo.

- [ ] **Step 4: Implement only the closed parser in the test-owned fixture module**

Do not import runtime or product code. Record exact report hashes, reviewed ref/tree, migration blob, package export blobs, ACL catalog hash, v3 authority commit/tree/report, and the implementation base.

- [ ] **Step 5: Capture three exact GREEN runs and publish the external admission report**

Each run must report exactly files=1 tests=6 failed=0 skipped=0 todo=0. The report is valid only after independent readback of every bound file.

- [ ] **Step 6: Commit only the authority test**

~~~bash
git add tests/unit/fix10-authority-gate.test.ts
git commit -m "test(obs): bind FIX-10 v3 admission"
~~~

### Task 1: Implement the capture-first evidence gate

**Files:**

- Create: tools/fix10-capture-gate.mjs
- Create: tests/unit/fix10-capture-gate.test.ts
- Create: tests/unit/fixtures/fix10-gate-manifest.v2.json

**Interfaces:**

- Consumes: the 12 file/count/name entries above and child-process argv arrays.
- Produces: runFix10Gate(gate, runId) and immutable evidence manifests.

- [ ] **Step 1: Write eight hostile reporter RED tests**

Each fixture remains syntactically valid JSON and changes one file, name, count, status, or exit fact. Include a sentinel proving raw streams and exit are stored before semantic assertion.

- [ ] **Step 2: Capture RED**

~~~bash
pnpm exec vitest run --reporter=json tests/unit/fix10-capture-gate.test.ts
~~~

Expected: one file, eight failures for the absent runner, zero skipped/todo.

- [ ] **Step 3: Implement the fix10-gate-manifest/v2 manifest and runner**

Use spawn argv arrays with shell false, mode-0700 non-reused evidence roots, exclusive artifact creation, raw stream hashes, tool versions, cwd, start/end instants, and real exit. Reject a pre-existing output, noncanonical manifest, unanchored summary, or corpus drift.

~~~text
FIX10_GATE_PASS gate=<closed gate> run=<1|2|3> files=<positive decimal> tests=<positive decimal> failed=0 skipped=0 todo=0
~~~

- [ ] **Step 4: Run three exact eight-test passes and commit**

~~~bash
pnpm exec vitest run --reporter=json tests/unit/fix10-capture-gate.test.ts
git add tools/fix10-capture-gate.mjs tests/unit/fix10-capture-gate.test.ts tests/unit/fixtures/fix10-gate-manifest.v2.json
git commit -m "test(obs): add FIX-10 v3 capture gates"
~~~

### Task 2: Enforce the root and real-principal boundary

**Files:**

- Create: tools/obs-listener/src/control/types.ts
- Create: tools/obs-listener/src/control/reader.ts
- Create: tools/obs-listener/src/control/fix07-switch-mirror.ts
- Create: tools/obs-listener/src/obsctl/config.ts
- Create: tools/obs-listener/src/obsctl/control-root.ts
- Create: tools/obs-listener/src/obsctl/lock.ts
- Test: tests/unit/fix10-control-root.test.ts
- Test: tests/integration/fix10-principal-boundary.test.ts
- Create test helper: tests/fixtures/fix10-principal-probe.mjs

**Interfaces:**

- Produces: openControlRoot, openPublicLeaf, readControlSnapshot, sampleFix07CaptureSwitch, createMarker, removeMarker, atomicReplace, appendDurable, acquireObsctlLock.

~~~ts
export function openControlRoot(input: ControlRootInput, io: CapturedFs): ControlRoot;
export async function sampleFix07CaptureSwitch(rawDir: string | undefined, io: Fix07Io): Promise<CaptureSwitchSample>;
export function createMarker(root: ControlRoot, name: "CAPTURE_OFF" | "KILL"): MarkerResult;
~~~

- [ ] **Step 1: Write 12 root RED tests plus eight real-principal RED tests**

Test the exact owner/group/mode table, descriptor/path race injection, and read-only watchdog publication. Compare the mirror truth table against reviewed FIX-07 config.ts/control.ts for undefined, ENOENT, success, and other errors. The integration file must run the inert helper under four distinct explicit ephemeral uid/gid identities supplied by a non-live isolation harness. Missing identity separation is a hard test failure, never a skip. The manifest captures the test-only numeric ids and proves they do not occur in production composition.

- [ ] **Step 2: Capture RED**

~~~bash
pnpm exec vitest run --reporter=json tests/unit/fix10-control-root.test.ts tests/integration/fix10-principal-boundary.test.ts
~~~

Expected: two files, 20 failures for absent modules/helper, zero skipped/todo.

- [ ] **Step 3: Implement secure open and mutation primitives**

Bind native functions/flags once. Use directory-relative fixed descendants, lstat/fstat identity, exact principal/mode/nlink/device checks, total I/O, per-leaf atomic replacement, file and parent fsync, and no repair. Keep the independent FIX-07 sample outside secure-authority inference.

- [ ] **Step 4: Capture three exact 20-test passes and commit**

~~~bash
node tools/fix10-capture-gate.mjs control-root --run=1
node tools/fix10-capture-gate.mjs control-root --run=2
node tools/fix10-capture-gate.mjs control-root --run=3
git add tools/obs-listener/src/control tools/obs-listener/src/obsctl/config.ts tools/obs-listener/src/obsctl/control-root.ts tools/obs-listener/src/obsctl/lock.ts tests/unit/fix10-control-root.test.ts tests/integration/fix10-principal-boundary.test.ts tests/fixtures/fix10-principal-probe.mjs
git commit -m "feat(obs): enforce FIX-10 principal boundaries"
~~~

### Task 3: Implement ARMED, proof, recent-loss, and key-id protocols

**Files:**

- Create: tools/obs-listener/src/obsctl/armed-token.ts
- Create: tools/obs-listener/src/obsctl/authority-proof.ts
- Test: tests/unit/fix10-authority-crypto.test.ts

**Interfaces:**

- Consumes: Task 2 root/read primitives and reviewed parseUniqueJsonUtf8/canonicalizer.
- Produces: deriveEd25519SigningKeyId, mintArmed, verifyArmed, collectProofFacts, signAuthorityProof, verifyAuthorityProof.

~~~ts
export function deriveEd25519SigningKeyId(pkcs8: Uint8Array): { key: KeyObject; spkiDer: Uint8Array; keyId: string };
export function evaluateRecentLoss(rows: readonly CaptureGapFact[], startUs: bigint, endUs: bigint): LossSummary;
export function signAuthorityProof(input: PositiveProofInput, daemonKey: KeyObject): Uint8Array;
~~~

- [ ] **Step 1: Write the 15 exact RED tests and independent crypto/SQL oracles**

Use node:crypto export with type spki and format der as the key-id oracle. Test every rejected encoding. Build API/runner/scheduler rows with exact ARMED state, distinct V-pinned canaries, closed recent gap overlap, open old overlap, future/stale facts, and each bypass mutant.

- [ ] **Step 2: Capture RED**

~~~bash
pnpm exec vitest run --reporter=json tests/unit/fix10-authority-crypto.test.ts
~~~

Expected: 15 failures because the protocols are absent, zero skipped/todo.

- [ ] **Step 3: Implement exact bytes and predicates**

Use the SPEC domains and RFC 8785 bytes. Proof collection accepts only three ordered runtime facts; validates stored signed occurrence identity and watchdog coverage; runs the existing-column typed-timestamptz interval-overlap query; and publishes only after every conjunct.

- [ ] **Step 4: Mutate and kill each required fault**

Run named mutants FRESH_OFF, FRESH_DRAINING, FRESH_INVALID, RECENT_CLOSED_GAP, OPEN_OLD_GAP, MISSING_RUNTIME, DUPLICATE_CANARY, BYPASS_API, BYPASS_RUNNER, BYPASS_SCHEDULER, PKCS8_ID, RAW_PUBLIC_ID, PEM_ID, CALLER_ID, and FUTURE_TIME. Each must fail for its exact reason.

- [ ] **Step 5: Capture three exact 15-test passes and commit**

~~~bash
node tools/fix10-capture-gate.mjs authority-crypto --run=1
node tools/fix10-capture-gate.mjs authority-crypto --run=2
node tools/fix10-capture-gate.mjs authority-crypto --run=3
git add tools/obs-listener/src/obsctl/armed-token.ts tools/obs-listener/src/obsctl/authority-proof.ts tests/unit/fix10-authority-crypto.test.ts
git commit -m "feat(obs): add non-vacuous FIX-10 proof"
~~~

### Task 4: Implement replayable local histories

**Files:**

- Create: tools/obs-listener/src/obsctl/local-history.ts
- Test: tests/unit/fix10-local-history.test.ts

**Interfaces:**

- Produces: deriveActionRef, appendOutboxIntent, readOutbox, appendJournalEvent, readJournal, pendingIntents.

~~~ts
export function appendOutboxIntent(input: OutboxIntentInput): CompletedOutboxRecord;
export function appendJournalEvent(input: JournalEventInput): CompletedJournalRecord;
export function pendingIntents(outbox: readonly CompletedOutboxRecord[], journal: readonly CompletedJournalRecord[]): readonly CompletedOutboxRecord[];
~~~

- [ ] **Step 1: Write ten RED assertions**

Cover STATUS intents, SPKI-derived sequence-one anchors, separate domains, chain continuity, permanent partial tail, exact four-field receipt match, collision, replay ordering, and no repair.

- [ ] **Step 2: Capture RED**

~~~bash
pnpm exec vitest run --reporter=json tests/unit/fix10-local-history.test.ts
~~~

Expected: ten failures for absent implementation, zero skipped/todo.

- [ ] **Step 3: Implement total parse/sign/append**

Validate the complete chain under the Task 2 lock before append. Never trust a serialized signing_key_id; derive and compare it from loaded PKCS#8 every time a process opens the signer.

- [ ] **Step 4: Capture three exact ten-test passes and commit**

~~~bash
node tools/fix10-capture-gate.mjs local-history --run=1
node tools/fix10-capture-gate.mjs local-history --run=2
node tools/fix10-capture-gate.mjs local-history --run=3
git add tools/obs-listener/src/obsctl/local-history.ts tests/unit/fix10-local-history.test.ts
git commit -m "feat(obs): add replayable obsctl histories"
~~~

### Task 5: Implement non-live FIX-09 lifecycle command surfaces

**Files:**

- Create: tools/obs-listener/src/obsctl/chain-keyring.ts
- Create: tools/obs-listener/src/obsctl/chain-activation.ts
- Create: tools/obs-listener/src/obsctl/chain-rotation.ts
- Create: tools/obs-listener/src/obsctl/lifecycle-entry.ts
- Test: tests/integration/fix10-chain-lifecycle.test.ts

**Interfaces:**

- Consumes: reviewed FIX-09 keyring/activation/recovery parsers and protocol types, inherited descriptors, EffectiveIdentity, CustodianAuthenticator, QuiescenceGuard, ProvisioningFs, ChainAdminAdapter.
- Produces: installKeyring, snapshotActivation, bootstrapActivation, rotateRowKey, rotateWitnessKey, recoverRowKey, recoverWitnessKey.

~~~ts
export async function bootstrapActivation(input: BootstrapInput): Promise<BootstrapResult>;
export async function rotateRowKey(input: RowRotationInput): Promise<RotationResult>;
export async function recoverWitnessKey(input: WitnessRecoveryInput): Promise<RecoveryResult>;
~~~

- [ ] **Step 1: Write 12 RED tests with ephemeral keys and fake admin transactions**

No test opens a live database or persistent root. The fake transaction records quiescence, table locks, microsecond snapshot, DB insert/commit, staged file, rename, and fsync. It supplies exact OBSCTL_CHAIN_PUBLIC_INPUT_FD, OBSCTL_CHAIN_PRIVATE_INPUT_FD, or OBSCTL_ACTIVATION_UNSIGNED_OUTPUT_FD values per verb and rejects wrong direction/metadata/reuse. Fault once before/after each durable boundary.

- [ ] **Step 2: Capture RED**

~~~bash
pnpm exec vitest run --reporter=json tests/integration/fix10-chain-lifecycle.test.ts
~~~

Expected: 12 failures for absent lifecycle modules, zero skipped/todo.

- [ ] **Step 3: Implement keyring and activation surfaces**

keyring-install validates V signature/continuity and atomically publishes the fixed final file. activation-snapshot emits only an unsigned exact body to an exclusive descriptor. bootstrap requires the receipt-bound reviewed chain migration already applied, recomputes under locks, commits DB first, publishes the exact signed file second, and supports only exact DB-commit/file-missing recovery.

- [ ] **Step 4: Implement rotation and recovery surfaces**

Enforce keyring-first/key-second publication under quiescence. Planned intact-history loss stays same epoch. Compromise accepts only a consecutive V-signed FIX-09 checkpoint. Permanent watchdog-history loss returns RECOVERY_AUTHORITY_REQUIRED without a write.

- [ ] **Step 5: Capture three exact 12-test passes and commit**

~~~bash
node tools/fix10-capture-gate.mjs chain-lifecycle --run=1
node tools/fix10-capture-gate.mjs chain-lifecycle --run=2
node tools/fix10-capture-gate.mjs chain-lifecycle --run=3
git add tools/obs-listener/src/obsctl/chain-keyring.ts tools/obs-listener/src/obsctl/chain-activation.ts tools/obs-listener/src/obsctl/chain-rotation.ts tools/obs-listener/src/obsctl/lifecycle-entry.ts tests/integration/fix10-chain-lifecycle.test.ts
git commit -m "feat(obs): add FIX-09 lifecycle commands"
~~~

### Task 6: Implement kill, arm, and truthful local status

**Files:**

- Create: tools/obs-listener/src/obsctl/kill.ts
- Create: tools/obs-listener/src/obsctl/arm.ts
- Create: tools/obs-listener/src/obsctl/status.ts
- Test: tests/integration/fix10-commands.test.ts
- Test: tests/integration/fix10-status.test.ts

**Interfaces:**

- Consumes: Tasks 2-4; status receives an injected local-only adapter seam that Task 7 must replace in production composition.
- Produces: runKill, runArm, buildLocalStatus, runStatus.

~~~ts
export function runKill(deps: KillDependencies): CommandResult;
export function runArm(deps: ArmDependencies, credential: Uint8Array): CommandResult;
export async function runStatus(deps: StatusDependencies): Promise<{ bytes: Uint8Array; exitCode: number }>;
~~~

- [ ] **Step 1: Write 24 RED assertions across the two exact files**

The command fake records outbox/marker/fsync/journal order and injects each caught/crash fault. Status compares effective capture to the actual reviewed FIX-07 reader for ARMING, KILLED_PARTIAL, invalid root, missing marker, and non-ENOENT read error. Require exact ordered runtime vector and independent watchdog age.

- [ ] **Step 2: Capture RED**

~~~bash
pnpm exec vitest run --reporter=json tests/integration/fix10-commands.test.ts tests/integration/fix10-status.test.ts
~~~

Expected: two files, 24 failures because commands are absent, zero skipped/todo.

- [ ] **Step 3: Implement kill outcomes and safety ordering**

Always attempt CAPTURE_OFF then KILL even if intent append fails. Re-sample after every caught fault. Emit only the exact SPEC outcome/effects/reason when histories remain writable. Never roll back a safety marker and never print KILLED without both durable markers, intent, and result.

- [ ] **Step 4: Implement authenticated arm and rollback**

Authentication precedes the intent. Publish ARMED, remove CAPTURE_OFF, then remove KILL. On any later failure, recreate CAPTURE_OFF then KILL and report complete or incomplete rollback exactly.

- [ ] **Step 5: Implement local status wire and crash protocol**

Append a STATUS intent before DB. Keep secure local state distinct from the FIX-07 switch sample. Emit all keys, ordered API/runner/scheduler rows, proof and watchdog ages, forced-OFF mutation/quick_arm, and closed unavailable reasons.

- [ ] **Step 6: Kill ordered marker/status mutants**

Run CAPTURE_CREATE_FAIL, CAPTURE_FSYNC_FAIL, KILL_CREATE_FAIL, KILL_FSYNC_FAIL, ROOT_RECHECK_FAIL, JOURNAL_FAIL, ARM_REMOVE_ORDER, ARM_ROLLBACK_ORDER, ARMING_FALSE_OFF, PARTIAL_FALSE_OFF, INVALID_ROOT_FALSE_OFF, and MISSING_MARKER_FALSE_OFF. Each must fail its named assertion.

- [ ] **Step 7: Capture three exact 24-test passes and commit**

~~~bash
node tools/fix10-capture-gate.mjs commands-status --run=1
node tools/fix10-capture-gate.mjs commands-status --run=2
node tools/fix10-capture-gate.mjs commands-status --run=3
git add tools/obs-listener/src/obsctl/kill.ts tools/obs-listener/src/obsctl/arm.ts tools/obs-listener/src/obsctl/status.ts tests/integration/fix10-commands.test.ts tests/integration/fix10-status.test.ts
git commit -m "feat(obs): add truthful FIX-10 commands"
~~~

### Task 7: Wire the real status reconciliation adapter

**Files:**

- Create: tools/obs-listener/src/obsctl/reconcile.ts
- Create: tools/obs-listener/src/obsctl/status-entry.ts
- Modify: tools/obs-listener/src/obsctl/status.ts
- Create: tools/obs-listener/src/obsctl/cli.ts
- Test: tests/integration/fix10-reconcile.test.ts

**Interfaces:**

- Consumes: reviewed appendChainedAgentAction and signer types exactly at FIX09_C35_REVIEWED_REF, pg Client, chain/private/obsctl.pk8, Task 4 pending intents, Task 6 status.
- Produces: createProductionStatusAdapter, reconcilePending, main, and mainFromProcess dispatch.

~~~ts
export async function reconcilePending(input: ReconcileInput): Promise<readonly ReconcileReceipt[]>;
export function createProductionStatusAdapter(input: StatusCompositionInput): DbStatusAdapter;
export async function main(argv: readonly string[], environment: EnvironmentReader, io: CliIo): Promise<number>;
export async function mainFromProcess(): Promise<number>;
~~~

- [ ] **Step 1: Revalidate dependency blobs and ACL before imports**

Capture exact git object ids for FIX09_CHAIN_MIGRATION_PATH, package exports, gateway, parsers, and grant catalog. Require current_user debateai_obs_listener and the Task 0 receipt. A mismatch stops the task.

- [ ] **Step 2: Write ten RED tests including the production import graph**

The fake gateway proves exact ops/obsctl/null ids/action payload. The database fixture proves listener access and denies PUBLIC/writer/watchdog/human on the obsctl action path as specified by the receipt-bound reviewed chain migration. Static scans reject INSERT/UPDATE/DELETE text for obs.agent_action outside the reviewed gateway.

- [ ] **Step 3: Capture RED**

~~~bash
pnpm exec vitest run --reporter=json tests/integration/fix10-reconcile.test.ts
~~~

Expected: ten failures for absent adapter/wiring, zero skipped/todo.

- [ ] **Step 4: Implement one-transaction-per-intent reconciliation**

For ascending pending outbox_seq: BEGIN, call appendChainedAgentAction, COMMIT, append receipt. On commit-before-receipt replay the same action_ref and accept only exact semantic match/same id. Map connection-class and commit-unknown to UNREACHABLE; identity/ACL/gateway/query/collision to REJECTED.

- [ ] **Step 5: Wire production status and CLI**

status-entry dynamically imports pg/reconcile/chain only for status. cli.ts parses the verb first. Its status branch imports status-entry; kill/arm branches import only their files; chain verbs import only lifecycle-entry. Ensure status.ts calls the real adapter and no nullable production composition remains.

- [ ] **Step 6: Capture three exact ten-test passes and commit**

~~~bash
node tools/fix10-capture-gate.mjs reconcile --run=1
node tools/fix10-capture-gate.mjs reconcile --run=2
node tools/fix10-capture-gate.mjs reconcile --run=3
git add tools/obs-listener/src/obsctl/reconcile.ts tools/obs-listener/src/obsctl/status-entry.ts tools/obs-listener/src/obsctl/status.ts tools/obs-listener/src/obsctl/cli.ts tests/integration/fix10-reconcile.test.ts
git commit -m "feat(obs): wire FIX-10 status reconciliation"
~~~

### Task 8: Integrate daemon KILL observation and proof publication

**Files:**

- Create: tools/obs-listener/src/daemon/authority-proof.ts
- Modify: tools/obs-listener/src/daemon/main.ts
- Test: tests/integration/fix10-daemon-control.test.ts

**Interfaces:**

- Consumes: Task 2 public reader, Task 3 proof collector, reviewed listener loop/dispatch seam.
- Produces: observeDaemonControl, collectPositiveProofInputs, publishAuthorityProof.

- [ ] **Step 1: Write eight RED tests**

Hang DB connect to prove the first KILL check is local. Exercise all four poll boundaries and local-abort ordering. Run proof with each conjunct absent and with no reviewed watchdog record.

- [ ] **Step 2: Capture RED**

~~~bash
pnpm exec vitest run --reporter=json tests/integration/fix10-daemon-control.test.ts
~~~

Expected: eight failures because the seam is absent, zero skipped/todo.

- [ ] **Step 3: Implement four KILL checks and local abort**

Read marker names by lstat only. The daemon does not open marker creation, HMAC, obsctl local-history, row-key, or watchdog-write paths. Abort the local worker/process group before optional lease release.

- [ ] **Step 4: Implement read-only proof collection/publication**

Read ARMED bytes without HMAC access, read watchdog journal through OBS_PUBLIC_READ_GID, query existing canary/health/gap facts, and publish via the daemon-owned proof directory only after every SPEC conjunct. No current reviewed watchdog means no positive live proof.

- [ ] **Step 5: Capture three exact eight-test passes and commit**

~~~bash
node tools/fix10-capture-gate.mjs daemon --run=1
node tools/fix10-capture-gate.mjs daemon --run=2
node tools/fix10-capture-gate.mjs daemon --run=3
git add tools/obs-listener/src/daemon/authority-proof.ts tools/obs-listener/src/daemon/main.ts tests/integration/fix10-daemon-control.test.ts
git commit -m "feat(obs): add separated FIX-10 daemon control"
~~~

### Task 9: Add package/bin composition and boundary proofs

**Files:**

- Create: tools/obs-listener/package.json
- Create: tools/obs-listener/tsconfig.json
- Create: tools/obs-listener/bin/obsctl.mjs
- Modify: package.json
- Modify: pnpm-lock.yaml
- Test: tests/architecture/fix10-boundaries.test.ts
- Test: tests/integration/fix10-product-invariance.test.ts

**Interfaces:**

- Produces: compiled dist/obsctl/cli.js reached by bin/obsctl.mjs and root pnpm obsctl dispatcher.

- [ ] **Step 1: Write 14 RED assertions across two files**

Walk the production module graph for each verb separately. Prove status reaches only appendChainedAgentAction, kill/arm exclude DB and lifecycle, lifecycle excludes runtime status credential, bin reaches CLI, private files/defaults are absent, and FIX-07/product outputs are unchanged.

- [ ] **Step 2: Capture RED**

~~~bash
pnpm exec vitest run --reporter=json tests/architecture/fix10-boundaries.test.ts tests/integration/fix10-product-invariance.test.ts
~~~

Expected: two files, 14 failures because package/bin composition is absent, zero skipped/todo.

- [ ] **Step 3: Add the private package, compiler, bin, and root script**

Use this exact package surface:

~~~json
{
  "name":"@debateai/obs-listener",
  "version":"0.0.0",
  "private":true,
  "type":"module",
  "bin":{"obsctl":"./bin/obsctl.mjs"},
  "scripts":{"build":"tsc -p tsconfig.json","obsctl":"node ./bin/obsctl.mjs"},
  "dependencies":{"@debateai/obs-capture":"workspace:*","pg":"8.22.0"}
}
~~~

bin/obsctl.mjs is mode 0755 and contains only:

~~~js
#!/usr/bin/env node
const { mainFromProcess } = await import("../dist/obsctl/cli.js");
process.exitCode = await mainFromProcess();
~~~

Root package.json adds exactly:

~~~json
"obsctl":"pnpm --filter @debateai/obs-listener run obsctl --"
~~~

tsconfig emits source into dist without committing dist. Regenerate only the new workspace importer in pnpm-lock.yaml.

- [ ] **Step 4: Capture typecheck and architecture before GREEN claim**

~~~bash
pnpm --filter @debateai/obs-listener run build
pnpm run typecheck
pnpm exec vitest run --reporter=json tests/architecture/fix10-boundaries.test.ts tests/integration/fix10-product-invariance.test.ts
~~~

Require zero exit, exact 14 tests, and zero skipped/todo.

- [ ] **Step 5: Capture three exact 14-test passes and commit**

~~~bash
node tools/fix10-capture-gate.mjs package-boundaries --run=1
node tools/fix10-capture-gate.mjs package-boundaries --run=2
node tools/fix10-capture-gate.mjs package-boundaries --run=3
git add tools/obs-listener/package.json tools/obs-listener/tsconfig.json tools/obs-listener/bin/obsctl.mjs package.json pnpm-lock.yaml tests/architecture/fix10-boundaries.test.ts tests/integration/fix10-product-invariance.test.ts
git commit -m "build(obs): expose FIX-10 control CLI"
~~~

### Task 10: Run full local evidence and request independent C0 review

**Files:**

- Create outside product tree: ../.superpowers/sdd/PLAN-FixAgent/fix10-c0-implementation-report.md
- No tracked edit unless a review finding returns to its owning task

**Interfaces:**

- Consumes: exact 13-file/127-assertion manifest and all Task 0 dependency hashes.
- Produces: three-run evidence manifest and independent review request.

- [ ] **Step 1: Run the full captured gate three times**

~~~bash
node tools/fix10-capture-gate.mjs full --run=1
node tools/fix10-capture-gate.mjs full --run=2
node tools/fix10-capture-gate.mjs full --run=3
~~~

Each run must emit exactly files=13 tests=127 failed=0 skipped=0 todo=0 after raw evidence capture.

- [ ] **Step 2: Capture build, type, source, permission, private-material, migration, and diff gates**

Run the repository's exact reviewed commands from the Task 0 manifest. Require no migration, role, grant, app/product, watchdog writer, frozen document, persistent private byte, live root, or production default in the implementation range.

- [ ] **Step 3: Validate rollback and forbidden-act evidence**

Dispose only temporary roots/adapters. Prove no database URL was opened by kill/arm, no lifecycle command ran against a live endpoint, no production key/artifact was generated, and no chain-migration application occurred.

- [ ] **Step 4: Publish the external implementation report and obtain independent review**

The report binds implementation base/head/tree/diff, authority/dependency receipts, every evidence artifact hash, mutant result, worst run duration, and:

~~~text
SPEC VERDICT: SPEC PASS
CODE QUALITY VERDICT: CODE QUALITY PASS
UNRESOLVED: P0=0 P1=0 P2=0 P3=0
FIX-10 C0 RESULT: PASS
IMPLEMENTATION ACCEPTANCE: NOT CLAIMED
~~~

- [ ] **Step 5: Keep C4 closed**

Pass the C0 review and exact compatibility receipt to FIX-09. Do not claim C4 executable until every SPEC-v3 Section 13 receipt, including the V-owned bootstrap receipt required by the then-current reviewed FIX-09 authority, independently validates.

## Trace matrix

| Contract | Plan evidence |
|---|---|
| distinct principals and watchdog publication | Task 2, 20 assertions including eight real-principal probes |
| exact ARMED/proof/key-id/recent-loss law | Task 3, 15 assertions plus named mutants |
| replayable KILL/ARM/STATUS histories | Task 4, 10 assertions |
| keyring/activation/bootstrap/rotation/recovery | Task 5, 12 non-live assertions |
| partial kill and arm rollback truth | Task 6 command assertions/mutants |
| FIX-07 capture truth and ordered liveness | Task 6 status assertions/mutants |
| crash-consistent status and real adapter | Task 7, 10 assertions/import graph |
| daemon KILL/proof separation | Task 8, 8 assertions |
| package/bin/product boundary | Task 9, 14 assertions |
| non-vacuous captured verification | Tasks 0-1 and Task 10, 127 assertions times three |
| C4/production STOP | Global gate and Task 10 |

## V-later handoff

Only after all reviewed receipts exist may V choose literal roots, principals/groups, staleness/latency values, canary exercises, credentials, keys, and activation values; create live identities/files; apply the reviewed chain migration; quiesce; sign/publish/activate/rotate/recover; install services; run real kill/arm/status and product-invariance acceptance; and accept or veto. No implementation worker derives or executes those values.
