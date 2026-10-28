-- 0126 · Row-level security: each account sees only its own rows (mission row-level-security S01)
--
-- SPEC docs/missions/row-level-security/slices/S01/SPEC-v4.md; PLAN.md step S1.4; DECISIONS D27-D33, D38, D73; ADR-0033.
-- The database derives the account itself: a request's raw session token travels in the custom setting
-- debateai.session_credential, and policies never read that setting directly. They call the migrator's SECURITY DEFINER
-- functions in the new schema rls, which hash it exactly as hashToken("session", ...) does and look the hash up in
-- identity.session (not revoked, CSRF hash set, idle and absolute expiry ahead). A forged value yields no account.
--   (1) the marker role debateai_rls_all_accounts (NOLOGIN NOINHERIT; the provisioners grant it to the system logins);
--   (2) schema rls, usable by debateai_runtime only;
--   (3) the five rls functions (bodies measured in probes/ARCH-S01/spike-policies.mts), and V-18's guards
--       billing.guard_own_references(), a trigger on six billing tables, and core.guard_own_references(), a trigger on
--       24 engine tables, that no T1 login may EXECUTE;
--   (4) the three in-scope views apply the invoker's security, and core.run_waiting_v's SELECT moves from
--       debateai_runtime to debateai_billing_runtime (D33);
--   (5) on each of the 110 in-scope tables, in D32's row order: row security enabled (never forced), policy
--       rls_account TO debateai_runtime with D32's per-account predicate as USING and WITH CHECK, and policy
--       rls_all_accounts TO the eleven cross-account roles of D29 with USING (true) WITH CHECK (true); billing.cancel_token
--       first gains its own owner_ref and keys on it (V-15's default, REV-S01-p1-security B1), not on D32's key. Six
--       billing tables a child row of which may have no parent row key on `false` (V-17's default, FIX-S01-p1a NEW-1),
--       and six billing tables refuse a row written under an account's context that names another account's
--       subscription, saved card or quote (V-18's default, NEW-2); charge, run_charge_scope and
--       withdrawal_owner_settlement also check the parent rows they name. Under an account's context a T1 login writes
--       no billing row but the lazy Free entitlement: every other billing table's T1 WITH CHECK is `false`, and the guard
--       admits on billing.entitlement_event only the Free row EntitlementRepository.current appends (the unpaid-plan review).
-- The loader (packages/db/src/migration-forward0126.ts) digests every RLS field of the 110 tables, the views, the
-- functions and the marker role, and records the six earlier postconditions that pinned the flag as amended (D38, F-C1-1).
-- Its verifier supersedes 0111's (lineage/verify-effective-capabilities-126.sql, R34), so the header keeps none.
--
-- n1: drained
--   drained   uploaded the old way, with no debate waiting or running (V-1): it turns row security on for tables the
--             release before reads, which an expand step may not do (N1_FORBIDDEN_ROW_SECURITY).

-- (1) The marker role, created once (the guard shape of 0123's release roles).
DO $rls_marker_role$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'debateai_rls_all_accounts') THEN
    CREATE ROLE debateai_rls_all_accounts NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END
$rls_marker_role$;

-- (2) The schema of the context functions.
CREATE SCHEMA rls;
REVOKE ALL ON SCHEMA rls FROM PUBLIC;
GRANT USAGE ON SCHEMA rls TO debateai_runtime;

-- (3) The context functions. The hash is hashToken("session", token) of packages/crypto/src/index.ts:1724-1735:
-- 'sha256:' || hex(sha256('debateai:token:session:v1' || 0x00 || token)); an empty or missing setting hashes NULL.
CREATE OR REPLACE FUNCTION rls.session_credential_hash() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT 'sha256:' || encode(sha256(convert_to('debateai:token:session:v1', 'UTF8') || '\x00'::bytea
    || convert_to(nullif(current_setting('debateai.session_credential', true), ''), 'UTF8')), 'hex') $$;
REVOKE ALL ON FUNCTION rls.session_credential_hash() FROM PUBLIC;

CREATE OR REPLACE FUNCTION rls.context_user_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT s.user_id FROM identity.session AS s WHERE s.token_hash = rls.session_credential_hash() AND s.revoked_at IS NULL
    AND s.csrf_token_hash IS NOT NULL AND s.idle_expires_at > statement_timestamp() AND s.absolute_expires_at > statement_timestamp() $$;
REVOKE ALL ON FUNCTION rls.context_user_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rls.context_user_id() TO debateai_runtime;

CREATE OR REPLACE FUNCTION rls.context_owner_ref() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT u.owner_ref FROM identity."user" AS u WHERE u.user_id = rls.context_user_id() $$;
REVOKE ALL ON FUNCTION rls.context_owner_ref() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rls.context_owner_ref() TO debateai_runtime;

CREATE OR REPLACE FUNCTION rls.owns_run(p_run_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT coalesce(core.run_is_owned_by(p_run_id, o.owner_ref, 'owner:' || o.owner_ref::text), false) FROM (SELECT rls.context_owner_ref() AS owner_ref) AS o $$;
REVOKE ALL ON FUNCTION rls.owns_run(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rls.owns_run(uuid) TO debateai_runtime;

CREATE OR REPLACE FUNCTION rls.owns_execution_ref(p_execution_ref text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT EXISTS (SELECT 1 FROM identity.run_execution_binding AS b WHERE b.execution_ref::text = p_execution_ref AND b.user_id = rls.context_user_id()) $$;
REVOKE ALL ON FUNCTION rls.owns_execution_ref(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rls.owns_execution_ref(text) TO debateai_runtime;

-- V-18 (FIX-S01-p1a NEW-2): what an own row may NAME. A row keyed on the context's owner_ref may still name an entity of
-- another account that a cross-account reader then acts on for that account (cancelByToken and subscription_latest_v by
-- subscription, the renewal's usableSavedCard by card token). Written under an account's context (a T1 login's request;
-- the system logins carry none), a row may name a subscription that has no event yet or whose first event (the owner
-- every billing reader acts for) is the context's, a card token whose customer and whose source charge (a card's customer
-- row may be gone, and customer_id has no foreign key) are the context's, and a quote the context owns (billing.quote_use
-- holds one row per quote: an own row naming another account's quote would refuse that account's checkout). A trigger, not a
-- policy function: a function a T1 login may EXECUTE answers R42's calls (FIX-S01-p1e: two such definers returned true
-- for a NULL and for an unknown id, and rls:proof's F7 read that as a private value), and this one is EXECUTE-able by
-- no login, as billing.guard_internal_charge_scope is (0123).
-- The unpaid-plan review (2026-10-27, measured: an own MAX entitlement, cause SUBSCRIBED and paid ten years out, made
-- person_windows_v read MAX on both runtime logins): the one billing row a T1 login writes under a context is the lazy
-- Free entitlement EntitlementRepository.current appends for an account with no event yet (the ask room's request pool);
-- checkout, renewal, settlement and the charge scope write on api-system. So an entitlement written under a context must
-- be that row: FREE, SIGNED_UP_FREE, no subscription, credit override or paid-through, anchored and effective at the
-- account's created_at (a chosen anchor would move the Free windows). The guard checks it, not the policy: the check
-- reads identity."user", and R15's allow-list pins the policy texts.
CREATE OR REPLACE FUNCTION billing.guard_own_references() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_context uuid := rls.context_owner_ref(); v_first uuid;
BEGIN
  IF v_context IS NULL THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'entitlement_event' THEN
    IF NEW.plan_id IS DISTINCT FROM 'FREE' OR NEW.cause IS DISTINCT FROM 'SIGNED_UP_FREE' OR NEW.subscription_id IS NOT NULL
        OR NEW.month_credit_override_micros IS NOT NULL OR NEW.paid_through IS NOT NULL
        OR NOT EXISTS (SELECT 1 FROM identity."user" AS u WHERE u.owner_ref = v_context
          AND u.created_at = NEW.effective_at AND u.created_at = NEW.period_anchor_at) THEN
      RAISE EXCEPTION 'RLS_UNPAID_ENTITLEMENT' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'quote_use' THEN
    IF NOT EXISTS (SELECT 1 FROM billing.quote AS q WHERE q.quote_id = NEW.quote_id AND q.owner_ref = v_context) THEN
      RAISE EXCEPTION 'RLS_FOREIGN_QUOTE' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.subscription_id IS NOT NULL THEN
    SELECT e.owner_ref INTO v_first FROM billing.subscription_event AS e WHERE e.subscription_id = NEW.subscription_id ORDER BY e.seq LIMIT 1;
    IF FOUND AND v_first IS DISTINCT FROM v_context THEN RAISE EXCEPTION 'RLS_FOREIGN_SUBSCRIPTION' USING ERRCODE = '42501'; END IF;
  END IF;
  -- Nested: PL/pgSQL prepares a whole condition, and the other four tables have no card_token_id.
  IF TG_TABLE_NAME = 'subscription_event' THEN
    IF NEW.card_token_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM billing.card_token AS t JOIN billing.customer AS c
        ON c.customer_id = t.customer_id WHERE t.token_id = NEW.card_token_id AND c.owner_ref = v_context
          AND EXISTS (SELECT 1 FROM billing.charge AS s WHERE s.charge_id = t.source_charge_id AND s.owner_ref = v_context)) THEN
      RAISE EXCEPTION 'RLS_FOREIGN_CARD_TOKEN' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION billing.guard_own_references() FROM PUBLIC;
CREATE TRIGGER guard_own_references BEFORE INSERT OR UPDATE ON billing.cancel_token FOR EACH ROW EXECUTE FUNCTION billing.guard_own_references();
CREATE TRIGGER guard_own_references BEFORE INSERT OR UPDATE ON billing.charge FOR EACH ROW EXECUTE FUNCTION billing.guard_own_references();
CREATE TRIGGER guard_own_references BEFORE INSERT OR UPDATE ON billing.entitlement_event FOR EACH ROW EXECUTE FUNCTION billing.guard_own_references();
CREATE TRIGGER guard_own_references BEFORE INSERT OR UPDATE ON billing.quote_use FOR EACH ROW EXECUTE FUNCTION billing.guard_own_references();
CREATE TRIGGER guard_own_references BEFORE INSERT OR UPDATE ON billing.subscription_event FOR EACH ROW EXECUTE FUNCTION billing.guard_own_references();
CREATE TRIGGER guard_own_references BEFORE INSERT OR UPDATE ON billing.withdrawal_owner_settlement FOR EACH ROW EXECUTE FUNCTION billing.guard_own_references();

-- V-18 on the engine tables: what an own engine row may NAME. Each rls_account policy of core, ledger, serve, memory and
-- scorecard checks the row's own run (or the parent it keys on), not the other entities the row names, and the readers on
-- the system logins follow those names with no run of their own: the runner's snapshot takes a node's score from the
-- newest judgement naming it (graph materialiseSnapshot), the data export worker reads an answer's fact bundle, composed
-- text and conformance by the ids the answer row names, and an account's projection reads a stranger check, a reversal
-- point, a staleness state or a served number by the id another row named. Written under an account's context (a T1
-- login's request; the system logins carry none), each column a trigger lists must name nothing, or an entity of a run
-- the context owns (rls.owns_run; a routing by its execution, rls.owns_execution_ref), and serve.answer may not add a
-- version to another account's answer. The trigger's arguments are pairs: a column, then the kind of entity it names
-- ('<kind>[]': a jsonb list of them; 'node_or_answer' for the subject columns, whatever their kind column says). A value
-- is read as uuid exactly as a cast reads it (braces, upper case, no hyphens), so no spelling a consumer could cast slips
-- past. A NULL column, a column an UPDATE leaves as it was, a value that is no uuid, and one no row carries (where there
-- is a foreign key, it refuses that one) are not refused here. EXECUTE-able by no login, as billing.guard_own_references
-- is. Measured non-members (tests/integration/rls-forgery.test.ts S6.3-F14): already refused
-- by an older check (run_supersession.new_run_id; answer_story's and serve_disclosure's answer; node_review's node and
-- artifacts, whose lineage triggers read them under the writer's row security), or followed by no reader.
CREATE OR REPLACE FUNCTION core.guard_own_references() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_new jsonb; v_old jsonb; v_kind text; v_refs text[]; v_ref text; v_id uuid; v_owned boolean; i integer := 0;
BEGIN
  IF rls.context_owner_ref() IS NULL THEN RETURN NEW; END IF;
  v_new := to_jsonb(NEW);
  IF TG_OP = 'UPDATE' THEN v_old := to_jsonb(OLD); END IF;
  WHILE i < TG_NARGS LOOP
    IF v_new ->> TG_ARGV[i] IS NOT NULL AND (v_old IS NULL OR v_old -> TG_ARGV[i] IS DISTINCT FROM v_new -> TG_ARGV[i]) THEN
      v_kind := TG_ARGV[i + 1];
      IF right(v_kind, 2) = '[]' THEN
        v_kind := left(v_kind, -2);
        v_refs := ARRAY(SELECT jsonb_array_elements_text(v_new -> TG_ARGV[i]));
      ELSE
        v_refs := ARRAY[v_new ->> TG_ARGV[i]];
      END IF;
      FOREACH v_ref IN ARRAY v_refs LOOP
        -- A value that is no uuid names no row of these tables.
        BEGIN
          v_id := v_ref::uuid;
        EXCEPTION WHEN invalid_text_representation THEN
          v_id := NULL;
        END;
        v_owned := CASE v_kind
          WHEN 'run' THEN CASE WHEN EXISTS (SELECT 1 FROM core.run AS p WHERE p.run_id = v_id) THEN rls.owns_run(v_id) END
          WHEN 'node' THEN (SELECT rls.owns_run(p.run_id) FROM core.node AS p WHERE p.node_id = v_id)
          WHEN 'node_or_answer' THEN (SELECT bool_and(s.owned) FROM (SELECT rls.owns_run(p.run_id) FROM core.node AS p WHERE p.node_id = v_id
            UNION ALL SELECT rls.owns_run(p.run_id) FROM serve.answer AS p WHERE p.answer_id = v_id) AS s(owned))
          WHEN 'raw_artifact' THEN (SELECT rls.owns_run(p.run_id) FROM ledger.raw_artifact AS p WHERE p.raw_artifact_id = v_id)
          WHEN 'ledger_entry' THEN (SELECT rls.owns_run(p.run_id) FROM ledger.ledger_entry AS p WHERE p.ledger_entry_id = v_id)
          WHEN 'value_hinge' THEN (SELECT rls.owns_run(p.run_id) FROM core.value_hinge AS p WHERE p.value_hinge_id = v_id)
          WHEN 'work_item' THEN (SELECT rls.owns_run(p.run_id) FROM core.work_item AS p WHERE p.work_item_id = v_id)
          WHEN 'propagation_run' THEN (SELECT rls.owns_run(p.run_id) FROM ledger.propagation_run AS p WHERE p.propagation_run_id = v_id)
          WHEN 'reduced_judgement' THEN (SELECT rls.owns_run(p.run_id) FROM ledger.reduced_judgement AS p WHERE p.reduced_judgement_id = v_id)
          WHEN 'node_review' THEN (SELECT rls.owns_run(p.run_id) FROM ledger.node_review AS p WHERE p.node_review_id = v_id)
          WHEN 'answer' THEN (SELECT bool_and(rls.owns_run(p.run_id)) FROM serve.answer AS p WHERE p.answer_id = v_id)
          WHEN 'fact_bundle' THEN (SELECT rls.owns_run(p.run_id) FROM serve.fact_bundle AS p WHERE p.fact_bundle_id = v_id)
          WHEN 'composed_text' THEN (SELECT rls.owns_run(a.run_id) FROM serve.composed_text AS p
            JOIN ledger.raw_artifact AS a ON a.raw_artifact_id = p.raw_artifact_ref WHERE p.composed_text_id = v_id)
          WHEN 'conformance_record' THEN (SELECT rls.owns_run(a.run_id) FROM serve.conformance_record AS p
            JOIN serve.composed_text AS t ON t.composed_text_id = p.composed_text_id
            JOIN ledger.raw_artifact AS a ON a.raw_artifact_id = t.raw_artifact_ref WHERE p.conformance_record_id = v_id)
          WHEN 'condition_mark' THEN (SELECT rls.owns_run(a.run_id) FROM serve.condition_mark AS p
            JOIN serve.answer AS a ON a.answer_id = p.answer_id AND a.answer_version = p.answer_version WHERE p.condition_mark_id = v_id)
          WHEN 'alias_row' THEN (SELECT rls.owns_run(p.prior_run_id) FROM memory.alias_row AS p WHERE p.alias_row_id = v_id)
          WHEN 'routing_decision' THEN (SELECT rls.owns_execution_ref(p.session_id) FROM scorecard.routing_decision AS p
            WHERE p.routing_decision_id = v_id)
        END;
        IF v_kind NOT IN ('run', 'node', 'node_or_answer', 'raw_artifact', 'ledger_entry', 'value_hinge', 'work_item', 'propagation_run',
            'reduced_judgement', 'node_review', 'answer', 'fact_bundle', 'composed_text', 'conformance_record', 'condition_mark',
            'alias_row', 'routing_decision') THEN
          RAISE EXCEPTION 'RLS_GUARD_UNKNOWN_KIND %', v_kind;
        END IF;
        IF v_owned IS FALSE THEN
          RAISE EXCEPTION 'RLS_FOREIGN_REFERENCE %.%.%', TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_ARGV[i] USING ERRCODE = '42501';
        END IF;
      END LOOP;
    END IF;
    i := i + 2;
  END LOOP;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION core.guard_own_references() FROM PUBLIC;
CREATE TRIGGER guard_own_references BEFORE INSERT OR UPDATE ON core.independence_receipt FOR EACH ROW EXECUTE FUNCTION core.guard_own_references('critic_ledger_entry_ref', 'ledger_entry');
CREATE TRIGGER guard_own_references BEFORE INSERT OR UPDATE ON core.node FOR EACH ROW EXECUTE FUNCTION core.guard_own_references('provenance_ref', 'raw_artifact');
CREATE TRIGGER guard_own_references BEFORE INSERT OR UPDATE ON core.reversal_point FOR EACH ROW EXECUTE FUNCTION core.guard_own_references('value_hinge_id', 'value_hinge');
CREATE TRIGGER guard_own_references BEFORE INSERT OR UPDATE ON core.staleness_state FOR EACH ROW EXECUTE FUNCTION core.guard_own_references('subject_ref', 'node_or_answer');
CREATE TRIGGER guard_own_references BEFORE INSERT OR UPDATE ON core.stranger_restatement FOR EACH ROW EXECUTE FUNCTION core.guard_own_references('subject_id', 'node_or_answer');
CREATE TRIGGER guard_own_references BEFORE INSERT OR UPDATE ON ledger.ledger_entry FOR EACH ROW EXECUTE FUNCTION core.guard_own_references('raw_artifact_ref', 'raw_artifact');
CREATE TRIGGER guard_own_references BEFORE INSERT OR UPDATE ON ledger.node_strength_record FOR EACH ROW EXECUTE FUNCTION core.guard_own_references('propagation_run_id', 'propagation_run', 'reduced_judgement_ref', 'reduced_judgement');
CREATE TRIGGER guard_own_references BEFORE INSERT OR UPDATE ON ledger.overlay_run FOR EACH ROW EXECUTE FUNCTION core.guard_own_references('propagation_run_id', 'propagation_run');
CREATE TRIGGER guard_own_references BEFORE INSERT OR UPDATE ON ledger.point_investigation FOR EACH ROW EXECUTE FUNCTION core.guard_own_references('raw_artifact_ref', 'raw_artifact');
CREATE TRIGGER guard_own_references BEFORE INSERT OR UPDATE ON ledger.reduced_judgement FOR EACH ROW EXECUTE FUNCTION core.guard_own_references('node_id', 'node', 'raw_artifact_ref', 'raw_artifact', 'selected_judgement_ref', 'raw_artifact');
CREATE TRIGGER guard_own_references BEFORE INSERT OR UPDATE ON ledger.sensitivity_record FOR EACH ROW EXECUTE FUNCTION core.guard_own_references('propagation_run_id', 'propagation_run');
CREATE TRIGGER guard_own_references BEFORE INSERT OR UPDATE ON ledger.verdict_vote FOR EACH ROW EXECUTE FUNCTION core.guard_own_references('raw_artifact_ref', 'raw_artifact');
CREATE TRIGGER guard_own_references BEFORE INSERT OR UPDATE ON memory.alias_row FOR EACH ROW EXECUTE FUNCTION core.guard_own_references('source_run_id', 'run');
CREATE TRIGGER guard_own_references BEFORE INSERT OR UPDATE ON memory.candidate_record FOR EACH ROW EXECUTE FUNCTION core.guard_own_references('prior_run_id', 'run');
CREATE TRIGGER guard_own_references BEFORE INSERT OR UPDATE ON memory.memory_link FOR EACH ROW EXECUTE FUNCTION core.guard_own_references('prior_run_id', 'run', 'prior_answer_id', 'answer', 'alias_row_ids', 'alias_row[]');
CREATE TRIGGER guard_own_references BEFORE INSERT OR UPDATE ON scorecard.session_assignment FOR EACH ROW EXECUTE FUNCTION core.guard_own_references('routing_decision_id', 'routing_decision');
CREATE TRIGGER guard_own_references BEFORE INSERT OR UPDATE ON serve.answer FOR EACH ROW EXECUTE FUNCTION core.guard_own_references('answer_id', 'answer', 'work_item_id', 'work_item', 'fact_bundle_id', 'fact_bundle', 'composed_text_id', 'composed_text', 'conformance_record_id', 'conformance_record');
CREATE TRIGGER guard_own_references BEFORE INSERT OR UPDATE ON serve.answer_story FOR EACH ROW EXECUTE FUNCTION core.guard_own_references('artifact_refs', 'raw_artifact[]');
CREATE TRIGGER guard_own_references BEFORE INSERT OR UPDATE ON serve.composed_text FOR EACH ROW EXECUTE FUNCTION core.guard_own_references('fact_bundle_id', 'fact_bundle');
CREATE TRIGGER guard_own_references BEFORE INSERT OR UPDATE ON serve.condition_mark FOR EACH ROW EXECUTE FUNCTION core.guard_own_references('review_ref', 'node_review');
CREATE TRIGGER guard_own_references BEFORE INSERT OR UPDATE ON serve.condition_mark_node FOR EACH ROW EXECUTE FUNCTION core.guard_own_references('condition_mark_id', 'condition_mark');
CREATE TRIGGER guard_own_references BEFORE INSERT OR UPDATE ON serve.conformance_record FOR EACH ROW EXECUTE FUNCTION core.guard_own_references('raw_artifact_refs', 'raw_artifact[]');
CREATE TRIGGER guard_own_references BEFORE INSERT OR UPDATE ON serve.served_number FOR EACH ROW EXECUTE FUNCTION core.guard_own_references('provenance_ref', 'propagation_run', 'answer_id', 'answer');
CREATE TRIGGER guard_own_references BEFORE INSERT OR UPDATE ON serve.synthesis_round FOR EACH ROW EXECUTE FUNCTION core.guard_own_references('answer_id', 'answer', 'candidate_artifact_ref', 'raw_artifact', 'evaluator_artifact_ref', 'raw_artifact');

-- (4) The in-scope views read their tables with the invoker's privileges and policies (D33).
ALTER VIEW billing.person_windows_v SET (security_invoker = true);
ALTER VIEW billing.subscription_latest_v SET (security_invoker = true);
ALTER VIEW core.run_waiting_v SET (security_invoker = true);
REVOKE SELECT ON core.run_waiting_v FROM debateai_runtime;
GRANT SELECT ON core.run_waiting_v TO debateai_billing_runtime;

-- (5) The 110 in-scope tables, in D32's row order. On every billing table but billing.entitlement_event the T1 policy
--     reads with D32's key and writes nothing (WITH CHECK false, the unpaid-plan review): the request logins hold INSERT
--     on every billing table through debateai_billing_runtime, which also carries their registration, legal and
--     side-by-side grants, and a signed-in request writes no billing row on them but the lazy Free entitlement (the
--     guard above). An own quote at a price of the account's choosing, an own subscription, charge or invoice is no
--     longer the context's to write; api-system writes them all, through rls_all_accounts.
-- 1 · billing.cancel_token · K2 (V-15's default; D32's K7 key was an EXISTS over billing.subscription_event, whose
--     subscription_id any account may append under its own owner_ref, so one own event naming another account's
--     subscription read and wrote that account's links: REV-S01-p1-security B1, t_37152b67). The link carries its own
--     owner: set at issue (packages/db/src/billing.ts insertCancelToken, from apps/api/src/billing/cancel-link.ts), and
--     here backfilled with the owner of its subscription's first event, the owner cancelByToken acts for. A link whose
--     subscription has no event keeps NULL, which no context matches. The backfill is an UPDATE of an append-only table,
--     so its statement guard is off for that one statement and back on before the policies, in this step's transaction.
--     V-18: guard_own_references refuses a link naming another account's subscription (FIX-S01-p1a NEW-2: A's own link
--     on B's subscription let the public cancel page cancel B's plan).
ALTER TABLE billing.cancel_token ADD COLUMN IF NOT EXISTS owner_ref uuid;
ALTER TABLE billing.cancel_token DISABLE TRIGGER reject_mutation;
UPDATE billing.cancel_token AS token SET owner_ref = (SELECT event.owner_ref FROM billing.subscription_event AS event
  WHERE event.subscription_id = token.subscription_id ORDER BY event.seq LIMIT 1);
ALTER TABLE billing.cancel_token ENABLE TRIGGER reject_mutation;
ALTER TABLE billing.cancel_token ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON billing.cancel_token AS PERMISSIVE FOR ALL TO debateai_runtime USING ((owner_ref = (SELECT rls.context_owner_ref()))) WITH CHECK (false);
CREATE POLICY rls_all_accounts ON billing.cancel_token AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 2 · billing.cancel_token_use · K7 (ARCH key, D32), through billing.cancel_token's primary key (a foreign key holds every
--     use to its link) and so through the link's own owner since V-15
ALTER TABLE billing.cancel_token_use ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON billing.cancel_token_use AS PERMISSIVE FOR ALL TO debateai_runtime USING ((EXISTS (SELECT 1 FROM billing.cancel_token p WHERE p.token_sha256 = cancel_token_use.token_sha256))) WITH CHECK (false);
CREATE POLICY rls_all_accounts ON billing.cancel_token_use AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 3 · billing.card_token · K7 (V-17's default; D32's key was an EXISTS over billing.customer, but customer_id has no
--     foreign key, so a saved card whose customer row is gone became readable once an account inserted an own customer
--     row carrying its customer_id: FIX-S01-p1a NEW-1, t_8b1aae39). No signed-in request reads it on a T1 login (every
--     reader is BillingRepository on the API's system pool), so the T1 check is `false`, as billing.outbox's is.
ALTER TABLE billing.card_token ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON billing.card_token AS PERMISSIVE FOR ALL TO debateai_runtime USING (false) WITH CHECK (false);
CREATE POLICY rls_all_accounts ON billing.card_token AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 4 · billing.card_token_revocation · K7 (V-17's default: `false`, as row 3; 0111's purge_revoked_card_tokens leaves
--     revocations whose token is gone, 0111_billing_netopia.sql:411-414)
ALTER TABLE billing.card_token_revocation ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON billing.card_token_revocation AS PERMISSIVE FOR ALL TO debateai_runtime USING (false) WITH CHECK (false);
CREATE POLICY rls_all_accounts ON billing.card_token_revocation AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 5 · billing.charge · K2, naming only a quote the context may read (V-18; its subscription: guard_own_references)
ALTER TABLE billing.charge ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON billing.charge AS PERMISSIVE FOR ALL TO debateai_runtime USING (((owner_ref = (SELECT rls.context_owner_ref())) AND (quote_id IS NULL OR EXISTS (SELECT 1 FROM billing.quote p WHERE p.quote_id = charge.quote_id)))) WITH CHECK (false);
CREATE POLICY rls_all_accounts ON billing.charge AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 6 · billing.charge_event · K6 via billing.charge(K2)
ALTER TABLE billing.charge_event ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON billing.charge_event AS PERMISSIVE FOR ALL TO debateai_runtime USING ((EXISTS (SELECT 1 FROM billing.charge p WHERE p.charge_id = charge_event.charge_id AND p.payment_environment = charge_event.payment_environment AND p.payment_provider = charge_event.payment_provider))) WITH CHECK (false);
CREATE POLICY rls_all_accounts ON billing.charge_event AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 7 · billing.customer · K2
ALTER TABLE billing.customer ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON billing.customer AS PERMISSIVE FOR ALL TO debateai_runtime USING ((owner_ref = (SELECT rls.context_owner_ref()))) WITH CHECK (false);
CREATE POLICY rls_all_accounts ON billing.customer AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 8 · billing.customer_profile_event · K6 via billing.customer(K2)
ALTER TABLE billing.customer_profile_event ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON billing.customer_profile_event AS PERMISSIVE FOR ALL TO debateai_runtime USING ((EXISTS (SELECT 1 FROM billing.customer p WHERE p.customer_id = customer_profile_event.customer_id))) WITH CHECK (false);
CREATE POLICY rls_all_accounts ON billing.customer_profile_event AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 9 · billing.customer_xmoney · K6 via billing.customer(K2)
ALTER TABLE billing.customer_xmoney ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON billing.customer_xmoney AS PERMISSIVE FOR ALL TO debateai_runtime USING ((EXISTS (SELECT 1 FROM billing.customer p WHERE p.customer_id = customer_xmoney.customer_id))) WITH CHECK (false);
CREATE POLICY rls_all_accounts ON billing.customer_xmoney AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 10 · billing.entitlement_event · K2 (V-18: its subscription, guard_own_references)
ALTER TABLE billing.entitlement_event ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON billing.entitlement_event AS PERMISSIVE FOR ALL TO debateai_runtime USING ((owner_ref = (SELECT rls.context_owner_ref()))) WITH CHECK ((owner_ref = (SELECT rls.context_owner_ref())));
CREATE POLICY rls_all_accounts ON billing.entitlement_event AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 11 · billing.hosted_payment · K6 via billing.charge(K2)
ALTER TABLE billing.hosted_payment ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON billing.hosted_payment AS PERMISSIVE FOR ALL TO debateai_runtime USING ((EXISTS (SELECT 1 FROM billing.charge p WHERE p.charge_id = hosted_payment.charge_id))) WITH CHECK (false);
CREATE POLICY rls_all_accounts ON billing.hosted_payment AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 12 · billing.invoice · K6 via billing.invoice_intent(K6)
ALTER TABLE billing.invoice ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON billing.invoice AS PERMISSIVE FOR ALL TO debateai_runtime USING ((EXISTS (SELECT 1 FROM billing.invoice_intent p WHERE p.charge_id = invoice.charge_id AND p.kind = invoice.kind AND p.issuer = invoice.issuer))) WITH CHECK (false);
CREATE POLICY rls_all_accounts ON billing.invoice AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 13 · billing.invoice_intent · K6 via billing.charge(K2)
ALTER TABLE billing.invoice_intent ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON billing.invoice_intent AS PERMISSIVE FOR ALL TO debateai_runtime USING ((EXISTS (SELECT 1 FROM billing.charge p WHERE p.charge_id = invoice_intent.charge_id))) WITH CHECK (false);
CREATE POLICY rls_all_accounts ON billing.invoice_intent AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 14 · billing.invoice_status_event · K6 via billing.invoice(K6)
ALTER TABLE billing.invoice_status_event ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON billing.invoice_status_event AS PERMISSIVE FOR ALL TO debateai_runtime USING ((EXISTS (SELECT 1 FROM billing.invoice p WHERE p.invoice_id = invoice_status_event.invoice_id))) WITH CHECK (false);
CREATE POLICY rls_all_accounts ON billing.invoice_status_event AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 15 · billing.location_evidence · K6 via billing.charge(K2)
ALTER TABLE billing.location_evidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON billing.location_evidence AS PERMISSIVE FOR ALL TO debateai_runtime USING ((EXISTS (SELECT 1 FROM billing.charge p WHERE p.charge_id = location_evidence.charge_id))) WITH CHECK (false);
CREATE POLICY rls_all_accounts ON billing.location_evidence AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 16 · billing.notice_quarantine · K7 (V-17's default: `false`, as row 3; an unmatched notice's order_id names no charge)
ALTER TABLE billing.notice_quarantine ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON billing.notice_quarantine AS PERMISSIVE FOR ALL TO debateai_runtime USING (false) WITH CHECK (false);
CREATE POLICY rls_all_accounts ON billing.notice_quarantine AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 17 · billing.outbox · K7 (ARCH key, D32)
ALTER TABLE billing.outbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON billing.outbox AS PERMISSIVE FOR ALL TO debateai_runtime USING (false) WITH CHECK (false);
CREATE POLICY rls_all_accounts ON billing.outbox AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 18 · billing.payment_notice · K7 (V-17's default: `false`, as row 3; an unmatched notice's order_id names no charge)
ALTER TABLE billing.payment_notice ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON billing.payment_notice AS PERMISSIVE FOR ALL TO debateai_runtime USING (false) WITH CHECK (false);
CREATE POLICY rls_all_accounts ON billing.payment_notice AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 19 · billing.payment_notice_outcome · K7 (V-17's default: `false`, as its notice)
ALTER TABLE billing.payment_notice_outcome ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON billing.payment_notice_outcome AS PERMISSIVE FOR ALL TO debateai_runtime USING (false) WITH CHECK (false);
CREATE POLICY rls_all_accounts ON billing.payment_notice_outcome AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 20 · billing.payment_notice_raw · K7 (V-17's default: `false`, as its notice)
ALTER TABLE billing.payment_notice_raw ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON billing.payment_notice_raw AS PERMISSIVE FOR ALL TO debateai_runtime USING (false) WITH CHECK (false);
CREATE POLICY rls_all_accounts ON billing.payment_notice_raw AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 22 · billing.quote · K2
ALTER TABLE billing.quote ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON billing.quote AS PERMISSIVE FOR ALL TO debateai_runtime USING ((owner_ref = (SELECT rls.context_owner_ref()))) WITH CHECK (false);
CREATE POLICY rls_all_accounts ON billing.quote AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 23 · billing.quote_use · K6 via billing.charge(K2)
ALTER TABLE billing.quote_use ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON billing.quote_use AS PERMISSIVE FOR ALL TO debateai_runtime USING ((EXISTS (SELECT 1 FROM billing.charge p WHERE p.charge_id = quote_use.charge_id))) WITH CHECK (false);
CREATE POLICY rls_all_accounts ON billing.quote_use AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 24 · billing.run_charge_scope · K2, for a run the context owns and an entitlement event it may read (V-18)
ALTER TABLE billing.run_charge_scope ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON billing.run_charge_scope AS PERMISSIVE FOR ALL TO debateai_runtime USING (((owner_ref = (SELECT rls.context_owner_ref())) AND rls.owns_run(run_id) AND (entitlement_event_id IS NULL OR EXISTS (SELECT 1 FROM billing.entitlement_event p WHERE p.event_id = run_charge_scope.entitlement_event_id)))) WITH CHECK (false);
CREATE POLICY rls_all_accounts ON billing.run_charge_scope AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 25 · billing.status_read · K6 via billing.charge(K2)
ALTER TABLE billing.status_read ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON billing.status_read AS PERMISSIVE FOR ALL TO debateai_runtime USING ((EXISTS (SELECT 1 FROM billing.charge p WHERE p.charge_id = status_read.charge_id))) WITH CHECK (false);
CREATE POLICY rls_all_accounts ON billing.status_read AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 26 · billing.subscription_event · K2 (V-18: its subscription and card token, guard_own_references)
ALTER TABLE billing.subscription_event ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON billing.subscription_event AS PERMISSIVE FOR ALL TO debateai_runtime USING ((owner_ref = (SELECT rls.context_owner_ref()))) WITH CHECK (false);
CREATE POLICY rls_all_accounts ON billing.subscription_event AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 28 · billing.withdrawal_owner_settlement · K2, for a withdrawn event the context may read (V-18; its subscription: guard_own_references)
ALTER TABLE billing.withdrawal_owner_settlement ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON billing.withdrawal_owner_settlement AS PERMISSIVE FOR ALL TO debateai_runtime USING (((owner_ref = (SELECT rls.context_owner_ref())) AND EXISTS (SELECT 1 FROM billing.subscription_event p WHERE p.event_id = withdrawal_owner_settlement.withdrawn_event_id))) WITH CHECK (false);
CREATE POLICY rls_all_accounts ON billing.withdrawal_owner_settlement AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 29 · billing.xmoney_notice · K7 (ARCH key, D32)
ALTER TABLE billing.xmoney_notice ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON billing.xmoney_notice AS PERMISSIVE FOR ALL TO debateai_runtime USING (false) WITH CHECK (false);
CREATE POLICY rls_all_accounts ON billing.xmoney_notice AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 30 · billing.xmoney_notice_outcome · K7 (ARCH key, D32)
ALTER TABLE billing.xmoney_notice_outcome ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON billing.xmoney_notice_outcome AS PERMISSIVE FOR ALL TO debateai_runtime USING (false) WITH CHECK (false);
CREATE POLICY rls_all_accounts ON billing.xmoney_notice_outcome AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 31 · core.critique_packet · K4
ALTER TABLE core.critique_packet ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON core.critique_packet AS PERMISSIVE FOR ALL TO debateai_runtime USING (rls.owns_run(run_id)) WITH CHECK (rls.owns_run(run_id));
CREATE POLICY rls_all_accounts ON core.critique_packet AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 32 · core.edge · K4
ALTER TABLE core.edge ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON core.edge AS PERMISSIVE FOR ALL TO debateai_runtime USING (rls.owns_run(run_id)) WITH CHECK (rls.owns_run(run_id));
CREATE POLICY rls_all_accounts ON core.edge AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 33 · core.independence_receipt · K4
ALTER TABLE core.independence_receipt ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON core.independence_receipt AS PERMISSIVE FOR ALL TO debateai_runtime USING (rls.owns_run(run_id)) WITH CHECK (rls.owns_run(run_id));
CREATE POLICY rls_all_accounts ON core.independence_receipt AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 34 · core.map_answer_check · K4
ALTER TABLE core.map_answer_check ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON core.map_answer_check AS PERMISSIVE FOR ALL TO debateai_runtime USING (rls.owns_run(run_id)) WITH CHECK (rls.owns_run(run_id));
CREATE POLICY rls_all_accounts ON core.map_answer_check AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 35 · core.map_choice · K4
ALTER TABLE core.map_choice ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON core.map_choice AS PERMISSIVE FOR ALL TO debateai_runtime USING (rls.owns_run(run_id)) WITH CHECK (rls.owns_run(run_id));
CREATE POLICY rls_all_accounts ON core.map_choice AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 36 · core.map_item · K4
ALTER TABLE core.map_item ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON core.map_item AS PERMISSIVE FOR ALL TO debateai_runtime USING (rls.owns_run(run_id)) WITH CHECK (rls.owns_run(run_id));
CREATE POLICY rls_all_accounts ON core.map_item AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 37 · core.map_item_rests_on · K4
ALTER TABLE core.map_item_rests_on ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON core.map_item_rests_on AS PERMISSIVE FOR ALL TO debateai_runtime USING (rls.owns_run(run_id)) WITH CHECK (rls.owns_run(run_id));
CREATE POLICY rls_all_accounts ON core.map_item_rests_on AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 38 · core.map_position · K4
ALTER TABLE core.map_position ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON core.map_position AS PERMISSIVE FOR ALL TO debateai_runtime USING (rls.owns_run(run_id)) WITH CHECK (rls.owns_run(run_id));
CREATE POLICY rls_all_accounts ON core.map_position AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 39 · core.map_position_repoint · K4
ALTER TABLE core.map_position_repoint ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON core.map_position_repoint AS PERMISSIVE FOR ALL TO debateai_runtime USING (rls.owns_run(run_id)) WITH CHECK (rls.owns_run(run_id));
CREATE POLICY rls_all_accounts ON core.map_position_repoint AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 40 · core.node · K4
ALTER TABLE core.node ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON core.node AS PERMISSIVE FOR ALL TO debateai_runtime USING (rls.owns_run(run_id)) WITH CHECK (rls.owns_run(run_id));
CREATE POLICY rls_all_accounts ON core.node AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 41 · core.objection_record · K4
ALTER TABLE core.objection_record ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON core.objection_record AS PERMISSIVE FOR ALL TO debateai_runtime USING (rls.owns_run(run_id)) WITH CHECK (rls.owns_run(run_id));
CREATE POLICY rls_all_accounts ON core.objection_record AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 42 · core.question_liveness_event · K4
ALTER TABLE core.question_liveness_event ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON core.question_liveness_event AS PERMISSIVE FOR ALL TO debateai_runtime USING (rls.owns_run(run_id)) WITH CHECK (rls.owns_run(run_id));
CREATE POLICY rls_all_accounts ON core.question_liveness_event AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 43 · core.reversal_point · K4
ALTER TABLE core.reversal_point ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON core.reversal_point AS PERMISSIVE FOR ALL TO debateai_runtime USING (rls.owns_run(run_id)) WITH CHECK (rls.owns_run(run_id));
CREATE POLICY rls_all_accounts ON core.reversal_point AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 44 · core.review_clock · K4
ALTER TABLE core.review_clock ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON core.review_clock AS PERMISSIVE FOR ALL TO debateai_runtime USING (rls.owns_run(run_id)) WITH CHECK (rls.owns_run(run_id));
CREATE POLICY rls_all_accounts ON core.review_clock AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 45 · core.revision_trigger · K4
ALTER TABLE core.revision_trigger ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON core.revision_trigger AS PERMISSIVE FOR ALL TO debateai_runtime USING (rls.owns_run(run_id)) WITH CHECK (rls.owns_run(run_id));
CREATE POLICY rls_all_accounts ON core.revision_trigger AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 46 · core.run · K4
ALTER TABLE core.run ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON core.run AS PERMISSIVE FOR ALL TO debateai_runtime USING (rls.owns_run(run_id)) WITH CHECK (rls.owns_run(run_id));
CREATE POLICY rls_all_accounts ON core.run AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 47 · core.run_cost_substitution · K4
ALTER TABLE core.run_cost_substitution ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON core.run_cost_substitution AS PERMISSIVE FOR ALL TO debateai_runtime USING (rls.owns_run(run_id)) WITH CHECK (rls.owns_run(run_id));
CREATE POLICY rls_all_accounts ON core.run_cost_substitution AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 48 · core.run_ownership_event · K2
ALTER TABLE core.run_ownership_event ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON core.run_ownership_event AS PERMISSIVE FOR ALL TO debateai_runtime USING ((owner_ref = (SELECT rls.context_owner_ref()))) WITH CHECK ((owner_ref = (SELECT rls.context_owner_ref())));
CREATE POLICY rls_all_accounts ON core.run_ownership_event AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 49 · core.run_progress_event · K4
ALTER TABLE core.run_progress_event ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON core.run_progress_event AS PERMISSIVE FOR ALL TO debateai_runtime USING (rls.owns_run(run_id)) WITH CHECK (rls.owns_run(run_id));
CREATE POLICY rls_all_accounts ON core.run_progress_event AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 50 · core.run_role_assignment · K4
ALTER TABLE core.run_role_assignment ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON core.run_role_assignment AS PERMISSIVE FOR ALL TO debateai_runtime USING (rls.owns_run(run_id)) WITH CHECK (rls.owns_run(run_id));
CREATE POLICY rls_all_accounts ON core.run_role_assignment AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 51 · core.run_role_rotation · K4
ALTER TABLE core.run_role_rotation ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON core.run_role_rotation AS PERMISSIVE FOR ALL TO debateai_runtime USING (rls.owns_run(run_id)) WITH CHECK (rls.owns_run(run_id));
CREATE POLICY rls_all_accounts ON core.run_role_rotation AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 52 · core.run_row_activation · K4
ALTER TABLE core.run_row_activation ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON core.run_row_activation AS PERMISSIVE FOR ALL TO debateai_runtime USING (rls.owns_run(run_id)) WITH CHECK (rls.owns_run(run_id));
CREATE POLICY rls_all_accounts ON core.run_row_activation AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 53 · core.run_row_activation_event · K4
ALTER TABLE core.run_row_activation_event ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON core.run_row_activation_event AS PERMISSIVE FOR ALL TO debateai_runtime USING (rls.owns_run(run_id)) WITH CHECK (rls.owns_run(run_id));
CREATE POLICY rls_all_accounts ON core.run_row_activation_event AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 54 · core.run_supersession · K5
ALTER TABLE core.run_supersession ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON core.run_supersession AS PERMISSIVE FOR ALL TO debateai_runtime USING (rls.owns_run(old_run_id)) WITH CHECK (rls.owns_run(old_run_id));
CREATE POLICY rls_all_accounts ON core.run_supersession AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 55 · core.run_visibility_event · K4
ALTER TABLE core.run_visibility_event ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON core.run_visibility_event AS PERMISSIVE FOR ALL TO debateai_runtime USING (rls.owns_run(run_id)) WITH CHECK (rls.owns_run(run_id));
CREATE POLICY rls_all_accounts ON core.run_visibility_event AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 56 · core.run_wait · K4
ALTER TABLE core.run_wait ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON core.run_wait AS PERMISSIVE FOR ALL TO debateai_runtime USING (rls.owns_run(run_id)) WITH CHECK (rls.owns_run(run_id));
CREATE POLICY rls_all_accounts ON core.run_wait AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 57 · core.run_wait_reason · K4
ALTER TABLE core.run_wait_reason ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON core.run_wait_reason AS PERMISSIVE FOR ALL TO debateai_runtime USING (rls.owns_run(run_id)) WITH CHECK (rls.owns_run(run_id));
CREATE POLICY rls_all_accounts ON core.run_wait_reason AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 58 · core.run_wait_start · K4
ALTER TABLE core.run_wait_start ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON core.run_wait_start AS PERMISSIVE FOR ALL TO debateai_runtime USING (rls.owns_run(run_id)) WITH CHECK (rls.owns_run(run_id));
CREATE POLICY rls_all_accounts ON core.run_wait_start AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 60 · core.staleness_state · K4
ALTER TABLE core.staleness_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON core.staleness_state AS PERMISSIVE FOR ALL TO debateai_runtime USING (rls.owns_run(run_id)) WITH CHECK (rls.owns_run(run_id));
CREATE POLICY rls_all_accounts ON core.staleness_state AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 61 · core.stranger_restatement · K4
ALTER TABLE core.stranger_restatement ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON core.stranger_restatement AS PERMISSIVE FOR ALL TO debateai_runtime USING (rls.owns_run(run_id)) WITH CHECK (rls.owns_run(run_id));
CREATE POLICY rls_all_accounts ON core.stranger_restatement AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 62 · core.symmetry_diff · K4
ALTER TABLE core.symmetry_diff ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON core.symmetry_diff AS PERMISSIVE FOR ALL TO debateai_runtime USING (rls.owns_run(run_id)) WITH CHECK (rls.owns_run(run_id));
CREATE POLICY rls_all_accounts ON core.symmetry_diff AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 63 · core.value_hinge · K4
ALTER TABLE core.value_hinge ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON core.value_hinge AS PERMISSIVE FOR ALL TO debateai_runtime USING (rls.owns_run(run_id)) WITH CHECK (rls.owns_run(run_id));
CREATE POLICY rls_all_accounts ON core.value_hinge AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 64 · core.verification_trigger_basis · K4
ALTER TABLE core.verification_trigger_basis ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON core.verification_trigger_basis AS PERMISSIVE FOR ALL TO debateai_runtime USING (rls.owns_run(run_id)) WITH CHECK (rls.owns_run(run_id));
CREATE POLICY rls_all_accounts ON core.verification_trigger_basis AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 65 · core.work_item · K4
ALTER TABLE core.work_item ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON core.work_item AS PERMISSIVE FOR ALL TO debateai_runtime USING (rls.owns_run(run_id)) WITH CHECK (rls.owns_run(run_id));
CREATE POLICY rls_all_accounts ON core.work_item AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 66 · identity.audit_event · K7 (ARCH key, D32)
ALTER TABLE identity.audit_event ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON identity.audit_event AS PERMISSIVE FOR ALL TO debateai_runtime USING (false) WITH CHECK (false);
CREATE POLICY rls_all_accounts ON identity.audit_event AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 67 · identity.channel_binding · K1
ALTER TABLE identity.channel_binding ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON identity.channel_binding AS PERMISSIVE FOR ALL TO debateai_runtime USING ((user_id = (SELECT rls.context_user_id()))) WITH CHECK ((user_id = (SELECT rls.context_user_id())));
CREATE POLICY rls_all_accounts ON identity.channel_binding AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 68 · identity.login_challenge · K1
ALTER TABLE identity.login_challenge ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON identity.login_challenge AS PERMISSIVE FOR ALL TO debateai_runtime USING ((user_id = (SELECT rls.context_user_id()))) WITH CHECK ((user_id = (SELECT rls.context_user_id())));
CREATE POLICY rls_all_accounts ON identity.login_challenge AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 69 · identity.mfa_factor · K1
ALTER TABLE identity.mfa_factor ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON identity.mfa_factor AS PERMISSIVE FOR ALL TO debateai_runtime USING ((user_id = (SELECT rls.context_user_id()))) WITH CHECK ((user_id = (SELECT rls.context_user_id())));
CREATE POLICY rls_all_accounts ON identity.mfa_factor AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 70 · identity.recovery_code · K1
ALTER TABLE identity.recovery_code ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON identity.recovery_code AS PERMISSIVE FOR ALL TO debateai_runtime USING ((user_id = (SELECT rls.context_user_id()))) WITH CHECK ((user_id = (SELECT rls.context_user_id())));
CREATE POLICY rls_all_accounts ON identity.recovery_code AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 71 · identity.session · K1
ALTER TABLE identity.session ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON identity.session AS PERMISSIVE FOR ALL TO debateai_runtime USING ((user_id = (SELECT rls.context_user_id()))) WITH CHECK ((user_id = (SELECT rls.context_user_id())));
CREATE POLICY rls_all_accounts ON identity.session AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 72 · identity.user · K1
ALTER TABLE identity."user" ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON identity."user" AS PERMISSIVE FOR ALL TO debateai_runtime USING ((user_id = (SELECT rls.context_user_id()))) WITH CHECK ((user_id = (SELECT rls.context_user_id())));
CREATE POLICY rls_all_accounts ON identity."user" AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 73 · ledger.call_prompt · K4
ALTER TABLE ledger.call_prompt ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON ledger.call_prompt AS PERMISSIVE FOR ALL TO debateai_runtime USING (rls.owns_run(run_id)) WITH CHECK (rls.owns_run(run_id));
CREATE POLICY rls_all_accounts ON ledger.call_prompt AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 74 · ledger.decision_record · K4
ALTER TABLE ledger.decision_record ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON ledger.decision_record AS PERMISSIVE FOR ALL TO debateai_runtime USING (rls.owns_run(run_id)) WITH CHECK (rls.owns_run(run_id));
CREATE POLICY rls_all_accounts ON ledger.decision_record AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 75 · ledger.ledger_entry · K4
ALTER TABLE ledger.ledger_entry ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON ledger.ledger_entry AS PERMISSIVE FOR ALL TO debateai_runtime USING (rls.owns_run(run_id)) WITH CHECK (rls.owns_run(run_id));
CREATE POLICY rls_all_accounts ON ledger.ledger_entry AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 76 · ledger.model_spend · K4
ALTER TABLE ledger.model_spend ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON ledger.model_spend AS PERMISSIVE FOR ALL TO debateai_runtime USING (rls.owns_run(run_id)) WITH CHECK (rls.owns_run(run_id));
CREATE POLICY rls_all_accounts ON ledger.model_spend AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 77 · ledger.model_spend_hold · K4
ALTER TABLE ledger.model_spend_hold ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON ledger.model_spend_hold AS PERMISSIVE FOR ALL TO debateai_runtime USING (rls.owns_run(run_id)) WITH CHECK (rls.owns_run(run_id));
CREATE POLICY rls_all_accounts ON ledger.model_spend_hold AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 78 · ledger.model_spend_waiver · K4
ALTER TABLE ledger.model_spend_waiver ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON ledger.model_spend_waiver AS PERMISSIVE FOR ALL TO debateai_runtime USING (rls.owns_run(run_id)) WITH CHECK (rls.owns_run(run_id));
CREATE POLICY rls_all_accounts ON ledger.model_spend_waiver AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 79 · ledger.node_review · K4
ALTER TABLE ledger.node_review ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON ledger.node_review AS PERMISSIVE FOR ALL TO debateai_runtime USING (rls.owns_run(run_id)) WITH CHECK (rls.owns_run(run_id));
CREATE POLICY rls_all_accounts ON ledger.node_review AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 80 · ledger.node_strength_record · K6 via core.node(K4)
ALTER TABLE ledger.node_strength_record ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON ledger.node_strength_record AS PERMISSIVE FOR ALL TO debateai_runtime USING ((EXISTS (SELECT 1 FROM core.node p WHERE p.node_id = node_strength_record.node_id))) WITH CHECK ((EXISTS (SELECT 1 FROM core.node p WHERE p.node_id = node_strength_record.node_id)));
CREATE POLICY rls_all_accounts ON ledger.node_strength_record AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 81 · ledger.overlay_run · K4
ALTER TABLE ledger.overlay_run ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON ledger.overlay_run AS PERMISSIVE FOR ALL TO debateai_runtime USING (rls.owns_run(run_id)) WITH CHECK (rls.owns_run(run_id));
CREATE POLICY rls_all_accounts ON ledger.overlay_run AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 82 · ledger.point_investigation · K4
ALTER TABLE ledger.point_investigation ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON ledger.point_investigation AS PERMISSIVE FOR ALL TO debateai_runtime USING (rls.owns_run(run_id)) WITH CHECK (rls.owns_run(run_id));
CREATE POLICY rls_all_accounts ON ledger.point_investigation AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 83 · ledger.propagation_run · K4
ALTER TABLE ledger.propagation_run ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON ledger.propagation_run AS PERMISSIVE FOR ALL TO debateai_runtime USING (rls.owns_run(run_id)) WITH CHECK (rls.owns_run(run_id));
CREATE POLICY rls_all_accounts ON ledger.propagation_run AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 84 · ledger.raw_artifact · K4
ALTER TABLE ledger.raw_artifact ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON ledger.raw_artifact AS PERMISSIVE FOR ALL TO debateai_runtime USING (rls.owns_run(run_id)) WITH CHECK (rls.owns_run(run_id));
CREATE POLICY rls_all_accounts ON ledger.raw_artifact AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 85 · ledger.reduced_judgement · K4
ALTER TABLE ledger.reduced_judgement ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON ledger.reduced_judgement AS PERMISSIVE FOR ALL TO debateai_runtime USING (rls.owns_run(run_id)) WITH CHECK (rls.owns_run(run_id));
CREATE POLICY rls_all_accounts ON ledger.reduced_judgement AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 86 · ledger.sensitivity_record · K6 via core.node(K4)
ALTER TABLE ledger.sensitivity_record ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON ledger.sensitivity_record AS PERMISSIVE FOR ALL TO debateai_runtime USING ((EXISTS (SELECT 1 FROM core.node p WHERE p.node_id = sensitivity_record.removed_node_id))) WITH CHECK ((EXISTS (SELECT 1 FROM core.node p WHERE p.node_id = sensitivity_record.removed_node_id)));
CREATE POLICY rls_all_accounts ON ledger.sensitivity_record AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 87 · ledger.verdict_vote · K4
ALTER TABLE ledger.verdict_vote ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON ledger.verdict_vote AS PERMISSIVE FOR ALL TO debateai_runtime USING (rls.owns_run(run_id)) WITH CHECK (rls.owns_run(run_id));
CREATE POLICY rls_all_accounts ON ledger.verdict_vote AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 88 · legal.acceptance · K2
ALTER TABLE legal.acceptance ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON legal.acceptance AS PERMISSIVE FOR ALL TO debateai_runtime USING ((owner_ref = (SELECT rls.context_owner_ref()))) WITH CHECK ((owner_ref = (SELECT rls.context_owner_ref())));
CREATE POLICY rls_all_accounts ON legal.acceptance AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 89 · memory.alias_revocation · K6 via memory.alias_row(K5)
ALTER TABLE memory.alias_revocation ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON memory.alias_revocation AS PERMISSIVE FOR ALL TO debateai_runtime USING ((EXISTS (SELECT 1 FROM memory.alias_row p WHERE p.alias_row_id = alias_revocation.alias_row_id))) WITH CHECK ((EXISTS (SELECT 1 FROM memory.alias_row p WHERE p.alias_row_id = alias_revocation.alias_row_id)));
CREATE POLICY rls_all_accounts ON memory.alias_revocation AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 90 · memory.alias_row · K5
ALTER TABLE memory.alias_row ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON memory.alias_row AS PERMISSIVE FOR ALL TO debateai_runtime USING (rls.owns_run(prior_run_id)) WITH CHECK (rls.owns_run(prior_run_id));
CREATE POLICY rls_all_accounts ON memory.alias_row AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 91 · memory.candidate_record · K5
ALTER TABLE memory.candidate_record ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON memory.candidate_record AS PERMISSIVE FOR ALL TO debateai_runtime USING (rls.owns_run(source_run_id)) WITH CHECK (rls.owns_run(source_run_id));
CREATE POLICY rls_all_accounts ON memory.candidate_record AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 92 · memory.memory_link · K5
ALTER TABLE memory.memory_link ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON memory.memory_link AS PERMISSIVE FOR ALL TO debateai_runtime USING (rls.owns_run(source_run_id)) WITH CHECK (rls.owns_run(source_run_id));
CREATE POLICY rls_all_accounts ON memory.memory_link AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 93 · memory.memory_link_event · K6 via memory.memory_link(K5)
ALTER TABLE memory.memory_link_event ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON memory.memory_link_event AS PERMISSIVE FOR ALL TO debateai_runtime USING ((EXISTS (SELECT 1 FROM memory.memory_link p WHERE p.memory_link_id = memory_link_event.memory_link_id))) WITH CHECK ((EXISTS (SELECT 1 FROM memory.memory_link p WHERE p.memory_link_id = memory_link_event.memory_link_id)));
CREATE POLICY rls_all_accounts ON memory.memory_link_event AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 94 · memory.pull_record · K6 via memory.memory_link(K5)
ALTER TABLE memory.pull_record ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON memory.pull_record AS PERMISSIVE FOR ALL TO debateai_runtime USING ((EXISTS (SELECT 1 FROM memory.memory_link p WHERE p.memory_link_id = pull_record.memory_link_id))) WITH CHECK ((EXISTS (SELECT 1 FROM memory.memory_link p WHERE p.memory_link_id = pull_record.memory_link_id)));
CREATE POLICY rls_all_accounts ON memory.pull_record AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 95 · memory.question_key · K4
ALTER TABLE memory.question_key ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON memory.question_key AS PERMISSIVE FOR ALL TO debateai_runtime USING (rls.owns_run(run_id)) WITH CHECK (rls.owns_run(run_id));
CREATE POLICY rls_all_accounts ON memory.question_key AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 96 · scorecard.answer_outcome · K4
ALTER TABLE scorecard.answer_outcome ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON scorecard.answer_outcome AS PERMISSIVE FOR ALL TO debateai_runtime USING (rls.owns_run(run_id)) WITH CHECK (rls.owns_run(run_id));
CREATE POLICY rls_all_accounts ON scorecard.answer_outcome AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 97 · scorecard.routing_decision · K7 (ARCH key, D32)
ALTER TABLE scorecard.routing_decision ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON scorecard.routing_decision AS PERMISSIVE FOR ALL TO debateai_runtime USING (rls.owns_execution_ref(session_id)) WITH CHECK (rls.owns_execution_ref(session_id));
CREATE POLICY rls_all_accounts ON scorecard.routing_decision AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 98 · scorecard.session_assignment · K7 (ARCH key, D32)
ALTER TABLE scorecard.session_assignment ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON scorecard.session_assignment AS PERMISSIVE FOR ALL TO debateai_runtime USING (rls.owns_execution_ref(session_id)) WITH CHECK (rls.owns_execution_ref(session_id));
CREATE POLICY rls_all_accounts ON scorecard.session_assignment AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 99 · serve.abstention · K6 via serve.answer(K4)
ALTER TABLE serve.abstention ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON serve.abstention AS PERMISSIVE FOR ALL TO debateai_runtime USING ((EXISTS (SELECT 1 FROM serve.answer p WHERE p.answer_id = abstention.answer_id AND p.answer_version = abstention.answer_version))) WITH CHECK ((EXISTS (SELECT 1 FROM serve.answer p WHERE p.answer_id = abstention.answer_id AND p.answer_version = abstention.answer_version)));
CREATE POLICY rls_all_accounts ON serve.abstention AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 100 · serve.answer · K4
ALTER TABLE serve.answer ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON serve.answer AS PERMISSIVE FOR ALL TO debateai_runtime USING (rls.owns_run(run_id)) WITH CHECK (rls.owns_run(run_id));
CREATE POLICY rls_all_accounts ON serve.answer AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 101 · serve.answer_story · K4
ALTER TABLE serve.answer_story ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON serve.answer_story AS PERMISSIVE FOR ALL TO debateai_runtime USING (rls.owns_run(run_id)) WITH CHECK (rls.owns_run(run_id));
CREATE POLICY rls_all_accounts ON serve.answer_story AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 102 · serve.composed_text · K6 via ledger.raw_artifact(K4)
ALTER TABLE serve.composed_text ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON serve.composed_text AS PERMISSIVE FOR ALL TO debateai_runtime USING ((EXISTS (SELECT 1 FROM ledger.raw_artifact p WHERE p.raw_artifact_id = composed_text.raw_artifact_ref))) WITH CHECK ((EXISTS (SELECT 1 FROM ledger.raw_artifact p WHERE p.raw_artifact_id = composed_text.raw_artifact_ref)));
CREATE POLICY rls_all_accounts ON serve.composed_text AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 103 · serve.condition_mark · K6 via serve.answer(K4)
ALTER TABLE serve.condition_mark ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON serve.condition_mark AS PERMISSIVE FOR ALL TO debateai_runtime USING ((EXISTS (SELECT 1 FROM serve.answer p WHERE p.answer_id = condition_mark.answer_id AND p.answer_version = condition_mark.answer_version))) WITH CHECK ((EXISTS (SELECT 1 FROM serve.answer p WHERE p.answer_id = condition_mark.answer_id AND p.answer_version = condition_mark.answer_version)));
CREATE POLICY rls_all_accounts ON serve.condition_mark AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 104 · serve.condition_mark_node · K6 via core.node(K4)
ALTER TABLE serve.condition_mark_node ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON serve.condition_mark_node AS PERMISSIVE FOR ALL TO debateai_runtime USING ((EXISTS (SELECT 1 FROM core.node p WHERE p.node_id = condition_mark_node.node_id))) WITH CHECK ((EXISTS (SELECT 1 FROM core.node p WHERE p.node_id = condition_mark_node.node_id)));
CREATE POLICY rls_all_accounts ON serve.condition_mark_node AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 105 · serve.conformance_record · K6 via serve.composed_text(K6)
ALTER TABLE serve.conformance_record ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON serve.conformance_record AS PERMISSIVE FOR ALL TO debateai_runtime USING ((EXISTS (SELECT 1 FROM serve.composed_text p WHERE p.composed_text_id = conformance_record.composed_text_id))) WITH CHECK ((EXISTS (SELECT 1 FROM serve.composed_text p WHERE p.composed_text_id = conformance_record.composed_text_id)));
CREATE POLICY rls_all_accounts ON serve.conformance_record AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 106 · serve.fact_bundle · K4
ALTER TABLE serve.fact_bundle ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON serve.fact_bundle AS PERMISSIVE FOR ALL TO debateai_runtime USING (rls.owns_run(run_id)) WITH CHECK (rls.owns_run(run_id));
CREATE POLICY rls_all_accounts ON serve.fact_bundle AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 107 · serve.publication_snapshot · K4
ALTER TABLE serve.publication_snapshot ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON serve.publication_snapshot AS PERMISSIVE FOR ALL TO debateai_runtime USING (rls.owns_run(run_id)) WITH CHECK (rls.owns_run(run_id));
CREATE POLICY rls_all_accounts ON serve.publication_snapshot AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 108 · serve.segment_suppression · K6 via serve.answer(K4)
ALTER TABLE serve.segment_suppression ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON serve.segment_suppression AS PERMISSIVE FOR ALL TO debateai_runtime USING ((EXISTS (SELECT 1 FROM serve.answer p WHERE p.answer_id = segment_suppression.answer_id AND p.answer_version = segment_suppression.answer_version))) WITH CHECK ((EXISTS (SELECT 1 FROM serve.answer p WHERE p.answer_id = segment_suppression.answer_id AND p.answer_version = segment_suppression.answer_version)));
CREATE POLICY rls_all_accounts ON serve.segment_suppression AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 109 · serve.serve_disclosure · K4
ALTER TABLE serve.serve_disclosure ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON serve.serve_disclosure AS PERMISSIVE FOR ALL TO debateai_runtime USING (rls.owns_run(run_id)) WITH CHECK (rls.owns_run(run_id));
CREATE POLICY rls_all_accounts ON serve.serve_disclosure AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 110 · serve.served_number · K4
ALTER TABLE serve.served_number ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON serve.served_number AS PERMISSIVE FOR ALL TO debateai_runtime USING (rls.owns_run(run_id)) WITH CHECK (rls.owns_run(run_id));
CREATE POLICY rls_all_accounts ON serve.served_number AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 111 · serve.served_number_event · K6 via serve.served_number(K4)
ALTER TABLE serve.served_number_event ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON serve.served_number_event AS PERMISSIVE FOR ALL TO debateai_runtime USING ((EXISTS (SELECT 1 FROM serve.served_number p WHERE p.served_number_id = served_number_event.served_number_id))) WITH CHECK ((EXISTS (SELECT 1 FROM serve.served_number p WHERE p.served_number_id = served_number_event.served_number_id)));
CREATE POLICY rls_all_accounts ON serve.served_number_event AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 112 · serve.shadow_suppression · K6 via serve.answer(K4)
ALTER TABLE serve.shadow_suppression ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON serve.shadow_suppression AS PERMISSIVE FOR ALL TO debateai_runtime USING ((EXISTS (SELECT 1 FROM serve.answer p WHERE p.answer_id = shadow_suppression.answer_id AND p.answer_version = shadow_suppression.answer_version))) WITH CHECK ((EXISTS (SELECT 1 FROM serve.answer p WHERE p.answer_id = shadow_suppression.answer_id AND p.answer_version = shadow_suppression.answer_version)));
CREATE POLICY rls_all_accounts ON serve.shadow_suppression AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
-- 113 · serve.synthesis_round · K4
ALTER TABLE serve.synthesis_round ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_account ON serve.synthesis_round AS PERMISSIVE FOR ALL TO debateai_runtime USING (rls.owns_run(run_id)) WITH CHECK (rls.owns_run(run_id));
CREATE POLICY rls_all_accounts ON serve.synthesis_round AS PERMISSIVE FOR ALL TO debateai_rls_all_accounts, debateai_replay, debateai_settlement_watch, debateai_evaluator_worker, debateai_staff_security_owner, debateai_mfa_recovery_owner, debateai_password_recovery_owner, debateai_password_reset_owner, debateai_obs_view_owner, debateai_backup_email_owner, debateai_release_owner USING (true) WITH CHECK (true);
