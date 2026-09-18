-- 0065 — security hardening 2026-09-01, package DB1
-- (findings DL5-F2, DL5-F5, DL5-F4 of docs/missions/2026-09-01-security-hardening/
-- findings/delta-L5-data-layer.md; DL2-F2 / DL5-F1 land in §4 of this file).
--
-- Forward-only. No landed migration is edited: migrate() keys its ledger on the
-- file name, so an edited applied file is inert, and a standalone replay of an
-- edited file silently restores the OWNER's definition (the lesson 0063:20-39
-- records). This file therefore OWNS every object it creates and never
-- CREATE OR REPLACEs a function another migration defines. Every statement is
-- idempotent and the whole file is replayable.
--
-- §1 TRUNCATE and mutation guards for the 20 relations the 0050-0064 delta
--    added (DL5-F2). 0056 installed core.reject_truncate() on the 78 relations
--    L5 listed and stopped at 0049; the observation set (0057:187-207) is the
--    only delta set that guarded itself. TRUNCATE fires no row trigger and no
--    privilege stops the owner/superuser session, so until this file a single
--    `TRUNCATE support.shred_audit` erased the only record that a shred ever
--    happened — and, because TRUNCATE does not fire the support_shred_dirty_*
--    marks (0054:740-742), it did so without tripping the integrity guard.
--
--    Three treatments, chosen per relation from the grants 0050-0057 actually
--    made (the column-level UPDATE contract at 0054:822-853, 887-969):
--
--    a) APPEND-ONLY (SELECT+INSERT for debateai_support, no column UPDATE
--       grant, no code path that updates or deletes a row): TRUNCATE guard plus
--       `reject_mutation BEFORE UPDATE OR DELETE ... FOR EACH STATEMENT`. The
--       statement-level shape is 0057:187-207's — the delta-era convention and
--       the strictest of the two in the tree, because it also refuses a
--       zero-row UPDATE.
--    b) APPEND-ONLY BUT OWNER-REWRITABLE BY TEST CONTRACT — support.message and
--       support.case_message: TRUNCATE guard only. Both carry the content-v2
--       envelope triggers (0054:176-221) whose refusal of a v1 rewrite is
--       proved by an owner-session UPDATE (tests/integration/support-cases.test.ts:178,
--       tests/integration/support-routes.test.ts:2005), and a statement-level
--       reject_mutation would pre-empt SUPPORT_CONTENT_V2_REQUIRED with 55000.
--       The privilege floor is unchanged either way: debateai_support holds no
--       UPDATE and no DELETE on either table, so the residual is the owner
--       session — the same actor class the TRUNCATE guard now closes. Left to
--       the follow-up package with the content-v2 probes restructured.
--    c) NEVER DELETED BUT COLUMN-MUTABLE — support.session, support."case",
--       support.session_key, support.case_key, support.public_incident and the
--       singleton support._shred_integrity_guard: TRUNCATE guard plus
--       `reject_delete BEFORE DELETE ... FOR EACH STATEMENT`. A blanket
--       reject_mutation would break the shred itself (shredded_at, wrapped_key,
--       destroyed_at are granted UPDATE at 0054:882-885) and the incident CLI
--       (public_incident.ended_at, 0053:35). The trigger carries its own name so
--       it can never be mistaken for, or dropped by, an earlier migration's
--       `DROP TRIGGER IF EXISTS reject_mutation`.
--    d) register.required_row / required_row_version: TRUNCATE guard only.
--       They are a migration-owned manifest, and 0061:2-8 DELETEs from
--       required_row_version by design when a publication profile is rebuilt; a
--       reject trigger fires for the owner too and would brick that migration.
--
-- §2 search_path pin (DL5-F5). core.reject_edge_mutation_except_measurement()
--    (0052_t5:88-125) is the one function in the application schemas with
--    proconfig IS NULL — the L5-F10 class re-introduced after 0056's fixed
--    list. Its body uses only <>, IS DISTINCT FROM and RAISE, all of which
--    resolve through search_path. ALTER FUNCTION only; the body is 0052_t5's
--    and stays untouched.
--
-- §3 Surplus EXECUTE grants (DL5-F4). Four grants to debateai_runtime with no
--    caller bound to a debateai_runtime URL. Revoking an ACL entry that is not
--    there is a no-op, so each REVOKE is idempotent.

-- §1 -------------------------------------------------------------------------

-- a) + b) + c) + d): the TRUNCATE guard, on all 20. core.install_truncate_guard
-- (0056:94-131) creates the guard when absent, leaves an existing enabled
-- BEFORE TRUNCATE statement guard alone, and raises 55000 TRUNCATE_GUARD_CONFLICT
-- for any other shape — it never repairs silently.
SELECT core.install_truncate_guard('support.message');
SELECT core.install_truncate_guard('support.abuse_event');
SELECT core.install_truncate_guard('support.case_event');
SELECT core.install_truncate_guard('support.case_message');
SELECT core.install_truncate_guard('support.rating');
SELECT core.install_truncate_guard('support.tool_call');
SELECT core.install_truncate_guard('support.relay_call');
SELECT core.install_truncate_guard('support.relay_waiter');
SELECT core.install_truncate_guard('support.relay_waiter_event');
SELECT core.install_truncate_guard('support.admission_event');
SELECT core.install_truncate_guard('support.shred_audit');
SELECT core.install_truncate_guard('support.session');
SELECT core.install_truncate_guard('support."case"');
SELECT core.install_truncate_guard('support.session_key');
SELECT core.install_truncate_guard('support.case_key');
SELECT core.install_truncate_guard('support.public_incident');
SELECT core.install_truncate_guard('support._shred_integrity_guard');
SELECT core.install_truncate_guard('serve.synthesis_round');
SELECT core.install_truncate_guard('register.required_row');
SELECT core.install_truncate_guard('register.required_row_version');

-- a) the append-only ten: UPDATE and DELETE closed for every role, owner
-- included. serve.synthesis_round is the T9 loop record the served answer is
-- audited against; its guard was deferred at 0057_t09:32-34 and never landed.
DO $security_delta_append_only_guards$
DECLARE target text;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'support.abuse_event',
    'support.case_event',
    'support.rating',
    'support.tool_call',
    'support.relay_call',
    'support.relay_waiter',
    'support.relay_waiter_event',
    'support.admission_event',
    'support.shred_audit',
    'serve.synthesis_round'
  ] LOOP
    EXECUTE pg_catalog.format('DROP TRIGGER IF EXISTS reject_mutation ON %s', target);
    EXECUTE pg_catalog.format(
      'CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON %s '
      'FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation()', target
    );
  END LOOP;
END
$security_delta_append_only_guards$;

-- c) the never-deleted six: DELETE closed, the granted column UPDATEs kept.
DO $security_delta_never_deleted_guards$
DECLARE target text;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'support.session',
    'support."case"',
    'support.session_key',
    'support.case_key',
    'support.public_incident',
    'support._shred_integrity_guard'
  ] LOOP
    EXECUTE pg_catalog.format('DROP TRIGGER IF EXISTS reject_delete ON %s', target);
    EXECUTE pg_catalog.format(
      'CREATE TRIGGER reject_delete BEFORE DELETE ON %s '
      'FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation()', target
    );
  END LOOP;
END
$security_delta_never_deleted_guards$;

-- §2 -------------------------------------------------------------------------

ALTER FUNCTION core.reject_edge_mutation_except_measurement()
  SET search_path = pg_catalog, pg_temp;

-- §3 -------------------------------------------------------------------------

-- register.publish_register_version / import_historical_register_version:
-- the only callers are packages/register/src/register-publication.ts:782,813
-- inside createPostgresRegisterPublicationPort, constructed by
-- apps/runner/src/dev-deployment-register-cli.ts:12 (MIGRATION_DATABASE_URL),
-- dev-deployment-register.ts:768 (adminPool) and dev-auth-data-plane.ts:408 —
-- all migrator-credential CLIs, none of them a debateai_runtime URL. Runtime
-- consumers read a pinned REGISTER_VERSION (apps/api/src/main.ts:143-200) and
-- never publish. The function owner debateai_register_publication_owner keeps
-- EXECUTE implicitly, so the publication path is untouched.
REVOKE EXECUTE ON FUNCTION
  register.publish_register_version(uuid, char, bigint, jsonb, text),
  register.import_historical_register_version(bigint, jsonb, char)
  FROM debateai_runtime;

-- register.assert_required_rows: called only by the 0061:28 trigger, which runs
-- with the definer's rights whatever the caller holds (0050_t16:58-91).
REVOKE EXECUTE ON FUNCTION register.assert_required_rows(bigint)
  FROM debateai_runtime;

-- register.claim_type_composition_map_is_valid: a CHECK function on
-- register.register_row. PostgreSQL privilege-checks a CHECK function at
-- executor init for the role performing the INSERT, which is why 0056:263-265
-- granted it to debateai_runtime. 0055:2019 then revoked INSERT on
-- register.register_row from debateai_runtime and moved every insert to
-- debateai_register_publication_owner (granted at 0055:2015-2016), so the
-- runtime grant has had no executor-init path since. The owner grant stays.
REVOKE EXECUTE ON FUNCTION register.claim_type_composition_map_is_valid(jsonb)
  FROM debateai_runtime;

-- DL7-F9 (observation.threshold_policy INSERT held by the observation agent's
-- own role) is NOT revoked here, and the report says so. The revoke was traced
-- first, as asked: apps/observation-agent/src/oactl/core/thresholds.ts:270
-- (`oactl thresholds apply`) is a live INSERT caller, and
-- apps/observation-agent/src/oactl/core/commands.ts:196-198 opens it with
-- OBSERVATION_DATABASE_URL — the same env key, and therefore the same
-- debateai_observation_agent principal, that the daemon uses at
-- apps/observation-agent/src/main.ts:84,103 (provision.ts:44-50 writes that
-- URL with the agent's own credential). Revoking here would break the
-- documented threshold-apply ritual (OBS-01 SPEC.md step 3) with no other
-- writer to take it over. Closing it needs a second principal
-- (debateai_obs_threshold_operator) plus its credential wiring in
-- apps/observation-agent and deploy/, which package DB1 may not touch.

-- §4 -------------------------------------------------------------------------
