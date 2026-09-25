# P3-02 production database-principal provisioning

Status: implemented and verified in a disposable PostgreSQL 18 deployment. This
is an operator command, not evidence that any production environment has run it.

## Command

```sh
install -d -m 0700 /run/debateai/support-config
MIGRATION_DATABASE_URL='<short-lived-admin-url>' pnpm db:provision-principals \
  --support-config-credential-file /run/debateai/support-config/operator.json \
  < credentials.json
```

The command reads exactly one bounded JSON envelope from standard input and
prints only `PRODUCTION_DATABASE_PRINCIPALS_READY=18`. It never accepts
credentials through argv and never returns a URL, password, verifier, or human
credential expiry. The required file argument is the sole production
`REGISTER-SUPPORT-PUBLICATION` credential source. Network/HBA/TLS enforcement
remains P3-04.

## Authority prerequisite

`MIGRATION_DATABASE_URL` must authenticate as the exact
`debateai_prod_migrator` session/current principal on database `debateai`. That
principal must own the database and every schema listed for `migration-admin`
in `P3-01-production-database-principals.json`, have exactly the ruled migration
attributes, own no unexpected role membership, and use either non-password
authentication or a database-clock expiry no more than fifteen minutes away.
Provision and cleanup take the same fixed-order session-level global and
support-principal advisory leases. The lease spans validation, database commit,
credential publication or removal, and final attestation so the database and
file state have one serialized order. The lease owner is a dedicated idle
admin session; database work and recovery use separate disposable admin
sessions, so a failed transaction or connection cannot poison recovery while
still owning serialization. The supplied admin pool must therefore admit at
least two concurrent connections.

## Input contract

The top-level object has exactly these fields:

```json
{
  "format": "debateai.production-database-principal-credentials.v1",
  "credentials": [
    {
      "principalId": "api-runtime",
      "databaseUrl": "postgresql://debateai_prod_api_runtime:<url-encoded-secret>@<same-host-and-port>/debateai"
    },
    {
      "principalId": "obs-human",
      "databaseUrl": "postgresql://debateai_obs_human:<url-encoded-secret>@<same-host-and-port>/debateai",
      "validUntil": "<database-clock timestamp between 60 seconds and 15 minutes from now>"
    },
    {
      "principalId": "support-config-operator",
      "databaseUrl": "postgresql://debateai_prod_support_config_operator:<different-url-encoded-secret>@<same-host-and-port>/debateai",
      "validUntil": "<independently checked database-clock timestamp between 60 seconds and 15 minutes from now>"
    }
  ]
}
```

`credentials` must contain exactly the eighteen IDs listed in
`provisioner.managedPrincipalIds` in the P3-01 manifest. Each URL must use the
exact role name, database, host, and port, and carries either no query or one
of the two connection shapes the VPS `pg_hba` admits: `host=` an absolute
socket directory alone (host `localhost`), or `sslmode=verify-full` with an
absolute `sslrootcert` and nothing else (DL7-F6, 2026-09-25). The support-config
operator's URL is published verbatim as the support CLIs' credential, so on the
VPS it carries the socket shape; each decoded password must be 32 to
1,024 UTF-8 bytes and pairwise distinct. Exactly the two human purposes,
`obs-human` and `support-config-operator`, carry `validUntil`; each window is
checked independently against the database clock. The example is a shape
description and intentionally omits the other fifteen governed rows and all
usable secret material.

## Reconciliation guarantees

For each governed LOGIN wrapper the command transactionally:

- creates the role when absent and otherwise reuses it;
- rotates the supplied credential under `password_encryption=scram-sha-256`;
- sets exact LOGIN/INHERIT/NOINHERIT and non-elevated attributes;
- sets `VALID UNTIL '-infinity'` — present, unusable — on every principal whose
  connection purposes in the manifest are all `REQUIRED_NOT_WIRED` (V-20, six on
  2026-09-25), the human JIT window on the two human principals, and no expiry
  on every other;
- revokes every unexpected direct membership and every member of the wrapper;
- revokes direct database, schema, table, sequence, column, function, and
  procedure privileges using catalog-derived, identifier-safe statements;
- restores exact `ADMIN false`, `INHERIT true`, `SET true` grant options;
- clears global and per-database role settings;
- rejects ownership and effective `pg_*` membership;
- reattests the privileged `pg_authid` SCRAM verifier, expiry, exact direct and
  effective capabilities, zero members, zero settings, and zero ownership; and
- commits all eighteen roles together or rolls the transaction back.

Only after the role transaction succeeds, the command publishes the support
credential as this exact compact JSON (no whitespace or trailing newline):

```json
{"databaseUrl":"postgresql://debateai_prod_support_config_operator:<url-encoded-secret>@<same-host-and-port>/debateai","validUntil":"<canonical-UTC-timestamp>"}
```

The target must be beneath an owned, non-symlink, mode-`0700` directory. The
writer creates a same-directory mode-`0600` file with exclusive creation,
flushes it, and atomically renames it. When a safe target already exists, the
writer first creates an exclusive same-directory hard-link rollback backup and
retains its bytes and mode until final database and file attestations pass.
Publish, rollback, and owned-file removal each fsync the parent directory.

Any failure after the role transaction commits enters serialized recovery
before the caller can observe rejection: the support operator is durably
changed to `NOLOGIN`, every session for that role is terminated and recounted,
and the invocation restores the prior target byte-for-byte or removes its own
new target when none existed. Query, commit, connection, termination, census,
rename, unlink, and parent-directory fsync failures retry on fresh work
sessions with capped backoff for as long as the state is unsafe; there is no
attempt budget that can release the lease early. After recovery, database and
filesystem invariants are re-attested together, then the caller receives the
original failure plus truthful recovery context.

Each operation also owns an empty mode-`0600` recovery marker in the same
mode-`0700` custody directory. The marker and its removal are parent-fsynced
and contain no credential or secret. If the PostgreSQL lease-owner connection
is lost, a subsequent provision or cleanup can acquire the advisory locks but
must remain quarantined on the marker until the original in-process recovery
makes the state safe and durably removes it. A process that dies while unsafe
leaves the marker fail-closed for operator investigation. Failure cleanup
removes a temporary or backup file only when this invocation created and still
owns that exact device/inode; an exclusive-create collision is preserved
byte-for-byte.

The production support-configuration CLI accepts only that exact two-field, compact file and
never consults an environment variable, the migration URL, `obs-human`, or the
development eleven-row file. It rejects a symlink, hard link, wrong owner or mode,
unsafe parent, file larger than 4 KiB, non-canonical timestamp, expired or
out-of-window credential, endpoint/role/database drift, query/fragment fields,
and malformed or secret-bearing extra fields. Each operation creates one fresh
single-connection pool whose connect, statement, and query deadlines are
strictly shorter than the remaining credential validity, and closes both the
client and pool.

`pnpm support:status` additionally requires a separate private rotated service
credential for `api-support`; it never gives the JIT configuration operator
support-table access. Supply the JIT file above with `--credential-file` and an
exact one-entry v1 credential envelope with
`--support-data-credential-file`. The latter contains only `api-support` and its
`debateai_prod_api_support` URL, is mode `0600` beneath an owned mode `0700`
directory, and has no trailing newline. The command opens distinct bounded
configuration and data connections and closes both on success or failure.

## Support configuration rollout and forward-only rollback

The deployed application register and the active support register are separate
decimal-text identifiers. The deployment receipt is the sole source of the
explicit deployed `REGISTER_VERSION`; neither the support selector nor a later
GENERAL publication changes it. An old binary must receive an explicit immutable
`REGISTER_VERSION` from its own deployment receipt. It may not discover a
current or latest version and may not obtain a mutable substitute from another
environment value.

Use this reader-first production order. Each numbered step is a stop point; do
not continue when its validation fails.

1. Apply `migrations/0055_register_support_publication.sql` with the governed
   migrator. This additive migration creates the allocator, closed publication
   functions, marker validation, and grants. Applying it alone creates no
   support configuration and selects no support register.
2. Validate immutable v1/v4 history and the allocator. Confirm the exact v1
   snapshot SHA-256
   `8fde270cae50e99ea7ff723f50c26a64833a72347838ed4aee0eb9cbfea3104b`
   and deterministic development v4 snapshot SHA-256
   `120bdfea9776cff519113d915694f02b1e4302a14a4282c8e6272a0bf09a5e96`,
   unchanged row/value/source bytes, null future metadata on both historical
   versions, and an allocator next value strictly above every stored version.
3. Deploy schema-1 support readers while support remains uninitialized. Verify
   they fail closed and that all other consumers still use the explicit
   deployed `REGISTER_VERSION`.
4. Provision and test the support-configuration operator using the bounded
   private credential procedure above. Prove it can execute only the support
   publisher and status reader, and that the API and support service never
   receive its credential.
5. Publish the complete 16-key production snapshot disabled from the explicit
   deployed base. The corresponding disposable-development initialization uses
   the same 16 keys with only `support_enabled` set to `true`; production sets
   it to `false`. A publication with 15 keys is invalid. Record a non-secret
   source reference and a fresh publication UUID before starting the
   transaction.

   Run the existing bounded credential loader and shipped public publication
   port directly. Replace the four explicit arguments with the governed private
   file, deployed receipt version, freshly generated UUID, and non-secret
   change reference. The example deliberately has no implicit version source:

<!-- SUPPORT-CONFIG-INITIALIZER-BEGIN -->
```sh
node --import tsx --input-type=module - \
  /run/debateai/support-config/operator.json \
  4 \
  018e51cd-6ba7-4f42-8cb6-6b8292f2e031 \
  deployment:production-initial-off:change-2026-09-06 <<'TS'
import type { Pool, PoolClient } from "pg";
import {
  createPostgresRegisterPublicationPort,
  parseCanonicalRegisterJson,
  parseRegisterVersionText,
  SUPPORT_CONFIGURATION_KEYS,
  type SupportPublicationReceipt
} from "./packages/register/src/index.ts";
import { withProductionSupportConfigCliConnection } from
  "./apps/runner/src/support-config-cli-credentials.ts";

const [credentialFilePath, deployedBaseText, publicationId, sourceRef] =
  process.argv.slice(2);
if (!credentialFilePath || !deployedBaseText || !publicationId || !sourceRef) {
  throw new TypeError("SUPPORT_CONFIG_INITIALIZER_ARGUMENT_INVALID");
}
const values = Object.freeze<Record<string, string>>({
  support_enabled: "false",
  support_model_ref: '"development:claude-cli"',
  support_relay_concurrency: "2",
  support_daily_call_cap: "500",
  support_limit_anon_msgs_10m: "20",
  support_limit_anon_msgs_24h: "100",
  support_limit_anon_sessions_1h: "5",
  support_limit_session_msgs: "40",
  support_limit_msg_chars: "2000",
  support_limit_account_msgs_10m: "60",
  support_limit_account_msgs_24h: "300",
  support_queue_depth: "10",
  support_lock_after_injections: "3",
  support_ip_cooldown_minutes: "60",
  support_retention_policy: '"keep"',
  support_retention_ratified_by: "null"
});
const baseRegisterVersion = parseRegisterVersionText(deployedBaseText);
const receipt: SupportPublicationReceipt =
  await withProductionSupportConfigCliConnection(credentialFilePath, async (client) => {
    const boundedClient = {
      query: client.query.bind(client),
      release() {}
    } as unknown as PoolClient;
    const boundedOperatorPool = {
      connect: async () => boundedClient
    } as unknown as Pool;
    return createPostgresRegisterPublicationPort(boundedOperatorPool).publishSupport({
      publicationId,
      baseRegisterVersion,
      expectedSupportRegisterVersion: null,
      schemaVersion: 1,
      patch: SUPPORT_CONFIGURATION_KEYS.map((key) => ({
        key,
        valueJsonText: parseCanonicalRegisterJson(Buffer.from(values[key]!))
      })),
      sourceRef
    });
  });
const commitAcknowledgedAt = new Date();
const safeReceipt = {
  registerVersion: receipt.registerVersion,
  baseRegisterVersion: receipt.baseRegisterVersion,
  publicationId: receipt.publicationId,
  publicationKind: receipt.publicationKind,
  requestSha256: receipt.requestSha256,
  snapshotSha256: receipt.snapshotSha256,
  rowCount: receipt.rowCount,
  recordedAt: receipt.recordedAt.toISOString(),
  previousSupportRegisterVersion: receipt.previousSupportRegisterVersion,
  supportSnapshotSha256: receipt.supportSnapshotSha256,
  changedKeys: receipt.changedKeys,
  sourceRef,
  commitAcknowledgedAt: commitAcknowledgedAt.toISOString()
} satisfies Record<string, unknown>;
process.stdout.write(`SUPPORT_CONFIGURATION_INITIALIZED=${JSON.stringify(safeReceipt)}\n`);
TS
```
<!-- SUPPORT-CONFIG-INITIALIZER-END -->

   The bounded wrapper validates the dedicated private credential, creates one
   fresh single-connection pool with connect/statement/query deadlines shorter
   than its validity, and closes it. `publishSupport()` owns the explicit READ
   COMMITTED transaction and resolves only after `COMMIT`; therefore the
   separately captured acknowledgement follows the commit promise. The output
   contains only the typed receipt, source reference, and acknowledgement time.
   C1 will later wrap this same public port in the user-facing support CLI; it is
   not required for this initialization.
6. Capture the publication receipt and post-COMMIT acknowledgement only after
   the commit promise resolves. Keep the UUID, source reference, request hash,
   full snapshot hash, support-subset hash, database `recorded_at`, and
   post-COMMIT acknowledgement as distinct values. `recorded_at` is recorded
   time, not commit time. Verify the active support version against the receipt;
   verify the deployed version is still the explicit deployment value.

A later unrelated GENERAL publication has no `supportActivation` marker. It is
therefore ineligible for support selection and changes neither the active
support version nor the deployed version. Normal rollback is forward-only:
publish a new SUPPORT_CONFIGURATION version, higher than the active version,
containing the prior desired values and a new self-binding marker. Recheck every
older row/value/source byte after publication. Never alter prior rows, seals, or
markers, and never remove the additive schema.

For emergency containment, publish OFF first and wait for the distinct
post-COMMIT acknowledgement. Confirm status reports the new disabled active
support version. Then set the operator `NOLOGIN`, terminate established
support-operator sessions, and remove the credential file with the dedicated
cleanup command below; unrelated sessions must survive. Only after containment
is fully attested may a prior binary be deployed, and that binary still receives
its own explicit `REGISTER_VERSION`.

The status command renders these fields in this order; rows are sorted by UTF-8
key and retain their individual source references:

```text
deployed_register_version: <decimal-text>
active_support_register_version: <decimal-text>
support_schema_version: 1
marker_recorded_at: <database-timestamp> (recorded time, not commit time)
base_register_version: <decimal-text>
publication_uuid: <uuid>
changed_keys: <sorted-keys>
source_ref: <non-secret-reference>
request_sha256: <lowercase-hex>
support_snapshot_sha256: <lowercase-hex>
snapshot_sha256: <lowercase-hex>
support_rows: <16-sorted-key/value/source-ref-rows>
refresh_deadline_ms: 1000
calls_today: <count>
kb_status: <state>
relay_state: <state>
retention_state: <state>
```

Status never emits a credential, secret, password, connection URL, token,
transcript, IP address, identity, or raw relay response. It never labels marker
time as a commit timestamp.

## Operator cleanup

`VALID UNTIL` blocks new authentication but does not terminate an already
established PostgreSQL session. Revoke the operator and remove its credential
with the dedicated cleanup mode:

```sh
MIGRATION_DATABASE_URL='<short-lived-admin-url>' pnpm db:provision-principals \
  --cleanup-support-config-operator \
  --support-config-credential-file /run/debateai/support-config/operator.json
```

Cleanup revalidates the same private file and endpoint, takes the governed
session-level leases, commits
`debateai_prod_support_config_operator NOLOGIN` so it is externally visible,
then terminates only that role's established sessions with a bounded wait,
refreshes PostgreSQL's statistics snapshot, and confirms zero remaining
sessions. It next rechecks that the credential file was not replaced, unlinks
it, and attests the final `NOLOGIN`, zero-session, absent-file state before
releasing the leases. Credential removal fsyncs the parent directory before
the terminal absence attestation. Success prints only
`PRODUCTION_SUPPORT_CONFIG_OPERATOR_CLEANED=<terminated-count>`.

The development-only evaluator menu is separately bound to
`debateai_dev_evaluator_api`, a member only of `debateai_evaluator_api`, through
`EVALUATOR_DEV_MENU_DATABASE_URL`. It is not one of the production wrappers.

## Verification boundary

`tests/integration/production-database-principals.test.ts` creates a fresh
database owned by a finite-lived migration principal, applies all migrations,
and proves first creation, idempotent replay, actual LOGINs, exact capability
sets, SCRAM storage, reserved-character password handling, global and
per-database drift repair, unsafe authority/expiry/duplicate refusal, and
no-secret CLI output. It also proves strict production-file custody, disjoint
development/production parsers, fresh bounded connection closure, expiry not
killing an existing session, direct and transitive ACL drift removal, boundary
authentication refusal, multiple-session termination without collateral
termination, serialized provision/cleanup schedules, exact lease release on
failures, collision preservation, own-temp cleanup, zero-session confirmation,
credential removal, post-publication database/file attestation failures with
and without a prior target, compensation query/commit/restore/removal failures,
authentication during compensation, persistent recovery beyond the former
retry budget, fresh-client recovery after connection poisoning, durable
restore/removal sync, recovery-owner connection loss and marker quarantine,
and adjacent successful replacement. The
test does not claim the command has been executed in a real production
environment.
