# FIX-10 — materialized gateway values and pinned-signer activation barrier

**Successor authority packet — 2026-09-05, fix round 3.** This document incorporates `SPEC-v2.md`, `SPEC-v3.md`, and `SPEC-v4.md` without changing their bytes and supersedes only the two clauses identified below. Frozen `SPEC.md`, `PLAN.md`, v2, v3, v4, and their decision rows remain immutable evidence. Every v4 source-complete proof, privilege, topology, state-machine, lifecycle-audit, recovery, rollback, test, and STOP law not expressly changed here remains binding.

This packet authorizes documentation and fresh independent authority review only. It authorizes no source, package, test, migration, role, grant, worktree, live root, identity, key, marker, database, process, quiescence, activation, service, acceptance, merge, push, board, or Done act. FIX-10 implementation remains STOP.

## 1. Verified correction boundary and dependency gate

The round-3 Sol findings were independently checked against immutable authority and both stand:

1. `SPEC-v4.md` assigned RFC 8785 bytes `J({...})` to `action_payload`, but binding FIX-09 v4 defines that signed database member as `jsonb` and v5 requires the shared gateway to receive an already-materialized object/array value. A byte buffer is rejected at that boundary and a UTF-8 string would be a JSONB scalar rather than the required object.
2. V4's final activation parity check compared `dev`, `ino`, ownership, mode, link count, type, and size, but not the currently loaded private bytes. An owner can replace an Ed25519 PKCS#8 value in place with another same-size encoding while those fields remain equal. Activation could commit before the eventual writer discovers that its key differs from generation-one authority.

The corrections below require no new database object, migration, role, grant, persistent filesystem path, public package bin, product feature, or raw action DML. They preserve the human-approved VNOW-05 Option A single-root topology.

All implementation remains blocked until one future full `FIX09_C35_REVIEWED_REF` and independent result receipt satisfy every v3/v4 gate and additionally bind these exact facts:

- the reviewed `ChainedAgentActionInput.action_payload` accepts a materialized null-prototype object and the real `appendChainedAgentAction` stores it as a JSONB object;
- action-ref replay returns the original action id without allocating a new chain position;
- the reviewed signer/configuration seam lets each of the five row-writer processes receive and retain one already-loaded `AuditChainSigner` without reopening its private pathname before its first signed row;
- the activation-pinned watchdog bootstrap authority from binding FIX-09 v6 and its later successors is preserved: generation one contains five row-keyring entries, while the sixth inventory slot is the activation-pinned witness key and the row keyring's `witness_keys` remains empty;
- the API, runner, scheduler, daemon, obsctl reconciler, and watchdog can start under their exact real principals in the non-writing hold state defined in §3 without opening a database connection, accepting work, starting a timer/listener, or appending a journal.

If the reviewed FIX-09 ref lacks any fact, FIX-10 Task 0 is STOP for successor authority. FIX-10 may not patch around the gap in product source, invent a signer broker, pass a private key across principals, or add a socket/path/migration.

## 2. Materialized `action_payload` is the gateway value

V4 §3 is replaced only as follows. Let `O` be one fully verified completed `obsctl-outbox-action/v3` record. `O` is the sole semantic input. Define `N`, a materializer for this schema, not a general JSON coercion:

1. allocate with `Object.create(null)`;
2. define exactly the listed own string-keyed data properties in the listed order, each enumerable and with no getter, setter, symbol, proxy, or inherited member;
3. accept only the already-validated string or JSON-null values specified below;
4. materialize a nested object by the same rules before installing it in its parent;
5. call `Object.freeze` on each child and then its parent, require `Object.getPrototypeOf(value) === null`, `Object.isFrozen(value) === true`, and reject any extra/missing key or different descriptor.

The exact deeply frozen materialized payload object is:

~~~text
action_parameters = N([
  ["writer_identity",      O.action_parameters.writer_identity],
  ["public_input_sha256",  O.action_parameters.public_input_sha256],
  ["private_key_id",       O.action_parameters.private_key_id]
])

action_payload = N([
  ["schema",               "obsctl-agent-action/v3"],
  ["invocation_id",        O.invocation_id],
  ["requested_at_ms",      O.requested_at_ms],
  ["outbox_seq",           O.outbox_seq],
  ["outbox_hash",          O.outbox_hash],
  ["action_parameters",    action_parameters],
  ["local_outcome",        null]
])
~~~

`action_payload` is a JavaScript object value. It is never a `Buffer`, `Uint8Array`, `ArrayBuffer`, string, boxed scalar, class instance, object with `Object.prototype`, or parsed mutable source object. `local_outcome` is permanently JSON null. The completed action input is separately materialized as a frozen null-prototype record with exactly:

~~~text
D(O) = N([
  ["source",          "ops"],
  ["writer_identity", "obsctl"],
  ["actor",           O.actor],
  ["action_kind",     O.action_kind],
  ["occurrence_id",   null],
  ["incident_id",     null],
  ["action_ref",      O.action_ref],
  ["action_payload",  action_payload]
])
~~~

Define separately:

~~~text
J(x) = RFC8785 canonical UTF-8 bytes of the admitted materialized JSON value x
~~~

`J(action_payload)` and `J(D(O))` are comparison, signing-oracle, and evidence bytes only. Neither byte string is passed as `action_payload`, substituted for `D(O)`, stored as a JSONB string, or reparsed before the gateway call. The gateway receives the materialized `D(O)` object and applies binding FIX-09's own total descriptor snapshot. The only serialized raw boundary remains the signed outbox record.

### 2.1 Freeze instant and restart equivalence

On the first database attempt, reconciliation verifies completed `O`, materializes `D(O)` once, and freezes the complete tree before `BEGIN`. It passes that exact object to the reviewed gateway. No local outcome, journal record, marker, status result, clock, database observation, retry count, or exception can mutate or enrich it.

After process restart, reconciliation re-verifies the same completed outbox bytes and materializes a new object tree. Restart equivalence means all of these are equal to the first attempt:

- exact own-key sets and listed order at both levels;
- null prototype at both levels;
- frozen, enumerable, nonwritable, nonconfigurable data descriptors;
- exact primitive/null leaf values;
- `J(action_payload)` and `J(D(O))` byte-for-byte.

Object identity across processes is neither possible nor required. Materialized semantics are exact. The original `O.action_ref` remains the idempotency key.

### 2.2 Real gateway and commit-unknown law

The production adapter calls only:

~~~text
appendChainedAgentAction(client, D(O), obsctlRowSigner)
~~~

with the materialized object. A required real reviewed-gateway/PostgreSQL test performs the following exact sequence:

1. append one STATUS action in a caller-owned transaction using materialized `D(O)`;
2. commit the transaction, then make the caller observe `COMMIT_UNKNOWN` before it receives the id;
3. append the already binding local unreachable result without changing `O` or either database value;
4. restart from the signed outbox bytes and invoke the real gateway with the restart-equivalent materialized object and the same `action_ref`;
5. read back one row and require `jsonb_typeof(action_payload) = 'object'`, `jsonb_typeof(action_payload->'action_parameters') = 'object'`, `action_payload->'local_outcome' = 'null'::jsonb`, and exact JSONB equality to the admitted object;
6. require the original `agent_action_id`, unchanged partition head and chain sequence, and no second action row.

A buffer carrying `J(action_payload)` and its UTF-8 string form are mandatory mutants. Each must be rejected before insert or chain allocation and cannot produce a reconciliation receipt.

## 3. Six live pinned-signer sessions before activation

V4 §4.3's detached attestation set and final stat-only parity are replaced by this section. The v4 exact six-slot inventory, distinct-principal law, owner/mode/path rules, authorizations, and freshness input remain. The FIX-09 v6 witness correction is explicit: the five row signers are authorized by generation-one row-keyring entries; `watchdog_witness` is authorized by the completed activation's `witness_bootstrap_key_id`, `witness_bootstrap_spki_der_base64`, and `witness_bootstrap_min_seq="1"`, never by a row-keyring witness entry or by its private leaf.

### 3.1 Quiesced means a sealed pre-write process state

For this ceremony, each inventory slot is represented by the exact production signer process that will perform its first post-activation write: API occurrence writer, runner occurrence writer, scheduler occurrence writer, daemon action writer, obsctl reconciler, and watchdog witness writer. V launches each under the inventory's real effective uid/gid with one inherited connected full-duplex descriptor named symbolically `OBS_CHAIN_SIGNER_BARRIER_FD`. Its positive descriptor number is a required V-later per-process input with no default.

Before activation, the process is in `PREACTIVATION_HOLD`. In that state it may initialize only secure root traversal, public authority verification, its own private-key loader, the signer barrier protocol, memory zeroization, and process-exit handling. It must not open a database socket, accept product/daemon/CLI work, install an emitter, begin a listener, start a refresh/timer, append outbox/V/watchdog history, or expose a signing endpoint. Therefore it is a stopped and quiesced writer under binding FIX-09 v4 §10 even though the reviewed binary process exists. FIX-09's “start signed writers” step is the authenticated release from this hold, in its binding product-writers → daemon/obsctl → watchdog order.

The reviewed C3.5 signer seam must accept the already-loaded signer object from this process and must not reopen the pathname or create a second signer before its first row. If that seam is absent, no preload hook, global singleton, sidecar, broker, product edit, or private-key transfer may substitute.

### 3.2 Stable owner load and pinned identity

After all public/private staging, activation-candidate staging, service quiescence, and proof of no open writer transaction, V creates a fresh uniformly random 32-byte nonce and represents it as 64 lowercase hex. It also creates one canonical lowercase UUIDv4 `barrier_id` and one independently random canonical lowercase UUIDv4 `session_id` per slot. V never deliberately reuses any member of this tuple. One live coordinator accepts each `(barrier_id,nonce,session_id,slot)` exactly once; a recovery/restart samples a wholly new tuple, so an attestation from another attempt cannot match. No persistent replay ledger or path is added. The existing required attestation-staleness input independently rejects an old transcript.

Each signer process captures its inherited descriptor once, receives its slot/session/nonce and the completed activation, keyring, and inventory digests, and securely opens only its inventory leaf. The private leaf is read exactly once from that opened read-only descriptor. Before and after the read, and once again before its readiness signature, the process obtains descriptor and path metadata and requires equality of this exact version vector:

~~~text
{dev,ino,uid,gid,mode,nlink,size,mtime_ns,ctime_ns}
~~~

All numeric members are canonical nonnegative decimals; mode is exactly `0600`; `nlink` is `1`; size is positive; path and descriptor dev/ino match; all existing v3/FIX-09 no-follow, ancestor, same-device, owner/group, regular-file, DER, no-trailing-byte, and safe-path checks remain. A pre/post change refuses.

The process decodes Ed25519 PKCS#8, derives RFC 8410 SPKI DER and the binding lowercase-hex SHA-256 key id, and installs the resulting private `KeyObject` into its reviewed signer. That exact signer object and the still-open read-only descriptor are pinned to the process/session. Neither can be replaced, reloaded, transferred, or selected by pathname before release. Transient DER buffers are zeroed after the signer is installed. The private `KeyObject` is zeroized/released on abort or shutdown where the runtime permits.

### 3.3 Exact readiness attestation and live hold

Each process sends one RFC 8785 completed object. The unsigned object is exactly:

~~~json
{
  "schema":"obs-chain-signer-readiness/v2",
  "barrier_id":"<canonical lowercase UUIDv4>",
  "nonce":"<64 lowercase hex>",
  "session_id":"<canonical lowercase UUIDv4>",
  "pid":"<positive decimal>",
  "inventory_id":"<inventory UUID>",
  "activation_id":"<activation UUID>",
  "activation_manifest_sha256":"<64 lowercase hex>",
  "public_keyring_sha256":"<64 lowercase hex>",
  "slot":"<exact inventory slot>",
  "writer_identity":"<exact identity or null>",
  "relative_pk8_path":"<exact inventory path>",
  "principal_uid":"<canonical nonnegative decimal>",
  "principal_gid":"<canonical nonnegative decimal>",
  "observed":{"dev":"<decimal>","ino":"<decimal>","uid":"<decimal>","gid":"<decimal>","mode":"0600","nlink":"1","size":"<positive decimal>","mtime_ns":"<decimal>","ctime_ns":"<decimal>"},
  "algorithm":"ed25519",
  "derived_key_id":"<64 lowercase hex>",
  "row_authorizations":[{"table":"<literal>","source":"<literal>","min_chain_seq":"1","max_chain_seq":null}],
  "witness_authorization":{"min_witness_seq":"1","max_witness_seq":null},
  "attested_at_ms":"<positive decimal>",
  "signing_key_id":"<same derived key id>"
}
~~~

As in v4, `row_authorizations=[]` only for the witness and `witness_authorization=null` only for a row signer. The completed object adds exactly `attestation_signature_base64`, where:

~~~text
attestation_signature = Ed25519.Sign(
  PINNED_SK_signer,
  UTF8("obs-chain-signer-readiness-signature/v2") || 0x00 || J(unsigned_attestation)
)
~~~

The authenticated live session is the V-created inherited descriptor plus the fresh nonce/session transcript and signer signature. V binds the child PID returned by its launcher to `pid`, requires the process remain alive on that exact descriptor, verifies the signature using the independently authorized public SPKI, and consumes no private byte. A copied attestation on a new descriptor, PID, nonce, barrier, or session is invalid.

After readiness, every process remains blocked in `PREACTIVATION_HOLD`, monitors descriptor EOF/error, retains the exact signer/key, and accepts only barrier messages carrying its nonce, barrier id, session id, slot, and activation digest. Before the first activation insert, V samples one further uniformly random 32-byte `commit_challenge`, encoded as 64 lowercase hex and unique within the barrier, and sends it to all six sessions. Each process repeats path/descriptor metadata checks without rereading private bytes and returns this exact unsigned object plus exactly `commit_check_signature_base64`:

~~~json
{
  "schema":"obs-chain-signer-commit-check/v1",
  "barrier_id":"<same barrier UUIDv4>",
  "nonce":"<same 64 lowercase hex>",
  "session_id":"<same session UUIDv4>",
  "pid":"<same positive decimal>",
  "slot":"<same inventory slot>",
  "activation_manifest_sha256":"<same 64 lowercase hex>",
  "commit_challenge":"<fresh 64 lowercase hex>",
  "observed":{"dev":"<decimal>","ino":"<decimal>","uid":"<decimal>","gid":"<decimal>","mode":"0600","nlink":"1","size":"<positive decimal>","mtime_ns":"<decimal>","ctime_ns":"<decimal>"},
  "pinned_key_id":"<same derived key id>",
  "checked_at_ms":"<positive decimal>"
}
~~~

~~~text
commit_check_signature = Ed25519.Sign(
  PINNED_SK_signer,
  UTF8("obs-chain-signer-commit-check-signature/v1") || 0x00 ||
  J(unsigned_commit_check)
)
~~~

V verifies the signature with the same independently authorized SPKI, requires the metadata vector equal the readiness value, independently lstats the path without reading it, revalidates all six public authorization vectors, attestation/commit-check ages, PIDs, and sessions, and requires all six responses to carry the one current challenge. A missing, duplicate, old, cross-session, or replayed response refuses.

The full metadata check rejects a lasting same-inode/same-size replacement after attestation. More importantly, the first writer uses the already-pinned attested key, so a pathname mutation after the last metadata sample cannot cause the activated process to load a different key. It either remains on the exact pinned signer or fails closed; it never reloads.

### 3.4 Activation order, failures, and release

The exact binding order is:

1. validate and stage all six private leaves, public root, generation-one public authority, inventory, and completed activation candidate; quiesce every write path and prove no writer transaction;
2. launch six exact signer processes in `PREACTIVATION_HOLD` and issue a fresh barrier/nonce/session set;
3. receive and verify all six readiness attestations; any failure aborts every session, zeroizes keys, rolls back the still-open activation transaction, leaves the database activation singleton empty, and leaves final `activation.json` absent;
4. obtain all six live `COMMIT_CHECK` responses and complete V's final public/private authorization parity; any disconnect, crash, timeout, stale/replayed nonce, metadata change, or mismatch before commit has the same zero-commit/zero-publication result;
5. insert the exact activation row and commit while all six sessions remain held;
6. publish the byte-identical staged activation file by the binding same-filesystem rename/fsync/reopen law while all six sessions remain held;
7. only after database/file parity and durable publication, send `RELEASE` to the exact held processes in product-writers → daemon/obsctl → watchdog order. The release record is exactly `{schema:"obs-chain-signer-release/v1",barrier_id,nonce,session_id,slot,activation_manifest_sha256,public_keyring_sha256,release_ordinal}`, where the first five values match that session, both digests match durable public authority, and `release_ordinal` is canonical decimal `1..6` in the binding order. Each process reopens only the public activation/keyring, verifies database/file/public parity and the installed pinned key id, and enables its write path without reopening the private leaf. A mismatched, duplicate, reordered, or prepublication release aborts that process.

There is no cross-database/filesystem atomicity claim. A controller crash or session loss after the database commit cannot be rolled back. It yields the inherited exact `CHAIN_BOOTSTRAP_DB_COMMITTED_FILE_PENDING` state, releases no process, keeps every surviving process held, and starts no replacement writer. Recovery uses a fresh barrier id, nonce, and six real-principal sessions, proves the same activation/keyring/inventory/private-key ids, publishes only the already committed matching activation document, then releases the new exact set. Any mismatch remains STOP. This is the only source-compatible exception to the precommit zero-commit law.

An individual process crash after durable activation but before release cannot weaken activation: no unverified process is released. Its replacement performs the normal binding FIX-09 cold-start validation of root, activation, database parity, public authorization, current private leaf, and derived key id before it may write.

Every later restart independently reopens its own current leaf under the full descriptor law, derives its SPKI id, checks activation/key authorization and next sequence, and fails closed on replacement or mismatch. The one-time barrier attestation never authorizes a later process.

## 4. Source, package, tests, and rollback

V4's path list remains exact. The action correction stays in `tools/obs-listener/src/obsctl/action-wire.ts` and `reconcile.ts`. The barrier replaces detached behavior inside `signer-readiness.ts` and `signer-inventory.ts`; it adds no public bin or persistent file. `tools/obs-listener/package.json` still exposes only `obsctl`, and `bin/obsctl.mjs` still imports only compiled CLI output.

No product source is authorized. The future reviewed FIX-09 signer/configuration seam is a Task-0 dependency, not something FIX-10 may retrofit. Non-live tests use explicit temporary roots, runtime-generated ephemeral keys, fake or disposable real principals, inherited connected descriptors, controlled process failures, and disposable PostgreSQL only.

Required new cases, in addition to every v4 case and mutant, are:

- null-prototype/deep-freeze/descriptor checks for the exact payload and nested parameters;
- a real reviewed-gateway JSONB-object readback and commit-unknown/restart replay with original id/no chain advance;
- `Buffer` and UTF-8-string payload mutants rejected before allocation;
- for each six-slot signer, same-inode/same-size replacement before open, during read, and after attestation/before activation;
- precommit session disconnect, process crash, stale nonce, replayed nonce, and postcommit disconnect, with zero activation commit/publication for every precommit case and no process release for the postcommit case;
- exact-six-process release only after durable DB/file parity;
- post-activation restart with the same authorized key succeeds, while a replaced key fails before any row/journal write.

Before activation, rollback removes only future FIX-10 implementation commits and explicit temporary fixtures. After the database activation commit, forward-only FIX-09 recovery governs; no row/file/history deletion, reset, rewrite, backfill, re-sign, or incompatible rollback is authorized.

## 5. Review, admission, and STOP

A fresh independent review must bind the exact v5 commit/tree/diff and contain each exact standalone result once:

~~~text
AUTHORITY FIDELITY VERDICT: PASS
SPEC VERDICT: SPEC PASS
PLAN VERDICT: PLAN PASS
UNRESOLVED: P0=0 P1=0 P2=0 P3=0
FIX-10 IMPLEMENTATION AUTHORIZED: NO
~~~

That review still does not authorize implementation. Task 0 may begin only after the future exact `FIX09_C35_REVIEWED_REF` and its independently zero-finding result prove all v3-v5 dependency facts. C4 remains blocked until the separately reviewed C0, compatibility, and V bootstrap receipts pass.

STOP on any v1-v4 byte edit; byte/string `action_payload`; mutable or ordinary-prototype payload; canonical bytes passed to the gateway; local-result payload drift; non-object JSONB readback; different restart semantics; second action id or chain advance; detached readiness substituted for a live pinned process; private-key transfer/broker; signer reload before first write; missing metadata member; same-inode mutation acceptance; reused nonce/session; precommit activation after session loss; process release before durable DB/file parity; false rollback after DB commit; witness authority taken from the row keyring; product edit; new persistent path/bin/migration/role/grant; raw action DML; missing dependency/review receipt; production default or live act; or any surviving v2-v4 mutant.
