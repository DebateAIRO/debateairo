# FIX-09 C3.5/C4 — bounded admission and executable custody/delivery seams

**Successor status:** This document incorporates FIX-09 SPEC v4-v12 without changing their bytes. It supersedes only the five P1 and one P2 findings in the rejected v12 authority review, closes the six P1 and three P2 defects found by adversarial review of the first v13 draft, and binds the independently approved FIX-10 v9 dependency. It authorizes a fresh admission-only Task 0 only after an independent zero-finding v13 authority review. It does not authorize C3.5 implementation, the real Task 0 now, a native production build, migration application, live key use, acceptance, merge, push, or Done.

## 1. Frozen predecessors and exact dependency

The failed v10 and v11 attempts remain immutable diagnostic evidence under their original program, manifest, report, evidence-root, branch, worktree, and tip identities. V10 stopped with three execution mismatches. V11 reached clean admission tip `61313a1d89cd354743f8bc94329f716fe4f2bdf5`, produced 38 correct facts, and stopped fail-closed at t0-039 with no candidate. Neither attempt may be retried, amended, deleted, overwritten, or certified.

Rejected v12 is also frozen and may not be amended or certified:

- authority commit `dd7b84959aaa95dfaf40ccf4f7b2396c25a32848`, tree `9696c461a92450c4d965bae02c9223432606a7df`;
- SPEC-v12 blob `b31a65720d7120a180339a09f5d525e8eac0667f`, SHA-256 `292a404ca81a98b9015e6aa8f1bfa2ca2c8f5e4e663ca9e737ed4415eec2df66`;
- PLAN-v12 blob `e73cd5fa6e3e6c96e0dcb968852206cbff453419`, SHA-256 `4ac31ef5036d7c60966bbcf4f05951139345923f54d41d78ec24ff6da677ece4`;
- DECISIONS-at-v12 blob `f3a66008ad44bf802e3dede6f6fede874f704d92`, SHA-256 `9dd91f4fd44e3d91e557bca091a7e629a4609b3557587872940ce067417e2ea1`;
- implementation report blob-form SHA-1 `ac8b508f4d3d0301ae9d84b1523d5a0abae6ec28`, SHA-256 `3ac5f6f7e2d5f69496b75d41a0fef47cf13e19376971fd7028be822f832b2d17`;
- independent review blob-form SHA-1 `27d955828c900f86a855af9dea67f9b191e25202`, SHA-256 `2e635db252905ac0e552b0808e4b6b83657ba32dd5ae29b32ba4206769bb2f0b`, exact verdict `P0=0 P1=5 P2=1 P3=0` and FAIL.

FIX-10 v9 is the only admitted FIX-10 control-authority dependency. Its identity is:

- commit `a539ba114bd80e9234c08ba77c75772d0d111d94`, parent `e3f613efbad63ffdc72b3494143c45583e3738f9`, tree `5012c7a196d6977af41a888817b336b4248605e9`;
- SPEC-v9 blob `34de70265e0f1256d2f71197e15619374f0685de`, SHA-256 `9d87002fd20287285c72f0d7b7913b3b576dabb862f774f81312664b8de58326`;
- PLAN-v9 blob `6eced95012f9d9b8fe58c903a4e580f5e0743f2e`, SHA-256 `2de04eadba64b34a7b3c1e5da69b1ee3cf7ec33e8dd34a1a69999b1d84e9f012`;
- DECISIONS blob `cb3c71265b43502e55acad5cd083f829d55f035e`, SHA-256 `866212f1b760dec71532ada2bc125dbaefb574bc13687eebb4629548714c1353`;
- independent review blob-form SHA-1 `b9b52407e4978ea78bf354df3d3ca33f2f154418`, SHA-256 `637f707109790d9799016dd2ba440d4974819367a1bb0fd1ddae0d8654d5006b`, exact PASS lines for authority/spec/plan, `P0=0 P1=0 P2=0 P3=0`, and implementation authorization `NO`.

V13 is a direct child of that approved v9 commit. Dependency authority is proved only by the exact v9 commit, its current SPEC-v9/PLAN-v9/DECISIONS bytes, and the approved review. For collision scanning, the claim allowlist separately pins the only four claim-bearing immutable files as they exist at that v9 commit: DECISIONS plus PLAN-v4, SPEC-v4, and SPEC-v6; their six exact `0064` tokens are historical dependency text, not a v4 authority edge. No wildcard, successor document, unreviewed review, changed predecessor byte, or additional FIX-10 allocation claim is admitted. FIX-10 implementation remains STOP until independently reviewed v13 Task 0 and C3.5 results exist.

## 2. Bounded stable paper admission

### 2.1 Complete lawful snapshots only

Each complete scan still covers every ref-tip tracked Markdown blob and every registered worktree's tracked-modified plus nonignored-untracked Markdown. It enumerates fresh NUL-delimited tracked and untracked sets, rejects missing, duplicate, unreadable, or noncanonical worktree roots, and never opens, reads, lists, stats, or materializes the excluded private component. Ref-tip reads remain immutable object reads.

Path admission occurs before enumeration or read. The complete worktree request is behind one injected adapter containing the Git/list enumerator and stat/open/read operations. The executable fixture uses only an abstract denied request and an injected admission predicate; it never constructs the excluded component's real name or a path below it. Rejection through that same request function must occur with exact `git=0 list=0 stat=0 open=0 read=0`. An omission mutant changes only the admission predicate, reaches the enumerator, and is killed. The fixture creates no directory, file, symlink, permission trap, or other filesystem object, and the embedded program contains no rejected-v12 sentinel pathname. Static inspection plus adapter counters prove this before any scanner fixture or shadow mode is allowed to run.

For every current-worktree document, the initial and every post-read `fstat`/`lstat` observation independently proves regular-file type, nonsymlink identity, link count one, valid BigInt metadata, canonical containment, and the existing owner/mode/path laws. A late symlink, hardlink, nonregular type, path escape, unreadable object, permission failure, or malformed metadata is immediately fatal as `FIX09_PAPER_WORKTREE`; it is never relabeled as concurrent instability. Only a difference between two individually lawful snapshots may produce `FIX09_PAPER_UNSTABLE` and restart the whole pair. Claim, registry, parse, source, Git, schema, and security failures also fail immediately under their exact existing causes.

### 2.2 Three complete scan-pairs

A freshness request performs at most three pairs, six full scans. Each pair starts with a fresh enumeration and no carried bytes. It accepts only when both complete outputs pass all closed schema/claim checks and their canonical bytes are identical; the accepted bytes are the second output. An unstable first scan, unstable second scan, or unequal lawful pair discards both scans and every derived byte before a new pair. Three unstable pairs fail exactly `FIX09_PAPER_RETRY_EXHAUSTED`. There is no sleep, backoff, quiesce request, partial reuse, fourth pair, mismatch acceptance, or retry of an independently fatal error.

### 2.3 Closed retry trace and exact equations

The closed trace contains six safe-integer counters `accepted_pairs=a`, `pair_starts=p`, `unstable_pairs=u`, `resets=r`, `equality_checks=e`, `full_scans=f`, plus `terminal` (`accepted`, `exhausted`, or `fatal`), `fatal_scan_ordinal` (`null`, `1`, or `2`), and `fatal_code` (`null` or an exact nonretry error). Every counter is a nonnegative JavaScript safe integer. `1 <= p <= 3`, `0 <= f <= 6`, no unknown field is permitted, and invalid trace evidence fails exactly `FIX09_PAPER_TRACE`.

For an accepted trace, `terminal=accepted`, both fatal fields are null, `a=1`, `p=u+1`, `r=u`, `1<=e<=p`, and, defining `x=2p-f`, `y=f-p-e`, `z=e-1`, all `x,y,z` are nonnegative integers and `u=x+y+z`.

For exhausted retry, `terminal=exhausted`, both fatal fields are null, `a=0`, `p=u=r=3`, and, defining `x=2p-f`, `y=f-p-e`, `z=e`, all `x,y,z` are nonnegative integers and `u=x+y+z`.

For immediate fatal termination after zero or more discarded pairs, `terminal=fatal`, `fatal_scan_ordinal=q` is exactly 1 or 2, and `fatal_code` is exactly one member of the literal closed set `FIX09_DEPENDENCY_AUTHORITY`, `FIX09_GIT`, `FIX09_PAPER_AUTHORITY`, `FIX09_PAPER_CLAIM`, `FIX09_PAPER_TREE`, `FIX09_PAPER_UTF8`, `FIX09_PAPER_WORKTREE`, or `FIX09_UTF8`. No regex-open `FIX09_*` value is evidence. Also `a=0`, `p=u+1`, and `r=u`. Define `f0=f-q`, `x=2u-f0`, `y=f0-u-e`, and `z=e`; all four are nonnegative integers and `u=x+y+z`. This accounts exactly for every completed unstable pair and the final first- or second-scan fatal invocation.

Fixtures prove stable `A/A`, transient `A/B` then fresh `C/C`, three-pair exhaustion, fatal first and second scans, fatal after a discarded pair, every unsafe/negative/impossible equation, both impossible v12 traces called out by review, and a plausible-looking fabricated fatal code. Mutation modes may not self-attest. Each invalid accepted/exhausted/fatal trace, omitted reset, fabricated equality/code, wrong terminal, or hostile full-scan count dies at the validator with exact `FIX09_PAPER_TRACE` or its existing independent omission cause.

### 2.4 Freshness schedule

The 39-entry base ledger performs one bounded scan at t0-039. Derive performs one fresh bounded scan and binds accepted canonical stdout into `migration_collision_evidence_sha256`. Positive candidate validation performs one fresh bounded scan. The nineteen hostile candidate validations reuse sealed accepted paper evidence, recompute the mutated field/cause locally, and perform zero full paper scans. Positive result validation later performs one fresh pair; the two result mutants perform none. Each independent candidate/result reviewer runs one separately fresh bounded pair and compares its own recomputation.

The stable diagnostic shadow therefore records only `base`, `derive`, and `candidate-positive`, two scans each, six total. The 39→32→20 schemas and noncircular hashes remain unchanged. Any extra live context, hidden scan, mismatch acceptance, or mutation-selected kill remains fatal.

## 3. Correct C3.5 reporter projection

The exact C3.5 authority-file order remains:

```text
tests/unit/fix09-capture-gate.test.ts
tests/unit/fix09-chain-canonical.test.ts
tests/unit/fix09-chain-keys.test.ts
tests/integration/fix09-chain-migration.test.ts
tests/integration/fix09-chain-occurrence.test.ts
tests/integration/fix09-chain-action.test.ts
tests/integration/fix09-chain-lifecycle.test.ts
tests/architecture/fix09-chain-grants.test.ts
tests/architecture/fix09-chain-writers.test.ts
tests/architecture/fix09-chain-privacy.test.ts
tests/architecture/fix09-fix10-chain-contract.test.ts
```

Append in v6 order the five immutable adjacent files `tests/unit/fix09-bundle.test.ts`, `tests/unit/fix09-fold.test.ts`, `tests/unit/fix09-tier-gate.test.ts`, `tests/architecture/fix09-no-model.test.ts`, and `tests/integration/fix09-daemon.test.ts`. The gate remains exactly 16 files and 118 ordered reporter names: 12,676 canonical bytes, SHA-256 `8ef3f10b6c4cc952a3e43b29821d6f4e1430b5fded60869890e89429a5a6e6ce`.

`tests/unit/fix09-watchdog-journal.test.ts`, `tests/integration/fix09-watchdog-verify.test.ts`, and `tests/integration/fix09-watchdog.test.ts` remain C4-only. The later C4 projection remains 20 files/122 names/13,207 bytes/SHA-256 `10ab68b621774d0b5826225a1615def7db687d718eecd12a7fea6f607bb62a00`. The adjacent projection remains 107 names/11,281 bytes/SHA-256 `5b061d338cbf49f10a1b2569b7e3fce3f1724c642bfd0922ebb7b878daaba09c`. Stage order is admission → C3.5 → independent C3.5 review → separately authorized/reviewed FIX-10 C0 → C4 → independent C4 review → V-only live acts.

## 4. Descriptor custody and signer session

### 4.1 Parent-only key and non-signing child

The descriptor-relative law is implemented by one pure-C, non-setuid, same-real/effective-UID descriptor custodian at `packages/obs-capture/native/fix09-openat-read.c`, the wrapper `packages/obs-capture/src/chain/private-key-helper.ts`, and session owner `packages/obs-capture/src/chain/signer.ts`. The child performs no signing or cryptography. It opens the trusted root and fixed profile leaf component-by-component with `openat`/`fstatat` and `O_NOFOLLOW`, transfers PKCS#8 exactly once through the one private response pipe, wipes both fixed-capacity secret buffers, and retains only the leaf and protocol descriptors needed for later identity checks. The Node parent constructs and solely retains the one `KeyObject`, wipes its transfer Buffer in `finally`, and never exports key bytes, `KeyObject`, path, fd, arbitrary read, general sign, or child protocol access.

The helper is installed only by V later at `${OBS_CONTROL_DIR}/chain/fix09-openat-read`, owner/group `V_PROVISIONER_UID:OBS_CHAIN_PUBLIC_GID`, mode `0550`, regular, nonsymlink, link count one, without setuid/setgid or write bits. Source, complete LF generated header, deterministic compiler argv, selected SDK bytes, two byte-identical Darwin ARM64 builds, installed binary identity, owner/mode/device/inode, signed inventory, profile map, and activation pins must all match before private open. This authority builds no production helper.

### 4.2 Exact six-profile inventory

The generated header authenticates exactly six slots; profile id equals slot id and the complete mapping digest is bound into OPEN:

```text
1 api_occurrence       chain/private/<API_WRITER_IDENTITY>.pk8
                       occurrence,first_party,<API_WRITER_IDENTITY>,1,null
2 runner_occurrence    chain/private/<RUNNER_WRITER_IDENTITY>.pk8
                       occurrence,first_party,<RUNNER_WRITER_IDENTITY>,1,null
3 scheduler_occurrence chain/private/<SCHEDULER_WRITER_IDENTITY>.pk8
                       occurrence,first_party,<SCHEDULER_WRITER_IDENTITY>,1,null
4 daemon_action        chain/private/fixagent-daemon.pk8
                       agent_action,first_party|hatchet|ui_client,fixagent-daemon,1,null
5 obsctl_action        chain/private/obsctl.pk8
                       agent_action,ops,obsctl,1,null
6 watchdog_witness     keys/watchdog-witness.pk8
                       witness,watchdog,null,[1,null]
```

The three product identities and every production UID/GID remain mandatory V-later inputs with no default. Product preparation compares resolved `OBS_WRITER_IDENTITY` with its inventory slot. C3.5 composes only API, runner, scheduler, and daemon; `obsctl_action` remains dormant until reviewed FIX-10 C0, while `watchdog_witness` is private readiness and rejected by the public row-writer preparation path.

### 4.3 Opaque `PinnedSignerSession`

`prepareChainedWriterSigner(profile)` returns only an opaque `PinnedSignerSession`. Its `attestation` is the exact FIX-10 v5 `obs-chain-signer-readiness/v2` object signed by the parent's sole `KeyObject` over literal domain `obs-chain-signer-readiness-signature/v2`, and includes the deeply frozen null-prototype nonsecret profile, writer/key id, helper/source/build/binary hashes and descriptor metadata, inventory/profile-map/activation/keyring digests, barrier/nonce/session identity, descriptor observation, and signature. The session permits exactly `commitCheck(challenge)`, one mutually exclusive `release(releaseRecord)` or `abort()`, and no other operation. `commitCheck(challenge)` validates the exact fresh FIX-10 v5 commit challenge, asks the child for its nonce/session/digest-bound CHECK_COMMIT identity observation, verifies parity, and returns the parent's exact `obs-chain-signer-commit-check/v1` object signed over literal domain `obs-chain-signer-commit-check-signature/v1`. `release(releaseRecord)` accepts only the exact FIX-10 v5 `obs-chain-signer-release/v1` durable-parity record, obtains CHECK_RELEASE parity, retains the same opaque signer token created at preparation, completes the v7 CLOSED_ACK → response EOF → empty stderr EOF → zero exit close sequence, and only then returns that token. `abort()` issues CLOSE_ABORT and closes without making a signer usable. Any duplicate, reorder, stale challenge, wrong signed domain, parity mismatch, retention after terminal state, changed pin, child death, or protocol byte fails closed. The token may be consumed only by the private append gateways and cannot reveal or invoke a generic signer.

The child accepts one nonce/session/digest-bound OPEN, emits the one private response and ZERO_ACK, then accepts only ordinal-bound CHECK_READINESS, CHECK_COMMIT, CHECK_RELEASE, CLOSE_ABORT, and CLOSE_RELEASE messages. It never signs: each CHECK returns only the exact fresh descriptor/identity parity observation bound to BIND and its opcode/ordinal; the parent builds and signs every readiness/commit object. It has no sign, path, key, fd, network, shell, dynamic-library, arbitrary-message, or general request opcode. BIND covers barrier UUID, nonce, session UUID, slot/profile id, activation/public-keyring/completed-inventory/profile-map digests, and exact product identities. CLOSE_RELEASE validates the final identity, closes leaf/parent/control, wipes state, writes CLOSED_ACK while response is open, closes response, emits empty stderr EOF, and exits zero; the parent releases only after that entire order.

### 4.4 Reviewed v9 build and wipe evidence

The child source begins byte zero with `#define __STDC_WANT_LIB_EXT1__ 1\n`; target triple, deployment flag, and Mach-O minos agree on an admitted macOS target at least 10.9. There is no forced include, macro fallback, `dlsym`, ordinary secret `memset`, or optimizer-dependent substitute. The no-inline wipe routine contains exactly two direct successful `memset_s` calls over the full 256-byte read buffer and 768-byte frame buffer. Every success, partial-write, read, protocol, and early-error exit reaches wipe, volatile zero scan, ZERO_ACK when protocol permits, and one classified return.

The sole nonshipping verifier is `packages/obs-capture/scripts/verify-fix09-native-wipe.mjs`. It receives already-opened source on stdin and object/executable on fd 3 under the closed environment/cwd/stream grammar, uses only Node built-ins, and is not exported, installed, or called at runtime. Exact `nm`/`otool` captures independently corroborate its bounded Mach-O/ARM64 relocation/stub/data-flow/CFG result.

V13 inherits FIX-10 v9's corrected digest equations literally. The raw function instruction bytes are the executable wipe span. `function_instructions_sha256 = DH("obs-chain-helper-wipe-instructions/v1",[RAW_FUNCTION_INSTRUCTION_BYTES])`. The two outer projection hashes use domains `obs-chain-helper-wipe-object/v1` and `obs-chain-helper-wipe-disassembly/v1`; the v8 artifact-kind span hashes remain separate fields and no outer `-projection` domain or nested span-digest substitution is admissible. The three v9 mutants `wrong_wipe_object_projection_outer_domain`, `wrong_wipe_disassembly_projection_outer_domain`, and `nested_arm64_span_digest_substitution` must die under independent raw-byte oracles in v13 Task 0, FIX-10 Task 0, and FIX-10 Task 4. Build-v3/helper-v4 receipt fields, canonical inventory bytes, deployment evidence, raw tool artifacts, and activation digest follow approved FIX-10 SPEC/PLAN v7-v9 exactly.

## 5. Generation-scoped FixAgent delivery adapter

The generic public `withChainedTransaction` and query-capable wrapper in v12 are rejected. C3.5 instead creates the dedicated subpath `@debateai/obs-capture/chain/fixagent-delivery` at `packages/obs-capture/src/chain/fixagent-delivery.ts`. It owns one generation-scoped adapter and at most one `pg.Pool`/checked-out client across connect, LISTEN, session-leader acquisition, pending selection, `BEGIN`, delivery advisory lock, occurrence/action gateway, ACK, cursor, `COMMIT`/`ROLLBACK`, and invalidation. Neither the root chain surface nor the subpath exposes a raw pool/client, query method, arbitrary SQL, transaction-control primitive, lock primitive, or reusable callback wrapper.

The adapter presents only the closed lifecycle operations required by the daemon and these typed work operations: `loadAggregateMembers`, `persistFolded`, `persistSkipped`, and `persistPoisoned`. The four operations accept only closed identifiers/materialized values and cannot carry SQL. `persistFolded` writes exactly the incident and policy decision; it does not create an `agent_action` row and never calls the action gateway. Only `persistSkipped` and `persistPoisoned` call `appendChainedAgentAction` for their existing terminal receipts. Every operation checks the live generation and exact TxState ordering before SQL; a retained, forged, stale, nested, cross-generation, mixed-kind, or early-terminal capability fails before SQL.

The exact C2 order remains: connect one generation; issue LISTEN before reconciliation; acquire the one session advisory leader; select a pending occurrence; begin; acquire the occurrence delivery advisory transaction lock; load/recheck the occurrence and ACK; load aggregate members; persist either folded incident+policy decision or the skipped/poisoned chained action; insert ACK; persist the cursor using `tools/obs-listener/src/daemon/cursor.ts`; commit; then notify/continue. Any downstream failure rolls back, invalidates that delivery capability, retains the previous durable cursor, and reconnects only through a new generation. `tools/obs-listener/src/daemon/main.ts`, `fold.ts`, `poison.ts`, and `cursor.ts` convert together; `packages/obs-capture/package.json` adds only the closed subpath and already-approved chain surface while `pg` remains at the package boundary that owns it. Dependency direction is exclusively `tools/obs-listener` → `@debateai/obs-capture`; the capture package never imports the listener.

The inherited public gateway signatures are explicitly superseded. `appendChainedOccurrences(materializedInputs)` accepts no client, transaction, signer, key, path, or descriptor; it privately acquires/owns/releases its transaction from the capture package's closed database boundary and performs the occurrence batch atomically. `appendChainedAgentAction(deliveryTx,materializedAction)` accepts only the unforgeable live transaction capability created inside the `fixagent-delivery` adapter; it accepts no raw pool/client/query/SQL/signer and cannot run outside that generation. The root chain runtime values are exactly `appendChainedOccurrences`, `appendChainedAgentAction`, and `prepareChainedWriterSigner`; only their closed types/attestation/session types are exported. The dedicated delivery subpath exports only its closed generation adapter/factory and necessary closed input/result types. `CaptureRuntimeStartOptions` remains exactly `{runtime,spoolFd,installExitSink}` and `startCaptureRuntime` retains its byte/type shape. The exact ABI assertion is added inside the already-projected reporter `FIX-09 chain writer architecture > proves all current and future writers use only the shared gateways`; no extra test path or reporter name is introduced.

## 6. Exact direct/spool occurrence materialization

The gateway accepts one internal flat, null-prototype, recursively frozen `ChainedOccurrenceInput` with own-data keys in this exact order:

```text
occurred_at, environment, build_ref, build_dirty, runtime,
component{process,package}, capture_point, code, taxonomy_class, severity,
condition_mark, disposition, fingerprint, fingerprint_version,
redaction_policy_version, allowlist_set_id, fallback_minimized, capture_status,
run_ref, work_item_ref, node_ref, attempt_ref, ledger_ref,
parent_occurrence_ref, cause_relation, cause_chain_codes, at_seq_watermark,
frames, safe_template_id, template_parameters, source, source_event_ref,
zone_context, attempt_index, writer_identity, spool_receipt
```

Exact types derive from migrations 0034/0061 and `envelope-contract.ts`; `taxonomy_class` includes `JOB_LIFECYCLE`, template numbers are safe integers, and arrays/maps are closed own-data. `spool_receipt` is null or exact null-prototype frozen `{source,spool_ref}`. SPOOLED requires a receipt; all other statuses require null; receipt source matches occurrence source; current `spool_ref=source_event_ref`. `occurrence_id`, `reingested_at`, and caller `detail` are not inputs.

DIRECT first proves the existing private `PostRedactionEnvelope` symbol brand, then copies each field exactly once and strips all symbols. SPOOL does not require the in-memory brand: it parses, calls `normalizeSerializedSafeEnvelope(value,runtime)`, then copies the same fields once. Both produce the same descriptor shape. The gateway snapshots once, rejects proxies/accessors/symbols/extras/missing/reordered/sparse/cyclic/mutable/wrong-origin values, and derives `detail=null` iff causes are empty; otherwise exact `{normalized_frames:frames,cause_chain_codes,template_parameters}`. Every normalization/signer/probe/gateway/receipt/notification failure propagates so spool drain retains the source file.

## 7. SQL probe equality and exact cap

The migration may add exactly one private helper, `obs.audit_chain_tag_jsonb_v1(value jsonb) returns jsonb`: `IMMUTABLE STRICT PARALLEL SAFE SECURITY INVOKER`, fixed `pg_catalog` search path, fully qualified static objects, probe-owner ownership, and EXECUTE revoked from PUBLIC and every runtime/human/watchdog role. Only the two SECURITY DEFINER probes call it.

Probes validate exact tuple tag/length/type/cardinality/detail agreement, build schema-derived tagged JSONB arrays, and compare structurally with `=`. PostgreSQL does not compute RFC 8785; TypeScript remains the sole canonical-byte authority. After tagging limits nodes to arrays/strings/booleans/null, exact RFC length is `octet_length(convert_to(tuple_jsonb::text,'UTF8')) - sum(max(jsonb_array_length(array_node)-1,0))` over the bounded recursive walk of every array node. Enforce at most 1,048,576 bytes and test boundary/+1, quotes, slashes, every control escape, multibyte Unicode/keys, U+2028/U+2029, nested and empty arrays.

## 8. STOP and independent review boundary

STOP on changed predecessor bytes; missing rejected-v12 or approved-FIX-10-v9 pin; any materialized excluded-path fixture; any excluded-path I/O; late unlawful metadata treated as retryable; invalid or unsafe retry trace; accepted mismatch; scan exhaustion; independent claim; hostile full-scan amplification; C4 file in C3.5; source/reporter/hash drift; signing child; second private transfer; generic sign/path/key/fd export; wrong profile/build/wipe domain; child/parent secret-copy or wipe gap; generic transaction wrapper; raw client/query/SQL escape; delivery generation/order drift; runtime-start ABI drift; origin/materializer/detail/probe/cap drift; surviving mutant; private material; or any live/V-only act.

After the requested three-path v13 authority commit, a fresh independent Sol reviewer must inspect all v13 bytes, the exact dependency/rejected-evidence pins, zero-I/O and trace fixtures, safe no-hardlink 39→32→20 shadow, source map, projection, syntax, hashes, and STOP boundary. Real v13 Task 0 remains unauthorized until that review returns authority/spec/plan PASS with `P0=0 P1=0 P2=0 P3=0`. C3.5 remains unauthorized until a separately reviewed real Task 0 PASS result exists. FIX-10 C0 and C4 retain the ordered downstream gates; only V may perform production build/install, provision, key, database, activation, service, acceptance, merge, push, or Done acts.
