# FIX-09 C3.5/C4 — Per-writer Ed25519 audit-chain authority

**Successor authority packet — 2026-09-05, VNOW-04 Option B selected by V.** This document supersedes the cryptographic-chain portions of frozen `SPEC.md`, FinalPlan A.2, and the C4 portions of `SPEC-v2.md`. It incorporates `SPEC-v3.md` over `SPEC-v2.md` for the C2 occurrence lock and preserves every completed C1-C3 contract not expressly replaced below. V selected per-writer Ed25519, V as the sole custodian, migration `0064`, and the relative control-file topology in §12. This packet authorizes local implementation and tests only. It records no key provisioning, migration application, quiesce, activation, production execution, acceptance, merge, push, or Done verdict.

## 1. Binding outcome and stage order

The chain protocol is `obs-audit-chain/v1`. Every authenticated row is signed by the private Ed25519 key of its `writer_identity`; links use SHA-256. PostgreSQL stores row key ids, signatures, links, and activation digests only; the verifier reads V-signed SPKI public material from the filesystem. No symmetric verification secret, private key, seed, HMAC key, or recoverable private-key material may enter PostgreSQL, logs, fixtures, evidence, or the watchdog process. V is the single custodian; this newer ruling replaces FinalPlan's older dual-custody phrase for FIX-09/FIX-10 until V grants another custodian.

The new implementation stage is **C3.5**, and its order is binding:

1. land migration `migrations/0064_fix09_audit_chain.sql`, the shared chain package, every current occurrence/action writer conversion, configuration, and C3.5 tests;
2. obtain a fresh independent review of C3.5;
3. land the read-only C4 verifier and separately signed witness journal;
4. consume the separately authorized FIX-10 C0 outbox/reconciliation contract before any FIX-10 database reconciliation implementation;
5. only V may later provision production keys, quiesce writers, apply `0064`, create activation artifacts, activate, run acceptance, or declare Done.

C4 may not start against raw writers. FIX-10 database reconciliation may not start before the shared action gateway is present. A local test database and ephemeral test keys are permitted; a live database, real control root, or persistent operational key is not.

## 2. Audited baseline and preserved contracts

The implementation baseline is FIX-09 HEAD `8619b9ab4dbc01fdd166337a641193675b24380a`. At that commit, the complete production row-writer map is:

| Table | Path and function | Required conversion |
|---|---|---|
| `obs.occurrence` | `packages/obs-capture/src/runtime/sink.ts::writeOccurrences` | `appendChainedOccurrences` for direct `PERSISTED` rows |
| `obs.occurrence` | `packages/obs-capture/src/runtime/sink.ts::ingestSpooledOccurrence` | `appendChainedOccurrences` for `SPOOLED` rows in the existing occurrence/detail/receipt transaction |
| `obs.agent_action` | `tools/obs-listener/src/daemon/poison.ts::appendSkipReceipt` | `appendChainedAgentAction` inside the existing delivery transaction |
| `obs.agent_action` | `tools/obs-listener/src/daemon/poison.ts::appendPoisonReceipt` | `appendChainedAgentAction` inside the existing delivery transaction |

No other direct occurrence/action insert is authorized. Architecture tests scan production TypeScript and SQL call sites and fail on any insert outside migration fixtures and the shared gateways. Every future writer, including FIX-10 `obsctl`, must use a gateway before its first database-capable release.

The following C1 evidence is frozen and byte changes are outside this authority:

- `tools/obs-listener/src/daemon/tracer-hook.ts`: raw SHA-256 `c551c24ea5931acbdc4801d274aedc7bcd4d2b476b1f272ec9507e3e38f4c961`;
- `tools/obs-listener/src/daemon/dispatch-arm.ts`: raw SHA-256 `916fa6cbac52b23dd66d0e7507c468684855ba598c9ecee4d75e00002e053f1c`;
- `tests/unit/fixtures/fix09-interface-contract.ts`: raw SHA-256 `09650971be03d4ada2c1dd017a1d956d70d3275ddcf1e8045016cc45b92fb550`;
- canonical policy-bundle hash: `aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd`.

C2's global session leader, concurrency cap one, transaction-scoped occurrence advisory lock, fold, terminal action, ACK, and cursor order remain exact. C3's deterministic tracer boundary, zero-budget behavior, no-model rule, and no forbidden imports remain exact. The occurrence and optional `occurrence_detail` row remain atomic, as do occurrence plus spool receipt. The chain canonicalizer is a separate protocol implementation and must not import or alter the C1 policy canonicalizer.

## 3. Migration claim and additive schema

The filename is exactly `migrations/0064_fix09_audit_chain.sql`. Immediately before creating it, the implementer must repeat the all-ref, all-reachable-object, all-registered-worktree, and tracked/untracked collision scan. Any `0064*.sql` file or independent paper claim is STOP.

Migration `0064` first aborts if either existing table contains a non-NULL `prev_link`, or if duplicate `obs.agent_action.action_ref` values exist. It deletes or rewrites no row. It then makes these additive changes:

```text
obs.occurrence
  chain_version   smallint NULL, exact value 1 when present
  chain_key_id    text NULL, lowercase [0-9a-f]{64}
  chain_seq       bigint NULL, > 0
  chain_signature bytea NULL, exactly 64 bytes
  chain_link      bytea NULL, exactly 32 bytes
  prev_link       remains bytea NULL/exactly 32 bytes

obs.agent_action
  action_seq      bigint NOT NULL DEFAULT nextval('obs.agent_action_seq'), > 0, UNIQUE
  source          text NOT NULL DEFAULT 'legacy'
                  CHECK source IN ('legacy','first_party','hatchet','ui_client','ops')
  chain_version   smallint NULL, exact value 1 when present
  chain_key_id    text NULL, lowercase [0-9a-f]{64}
  chain_seq       bigint NULL, > 0
  chain_signature bytea NULL, exactly 64 bytes
  chain_link      bytea NULL, exactly 32 bytes
  prev_link       remains bytea NULL/exactly 32 bytes
```

Adding `action_seq` assigns positive values to old actions using the new sequence. Those values provide a stable legacy scan order but make no authenticity claim. The migration never populates a legacy chain field. Existing actions receive `source='legacy'`; no post-activation writer may submit `legacy`.

Each table has one all-or-none constraint over `chain_version`, `chain_key_id`, `chain_seq`, `prev_link`, `chain_signature`, and `chain_link`: all six are NULL, or `chain_version=1`, the other five are non-NULL, and every format/length condition holds. A chained row with `chain_seq=1` still stores the 32-byte genesis value in `prev_link`.

The migration creates partial unique indexes on `(source, writer_identity, chain_seq) WHERE chain_version IS NOT NULL` for both tables. It creates a global unique index on `obs.agent_action(action_ref)`. Duplicate `action_ref` is a preflight failure; it is never resolved by deletion, update, or arbitrary row selection.

### 3.1 Immutable activation row

`0064` creates `obs.audit_chain_activation` with exactly one possible row:

```text
singleton                         boolean PRIMARY KEY CHECK (singleton)
protocol                          text NOT NULL CHECK (= 'obs-audit-chain/v1')
activation_id                     uuid NOT NULL UNIQUE
activated_at                      timestamptz NOT NULL, exact millisecond UTC instant
occurrence_legacy_max_seq         bigint NOT NULL CHECK (>= 0)
occurrence_legacy_count           bigint NOT NULL CHECK (>= 0)
occurrence_legacy_digest          bytea NOT NULL, exactly 32 bytes
agent_action_legacy_max_seq       bigint NOT NULL CHECK (>= 0)
agent_action_legacy_count         bigint NOT NULL CHECK (>= 0)
agent_action_legacy_digest        bytea NOT NULL, exactly 32 bytes
initial_public_keyring_sha256     bytea NOT NULL, exactly 32 bytes
activation_manifest_sha256       bytea NOT NULL, exactly 32 bytes
created_by_custodian_id           text NOT NULL CHECK (= 'V')
```

`max_seq=0` means that table had zero legacy rows. The row is immutable: owner-installed statement triggers reject UPDATE, DELETE, and TRUNCATE; table and sequence privileges are revoked from runtime roles; no runtime role receives INSERT. Migration `0064` leaves the table empty.

Before activation exists, an insert trigger accepts only an all-NULL chain tuple and rejects non-NULL chain material. After activation exists, it rejects an all-NULL tuple, rejects `source='legacy'`, and requires the complete tuple. The trigger applies to both tables and prevents a configuration mistake from silently changing modes. Existing immutable-row triggers remain.

### 3.2 Grants

After a revoke-first block, the resulting least-privilege deltas are exact:

- `debateai_obs_writer` keeps occurrence INSERT and USAGE on its required occurrence sequence; its narrow occurrence SELECT becomes exactly `(occurrence_id, occ_seq, prev_link, source, source_event_ref, writer_identity, chain_seq, chain_link, chain_key_id)` and it receives SELECT on the activation singleton only;
- `debateai_obs_listener` keeps its existing complete action SELECT and action INSERT, including every added chain/source/sequence column, receives USAGE on `obs.agent_action_seq`, and receives SELECT on the activation singleton;
- `debateai_obs_watchdog` loses INSERT on `obs.agent_action`, retains read-only SELECT on both complete row tables and activation, and retains INSERT plus the existing narrow UPDATE on `obs.component_health`;
- `debateai_obs_human` keeps its existing read surface and gains SELECT on activation;
- PUBLIC gets no table, sequence, function, or schema authority from `0064`; no runtime role receives DELETE or TRUNCATE.

Tests compare exact ACLs, including the revoked watchdog action write. Any broader grant is STOP.

## 4. Protocol values and partition rule

The partition key is the exact tuple `(table, source, writer_identity)`. `table` is the literal `occurrence` or `agent_action`. Text equality is PostgreSQL text equality and is byte-preserved by the protocol; writers may not trim, case-fold, normalize, alias, or infer either source or identity. Every activated writer identity matches `^[a-z0-9][a-z0-9._-]{0,127}$`; legacy identities need not. The signer configuration binds one exact writer identity and explicit partition authorizations. A mismatch is rejected before SQL.

Within a partition, `chain_seq` starts at 1 and is gapless. A row's `prev_link` is the prior row's `chain_link`; sequence 1 uses §7 genesis. Global `occ_seq` and `action_seq` may have rollback gaps and are not the chain order. A key rotation changes `chain_key_id` but never changes the partition, resets `chain_seq`, or creates a new genesis.

`chain_key_id` is:

```text
lowercase_hex(SHA256(SPKI_DER_bytes))
```

SPKI is the RFC 8410 Ed25519 SubjectPublicKeyInfo DER encoding derived from the PKCS#8 private key. Hashing PEM text, base64 text, a raw 32-byte public key, PKCS#8 bytes, or a filename is forbidden.

## 5. Canonical row bytes

`C`, the canonical row byte string, is the UTF-8 encoding with no BOM, leading/trailing whitespace, or newline of an RFC 8785 JSON serialization of:

```text
["obs-audit-row/v1", TABLE, [[COLUMN_NAME, SQL_TYPE, TAGGED_VALUE], ...]]
```

`chain_signature` and `chain_link` are not members of `C`; they are outputs derived from it. Every listed field is included, including a NULL field. Column names and SQL type labels below are literal protocol strings.

SQL scalar values in the third field position are exact:

- `uuid`: a canonical lowercase hyphenated JSON string;
- `bigint`, `integer`, or `smallint`: a base-10 JSON string, no plus sign or leading zero except `0`;
- `timestamptz`: a JSON string `YYYY-MM-DDTHH:mm:ss.sssZ`, exact UTC milliseconds;
- `bytea`: a lowercase-hex JSON string;
- `boolean`: a JSON boolean;
- `text`: the exact JSON string, with no trim, Unicode normalization, or case change;
- SQL NULL: JSON `null`;
- `jsonb`: the recursive tagged form below.

JSONB tags are:

```text
null             ["n"]
boolean          ["b", VALUE]
safe integer     ["i", DECIMAL_STRING]
string           ["s", EXACT_STRING]
array            ["a", CHILD_0, CHILD_1, ...]
object           ["o", [[KEY_0, CHILD_0], [KEY_1, CHILD_1], ...]]
```

Object keys are sorted by unsigned UTF-8 byte order. JSONB values containing a fraction/exponent, integer outside JavaScript's safe-integer range, duplicate source key, lone surrogate, accessor, proxy, cycle, symbol, bigint runtime value, non-plain prototype, or any configured depth/node/byte cap excess are rejected before signing. There is no coercion. The decoder and encoder use fixed finite caps committed with the package; tests pin them.

The occurrence columns, in exact signed order, are:

```text
chain_version:smallint, chain_key_id:text, chain_seq:bigint, prev_link:bytea,
occurrence_id:uuid, occ_seq:bigint, occurred_at:timestamptz, captured_at:timestamptz,
environment:text, build_ref:text, build_dirty:boolean, runtime:text, component:jsonb,
capture_point:text, code:text, taxonomy_class:text, severity:text, condition_mark:text,
disposition:text, fingerprint:text, fingerprint_version:integer,
redaction_policy_version:text, allowlist_set_id:text, fallback_minimized:boolean,
capture_status:text, run_ref:text, work_item_ref:text, node_ref:text, attempt_ref:text,
ledger_ref:text, parent_occurrence_ref:text, cause_relation:text, at_seq_watermark:text,
frames:jsonb, safe_template_id:text, template_parameters:jsonb, source:text,
source_event_ref:text, zone_context:boolean, attempt_index:integer, writer_identity:text
```

The action columns, in exact signed order, are:

```text
chain_version:smallint, chain_key_id:text, chain_seq:bigint, prev_link:bytea,
agent_action_id:uuid, action_seq:bigint, source:text, writer_identity:text, actor:text,
action_kind:text, occurrence_id:uuid, incident_id:uuid, action_ref:text,
action_payload:jsonb, occurred_at:timestamptz
```

Legacy digest canonical rows use the same lists with all chain-prefix values NULL. No schema-order discovery, object-key enumeration order, locale collation, `JSON.stringify` default, database JSON text, or ORM serialization may replace these literal lists.

## 6. Allocation, locking, and transaction semantics

The package exports exactly these public gateways from `@debateai/obs-capture/chain`:

```ts
appendChainedOccurrences(client, envelopes, signer)
appendChainedAgentAction(client, action, signer)
```

The public types bind a `ChainTransactionClient`, `AuditChainSigner`, `ChainedOccurrenceInput`, `ChainedAgentActionInput`, and typed result. Default/core/install exports do not import the chain subpath; runtime code reaches it only after the existing lazy runtime load. No installer-graph package import is allowed. The package owns its RFC 8785 implementation or a pinned existing dependency after lockfile review; it never imports the C1 policy canonicalizer.

Each caller provides a connected client. The occurrence gateway owns `BEGIN`/`COMMIT`/`ROLLBACK` for its batch. The action gateway requires an already-open caller transaction and never commits or rolls it back. A call outside the required transaction state is an error.

Let `LP(X)=UINT32_BE(byte_length(X)) || X`. A chain-lock token is the lowercase hex encoding of `LP(UTF8(TABLE)) || LP(UTF8(SOURCE)) || LP(UTF8(WRITER_IDENTITY))`, prefixed by literal `obs-audit-chain-lock/v1:`. For each distinct partition in a call, gateways acquire this transaction advisory lock in lexicographic unsigned-UTF-8 token order:

```sql
SELECT pg_advisory_xact_lock(
  hashtextextended(
    $length_prefixed_chain_lock_token,
    0
  )
)
```

A 64-bit hash collision may serialize distinct partitions; it cannot admit two writers to the same partition. While holding the lock, the gateway selects the latest `(chain_seq,chain_link,chain_key_id)` for that exact partition ordered by `chain_seq DESC LIMIT 1`. It sets next `chain_seq` to one or tail plus one and verifies tail completeness. Batch rows for one partition receive consecutive values in caller order.

An occurrence batch first rejects duplicate `(source,source_event_ref)` inputs, then acquires length-prefixed idempotency advisory locks for every such tuple in unsigned-UTF-8 token order, queries/removes exact already-present events, and rejects any existing identity/content conflict. Only then may it acquire chain locks and allocate chain positions. An action call first acquires its length-prefixed `action_ref` idempotency lock, returns the one exactly matching existing action without a chain advance, and rejects a semantic collision; only then may it acquire the action partition lock. C2's occurrence-delivery lock remains outermost. No gateway uses `ON CONFLICT DO NOTHING` after allocating a chain position.

Before canonicalization, the gateway materializes every database-generated signed value: UUID, global sequence, action/occurrence time, `captured_at`, defaults, source, writer identity, chain version/key id/sequence, and prior link. Occurrence allocation calls `obs.occurrence_seq_nextval_notify()` inside the owning transaction and inserts its returned value explicitly, preserving commit-transactional notification. Timestamps are generated or rejected at exact millisecond precision. The gateway never signs one value and asks a SQL default, trigger, cast, or ORM to store another.

It then canonicalizes, signs, derives the link, and inserts the exact bound values. Occurrence notification remains transaction-bound and follows the occurrence insert. Any `occurrence_detail` and spool receipt remain in that same occurrence transaction. Skip/poison action append remains in the C2 delivery transaction before ACK and cursor advancement. On any allocation, signing, insert, notification, detail, receipt, ACK, or cursor error, the whole owning transaction rolls back. A rolled-back `chain_seq` is reusable from the unchanged tail; no partial row or tail update exists.

Before activation, the same gateways run only in explicit `PRE_ACTIVATION` mode, verify that both DB activation and external activation file are absent, and write an all-NULL chain tuple through the shared insertion path. After activation, only explicit `REQUIRED` mode is accepted, DB/file/keyring parity is mandatory, and any missing or invalid signer causes failure rather than an unsigned insert. Seeing only one of DB activation or activation file is always fail-closed.

## 7. Signatures, links, and genesis

Let `UTF8`, `SHA256`, and `Ed25519.Sign` operate on bytes. Let `LP(X) = UINT32_BE(byte_length(X)) || X`. The domains include the shown NUL byte and no newline.

```text
signature = Ed25519.Sign(
  writer_private_key,
  UTF8("obs-audit-signature/v1") || 0x00 || C
)

chain_link = SHA256(
  UTF8("obs-audit-link/v1") || 0x00 || UINT32_BE(byte_length(C)) || C || signature
)

genesis = SHA256(
  UTF8("obs-audit-genesis/v1") || 0x00 ||
  LP(UTF8(TABLE)) || LP(UTF8(SOURCE)) || LP(UTF8(WRITER_IDENTITY)) ||
  activation_manifest_sha256_bytes
)
```

Verification recomputes `C`, checks the signature with the authorized SPKI, recomputes `chain_link`, and checks `prev_link` against genesis or the preceding link. Domain or length-prefix substitution is a verification failure.

## 8. Legacy boundary and digests

At activation, all old rows retain NULL chain material forever and are classified exactly `LEGACY_WITNESSED_UNVERIFIED`. They are not called verified, invalid, or backfilled.

For each table, a legacy row uses protocol id `obs-audit-legacy-row/v1`, the same fixed field order and scalar/JSONB rules as §5, all chain-prefix fields NULL, and no derived signature/link fields. Let `L_i` be those row bytes and `H_i=lowercase_hex(SHA256(L_i))`. The exact snapshot is RFC 8785 bytes of this array:

```text
[[PRIMARY_ID_1, GLOBAL_SEQUENCE_1_DECIMAL, H_1], ...]
```

Occurrence order is `(occ_seq ASC, occurrence_id ASC)`; action order is `(action_seq ASC, agent_action_id ASC)`. UUID and sequence are JSON strings in the formats from §5. The stored digest is SHA-256 of the snapshot bytes; the separately stored count and maximum are nonnegative database integers and manifest decimal strings, with maximum zero for an empty table.

The activation manifest, database singleton, and an independent recomputation must agree on both counts, maxima, and digests. A NULL-chain row beyond either recorded maximum, a new NULL-chain row at or below a maximum, or a chained row at/before the boundary is `CHAIN_BREAK`.

## 9. V-signed public keyring

`${OBS_CONTROL_DIR}/chain/public-keyring.json` is RFC 8785 canonical JSON, UTF-8, no BOM or newline, written by temp-file/fsync/atomic-rename/fsync-directory. Its complete signed document is:

```json
{
  "protocol":"obs-chain-public-keyring/v1",
  "generation":"<positive decimal>",
  "prior_keyring_sha256":"<64 lowercase hex or 64 zeroes for generation 1>",
  "created_at":"YYYY-MM-DDTHH:mm:ss.sssZ",
  "entries":[{
    "key_id":"<64 lowercase hex>",
    "algorithm":"ed25519",
    "spki_der_base64":"<canonical padded base64>",
    "writer_identity":"<exact text>",
    "authorizations":[{
      "table":"<occurrence or agent_action>",
      "source":"<first_party, hatchet, ui_client, or ops>",
      "min_chain_seq":"<positive decimal>",
      "max_chain_seq":null
    }]
  }],
  "witness_keys":[{
    "key_id":"<64 lowercase hex>",
    "algorithm":"ed25519",
    "spki_der_base64":"<canonical padded base64>",
    "min_witness_seq":"<positive decimal>",
    "max_witness_seq":null
  }],
  "custodian_key_id":"<64 lowercase hex>",
  "custodian_signature_base64":"<canonical padded 64-byte signature>"
}
```

Entry arrays are sorted by `(writer_identity,key_id)` and witness keys by `key_id`; authorizations are sorted by `(table,source,min_chain_seq)` under unsigned UTF-8 order and contain no duplicate or overlapping interval for one partition. A row is authorized iff its exact table/source/writer matches and `min_chain_seq <= chain_seq` and (`max_chain_seq` is NULL or `chain_seq <= max_chain_seq`). Witness authorization uses the same inclusive sequence rule. Old public keys stay in every later cumulative keyring.

The custodian signature covers the RFC 8785 bytes of the document with `custodian_signature_base64` omitted:

```text
Ed25519.Sign(V_custodian_private_key,
  UTF8("obs-chain-keyring-signature/v1") || 0x00 || unsigned_keyring_bytes)
```

The complete signed keyring digest is SHA-256 over the canonical complete document bytes. The verifier loads `${OBS_CONTROL_DIR}/chain/custodian-root.spki`, requires Ed25519 SPKI DER, derives `custodian_key_id` by the §4 rule, checks the signature, all entry key ids, generation monotonicity, and `prior_keyring_sha256` against its last witnessed complete-file digest. Generation 1 is bound by activation; each later generation must be witnessed before a further generation may be accepted. V's custodian private key is not an application input and has no repository or database location.

## 10. Activation manifest and ceremony

`${OBS_CONTROL_DIR}/chain/activation.json` is a V-signed RFC 8785 document with this exact shape:

```json
{
  "protocol":"obs-chain-activation/v1",
  "chain_protocol":"obs-audit-chain/v1",
  "activation_id":"<canonical lowercase UUID>",
  "activated_at":"YYYY-MM-DDTHH:mm:ss.sssZ",
  "occurrence_legacy_max_seq":"<nonnegative decimal>",
  "occurrence_legacy_count":"<nonnegative decimal>",
  "occurrence_legacy_digest":"<64 lowercase hex>",
  "agent_action_legacy_max_seq":"<nonnegative decimal>",
  "agent_action_legacy_count":"<nonnegative decimal>",
  "agent_action_legacy_digest":"<64 lowercase hex>",
  "public_keyring_sha256":"<64 lowercase hex>",
  "created_by_custodian_id":"V",
  "custodian_key_id":"<64 lowercase hex>",
  "manifest_sha256":"<64 lowercase hex>",
  "custodian_signature_base64":"<canonical padded 64-byte signature>"
}
```

The unsigned body is the same object with both `manifest_sha256` and `custodian_signature_base64` omitted. `manifest_sha256 = SHA256(unsigned_body_bytes)`. The signature is `Ed25519.Sign(V_custodian_private_key, UTF8("obs-chain-activation-signature/v1") || 0x00 || unsigned_body_bytes)`. The completed document must repeat the derived digest and signature exactly; the database stores that unsigned-body digest, and the same 32 bytes are the genesis input.

Activation is a V-only later operation. Its exact sequence is:

1. generate/stage all writer private keys, V public root, watchdog witness key, and generation-1 public keyring; validate owners, modes, links, algorithms, ids, and partition sequence authorizations;
2. deploy chain-capable binaries but stop and quiesce every occurrence/action writer, obsctl reconciler, and watchdog; prove no open writer transaction;
3. apply reviewed `0064`; in one transaction locking both tables against writes, prove activation empty and chain tuples NULL, allocate the activation UUID/millisecond time, compute both legacy snapshots/counts/maxima, and construct the matching manifest;
4. independently recompute, V-sign, stage, and fsync the completed activation document without publishing it at the final path;
5. insert the exactly matching immutable DB activation row and commit while every writer remains quiesced;
6. atomically publish the staged external manifest by same-filesystem rename and fsync its directory; a stop after database commit but before publication leaves all writers quiesced and verification `VERIFY_UNAVAILABLE`, never PASS;
7. start signed writers, then the daemon/obsctl reconciler, then C4 watchdog; verify DB/file parity and each signer, append one real row per admitted live partition, and verify it from public material;
8. V alone decides whether to accept or roll back the deployment.

There is no cross-filesystem/database atomic claim. Database-first publication under writer quiescence plus mandatory parity makes every interruption fail closed. No executor of this authority may perform these steps against production. The lifecycle/bootstrap/rotation command implementation belongs to separately authorized FIX-10 C0 and must land before C4; FIX-09 C3.5 supplies readers, gateways, and local fixtures only.

## 11. Rotation, loss, and rollback

For planned row-key rotation, V quiesces the affected writer, acquires all of its partition locks in canonical order, records every tail, and issues a cumulative next-generation keyring closing each old key authorization at its recorded `chain_seq` and opening the new key at `tail+1`. V atomically installs/fsyncs the keyring, atomically switches the PKCS#8 file, restarts only that writer, and verifies its derived key id before unquiescing it. The first new-key row continues the prior link and next sequence. Old SPKI entries remain for historical verification; there is no time-based or overlap authorization.

Private-key absence, wrong owner/mode/link count, keyring mismatch, chain sequence outside authorization, signing error, or a recovered key id mismatch is fail-closed. Direct occurrence capture follows the existing bounded spool path; spool replay waits for an authorized signer. A daemon action failure rolls back its C2 delivery transaction, so no ACK/cursor can advance. There is no unsigned post-activation escape.

For suspected compromise, V quiesces the affected writer, preserves database and witness bytes, records the last independently witnessed tail, closes or revokes the compromised interval in a new V-signed keyring, provisions a new key, and resumes at the next sequence and prior stored link. Rows after the last trustworthy witness remain explicitly suspect; no row or witness record is edited. A new key cannot retroactively authenticate them.

Rollback before activation may revert application code and `0064` only after proving no activation row and no non-NULL chain tuple. Rollback after activation may roll back the application release only to a release that reads and requires this protocol; migration/schema/keyring/activation/journal stay. Dropping columns, clearing activation, resetting sequences, backfilling signatures, or deleting/re-signing rows is forbidden.

## 12. Required symbolic topology and key loading

`OBS_CONTROL_DIR` is a required absolute, symlink-free production input supplied later by V. Authority records only these approved relative paths and no live root literal:

```text
${OBS_CONTROL_DIR}/chain/private/<writer_identity>.pk8
${OBS_CONTROL_DIR}/chain/public-keyring.json
${OBS_CONTROL_DIR}/chain/custodian-root.spki
${OBS_CONTROL_DIR}/chain/activation.json
${OBS_CONTROL_DIR}/keys/watchdog-witness.pk8
${OBS_CONTROL_DIR}/witness/watchdog-chain.jsonl
```

Row and witness private files are Ed25519 PKCS#8 DER, regular files, mode `0600`, link count one, owned by the effective uid, opened with `O_NOFOLLOW`, and checked by descriptor metadata before reading; the private-key parent presented to each process is mode `0700`. The public keyring is V-owned mode `0440` to the watchdog group or an exact watchdog-owned mode `0400` copy. The witness journal is watchdog-owned mode `0600`. The loader rejects a symlink in any path component, a non-absolute root, traversal, wrong DER algorithm, trailing bytes, an unexpected public-key id, unsafe writer filename, or a file outside the resolved root. Private bytes are read once into process memory, never printed, and zeroed on replacement/shutdown where the runtime permits. Production uid/group names, absolute root, admitted writer identities, public keys, and activation values are the only V-later provisioning inputs; no default value is authorized.

The row signer receives only its own PKCS#8 file and public artifacts. The watchdog receives no row private key. Domain-separated key families may not be reused: row signing, V custodian signing, watchdog witness signing, daemon proof signing, obsctl outbox signing, and the existing ARMED HMAC are distinct.

## 13. Read-only watchdog and witness journal

The C4 watchdog authenticates as `debateai_obs_watchdog`, begins `READ ONLY ISOLATION LEVEL REPEATABLE READ`, captures both global-sequence high-water marks, reads activation plus all legacy and chained rows up to those marks, and commits without a database row mutation. For every partition it checks boundary placement, sequence 1/genesis, gapless chain sequence, prior-link continuity, canonical bytes, table/source/writer/chain-sequence key authorization, Ed25519 signature, and derived link. It verifies the V keyring chain and the complete prior witness journal before trusting a current scan; prior witnessed high-water/head state may not disappear or regress.

The result vocabulary is closed: `VERIFIED`, `CHAIN_BREAK`, `VERIFY_UNAVAILABLE`, `KEYRING_INVALID`, `WITNESS_INVALID`. The reason vocabulary is closed: `NONE`, `LEGACY_CHANGED`, `CHAIN_SEQUENCE`, `GENESIS`, `PREV_LINK`, `ROW_SIGNATURE`, `ROW_LINK`, `KEY_AUTHORIZATION`, `HEAD_REGRESSION`, `DATABASE_UNAVAILABLE`, `PUBLIC_MATERIAL_UNAVAILABLE`, `KEYRING_FORMAT`, `KEYRING_SIGNATURE`, `KEYRING_CONTINUITY`, `WITNESS_FORMAT`, `WITNESS_SIGNATURE`, `WITNESS_CONTINUITY`, `JOURNAL_IO`. Pairing is exact: `VERIFIED/NONE`; `CHAIN_BREAK` with `LEGACY_CHANGED|CHAIN_SEQUENCE|GENESIS|PREV_LINK|ROW_SIGNATURE|ROW_LINK|KEY_AUTHORIZATION|HEAD_REGRESSION`; `VERIFY_UNAVAILABLE` with `DATABASE_UNAVAILABLE|PUBLIC_MATERIAL_UNAVAILABLE|JOURNAL_IO`; `KEYRING_INVALID` with `KEYRING_FORMAT|KEYRING_SIGNATURE|KEYRING_CONTINUITY`; `WITNESS_INVALID` with `WITNESS_FORMAT|WITNESS_SIGNATURE|WITNESS_CONTINUITY`. Legacy rows are additionally labeled `LEGACY_WITNESSED_UNVERIFIED`; that label is not a PASS on authenticity. A database/read/key availability failure is `VERIFY_UNAVAILABLE`, never PASS.

Each scan appends one RFC 8785 JSON object plus one LF to `${OBS_CONTROL_DIR}/witness/watchdog-chain.jsonl`. Its unsigned body contains only: schema `obs-chain-witness/v1`; canonical cycle UUID; decimal witness sequence; millisecond cycle time; PostgreSQL snapshot text plus occurrence/action high-water marks; activation digest; keyring generation/digest; both legacy labels/counts/digests; a sorted vector of `(table,source,writer_identity,chain_seq,chain_link)` current heads; one closed result; one closed typed reason; prior witness hash; and witness key id. Heads sort by unsigned UTF-8 `(table,source,writer_identity)`. The complete line adds canonical padded-base64 `witness_signature` and lowercase-hex `witness_hash`. It contains no occurrence content, action payload, template parameter, frame, user identifier, free text, or private material.

For unsigned record bytes `W` (signature field omitted):

```text
witness_signature = Ed25519.Sign(witness_private_key,
  UTF8("obs-witness-signature/v1") || 0x00 || W)
witness_hash = SHA256(
  UTF8("obs-witness-link/v1") || 0x00 || UINT32_BE(byte_length(W)) ||
  W || witness_signature
)
```

The first `prior_witness_hash` is the activation-manifest SHA-256. Later records use the exact prior `witness_hash`. The unsigned body excludes both derived output fields. The file is opened `O_APPEND|O_NOFOLLOW`, verified regular/euid-owned/mode `0600`/link-count-one with stable inode, locked exclusively for full prior validation plus append, written as one complete line, and fsynced before unlock; its directory is fsynced on creation. Directory creation/provisioning is V-owned; runtime never truncates, rotates, rewrites, or repairs the journal. A torn final line is `WITNESS_INVALID` and requires a V recovery ruling. Witness key authorization comes only from the distinct `witness_keys` section of the V-signed keyring.

Only after a journal record is fsynced may the watchdog insert/update its existing typed `component_health` signal. A `VERIFIED` record permits PASS health; every other result emits its exact closed code. The watchdog never writes `obs.agent_action` and never uses the FIX-10 outbox.

## 14. FIX-10 C0 dependency and compatibility

A separately V-selected FIX-10 successor must land and pass review as **FIX-10 C0** after C3.5 and before C4. C0 owns production keyring/activation/bootstrap/rotation commands and the signed obsctl action outbox; FIX-09 does not invent those commands or paths. The remainder of FIX-10 still waits for FIX-09 acceptance.

Future FIX-10 database reconciliation is one new action writer with exact `source='ops'` and `writer_identity='obsctl'`. It must use `appendChainedAgentAction` and a keyring-authorized per-writer Ed25519 key. Each outbox item supplies a globally unique deterministic `action_ref`; database uniqueness plus the action gateway makes replay idempotent. Reconciliation signs and appends before recording the resulting database action id in a later append-only obsctl journal line; a transaction failure leaves the item pending.

FIX-10 marker-only `kill|arm` verbs remain DB-free: they open no database socket and never append the watchdog journal. They write domain-separated records to the separately authorized V-owned obsctl outbox using its distinct obsctl key. The next database-capable `status` invocation under the same V OS identity must reconcile every pending record. Exact outbox/obsctl journal paths and production placement remain governed by the VNOW-05 decision; this document selects no additional filesystem topology.

## 15. Required verification

C3.5/C4 evidence must include:

- deterministic cross-process canonical vectors for every scalar, nested JSONB, both row schemas, signature, link, and genesis;
- hostile JSON rejection for float/exponent, unsafe integer, duplicate source keys, lone surrogate, accessor, proxy, cycle, non-plain prototype, and every cap;
- ephemeral Ed25519 PKCS#8/SPKI keys only, with wrong algorithm, wrong writer/source/table, key-id mismatch, chain sequence below/above authorization, signature mutation, and keyring/activation tamper cases;
- real PostgreSQL migration tests for empty and populated legacy tables, non-NULL `prev_link` STOP, duplicate `action_ref` STOP, exact schema/constraints/indexes/triggers/ACLs, no chain backfill, deterministic legacy digest, and reversible pre-activation down migration;
- real-role tests proving writer/listener tail reads and inserts, watchdog read-only access plus health writes, watchdog action INSERT denial, and no private/symmetric verification material in PostgreSQL;
- real PostgreSQL concurrent same-partition, different-partition, multi-partition lock-order, multi-row order, rollback/retry, global-sequence-gap, duplicate replay, and occurrence/detail/receipt/action/ACK atomicity cases;
- direct/spooled capture identity tests proving a spool record is replayed only by the exact configured writer identity and authorized key, without filename-based signer substitution;
- all four current writer conversions plus static rejection of raw production INSERTs;
- verifier mutations for row field, source, writer, ordering, deletion, duplicated sequence, prior link, signature, key id, activation, legacy boundary, keyring generation/prior digest, and witness line/truncation;
- activation interruption tests for file absent/DB absent, file only, DB only, mismatch, and exact parity; rotation and compromise-recovery continuity tests;
- privacy tests proving journal and diagnostics contain only the §13 allowlist and never expose payloads, template values, frames, user-linked identifiers, private bytes, or live roots;
- FIX-10 consumer contract tests for `ops/obsctl`, unique `action_ref`, retry idempotency, and DB-free marker verbs before any reconciliation stage;
- adjacent C1-C3 suites and exact hash/interface checks, repeated three times where the mission acceptance contract requires repetition.

All tests create keys in per-test temporary directories, destroy them after use, and use embedded/local PostgreSQL only. Tests may not read an operator control directory or infer a production root.

## 16. STOP conditions and non-authority

STOP on any migration collision, baseline/hash/interface mismatch, unknown writer, direct INSERT, incomplete chain tuple, chain tail anomaly, DB/file activation mismatch, invalid V signature, signer/key-id mismatch, missing private key, broad grant, watchdog action write, noncanonical value, privacy leak, test mutation survivor, or unresolved FIX-10 authority dependency.

This packet does not authorize a live root literal; real key creation or copying; V custodian signing; production configuration; migration application; writer quiesce/restart; activation; watchdog launch; operational acceptance; edits to FinalPlan/L2/S21/live mission plan; retention/deletion; merge; push; or a Done claim. Those remain V-owned.
