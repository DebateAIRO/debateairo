# FIX-09 C3.5/C4 Ed25519 audit chain — corrected implementation plan

> **Successor plan, 2026-09-05, fix round 1.** Execute only after SPEC-v5 and this plan receive fresh independent approval. SPEC-v4/PLAN-v4 and their decision row are immutable evidence. SPEC-v5 is the controlling successor. All PLAN-v4 commands and stage lists are superseded where this plan is more specific.

**Goal:** Admit the reviewed writer lines into one reproducible baseline, implement the per-writer Ed25519 chain and all current gateways, independently approve C3.5, consume separately approved FIX-10 C0, then implement the read-only verifier and witness journal.

**Architecture:** `@debateai/obs-capture/chain` exclusively owns canonicalization, signing, activation/key validation, locks, and occurrence/action writes. Migration `0064` supplies additive chain columns, forward-only constraints, activation state, bounded probe/head routines, and exact ACLs. C4 verifies a read-only PostgreSQL snapshot and appends a separately signed local witness record. V remains the sole custodian and the only actor allowed to perform production ceremonies.

**Execution skills:** Use `superpowers:executing-plans` while implementing, `superpowers:test-driven-development` for each behavior change, `superpowers:systematic-debugging` for unexpected failures, `superpowers:receiving-code-review` for findings, and `superpowers:verification-before-completion` before every review or completion claim.

**Forbidden during local execution:** live database/root/key use; persisted operational/private test material; migration application outside a disposable local PostgreSQL fixture; production quiesce/activation; launchd load/start; acceptance; merge; push; or Done. Every operational identity/root/credential remains a V-later input.

## Gate machinery used by every task

Task 0 has no repository helper yet, so it uses an admission-only capture function copied exactly into a new shell. The function must: create a mode-`0700` `mktemp -d` evidence directory; reserve `<id>.stdout`, `<id>.stderr`, `<id>.rc`, and `<id>.argv` with exclusive creation; execute the argv directly with stdout/stderr redirected to those paths; save the real child status; chmod artifacts `0400`; and only then compare the status/output to the call's explicit expectation. It never uses a pipeline, `tee`, command substitution for child status, glob-expanded test selection, or a reused id. Failed assertions preserve evidence and return nonzero.

Task 1 replaces that temporary function with:

```text
node tools/fix09-capture-gate.mjs \
  --manifest tests/unit/fixtures/fix09-gate-manifest.json \
  --gate GATE_ID --run POSITIVE_RUN_NUMBER \
  --evidence-dir FRESH_MODE_0700_DIRECTORY -- LITERAL_ARGV_VECTOR
```

The runner first captures immutable stdout/stderr/rc/argv/tool-version/start/end records, then validates the exact manifest rule. A Vitest rule has an explicit nonempty `selected_files` array, explicit nonempty `full_test_names` array, `expected_test_count` equal to that array length, expected exit class, zero/nonzero failure rule, zero skipped/todo rule, and anchored JSON-summary schema. Non-Vitest rules pin argv, exit, and exact/anchored stdout/stderr. RED gates expect a nonzero child result plus a named missing assertion; GREEN gates expect zero. The runner itself exits nonzero on child mismatch, no-match, zero selected tests, extra/missing/name-changed tests, wrong summary, truncation, duplicate evidence id, pre-existing output, parse error, or manifest drift. Every focused final ledger runs three times in three fresh evidence directories. Reports retain every evidence SHA-256 and worst-duration id.

No later `pnpm`, `vitest`, typecheck, migration, source audit, permission probe, Git verification, or final verification is evidence unless invoked through the runner with a committed manifest entry. Human inspection may use read-only commands, but may not support a PASS claim.

---

### Task 0: Admit the exact reviewed heads before any C3.5 code

**Files:**

- Create outside the product tree: `../.superpowers/sdd/PLAN-FixAgent/fix09-c35-admission-report.md`
- Create last, after independent PASS: `../.superpowers/sdd/PLAN-FixAgent/fix09-c35-admission-receipt.md`
- Do not create/modify a product, test, migration, package, schema, or FIX document

**Inputs:** controller authority `FIX09_AUTHORITY_COMMIT` resolving to the independently approved v5 documentation commit with parent `bcae759eec5a2e6987ef49e2f3ad82919807a85a`; FIX-02 `e7b9f6812cafc8808cf5e188cd6440f19beda831`; FIX-01 `24d0b3e5de84876b6b46fa84b13a0a42aa2640a4`; FIX-09 `8619b9ab4dbc01fdd166337a641193675b24380a`.

- [ ] **Step 1: Prove all immutable objects and graph relations capture-first**

Using the Task 0 function, capture full object resolution, type=`commit`, subjects, parents, merge bases, and clean source-controller status. Assert integration base `2b670d3059c60d7262cf655bd5d402c88100dff3`, FIX-01 shared base `bd0cd92ebdcd633762af7d4a91d0f8972bc1e2b8`, authority parent `bcae759eec5a2e6987ef49e2f3ad82919807a85a`, and the exact authority three-path diff. Capture the v4/v5/frozen C1 hashes, current writer map, schema/grant sources, and each SPEC-v5 §2 source blob. Any mismatch is STOP.

- [ ] **Step 2: Prove the composition before mutating Git state**

Capture merge-tree results for the exact order. Require FIX-02 to conflict only at `docs/missions/observability-agents/slices/FIX-02/DECISIONS.md`; require its chosen result blob `0e2ffc4fc4f148520f228a9f69014f2ad7d5416c` to be a strict append-only superset. Require FIX-01 to introduce no conflict after FIX-02 and to provide runtime-readiness test blob `17b27ac6a47f511a6cd8b01bdcfbe5bacfcb69dd`. Require FIX-09 to conflict only at FIX-09 `DECISIONS.md`; its chosen result must be the controller authority blob and contain all v2/v3/v4/v5 rows once. Run stale authority, swapped order, wrong resolution blob, wrong parent, and synthetic extra-conflict controls; each must be captured and rejected.

- [ ] **Step 3: Create one isolated admission branch/worktree and compose exactly**

Only after Steps 1-2 pass, create a new clean `codex/fix09-c35-admission` branch/worktree at `FIX09_AUTHORITY_COMMIT`. Merge FIX-02 with `--no-ff --no-commit`, require only the expected conflict, install its exact decision blob, and commit the merge. Cherry-pick only FIX-01 tip. Merge FIX-09 with `--no-ff --no-commit`, require only its decision conflict, install the authority-side decision blob, and commit the merge. Do not rebase, amend, squash, or add code. Capture every mutating command's real status before its postcondition assertion.

- [ ] **Step 4: Enumerate the admitted surface and collision state**

Capture the final tree, clean porcelain, all changed paths and blobs, four current row writers, future FIX-10 writer contract, C1 hashes, schema/grant definitions, and exact ownership of overlapping paths. Immediately scan all refs, all reachable objects, every registered worktree including untracked files, and independent plan/decision claims for `0064*.sql`. Require zero file and claim collisions and reserve only `migrations/0064_fix09_audit_chain.sql`. Hash the command/result manifest.

The exact writer list is:

```text
occurrence   packages/obs-capture/src/runtime/sink.ts::writeOccurrences
occurrence   packages/obs-capture/src/runtime/sink.ts::ingestSpooledOccurrence
agent_action tools/obs-listener/src/daemon/poison.ts::appendSkipReceipt
agent_action tools/obs-listener/src/daemon/poison.ts::appendPoisonReceipt
future only  FIX-10 obsctl source=ops writer_identity=obsctl
```

- [ ] **Step 5: Obtain independent admission review and seal the receipt**

The reviewer receives all inputs, merge-tree/merge evidence, conflict blobs, source maps, collision proof, hostile controls, and final clean tree. Require explicit `SPEC PASS` and `CODE QUALITY PASS`, no P0-P3, and no implementation content. Then write the immutable receipt with every SPEC-v5 §2 field, full SHAs, exact canonical worktree path, review path/hash/verdict, `C35_BASELINE`, tree, clean-status SHA-256, evidence-manifest SHA-256, and source map. Run a capture-first receipt validator with stale/tree-changed/wrong-review controls. No C3.5 edit may begin until this is PASS.

---

### Task 1: Build the capture-first evidence runner

**Files:**

- Create: `tools/fix09-capture-gate.mjs`
- Create: `tests/unit/fix09-capture-gate.test.ts`
- Create: `tests/unit/fixtures/fix09-gate-manifest.json`

- [ ] **Step 1: Write runner RED tests and capture them with the Task 0 function**

Define `fix09-gate-manifest/v1` and tests for exclusive artifact creation; stdout/stderr separation; real exit preservation; argv/tool/time metadata; chmod-before-assert; exact file/name/count equality; anchored JSON summary; zero skipped/todo; nonzero RED; three distinct run ids; SHA-256 manifest; and worst-duration selection. Hostile fixtures cover a no-match file/glob, zero-test JSON, wrong full name, wrong count, wrong summary, wrong rc, truncated/malformed JSON, duplicate id, and pre-existing output. Capture the expected missing-module RED result before implementing.

- [ ] **Step 2: Implement the runner without pipeline status ambiguity**

Spawn one literal argv vector, with `shell=false`; create all evidence files using exclusive descriptors; close/fsync each after the child exits; record its numeric status or signal; set files `0400` and completed run directory `0500`; then parse/assert. Manifest fields and JSON output are total closed schemas using descriptor snapshots. Reject symlinks, special files, path escape, overwrite, unknown manifest keys, environment-secret capture, or a command different from manifest argv.

- [ ] **Step 3: GREEN and self-hosted hostile proof**

Use the temporary function once to prove the new runner tests GREEN. Then use the runner itself for three fresh exact runs of `tests/unit/fix09-capture-gate.test.ts`; require every hostile control to pass by observing the intended rejection and require identical selected names/counts. Commit no evidence containing environment variables or private bytes.

---

### Task 2: Add forward-only migration 0064, legacy precision, probes, and ACLs

**Files:**

- Create: `migrations/0064_fix09_audit_chain.sql`
- Modify: `packages/db/src/obs-schema.ts`
- Create: `tests/integration/fix09-chain-migration.test.ts`
- Create: `tests/architecture/fix09-chain-grants.test.ts`

- [ ] **Step 1: Repeat the collision audit immediately before file creation**

Run the same all-ref/all-object/all-worktree/untracked/claim scan through a manifest gate. Assert recorded counts, zero `0064*.sql`, receipt/tree parity, and no untracked candidate. Create the migration only after the captured gate passes.

- [ ] **Step 2: Write real-PostgreSQL RED tests**

Test every SPEC-v4 column/type/all-or-none constraint/index/activation trigger plus SPEC-v5's epoch function, owner role, four routines, signatures/return columns/search paths/static definitions/ACLs. Store same-millisecond timestamps differing only in microseconds and require different tagged legacy canonical bytes/digests; kill a `Date`/millisecond mutant. Require occurrence writer raw SELECT denial; bounded MATCH/CONFLICT/NO_ROW probes; bounded head results; no payload/frame/template leakage; EXECUTE denial for PUBLIC/human/wrong runtime; and exact allowed roles. Test input-size/type/tag/length rejection and catalog role attributes.

- [ ] **Step 3: Implement one additive forward transaction**

Implement v4's exact chain/source/writer/sequence/link/signature columns, legacy `action_seq` assignment/source, singleton activation, partial partition indexes, global action-ref uniqueness, and pre/post-activation trigger. Add `obs.audit_chain_epoch_microseconds`, `debateai_obs_chain_probe_owner`, and four exact SECURITY DEFINER routines from SPEC-v5. Fully qualify objects; fix `search_path=pg_catalog`; use no dynamic SQL/default/variadic args; revoke PUBLIC/all broad grants before exact EXECUTE. Revoke writer raw occurrence SELECT. Do not add a down path, delete/backfill chain material, alter prior migrations, or apply to a non-test database.

- [ ] **Step 4: Prove forward-only failure semantics and exact schema mirror**

In disposable PostgreSQL, prove one successful forward application; transaction rollback on injected migration error; activation empty; legacy chain fields NULL; duplicate action-ref preflight failure; local database disposal/recreation; and refusal to drop columns/functions/role/history or modify the migration ledger. Update `obs-schema.ts` to mirror exact additive schema. Run migration and grant files three fresh times through exact manifest gates and typecheck through its own gate.

---

### Task 3: Implement canonical protocol, unique raw JSON, keys, and path law

**Files:**

- Create/modify all PLAN-v4 Task 2 `packages/obs-capture/src/chain/*` files and `package.json` export
- Create: `packages/obs-capture/src/chain/unique-json.ts`
- Create: `tests/unit/fix09-chain-canonical.test.ts`
- Create: `tests/unit/fix09-chain-keys.test.ts`
- Create: `tests/unit/fixtures/fix09-chain-public-vectors.json`
- Create: `tests/unit/fixtures/fix09-independent-chain.mjs`
- Create: `tests/architecture/fix09-chain-privacy.test.ts`

- [ ] **Step 1: Write canonical/domain/key/path/raw-boundary RED tests**

Pin RFC 8785 row/order/scalar/tag/genesis/signature/link/domain/length-prefix behavior against an independent oracle. Commit only public unsigned bodies, canonical bytes, hashes, SPKIs, and key ids derived without committed private input. Generate a fresh in-memory Ed25519 pair per test; pass its key object to production and oracle; never persist a deterministic seed/private fixture/signature. Test domain/key/row/time/order mutants and exact lowercase SHA-256(SPKI DER) ids.

Test `parseUniqueJsonUtf8` at keyring, activation, recovery, future outbox, witness, and proof raw-byte boundaries: duplicate keys at every depth, BOM, malformed UTF-8, trailing bytes, lone surrogates, forbidden number forms, and caps. Separately test gateway materialized objects only by one total descriptor snapshot, including accessors, symbols, sparse arrays, cycles, revoked/throwing/mutating proxies, extras, attributes, and prototype mismatch; never claim raw duplicate-key detection there.

Test every SPEC-v5 §5 mode/owner/group/type/link/device/ancestor condition with distinct fake UIDs where supported. Require V-owned `0711` private parent, per-writer `0600` file owned by that writer, non-listability/cross-reader denial, watchdog public visibility only, descriptor/path inode equality, and refusal of symlink/hardlink/wrong device/writable ancestor/replacement race. Filesystem-only private test bytes use a per-test `0700` directory/`0600` file and are removed after descriptor close.

- [ ] **Step 2: Implement exact canonicalization and descriptor normalization**

Implement fixed schema arrays without schema discovery. Snapshot `getPrototypeOf` and own descriptors once under catches, validate the total closed shape, copy once to null-prototype structures, freeze, and canonicalize the copy. Do not reread caller properties or attempt impossible duplicate-key detection. Own/pin the RFC 8785 implementation separately from C1 policy canonicalization.

- [ ] **Step 3: Implement raw parsing, keyring/activation/recovery, and private opens**

Implement the tokenizing raw parser before materialization and exact signed documents/domains. Augment cumulative keyrings with exact `epoch` and `recovery_checkpoints`. Open `${OBS_CONTROL_DIR}` and every component by descriptor/no-follow with the exact permission, owner, device, link, ancestor, and re-fstat law. Use Ed25519 only; derive ids from SPKI DER; bind writer/table/source/sequence scopes. Readers never repair or publish. V publication APIs may be testable locally but require explicit V-only capability and same-directory exclusive-temp/fsync/rename/fsync/open verification.

- [ ] **Step 4: Prove absence of private material and installer/import drift**

Run exact privacy and repository scans through manifest gates. Fail on deterministic seeds, PKCS#8/private JWK/secret fixture encodings, evidence private bytes, database verification secret, HMAC/symmetric chain verification, absolute control-root default, installer-graph chain import, or C1 canonicalizer import. Run canonical/key/privacy/typecheck gates three clean times.

---

### Task 4: Implement the occurrence gateway and convert both occurrence writers

**Files:**

- Create: `packages/obs-capture/src/chain/locks.ts`
- Create: `packages/obs-capture/src/chain/occurrence-gateway.ts`
- Modify: `packages/obs-capture/src/chain/index.ts`
- Modify: `packages/obs-capture/src/runtime/config.ts`
- Modify: `packages/obs-capture/src/runtime/index.ts`
- Modify: `packages/obs-capture/src/runtime/sink.ts`
- Modify: `packages/obs-capture/src/runtime/drain.ts`
- Create: `tests/integration/fix09-chain-occurrence.test.ts`
- Create/modify: `tests/architecture/fix09-chain-writers.test.ts`

- [ ] **Step 1: Write hostile/real-PostgreSQL RED tests**

Cover exact SPEC-v5 occurrence comparator/detail tuple/exclusions; capture-status ORIGINAL crossover; duplicate batch keys; MATCH/CONFLICT/NO_ROW; genesis/tail/batch/multiple partitions; same/different replay concurrency; forced advisory-hash serialization; lock-rank inversion; global lock order; rollback at allocation/sign/insert/detail/receipt/notification; retry sequence reuse; and global occurrence-sequence gaps. Assert independent bytes/signature/link and exact persisted generated values. Test descriptor-only hostile inputs.

- [ ] **Step 2: Implement lock ranks, probe/head use, and gateway**

Implement the three token domains literally. Enforce session leader → existing C2 delivery lock if present → sorted occurrence idempotency → sorted action idempotency → sorted chain locks. Reject a rank inversion and any transaction invoking both gateways. Occurrence flow is idempotency locks, bounded probe, exact replay/conflict choice, chain locks, bounded head, allocate/materialize/sign/insert. Never SELECT raw occurrence, use `ON CONFLICT DO NOTHING` after allocation, or sign a value later supplied by a default/cast.

- [ ] **Step 3: Convert direct and spool ingestion**

Route `writeOccurrences` and `ingestSpooledOccurrence` through `appendChainedOccurrences`. Preserve caller order; PERSISTED/SPOOLED semantics; occurrence/detail/receipt/notification transaction atomicity; fallback decisions; ACK/cursor behavior; signer identity from trusted process configuration; and typed failure. Direct/spool crossover advances the chain once and returns the first committed storage status.

- [ ] **Step 4: Enforce the writer map and C1/C2/C3 contracts**

Use parsed-source architecture checks, not substring-only approval. Only the gateway may issue occurrence INSERT. Require both exact call sites to use the public chain subpath and no raw SQL escape. Rehash every frozen C1 raw/canonical interface; run C2 lock/fold/ACK/cursor and C3 tier/no-model suites. Capture exact occurrence/writer/adjacent/typecheck gates three times.

---

### Task 5: Implement the action gateway and convert listener actions

**Files:**

- Create: `packages/obs-capture/src/chain/agent-action-gateway.ts`
- Modify: `packages/obs-capture/src/chain/index.ts`
- Modify: `tools/obs-listener/src/daemon/poison.ts`
- Modify: `tools/obs-listener/src/daemon/fold.ts`
- Modify: `tools/obs-listener/src/daemon/main.ts`
- Create: `tests/integration/fix09-chain-action.test.ts`
- Modify: `tests/integration/fix09-daemon.test.ts`
- Modify: `tests/architecture/fix09-chain-writers.test.ts`
- Create: `tests/architecture/fix09-fix10-chain-contract.test.ts`

- [ ] **Step 1: Write hostile/real-PostgreSQL RED tests**

Cover exact action comparator/exclusions; action-ref MATCH/CONFLICT/NO_ROW; first generated action time; genesis/tail/concurrency/different source; lock order/rank errors; wrong transaction state; signer/source/identity mismatch; allocation/sign/insert/ACK/cursor rollback; retry; and descriptor-only input attacks. Prove one chain advance for concurrent identical replay and no deadlock.

- [ ] **Step 2: Implement action probe/head flow and gateway**

On the caller's active transaction, acquire existing delivery lock, action-ref idempotency lock, bounded action probe, then action partition lock and bounded head. Materialize all generated fields, sign exact bytes, insert exact values, and return typed inserted/existing. Never begin/commit/rollback the caller transaction; never acquire a lower lock after a higher lock; never invoke the occurrence gateway in that transaction.

- [ ] **Step 3: Convert skip/poison and prove delivery atomicity**

Route `appendSkipReceipt` and `appendPoisonReceipt` through `appendChainedAgentAction`; inherit source from the selected occurrence and writer identity from trusted daemon configuration. Preserve fold/action/ACK/cursor order and rollback every downstream effect on signing/insert failure.

- [ ] **Step 4: Freeze FIX-10 compatibility before its implementation**

The architecture test requires any future obsctl database consumer to call the public action gateway with exact `source='ops'`, `writer_identity='obsctl'`, and globally unique deterministic `action_ref`; append failure leaves outbox pending and replay uses the same ref. Marker-only FIX-10 commands have zero database sockets/row-key reads/witness writes. Do not implement FIX-10 here. Capture action/writer/FIX-10-contract/C2-adjacent/typecheck gates three times.

---

### Task 6: Prove activation, planned rotation, V-signed recovery, forward rollback, and C3.5 convergence

**Files:**

- Create: `tests/integration/fix09-chain-lifecycle.test.ts`
- Modify: `tests/unit/fix09-chain-keys.test.ts`
- Modify: `tests/integration/fix09-chain-occurrence.test.ts`
- Modify: `tests/integration/fix09-chain-action.test.ts`
- Modify: `tests/architecture/fix09-chain-privacy.test.ts`

- [ ] **Step 1: Write lifecycle RED tests with runtime-only ephemeral keys**

Cover preactivation NULL-only writes; file/DB mismatch; activation boundary/digest; same-ms/different-us legacy mutation; generation history; row-key planned rotation without reset; witness planned rotation continuity; private-key loss; row/witness compromise; and every exact recovery trigger/checkpoint field/domain/V signature. Cover empty/nonempty suspect intervals, signed terminal/digest, next sequence/link, skipped epoch/generation, invalid V signature, forged/deleted/changed suspect tails, status convergence, and permanent journal-loss `WITNESS_INVALID`. Each test generates new in-memory keys; no deterministic private bytes are written.

- [ ] **Step 2: Implement exact epoch/checkpoint semantics**

Implement only the SPEC-v5 closed schemas/statuses. Planned trusted rotations remain one epoch. Recovery increments epoch/generation by one, embeds one cumulative V-signed checkpoint, preserves old bytes, labels suspect intervals, binds terminal/digest/new keys, and resumes from terminal+1. Plain VERIFIED is impossible once a checkpoint exists. Missing/invalid evidence never silently resumes.

- [ ] **Step 3: Replace v4 down behavior with forward-only proof**

Delete any newly written down-migration expectation; do not delete v4 documentation. Prove rollback stops local writer/verifier code and disposes/recreates only the disposable test database while `0064`, ledger, rows, keyring, activation, and journal remain conceptually forward. Reject column/function/role/history/ledger deletion. No production rollback/apply occurs.

- [ ] **Step 4: Run the exact C3.5 ledger three clean times**

The committed gate manifest lists exact positive full test names/counts for:

```text
tests/unit/fix09-capture-gate.test.ts
tests/unit/fix09-chain-canonical.test.ts
tests/unit/fix09-chain-keys.test.ts
tests/integration/fix09-chain-migration.test.ts
tests/integration/fix09-chain-occurrence.test.ts
tests/integration/fix09-chain-action.test.ts
tests/integration/fix09-chain-lifecycle.test.ts
tests/integration/fix09-daemon.test.ts
tests/architecture/fix09-chain-grants.test.ts
tests/architecture/fix09-chain-writers.test.ts
tests/architecture/fix09-chain-privacy.test.ts
tests/architecture/fix09-fix10-chain-contract.test.ts
tests/unit/fix09-bundle.test.ts
tests/unit/fix09-fold.test.ts
tests/unit/fix09-tier-gate.test.ts
tests/architecture/fix09-no-model.test.ts
```

Run this exact ledger three times in distinct evidence directories plus exact typecheck, migration collision, frozen-hash/interface, raw-writer, permission, protocol, private-material, placeholder, and diff-scope gates. Every run must select the exact manifest set/count, report an anchored all-pass summary, and have zero skip/todo. Record all evidence hashes and worst duration.

---

### Task 7: Obtain independent C3.5 admission/spec/code review

**Files:**

- Create outside product tree: `../.superpowers/sdd/PLAN-FixAgent/fix09-c35-review.md`
- Do not modify C4/FIX-10 implementation

- [ ] **Step 1: Freeze one review range and evidence bundle**

Capture `C35_BASELINE`, implementation tip/tree/parents, exact diff paths, 0064 and ACL catalogs, writer/parser scans, public vectors, three-run evidence manifest, frozen C1 hashes, recovery/forward-only proofs, and forbidden-act statement. Re-run the admission receipt validator. Require clean tracked/untracked scope apart from declared evidence.

- [ ] **Step 2: Require independent PASS/PASS and resolve findings under review discipline**

The reviewer reads SPEC-v4/v5 and PLAN-v4/v5, receipt, full diff, and evidence. Require explicit SPEC and CODE QUALITY verdicts and no unresolved P0-P3. Any correction reruns affected three-run and final gates. FIX-10 C0 and C4 remain STOP until the final reviewed C3.5 commit/tree/evidence hashes match the report.

---

### Task 8: Admit separately authorized and reviewed FIX-10 C0

**Files:**

- Verify only: current/frozen FIX-10 SPEC/PLAN/DECISIONS and its later V-selected successor
- Verify: `tests/architecture/fix09-fix10-chain-contract.test.ts`
- Do not invent or implement missing FIX-10 authority in FIX-09

- [ ] **Step 1: Gate exact external authority and implementation receipts**

Require separately selected FIX-10 authority for V-only keyring/activation/bootstrap/rotation commands, raw unique-JSON outbox, reconciliation state machine, signer injection, and deterministic globally unique action-ref. Require exact local implementation SHA/tree, focused three-run capture evidence, and independent PASS/PASS with no P0-P3. Absent/stale/mismatched evidence yields `FIX10_C0_AUTHORITY_REQUIRED` and STOP.

- [ ] **Step 2: Prove gateway contract and no live act**

Run the exact compatibility test through the gate manifest. Database-capable reconciliation is exact `source=ops`, `writer_identity=obsctl`, shared action gateway; append failure stays pending; replay appends no duplicate. Marker-only commands perform zero database/key/journal access. Confirm no real root/key/migration/activation/acceptance was used. Only after this independently reviewed gate may C4 begin.

---

### Task 9: Implement the read-only snapshot verifier

**Files:**

- Create: `packages/obs-capture/src/chain/verify.ts`
- Modify: `packages/obs-capture/src/chain/index.ts`
- Create: `tests/integration/fix09-watchdog-verify.test.ts`

- [ ] **Step 1: Write real-history RED tests**

Create legacy plus activated occurrence/action histories through the shared gateways in real PostgreSQL. Assert exact snapshot isolation/read-only SQL state, shared epoch-microsecond function use, activation/keyring/root verification, legacy boundaries/digests, partition/sequence/genesis/signature/link/key authorization, recovery ranges, and closed verdicts. Mutate as test owner: same-ms/different-us time, scalar/JSON field, source/writer/order/sequence/prev/signature/link/key id, row deletion/insertion, activation digest, keyring/checkpoint signature/generation/epoch/terminal/digest. Assert exact reason.

- [ ] **Step 2: Implement one read-only snapshot scan**

Begin exact isolation and `READ ONLY`; open public artifacts by SPEC-v5 descriptors; parse unique raw JSON; validate V signatures; recompute legacy digest with `obs.audit_chain_epoch_microseconds`; enumerate every partition; scan ordered rows; verify canonical bytes, Ed25519 signature, SHA-256 link, genesis/continuity, key interval, and recovery labels. Commit a semantic-result transaction; roll back SQL failure. Never request row locks, call a gateway, insert/update, read private keys, or infer missing evidence.

- [ ] **Step 3: Prove watchdog role and three clean gates**

Authenticate as real watchdog; catalog/assert read-only privileges and all write denials. Capture exact verifier/typecheck/privacy tests three times with exact positive names/counts/anchored summary.

---

### Task 10: Implement the exact signed witness journal and dormant service

**Files:**

- Create: `packages/obs-capture/src/chain/witness.ts`
- Create: `tests/unit/fix09-watchdog-journal.test.ts`
- Create: `tools/obs-listener/src/watchdog.ts`
- Create: `tests/integration/fix09-watchdog.test.ts`
- Create: `ops/launchd/com.debateai.obs-listener.plist.template`
- Create: `ops/launchd/com.debateai.obs-watchdog.plist.template`
- Modify: `docs/observability/README.md`
- Modify: `tests/architecture/fix09-chain-privacy.test.ts`
- Create: `tests/architecture/fix09-launchd.test.ts`

- [ ] **Step 1: Write exact witness wire/vector RED tests**

Pin the closed unsigned/completed schemas, decimal strings/nulls, sort order, sequence gap rejection, result/reason pairing, domains, length prefix, canonical padded base64, line LF, fsync order, and activation digest as the first `prior_witness_hash`. Commit one fixed public unsigned body and SHA-256 only. For signature/link checks generate a fresh in-memory key and compare production with independent `node:crypto`; never persist private seed/object/DER/signature fixture.

- [ ] **Step 2: Test append atomicity, rotation/loss/compromise/recovery, and hostile files**

Cover partial/short/interrupted write, lock contention, crash-before/after fsync, duplicate/gap sequence, wrong prior hash, concurrent cycles, symlink/hardlink/nlink/device/owner/mode/ancestor swaps, planned witness rotation, witness-key loss with intact journal, witness compromise interval, bad checkpoint, convergence, and permanent journal deletion/truncation failure. Require no PASS before completed record fsync.

- [ ] **Step 3: Implement witness append and watchdog cycle**

After a verifier result, construct exact unsigned `W`, sign the required domain, derive link hash, and append one complete RFC 8785 line under descriptor/open/lock/write-loop/fsync rules. Use activation digest for sequence 1 and prior completed record thereafter. Expose only safe health. Watchdog imports verifier/witness but no action gateway and performs no database/outbox write.

- [ ] **Step 4: Add dormant templates and documentation**

Use placeholders only for V-later uid/gid/root/DSN/credentials/identities/mode. Encode no host root, key, or credential. Templates are never loaded/started locally. README records prerequisites and V-only ceremony boundaries without claiming execution.

- [ ] **Step 5: Prove privacy and run three clean gates**

Journal allowlist forbids row bodies, action payload/content/templates/frames/user ids/private bytes/root paths. Run journal/watchdog/privacy/launchd/typecheck manifest gates three times with exact names/counts/summary.

---

### Task 11: Run final C4 proof and request independent review

**Files:**

- Modify only if a failing authority-required test identifies a defect
- Create outside product tree: `../.superpowers/sdd/PLAN-FixAgent/fix09-c4-review.md`

- [ ] **Step 1: Run the exact C4 ledger three clean times**

The committed manifest lists exact positive full names/counts for:

```text
tests/unit/fix09-chain-canonical.test.ts
tests/unit/fix09-chain-keys.test.ts
tests/unit/fix09-watchdog-journal.test.ts
tests/integration/fix09-chain-migration.test.ts
tests/integration/fix09-chain-occurrence.test.ts
tests/integration/fix09-chain-action.test.ts
tests/integration/fix09-chain-lifecycle.test.ts
tests/integration/fix09-watchdog-verify.test.ts
tests/integration/fix09-watchdog.test.ts
tests/architecture/fix09-chain-grants.test.ts
tests/architecture/fix09-chain-writers.test.ts
tests/architecture/fix09-chain-privacy.test.ts
tests/architecture/fix09-fix10-chain-contract.test.ts
tests/architecture/fix09-launchd.test.ts
tests/unit/fix09-bundle.test.ts
tests/unit/fix09-fold.test.ts
tests/unit/fix09-tier-gate.test.ts
tests/architecture/fix09-no-model.test.ts
```

Run that ledger three times into new evidence directories. Also run exact typecheck, clean-diff/scope, migration-collision, admission/C3.5/FIX-10 receipt, schema/ACL, source-writer, protocol/public-vector, path-permission, private-material, legacy-precision, recovery, witness-wire, placeholder, frozen-C1, no-model, and forbidden-act gates. Every command is capture-first through the manifest runner. Require exact selected paths/names/positive counts, zero skipped/todo, anchored all-pass summaries, and evidence hashes/worst durations.

- [ ] **Step 2: Run hostile evidence controls again**

In fresh directories prove no-match, missing selected file, zero test, wrong count/name/summary/rc, truncated output, duplicate id, pre-existing artifact, stale receipt, wrong tree, and altered manifest all fail. Preserve their captured child outputs/status before asserting expected rejection.

- [ ] **Step 3: Obtain independent C4 review**

Provide SPEC-v4/v5, PLAN-v4/v5, exact reviewed C3.5 and FIX-10 receipts, implementation range/tree, 0064/catalog/ACL proof, writer map, public vectors, legacy precision, recovery/witness evidence, all three runs, scans, and forbidden-act statement. Require explicit SPEC PASS and CODE QUALITY PASS with no unresolved P0-P3. Resolve feedback under receiving-review discipline and rerun affected/full gates.

- [ ] **Step 4: Report local completion without operational claims**

Report SHAs/trees, migration claim, exact writers, schema/protocol/key/recovery/witness contracts, exact nonzero test names/counts and all three runs, evidence hashes, reviewer verdicts, and V-later inputs. Explicitly list pending V-only keys/root/identities, migration application, quiesce, activation, launchd, acceptance, merge, and push. Do not claim production verification or Done.

## Binding stop summary

C3.5 code is STOP before the sealed admission receipt. FIX-10 database reconciliation is STOP before independently reviewed C3.5. C4 is STOP before separately authorized and independently reviewed FIX-10 C0. Production acts remain STOP throughout. Any admission drift, `0064` collision, v4 byte change, comparator/ACL/path/protocol/witness/recovery difference, private fixture, raw-writer escape, broad SELECT, down migration, millisecond legacy truncation, vacuous/non-captured gate, missing independent PASS, or forbidden act halts execution.
