# Migration lineage: dev's sealed recipe, then a chain of forward steps

Dev's lineage is sealed: `auth-dev-20261006.json` (the recipe), `verify-effective-capabilities.sql`, 0108 with
`auth-dev-preview-20261006-forward108.json` and `verify-auth108-recovery-bindings.sql`, and `../compatibility/`. Their
bytes never change. Every migration after 0108 is a forward step in an ordered chain
(`packages/db/src/migration-forward-chain.ts`, the same chain code as the NETOPIA branch). The first step on this
branch is the auth database batch, `0109_auth_db_batch.sql`.

`migrate()` runs the base recipe, 0108 and the effective-capability verifier as before, then each pending step in
order: its SQL, its effective-capability verifier, its postcondition evidence, its ledger row and its receipt in
`public.debateai_schema_migration_step`. On a later run the verifier of the last applied step replaces the sealed one,
and applied steps are checked by their receipts (and the last one by its postcondition), never run again.

## The auth database batch

- SQL: `../0109_auth_db_batch.sql` (design: `docs/superpowers/specs/2026-10-09-auth-db-batch-design.md`).
- Manifest: `auth-db-batch-forward.json` — its version, the recipe's SHA-256, `previous` (the step before it: name,
  manifest SHA-256 and effective-verifier SHA-256), its migration, the effective-capability verifier it keeps (it adds
  no billing object, so this is the previous step's verifier, unchanged) and `supplementalVerifier`.
- Supplemental verifier: `verify-auth-db-batch.sql` — run inside the step's postcondition evidence; refuses any drift
  of the security properties the step promises.
- Loader: `packages/db/src/migration-forward-auth-db-batch.ts` (exact keys, digests checked,
  `MIGRATION_FORWARD_AUTH_DB_BATCH_*` refusals, postcondition digest of every function, constraint, column and role it
  creates or replaces).

## Adding the next step

New files only: `../0NNN_<name>.sql`, a manifest whose `previous` names the step before it, a verifier when the step
adds billing relations or functions (copy the previous effective verifier and extend its closed lists; otherwise the
manifest names the previous one), a loader in the style of the existing ones, and one entry appended to `STEPS` in
`packages/db/src/migration-forward-chain.ts`.

## How to renumber this step (when another branch's 0109 merges first)

The owner's ruling: whichever branch merges first keeps 0109; the other renumbers just before its merge. To move the
auth database batch to 0110 behind, for example, `0109_billing_netopia.sql`:

1. `git mv migrations/0109_auth_db_batch.sql migrations/0110_auth_db_batch.sql`.
2. In `packages/db/src/migration-forward-auth-db-batch.ts` set `NAME` to the new file name and `PREVIOUS` to the
   other step's file name.
3. In `auth-db-batch-forward.json` set `migration.name`, set `previous` to the other step's name, manifest SHA-256 and
   effective-verifier SHA-256, and set `verifier` to that same effective verifier (path and SHA-256), then recompute
   `migration.sha256`.
4. In `STEPS` put `loadForwardAuthDbBatch` after the other step's loader.
5. Update the expected chain in `tests/architecture/security-migration-0065.test.ts` and the orphan audit's
   `NATIVE_MIGRATE_MODULE_SHA256` (the hash of `packages/db/src/index.ts`). Every other test reads the name from the
   loader's `AUTH_DB_BATCH_MIGRATION`.

Recompute a digest with `node -e 'console.log(require("node:crypto").createHash("sha256").update(require("node:fs").readFileSync(process.argv[1])).digest("hex"))' <file>`.
