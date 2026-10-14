# Migration lineage: dev's sealed recipe, dev's 0110, then a chain of forward steps

Dev's lineage is sealed: `auth-dev-20261006.json` (the recipe), `verify-effective-capabilities.sql`, 0108 with
`auth-dev-preview-20261006-forward108.json` and `verify-auth108-recovery-bindings.sql`, and `../compatibility/`. Their
bytes never change. Dev's 0110 (#101, account deletion) is merged too and never changes either:
`0110_account_erasure_public_debates.sql`, `auth-dev-preview-20261006-forward110.json`,
`verify-dpd110-erasure-bindings.sql` and its own loader `packages/db/src/migration-forward110.ts`, applied by `migrate()`
right after 0108. 0110 keeps the sealed verifier in force (it runs it after its SQL, and its manifest names it as its
base verifier).

Every migration after 0110 is a forward step in an ordered chain anchored on 0110; 0111 (NETOPIA, PR-54, PR-58) is the
first, the auth DB batch (0112, below) the second, Part C's prices (0113, below) the third, role rotation (0114,
below) the fourth, the data export (0115, V-41) the fifth, the debate shape's map (0116, below) the sixth, the language check's site cost (0117, below) the seventh and the reclaim resume (0118, below) the eighth. A step is added with new files only; NNNN is its number, the step before's number plus one:

1. `migrations/NNNN_<name>.sql`: the SQL, forward-only and replayable.
2. A manifest in `lineage/`, shaped like `billing-netopia-forward111.json`: its version, the recipe's SHA-256,
   `previous` = the name, manifest SHA-256 and EFFECTIVE verifier SHA-256 of the step before (after 0118: 0118,
   `reclaim-resume-forward0118.json`, and `verify-effective-capabilities-111.sql`, which 0112 to 0118 keep),
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
  appended last to `STEPS`. Unlike the batch's, its number is in many places: the SQL's file name, header comment,
  `$billing_0113_requires$` guard label and `BILLING_0113_REQUIRES_0111` refusal; the manifest's file name and
  `version`; the loader's file name, its `loadForward0113` (imported by `migration-forward-chain.ts`), its `NAME`,
  `VERSION` and `MANIFEST_PATH`, and the `MIGRATION_FORWARD0113_` prefix; and the tests that pin the chain. A renumber
  follows C1's recipe: rename every file and constant that carries the number, recompute the manifest's migration
  digest, and re-pin the chain lists.

## Role rotation (0114)

The fourth chain step, after Part C's 0113 (spec `docs/superpowers/specs/2026-10-11-role-rotation-design.md`, Part 3):
`0114_role_rotation.sql`, `role-rotation-forward0114.json`, `packages/db/src/migration-forward0114.ts`. It creates
`core.run_role_rotation` (insert-once, immutable; the four picked roles and the eligible model ids), adds
`serve.answer_story.storyteller_repairs`, and gives `serve.serve_disclosure` a fallback reason per role
(`writer_fallback_reason`, `checker_fallback_reason`: MONEY or ROLE_UNAVAILABLE), replacing 0076's one reason rule with
the per-role one (Task 11). No billing relation or function, so `verify-effective-capabilities-111.sql` stays the
verifier in force; no `replayVerifierSql`: its checks are its postcondition digest (the pin table's 16 columns, the
story column, the two disclosure columns and the twelve CHECKs, with 0076's replaced rule absent). If `origin/dev` takes 0114 first, renumber this step at merge time
(its manifest, loader name and `previous` follow), as C1's recipe above says.

## The debate shape map (0116)

The sixth chain step, after the data export's 0115 (spec `docs/superpowers/specs/2026-10-12-debate-shape-design.md`
§3.4, plan `docs/superpowers/plans/2026-10-12-debate-shape-phase2b.md` Task 7): `0116_debate_shape_map.sql`,
`debate-shape-map-forward0116.json`, `packages/db/src/migration-forward0116.ts` (`loadForward0116`, appended last to
`STEPS`, `MIGRATION_FORWARD0116_*` refusals). It creates three append-only tables (UPDATE and DELETE refused, TRUNCATE
guarded, `debateai_runtime` may SELECT and INSERT, `debateai_replay` may SELECT): `core.map_item` and `core.map_choice`,
content carriers in 0063's mechanism (their own attestation and plaintext guards, 0040's erasure barrier), and
`core.map_position`, ids and codes only, which carries 0040's erasure barrier too, and whose root is a node of the same
run (foreign key `(run_id, root_node_id)` to `core.node(run_id, node_id)`). Every id in a readable column is code-minted
(ruling T7-PRIV): `map_item.angle_id` is `g1`..`g7`, `map_position.answer_id` `a1`..`a4` (packages/map renames the AIs'
own ids at its boundary; they stay only in the encrypted raw replies). No billing relation or function, so
`verify-effective-capabilities-111.sql` stays the verifier in force; no `replayVerifierSql`: its checks are its
postcondition digest (the three tables' columns, constraints, indexes, triggers and ACLs, and the four guard
functions' definitions and ACLs). Known limit: `maker` keeps 0069's code-token rule (no whitespace), so a maker with a
space needs a later step before it joins a provider set. If `origin/dev` takes 0116 first, renumber this step at merge
time (its manifest, loader name and `previous` follow), as C1's recipe above says.

## The language check's site cost (0117)

The seventh chain step, after the debate shape map's 0116 (the question-language spec 2026-10-13, kept outside this
repository; plan `docs/superpowers/plans/2026-10-13-debate-shape-phase2-language.md` Task 19): `0117_language_check_spend.sql`,
`language-check-spend-forward0117.json`, `packages/db/src/migration-forward0117.ts` (`loadForward0117`, appended last
to `STEPS`, `MIGRATION_FORWARD0117_*` refusals). The fast language check runs before a debate exists, so its cost is a
SITE cost in the day's pot (`ledger.model_spend` summed by day), never a run's and never a person's. The step widens
0074's `model_spend_spend_source_check` by exactly `LANGUAGE_CHECK`, adds `model_spend_language_check_is_runless` (no
run, no phase, no attempt; both in one ALTER TABLE) and one writer, `ledger.record_language_check_spend(uuid,text,date,bigint,bigint,bigint)`: SECURITY
DEFINER, `search_path = pg_catalog`, owned by `debateai_staff_security_owner` (the role 0093 and 0107 gave column
INSERT on `ledger.model_spend` for their spend writers), EXECUTE revoked from PUBLIC and granted to `debateai_runtime`
alone; it refuses (23514) a day outside UTC today ±1 and a provider reference off
`^language-check:[a-z0-9-]+:[A-Za-z0-9._/-]{1,128}$`. It is the ONLY writer of such a row (pre-flight PF-L58, option
(a)), in the database too: the BEFORE INSERT trigger `language_check_spend_writer_only` (WHEN the source is
`LANGUAGE_CHECK`, function `ledger.refuse_language_check_spend_outside_writer()`) refuses (42501) any role but the
writer's owner. `PostgresModelSpendStore.recordSpend` refuses the source too (`MODEL_SPEND_LANGUAGE_CHECK_FUNCTION_ONLY`),
and the hosted API probes at boot that the function exists and its role may EXECUTE it, keeping the fast check off
until both hold (`HOSTED_BEFORE_SPEND_RECORD`). No billing relation or function, so
`verify-effective-capabilities-111.sql` stays the verifier in force; no `replayVerifierSql`: its checks are its
postcondition digest (the writer's and the guard's owners, rights, settings, definitions and ACLs, the guard's trigger,
and the two CHECKs by name and definition). If `origin/dev` takes 0117 first, renumber this step at merge time (its manifest, loader name and
`previous` follow), as C1's recipe above says.

## The reclaim resume (0118)

The eighth chain step, after the language check's site cost 0117 (spec
`docs/superpowers/specs/2026-10-14-reclaim-resume-design.md`, "The database change"): `0118_reclaim_resume.sql`,
`reclaim-resume-forward0118.json`, `packages/db/src/migration-forward0118.ts` (`loadForward0118`, appended last to
`STEPS`, `MIGRATION_FORWARD0118_*` refusals). A copy that takes a run over after a crash sets the dead copy's nodes
aside instead of deleting them. `debateai_runtime` gets `UPDATE (generation_status) ON core.node`, and the trigger
`reject_mutation_except_retire` (function `core.reject_node_mutation_except_retire()`, replacing 0000's
`reject_mutation` on `core.node`) decides for every role, the owner included: DELETE is refused, an UPDATE may change
nothing but `generation_status`, only to `stale` and never from `stale` (one way), and not on an erased encrypted run
(`PRIVATE_CONTENT_ERASED`). An answer's map root moves in a NEW append-only table, `core.map_position_repoint`
(run, answer, the root moved from, the root moved to, maker; trigger `enforce_map_position_repoint`, 0040's erasure
barrier, `reject_mutation`, the TRUNCATE guard; `debateai_runtime` may SELECT and INSERT, `debateai_replay` may
SELECT): a move starts from the root in force (the position's own, or the last move's), which must be stale, and ends
on a live node of the same run. `core.map_position` itself is not touched, because 0116's postcondition digests its
ACL, column ACLs and triggers, and a grant or trigger there would read as drift of 0116. No billing relation or
function, so `verify-effective-capabilities-111.sql` stays the verifier in force; no `replayVerifierSql`: its checks
are its postcondition digest (the two trigger functions, core.node's guard trigger with 0000's `reject_mutation`
absent, the runtime's rights on core.node, and the new table whole). If `origin/dev` takes 0118 first, renumber this
step at merge time (its manifest, loader name and `previous` follow), as C1's recipe above says.

## Replay: every applied step keeps its own checks

On a later `migrate()` EVERY applied step is checked by its receipt and by its postcondition digest (not only the
last one: after 0112, 0111's billing objects stay digest-checked), and every applied step that declares one runs its
own `replayVerifierSql` (the batch: `verify-auth-db-batch.sql`); both run again after a run applies new steps, before
COMMIT — so a step's promises (for example the batch's "no runtime may
publish staff alert readiness") are still enforced after other steps are appended. A later step that deliberately
changes something an earlier step's verifier pins must change that verifier through its own reviewed step design; it
cannot silently pass. The effective-capability verifier of the last applied step (after 0118: 0111's, which the batch,
Part C's step, role rotation, the data export, the debate shape map, the language check's site cost and the reclaim
resume keep) still runs at the end of every `migrate()`.

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
