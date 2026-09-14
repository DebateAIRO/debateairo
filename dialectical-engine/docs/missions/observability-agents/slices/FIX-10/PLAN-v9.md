# FIX-10 Inherited Wipe-Projection Digest Restoration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Do not dispatch subagents for this lane. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve v8's reproducible native-wipe evidence while restoring the exact frozen v7 wipe-projection outer domains and nested executable-instruction digest at every independent admission boundary.

**Architecture:** `SPEC-v9.md` incorporates v2-v8 and changes only three digest interpretations. The v8 verifier retains separate artifact-kind/symbol-qualified object and executable span fields; the inherited disassembly projection derives its nested instruction member under v7's domain from raw executable function bytes; Task 0 and Task 4 independently reconstruct that member and both wipe outer hashes from raw artifacts before trusting any receipt.

**Tech Stack:** Node.js 22 built-ins, TypeScript 7, pnpm 11, Vitest 4, PostgreSQL 18 fixture, reviewed `@debateai/obs-capture/chain`, Darwin C17, Xcode clang/macOS SDK/libSystem, Mach-O 64/ARM64, Ed25519/SHA-256, RFC 8785, POSIX descriptors/pipes/fsync/process primitives.

**Spec:** `docs/missions/observability-agents/slices/FIX-10/SPEC-v9.md`

## Global constraints

- FIX-10 SPEC/PLAN v1-v8 and their existing decision rows are immutable.
- This plan incorporates every PLAN-v8 task, source boundary, exact test name, mutant, receipt, rollback, and STOP rule except the single v9 digest correction.
- No source/test/package/migration edit begins before Task 0 consumes independently approved FIX-09 v13 authority, its exact independently reviewed `FIX09_C35_REVIEWED_REF`, and a fresh independently zero-finding v9 authority review.
- C3.5 still proves four live API/runner/scheduler/daemon compositions plus dormant uncalled obsctl and private non-live watchdog seams; FIX-10 C0 performs the first obsctl composition; C4 remains later.
- Production roots/devices/uids/gids/groups/identities/compiler/SDK/Node/target/deployment/descriptors/nonces/sessions/keys/timing/credentials/install/activation values are required V-later inputs with no defaults.
- No product source, FIX-07 source, migration, role, grant, database object, raw action DML, second root/helper path, public bin, runtime analyzer, signing endpoint, network helper, live act, acceptance, merge, push, board act, or Done claim is authorized.
- Tests use only explicit temporary inputs, runtime-generated keys, synthetic bounded ARM64 artifacts, captured tool streams, disposable principals/PostgreSQL, and no production private fixture.
- Every gate is capture-first with exact cwd/argv/environment/tool versions/start/end/raw streams/status, exclusive evidence paths, exact names/count/order/status, and three fresh GREEN runs.

## Frozen evidence

| Contract | Immutable source |
|---|---|
| object and disassembly projection schemas, nested instruction digest, and two outer domains | FIX-10 `SPEC-v7.md` lines 415-456 |
| canonical signed inventory, Annex K/deployment, sole verifier, raw commands, and closed receipts | FIX-10 `SPEC-v8.md` §§2-4 |
| parent/child, owner, stage, OPEN, close/release, and recovery | FIX-10 `SPEC-v5.md` through `SPEC-v7.md` |
| one rejected digest conflict | `fix10-control-authority-sol-review-round7.md`, SHA-256 `1ac9fad7a2c91647ae02a121eaa7de9f8739382900e0e444bd31dcd353519600` |

## Exact source and test boundary

The future FIX-09 v13 paths remain exactly those in PLAN-v8. Relevant to this correction:

| Path | Responsibility |
|---|---|
| `packages/obs-capture/scripts/verify-fix09-native-wipe.mjs` | derive raw symbol spans, distinct object/executable span hashes, frozen nested instruction hash, canonical projections, and all outer hashes |
| `packages/obs-capture/src/chain/private-key-helper.ts` | independently validate verifier output and build-v3/helper-v4 receipt members; never select a domain from candidate evidence |
| FIX-09-owned architecture/readiness tests | kill all three exact digest mutants against raw source/object/executable inputs |

After Task 0, the relevant FIX-10 paths remain:

| Path | Responsibility |
|---|---|
| `tools/obs-listener/src/obsctl/signer-inventory.ts` | preserve inherited signed receipt/pin validation; accept only the Task-0-admitted exact projection values and never reinterpret their domains |
| `tools/obs-listener/src/obsctl/signer-readiness.ts` | require exact Task-0-admitted v9 digest equality before first obsctl OPEN/session composition |
| `tools/obs-listener/src/obsctl/chain-bootstrap.ts` | preserve inherited signed receipt/pin and installed-binary validation on commit-unknown/restart; never execute the nonshipping verifier at runtime |
| `tests/unit/fix10-authority-gate.test.ts` | exact v9 authority/ref/review gate and independent Task-0 oracle |
| `tests/architecture/fix10-boundaries.test.ts` | Task-4 raw-byte oracle and exact three mutation subcases |
| `tests/unit/fixtures/fix10-gate-manifest.json` | exact 15-file/426-name manifest |

No FIX-10 runtime imports the verifier, implements a second parser, changes a product path, or gains native build/install authority.

## Exact formulas and computation order

Both Task 0 and Task 4 implement independent code paths that start from admitted raw object/executable bytes and reproduce:

~~~text
RAW_FUNCTION_INSTRUCTION_BYTES = RAW_EXECUTABLE_WIPE_SPAN

function_instructions_sha256 = DH("obs-chain-helper-wipe-instructions/v1",[RAW_FUNCTION_INSTRUCTION_BYTES])

wipe_object_projection_sha256 =
  DH("obs-chain-helper-wipe-object/v1",[J(WIPE_VERIFIER_OUTPUT.wipe_object_projection)])

wipe_disassembly_projection_sha256 =
  DH("obs-chain-helper-wipe-disassembly/v1",[J(WIPE_VERIFIER_OUTPUT.wipe_disassembly_projection)])
~~~

Each path first rederives bounds/spans, separately computes v8's artifact-qualified object/executable span fields, places only the v7 nested digest into the inherited disassembly projection, materializes both canonical projection objects, and then computes the two outer hashes. Neither imports, calls, serializes through, or shares a formula helper with the other; neither accepts a candidate domain string, supplied projection, supplied nested digest, or stored receipt as an oracle. The unchanged Mach-O projection uses `obs-chain-helper-macho-projection/v1` and is independently recomputed in the same pass.

## Exact successor capture manifest

All 425 v8 reporter names remain exact. Append only `accepts_exact_v9_authority_review` to `tests/unit/fix10-authority-gate.test.ts`; no new architecture reporter is needed because the three mutations are exact sequential subcases of the existing `rejects_forged_wipe_verifier_output` assertion.

| File | Count |
|---|---:|
| `tests/unit/fix10-authority-gate.test.ts` | 12 |
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

Arithmetic is exact: `425 + 1 = 426`.

The mutation evidence uses these exact ids, in order:

~~~text
wrong_wipe_object_projection_outer_domain
wrong_wipe_disassembly_projection_outer_domain
nested_arm64_span_digest_substitution
~~~

They are nested evidence records, not reporter assertions. Each record must include exact before/after canonical bytes, expected/actual digests, first refusal code, unchanged-field proof, and zero install/activation/publication.

---

### Task 0: Admit exact v9 and reviewed v13/C3.5 facts

**Files:**

- Modify: `tests/unit/fix10-authority-gate.test.ts`
- Modify: `tests/unit/fixtures/fix10-gate-manifest.json`
- Create outside product tree: `../.superpowers/sdd/PLAN-FixAgent/fix10-implementation-admission.report`

**Interfaces:**

- Consumes: exact approved v13 authority/ref, reviewed C3.5 receipt/ref with raw artifact descriptors/captures, exact v9 ref/tree/review, frozen v1-v8 hashes.
- Produces: fact-only `Fix10Admission`; it carries no signer, key, path, fd, process, raw private byte, or live capability.

- [ ] **Step 1: Capture the present hard stop**

Require independently approved v13, exact `FIX09_C35_REVIEWED_REF`, and a v9 zero-finding review. Until all exist, return `FIX10_C35_SIGNER_BARRIER_UNAVAILABLE` with zero implementation action.

- [ ] **Step 2: Write and capture the v9 authority RED case**

Append `accepts_exact_v9_authority_review`; require exact v9 commit/tree/three-path diff, one decision append, frozen v1-v8, independent reviewer identity, and the five exact PASS/zero/NO lines. Run authority gate alone and require 12 collected names with failure only at absent v9 approval.

- [ ] **Step 3: Independently derive all inherited digest members from raw bytes**

Without calling Task 4 code, open admitted raw object/executable descriptors, repeat v8 bounds and parser/tool checks, define the executable raw function bytes, compute frozen nested instruction hash, materialize canonical object/disassembly projections, and compute both exact outer hashes. Also rederive the unchanged Mach-O projection hash. Compare raw-derived values to verifier output, analysis receipt, build-v3, helper-v4, activation, restart, and cold-start evidence.

- [ ] **Step 4: Run the three convention mutants against the Task-0 oracle**

For each exact mutant id, alter only the named formula/member, recompute every downstream value and ephemeral signature, and require Task 0's raw-byte oracle to return the exact digest mismatch before OPEN with zero install/activation/publication. Reject stale-value, wrong-target, early-failure, and candidate-oracle mutation fixtures as invalid tests.

- [ ] **Step 5: Capture three GREEN runs and commit**

Require 12/12 exact names per fresh process, all three mutation records, frozen v1-v8 hashes, and no source/product/package/migration/native/live diff.

### Task 1: Preserve all v8 and v7 behavior

**Files:**

- Test: the exact 15 manifest paths above; this task adds no reporter name.

**Interfaces:**

- Consumes: every incorporated v2-v8 rule and all 425 v8 reporter names.
- Produces: unchanged inventory, Annex K, deployment, verifier, commands, parser/tool agreement, receipts, custody, stages, release, gateway, recovery, topology, privilege, rollback, and STOP evidence.

- [ ] **Step 1: Capture inherited evidence before digest work**

Require all 425 v8 names or the explicit current authority-gate stop. Compare every v1-v8 document hash and reject silent source/test/package/migration changes.

- [ ] **Step 2: Reprove inherited evidence after Tasks 0 and 4**

Run authority, readiness, architecture, capture, and product-invariance files; require every inherited name and receipt field with no weakened verifier, command, macro, target, owner, session, or release assertion.

### Task 2: Preserve canonical inventory binding

Execute PLAN-v8 Task 2 unchanged. The exact signed `COMPLETED_INVENTORY_BYTES`, OPEN `D32`, receipt, restart, commit-unknown, cold-start, and nine mutants remain mandatory. No projection correction changes inventory bytes or its domain.

### Task 3: Preserve Annex K and deployment admission

Execute PLAN-v8 Task 3 unchanged. The byte-zero feature request, selected SDK guard, macOS 10.9 floor, target/flag/Mach-O minos equality, build-v3/helper-v4 bindings, and six exact architecture assertions remain mandatory.

### Task 4: Restore raw-derived wipe digests in verifier and admission

**Files:**

- Modify: `tests/architecture/fix10-boundaries.test.ts`
- Modify: `tests/integration/fix10-signer-readiness.test.ts`
- Modify: `tests/unit/fixtures/fix10-gate-manifest.json`
- Future FIX-09 v13 implementation/review owns: `packages/obs-capture/scripts/verify-fix09-native-wipe.mjs`, `packages/obs-capture/src/chain/private-key-helper.ts`, and their FIX-09 tests.

**Interfaces:**

- Consumes: exact v8 raw helper/object/executable bytes, symbol bounds, command streams, verifier bytes/runtime, `J/DH/UTF8`, and frozen v7 projection schemas.
- Produces: distinct v8 object/executable span fields plus exact v7 nested instruction, object outer, disassembly outer, and unchanged Mach-O projection hashes.

- [ ] **Step 1: Extend the existing RED assertion with three exact subcases**

Inside only `rejects_forged_wipe_verifier_output`, execute the three mutation ids in manifest order. Recompute all downstream values and signatures after each change. Require the current v8 convention ambiguity to fail the new fixed-formula oracle, not a stale hash, malformed fixture, timeout, or unrelated check; reporter count stays 49.

- [ ] **Step 2: Capture deterministic RED**

Run architecture/readiness alone. Require 49 and 168 exact reporter names and exactly three nested mutation records. Each RED reaches its intended digest comparison and shows zero install/activation/publication.

- [ ] **Step 3: Keep v8 span hashes in distinct output fields**

From raw admitted bounds, compute artifact-kind/symbol-qualified object and executable wipe-span values and store them only in `WIPE_VERIFIER_OUTPUT.object.wipe_instruction_sha256` and `.executable.wipe_instruction_sha256`. Assert neither is read while materializing the inherited nested member.

- [ ] **Step 4: Independently recompute all three inherited domains**

Without importing or calling Task 0 code, set `RAW_FUNCTION_INSTRUCTION_BYTES` to the exact executable wipe span; compute `DH("obs-chain-helper-wipe-instructions/v1",[RAW_FUNCTION_INSTRUCTION_BYTES])`; materialize the inherited disassembly projection with that member; and compute the object/disassembly outer hashes under `obs-chain-helper-wipe-object/v1` and `obs-chain-helper-wipe-disassembly/v1`. Recompute the unchanged Mach-O projection in the same raw pass.

- [ ] **Step 5: Bind every downstream receipt and recovery path**

Compare Task 4's raw-derived values to canonical verifier output, artifact-analysis receipt, build-v3 receipt, helper-v4 pins, V activation, restart, commit-unknown recovery, and cold start. Refuse a supplied/cached projection or digest and any forbidden outer-domain string outside mutation code.

- [ ] **Step 6: Kill all three mutants non-circularly**

Require exact before/after byte proof, targeted digest change, unchanged unrelated fields, downstream recomputation, the expected raw-oracle mismatch, and zero install/activation/publication for each id. Restore and rehash baseline bytes after each mutation.

- [ ] **Step 7: Capture three GREEN runs and commit**

Require architecture 49/49 and readiness 168/168 per fresh process, exact nested mutation records, all inherited v8 cases, typecheck, no private bytes, and no package/product/migration change.

### Task 5: Compose, review, and stop

- [ ] **Step 1: Complete all incorporated v2-v8 tasks not superseded here**

Preserve single-root control topology, proof/KILL/ARM/status truth, immutable local/lifecycle history, gateway replay, six parent keys, owner/stage/release ordering, failure recovery/rotation/rollback, inventory binding, and reproducible native evidence.

- [ ] **Step 2: Capture three complete focused runs**

Run the 15 manifest files in order. Each fresh process reports exactly 15 files, 426 tests, 426 passed, zero failed/skipped/todo, and exact full-name order plus three nested mutation records.

- [ ] **Step 3: Run hostile capture, import, schema, privacy, and mutant gates**

Require one nonshipping verifier, fourteen artifact commands, both independent raw-byte oracles, all three v9 mutants, all v2-v8 mutants, frozen authorities, no migration/role/grant/root/path/bin/raw-DML expansion, and no product runtime/analyzer import.

- [ ] **Step 4: Obtain fresh independent implementation review**

Require exact ref/tree/diff/evidence, `SPEC PASS`, `CODE QUALITY PASS`, `P0=0 P1=0 P2=0 P3=0`, and `FIX-10 C0 RESULT: PASS`. Self-review is invalid.

- [ ] **Step 5: Stop before C4 and V-only acts**

Hand reviewed C0 evidence to FIX-09. Do not build/install production helper bytes, provision, quiesce, migrate, activate, release/restart writers, operate services, run acceptance, merge, push, update a board, or declare Done.

## Trace matrix

| V9 contract | Plan evidence |
|---|---|
| v8 span hashes remain distinct output evidence | Task 4 Steps 3-4 |
| frozen nested instruction formula uses raw executable span | Task 0 Step 3 and Task 4 Step 4 |
| frozen object/disassembly outer formulas are restored | Task 0 Step 3 and Task 4 Step 4 |
| Task 0 and Task 4 are independent raw-byte oracles | exact formulas section; Task 0 Steps 3-4; Task 4 Steps 4-6 |
| both forbidden outer domains and nested substitution die | Task 0 Step 4 and Task 4 Steps 1, 2, and 6 |
| all three v8 fixes and prior v7 corrections remain | Tasks 1-3 and Task 5 |
| implementation remains stopped | Global constraints and Task 5 Step 5 |

## V-later boundary

Only V may later supply production roots/devices/principals/groups/memberships/writer identities/compiler/SDK/Node/target/deployment/helper install/descriptors/timing/credentials/nonces/sessions/keys/activation values; stage authority; execute production artifact analysis/build/install; launch six parents; quiesce; apply migration; commit/publish activation; release/restart writers; operate services; run acceptance; accept/veto; merge; or push. No authority document or local evidence transfers those acts.
