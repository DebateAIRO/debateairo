-- synthesis-flag SPEC-v10 S05-R11, S05-R16; V-111, V-114; ADR-0033 path (a).
-- Retire persisted support conversations and model-call records without bypassing 0065 guards.
REVOKE INSERT ON support.session, support.session_key, support.message, support.abuse_event,
  support."case", support.case_key, support.case_event, support.case_message, support.rating,
  support.tool_call, support.admission_event, support.relay_call, support.relay_waiter,
  support.relay_waiter_event FROM debateai_support;

ALTER TABLE support.abuse_event DISABLE TRIGGER reject_mutation;
ALTER TABLE support.case_event DISABLE TRIGGER reject_mutation;
ALTER TABLE support.rating DISABLE TRIGGER reject_mutation;
ALTER TABLE support.tool_call DISABLE TRIGGER reject_mutation;
ALTER TABLE support.relay_call DISABLE TRIGGER reject_mutation;
ALTER TABLE support.relay_waiter DISABLE TRIGGER reject_mutation;
ALTER TABLE support.relay_waiter_event DISABLE TRIGGER reject_mutation;
ALTER TABLE support.admission_event DISABLE TRIGGER reject_mutation;
ALTER TABLE support.shred_audit DISABLE TRIGGER reject_mutation;
ALTER TABLE support.session DISABLE TRIGGER reject_delete;
ALTER TABLE support."case" DISABLE TRIGGER reject_delete;
ALTER TABLE support.session_key DISABLE TRIGGER reject_delete;
ALTER TABLE support.case_key DISABLE TRIGGER reject_delete;

DELETE FROM support.rating;
DELETE FROM support.case_message;
DELETE FROM support.case_event;
DELETE FROM support.case_key;
DELETE FROM support."case";
DELETE FROM support.tool_call;
DELETE FROM support.abuse_event;
DELETE FROM support.message;
DELETE FROM support.session_key;
DELETE FROM support.admission_event;
DELETE FROM support.session;
DELETE FROM support.shred_audit;
DELETE FROM support.relay_waiter_event;
DELETE FROM support.relay_waiter;
DELETE FROM support.relay_call;

SET CONSTRAINTS support.support_shred_row_guard IMMEDIATE;

ALTER TABLE support.abuse_event ENABLE TRIGGER reject_mutation;
ALTER TABLE support.case_event ENABLE TRIGGER reject_mutation;
ALTER TABLE support.rating ENABLE TRIGGER reject_mutation;
ALTER TABLE support.tool_call ENABLE TRIGGER reject_mutation;
ALTER TABLE support.relay_call ENABLE TRIGGER reject_mutation;
ALTER TABLE support.relay_waiter ENABLE TRIGGER reject_mutation;
ALTER TABLE support.relay_waiter_event ENABLE TRIGGER reject_mutation;
ALTER TABLE support.admission_event ENABLE TRIGGER reject_mutation;
ALTER TABLE support.shred_audit ENABLE TRIGGER reject_mutation;
ALTER TABLE support.session ENABLE TRIGGER reject_delete;
ALTER TABLE support."case" ENABLE TRIGGER reject_delete;
ALTER TABLE support.session_key ENABLE TRIGGER reject_delete;
ALTER TABLE support.case_key ENABLE TRIGGER reject_delete;
SET CONSTRAINTS support.support_shred_row_guard DEFERRED;

DO $$
DECLARE
  missing text;
  relation_name text;
  row_kept boolean;
BEGIN
  WITH expected(relation_name, trigger_name) AS (
    VALUES
      ('support.abuse_event','reject_mutation'), ('support.case_event','reject_mutation'),
      ('support.rating','reject_mutation'), ('support.tool_call','reject_mutation'),
      ('support.relay_call','reject_mutation'), ('support.relay_waiter','reject_mutation'),
      ('support.relay_waiter_event','reject_mutation'), ('support.admission_event','reject_mutation'),
      ('support.shred_audit','reject_mutation'), ('support.session','reject_delete'),
      ('support."case"','reject_delete'), ('support.session_key','reject_delete'),
      ('support.case_key','reject_delete'), ('support.public_incident','reject_delete'),
      ('support._shred_integrity_guard','reject_delete'),
      ('support.session','support_shred_row_guard'), ('support.session_key','support_shred_row_guard'),
      ('support."case"','support_shred_row_guard'), ('support.case_key','support_shred_row_guard'),
      ('support.shred_audit','support_shred_row_guard')
  )
  SELECT e.relation_name || '.' || e.trigger_name INTO missing
  FROM expected e LEFT JOIN pg_trigger t ON t.tgrelid=to_regclass(e.relation_name)
    AND t.tgname=e.trigger_name AND NOT t.tgisinternal AND t.tgenabled='O'
  WHERE t.oid IS NULL ORDER BY e.relation_name,e.trigger_name LIMIT 1;
  IF missing IS NOT NULL THEN RAISE EXCEPTION 'MIGRATION_0126_GUARD_MISSING %', missing; END IF;

  IF (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='support' AND NOT t.tgisinternal AND t.tgname='reject_truncate'
        AND t.tgenabled='O') <> 17 THEN
    RAISE EXCEPTION 'MIGRATION_0126_TRUNCATE_GUARDS';
  END IF;
  FOREACH relation_name IN ARRAY ARRAY[
    'support.session','support.session_key','support.message','support.abuse_event',
    'support."case"','support.case_key','support.case_event','support.case_message',
    'support.rating','support.tool_call','support.admission_event','support.relay_call',
    'support.relay_waiter','support.relay_waiter_event'
  ] LOOP
    IF has_table_privilege('debateai_support', relation_name, 'INSERT') THEN
      RAISE EXCEPTION 'MIGRATION_0126_INSERT_KEPT %', relation_name;
    END IF;
  END LOOP;
  FOREACH relation_name IN ARRAY ARRAY[
    'support.rating','support.case_message','support.case_event','support.case_key',
    'support."case"','support.tool_call','support.abuse_event','support.message',
    'support.session_key','support.admission_event','support.session','support.shred_audit',
    'support.relay_waiter_event','support.relay_waiter','support.relay_call'
  ] LOOP
    EXECUTE format('SELECT EXISTS(SELECT 1 FROM %s)', relation_name) INTO row_kept;
    IF row_kept THEN RAISE EXCEPTION 'MIGRATION_0126_ROWS_KEPT %', relation_name; END IF;
  END LOOP;
END
$$;
