# Migration lineage: dev's sealed recipe, then a chain of forward steps

Dev's lineage is sealed: `auth-dev-20261006.json` (the recipe), `verify-effective-capabilities.sql`, 0108 with
`auth-dev-preview-20261006-forward108.json` and `verify-auth108-recovery-bindings.sql`, and `../compatibility/`. Their
bytes never change. Every migration after 0108 is a forward step in an ordered chain; 0109 (NETOPIA, PR-54) is the first.

A step after 0108 is added with new files only. Worked example: 0109; a later 0110 follows it.

1. `migrations/0110_<name>.sql`: the SQL, forward-only and replayable.
2. `lineage/<name>-forward110.json`, shaped like `billing-netopia-forward109.json`: its version, the recipe's SHA-256,
   `previous` = the name, manifest SHA-256 and verifier SHA-256 of the step before (for 0110: 0109,
   `billing-netopia-forward109.json`, `verify-effective-capabilities-109.sql`), and its own migration and verifier.
3. A new verifier `lineage/verify-effective-capabilities-110.sql` only when the step adds billing relations or
   functions: copy the previous verifier and extend its closed lists. Otherwise the manifest names the previous one.
4. `packages/db/src/migration-forward110.ts`, in the style of `packages/db/src/migration-forward109.ts` (exact keys,
   fixed version and name, digests checked, `MIGRATION_FORWARD110_*` refusals, its postcondition evidence).
5. One loader entry: append `loadForward110` to `STEPS` in `packages/db/src/migration-forward-chain.ts`.
6. On the preview the step is applied only by the native operator's `apply-and-plan` (with the owner's yes); its `verify`,
   `publish` and every start refuse while the step is pending (`deploy/preview-auth-dev/v1/README.md`).

`migrate()` then runs the base recipe, 0108 and the sealed verifier as before, then each pending step in order: its SQL,
its verifier, its ledger row and its receipt in `public.debateai_schema_migration_step`. On a later run the verifier of
the last applied step replaces the sealed one, and applied steps are checked by their receipts, never run again.
