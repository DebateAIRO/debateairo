# P3-02 production database-principal provisioning

Status: implemented and verified in a disposable PostgreSQL 18 deployment. This
is an operator command, not evidence that any production environment has run it.

## Command

```sh
MIGRATION_DATABASE_URL='<short-lived-admin-url>' pnpm db:provision-principals < credentials.json
```

The command reads exactly one bounded JSON envelope from standard input and
prints only `PRODUCTION_DATABASE_PRINCIPALS_READY=16`. It never accepts
credentials through argv and never returns a URL, password, verifier, or human
credential expiry. Persistent credential-file custody and rotation are P3-03;
network/HBA/TLS enforcement is P3-04.

## Authority prerequisite

`MIGRATION_DATABASE_URL` must authenticate as the exact
`debateai_prod_migrator` session/current principal on database `debateai`. That
principal must own the database and every schema listed for `migration-admin`
in `P3-01-production-database-principals.json`, have exactly the ruled migration
attributes, own no unexpected role membership, and use either non-password
authentication or a database-clock expiry no more than fifteen minutes away.
The command takes a transaction advisory lock before reconciling anything.

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
    }
  ]
}
```

`credentials` must contain exactly the sixteen IDs listed in
`provisioner.managedPrincipalIds` in the P3-01 manifest. Each URL must use the
exact role name, database, host, and port; each decoded password must be 32 to
1,024 UTF-8 bytes and pairwise distinct. Only `obs-human` carries
`validUntil`. The example is a shape description and intentionally omits the
other fourteen governed rows and all usable secret material.

## Reconciliation guarantees

For each governed LOGIN wrapper the command transactionally:

- creates the role when absent and otherwise reuses it;
- rotates the supplied credential under `password_encryption=scram-sha-256`;
- sets exact LOGIN/INHERIT/NOINHERIT and non-elevated attributes;
- revokes every unexpected direct membership and every member of the wrapper;
- restores exact `ADMIN false`, `INHERIT true`, `SET true` grant options;
- clears global and per-database role settings;
- rejects ownership and effective `pg_*` membership;
- reattests the privileged `pg_authid` SCRAM verifier, expiry, exact direct and
  effective capabilities, zero members, zero settings, and zero ownership; and
- commits all sixteen roles together or rolls the transaction back.

The development-only evaluator menu is separately bound to
`debateai_dev_evaluator_api`, a member only of `debateai_evaluator_api`, through
`EVALUATOR_DEV_MENU_DATABASE_URL`. It is not one of the production wrappers.

## Verification boundary

`tests/integration/production-database-principals.test.ts` creates a fresh
database owned by a finite-lived migration principal, applies all migrations,
and proves first creation, idempotent replay, actual LOGINs, exact capability
sets, SCRAM storage, reserved-character password handling, global and
per-database drift repair, unsafe authority/expiry/duplicate refusal, and
no-secret CLI output. The test does not claim the command has been executed in
a real production environment.
