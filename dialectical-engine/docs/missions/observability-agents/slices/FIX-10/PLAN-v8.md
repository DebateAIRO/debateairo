# FIX-10 Canonical Inventory and Native-Wipe Admission Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Do not dispatch subagents for this lane. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admit the future reviewed FIX-09 v13 custody seam only when OPEN binds the exact signed inventory, the helper requests an available `memset_s`, and one pinned verifier plus direct artifact captures reproducibly derives every wipe claim.

**Architecture:** `SPEC-v8.md` incorporates v2-v7 and corrects only three rejected clauses. The inventory digest is domain-separated over verified canonical completed bytes including V's signature; helper source requests Annex K at byte zero and target/flag/Mach-O evidence enforces macOS 10.9 or later; one FIX-09-owned nonshipping Node 22 verifier byte-parses the helper source/object/executable and is corroborated by exact `nm`/`otool` artifact captures. Build-v3 and helper-v4 receipts bind the whole derivation while every v7 authority and STOP boundary remains unchanged.

**Tech Stack:** Node.js 22 built-ins, TypeScript 7, pnpm 11, Vitest 4, PostgreSQL 18 fixture, reviewed `@debateai/obs-capture/chain`, Darwin C17, Xcode clang/macOS SDK/libSystem, Mach-O 64/ARM64, Ed25519/SHA-256, RFC 8785, POSIX descriptors/pipes/fsync/process primitives.

**Spec:** `docs/missions/observability-agents/slices/FIX-10/SPEC-v8.md`

## Global constraints

- FIX-10 SPEC/PLAN v1-v7 and their existing decision rows are immutable.
- This plan incorporates every PLAN-v7 task, exact test name, mutant, receipt, rollback, and STOP rule except the three exact v8 replacements.
- No source/test/package/migration edit begins before Task 0 consumes independently approved FIX-09 v13 authority, its exact independently reviewed `FIX09_C35_REVIEWED_REF`, and a fresh independently zero-finding v8 authority review.
- C3.5 still proves four live API/runner/scheduler/daemon compositions plus dormant uncalled obsctl and private non-live watchdog seams; FIX-10 C0 performs the first obsctl composition; C4 remains later.
- Production roots/devices/uids/gids/groups/identities/compiler/SDK/Node/target/deployment/descriptors/nonces/sessions/keys/timing/credentials/install/activation values are required V-later inputs with no defaults.
- No product source, FIX-07 source, migration, role, grant, database object, raw action DML, second root/helper path, public bin, runtime analyzer, signing endpoint, network helper, live act, acceptance, merge, push, board act, or Done claim is authorized.
- Tests use explicit temporary roots/identities/artifact descriptors, runtime-generated keys, ephemeral nonsuid helpers, anonymous pipes, controlled child failures, disposable principals/PostgreSQL, and no private fixture.
- Every gate is capture-first with exact cwd/argv/environment/tool versions/start/end/raw streams/status, exclusive evidence paths, exact names/count/order/status, and three fresh GREEN runs.

## Frozen evidence

| Contract | Immutable source |
|---|---|
| completed signed inventory schema/signature/challenge | FIX-10 `SPEC-v4.md` §4 |
| parent/child, OPEN, build, and wipe contracts | FIX-10 `SPEC-v5.md` through `SPEC-v7.md` |
| owner and C3.5 → C0 → C4 order | FIX-10 `SPEC-v7.md` §§2-3 and FIX-09 v12 |
| three rejected clauses | `fix10-control-authority-sol-review-round6.md`, SHA-256 `70337a281f73e78ce981d4829727d521a0f1eaeda118866d03433b2be99aeb31` |
| feature guard and availability | selected macOS 26.5 SDK `usr/include/_string.h` lines 169-178 |

## Ownership and exact source map

FIX-09 v13/C3.5, not FIX-10, owns and must independently review:

| Path | Required v13/C3.5 responsibility |
|---|---|
| `packages/obs-capture/native/fix09-openat-read.c` | byte-zero Annex K request, v7 custody protocol, named session/wipe/zero-scan/marker shape, and analyzable ARM64 output |
| `packages/obs-capture/scripts/verify-fix09-native-wipe.mjs` | sole nonshipping source/Mach-O/ARM64/relocation/stub/data-flow/CFG/exit verifier with exact stdin/stdout contract |
| `packages/obs-capture/src/chain/private-key-helper.ts` | descriptor-pinned verifier/artifact capture, build-v3/helper-v4 receipt validation, parent Buffer wipe, and child liveness |
| `packages/obs-capture/src/chain/signer.ts` | parent sole `KeyObject`, exact completed-inventory digest, opaque sessions, four live and two dormant/private seams |
| `packages/obs-capture/src/chain/index.ts` | existing closed gateway/session exports only; no analyzer, key, path, sign, or raw descriptor export |
| `packages/obs-capture/package.json` | existing `./chain` export only; no analyzer/helper bin, install hook, dependency, or production copy |
| existing FIX-09 product/daemon entry paths | four C3.5 compositions only; no obsctl invocation or watchdog runtime operation |
| FIX-09-owned key/helper/lifecycle/architecture tests | inventory, macro/target/minos, verifier, raw tool capture, agreement, receipt, and activation facts |

After Task 0, FIX-10 may modify only:

| Path | FIX-10 responsibility |
|---|---|
| `tools/obs-listener/src/obsctl/signer-readiness.ts` | exact completed-inventory OPEN oracle and first obsctl session composition |
| `tools/obs-listener/src/obsctl/signer-inventory.ts` | unique/canonical/signature verification, digest/receipt/replay, profile map, and helper-v4 pins |
| `tools/obs-listener/src/obsctl/chain-bootstrap.ts` | inherited parity/recovery/close/release with exact inventory replay |
| `tools/obs-listener/src/obsctl/lifecycle-executor.ts` | inherited V-only executor; no analyzer or new authority edge |
| `tools/obs-listener/package.json` | retain one public `obsctl` bin; no verifier/helper hook or dependency |
| `tests/fixtures/fix10-principal-probe.mjs` | non-live principal/session probe only |
| the exact 15 manifest test files | all inherited cases plus the exact v8 names below |

No FIX-10 runtime imports the verifier or implements another parser.

## Exact successor capture manifest

The v8 manifest contains exactly 425 reporter assertions across the same 15 files as v7:

| File | Count |
|---|---:|
| `tests/unit/fix10-authority-gate.test.ts` | 11 |
| `tests/unit/fix10-capture-gate.test.ts` | 8 |
| `tests/unit/fix10-control-root.test.ts` | 12 |
| `tests/integration/fix10-principal-boundary.test.ts` | 15 |
| `tests/unit/fix10-authority-crypto.test.ts` | 15 |
| `tests/unit/fix10-proof-gap-window.test.ts` | 28 |
| `tests/unit/fix10-local-history.test.ts` | 21 |
| `tests/integration/fix10-chain-lifecycle.test.ts` | 40 |
| `tests/integration/fix10-signer-readiness.test.ts` | 168 |
| `tests/integration/fix10-commands.test.ts` | 12 |
| `tests/integration/fix10-status.test.ts` | 14 |
| `tests/integration/fix10-reconcile.test.ts` | 20 |
| `tests/integration/fix10-daemon-control.test.ts` | 8 |
| `tests/architecture/fix10-boundaries.test.ts` | 49 |
| `tests/integration/fix10-product-invariance.test.ts` | 4 |

All 402 v7 names remain exact. Append `accepts_exact_v8_authority_review` to the authority gate.

Append these nine signer-readiness names in this order:

~~~text
binds_open_to_verified_completed_inventory_bytes
rejects_open_noncanonical_completed_inventory_bytes
rejects_open_unsigned_inventory_digest
rejects_open_hex_text_inventory_digest_preimage
rejects_open_untagged_raw_inventory_sha256
rejects_open_wrong_inventory_digest_domain
rejects_open_inventory_digest_without_lp_or_count
rejects_open_reused_digest_after_inventory_resign
recomputes_inventory_digest_on_receipt_and_cold_start_replay
~~~

Append these thirteen architecture names in this order:

~~~text
requires_annex_k_request_before_all_includes
rejects_missing_annex_k_request_macro
rejects_late_annex_k_request_macro
rejects_conflicting_annex_k_request_macro
rejects_pre_macos_10_9_deployment_target
rejects_target_flag_or_macho_minos_disagreement
derives_wipe_evidence_with_pinned_verifier_and_artifact_commands
rejects_forged_wipe_verifier_output
rejects_substituted_wipe_verifier_source
rejects_truncated_wipe_function_range
rejects_unresolved_memset_s_relocation_or_stub
rejects_missing_artifact_analysis_command
rejects_verifier_nm_otool_disagreement
~~~

Arithmetic is exact: `402 + 1 + 9 + 13 = 425`.

---

### Task 0: Admit exact v8 and reviewed v13/C3.5 facts

**Files:**

- Modify: `tests/unit/fix10-authority-gate.test.ts`
- Modify: `tests/unit/fixtures/fix10-gate-manifest.json`
- Create outside product tree: `../.superpowers/sdd/PLAN-FixAgent/fix10-implementation-admission.report`

**Interfaces:**

- Consumes: exact approved v13 authority/ref, reviewed C3.5 receipt/ref, exact v8 ref/tree/review, v7 frozen hashes.
- Produces: fact-only `Fix10Admission`; it carries no signer, key, raw inventory, artifact byte, path, fd, process, or live capability.

- [ ] **Step 1: Capture the present hard stop**

Require v13, exact `FIX09_C35_REVIEWED_REF`, and a v8 zero-finding review. Until all exist, the isolated authority test must return `FIX10_C35_SIGNER_BARRIER_UNAVAILABLE` with zero implementation action.

- [ ] **Step 2: Add the v8 authority RED case**

Require exact v8 commit/tree/three-path diff, one decision append, frozen v1-v7, independent reviewer identity, and the five exact PASS/zero/NO lines. Mutate each binding and require refusal.

- [ ] **Step 3: Admit the inventory formula**

Require exact v4 completed schema/signature verification, `RAW = J(COMPLETED_INVENTORY)`, v8 `DH` formula, receipt hash, OPEN/readiness/recovery/cold-start equality, and all nine exact signer cases. An implementation-chosen digest is not an admission fact.

- [ ] **Step 4: Admit the Annex K/deployment facts**

Require the byte-zero line, no preinclude/competing macro, selected guarded SDK bytes, canonical target at least 10.9, exact triple/flag/LC_BUILD_VERSION tuple, deployment digest, build-v3 receipt, and helper-v4 activation field equality.

- [ ] **Step 5: Admit derivation rather than claims**

Require the exact sole verifier path/blob/runtime/input/output hashes, deterministic parser rules, fourteen exact tool-command capture records, exact agreement, projections, artifact-analysis receipt, and activation pins. Reject a projection hash unsupported by raw derivation evidence.

- [ ] **Step 6: Capture three GREEN runs and commit**

Run the authority file alone through the existing capture runner. Each fresh process must collect 11 exact names, pass 11, and report zero failed/skipped/todo with exclusive evidence.

### Task 1: Preserve every inherited v7 behavior

**Files:**

- Test: the exact 15 paths and counts in the successor capture manifest above; this task changes no source path and adds no reporter name.

**Interfaces:**

- Consumes: all frozen v2-v7 contracts and 402 exact names.
- Produces: unchanged single-root, privilege, gateway, status, local-history, lifecycle, six-parent, owner, stage, OPEN, close, hash, wipe, failure, recovery, rollback, and STOP evidence.

- [ ] **Step 1: Capture the inherited baseline**

Run all 15 files before v8 test edits; require exactly the inherited v7 projection or the explicit present authority-gate stop, never silent name drift.

- [ ] **Step 2: Reprove frozen contracts after each v8 task**

Run the affected file plus authority, capture, product-invariance, and boundary gates. Require all inherited names and frozen document hashes after Tasks 2-4.

### Task 2: Bind OPEN to verified completed inventory

**Files:**

- Modify: `tools/obs-listener/src/obsctl/signer-inventory.ts`
- Modify: `tools/obs-listener/src/obsctl/signer-readiness.ts`
- Modify: `tools/obs-listener/src/obsctl/chain-bootstrap.ts`
- Modify: `tests/integration/fix10-signer-readiness.test.ts`
- Modify: `tests/unit/fixtures/fix10-gate-manifest.json`

**Interfaces:**

- Consumes: inherited inventory fd bytes, verified custodian SPKI, exact v4 completed schema, v7 `J/DH/D32`, activation/keyring authority.
- Produces: immutable `{completedInventoryBytes,inventorySha256,receipt,receiptSha256}` whose byte buffer is never mutable/shared and whose digest is the only OPEN inventory member.

- [ ] **Step 1: Write the nine exact RED cases**

Add the nine names in manifest order. Use a valid signed canonical completed inventory as the oracle; mutate raw whitespace/order, remove the signature, hash ASCII hex, use raw SHA-256, change domain, omit `DH` count/LP, resign identical unsigned fields, and replay from receipt without bytes. Each failure precedes OPEN and commits/publishes/releases nothing.

- [ ] **Step 2: Capture deterministic RED**

Run signer-readiness alone and require 168 exact collected names. The nine new cases fail at the undefined v7 inventory convention, not timeout or unrelated setup.

- [ ] **Step 3: Verify before naming completed bytes**

Read once; unique-parse; materialize the exact closed v4 object; require raw equality with `J`; verify canonical signature and every authority field. Only then freeze/copy the exact bytes and compute `DH("obs-chain-signer-inventory/v1",[bytes])`.

- [ ] **Step 4: Use one digest at every boundary**

Feed only `D32(inventorySha256)` into OPEN. Recompute from bytes for the v5 challenge, nonpersistent receipt, descriptor rewind, restart, commit-unknown recovery, and cold start. Reject cached digest-only state and digest reuse after signature changes.

- [ ] **Step 5: Reprove child and parent boundaries**

Child pins but does not reinterpret the digest. Parent/coordinator independently recompute it. Preserve three exact product identities, profile-map digest, one private response, parent sole KeyObject, all-six ordering, no private logging, and no schema/path addition.

- [ ] **Step 6: Capture three GREEN runs and commit**

Require signer-readiness 168/168 per run, exact receipt bytes/hash, all inventory mutants dead, typecheck, and no product/package/migration diff.

### Task 3: Admit Annex K and macOS deployment equality

**Files:**

- Modify: `tests/architecture/fix10-boundaries.test.ts`
- Modify: `tests/unit/fixtures/fix10-gate-manifest.json`

**Interfaces:**

- Consumes: reviewed v13 helper source/header/compiler argv/build-v3/helper-v4 receipts and selected SDK raw `_string.h`.
- Produces: independently replayed `libExt1RequestSha256` and `deploymentContractSha256`; it does not build or install production bytes.

- [ ] **Step 1: Write the six exact RED cases**

Assert the literal byte-zero line and target at least 10.9. Mutate absent, line-after-include, value zero/redefinition/`-D` conflict, target 10.8, target triple, minimum-version flag, and LC_BUILD_VERSION minos independently under the six exact names.

- [ ] **Step 2: Capture deterministic RED**

Run architecture alone; require the 36 inherited names plus the six Task-3 names, 42 exact names total, and failure at missing v7 macro/order/floor/equality authority.

- [ ] **Step 3: Replay source/header ordering**

Require raw source begins with the exact LF line, has no earlier byte, and contains no undef/redefinition. Parse ordered argv and reject forced includes, relevant `-D/-U`, a competing feature-test macro, or a competing feature-test request inside the generated header. Rehash source/header/argv and the v8 request digest.

- [ ] **Step 4: Replay deployment equality**

Parse canonical `MAJOR.MINOR`, enforce at least 10.9, require exact adjacent target pair and one minimum flag, empty deployment environment, ARM64 object/executable, and one macOS LC_BUILD_VERSION with encoded tuple `(MAJOR,MINOR,0)`. Recompute deployment digest.

- [ ] **Step 5: Bind receipt and activation**

Require build-v3 and helper-v4 exact closed schemas, matching request/deployment hashes, exact build receipt hash, and V-signed activation pins. Kill missing/extra/wrong-type/old-v7 receipt and runtime-repin mutants.

- [ ] **Step 6: Capture three GREEN runs and commit**

Require architecture 42/42 per run, exact raw evidence, unchanged installed path/mode/owner and package/runtime-start/schema projections.

### Task 4: Derive wipe evidence with the sole verifier and tools

**Files:**

- Modify: `tests/architecture/fix10-boundaries.test.ts`
- Modify: `tests/integration/fix10-signer-readiness.test.ts`
- Modify: `tests/unit/fixtures/fix10-gate-manifest.json`

**Interfaces:**

- Consumes: reviewed v13 verifier bytes, Node 22 identity, exact framed source/object/executable input, exact `nm`/`otool` paths and captures.
- Produces: canonical verifier output, command set, three v7 projections, analysis receipt, build-v3 receipt, and helper-v4 activation pins.

- [ ] **Step 1: Write the seven exact derivation cases**

Add the seven architecture names in order. Independently forge output JSON, substitute one verifier byte, truncate the wipe symbol range, remove/change a branch relocation or executable stub, omit each artifact command in turn, and disagree one symbol/bound/instruction/call/minos/dependency value between parser and tool streams. Each mutant must fail before install/activation.

- [ ] **Step 2: Capture deterministic RED**

Run architecture/readiness alone. Require 49 and 168 exact collected names; failure identifies v7's missing derivation artifact/capture, never the expected projection value alone.

- [ ] **Step 3: Verify the verifier artifact and runtime**

Open the exact repository script no-follow, require Git mode/blob/path/complete bytes, derive its source hash, capture required Node 22 version, and execute the opened fd with exact argv/stdin/environment/cwd/fd/stream rules. Reject path reopen, import/dependency/network/bin/install/runtime exposure, extra output, or noncanonical error.

- [ ] **Step 4: Reproduce byte parsing and CFG**

Feed exact framed source/object/executable bytes. Independently check thin little-endian ARM64 bounds, required symbols and `[start,end)` spans, four-byte decode, object BRANCH26 relocations, executable indirect stubs, exactly two reachable memset calls, two stack intervals/taint, five predecessor classes, postdominating wipe/zero scan, and one classified return with zero bypass.

- [ ] **Step 5: Capture the fourteen exact commands**

Execute the SPEC-v8 ordered argv directly, beginning with otool find/version then nm find/version to preserve v7 identity order. Use fd 3 for the exact object/executable records; fsync and hash raw exclusive streams; derive per-stream/per-command/set hashes. Require object symbols/relocations/two disassemblies and executable symbols/loads/libraries/indirect table/two disassemblies.

- [ ] **Step 6: Require parser/tool agreement and closed receipts**

Compare every specified field without normalization beyond the pinned grammar. Materialize the exact analysis object, build-v3 receipt, helper-v4 value, and activation pin digest. Reject a claim-only projection, missing raw stream, changed fd hash, or any inequality.

- [ ] **Step 7: Reprove runtime wipe and privacy**

Retain v7 sentinel/ZERO_ACK, both full-capacity `memset_s` calls on success/errors, separate parent Buffer wipe, no second secret copy, and no artifact/private bytes in logs or receipts.

- [ ] **Step 8: Capture three GREEN runs and commit**

Require architecture 49/49 and readiness 168/168 per run, exact projection/receipt hashes, all derivation mutants dead, typecheck, no private material, and no package/product/migration change.

### Task 5: Compose inherited work, capture evidence, and stop

- [ ] **Step 1: Complete every inherited v2-v7 task not superseded here**

Preserve control topology, privilege separation, proof/KILL/ARM/status truth, immutable local/lifecycle history, gateway replay, six parent keys, owner/stage/release ordering, failure recovery, rotation, and rollback.

- [ ] **Step 2: Capture three complete focused runs**

Run the 15 manifest files in order. Each fresh process reports exactly 15 files, 425 tests, 425 passed, zero failed/skipped/todo, and the exact full-name order.

- [ ] **Step 3: Run hostile capture, package, import, schema, and privacy gates**

Require all inherited attacks; exact sole verifier path and offline-only graph; one public obsctl bin; no product/model/provider/raw-DML edge; no migration/role/grant/root/helper-path/runtime-leaf addition; exact frozen authorities; and exact v13/C3.5 ancestry.

- [ ] **Step 4: Run every v2-v8 mutant**

Every inherited mutant plus inventory-byte/digest/replay, feature-order/target/minos, verifier/source/input/output/range/relocation/stub/CFG/command/agreement/receipt/activation mutant must die by a named non-timeout assertion. Restore and rehash exact bytes after each mutation.

- [ ] **Step 5: Obtain fresh independent implementation review**

Require exact ref/tree/diff/evidence, `SPEC PASS`, `CODE QUALITY PASS`, `P0=0 P1=0 P2=0 P3=0`, and `FIX-10 C0 RESULT: PASS`. Self-review is invalid.

- [ ] **Step 6: Stop before C4 and V-only acts**

Hand reviewed C0 evidence to FIX-09. Do not build/install production helper bytes, provision, launch live processes, quiesce, apply migration, activate, rotate/recover, operate services, run acceptance, merge, push, update a board, or declare Done.

## Trace matrix

| V8 contract | Plan evidence |
|---|---|
| verified canonical completed inventory including V signature | Tasks 0 and 2, nine exact cases |
| OPEN/receipt/restart/cold-start use one inventory formula | Task 2, positive oracle and eight digest/byte/replay mutants |
| Annex K request precedes every include | Tasks 0 and 3, missing/late/conflict cases |
| target, deployment flag, and Mach-O minos equal and are at least 10.9 | Task 3, old-target/equality cases |
| one pinned verifier derives bounds/calls/buffers/CFG/exits | Tasks 0 and 4, positive case plus source/output/range/relocation mutants |
| fourteen exact artifact commands corroborate raw derivation | Task 4, missing-command and disagreement mutants |
| receipts and V activation bind every derivation hash | Tasks 0, 3, and 4 |
| all v7 properties remain and implementation stays stopped | Tasks 1 and 5 |

## V-later boundary

Only V may later supply production roots/devices/principals/groups/memberships/writer identities/compiler/SDK/Node/target/deployment/helper install/descriptors/timing/credentials/nonces/sessions/keys/activation values; stage authority; execute production artifact analysis/build/install; launch six parents; quiesce; apply migration; commit/publish activation; release/restart writers; operate services; run acceptance; accept/veto; merge; or push. No authority document or local evidence transfers those acts.
