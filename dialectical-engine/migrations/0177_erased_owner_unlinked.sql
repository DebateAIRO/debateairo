-- n1: drained
-- n1: keeps-verifier
-- 0177 · Once an account is erased, nothing kept beside a debate names its owner reference.
--
-- A public debate stays after its first author's account is erased, and so does a contribution to someone else's public
-- debate. Until this step the erased account's owner reference stayed beside each of its debates, in rows that are never
-- changed: core.run.asker_id ('owner:<reference>'), core.run_ownership_event.owner_ref, core.legacy_run_claim.owner_ref,
-- memory.question_key.asker_scope, memory.pull_record.asker_scope, memory.memory_link_event.actor_ref
-- ('asker:owner:<reference>', written when the person unlinked a memory link) and billing.run_charge_scope.owner_ref (the
-- usage row admission writes for every run, kept ten years). The same reference is on the records kept because the law
-- asks for them: legal.acceptance, legal.account_closure, billing.customer, billing.charge and the other billing tables.
-- So a kept debate could be joined to the person through those records, and all of one account's debates shared a value.
--
-- From this step, when the account row is deleted, every row that names the reference beside a debate gets a new random
-- reference in its place: one per debate, used in each of that debate's rows, so the debates of one account no longer
-- share a value and none of them shares one with a kept record. On the usage row the entitlement event id is replaced
-- too (it points at billing.entitlement_event, which holds the reference); the plan and the admission time stay. The
-- records the law asks for are not touched.
--
-- Why the old value is overwritten and not superseded by a new ownership record: a new record would leave the old one,
-- with the reference, in the table. So these tables, which refuse every change, now allow exactly one: the column that
-- holds an owner reference may be replaced once no account holds that reference, by a reference no account holds, while
-- the trigger function below runs. Everything else stays refused, for every role, the table owner included (0119's
-- guard on core.node is the model). A reference that matches no account already reads as "owned by nobody"
-- (core.run_is_owned_by) and "the author's name went" (the public page says "a contributor"), so no reader changes.
--
-- Not changed here: a debate paid from an internal grant keeps its grant ids on the usage row (the grant's own owner
-- reference is already emptied when the account goes, 0092); rows that link two debates of one account to each other
-- (memory links, a re-admitted run's predecessor) still link them, with nothing on either that reaches a kept record.
-- An account erased before this step keeps its old reference.
--
-- THE RULE 0063 WROTE DOWN, obeyed here: never CREATE OR REPLACE a function another migration defines. The four
-- functions below are this file's own. Replay-safe in the repository's form: CREATE OR REPLACE of names no earlier
-- migration defines, every trigger dropped IF EXISTS first, the one index created IF NOT EXISTS.

-- 1. The guard of the rows that never change, with the one exception -----------------------------------------------------
-- TG_ARGV[0] is the column that holds the reference, TG_ARGV[1] what stands before it in that column ('' for a uuid
-- column). Without the flag this is 0000's core.reject_mutation, word for word.
CREATE OR REPLACE FUNCTION core.reject_mutation_except_erased_owner()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_column text := TG_ARGV[0];
  v_prefix text := TG_ARGV[1];
  v_old text;
  v_new text;
BEGIN
  IF TG_OP <> 'UPDATE' OR pg_catalog.current_setting('debateai.erased_owner_unlink', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'append-only or immutable table % rejects %', TG_TABLE_NAME, TG_OP USING ERRCODE = '55000';
  END IF;
  -- Every other column, compared whole: a column added later is covered without editing this.
  IF (pg_catalog.to_jsonb(NEW) - v_column) IS DISTINCT FROM (pg_catalog.to_jsonb(OLD) - v_column) THEN
    RAISE EXCEPTION 'ERASED_OWNER_ONLY: an update of % may change only %', TG_TABLE_NAME, v_column USING ERRCODE = '55000';
  END IF;
  v_old := pg_catalog.to_jsonb(OLD) ->> v_column;
  v_new := pg_catalog.to_jsonb(NEW) ->> v_column;
  IF v_old IS NULL OR v_new IS NULL OR v_new = v_old
    OR pg_catalog.left(v_old, pg_catalog.length(v_prefix)) <> v_prefix
    OR pg_catalog.left(v_new, pg_catalog.length(v_prefix)) <> v_prefix
    OR pg_catalog.substr(v_old, pg_catalog.length(v_prefix) + 1) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR pg_catalog.substr(v_new, pg_catalog.length(v_prefix) + 1) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'ERASED_OWNER_SHAPE: % of % may only go from one owner reference to a new one', v_column, TG_TABLE_NAME USING ERRCODE = '55000';
  END IF;
  -- Only a reference no account holds any more may be replaced, and only by one no account holds.
  IF EXISTS (SELECT 1 FROM identity."user" AS account
      WHERE account.owner_ref::text IN (pg_catalog.substr(v_old, pg_catalog.length(v_prefix) + 1), pg_catalog.substr(v_new, pg_catalog.length(v_prefix) + 1))) THEN
    RAISE EXCEPTION 'ERASED_OWNER_ACCOUNT_EXISTS: % of % names an account that exists', v_column, TG_TABLE_NAME USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION core.reject_mutation_except_erased_owner() FROM PUBLIC;

-- The blanket row guard (core.reject_mutation, BEFORE UPDATE OR DELETE) is replaced on these six tables by the guard
-- above, under the same trigger name. Their TRUNCATE guards are untouched.
DROP TRIGGER IF EXISTS reject_mutation ON core.run;
CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON core.run
  FOR EACH ROW EXECUTE FUNCTION core.reject_mutation_except_erased_owner('asker_id', 'owner:');
DROP TRIGGER IF EXISTS reject_mutation ON core.run_ownership_event;
CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON core.run_ownership_event
  FOR EACH ROW EXECUTE FUNCTION core.reject_mutation_except_erased_owner('owner_ref', '');
DROP TRIGGER IF EXISTS reject_mutation ON core.legacy_run_claim;
CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON core.legacy_run_claim
  FOR EACH ROW EXECUTE FUNCTION core.reject_mutation_except_erased_owner('owner_ref', '');
DROP TRIGGER IF EXISTS reject_mutation ON memory.question_key;
CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON memory.question_key
  FOR EACH ROW EXECUTE FUNCTION core.reject_mutation_except_erased_owner('asker_scope', 'owner:');
DROP TRIGGER IF EXISTS reject_mutation ON memory.pull_record;
CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON memory.pull_record
  FOR EACH ROW EXECUTE FUNCTION core.reject_mutation_except_erased_owner('asker_scope', 'owner:');
DROP TRIGGER IF EXISTS reject_mutation ON memory.memory_link_event;
CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON memory.memory_link_event
  FOR EACH ROW EXECUTE FUNCTION core.reject_mutation_except_erased_owner('actor_ref', 'asker:owner:');

-- 2. The usage row ---------------------------------------------------------------------------------------------------------
-- billing.run_charge_scope keeps 0084's rule for the statement (a DELETE only inside the ten-year purge) and gains the
-- one UPDATE: 0084's function refuses every UPDATE and is not this file's to change, so the statement guard here is a
-- function of this file that says the same and lets an UPDATE through to the row guard while the flag is on.
CREATE OR REPLACE FUNCTION billing.reject_charge_scope_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND pg_catalog.current_setting('debateai.retention_purge', true) IS NOT DISTINCT FROM 'on' THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE' AND pg_catalog.current_setting('debateai.erased_owner_unlink', true) IS NOT DISTINCT FROM 'on' THEN
    RETURN NULL;
  END IF;
  RAISE EXCEPTION 'append-only or immutable table % rejects %', TG_TABLE_NAME, TG_OP USING ERRCODE = '55000';
END;
$$;
REVOKE ALL ON FUNCTION billing.reject_charge_scope_mutation() FROM PUBLIC;

-- The row: only the owner reference and the entitlement event id may change, both to values that point at nothing.
CREATE OR REPLACE FUNCTION billing.reject_charge_scope_update_except_erased_owner()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF pg_catalog.current_setting('debateai.erased_owner_unlink', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'append-only or immutable table % rejects %', TG_TABLE_NAME, TG_OP USING ERRCODE = '55000';
  END IF;
  IF (pg_catalog.to_jsonb(NEW) - 'owner_ref' - 'entitlement_event_id') IS DISTINCT FROM (pg_catalog.to_jsonb(OLD) - 'owner_ref' - 'entitlement_event_id') THEN
    RAISE EXCEPTION 'ERASED_OWNER_ONLY: an update of run_charge_scope may change only owner_ref and entitlement_event_id' USING ERRCODE = '55000';
  END IF;
  IF NEW.owner_ref = OLD.owner_ref
    OR (OLD.entitlement_event_id IS NULL) <> (NEW.entitlement_event_id IS NULL)
    OR NEW.entitlement_event_id = OLD.entitlement_event_id
    OR NEW.entitlement_event_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'ERASED_OWNER_SHAPE: run_charge_scope may only go from one owner reference and entitlement event id to new ones' USING ERRCODE = '55000';
  END IF;
  IF EXISTS (SELECT 1 FROM identity."user" AS account WHERE account.owner_ref IN (OLD.owner_ref, NEW.owner_ref)) THEN
    RAISE EXCEPTION 'ERASED_OWNER_ACCOUNT_EXISTS: owner_ref of run_charge_scope names an account that exists' USING ERRCODE = '55000';
  END IF;
  IF EXISTS (SELECT 1 FROM billing.entitlement_event AS event WHERE event.event_id = NEW.entitlement_event_id) THEN
    RAISE EXCEPTION 'ERASED_OWNER_ENTITLEMENT_EXISTS: the new entitlement event id of run_charge_scope names an event' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION billing.reject_charge_scope_update_except_erased_owner() FROM PUBLIC;

DROP TRIGGER IF EXISTS reject_mutation ON billing.run_charge_scope;
CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON billing.run_charge_scope
  FOR EACH STATEMENT EXECUTE FUNCTION billing.reject_charge_scope_mutation();
DROP TRIGGER IF EXISTS reject_update_except_erased_owner ON billing.run_charge_scope;
CREATE TRIGGER reject_update_except_erased_owner BEFORE UPDATE ON billing.run_charge_scope
  FOR EACH ROW EXECUTE FUNCTION billing.reject_charge_scope_update_except_erased_owner();

-- 3. When the account row goes ------------------------------------------------------------------------------------------------
-- AFTER the delete, so the account no longer holds the reference (the guards above ask for that) and the rows deleted or
-- emptied with the account are already gone. It runs in the transaction that deletes the account: 0110's
-- identity.finalize_account_erasure, which holds every one of the account's debates locked. The function's own SET
-- clause turns the flag on for its duration only (the shape of 0080's and 0087's retention purges); no role but the
-- tables' owner may UPDATE these tables, so setting the flag by hand changes nothing.
--
-- An account row is also deleted where there is no debate at all (a sign-up never finished). So the account's debates are
-- found through indexes (the ownership records by the index below, the usage rows by 0084's), and an account with none
-- stops there; only an account that has debates pays for the scans of the tables that have no index on the reference.
CREATE INDEX IF NOT EXISTS run_ownership_event_owner_ref ON core.run_ownership_event (owner_ref);

CREATE OR REPLACE FUNCTION identity.unlink_erased_owner_runs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
SET debateai.erased_owner_unlink = 'on'
AS $$
DECLARE
  v_old uuid := OLD.owner_ref;
  v_asker text := 'owner:' || OLD.owner_ref::text;
  v_run uuid;
  v_new uuid;
BEGIN
  -- Every run an account starts gets an ownership record in the statement that creates it (0123), and its usage row at
  -- admission: an account with neither has no debate, and nothing to replace.
  IF NOT EXISTS (SELECT 1 FROM core.run_ownership_event AS event WHERE event.owner_ref = v_old)
    AND NOT EXISTS (SELECT 1 FROM billing.run_charge_scope AS scope WHERE scope.owner_ref = v_old) THEN
    RETURN OLD;
  END IF;
  -- Every debate with a row that names the reference; each gets one new reference, used in all of its rows.
  FOR v_run IN
    SELECT event.run_id FROM core.run_ownership_event AS event WHERE event.owner_ref = v_old
    UNION SELECT run.run_id FROM core.run AS run WHERE run.asker_id = v_asker
    UNION SELECT claim.run_id FROM core.legacy_run_claim AS claim WHERE claim.owner_ref = v_old
    UNION SELECT scope.run_id FROM billing.run_charge_scope AS scope WHERE scope.owner_ref = v_old
  LOOP
    v_new := pg_catalog.gen_random_uuid();
    UPDATE core.run SET asker_id = 'owner:' || v_new::text WHERE run_id = v_run AND asker_id = v_asker;
    UPDATE core.run_ownership_event SET owner_ref = v_new WHERE run_id = v_run AND owner_ref = v_old;
    UPDATE core.legacy_run_claim SET owner_ref = v_new WHERE run_id = v_run AND owner_ref = v_old;
    UPDATE memory.question_key SET asker_scope = 'owner:' || v_new::text WHERE run_id = v_run AND asker_scope = v_asker;
    -- The entitlement event id points at billing.entitlement_event, which holds the reference: it gets a new value
    -- that points at nothing. An internally funded row has none and keeps its grant ids.
    UPDATE billing.run_charge_scope
    SET owner_ref = v_new,
      entitlement_event_id = CASE WHEN entitlement_event_id IS NULL THEN NULL ELSE pg_catalog.gen_random_uuid() END
    WHERE run_id = v_run AND owner_ref = v_old;
  END LOOP;
  -- What the loop did not reach (rows that hang off a memory link, a question key of a debate with no other row): each
  -- row gets its own new reference.
  UPDATE memory.question_key SET asker_scope = 'owner:' || pg_catalog.gen_random_uuid()::text WHERE asker_scope = v_asker;
  UPDATE memory.pull_record SET asker_scope = 'owner:' || pg_catalog.gen_random_uuid()::text WHERE asker_scope = v_asker;
  UPDATE memory.memory_link_event SET actor_ref = 'asker:owner:' || pg_catalog.gen_random_uuid()::text WHERE actor_ref = 'asker:' || v_asker;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION identity.unlink_erased_owner_runs() FROM PUBLIC;

DROP TRIGGER IF EXISTS unlink_erased_owner_runs ON identity."user";
CREATE TRIGGER unlink_erased_owner_runs AFTER DELETE ON identity."user"
  FOR EACH ROW EXECUTE FUNCTION identity.unlink_erased_owner_runs();
