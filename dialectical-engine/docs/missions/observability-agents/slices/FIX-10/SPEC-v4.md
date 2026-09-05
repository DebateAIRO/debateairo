# FIX-10 — source-complete proof, frozen replay, activation signer parity, and lifecycle audit

**Successor authority packet — 2026-09-05, fix round 2.** This document incorporates `SPEC-v2.md` and `SPEC-v3.md` without changing their bytes and supersedes only the clauses named below. Frozen `SPEC.md`, `PLAN.md`, v2, v3, and their decision rows remain immutable evidence. The human-approved VNOW-05 Option A remains controlling: one required symbolic `OBS_CONTROL_DIR` and its exact persistent topology; no second root or new persistent leaf is authorized.

This packet authorizes documentation and fresh independent authority review only. It authorizes no source, package, test, migration, role, grant, worktree, live root, identity, key, marker, database, service, acceptance, merge, push, board, or Done act. FIX-10 implementation remains STOP.

## 1. Verified correction boundary and dependency gate

The round-2 Sol findings were checked against the immutable sources and stand:

1. L2 Addendum 2 §5.2/§5.5 requires a source-agnostic open-or-recently-closed-or-recently-opened gap veto, with `W = P + 2R + S + F` and a query interval of `W + S`; v3 used a first-party interval-overlap query of length `P`.
2. V3 did not freeze `local_outcome` before the first STATUS database attempt, so an unknown commit could replay the same `action_ref` with different semantics.
3. FIX-09 v4 §10 requires every private signer and generation-one authorization to pass before activation; v3 validated public artifacts but not the complete private signer set.
4. Frozen FIX-10 R06 and FinalPlan A.2 cover every admitted `obsctl` invocation; v3's seven lifecycle verbs were outside its KILL/ARM/STATUS-only local histories.

No correction needs a new schema object. `obs.agent_action.action_kind` is nonempty text, its payload is JSONB, and binding FIX-09 `0064` plus `appendChainedAgentAction` already admit exact `source=ops`, `writer_identity=obsctl`, globally unique `action_ref` actions. FIX-10 adds no migration, role, grant, function, table, sequence, trigger, or raw action DML.

All implementation remains blocked until a future receipt supplies one full immutable `FIX09_C35_REVIEWED_REF` whose independent result is exactly `PASS`, `SPEC PASS`, `CODE QUALITY PASS`, and `P0=0 P1=0 P2=0 P3=0`. The receipt must retain every v3 §1 migration/export/ACL/gateway binding and must state whether the reviewed gateway exposes its binding `PRE_ACTIVATION` mode to the status adapter. Missing, changed, partial, self-certified, or non-PASS evidence is STOP.

## 2. Required timing inputs and source-complete recent-loss veto

V supplies all production values. Each is a canonical positive safe integer decimal with no plus sign or leading zero. There is no repository, development, inferred, fallback, clamped, or production default:

| Symbol | Required input | Meaning |
|---|---|---|
| `P` | `OBS_AUTHORITY_PROOF_STALENESS_MS` | proof lifetime |
| `R` | `OBS_AUTHORITY_PROOF_REFRESH_INTERVAL_MS` | daemon proof-refresh interval |
| `S` | `OBS_SKEW_TOLERANCE_MS` | split-clock tolerance |
| `F` | `OBS_FLUSH_INTERVAL_MS` | capture-gap flush interval |
| `W` | `OBS_CAPTURE_GAP_QUIET_WINDOW_MS` | V-supplied register value which must equal the checked derivation below |

Every multiplication and addition is checked in the positive-safe-integer domain before database access:

~~~text
DERIVED_W = P + 2 * R + S + F
W         = DERIVED_W
Q         = W + S
W >= P
~~~

An unset, malformed, nonpositive, unsafe, overflowing, unequal, or under-floor input makes proof refresh refuse. The daemon neither substitutes nor clamps a value. `W >= P` is asserted separately even though valid positive terms imply it, so omission of the floor is independently falsifiable.

V3 §7's unsigned proof object remains exact except that its `gap_window` member is replaced by this closed object:

~~~json
{
  "authority_proof_staleness_ms":"<P>",
  "refresh_interval_ms":"<R>",
  "skew_tolerance_ms":"<S>",
  "flush_interval_ms":"<F>",
  "quiet_window_ms":"<W>",
  "query_window_ms":"<Q>",
  "recent_gap_rows":"0"
}
~~~

The daemon runs this binding L2 predicate with no source or gap-class filter:

~~~sql
SELECT count(*) AS recent_gaps
FROM obs.capture_gap
WHERE closed_at IS NULL
   OR closed_at > now() - make_interval(secs => (W + S) / 1000.0)
   OR opened_at > now() - make_interval(secs => (W + S) / 1000.0);
~~~

`W` and `S` are bound numeric parameters derived from the already validated decimal inputs; string interpolation is forbidden. The transaction's PostgreSQL `now()` is the sole query clock. The returned count must parse as canonical nonnegative decimal and equal zero; any connect, timeout, cancellation, SQL, type, row-count, parse, or close failure refuses refresh. The predicate includes every source, so reviewed FIX-07 `unclassified|POSTGRES_FAILURE` and `unclassified|GAP_WRITE_FAILURE` rows veto. A positive-skew/future-dated `opened_at` or `closed_at` also vetoes because it satisfies the strict greater-than term. An old open row always vetoes.

The strict boundary is exact. For a closed row with both timestamps equal to `now() - Q`, neither recency term matches and that row alone does not veto. At `now() - Q + 1 millisecond` either matching timestamp vetoes. The live falsification therefore requires both halves: immediately after an admitted gap, proof does not refresh; only at or after the exact `Q = W + S` boundary, with no open row, no timestamp newer than the boundary, and every other v3 proof conjunct still positive, may refresh succeed. Tests control the database transaction clock; wall-clock sleeps are not evidence.

V3's independent API/runner/scheduler ARMED state, health/canary freshness, pairwise-distinct canaries, writer-partition matching, watchdog coverage, spool, marker, activation, and policy checks remain binding. A gap-free result cannot compensate for a missing runtime, stale/OFF runtime, stale/future canary, or canary bypass.

V3 §10's status wire becomes `obsctl-status/v3`. Its two fields `recent_first_party_gap_rows` and `recent_first_party_lost_count` are removed and replaced in the same position by this exact total member:

~~~json
"capture_gaps":{
  "open_rows":"<nonnegative decimal or null>",
  "recent_rows":"<nonnegative decimal or null>",
  "authority_proof_staleness_ms":"<P or null>",
  "refresh_interval_ms":"<R or null>",
  "skew_tolerance_ms":"<S or null>",
  "flush_interval_ms":"<F or null>",
  "quiet_window_ms":"<W or null>",
  "query_window_ms":"<Q or null>",
  "reason":"<NONE or DB_UNAVAILABLE or QUERY_FAILURE or TIMING_INVALID>"
}
~~~

`open_rows` is the source-agnostic count with `closed_at IS NULL`; `recent_rows` is the binding predicate count. Valid local timing remains visible when the database is unavailable. Invalid timing makes all six timing values and both counts null with `TIMING_INVALID`; a database/connect failure preserves validated timing, makes both counts null, and reports `DB_UNAVAILABLE` or `QUERY_FAILURE`. Status never labels this source-complete result first-party-only and never converts an unavailable count to zero.

## 3. One immutable outbox intent determines every database action

V3 §8 and §12 are replaced only where this section is more exact. One signed outbox supports these closed action kinds in this order:

~~~text
KILL
ARM
STATUS
CHAIN_KEYRING_INSTALL
CHAIN_ACTIVATION_SNAPSHOT
CHAIN_BOOTSTRAP
CHAIN_ROTATE_ROW
CHAIN_ROTATE_WITNESS
CHAIN_RECOVER_ROW
CHAIN_RECOVER_WITNESS
~~~

The identity and `action_ref` formulas remain v3. The unsigned outbox object is now exactly:

~~~json
{
  "schema":"obsctl-outbox-action/v3",
  "outbox_seq":"<positive decimal>",
  "invocation_id":"<canonical lowercase UUIDv4>",
  "requested_at_ms":"<positive decimal>",
  "actor":"obsctl:<validated username>",
  "action_kind":"<one closed value above>",
  "action_parameters":{
    "writer_identity":"<exact safe identity or null>",
    "public_input_sha256":"<64 lowercase hex or null>",
    "private_key_id":"<64 lowercase hex or null>"
  },
  "action_ref":"obsctl:v1:<64 lowercase hex>",
  "prior_outbox_hash":"<64 lowercase hex>",
  "signing_key_id":"<64 lowercase hex>"
}
~~~

`writer_identity` is non-null only for `CHAIN_ROTATE_ROW` and `CHAIN_RECOVER_ROW`. `public_input_sha256` is the completed public keyring digest for keyring/rotate/recover, the completed activation digest for bootstrap, and null for KILL/ARM/STATUS/activation-snapshot. `private_key_id` is the owner-probe-derived new public key id for rotate/recover and null otherwise. Authentication rejection records the safe writer argument where present and null input/key values. Unknown or extra parameters reject before append. Sequence, signature, link, derived SPKI key id, append, lock, partial-tail, and no-repair laws remain v3 §§5/8.

For completed outbox record `O`, database gateway arguments are a pure function `D(O)` and are frozen before the first attempt:

~~~text
source          = "ops"
writer_identity = "obsctl"
actor           = O.actor
action_kind     = O.action_kind
occurrence_id   = null
incident_id     = null
action_ref      = O.action_ref
action_payload  = J({
  schema:"obsctl-agent-action/v3",
  invocation_id:O.invocation_id,
  requested_at_ms:O.requested_at_ms,
  outbox_seq:O.outbox_seq,
  outbox_hash:O.outbox_hash,
  action_parameters:O.action_parameters,
  local_outcome:null
})
~~~

`local_outcome` is always JSON null. It is not a command result and never changes after a local success, rejection, connection loss, commit-unknown result, receipt failure, restart, or later retry. Journal state, current markers, current database state, and current time are not inputs to `D`.

Reconciliation begins a transaction, calls only reviewed `appendChainedAgentAction(client,D(O),obsctlRowSigner)`, commits, and only then appends the database receipt. On an unknown commit, it appends the closed local unreachable result when possible and leaves `O` pending. Replay recomputes byte-identical `D(O)`, uses the same action id/ref inputs, and accepts only the original `agent_action_id` with no chain advance. A semantic collision is rejection. A local result append can never rewrite, replace, annotate, or otherwise alter `O` or `D(O)`.

## 4. Complete generation-one signer inventory before activation

### 4.1 Exact admitted signer set

The initial row signer set has exactly five entries and the witness signer set exactly one. The three product writer identities and every numeric uid/gid are required V-later values; no value below is a default. All six private-key owners are real, pairwise-distinct effective principals and are distinct from `V_PROVISIONER_UID`. Public groups grant no private read.

| Slot | Private leaf | Owner | Exact generation-one authorization |
|---|---|---|---|
| `api_occurrence` | `chain/private/<API_WRITER_IDENTITY>.pk8` | `API_WRITER_UID:API_WRITER_GID` | `(occurrence,first_party,<API_WRITER_IDENTITY>,1,null)` |
| `runner_occurrence` | `chain/private/<RUNNER_WRITER_IDENTITY>.pk8` | `RUNNER_WRITER_UID:RUNNER_WRITER_GID` | `(occurrence,first_party,<RUNNER_WRITER_IDENTITY>,1,null)` |
| `scheduler_occurrence` | `chain/private/<SCHEDULER_WRITER_IDENTITY>.pk8` | `SCHEDULER_WRITER_UID:SCHEDULER_WRITER_GID` | `(occurrence,first_party,<SCHEDULER_WRITER_IDENTITY>,1,null)` |
| `daemon_action` | `chain/private/fixagent-daemon.pk8` | `DAEMON_UID:DAEMON_GID` | `(agent_action,first_party,fixagent-daemon,1,null)`, `(agent_action,hatchet,fixagent-daemon,1,null)`, `(agent_action,ui_client,fixagent-daemon,1,null)` |
| `obsctl_action` | `chain/private/obsctl.pk8` | `OBSCTL_UID:OBSCTL_GID` | `(agent_action,ops,obsctl,1,null)` |
| `watchdog_witness` | `keys/watchdog-witness.pk8` | `WATCHDOG_UID:WATCHDOG_GID` | witness sequence `[1,null]` |

The daemon action source is inherited from the selected occurrence under binding FIX-09 and therefore needs all three admitted occurrence sources. `unclassified` is not an occurrence/action source. No additional row or witness signer, partition, source, open interval, shared private key, or sequence start is admitted in generation one. A later writer needs a successor V-signed inventory/keyring generation and its separately authorized deployment; it cannot be silently added here.

This inventory resolves one textual overbreadth in v3 §4 without weakening its privilege boundary: the daemon action writer may securely read only `chain/private/fixagent-daemon.pk8`, because binding FIX-09 requires that current writer to sign its own action partitions. It still cannot read `chain/private/obsctl.pk8`, any product writer key, the ARMED HMAC key, the obsctl outbox key, or the watchdog private key, and it cannot forge obsctl local or database history. Every other private signer likewise reads only its one inventory leaf. V3 sentences saying the daemon reads no row leaf are superseded only by this one necessary self-key exception.

The V custodian private key has no application path and never enters obsctl, the provisioner, a signer probe, the database, or repository. Applicable V/activation authority is instead exact parity among:

- V-owned `chain/custodian-root.spki`, Ed25519 RFC 8410 SPKI DER, mode `0440`, one link, with its lowercase-hex SHA-256 id;
- the V-signed generation-one keyring containing exactly the six signer authorizations above;
- the V-signed activation document naming that keyring digest and the same custodian id;
- the V-signed inventory below naming both complete-document digests.

### 4.2 V-signed inventory descriptor

`OBSCTL_CHAIN_SIGNER_INVENTORY_INPUT_FD` is a required inherited read-only descriptor for bootstrap, with no default. It carries one RFC 8785 canonical UTF-8 document, no LF, with exact schema:

~~~json
{
  "schema":"obs-chain-initial-signer-inventory/v1",
  "inventory_id":"<canonical lowercase UUID>",
  "created_at_ms":"<positive decimal>",
  "activation_id":"<same activation UUID>",
  "activation_manifest_sha256":"<SHA-256 of completed activation bytes>",
  "public_keyring_sha256":"<SHA-256 of completed generation-one keyring bytes>",
  "row_signers":[{
    "slot":"<one of the five ordered slots above>",
    "writer_identity":"<exact identity>",
    "principal_uid":"<canonical nonnegative decimal>",
    "principal_gid":"<canonical nonnegative decimal>",
    "relative_pk8_path":"chain/private/<writer_identity>.pk8",
    "authorizations":[{"table":"<occurrence or agent_action>","source":"<exact source>","min_chain_seq":"1","max_chain_seq":null}]
  }],
  "witness_signer":{
    "slot":"watchdog_witness",
    "principal_uid":"<canonical nonnegative decimal>",
    "principal_gid":"<canonical nonnegative decimal>",
    "relative_pk8_path":"keys/watchdog-witness.pk8",
    "min_witness_seq":"1",
    "max_witness_seq":null
  },
  "custodian_root":{"relative_spki_path":"chain/custodian-root.spki","custodian_key_id":"<64 lowercase hex>"},
  "custodian_key_id":"<same 64 lowercase hex>",
  "custodian_signature_base64":"<canonical padded 64-byte signature>"
}
~~~

`row_signers` order is the five table rows above. Each authorization vector is in unsigned-UTF-8 `(table,source,min_chain_seq)` order. The signature covers `J(document without custodian_signature_base64)` under:

~~~text
Ed25519.Sign(SK_V,
  UTF8("obs-chain-initial-signer-inventory-signature/v1") || 0x00 || J(unsigned))
~~~

Unique parsing, descriptor metadata, custodian-root verification, signature, ids, exact cardinality/order, safe names, activation/keyring digests, and the complete authorization set must pass.

### 4.3 Owner-executed private-key readiness attestations

Obsctl and V_PROVISIONER never read another principal's private key. While every writer and watchdog is quiesced, the C0 internal `signer-readiness` program runs once under each matching private-key owner. It securely opens only its exact leaf through root-relative no-follow descriptors, requires the v3/FIX-09 ancestor and leaf law, decodes one no-trailing-byte Ed25519 PKCS#8, derives RFC 8410 public SPKI DER, and computes its key id. It emits no private bytes.

Each completed attestation is RFC 8785 bytes with this exact object; `row_authorizations` is empty only for the witness and `witness_authorization` is null only for a row signer:

~~~json
{
  "schema":"obs-chain-signer-readiness/v1",
  "inventory_id":"<UUID>",
  "activation_id":"<UUID>",
  "activation_manifest_sha256":"<64 lowercase hex>",
  "public_keyring_sha256":"<64 lowercase hex>",
  "challenge_sha256":"<64 lowercase hex>",
  "slot":"<exact inventory slot>",
  "writer_identity":"<exact identity or null>",
  "relative_pk8_path":"<exact inventory path>",
  "principal_uid":"<decimal>",
  "principal_gid":"<decimal>",
  "observed":{"dev":"<decimal>","ino":"<decimal>","mode":"0600","nlink":"1","size":"<positive decimal>"},
  "algorithm":"ed25519",
  "derived_key_id":"<64 lowercase hex>",
  "row_authorizations":[{"table":"<literal>","source":"<literal>","min_chain_seq":"1","max_chain_seq":null}],
  "witness_authorization":{"min_witness_seq":"1","max_witness_seq":null},
  "attested_at_ms":"<positive decimal>",
  "signing_key_id":"<same derived key id>",
  "attestation_signature_base64":"<canonical padded 64-byte signature>"
}
~~~

The challenge is:

~~~text
challenge_sha256 = lowercase_hex(SHA256(
  UTF8("obs-chain-signer-readiness-challenge/v1") || 0x00 ||
  LP(completed_activation_bytes) || LP(completed_keyring_bytes) || LP(completed_inventory_bytes)
))
signature = Ed25519.Sign(SK_signer,
  UTF8("obs-chain-signer-readiness-signature/v1") || 0x00 || J(unsigned_attestation)
)
~~~

`OBSCTL_CHAIN_SIGNER_ATTESTATIONS_INPUT_FD` is another required read-only inherited descriptor carrying `J({schema:"obs-chain-signer-readiness-set/v1",challenge_sha256,entries:[...]})` with entries in the six-slot order. `OBS_CHAIN_SIGNER_ATTESTATION_STALENESS_MS` is a required positive-safe V input with no default. At bootstrap, every age must satisfy `0 <= now_ms-attested_at_ms <=` that input.

The V provisioner independently walks and lstats every named leaf without reading it, checks exact current dev/ino/uid/gid/mode/nlink/type against the inventory and signed attestation, verifies each attestation with the exact keyring SPKI, recomputes every key id, and compares the full generation-one authorization vectors. Missing, duplicate, extra, stale, future, wrong-owner/group/mode/link/path/device/type/algorithm/id/signature/partition/sequence evidence refuses.

All parity checks run after the final quiescence proof and again immediately before the first activation database write. No activation row insert, commit, staging rename, or final `activation.json` publication may precede parity. A failed second check leaves the database singleton empty and final activation file absent. An irreversible activation commit can therefore never precede complete signer readiness.

## 5. Durable audit for every lifecycle invocation

### 5.1 Distinct-principal execution seam

The persistent VNOW-05 paths and modes remain exactly v3; no lifecycle log, key, lock, socket, or state file is added. Lifecycle composition has two processes:

1. the obsctl audit frontend runs only as `OBSCTL_UID`, uses the existing obsctl outbox key, lock, outbox, and V journal, and has no lifecycle publication or admin-database authority;
2. the chain executor runs only as `V_PROVISIONER_UID`, receives lifecycle input/output descriptors and the lifecycle-only admin adapter, and cannot read the obsctl outbox key or append either local history.

They communicate only through a V-launched pair of inherited connected full-duplex descriptors represented by the required positive-decimal `OBSCTL_LIFECYCLE_EXECUTOR_FD` and `OBSCTL_LIFECYCLE_AUDIT_FD`; there is no pathname socket and no default. Each end validates descriptor type/direction, captures it once, and refuses replacement/reuse. The V-owned launcher path, effective uid/gid map, and descriptor numbers are V-later deployment inputs. The local implementation exposes the adapter and distinct-principal probes but performs no live launch.

The executor first requires its effective V principal, authenticates the out-of-band V credential, and performs read-only descriptor/cryptographic preflight. It returns the exact normalized action parameters to the frontend without a lifecycle side effect. The frontend then appends/fsyncs the outbox intent and a V-journal `COMMAND_INTENT` before it releases an execute message carrying the outbox hash. The executor revalidates unchanged descriptors and parameters before its first side effect. Authentication/preflight rejection is returned without a side effect; the frontend still appends one rejection outbox intent, `COMMAND_INTENT`, and `COMMAND_RESULT` using the exact null/non-null rule above. Audit-channel loss before durable intent means no execution. Loss after intent leaves signed intent evidence and a retry-required command, never an unaudited mutation. API, runner, scheduler, daemon, and watchdog principals cannot execute the frontend, inherit either lifecycle descriptor, or reach the executor; attempts change no root, database, outbox, or journal byte.

### 5.2 Exact V-journal lifecycle wire

V3's journal signature/link formulas and derived signing key remain exact. The unsigned schema becomes `obsctl-action-journal/v3`, adds `COMMAND_INTENT`, retains every v3 field, and replaces `effects` with this exact total object:

~~~json
{
  "capture_off":"<PRESENT or ABSENT or UNKNOWN>",
  "kill":"<PRESENT or ABSENT or UNKNOWN>",
  "durability":"<CONFIRMED or UNCONFIRMED>",
  "lifecycle":{
    "phase":"<NOT_APPLICABLE or NONE or OUTPUT_EMITTED or KEYRING_PUBLISHED or DATABASE_ACTIVATION_COMMITTED or PRIVATE_KEY_PUBLISHED or COMPLETE or UNKNOWN>",
    "public_artifact_sha256":"<64 lowercase hex or null>",
    "private_key_id":"<64 lowercase hex or null>",
    "activation_manifest_sha256":"<64 lowercase hex or null>"
  }
}
~~~

For `COMMAND_INTENT`, outcome is `LIFECYCLE_INTENT_DURABLE`, reason `NONE`, marker effects are UNKNOWN, durability CONFIRMED, lifecycle phase NONE, all three result hashes are null, `outbox_hash` is the matching non-null hash, and `database_action_id` is null. A lifecycle `COMMAND_RESULT` also has the matching non-null outbox hash and null database id. For non-lifecycle actions, lifecycle phase is NOT_APPLICABLE and all three hashes are null. `RECONCILED` retains v3's exact receipt law and reports the database id; its local effects use marker UNKNOWN, durability CONFIRMED, and lifecycle phase NOT_APPLICABLE with null hashes. A database receipt never claims a local lifecycle result.

Lifecycle `COMMAND_RESULT` outcomes are exactly:

~~~text
CHAIN_AUTH_REJECTED
CHAIN_KEYRING_INSTALL_APPLIED
CHAIN_KEYRING_INSTALL_ALREADY_APPLIED
CHAIN_KEYRING_INSTALL_REJECTED
CHAIN_KEYRING_INSTALL_DURABILITY_UNKNOWN
CHAIN_ACTIVATION_SNAPSHOT_EMITTED
CHAIN_ACTIVATION_SNAPSHOT_REJECTED
CHAIN_ACTIVATION_SNAPSHOT_OUTPUT_UNKNOWN
CHAIN_BOOTSTRAP_APPLIED
CHAIN_BOOTSTRAP_DB_COMMITTED_FILE_PENDING
CHAIN_BOOTSTRAP_REJECTED
CHAIN_BOOTSTRAP_DURABILITY_UNKNOWN
CHAIN_ROTATE_ROW_APPLIED
CHAIN_ROTATE_ROW_KEYRING_PUBLISHED_KEY_PENDING
CHAIN_ROTATE_ROW_REJECTED
CHAIN_ROTATE_ROW_DURABILITY_UNKNOWN
CHAIN_ROTATE_WITNESS_APPLIED
CHAIN_ROTATE_WITNESS_KEYRING_PUBLISHED_KEY_PENDING
CHAIN_ROTATE_WITNESS_REJECTED
CHAIN_ROTATE_WITNESS_DURABILITY_UNKNOWN
CHAIN_RECOVER_ROW_APPLIED
CHAIN_RECOVER_ROW_KEYRING_PUBLISHED_KEY_PENDING
CHAIN_RECOVER_ROW_REJECTED
CHAIN_RECOVER_ROW_DURABILITY_UNKNOWN
CHAIN_RECOVER_WITNESS_APPLIED
CHAIN_RECOVER_WITNESS_KEYRING_PUBLISHED_KEY_PENDING
CHAIN_RECOVER_WITNESS_REJECTED
CHAIN_RECOVER_WITNESS_DURABILITY_UNKNOWN
~~~

The lifecycle closed reasons are `NONE`, `OS_IDENTITY`, `AUTHENTICATION`, `AUDIT_CHANNEL`, `DESCRIPTOR`, `QUIESCENCE`, `SIGNER_INVENTORY`, `SIGNER_ATTESTATION`, `KEYRING`, `ACTIVATION`, `DATABASE`, `PUBLICATION`, `PRIVATE_PUBLICATION`, `RECOVERY`, and `DURABILITY_UNKNOWN`. V3's non-lifecycle outcomes/reasons remain closed and binding.

Success uses the verb's APPLIED or EMITTED outcome and phase COMPLETE or OUTPUT_EMITTED. Exact-state rerun uses `CHAIN_KEYRING_INSTALL_ALREADY_APPLIED` only for keyring install; every other exact retry completes or reports the same verb's APPLIED outcome without republishing a differing byte. Rejection occurs before a durable state transition and uses phase NONE. A caught failure after keyring publication but before row/witness private-key publication uses the matching `KEYRING_PUBLISHED_KEY_PENDING` and phase KEYRING_PUBLISHED. Bootstrap database commit before activation-file publication uses its exact pending outcome and phase DATABASE_ACTIVATION_COMMITTED. Unclassifiable post-rename/fsync state uses the verb's `DURABILITY_UNKNOWN`/`OUTPUT_UNKNOWN`, phase UNKNOWN, returns nonzero, keeps every writer quiesced, and requires exact-state inspection; it never rolls history back.

For every lifecycle verb, retry first validates the signed intent/result history and actual state. If exactly one lifecycle outbox has a `COMMAND_INTENT` and no `COMMAND_RESULT`, and its action kind plus all three action parameters equal the executor's new read-only preflight, the frontend resumes that same invocation/outbox/action_ref and appends no second intent. Zero matches starts a new invocation; more than one match or a same-kind unresolved record with different supplied input is rejection. Resume accepts only the same complete public candidate digest, derived new private key id where applicable, activation digest, writer identity, generation, and recovery checkpoint. It performs only the missing forward publication and appends the missing result for the original invocation. No lifecycle success, rejection, retry, or partial result changes `D(O)`.

### 5.3 Database reconciliation before and after activation

Lifecycle commands never open a database socket through the audit frontend. Their executor uses the lifecycle admin adapter only for the already defined activation-snapshot/bootstrap operation; it never writes `obs.agent_action`.

The next database-capable status processes all pending outbox records in ascending sequence. If the receipt-bound FIX-09 gateway exposes `PRE_ACTIVATION` and both activation representations are absent, status may reconcile through that exact reviewed mode. If the reviewed production adapter reports preactivation gateway unavailable, status records the closed local database reason `DB_GATEWAY_PREACTIVATION_UNAVAILABLE`, leaves each record pending, and performs no raw insert. Once exact DB/file activation parity exists, status deterministically replays every pending record through `REQUIRED` mode and `D(O)`. A file-only, DB-only, or mismatched activation state rejects reconciliation. This is frozen R06's deferred completion without schema expansion or unsigned escape.

## 6. Lifecycle command preservation and activation ordering

The seven v3 §11 command forms, descriptor privacy, keyring-first rotation/recovery, DB-first activation publication, forward-only history, and no-live-test law remain binding. They are tightened as follows:

- every admitted command obtains its v3 identity, v4 outbox record, and v4 `COMMAND_INTENT` after authentication/read-only preflight and before any lifecycle side effect; an authentication/preflight rejection is itself recorded with no side effect;
- `keyring-install` verifies the signed inventory's exact generation-one set when generation is one; later generations preserve FIX-09 continuity;
- `activation-snapshot` records no activation and cannot substitute for signer readiness;
- `bootstrap` consumes the additional inventory/attestation descriptors and runs §4 parity after quiescence, before staging and immediately before its first database write;
- rotate/recover result records carry the candidate complete-keyring digest and derived new public key id, never private bytes or a private-byte digest;
- every failure after a forward publication retains it and advertises the exact partial phase; retry is same-input forward completion only.

V's out-of-band signing ceremony is not an obsctl invocation. The V-signed inventory, keyring, activation, and recovery checkpoint authenticate supplied authority; the obsctl histories independently prove command invocation and outcome. Neither substitutes for the other.

## 7. Source, package, and import boundaries

V3's source list remains and adds only these future C0 paths:

~~~text
tools/obs-listener/src/obsctl/action-wire.ts
tools/obs-listener/src/obsctl/lifecycle-audit.ts
tools/obs-listener/src/obsctl/lifecycle-executor.ts
tools/obs-listener/src/obsctl/signer-inventory.ts
tools/obs-listener/src/obsctl/signer-readiness.ts
tools/obs-listener/src/obsctl/proof-gap-window.ts
~~~

`tools/obs-listener/package.json` retains the single public `obsctl` bin. `bin/obsctl.mjs` imports only compiled CLI output. `signer-readiness` and `lifecycle-executor` are internal compiled entry modules reached only through the injected C0 adapter/descriptor composition; they are not public package bins, product imports, daemon imports, or watchdog imports.

Kill and arm import graphs remain database-free. Status alone imports the listener database adapter, reconciliation, and reviewed chain subpath. The lifecycle executor alone imports the V admin adapter; it cannot import local-history signing or append code. The audit frontend alone imports local-history append code; it cannot import admin database or publication code. The signer-readiness entry imports secure root/key reading and crypto only, opens one inventory-selected private leaf, writes only its exclusive output descriptor, and has no database, marker, history, product, model, provider, daemon, watchdog, or lifecycle-publication import.

No source outside the v3/v4 declared `tools/obs-listener` package and `fix10-*` tests is authorized. No product path, existing FIX-07 source, migration, FIX-09 authority/source before its reviewed dependency, or standing non-FIX-10 test is changed by FIX-10.

## 8. Capture-first, non-vacuous tests and killed mutants

The future implementation must pin exact selected paths, exact reporter-expanded names, positive counts, raw stdout/stderr/status, zero skip/todo, and three fresh runs before interpreting PASS. These tests add to, and do not replace, every v3 closed-correction test.

Required proof cases include:

- exact checked `W=P+2R+S+F`, exact `Q=W+S`, all five inputs and all six signed gap-window fields;
- each input unset/malformed/nonpositive/unsafe, multiplication/addition overflow, supplied W unequal, W under P, database query/connect/timeout/parse failure;
- immediate refusal for first-party and unclassified rows, specifically `POSTGRES_FAILURE` and `GAP_WRITE_FAILURE`, recent `opened_at`, recent `closed_at`, old open, and positive-skew/future timestamps;
- at `Q-1ms` refusal and at exactly `Q` permission for each timestamp arm, with every other proof conjunct independently positive;
- a missing API/runner/scheduler entry, fresh OFF/DRAINING/SPOOL_ONLY/unknown entry, stale/future evidence, duplicate canary, and one bypass mutant per runtime still refuse.

Required replay cases freeze one STATUS outbox record, make the gateway commit and report unknown, append `STATUS_DB_UNREACHABLE`, restart, and observe byte-identical full gateway arguments, identical payload bytes, original action id, and no action-chain advance. Mutants replacing null with local result, current journal outcome, current time, marker state, or second-attempt status must collide and be killed.

Required signer cases run for each six-slot signer: absent leaf, wrong uid, wrong gid, wrong mode, symlink, hardlink, wrong algorithm, wrong derived id, wrong signature, missing authorization, extra authorization, wrong sequence start, stale/future attestation, and changed inode after attestation. Custodian-root, inventory signature/digest/order/cardinality, generation-one extra/missing signer, and activation/keyring digest mismatches also refuse. Every mutant asserts zero activation insert/commit and zero final activation-file publication.

For each of the seven lifecycle verbs, capture success, authentication/input rejection, exact retry, audit-channel refusal before side effect, and its permitted partial-publication fault. Assert outbox then `COMMAND_INTENT` fsync precedes the first output/file/database transition; runtime-principal attempts reach no executor; preactivation gateway-unavailable retains signed pending records; post-activation status reconciles byte-identical `D(O)` only through the shared gateway. Raw action DML, new grant/role/migration, local-result payload drift, private-byte output, V-private-key load, or watchdog-journal write mutants must die.

## 9. Admission, rollback, and STOP

Fresh independent review must report `SPEC PASS`, `PLAN QUALITY PASS`, and zero P0-P3 for this exact v4 commit before it may be used as authority. That PASS still does not authorize implementation. Implementation begins only after the future exact `FIX09_C35_REVIEWED_REF` receipt passes v3/v4 Task 0.

Before activation, rollback removes only future FIX-10 implementation code from its isolated branch and disposes only explicit temporary fixtures. After activation, every marker, outbox, V journal, database row, keyring, activation document, readiness evidence retained by V, recovery checkpoint, and watchdog journal is forward evidence. No truncate, delete, reset, backfill, re-sign, chain restart, or incompatible code rollback is authorized.

STOP on any v1-v3 byte edit; missing v3 closed correction; source-filtered or short gap query; default/clamped timing; absent signed timing; stale/future/missing runtime acceptance; mutable database payload; different replay arguments; incomplete signer set; same-principal private-key reach; unsigned readiness; activation before parity; lifecycle side effect before signed intent; unaudited lifecycle result; runtime lifecycle execution; raw action write; new persistent path, migration, role, or grant; file/DB activation mismatch; production key/root/database/service act; mutation or quick_arm ON; surviving mutant; dependency/review drift; or unresolved P0-P3.
