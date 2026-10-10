# Migration lineage: dev's sealed recipe, dev's 0110, then a chain of forward steps

Dev's lineage is sealed: `auth-dev-20261006.json` (the recipe), `verify-effective-capabilities.sql`, 0108 with
`auth-dev-preview-20261006-forward108.json` and `verify-auth108-recovery-bindings.sql`, and `../compatibility/`. Their
bytes never change. Dev's 0110 (#101, account deletion) is merged too and never changes either:
`0110_account_erasure_public_debates.sql`, `auth-dev-preview-20261006-forward110.json`,
`verify-dpd110-erasure-bindings.sql` and its own loader `packages/db/src/migration-forward110.ts`, applied by `migrate()`
right after 0108. 0110 keeps the sealed verifier in force (it runs it after its SQL, and its manifest names it as its
base verifier).

Every migration after 0110 is a forward step in an ordered chain anchored on 0110; 0111 (NETOPIA, PR-54, PR-58) is the
first, the auth DB batch (0112, below) the second and Part C's prices (0113, below) the third. A step is added with new
files only; NNNN is its number, the step before's number plus one:

1. `migrations/NNNN_<name>.sql`: the SQL, forward-only and replayable.
2. A manifest in `lineage/`, shaped like `billing-netopia-forward111.json`: its version, the recipe's SHA-256,
   `previous` = the name, manifest SHA-256 and EFFECTIVE verifier SHA-256 of the step before (after 0113: 0113,
   `billing-price-currencies-forward0113.json`, and `verify-effective-capabilities-111.sql`, which 0112 and 0113 keep),
   and its own migration and verifier. (0111's own `previous` is 0110: `auth-dev-preview-20261006-forward110.json`
   and the sealed `verify-effective-capabilities.sql`.)
3. A new verifier `lineage/verify-effective-capabilities-NNNN.sql` only when the step adds billing relations or
   functions: copy the previous verifier and extend its closed lists. Otherwise the manifest names the previous one
   (as `auth-db-batch-forward.json` does).
4. A loader in `packages/db/src/`, in the style of `packages/db/src/migration-forward111.ts` or
   `packages/db/src/migration-forward-auth-db-batch.ts` (exact keys, fixed version and name, digests checked, its own
   refusal prefix, its postcondition evidence, and a `replayVerifierSql` when it carries checks of its own).
5. One loader entry: append it LAST to `STEPS` in `packages/db/src/migration-forward-chain.ts`.
6. On the preview the step is applied only by the native operator's `apply-and-plan` (with the owner's yes); its `verify`,
   `publish` and every start refuse while the step, or dev's 0110, is pending (`deploy/preview-auth-dev/v1/README.md`).

`migrate()` then runs the base recipe, 0108, the sealed verifier and 0110 as before, then each pending step in order:
its SQL, its verifier, its ledger row and its receipt in `public.debateai_schema_migration_step`. A database at 0108
without 0110 gets 0110, then the chain. On a later run the verifier of the last applied step replaces the sealed one,
and applied steps are checked by their receipts and postconditions, never run again. A chain step recorded without 0110 is refused
(`MIGRATION_LINEAGE_REFUSED FORWARD_CHAIN_BASE`).

## The auth database batch (0112)

The second chain step, after NETOPIA's 0111.

- SQL: `../0112_auth_db_batch.sql` (design: `docs/superpowers/specs/2026-10-09-auth-db-batch-design.md`).
- Manifest: `auth-db-batch-forward.json` — its version, the recipe's SHA-256, `previous` (0111: its name,
  `billing-netopia-forward111.json`'s SHA-256 and the SHA-256 of 0111's effective verifier), its migration, the
  effective-capability verifier it keeps (it adds no billing object, so this is 0111's
  `verify-effective-capabilities-111.sql`, unchanged) and `supplementalVerifier`.
- Supplemental verifier: `verify-auth-db-batch.sql` — run inside the step's postcondition evidence and on every
  replay (below); refuses any drift of the security properties the step promises.
- Loader: `packages/db/src/migration-forward-auth-db-batch.ts` (exact keys, digests checked,
  `MIGRATION_FORWARD_AUTH_DB_BATCH_*` refusals, postcondition digest of every function, constraint, column and role it
  creates or replaces). Its number lives only in the SQL file name, the manifest and the loader's `NAME`/`PREVIOUS`.

## Part C's prices (0113)

The third chain step, after the auth DB batch's 0112 (spec 2026-10-05 §2.16.6). It was built after 0111 and re-chained
after 0112 when it merged with dev at 7db4a7b72, keeping its number, the next free one.

- SQL: `../0113_billing_price_currencies.sql` — the quote's `currency` column, the charge's currency CHECK widened to
  USD, EUR and RON, and CREATED's `data.currency` CHECK.
- Manifest: `billing-price-currencies-forward0113.json` — its version, the recipe's SHA-256, `previous` (0112: its
  name, `auth-db-batch-forward.json`'s SHA-256 and the SHA-256 of the effective verifier 0112 keeps, 0111's
  `verify-effective-capabilities-111.sql`), its migration, and that same verifier as its own (it adds no billing
  relation and no function).
- No supplemental verifier and no `replayVerifierSql`: its checks are its postcondition digest (the quote's column and
  the three CHECKs), which every later `migrate()` compares.
- Loader: `packages/db/src/migration-forward0113.ts` (exact keys, digests checked, `MIGRATION_FORWARD0113_*` refusals),
  appended last to `STEPS`. Its number lives only in the SQL file name, the manifest and the loader's `NAME`/`PREVIOUS`.

## Replay: every applied step keeps its own checks

On a later `migrate()` EVERY applied step is checked by its receipt and by its postcondition digest (not only the
last one: after 0112, 0111's billing objects stay digest-checked), and every applied step that declares one runs its
own `replayVerifierSql` (the batch: `verify-auth-db-batch.sql`); both run again after a run applies new steps, before
COMMIT — so a step's promises (for example the batch's "no runtime may
publish staff alert readiness") are still enforced after other steps are appended. A later step that deliberately
changes something an earlier step's verifier pins must change that verifier through its own reviewed step design; it
cannot silently pass. The effective-capability verifier of the last applied step (after 0113: 0111's, which the batch
and Part C's step keep) still runs at the end of every `migrate()`.

## Merge order: check the preview first

Before merging any branch with a forward step, read the live preview's applied steps (read-only):
`SELECT name FROM public.debateai_schema_migration ORDER BY name` and
`SELECT source_name FROM public.debateai_schema_migration_step`. **Whatever is applied there merges first** and keeps
its number: an applied step can never be renumbered (`migrate()` refuses an unknown applied name,
`MIGRATION_LINEAGE_REFUSED UNKNOWN_APPLIED_NAME`). Otherwise whichever branch merges first keeps its number and the
other renumbers just before its own merge (new file name, manifest `previous` and `migration`, the loader's two
constants, then every exact-chain test). The preview's native verify never applies a pending step (it refuses); only
the native operator's `apply-and-plan` applies one, with the owner's yes.

Recompute a digest with `node -e 'console.log(require("node:crypto").createHash("sha256").update(require("node:fs").readFileSync(process.argv[1])).digest("hex"))' <file>`.
