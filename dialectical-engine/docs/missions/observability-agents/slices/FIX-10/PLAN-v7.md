# FIX-10 Executable Native Custody Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Do not dispatch subagents for this lane. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compose the future reviewed FIX-09 v13 custody seam with the controlling V owner, an acyclic stage gate, canonical session frames and receipt hashes, executable release order, and independently provable native zeroization.

**Architecture:** `SPEC-v7.md` incorporates v2-v6 and corrects only six rejected clauses. The helper is V_PROVISIONER_UID-owned; C3.5 composes four existing writers while proving dormant obsctl and private watchdog seams; one canonical OPEN establishes every session binding; CLOSE_RELEASE writes ACK before response close; every build/profile/pin hash uses one domain-separated length-prefixed preimage; and the pure-Darwin child uses mandatory `memset_s` with source/object/disassembly/runtime evidence.

**Tech Stack:** Node.js 22, TypeScript 7, pnpm 11, Vitest 4, PostgreSQL 18 fixture, reviewed `@debateai/obs-capture/chain`, Darwin C17, Xcode clang/macOS SDK/libSystem, Ed25519/SHA-256, RFC 8785, POSIX descriptors/pipes/fsync/process primitives.

**Spec:** `docs/missions/observability-agents/slices/FIX-10/SPEC-v7.md`

## Global constraints

- FIX-10 SPEC/PLAN v1-v6 and their existing decision rows are immutable.
- This plan incorporates every PLAN-v6 task/name/mutant/receipt/rollback/STOP rule except the six exact v7 replacements.
- No source/test/package/migration edit begins before Task 0 consumes independently approved FIX-09 v13 authority, its exact independently reviewed `FIX09_C35_REVIEWED_REF`, and a fresh independently zero-finding v7 authority review.
- C3.5 evidence contains exactly four live writer compositions, one dormant uncalled obsctl session capability, and one private non-live watchdog seam. FIX-10 C0 performs the first obsctl composition.
- Production roots/devices/uids/gids/groups/identities/compiler/SDK/target/deployment target/descriptors/nonces/sessions/keys/timing/credentials/install/activation values are required V-later inputs with no defaults.
- No product source, FIX-07 source, migration, role, grant, database object, raw action DML, second root/helper path, public bin, signing endpoint, network helper, live act, acceptance, merge, push, board act, or Done claim is authorized.
- Tests use explicit temporary roots/identities, runtime-generated keys, ephemeral nonsuid helpers, anonymous pipes, controlled child failures, disposable principals/PostgreSQL, and no private fixture.
- Every gate is capture-first with exact cwd/argv/environment/tool versions/start/end/raw streams/status, exclusive evidence paths, exact names/count/order/status, and three fresh GREEN runs.

## Frozen evidence

| Contract | Immutable source |
|---|---|
| V_PROVISIONER_UID ownership topology | FIX-10 `SPEC-v3.md` §§3-4 |
| six signers, v5 public barrier, and v6 bounded child | FIX-10 `SPEC-v4.md` through `SPEC-v6.md` |
| deferred `obsctl_action` and C3.5 → C0 → C4 order | FIX-09 `SPEC-v12.md` §5 and `PLAN-v12.md` C3.5 ledger |
| six rejected clauses | `fix10-control-authority-sol-review-round5.md`, SHA-256 `d0b20e0e4dee4480a5fe5cd1f9425fddb05961ae9126f922ac5e05e1270e40b7` |
| Darwin primitive availability | selected SDK `usr/include/_string.h` declaration of `memset_s`; v7 receipt pins the selected raw header |

## Ownership and source map

FIX-09 v13/C3.5, not FIX-10, owns and must independently review these exact implementation surfaces:

| Path | Required v13/C3.5 responsibility |
|---|---|
| `packages/obs-capture/native/fix09-openat-read.c` | pure-Darwin custodian, exact OPEN/CHECK/CLOSE wire, V-owner self-check, fd lifecycle, direct `memset_s`, and compile-time six-profile table |
| `packages/obs-capture/src/chain/private-key-helper.ts` | activation-pinned spawn, anonymous-pipe framing, parent Buffer wipe, child liveness, and source/build/binary/profile/pin validation |
| `packages/obs-capture/src/chain/signer.ts` | parent-owned sole `KeyObject`, opaque `PinnedSignerSession`, four live writer compositions, dormant obsctl capability, and private watchdog seam |
| `packages/obs-capture/src/chain/index.ts` | only the reviewed closed gateway/session capability and type exports; no sign/key/path/raw-descriptor export |
| `packages/obs-capture/package.json` | the one existing `./chain` export; no native build/install hook or new public executable |
| product and daemon entry paths already authorized by FIX-09 | compose only API, runner, scheduler, and daemon at C3.5; no obsctl call and no watchdog operation |
| FIX-09-owned key/helper/lifecycle/architecture tests | exact profile, owner, wire, build/install/hash/wipe, dormant-capability, and four-composition receipts |

After Task 0, FIX-10 may modify only these inherited implementation surfaces:

| Path | FIX-10 responsibility |
|---|---|
| `tools/obs-listener/src/obsctl/signer-readiness.ts` | first obsctl session composition and coordination of six opaque parent sessions; never load/export a key |
| `tools/obs-listener/src/obsctl/signer-inventory.ts` | exact inventory/profile-map and v13 helper-pin validation |
| `tools/obs-listener/src/obsctl/chain-bootstrap.ts` | precommit abort, DB/file parity, all-six CHECK/CLOSE, and ordered parent release |
| `tools/obs-listener/src/obsctl/lifecycle-executor.ts` | compose the existing V-only lifecycle executor without a new authority edge |
| `tools/obs-listener/package.json` | retain exactly one public `obsctl` bin and add no native hook/dependency |
| `tests/fixtures/fix10-principal-probe.mjs` | non-live principal/session probe only |
| the exact 15 test files in the successor capture manifest | v7 capture-first gates and all inherited v2-v6 cases |

Task 2 performs the first `obsctl_action` composition. No FIX-10 source imports the native helper privately or implements a substitute builder/installer.

## Exact successor capture manifest

The v7 manifest contains exactly 402 reporter assertions across the same 15 files as v6:

| File | Count |
|---|---:|
| `tests/unit/fix10-authority-gate.test.ts` | 10 |
| `tests/unit/fix10-capture-gate.test.ts` | 8 |
| `tests/unit/fix10-control-root.test.ts` | 12 |
| `tests/integration/fix10-principal-boundary.test.ts` | 15 |
| `tests/unit/fix10-authority-crypto.test.ts` | 15 |
| `tests/unit/fix10-proof-gap-window.test.ts` | 28 |
| `tests/unit/fix10-local-history.test.ts` | 21 |
| `tests/integration/fix10-chain-lifecycle.test.ts` | 40 |
| `tests/integration/fix10-signer-readiness.test.ts` | 159 |
| `tests/integration/fix10-commands.test.ts` | 12 |
| `tests/integration/fix10-status.test.ts` | 14 |
| `tests/integration/fix10-reconcile.test.ts` | 20 |
| `tests/integration/fix10-daemon-control.test.ts` | 8 |
| `tests/architecture/fix10-boundaries.test.ts` | 36 |
| `tests/integration/fix10-product-invariance.test.ts` | 4 |

All 369 v6 names remain exact. Append `accepts_exact_v7_authority_review` to the authority gate.

Append these seven principal-boundary names:

~~~text
rejects_helper_owner_obsctl_uid
rejects_helper_owner_api_writer_uid
rejects_helper_owner_runner_writer_uid
rejects_helper_owner_scheduler_writer_uid
rejects_helper_owner_daemon_uid
rejects_helper_owner_watchdog_uid
rejects_undefined_legacy_helper_owner
~~~

Append these thirteen signer-readiness names:

~~~text
rejects_open_barrier_id_mismatch
rejects_open_nonce_mismatch
rejects_open_session_id_mismatch
rejects_open_slot_or_profile_mismatch
rejects_open_activation_or_keyring_digest_mismatch
rejects_open_inventory_or_profile_map_digest_mismatch
rejects_nonmonotonic_opcode_or_ordinal
rejects_first_command_session_rebinding
rejects_closed_ack_after_response_close
rejects_closed_ack_before_leaf_close
rejects_missing_response_eof_after_closed_ack
rejects_extra_response_byte_after_closed_ack
rejects_zero_exit_before_closed_ack_is_fully_read
~~~

Append these twelve architecture names:

~~~text
rejects_called_c35_obsctl_composition
rejects_absent_deferred_obsctl_session_capability
rejects_source_or_generated_header_preimage_mutant
rejects_profile_template_runtime_map_hash_conflation
rejects_compiler_or_sdk_capture_preimage_mutant
rejects_nul_unsafe_or_reordered_argv_preimage
rejects_output_or_macho_projection_preimage_mutant
rejects_build_receipt_or_activation_pin_preimage_mutant
requires_memset_s_and_compile_failure_without_declaration
rejects_ordinary_memset_or_fallback_zeroizer
requires_object_disassembly_and_runtime_zero_ack
rejects_partial_error_wipe_omission_or_second_secret_copy
~~~

Arithmetic is exact: `369 + 1 + 7 + 13 + 12 = 402`.

---

### Task 0: Admit exact v7 and acyclic reviewed FIX-09 authority

**Files:**

- Modify: `tests/unit/fix10-authority-gate.test.ts`
- Modify: `tests/unit/fixtures/fix10-gate-manifest.json`
- Create outside product tree: `../.superpowers/sdd/PLAN-FixAgent/fix10-implementation-admission.report`

**Interfaces:**

- Consumes: exact independently approved FIX-09 v13 authority/ref, reviewed C3.5 ref/result/receipts, exact v7 ref/tree/review.
- Produces: frozen fact-only `Fix10Admission`; it carries no signer, key, path, descriptor, or live capability.

- [ ] **Step 1: Capture the present hard stop**

Require the v13 authority and C3.5 implementation identifiers plus v7 review. The present expected result is `FIX10_C35_SIGNER_BARRIER_UNAVAILABLE`. V12, v6 review, missing receipt, or unresolved P0-P3 cannot pass.

- [ ] **Step 2: Add the v7 authority RED case**

Require exact v7 ref/tree/diff, one decision append, frozen predecessors, independent reviewer identity, and the five exact PASS/zero/NO lines. Mutate any binding and require refusal.

- [ ] **Step 3: Enforce the acyclic stage receipt**

Require live composition evidence for only API, runner, scheduler, and daemon; a present but zero-call/zero-entry-import dormant obsctl profile/session contract; a private non-live watchdog seam rejected by the row API; and exact C3.5 → C0 → C4 order. Reject an already-called obsctl composition and an absent dormant obsctl capability.

- [ ] **Step 4: Admit owner, wire, release, hash, and wipe facts**

Require V_PROVISIONER_UID at every helper check; exact OPEN/private/ZERO_ACK/CHECK/CLOSE frame schemas and ordinals; exact fd/ACK/EOF/stderr/exit trace; every DH/J/ARGV formula and closed receipt; direct `memset_s`, unavailable-declaration compile failure, object/disassembly projections, runtime sentinel/ZERO_ACK, and parent Buffer wipe.

- [ ] **Step 5: Capture three GREEN runs and commit**

Run the authority-gate file alone through the existing capture runner. Require one file, ten exact names, ten passed, zero failed/skipped/todo on each run. Commit only after all immutable external receipts exist.

### Task 1: Preserve v5 gateway and inherited v6 session facts

Execute inherited PLAN-v5 Tasks 1-2 and every v6 session fact not changed by v7. Reprove materialized JSONB gateway replay, exact six profiles, one private frame, parent sole `KeyObject`, child retained leaf capability, no signing/path/network opcode, and all prior failure/recovery laws.

### Task 2: Perform the first obsctl composition and establish OPEN

**Files:**

- Modify: `tools/obs-listener/src/obsctl/signer-readiness.ts`
- Modify: `tools/obs-listener/src/obsctl/signer-inventory.ts`
- Modify: `tests/integration/fix10-signer-readiness.test.ts`
- Modify: `tests/fixtures/fix10-principal-probe.mjs`

**Interfaces:**

- Consumes: reviewed dormant `obsctl_action` and private watchdog session capabilities plus the four reviewed C3.5 writer compositions.
- Produces: first authorized obsctl session composition and six logical parent sessions whose children have accepted exact OPEN and returned PRIVATE_RESPONSE/ZERO_ACK.

- [ ] **Step 1: Write the eight OPEN/session RED tests**

Mutate barrier, nonce, session id, slot/profile, activation/keyring digests, inventory/profile-map digests, opcode/ordinal, and first CHECK BIND. Require rejection before private open or metadata response, exact child cleanup, and zero activation events.

- [ ] **Step 2: Capture RED against the v6/v12 seams**

Run readiness alone and require 159 exact names collected. Failure must identify absent canonical OPEN/session establishment or the deferred obsctl composition, never a timeout.

- [ ] **Step 3: Compose obsctl without changing C3.5 history**

Call the reviewed dormant `obsctl_action` session capability only in the FIX-10 C0-owned obsctl path. Prove no C3.5 source/ref/receipt changes, no public watchdog row profile, and no product/runtime-start ABI edit.

- [ ] **Step 4: Encode and validate exact OPEN**

Build BIND from verified canonical values; encode the one 0x01/ordinal-0 frame with three LP8 identities; send once. Child validates owner/self/pins/map and stores immutable BIND before private open. Kill length, NUL, identity order/cap/regex, slot-profile, replay, extra setup, and first-command-learning mutants.

- [ ] **Step 5: Accept one private response and ZERO_ACK**

Require exact 0x81/ordinal-0 then 0x82/ordinal-1, identical BIND, PKCS#8 length 1..256, exact OBSERVED, secret count 2, call count 2, and mask 0x03. Construct the one parent `KeyObject`, wipe the parent Buffer in `finally`, and admit no third response.

- [ ] **Step 6: Drive strict CHECK ordinals**

Send readiness 0x02/1, commit 0x03/2, release 0x04/3, and later close 0x06/4. Require matching child opcodes/ordinals 2..5 and exact BIND/extra bodies. Reject duplicate, skipped, reordered, stale, rebound, extra, or trailing frame.

- [ ] **Step 7: Capture three GREEN runs and commit**

Require 159/159 each run, exact child/process cleanup, zero private material, and package typecheck.

### Task 3: Enforce V ownership and executable release order

**Files:**

- Modify: `tools/obs-listener/src/obsctl/chain-bootstrap.ts`
- Modify: `tools/obs-listener/src/obsctl/lifecycle-executor.ts`
- Modify: `tests/integration/fix10-principal-boundary.test.ts`
- Modify: `tests/integration/fix10-chain-lifecycle.test.ts`
- Modify: `tests/integration/fix10-signer-readiness.test.ts`

- [ ] **Step 1: Write seven owner-substitution RED cases**

At parent validation, child self-check, receipt replay, activation parity, recovery, and cold start, substitute OBSCTL, each product writer, daemon, watchdog, and undefined legacy owner. Require refusal before private open/release and unchanged root/database/history.

- [ ] **Step 2: Write five close-order RED cases**

Inject ACK after response close, ACK before leaf close, missing response EOF, one extra byte after ACK, and child zero exit before parent fully reads ACK. Require no parent activation and exact precommit/postcommit outcome.

- [ ] **Step 3: Capture RED**

Run principal, lifecycle, and readiness files. Require 15, 40, and 159 exact names; failures must arise at stale owner or impossible v6 close ordering.

- [ ] **Step 4: Validate V owner at every boundary**

Compare helper owner to the required V_PROVISIONER_UID in parent/child/install receipt/activation/recovery/cold-start code. Forbid a legacy alias. Require immutable owner through opened executable metadata and signed pins.

- [ ] **Step 5: Implement the exact close trace**

After verified CHECK release, child closes leaf, parent directory, and control in order; wipes protocol state; writes exact CLOSED_ACK on open response; closes response; writes no stderr; exits zero. Parent requires ACK → response EOF → empty stderr EOF → normal zero exit, then records custody closed.

- [ ] **Step 6: Preserve all-six barrier and failure truth**

Do not activate any parent until all six close traces pass. Preserve precommit zero state, DB-committed/file-pending, post-parity durability-unknown, ordered parent activation, and forward cold-start recovery without false rollback.

- [ ] **Step 7: Capture three GREEN runs and commit**

Require principal 15/15, lifecycle 40/40, readiness 159/159, exact event order, no leaked fd/process/private byte, and typecheck.

### Task 4: Prove canonical build and activation hashes

**Files:**

- Modify: `tests/architecture/fix10-boundaries.test.ts`
- Modify: `tests/unit/fixtures/fix10-gate-manifest.json`

- [ ] **Step 1: Write the six hash-domain RED assertions**

For source/header, template/map, compiler/SDK, argv, output/Mach-O, and receipt/activation pairs, compute the exact SPEC-v7 DH/J/ARGV oracle. Feed alternate domain, missing LP/count, NUL/shell argv, newline conversion, hex-text digest, unordered projection, self-including receipt, and untagged SHA mutants.

- [ ] **Step 2: Capture RED**

Run architecture alone; require 36 exact names and failures at v6 ambiguous preimages.

- [ ] **Step 3: Materialize exact v13 authority bytes**

Read only the reviewed v13 source, complete generated header, ordered normalized compiler argv, Mach-O parser source, and closed schemas. Recompute their domain hashes; no runtime generation or undocumented byte enters the build.

- [ ] **Step 4: Capture compiler and SDK identities**

Execute the direct absolute compiler `--version` and `/usr/bin/xcrun --sdk macosx --show-sdk-path` with empty environment/cwd `/`; retain raw stdout/stderr/status. Hash the selected raw SDKSettings/SystemVersion files in exact field order.

- [ ] **Step 5: Reproduce two builds and parse output**

Build in two fresh mode-0700 roots from identical admitted input. Normalize only build-root argv members, require byte-identical Mach-O, compute output hash, parse the exact closed file-order/sorted-symbol projection, and require libSystem as the sole external dependency.

- [ ] **Step 6: Verify build receipt and activation pins**

Materialize exact build-v2 receipt, compute its DH, materialize helper-v3 pins with V_PROVISIONER_UID, compute final activation pin DH excluding the final field, and compare signed activation bytes. Reject every extra/missing/reordered/wrong-type field or runtime repin.

- [ ] **Step 7: Capture three GREEN runs and commit**

Require 36/36 each run plus unchanged migration/ACL/root/bin/package/runtime-start projections.

### Task 5: Prove non-elidable zeroization

**Files:**

- Modify: `tests/architecture/fix10-boundaries.test.ts`
- Modify: `tests/integration/fix10-signer-readiness.test.ts`

- [ ] **Step 1: Write four wipe-evidence RED assertions**

Mutate direct `memset_s` to ordinary memset/fallback, remove the SDK declaration, omit cleanup after partial-write/early errors, and add a second secret copy. Require compile/source/object/disassembly/runtime/evidence refusal by the four exact architecture names.

- [ ] **Step 2: Capture RED**

Run architecture/readiness alone and require failures because v6 lacks a non-elidable call/projection and ZERO_ACK.

- [ ] **Step 3: Implement exactly two secret buffers and cleanup**

Use fixed 256-byte read and 768-byte frame allocations only. Call `memset_s` over full capacities on every success/error path and require zero returns. Use the frame buffer with an offset for partial writes; allocate no scratch copy.

- [ ] **Step 4: Enforce compile-time availability**

Include the selected declaration, take a typed function address, compile with implicit-declaration errors, and define no fallback/macro/dlsym path. Compile a declaration-removed mutant and require nonzero status before link/output.

- [ ] **Step 5: Prove object/disassembly/runtime behavior**

Verify one unresolved libSystem `_memset_s`, two direct call sites, closed cleanup reachability, no secret ordinary memset/fallback, sentinel-filled full buffers, volatile all-zero scans, and exact ZERO_ACK. Kill missing success, partial-write, early-error, and second-copy mutants.

- [ ] **Step 6: Reprove parent wipe and privacy**

Alias the parent test Buffer, inject success/parser/KeyObject failures, require `fill(0)` in `finally`, and scan all stdout/stderr/evidence/fixtures for ephemeral DER absence.

- [ ] **Step 7: Capture three GREEN runs and commit**

Require architecture 36/36 and readiness 159/159 per run, no private material, exact object/projection hashes, and typecheck.

### Task 6: Compose inherited work, capture evidence, and stop

- [ ] **Step 1: Complete every inherited v5/v6 task not superseded here**

Preserve single-root control, privilege separation, proof, KILL/ARM/status truth, immutable local/lifecycle history, gateway replay, six parent keys, rollback, and all prior mutants.

- [ ] **Step 2: Capture three complete focused runs**

Run the 15 manifest files in order. Each fresh process reports exactly 15 files, 402 tests, 402 passed, zero failed/skipped/todo, with exact full-name order.

- [ ] **Step 3: Run hostile capture, package, import, schema, and privacy gates**

Require all inherited capture attacks; one public obsctl bin; reviewed package surface; no product/model/provider/raw-DML edge from FIX-10; no migration/role/grant/root/helper-path addition; no private material; exact frozen authorities; and exact v13/C3.5 ancestry.

- [ ] **Step 4: Run every v2-v7 mutant**

Every inherited mutant plus owner/cycle/OPEN/ordinal/fd/ACK/hash/preimage/memset_s/object/disassembly/ZERO_ACK/parent-wipe mutant must die by a named non-timeout assertion. Restore and rehash exact bytes after each mutation.

- [ ] **Step 5: Obtain fresh independent implementation review**

Require exact ref/tree/diff/evidence, `SPEC PASS`, `CODE QUALITY PASS`, `P0=0 P1=0 P2=0 P3=0`, and `FIX-10 C0 RESULT: PASS`. Self-review is invalid.

- [ ] **Step 6: Stop before C4 and V-only acts**

Hand reviewed C0 evidence to FIX-09. C4 remains blocked until compatibility/V bootstrap receipts pass. Do not build/install production helper bytes, provision, launch live processes, quiesce, apply migration, activate, rotate/recover, operate services, run acceptance, merge, push, update a board, or declare Done.

## Trace matrix

| V7 contract | Plan evidence |
|---|---|
| V_PROVISIONER_UID sole helper owner | Tasks 0 and 3, seven substitution cases |
| four live C3.5 writers plus dormant obsctl/private watchdog | Tasks 0 and 2, both direction mutants |
| OPEN fixes every session binding before private open | Task 2, eight frame/session cases |
| exact fds and ACK-before-close success trace | Task 3, five order cases and event trace |
| canonical source/build/header/tool/argv/output/receipt/map/pin hashes | Task 4, six paired oracle groups |
| non-elidable child wipe plus parent Buffer wipe | Task 5, compile/object/disassembly/runtime/privacy evidence |
| every v5/v6 property not superseded remains | Tasks 1 and 6 |
| implementation and production remain stopped | Task 0 present refusal and Task 6 handoff |

## V-later boundary

Only V may later supply production root/device/principals/groups/memberships/writer identities/compiler/SDK/target/deployment target/helper install/descriptors/timing/credentials/nonces/sessions/keys/activation values; stage authority; install the reviewed helper; launch six parents; quiesce; apply migration; commit/publish activation; release/restart writers; operate services; run acceptance; accept/veto; merge; or push. No authority document or local evidence transfers those acts.
