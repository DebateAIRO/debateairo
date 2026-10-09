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

## Replay: every applied step keeps its own checks

On a later `migrate()` each applied step is checked by its receipt, the last one also by its postcondition digest,
and EVERY applied step that declares one runs its own `replayVerifierSql` (the batch: `verify-auth-db-batch.sql`)
— so the batch's promises (for example "no runtime may publish staff alert readiness") are still enforced after other
steps are appended. A later step that deliberately changes something an earlier step's verifier pins must change that
verifier through its own reviewed step design; it cannot silently pass. NETOPIA's and every other copy of
`migration-forward-chain.ts` needs the same few lines (`replayVerifierSql` on `ForwardStepPlan`, the loop in
`applyForwardChain`).

## Adding the next step

New files only: `../0NNN_<name>.sql`, a manifest whose `previous` names the step before it, a verifier when the step
adds billing relations or functions (copy the previous effective verifier and extend its closed lists; otherwise the
manifest names the previous one), a loader in the style of the existing ones, and one entry appended to `STEPS` in
`packages/db/src/migration-forward-chain.ts`.

## Merge order: check the preview first

Before merging any branch with a forward step, read the live preview's applied steps (read-only):
`SELECT name FROM public.debateai_schema_migration ORDER BY name` and
`SELECT source_name FROM public.debateai_schema_migration_step`. **Whatever is applied there merges first** and keeps
its number: an applied step can never be renumbered (`migrate()` refuses an unknown applied name,
`MIGRATION_LINEAGE_REFUSED UNKNOWN_APPLIED_NAME`). Otherwise whichever branch merges first keeps its number and the
other renumbers just before its own merge. The preview's native verify never applies a pending step (it refuses);
only the native operator's `apply-and-plan` applies one.

## How to renumber this step (one or more steps merged before it)

Order as of 2026-10-09 evening: PR #101 (account deletion) is on dev as **0110**, applied right after 0108 as its own
`plan.forward110` (`applyForward110` inside `migrate()`), NOT as a `plan.forwardChain` step; NETOPIA payments follows as
**0111** (renumbered from 0109; `lineage/billing-netopia-forward*.json`, `packages/db/src/migration-forward*.ts`,
`lineage/verify-effective-capabilities-*.sql`); this batch becomes **0112**, chained after NETOPIA's step. The recipe
is the same for any number of preceding steps; "the step before" below is the LAST step already on dev (for that
order: NETOPIA's 0111). If 0110 is still a separate `forward110` when this merges, the batch's `previous` anchor is
whatever the chain's first-step anchor is on dev then (read `loadForwardChain`'s `first` argument in
`migration-lineage.ts`), and the verify guard (`pendingForwardSteps`) must also list a pending `plan.forward110` —
take NETOPIA's version of `deploy/preview-auth-dev/v1/verify-native.ts` (same names) when it does.

1. `git mv migrations/0109_auth_db_batch.sql migrations/0112_auth_db_batch.sql`.
2. In `packages/db/src/migration-forward-auth-db-batch.ts` set `NAME` to the new file name and `PREVIOUS` to the
   step before's file name.
3. In `auth-db-batch-forward.json` set `migration.name`; set `previous` to the step before's name, its manifest
   SHA-256 and its EFFECTIVE verifier SHA-256 (if the step before keeps an earlier verifier, that earlier one's
   digest — read it from the step before's own manifest `verifier.sha256`); set `verifier` to that same effective
   verifier (path and SHA-256), then recompute `migration.sha256`. The batch adds no billing object, so it never
   ships its own effective verifier.
4. Conflicts to expect, all add/add: `packages/db/src/migration-forward-chain.ts` — keep every import line and put
   `loadForwardAuthDbBatch` LAST in `STEPS`; this `README.md` — keep both sections; `tests/support/shipped-corpus.manifest.txt`
   — keep every `packages/db/src/migration-forward*.ts` line, sorted; `tools/orphan-audit/src/index.ts` — the
   `NATIVE_MIGRATE_MODULE_SHA256` line must be the hash of the MERGED `packages/db/src/index.ts`, recomputed.
5. Tests to recheck after the merge: `tests/architecture/security-migration-0065.test.ts` and
   `tests/integration/preview-auth-preservation.test.ts` read the chain from the loader and only require the batch to
   be present and last (no edit needed unless the order changes); `tests/architecture/migration-forward-auth-db-batch.test.ts`
   reads the name from `AUTH_DB_BATCH_MIGRATION`. The OTHER branches' exact-chain tests — NETOPIA's
   `tests/architecture/migration-forward-chain.test.ts` (~43) and `tests/integration/billing-netopia-migration.test.ts`
   (~478-556), and #101's equivalents — expect their step to be last or the chain to be exactly theirs; the
   later-merging branches update them so the full sequence (0110, 0111, 0112) is expected.
6. Prose: say "the auth DB batch step", never its number, outside the SQL file name, the manifest and the two loader
   constants.

Recompute a digest with `node -e 'console.log(require("node:crypto").createHash("sha256").update(require("node:fs").readFileSync(process.argv[1])).digest("hex"))' <file>`.
