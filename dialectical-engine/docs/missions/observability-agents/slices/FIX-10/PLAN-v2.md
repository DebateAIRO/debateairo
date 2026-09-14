# FIX-10 Single-Root Control Authority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Do not dispatch subagents for this lane. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build DB-free `obsctl kill|arm`, fail-closed status, signed local audit, later FIX-09 gateway reconciliation, and the daemon KILL/proof seam under the one approved control root.

**Architecture:** A V-owned filesystem control plane is independent from Postgres and uses purpose-separated HMAC/Ed25519 keys, ordered durable marker transitions, a signed KILL/ARM outbox, and a separately domain-signed V journal. DB-capable status alone consumes the future reviewed FIX-09 action gateway; the listener daemon consumes one shared local KILL reader and publishes only a fully positive proof.

**Tech Stack:** Node.js 22, TypeScript 7, POSIX filesystem primitives, `node:crypto`, RFC 8785, `pg@8.22.0`, pnpm 11, Vitest 4 JSON reporter.

**Spec:** `docs/missions/observability-agents/slices/FIX-10/SPEC-v2.md`

## Global constraints and gate

- The frozen `SPEC.md`, `PLAN.md`, and existing decision rows are byte-immutable.
- This plan is **not executable now**. FIX-09 v9 review is PLAN REWORK/P1=1 and authorizes neither Task 0 admission nor C3.5.
- Before any implementation edit, later authority binds `FIX09_C35_REVIEWED_REF` to one exact 40-lowercase-hex commit and an independent report has the five exact PASS lines from SPEC-v2's preamble.
- Before any implementation edit, this FIX-10 authority commit has an independent SPEC PASS / PLAN PASS / `P0=0 P1=0 P2=0 P3=0` review.
- No task creates a database role, grant, migration, live root/key/marker, production credential, service, database row, acceptance act, merge, or push.
- Kill and arm never load `OBSCTL_DATABASE_URL`, import `pg`, instantiate a DB client, resolve a DB host, or open a socket.
- Mutation and quick arm remain effectively OFF.
- Tests use explicit private temporary roots, numeric values, fake principals, and per-test ephemeral keys; production has no default.
- No committed fixture contains private/HMAC seed bytes or a fixed private-key-derived signature.
- Each implementation task begins with an exact failing test, captures RED non-vacuously, adds its scoped implementation, runs the focused gate three times, and commits only listed files.
- Every RED test registers its exact name before it performs a dynamic import inside the test body; a module-level missing import that yields zero registered assertions is forbidden. RED evidence therefore contains the stated nonzero failed-test count, not merely a failed suite.

---

## File responsibility map

| Path | Sole responsibility |
|---|---|
| `tools/obs-listener/src/control/types.ts` | shared immutable local control snapshot types |
| `tools/obs-listener/src/control/reader.ts` | DB-independent KILL/CAPTURE_OFF/root read seam |
| `tools/obs-listener/src/obsctl/config.ts` | capture and validate injected CLI configuration |
| `tools/obs-listener/src/obsctl/control-root.ts` | topology, trust checks, atomic/fsync primitives |
| `tools/obs-listener/src/obsctl/lock.ts` | exclusive transient obsctl lock |
| `tools/obs-listener/src/obsctl/armed-token.ts` | exact ARMED mint/parse/MAC/verify |
| `tools/obs-listener/src/obsctl/authority-proof.ts` | exact proof parse/sign/verify |
| `tools/obs-listener/src/obsctl/markers.ts` | idempotent zero-byte marker create/remove |
| `tools/obs-listener/src/obsctl/outbox.ts` | signed chained KILL/ARM intent log |
| `tools/obs-listener/src/obsctl/journal.ts` | separately domain-signed V event log |
| `tools/obs-listener/src/obsctl/reconcile.ts` | status-only FIX-09 gateway composition |
| `tools/obs-listener/src/obsctl/kill.ts` | capture-first kill and emergency nonzero path |
| `tools/obs-listener/src/obsctl/arm.ts` | V-authenticated arm and rollback |
| `tools/obs-listener/src/obsctl/status.ts` | closed local/DB status wire |
| `tools/obs-listener/src/obsctl/cli.ts` | exact argv/stdout/stderr/exit mapping |
| `tools/obs-listener/src/daemon/authority-proof.ts` | collect and publish positive proof |
| `tools/obs-listener/src/daemon/main.ts` | invoke shared KILL reader at four boundaries |
| `tools/fix10-capture-gate.mjs` | capture exact Vitest identity/results |
| package/lock paths | private workspace CLI composition only |

## Common interfaces

Task 2 creates these exact names; later tasks import them:

```ts
export type Decimal = string;
export type LowerHex64 = string;
export type Uuid = string;
export interface Clock { nowMs(): number }
export interface RandomSource { uuidV4(): Uuid; bytes(length: number): Uint8Array }
export interface EffectiveIdentity { uid(): number; username(uid: number): string }
export interface SecureFs {
  read(path: TrustedLeaf): Uint8Array;
  replace(path: TrustedLeaf, bytes: Uint8Array): void;
  append(path: TrustedLeaf, bytes: Uint8Array): void;
  createZero(path: TrustedLeaf): "CREATED" | "EXISTS";
  remove(path: TrustedLeaf): "REMOVED" | "ABSENT";
  listSpool(root: TrustedDirectory): { fileCount: Decimal; lineCount: Decimal };
}
export interface ExclusiveLock { acquire(): { release(): void } }
export interface CustodianAuthenticator { authenticateV(secret: Uint8Array): boolean }
export interface DbClientFactory { connectListener(url: string): Promise<ListenerTransactionClient> }
export interface ChainGateway {
  appendChainedAgentAction(client: ListenerTransactionClient, action: ChainedAgentActionInput, signer: AuditChainSigner): Promise<{ agentActionId: Uuid }>;
}
```

`TrustedLeaf`, `TrustedDirectory`, `ListenerTransactionClient`, `ChainedAgentActionInput`, and `AuditChainSigner` are opaque values created only by reviewed boundaries. If reviewed FIX-09 C3.5 exports different public type names or transaction results, STOP for successor authority; do not cast around the difference.

## Exact non-vacuous test manifest

The capture manifest stores each path, suite, ordered case-id array, and count below. Full reporter names are `FIX-10 ${suite} > ${case-id}`.

| Suite / path | Ordered case ids | Count |
|---|---|---:|
| `authority gate` — `tests/unit/fix10-authority-gate.test.ts` | `accepts_exact_bound_pass`, `rejects_unset_ref`, `rejects_non_sha_ref`, `rejects_reviewed_ref_mismatch`, `rejects_nonpass_verdict`, `rejects_nonzero_finding`, `rejects_current_v9_rework` | 7 |
| `capture gate` — `tests/unit/fix10-capture-gate.test.ts` | `accepts_exact_report`, `rejects_empty_selection`, `rejects_missing_file`, `rejects_extra_file`, `rejects_wrong_name`, `rejects_duplicate_name`, `rejects_wrong_count`, `rejects_failed_assertion`, `rejects_skipped_or_todo`, `rejects_truncated_report` | 10 |
| `control root` — `tests/unit/fix10-control-root.test.ts` | `accepts_exact_temp_topology`, `rejects_relative_root`, `rejects_noncanonical_root`, `rejects_writable_ancestor`, `rejects_wrong_root_owner_or_mode`, `rejects_postgres_device`, `rejects_symlink_component`, `rejects_symlink_leaf`, `rejects_hardlink_leaf`, `rejects_wrong_leaf_owner_or_mode`, `rejects_nonregular_leaf`, `rejects_inode_swap`, `rejects_short_read_or_write`, `rejects_missing_stable_leaf`, `marker_create_fsync_order`, `json_replace_fsync_order` | 16 |
| `armed token` — `tests/unit/fix10-armed-token.test.ts` | `matches_independent_hmac_oracle`, `rejects_duplicate_key_json`, `rejects_wrong_key_length`, `rejects_domain_substitution`, `rejects_stale_token`, `rejects_future_token`, `rejects_duration_mismatch`, `rejects_bad_nonce`, `rejects_extra_or_missing_key`, `hashes_exact_completed_bytes_with_lf` | 10 |
| `authority proof` — `tests/unit/fix10-authority-proof.test.ts` | `matches_independent_ed25519_oracle`, `rejects_wrong_or_reused_key`, `rejects_stale_or_future_proof`, `rejects_armed_hash_mismatch`, `rejects_activation_or_bundle_mismatch`, `rejects_missing_canary`, `rejects_unwritable_spool`, `rejects_open_gap`, `rejects_missing_or_stale_heartbeat`, `rejects_reordered_or_extra_heartbeat`, `rejects_invalid_watchdog_tail`, `publishes_only_complete_positive_proof` | 12 |
| `local chains` — `tests/unit/fix10-local-chains.test.ts` | `matches_outbox_oracle`, `binds_outbox_genesis_to_key_id`, `rejects_outbox_sequence_gap`, `rejects_outbox_prior_hash_change`, `rejects_outbox_signature_change`, `rejects_outbox_link_change`, `rejects_action_ref_change`, `rejects_partial_outbox_tail`, `rejects_local_key_rotation`, `matches_journal_oracle`, `separates_journal_domain`, `rejects_journal_sequence_gap`, `rejects_journal_receipt_shape`, `rejects_partial_journal_tail`, `serializes_concurrent_append`, `refuses_stale_lock_autobreak` | 16 |
| `commands` — `tests/integration/fix10-commands.test.ts` | `kill_appends_intent_before_markers`, `kill_creates_capture_off_before_kill`, `kill_uses_no_database_factory`, `kill_audit_failure_still_disables_capture`, `kill_crash_after_capture_off_is_retryable`, `kill_crash_before_journal_is_truthful`, `arm_rejects_bad_custodian`, `arm_appends_intent_before_armed`, `arm_publishes_armed_before_unlinks`, `arm_removes_capture_off_before_kill`, `arm_uses_no_database_factory`, `arm_crash_recreates_both_markers`, `arm_journal_failure_rolls_back`, `arm_never_enables_mutation`, `arm_never_enables_quick_arm` | 15 |
| `status` — `tests/integration/fix10-status.test.ts` | `prints_exact_ready_wire`, `classifies_all_seven_local_states`, `db_unreachable_exits_zero_when_local_valid`, `local_invalid_exits_nonzero`, `db_rejected_exits_nonzero`, `reports_configured_but_effective_off`, `counts_spool_without_emitting_payload`, `computes_nonnegative_cursor_lag`, `appends_every_status_invocation`, `opens_watchdog_journal_read_only` | 10 |
| `reconciliation` — `tests/integration/fix10-reconcile.test.ts` | `uses_only_reviewed_gateway`, `requires_listener_current_user`, `reconciles_in_outbox_order`, `binds_source_ops_writer_obsctl`, `binds_exact_action_payload`, `uses_distinct_row_signer`, `same_action_ref_advances_once`, `semantic_collision_is_fatal`, `db_failure_leaves_pending`, `commit_before_journal_replays_receipt`, `status_uses_direct_gateway_without_outbox`, `contains_no_raw_action_write_sql` | 12 |
| `daemon control` — `tests/integration/fix10-daemon-control.test.ts` | `checks_kill_before_db_connect`, `checks_kill_before_intake`, `checks_kill_between_work_units`, `checks_kill_on_executor_timer`, `invalid_root_stops_locally`, `kill_never_waits_for_database`, `abort_precedes_optional_lease_release`, `proof_requires_every_conjunct`, `proof_binds_current_armed`, `pre_c4_cannot_claim_live_ready` | 10 |
| `architecture` — `tests/architecture/fix10-boundaries.test.ts` | `allows_only_specified_source_paths`, `forbids_product_imports`, `forbids_db_package`, `forbids_model_or_provider`, `forbids_child_process_in_cli`, `forbids_pg_from_kill_arm_graph`, `forbids_raw_action_dml`, `forbids_watchdog_write_open`, `forbids_second_control_root`, `forbids_production_defaults`, `forbids_committed_private_material`, `pins_package_and_lockfile_surface` | 12 |
| `product invariance` — `tests/integration/fix10-product-invariance.test.ts` | `scheduler_exit_equal_before_during_after`, `scheduler_stderr_equal_before_during_after`, `api_status_equal_before_during_after`, `capture_runtime_uses_only_existing_capture_off` | 4 |

Total: exactly 134 assertions across 12 files.

---

### Task 0: Seal future dependency and authority admission

**Files:**

- Create: `tests/unit/fix10-authority-gate.test.ts`
- Create outside product tree: `.superpowers/sdd/PLAN-FixAgent/fix10-implementation-admission.report`

**Interfaces:**

- Consumes: exact `FIX09_C35_REVIEWED_REF`, independent C3.5 report, this authority commit, and independent FIX-10 review.
- Produces: a closed seven-test parser and external admission report.

- [ ] **Step 1: Prove the present gate is closed**

```bash
test -n "${FIX09_C35_REVIEWED_REF:-}"
```

Expected now: nonzero. Stop in the current state.

- [ ] **Step 2: After a successor binds the ref, write seven failing tests**

The raw-report parser rejects duplicate verdict lines, CR, non-UTF-8, extra/missing line, nonzero finding, ref mismatch, and the current v9 REWORK report.

```ts
expect(parseFix09C35Review(exactPassBytes, exactRef)).toEqual({ reviewedRef: exactRef, spec: "PASS", codeQuality: "PASS", unresolved: {p0:0,p1:0,p2:0,p3:0}, result: "PASS" });
```

- [ ] **Step 3: Capture RED**

```bash
pnpm exec vitest run --reporter=json tests/unit/fix10-authority-gate.test.ts
```

Expected: one selected file, seven failed tests for the absent parser, zero skipped/todo.

- [ ] **Step 4: Add the closed parser beside the test**

It accepts the five SPEC-v2 lines exactly once and verifies the 40-hex ref byte-for-byte. Runtime imports are forbidden.

- [ ] **Step 5: Run three captured green passes and publish admission**

```bash
pnpm exec vitest run --reporter=json tests/unit/fix10-authority-gate.test.ts
```

Each run reports exactly `files=1 tests=7 failed=0 skipped=0 todo=0`. The external report records raw evidence hashes, dependency/ref/tree/review hashes, this authority commit/tree/review hashes, and `ADMISSION RESULT: PASS`.

- [ ] **Step 6: Commit only the test**

```bash
git add tests/unit/fix10-authority-gate.test.ts
git commit -m "test(obs): bind FIX-10 dependency admission"
```

### Task 1: Build the exact capture gate

**Files:**

- Create: `tools/fix10-capture-gate.mjs`
- Create: `tests/unit/fix10-capture-gate.test.ts`
- Create: `tests/unit/fixtures/fix10-gate-manifest.v1.json`

**Interfaces:**

- Consumes: closed corpus table and Vitest JSON reporter bytes.
- Produces: captured exact-file/name/count/status evidence and `FIX10_GATE_PASS`.

- [ ] **Step 1: Write the ten failing gate assertions**

Each hostile reporter remains parseable JSON and changes one semantic class.

- [ ] **Step 2: Capture RED**

```bash
pnpm exec vitest run --reporter=json tests/unit/fix10-capture-gate.test.ts
```

Expected: one file, ten failed tests for the absent module, zero skipped/todo.

- [ ] **Step 3: Implement the canonical manifest and runner**

Manifest schema is `fix10-gate-manifest/v1`; it contains the 12 paths, every expanded full name in printed order, and `expected_test_count="134"`. Runner uses argv arrays with `shell:false`, mode-0700 evidence roots, captures raw streams/rc before parsing, and rejects preexisting output or identity/count/status drift.

```text
FIX10_GATE_PASS gate={authority|capture|local|local-chains|commands|reconcile|daemon|architecture|full} run={1|2|3} files={canonical positive decimal} tests={canonical positive decimal} failed=0 skipped=0 todo=0
```

- [ ] **Step 4: Run ten tests three times and commit**

```bash
pnpm exec vitest run --reporter=json tests/unit/fix10-capture-gate.test.ts
git add tools/fix10-capture-gate.mjs tests/unit/fix10-capture-gate.test.ts tests/unit/fixtures/fix10-gate-manifest.v1.json
git commit -m "test(obs): add FIX-10 captured gates"
```

### Task 2: Implement trusted root, ARMED, and proof protocols

**Files:** create shared `control/types.ts`, `control/reader.ts`, obsctl `config.ts`, `control-root.ts`, `lock.ts`, `armed-token.ts`, `authority-proof.ts`, `markers.ts`; create the three unit tests named in the corpus.

**Interfaces:** produces the Common Interfaces plus `openControlRoot`, `readControlSnapshot`, `mintArmed`, `verifyArmed`, `signAuthorityProof`, `verifyAuthorityProof`, `createMarker`, and `removeMarker`.

- [ ] **Step 1: Write all 38 exact assertions and capture RED**

```bash
pnpm exec vitest run --reporter=json tests/unit/fix10-control-root.test.ts tests/unit/fix10-armed-token.test.ts tests/unit/fix10-authority-proof.test.ts
```

Expected: 3 files, 38 failed assertions for absent modules, zero skipped/todo. Each positive crypto case compares exact bytes to independent `node:crypto` operations.

- [ ] **Step 2: Implement SPEC-v2 §§2–4 and exact APIs**

```ts
export function openControlRoot(input: ControlRootInput, io: CapturedFs): ControlRoot;
export function readControlSnapshot(root: ControlRoot, io: CapturedFs): ControlSnapshot;
```

DB configuration is a separate status-only import. Trusted path values become opaque after validation.

- [ ] **Step 3: Implement SPEC-v2 §§5–6 exact bytes**

```ts
export function mintArmed(input: MintArmedInput): { body: ArmedBody; bytes: Uint8Array };
export function verifyArmed(bytes: Uint8Array, key: Uint8Array, nowMs: number, stalenessMs: number): VerifiedArmed;
export function signAuthorityProof(input: PositiveProofInput, signer: KeyObject): Uint8Array;
export function verifyAuthorityProof(input: VerifyProofInput): VerifiedAuthorityProof;
```

- [ ] **Step 4: Run three captured 38-test passes and commit listed files**

```bash
node tools/fix10-capture-gate.mjs local --run=1
node tools/fix10-capture-gate.mjs local --run=2
node tools/fix10-capture-gate.mjs local --run=3
git add tools/obs-listener/src/control tools/obs-listener/src/obsctl/config.ts tools/obs-listener/src/obsctl/control-root.ts tools/obs-listener/src/obsctl/lock.ts tools/obs-listener/src/obsctl/armed-token.ts tools/obs-listener/src/obsctl/authority-proof.ts tools/obs-listener/src/obsctl/markers.ts tests/unit/fix10-control-root.test.ts tests/unit/fix10-armed-token.test.ts tests/unit/fix10-authority-proof.test.ts
git commit -m "feat(obs): add FIX-10 local authority protocols"
```

Each gate line is exactly `files=3 tests=38 failed=0 skipped=0 todo=0`.

### Task 3: Implement outbox and V journal

**Files:**

- Create: `tools/obs-listener/src/obsctl/types.ts`
- Create: `tools/obs-listener/src/obsctl/outbox.ts`
- Create: `tools/obs-listener/src/obsctl/journal.ts`
- Create: `tests/unit/fix10-local-chains.test.ts`

**Interfaces:** produces `deriveActionRef`, `appendOutboxIntent`, `readOutbox`, `appendJournalEvent`, and `readJournal` from Task 2's secure interfaces.

- [ ] **Step 1: Write 16 assertions and capture RED**

```bash
pnpm exec vitest run --reporter=json tests/unit/fix10-local-chains.test.ts
```

Expected: one file, 16 failed assertions for absent modules, zero skipped/todo. Fresh Ed25519 keys and independent domains/links are used per test.

- [ ] **Step 2: Implement exact chained append/read**

```ts
export function deriveActionRef(input: InvocationIdentity): string;
export function appendOutboxIntent(input: OutboxIntentInput): CompletedOutboxRecord;
export function appendJournalEvent(input: JournalEventInput): CompletedJournalRecord;
```

Validate the complete existing chain under the one lock before append. Partial/corrupt history is a typed stop.

- [ ] **Step 3: Run three captured passes and commit**

```bash
node tools/fix10-capture-gate.mjs local-chains --run=1
node tools/fix10-capture-gate.mjs local-chains --run=2
node tools/fix10-capture-gate.mjs local-chains --run=3
git add tools/obs-listener/src/obsctl/types.ts tools/obs-listener/src/obsctl/outbox.ts tools/obs-listener/src/obsctl/journal.ts tests/unit/fix10-local-chains.test.ts
git commit -m "feat(obs): add FIX-10 signed local histories"
```

Each gate line is exactly `files=1 tests=16 failed=0 skipped=0 todo=0`.

### Task 4: Implement kill, arm, status, and CLI

**Files:** create obsctl `kill.ts`, `arm.ts`, `status.ts`, `cli.ts`; create `tests/integration/fix10-commands.test.ts` and `tests/integration/fix10-status.test.ts`.

**Interfaces:** consumes Tasks 2–3. Produces `runKill`, `runArm`, `runStatus`, and `main`. Status alone accepts a nullable `DbStatusAdapter`; kill/arm types cannot name it.

- [ ] **Step 1: Write 25 assertions with ordered crash injection and capture RED**

The fake SecureFs records every append/create/remove/fsync and throws once at each specified transition. A fake DB factory throws if kill/arm touch it.

```ts
expect(fs.operations).toEqual([
  "append:outbox", "fsync:outbox", "create:CAPTURE_OFF", "fsync:root",
  "create:KILL", "fsync:root", "append:journal", "fsync:journal",
]);
```

```bash
pnpm exec vitest run --reporter=json tests/integration/fix10-commands.test.ts tests/integration/fix10-status.test.ts
```

Expected: 2 files, 25 failed assertions for absent modules, zero skipped/todo.

- [ ] **Step 2: Implement capture-first kill and emergency truth**

Follow SPEC-v2 §8.1. A local audit failure still attempts CAPTURE_OFF then KILL, never prints `KILLED`, and exits nonzero.

```ts
export function runKill(deps: KillDependencies): CommandResult;
```

- [ ] **Step 3: Implement authenticated arm and rollback**

Auth precedes outbox; outbox precedes ARMED; CAPTURE_OFF removal precedes KILL removal. Any later failure recreates both markers in capture-first order.

```ts
export function runArm(deps: ArmDependencies, credential: Uint8Array): CommandResult;
```

- [ ] **Step 4: Implement exact local status and strict CLI**

Implement all seven states and every SPEC-v2 §9 key. CLI accepts exactly `kill`, `arm`, or `status`, no extra token. Arm obtains its credential only through the injected secret source. Stdout is success/status wire only; stderr uses closed codes without secret/path/key bytes.

```ts
export async function runStatus(deps: StatusDependencies): Promise<{ bytes: Uint8Array; exitCode: number }>;
export async function main(argv: readonly string[], env: EnvironmentReader, io: CliIo): Promise<number>;
```

- [ ] **Step 5: Run three captured passes and commit**

```bash
node tools/fix10-capture-gate.mjs commands --run=1
node tools/fix10-capture-gate.mjs commands --run=2
node tools/fix10-capture-gate.mjs commands --run=3
git add tools/obs-listener/src/obsctl/kill.ts tools/obs-listener/src/obsctl/arm.ts tools/obs-listener/src/obsctl/status.ts tools/obs-listener/src/obsctl/cli.ts tests/integration/fix10-commands.test.ts tests/integration/fix10-status.test.ts
git commit -m "feat(obs): add FIX-10 control commands"
```

Each gate line is exactly `files=2 tests=25 failed=0 skipped=0 todo=0`.

### Task 5: Integrate the reviewed FIX-09 action gateway

**Files:**

- Create: `tools/obs-listener/src/obsctl/reconcile.ts`
- Create: `tests/integration/fix10-reconcile.test.ts`

**Interfaces:** consumes exact exports/types at `FIX09_C35_REVIEWED_REF`, existing listener DB role, distinct row signer, and Tasks 3–4. Produces `reconcilePending` and `appendStatusAction`.

- [ ] **Step 1: Recheck dependency blobs before editing**

```bash
git merge-base --is-ancestor "$FIX09_C35_REVIEWED_REF" HEAD
test -n "$FIX09_CHAIN_MIGRATION_PATH"
git show "${FIX09_C35_REVIEWED_REF}:./${FIX09_CHAIN_MIGRATION_PATH}"
git show "${FIX09_C35_REVIEWED_REF}:./packages/obs-capture/package.json"
```

Require all four SPEC-v2 §10 items and recorded hashes. Any mismatch stops this task.

- [ ] **Step 2: Write 12 assertions and capture RED**

Use an injected fake gateway for transaction/crash tests and temporary PostgreSQL roles for permission/idempotency tests. Assert no raw DML text in obsctl.

```ts
expect(gateway.calls[0].action).toMatchObject({
  source: "ops", writerIdentity: "obsctl", actionRef: intent.action_ref,
  occurrenceId: null, incidentId: null,
});
```

```bash
pnpm exec vitest run --reporter=json tests/integration/fix10-reconcile.test.ts
```

Expected: one file, 12 failed assertions for the absent adapter, zero skipped/todo.

- [ ] **Step 3: Implement status-only gateway composition**

Require `current_user` exactly `debateai_obs_listener`. Begin/commit/rollback outside the gateway. Process pending intents in ascending sequence and append a local receipt only after commit. Retry returns the exact existing action id.

```ts
export async function reconcilePending(input: ReconcileInput): Promise<ReadonlyArray<ReconcileReceipt>>;
export async function appendStatusAction(input: StatusActionInput): Promise<ReconcileReceipt>;
```

- [ ] **Step 4: Run three captured passes and commit**

```bash
node tools/fix10-capture-gate.mjs reconcile --run=1
node tools/fix10-capture-gate.mjs reconcile --run=2
node tools/fix10-capture-gate.mjs reconcile --run=3
git add tools/obs-listener/src/obsctl/reconcile.ts tests/integration/fix10-reconcile.test.ts
git commit -m "feat(obs): reconcile FIX-10 actions through chain"
```

Each gate line is exactly `files=1 tests=12 failed=0 skipped=0 todo=0`.

### Task 6: Integrate daemon KILL polling and proof publication

**Files:** create `tools/obs-listener/src/daemon/authority-proof.ts`, modify `tools/obs-listener/src/daemon/main.ts`, create `tests/integration/fix10-daemon-control.test.ts`.

**Interfaces:** consumes shared `readControlSnapshot`, injected local abort/timer/proof inputs, and reviewed listener loop. Produces `observeDaemonControl`, `collectPositiveProofInputs`, and four fixed checks in daemon main.

- [ ] **Step 1: Write ten daemon assertions and capture RED**

Make DB connect hang and prove local KILL still stops intake/worker. Omit each positive-proof conjunct independently.

```ts
expect(events.slice(0, 2)).toEqual(["read-control", "db-connect"]);
expect(onKill.events).toEqual(["abort-local", "optional-lease-release"]);
```

```bash
pnpm exec vitest run --reporter=json tests/integration/fix10-daemon-control.test.ts
```

Expected: one file, ten failed assertions because the seam is absent, zero skipped/todo.

- [ ] **Step 2: Implement four KILL boundaries**

Check before DB connect, before intake, between work units, and on the independent executor timer. Invalid root is locally killed. Local abort/process-group termination precedes and never waits for optional DB lease release.

- [ ] **Step 3: Implement positive-proof collection/publication**

Collect one clock snapshot and exact canary/spool/gap/heartbeat/latest-witness inputs. Publish only after all pass. Before reviewed C4 witness material, refuse live positive publication.

```ts
export function collectPositiveProofInputs(input: DaemonProofInputs): PositiveProofInput;
export function publishAuthorityProof(input: PublishProofInput): void;
```

- [ ] **Step 4: Run three captured passes and commit**

```bash
node tools/fix10-capture-gate.mjs daemon --run=1
node tools/fix10-capture-gate.mjs daemon --run=2
node tools/fix10-capture-gate.mjs daemon --run=3
git add tools/obs-listener/src/daemon/authority-proof.ts tools/obs-listener/src/daemon/main.ts tests/integration/fix10-daemon-control.test.ts
git commit -m "feat(obs): bind daemon to FIX-10 control"
```

Each gate line is exactly `files=1 tests=10 failed=0 skipped=0 todo=0`.

### Task 7: Add package composition and prove architecture/product invariance

**Files:** create `tools/obs-listener/package.json`; modify root `package.json` and `pnpm-lock.yaml`; create `tests/architecture/fix10-boundaries.test.ts` and `tests/integration/fix10-product-invariance.test.ts`.

**Interfaces:** consumes Tasks 2–6 and workspace conventions. Produces `pnpm obsctl -- <kill|arm|status>` and 16 boundary/invariance assertions.

- [ ] **Step 1: Write 16 assertions and capture RED**

Architecture walks the exact import graph/source allowlist. Product invariance runs a deterministic scheduler/API harness before, while both markers exist, and after authenticated arm; it compares exit/stderr/status bytes and proves capture runtime still reads only CAPTURE_OFF.

```bash
pnpm exec vitest run --reporter=json tests/architecture/fix10-boundaries.test.ts tests/integration/fix10-product-invariance.test.ts
```

Expected: 2 files, 16 failed assertions because package/entry wiring is absent, zero skipped/todo.

- [ ] **Step 2: Add exact private package and root script**

```json
{
  "name":"@debateai/obs-listener",
  "version":"0.0.0",
  "private":true,
  "type":"module",
  "scripts":{"obsctl":"tsx src/obsctl/cli.ts"},
  "dependencies":{"@debateai/obs-capture":"workspace:*","pg":"8.22.0"}
}
```

Root adds exactly `"obsctl":"pnpm --filter @debateai/obs-listener run obsctl --"`. Regenerate only the workspace importer in the lockfile; add no install script or npm bin.

- [ ] **Step 3: Run three captured passes and commit**

```bash
node tools/fix10-capture-gate.mjs architecture --run=1
node tools/fix10-capture-gate.mjs architecture --run=2
node tools/fix10-capture-gate.mjs architecture --run=3
git add tools/obs-listener/package.json package.json pnpm-lock.yaml tests/architecture/fix10-boundaries.test.ts tests/integration/fix10-product-invariance.test.ts
git commit -m "build(obs): expose FIX-10 control CLI"
```

Each gate line is exactly `files=2 tests=16 failed=0 skipped=0 todo=0`.

### Task 8: Run full captured verification and request independent C0 review

**Files:** create only external `.superpowers/sdd/PLAN-FixAgent/fix10-c0-implementation-report.md`; no tracked edit unless a finding returns to its owning task.

**Interfaces:** consumes all 12 test files, manifest, source/package changes, and admission. Produces captured 134-test evidence and review request.

- [ ] **Step 1: Run full exact gate three times**

```bash
node tools/fix10-capture-gate.mjs full --run=1
node tools/fix10-capture-gate.mjs full --run=2
node tools/fix10-capture-gate.mjs full --run=3
```

Each line is exactly `files=12 tests=134 failed=0 skipped=0 todo=0`; every full name/order/status is manifest-checked.

- [ ] **Step 2: Capture type/source audits**

```bash
pnpm run typecheck
pnpm run audit:architecture
pnpm run audit:source
```

Capture raw stdout/stderr/rc before asserting zero. An uncaptured command is not evidence.

- [ ] **Step 3: Verify exact scope and refs**

```bash
git diff --check "$FIX10_IMPLEMENTATION_BASE..HEAD"
git diff --name-only "$FIX10_IMPLEMENTATION_BASE..HEAD"
git merge-base --is-ancestor "$FIX09_C35_REVIEWED_REF" HEAD
```

Require only SPEC-v2 §11 paths, no migration, and recorded dependency/authority refs.

- [ ] **Step 4: Publish external report and obtain independent review**

Record evidence roots/hashes/summaries, killed mutants, diff paths, residual production inputs, and `IMPLEMENTATION ACCEPTANCE: NOT CLAIMED`. Require:

```text
SPEC VERDICT: SPEC PASS
CODE QUALITY VERDICT: CODE QUALITY PASS
UNRESOLVED: P0=0 P1=0 P2=0 P3=0
FIX-10 C0 RESULT: PASS
```

Then stop. This unblocks FIX-09 C4 code only; no live act, V acceptance, merge, push, or Done follows.

## Trace matrix

| Contract | Exact proof |
|---|---|
| one root/topology/no-follow/fsync | Task 2, 16 root assertions |
| ARMED HMAC and positive proof | Task 2, 22 crypto/proof assertions |
| signed outbox and V journal | Task 3, 16 local-chain assertions |
| DB-free ordered kill/arm and rollback | Task 4, 15 command assertions |
| closed status; mutation/quick arm OFF | Task 4, 10 status assertions |
| shared-gateway-only reconciliation | Task 5, 12 reconciliation assertions |
| DB-independent daemon KILL/proof seam | Task 6, 10 daemon assertions |
| package/import/product boundary | Task 7, 16 assertions |
| dependency/capture non-vacuity | Tasks 0–1, 17 assertions; Task 8 full 134 ×3 |
| V-only production and Done | Global gate and Task 8 stop |

## V-later handoff

After independent C0 PASS and reviewed FIX-09 C4, V alone supplies literal production root/device/principals/staleness/poll/latency/spool/policy/credential/DB values, creates identities/directories/files/keys, authorizes public material, applies/activates the already reviewed chain migration under its own ceremony, installs services, runs real kill/arm/status and product-invariance acceptance, and accepts or vetoes. No worker derives production values from test fixtures or this plan.
