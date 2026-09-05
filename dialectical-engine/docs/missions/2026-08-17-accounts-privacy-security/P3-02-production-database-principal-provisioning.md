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
prints only `PRODUCTION_DATABASE_PRINCIPALS_READY=17`. It never accepts
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

`credentials` must contain exactly the seventeen IDs listed in
`provisioner.managedPrincipalIds` in the P3-01 manifest. Each URL must use the
exact role name, database, host, and port; each decoded password must be 32 to
1,024 UTF-8 bytes and pairwise distinct. Exactly the two human purposes,
`obs-human` and `support-config-operator`, carry `validUntil`; each window is
checked independently against the database clock. The example is a shape
description and intentionally omits the other fourteen governed rows and all
usable secret material.

## Reconciliation guarantees

For each governed LOGIN wrapper the command transactionally:

- creates the role when absent and otherwise reuses it;
- rotates the supplied credential under `password_encryption=scram-sha-256`;
- sets exact LOGIN/INHERIT/NOINHERIT and non-elevated attributes;
- revokes every unexpected direct membership and every member of the wrapper;
- revokes direct database, schema, table, sequence, column, function, and
  procedure privileges using catalog-derived, identifier-safe statements;
- restores exact `ADMIN false`, `INHERIT true`, `SET true` grant options;
- clears global and per-database role settings;
- rejects ownership and effective `pg_*` membership;
- reattests the privileged `pg_authid` SCRAM verifier, expiry, exact direct and
  effective capabilities, zero members, zero settings, and zero ownership; and
- commits all seventeen roles together or rolls the transaction back.

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

The production support CLI accepts only that exact two-field, compact file and
never consults an environment variable, the migration URL, `obs-human`, or the
development ten-row file. It rejects a symlink, hard link, wrong owner or mode,
unsafe parent, file larger than 4 KiB, non-canonical timestamp, expired or
out-of-window credential, endpoint/role/database drift, query/fragment fields,
and malformed or secret-bearing extra fields. Each operation creates one fresh
single-connection pool whose connect, statement, and query deadlines are
strictly shorter than the remaining credential validity, and closes both the
client and pool.

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
