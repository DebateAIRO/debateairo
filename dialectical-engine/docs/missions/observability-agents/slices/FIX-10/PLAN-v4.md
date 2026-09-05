# FIX-10 Authority Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Do not dispatch subagents for this lane. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the reviewed FIX-10 v4 control plane with a source-complete proof veto, byte-stable database replay, complete pre-activation signer parity, and durable audit for all lifecycle verbs.

**Architecture:** `SPEC-v4.md` incorporates v2/v3 and changes four seams only. The daemon derives and signs the binding L2 gap window; one immutable obsctl outbox record determines all database semantics; private-key owners produce signed readiness attestations without sharing keys; and distinct obsctl/V processes make every lifecycle side effect follow a signed local intent. The existing `0064` and reviewed shared gateway remain the only database path.

**Tech Stack:** Node.js 22, TypeScript 7, pnpm 11, Vitest 4, PostgreSQL 18 fixture, `node:crypto` Ed25519/HMAC/SHA-256, RFC 8785, POSIX descriptor/no-follow/fsync primitives, reviewed `@debateai/obs-capture/chain`.

**Spec:** `docs/missions/observability-agents/slices/FIX-10/SPEC-v4.md`

## Global Constraints

- `SPEC.md`, `PLAN.md`, `SPEC-v2.md`, `PLAN-v2.md`, `SPEC-v3.md`, `PLAN-v3.md`, and their existing decision rows are immutable.
- This plan incorporates PLAN-v3 except where a v4 task or interface replaces it.
- No implementation task begins before Task 0 consumes a future exact independently PASSed `FIX09_C35_REVIEWED_REF` and a fresh independently PASSed v4 authority review.
- Production roots, devices, uid/gid values, memberships, writer identities, timing values, credentials, descriptor numbers, keys, canaries, and activation values are required V-later inputs with no defaults.
- No product source, existing FIX-07 source, migration, role, grant, raw `obs.agent_action` DML, model/provider, watchdog writer, live root, live database, service, acceptance, merge, push, board act, or Done claim is authorized.
- Tests use fresh mode-controlled temporary roots, explicit positive-safe timing values, runtime-generated ephemeral keys, fake or real disposable distinct principals, captured descriptors, and disposable database adapters only.
- Every gate captures exact cwd/argv/environment/start/end/raw stdout/raw stderr/exit before assertion, uses a non-reused exclusive evidence path, and proves exact files/names/counts, all passed, zero skipped/todo, and three fresh runs.
- Any source, dependency, count, reporter name, import graph, migration blob, ACL, or authority ref drift is STOP.

## Immutable evidence anchors

| Contract | Immutable source |
|---|---|
| source-agnostic gap predicate and `W/Q` formula | `L2-ADDENDUM-2-DECLARED-KINDS.md` SHA-256 `978afde5699555e975a818a9290b59a120c264ef28d54693ebc0956ee1041947` §§5.2/5.5/5.6 |
| reviewed unclassified loss conversion | FIX-07 implementation commit `02792604ad72233908d5461924d23edf5ea70925`, runtime health observer plus FIX-07 SPEC-v7 |
| generation-one signer preflight | FIX-09 SPEC-v4 SHA-256 `3895c0feb8b4c5c0644b619f4b775f826db3600485af9917b1052358679bfc68` §§4/9/10/12 |
| persistent permission/recovery law | FIX-09 SPEC-v5 SHA-256 `881bf40c519ecb925151684ea2bb39d68cc1e2e5b0587d9b433c8da49e518c6d` §§5-10 |
| every-invocation audit and key lifecycle | frozen FIX-10 SPEC R06 plus FinalPlan SHA-256 `0e3ca8fc144cf880184cb8e3378d86d8e8ab8c16507134f28ccc0551e4a0512c` A.2 |
| prior closed FIX-10 corrections | SPEC-v3 SHA-256 `7aab653edff4acb83e56169bf6621f7a5e4aa12b408a3e4d1cb202e218a8a33b` and PLAN-v3 SHA-256 `1f32f7363cc747eca4b67704d66dd9bd2f697cf5ebd71bf9a8f1958fc1b1dbfc` |
| round-2 counterexamples | Sol report full-file SHA-256 `468e1e5e5fed7761f6ac6a38cc93f2e69e78d48b445c985a7eecec4a213b52df` |

## File structure

V3's file map remains exact and gains these focused units:

| File | Responsibility |
|---|---|
| `tools/obs-listener/src/obsctl/action-wire.ts` | closed v3 outbox/journal values and pure `databaseActionFromOutbox` |
| `tools/obs-listener/src/obsctl/proof-gap-window.ts` | positive-safe input parsing, checked `W/Q`, signed projection, fixed query |
| `tools/obs-listener/src/obsctl/signer-inventory.ts` | unique parse and V verification of initial inventory/readiness set |
| `tools/obs-listener/src/obsctl/signer-readiness.ts` | owner-only secure private-key probe and signed attestation output |
| `tools/obs-listener/src/obsctl/lifecycle-audit.ts` | OBSCTL-principal intent/result protocol and local history writes |
| `tools/obs-listener/src/obsctl/lifecycle-executor.ts` | V-principal lifecycle request validation and forward-only execution |
| `tools/obs-listener/src/obsctl/reconcile.ts` | pending-order gateway replay from completed outbox bytes only |
| `tools/obs-listener/src/daemon/authority-proof.ts` | per-runtime proof plus source-complete gap query/publication |

`tools/obs-listener/package.json` exposes only `obsctl`. Internal signer/executor entry modules are compiled but are not package bins.

## Exact successor capture manifest

The v4 manifest supersedes PLAN-v3's 127-count manifest. It contains exactly 300 reporter assertions across these 15 files:

| File | Count |
|---|---:|
| `tests/unit/fix10-authority-gate.test.ts` | 7 |
| `tests/unit/fix10-capture-gate.test.ts` | 8 |
| `tests/unit/fix10-control-root.test.ts` | 12 |
| `tests/integration/fix10-principal-boundary.test.ts` | 8 |
| `tests/unit/fix10-authority-crypto.test.ts` | 15 |
| `tests/unit/fix10-proof-gap-window.test.ts` | 28 |
| `tests/unit/fix10-local-history.test.ts` | 16 |
| `tests/integration/fix10-chain-lifecycle.test.ts` | 40 |
| `tests/integration/fix10-signer-readiness.test.ts` | 96 |
| `tests/integration/fix10-commands.test.ts` | 12 |
| `tests/integration/fix10-status.test.ts` | 14 |
| `tests/integration/fix10-reconcile.test.ts` | 16 |
| `tests/integration/fix10-daemon-control.test.ts` | 8 |
| `tests/architecture/fix10-boundaries.test.ts` | 16 |
| `tests/integration/fix10-product-invariance.test.ts` | 4 |

The unchanged v3 names stay byte-exact. Add one authority-gate name, `accepts_exact_v4_authority_review`.

The 28 proof-gap names, in order, are:

~~~text
derives_w_from_p_two_r_s_f
derives_q_from_w_plus_s
projects_all_six_signed_gap_fields
rejects_unset_p
rejects_unset_r
rejects_unset_s
rejects_unset_f
rejects_unset_w
rejects_malformed_timing
rejects_nonpositive_timing
rejects_unsafe_timing
rejects_multiplication_overflow
rejects_addition_overflow
rejects_w_derivation_mismatch
rejects_w_under_p
rejects_query_failure
rejects_immediate_first_party_gap
rejects_immediate_unclassified_postgres_failure
rejects_immediate_unclassified_gap_write_failure
rejects_future_opened_at
rejects_future_closed_at
rejects_old_open_gap
rejects_opened_at_q_minus_one
rejects_closed_at_q_minus_one
allows_opened_at_exact_q_boundary
allows_closed_at_exact_q_boundary
rejects_missing_runtime_despite_zero_gaps
rejects_runtime_canary_bypass_despite_zero_gaps
~~~

The 96 signer-readiness names are deterministically expanded in slot-major order. `slots` is exactly `[api_occurrence,runner_occurrence,scheduler_occurrence,daemon_action,obsctl_action,watchdog_witness]`. For each slot, `mutations` is exactly `[absent,wrong_uid,wrong_gid,wrong_mode,symlink,hardlink,wrong_algorithm,wrong_derived_id,wrong_signature,missing_authorization,extra_authorization,wrong_sequence_start,stale_or_future,changed_inode]`. Each title is `rejects_<slot>_<mutation>_before_activation`; that is 84 names. Append these 12 names: `rejects_bad_custodian_root`, `rejects_bad_inventory_signature`, `rejects_inventory_digest_mismatch`, `rejects_inventory_order`, `rejects_inventory_cardinality`, `rejects_generation_one_missing_signer`, `rejects_generation_one_extra_signer`, `rejects_activation_digest_mismatch`, `rejects_keyring_digest_mismatch`, `rejects_attestation_challenge_mismatch`, `rejects_parity_change_on_final_resample`, `accepts_exact_six_signer_parity`.

The 40 lifecycle names begin with the 12 unchanged v3 names. For each action in `[keyring_install,activation_snapshot,bootstrap,rotate_row,rotate_witness,recover_row,recover_witness]`, append in action-major order `audits_<action>_success`, `audits_<action>_rejection`, `audits_<action>_exact_retry`, and `audits_<action>_partial_publication`; that is 28 added names. Each test proves the exact outbox/journal order and closed outcome/phase, even when the underlying v3 lifecycle fact overlaps.

The six new local-history names are `outbox_admits_exact_lifecycle_actions`, `outbox_parameters_are_total`, `database_payload_local_outcome_is_null`, `database_payload_is_pure_completed_outbox`, `journal_intent_precedes_lifecycle_effect`, and `journal_partial_phase_is_closed`.

The six new reconciliation names are `commit_unknown_result_does_not_change_payload`, `commit_unknown_restart_replays_identical_gateway_args`, `commit_unknown_returns_original_action_id`, `commit_unknown_does_not_advance_chain`, `preactivation_unavailable_defers_without_raw_write`, and `postactivation_replays_deferred_in_sequence`.

The two new status names are `status_gap_window_is_source_complete` and `status_gap_timing_invalid_is_not_zero`.

The six new architecture names are `single_public_bin`, `signer_probe_is_internal`, `audit_frontend_cannot_import_admin`, `lifecycle_executor_cannot_import_history_signer`, `runtime_principals_cannot_reach_lifecycle_descriptors`, and `no_new_persistent_path_or_migration`.

---

### Task 0: Admit exact reviewed FIX-09 and FIX-10 authority

**Files:**

- Modify: `tests/unit/fix10-authority-gate.test.ts`
- Modify: `tests/unit/fixtures/fix10-gate-manifest.json`
- Create outside product tree: `../.superpowers/sdd/PLAN-FixAgent/fix10-implementation-admission.report`

**Interfaces:**

- Consumes: future `FIX09_C35_REVIEWED_REF`, result receipt, migration/export/ACL/gateway blobs, gateway preactivation capability, exact v4 commit/tree/report.
- Produces: `parseFix10Admission(bytes, expected): Fix10Admission` with immutable refs and `preActivationGateway` equal to `AVAILABLE` or `UNAVAILABLE`.

- [ ] **Step 1: Prove the present hard stop**

Run `test -n "$FIX09_C35_REVIEWED_REF"` in the admitted implementation worktree. The current expected result is nonzero. Perform no later task while it is nonzero.

- [ ] **Step 2: Add the v4 RED case**

Require one and only one independent v4 report with exact `SPEC PASS`, `PLAN QUALITY PASS`, `P0=0 P1=0 P2=0 P3=0`, commit/tree/path/hash bindings, and no self-review identity. Mutate each field and require a closed refusal.

- [ ] **Step 3: Bind reviewed gateway capability**

Parse the receipt-bound export and fixture evidence. Accept only exact `PRE_ACTIVATION_AVAILABLE` or `PRE_ACTIVATION_UNAVAILABLE`; never infer capability from a symbol name. Bind the result into the admission report.

- [ ] **Step 4: Capture RED, implement the minimal parser delta, and capture GREEN three times**

Run `pnpm exec vitest run --reporter=json tests/unit/fix10-authority-gate.test.ts` through the capture runner. Require one file, seven exact names, seven passed, zero failed/skipped/todo on each run.

- [ ] **Step 5: Commit Task 0 only after the external receipts exist**

Stage only the two test/fixture paths and the admission parser path already authorized by PLAN-v3. Commit with `test(obs): bind FIX-10 v4 admission`. The normal report remains untracked/ignored.

### Task 1: Replace the gap proof predicate with binding L2 law

**Files:**

- Create: `tools/obs-listener/src/obsctl/proof-gap-window.ts`
- Modify: `tools/obs-listener/src/obsctl/config.ts`
- Modify: `tools/obs-listener/src/obsctl/authority-proof.ts`
- Modify: `tools/obs-listener/src/daemon/authority-proof.ts`
- Create: `tests/unit/fix10-proof-gap-window.test.ts`
- Modify: `tests/unit/fix10-authority-crypto.test.ts`

**Interfaces:**

- Produces: `readGapTiming(env): GapTiming`, `deriveGapTiming(input): {P,R,S,F,W,Q}`, `queryRecentCaptureGaps(client,timing): Promise<{recentGapRows:"0"}>`, and `gapWindowProofFields(timing): GapWindowProof`.
- Consumes: a connected read client only after all timing inputs validate; no action gateway or signer.

- [ ] **Step 1: Write all 28 exact RED assertions**

Use checked integer arithmetic and an injected transaction clock fixture. Assert the literal source-agnostic SQL has all three OR arms and no `source`/`gap_class` predicate. Assert `Q-1ms` rejects and the exact `Q` boundary permits for each timestamp arm.

- [ ] **Step 2: Capture RED**

Run only `tests/unit/fix10-proof-gap-window.test.ts` with JSON reporter. Require 28 selected names and at least one failing assertion caused by the absent module, not zero collection.

- [ ] **Step 3: Implement timing parsing and checked derivation**

Read all five exact environment keys with no fallback. Reject before DB on malformed values, unsafe multiplication/addition, `W != P+2R+S+F`, or `W<P`. Return frozen null-prototype data.

- [ ] **Step 4: Implement the exact query and signed projection**

Bind validated `W`/`S` numerically. Parse one count row and require canonical zero. Route every database failure to proof-refresh refusal. Replace only the proof `gap_window`; preserve every v3 runtime/watchdog/canary conjunct.

- [ ] **Step 5: Kill predicate mutants**

Run mutants that add `source=first_party`, remove each OR arm, add `opened_at<=now()`, use `P`, omit either `S`, clamp W, accept query failure, or change `>` to `>=`. Each must fail a named test.

- [ ] **Step 6: Capture three GREEN runs and commit**

Run both proof files through the capture runner, then typecheck the package. Require 43 exact assertions on each run. Commit only Task 1 paths with `feat(obs): enforce source-complete proof quiet window`.

### Task 2: Freeze outbox and database action wire

**Files:**

- Create: `tools/obs-listener/src/obsctl/action-wire.ts`
- Modify: `tools/obs-listener/src/obsctl/local-history.ts`
- Modify: `tools/obs-listener/src/obsctl/reconcile.ts`
- Modify: `tests/unit/fix10-local-history.test.ts`
- Modify: `tests/integration/fix10-reconcile.test.ts`

**Interfaces:**

- Produces: `databaseActionFromOutbox(record: CompletedOutboxV3): Readonly<ChainedAgentActionInput>`.
- Invariant: output depends only on verified completed outbox fields and always contains `local_outcome:null`.

- [ ] **Step 1: Write the six local-history and four commit-unknown RED cases**

Freeze one completed STATUS record. Capture the first gateway input bytes, return commit-unknown after commit, append the local unreachable result, reconstruct state from disk, and compare the second gateway input byte-for-byte. Assert the original id and unchanged chain head.

- [ ] **Step 2: Capture RED**

Run the two exact files. Require 32 collected names and failures at the absent v3 action-wire/purity assertions.

- [ ] **Step 3: Implement closed v3 outbox parsing/signing**

Add all ten action kinds and total `action_parameters`. Preserve SPKI-derived genesis, domains, append, lock, and permanent partial-tail behavior.

- [ ] **Step 4: Implement the pure action function**

Construct the complete gateway input from `O`; canonicalize the payload once; freeze it; do not accept a local result argument. Reconciliation receives only `O`, the verified row signer, and the reviewed gateway.

- [ ] **Step 5: Kill payload-drift mutants**

Replace null with current outcome, journal outcome, marker state, status wire, second-attempt time, or current database state. Each mutant must change captured gateway bytes and fail.

- [ ] **Step 6: Capture three GREEN runs and commit**

Require 32/32, exact fake-gateway traces, no raw DML, and typecheck. Commit with `feat(obs): freeze FIX-10 database action wire`.

### Task 3: Parse the V-signed initial signer inventory

**Files:**

- Create: `tools/obs-listener/src/obsctl/signer-inventory.ts`
- Create: `tests/integration/fix10-signer-readiness.test.ts`

**Interfaces:**

- Produces: `parseInitialSignerInventory(bytes, custodianRoot, activation, keyring): InitialSignerInventory` and `parseReadinessSet(bytes, inventory): ReadonlyArray<SignerReadiness>`.
- Consumes: unique raw JSON parser from the admitted FIX-09 chain package and read-only inherited descriptors.

- [ ] **Step 1: Write inventory/cardinality/order/digest RED cases**

Build fresh V, five row, and one witness keys per test. Use exactly the SPEC-v4 slots/authorizations. Reject duplicate keys, an extra/missing signer, any reordered slot, altered digest, altered sequence start, or mismatched V signature.

- [ ] **Step 2: Capture RED before module creation**

Run only the global 12 signer assertions plus one valid control selected by exact name. Require module-not-found failures after positive collection.

- [ ] **Step 3: Implement unique parsing and V verification**

Capture descriptors once, validate direction/type/metadata, parse unique canonical bytes, verify the custodian SPKI/id/signature, then verify exact six-slot parity and no extra authorization.

- [ ] **Step 4: Capture the 12 global GREEN assertions**

Require exact names and no private key or numeric production identity in stdout, stderr, snapshots, or evidence.

- [ ] **Step 5: Commit the parser slice**

Commit only the parser and current RED/GREEN tests with `feat(obs): bind FIX-10 activation signer inventory`.

### Task 4: Produce owner-signed readiness attestations

**Files:**

- Create: `tools/obs-listener/src/obsctl/signer-readiness.ts`
- Modify: `tools/obs-listener/src/obsctl/signer-inventory.ts`
- Modify: `tests/integration/fix10-signer-readiness.test.ts`
- Modify: `tests/fixtures/fix10-principal-probe.mjs`

**Interfaces:**

- Produces: `attestSignerReadiness(request, secureRoot, outputFd): void` and `verifySignerReadiness(attestation, inventory, currentStat, nowMs, maxAgeMs): void`.
- The probe reads one owner leaf, emits one signed public attestation, and returns no key object or private bytes.

- [ ] **Step 1: Add the exact 84 slot/mutation RED names**

Generate the declared slot-major Cartesian product. For every case, assert zero activation insert, zero commit, and zero final activation publication.

- [ ] **Step 2: Capture RED with real distinct-principal fixture mode**

Where the host permits disposable uid separation, run each probe under its exact test owner. Otherwise the test must report a closed environment refusal; a same-principal substitute cannot pass the production-principal gate.

- [ ] **Step 3: Implement secure owner-only load and attestation**

Walk no-follow descriptors; verify dev/ino/uid/gid/mode/nlink/type twice; decode one Ed25519 PKCS#8 with no trailing byte; derive RFC 8410 SPKI/id; sign the exact challenge/body; total-write/fsync the exclusive output descriptor; zero transient exported buffers.

- [ ] **Step 4: Implement verifier final resample**

Verify all six signatures/ids/authorizations and freshness, independently lstat every leaf, compare signed stat identity, then repeat after quiescence immediately before the activation adapter can be called.

- [ ] **Step 5: Kill all 84 signer mutants and capture three GREEN runs**

Require the complete 96-name file on each run. Scan captured artifacts for PKCS#8/private JWK/seed material. Commit with `feat(obs): prove FIX-10 signer readiness before activation`.

### Task 5: Add lifecycle intent/result audit under split principals

**Files:**

- Create: `tools/obs-listener/src/obsctl/lifecycle-audit.ts`
- Create: `tools/obs-listener/src/obsctl/lifecycle-executor.ts`
- Modify: `tools/obs-listener/src/obsctl/lifecycle-entry.ts`
- Modify: `tools/obs-listener/src/obsctl/action-wire.ts`
- Modify: `tests/integration/fix10-chain-lifecycle.test.ts`
- Modify: `tests/architecture/fix10-boundaries.test.ts`

**Interfaces:**

- Produces: `prepareLifecycle(request, adapters): Promise<PreparedLifecycle | Rejection>`, `requestLifecycle(prepared, auditFd, executorFd): Promise<LifecycleResult>`, and `executeLifecycle(prepared, outboxHash, adapters): Promise<LifecycleResult>`.
- Ordering: V identity/authentication and read-only preflight, completed outbox append/fsync, V-journal `COMMAND_INTENT` append/fsync, execute release, unchanged-input revalidation, first side effect, result response, V-journal `COMMAND_RESULT` append/fsync. A rejected preflight follows the first three audit writes with a rejection result and no execute release.

- [ ] **Step 1: Write the exact 28 lifecycle matrix RED cases**

For every verb, assert success, rejection, exact retry, and its allowed partial phase/outcome. Capture event order and bytes, not call totals alone.

- [ ] **Step 2: Add six architecture RED cases**

Prove the one public bin, internal signer probe, split import graphs, runtime descriptor denial, and unchanged persistent topology/migration set.

- [ ] **Step 3: Capture RED**

Run the lifecycle and architecture files. Require all expected names collected and failures at the absent audit/executor seam.

- [ ] **Step 4: Implement the audit frontend**

Require OBSCTL effective identity, receive exact normalized preflight parameters, resume one byte-identical unresolved intent or build the v3 outbox, append it, append exact `COMMAND_INTENT`, then send only the completed signed intent hash and descriptor references. It cannot import pg/admin/publication modules.

- [ ] **Step 5: Implement the V executor**

Require V effective identity and credential, then read-only validate lifecycle descriptors and return normalized writer/public-input/private-key parameters. After the durable intent acknowledgment, require the matching outbox hash, resample unchanged inputs, and only then permit a side effect. Return only closed outcome/reason/phase/public digest/derived public key id/activation digest. It cannot import outbox/V-journal append or their private signer.

- [ ] **Step 6: Implement forward-only retry and partial results**

Inspect actual state, accept only identical candidate digests/ids/identity/generation/checkpoint, and perform only a missing forward transition. Never remove a published keyring, private key, activation row/file, or recovery evidence.

- [ ] **Step 7: Kill ordering and privilege mutants**

Release before intent fsync, mutate input after preflight, execute after audit failure, run executor as a runtime uid, give executor outbox-key access, give audit frontend admin access, swap FD, replay different input, duplicate an unresolved intent, and rewrite a partial publication. Each must fail by exact cause.

- [ ] **Step 8: Capture three GREEN runs and commit**

Require lifecycle 40/40 and architecture 16/16 on each run. Commit with `feat(obs): audit every FIX-10 chain lifecycle invocation`.

### Task 6: Gate bootstrap on full signer parity

**Files:**

- Modify: `tools/obs-listener/src/obsctl/chain-bootstrap.ts`
- Modify: `tools/obs-listener/src/obsctl/chain-keyring.ts`
- Modify: `tools/obs-listener/src/obsctl/lifecycle-executor.ts`
- Modify: `tests/integration/fix10-chain-lifecycle.test.ts`
- Modify: `tests/integration/fix10-signer-readiness.test.ts`

**Interfaces:**

- Consumes: verified inventory/readiness set, quiescence proof, completed generation-one keyring/activation, reviewed admin adapter.
- Produces: no adapter call until `SignerParity=PASS`; then preserves v3 DB-first/file-second bootstrap.

- [ ] **Step 1: Add ordering RED assertions to the existing named cases**

Record quiescence, first parity, activation stage, final parity, database insert, commit, file rename, and directory fsync. Require exact order and zero DB write on every signer mutation.

- [ ] **Step 2: Capture RED**

Run the two files and prove the current bootstrap reaches its adapter without the missing parity calls.

- [ ] **Step 3: Insert both parity barriers**

Validate generation-one keyring exactness at install. In bootstrap validate after quiescence, stage bytes without publication, resample parity, and only then permit the activation transaction.

- [ ] **Step 4: Prove commit/file recovery remains exact**

Fault after commit. Keep writers quiesced, emit `CHAIN_BOOTSTRAP_DB_COMMITTED_FILE_PENDING`, and require exact rerun to publish only the matching signed activation. Mismatch remains STOP.

- [ ] **Step 5: Capture three GREEN runs and commit**

Require lifecycle 40/40 and readiness 96/96. Commit with `feat(obs): block activation until signer parity passes`.

### Task 7: Reconcile lifecycle and STATUS actions without semantic drift

**Files:**

- Modify: `tools/obs-listener/src/obsctl/status.ts`
- Modify: `tools/obs-listener/src/obsctl/status-entry.ts`
- Modify: `tools/obs-listener/src/obsctl/reconcile.ts`
- Modify: `tests/integration/fix10-status.test.ts`
- Modify: `tests/integration/fix10-reconcile.test.ts`

**Interfaces:**

- Consumes: admission-pinned preactivation gateway capability and verified activation parity.
- Produces: ascending outbox replay through reviewed `appendChainedAgentAction`, with `DEFERRED_PREACTIVATION` only when the reviewed gateway mode is unavailable.

- [ ] **Step 1: Write preactivation/postactivation RED traces**

With preactivation unavailable, require no gateway/raw write and all lifecycle intents pending. After exact activation parity, require ascending replay and one receipt per original action id. Repeat with the reviewed preactivation mode available.

- [ ] **Step 2: Capture RED**

Run status/reconcile only. Require 30 exact assertions and failure at the absent capability branch.

- [ ] **Step 3: Implement capability-bound reconciliation**

Never probe by failed DML. Use the admitted capability. PRE_ACTIVATION calls the reviewed mode only when both activation representations are absent. REQUIRED calls only when both match. Partial/mismatch rejects.

- [ ] **Step 4: Preserve truthful local status**

Keep the v3 FIX-07 capture mirror, ordered runtime state/age vector, watchdog liveness, invalid-root and partial-state truth. Add pending lifecycle count without claiming a database result.

- [ ] **Step 5: Kill replay mutants and capture three GREEN runs**

Mutate payload, ordering, activation classification, gateway mode, id/ref, or chain head. Require status 14/14 and reconcile 16/16. Commit with `feat(obs): replay FIX-10 actions without semantic drift`.

### Task 8: Compose package, capture complete evidence, and stop

**Files:**

- Modify only the v3-authorized package/config/lock paths required for compiled new files
- Modify: `tests/unit/fixtures/fix10-gate-manifest.json`
- Create outside product tree: immutable non-live evidence manifest and implementation report

**Interfaces:**

- Consumes: Tasks 0-7 commits and every v3 implementation task not superseded here.
- Produces: exact 300-assertion three-run evidence, typecheck/import/private-material/migration/Git hygiene facts, and an independent-review candidate ref.

- [ ] **Step 1: Finish all unchanged PLAN-v3 tasks**

Implement v3 root/principal, HMAC/proof, kill/arm/status, daemon, package, and product-invariance contracts exactly. Do not weaken a v3 closed correction while composing v4.

- [ ] **Step 2: Capture three complete focused runs**

Run the 15 manifest paths in manifest order through Vitest JSON. Each fresh process must report exactly 15 files, 300 tests, 300 passed, zero failed/skipped/todo. Record all names and raw artifacts before interpreting.

- [ ] **Step 3: Run hostile capture controls**

Prove no-match, zero-test, wrong file/name/count/order/status, duplicate id, pre-existing path, forged summary, truncated stream, and nonzero-child cases all fail closed.

- [ ] **Step 4: Run package/type/import/schema hygiene gates**

Require package typecheck success; one public bin; no model/provider/product import; no DB path in kill/arm; only status reaches listener gateway; only lifecycle executor reaches admin adapter; no private material in repo/evidence; no `0065` or new migration; no raw production action DML; exact allowed source/test/package paths.

- [ ] **Step 5: Run all mutants against fresh captured tests**

Require every v3 mutant plus every proof-window, payload-drift, signer-readiness, activation-order, lifecycle-audit, split-principal, partial-publication, and deferred-replay mutant to die by a named non-timeout assertion. Restore exact bytes after each mutation and verify the manifest hash.

- [ ] **Step 6: Obtain fresh independent implementation review**

Require `SPEC PASS`, `CODE QUALITY PASS`, `P0=0 P1=0 P2=0 P3=0`, and `FIX-10 C0 RESULT: PASS` over the exact ref/tree/diff/evidence. A self-review is invalid.

- [ ] **Step 7: Stop before C4 and every V-only act**

Hand the reviewed C0 receipt to FIX-09. Do not claim C4 unblocked until FIX-09 validates the exact compatibility receipt and V later supplies the binding bootstrap receipt. Do not provision identities/keys, apply `0064`, quiesce, activate, install services, run real commands/acceptance, merge, push, update a board, or declare Done.

## Trace matrix

| V4 contract | Plan evidence |
|---|---|
| source-agnostic `W/Q` veto and signed inputs | Task 1, 28 exact assertions and predicate mutants |
| immutable DB payload and commit-unknown replay | Task 2 plus Task 7, 32 local/reconcile assertions |
| six-signer generation-one parity | Tasks 3/4/6, 96 exact signer assertions and zero-activation probes |
| every lifecycle invocation audited | Task 5, 28 verb-matrix assertions plus split-import gates |
| preactivation deferral and postactivation shared-gateway replay | Task 7, exact capability and activation-state traces |
| prior seven correction closure | Task 8 runs all unchanged v3 tests/mutants |
| no migration/role/grant/persistent-path expansion | Tasks 0/5/8 architecture and Git gates |
| implementation and production STOP | Task 0 initial refusal and Task 8 final handoff |

## V-later boundary

Only V may later supply production root/device/principals/groups/memberships/writer identities/timing/descriptor/launcher/credential/key/activation values; create live identities/files; sign the inventory/keyring/activation; execute owner readiness probes; quiesce; apply `0064`; activate/rotate/recover; install services; run real kill/arm/status/product-invariance acceptance; accept/veto; merge; or push. No green local evidence transfers those acts.
