# FIX-10 successor authority correction — privilege-separated control and lifecycle C0

**Successor authority packet — 2026-09-05, fix round 1.** This document incorporates SPEC-v2.md and supersedes only the clauses identified here. SPEC.md, SPEC-v2.md, PLAN.md, and PLAN-v2.md remain immutable evidence. The human-approved VNOW-05 Option A remains the controlling choice: one symbolic required control root, CAPTURE_OFF, KILL, HMAC ARMED, separately Ed25519-signed proof, signed local outbox and V journal, and the watchdog journal under that root.

This packet authorizes documentation and fresh independent authority review only. It authorizes no source, product, test, package, migration, worktree, live root, identity, credential, key, marker, database, service, acceptance, merge, push, board, or Done act. FIX-10 implementation remains STOP.

## 1. Admission and binding dependencies

The present FIX-09 authority is not admitted. The reviewed v9 commit af9751e168575921b5e8c7a5aa350137e54135f5 has SPEC PASS but PLAN REWORK, P1=1, Task 0 admission NO, and C3.5 code NO. No implementer may fill a dependency ref from this packet.

A future successor must supply a full lowercase 40-hex FIX09_C35_REVIEWED_REF. Before any FIX-10 test or source edit, one independently validated receipt must bind that ref, tree, migration blob, public chain export blobs, ACL catalog, and review report containing exactly once:

~~~text
REVIEWED REF: <exact FIX09_C35_REVIEWED_REF>
SPEC VERDICT: SPEC PASS
CODE QUALITY VERDICT: CODE QUALITY PASS
UNRESOLVED: P0=0 P1=0 P2=0 P3=0
C3.5 RESULT: PASS
~~~

The receipt must also bind FIX09_CHAIN_MIGRATION_PATH and FIX09_CHAIN_MIGRATION_BLOB and prove that this reviewed chain migration exposes to debateai_obs_listener the action INSERT/read/sequence and activation-read surface used by appendChainedAgentAction, that the action gateway is the sole production action writer, and that the V-only migration owner remains the only database principal admitted to insert the activation singleton. A changed export, grant, migration blob, report, tree, or ref is STOP.

Implementation also requires a fresh independent review of this v3 authority with SPEC PASS, PLAN PASS, and zero P0-P3. C4 does not become executable merely because this document or a later C0 implementation exists. Section 13 defines its exact remaining receipts.

## 2. Preserved intent and narrowed scope

V may invoke a no-model obsctl CLI. Kill and arm open no database socket and load no database row-signing key. Kill disables FIX-07 capture first and requests daemon stop second. Arm authenticates V, records durable intent, publishes a new ARMED value, and removes CAPTURE_OFF before KILL. Status reports the capture switch the reviewed FIX-07 runtime actually consumes, even when that truth differs from local mutation authority.

FIX-10 never enables mutation or quick_arm. Both effective values are OFF in every local state and after every restart. Approval, denial, drift reveal, mutation enablement, and quick-arm repin remain outside this slice.

No product source is changed. Independent runtime canary evidence comes from three V-triggered existing product exercises whose resulting already-supported obs.occurrence rows are selected by a V-pinned public policy mapping. If an API, runner, or scheduler exercise is absent or stale, proof publication stops. This fail-closed requirement adds no capture column, endpoint, background product action, or migration.

## 3. Required symbolic inputs and principals

Production supplies every value below explicitly. There is no repository, cwd, home, development, inferred, fallback, numeric identity, staleness, or path default.

| Input | Exact law |
|---|---|
| OBS_CONTROL_DIR | nonempty NUL-free absolute canonical pre-existing directory, byte-equal to realpath.native, on a V-selected device different from Postgres |
| OBS_POSTGRES_DATA_DEVICE_ID | canonical positive decimal st_dev; unequal to the opened root device |
| OBS_ARMED_HMAC_KEY_FILE | absolute canonical path byte-equal to {OBS_CONTROL_DIR}/keys/armed-marker.hmac |
| OBS_ARMED_TOKEN_STALENESS_MS | canonical positive safe integer |
| OBS_AUTHORITY_PROOF_STALENESS_MS | canonical positive safe integer |
| OBS_KILL_POLL_INTERVAL_MS | canonical positive safe integer |
| OBS_KILL_LATENCY_MS | canonical positive safe integer not less than the captured poll plus local-abort bound |
| OBS_SPOOL_DIR | absolute canonical pre-existing spool root; no default |
| OBS_POLICY_BUNDLE_PATH | absolute canonical V-pinned bundle containing the three runtime canary expectations; no default |
| OBS_POLICY_CUSTODIAN_TOKEN | out-of-band V credential source for arm and lifecycle authority increase; never argv, output, history, or environment evidence |
| OBSCTL_DATABASE_URL | status-only listener credential; absent from kill and arm composition |
| OBS_CHAIN_ADMIN_DATABASE_URL | lifecycle-only V migration-owner credential; absent from kill, arm, status, daemon, and watchdog composition |

The required symbolic principals are pairwise distinct:

- V_PROVISIONER_UID:V_PROVISIONER_GID — V-only lifecycle publication and exact ownership setup;
- OBSCTL_UID:OBSCTL_GID — kill, arm, status, outbox, and V-journal process;
- DAEMON_UID:DAEMON_GID — listener KILL observer and proof signer;
- WATCHDOG_UID:WATCHDOG_GID — FIX-09 public verifier and watchdog-journal signer.

OBS_PUBLIC_READ_GID is an exact publication group. Among runtime principals, its members are OBSCTL_UID and DAEMON_UID only. WATCHDOG_UID obtains owner access to its own journal and no group-derived access to obsctl private state. OBS_CHAIN_PUBLIC_GID is the distinct inherited FIX-09 public-material group; among these principals its members are OBSCTL_UID, DAEMON_UID, and WATCHDOG_UID. Neither group grants private-key or history append access. No numeric uid, gid, username, membership, or production root is named here.

Lifecycle commands require both effective V_PROVISIONER_UID and the V credential. Kill, arm, and status require effective OBSCTL_UID; arm additionally requires the V credential. The daemon and watchdog never run with either V or obsctl effective identity. Tests use explicit distinct temporary identities and fresh ephemeral key material.

## 4. Exact single-root topology and access matrix

V precreates stable directories, append-only leaves, and private keys. Runtime code does not create, chmod, chown, repair, truncate, or rotate a stable directory/history. ARMED and proof may be absent before publication; CAPTURE_OFF and KILL may be absent as state.

| Exact object | Owner:group | Mode | Admitted access |
|---|---|---:|---|
| {OBS_CONTROL_DIR} | OBSCTL_UID:OBS_PUBLIC_READ_GID | 0751 | obsctl marker directory mutation; daemon fixed-name observation; no daemon directory write |
| {OBS_CONTROL_DIR}/CAPTURE_OFF | OBSCTL_UID:OBSCTL_GID | 0600 | obsctl create/remove; FIX-07 and daemon lstat only |
| {OBS_CONTROL_DIR}/KILL | OBSCTL_UID:OBSCTL_GID | 0600 | obsctl create/remove; daemon lstat only |
| {OBS_CONTROL_DIR}/ARMED | OBSCTL_UID:OBS_PUBLIC_READ_GID | 0640 | obsctl replace; daemon exact-byte read only |
| {OBS_CONTROL_DIR}/proof | DAEMON_UID:OBS_PUBLIC_READ_GID | 2750 | daemon atomic publication; obsctl read/traverse only |
| {OBS_CONTROL_DIR}/proof/authority-proof.json | DAEMON_UID:OBS_PUBLIC_READ_GID | 0640 | daemon replace; obsctl read only |
| {OBS_CONTROL_DIR}/keys | V_PROVISIONER_UID:V_PROVISIONER_GID | 0711 | fixed-name traversal only |
| {OBS_CONTROL_DIR}/keys/armed-marker.hmac | OBSCTL_UID:OBSCTL_GID | 0600 | obsctl read only |
| {OBS_CONTROL_DIR}/keys/daemon-proof.pk8 | DAEMON_UID:DAEMON_GID | 0600 | daemon read only |
| {OBS_CONTROL_DIR}/keys/daemon-proof.spki | V_PROVISIONER_UID:OBS_PUBLIC_READ_GID | 0440 | obsctl and daemon read only |
| {OBS_CONTROL_DIR}/keys/obsctl-outbox.pk8 | OBSCTL_UID:OBSCTL_GID | 0600 | obsctl read only |
| {OBS_CONTROL_DIR}/keys/watchdog-witness.pk8 | WATCHDOG_UID:WATCHDOG_GID | 0600 | watchdog read only |
| {OBS_CONTROL_DIR}/outbox | OBSCTL_UID:OBSCTL_GID | 0700 | obsctl only |
| {OBS_CONTROL_DIR}/outbox/obsctl-actions.jsonl | OBSCTL_UID:OBSCTL_GID | 0600 | obsctl append only |
| {OBS_CONTROL_DIR}/witness | V_PROVISIONER_UID:V_PROVISIONER_GID | 0711 | fixed-name traversal; stable leaves precreated |
| {OBS_CONTROL_DIR}/witness/obsctl-actions.jsonl | OBSCTL_UID:OBSCTL_GID | 0600 | obsctl append only |
| {OBS_CONTROL_DIR}/witness/watchdog-chain.jsonl | WATCHDOG_UID:OBS_PUBLIC_READ_GID | 0640 | watchdog append; obsctl and daemon read only |

The mode-0640 watchdog leaf is the sole watchdog-publication mechanism for obsctl and daemon. OBS_PUBLIC_READ_GID has no write bit. Obsctl never opens that leaf with O_WRONLY, O_RDWR, O_APPEND, creation, rename, unlink, chmod, or truncation flags. The watchdog never opens the V journal or outbox. The daemon cannot create or remove root markers because it lacks root-directory write permission; cannot open the HMAC, outbox, obsctl row, or watchdog private key; cannot append the outbox or V journal; and cannot forge obsctl history. Obsctl cannot open daemon-proof.pk8, watchdog-witness.pk8, or any non-obsctl row key, and cannot append watchdog history.

Inherited FIX-09 paths remain under the same root with this reconciled exact matrix:

| Exact object | Owner:group | Mode |
|---|---|---:|
| {OBS_CONTROL_DIR}/chain | V_PROVISIONER_UID:OBS_CHAIN_PUBLIC_GID | 0750 |
| {OBS_CONTROL_DIR}/chain/private | V_PROVISIONER_UID:V_PROVISIONER_GID | 0711 |
| {OBS_CONTROL_DIR}/chain/private/<writer_identity>.pk8 | matching effective WRITER_UID:WRITER_GID | 0600 |
| {OBS_CONTROL_DIR}/chain/public-keyring.json | V_PROVISIONER_UID:OBS_CHAIN_PUBLIC_GID | 0440 |
| {OBS_CONTROL_DIR}/chain/custodian-root.spki | V_PROVISIONER_UID:OBS_CHAIN_PUBLIC_GID | 0440 |
| {OBS_CONTROL_DIR}/chain/activation.json | V_PROVISIONER_UID:OBS_CHAIN_PUBLIC_GID | 0440 |

This replaces FIX-09 v5 only for the shared root owner/group, keys parent owner, witness parent, and watchdog leaf needed by VNOW-05 privilege separation; chain protocol bytes and leaf semantics do not change. Each private leaf remains effective-writer-owned 0600. The obsctl row leaf is OBSCTL_UID:OBSCTL_GID 0600. The daemon may traverse chain/private to a fixed name but cannot read any 0600 row leaf.

The only runtime-transient path is {OBS_CONTROL_DIR}/outbox/.obsctl.lock, OBSCTL_UID:OBSCTL_GID 0600. It uses exclusive no-follow creation. No age heuristic breaks a surviving lock. V may remove one only after proving no owning invocation exists.

The ARMED HMAC, daemon proof, obsctl local history, obsctl database row, watchdog witness, and V custodian signing key families are pairwise byte-distinct and purpose-distinct.

## 5. Filesystem, parsing, atomicity, and signing-key identity

All v2 secure-open and durability rules remain, with the modes and principals above replacing v2. In summary:

1. Capture immutable fs primitives and nonzero numeric O_NOFOLLOW/O_CLOEXEC flags at module initialization.
2. Reject a noncanonical or escaping root before descendant I/O; lstat every ancestor as a real directory with no group/world write bit.
3. Open descendants directory-relative through pinned descriptors. Pre/post lstat and fstat must agree on dev, ino, uid, gid, mode, nlink, size, and type. Every regular leaf has nlink one and its parent device.
4. Marker create is per-leaf O_CREAT|O_EXCL|O_NOFOLLOW|O_CLOEXEC, exact zero bytes/mode, file fsync, root-directory fsync, and reopen verification. Removal validates the inode, unlinks the fixed name, proves absence, and fsyncs the root. Two markers are never described as jointly atomic.
5. JSON replacement uses an unguessable same-directory exclusive temp, total write, file fsync, re-fstat, same-device rename, directory fsync, and final reopen. Proof temps inherit proof's setgid publication group and are forced to exact 0640 before exposure.
6. History append holds the obsctl lock through complete prior-chain validation, opens the fixed precreated leaf O_WRONLY|O_APPEND|O_NOFOLLOW|O_CLOEXEC, uses a total write loop, fsyncs, and rechecks. Partial tails are permanent invalidity pending new V authority.
7. Readers use read-only flags. Unexpected ENOENT, race, short I/O, close failure, metadata drift, symlink, hardlink, FIFO/socket/device, or writable trust ancestor is closed failure.

Raw JSON uses the reviewed FIX-09 parseUniqueJsonUtf8 export after the exact C3.5 gate. It rejects duplicate keys at every depth, BOM, malformed UTF-8, trailing bytes, CR, lone surrogate, forbidden numbers, extras, omissions, and cap excess before materialization. RFC 8785 canonical UTF-8 contains no BOM, whitespace, or newline. Define J(x) as those bytes and LP(x) as UINT32_BE(byte_length(x)) followed by x.

For every Ed25519 private PKCS#8 used by the outbox or V journal:

~~~text
public_spki_der = RFC8410 Ed25519 SubjectPublicKeyInfo DER
                  derived from the successfully loaded PKCS#8 private key
signing_key_id = lowercase_hex(SHA256(public_spki_der))
~~~

Only that derivation is valid. Hashing PKCS#8 bytes, PEM text, base64 text, raw 32-byte public material, a filename, caller-provided id, or a separately loaded unmatched SPKI is rejection. The private key must decode as Ed25519 with no trailing bytes; the derived public SPKI must independently match any authorized public entry. Sequence-one local genesis binds this derived id.

## 6. ARMED authorization token

The v2 ARMED body, HMAC domain, and freshness law remain exact:

~~~json
{"schema":"obsctl-armed/v1","custodian":"V","issued_at_ms":"<positive canonical decimal>","expires_at_ms":"<positive canonical decimal>","nonce":"<32 lowercase hex>"}
~~~

~~~text
mac = HMAC-SHA256(
  K_armed,
  UTF8("obsctl-armed/v1") || 0x00 || J(body)
)
~~~

The completed object has exactly body and mac_sha256. Its file bytes are J(completed) plus LF. Expiry minus issuance equals OBS_ARMED_TOKEN_STALENESS_MS, and validation requires issued_at_ms not later than now_ms and now_ms strictly less than expires_at_ms. HMAC equality is constant-time.

Only obsctl reads K_armed. The daemon reads completed ARMED bytes to bind their SHA-256 but neither validates nor claims V authorization. Effective authority is the verifier conjunction: obsctl validates the HMAC and freshness, then validates a daemon proof over the exact same completed ARMED bytes.

## 7. Non-vacuous positive proof

At one captured millisecond T, the daemon may replace proof only after all capture facts below pass. Its unsigned object is exactly:

~~~json
{
  "schema":"obs-authority-proof/v2",
  "proof_id":"<canonical lowercase UUIDv4>",
  "issued_at_ms":"<T as positive decimal>",
  "expires_at_ms":"<T plus proof staleness as positive decimal>",
  "armed_sha256":"<SHA-256 of exact completed ARMED bytes including LF>",
  "activation_manifest_sha256":"<64 lowercase hex>",
  "policy_bundle_sha256":"<64 lowercase hex>",
  "spool":{"root_sha256":"<64 lowercase hex>","writable":true},
  "gap_window":{"start_ms":"<T minus staleness>","end_ms":"<T>","overlapping_first_party_rows":"0","lost_count":"0"},
  "runtime_evidence":[
    {"component":"capture:api","state":"ARMED","health_observed_at_ms":"<decimal>","canary":{"runtime":"api","source":"first_party","capture_point":"<exact V-pinned text>","fingerprint":"<64 lowercase hex>","occurrence_id":"<UUID>","occ_seq":"<positive decimal>","chain_seq":"<positive decimal>","source_event_ref":"<exact text>","writer_identity":"<exact admitted identity>","captured_at_ms":"<decimal>","chain_link":"<64 lowercase hex>"}},
    {"component":"capture:runner","state":"ARMED","health_observed_at_ms":"<decimal>","canary":{"runtime":"runner","source":"first_party","capture_point":"<exact V-pinned text>","fingerprint":"<64 lowercase hex>","occurrence_id":"<UUID>","occ_seq":"<positive decimal>","chain_seq":"<positive decimal>","source_event_ref":"<exact text>","writer_identity":"<exact admitted identity>","captured_at_ms":"<decimal>","chain_link":"<64 lowercase hex>"}},
    {"component":"capture:scheduler","state":"ARMED","health_observed_at_ms":"<decimal>","canary":{"runtime":"scheduler","source":"first_party","capture_point":"<exact V-pinned text>","fingerprint":"<64 lowercase hex>","occurrence_id":"<UUID>","occ_seq":"<positive decimal>","chain_seq":"<positive decimal>","source_event_ref":"<exact text>","writer_identity":"<exact admitted identity>","captured_at_ms":"<decimal>","chain_link":"<64 lowercase hex>"}}
  ],
  "watchdog":{"witness_seq":"<positive decimal>","observed_at_ms":"<decimal>","witness_hash":"<64 lowercase hex>","result":"<VERIFIED or VERIFIED_WITH_RECOVERY>"},
  "daemon_proof_key_id":"<64 lowercase hex>"
}
~~~

The array order is API, runner, scheduler and no other order is accepted. For each entry:

- state is exactly ARMED, never OFF, DRAINING, SPOOL_ONLY, missing, unknown, or caller-defined;
- both health and canary ages satisfy 0 <= T - observed_at_ms <= OBS_AUTHORITY_PROOF_STALENESS_MS;
- the canary is a distinct source=first_party obs.occurrence selected by that runtime's exact V-pinned exercise fingerprint/capture-point mapping;
- runtime, component, writer_identity, source_event_ref, occurrence_id, and chain_link match the stored signed row and its V-authorized FIX-09 partition;
- the three occurrence ids and source-event refs are pairwise distinct;
- the latest verified watchdog snapshot covers each occ_seq and the exact partition head at or after its chain sequence.

The daemon may query these existing rows but may not insert them or accept an obsctl, daemon, listener, watchdog, or mismatched-runtime writer as evidence. If V does not arrange a recent existing-product exercise for each runtime, proof remains absent/stale; no product source change is implied.

The recent-loss predicate uses existing obs.capture_gap only. The daemon converts T and T-staleness_ms to exact UTC RFC 3339 millisecond strings, rejecting an instant outside PostgreSQL timestamptz range, and binds them as typed query parameters WINDOW_END and WINDOW_START. It counts:

~~~sql
SELECT count(*)::text AS overlapping_first_party_rows,
       COALESCE(sum(lost_count), 0)::text AS lost_count
FROM obs.capture_gap
WHERE source = $1
  AND opened_at <= $2::timestamptz
  AND (closed_at IS NULL OR closed_at >= $3::timestamptz)
~~~

The exact parameter vector is ["first_party", WINDOW_END, WINDOW_START]. Both returned decimals must be zero. This interval-overlap predicate includes an open old gap, a gap opened in the window, and an already-closed first-party gap whose interval overlaps the window. It does not depend on closed_at being NULL, calls no reviewed-chain routine unavailable to the listener role, and needs no new column/index/migration.

The spool directory is securely opened and proven writable by its owning capture principal. KILL and CAPTURE_OFF are absent at the final pre-publication sample. The latest complete watchdog record is fully verified from public material, is fresh under the same bound, and has exactly VERIFIED/NONE or VERIFIED_WITH_RECOVERY/RECOVERY_CHECKPOINT. Activation and policy digests match.

Let P=J(unsigned_proof):

~~~text
signature = Ed25519.Sign(
  SK_daemon,
  UTF8("obs-authority-proof-signature/v1") || 0x00 || P
)
~~~

The completed object adds only daemon_signature_base64. daemon_proof_key_id is lowercase hex SHA-256 of the RFC 8410 SPKI DER derived from daemon-proof.pk8. Obsctl verifies unique JSON, signature, key id, freshness, every field, the exact current ARMED hash, and current activation/policy/watchdog bindings. Failure does not delete or rewrite an old proof; it ceases refresh, and the verifier rejects mismatch or staleness.

## 8. Invocation identity, signed outbox, and V journal

Invocation identity and deterministic action_ref remain v2. Each verb, including STATUS, has a durable outbox intent so a database commit without local receipt is replayable:

~~~text
identity = J({
  schema:"obsctl-action-identity/v1",
  invocation_id, requested_at_ms, actor, action_kind
})
action_ref = "obsctl:v1:" ||
  lowercase_hex(SHA256(UTF8("obsctl-action-ref/v1") || 0x00 || LP(identity)))
~~~

The outbox unsigned schema is v2 with action_kind widened to KILL|ARM|STATUS. Sequence one prior_outbox_hash equals the derived signing_key_id; later values equal the prior completed outbox_hash.

~~~text
B = J(unsigned_outbox)
S = Ed25519.Sign(SK_outbox,
  UTF8("obsctl-outbox-signature/v1") || 0x00 || B)
H = SHA256(
  UTF8("obsctl-outbox-link/v1") || 0x00 || LP(B) || S
)
~~~

The completed record adds only signature_base64 and lowercase-hex outbox_hash. The journal uses a separate signature/link domain with the same derived key id:

~~~text
Ed25519 domain: "obsctl-journal-signature/v1" || 0x00
SHA-256 domain: "obsctl-journal-link/v1" || 0x00
~~~

Its unsigned schema is:

~~~json
{
  "schema":"obsctl-action-journal/v2",
  "journal_seq":"<positive decimal>",
  "event_id":"<UUIDv4>",
  "recorded_at_ms":"<positive decimal>",
  "event_kind":"<COMMAND_RESULT or RECONCILED>",
  "invocation_id":"<UUIDv4>",
  "action_ref":"obsctl:v1:<64 lowercase hex>",
  "action_kind":"<KILL or ARM or STATUS>",
  "outcome":"<closed outcome>",
  "reason":"<closed reason>",
  "effects":{"capture_off":"<PRESENT|ABSENT|UNKNOWN>","kill":"<PRESENT|ABSENT|UNKNOWN>","durability":"<CONFIRMED|UNCONFIRMED>"},
  "outbox_hash":"<64 lowercase hex or null>",
  "database_action_id":"<UUID or null>",
  "prior_journal_hash":"<64 lowercase hex>",
  "signing_key_id":"<64 lowercase hex>"
}
~~~

Sequence one prior_journal_hash is the derived signing_key_id. Closed COMMAND_RESULT outcomes are:

- KILL_APPLIED, KILL_CAPTURE_ONLY, KILL_DAEMON_ONLY, KILL_NOT_APPLIED, KILL_DURABILITY_UNKNOWN, KILL_AUDIT_DEGRADED;
- ARM_AUTH_REJECTED, ARM_APPLIED_PENDING_PROOF, ARM_FAILED_ROLLED_BACK, ARM_ROLLBACK_INCOMPLETE;
- STATUS_LOCAL_INVALID, STATUS_DB_UNREACHABLE, STATUS_DB_REJECTED, STATUS_RECONCILED.

Closed reasons are NONE, AUTHENTICATION, ROOT_INVALID, LOCAL_CHAIN_INVALID, OUTBOX_APPEND, CAPTURE_OFF_CREATE, CAPTURE_OFF_FSYNC, KILL_CREATE, KILL_FSYNC, ROOT_RECHECK, ARMED_PUBLISH, MARKER_REMOVE, ROLLBACK, DB_CONFIG_ABSENT, DB_CONNECT, DB_CONNECTION_LOST, DB_IDENTITY, DB_PERMISSION, DB_GATEWAY, DB_SEMANTIC_COLLISION, DB_QUERY, DB_COMMIT_UNKNOWN, and RECEIPT_APPEND.

A RECONCILED event has outcome RECONCILED, reason NONE, a non-null database id, and a non-null outbox hash. STATUS_RECONCILED is a COMMAND_RESULT with the committed id. Every other COMMAND_RESULT has null database id. Outbox hash is non-null except KILL_AUDIT_DEGRADED, whose null value states that emergency marker effects exist without a durable intent. Emergency kill may have no journal event when the local signer or V journal is unusable; status reports marker facts and never fabricates one.

## 9. Exact command and crash protocols

### 9.1 Kill

Under the obsctl lock, kill first attempts a signed outbox intent. Regardless of intent/signing failure, it then attempts CAPTURE_OFF create/fsync/recheck and then KILL create/fsync/recheck. It samples both leaves after every caught failure.

- Both confirmed plus durable intent and KILL_APPLIED journal: print KILLED and return zero.
- CAPTURE_OFF confirmed, KILL absent: append KILL_CAPTURE_ONLY if the journal remains usable; nonzero.
- KILL confirmed, CAPTURE_OFF absent: append KILL_DAEMON_ONLY if usable; nonzero.
- Both absent after known failures: append KILL_NOT_APPLIED if usable; nonzero.
- Any fsync/root recheck uncertainty: append KILL_DURABILITY_UNKNOWN with exact observed effects if usable; nonzero.
- Both markers confirmed but intent append failed: append KILL_AUDIT_DEGRADED only if a validated journal/signing path still exists; otherwise no result; nonzero.
- Final journal append failure never prints KILLED and leaves the intent pending.

Kill never rolls back a confirmed safety marker. Retry uses a new invocation/action_ref, treats a valid existing marker idempotently, and completes the missing marker. The daemon samples KILL before DB connect, before intake, between work units, and on the independent executor timer. It aborts local work/process groups before optional database lease release and never waits for database recovery.

### 9.2 Arm

Arm validates identity/root/local histories, authenticates V, and only then appends its ARM intent. Under the lock it publishes a fresh ARMED, removes/fsyncs CAPTURE_OFF, then removes/fsyncs KILL, and appends ARM_APPLIED_PENDING_PROOF. It returns zero only after those durable writes. Proof bound to the prior ARMED cannot authorize the new token.

Any caught failure after ARMED publication recreates CAPTURE_OFF first and KILL second, fsyncs/rechecks both, and appends ARM_FAILED_ROLLED_BACK only when both are confirmed. Otherwise it appends ARM_ROLLBACK_INCOMPLETE with exact effects and returns nonzero. Authentication rejection occurs before outbox/marker mutation; when local histories are valid it appends an ARM_AUTH_REJECTED result only by first writing a matching signed intent whose action kind reveals no credential bytes. Missing or invalid local history yields no false result.

### 9.3 Truthful local states and FIX-07 capture switch

Local mutation-authority states are:

| State | Secure condition | Mutation authority |
|---|---|---|
| INVALID | root, key, proof, history, or trust validation fails | OFF |
| KILLED_COMPLETE | CAPTURE_OFF and KILL present | OFF |
| KILLED_PARTIAL | KILL present, CAPTURE_OFF absent | OFF |
| CAPTURE_DISABLED | CAPTURE_OFF present, KILL absent | OFF |
| TRIPPED | both absent, ARMED absent/invalid/stale | OFF |
| ARMING | both absent, ARMED valid, proof absent/invalid/stale/mismatched | OFF |
| READY | both absent and complete ARMED/proof conjunction valid | still OFF in FIX-10 |

Capture effective state is a separate field derived by a byte-conformant mirror of reviewed FIX-07 control.ts semantics, not by the table above:

- undefined marker path, including invalid readObsControlDir input, returns capture ON;
- lstat success for CAPTURE_OFF returns capture OFF;
- an own-data ENOENT returns capture ON;
- any other lstat result/error returns capture OFF.

Therefore ARMING is capture ON after CAPTURE_OFF removal; KILLED_PARTIAL is capture ON; an invalid configured root maps to capture ON; and a missing marker maps to capture ON. INVALID never implies capture OFF. The secure authority state and effective capture state are both printed.

### 9.4 Crash-consistent status

If root/lock/outbox/journal cannot be opened, status cannot durably record an intent. It prints the fixed fallback STATUS_LOCAL_INVALID wire, includes the independent FIX-07 switch sample, uses null for inaccessible local/DB facts, and returns nonzero. It does not claim a journal event.

Otherwise status first validates the minimum root/lock/outbox/V-journal substrate needed to record the invocation, then:

1. acquires the lock and appends/fsyncs a STATUS outbox intent before any database connection;
2. samples FIX-07 effective capture separately, validates the secure root, proof, both local histories, and watchdog journal read-only;
3. on root/outbox/V-journal substrate invalidity after intent, appends STATUS_LOCAL_INVALID when still possible and returns nonzero without DB; an invalid, missing, stale, or mismatched ARMED/proof/watchdog value is reported as authority evidence and does not by itself suppress status database reads;
4. with absent DB configuration or a pre-session connection failure, appends STATUS_DB_UNREACHABLE, prints DB fields unavailable, and returns zero only when local validation is complete;
5. after an authenticated session, requires current_user exactly debateai_obs_listener, queries fixed listener-readable status data, then reconciles every pending outbox record in ascending outbox_seq, including the current STATUS intent;
6. deterministic identity/ACL/gateway/semantic/query failure appends STATUS_DB_REJECTED; SQLSTATE connection-class failure or unknown commit outcome appends STATUS_DB_UNREACHABLE and leaves the intent pending;
7. for each committed older intent, appends RECONCILED only after COMMIT; for the current STATUS intent, appends STATUS_RECONCILED with its committed action id and returns zero.

Pending means a valid outbox record has no valid journal event with the same invocation_id, action_ref, outbox_hash, and non-null database_action_id. A commit before receipt, receipt append failure, process death, or DB connection loss leaves it pending. Retry calls the gateway with the identical action_ref; exact semantic match returns the original id without chain advance, then appends the missing receipt. Semantic collision is STATUS_DB_REJECTED and never skipped.

Status DB reason classification is closed: absent config and connection-class/commit-unknown conditions are UNREACHABLE; authenticated wrong identity, permission, data, gateway contract, query, and semantic collision are REJECTED; secure local failures are LOCAL_INVALID; only a committed gateway action plus durable local database id is RECONCILED.

## 10. Exact status wire

Status emits one RFC 8785 object plus LF, with every key present:

~~~json
{
  "schema":"obsctl-status/v2",
  "observed_at_ms":"<decimal>",
  "local_state":"<seven-state value>",
  "markers":{"capture_off":"<PRESENT|ABSENT|INVALID>","kill":"<PRESENT|ABSENT|INVALID>"},
  "capture_switch":{"effective":"<ON|OFF>","reason":"<UNDEFINED_PATH|MARKER_PRESENT|MARKER_MISSING|MARKER_READ_ERROR>"},
  "armed":{"state":"<VALID|MISSING|INVALID|STALE>","age_ms":"<decimal or null>","expires_at_ms":"<decimal or null>"},
  "proof":{"state":"<VALID|MISSING|INVALID|STALE|MISMATCH>","age_ms":"<decimal or null>","proof_id":"<UUID or null>"},
  "capture_runtimes":[
    {"component":"capture:api","state":"<exact DB state or null>","heartbeat_age_ms":"<decimal or null>","reason":"<NONE|DB_UNAVAILABLE|ROW_MISSING|FUTURE_TIME>"},
    {"component":"capture:runner","state":"<exact DB state or null>","heartbeat_age_ms":"<decimal or null>","reason":"<same closed values>"},
    {"component":"capture:scheduler","state":"<exact DB state or null>","heartbeat_age_ms":"<decimal or null>","reason":"<same closed values>"}
  ],
  "daemon":{"state":"<RUNNING|STOPPED|UNKNOWN>","proof_age_ms":"<decimal or null>","reason":"<closed value>"},
  "watchdog":{"state":"<LIVE|STALE|INVALID|UNAVAILABLE>","heartbeat_age_ms":"<decimal or null>","witness_seq":"<decimal or null>","result":"<closed FIX-09 result or null>","reason":"<closed FIX-09 reason or local reason>"},
  "database":{"state":"<RECONCILED|UNREACHABLE|REJECTED|NOT_ATTEMPTED>","reason":"<closed reason>","current_user":"<debateai_obs_listener or null>","action_id":"<UUID or null>"},
  "cursor_lag":"<nonnegative decimal or null>",
  "recent_first_party_gap_rows":"<nonnegative decimal or null>",
  "recent_first_party_lost_count":"<nonnegative decimal or null>",
  "spool":{"files":"<nonnegative decimal or null>","lines":"<nonnegative decimal or null>","reason":"<closed value>"},
  "outbox":{"pending":"<nonnegative decimal or null>","tail_hash":"<hex or null>"},
  "v_journal":{"tail_hash":"<hex or null>"},
  "watchdog_journal":{"tail_hash":"<hex or null>"},
  "mutation":{"configured":"<opaque value or null>","effective":"OFF","reason":"FIX10_FORCED_OFF"},
  "quick_arm":{"configured":"<opaque value or null>","effective":"OFF","reason":"FIX10_FORCED_OFF"},
  "policy_bundle_sha256":"<hex or null>",
  "activation_manifest_sha256":"<hex or null>",
  "keyring_sha256":"<hex or null>",
  "custodian":"V"
}
~~~

The runtime vector is always exactly API, runner, scheduler. Age is max-free exact subtraction T-observed and future time is invalid, not clamped. Watchdog age comes from the latest verified public journal observed_at; daemon proof age does not substitute. No secret, private byte, absolute root, DB URL, username beyond actor, action payload, occurrence content, or free text is output.

## 11. FIX-09 lifecycle commands owned by C0

The C0 CLI also defines these exact V-only verbs:

~~~text
obsctl chain keyring-install
obsctl chain activation-snapshot
obsctl chain bootstrap
obsctl chain rotate-row <writer_identity>
obsctl chain rotate-witness
obsctl chain recover-row <writer_identity>
obsctl chain recover-witness
~~~

The two writer_identity arguments use the reviewed FIX-09 safe identity grammar and contain no key or credential bytes. They are absent from kill/arm/status import graphs. Lifecycle descriptors are named only by these required canonical positive decimal environment values:

| Name | Exact use |
|---|---|
| OBSCTL_CHAIN_PUBLIC_INPUT_FD | completed keyring for keyring/rotation/recovery, or completed activation for bootstrap |
| OBSCTL_CHAIN_PRIVATE_INPUT_FD | new PKCS#8 for rotation/recovery; absent for keyring/activation/bootstrap |
| OBSCTL_ACTIVATION_UNSIGNED_OUTPUT_FD | exclusive unsigned activation body output; activation-snapshot only |

The command rejects an inherited descriptor with the wrong access direction, type, metadata, or already-consumed state. Candidate public documents and private keys never enter argv or ordinary environment strings. Output is explicit and exclusive. Lifecycle configuration has no default and requires V_PROVISIONER_UID plus V authentication.

keyring-install consumes a completed V-signed FIX-09 cumulative keyring, verifies unique JSON, custodian-root signature, derived ids, generation/epoch continuity, exact writer/witness intervals, and current witnessed prior digest. Generation one requires activation absent. Later generation publication refuses an unwitnessed predecessor. It stages and atomically publishes only chain/public-keyring.json.

activation-snapshot requires every occurrence/action writer, obsctl reconciler, and watchdog quiesced; proves no open writer transaction; applies no migration; and uses OBS_CHAIN_ADMIN_DATABASE_URL to read the receipt-bound reviewed chain schema, empty activation, exact legacy rows, counts, maxima, and microsecond digests under both table locks. It writes the exact unsigned activation body to the exclusive output descriptor for V to sign out of band. V custodian private material never enters the program.

bootstrap consumes the completed V-signed activation document through an inherited descriptor. It requires the receipt-bound reviewed chain migration already present, quiescence still held, generation-one keyring at its final path, activation file absent, and DB singleton empty. It stages/fsyncs activation bytes, repeats the locked legacy snapshot, inserts the exact immutable activation singleton and commits, then atomically publishes activation.json and fsyncs chain. A crash after DB commit but before file publication leaves all writers quiesced and verification unavailable. Exact rerun may publish only the same signed document matching the immutable DB row; mismatch is STOP. Bootstrap never applies a migration.

rotate-row requires the named writer quiesced, exact activation parity, verified current keyring/witness, all affected partition locks in canonical order, current tails, a V-signed next keyring from one descriptor, and a new Ed25519 PKCS#8 from another. It derives the new key id, verifies old intervals close at each tail and new intervals open at tail plus one, stages the effective-writer-owned 0600 key, publishes/fsyncs the keyring first, then atomically replaces/fsyncs that writer key. A crash between publications keeps the writer quiesced and signing closed; exact rerun completes only the same generation/key.

rotate-witness follows the same order with watchdog quiesced, last verified witness sequence/hash, a next witness interval at sequence plus one, and the WATCHDOG_UID-owned 0600 key. Planned key loss with intact verified history uses these rotation verbs and does not change epoch.

recover-row and recover-witness accept only the exact FIX-09 obs-chain-recovery/v1 checkpoint embedded in a V-signed next-generation keyring. They validate trigger, consecutive epoch/generation, last trusted witness/heads, suspect range terminal/digest, next key ids and sequences, and new private material before the same keyring-first/key-second publication. Suspect bytes are never edited or authenticated retroactively. Deleted/truncated/lost watchdog history, unknown terminal, bad checkpoint, or missing V signature is RECOVERY_AUTHORITY_REQUIRED and no publication occurs.

All lifecycle commands are locally testable only with fresh ephemeral keys, fake distinct principals, temp roots, captured descriptors, and a non-live database adapter/disposable reviewed fixture. No implementation worker may generate, sign, install, rotate, recover, or activate production material.

## 12. Database reconciliation and reviewed-chain grant conclusion

FIX-10 adds no migration, role, grant, function, table, or raw SQL action writer and does not modify the receipt-bound reviewed chain migration. Status authenticates only as existing debateai_obs_listener and checks current_user byte-for-byte. Lifecycle activation uses the separately required V migration-owner credential only for the v4/v5 bootstrap contract; it is not a runtime action writer.

Every outbox action is reconciled through reviewed appendChainedAgentAction with:

~~~text
source = "ops"
writer_identity = "obsctl"
occurrence_id = null
incident_id = null
action_ref = exact outbox action_ref
~~~

The action payload is exactly:

~~~json
{"schema":"obsctl-agent-action/v2","invocation_id":"<UUIDv4>","requested_at_ms":"<decimal>","outbox_seq":"<decimal>","outbox_hash":"<64 lowercase hex>","local_outcome":"<closed command outcome or null>"}
~~~

The row signer is chain/private/obsctl.pk8, distinct from the local-history key. Transaction ownership and idempotency remain FIX-09: obsctl begins/commits/rolls back; the gateway never does; exact replay returns the same agent_action_id with no chain advance; semantic collision rejects. Kill and arm types and loaded module graphs cannot name pg, a DB URL, the row key, the gateway, or watchdog writer.

The reviewed FIX-09 chain successor must expose the listener action/activation surfaces described in Section 1. If its final ACL or gateway instead requires a new obsctl grant/role, FIX-10 stops for new migration authority; this document does not patch the reviewed chain migration.

## 13. Source, package, test, and admission boundaries

New shared/control and obsctl sources:

~~~text
tools/obs-listener/src/control/types.ts
tools/obs-listener/src/control/fix07-switch-mirror.ts
tools/obs-listener/src/control/reader.ts
tools/obs-listener/src/obsctl/config.ts
tools/obs-listener/src/obsctl/control-root.ts
tools/obs-listener/src/obsctl/lock.ts
tools/obs-listener/src/obsctl/armed-token.ts
tools/obs-listener/src/obsctl/authority-proof.ts
tools/obs-listener/src/obsctl/local-history.ts
tools/obs-listener/src/obsctl/kill.ts
tools/obs-listener/src/obsctl/arm.ts
tools/obs-listener/src/obsctl/status.ts
tools/obs-listener/src/obsctl/reconcile.ts
tools/obs-listener/src/obsctl/status-entry.ts
tools/obs-listener/src/obsctl/lifecycle-entry.ts
tools/obs-listener/src/obsctl/chain-keyring.ts
tools/obs-listener/src/obsctl/chain-activation.ts
tools/obs-listener/src/obsctl/chain-rotation.ts
tools/obs-listener/src/obsctl/cli.ts
tools/obs-listener/bin/obsctl.mjs
~~~

Narrow existing-source edits, only after admission:

~~~text
tools/obs-listener/src/daemon/main.ts
tools/obs-listener/src/daemon/authority-proof.ts
tools/obs-listener/package.json
tools/obs-listener/tsconfig.json
package.json
pnpm-lock.yaml
~~~

No app, product, migration, FIX-07 runtime, FIX-09 frozen source, model/provider, board, or watchdog writer source is edited. The FIX-07 mirror is tested byte-for-byte against the reviewed control.ts truth table; it does not change capture behavior.

The private package exposes bin/obsctl.mjs, which imports only compiled CLI output. cli.ts parses the verb before dynamic import. kill and arm load only local control/history modules. status-entry loads status/reconcile/pg and the reviewed chain subpath. lifecycle-entry loads lifecycle modules and the V admin adapter. Production import-graph tests must reach appendChainedAgentAction from status-entry and must prove no other action writer or raw action DML is reachable.

Required tests are confined to tests/unit/fix10-*.test.ts, tests/integration/fix10-*.test.ts, tests/architecture/fix10-*.test.ts, and the inert tests/fixtures/fix10-principal-probe.mjs helper. Capture-first gates bind exact paths, expanded names, positive counts, JSON reporter result, zero skip/todo, raw stdout/stderr/rc, and three fresh runs. Required killed mutants include:

- daemon marker create/remove, HMAC/outbox/row-key read, V-journal append; obsctl daemon-key read/watchdog append; watchdog V-leaf access;
- fresh OFF, DRAINING, SPOOL_ONLY, unknown health; recent closed first-party gap; missing runtime; duplicate/mismatched canary; canary bypass of API, runner, or scheduler; stale/future evidence;
- ARMING, KILLED_PARTIAL, invalid-root, missing-marker divergences from reviewed FIX-07;
- status local invalid, DB absent/connect loss/wrong identity/ACL/gateway/query/semantic collision, commit-before-receipt, receipt failure, exact replay/idempotency, and missing production adapter edge;
- kill faults after each create/fsync/recheck/journal append with exact marker/effect/outcome/exit/retry facts;
- PKCS#8, PEM, base64, raw-public, filename, caller-id, and unmatched-SPKI key-id derivations versus an independent node:crypto SPKI-DER oracle;
- bootstrap DB/file interruption, keyring-first rotation interruption, loss versus compromise, bad recovery ranges, permanent watchdog-history loss, and any live/default input.

C4 remains STOP until all of these exact conditions exist and independently validate:

1. FIX09_C35_REVIEWED_REF receipt from Section 1;
2. this v3 authority commit plus independent SPEC PASS and PLAN PASS, zero P0-P3;
3. a reviewed FIX-10 C0 implementation ref/tree, exact diff, three-run non-live evidence manifest, private-material scan, no-forbidden-act statement, and independent SPEC/CODE QUALITY PASS with zero P0-P3 and FIX-10 C0 RESULT: PASS;
4. the exact FIX-09 Task 8 compatibility receipt binding source=ops, writer_identity=obsctl, unique replay, reviewed gateway blob, listener ACL, zero marker-command DB access, and zero raw action write;
5. the V bootstrap receipt required by the then-current reviewed FIX-09 authority, binding migration/keyring/activation digests and one verifying row for every admitted live partition. An agent cannot create or approve this receipt.

Missing, stale, mismatched, self-certified, or non-PASS receipt keeps C4 blocked.

## 14. Rollback and STOP law

Before activation, local implementation rollback removes only FIX-10 code from its isolated implementation branch and disposes only its temporary test roots/fixtures. It does not alter frozen docs, the reviewed chain migration, live files, or history.

After activation, markers, outbox, V journal, keyring, activation, recovery checkpoints, database rows, and watchdog journal are forward evidence and are never truncated, reset, deleted, re-signed, or backfilled. Kill is reversed only by authenticated arm. A local-history key loss/compromise has no C0 repair and requires new V authority. Row/witness recovery follows only FIX-09 signed checkpoints.

STOP on dependency/review drift; a second root; production default; principal collapse; unauthorized group member; wrong mode/owner; no-follow/fsync omission; daemon private-authority access; obsctl watchdog write; invalid HMAC/proof/key-id; non-ARMED or stale runtime evidence; missing/bypassed canary; any overlapping recent first-party gap; false capture state; partial kill success claim; unreplayable status commit; raw action DML; new grant/role/migration; lifecycle without V/quiescence; production key/live act; mutation or quick_arm ON; test mutation survivor; frozen-byte change; or unresolved P0-P3.
