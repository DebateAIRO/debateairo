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
below) the fourth, the data export (0115, V-41) the fifth, the mail locale (0116, below) the sixth, the debate shape's map (0117, below) the seventh, the language check's site cost (0118, below) the eighth, the reclaim resume (0119, below) the ninth, the reply measures (0120, below) the tenth, the engine verdict (0121, below) the eleventh, the engine's map answer step (0122, below) the twelfth, the side-by-side releases (0123, below) the thirteenth, the settings activation (0124, below) the fourteenth, the security fixes of audit run 3 (0125, below) the fifteenth, the three recovery notice due indexes (0126, 0127 and 0128, below) the sixteenth to eighteenth, and the MFA recovery control user index (0129, below) the nineteenth. A step is added with new files only; NNNN is its number, the step before's number plus one:

1. `migrations/NNNN_<name>.sql`: the SQL, forward-only and replayable.
2. A manifest in `lineage/`, shaped like `billing-netopia-forward111.json`: its version, the recipe's SHA-256,
   `previous` = the name, manifest SHA-256 and EFFECTIVE verifier SHA-256 of the step before (after 0129: 0129,
   `mfa-recovery-control-user-started-forward0129.json`, and `verify-effective-capabilities-111.sql`, which 0112 to 0129 keep),
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

## The security fixes of audit run 3 (0125)

The fifteenth chain step, after the settings activation's 0124 (security audit run 3, the fix branch's one database
step): `0125_security_fixes_run3.sql`, `security-fixes-run3-forward0125.json`,
`packages/db/src/migration-forward0125.ts` (`loadForward0125`, appended last to `STEPS`, `MIGRATION_FORWARD0125_*`
refusals). Every SQL change of the branch goes into this one file, in one section per issue, each opened by a line
`-- ==== [<issue id>] <short title> ====` and holding only that issue's statements. Its header declares
`-- n1: expand` and `-- n1: keeps-verifier`: every section only adds (new functions as `CREATE OR REPLACE FUNCTION` of
names no earlier file defines, `REVOKE` only on objects this file creates, a reviewed `-- n1: reviewed <reason>` line
above any of the four admitted exceptions), and no section adds a billing relation or function, so
`verify-effective-capabilities-111.sql` stays the verifier in force. No supplemental verifier, so no
`replayVerifierSql`: its postcondition is one group per section, in section order (the loader's `SECTIONS` list: the
section's id, its functions whole and its tables whole, plus, only in a section that names them, its `tablePrivileges`
answers of `has_table_privilege` for grants it adds on an earlier step's table, its `schemas`: owner and ACL of a
schema it creates, its `triggers`: the enabled flag and definition of a trigger it re-creates on an earlier step's
table, and its `constraints`: the name, type and definition, without a trailing `NOT VALID`, of a constraint it adds
on an earlier step's table, never that table whole), and the loader refuses
`MIGRATION_FORWARD0125_SECTIONS` when the file's section headers and that list disagree. The sections:

- `[NV-16]` `identity.mfa_recovery_start_bounded(bytea,text,uuid,uuid[],text,text,jsonb,jsonb,bigint,uuid)`, owned by
  `debateai_mfa_recovery_owner` (SECURITY DEFINER, `search_path=pg_catalog, pg_temp`, EXECUTE for
  `debateai_mfa_recovery_runtime` only): under the account's security-subject lock it refuses silently once the
  account has three control rows for the requested destination's channel type that started in the last hour, and
  otherwise delegates to 0116's sealed `identity.mfa_recovery_start`, which keeps its grant for the release before.
- `[NV-18]` `identity.expire_stale_account_recovery_bindings(integer)`, owned by the installer (as
  `start_account_recovery` is; SECURITY DEFINER, `search_path=pg_catalog, pg_temp`, EXECUTE for `debateai_runtime`,
  which its member roles inherit, and no PUBLIC row): closes up to `p_batch` (1 to 1000, else `22023`) open
  `identity.account_recovery_binding` rows bound more than one hour ago, one subject lock at a time in `user_id`
  order, and appends `EXPIRED` for each. The API's one-minute authentication-risk pass calls it in rounds of 100;
  the new release's generic recovery start creates no binding, and `start_account_recovery` keeps its grant for the
  release before.
- `[NV-15]` `identity.mfa_recovery_record_failure(text,text,jsonb,jsonb)`, owned by `debateai_mfa_recovery_owner`
  (SECURITY DEFINER, `search_path=pg_catalog, pg_temp`, EXECUTE for `debateai_mfa_recovery_runtime` only), plus
  `GRANT INSERT ON identity.authentication_risk_signal TO debateai_mfa_recovery_owner` (recorded as a
  `tablePrivileges` answer, not as that table's ACL): under the account's subject lock it delegates to the pinned
  `identity.mfa_recovery_failure`, answers `REFUSED` while the sealed adverse rule holds, and for a link failure sums
  the failures of the account's never-paired challenges whose link was valid after the later of its latest sign-in and
  latest successful pairing; at the sealed `proof_failures_per_attempt` it writes one `RECOVERY_PROOF_FAILED` with the
  caller's encrypted context. Finish failures keep their own five tries. The old `mfa_recovery_failure` keeps its
  grant for the release before and for session failures.
- `[NV-40]` `identity.password_reset_claim_pending_notice(integer)`, owned by `debateai_password_reset_owner` (SECURITY
  DEFINER, `search_path=pg_catalog, pg_temp`, `plan_cache_mode=force_custom_plan`, EXECUTE for
  `debateai_password_reset_runtime` only): the claim the new release's `PostgresPasswordResetRepository.claimNotice`
  calls instead of 0116's sealed `identity.password_reset_claim_notice`, with the same argument, range check, error and
  result object. One `a.notice_id=ANY(ARRAY(… FOR UPDATE OF s SKIP LOCKED))` sweep (a primary-key probe; keep that form)
  first dead-letters every unleased PROOF whose control is no longer `EMAIL_REQUIRED` or has expired; a loop of at most
  64 rows then dead-letters a PROOF found stale in the race window and takes the next due row, so a NULL answer means
  nothing deliverable is due. A leased row is never touched, and the lease is taken after both. The old claim keeps its
  grant for the release before.
- `[NV-01]` `core.legacy_claim_lockout` (one counter row per account: `attempts`, `window_started_at`, `locked_until`;
  its `user_id` references `identity."user"` `ON DELETE CASCADE`; a `reject_truncate` guard and no table grant), with
  `core.legacy_claim_admit(uuid,bigint,integer,bigint)` and `core.legacy_claim_clear(uuid)`, owned by the installer (as
  `core.claim_legacy_runs` is; SECURITY DEFINER, `search_path=pg_catalog, pg_temp`, EXECUTE for `debateai_runtime`, no
  PUBLIC row): the new release's legacy-run claim admits each attempt first, in one upsert whose row lock serializes
  one account's concurrent admits, so at most five attempts per account per hour reach `core.claim_legacy_runs`; the
  attempt past the cap is refused and locks the account's claims for an hour, an elapsed window or an expired lock
  starts afresh, and a `CLAIMED` outcome clears the row unless a lock is active. `core.claim_legacy_runs` is unchanged
  and keeps its grant for the release before.
- `[NV-12]` `identity.email_change_send_window` (one row per account: `sends`, `window_started_at`; installer-owned,
  no grantee, a TRUNCATE guard, `ON DELETE CASCADE` from `identity."user"`) and
  `identity.request_email_change_bounded(uuid,uuid,text,uuid,bytea,jsonb,text,text,timestamptz,jsonb,integer,bigint)`
  and `identity.resend_email_change_bounded(uuid,uuid,text,timestamptz,bigint,jsonb,integer,bigint,bigint)`, owned by
  the installer (SECURITY DEFINER, `search_path=pg_catalog, pg_temp`, EXECUTE for `debateai_authorization_runtime`
  only): under the account lock both share one budget of at most `p_maximum_sends` (1 to 3) confirmation mails in a
  fixed window of `p_window_ms` from its first counted send, refusing `LIMIT` with a `SEND_LIMIT` audit and counting
  nothing when it is full. The request refuses before it delegates to 0079's `request_email_change_with_audit` (so
  the step-up grant survives) and counts only `PENDING`; the resend is the live post-0099 resend body (the 720-hour
  session ceiling) that also clamps `expires_at` to the change's `issued_at` plus `p_link_ttl_ms`, answering `NONE`
  with `PENDING_CHANGE_LAPSED` once that has passed. Out-of-range thresholds answer `REQUEST_INVALID`. Both 0079
  functions keep their grants for the release before.
- `[NV-08]` `erasure_reconcile.claim_run_key_provision_cleanup(integer)` and the schema `erasure_reconcile` (owned by
  the migration owner, like 0040's claim; the section's `schemas` entry digests its owner and ACL once, so it also
  records the USAGE for `debateai_erasure_runtime` that the later K02 sections grant; USAGE for
  `debateai_content_provision` here; SECURITY DEFINER, `search_path=pg_catalog, pg_temp`, EXECUTE for
  `debateai_content_provision` only): the 0040 claim plus an owner-state filter and a locked re-check, so an owner the
  intent trigger refuses is skipped instead of failing every owner's cleanup. The release before's exact-count
  witnesses do not count the schema; the new one counts it by catalog OID. The 0040 claim keeps its grant for the
  release before.
- `[NV-04]` `identity.totp_login_lockout` (one row per account and TOTP factor: `level` 0 to 30, `level_at`,
  `attempts`, `last_charged_at`, `last_failure_at`, `locked_until`; FK to `identity."user"` `ON DELETE CASCADE`, none on
  the factor; no grantee but its owner; a `reject_truncate` guard) with
  `identity.totp_login_admit(uuid,uuid,integer,bigint,bigint)` and `identity.totp_login_clear(uuid,uuid)`, all owned
  by the installer (as the rest of the login family is; SECURITY DEFINER, `search_path=pg_catalog, pg_temp`, EXECUTE
  for `debateai_authorization_runtime` only): the new release's `SessionService.completeLogin` charges every login
  TOTP attempt before the code is checked, five per round; the next attempt closes the round, raises the level and
  sets a cooldown of `p_base_lock_ms` doubled per level, at most `p_max_lock_ms` (24 h), from the round's last charge,
  and a cooldown already over refuses nothing. A TOTP success clears only the round's count; the level falls one step
  per full 24 h with no failure. Parameters outside fixed bounds raise `22023`; a row removed while the admit waits
  for its lock raises `23503`. 0099's completion is unchanged, so the release before skips the budget.
- `[NV-38]` `identity.backup_email_claim_pending_notice(integer)`, owned by `debateai_backup_email_owner`, and
  `identity.mfa_recovery_claim_pending_notice(integer)`, owned by `debateai_mfa_recovery_owner`. Both are SECURITY
  DEFINER with `search_path=pg_catalog, pg_temp` and `plan_cache_mode=force_custom_plan`, and each grants EXECUTE
  only to its own runtime (`debateai_backup_email_runtime`, `debateai_mfa_recovery_runtime`). Each claim takes its
  lease from the clock at the claim's end. It dead-letters stale notices with one `SKIP LOCKED` sweep, re-checks a
  PROOF before claiming it, and returns `mail_locale`. The sealed `backup_email_claim_notice`,
  `mfa_recovery_claim_notice` and `identity.mail_locale_of_mfa_claim` keep their grants for the release before.
- `[NV-07]` the restore fence: the singleton table `identity.restore_fence` (the database half of the fence; no grant,
  listed as a mutable exception) and `identity.restore_fence_begin_v1()`,
  `identity.restore_fence_settle_v1(text,text)` (both SECURITY DEFINER, `search_path=pg_catalog, pg_temp`, EXECUTE
  for `debateai_authorization_runtime` only) and `identity.restore_fence_release_public_hold_v1(text)` (SECURITY
  INVOKER, no grant: the owner's call as postgres). All are owned by `identity.authenticate_session_t9`'s owner, which
  must be a superuser (the DO block refuses otherwise). The settle compares the API host's fence file with the row
  under the row lock. On a mismatch it revokes every long-lived bearer and sets the public read hold, and in every
  case it advances the token.
- `[NV-17]` `identity.password_reset_retry_lock` (one counter row per account: `attempts`, `locked_until`; its `user_id`
  references `identity."user"` `ON DELETE CASCADE`; owned by `debateai_password_reset_owner`, a `reject_truncate`
  guard and no grantee) with `identity.password_reset_start_guarded(bytea,uuid,uuid[],jsonb,text,text,jsonb,jsonb,bigint)`,
  `identity.password_reset_proof_reserve(text,jsonb,bigint)`, `identity.password_reset_proof_refused(text,jsonb)` and
  `identity.password_reset_complete_guarded(text,text,uuid,jsonb,bigint,bigint,jsonb)`, owned by
  `debateai_password_reset_owner` (SECURITY DEFINER, `search_path=pg_catalog, pg_temp`, EXECUTE for
  `debateai_password_reset_runtime` only): under the account's subject lock the reservation charges the counter
  before the code is matched, across every attempt however it closes; each fifth reservation locks new starts and
  further proofs for `p_lock_ms` (60 000 to 3 600 000, else `PASSWORD_RESET_LOCK_INVALID`) doubled per round, at most
  24 hours. A refused reservation closes nothing; the settle of a mismatch closes the attempt `REFUSED` at the cap or
  under the lock, and the guarded complete deletes the account's row on `COMPLETED`. The guarded start writes the
  delegate's own `started` denial while the lock is live and otherwise delegates to 0108's sealed
  `identity.password_reset_start`; 0104/0108's start, read, failure and complete keep their grants for the release
  before.
- `[NV-13]` three installer-owned SECURITY DEFINER functions with `search_path=pg_catalog, pg_temp`:
  `identity.create_social_account_v2(jsonb,jsonb)` (EXECUTE for `debateai_billing_runtime` only),
  `identity.finish_social_callback_v2(jsonb,jsonb)` (EXECUTE for `debateai_authorization_runtime` only) and
  `identity.require_social_password_origin_v2()` (no EXECUTE grant), plus one reviewed swap of `social_password_origin`
  and `social_password_origin_link` onto the new origin function, which also admits a NULL-password, link-less
  `pending_verification` row (same names, tables, events and deferral; the section's `triggers` entry digests both
  bindings): an untrusted typed-email sign-up links no provider, whether the typed address was registered or free, and
  the callback answers a link to a `pending_verification` account like no link. The 0101, 0112 and 0116 functions keep
  their grants for the release before.
- `[NV-02]` `erasure_reconcile.fail_account_erasure_notification(uuid,uuid,text)` (owned by the migration owner, like
  0040's fail and the trusted appender `identity.append_audit_event_internal` it calls; SECURITY DEFINER,
  `search_path=pg_catalog`, EXECUTE for `debateai_erasure_runtime` only, plus that role's USAGE on the schema, which
  NV-08's `schemas` entry digests): the erasure-notice fail with a terminal state. `MAIL_RECIPIENT_UNDELIVERABLE`,
  which only the reconciler raises from its own pre-send check of the decrypted address, dead-letters at once; any
  other code dead-letters only from the 10th attempt and only while the user's erasure is PREPARED; every other
  failure re-queues 30 s doubling per attempt, at most 1 h. A dead letter keeps the claim token and sets
  `acknowledged_at` with `last_error_code` `DEAD:<code>` (no column is added: 0116 digests this table), so 0040's
  claim and readiness and 0110's FINALIZE read the row as settled, and appends an identifier-free
  `identity.account.erasure_notice_dead_lettered` audit event (target the erasure, actor the user's audit token, as
  FINALIZE's `identity.account.erased`) that survives FINALIZE. 0040's fail keeps its grant for the release before.
- `[NV-14]` `identity.consume_verification_set_password(text,timestamptz,jsonb,text)`, owned by the installer (as
  0096's `identity.consume_verification_with_audit` is; the section asserts that owner, and that it owns
  `identity.social_identity`; SECURITY DEFINER, `search_path=pg_catalog`, STRICT, EXECUTE for `debateai_runtime`,
  which its member roles inherit, and no PUBLIC row): the installed consume (0096's body with 0100's two `replace()`
  rewrites) that, on every valid consume (the `pending_verification` verification and the `pending_mfa` mail resume),
  also writes the password hash the new release's verify route checked against the registration policy, and on the
  `pending_verification` transition only deletes every `identity.social_identity` row on the account and appends one
  `identity.social.UNLINK` event when a row went. 0096's function is unchanged and keeps its grant for the release
  before and for a request without a password.
- `[NV-30]` `erasure_reconcile.prepare_private_run_erasure(uuid,uuid,uuid,uuid,text)` (owned by the migration owner,
  like 0123's `core.prepare_private_run_erasure` and `core.private_erasure_run_chain` it calls; SECURITY DEFINER,
  `search_path=pg_catalog, pg_temp`, EXECUTE for `debateai_erasure_runtime` only, plus that role's USAGE on the schema,
  which NV-08's `schemas` entry digests): the private-debate delete's entry point. It repeats 0123's nonlocking
  preauthorization and answers `NOT_FOUND` before taking any lock. It then tries the named run's content lease as a
  transaction lock, answering `CONTENDED` when the lease is held, as 0123 does for the chain's other runs. Finally it
  delegates to 0123's `core.prepare_private_run_erasure`, which keeps its grant for the release before.
- `[NV-41]` `identity.prune_consumer_passkey_challenges_evicting(integer)` and `identity.prune_social_flows_evicting(integer)`,
  each owned by the owner of the cleanup it supersedes (0098's `prune_consumer_passkey_challenges`, 0101's
  `prune_social_flows`, read when the step applies; SECURITY DEFINER, `search_path=pg_catalog, pg_temp`, EXECUTE for
  `debateai_authorization_runtime` only): the cleanups the new release's passkey and social begins run as a standalone
  statement first. Under the same capacity lock each deletes what the old cleanup deletes, then, once the store holds
  the high-water mark `capacity - GREATEST(1, capacity/256)` (8,160 at 8,192), gives up candidates down to the
  low-water mark `capacity - GREATEST(1, capacity/64)` (8,064), heaviest source first, oldest first, locked in that
  order with `SKIP LOCKED`. Candidates are anonymous pending rows only (passkey `user_id IS NULL AND consumed_at IS
  NULL`; social `purpose='LOGIN' AND claimed_at IS NULL AND consumed_at IS NULL`), re-checked by the DELETE. The begins
  and the old cleanups are unchanged and keep their grants for the release before, which behaves as today while only it
  takes traffic.
- `[NV-09]` `erasure_reconcile.account_erasure_preview(uuid)` and
  `erasure_reconcile.prepare_account_erasure(uuid,uuid[],uuid[],uuid[])` (owned by the migration owner, like their
  `identity.*` counterparts; SECURITY DEFINER, `search_path=pg_catalog`, EXECUTE for `debateai_erasure_runtime` only,
  plus that role's USAGE on the schema, which NV-08's `schemas` entry digests): copies of 0040's preview and 0110's
  PREPARE that also admit an owner the age gate froze after scheduling; PREPARE skips such an owner's expired orphan
  run-key intents and its COMPLETION notices. The `identity.*` pair keeps its grant for the release before.
- `[NV-39]` `identity.password_reset_admit_evicting(jsonb,bigint)` (owned by `debateai_password_reset_owner`),
  `identity.mfa_recovery_admit_evicting(jsonb,bigint)` (owned by `debateai_mfa_recovery_owner`) and
  `identity.backup_email_admit_evicting(uuid,text,jsonb,bigint)` (owned by `debateai_backup_email_owner`), each SECURITY
  DEFINER with `search_path=pg_catalog, pg_temp` and EXECUTE only for the matching recovery runtime
  (`debateai_password_reset_runtime`, `debateai_mfa_recovery_runtime`, `debateai_backup_email_runtime`): the three
  recovery source-window admits the new release's repositories call, keyed by the caller's /64 for IPv6 (the address
  digest stays the audit and risk evidence). Each is its 0104/0106/0105 admit, except that a new source at the 65,536-row
  capacity no longer refuses: under the v1 capacity lock it ranks 64 candidates in a sub-select with no row marks (one
  scan, a 64-row top-N sort; expired first, then budget left before spent, then the lowest count, then the oldest),
  locks only those with `SKIP LOCKED` and deletes them, so the next 63 new sources find room without a scan; it refuses
  only when all 64 are locked at that instant. The v1 admits keep their grants for the release before, which still
  refuses a new digest at capacity.
- `[NV-50]`, the LAST section: no function and no relation. On `ledger.model_spend` it replaces 0074's shared
  `model_spend_spend_source_check` (last widened by 0118) in place, wider, by name, with the two new sources
  `RUN_UNANSWERED` and `STORY_UNANSWERED`, and adds `model_spend_unanswered_names_its_attempt` (an unanswered row names
  its run and its attempt and carries no phase). Each is a reviewed `DROP CONSTRAINT IF EXISTS` / `ADD … NOT VALID`
  pair, and a `DO` block checks both constraints and 0066's two append-only guards. The new release's gateway charges
  an attempt that was sent and never answered as one of these sources, at its reported usage or else its projected
  maximum; the run's or story's envelope and the site's day count it, and no person reader does. The loader's
  `constraints` entry digests the new restriction only: the shared list stays unpinned (W-0117), and a later
  contract step validates both. It stays last because the pair takes ACCESS EXCLUSIVE on `ledger.model_spend` until
  0125 commits, so every spend read and write of the release before waits for the rest of the step.

While the branch is open, each issue inserts its section, its entry in `SECTIONS` (keeping every earlier entry) and
its bullet above just before `[NV-50]`'s, which stays last, recomputes `migration.sha256` with the one-liner at the end of this file, and extends the
chain's tests; once the step is applied anywhere, 0125 is never edited again. If `origin/dev` takes 0125 first,
renumber this step (rename every file and constant that carries the number, recompute the manifest, re-pin the chain
lists).

## Recovery notice due indexes (0126-0128)

The sixteenth, seventeenth and eighteenth chain steps, after the security fixes of audit run 3 (0125; security audit run
3, NV-38): the pending-only due indexes of the three recovery mail outboxes, in the shape 0103 gives
`identity.password_recovery_notice` (`(available_at, created_at, notice_id) WHERE sent_at IS NULL AND dead_at IS NULL`),
so that every claim on them, the release before's and this release's alike, reads only pending rows instead of the
whole retained history:

- `0126_password_reset_notice_due.sql`, `password-reset-notice-due-forward0126.json`,
  `packages/db/src/migration-forward0126.ts` (`loadForward0126`, `MIGRATION_FORWARD0126_*` refusals):
  `identity.password_reset_notice_due`;
- `0127_backup_email_notice_due.sql`, `backup-email-notice-due-forward0127.json`,
  `packages/db/src/migration-forward0127.ts` (`loadForward0127`, `MIGRATION_FORWARD0127_*`):
  `identity.backup_email_notice_due`;
- `0128_mfa_recovery_notice_due.sql`, `mfa-recovery-notice-due-forward0128.json`,
  `packages/db/src/migration-forward0128.ts` (`loadForward0128`, `MIGRATION_FORWARD0128_*`):
  `identity.mfa_recovery_notice_due`.

Each header declares `-- n1: expand`, `-- n1: keeps-verifier` and `-- n1: outside-transaction`, and each body is ONE
`CREATE INDEX CONCURRENTLY IF NOT EXISTS <name> ON identity.<table> …`. They cannot be sections of 0125: `CREATE INDEX`
without `CONCURRENTLY` on an existing table is refused in an expand step (step 7 above), and PostgreSQL refuses a
concurrent build inside a transaction block, which every other step runs in. `CONCURRENTLY` takes SHARE UPDATE
EXCLUSIVE only, so the release before keeps reading and writing the tables during a build. `migrate()` builds each
index on its session first (One transaction per step, below), then records the step in a step transaction that refuses
`MIGRATION_OUTSIDE_TRANSACTION_INDEX_INVALID` unless the index is valid and on its table; a build that ran out of its
lock waits leaves an INVALID index, which the next run drops concurrently and builds again. The three steps share one
loader, `packages/db/src/migration-forward-concurrent-index.ts` (`loadConcurrentIndexStep`): it checks the manifest as
`loadForward0124` does, refuses `MIGRATION_FORWARD01NN_INDEX_DECLARATION` unless the header's index is the step's own,
and has no `replayVerifierSql`: the postcondition is the index row whole (its definition, valid, ready, not unique, its
owner). Each step keeps the verifier 0125 names (`verify-effective-capabilities-111.sql`), so its manifest names it as
both `previous.verifierSha256` and its own. A later index step on an existing table is one more such file, manifest and
three-line loader on the shared one (NV-15's `mfa_recovery_control_user_started`, 0129 below, is the next).

A test seed that applies steps with `applyForwardStep` inside one transaction (`tests/support/devLineage108.ts`,
`seedDevLineageThroughStep`) cannot seed through 0126 or later: nothing builds the index, so the step is refused
`MIGRATION_OUTSIDE_TRANSACTION_INDEX_INVALID`. Such a seed stops at 0125, or runs `runOutsideTransactionStep` first.

**Re-sealing after a 0125 change.** Each manifest's `previous.manifestSha256` is the SHA-256 of the manifest of the
step before it, so any change to 0125 (a new section, then its `migration.sha256`) changes 0125's manifest and refuses
0126 (`MIGRATION_FORWARD0126_MANIFEST`), and with it 0127, 0128 and 0129. After the last 0125 edit, recompute 0125's
`migration.sha256`, then `previous.manifestSha256` of 0126, then of 0127, then of 0128, then of 0129 (NV-15's index
step, below; and of any later step after it), in that order. From the project root, this one command does all of it and prints
each manifest it re-chained:

```
node -e 'const fs=require("node:fs"),h=b=>require("node:crypto").createHash("sha256").update(b).digest("hex"),L="migrations/lineage/",all=fs.readdirSync(L).filter(f=>f.endsWith(".json")).map(f=>({f,m:JSON.parse(fs.readFileSync(L+f,"utf8"))})),put=e=>fs.writeFileSync(L+e.f,JSON.stringify(e.m,null,2)+"\n");let e=all.find(x=>x.m.migration?.name==="0125_security_fixes_run3.sql");e.m.migration.sha256=h(fs.readFileSync("migrations/"+e.m.migration.name));put(e);for(let n;(n=all.find(x=>x.m.previous?.name===e.m.migration.name));e=n){n.m.previous.manifestSha256=h(fs.readFileSync(L+e.f));put(n);console.log("re-chained",n.f);}'
```

If 0125 ever names a verifier of its own, set each later manifest's `previous.verifierSha256` and `verifier` to it too.
If `origin/dev` takes 0126, 0127 or 0128 first, renumber these steps (rename every file and constant that carries the
number, recompute the manifests, re-pin the chain lists).

## The MFA recovery control user index (0129)

The nineteenth chain step, after the recovery notice due indexes (0126-0128; security audit run 3, NV-15 and NV-16):
`identity.mfa_recovery_control_user_started` on `identity.mfa_recovery_control (user_id, email_expires_at)`. NV-15's
account-level count of unpaired link-password failures and its latest pairing (`identity.mfa_recovery_record_failure`)
and NV-16's per-destination start count (`identity.mfa_recovery_start_bounded`) read the table by `user_id`, which no
other index leads with (the only one is 0112's partial `mfa_recovery_control_one_waiting`), and the table only grows
(rows go only with erasure and the FK cascade). The second column bounds both counts' `email_expires_at` test. Neither
plan's SQL changes: the index only serves their reads.

- `0129_mfa_recovery_control_user_started.sql`, `mfa-recovery-control-user-started-forward0129.json`,
  `packages/db/src/migration-forward0129.ts` (`loadForward0129`, `MIGRATION_FORWARD0129_*` refusals):
  `identity.mfa_recovery_control_user_started`.

It is shaped like 0126-0128 (above): its header declares `-- n1: expand`, `-- n1: keeps-verifier` and
`-- n1: outside-transaction`, its body is ONE `CREATE INDEX CONCURRENTLY IF NOT EXISTS …`, its three-line loader runs on
the shared `packages/db/src/migration-forward-concurrent-index.ts` (the postcondition is the index row whole, and there
is no `replayVerifierSql`), and its manifest names 0111's verifier (`verify-effective-capabilities-111.sql`) as both
`previous.verifierSha256` and its own. Its `previous` is 0128, so its `previous.manifestSha256` is the SHA-256 of
`mfa-recovery-notice-due-forward0128.json`: a change to 0125 re-chains it too, and the one-liner of "Re-sealing after a
0125 change" (above) walks to it by `previous.name`. If `origin/dev` takes 0129 first, renumber this step (rename every
file and constant that carries the number, recompute the manifest, re-pin the chain lists).


## Replay: every applied step keeps its own checks

On a later `migrate()` EVERY applied step is checked by its receipt and by its postcondition digest (not only the
last one: after 0112, 0111's billing objects stay digest-checked), and every applied step that declares one runs its
own `replayVerifierSql` (the batch: `verify-auth-db-batch.sql`); both run again after each step a run applies, with
that step included, before that step's COMMIT — so a step's promises (for example the batch's "no runtime may publish
staff alert readiness") are still enforced after other steps are appended. A later step that deliberately
changes something an earlier step's verifier pins must change that verifier through its own reviewed step design; it
cannot silently pass. The effective-capability verifier of the last applied step (after 0129: 0111's, which the batch,
Part C's step, role rotation, the data export, the mail locale, the debate shape map, the language check's site cost,
the reclaim resume, the reply measures, the engine verdict, the engine's map answer step, the side-by-side releases,
the settings activation, the security fixes of audit run 3, the three recovery notice due indexes and the MFA recovery
control user index keep) still runs
at the end of every `migrate()`.

## One transaction per step (side-by-side §5)

`migrate()` no longer applies every pending step in one transaction (side-by-side uploads, spec
`docs/superpowers/specs/2026-10-21-side-by-side-uploads-design.md` §5, "Each step runs on its own"; plan A, task A6).
It takes the `debateai:schema-migrations` advisory lock for its session (tried with `pg_try_advisory_lock` every 50 ms,
holding no snapshot between tries, so a waiting migrator never deadlocks with a concurrent index step; released in `finally`;
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
