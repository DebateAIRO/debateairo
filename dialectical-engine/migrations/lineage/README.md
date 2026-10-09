# Migration lineage: dev's sealed recipe, dev's 0110, then a chain of forward steps

Dev's lineage is sealed: `auth-dev-20261006.json` (the recipe), `verify-effective-capabilities.sql`, 0108 with
`auth-dev-preview-20261006-forward108.json` and `verify-auth108-recovery-bindings.sql`, and `../compatibility/`. Their
bytes never change. Dev's 0110 (#101, account deletion) is merged too and never changes either:
`0110_account_erasure_public_debates.sql`, `auth-dev-preview-20261006-forward110.json`,
`verify-dpd110-erasure-bindings.sql` and its own loader `packages/db/src/migration-forward110.ts`, applied by `migrate()`
right after 0108. 0110 keeps the sealed verifier in force (it runs it after its SQL, and its manifest names it as its
base verifier).

Every migration after 0110 is a forward step in an ordered chain anchored on 0110; 0111 (NETOPIA, PR-54, PR-58) is the
first. A step is added with new files only. Worked example: 0111; the next step, 0112 (the auth DB batch), follows it.

1. `migrations/0112_<name>.sql`: the SQL, forward-only and replayable.
2. `lineage/<name>-forward112.json`, shaped like `billing-netopia-forward111.json`: its version, the recipe's SHA-256,
   `previous` = the name, manifest SHA-256 and verifier SHA-256 of the step before (for 0112: 0111,
   `billing-netopia-forward111.json`, `verify-effective-capabilities-111.sql`), and its own migration and verifier.
   (0111's own `previous` is 0110: `auth-dev-preview-20261006-forward110.json` and the sealed
   `verify-effective-capabilities.sql`.)
3. A new verifier `lineage/verify-effective-capabilities-112.sql` only when the step adds billing relations or
   functions: copy the previous verifier and extend its closed lists. Otherwise the manifest names the previous one.
4. `packages/db/src/migration-forward112.ts`, in the style of `packages/db/src/migration-forward111.ts` (exact keys,
   fixed version and name, digests checked, `MIGRATION_FORWARD112_*` refusals, its postcondition evidence).
5. One loader entry: append `loadForward112` to `STEPS` in `packages/db/src/migration-forward-chain.ts`.
6. On the preview the step is applied only by the native operator's `apply-and-plan` (with the owner's yes); its `verify`,
   `publish` and every start refuse while the step, or dev's 0110, is pending (`deploy/preview-auth-dev/v1/README.md`).

`migrate()` then runs the base recipe, 0108, the sealed verifier and 0110 as before, then each pending step in order:
its SQL, its verifier, its ledger row and its receipt in `public.debateai_schema_migration_step`. A database at 0108
without 0110 gets 0110, then the chain. On a later run the verifier of the last applied step replaces the sealed one,
and applied steps are checked by their receipts, never run again. A chain step recorded without 0110 is refused
(`MIGRATION_LINEAGE_REFUSED FORWARD_CHAIN_BASE`).
