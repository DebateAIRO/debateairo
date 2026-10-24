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
below) the fourth, the data export (0115, V-41) the fifth, the mail locale (0116, below) the sixth, the debate shape's map (0117, below) the seventh, the language check's site cost (0118, below) the eighth, the reclaim resume (0119, below) the ninth, the reply measures (0120, below) the tenth, the engine verdict (0121, below) the eleventh, the engine's map answer step (0122, below) the twelfth, the side-by-side releases (0123, below) the thirteenth and the settings activation (0124, below) the fourteenth, and the Italy-specific approval (0125, below) the fifteenth. A step is added with new files only; NNNN is its number, the step before's number plus one:

1. `migrations/NNNN_<name>.sql`: the SQL, forward-only and replayable.
2. A manifest in `lineage/`, shaped like `billing-netopia-forward111.json`: its version, the recipe's SHA-256,
   `previous` = the name, manifest SHA-256 and EFFECTIVE verifier SHA-256 of the step before (after 0125: 0125,
   `italy-specific-approval-forward0125.json`, and `verify-effective-capabilities-111.sql`, which 0112 to 0125 keep),
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
7. The SQL file's leading comment block carries its n1 header lines (side-by-side spec §5, "The N-1 rule"; below):
   `-- n1: expand` for every step after 0123 (only a drained upload, like 0123, may say `-- n1: drained`), and
   `-- n1: keeps-verifier` exactly when step 3 made no new verifier. CI's N-1 audit (`tools/orphan-audit`
   `auditMigrationN1Compatibility`, run by `auditSourceRules` on every `migrations/*.sql`; GitHub workflow
   `security.yml`, job `verify`, step `pnpm run test:ci-gate`, which runs `tests/architecture/migration-n1-audit.test.ts`
   and `scaffold.test.ts`) refuses a missing or wrong header, a `keeps-verifier` line the manifest contradicts, and,
   in an expand step, anything the release before cannot run beside. The SQL is read in one lexer pass (comments,
   literals, quoted names and dollar bodies in source order); a function body is not read (it runs when called), a
   `DO` body is (it runs when the step applies). A table or view is new only when this step creates it and no earlier
   step did; everything else is existing. Refused in an expand step:
   - `DROP`, `RENAME`, a column type change, `SET NOT NULL`, `ADD COLUMN … NOT NULL` without `DEFAULT`;
   - `REVOKE` on an existing object (an earlier function's name counts, even beside a new overload) and
     `CREATE OR REPLACE` of an earlier function or view (a new one supersedes it);
   - on an existing table: a new trigger, `ENABLE`/`DISABLE TRIGGER`, any row-level-security change or policy, a
     rule, and an `ADD CONSTRAINT` that is not `NOT VALID` or adds `UNIQUE`, `PRIMARY KEY` or `EXCLUDE`;
   - every strong lock on an existing table: `CREATE INDEX` without `CONCURRENTLY`, `VALIDATE CONSTRAINT` in the step
     that adds it, `UPDATE` / `DELETE` / `INSERT … SELECT`, `ADD COLUMN` with a default other than a constant (a
     literal, a number, `TRUE`/`FALSE`/`NULL`, `now()`, `CURRENT_TIMESTAMP`, each optionally cast) or a generated or
     serial value, `SET LOGGED` / `UNLOGGED` / `TABLESPACE`; and anywhere `TRUNCATE`, `LOCK TABLE`, `CLUSTER`,
     `VACUUM FULL`, `REINDEX` and `REFRESH MATERIALIZED VIEW` without `CONCURRENTLY`.
   A `-- n1: reviewed <reason>` line directly above a statement, the reason saying why the older release is
   unaffected, admits exactly four things: `DROP TRIGGER IF EXISTS t ON x` followed by `CREATE TRIGGER t … ON x`;
   `ALTER TABLE x DROP CONSTRAINT IF EXISTS c` followed by `ALTER TABLE x ADD CONSTRAINT c … NOT VALID` (same name,
   same table; on a table the step creates neither pair needs the line); any other `ADD CONSTRAINT … NOT VALID` on an
   existing table (a new restriction its writes meet); and a `DO` block that runs `EXECUTE` (its other statements are
   still read). A reviewed line without a reason is refused like a misspelled declaration. Files up to
   `0122_engine_map_check.sql` predate the rule and are not audited; their count is pinned
   (`N1_GRANDFATHERED_COUNT`), so a file slipped in before the cut-off is refused too.

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

## Side-by-side releases (0123)

The thirteenth chain step, after the engine's map answer step 0122 (side-by-side uploads, spec
`docs/superpowers/specs/2026-10-21-side-by-side-uploads-design.md` §1 and §5): `0123_side_by_side_releases.sql`,
`side-by-side-releases-forward0123.json`, `packages/db/src/migration-forward0123.ts` (`loadForward0123`, appended last
to `STEPS`, `MIGRATION_FORWARD0123_*` refusals). The transition release T's one migration, built in numbered sections
(plan A, tasks A1-A5), each checked by the file's closing contract block and digested by the loader's postcondition: §1
adds `core.run.release_key` (`text NOT NULL DEFAULT 'legacy'`, CHECK `run_release_key_shape`), the release that runs
each debate, written once at insert; §2 redefines `core.create_encrypted_run(jsonb,uuid,uuid,jsonb)` in place (0072's
body, plus `releaseKey` in its closed key list and the stamp in its INSERT), re-asserting SECURITY DEFINER, the pinned
`search_path` and EXECUTE for `debateai_content_provision` only; §3 adds the release table `core.release_event`
(append-only), its view `core.release_state_v`, the readers `core.read_current_release()` and
`core.read_release_state(text)` (EXECUTE for `debateai_runtime`; the latter also answers `still_draining`, a DRAINING
event with no later RETIRED one, so a draining release staged again reads true; final review A4) and the writers
`core.record_release_switch` and `core.record_release_event` (EXECUTE for `debateai_release_operator`, serialized on
the `debateai:release-switch` advisory lock), all four owned by the new NOLOGIN NOINHERIT role
`debateai_release_owner`; §4 adds the re-admission
record `core.run_supersession` (append-only; its row guard `core.guard_run_supersession()` refuses
`RUN_SUPERSESSION_INVALID` unless the old run still waits, also as `core.run_waiting_v` reads it after the guard's lock
(not FAILED, its content not erased, its account active: an erasure committed between the new run's write and START
refuses; final review P3), the new run has no edge of its own, no FAILED work item and no re-admission marker naming
another run, and both are the same person's; SELECT, INSERT for the API's role
`debateai_billing_runtime` only), the start guard `core.refuse_starting_superseded_run()` (a trigger on
`core.run_wait_start` refusing `RUN_SUPERSEDED`), `core.resolve_run_ref(uuid)` (owned by `debateai_release_owner`,
EXECUTE for `debateai_billing_runtime`, at most 16 hops), the readmitted run's key provision
`core.prepare_readmitted_run_key_provision(uuid,uuid)` (EXECUTE for `debateai_content_provision` only) with its commit
lock and the marker column `readmitted_from_run_id` on the intent and on the run's execution binding (one live
re-admission per old run), `core.list_unstarted_readmissions(uuid)` (a STABLE definer, EXECUTE for
`debateai_billing_runtime` only: the re-admissions of a waiting run whose START never committed, which the API records
FAILED under the old run's owner lease; plan C11 review), and redefines `core.run_waiting_v` (0083's view plus "not
superseded"); §5 widens
`core.run_wait_reason`'s `waits_for` CHECK with `SITE_BUSY` and `SWITCHING` (NOT VALID, then validated); §6 redefines in
place, same signature, owner, definer, path and grants, the five funding functions that tied a grant to the funding
selection's or the run's version (`billing.reserve_internal_provider_call`, `billing.read_internal_run_state`,
`billing.read_internal_allowance`, `billing.guard_internal_charge_scope`, `staff.revoke_internal_allowance`), so a grant
stays valid under the version it was issued with, and `staff.read_self_allowance_command` (a revoke names its grant's
own version), and adds `staff.read_internal_funding_policy_at(bigint)` (owned by `debateai_staff_security_owner`,
EXECUTE for `debateai_runtime`), the funding publication at a version; §7 adds the append-only spend waiver
`ledger.model_spend_waiver` (one row per run, reason `BACKSTOP`, `OWNER_STOPPED`, `SETTINGS_VERSION_UNSUPPORTED` or
`RELEASE_NOT_SERVED`; SELECT, INSERT for `debateai_runtime`, SELECT for `debateai_staff_security_owner` and
`debateai_replay`) and redefines `billing.read_internal_grant_spent` in place (same signature, owner, definer, path and
grants) so a waived run's spend leaves a funded person's window; site-day readers still count it; §8 adds
`core.private_erasure_run_chain(uuid)` (a STABLE definer, callable by no role: a debate's runs, linked by the
re-admission marker `identity.run_execution_binding.readmitted_from_run_id` between two encrypted runs of one account,
so the copies no edge links are included and an edge to a run that does not re-admit its old run joins nothing; a
plaintext run is a chain of one) and redefines in place, same signature, owner, definer, path, grants and 0099's
session clamp, the per-debate private erasure `core.prepare_private_run_erasure`, `core.resume_private_run_erasure` and
`core.finalize_private_run_erasure` (EXECUTE for `debateai_erasure_runtime` only), so deleting a debate erases every run
of its chain that the person owns: the step-up grant may be bound to any run of the chain, prepare marks them all in one
transaction (under a try of the site-wide supersession guard's lock, which every deletion now tries, and of the other
runs' content leases), and resume names each one still pending until the coordinator has completed them all (addendum
A-x3). Its header declares
`-- n1: drained` (T is uploaded with no debate waiting or running, so it may add a NOT NULL column and redefine earlier
functions, each such section saying why) and `-- n1: keeps-verifier`: no billing relation or function, so
`verify-effective-capabilities-111.sql` stays the verifier in force. No supplemental verifier, so no
`replayVerifierSql`: its postcondition is the three columns (type, NOT NULL, default), the CHECK (name, validation,
definition), the redefined and added functions whole (§6's six, §7's one and §8's three redefinitions excepted), the
release, supersession and waiver tables whole, the release view (owner, ACL, definition) and the two roles' attributes
and memberships. `core.run_waiting_v`, the `waits_for` CHECK, the marker indexes, the seven funding redefinitions of §6
and §7 and the three erasure redefinitions of §8 are checked by the closing block and by tests, not digested, so a
later drained step may widen or redefine them again. While the build is open each task appends its section and recomputes `migration.sha256` with the one-liner at the
end of this file; once merged, 0123 is never edited again. If `origin/dev` takes 0123 first, renumber this step (rename
every file and constant that carries the number, recompute the manifest, re-pin the chain lists).

## The settings activation (0124)

The fourteenth chain step, after the side-by-side releases' 0123 (side-by-side uploads, spec
`docs/superpowers/specs/2026-10-21-side-by-side-uploads-design.md` §13, settings changes without an upload; plan
2026-10-21-side-by-side-S-settings Task S1): `0124_settings_activation.sql`, `settings-activation-forward0124.json`,
`packages/db/src/migration-forward0124.ts` (`loadForward0124`, appended last to `STEPS`, `MIGRATION_FORWARD0124_*`
refusals). The first `-- n1: expand` step (with `-- n1: keeps-verifier`): three new append-only tables in schema
register, `register.settings_activation` (the activation pointer: the latest row's version is the active debate-settings
version; going back is a new row), `register.settings_verdict` (each dry boot's PASS or FAIL for a release and a
version; the latest row for the pair decides) and `register.settings_switch_check` (one row per release switch, checked
at COMMIT by the deferred constraint trigger `settings_switch_check_at_commit`), each with 0122's append-only trigger,
0056's truncate guard and a SECURITY INVOKER writer guard (only `debateai_release_owner` inserts, inside the definers);
and ten new functions owned by 0123's `debateai_release_owner`: `register.settings_version_passed(text,bigint)` (a
release passes its own site version, else its latest verdict must be PASS; EXECUTE for `debateai_runtime`),
`register.read_passed_settings_versions(text)` (the runner's preload; EXECUTE for `debateai_runtime`),
`register.read_active_settings_version()` (the pointer's one reader; EXECUTE for `debateai_billing_runtime`, the API's
role, never the runner's), `register.record_settings_verdict` and `register.activate_settings_version` (EXECUTE for
`debateai_release_operator`; the activation shares the release switch's advisory lock and refuses
`SETTINGS_ACTIVATION_CONFLICT`, `SETTINGS_VERSION_KIND_INVALID`, `SETTINGS_ACTIVATION_UNCHANGED` and
`SETTINGS_VERSION_NOT_PASSED`), `register.release_switch_settings_hook(text,bigint)` (which 0123's
`core.record_release_switch` already calls when it exists: 0123 is not touched), the commit check and the three insert
guards. No billing relation or function, so `verify-effective-capabilities-111.sql` stays the verifier in force; no
supplemental verifier, so no `replayVerifierSql`: its postcondition is the three tables whole and the ten functions
whole. If `origin/dev` takes 0124 first, renumber this step (rename every file and constant that carries the number,
recompute the manifest, re-pin the chain lists).

## The Italy-specific approval (0125)

The fifteenth chain step, after the settings activation's 0124 (mission italy-clause-approval, slice S01; the second,
unticked sign-up checkbox of the Italian Civil Code arts. 1341-1342, `docs/missions/italy-clause-approval/slices/S01/`):
`0125_italy_specific_approval.sql`, `italy-specific-approval-forward0125.json`, `packages/db/src/migration-forward0125.ts`
(`loadForward0125`, appended last to `STEPS`, `MIGRATION_FORWARD0125_*` refusals). The second `-- n1: expand` step
(with `-- n1: keeps-verifier`): two nullable columns without a default, `legal.acceptance.clauses` (smallint[], the
Terms clauses approved, 11, 12, 14, 15 and 18 in that order) and `legal.acceptance.leg` (text: `PICKED`, `IP` or
`BOTH`, which test placed the sign-up in Italy); three CHECKs, added `NOT VALID` behind a reviewed line each:
`acceptance_kind_check` (0080's inline kind list) and `acceptance_document_version_shape` (0080) widened with the kind
`ITALY_SPECIFIC_APPROVAL` (which carries the Terms' `N.M` version), and the new `acceptance_italy_fields` (the two
columns are set exactly on that kind, to that one list and a known leg, and are NULL on every other kind; null-safe);
and two new functions: `identity.record_signup_italy_approval(uuid,jsonb)` (the sign-up writer, EXECUTE for
`debateai_billing_runtime` only: inside the sign-up transaction it refuses `ITALY_APPROVAL_INVALID`,
`ITALY_APPROVAL_ACCOUNT_INVALID`, `ITALY_APPROVAL_TERMS_MISSING` and `ITALY_APPROVAL_DUPLICATE` in that order, then
writes one row whose document version, digest, locale and time are the account's sign-up TERMS row's) and
`identity.read_data_export_snapshot_v2(uuid,uuid)` (EXECUTE for `debateai_data_export_worker` only, owned by 0115's
export owner: it calls 0115's frozen `identity.read_data_export_snapshot`, lease check included, and adds `clauses` and
`leg` to every `legal_acceptances` element). The release before writes only kinds both CHECK versions accept and neither
new column, so it keeps running beside the step. No billing relation or function, so
`verify-effective-capabilities-111.sql` stays the verifier in force; no supplemental verifier, so no
`replayVerifierSql`: its postcondition is the two columns (type, NOT NULL, default) and the two functions whole. The
three CHECKs are checked by the file's closing block and by tests, not digested, so a later step may widen the kind list
again without a postcondition drift on 0125. If `origin/dev` takes 0125 first, renumber this step (rename every file and
constant that carries the number, recompute the manifest, re-pin the chain lists).

## Replay: every applied step keeps its own checks

On a later `migrate()` EVERY applied step is checked by its receipt and by its postcondition digest (not only the
last one: after 0112, 0111's billing objects stay digest-checked), and every applied step that declares one runs its
own `replayVerifierSql` (the batch: `verify-auth-db-batch.sql`); both run again after each step a run applies, with
that step included, before that step's COMMIT — so a step's promises (for example the batch's "no runtime may publish
staff alert readiness") are still enforced after other steps are appended. A later step that deliberately
changes something an earlier step's verifier pins must change that verifier through its own reviewed step design; it
cannot silently pass. The effective-capability verifier of the last applied step (after 0125: 0111's, which the batch,
Part C's step, role rotation, the data export, the mail locale, the debate shape map, the language check's site cost,
the reclaim resume, the reply measures, the engine verdict, the engine's map answer step, the side-by-side releases,
the settings activation and the Italy-specific approval keep) still runs at the end of every `migrate()`.

## One transaction per step (side-by-side §5)

`migrate()` no longer applies every pending step in one transaction (side-by-side uploads, spec
`docs/superpowers/specs/2026-10-21-side-by-side-uploads-design.md` §5, "Each step runs on its own"; plan A, task A6).
It takes the `debateai:schema-migrations` advisory lock for its session (`pg_advisory_lock`, released in `finally`;
a connection that cannot send the unlock is destroyed, which ends the lock with the session), then:

1. the prologue, one transaction: the ledger tables, the lineage and its receipts, the base recipe, the effective
   verifier, 0108, 0110 and `replayForwardChain` (the receipt table, its ACL, every applied step's binding, own checks
   and postcondition), which returns the applied prefix;
2. each pending step, its own transaction (`applyForwardStep`): the step's SQL, its verifier and postcondition, its
   ledger row and receipt, every applied step's own checks and postcondition with this step included, the receipt
   ACL, and the 0093 compatibility re-seal when the step moved `lineageEvidence`, all before that step's COMMIT.

Every transaction (`packages/db/src/migration-transaction.ts`) checks read committed and sets
`SET LOCAL lock_timeout = '2s'`: a step waits at most 2 s for a lock, so page reads that queue behind its waiting
`ALTER` wait at most that long too. A lock wait that ran out (SQLSTATE `55P03`) rolls the try back, logs
`[MIGRATION_LOCK_RETRY] <step> try <n>/5`, pauses 2 s and tries again; after the fifth it refuses
`MIGRATION_LOCK_TIMEOUT <step>` (or `PROLOGUE`) and nothing of that step remains. Any other failure is refused at once.
A step that fails, or a migrator killed between steps, leaves every earlier step committed with its receipt and its
re-sealed compatibility row; the next run replays them and continues at the next step.

Each step after `0122_engine_map_check.sql` declares its n1 header in its leading comment block
(`packages/db/src/migration-n1.ts` `parseN1Header`, the one parser A7 and A8 reuse): exactly one of `-- n1: expand` /
`-- n1: drained`, `-- n1: keeps-verifier` when its manifest names the verifier of the step before (the loader refuses
`MIGRATION_FORWARD_CHAIN_N1_KEEPS_VERIFIER` when the two disagree), and `-- n1: outside-transaction` for an expand step
whose whole body is one `CREATE INDEX CONCURRENTLY IF NOT EXISTS <name> ON <schema>.<table> …`. Such a step runs on
the session first with the same 2 s lock wait and retries (`runOutsideTransactionStep`: an INVALID index of that name
is dropped concurrently before the build); its step transaction then refuses
`MIGRATION_OUTSIDE_TRANSACTION_INDEX_INVALID` unless an index of that name is valid and on the step's own table (the
header names it, `parseN1Header`'s `concurrentIndex`), and records the step like any other.
0122 and earlier declare nothing (all false). The modules `loadMigrationPlan` loads import only node built-ins and
`./migration-*.js` (standalone probes and the preview's superuser JIT creator load them), so their refusals are plain
Errors whose message starts with the code and which carry it as `.code`. The reviewed bytes of `migrate()`'s module
and of `migration-transaction.ts` are sealed in `tools/orphan-audit` (`NATIVE_MIGRATE_MODULE_SHA256`,
`NATIVE_MIGRATE_TRANSACTION_SHA256`) with their ordered controls.

## Database ahead (side-by-side §5)

During a side-by-side upload (spec `docs/superpowers/specs/2026-10-21-side-by-side-uploads-design.md` §5, "The N-1
rule"; plan A, task A7) the newer release migrates the shared database while the older release keeps running, and the
older release may restart. Its `migrate()` then meets ledger names it does not know. `splitLedger`
(`packages/db/src/migration-lineage.ts`) sets apart the **extra** ones: not known to this code, shaped like a step
name, and sorting after this code's last step. `identifyLineage` sees only the rest, so any other unknown name
(before this code's last step, or not shaped like a step) still refuses `MIGRATION_LINEAGE_REFUSED UNKNOWN_APPLIED_NAME`.

Each step after `0122_engine_map_check.sql` records its n1 header in the migrator-private declaration table
`public.debateai_schema_migration_step_n1` (`source_name` primary key with the step-name CHECK `fwdstep_source_check`,
`n1_expand`, `keeps_verifier`, `outside_transaction`, `chain_head_manifest_sha256` with a 64-hex CHECK, and
`recorded_at`; all NOT NULL). `applyForwardStep` writes the row in the step's own transaction, and its
`chain_head_manifest_sha256` is the manifest SHA-256 of the LAST step of the applying code's own chain, so one newer
release means one head. Steps up to 0122 have no row; 0123 has the first. `replayForwardChain` creates the table on first
use and checks its ACL like the receipt table's: owned by the installer, no grant, no column grant, no `debateai_` role
able to act as its owner, exact columns, three keys (`MIGRATION_FORWARD_CHAIN_DECLARATION_ACL_DRIFT`). It binds only the
receipts of this code's steps; the extra steps' receipts are left to the acceptance check.

Right after the replay, in the prologue transaction, `assertDatabaseAheadAccepted` (`packages/db/src/migration-ahead.ts`)
accepts the extra steps only when every rule holds, and otherwise refuses
`DATABASE_AHEAD_NOT_ACCEPTED <DETAIL> <name>` (the prologue rolls back):

1. every step of this code's chain is applied (`PENDING_KNOWN_STEP`);
2. every extra step has a receipt (`RECEIPT_MISSING`);
3. the receipts chain from this code's last manifest, one after the other, on the same base recipe (`CHAIN_BROKEN`);
4. every extra receipt names this code's last verifier, so the verifier this code runs is the one in force
   (`VERIFIER_CHANGED`);
5. every extra step has a declaration row (`NOT_DECLARED`) with `n1_expand` (`NOT_EXPAND`) and `keeps_verifier`
   (`NOT_KEEPS_VERIFIER`);
6. without `newerChain`: all extra steps carry one `chain_head_manifest_sha256`, so they come from at most one newer
   release (`MORE_THAN_ONE_RELEASE`);
7. with `migrate(pool, { newerChain })` (the newer release's `describeForwardSteps()`, from its root-owned plan): this
   code's chain is a prefix of it by name, manifest, source and verifier, and the extra steps are a prefix of the rest
   with the receipts' manifests and sources, each declared expand and keeps-verifier (`NEWER_CHAIN_MISMATCH`).

Rule 6 is skipped when `newerChain` is given (the preview always passes it; final review A1). A release T+1 that
applied 0124 and was rolled back, then its fix release T+1b that keeps 0124 byte for byte and adds 0125, leave two
chain heads (each `migrate()` records its own), yet rules 3 and 7 already prove one linear chain of that one newer
release, so T can still restart. Without the newer release's list the heads are the only proof of one release.

Accepted, `migrate()` has replayed every one of its own steps (receipts, own checks, postconditions, and its own last
verifier, which rule 4 shows is the one in force), applies nothing and returns
`{ appliedSteps: [], extraSteps: [<the extra names>] }`; on a database it is current with, `extraSteps` is empty and
`appliedSteps` lists the steps the run applied. Read-only helpers, for the release tooling: `verifyDatabaseAhead(pool,
options)` makes the same split, lineage and acceptance check in a `BEGIN READ ONLY` transaction and returns
`{ mode: "CURRENT" | "AHEAD", knownSteps, extraSteps }`; `readPendingForwardSteps(pool)` lists this code's steps the
database has not applied, with their n1 header (the release check refuses a side-by-side upload when one is not expand);
`describeForwardSteps()` describes this code's whole chain.

For as long as an older release can start on the database, two things are **frozen**: the declaration table's shape
(the older release checks its exact columns and keys before it trusts a row) and the SQL of `lineageEvidence()` in
`packages/db/src/migration-lineage.ts` (a newer step may re-seal the 0093 compatibility receipt with it, and the older
release compares that receipt with its own copy of the function). Changing either needs a drained upload, like 0123.

## Merge order: check the preview first

Before merging any branch with a forward step, read the live preview's applied steps (read-only):
`SELECT name FROM public.debateai_schema_migration ORDER BY name` and
`SELECT source_name FROM public.debateai_schema_migration_step`. **Whatever is applied there merges first** and keeps
its number: an applied step can never be renumbered (`migrate()` refuses an unknown applied name,
`MIGRATION_LINEAGE_REFUSED UNKNOWN_APPLIED_NAME`, unless it is a newer release's accepted step, above). Otherwise whichever branch merges first keeps its number and the
other renumbers just before its own merge (new file name, manifest `previous` and `migration`, the loader's two
constants, then every exact-chain test). The preview's native verify never applies a pending step (it refuses); only
the native operator's `apply-and-plan` applies one, with the owner's yes.

Recompute a digest with `node -e 'console.log(require("node:crypto").createHash("sha256").update(require("node:fs").readFileSync(process.argv[1])).digest("hex"))' <file>`.
