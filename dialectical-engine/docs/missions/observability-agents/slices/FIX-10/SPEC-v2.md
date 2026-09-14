# FIX-10 successor — single-root `obsctl` control, proof, and reconciliation authority

**Successor authority packet — 2026-09-05.** This document preserves the bytes of `SPEC.md` and supersedes its executable meaning only where stated below. It transcribes the human-approved VNOW-05 Option A. It authorizes documentation and independent authority review only. It does not authorize product, test, migration, package, source, worktree, live-control, credential, key, marker, database, service, acceptance, merge, push, or Done acts.

The current dependency is intentionally unsatisfied. FIX-09 v9 at `af9751e168575921b5e8c7a5aa350137e54135f5` received `SPEC PASS` but `PLAN REWORK`, `P1=1`, `TASK0 ADMISSION AUTHORIZED: NO`, and `C3.5 CODE AUTHORIZED: NO` in `fix09-ed25519-authority-sol-final.md`. A later implementation authority must bind an exact 40-lowercase-hex `FIX09_C35_REVIEWED_REF` whose independent review says exactly:

```text
REVIEWED REF: <the exact FIX09_C35_REVIEWED_REF>
SPEC VERDICT: SPEC PASS
CODE QUALITY VERDICT: CODE QUALITY PASS
UNRESOLVED: P0=0 P1=0 P2=0 P3=0
C3.5 RESULT: PASS
```

There is no value for `FIX09_C35_REVIEWED_REF` in this packet. Until a reviewed successor binds that value and an independent FIX-10 authority review also returns zero unresolved P0-P3, every implementation step in `PLAN-v2.md` is STOP.

## 1. Intent and preserved boundaries

V can issue `obsctl kill`, `obsctl arm`, and `obsctl status` from a no-model human CLI. Kill and arm work without opening a database socket. FIX-07 capture, the listener daemon, and its local executor respond to one V-provisioned filesystem root while product execution remains independent.

This slice owns no product behavior, approval/denial flow, model adapter, observation-agent switch, mutation enablement, or quick-arm repin. `mutation_effective` and `quick_arm_effective` are always `OFF` in FIX-10. A configured value cannot make either effective. FIX-13 and FIX-14 require later authority.

The frozen requirements are refined as follows:

- the fixed 5000 ms seed is replaced by required injected positive-safe-integer bounds with no production default;
- arm authenticates V and then creates a new positive ARMED token; an existing ARMED file never authenticates arm;
- a DB-free KILL or ARM request is durably signed to a local outbox and is reconciled later, rather than requiring a synchronous database row;
- two marker entries have ordered per-leaf atomicity and durability, not impossible joint atomicity;
- the daemon subtree, package entry, and exact tests below are added to the successor file surface;
- the V-owned obsctl journal and watchdog-owned witness journal remain different signed histories even though they share one traverse-only parent.

## 2. Required injected inputs and principals

Production has no fallback, inferred, development, repository-relative, home-relative, or cwd-relative value for any input in this section.

| Input | Exact law |
|---|---|
| `OBS_CONTROL_DIR` | required nonempty NUL-free absolute canonical pre-existing directory; byte-equal to `realpath.native`; on a V-selected volume separate from Postgres |
| `OBS_POSTGRES_DATA_DEVICE_ID` | required canonical positive decimal `st_dev` of the Postgres volume; must differ from the opened control-root `st_dev` |
| `OBS_ARMED_HMAC_KEY_FILE` | required absolute canonical path byte-equal to `${OBS_CONTROL_DIR}/keys/armed-marker.hmac` |
| `OBS_ARMED_TOKEN_STALENESS_MS` | required canonical positive safe integer |
| `OBS_AUTHORITY_PROOF_STALENESS_MS` | required canonical positive safe integer |
| `OBS_KILL_POLL_INTERVAL_MS` | required canonical positive safe integer |
| `OBS_KILL_LATENCY_MS` | required canonical positive safe integer and not less than the proven poll-plus-local-abort bound |
| `OBS_SPOOL_DIR` | required absolute canonical pre-existing spool root for daemon proof/status; no default |
| `OBS_POLICY_BUNDLE_PATH` | required absolute canonical pinned bundle path; no default |
| `OBS_POLICY_CUSTODIAN_TOKEN` | required out-of-band V credential for arm only; never printed, placed in argv, or recorded |
| `OBSCTL_DATABASE_URL` | absent on kill/arm paths; required only for a DB-capable production status/reconciliation act and authenticates as `debateai_obs_listener` |

Symbolic V-later principals have no numeric/name defaults: `V_OS_UID`, `V_OS_GID`, `OBS_CHAIN_PUBLIC_GID`, `WATCHDOG_UID`, and `WATCHDOG_GID`. FIX-10 binds the obsctl process and the listener daemon control/proof seam to `V_OS_UID:V_OS_GID`. The watchdog remains `WATCHDOG_UID:WATCHDOG_GID`. A production layout with a distinct daemon UID requires successor authority before code or provisioning.

Unit and integration tests provide explicit temporary paths, principals, clocks, staleness values, and runtime-generated ephemeral keys. A test-only value cannot cross the CLI composition boundary.

## 3. One exact control-root topology

V precreates the production root, directories, empty append-only files, and key files. Runtime code never creates, chmods, chowns, or repairs the root or its stable directories. ARMED and authority proof may be absent before first publication; KILL and CAPTURE_OFF may be absent as state.

| Exact object | Owner:group | Mode | Write authority |
|---|---|---:|---|
| `${OBS_CONTROL_DIR}` | `V_OS_UID:OBS_CHAIN_PUBLIC_GID` | `0751` | V provisioning only |
| `${OBS_CONTROL_DIR}/CAPTURE_OFF` | `V_OS_UID:V_OS_GID` | `0600` | obsctl create/remove; FIX-07 runtimes read state only |
| `${OBS_CONTROL_DIR}/KILL` | `V_OS_UID:V_OS_GID` | `0600` | obsctl create/remove; daemon reads state only |
| `${OBS_CONTROL_DIR}/ARMED` | `V_OS_UID:V_OS_GID` | `0600` | obsctl atomic replacement |
| `${OBS_CONTROL_DIR}/proof` | `V_OS_UID:V_OS_GID` | `0700` | V provisioning only |
| `${OBS_CONTROL_DIR}/proof/authority-proof.json` | `V_OS_UID:V_OS_GID` | `0600` | daemon atomic replacement |
| `${OBS_CONTROL_DIR}/keys` | `V_OS_UID:V_OS_GID` | `0711` | V provisioning only |
| `${OBS_CONTROL_DIR}/keys/armed-marker.hmac` | `V_OS_UID:V_OS_GID` | `0600` | V provisioning only; exact 32 CSPRNG bytes |
| `${OBS_CONTROL_DIR}/keys/daemon-proof.pk8` | `V_OS_UID:V_OS_GID` | `0600` | V provisioning only; daemon signing |
| `${OBS_CONTROL_DIR}/keys/daemon-proof.spki` | `V_OS_UID:OBS_CHAIN_PUBLIC_GID` | `0440` | V provisioning only; verification |
| `${OBS_CONTROL_DIR}/keys/obsctl-outbox.pk8` | `V_OS_UID:V_OS_GID` | `0600` | V provisioning only; obsctl local signing |
| `${OBS_CONTROL_DIR}/outbox` | `V_OS_UID:V_OS_GID` | `0700` | V provisioning only |
| `${OBS_CONTROL_DIR}/outbox/obsctl-actions.jsonl` | `V_OS_UID:V_OS_GID` | `0600` | obsctl append only |
| `${OBS_CONTROL_DIR}/witness` | `V_OS_UID:V_OS_GID` | `0711` | V provisioning only |
| `${OBS_CONTROL_DIR}/witness/obsctl-actions.jsonl` | `V_OS_UID:V_OS_GID` | `0600` | obsctl append only |
| `${OBS_CONTROL_DIR}/witness/watchdog-chain.jsonl` | `WATCHDOG_UID:WATCHDOG_GID` | `0600` | watchdog append only; obsctl read-only status verification |

The V-owned `witness` parent at mode `0711` replaces only FIX-09 v5's incompatible watchdog-owned mode-0700 parent. Each principal can traverse to its known leaf; neither leaf permission grants access to the other. The FIX-09 successor must preserve this sibling layout or FIX-10 remains STOP.

Inherited FIX-09 objects under the same root retain their FIX-09 authority, including `chain/private/obsctl.pk8`, `chain/public-keyring.json`, `chain/custodian-root.spki`, `chain/activation.json`, and `keys/watchdog-witness.pk8`. FIX-10 does not create or rotate them.

The following private materials are pairwise byte-distinct and purpose-distinct: ARMED HMAC key, daemon-proof key, obsctl-outbox key, `obsctl` row-chain key, watchdog-witness key, and V custodian key. Their SPKI/key ids may not substitute for one another. C0 defines no local outbox-key rotation or repair protocol; loss/compromise is STOP under new V authority.

The only additional path is transient `${OBS_CONTROL_DIR}/outbox/.obsctl.lock`, `V_OS_UID:V_OS_GID` mode `0600`, acquired by `O_CREAT|O_EXCL|O_NOFOLLOW|O_CLOEXEC`. Normal release unlinks it and fsyncs `outbox`. A surviving lock is `OBSCTL_BUSY`; code never guesses staleness or auto-breaks it. V may remove it only after proving no invocation owns the operation.

## 4. Secure filesystem and durability law

1. Capture immutable references to the required filesystem primitives and numeric flags once at module initialization. Missing/zero `O_NOFOLLOW` or unavailable required fsync/open semantics is fatal.
2. Reject empty, NUL-containing, relative, noncanonical, root-equal, or lexically escaping paths before I/O. `realpath.native(OBS_CONTROL_DIR)` must equal the supplied bytes.
3. Lstat every ancestor from `/` through the root before use and after the operation. Each is a real directory, not a symlink, and has no group/world write bit. The root has the exact owner/group/mode and a device unequal to `OBS_POSTGRES_DATA_DEVICE_ID`.
4. Each descendant path is fixed by this specification; no user text becomes a component. Before and after open, native realpath remains beneath the pinned root. Leaf open includes `O_NOFOLLOW|O_CLOEXEC`; pre/post pathname lstat and descriptor fstat agree on `(dev,ino,mode,nlink,size,uid,gid)`. Regular files have `nlink=1`, exact owner/group/mode, and the same device as their immediate directory.
5. The root and every opened parent are rechecked after each mutation. Root/device/inode/owner/mode drift, symlink, hard link, FIFO, socket, device, wrong principal, writable trust component, short read/write, close error, or unexpected `ENOENT` is fatal.
6. Readers never mutate. `ENOENT` is state only for KILL, CAPTURE_OFF, ARMED, and proof where the state table permits absence. Missing precreated outbox/journal/key/directory is invalid.
7. A marker is exactly zero bytes. Create uses `O_CREAT|O_EXCL|O_NOFOLLOW|O_CLOEXEC`, mode `0600`, fstat, file fsync, then root-directory fsync. An existing valid marker is idempotent; any other existing object is fatal.
8. Marker removal opens and validates the exact leaf, unlinks its directory-relative fixed name, proves the expected inode is absent, and fsyncs the root directory. A missing marker is idempotent.
9. Mutable JSON replacement creates an unguessable same-directory temp with `O_CREAT|O_EXCL|O_NOFOLLOW|O_CLOEXEC` and mode `0600`, writes all exact bytes, fsyncs, re-fstats, renames on the same device with no fallback, fsyncs the directory, then reopens and verifies final bytes/metadata. A hostile existing destination is fatal before replacement.
10. Append opens the precreated leaf with `O_WRONLY|O_APPEND|O_NOFOLLOW|O_CLOEXEC`, validates the entire existing chain while holding the obsctl lock, writes one complete record through a total write loop, fsyncs the file, and rechecks metadata. A partial tail is permanent invalid state; code never truncates, skips, or resigns it.

All JSON byte boundaries use the reviewed FIX-09 successor's unique-key raw parser or a separately reviewed byte-identical contract. `JSON.parse` plus reviver is insufficient. Raw UTF-8 rejects BOM, CR, duplicate keys at any depth, trailing bytes, lone surrogates, unsafe/fraction/exponent numbers where forbidden, excess depth/nodes/bytes, extras, omissions, accessors, and non-plain materialized values.

Define `J(x)` as RFC 8785 UTF-8 bytes with no BOM/whitespace/newline and `LP(x)=UINT32_BE(byte_length(x)) || x`. A complete JSON file is `J(x) || LF`. A JSONL record is exactly one `J(x) || LF`.

## 5. ARMED token

The unsigned body has exactly these keys and values:

```json
{"schema":"obsctl-armed/v1","custodian":"V","issued_at_ms":"<positive canonical decimal>","expires_at_ms":"<positive canonical decimal>","nonce":"<32 lowercase hex>"}
```

`expires_at_ms - issued_at_ms` equals the injected `OBS_ARMED_TOKEN_STALENESS_MS`; there is no clock allowance or default. The completed ARMED object is exactly:

```json
{"body":<the exact unsigned body>,"mac_sha256":"<64 lowercase hex>"}
```

```text
M = HMAC-SHA256(
      K_armed,
      UTF8("obsctl-armed/v1\0") || J(body)
    )
mac_sha256 = lowercase_hex(M)
```

Validation uses constant-time MAC equality and requires `issued_at_ms <= now_ms < expires_at_ms`. The stored bytes are `J(completed) || LF`. The exact completed bytes, including LF, are the proof's ARMED hash input.

Arm authentication is separate: the pinned policy bundle names sole custodian `V` and credential source `OBS_POLICY_CUSTODIAN_TOKEN`; comparison is constant-time and occurs before authority-increasing writes. ARMED, key possession, OS username, or database access is not a substitute.

## 6. Positive authority proof

The daemon publishes no positive file unless every conjunct below is true at one captured clock value. Its exact unsigned object is:

```json
{
  "schema":"obs-authority-proof/v1",
  "proof_id":"<canonical lowercase UUIDv4>",
  "issued_at_ms":"<positive canonical decimal>",
  "expires_at_ms":"<positive canonical decimal>",
  "armed_sha256":"<SHA-256 of exact current completed ARMED file bytes>",
  "activation_manifest_sha256":"<64 lowercase hex>",
  "policy_bundle_sha256":"<64 lowercase hex>",
  "canary":{"source_event_ref":"<closed synthetic reference>","occurrence_id":"<canonical lowercase UUID>","occ_seq":"<positive canonical decimal>","captured_at_ms":"<positive canonical decimal>"},
  "spool":{"root_sha256":"<SHA-256 of canonical OBS_SPOOL_DIR bytes>","writable":true},
  "gaps":{"open_count":"0"},
  "heartbeats":[
    {"component":"capture:api","observed_at_ms":"<positive canonical decimal>"},
    {"component":"capture:runner","observed_at_ms":"<positive canonical decimal>"},
    {"component":"capture:scheduler","observed_at_ms":"<positive canonical decimal>"},
    {"component":"fixagent-daemon","observed_at_ms":"<positive canonical decimal>"},
    {"component":"fixagent-watchdog","observed_at_ms":"<positive canonical decimal>"}
  ],
  "watchdog":{"witness_seq":"<positive canonical decimal>","witness_hash":"<64 lowercase hex>","result":"<VERIFIED|VERIFIED_WITH_RECOVERY>"},
  "daemon_proof_key_id":"<64 lowercase hex>"
}
```

The heartbeat array is exactly the printed order and contains no other component. Every timestamp and the canary capture are no older than `OBS_AUTHORITY_PROOF_STALENESS_MS`. `expires_at_ms-issued_at_ms` equals that same injected value. The canary is observed through the reviewed occurrence gateway and persisted chain, the spool root is securely opened and writable by its owning capture principal, open capture gaps equal zero, the latest complete watchdog record is signature/link/keyring verified and has the shown positive result, KILL and CAPTURE_OFF are absent, and current ARMED is valid.

```text
P = J(unsigned_proof)
S = Ed25519.Sign(
      SK_daemon,
      UTF8("obs-authority-proof-signature/v1") || 0x00 || P
    )
```

The completed object adds exactly `daemon_signature_base64=canonical_padded_base64(S)`. The file is `J(completed) || LF`. Verification derives `daemon_proof_key_id=lowercase_hex(SHA256(SPKI_DER))`, verifies Ed25519, time, the exact current ARMED bytes, activation/policy digests, and all closed fields. A component-health row alone is display evidence, never proof authority.

On any failed conjunct, the daemon does not refresh proof. A prior file becomes non-authoritative immediately when its ARMED/activation/policy/witness binding differs and no later than its injected expiry. Before FIX-09 C4 supplies a reviewed watchdog record, local code and fixtures may prove the seam, but no live READY claim exists.

## 7. Invocation identity, outbox, and V journal

The CLI obtains the effective UID through a captured OS identity seam, requires it equal `V_OS_UID`, resolves the username without environment input, and requires `^[A-Za-z0-9._-]{1,128}$`. Actor is `obsctl:<username>`.

For UUIDv4 `invocation_id`, canonical `requested_at_ms`, and `action_kind` in `KILL|ARM|STATUS`:

```text
I = J({
  schema:"obsctl-action-identity/v1",
  invocation_id,
  requested_at_ms,
  actor,
  action_kind
})

action_ref = "obsctl:v1:" || lowercase_hex(
  SHA256(UTF8("obsctl-action-ref/v1") || 0x00 || LP(I))
)
```

### 7.1 Signed DB-free KILL/ARM outbox

KILL and ARM only use this unsigned object:

```json
{
  "schema":"obsctl-outbox-action/v1",
  "outbox_seq":"<positive canonical decimal>",
  "invocation_id":"<canonical lowercase UUIDv4>",
  "requested_at_ms":"<positive canonical decimal>",
  "actor":"obsctl:<validated username>",
  "action_kind":"<KILL|ARM>",
  "action_ref":"obsctl:v1:<64 lowercase hex>",
  "prior_outbox_hash":"<64 lowercase hex>",
  "signing_key_id":"<64 lowercase hex>"
}
```

Sequence 1 uses `prior_outbox_hash=signing_key_id`; sequence n uses the prior completed record's `outbox_hash`. No sequence reset or key rotation exists in C0.

```text
B = J(unsigned_outbox)
S = Ed25519.Sign(SK_outbox,
      UTF8("obsctl-outbox-signature/v1") || 0x00 || B)
H = SHA256(UTF8("obsctl-outbox-link/v1") || 0x00 || LP(B) || S)
```

The completed record adds exactly `signature_base64=canonical_padded_base64(S)` and `outbox_hash=lowercase_hex(H)`. Append is `J(completed) || LF` under §4 and the one obsctl lock.

### 7.2 Separately domain-signed V command journal

Every invocation attempts one `COMMAND_RESULT`; each successful database receipt adds one `RECONCILED` event. The unsigned object is exactly:

```json
{
  "schema":"obsctl-action-journal/v1",
  "journal_seq":"<positive canonical decimal>",
  "event_id":"<canonical lowercase UUIDv4>",
  "recorded_at_ms":"<positive canonical decimal>",
  "event_kind":"<COMMAND_RESULT|RECONCILED>",
  "invocation_id":"<canonical lowercase UUIDv4>",
  "action_ref":"obsctl:v1:<64 lowercase hex>",
  "action_kind":"<KILL|ARM|STATUS>",
  "outcome":"<closed outcome>",
  "outbox_hash":"<64 lowercase hex or null>",
  "database_action_id":"<canonical lowercase UUID or null>",
  "prior_journal_hash":"<64 lowercase hex>",
  "signing_key_id":"<64 lowercase hex>"
}
```

Closed outcomes are `KILL_APPLIED`, `ARM_AUTH_REJECTED`, `ARM_APPLIED_PENDING_PROOF`, `ARM_FAILED_ROLLED_BACK`, `STATUS_LOCAL`, `STATUS_DB_UNAVAILABLE`, `STATUS_DB_REJECTED`, and `RECONCILED`. A `RECONCILED` event has a non-null database id and outcome RECONCILED. Other outcomes have null database id. Status and rejected arm have null outbox hash; KILL/ARM results use their intent hash when one exists.

Sequence 1 uses `prior_journal_hash=signing_key_id`; later records use the prior `journal_hash`. Formulas are the outbox formulas with domains `obsctl-journal-signature/v1` and `obsctl-journal-link/v1`; completed fields are exactly `signature_base64` and `journal_hash`.

The local outbox and V journal use the same obsctl-outbox private key only with the two distinct domain pairs above. Neither code nor tests may open `${OBS_CONTROL_DIR}/witness/watchdog-chain.jsonl` with a write-capable flag. The watchdog never writes the V journal.

## 8. Command order and crash states

### 8.1 `obsctl kill`

1. Capture clock/identity; validate root, local chains, and keys; acquire the obsctl lock.
2. Append/fsync the signed KILL outbox intent.
3. Create/fsync CAPTURE_OFF first.
4. Create/fsync KILL second.
5. Append/fsync V-journal `KILL_APPLIED`, release the lock, print `KILLED`, and return zero.

The two markers are individually atomic/durable. There is no joint-atomic claim. A crash after step 3 is `CAPTURE_DISABLED`; retry completes KILL. A crash after step 4 but before step 5 is `KILLED_COMPLETE` with a pending intent and missing command receipt; status reports it and never invents the missing historical journal event.

Safety exception: inability to sign/append must not block capture shutdown. Kill still attempts CAPTURE_OFF then KILL, prints no success, and returns nonzero. This creates a truthful unaudited killed/partial state. No later command fabricates the omitted intent.

The daemon samples KILL before database connect, before intake, between work units, and on an independent timer during a running local executor. Presence or invalid control-root state stops new intake, triggers local abort/process-group termination, and never waits for Postgres. A database lease-release attempt may occur only after local stop and cannot gate it.

### 8.2 `obsctl arm`

1. Capture clock/identity; validate root/local chains/keys; authenticate V from `OBS_POLICY_CUSTODIAN_TOKEN`; acquire the obsctl lock.
2. Append/fsync the signed ARM outbox intent.
3. Generate a fresh nonce and atomically publish/fsync a new ARMED file.
4. Remove/fsync CAPTURE_OFF.
5. Remove/fsync KILL.
6. Append/fsync `ARM_APPLIED_PENDING_PROOF`, release, print `ARMED_PENDING_PROOF`, and return zero.

The new ARMED hash invalidates any old proof. Capture/daemon may resume observation, but mutation and quick arm remain OFF and READY remains false until the daemon publishes a fresh matching positive proof.

Auth failure performs no authority-increasing write and attempts `ARM_AUTH_REJECTED`. Any failure after step 3 recreates/fsyncs CAPTURE_OFF first and KILL second, appends `ARM_FAILED_ROLLED_BACK` if the local journal remains valid, prints no success, and returns nonzero. Failure to reestablish both markers is `INVALID`, never success. A durable ARM intent records a request, not a success; its later database payload cannot claim the command completed.

### 8.3 `obsctl status`

Status validates the full local trust state, appends a STATUS `COMMAND_RESULT`, reads the watchdog journal only through a read-only verifier, and produces one canonical JSON object plus LF. If `OBSCTL_DATABASE_URL` is absent or connect is unreachable, database fields are `UNAVAILABLE`, outcome is `STATUS_DB_UNAVAILABLE`, and exit is zero only if the entire local state and journal append are valid.

When DB-capable, status first requires `current_user='debateai_obs_listener'`, reconciles pending outbox records in ascending sequence, submits its own STATUS action directly through the same gateway, queries only the existing listener read surface, appends each `RECONCILED` receipt, and prints. Permission, identity, semantic-collision, gateway, or committed-row inconsistency is `STATUS_DB_REJECTED` and nonzero; ordinary unreachability is not local failure.

## 9. Closed local states and status wire

| State | Exact condition |
|---|---|
| `INVALID` | any required local root/key/outbox/V-journal/watchdog-read/proof object is hostile, malformed, corrupt, or inconsistent |
| `KILLED_COMPLETE` | valid CAPTURE_OFF present and valid KILL present |
| `KILLED_PARTIAL` | KILL present, CAPTURE_OFF absent |
| `CAPTURE_DISABLED` | CAPTURE_OFF present, KILL absent |
| `TRIPPED` | both markers absent and ARMED absent/invalid/stale |
| `ARMING` | both markers absent, ARMED valid, proof absent/invalid/stale/mismatched |
| `READY` | both markers absent, fresh valid ARMED, fresh valid proof bound to it and current activation/policy/watchdog |

Unknown or partial input never becomes READY. Regardless of state, FIX-10 emits `mutation_effective="OFF"` and `quick_arm_effective="OFF"`.

Status output has exactly these top-level keys:

```json
{
  "schema":"obsctl-status/v1",
  "observed_at_ms":"<positive canonical decimal>",
  "actor":"obsctl:<validated username>",
  "local_state":"<INVALID|KILLED_COMPLETE|KILLED_PARTIAL|CAPTURE_DISABLED|TRIPPED|ARMING|READY>",
  "capture":{"capture_off":"<PRESENT|ABSENT|INVALID>","effective":"<ON|OFF>","reason":"<closed reason>"},
  "daemon":{"kill":"<PRESENT|ABSENT|INVALID>","effective":"<ON|OFF>","last_heartbeat_age_ms":"<nonnegative decimal or null>"},
  "armed":{"state":"<VALID|MISSING|INVALID|STALE>","issued_at_ms":"<decimal or null>","expires_at_ms":"<decimal or null>","sha256":"<hex or null>"},
  "authority_proof":{"state":"<VALID|MISSING|INVALID|STALE|MISMATCH>","proof_id":"<UUID or null>","expires_at_ms":"<decimal or null>","key_id":"<hex or null>"},
  "watchdog":{"state":"<VERIFIED|VERIFIED_WITH_RECOVERY|UNAVAILABLE|INVALID>","witness_seq":"<decimal or null>","witness_hash":"<hex or null>"},
  "outbox":{"state":"<VALID|INVALID>","tail_seq":"<decimal>","tail_hash":"<hex or null>","pending_count":"<decimal or null>"},
  "journal":{"state":"<VALID|INVALID>","tail_seq":"<decimal>","tail_hash":"<hex or null>"},
  "database":{"state":"<AVAILABLE|UNAVAILABLE|REJECTED>","current_user":"<debateai_obs_listener or null>"},
  "cursor":{"max_occ_seq":"<decimal or null>","last_occ_seq":"<decimal or null>","lag":"<decimal or null>"},
  "gaps":{"open_count":"<decimal or null>"},
  "spool":{"file_count":"<decimal or null>","line_count":"<decimal or null>"},
  "mutation":{"configured":"<OFF|ON|UNAVAILABLE>","effective":"OFF","reason":"FIX10_NOT_AUTHORIZED"},
  "quick_arm":{"configured":"<OFF|ON|UNAVAILABLE>","effective":"OFF","reason":"FIX14_NOT_AUTHORIZED"},
  "policy":{"bundle_sha256":"<64 lowercase hex or null>","activation_manifest_sha256":"<64 lowercase hex or null>","custodian":"V"}
}
```

Closed capture reasons are `CAPTURE_OFF_MARKER`, `KILL_MARKER`, `LOCAL_INVALID`, `ARMED_INVALID`, `PROOF_INVALID`, and `READY_PROOF`; ON is allowed only with `READY_PROOF`. DB values are null unless AVAILABLE. `lag=max_occ_seq-last_occ_seq` only for nonnegative ordered values. Spool counting securely walks only immediate regular nlink-one files under the injected root, sums LF bytes as lines, and fails closed on path/metadata drift; it never reads payload text into output.

## 10. FIX-09 gateway and database contract

Kill and arm do not read `OBSCTL_DATABASE_URL`, import `pg`, construct a client, resolve DNS, or open a socket. Their source dependency graph terminates at local interfaces.

DB-capable status may reconcile only after the future `FIX09_C35_REVIEWED_REF` proves all of the following:

1. `FIX09_CHAIN_MIGRATION_PATH` in the reviewed C3.5 receipt resolves exactly to FIX-09's sole reviewed forward-only chain migration, and that migration enforces globally unique `obs.agent_action.action_ref`, exact source including `ops`, per-`(table,source,writer_identity)` chain fields, activation, and existing-listener-role action permissions;
2. `@debateai/obs-capture/chain` exports reviewed `appendChainedAgentAction(client, action, signer)`; it requires an already-open caller transaction, performs action-ref probe/idempotency and chain locking/signing/insertion, and never commits/rolls back;
3. that reviewed migration grants action probe/head execution and required action insertion/returning authority to existing `debateai_obs_listener`, grants no obsctl role, and preserves its reviewed revoke-first ACLs;
4. `chain/private/obsctl.pk8` is a distinct row signer and the V-signed public keyring authorizes exact table `agent_action`, source `ops`, writer identity `obsctl` at the relevant chain sequence.

If any item or public type differs, implementation stops for successor authority. FIX-10 adds no database role, grant, migration, SQL action writer, trigger, function, or direct raw-table write. `OBSCTL_DATABASE_URL` uses the existing listener role only through a composition that invokes the reviewed gateway. Static architecture tests reject `INSERT|UPDATE|DELETE|TRUNCATE` SQL in the obsctl subtree and any import of `@debateai/db`.

For each pending outbox record, status opens one transaction, invokes the gateway with exact semantic values:

```text
source = "ops"
writer_identity = "obsctl"
actor = outbox.actor
action_kind = outbox.action_kind
action_ref = outbox.action_ref
occurrence_id = null
incident_id = null
action_payload = {
  schema:"obsctl-agent-action/v1",
  invocation_id:outbox.invocation_id,
  requested_at_ms:outbox.requested_at_ms,
  outbox_seq:outbox.outbox_seq,
  outbox_hash:outbox.outbox_hash
}
```

Commit occurs before the local RECONCILED event. A DB failure leaves the intent pending. A crash after commit replays the same globally unique action_ref; the gateway returns the exact existing row without chain advance, then status appends the missing receipt. A semantic mismatch is fatal. STATUS uses the same identity/action_ref formula and gateway directly, with payload schema `obsctl-agent-action/v1`, its invocation id/time, and `outbox_seq=null,outbox_hash=null`.

## 11. Daemon, package, source, and test surface

### Allowed implementation writes after all gates

```text
package.json
pnpm-lock.yaml
tools/obs-listener/package.json
tools/obs-listener/src/control/types.ts
tools/obs-listener/src/control/reader.ts
tools/obs-listener/src/daemon/main.ts
tools/obs-listener/src/daemon/authority-proof.ts
tools/obs-listener/src/obsctl/cli.ts
tools/obs-listener/src/obsctl/config.ts
tools/obs-listener/src/obsctl/control-root.ts
tools/obs-listener/src/obsctl/lock.ts
tools/obs-listener/src/obsctl/armed-token.ts
tools/obs-listener/src/obsctl/authority-proof.ts
tools/obs-listener/src/obsctl/markers.ts
tools/obs-listener/src/obsctl/outbox.ts
tools/obs-listener/src/obsctl/journal.ts
tools/obs-listener/src/obsctl/reconcile.ts
tools/obs-listener/src/obsctl/status.ts
tools/obs-listener/src/obsctl/kill.ts
tools/obs-listener/src/obsctl/arm.ts
tools/obs-listener/src/obsctl/types.ts
tools/fix10-capture-gate.mjs
tests/unit/fix10-*.test.ts
tests/integration/fix10-*.test.ts
tests/architecture/fix10-*.test.ts
tests/unit/fixtures/fix10-gate-manifest.v1.json
```

The daemon change is limited to importing the shared DB-independent control reader, checking KILL/root validity at the four §8.1 boundaries, invoking an injected local executor abort, and calling the proof publisher only after the exact §6 evidence exists. Existing FIX-09 transaction/fold/ACK/cursor/poison/tracer semantics remain unchanged.

`tools/obs-listener/package.json` is private ESM and owns script `obsctl: "tsx src/obsctl/cli.ts"`; root `package.json` owns `obsctl: "pnpm --filter @debateai/obs-listener run obsctl --"`. Its runtime dependencies are exactly `@debateai/obs-capture: workspace:*` and `pg: 8.22.0` unless reviewed C3.5 proves a previously pinned RFC8785 dependency is required. Lockfile changes are limited to the workspace importer. No npm-published binary or install script is introduced.

Explicit injected seams are `Clock`, `RandomSource`, `EffectiveIdentity`, `SecureFs`, `ExclusiveLock`, `CustodianAuthenticator`, `PolicyReader`, `SpoolInspector`, `DbClientFactory`, `ChainGateway`, `DaemonControl`, and `DaemonProofInputs`. CLI composition is the sole process/environment boundary.

Read-only dependencies are the reviewed FIX-07 runtime control files, reviewed FIX-09 C3.5 chain exports/migration/types, the pinned policy bundle loader, and watchdog public verifier. Forbidden writes/imports include product/apps/scheduler source, capture-runtime source, migrations, database package, watchdog writer, policy semantics, model/provider/LLM modules, child-process/shell execution, board/Hermes, and any live path.

## 12. Verification and acceptance law

PLAN-v2's capture gate owns an explicit selected-file array, exact full-test-name array, nonzero expected count, expected exit class, zero failed/skipped/todo, and anchored JSON-reporter parsing. Each focused cluster runs three times in fresh evidence directories; the worst result is the verdict. No substring-only, declaration-only, zero-test, wrong-file, wrong-name, changed-count, skipped/todo, truncated, stale, or uncaptured run is evidence.

Committed fixtures contain no private key/seed/HMAC/signature secret. Each crypto test generates fresh keys in memory or under a mode-0700 private temporary directory with mode-0600 files, compares production output to an independent Node crypto oracle, zeroes transient exported buffers, closes descriptors, and removes the directory. Only public vectors may be committed.

A green suite is a milestone. It is not live acceptance or Done. V alone later selects literal production inputs, provisions identities/root/keys/files, applies the already reviewed FIX-09 migration through its own authority, activates/rotates, installs services, runs real kill/arm/status and product-invariance ceremonies, vetoes or accepts, merges, and pushes.

## 13. Rollback, recovery, and STOP

- Local rollback recreates/fsyncs CAPTURE_OFF then KILL before stopping the new control integration. It leaves outbox, V journal, watchdog journal, and database rows append-only.
- Failed arm follows §8.2. Failed kill retries from the truthfully observed marker state.
- Reconciliation retries exact action_ref and never rewrites either local history.
- Outbox/V-journal corruption, truncation, key loss, or compromise is STOP; C0 has no auto-repair/rotation.
- Daemon-proof compromise creates a non-authoritative proof state and requires V to kill plus obtain successor key authority.
- FIX-09 row/witness recovery uses only its reviewed keyring/recovery-epoch protocol. Its sole reviewed chain migration stays additive and forward-only.

STOP on absent/mismatched `FIX09_C35_REVIEWED_REF`; non-PASS review; edited frozen FIX-10 bytes; a second root/marker; production default; shared/reused key; symlink/hardlink/writable trust path; noncanonical/duplicate-key JSON; wrong formula/domain; joint marker atomicity claim; arm without V auth; DB access from kill/arm; direct action SQL; new role/grant/migration; non-`ops/obsctl`; nonunique action_ref; watchdog-journal write; mutation/quick_arm ON; model/product/db-package/child-process import; vacuous evidence; persisted private material; live act; acceptance/merge/push/Done claim.
