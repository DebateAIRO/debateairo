# FIX-10 Native Descriptor-Custody Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Do not dispatch subagents for this lane. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compose the future reviewed FIX-09 v13 descriptor-custody seam so each of the six real signing parents keeps one sole Ed25519 `KeyObject` while one same-UID non-signing native child holds the matching private-leaf descriptor through activation.

**Architecture:** `SPEC-v6.md` incorporates v2-v5 and replaces only v5's same-process descriptor ownership and absolute no-sidecar wording. Each real parent and exactly one descriptor-custodian child form one `PinnedSignerSession`: the child performs the closed `openat`/`fstatat` walk, sends PKCS#8 once, wipes bytes, and retains the leaf fd; the parent creates the sole `KeyObject`, signs readiness/commit/records, and activates that same object only after durable parity and all six clean release CHECK/CLOSE sequences. FIX-09 v13 owns the native source/build/install/package seam; FIX-10 only admits and composes its reviewed capability.

**Tech Stack:** Node.js 22, TypeScript 7, pnpm 11, Vitest 4, PostgreSQL 18 fixture, reviewed `@debateai/obs-capture/chain`, Darwin C17, Xcode clang/macOS SDK/libSystem, Ed25519/SHA-256, RFC 8785, POSIX `openat`/`fstatat`/pipe/fsync/process primitives.

**Spec:** `docs/missions/observability-agents/slices/FIX-10/SPEC-v6.md`

## Global constraints

- FIX-10 SPEC/PLAN v1-v5 and their existing decision rows are immutable.
- This plan incorporates every PLAN-v5 task, exact test name, mutant, receipt, rollback, and STOP rule except where the native child mechanics below replace same-process descriptor ownership.
- No source/test/package/migration edit begins before Task 0 consumes an independently approved FIX-09 v13 authority ref, its exact reviewed `FIX09_C35_REVIEWED_REF`, and a fresh independently zero-finding FIX-10 v6 authority review.
- No FIX-10 task may implement, build, install, or patch the FIX-09 native helper or product entry points. An absent v13/C3.5 seam is STOP.
- Production root/device/uid/gid/groups/memberships/product identities/compiler/SDK/target/deployment target/installed metadata/descriptors/nonces/sessions/keys/timing/credentials/activation values are required V-later inputs with no defaults.
- No product source, FIX-07 source, migration, database role/grant/object, raw action DML, second root/helper path, public bin, signing endpoint, network helper, general path input, live root/key/database/process/service, activation, acceptance, merge, push, board act, or Done claim is authorized.
- Tests use explicit temporary roots, runtime-generated keys, ephemeral nonsuid helpers, inherited anonymous pipes/descriptors, controlled child failures, disposable principal fixtures, and disposable PostgreSQL only.
- Every gate is capture-first with exact cwd/argv/environment/tool versions/start/end/raw streams/status, exclusive evidence paths, exact file/name/count/order/status, and three fresh GREEN runs.

## Immutable evidence anchors

| Contract | Immutable source |
|---|---|
| one-root, principal, inventory, five-row-plus-witness authority | FIX-10 `SPEC-v3.md`/`SPEC-v4.md` and FIX-09 `SPEC-v6.md` |
| materialized gateway and six-parent live barrier | FIX-10 `SPEC-v5.md`, independently reviewed PASS |
| Darwin lacks Node 22 `openat`; native helper source/path and one-shot semantics | FIX-09 `SPEC-v12.md` §§4-5 |
| missing production profile/build derivation and retained-session seam | rejected `fix09-v12-admission-liveness-sol-review.md`, full SHA-256 `2e635db252905ac0e552b0808e4b6b83657ba32dd5ae29b32ba4206769bb2f0b` |
| v5 authority fidelity | `fix10-control-authority-sol-review-round4.md`, full SHA-256 `8c11806123fe6c2cda6320ceed5393647f19f43909af5b79b4341522f993afac` |

## Ownership and source map

FIX-09 v13/C3.5, not FIX-10, must own and review:

| Path | Required v13 responsibility |
|---|---|
| `packages/obs-capture/native/fix09-openat-read.c` | pure-Darwin closed descriptor-custodian process and compile-time six-profile table |
| `packages/obs-capture/src/chain/private-key-helper.ts` | exact spawn, anonymous-pipe framing, byte wipe, liveness, source/build/binary/map pin verification |
| `packages/obs-capture/src/chain/signer.ts` | parent-owned sole `KeyObject`, opaque pinned session, same-object private writer composition |
| `packages/obs-capture/src/chain/index.ts` and `package.json` | only the reviewed closed session capability/type surface; no key/sign/path export |
| product and daemon entry paths already authorized by FIX-09 | no-write hold and later activation of the same private module signer |
| FIX-09-owned lifecycle/key/helper tests | build/install/profile/session and product composition receipts |

After Task 0, FIX-10 may modify only its inherited v5 paths:

| Path | FIX-10 responsibility |
|---|---|
| `tools/obs-listener/src/obsctl/signer-readiness.ts` | coordinate the six opaque parent sessions; never load/export a key |
| `tools/obs-listener/src/obsctl/signer-inventory.ts` | verify exact inventory/profile map and v13 helper pins |
| `tools/obs-listener/src/obsctl/chain-bootstrap.ts` | precommit abort, DB/file parity, all-six CHECK/CLOSE, ordered parent release |
| `tools/obs-listener/src/obsctl/lifecycle-executor.ts` | compose the V-only executor without a new authority edge |
| `tests/integration/fix10-signer-readiness.test.ts` | same-object/fd/liveness/protocol/profile/release cases |
| `tests/architecture/fix10-boundaries.test.ts` | native build/map/package/import/no-sign/no-network gates |

`tools/obs-listener/package.json` retains exactly one public `obsctl` bin and no native build/install hook. `tests/fixtures/fix10-principal-probe.mjs` remains a non-live test probe only.

## Exact successor capture manifest

The v6 manifest contains exactly 369 reporter assertions across the same 15 files as v5:

| File | Count |
|---|---:|
| `tests/unit/fix10-authority-gate.test.ts` | 9 |
| `tests/unit/fix10-capture-gate.test.ts` | 8 |
| `tests/unit/fix10-control-root.test.ts` | 12 |
| `tests/integration/fix10-principal-boundary.test.ts` | 8 |
| `tests/unit/fix10-authority-crypto.test.ts` | 15 |
| `tests/unit/fix10-proof-gap-window.test.ts` | 28 |
| `tests/unit/fix10-local-history.test.ts` | 21 |
| `tests/integration/fix10-chain-lifecycle.test.ts` | 40 |
| `tests/integration/fix10-signer-readiness.test.ts` | 146 |
| `tests/integration/fix10-commands.test.ts` | 12 |
| `tests/integration/fix10-status.test.ts` | 14 |
| `tests/integration/fix10-reconcile.test.ts` | 20 |
| `tests/integration/fix10-daemon-control.test.ts` | 8 |
| `tests/architecture/fix10-boundaries.test.ts` | 24 |
| `tests/integration/fix10-product-invariance.test.ts` | 4 |

All 336 v5 names remain exact. Append `accepts_exact_v6_authority_review` to the authority gate.

Append these twelve signer names in exact slot-major order. Slots are `[api_occurrence,runner_occurrence,scheduler_occurrence,daemon_action,obsctl_action,watchdog_witness]`; for each slot append:

~~~text
uses_<slot>_parent_keyobject_from_single_helper_frame
retains_<slot>_custodian_leaf_fd_through_release_check
~~~

Then append these twelve global signer names:

~~~text
rejects_second_private_key_frame
rejects_parent_second_key_load
requires_parent_and_child_key_buffer_wipe
rejects_helper_eof_before_release
rejects_helper_crash_or_signal_before_release
rejects_helper_protocol_or_stderr_before_release
requires_all_clean_release_checks_and_closes_before_parent_enable
keeps_parent_pid_as_wire_identity
rejects_helper_as_release_principal
preserves_release_order_across_parent_sessions
keeps_precommit_helper_loss_at_zero_state
keeps_postcommit_helper_loss_pending_without_release
~~~

Append these eight architecture names:

~~~text
binds_v_signed_inventory_to_compile_time_helper_profile_map
requires_exact_product_daemon_obsctl_and_watchdog_profile_values
rejects_helper_path_input_and_sign_opcode
proves_helper_has_no_network_or_node_dependency
requires_byte_identical_two_build_receipt
requires_v_only_atomic_helper_install
binds_helper_source_build_binary_and_map_in_activation
requires_reviewed_fix09_v13_custody_seam
~~~

Arithmetic is exact: `336 + 1 + 24 + 8 = 369`.

---

### Task 0: Admit exact v13/C3.5 and FIX-10 v6 authority

**Files:**

- Modify: `tests/unit/fix10-authority-gate.test.ts`
- Modify: `tests/unit/fixtures/fix10-gate-manifest.json`
- Create outside product tree: `../.superpowers/sdd/PLAN-FixAgent/fix10-implementation-admission.report`

**Interfaces:**

- Consumes: independent FIX-09 v13 authority ref/review, exact `FIX09_C35_REVIEWED_REF`/review/capability/build receipts, exact FIX-10 v6 ref/tree/report.
- Produces: a frozen `Fix10Admission` that exposes facts only, never a signer, key, descriptor, path selector, or live capability.

- [ ] **Step 1: Capture the present RED stop**

Require both immutable FIX-09 identifiers and the exact v6 review. The present expected outcome is `FIX10_C35_SIGNER_BARRIER_UNAVAILABLE`. Run no later task on absence, v12 substitution, ref/review mismatch, unresolved v12 P1, or non-descendant C3.5 implementation.

- [ ] **Step 2: Add the exact v6 authority case**

Require the v6 commit/tree/diff, one independent report, the five exact PASS/zero/NO lines from SPEC-v6, and one appended decision. Mutate ref, tree, diff, path scope, reviewer identity, verdict, count, or implementation authorization and require refusal.

- [ ] **Step 3: Bind the v13 native custody capability**

Require reviewed receipts for exactly six real signing parents, one same-UID child each, parent PID wire identity, one private frame, child-retained fd, parent-owned same `KeyObject`, closed CHECK/CLOSE protocol, no sign/path/network opcode, and no second read/load. A short-lived v12 preparer, fake helper, test-only wrapper, signer broker, or documentation assertion cannot pass.

- [ ] **Step 4: Bind build, install, profile, and composition receipts**

Require source/profile-table/compiler/SDK/target/flag/two-build/binary/install hashes and metadata; V-signed six-record profile-map equality; all three exact present product `OBS_WRITER_IDENTITY` values; daemon `fixagent-daemon`, obsctl `obsctl`, watchdog null/fixed leaf; five C3.5 writer compositions; and the C4-gated witness composition seam. Prove no migration/schema/role/grant/root/path/bin/runtime-start expansion.

- [ ] **Step 5: Capture GREEN three times and commit**

Run only `tests/unit/fix10-authority-gate.test.ts` through the existing capture runner. Require one file, nine exact names, nine passed, zero failed/skipped/todo on all three runs. Commit Task 0 only after every immutable external receipt exists.

### Task 1: Preserve v5 materialized gateway work

Execute PLAN-v5 Tasks 1 and 2 without semantic change. Require the same deeply frozen null-prototype materialization, evidence-only RFC 8785 bytes, real JSONB object readback, commit-unknown restart replay, original action id/ref, and no chain advance. The native custody correction has no action-payload authority.

### Task 2: Compose six reviewed parent/child sessions

**Files:**

- Modify: `tools/obs-listener/src/obsctl/signer-readiness.ts`
- Modify: `tools/obs-listener/src/obsctl/signer-inventory.ts`
- Modify: `tests/integration/fix10-signer-readiness.test.ts`
- Modify: `tests/fixtures/fix10-principal-probe.mjs`

**Interfaces:**

- Consumes: six exact inventory slots and reviewed v13 opaque session factory.
- Produces: six logical `PinnedSignerSession` capabilities; each has one parent-owned sole `KeyObject` in FIX-09 private module state and one same-UID native child retaining the corresponding leaf fd.

- [ ] **Step 1: Write the twelve slot-major RED tests**

For each exact slot, instrument object construction/sign calls and descriptor identity. Require one child private frame, one parent `KeyObject`, the same object identity at readiness/commit/first record, and the same child leaf fd/version through release CHECK. A second object, reread, fd reopen, child signer, or replacement parent fails before activation.

- [ ] **Step 2: Write the twelve global RED tests**

Exercise second frame/load; parent/child wipe evidence; EOF; crash/signal; malformed/extra/reordered opcode; stderr; parent PID identity; child release attempt; precommit/postcommit failure state; all-six clean close; and binding release order. Record spawn, pipe, metadata, sign, DB, fsync, close, exit, enable, and first-write events.

- [ ] **Step 3: Capture RED against the v12 one-shot seam**

Run the readiness file alone. Require 146 exact names collected and failure because v12 closes the leaf/exits, lacks CHECK/CLOSE, or lacks same-object release composition. If real disposable UID separation is unavailable, record a closed environment refusal; same-principal substitution cannot satisfy the production-principal gate.

- [ ] **Step 4: Compose the reviewed opaque v13 factory**

Pass only the verified inventory/profile and inherited session descriptors. Require exactly one same-UID child, one startup private frame, one private parent `KeyObject`, immediate buffer wiping, parent PID wire identity, and no caller-visible key, signer, private bytes, helper path selector, or signing function. FIX-10 does not import a private helper module or spawn an unreviewed binary.

- [ ] **Step 5: Drive readiness and commit**

Obtain child metadata with session-bound CHECK, materialize the byte-exact v5 public object, and have the same parent `KeyObject` sign it. Repeat for the fresh v5 commit challenge without rereading/reloading. Require the current child, retained fd, complete version vector, activation/inventory/profile-map digests, and all inherited public authorization checks.

- [ ] **Step 6: Kill custody/session mutants**

Kill extra child, wrong ruid/euid/gid, short-lived helper, second key frame/read/load, child `KeyObject`, sign/path/network opcode, profile substitution, parent PID replaced with child PID, lost stderr/EOF, descriptor reopen, omitted version member, map drift, copied session, stale nonce, and retained private buffer mutants.

- [ ] **Step 7: Capture GREEN three times and commit**

Require 146/146 each run, exact child cleanup, no private material in streams/evidence/repository, and package typecheck. Commit only the FIX-10 session composition.

### Task 3: Gate activation on all-six clean custody close

**Files:**

- Modify: `tools/obs-listener/src/obsctl/chain-bootstrap.ts`
- Modify: `tools/obs-listener/src/obsctl/lifecycle-executor.ts`
- Modify: `tests/integration/fix10-chain-lifecycle.test.ts`
- Modify: `tests/integration/fix10-signer-readiness.test.ts`

- [ ] **Step 1: Extend the event-order RED trace**

Record inherited staging/quiescence, helper/build/install/map parity, parent/child launch, single frame, readiness CHECK/signature, commit CHECK/signature, activation insert/commit, final rename/fsync/reopen/parity, all six release CHECKs, all six CLOSE_RELEASE acknowledgements/exits, ordered parent enables, and first signatures. Require that exact partial order.

- [ ] **Step 2: Prove zero-state precommit failures**

For every slot, inject helper EOF/crash/signal/stderr/protocol/map/fd failure before commit. Require rollback, no activation row, no final publication, CLOSE_ABORT for survivors, no parent enable, and no first signature.

- [ ] **Step 3: Preserve truthful postcommit states**

Before confirmed file parity, return exact `CHAIN_BOOTSTRAP_DB_COMMITTED_FILE_PENDING`. After file parity but before all clean custody closes, return `CHAIN_BOOTSTRAP_DURABILITY_UNKNOWN` with `DESCRIPTOR`/UNKNOWN, release nobody, and require fresh-session inspection/recovery. Never report rollback or delete durable authority.

- [ ] **Step 4: Close all custody before enabling a parent**

Run release CHECK and CLOSE_RELEASE in product-writers → daemon/obsctl → watchdog order. Keep every parent held until all six children acknowledge, close, emit empty stderr, and exit zero. Then enable the exact parents in the same order with their existing `KeyObject`; no reload or replacement process is accepted.

- [ ] **Step 5: Preserve forward recovery and cold start**

Use fresh barrier/nonce/sessions/children on recovery. Bind the same committed activation, profile map, helper binary, inventory, public key ids, and private derived ids. A postactivation replacement parent follows the inherited cold-start law; it cannot reuse the ceremony transcript.

- [ ] **Step 6: Kill order and partial-state mutants**

Kill activation before six commit checks, publication before commit, release CHECK before durable parity, parent enable before all clean closes, helper-close failure ignored, later ordinal released after failure, false postcommit rollback, reused child/session, signer reload, helper/profile repin, or first signature under a different object.

- [ ] **Step 7: Capture GREEN three times and commit**

Require lifecycle 40/40 and readiness 146/146 on every run, exact local outcome/reason/phase assertions, no private bytes, and typecheck.

### Task 4: Prove native boundary and profile/build receipts

**Files:**

- Modify: `tests/architecture/fix10-boundaries.test.ts`
- Modify: `tests/unit/fixtures/fix10-gate-manifest.json`

- [ ] **Step 1: Write the eight exact RED assertions**

Consume only reviewed v13 receipts and installed-artifact projections. Assert exact six-record derived map, present/equal product identities, fixed daemon/obsctl/watchdog values, no sign/path/network opcode, pure Darwin source/dependency projection, two byte-identical builds, V-only atomic install, full activation pins, and v13/C3.5 ancestry.

- [ ] **Step 2: Capture RED**

Require 24 exact architecture names collected. V12 must fail on missing compiler/SDK/flags/two-build/install/profile-map/session receipts and its short-lived helper semantics.

- [ ] **Step 3: Verify source and protocol closure**

Inspect the reviewed source/blob receipts for only the admitted open/stat/read/write/close/memory/process operations, exact profile table, fixed protocol opcodes, no listener/socket/network/signing/key-export/path-input code, no Node header/ABI/node-gyp, and no third-party dependency.

- [ ] **Step 4: Verify deterministic build and V-only install**

Recompute source/table/recipe/toolchain/SDK/target hashes. In disposable roots only, reproduce both builds and compare exact output bytes. Verify the closed Mach-O/load-command/symbol projection and libSystem-only dependency. Replay atomic install against a temporary root and reject wrong installer identity, metadata, link/type, rename/fsync order, binary hash, or activation field.

- [ ] **Step 5: Kill map/build/install mutants**

Kill missing/empty/mismatched product identity, daemon/obsctl substitution, watchdog row-profile admission, profile reorder, arbitrary path, source/table/flag/tool/SDK/target drift, nonreproducible UUID/path bytes, unexpected library/symbol, group-writable/setid binary, unpinned install, runtime repin, and non-V installer mutants.

- [ ] **Step 6: Capture GREEN three times and commit**

Require 24/24 each run plus unchanged package bin/export/runtime-start and migration/ACL projections.

### Task 5: Compose all inherited work, capture evidence, and stop

- [ ] **Step 1: Complete inherited v5 tasks not superseded here**

Preserve exact single-root control topology, privilege separation, capture proof, KILL/ARM/status truth, immutable local history, lifecycle audit, gateway replay, rollback, and every v2-v5 mutant.

- [ ] **Step 2: Capture three complete focused runs**

Run the 15 manifest files in manifest order. Each fresh process reports exactly 15 files, 369 tests, 369 passed, zero failed/skipped/todo, with exact full-name order.

- [ ] **Step 3: Run hostile capture, package, import, schema, and privacy gates**

Require all inherited capture attacks; one public `obsctl` bin; reviewed package export only; no product/model/provider/raw-DML edge from FIX-10; no new migration/role/grant/root/helper path; no private material; and exact frozen FIX-07/FIX-09/FIX-10 authorities.

- [ ] **Step 4: Run every v2-v6 mutant**

Every control/proof/state/lifecycle/gateway/crypto/filesystem/capture mutant plus the exact parent/child/key/fd/liveness/profile/build/install/order mutants must die by a named non-timeout assertion. Restore exact bytes after each mutant.

- [ ] **Step 5: Obtain fresh independent implementation review**

Require exact ref/tree/diff/evidence binding, `SPEC PASS`, `CODE QUALITY PASS`, `P0=0 P1=0 P2=0 P3=0`, and `FIX-10 C0 RESULT: PASS`. Self-review is invalid.

- [ ] **Step 6: Stop before C4 and every V-only act**

Hand the reviewed C0 receipt to FIX-09. C4 remains blocked until the separate compatibility and V bootstrap receipts pass. Do not build/install production helper bytes, provision, launch real processes, quiesce, apply migration, activate, rotate/recover, operate services, run acceptance, merge, push, update a board, or declare Done.

## Trace matrix

| V6 contract | Plan evidence |
|---|---|
| one same-UID custody child inside each of six parent sessions | Task 2, twelve slot-major and identity/cardinality mutants |
| parent owns sole same `KeyObject`; child holds leaf fd | Task 2, exact object/fd/sign traces and no-second-load mutants |
| closed one-frame/CHECK/CLOSE protocol | Tasks 2-3, liveness/protocol/order tests |
| parent PID and parent release authority remain | Tasks 2-3, PID and child-release refusal |
| exact inventory/compile-time profile mapping | Tasks 0 and 4, identity/map receipts and mutants |
| pure Darwin deterministic helper and V-only install | Task 4, two-build/load-command/install evidence |
| durable parity and all-six clean close before enable | Task 3, total event order and fault injection |
| reviewed FIX-09 v13/C3.5 seam is mandatory | Task 0 hard gate and Task 4 ancestry |
| all v2-v5 control/gateway properties remain | Tasks 1 and 5 |
| implementation and production remain stopped | Task 0 present refusal and Task 5 handoff |

## V-later boundary

Only V may later supply production root/device/principals/groups/memberships/writer identities/compiler/SDK/target/deployment target/helper-install/descriptors/timing/credentials/nonces/sessions/keys/activation values; stage keys/public authority; install the reviewed helper; launch the six parents; quiesce; apply the reviewed migration; commit/publish activation; release/restart writers; install/operate services; run acceptance; accept/veto; merge; or push. No authority document or local green evidence transfers those acts.
