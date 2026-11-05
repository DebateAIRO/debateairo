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
below) the fourth, the data export (0115, V-41) the fifth, the mail locale (0116, below) the sixth, the debate shape's map (0117, below) the seventh, the language check's site cost (0118, below) the eighth, the reclaim resume (0119, below) the ninth, the reply measures (0120, below) the tenth, the engine verdict (0121, below) the eleventh, the engine's map answer step (0122, below) the twelfth, the side-by-side releases (0123, below) the thirteenth, the settings activation (0124, below) the fourteenth, the Italy-specific approval (0125, below) the fifteenth, the synthesis check (0126, below) the sixteenth, the publication review (0127, below) the seventeenth, the threat reports (0128, below) the eighteenth, the support answer scope (0129, below) the nineteenth, row-level security (0130, below) the twentieth, the V4 account memory (0131, below) the twenty-first, the web evidence store (0132, below) the twenty-second, the investigations (0133, below) the twenty-third, the dig model with the month pause (0134, below) the twenty-fourth, the dig picks (0135, below) the twenty-fifth, the investigation reports (0136, below) the twenty-sixth, the public debates (0137, below) the twenty-seventh, the tree updates (0138, below) the twenty-eighth, the passage retention (0139, below) the twenty-ninth, the funded spend kinds (0140, below) the thirtieth, the path suggestions (0141, below) the thirty-first, the team's one limit (0142, below) the thirty-second, the hand-over (0143, below) the thirty-third, the small AI's quota charge (0144, below) the thirty-fourth, the pages waiting after "Add to researched" (0145, below) the thirty-fifth, the Owner's allowances for team members (0146, below) the thirty-sixth, the public tree (0147, below) the thirty-seventh, an erased account keeping its public debates (0148, below) the thirty-eighth, a funded person's public report in the team's month (0149, below) the thirty-ninth, a public debate under review (0150, below) the fortieth, the Report button with the sealed originals' six months (0151, below) the forty-first and a reporter's own reports in their export with what the AI checks on public rows used (0152, below) the forty-second, a finished dig's mark (0153, below) the forty-third, Iceland and Liechtenstein in the Region list (0154, below) the forty-fourth, the owner's two writes on their own answer (0155, below) the forty-fifth, the small AIs before Start in the person's quota (0156, below) the forty-sixth, the chosen paths sealed per run (0157, below) the forty-seventh, the path results per run (0158, below) the forty-eighth, the path progress per run (0159, below) the forty-ninth, the saved questions (0160, below) the fiftieth. A step is added with new files only; NNNN is its number, the step before's number plus one:

1. `migrations/NNNN_<name>.sql`: the SQL, forward-only and replayable.
2. A manifest in `lineage/`, shaped like `billing-netopia-forward111.json`: its version, the recipe's SHA-256,
   `previous` = the name, manifest SHA-256 and EFFECTIVE verifier SHA-256 of the step before (after 0152: 0152,
   `report-export-forward0152.json`, and `verify-effective-capabilities-130.sql`, which supersedes 0111's, which
   0112 to 0129 keep; 0131 to 0152 keep 0130's),
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

## The synthesis check (0126)

The sixteenth chain step, after the Italy-specific approval's 0125, is `0126_synthesis_check.sql` with
`synthesis-check-forward0126.json` and `packages/db/src/migration-forward0126.ts`. Its loader is appended to
`STEPS` and refuses altered inputs with `MIGRATION_FORWARD0126_` codes. It has no supplemental
`replayVerifierSql`; the effective `verify-effective-capabilities-111.sql` stays in force. Its postcondition
records its own seven tables: `serve.synthesis_check_request`, `serve.synthesis_check_attempt`,
`serve.synthesis_check_result`, `serve.synthesis_check_inheritance`,
`serve.synthesis_check_removal_request`, `serve.synthesis_check_removal_notice` and
`identity.synthesis_check_erasure_binding`, plus its own functions, triggers and constraint. It widens the
model-spend source list with `SYNTHESIS_CHECK` and grants the three erasure functions only to
`debateai_erasure_runtime`. If an earlier pending step takes 0126 first, renumber this step and recompute
its manifest and chain pins before merge.

## The publication review (0127)

The seventeenth step adds the request, decision and transient reviewer-copy tables in serve, plus the staff review event table.
It extends the staff capability and staff-action lists and installs two sever triggers so key destruction removes the run-linked review rows.
The Ask consumes a PUBLISH grant; no identity step-up object changes.
Its manifest is `publication-review-forward0127.json`, and its loader is `packages/db/src/migration-forward0127.ts`.
It keeps the previous effective verifier because it adds no billing relation or function.
A hosted deploy applies it with `pnpm db:migrate`.

## The threat reports (0128)

The eighteenth chain step, after the publication review's 0127 (synthesis-flag S04, `docs/missions/synthesis-flag/slices/S04/SPEC-v8.md` §5a): `0128_threat_reports.sql`, `threat-reports-forward0128.json`, `packages/db/src/migration-forward0128.ts` (`loadForward0128`, appended last to `STEPS`, `MIGRATION_FORWARD0128_` refusals).
It creates `staff.threat_report`, `staff.threat_report_event`, `staff.threat_report_alert`, eleven staff and export functions, and two ledger functions for the question-check spend writer and its invoker trigger.
The eight shared objects it changes are `model_spend_spend_source_check`, `subject_capabilities_check`, `staff.valid_capabilities`, `staff.authorize_action`, `staff.owned_action_allowed`, `staff.begin_owned_webauthn`, `staff.commit_owner_command` and `staff.read_audit_page`; it pins none of them (W-0117).
`verify-effective-capabilities-111.sql` stays the verifier in force; there is no `replayVerifierSql`.
If an earlier pending step takes 0128 first, renumber this step, recompute its manifest and re-pin the chain lists before merge.

## The support answer scope (0129)

The nineteenth step, after the threat reports (0128), is `0129_support_answer_scope.sql` with
`support-answer-scope-forward0129.json` and `packages/db/src/migration-forward0129.ts`.
It revokes `INSERT` on the fourteen support conversation and model-call tables from `debateai_support`.
It deletes every row in those tables and `support.shred_audit` in dependency order, with the thirteen
0065 mutation and delete guards temporarily disabled, then makes `support.support_shred_row_guard`
immediate and restores all thirteen guards. The terminal block checks the guards, the seventeen
truncate guards, the revoked privileges and empty tables. Its catalog-only postcondition binds
the support relation grants and guard definitions without retaining a row count: a later owner
seed followed by `migrate()` does not drift. The effective verifier remains
`verify-effective-capabilities-111.sql`; there is no `replayVerifierSql`. If an earlier pending
step takes 0129 first, renumber it and recompute the manifest and `STEPS` chain pins.

## Row-level security (0130)

The twentieth chain step, after the support answer scope's 0129 (mission row-level-security, slice S01:
`docs/missions/row-level-security/slices/S01/SPEC-v4.md`, `PLAN.md` steps S1.3-S1.6, `DECISIONS.md` D27-D33 and D38;
ADR-0033): `0130_row_level_security.sql`, `row-level-security-forward0130.json`,
`packages/db/src/migration-forward0130.ts` (`loadForward0130`, appended last to `STEPS`, `MIGRATION_FORWARD0130_*`
refusals). It enables row security (never forced) on the 115 in-scope tables, each with two permissive `FOR ALL`
policies: `rls_account` `TO debateai_runtime` (the per-account predicate of D32, `USING` = `WITH CHECK`) and
`rls_all_accounts` `TO` the eleven cross-account roles of D29 (`true`); it sets `security_invoker = true` on the three
in-scope views and moves `core.run_waiting_v`'s SELECT from `debateai_runtime` to `debateai_billing_runtime` (D33); and
it adds the schema `rls` (USAGE for `debateai_runtime` only) with five `STABLE SECURITY DEFINER` functions on
`search_path = pg_catalog` (`rls.session_credential_hash()`, callable by no role; `rls.context_user_id()`,
`rls.context_owner_ref()`, `rls.owns_run(uuid)`, `rls.owns_execution_ref(text)`, EXECUTE for `debateai_runtime`), which
derive the account from the session token in the setting `debateai.session_credential` by looking its hash up in
`identity.session`, and the NOLOGIN NOINHERIT marker role `debateai_rls_all_accounts` (no member until the provisioners
grant it to the system logins). Its postcondition digests, for every in-scope table, `relrowsecurity`,
`relforcerowsecurity` and every policy (name, command, roles, permissive flag, `USING`, `WITH CHECK`), the views'
options and ACLs, the five functions whole and the marker's attributes, so any unrecorded change refuses
`MIGRATION_FORWARD_CHAIN_POSTCONDITION_DRIFT 0130_row_level_security.sql`. No supplemental verifier, so no
`replayVerifierSql`.

Two earlier promises change by design, each by a recorded mechanism (D38; Ruling R-10, F-C1-1). (1) Seven earlier
postconditions digest the row-security flag of twenty-three tables (0111: its eight in-scope NETOPIA tables
`billing.card_token`, `billing.card_token_revocation`, `billing.hosted_payment`, `billing.notice_quarantine`,
`billing.payment_notice`, `billing.payment_notice_outcome`, `billing.payment_notice_raw`, `billing.status_read`; 0117: `core.map_choice`, `core.map_item`, `core.map_position`; 0119:
`core.map_position_repoint`; 0121: `ledger.point_investigation`, `ledger.verdict_vote`; 0122: `core.map_answer_check`,
`core.map_item_rests_on`; 0123: `core.run_supersession`, `ledger.model_spend_waiver`; 0126: the five `serve.synthesis_check_*` tables below). The step declares them in
`amendsPostconditionsOf` (loader and manifest, which must agree, else `MIGRATION_FORWARD0130_MANIFEST`), and
`applyForwardStep` stores one row per amended step in the migrator-private table
`public.debateai_schema_migration_step_amendment` (`source_name`, `amended_by`, `amendment` jsonb,
`postcondition_evidence_digest`, `recorded_at`; primary key `(source_name, amended_by)`; created on first use by
`replayForwardChain` and checked like the declaration table, `MIGRATION_FORWARD_CHAIN_AMENDMENT_ACL`) with that step's
digest re-measured right after 0130's SQL; from then on each amended step is compared against its latest amendment,
so any later unrecorded change to its objects, the flag included, still refuses `POSTCONDITION_DRIFT <step>`. An
amendment of a step not yet applied refuses `MIGRATION_FORWARD_CHAIN_AMENDMENT_ORDER`, and a row whose `amended_by` is
not an applied step refuses `MIGRATION_FORWARD_CHAIN_AMENDMENT_BINDING_DRIFT`. (2) 0111's verifier refused row security
on its NETOPIA tables; `verify-effective-capabilities-130.sql` supersedes it (R34), a byte copy except line 217 (its
comment) and line 221, where `OR c.relrowsecurity` becomes `OR c.relrowsecurity IS DISTINCT FROM (v_name <> 'tool_order')
OR c.relforcerowsecurity`: the eight in-scope NETOPIA tables must have row security on and not forced, and
`billing.tool_order` (out of scope, R3) must keep none. So the header declares `-- n1: drained` (uploaded with no debate
waiting or running, V-1: an expand step may not change row security) and no `-- n1: keeps-verifier`. `origin/dev`
took 0124 and 0125 first, so this step was renumbered from 0124 to 0126 at its merge (every file and constant that
carries the number, the manifest recomputed, the chain lists re-pinned); mission synthesis-flag then took 0126 to 0129,
so it was renumbered again, to 0130, at its merge onto that dev (2026-10-28). That merge added the five
`serve.synthesis_check_*` tables 0126 grants `debateai_runtime` SELECT on to the in-scope set (113 to 118 relations; each
keyed on its run, K4) and V-18's guard on `serve.synthesis_check_attempt.request_id`.

## The V4 account memory (0131)

The twenty-first step, after row-level security (0130), is `0131_v4_account_memory.sql` with
`v4-account-memory-forward0131.json` and `packages/db/src/migration-forward0131.ts` (`loadForward0131`, appended
last to `STEPS`, `MIGRATION_FORWARD0131_` refusals). Owner rulings N7 and N11 (2026-10-29, test-site release R22):
the V4 pages keep the reading level, each debate's last visit and each dig's link in the account, never in the
browser. It creates `identity.page_reading_level`, `identity.debate_last_visit` and `identity.dig_link`, each keyed
by the account's `owner_ref` with `ON DELETE CASCADE` (account erasure deletes the `identity."user"` row, so the
rows go with it), and nine functions: six for the API's own role `debateai_billing_runtime` (never the shared
runtime role), a private ownership helper, `identity.forget_erased_debate_page_memory(uuid)` for
`debateai_erasure_runtime` (R22 item 16: deleting one private debate also deletes its visit row and every dig link
where it is the parent or the child, in the transaction that writes the run's erasure tombstone, called by
`packages/db/src/erasure-page-memory.ts` from both finalize paths), and the export reader
`identity.read_data_export_page_memory(uuid,uuid)` for `debateai_data_export_worker` behind 0128's lease gate.
Tables and functions take 0115's export owner, as 0125's export reader does. Its postcondition records its own three
tables and nine functions. It declares `-- n1: expand` (new objects only; the erasure role's one new grant changes
the count the erasure boot check expects, which R22's drained upload makes moot) and `-- n1: keeps-verifier`: `verify-effective-capabilities-130.sql` (0130's) stays the
verifier in force and there is no `replayVerifierSql`. Row-level security (0130) leaves the three tables outside its
scope rule: no request role (`debateai_billing_runtime`, `debateai_authorization_runtime`) can SELECT them (every
role's table rights are revoked; only the definers, owned by the migrator as 0115's export owner, read and write them),
so row security stays off on them, as on every out-of-scope table, and the step stays expand-only. Written as 0130, it
was renumbered to 0131 at the merge of `origin/dev` 64ef40c21 (2026-10-30), whose row-level security took 0130 first
(C1's recipe: every file and constant that carries the number, `previous` now 0130's manifest and its verifier, the
manifest digests recomputed, the chain lists re-pinned). If an earlier pending step takes 0131 first, renumber this
step again by the same recipe before merge.

## The web evidence store (0132) and investigations (0133)

The twenty-second and twenty-third steps, after the V4 account memory (0131), carry the Perplexity plan's storage
(`docs/superpowers/plans/2026-10-30-perplexity-and-dig-map.md`, task W1-3; the owner's answers of 2026-10-29/30 override
it): `0132_web_evidence.sql` with `web-evidence-forward0132.json` and `packages/db/src/migration-forward0132.ts`
(`loadForward0132`, `MIGRATION_FORWARD0132_` refusals), then `0133_investigations.sql` with
`investigations-forward0133.json` and `packages/db/src/migration-forward0133.ts` (`loadForward0133`,
`MIGRATION_FORWARD0133_` refusals), appended in that order to `STEPS`. Each declares `-- n1: expand` (new tables and
functions only; the erasure role's one new function each changes the count its boot check expects, which R22's drained
upload makes moot, as 0131's did) and `-- n1: keeps-verifier`: no billing relation or function (the reserve lives in the
identity schema), so `verify-effective-capabilities-130.sql` stays in force and neither has a `replayVerifierSql`.

0132 keeps one debate's web step: `identity.web_search`, `identity.web_page`, the transient `identity.web_page_text`,
`identity.web_reading`, `identity.web_extract`, `identity.web_pick`, `identity.web_pack` and
`identity.web_researched`. Six of them are run content carriers (`CONTENT_CARRIERS` in `packages/crypto`): the search
words, a page's address, site, title and date, its whole text, a reading's line, an extract's quote and a pack are
encrypted under the run's key and attested by the runner; one trigger refuses a run without content encryption, an
erased run and a wrong attestation, so no web text is ever plaintext. The page text lives only in its own table: a
reader prompt kept in `ledger.call_prompt` names a page by its id and keyed digest (`webPageTextRef`,
`packages/db/src/web-evidence.ts`), never its text. 0133 keeps `identity.investigation`,
`identity.investigation_member` (the server-side dig parent; joining writes 0131's `identity.dig_link` too),
`identity.investigation_closing` (one row per report version, kept when the investigation reopens) and
`identity.investigation_reserve_event` (the person's one reserve as an event list: HELD, USED, RELEASED, BLOCKED until
the limit that ran out resets). Closing an investigation wipes its page texts in the same transaction, and the
scheduler's sweep wipes them 30 days after the investigation's last activity even while it is open.

Every row of both names its account's `owner_ref` with `ON DELETE CASCADE`, so account erasure removes them; deleting one
private debate calls `identity.forget_erased_debate_investigation(uuid)` and
`identity.forget_erased_debate_web_evidence(uuid)` for `debateai_erasure_runtime` in the finalize transaction, beside
0131's (`packages/db/src/erasure-page-memory.ts`). The export worker reads both through 0128's lease gate. Tables and
definers take 0115's export owner, as 0131's do; no role holds a table right, so row-level security (0130) leaves them
outside its scope rule and the steps stay expand-only. If an earlier pending step takes 0132 or 0133 first, renumber
these steps by the same recipe before merge (C1's: every file and constant that carries the number, `previous`, the
manifest digests, the chain lists).

## The dig model and the month pause (0134)

The twenty-fourth step, after the investigations (0133), carries the new dig model's storage and the money rule's
month pause (`docs/superpowers/plans/2026-10-30-dig-model-revision.md`, task W2-8 and "The money rule (owner, 31 Oct
2026)"): `0134_dig_model_and_month_pause.sql` with `dig-model-forward0134.json` and
`packages/db/src/migration-forward0134.ts` (`loadForward0134`, `MIGRATION_FORWARD0134_` refusals), appended last to
`STEPS`. It declares `-- n1: expand` (new tables and functions; `ledger.model_spend`'s shared source list re-added NOT
VALID with `PATH_REWRITE`, and that source's own run rule NOT VALID; the erasure role's one new function changes the
count its boot check expects, which R22's drained upload makes moot) and `-- n1: keeps-verifier`: no billing relation
or function, so `verify-effective-capabilities-130.sql` stays in force and it has no `replayVerifierSql`.

It keeps `identity.investigation_dig_level` (each dig's level, 1..10; the first debate is 0 and has no row; the members
0133 already held are filled in by walking their parents), `identity.path_rewrite_turn` (a settled dig's place in the
line of rewrites of the path it was dug from), `identity.path_rewrite` (one rewrite per dig, insert-once: outcome,
fates, the verdict's codes and lineage in clear; the path's new text, "What the dig changed", the verdict's reason and the
dig's own paths only in an envelope under the dig's run key, a `CONTENT_CARRIERS` entry) and
`identity.web_plan_path` (the search planner's decision for each path of a run, written once: PLANNED,
NO_SEARCH_PLANNED with its reason sealed under the run's key and checked by 0132's content trigger, NOT_ON_PLAN,
SWITCHED_OFF or FAILED, and the searches it sends) and `identity.run_pause_event` (PAUSED at the month wall with its reset and the planned work left, RESUMED on the person's
Continue). 0133's member table and join function are NOT altered or revoked: 0133's postcondition digests that table's
columns and the join's grants, so the level is a table of its own and `identity.join_investigation_nested` supersedes
the join (TOO_DEEP at level 11, under 0133's two locks); no source calls 0133's join any more. Day and week borrowing
keeps no record: it is derived from the spend windows (`packages/db/src/dig-model.ts`).

Every row names its account's `owner_ref` with `ON DELETE CASCADE`; deleting one private debate calls
`identity.forget_erased_debate_dig_model(uuid)` in the finalize transaction after 0133's (an erased dig takes its own
rewrite and turn; an erased debate the rewrites of its paths; a dig's level goes with its 0133 member row). The export
worker reads `identity.read_data_export_dig_model(uuid,uuid)` through 0128's lease gate. Tables and definers take
0115's export owner; no role holds a table right, so row-level security (0130) leaves them outside its scope rule. If
an earlier pending step takes 0134 first, renumber this step by the same recipe before merge (C1's: every file and
constant that carries the number, `previous`, the manifest digests, the chain lists).

## The dig picks (0135)

The twenty-fifth step, after the dig model (0134), carries what the path rewrite needs to run for real
(`docs/superpowers/plans/2026-10-30-dig-model-revision.md`, task W3-7: the path rewrite switched on):
`0135_dig_picks.sql` with `dig-picks-forward0135.json` and `packages/db/src/migration-forward0135.ts` (`loadForward0135`,
`MIGRATION_FORWARD0135_` refusals), appended last to `STEPS`. It declares `-- n1: expand` (three new tables and seven new
functions; no earlier function, table or trigger changes, 0132's content check is called by two new triggers and 0134's
turn and rewrite tables are only read; the erasure role's one new function changes the count its boot check expects,
which R22's drained upload makes moot) and `-- n1: keeps-verifier`: no billing relation or function, so
`verify-effective-capabilities-130.sql` stays in force and it has no `replayVerifierSql`.

It keeps `identity.dig_pick_set` (one per dig, insert-once: its parent, the path of the parent's map its picks are on,
null when they hang under the main question, and how many picks it holds), `identity.dig_pick` (each pick in the
person's order: its kind, the suggestion it chose, its place and who wrote it in clear; its text only in an envelope under
the dig's run key, a `CONTENT_CARRIERS` entry checked by 0132's content trigger) and `identity.path_rewrite_input` (the
dig's own paths as its settled run gave them to its rewrite, written once before the rewrite takes its turn, sealed the
same way, so a runner that stops mid-rewrite can build the same material again). The asks route writes the picks
(`identity.record_dig_picks`, the API's own role); the runner reads them, stores the material and lists the settled digs
whose rewrite has no row (`identity.read_unwritten_path_rewrites`, the sweep).

Every row names its account's `owner_ref` with `ON DELETE CASCADE`; deleting one private debate calls
`identity.forget_erased_debate_dig_picks(uuid)` in the finalize transaction after 0134's (an erased dig takes its own
picks and material; the digs dug from an erased debate keep theirs). The export worker reads
`identity.read_data_export_dig_picks(uuid,uuid)` through 0128's lease gate. Tables and definers take 0115's export owner;
no role holds a table right, so row-level security (0130) leaves them outside its scope rule. If an earlier pending step
takes 0135 first, renumber this step by the same recipe before merge (C1's: every file and constant that carries the
number, `previous`, the manifest digests, the chain lists).

## The investigation reports (0136)

The twenty-sixth step, after the dig picks (0135), carries the final report the runner writes over an investigation
(R22, plan task W5-1: the report the runner writes for a closing; owner answer F7 A: the report waits for the digs still
running and for their path rewrites): `0136_investigation_reports.sql` with `investigation-reports-forward0136.json` and
`packages/db/src/migration-forward0136.ts` (`loadForward0136`, `MIGRATION_FORWARD0136_` refusals), appended last to
`STEPS`. It declares `-- n1: expand` (one new table and eleven new functions; no earlier function, table or trigger
changes, 0133's `identity.record_investigation_report` is called by the new writer, not redefined, and 0133's to 0135's
tables are only read; `ledger.model_spend`'s shared source list is re-added `NOT VALID` in 0134's pattern with one more
source, `INVESTIGATION_REPORT`, whose run rule `model_spend_investigation_report_names_its_run` restricts only the new
source) and `-- n1: keeps-verifier`: no billing relation or function, so `verify-effective-capabilities-130.sql` stays
in force and it has no `replayVerifierSql`.

It keeps `identity.investigation_report` (one row per closing whose report the runner wrote, insert-once: the 0133
closing it answers, by investigation and report version, the id that closing records as its report, the
investigation's root debate, the outcome and the story's, the newest path rewrite the version covered, the dossier's
fingerprint, the ladder step and how many items were left out, the writer's and checker's lineage, rounds, artifact
refs and what it cost; its text only in an envelope under the ROOT's run key, a `CONTENT_CARRIERS` entry checked on
insert by this step's trigger in 0134's shape, 0132's checks called, not redefined). The runner lists the closings
still waiting for their report (`identity.read_unreported_closings`), reads the members a report still waits for,
writes the report (`identity.record_investigation_report_version`, which also records it on 0133's closing in the same
transaction), reads a debate's reports and when the newest closing without a report was made (the money seam sums that
closing's charges from then on); the API reads the person's reports (`identity.read_investigation_reports`, its own
role).

Every row names its account's `owner_ref` and its closing with `ON DELETE CASCADE`: an erased root takes its
investigation and closings with it (0133's `identity.forget_erased_debate_investigation`, in the finalize transaction
of the run's erasure), and so its reports; an erased dig leaves them, as they are sealed under the root's key and stay
with the root. So this step adds no deletion function and the erasure role's count is unchanged. The export worker
reads `identity.read_data_export_investigation_reports(uuid,uuid)` through 0128's lease gate. The table and ten of the
eleven definers take 0115's export owner (the content trigger keeps the migrator, as 0134's does); no role holds a
table right, so row-level security (0130) leaves it outside its scope rule. If an earlier pending step takes 0136
first, renumber this step by the same recipe before merge (C1's: every file and constant that carries the number,
`previous`, the manifest digests, the chain lists).

## The public debates (0137)

The twenty-seventh step, after the investigation reports (0136), carries digs by anyone on a public debate (R22, plan 2026-10-31-r22-owner-changes decision 13): `0137_public_debates.sql` with `public-debates-forward0137.json` and `packages/db/src/migration-forward0137.ts` (`loadForward0137`, `MIGRATION_FORWARD0137_` refusals). It declares `-- n1: expand` and `-- n1: keeps-verifier`: no earlier function, table or trigger changes, and `ledger.model_spend`'s shared source list is re-added `NOT VALID` with `PATH_CLIMB`, `ANSWER_UPDATE`, `CONTRIBUTION_CHECK` and `PUBLIC_REPORT`, whose run rule `model_spend_r22_sources_name_their_run` restricts only them.

It keeps `identity.public_contribution` (one dig on a public debate: its path, its AI check's outcome set once, and its digger, `SET NULL` on erasure so the name goes and the row stays), `identity.public_debate_update` (what an allowed contribution changed on the page, numbered per publication and sealed under the PUBLICATION's key, keyId `publication-snapshot:<ref>:v1`, so it is not a `CONTENT_CARRIERS` entry), `identity.free_public_ask` (a Free ask that showed the notice, and its outcome), `identity.public_report_writer` and `identity.public_report_charge` (who asked for a report on a public debate and who pays each of its charges). A stranger's dig joins through `identity.join_public_investigation`, which names the digger on 0133's member row; 0131's, 0133's and 0135's writers keep their one-owner rules, and the pick set's `position_ref` stays NULL so 0135's sweep and 0136's waiting list keep theirs. `core.publish_free_debate` writes the same rows as 0085's transition for a debate with no session present, making and consuming 0110's one-shot binding itself, so 0110's pinned trigger is unchanged. The erasure role calls `identity.forget_erased_debate_public(uuid)`; the export worker reads `identity.read_data_export_public_debates(uuid,uuid)` through 0128's lease gate. If an earlier pending step takes 0137 first, renumber this step by the same recipe before merge.

## The tree updates (0138)

The twenty-eighth step (decisions 2, 3, 5 and 13's report rule): `0138_tree_updates.sql` with `tree-updates-forward0138.json` and `packages/db/src/migration-forward0138.ts` (`loadForward0138`, `MIGRATION_FORWARD0138_` refusals), `-- n1: expand`, `-- n1: keeps-verifier`. 0134's `identity.path_rewrite` is one row per dig and frozen, so `identity.path_update_turn` and `identity.path_update` hold every other rewrite of a path, with its cause and turn: a CLIMB (a child rewrite really changed a path, so the path above is rewritten too) and a PUBLIC_DIG. A path's order is the time each turn was taken, under 0134's per-path lock, across both tables; `identity.record_path_rewrite_in_line` holds a dig's own rewrite to the whole line and then calls 0134's writer. `identity.main_answer_update` keeps the main answer's automatic versions, sealed under the ROOT's key, naming what triggered each and who paid; `identity.run_purpose_lines` a debate's place, time and purpose lines. Three `CONTENT_CARRIERS` entries, each checked by 0132's content trigger. `identity.close_public_investigation` and `identity.reopen_public_investigation` are the report on a public debate. The erasure role calls `identity.forget_erased_debate_tree_updates(uuid)`; the export worker reads `identity.read_data_export_tree_updates(uuid,uuid)`. If an earlier pending step takes 0138 first, renumber this step by the same recipe before merge.

## The passage retention (0139)

The twenty-ninth step (decisions 6 and 7): `0139_passage_retention.sql` with `passage-retention-forward0139.json` and `packages/db/src/migration-forward0139.ts` (`loadForward0139`, `MIGRATION_FORWARD0139_` refusals), `-- n1: expand`, `-- n1: keeps-verifier`. `identity.web_shown_quote` keeps the quote people see apart from the passage, and survives; `identity.web_reply_text` keeps a reader's whole saved reply, transient, so `ledger.raw_artifact` records only a reference (the W3-0 rule, for replies: the call records are append-only and replay byte for byte, so they never hold a passage); `identity.web_passage_wipe` records each deletion, codes and counts. `identity.wipe_debate_passages` deletes one debate's top page texts, extracts, packs and saved replies when nothing runs on it, refusing while a shown quote is missing; "other pages" stay for 0133's sweep. `identity.close_investigation_keeping_texts` is 0133's closing without its wipe. Two `CONTENT_CARRIERS` entries, each checked by 0132's content trigger. The erasure role calls `identity.forget_erased_debate_passages(uuid)`; the export worker reads `identity.read_data_export_passage_retention(uuid,uuid)`. If an earlier pending step takes 0139 first, renumber this step by the same recipe before merge.

## The funded spend kinds (0140)

The thirtieth step (the plan's known gap and decision 14): `0140_internal_spend_kinds.sql` with `internal-spend-kinds-forward0140.json` and `packages/db/src/migration-forward0140.ts` (`loadForward0140`, `MIGRATION_FORWARD0140_` refusals). It declares `-- n1: drained` (R22 is uploaded with no debate waiting or running) and `-- n1: keeps-verifier`: `billing.read_internal_grant_spent`, `billing.read_internal_grant_commitments` and `billing.reserve_internal_provider_call` are redefined in place, with the same names, signatures, owner and grants, and `billing.internal_provider_admission`'s two CHECKs are widened, so a funded person's window and admission know `PATH_REWRITE`, `INVESTIGATION_REPORT`, `PATH_CLIMB`, `ANSWER_UPDATE` and `CONTRIBUTION_CHECK`. `staff.read_team_internal_spent` reads the team's one limit's spend; the limit itself has been in the database since 0142 (decision 24), not a server setting (`packages/register/src/team-limit.ts`). If an earlier pending step takes 0140 first, renumber this step by the same recipe before merge.

## The path suggestions (0141)

The thirty-first step (decision 9): `0141_path_suggestions.sql` with `path-suggestions-forward0141.json` and `packages/db/src/migration-forward0141.ts` (`loadForward0141`, `MIGRATION_FORWARD0141_` refusals), `-- n1: expand`, `-- n1: keeps-verifier`. `identity.path_suggestions` keeps the AI's suggestions of what to dig into on one path of a debate's map, one row each time they are worked out, append-only, the newest of a path winning: `run_id` is the run whose key seals the content and who paid (the debate itself for a first debate's suggestions, the dig that rewrote the path for a refresh), `debate_run_id` the debate whose map holds the path. One `CONTENT_CARRIERS` entry, bound to `set_id` and checked by 0132's content trigger. The runner writes through `identity.record_path_suggestions` and reads the newest set per path through `identity.read_path_suggestions_of_run`. The erasure role calls `identity.forget_erased_debate_path_suggestions(uuid)`, which takes the rows on either run; the export worker reads `identity.read_data_export_path_suggestions(uuid,uuid)`. If an earlier pending step takes 0141 first, renumber this step by the same recipe before merge.

## The team limit (0142)

The thirty-second step (R22, decisions 14 and 24): `0142_team_limit.sql` with `team-limit-forward0142.json` and `packages/db/src/migration-forward0142.ts` (`loadForward0142`, `MIGRATION_FORWARD0142_` refusals), `-- n1: drained` (no debate may wait or run while it applies) and `-- n1: keeps-verifier`. The team's one limit is no server setting any more. It lives in an insert-only log, `staff.team_limit_event`, private to the staff security owner. Its holders are the Owner and one partner the Owner picks (`staff.team_limit_holder`: the database allows one partner, and a new Owner starts with none). `staff.team_practice_spend` records what each practice charged against the month, and `staff.team_limit_notice` the notices a change or a partner grant sends, leased as 0128's threat-report alerts are. The staff functions the API calls are granted to the runtime's role in section 9 of the step's SQL and disclosed in P3-01 with the other grants. The step replaces `staff.authorize_action`, `staff.owned_action_allowed`, `staff.begin_owned_webauthn` and `staff.read_audit_page` with versions that know the team's actions (`begin_owned_webauthn` also gains the two allowance actions it never had). A funded question waits past the team's month rather than being refused, a running debate is never stopped, and a funded debate counts as the top plan's features, web search among them. If an earlier pending step takes 0142 first, renumber this step by the same recipe before merge.

## The hand-over (0143)

The thirty-third step (decision 12): `0143_run_handover.sql` with `run-handover-forward0143.json` and `packages/db/src/migration-forward0143.ts` (`loadForward0143`, `MIGRATION_FORWARD0143_` refusals), `-- n1: expand`, `-- n1: keeps-verifier`. `identity.run_handover` keeps, append-only and in codes only, when a debate paused at the month wall moved to a newer release: core.run's stamps stay as they were written. `identity.run_release_now` and `identity.run_settings_version_now` read who owns a debate now; `identity.run_work_is_parked` says a work item is open only because its debate is paused; `identity.continue_paused_run_in_release` moves the debate and records 0134's RESUMED in one transaction; `identity.wipe_inactive_web_page_text_of_idle_debates` is 0133's 30-day sweep sparing a debate with open work and its investigation. Numbered 0143 by plan: this branch's step before is 0141. When 0142 lands first, renumber this step's `previous` by the same recipe before merge.

## The small AI's quota charge (0144)

The thirty-fourth step (decisions 29 and 31): `0144_ask_clarify_charge.sql` with `ask-clarify-charge-forward0144.json` and `packages/db/src/migration-forward0144.ts` (`loadForward0144`, `MIGRATION_FORWARD0144_` refusals), `-- n1: drained`, `-- n1: keeps-verifier`. Step 2's small AI runs before a debate exists, so it has no run to pin its cost to. `identity.ask_clarify_charge` holds one row per call: the person, the cost, the time and, for a team member, the grant; never the question or the suggestions. `identity.record_ask_clarify_charge` writes that row and a run-less `ASK_CLARIFY` row in `ledger.model_spend` together. An erased account takes its rows by cascade. It redefines 0140's `billing.read_internal_grant_spent` and `staff.read_team_internal_spent`, and declares that (`amendsPostconditionsOf`, `field: function_definition`) because 0140's digest pins them. It stays numbered 0144 on its lane's branch and follows 0141 there; the coordinator will renumber or re-chain it at merge.

## The pages waiting after "Add to researched" (0145)

The thirty-fifth step (dig-model revision W4-4): `0145_web_researched_unsettled.sql` with `web-researched-unsettled-forward0145.json` and `packages/db/src/migration-forward0145.ts` (`loadForward0145`, `MIGRATION_FORWARD0145_` refusals), `-- n1: expand`, `-- n1: keeps-verifier`. `identity.read_unsettled_web_researched(integer)`, on `debateai_runtime`: the runner's list of the pages people added whose readers have not settled, oldest first, so a runner that stopped goes on from them. One function; no table.

## The Owner's allowances for team members (0146)

The thirty-sixth step (decision 32): `0146_team_allowances.sql` with `team-allowances-forward0146.json` and `packages/db/src/migration-forward0146.ts` (`loadForward0146`, `MIGRATION_FORWARD0146_` refusals), `-- n1: drained`, `-- n1: keeps-verifier`. It replaces `staff.configure_internal_allowance`, `staff.revoke_internal_allowance`, their binding and body functions and `billing.guard_internal_grant_commit` (same names and signatures, so 0130's verifier stays), and adds `staff.internal_grant_holder` and `staff.internal_grant_end`, append-only and private to the staff security owner, `staff.allowance_notice` with its three lease functions (0142's shape, its own table because 0142's postcondition pins that CHECK), the triggers on `staff.subject` and `staff.owner_designation` that end an allowance with the person or the Owner, and the two readers the Owner's page and ceremony use. The old self command and its proof bytes are unchanged.

## The public tree (0147)

The thirty-seventh step (decisions 13 and 22): `0147_public_tree.sql` with `public-tree-forward0147.json` and `packages/db/src/migration-forward0147.ts` (`loadForward0147`, `MIGRATION_FORWARD0147_` refusals), `-- n1: expand`, `-- n1: keeps-verifier`. Number 0146 is held by another lane that merges later: on this branch the chain goes 0145, 0147, 0148. Every dig on a public debate, the author's too, lives on the publication, so the tree goes on when the first author leaves and a stranger's AI work reads only the public copy. Eight new tables, reached through definers only, none readable by a request role: `identity.public_material` (the page as the API read it, sealed again under a live run's key), `identity.public_dig_input` (a dig's own paths, for a stopped runner), `identity.public_contribution_check` (the AI check's pass), `identity.public_climb_done` (the climb's end), `identity.public_answer_update` (the main answer's version when the root's key is gone, under the dig's key), `identity.public_report` and `identity.public_debate_report` (a report, and the copy the page reads under the publication's key), and `identity.public_page_skip` (a text the page will never show). Four `CONTENT_CARRIERS` entries: `identity.public_material`, `identity.public_dig_input`, `identity.public_answer_update` and `identity.public_report`. The API's billing role starts things (`join_public_tree`, `record_public_material`, `open_public_report`, two readers), the runner's role does the rest, the erasure role calls `identity.forget_erased_debate_public_tree(uuid)` and the export worker reads `identity.read_data_export_public_tree(uuid,uuid)`. No earlier object changes: 0137's join and 0138's public turn stay in the database, unused by the feature.

## An erased account keeps its public debates (0148)

The thirty-eighth step (decision 21): `0148_erasure_keeps_public.sql` with `erasure-keeps-public-forward0148.json` and `packages/db/src/migration-forward0148.ts` (`loadForward0148`, `MIGRATION_FORWARD0148_` refusals), `-- n1: drained`, `-- n1: keeps-verifier`. Rows only: a stored `delete_public_debates = true` that has not started is cleared, and the step refuses with `ERASURE_WITH_PUBLIC_REMOVAL_IN_FLIGHT` while such a request is already past prepare, because its keys are on their way out and it cannot be turned back. Drained because 0110's frozen function reads those rows at prepare; R22 is already a drained upload, so no erasure runs while it applies.

## A funded person's public report in the team's month (0149)

The thirty-ninth step (decisions 7, 13 and 24): `0149_public_report_team_month.sql` with `public-report-team-month-forward0149.json` and `packages/db/src/migration-forward0149.ts` (`loadForward0149`, `MIGRATION_FORWARD0149_` refusals), `-- n1: drained`, `-- n1: keeps-verifier`. Drained because it redefines earlier steps' functions in place, and R22 is already a drained upload, so no debate runs while it applies. It adds three insert-only tables, none of them read by a request role: `staff.team_public_report_spend` (what a member with a live allowance at the moment of the charge paid for a report on a public debate, written in the charge's own transaction, so the team's month counts it once and a later end of the allowance or the member's erasure changes nothing), `identity.public_update_ref` (a random public reference for each update a page shows, because the row's own id is worked out from the digger's run id) and `identity.public_report_check` (the publication check's record of a report, naming the report and not a run). It adds `identity.team_public_report_record`, `identity.team_public_report_funded`, `identity.read_public_report_spent_by_funding` and `identity.record_public_report_check`; the last two are the runtime's, the first two are private to their callers' owner. It keeps 0130's verifier, and it amends with `amendsPostconditionsOf` (field `function_definition`) the receipts of four steps: 0137's `record_public_report_charge` (writes the team's row), `record_public_debate_update` (writes the reference) and `read_public_debate_updates` (a page's `update_id` is the reference); 0139's `debate_nothing_runs` (a settled contribution, `contribution.outcome IS NULL` no longer true, holds no passages); 0142's `read_team_month_spent` in `staff` (adds the new table); and 0147's `read_public_dig_parent` and `read_public_tree_of_run` (name the reference; `writing` stays in the answer, always false), `join_public_tree` (no wait for a report) and `public_tree_ongoing` (a dig with no work items yet holds no report back). Owners and grants of the redefined functions stay as they were. 0137's `join_public_investigation` and its other functions stay.

## A public debate under review (0150)

The fortieth step (decision 33): `0150_public_review.sql` with `public-review-forward0150.json` and `packages/db/src/migration-forward0150.ts` (`loadForward0150`, `MIGRATION_FORWARD0150_` refusals), `-- n1: drained`, `-- n1: keeps-verifier`. Drained because it replaces functions every release calls (`core.run_is_published`, the proof's list of actions, `begin_owned_webauthn`) and readers the runner calls, and R22 is already a drained upload, so no debate runs while it applies. It adds five tables, none of them read by a request role: `identity.public_review_event` (the log: hide, put back, take out a dig, correct, hide a report), `identity.public_review_correction` (a new text for one piece under the publication's key; the newest per piece wins and nothing that exists changes), `identity.public_review_detached` (a dig cut off when its debate was hidden) and `identity.public_review_read` (what a reviewer read), these four insert-only, and `staff.public_review_notice` (one content-free notice per person per step, the same loop and tries as 0142's). Its definers are `public_review_held`, `public_review_dig_out`, `public_review_row_off`, `public_review_report_off`, `public_review_row_closed`, `read_public_review_overlay`, `public_review_replay`, `public_review_apply`, `public_review_material`, `public_review_mark_read` and `public_review_list` in `identity`, `core.public_review_snapshot`, and `queue_public_review_notices`, `claim_public_review_notices`, `complete_public_review_notice`, `public_review_notice_user`, `read_public_review_command`, `read_public_review`, `read_public_review_list`, `public_review_body` and `public_review_act` in `staff`; the runtime calls the three staff readers' doors, `public_review_act`, the notice loop's three, `read_public_review_overlay` and `public_review_held`. A step needs a passkey of one of the two accounts of 0142's `staff.team_limit_authority`; only a hide goes without the independent alert. It widens `staff.audit_event`'s event check by `PUBLIC_REVIEW_CHANGED`, and it replaces 0039's `core.run_is_published` in place (a hidden debate is not published; it is before this chain, so no receipt declares it, and its signature, owner and grants stay). It keeps 0130's verifier, and it amends with `amendsPostconditionsOf` (field `function_definition`) the receipts of five steps: 0137's `current_publication_of_run` (no publication while hidden), `read_public_debate_updates` (the corrected page) and `read_own_public_contributions` (says a dig was removed or kept private); 0138's `path_line_json`, `main_answer_updates_json` and `read_data_export_tree_updates` (a row a review closed has no content); 0142's `read_audit_page` (leaves the new event out as it leaves the team's own), `owned_action_allowed` and `begin_owned_webauthn` (the two new actions); 0147's `read_public_dig_parent`, `join_public_tree`, `read_public_tree_of_run`, `read_public_debate_reports`, `read_public_page_owed`, `take_public_path_turn` and `read_public_answer_updates`; and 0149's `read_public_debate_updates`, `read_public_dig_parent`, `join_public_tree` and `read_public_tree_of_run`, which 0149 had redefined too. Owners and grants of the redefined functions stay as they were.

## The Report button and the sealed originals' six months (0151)

The forty-first step (decisions 35 and 36): `0151_public_flag.sql` with `public-flag-forward0151.json` and `packages/db/src/migration-forward0151.ts` (`loadForward0151`, `MIGRATION_FORWARD0151_` refusals), `-- n1: drained`, `-- n1: keeps-verifier`. Drained because it replaces the proof's action lists every release calls, and R22 is already a drained upload, so no debate runs while it applies. It adds four tables, none of them read by a request role: `identity.public_flag` (a report: its words sealed under the publication's key, the check's answer, the dismissal; `guard_public_flag` lets a row only move forward and refuses a delete; erasing the reporter takes the link with `ON DELETE SET NULL` and keeps the words), `identity.public_flag_event` (who read the queue, who dismissed what) and `identity.public_review_purged` (what went after six months, by digest, no text), these two insert-only, and `staff.public_flag_notice` (one content-free notice per person, the same loop and tries as 0150's, in the kinds `PUBLIC_FLAG_HIDDEN` and `PUBLIC_FLAG_WAITING`). Its definers are `guard_public_flag`, `read_public_flag_target`, `open_public_flag`, `settle_public_flag`, `public_flag_queue`, `public_flag_mark_read`, `public_flag_dismiss`, `public_flag_replay`, `delete_public_flag_words_due`, `read_public_review_purge_due` and `public_review_purge` in `identity`, `core.public_review_replace_snapshot`, and `queue_public_flag_notices`, `claim_public_flag_notices`, `complete_public_flag_notice`, `public_flag_notice_user`, `read_public_flag_queue` and `public_flag_dismiss` in `staff`; the runtime calls `read_public_flag_target`, `open_public_flag`, `settle_public_flag`, `delete_public_flag_words_due`, `read_public_review_purge_due`, `public_review_purge`, the notice loop's three and the two staff doors. The limits on reports are the API's and reach `open_public_flag` as arguments, so no number of theirs is in this file; the database counts them from its rows, under locks. `settle_public_flag` hides through 0150's `public_review_apply`, with the nil staff id for "the automatic check", only on `AGREE` and only for a debate never hidden. The six months' purge disables the `reject_mutation` trigger of the rows it replaces inside its own transaction, as 0129 does in a step, and only `public_review_purge` and `core.public_review_replace_snapshot` do. It keeps 0130's verifier, and it amends with `amendsPostconditionsOf` (field `function_definition`) the receipt of one step: 0142's `owned_action_allowed` and `begin_owned_webauthn` (the new action `PUBLIC_REPORT_DISMISS`). Owners and grants of the redefined functions stay as they were.

## A reporter's own reports in their export, and what the AI checks on public rows used (0152)

The forty-second step: `0152_report_export_and_check_usage.sql` with `report-export-forward0152.json` and `packages/db/src/migration-forward0152.ts` (`loadForward0152`, `MIGRATION_FORWARD0152_` refusals), `-- n1: expand`, `-- n1: keeps-verifier`. Expand because it is additive only: the release before reads and writes none of what it adds, so it needs no drain. It adds one table, read by no request role: `identity.public_check_usage` (per check of a public row, what the judge reported using: calls, tokens, cost when the vendor says; ids and numbers only; insert-only by `core.reject_mutation`), and two definers: `record_public_check_usage`, which the runtime calls, and `read_data_export_public_flags`, which only `debateai_data_export_worker` calls and which hands the export which debate, when, what became of the report and its sealed words. It reads no verdict, no reason, no judge and no token column, since what the AI answered is about other people's text and a cost is left out of every export. The words stay under the publication's key; the run id goes out only to find that key, and the archive leaves it out. It keeps 0130's verifier and amends no earlier step's receipt (`amendsPostconditionsOf` is empty).

## A finished dig stops counting in the test site's estimate (0153)

The forty-third step: `0153_dig_tree_settled.sql` with `dig-tree-settled-forward0153.json` and `packages/db/src/migration-forward0153.ts` (`loadForward0153`, `MIGRATION_FORWARD0153_` refusals), `-- n1: expand`, `-- n1: keeps-verifier`. Expand because it is additive only: the release before reads and writes neither its table nor its functions. `identity.dig_tree_settled` holds the runner's mark, ids and a time only, written through `identity.mark_dig_tree_settled`. `identity.dig_is_settled` is what `PREVIEW_UNFINISHED_RUNS_SQL` reads, and for a dig on a public debate it reads 0147's own marks. No mark keeps the hold, so an open rewrite, climb or answer update is never hidden.

## Iceland and Liechtenstein in the Region list (0154)

The forty-fourth step: `0154_region_iceland_liechtenstein.sql` with `region-iceland-liechtenstein-forward0154.json` and `packages/db/src/migration-forward0154.ts` (`loadForward0154`, `MIGRATION_FORWARD0154_` refusals), `-- n1: expand`, `-- n1: keeps-verifier`. Expand because it only widens 0095's `registration_region_country_code_check` by `IS` and `LI` (dropped `IF EXISTS`, added `NOT VALID` under a `-- n1: reviewed` line, as 0125 widens its kind list): every code the release before writes stays accepted. It adds no table, function or grant. Its postcondition records the CHECK's name, table and kind, not its code list, which `registration-region-database.test.ts` B2 pins equal to `REGION_COUNTRY_CODES`, so a later step may widen it again without drift. It keeps 0130's verifier and amends no earlier step's receipt.

## The owner's two writes on their own answer (0155)

The forty-fifth step: `0155_owner_answer_writes.sql` with `owner-answer-writes-forward0155.json` and `packages/db/src/migration-forward0155.ts` (`loadForward0155`, `MIGRATION_FORWARD0155_` refusals), `-- n1: expand`, `-- n1: keeps-verifier`. Expand because it only adds two definers, which the release before never calls: `core.record_owned_investigation_request` (the gap-investigation request's row) and `memory.unlink_owned_memory_link` (the memory link's UNLINKED event). On the real logins the runtime may neither insert the first nor lock the second's link, so both buttons answered 500. Each locks the run through 0040's `core.lock_owned_live_runs`, checks the owner again after the lock and answers NULL for every refusal. Both are owned by `core.lock_owned_live_runs`'s owner and granted to `debateai_runtime` only; no table right changes. Its postcondition records the two functions (owner, definer, settings, body, ACL). It keeps 0130's verifier and amends no earlier step's receipt.

## The small AIs before Start in the quota (0156)

The forty-sixth step (V4 start step, plan 2026-11-03 Task 18): `0156_pre_start_charge.sql` with `pre-start-charge-forward0156.json` and `packages/db/src/migration-forward0156.ts` (`loadForward0156`, `MIGRATION_FORWARD0156_` refusals), `-- n1: drained`, `-- n1: keeps-verifier`. The small AIs before Start (the angle planner, the list writers, the merges, the combine and the fit check) run before a debate exists, as step 2's small AI does, so they have no run to pin their cost to. `identity.pre_start_charge` holds one row per call: the person, the kind of call, the cost, the time and, for a team member, the grant; never the question, the lists or the paths. `identity.record_pre_start_charge` writes that row and a run-less `PRE_START` row in `ledger.model_spend` together, and refuses a reference that names another kind. An erased account takes its rows by cascade. The export gets the time and the kind of each call. It redefines 0144's `billing.read_internal_grant_spent` and `staff.read_team_internal_spent`, and declares that for both 0140's and 0144's digests, which pin them (`amendsPostconditionsOf`, `field: function_definition`).

## The chosen paths, sealed per run (0157)

The forty-seventh step (V4 start step, plan 2026-11-03 Task 19): `0157_start_paths.sql` with `start-paths-forward0157.json` and `packages/db/src/migration-forward0157.ts` (`loadForward0157`, `MIGRATION_FORWARD0157_` refusals), `-- n1: expand`, `-- n1: keeps-verifier`. Expand because it is additive only: three new core tables and seven new definers, which the release before neither reads nor writes. `core.start_path_set` (one per debate) and `core.start_path` (one per chosen path, b1..bN) hold codes in the clear and their words sealed under the debate's own key, bound by 0132's content check (called, not redefined) to the run and to the path id; there is no foreign key to `core.run`, so erasing the debate is shredding its key. `core.carry_on_mark` holds DUE, BEGUN and DONE, ids and codes only. Only `debateai_runtime` may run the seven definers; every one leaves PUBLIC first, because the API's boot check counts the core functions the content-provision login may run. It keeps 0130's verifier and amends no earlier step's receipt (`amendsPostconditionsOf` is empty).

## The path results per run (0158)

The forty-eighth step (V4 start step, plan 2026-11-03 Task 21): `0158_path_results.sql` with `path-results-forward0158.json` and `packages/db/src/migration-forward0158.ts` (`loadForward0158`, `MIGRATION_FORWARD0158_` refusals), `-- n1: expand`, `-- n1: keeps-verifier`. Expand because it is additive only: four new core tables, four content guards of its own and six definers, which the release before neither reads nor writes. `core.path_root` (one per argued path, b1..b8, its root a node of the same debate) and `core.path_root_repoint` (a path's root moving from a root a reclaim set aside to a live one, as 0119's answer roots do) hold ids and codes only; `core.path_outcome` (each path's answer so far, its state in the clear) and `core.path_gap_round` (one per debate) hold their words sealed under the debate's own key, bound by this file's attestation guards (0117's model) to the path id and to the run. All four are append-only and behind 0040's erasure barrier; an erased debate answers `RUN_ERASED` to every writer and reads as nothing. Only `debateai_runtime` may run the six definers, and no role reads a table; every function leaves PUBLIC first, because the API's boot check counts the core functions the content-provision login may run. It keeps 0130's verifier and amends no earlier step's receipt (`amendsPostconditionsOf` is empty).

## The path progress per run (0159)

The forty-ninth step (V4 start step, plan 2026-11-03 Task 53a): `0159_path_progress.sql` with `path-progress-forward0159.json` and `packages/db/src/migration-forward0159.ts` (`loadForward0159`, `MIGRATION_FORWARD0159_` refusals), `-- n1: expand`, `-- n1: keeps-verifier`. Expand because it is additive only: two new core tables and five definers, which the release before neither reads nor writes. `core.path_step` (each step a chosen path reached: finding sources, arguing, checking) and `core.path_point_mark` (each mark a point of the same debate got: put forward, being checked, checked, found with its trust word) hold ids and codes only, so nothing is sealed and neither is a carrier; both hang off 0157's `core.start_path_set`, take only the debate's own chosen paths and nodes, are append-only and behind 0040's erasure barrier; an erased debate answers `RUN_ERASED` to both writers and reads as nothing. `core.read_carry_on_mark` reads how far 0157's carry-on marks have gone, and `identity.count_public_reports` counts a public debate's reports that did not fail (0147's; one still being written counts as 0147 counts it, a press left unwritten does not), the owner's own and everyone's, so only a debate's very first report uses the kept reserve (owner answer Q20). Only `debateai_runtime` may run the four core definers and only the API's `debateai_billing_runtime` the counts, and no role reads a table; every function leaves PUBLIC first, because the API's boot check counts the core functions the content-provision login may run. It keeps 0130's verifier and amends no earlier step's receipt (`amendsPostconditionsOf` is empty).

## The saved questions (0160)

The fiftieth step (V4 start step, plan 2026-11-03 Task 39d; owner answers S3 A, S4 A and S5 A of 4 Nov): `0160_saved_questions.sql` with `saved-questions-forward0160.json` and `packages/db/src/migration-forward0160.ts` (`loadForward0160`, `MIGRATION_FORWARD0160_` refusals), `-- n1: expand`, `-- n1: keeps-verifier`. Expand because it is additive only: one new identity table and six definers, which the release before neither reads nor writes. `identity.saved_question` keeps a person's questions not started yet, at most 20 per account: ids, a revision, two times and two envelopes (a short title for the list, and the whole step 2), each sealed under the question's own key, whose name `saved-question:<id>:v1` both table CHECKs pin to the row's own id; the key itself is a file outside the database (`FileSavedQuestionKeyStore`, `packages/crypto`), and account closing destroys it in its own key step (`packages/db/src/account-erasure.ts`). No text, key, fingerprint, plan or version column and no link to `core.run`, so the table is not a content carrier; it is keyed by the account's `owner_ref` with ON DELETE CASCADE, so account erasure removes its rows with the account, and 0110 is not changed. Only the API's `debateai_billing_runtime` may run the five API functions (create, save, the list, one read, the delete) and only `debateai_data_export_worker` the export reader, behind 0128's lease; no role reads the table, row security stays off (outside 0130's scope rule), and 0115's export owner owns it all, as 0131's. It keeps 0130's verifier and amends no earlier step's receipt (`amendsPostconditionsOf` is empty).

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
the settings activation, the Italy-specific approval, the synthesis check, the publication review, the threat reports and the support answer scope keep; after 0130: `verify-effective-capabilities-130.sql`, which the V4 account memory (0131), the web evidence store (0132), the investigations (0133), the dig model (0134), the dig picks (0135), the investigation reports (0136), the public debates (0137), the tree updates (0138), the passage retention (0139), the funded spend kinds (0140), the path suggestions (0141), the team's one limit (0142), the hand-over (0143), the small AI's quota charge (0144), the pages waiting after "Add to researched" (0145), the public tree (0147), an erased account keeping its public debates (0148), a funded person's public report in the team's month (0149), a public debate under review (0150), the Report button with the sealed originals' six months (0151) and a reporter's own reports in their export (0152) keep) still
runs at the end of every `migrate()`. A step that changes by design a field an earlier step's postcondition digests
declares it (`amendsPostconditionsOf`, 0130 below): the earlier step is then compared against its latest recorded
amendment instead of its receipt.

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
