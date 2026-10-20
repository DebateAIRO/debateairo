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
below) the fourth, the data export (0115, V-41) the fifth, the mail locale (0116, below) the sixth, the debate shape's map (0117, below) the seventh, the language check's site cost (0118, below) the eighth, the reclaim resume (0119, below) the ninth, the reply measures (0120, below) the tenth, the engine verdict (0121, below) the eleventh, the engine's map answer step (0122, below) the twelfth and the synthesis check (0123, below) the thirteenth. A step is added with new files only; NNNN is its number, the step before's number plus one:

1. `migrations/NNNN_<name>.sql`: the SQL, forward-only and replayable.
2. A manifest in `lineage/`, shaped like `billing-netopia-forward111.json`: its version, the recipe's SHA-256,
   `previous` = the name, manifest SHA-256 and EFFECTIVE verifier SHA-256 of the step before (after 0123: 0123,
   `synthesis-check-forward0123.json`, and `verify-effective-capabilities-111.sql`, which 0112 to 0123 keep),
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

## Mail locale (0116)

The sixth chain step, after the data export's 0115 (mission email-locale, S01-C05; SPEC-v3 R-11, D-95, V-20 and V-22):
`0116_mail_locale.sql`, `mail-locale-forward0116.json`, `packages/db/src/migration-forward0116.ts`. It also defines the erasure worker's reader `identity.account_erasure_schedule_locale` (C11.6, D-108) and its per-claim reader `identity.account_erasure_notification_mail_locale(uuid,uuid)` (C18.2, D-120; the claim function keeps its 0040 signature). It adds `mail_locale`
to the five queued-mail tables and to `identity.social_flow`, a BEFORE INSERT fill (`identity.fill_mail_locale`: the
transaction's setting when the INSERT names no value) and a BEFORE INSERT guard (`identity.require_mail_locale`:
MAIL_LOCALE_MISSING for a NULL or an unknown value). It redefines seven writers, four readers and the two social functions.
It does NOT redefine the six bodies that applied steps pin: `password_reset_start` (108), `schedule_account_erasure` with
five arguments and `prepare_account_erasure` (110), and `mfa_recovery_notice_event`, `mfa_recovery_begin_wait` and
`mfa_recovery_claim_notice` (0112). Their inserts take the carrier from the fill. The MFA worker reads its locale through
`identity.mail_locale_of_mfa_claim`, which carries no `mfa_recovery_` prefix, so the batch verifier's naming rules do not
see it. The step's replay verifier re-checks the writers, the sealed bodies and both triggers on every `migrate()`. No
earlier file is edited.

## The debate shape map (0117)

The seventh chain step, after the mail locale's 0116 (spec `docs/superpowers/specs/2026-10-12-debate-shape-design.md`
§3.4, plan `docs/superpowers/plans/2026-10-12-debate-shape-phase2b.md` Task 7): `0117_debate_shape_map.sql`,
`debate-shape-map-forward0117.json`, `packages/db/src/migration-forward0117.ts` (`loadForward0117`, appended last to
`STEPS`, `MIGRATION_FORWARD0117_*` refusals). It creates three append-only tables (UPDATE and DELETE refused, TRUNCATE
guarded, `debateai_runtime` may SELECT and INSERT, `debateai_replay` may SELECT): `core.map_item` and `core.map_choice`,
content carriers in 0063's mechanism (their own attestation and plaintext guards, 0040's erasure barrier), and
`core.map_position`, ids and codes only, which carries 0040's erasure barrier too, and whose root is a node of the same
run (foreign key `(run_id, root_node_id)` to `core.node(run_id, node_id)`). Every id in a readable column is code-minted
(ruling T7-PRIV): `map_item.angle_id` is `g1`..`g7`, `map_position.answer_id` `a1`..`a4` (packages/map renames the AIs'
own ids at its boundary; they stay only in the encrypted raw replies). No billing relation or function, so
`verify-effective-capabilities-111.sql` stays the verifier in force; no `replayVerifierSql`: its checks are its
postcondition digest (the three tables' columns, constraints, indexes, triggers and ACLs, and the four guard
functions' definitions and ACLs). Known limit: `maker` keeps 0069's code-token rule (no whitespace), so a maker with a
space needs a later step before it joins a provider set. Renumbered from 0116 at the merge of `origin/dev` 221d784db, whose 0116 (mail locale) took the number first; if `origin/dev`
takes 0117 first, renumber this step at merge time (its manifest, loader name and `previous` follow), as C1's recipe above says.

## The language check's site cost (0118)

The eighth chain step, after the debate shape map's 0117 (the question-language spec 2026-10-13, kept outside this
repository; plan `docs/superpowers/plans/2026-10-13-debate-shape-phase2-language.md` Task 19): `0118_language_check_spend.sql`,
`language-check-spend-forward0118.json`, `packages/db/src/migration-forward0118.ts` (`loadForward0118`, appended last
to `STEPS`, `MIGRATION_FORWARD0118_*` refusals). The fast language check runs before a debate exists, so its cost is a
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
and its own run-less CHECK by name and definition). It never pins 0074's shared source list
`model_spend_spend_source_check`: 0118 widens it but does not own it, and a later spend source must be able to widen it
again without a postcondition drift on 0118 (whole-branch review I-3). Renumbered from 0117 at the merge of `origin/dev` 221d784db (its mail locale took 0116 and the
map moved to 0117). If `origin/dev` takes 0118 first, renumber this step at merge time (its manifest, loader name and
`previous` follow), as C1's recipe above says.

## The reclaim resume (0119)

The ninth chain step, after the language check's site cost 0118 (spec
`docs/superpowers/specs/2026-10-14-reclaim-resume-design.md`, "The database change"): `0119_reclaim_resume.sql`,
`reclaim-resume-forward0119.json`, `packages/db/src/migration-forward0119.ts` (`loadForward0119`, appended last to
`STEPS`, `MIGRATION_FORWARD0119_*` refusals). A copy that takes a run over after a crash sets the dead copy's nodes
aside instead of deleting them. `debateai_runtime` gets `UPDATE (generation_status) ON core.node`, and the trigger
`reject_mutation_except_retire` (function `core.reject_node_mutation_except_retire()`, replacing 0000's
`reject_mutation` on `core.node`) decides for every role, the owner included: DELETE is refused, an UPDATE may change
nothing but `generation_status`, only to `stale` and never from `stale` (one way), not on an erased encrypted run
(`PRIVATE_CONTENT_ERASED`), and never once the run has a `serve.answer` (`NODE_RETIRE_AFTER_ANSWER`). An answer's map root moves in a NEW append-only table, `core.map_position_repoint`
(run, answer, the root moved from, the root moved to, maker; trigger `enforce_map_position_repoint`, 0040's erasure
barrier, `reject_mutation`, the TRUNCATE guard; `debateai_runtime` may SELECT and INSERT, `debateai_replay` may
SELECT): a move starts from the root in force (the position's own, or the last move's), which must be stale, and ends
on a live node of the same run. `core.map_position` itself is not touched, because 0117's postcondition digests its
ACL, column ACLs and triggers, and a grant or trigger there would read as drift of 0117. No billing relation or
function, so `verify-effective-capabilities-111.sql` stays the verifier in force; no `replayVerifierSql`: its checks
are its postcondition digest (the two trigger functions, core.node's guard trigger with 0000's `reject_mutation`
absent, the runtime's rights on core.node, and the new table whole). If `origin/dev` takes 0119 first, renumber this
step at merge time (its manifest, loader name and `previous` follow), as C1's recipe above says.

## The reply measures (0120)

The tenth chain step, after the reclaim resume's 0119 (length guidance and repair first, spec
`docs/superpowers/specs/2026-10-15-length-guidance-design.md` §3.6, L27, L34): `0120_reply_measures.sql`,
`reply-measures-forward0120.json`, `packages/db/src/migration-forward0120.ts` (`loadForward0120`, appended last to
`STEPS`, `MIGRATION_FORWARD0120_*` refusals). Six nullable columns on `ledger.raw_artifact` (`reply_repairs`,
`reply_failure_class`, `reply_form`, `cached_input_tokens`, `guided_words`, `actual_words`), codes and counts only, written
once at insert, and their six CHECKs. It also redefines `core.read_terminal_recorded_facts(uuid)` in place (0049's
signature, return table, `LANGUAGE sql`, `STABLE`, `SECURITY DEFINER` and `search_path`; 0049's REVOKE and GRANT
re-asserted; the owner kept): an OK model call under the structure-repair key `REPAIR:STRUCTURE:<original key>` counts like
one under the original key in the judge, composer, conformance and post-compose counts. No billing relation or billing
function, so `verify-effective-capabilities-111.sql` stays the verifier in force; no supplemental verifier, so no
`replayVerifierSql`: its checks are its postcondition (the columns' types and nullability, the CHECKs by name and
definition, the function's owner, settings, definition digest and ACL). If `origin/dev` takes 0120 first, renumber this
step by C1's recipe (rename every file and constant that carries the number, recompute the manifest, re-pin the chain
lists).

## The engine verdict (0121)

The eleventh chain step, after the reply measures' 0120 (engine redesign R2, spec
`docs/superpowers/specs/2026-10-15-engine-redesign-design.md` §4.2b-§4.9): `0121_engine_verdict.sql`,
`engine-verdict-forward0121.json`, `packages/db/src/migration-forward0121.ts` (`loadForward0121`, appended last to
`STEPS`, `MIGRATION_FORWARD0121_*` refusals). Two append-only content carriers in 0117's form, `ledger.point_investigation`
and `ledger.verdict_vote` (their own guard functions, 0040's erasure barrier, codes only in readable columns), and four
CHECKs re-added on older tables: `serve.answer.verdict_state` and `serve.serve_disclosure.floor_verdict_state` admit
`SPLIT`, `serve.condition_mark.served_root_rule` admits `comparing-judges-votes-honest-strength-tiebreak`, and
`serve.condition_mark.review_outcome` admits the node mark `UNASSESSED-AT-REDUCED-WEIGHT`. No billing relation or
function, so `verify-effective-capabilities-111.sql` stays the verifier in force; no supplemental verifier, so no
`replayVerifierSql`: its postcondition is the two tables whole and the four functions. The four re-added CHECKs are
checked by the file's closing block and pinned by tests, not digested, so a later step may widen them again. If
`origin/dev` takes 0121 first, renumber this step by C1's recipe (rename every file and constant that carries the
number, recompute the manifest, re-pin the chain lists).

## The engine's map answer step (0122)

The twelfth chain step, after the engine verdict's 0121 (engine redesign R3, spec
`docs/superpowers/specs/2026-10-15-engine-redesign-design.md` §5.7): `0122_engine_map_check.sql`,
`engine-map-check-forward0122.json`, `packages/db/src/migration-forward0122.ts` (`loadForward0122`, appended last to
`STEPS`, `MIGRATION_FORWARD0122_*` refusals). Two new append-only code tables, `core.map_item_rests_on` and
`core.map_answer_check` (0040's erasure barrier, 0056's truncate guard, codes only, not content carriers); 0117's
tables are not altered (their digest is 0117's; see 0119's note). No billing relation or function, so
`verify-effective-capabilities-111.sql` stays the verifier in force; no supplemental verifier, so no
`replayVerifierSql`: its postcondition is the two tables whole. If `origin/dev` takes 0122 first, renumber this step
(rename every file and constant that carries the number, recompute the manifest, re-pin the chain lists).

## The synthesis check (0123)

The thirteenth chain step, after the engine's map answer step's 0122, is `0123_synthesis_check.sql` with
`synthesis-check-forward0123.json` and `packages/db/src/migration-forward0123.ts`. Its loader is appended to
`STEPS` and refuses altered inputs with `MIGRATION_FORWARD0123_` codes. It has no supplemental
`replayVerifierSql`; the effective `verify-effective-capabilities-111.sql` stays in force. Its postcondition
records its own seven tables: `serve.synthesis_check_request`, `serve.synthesis_check_attempt`,
`serve.synthesis_check_result`, `serve.synthesis_check_inheritance`,
`serve.synthesis_check_removal_request`, `serve.synthesis_check_removal_notice` and
`identity.synthesis_check_erasure_binding`, plus its own functions, triggers and constraint. It widens the
model-spend source list with `SYNTHESIS_CHECK` and grants the three erasure functions only to
`debateai_erasure_runtime`. If an earlier pending step takes 0123 first, renumber this step and recompute
its manifest and chain pins before merge.

## Replay: every applied step keeps its own checks

On a later `migrate()` EVERY applied step is checked by its receipt and by its postcondition digest (not only the
last one: after 0112, 0111's billing objects stay digest-checked), and every applied step that declares one runs its
own `replayVerifierSql` (the batch: `verify-auth-db-batch.sql`); both run again after a run applies new steps, before
COMMIT — so a step's promises (for example the batch's "no runtime may
publish staff alert readiness") are still enforced after other steps are appended. A later step that deliberately
changes something an earlier step's verifier pins must change that verifier through its own reviewed step design; it
cannot silently pass. The effective-capability verifier of the last applied step (after 0123: 0111's, which the batch,
Part C's step, role rotation, the data export, the mail locale, the debate shape map, the language check's site cost,
the reclaim resume, the reply measures, the engine verdict, the engine's map answer step and the synthesis check keep) still runs at the end
of every `migrate()`.

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
